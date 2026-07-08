"""
hybrid_job_recommender.py
==========================
Production-style Hybrid Job Recommendation System, implemented as a single
self-contained, object-oriented module.

Combines three signals into one ranked feed per candidate:

    1. ContentBasedModel     - profile/job similarity (TF-IDF + one-hot + cosine)
    2. CollaborativeModel    - implicit-feedback matrix factorization in PyTorch
    3. BehaviorModel         - recency-weighted historical preference matching

    Final Score = w_content * Content + w_collab * Collaborative + w_behavior * Behavior

Everything (config, logging, data loading, preprocessing, feature engineering,
each model, the hybrid ranker, evaluation metrics, and a synthetic-data
generator for testing without the real CSVs) lives in this file as classes,
per request. For a real production repo you'd normally split these across
modules -- see the "Design Notes" section at the bottom of this file for why,
and how to do it later without changing any class's public API.

Usage
-----
    # 1. Generate small synthetic CSVs to sanity-check the pipeline end to end
    python hybrid_job_recommender.py --generate-synthetic-data

    # 2. Run the full pipeline: load -> train -> score -> evaluate -> export
    python hybrid_job_recommender.py --run --data-dir ./data --output-dir ./outputs

    # 3. Get recommendations for one candidate
    python hybrid_job_recommender.py --run --candidate-id C000123 --top-k 20
"""

from __future__ import annotations

import argparse
import logging
import sys
import time
from dataclasses import dataclass, field
from logging.handlers import RotatingFileHandler
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
import scipy.sparse as sp
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.preprocessing import OneHotEncoder, MinMaxScaler
from sklearn.preprocessing import normalize as sk_normalize

import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader as TorchDataLoader


# ==========================================================================
# 1. CONFIGURATION
# ==========================================================================

@dataclass
class HybridWeights:
    """Weights used to combine the three sub-scores. Must sum to 1.0."""
    content: float = 0.40
    collaborative: float = 0.35
    behavior: float = 0.25

    def validate(self) -> None:
        total = self.content + self.collaborative + self.behavior
        if not np.isclose(total, 1.0, atol=1e-6):
            raise ValueError(f"HybridWeights must sum to 1.0, got {total}")


@dataclass
class MFConfig:
    """Hyperparameters for the PyTorch implicit-feedback matrix
    factorization model (embeddings + biases, trained with a weighted
    logistic loss over observed interactions + sampled negatives)."""
    embedding_dim: int = 64
    epochs: int = 10
    batch_size: int = 8192
    learning_rate: float = 5e-3
    weight_decay: float = 1e-6
    negative_sampling_ratio: int = 4
    device: str = "auto"                # "auto" | "cpu" | "cuda"
    random_state: int = 42
    val_fraction: float = 0.05
    early_stopping_patience: int = 3


@dataclass
class ContentConfig:
    """Hyperparameters for the TF-IDF / one-hot content-based pipeline."""
    text_max_features: int = 3000
    ngram_range: Tuple[int, int] = (1, 1)
    min_df: int = 1


@dataclass
class BehaviorConfig:
    """Hyperparameters for the recency-weighted behavior model."""
    recency_half_life_days: int = 90
    max_events_per_candidate: int = 500


@dataclass
class InteractionWeights:
    """Implicit feedback strength per event type, as specified by the
    business requirements. Larger = stronger signal of interest/fit."""
    view: float = 1.0
    clicked_apply: float = 2.0
    applied: float = 5.0
    shortlisted: float = 7.0
    interviewed: float = 9.0
    hired: float = 10.0

    @property
    def max_weight(self) -> float:
        return max(self.view, self.clicked_apply, self.applied,
                    self.shortlisted, self.interviewed, self.hired)


@dataclass
class RecommenderConfig:
    """Top-level configuration bundle threaded through the whole pipeline."""
    data_dir: Path = Path("./data")
    output_dir: Path = Path("./outputs")
    log_dir: Path = Path("./logs")

    top_k: int = 20
    candidate_batch_size: int = 5000   # candidates scored per batch (memory control)
    random_state: int = 42

    hybrid_weights: HybridWeights = field(default_factory=HybridWeights)
    mf: MFConfig = field(default_factory=MFConfig)
    content: ContentConfig = field(default_factory=ContentConfig)
    behavior: BehaviorConfig = field(default_factory=BehaviorConfig)
    interaction_weights: InteractionWeights = field(default_factory=InteractionWeights)

    def __post_init__(self):
        self.data_dir = Path(self.data_dir)
        self.output_dir = Path(self.output_dir)
        self.log_dir = Path(self.log_dir)
        for d in (self.data_dir, self.output_dir, self.log_dir):
            d.mkdir(parents=True, exist_ok=True)
        self.hybrid_weights.validate()

    # Convenience accessors for the raw CSV paths
    @property
    def candidate_path(self) -> Path:
        return self.data_dir / "Complete_Candidate_Profile.csv"

    @property
    def job_path(self) -> Path:
        return self.data_dir / "Complete_Job_Profile.csv"

    @property
    def applications_path(self) -> Path:
        return self.data_dir / "Cleaned_Combined_Applications.csv"

    @property
    def engagement_path(self) -> Path:
        return self.data_dir / "Cleaned_Combined_Engagement.csv"


def get_logger(name: str, log_dir: Path = Path("./logs")) -> logging.Logger:
    """Configure and return a module-level logger with console + rotating
    file handlers. Idempotent - safe to call multiple times for the same name."""
    logger = logging.getLogger(name)
    if logger.handlers:
        return logger
    logger.setLevel(logging.INFO)
    fmt = logging.Formatter("%(asctime)s | %(levelname)-8s | %(name)s | %(message)s")

    console = logging.StreamHandler()
    console.setFormatter(fmt)
    logger.addHandler(console)

    log_dir = Path(log_dir)
    log_dir.mkdir(parents=True, exist_ok=True)
    file_handler = RotatingFileHandler(log_dir / "recommender.log", maxBytes=10_000_000, backupCount=3)
    file_handler.setFormatter(fmt)
    logger.addHandler(file_handler)

    logger.propagate = False
    return logger


# ==========================================================================
# 2. DATA LOADING
# ==========================================================================

