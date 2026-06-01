#!/usr/bin/env python3
"""
COMMIT-TO-TASK MATCHER  —  Server
Tasks are passed in the request body — nothing is hardcoded.

Run:  python commit_task_matcher.py
Docs: http://localhost:8097/docs

POST /match
{
  "commit_message": "fixed delete button in todo list",
  "tasks": [
    { "id": "...", "name": "...", "description": "...", "instructions": "..." }
  ]
}
"""

import subprocess
import sys

# ──────────────────────────────────────────────────────────────
# AUTO-INSTALL DEPENDENCIES
# ──────────────────────────────────────────────────────────────
for pkg in ['scikit-learn', 'nltk', 'spacy', 'vaderSentiment', 'fastapi', 'uvicorn']:
    try:
        __import__(pkg.replace('-', '_'))
    except ImportError:
        print(f"Installing {pkg}...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", pkg, "--quiet"])

# ──────────────────────────────────────────────────────────────
# LOAD LIBRARIES
# ──────────────────────────────────────────────────────────────
print("\n📥 Loading libraries...")

import re
import json
import warnings
from typing import List, Dict

warnings.filterwarnings("ignore")

# spaCy — prefer md (real word vectors), fall back to sm
nlp = None
for model in ("en_core_web_md", "en_core_web_sm"):
    try:
        import spacy
        try:
            nlp = spacy.load(model)
        except OSError:
            print(f"  Downloading {model}...")
            subprocess.check_call([sys.executable, "-m", "spacy", "download", model, "--quiet"])
            nlp = spacy.load(model)
        print(f"  ✅ spaCy  ({model})")
        break
    except Exception as e:
        print(f"  ⚠️  spaCy {model}: {e}")

# NLTK
stopwords         = None
WordNetLemmatizer = None
word_tokenize     = None
try:
    import nltk
    from nltk.corpus import stopwords
    from nltk.stem import WordNetLemmatizer
    from nltk.tokenize import word_tokenize
    for resource, path in [
        ('punkt',     'tokenizers/punkt'),
        ('stopwords', 'corpora/stopwords'),
        ('wordnet',   'corpora/wordnet'),
        ('punkt_tab', 'tokenizers/punkt_tab'),
    ]:
        try:
            nltk.data.find(path)
        except LookupError:
            nltk.download(resource, quiet=True)
    print("  ✅ NLTK")
except Exception as e:
    print(f"  ⚠️  NLTK: {e}")

# VADER
sia = None
try:
    from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer
    sia = SentimentIntensityAnalyzer()
    print("  ✅ VADER")
except Exception as e:
    print(f"  ⚠️  VADER: {e}")

# scikit-learn
TfidfVectorizer  = None
cosine_similarity = None
try:
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.metrics.pairwise import cosine_similarity
    print("  ✅ scikit-learn")
except Exception as e:
    print(f"  ⚠️  scikit-learn: {e}")

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
import uvicorn


# ──────────────────────────────────────────────────────────────
# TEXT PROCESSOR
# ──────────────────────────────────────────────────────────────
class TextProcessor:
    def __init__(self):
        self.lemmatizer = None
        self.stop_words = set()
        if WordNetLemmatizer:
            try:
                self.lemmatizer = WordNetLemmatizer()
            except Exception:
                pass
        if stopwords:
            try:
                self.stop_words = set(stopwords.words('english'))
            except Exception:
                pass

    def clean_text(self, text: str) -> str:
        if not text:
            return ""
        text = text.lower()
        text = re.sub(r'[^\w\s]', ' ', text)
        text = re.sub(r'\s+', ' ', text).strip()
        try:
            tokens = word_tokenize(text) if word_tokenize else text.split()
        except Exception:
            tokens = text.split()
        cleaned = []
        for token in tokens:
            if token not in self.stop_words and len(token) > 2:
                if self.lemmatizer:
                    try:
                        token = self.lemmatizer.lemmatize(token)
                    except Exception:
                        pass
                cleaned.append(token)
        return ' '.join(cleaned)

    def tfidf_similarity(self, text1: str, text2: str) -> float:
        c1 = self.clean_text(text1)
        c2 = self.clean_text(text2)
        if not c1 or not c2:
            return 0.0
        if TfidfVectorizer and cosine_similarity:
            try:
                vec = TfidfVectorizer()
                mat = vec.fit_transform([c1, c2])
                return float(cosine_similarity(mat[0:1], mat[1:2])[0][0])
            except Exception:
                pass
        w1, w2 = set(c1.split()), set(c2.split())
        union = w1 | w2
        return len(w1 & w2) / len(union) if union else 0.0

    def spacy_similarity(self, text1: str, text2: str) -> float:
        if not nlp:
            return 0.0
        try:
            d1 = nlp(text1[:10_000])
            d2 = nlp(text2[:10_000])
            if d1.vector_norm == 0 or d2.vector_norm == 0:
                return 0.0
            return float(d1.similarity(d2))
        except Exception:
            return 0.0

    def get_sentiment(self, text: str) -> str:
        if not text or not sia:
            return "neutral"
        try:
            score = sia.polarity_scores(text)['compound']
            if score >= 0.05:
                return "positive"
            elif score <= -0.05:
                return "negative"
            return "neutral"
        except Exception:
            return "neutral"