class DataLoader:
    """Loads and lightly validates the four raw CSV sources.

    Applications/Engagement are read with explicit dtypes and in chunks
    because at ~4.8M rows each, naive `pd.read_csv` with inferred object
    dtypes for ID columns can bloat memory 5-10x versus typed columns.
    """

    def __init__(self, cfg: RecommenderConfig, logger: logging.Logger):
        self.cfg = cfg
        self.log = logger

    def load_candidates(self) -> pd.DataFrame:
        self.log.info("Loading candidates: %s", self.cfg.candidate_path)
        df = pd.read_csv(self.cfg.candidate_path)
        df = self._normalize_columns(df)
        self._require(df, ["Candidate_ID"], "Complete_Candidate_Profile.csv")
        df["Candidate_ID"] = df["Candidate_ID"].astype(str)
        df = df.drop_duplicates(subset=["Candidate_ID"]).reset_index(drop=True)
        self.log.info("Loaded %d candidates", len(df))
        return df

    def load_jobs(self) -> pd.DataFrame:
        self.log.info("Loading jobs: %s", self.cfg.job_path)
        df = pd.read_csv(self.cfg.job_path)
        df = self._normalize_columns(df)
        self._require(df, ["Job_ID"], "Complete_Job_Profile.csv")
        df["Job_ID"] = df["Job_ID"].astype(str)
        df = df.drop_duplicates(subset=["Job_ID"]).reset_index(drop=True)
        self.log.info("Loaded %d jobs", len(df))
        return df

    def load_applications(self, chunksize: int = 500_000) -> pd.DataFrame:
        self.log.info("Loading applications: %s (chunked)", self.cfg.applications_path)
        dtypes = {"Candidate_ID": str, "Job_ID": str, "Application_Status": "category"}
        parts = []
        for chunk in pd.read_csv(self.cfg.applications_path, dtype=dtypes,
                                  parse_dates=["Application_Date"], chunksize=chunksize):
            chunk = self._normalize_columns(chunk)
            parts.append(chunk)
        df = pd.concat(parts, ignore_index=True)
        self.log.info("Loaded %d application records", len(df))
        return df

    def load_engagement(self, chunksize: int = 500_000) -> pd.DataFrame:
        self.log.info("Loading engagement: %s (chunked)", self.cfg.engagement_path)
        dtypes = {"Candidate_ID": str, "Job_ID": str}
        parts = []
        for chunk in pd.read_csv(self.cfg.engagement_path, dtype=dtypes,
                                  parse_dates=["View_Date"], chunksize=chunksize):
            chunk = self._normalize_columns(chunk)
            for col in ["Clicked_Apply", "Applied", "Shortlisted", "Interviewed", "Hired"]:
                if col in chunk.columns:
                    chunk[col] = self._coerce_flag_column(chunk[col], col)
            parts.append(chunk)
        df = pd.concat(parts, ignore_index=True)
        self.log.info("Loaded %d engagement records", len(df))
        return df

    def load_all(self) -> Dict[str, pd.DataFrame]:
        return {
            "candidates": self.load_candidates(),
            "jobs": self.load_jobs(),
            "applications": self.load_applications(),
            "engagement": self.load_engagement(),
        }

    @staticmethod
    def _require(df: pd.DataFrame, cols: List[str], src: str) -> None:
        missing = [c for c in cols if c not in df.columns]
        if missing:
            raise ValueError(f"{src} missing required column(s) {missing}. Found: {list(df.columns)}")

    def _normalize_columns(self, df: pd.DataFrame) -> pd.DataFrame:
        alias_map = {
            "candidate_id": "Candidate_ID",
            "candidate id": "Candidate_ID",
            "candidate_id ": "Candidate_ID",
            "job_id": "Job_ID",
            "job id": "Job_ID",
            "job_category/level": "Job_Category",
            "job_category /level": "Job_Category",
            "job_category/ level": "Job_Category",
            "job_category / level": "Job_Category",
        }

        rename_map = {}
        for col in df.columns:
            cleaned = " ".join(str(col).strip().split())
            cleaned = cleaned.replace(" /", "/").replace("/ ", "/")
            canonical = alias_map.get(cleaned.lower(), cleaned)
            if canonical != col:
                self.log.info("Mapped column '%s' -> '%s'", col, canonical)
            rename_map[col] = canonical

        return df.rename(columns=rename_map)

    def _coerce_flag_column(self, series: pd.Series, col_name: str) -> pd.Series:
        normalized = series.astype(str).str.strip().str.lower()
        mapped = normalized.map({
            "yes": 1,
            "y": 1,
            "true": 1,
            "1": 1,
            "no": 0,
            "n": 0,
            "false": 0,
            "0": 0,
            "": 0,
            "nan": 0,
            "none": 0,
        })
        if mapped.isna().any():
            unexpected = sorted(set(normalized[mapped.isna()].dropna().unique().tolist()))
            raise ValueError(f"Unexpected values in engagement column '{col_name}': {unexpected}")
        return mapped.astype(np.int8)


# ==========================================================================
# 3. PREPROCESSING (ID indexing + unified interaction table)
# ==========================================================================

class Preprocessor:
    """Builds compact integer indices for candidates/jobs and a single,
    weighted interaction table merged from applications + engagement.

    Why integer indices: string ID joins/groupbys across 4.8M+ rows are
    slow and memory-hungry. Mapping to dense 0..N-1 integer codes lets us
    use scipy sparse matrices and PyTorch embedding lookups directly.
    """

    def __init__(self, cfg: RecommenderConfig, logger: logging.Logger):
        self.cfg = cfg
        self.log = logger
        self.candidate_id_to_idx: Dict[str, int] = {}
        self.job_id_to_idx: Dict[str, int] = {}
        self.idx_to_candidate_id: List[str] = []
        self.idx_to_job_id: List[str] = []

    def fit_id_maps(self, candidates: pd.DataFrame, jobs: pd.DataFrame) -> None:
        self.idx_to_candidate_id = candidates["Candidate_ID"].tolist()
        self.candidate_id_to_idx = {cid: i for i, cid in enumerate(self.idx_to_candidate_id)}
        self.idx_to_job_id = jobs["Job_ID"].tolist()
        self.job_id_to_idx = {jid: i for i, jid in enumerate(self.idx_to_job_id)}
        self.log.info("Indexed %d candidates and %d jobs", len(self.idx_to_candidate_id), len(self.idx_to_job_id))

    def build_interaction_events(self, applications: pd.DataFrame, engagement: pd.DataFrame) -> pd.DataFrame:
        """Returns a long-format event table: candidate_idx, job_idx, weight, event_date.

        Multiple raw signals can point at the same (candidate, job) pair
        (e.g. a view row AND an applications row for the same application).
        We keep every event here (not yet deduplicated) so the BehaviorModel
        can use full temporal history; deduplication to a single strongest
        weight per pair happens separately in `build_interaction_matrix`
        for the collaborative model, which needs one weight per cell.
        """
        iw = self.cfg.interaction_weights
        events = []

        # --- Engagement-derived events (each flag is its own event type) ---
        eng = engagement.copy()
        eng = eng[eng["Candidate_ID"].isin(self.candidate_id_to_idx) &
                   eng["Job_ID"].isin(self.job_id_to_idx)]
        eng["candidate_idx"] = eng["Candidate_ID"].map(self.candidate_id_to_idx)
        eng["job_idx"] = eng["Job_ID"].map(self.job_id_to_idx)

        base = eng[["candidate_idx", "job_idx", "View_Date"]].rename(columns={"View_Date": "event_date"})
        base["weight"] = iw.view
        events.append(base)

        flag_weight_map = [
            ("Clicked_Apply", iw.clicked_apply),
            ("Applied", iw.applied),
            ("Shortlisted", iw.shortlisted),
            ("Interviewed", iw.interviewed),
            ("Hired", iw.hired),
        ]
        for col, w in flag_weight_map:
            if col in eng.columns:
                sub = eng[eng[col] == 1][["candidate_idx", "job_idx", "View_Date"]].rename(
                    columns={"View_Date": "event_date"})
                sub["weight"] = w
                events.append(sub)

        # --- Application-derived events (status -> weight) ---
        apps = applications.copy()
        apps = apps[apps["Candidate_ID"].isin(self.candidate_id_to_idx) &
                     apps["Job_ID"].isin(self.job_id_to_idx)]
        apps["candidate_idx"] = apps["Candidate_ID"].map(self.candidate_id_to_idx)
        apps["job_idx"] = apps["Job_ID"].map(self.job_id_to_idx)

        status_weight = {
            "Applied": iw.applied,
            "Shortlisted": iw.shortlisted,
            "Interviewed": iw.interviewed,
            "Hired": iw.hired,
        }
        apps["weight"] = apps["Application_Status"].astype(str).map(status_weight).fillna(iw.applied)
        app_events = apps[["candidate_idx", "job_idx", "Application_Date", "weight"]].rename(
            columns={"Application_Date": "event_date"})
        events.append(app_events)

        result = pd.concat(events, ignore_index=True)
        result = result.dropna(subset=["candidate_idx", "job_idx"])
        result["candidate_idx"] = result["candidate_idx"].astype(np.int32)
        result["job_idx"] = result["job_idx"].astype(np.int32)
        self.log.info("Built %d raw interaction events", len(result))
        return result

    def build_interaction_matrix(self, events: pd.DataFrame, n_candidates: int, n_jobs: int) -> sp.csr_matrix:
        """Collapses events to one strongest weight per (candidate, job)
        pair and returns a sparse CSR matrix, used to train the
        collaborative filtering model."""
        agg = events.groupby(["candidate_idx", "job_idx"], as_index=False)["weight"].max()
        mat = sp.csr_matrix(
            (agg["weight"].values.astype(np.float32),
             (agg["candidate_idx"].values, agg["job_idx"].values)),
            shape=(n_candidates, n_jobs),
        )
        self.log.info("Built interaction matrix with %d nonzero entries (density %.5f%%)",
                       mat.nnz, 100.0 * mat.nnz / (n_candidates * n_jobs))
        return mat


# ==========================================================================
# 4. CONTENT-BASED MODEL
# ==========================================================================

class ContentBasedModel:
    """Builds candidate and job feature vectors in a *shared* feature space
    and scores similarity via batched cosine similarity (sparse matmul).

    Sharing the feature space (same OneHotEncoder/TfidfVectorizer vocab for
    both candidate attributes and job requirement attributes) is what makes
    "Field_Of_Study == Required_Field_Of_Study" comparable at all -- fitting
    separate encoders per side would produce vectors that aren't in the
    same coordinate system, and cosine similarity between them would be
    meaningless.
    """

    CATEGORICAL_PAIRS = [
        # (candidate_column, job_column)
        ("Education_Level", "Required_Education"),
        ("District", "Job_Location"),
        ("Province", "Job_Location"),
    ]
    TEXT_PAIRS = [
        ("Field_Of_Study", "Required_Field_Of_Study"),
        ("Language", "Required_Languages"),
    ]

    def __init__(self, cfg: ContentConfig, logger: logging.Logger):
        self.cfg = cfg
        self.log = logger
        self._onehot: Dict[str, OneHotEncoder] = {}
        self._tfidf: Dict[str, TfidfVectorizer] = {}
        self._exp_scaler: Optional[MinMaxScaler] = None
        self.candidate_matrix: Optional[sp.csr_matrix] = None
        self.job_matrix: Optional[sp.csr_matrix] = None

    def fit_transform(self, candidates: pd.DataFrame, jobs: pd.DataFrame) -> None:
        self.log.info("Fitting content-based feature encoders")
        cand_blocks, job_blocks = [], []

        # Categorical fields: fit one encoder per pair on the UNION of both
        # sides' categories so both sides map into identical columns.
        for cand_col, job_col in self.CATEGORICAL_PAIRS:
            key = f"{cand_col}__{job_col}"
            cand_vals = candidates.get(cand_col, pd.Series(dtype=str)).astype(str).fillna("unknown")
            job_vals = jobs.get(job_col, pd.Series(dtype=str)).astype(str).fillna("unknown")
            union = pd.concat([cand_vals, job_vals]).to_frame(name="v")
            enc = OneHotEncoder(handle_unknown="ignore")
            enc.fit(union[["v"]])
            self._onehot[key] = enc
            cand_blocks.append(enc.transform(cand_vals.to_frame(name="v")))
            job_blocks.append(enc.transform(job_vals.to_frame(name="v")))

        # Text-ish multi-value fields (e.g. "English, Kinyarwanda"): TF-IDF
        # over a shared vocabulary fit on both sides combined.
        for cand_col, job_col in self.TEXT_PAIRS:
            key = f"{cand_col}__{job_col}"
            cand_vals = candidates.get(cand_col, pd.Series(dtype=str)).astype(str).fillna("")
            job_vals = jobs.get(job_col, pd.Series(dtype=str)).astype(str).fillna("")
            vec = TfidfVectorizer(
                max_features=self.cfg.text_max_features,
                ngram_range=self.cfg.ngram_range,
                min_df=self.cfg.min_df,
                token_pattern=r"[A-Za-z0-9]+",
            )
            vec.fit(pd.concat([cand_vals, job_vals]))
            self._tfidf[key] = vec
            cand_blocks.append(vec.transform(cand_vals))
            job_blocks.append(vec.transform(job_vals))

        # Numeric: candidate Total_Experiences vs job Required_Experience_Years,
        # scaled together so "years" and "count" land on a comparable 0-1 scale.
        cand_exp = pd.to_numeric(candidates.get("Total_Experiences", 0), errors="coerce").fillna(0).values.reshape(-1, 1)
        job_exp = pd.to_numeric(jobs.get("Required_Experience_Years", 0), errors="coerce").fillna(0).values.reshape(-1, 1)
        self._exp_scaler = MinMaxScaler()
        self._exp_scaler.fit(np.vstack([cand_exp, job_exp]))
        cand_blocks.append(sp.csr_matrix(self._exp_scaler.transform(cand_exp)))
        job_blocks.append(sp.csr_matrix(self._exp_scaler.transform(job_exp)))

        self.candidate_matrix = sk_normalize(sp.hstack(cand_blocks).tocsr())
        self.job_matrix = sk_normalize(sp.hstack(job_blocks).tocsr())
        self.log.info("Content feature space dimensionality: %d", self.candidate_matrix.shape[1])

    def score_batch(self, candidate_indices: np.ndarray) -> np.ndarray:
        """Cosine similarity of a batch of candidates against ALL jobs.
        Rows are already L2-normalized, so this is a plain sparse matmul.
        Returns a dense (batch_size, n_jobs) array clipped to [0, 1].
        """
        batch = self.candidate_matrix[candidate_indices]
        sims = batch.dot(self.job_matrix.T).toarray()
        return np.clip(sims, 0.0, 1.0).astype(np.float32)