# ──────────────────────────────────────────────────────────────
# TASK MATCHER
# ──────────────────────────────────────────────────────────────
class TaskMatcher:
    W_TFIDF         = 0.55
    W_SPACY         = 0.45
    SENTIMENT_BONUS = 0.08

    def __init__(self):
        self.processor = TextProcessor()

    def _task_text(self, task: Dict) -> str:
        return " ".join([
            task.get("name", ""),
            task.get("description", ""),
            task.get("instructions", ""),
        ])

    def _match_level(self, confidence: float) -> str:
        if confidence >= 65:
            return "Excellent Match 🌟"
        elif confidence >= 50:
            return "Strong Match ✅"
        elif confidence >= 35:
            return "Good Match 👍"
        elif confidence >= 20:
            return "Weak Match 📝"
        return "No Match ❌"

    def match(self, commit_message: str, tasks: List[Dict]) -> Dict:
        if not commit_message or not commit_message.strip():
            return {"success": False, "error": "commit_message is empty"}
        if not tasks:
            return {"success": False, "error": "tasks list is empty"}

        commit_sentiment = self.processor.get_sentiment(commit_message)
        results = []

        for task in tasks:
            task_text       = self._task_text(task)
            tfidf_sim       = self.processor.tfidf_similarity(commit_message, task_text)
            spacy_sim       = self.processor.spacy_similarity(commit_message, task_text)
            combined_sim    = self.W_TFIDF * tfidf_sim + self.W_SPACY * spacy_sim
            task_sentiment  = self.processor.get_sentiment(task_text)
            sentiment_bonus = self.SENTIMENT_BONUS if commit_sentiment == task_sentiment else 0.0
            confidence      = round(min((combined_sim + sentiment_bonus) * 100, 100.0), 1)

            results.append({
                "task_id":          task.get("id", ""),
                "task_name":        task.get("name", ""),
                "confidence":       confidence,
                "match_level":      self._match_level(confidence),
                "tfidf_score":      round(tfidf_sim * 100, 1),
                "spacy_score":      round(spacy_sim * 100, 1),
                "sentiment_commit": commit_sentiment,
                "sentiment_task":   task_sentiment,
                "sentiment_match":  commit_sentiment == task_sentiment,
            })

        results.sort(key=lambda x: x["confidence"], reverse=True)

        return {
            "success":        True,
            "commit_message": commit_message,
            "total_tasks":    len(tasks),
            "best_match":     results[0] if results else None,
            "all_matches":    results,
        }


# ──────────────────────────────────────────────────────────────
# FASTAPI APP
# ──────────────────────────────────────────────────────────────
app = FastAPI(title="Commit-to-Task Matcher", version="3.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

matcher = TaskMatcher()


@app.get("/health")
async def health():
    return {
        "status":      "healthy",
        "spacy":       nlp is not None,
        "spacy_model": nlp.meta.get("name", "unknown") if nlp else None,
        "has_vectors": nlp.vocab.vectors.shape[0] > 0 if nlp else False,
        "vader":       sia is not None,
        "sklearn":     TfidfVectorizer is not None,
    }


@app.post("/match")
async def match_commit(request: Request):
    """
    Match a commit message against tasks passed in the request body.

    Body (JSON):
    {
      "commit_message": "fixed delete button in todo list",
      "tasks": [
        {
          "id": "123",
          "name": "Fix the Broken Todo List Application",
          "description": "Debug and fix bugs in the Todo app...",
          "instructions": "1. Open src/App.jsx. 2. Fix handleAdd..."
        }
      ]
    }
    """
    try:
        data = json.loads((await request.body()).decode("utf-8"))

        commit_message = data.get("commit_message", "").strip()
        if not commit_message:
            return {"success": False, "error": "commit_message is required"}

        tasks = data.get("tasks", [])
        if not tasks:
            return {"success": False, "error": "tasks list is required"}

        return matcher.match(commit_message, tasks)

    except json.JSONDecodeError:
        return {"success": False, "error": "Invalid JSON body"}
    except Exception as e:
        import traceback
        return {"success": False, "error": str(e), "trace": traceback.format_exc()}


# ──────────────────────────────────────────────────────────────
# ENTRY POINT
# ──────────────────────────────────────────────────────────────
if __name__ == "__main__":
    print("\n" + "=" * 65)
    print("🚀  COMMIT-TO-TASK MATCHER  v3.0")
    print("=" * 65)
    print("  Tasks come from the request body — nothing hardcoded.")
    print("  TF-IDF  : weight 55%  (scikit-learn)")
    print("  spaCy   : weight 45%  (en_core_web_md)")
    print("  Sentiment bonus: +8%  (VADER)")
    print("  Stopwords + lemmatization (NLTK)")
    print("=" * 65)
    print("\n  Server : http://localhost:8097")
    print("  Docs   : http://localhost:8097/docs")
    print()
    print("  Example body for POST /match:")
    print("""
  {
    "commit_message": "fixed delete button removing wrong todo item",
    "tasks": [
      {
        "id": "1778949636137",
        "name": "Fix the Broken Todo List Application",
        "description": "Debug and fix 5 bugs in the Todo List app...",
        "instructions": "1. Open src/App.jsx. 2. Fix handleAdd..."
      }
    ]
  }
    """)
    print("=" * 65 + "\n")
    uvicorn.run(app, host="0.0.0.0", port=8097)