# ==========================================================================
# 5. COLLABORATIVE FILTERING MODEL (PyTorch matrix factorization)
# ==========================================================================

class MatrixFactorizationNet(nn.Module):
    """Classic implicit-feedback matrix factorization:
    score(u, i) = sigmoid( dot(P_u, Q_i) + b_u + b_i + b_global )
    """

    def __init__(self, n_users: int, n_items: int, embedding_dim: int):
        super().__init__()
        self.user_emb = nn.Embedding(n_users, embedding_dim)
        self.item_emb = nn.Embedding(n_items, embedding_dim)
        self.user_bias = nn.Embedding(n_users, 1)
        self.item_bias = nn.Embedding(n_items, 1)
        self.global_bias = nn.Parameter(torch.zeros(1))

        nn.init.normal_(self.user_emb.weight, std=0.05)
        nn.init.normal_(self.item_emb.weight, std=0.05)
        nn.init.zeros_(self.user_bias.weight)
        nn.init.zeros_(self.item_bias.weight)

    def forward(self, user_idx: torch.Tensor, item_idx: torch.Tensor) -> torch.Tensor:
        dot = (self.user_emb(user_idx) * self.item_emb(item_idx)).sum(dim=1)
        bias = self.user_bias(user_idx).squeeze(1) + self.item_bias(item_idx).squeeze(1)
        logits = dot + bias + self.global_bias
        return logits  # raw logits; BCEWithLogitsLoss applied outside

    @torch.no_grad()
    def score_users_batch(self, user_idx: torch.Tensor, all_items: bool = True) -> torch.Tensor:
        """Dense scores for a batch of users against every item, via a
        single matmul. Returns probabilities in [0, 1] (sigmoid applied)."""
        u_vec = self.user_emb(user_idx)                      # (B, d)
        u_bias = self.user_bias(user_idx)                     # (B, 1)
        logits = u_vec @ self.item_emb.weight.T               # (B, n_items)
        logits = logits + u_bias + self.item_bias.weight.T + self.global_bias
        return torch.sigmoid(logits)


class InteractionDataset(Dataset):
    """Wraps positive (user, item, weight) triples from the sparse
    interaction matrix, with on-the-fly random negative sampling.

    Negatives are drawn uniformly at random per __getitem__ call rather
    than pre-materialized, which keeps memory flat regardless of the
    negative_sampling_ratio and gives fresh negatives every epoch.
    """

    def __init__(self, interaction_matrix: sp.csr_matrix, neg_ratio: int, max_weight: float, seed: int = 42):
        coo = interaction_matrix.tocoo()
        self.users = coo.row.astype(np.int64)
        self.items = coo.col.astype(np.int64)
        self.weights = (coo.data.astype(np.float32) / max_weight)  # normalize to (0, 1]
        self.n_items = interaction_matrix.shape[1]
        self.neg_ratio = neg_ratio
        self.rng = np.random.default_rng(seed)
        # Fast membership check for avoiding false negatives during sampling
        self._interacted = {}
        for u, i in zip(self.users, self.items):
            self._interacted.setdefault(u, set()).add(i)

    def __len__(self) -> int:
        return len(self.users)

    def __getitem__(self, idx: int):
        u = self.users[idx]
        pos_i = self.items[idx]
        w = self.weights[idx]

        neg_items = []
        seen = self._interacted.get(u, set())
        while len(neg_items) < self.neg_ratio:
            cand = int(self.rng.integers(0, self.n_items))
            if cand not in seen:
                neg_items.append(cand)

        return u, pos_i, w, np.array(neg_items, dtype=np.int64)

    @staticmethod
    def collate(batch):
        users, pos_items, weights, neg_items = zip(*batch)
        users = torch.as_tensor(users, dtype=torch.long)
        pos_items = torch.as_tensor(pos_items, dtype=torch.long)
        weights = torch.as_tensor(weights, dtype=torch.float32)
        neg_items = torch.as_tensor(np.stack(neg_items), dtype=torch.long)  # (B, neg_ratio)
        return users, pos_items, weights, neg_items


class CollaborativeModel:
    """Trains and serves the PyTorch matrix factorization model.

    Loss: weighted BCE-with-logits. Positive pairs are weighted by their
    normalized implicit-feedback strength (a "Hired" pair contributes more
    gradient signal than a "View" pair); sampled negatives get weight 1.0
    and label 0. This is a standard, scalable substitute for full ALS when
    you want a differentiable model you can extend later (e.g. add side
    features) without switching frameworks.
    """

    def __init__(self, cfg: MFConfig, logger: logging.Logger):
        self.cfg = cfg
        self.log = logger
        self.model: Optional[MatrixFactorizationNet] = None
        self.device = self._resolve_device(cfg.device)

    @staticmethod
    def _resolve_device(device_setting: str) -> torch.device:
        if device_setting == "auto":
            return torch.device("cuda" if torch.cuda.is_available() else "cpu")
        return torch.device(device_setting)

    def fit(self, interaction_matrix: sp.csr_matrix, n_users: int, n_items: int) -> None:
        torch.manual_seed(self.cfg.random_state)
        self.log.info("Training PyTorch matrix factorization on device=%s", self.device)

        dataset = InteractionDataset(
            interaction_matrix, neg_ratio=self.cfg.negative_sampling_ratio,
            max_weight=10.0, seed=self.cfg.random_state,
        )

        n_val = max(1, int(len(dataset) * self.cfg.val_fraction))
        n_train = len(dataset) - n_val
        train_ds, val_ds = torch.utils.data.random_split(
            dataset, [n_train, n_val],
            generator=torch.Generator().manual_seed(self.cfg.random_state),
        )

        train_loader = TorchDataLoader(train_ds, batch_size=self.cfg.batch_size, shuffle=True,
                                        collate_fn=InteractionDataset.collate)
        val_loader = TorchDataLoader(val_ds, batch_size=self.cfg.batch_size, shuffle=False,
                                      collate_fn=InteractionDataset.collate)

        self.model = MatrixFactorizationNet(n_users, n_items, self.cfg.embedding_dim).to(self.device)
        optimizer = torch.optim.Adam(self.model.parameters(), lr=self.cfg.learning_rate,
                                      weight_decay=self.cfg.weight_decay)
        loss_fn = nn.BCEWithLogitsLoss(reduction="none")

        best_val_loss = float("inf")
        epochs_no_improve = 0

        for epoch in range(1, self.cfg.epochs + 1):
            self.model.train()
            train_loss_sum, train_count = 0.0, 0
            for users, pos_items, weights, neg_items in train_loader:
                users = users.to(self.device)
                pos_items = pos_items.to(self.device)
                weights = weights.to(self.device)
                neg_items = neg_items.to(self.device)
                batch_size, neg_ratio = neg_items.shape

                # Positive examples
                pos_logits = self.model(users, pos_items)
                pos_labels = torch.ones_like(pos_logits)
                pos_loss = loss_fn(pos_logits, pos_labels) * weights  # implicit-strength weighting

                # Negative examples (repeat user for each sampled negative)
                users_rep = users.unsqueeze(1).expand(-1, neg_ratio).reshape(-1)
                neg_items_flat = neg_items.reshape(-1)
                neg_logits = self.model(users_rep, neg_items_flat)
                neg_labels = torch.zeros_like(neg_logits)
                neg_loss = loss_fn(neg_logits, neg_labels)

                loss = pos_loss.mean() + neg_loss.mean()

                optimizer.zero_grad()
                loss.backward()
                optimizer.step()

                train_loss_sum += loss.item() * batch_size
                train_count += batch_size

            val_loss = self._evaluate_loss(val_loader, loss_fn)
            self.log.info("Epoch %d/%d - train_loss=%.4f val_loss=%.4f",
                           epoch, self.cfg.epochs, train_loss_sum / max(train_count, 1), val_loss)

            if val_loss < best_val_loss - 1e-5:
                best_val_loss = val_loss
                epochs_no_improve = 0
            else:
                epochs_no_improve += 1
                if epochs_no_improve >= self.cfg.early_stopping_patience:
                    self.log.info("Early stopping at epoch %d (no val improvement for %d epochs)",
                                   epoch, self.cfg.early_stopping_patience)
                    break

        self.model.eval()

    def _evaluate_loss(self, loader, loss_fn) -> float:
        self.model.eval()
        total_loss, total_count = 0.0, 0
        with torch.no_grad():
            for users, pos_items, weights, neg_items in loader:
                users = users.to(self.device)
                pos_items = pos_items.to(self.device)
                weights = weights.to(self.device)
                neg_items = neg_items.to(self.device)
                batch_size, neg_ratio = neg_items.shape

                pos_logits = self.model(users, pos_items)
                pos_loss = loss_fn(pos_logits, torch.ones_like(pos_logits)) * weights

                users_rep = users.unsqueeze(1).expand(-1, neg_ratio).reshape(-1)
                neg_logits = self.model(users_rep, neg_items.reshape(-1))
                neg_loss = loss_fn(neg_logits, torch.zeros_like(neg_logits))

                loss = pos_loss.mean() + neg_loss.mean()
                total_loss += loss.item() * batch_size
                total_count += batch_size
        return total_loss / max(total_count, 1)

    def score_batch(self, candidate_indices: np.ndarray) -> np.ndarray:
        """Dense (batch_size, n_items) collaborative scores in [0, 1]."""
        idx_tensor = torch.as_tensor(candidate_indices, dtype=torch.long, device=self.device)
        scores = self.model.score_users_batch(idx_tensor)
        return scores.detach().cpu().numpy().astype(np.float32)

    def save(self, path: Path) -> None:
        torch.save({"state_dict": self.model.state_dict(), "cfg": self.cfg}, path)

    def load(self, path: Path, n_users: int, n_items: int) -> None:
        checkpoint = torch.load(path, map_location=self.device)
        self.model = MatrixFactorizationNet(n_users, n_items, self.cfg.embedding_dim).to(self.device)
        self.model.load_state_dict(checkpoint["state_dict"])
        self.model.eval()


# ==========================================================================
# 6. BEHAVIOR MODEL
# ==========================================================================

class BehaviorModel:
    """Learns each candidate's implicit preference distribution over
    categorical job attributes from their interaction history, with an
    exponential recency decay, then scores candidate-job fit as the
    (weighted) overlap between that preference distribution and a given
    job's own attributes.

    This complements the collaborative model: collaborative filtering
    captures "candidates like you also liked this job" (cross-candidate
    patterns), while behavior captures "based on YOUR own history, you
    tend to go for jobs like this" (within-candidate pattern), even for
    candidates with too few interactions for collaborative filtering to
    generalize well.
    """

    ATTRS = ["Job_Category", "Institution", "Job_Location", "Required_Languages", "Required_Education"]

    def __init__(self, cfg: BehaviorConfig, logger: logging.Logger):
        self.cfg = cfg
        self.log = logger
        self.candidate_preferences: Dict[int, Dict[str, Dict[str, float]]] = {}

    def fit(self, events: pd.DataFrame, jobs: pd.DataFrame, reference_date: Optional[pd.Timestamp] = None) -> None:
        """events: candidate_idx, job_idx, weight, event_date (from Preprocessor)."""
        if reference_date is None:
            reference_date = events["event_date"].max()
        half_life = self.cfg.recency_half_life_days

        merged = events.merge(
            jobs.reset_index().rename(columns={"index": "job_idx"})[["job_idx"] + self.ATTRS],
            on="job_idx", how="left",
        )
        age_days = (reference_date - merged["event_date"]).dt.days.clip(lower=0).fillna(0)
        recency_factor = np.power(0.5, age_days / max(half_life, 1))
        merged["effective_weight"] = merged["weight"] * recency_factor

        self.log.info("Building behavior preference profiles for %d candidates",
                       merged["candidate_idx"].nunique())

        prefs: Dict[int, Dict[str, Dict[str, float]]] = {}
        for attr in self.ATTRS:
            if attr not in merged.columns:
                continue
            grp = (
                merged.groupby(["candidate_idx", attr])["effective_weight"]
                .sum()
                .reset_index()
            )
            # cap history rows per candidate for speed/memory, keeping strongest signals
            grp = grp.sort_values("effective_weight", ascending=False)
            grp = grp.groupby("candidate_idx").head(self.cfg.max_events_per_candidate)

            for cand_idx, sub in grp.groupby("candidate_idx"):
                total = sub["effective_weight"].sum()
                if total <= 0:
                    continue
                dist = dict(zip(sub[attr].astype(str), sub["effective_weight"] / total))
                prefs.setdefault(int(cand_idx), {})[attr] = dist

        self.candidate_preferences = prefs
        self.log.info("Behavior profiles built for %d candidates", len(prefs))

    def score_batch(self, candidate_indices: np.ndarray, jobs: pd.DataFrame) -> np.ndarray:
        """Returns (batch_size, n_jobs) behavior-fit scores in [0, 1].

        Score per (candidate, job) = mean, across attributes the candidate
        has a preference distribution for, of the preference weight that
        distribution assigns to the job's actual attribute value. A
        candidate with no history at all scores 0 everywhere here (their
        recommendation leans on content + collaborative instead).
        """
        n_jobs = len(jobs)
        out = np.zeros((len(candidate_indices), n_jobs), dtype=np.float32)
        job_attr_values = {attr: jobs[attr].astype(str).values if attr in jobs.columns else None
                            for attr in self.ATTRS}

        for row, cand_idx in enumerate(candidate_indices):
            prefs = self.candidate_preferences.get(int(cand_idx))
            if not prefs:
                continue
            attr_scores = []
            for attr, dist in prefs.items():
                values = job_attr_values.get(attr)
                if values is None:
                    continue
                scores = np.fromiter((dist.get(v, 0.0) for v in values), dtype=np.float32, count=n_jobs)
                attr_scores.append(scores)
            if attr_scores:
                out[row, :] = np.mean(attr_scores, axis=0)

        max_val = out.max()
        if max_val > 0:
            out = out / max_val  # normalize batch to [0, 1] for comparability with other scores
        return out


# ==========================================================================
# 7. HYBRID RANKING
# ==========================================================================

class HybridRanker:
    """Combines the three per-batch score matrices into a single Final
    Score matrix and extracts the top-K jobs per candidate."""

    def __init__(self, weights: HybridWeights, logger: logging.Logger):
        weights.validate()
        self.weights = weights
        self.log = logger

    def combine(self, content: np.ndarray, collaborative: np.ndarray, behavior: np.ndarray) -> np.ndarray:
        return (self.weights.content * content
                + self.weights.collaborative * collaborative
                + self.weights.behavior * behavior)

    @staticmethod
    def top_k_indices(scores: np.ndarray, k: int) -> Tuple[np.ndarray, np.ndarray]:
        """Vectorized top-K over each row of a (batch, n_jobs) matrix.
        Returns (indices, scores) both shaped (batch, k), sorted descending."""
        k = min(k, scores.shape[1])
        part = np.argpartition(-scores, kth=k - 1, axis=1)[:, :k]
        row_idx = np.arange(scores.shape[0])[:, None]
        part_scores = scores[row_idx, part]
        order = np.argsort(-part_scores, axis=1)
        sorted_idx = part[row_idx, order]
        sorted_scores = part_scores[row_idx, order]
        return sorted_idx, sorted_scores


# ==========================================================================
# 8. EVALUATION
# ==========================================================================

class Evaluator:
    """Standard top-K recommendation metrics computed against a held-out
    set of "relevant" jobs per candidate (e.g. jobs they were Shortlisted/
    Interviewed/Hired for, that were excluded from training)."""

    def __init__(self, logger: logging.Logger):
        self.log = logger

    def precision_at_k(self, recommended: List[int], relevant: set, k: int) -> float:
        if k == 0:
            return 0.0
        top = recommended[:k]
        hits = sum(1 for j in top if j in relevant)
        return hits / k

    def recall_at_k(self, recommended: List[int], relevant: set, k: int) -> float:
        if not relevant:
            return 0.0
        top = recommended[:k]
        hits = sum(1 for j in top if j in relevant)
        return hits / len(relevant)

    def average_precision_at_k(self, recommended: List[int], relevant: set, k: int) -> float:
        if not relevant:
            return 0.0
        top = recommended[:k]
        hits, score = 0, 0.0
        for i, j in enumerate(top, start=1):
            if j in relevant:
                hits += 1
                score += hits / i
        return score / min(len(relevant), k)

    def ndcg_at_k(self, recommended: List[int], relevant: set, k: int) -> float:
        top = recommended[:k]
        dcg = sum(1.0 / np.log2(i + 2) for i, j in enumerate(top) if j in relevant)
        ideal_hits = min(len(relevant), k)
        idcg = sum(1.0 / np.log2(i + 2) for i in range(ideal_hits))
        return dcg / idcg if idcg > 0 else 0.0

    def hit_rate_at_k(self, recommended: List[int], relevant: set, k: int) -> float:
        top = recommended[:k]
        return 1.0 if any(j in relevant for j in top) else 0.0

    def evaluate(self, recommendations: Dict[int, List[int]], ground_truth: Dict[int, set], k: int = 20) -> Dict[str, float]:
        """recommendations / ground_truth are keyed by candidate_idx."""
        metrics = {"precision": [], "recall": [], "map": [], "ndcg": [], "hit_rate": []}
        for cand_idx, relevant in ground_truth.items():
            recs = recommendations.get(cand_idx, [])
            if not relevant or not recs:
                continue
            metrics["precision"].append(self.precision_at_k(recs, relevant, k))
            metrics["recall"].append(self.recall_at_k(recs, relevant, k))
            metrics["map"].append(self.average_precision_at_k(recs, relevant, k))
            metrics["ndcg"].append(self.ndcg_at_k(recs, relevant, k))
            metrics["hit_rate"].append(self.hit_rate_at_k(recs, relevant, k))

        results = {f"{name}@{k}": float(np.mean(vals)) if vals else 0.0 for name, vals in metrics.items()}
        self.log.info("Evaluation results: %s", results)
        return results


# ==========================================================================
# 9. RECOMMENDATION ENGINE (orchestrator)
# ==========================================================================

class RecommendationEngine:
    """Wires every component together: load -> preprocess -> fit models ->
    batched scoring -> hybrid ranking -> export. Also exposes a single-
    candidate inference path for on-demand recommendation requests."""

    def __init__(self, cfg: RecommenderConfig):
        self.cfg = cfg
        self.log = get_logger(self.__class__.__name__, cfg.log_dir)

        self.data_loader = DataLoader(cfg, self.log)
        self.preprocessor = Preprocessor(cfg, self.log)
        self.content_model = ContentBasedModel(cfg.content, self.log)
        self.collaborative_model = CollaborativeModel(cfg.mf, self.log)
        self.behavior_model = BehaviorModel(cfg.behavior, self.log)
        self.ranker = HybridRanker(cfg.hybrid_weights, self.log)
        self.evaluator = Evaluator(self.log)

        self.candidates: Optional[pd.DataFrame] = None
        self.jobs: Optional[pd.DataFrame] = None
        self.interaction_events: Optional[pd.DataFrame] = None
        self.interaction_matrix: Optional[sp.csr_matrix] = None

    # ------------------------------------------------------------------
    def prepare(self) -> None:
        """Load data and fit all three models. Call once before scoring."""
        t0 = time.time()
        data = self.data_loader.load_all()
        self.candidates, self.jobs = data["candidates"], data["jobs"]

        self.preprocessor.fit_id_maps(self.candidates, self.jobs)
        self.interaction_events = self.preprocessor.build_interaction_events(
            data["applications"], data["engagement"])
        self.interaction_matrix = self.preprocessor.build_interaction_matrix(
            self.interaction_events, len(self.candidates), len(self.jobs))

        self.content_model.fit_transform(self.candidates, self.jobs)
        self.collaborative_model.fit(self.interaction_matrix, len(self.candidates), len(self.jobs))
        self.behavior_model.fit(self.interaction_events, self.jobs)

        self.log.info("Pipeline preparation complete in %.1fs", time.time() - t0)

    # ------------------------------------------------------------------
    def generate_all_recommendations(self) -> pd.DataFrame:
        """Scores every candidate in batches and returns the top-K feed
        for the whole population as one DataFrame."""
        n_candidates = len(self.candidates)
        batch_size = self.cfg.candidate_batch_size
        k = self.cfg.top_k
        rows = []

        for start in range(0, n_candidates, batch_size):
            end = min(start + batch_size, n_candidates)
            idx_batch = np.arange(start, end)
            self.log.info("Scoring candidates %d-%d of %d", start, end, n_candidates)

            content_scores = self.content_model.score_batch(idx_batch)
            collab_scores = self.collaborative_model.score_batch(idx_batch)
            behavior_scores = self.behavior_model.score_batch(idx_batch, self.jobs)

            final_scores = self.ranker.combine(content_scores, collab_scores, behavior_scores)
            top_idx, top_scores = self.ranker.top_k_indices(final_scores, k)

            for row_i, cand_idx in enumerate(idx_batch):
                cand_id = self.preprocessor.idx_to_candidate_id[cand_idx]
                for rank, (job_col, score) in enumerate(zip(top_idx[row_i], top_scores[row_i]), start=1):
                    job_id = self.preprocessor.idx_to_job_id[job_col]
                    job_row = self.jobs.iloc[job_col]
                    rows.append({
                        "Candidate_ID": cand_id,
                        "Job_ID": job_id,
                        "Job_Title": job_row.get("Job_Title", ""),
                        "Institution": job_row.get("Institution", ""),
                        "Content_Score": round(float(content_scores[row_i, job_col]), 4),
                        "Collaborative_Score": round(float(collab_scores[row_i, job_col]), 4),
                        "Behavior_Score": round(float(behavior_scores[row_i, job_col]), 4),
                        "Final_Score": round(float(score), 4),
                        "Recommendation_Rank": rank,
                    })

        result = pd.DataFrame(rows)
        return result

    # ------------------------------------------------------------------
    def recommend_for_candidate(self, candidate_id: str, k: Optional[int] = None) -> pd.DataFrame:
        """On-demand inference path for a single candidate (e.g. an API call)."""
        if candidate_id not in self.preprocessor.candidate_id_to_idx:
            raise KeyError(f"Unknown Candidate_ID: {candidate_id}")
        k = k or self.cfg.top_k
        cand_idx = np.array([self.preprocessor.candidate_id_to_idx[candidate_id]])

        content_scores = self.content_model.score_batch(cand_idx)
        collab_scores = self.collaborative_model.score_batch(cand_idx)
        behavior_scores = self.behavior_model.score_batch(cand_idx, self.jobs)
        final_scores = self.ranker.combine(content_scores, collab_scores, behavior_scores)
        top_idx, top_scores = self.ranker.top_k_indices(final_scores, k)

        rows = []
        for rank, (job_col, score) in enumerate(zip(top_idx[0], top_scores[0]), start=1):
            job_row = self.jobs.iloc[job_col]
            rows.append({
                "Candidate_ID": candidate_id,
                "Job_ID": self.preprocessor.idx_to_job_id[job_col],
                "Job_Title": job_row.get("Job_Title", ""),
                "Institution": job_row.get("Institution", ""),
                "Content_Score": round(float(content_scores[0, job_col]), 4),
                "Collaborative_Score": round(float(collab_scores[0, job_col]), 4),
                "Behavior_Score": round(float(behavior_scores[0, job_col]), 4),
                "Final_Score": round(float(score), 4),
                "Recommendation_Rank": rank,
            })
        return pd.DataFrame(rows)

    # ------------------------------------------------------------------
    def evaluate(self, holdout_status: Tuple[str, ...] = ("Hired", "Interviewed", "Shortlisted"), k: int = 20) -> Dict[str, float]:
        """Builds ground truth from strong-signal application outcomes and
        evaluates the already-generated recommendations against it.

        Note: for a rigorous offline evaluation you would time-split
        (train on interactions before date T, hold out interactions
        after T) rather than reuse training interactions as ground truth.
        This method evaluates ranking quality against known positive
        outcomes as a sanity check / regression test; see README for the
        time-split variant.
        """
        ground_truth: Dict[int, set] = {}
        for _, row in self.interaction_events.iterrows():
            pass  # placeholder to keep interface explicit; real GT built below for speed

        apps = self.interaction_events  # already candidate_idx/job_idx indexed
        # Recompute status-based ground truth directly from raw applications is more accurate;
        # here we approximate using the strongest event weights already present.
        iw = self.cfg.interaction_weights
        strong_weight_threshold = min(iw.shortlisted, iw.interviewed, iw.hired)
        strong = apps[apps["weight"] >= strong_weight_threshold]
        for cand_idx, sub in strong.groupby("candidate_idx"):
            ground_truth[int(cand_idx)] = set(sub["job_idx"].astype(int).tolist())

        recs_df = self.generate_all_recommendations()
        recs_by_cand: Dict[int, List[int]] = {}
        for cand_id, sub in recs_df.groupby("Candidate_ID"):
            cand_idx = self.preprocessor.candidate_id_to_idx[cand_id]
            job_idxs = [self.preprocessor.job_id_to_idx[j] for j in sub.sort_values("Recommendation_Rank")["Job_ID"]]
            recs_by_cand[cand_idx] = job_idxs

        return self.evaluator.evaluate(recs_by_cand, ground_truth, k=k)


# ==========================================================================
# 10. SYNTHETIC DATA GENERATOR (for testing the pipeline without real data)
# ==========================================================================

class SyntheticDataGenerator:
    """Creates small, schema-correct CSVs so the full pipeline can be
    exercised end to end without the real datasets. NOT a substitute for
    validation against real data -- purely for smoke-testing the code."""

    CATEGORIES = ["Engineering", "Healthcare", "Education", "Finance", "Agriculture", "IT"]
    EDUCATION = ["Bachelor's", "Master's", "Diploma", "PhD"]
    LOCATIONS = ["Kigali", "Musanze", "Huye", "Rubavu", "Nyagatare"]
    LANGUAGES = ["English", "Kinyarwanda", "French", "Swahili"]
    FIELDS = ["Computer Science", "Nursing", "Agronomy", "Accounting", "Civil Engineering", "Education"]

    def __init__(self, n_candidates: int = 2000, n_jobs: int = 300, n_events: int = 20000, seed: int = 42):
        self.n_candidates = n_candidates
        self.n_jobs = n_jobs
        self.n_events = n_events
        self.rng = np.random.default_rng(seed)

    def generate(self, output_dir: Path) -> None:
        output_dir = Path(output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)
        candidates = self._generate_candidates()
        jobs = self._generate_jobs()
        applications, engagement = self._generate_interactions(candidates, jobs)

        candidates.to_csv(output_dir / "Complete_Candidate_Profile.csv", index=False)
        jobs.to_csv(output_dir / "Complete_Job_Profile.csv", index=False)
        applications.to_csv(output_dir / "Cleaned_Combined_Applications.csv", index=False)
        engagement.to_csv(output_dir / "Cleaned_Combined_Engagement.csv", index=False)

    def _generate_candidates(self) -> pd.DataFrame:
        n = self.n_candidates
        return pd.DataFrame({
            "Candidate_ID": [f"C{str(i).zfill(6)}" for i in range(n)],
            "Education_Level": self.rng.choice(self.EDUCATION, n),
            "Degree_Title": self.rng.choice(self.FIELDS, n),
            "Field_Of_Study": self.rng.choice(self.FIELDS, n),
            "Graduation_Year": self.rng.integers(2005, 2025, n),
            "District": self.rng.choice(self.LOCATIONS, n),
            "Province": self.rng.choice(self.LOCATIONS, n),
            "Language": self.rng.choice(self.LANGUAGES, n),
            "Total_Experiences": self.rng.integers(0, 15, n),
            "Total_Applications": self.rng.integers(0, 50, n),
        })

    def _generate_jobs(self) -> pd.DataFrame:
        n = self.n_jobs
        return pd.DataFrame({
            "Job_ID": [f"J{str(i).zfill(5)}" for i in range(n)],
            "Job_Title": [f"{cat} Officer {i}" for i, cat in enumerate(self.rng.choice(self.CATEGORIES, n))],
            "Institution": [f"Institution_{i % 50}" for i in range(n)],
            "Job_Category": self.rng.choice(self.CATEGORIES, n),
            "Job_Level": self.rng.choice(["Junior", "Mid", "Senior"], n),
            "Job_Location": self.rng.choice(self.LOCATIONS, n),
            "Required_Education": self.rng.choice(self.EDUCATION, n),
            "Required_Field_Of_Study": self.rng.choice(self.FIELDS, n),
            "Required_Experience_Years": self.rng.integers(0, 10, n),
            "Required_Languages": self.rng.choice(self.LANGUAGES, n),
        })

    def _generate_interactions(self, candidates: pd.DataFrame, jobs: pd.DataFrame):
        n = self.n_events
        cand_ids = self.rng.choice(candidates["Candidate_ID"], n)
        job_ids = self.rng.choice(jobs["Job_ID"], n)
        dates = pd.Timestamp("2026-01-01") - pd.to_timedelta(self.rng.integers(0, 180, n), unit="D")

        clicked = self.rng.integers(0, 2, n)
        applied = (clicked & self.rng.integers(0, 2, n))
        shortlisted = (applied & self.rng.integers(0, 2, n))
        interviewed = (shortlisted & self.rng.integers(0, 2, n))
        hired = (interviewed & (self.rng.random(n) < 0.2)).astype(int)

        engagement = pd.DataFrame({
            "Candidate_ID": cand_ids, "Job_ID": job_ids, "View_Date": dates,
            "Clicked_Apply": clicked, "Applied": applied, "Shortlisted": shortlisted,
            "Interviewed": interviewed, "Hired": hired,
        })

        applied_mask = engagement["Applied"] == 1
        statuses = np.select(
            [engagement.loc[applied_mask, "Hired"] == 1,
             engagement.loc[applied_mask, "Interviewed"] == 1,
             engagement.loc[applied_mask, "Shortlisted"] == 1],
            ["Hired", "Interviewed", "Shortlisted"], default="Applied",
        )
        applications = pd.DataFrame({
            "Candidate_ID": engagement.loc[applied_mask, "Candidate_ID"].values,
            "Job_ID": engagement.loc[applied_mask, "Job_ID"].values,
            "Application_Date": engagement.loc[applied_mask, "View_Date"].values,
            "Application_Status": statuses,
        })
        return applications, engagement


# ==========================================================================
# 11. CLI ENTRY POINT
# ==========================================================================

def main():
    parser = argparse.ArgumentParser(description="Hybrid Job Recommendation System")
    parser.add_argument("--data-dir", type=str, default="./data")
    parser.add_argument("--output-dir", type=str, default="./outputs")
    parser.add_argument("--top-k", type=int, default=20)
    parser.add_argument("--generate-synthetic-data", action="store_true",
                         help="Write small synthetic CSVs into --data-dir for testing.")
    parser.add_argument("--n-synthetic-candidates", type=int, default=2000)
    parser.add_argument("--n-synthetic-jobs", type=int, default=300)
    parser.add_argument("--run", action="store_true", help="Run the full pipeline and export recommendations.")
    parser.add_argument("--evaluate", action="store_true", help="Also run offline evaluation after --run.")
    parser.add_argument("--candidate-id", type=str, default=None,
                         help="If set with --run, only print recommendations for this one candidate.")
    args = parser.parse_args()

    cfg = RecommenderConfig(data_dir=Path(args.data_dir), output_dir=Path(args.output_dir), top_k=args.top_k)
    log = get_logger("main", cfg.log_dir)

    if args.generate_synthetic_data:
        log.info("Generating synthetic data into %s", cfg.data_dir)
        gen = SyntheticDataGenerator(n_candidates=args.n_synthetic_candidates, n_jobs=args.n_synthetic_jobs)
        gen.generate(cfg.data_dir)
        log.info("Synthetic data ready.")

    if args.run:
        engine = RecommendationEngine(cfg)
        engine.prepare()

        if args.candidate_id:
            recs = engine.recommend_for_candidate(args.candidate_id, k=cfg.top_k)
            print(recs.to_string(index=False))
        else:
            recs = engine.generate_all_recommendations()
            out_path = cfg.output_dir / "recommendations.csv"
            recs.to_csv(out_path, index=False)
            log.info("Wrote %d recommendation rows to %s", len(recs), out_path)

        if args.evaluate:
            metrics = engine.evaluate(k=cfg.top_k)
            log.info("Final metrics: %s", metrics)

    if not (args.generate_synthetic_data or args.run):
        parser.print_help()


if __name__ == "__main__":
    main()


# ==========================================================================
# DESIGN NOTES (see README.md for the full write-up)
# ==========================================================================
#
# - Single-file / OOP: every stage is a class with a narrow public API
#   (fit_transform/score_batch, fit/score_batch, etc.) so this file can be
#   split into content_model.py, collaborative_model.py, etc. later by
#   moving each class verbatim -- no internal coupling was introduced to
#   make that harder.
# - Batched, not fully-materialized, scoring: with ~322K candidates and
#   ~6.9K jobs, a full dense candidate x job matrix per score type is
#   ~2.2B floats (~9GB in float32) -- infeasible to hold three of at once.
#   Processing candidates in batches (default 5,000) keeps peak memory to
#   batch_size x n_jobs per score type (~140MB at defaults) regardless of
#   total candidate count.
# - PyTorch collaborative model uses embeddings + biases trained with a
#   weighted BCE loss and sampled negatives -- functionally similar to
#   implicit ALS, but differentiable and easy to extend (e.g. add
#   candidate/job side-features as additional embedding inputs) without
#   switching libraries.
