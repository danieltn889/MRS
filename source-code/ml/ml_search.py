#!/usr/bin/env python3
"
PRIORITY-BASED JOB SEARCH API - 5 LEXICAL LEVELS + SEMANTIC FALLBACK
NO HARDCODED TERMS - PURE NLP, WITH TYPO CORRECTION
"

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Dict
import requests
import json
import uvicorn
from datetime import datetime
from pathlib import Path
import re
import difflib
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
import traceback

# NLTK imports
import nltk
from nltk.corpus import stopwords
from nltk.stem import WordNetLemmatizer
from nltk.tokenize import word_tokenize

# Semantic embeddings (same model as ai_job_matcher_og.py / hybrid_job_recommender.py)
#   optional: search still works with pure TF-IDF if this package is unavailable.
try:
    from sentence_transformers import SentenceTransformer
    USE_SEMANTIC = True
except ImportError:
    USE_SEMANTIC = False

# =====================================================
# COMPLETE LOGGING SYSTEM
# =====================================================

LOG_DIR = Path(__file__).parent / "search_logs"
LOG_DIR.mkdir(exist_ok=True)

# Log files
TRAINING_LOG = LOG_DIR / "training.log"
SEARCH_LOG = LOG_DIR / "search_requests.log"
ERROR_LOG = LOG_DIR / "errors.log"
DEBUG_LOG = LOG_DIR / "debug.log"
NLP_LOG = LOG_DIR / "nlp_processing.log"
DATA_LOG = LOG_DIR / "data_fetched.log"
MATCH_LOG = LOG_DIR / "match_decisions.log"
VECTOR_LOG = LOG_DIR / "vector_scores.log"
SKILLS_LOG = LOG_DIR / "skills_extraction.log"
QUERY_LOG = LOG_DIR / "query_processing.log"

def write_log(log_file, message, log_type="INFO"):
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
    try:
        with open(log_file, "a", encoding="utf-8") as f:
            f.write(f"[{timestamp}] [{log_type}] {message}\n")
    except:
        pass

def log_info(message): 
    print(f"ℹ️ {message}")
    write_log(DEBUG_LOG, message, "INFO")

def log_success(message): 
    print(f"''{message}")
    write_log(DEBUG_LOG, message, "SUCCESS")

def log_error(message): 
    print(f" {message}")
    write_log(ERROR_LOG, message, "ERROR")

def log_match(message):
    print(f"''{message}")
    write_log(MATCH_LOG, message, "MATCH")

def log_debug(message):
    print(f"🔍 {message}")
    write_log(DEBUG_LOG, message, "DEBUG")

def log_nlp(message):
    print(f"🧠 {message}")
    write_log(NLP_LOG, message, "NLP")

def log_data(message):
    print(f"📊 {message}")
    write_log(DATA_LOG, message, "DATA")

def log_vector(message):
    print(f"📐 {message}")
    write_log(VECTOR_LOG, message, "VECTOR")

def log_skill(message):
    print(f"💪 {message}")
    write_log(SKILLS_LOG, message, "SKILL")

def log_query(message):
    print(f"🔎 {message}")
    write_log(QUERY_LOG, message, "QUERY")

# =====================================================
# NLTK SETUP
# =====================================================

def download_nltk_data():
    try:
        nltk.data.find('tokenizers/punkt')
    except LookupError:
        nltk.download('punkt', quiet=True)
    try:
        nltk.data.find('corpora/stopwords')
    except LookupError:
        nltk.download('stopwords', quiet=True)
    try:
        nltk.data.find('corpora/wordnet')
    except LookupError:
        nltk.download('wordnet', quiet=True)

download_nltk_data()

STOP_WORDS = set(stopwords.words('english'))
lemmatizer = WordNetLemmatizer()

def correct_typos(tokens: List[str], vocab: set) -> List[str]:
    "Fuzzy-correct each token against a vocabulary built from the real job
    postings (see PrioritySearchEngine.add_to_vocab)   same difflib approach
    ai_job_matcher_og.py uses for skill matching. Only touches tokens longer
    than 3 chars and not already a known word, so short/valid words are never
    altered. A no-op when no vocabulary has been built yet."
    if not tokens or not vocab:
        return tokens
    corrected = []
    for tok in tokens:
        if len(tok) <= 3 or tok in vocab:
            corrected.append(tok)
            continue
        match = difflib.get_close_matches(tok, vocab, n=1, cutoff=0.86)
        if match and match[0] != tok:
            log_nlp(f"  [typo-correction] '{tok}'-> '{match[0]}'")
        corrected.append(match[0] if match else tok)
    return corrected

def display_corrected_query(query: str, vocab: set) -> str:
    "A readable 'did you mean'string   typo-corrected only, keeping
    stopwords and word forms intact (unlike preprocess_text's TF-IDF-ready
    output) so it's fit to show back to a user."
    if not query or not vocab:
        return query
    tokens = re.sub(r'[^a-z0-9\s]', '', query.lower()).split()
    corrected = correct_typos(tokens, vocab)
    return ''.join(corrected)

def preprocess_text(text: str, context: str = "general", vocab: set = None) -> str:
    "Pure NLP preprocessing - NO hardcoded terms.
    `vocab`, when given (only for the incoming search query, not job text),
    fuzzy-corrects typos against real terms seen in the job postings."
    if not text:
        return 

    original = text
    log_nlp(f"  [{context}] Original: '{original[:100]}'")

    # Convert to lowercase
    text = text.lower()

    # Keep alphanumeric and spaces only (remove special chars but keep word boundaries)
    text = re.sub(r'[^a-z0-9\s]', '', text)

    # Tokenize
    tokens = word_tokenize(text)
    log_nlp(f"  [{context}] Tokens: {tokens[:10]}")

    # Remove stopwords and short tokens (keep 2+ char tokens)
    tokens_before = len(tokens)
    tokens = [token for token in tokens if token not in STOP_WORDS and len(token) > 1]
    log_nlp(f"  [{context}] After stopword removal: {len(tokens)} tokens (removed {tokens_before - len(tokens)})")

    # Typo correction (query only)   before lemmatization, so correction
    # compares real surface forms against the vocabulary.
    if vocab:
        tokens = correct_typos(tokens, vocab)

    # Lemmatize
    tokens = [lemmatizer.lemmatize(token) for token in tokens]
    log_nlp(f"  [{context}] After lemmatization: {tokens[:10]}")

    result = ''.join(tokens)
    log_nlp(f"  [{context}] Final: '{result}'")

    return result

# =====================================================
# TEXT EXTRACTORS FOR EACH PRIORITY LEVEL
# =====================================================

def extract_title_text(job: dict) -> str:
    "PRIORITY 1: Job Title"
    title = job.get('title', '')
    log_debug(f"    Title: '{title}'")
    return preprocess_text(title, "title")

def extract_qualification_text(job: dict) -> str:
    "PRIORITY 2: Qualifications & Education"
    text_parts = []
    
    # Qualifications text
    qualifications = job.get('qualifications', '')
    if qualifications:
        text_parts.append(preprocess_text(qualifications, "qualifications"))
    
    # Education requirements
    education = job.get('education_required', {})
    if isinstance(education, str):
        try:
            education = json.loads(education)
        except:
            education = {}
    
    # Minimum degree
    min_degree = education.get('minimum_degree', '')
    if min_degree:
        text_parts.append(preprocess_text(min_degree, "degree"))
    
    # Fields of study
    fields_of_study = education.get('fields_of_study', [])
    if isinstance(fields_of_study, str):
        try:
            fields_of_study = json.loads(fields_of_study)
        except:
            fields_of_study = []
    
    for field in fields_of_study:
        if field:
            text_parts.append(preprocess_text(field, "field"))
    
    # Certifications
    certifications = education.get('certifications', [])
    if isinstance(certifications, str):
        try:
            certifications = json.loads(certifications)
        except:
            certifications = []
    
    for cert in certifications:
        if cert:
            text_parts.append(preprocess_text(cert, "certification"))
    
    result = ''.join(text_parts)
    log_debug(f"    Qualifications text length: {len(result)} chars")
    return result

def extract_responsibilities_text(job: dict) -> str:
    "PRIORITY 3: Responsibilities"
    text_parts = []
    
    responsibilities = job.get('responsibilities', [])
    if isinstance(responsibilities, str):
        try:
            responsibilities = json.loads(responsibilities)
        except:
            responsibilities = []
    
    if isinstance(responsibilities, dict):
        responsibilities = list(responsibilities.values())
    elif not isinstance(responsibilities, list):
        responsibilities = []

    log_debug(f"    Found {len(responsibilities)} responsibilities")
    for i, resp in enumerate(responsibilities[:5]):  # Limit to first 5
        if isinstance(resp, str):
            processed = preprocess_text(resp, f"responsibility_{i}")
            text_parts.append(processed)
        elif isinstance(resp, dict):
            for value in resp.values():
                if isinstance(value, str):
                    processed = preprocess_text(value, f"responsibility_{i}")
                    text_parts.append(processed)
    
    result = ''.join(text_parts)
    log_debug(f"    Responsibilities text length: {len(result)} chars")
    return result

def extract_requirements_text(job: dict) -> str:
    "PRIORITY 4: Requirements"
    text_parts = []
    
    requirements = job.get('requirements', [])
    if isinstance(requirements, str):
        try:
            requirements = json.loads(requirements)
        except:
            requirements = []
    
    if isinstance(requirements, dict):
        requirements = list(requirements.values())
    elif not isinstance(requirements, list):
        requirements = []

    log_debug(f"    Found {len(requirements)} requirements")
    for i, req in enumerate(requirements[:5]):  # Limit to first 5
        if isinstance(req, str):
            processed = preprocess_text(req, f"requirement_{i}")
            text_parts.append(processed)
        elif isinstance(req, dict):
            for value in req.values():
                if isinstance(value, str):
                    processed = preprocess_text(value, f"requirement_{i}")
                    text_parts.append(processed)
    
    result = ''.join(text_parts)
    log_debug(f"    Requirements text length: {len(result)} chars")
    return result

def extract_skills_text(job: dict) -> str:
    "PRIORITY 5: Skills (Fallback) - Pure NLP, no hardcoding"
    text_parts = []
    skill_set = set()
    
    log_debug(f"    Extracting skills for job: {job.get('title')}")
    
    # Required skills
    required_skills = job.get('skills_required', [])
    if isinstance(required_skills, str):
        try:
            required_skills = json.loads(required_skills)
        except:
            required_skills = []
    
    log_debug(f"    Required skills count: {len(required_skills)}")
    for skill in required_skills:
        if isinstance(skill, dict):
            name = skill.get('name', '')
            if name:
                skill_set.add(name)
                log_skill(f"      Required skill: '{name}'")
        elif isinstance(skill, str):
            skill_set.add(skill)
            log_skill(f"      Required skill: '{skill}'")
    
    # Preferred skills
    preferred_skills = job.get('skills_preferred', [])
    if isinstance(preferred_skills, str):
        try:
            preferred_skills = json.loads(preferred_skills)
        except:
            preferred_skills = []
    
    log_debug(f"    Preferred skills count: {len(preferred_skills)}")
    for skill in preferred_skills:
        if isinstance(skill, dict):
            name = skill.get('name', '')
            if name:
                skill_set.add(name)
                log_skill(f"      Preferred skill: '{name}'")
        elif isinstance(skill, str):
            skill_set.add(skill)
            log_skill(f"      Preferred skill: '{skill}'")
    
    # Skills from job_skills
    if job.get('skills'):
        log_debug(f"    Job skills count: {len(job.get('skills', []))}")
        for skill in job.get('skills', []):
            if isinstance(skill, dict):
                name = skill.get('skill_name') or skill.get('name', '')
                if name:
                    skill_set.add(name)
                    log_skill(f"      Job skill: '{name}'")
            elif isinstance(skill, str):
                skill_set.add(skill)
                log_skill(f"      Job skill: '{skill}'")
    
    # Process each skill through NLP
    for skill in skill_set:
        if skill:
            processed = preprocess_text(skill, "skill")
            if processed:
                text_parts.append(processed)
    
    result = ''.join(text_parts)
    log_debug(f"    Total unique skills: {len(skill_set)}")
    log_debug(f"    Skills text length: {len(result)} chars")
    log_skill(f"    Final skills text: '{result[:200]}'")
    
    return result

# =====================================================
# CONFIGURATION
# =====================================================

BASE_URL = "http://localhost:3001/api/v1"
EMAIL = "turikumwenimanadaniel727@gmail.com"
PASSWORD = "password123"

app = FastAPI(title="5-Level Priority Job Search API - Pure NLP")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173", "http://localhost:8001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =====================================================
# 5-LEVEL PRIORITY SEARCH ENGINE
# =====================================================

class PrioritySearchEngine:
    SEMANTIC_THRESHOLD = 0.35

    def __init__(self):
        self.models = {
            'title': {'vectorizer': None, 'vectors': None, 'name': 'JOB TITLE', 'icon': '', 'threshold': 0.20},
            'qualification': {'vectorizer': None, 'vectors': None, 'name': 'QUALIFICATIONS', 'icon': '', 'threshold': 0.15},
            'responsibility': {'vectorizer': None, 'vectors': None, 'name': 'RESPONSIBILITIES', 'icon': '📋', 'threshold': 0.12},
            'requirement': {'vectorizer': None, 'vectors': None, 'name': 'REQUIREMENTS', 'icon': '', 'threshold': 0.10},
            'skill': {'vectorizer': None, 'vectors': None, 'name': 'SKILLS', 'icon': '💪', 'threshold': 0.05}
        }
        self.jobs = []
        self.is_fitted = False

        # Typo-correction vocabulary   built from the real job postings at fit()
        # time (titles, skills, qualifications, etc.), not a static word list.
        self.dynamic_vocab: set = set()

        # Semantic fallback   catches conceptually related jobs with no lexical
        # overlap at all (e.g. query "backend developer" vs. a posting titled
        # "Node.js Engineer"). Same model as ai_job_matcher_og.py /
        # hybrid_job_recommender.py, loaded once and reused.
        self.semantic_model = None
        if USE_SEMANTIC:
            try:
                self.semantic_model = SentenceTransformer('all-MiniLM-L6-v2')
                log_success("Semantic model (all-MiniLM-L6-v2) loaded for search fallback")
            except Exception as e:
                log_error(f"Semantic model failed to load, continuing with TF-IDF only: {e}")
                self.semantic_model = None
        self.semantic_matrix = None  # (n_jobs, 384) embeddings, one per job

    def add_to_vocab(self, terms: List[str]):
        "Populate the fuzzy-correction vocabulary from real job text."
        for term in terms:
            if not term or not isinstance(term, str):
                continue
            cleaned = re.sub(r'[^\w\s]', '', term.lower())
            for tok in cleaned.split():
                if len(tok) > 3:
                    self.dynamic_vocab.add(tok)

    def _job_semantic_text(self, job: dict) -> str:
        "A compact 'concept'string per job (title + skills) for the
        semantic embedding   short and focused, unlike the full TF-IDF texts,
        since sentence-transformers work best on phrase-length input."
        parts = [job.get('title', '') or '']
        for key in ('skills_required', 'skills_preferred'):
            skills = job.get(key, [])
            if isinstance(skills, str):
                try:
                    skills = json.loads(skills)
                except Exception:
                    skills = []
            for skill in skills or []:
                name = skill.get('name') if isinstance(skill, dict) else skill
                if name:
                    parts.append(str(name))
        return ''.join(parts)

    def fit(self, jobs: List[dict]):
        "Train all 5 models with complete logging"
        if not jobs:
            log_error("No jobs provided for training!")
            return
        
        self.jobs = jobs
        log_info(f"📊 Training 5 priority models on {len(jobs)} jobs")
        write_log(TRAINING_LOG, f"Starting training on {len(jobs)} jobs", "INFO")
        
        # Extract texts for each priority level
        title_texts = []
        qual_texts = []
        resp_texts = []
        req_texts = []
        skill_texts = []
        
        for i, job in enumerate(jobs):
            job_title = job.get('title', 'Unknown')
            log_debug(f"  Processing job {i+1}: {job_title}")
            write_log(TRAINING_LOG, f"Job {i+1}: {job_title}", "INFO")
            
            title_texts.append(extract_title_text(job))
            qual_texts.append(extract_qualification_text(job))
            resp_texts.append(extract_responsibilities_text(job))
            req_texts.append(extract_requirements_text(job))
            skill_texts.append(extract_skills_text(job))
        
        # Train each model
        # Title model
        log_info(f"''Training Level: JOB TITLE...")
        vectorizer = TfidfVectorizer(ngram_range=(1, 2), max_features=5000, min_df=1)
        self.models['title']['vectors'] = vectorizer.fit_transform(title_texts)
        self.models['title']['vectorizer'] = vectorizer
        log_success(f"   JOB TITLE model ready. Vocabulary: {len(vectorizer.vocabulary_)}")
        
        # Qualifications model
        log_info(f" Training Level: QUALIFICATIONS...")
        vectorizer = TfidfVectorizer(ngram_range=(1, 2), max_features=5000, min_df=1)
        self.models['qualification']['vectors'] = vectorizer.fit_transform(qual_texts)
        self.models['qualification']['vectorizer'] = vectorizer
        log_success(f"   QUALIFICATIONS model ready. Vocabulary: {len(vectorizer.vocabulary_)}")
        
        # Responsibilities model
        log_info(f"📋 Training Level: RESPONSIBILITIES...")
        vectorizer = TfidfVectorizer(ngram_range=(1, 2), max_features=5000, min_df=1)
        self.models['responsibility']['vectors'] = vectorizer.fit_transform(resp_texts)
        self.models['responsibility']['vectorizer'] = vectorizer
        log_success(f"   RESPONSIBILITIES model ready. Vocabulary: {len(vectorizer.vocabulary_)}")
        
        # Requirements model
        log_info(f"''Training Level: REQUIREMENTS...")
        vectorizer = TfidfVectorizer(ngram_range=(1, 2), max_features=5000, min_df=1)
        self.models['requirement']['vectors'] = vectorizer.fit_transform(req_texts)
        self.models['requirement']['vectorizer'] = vectorizer
        log_success(f"   REQUIREMENTS model ready. Vocabulary: {len(vectorizer.vocabulary_)}")
        
        # Skills model
        log_info(f"💪 Training Level: SKILLS...")
        vectorizer = TfidfVectorizer(ngram_range=(1, 2), max_features=5000, min_df=1)
        self.models['skill']['vectors'] = vectorizer.fit_transform(skill_texts)
        self.models['skill']['vectorizer'] = vectorizer
        log_success(f"   SKILLS model ready. Vocabulary: {len(vectorizer.vocabulary_)}")

        # Typo-correction vocabulary   built from every level's real text, so a
        # misspelled query word can be fuzzy-matched against actual terms used
        # in the postings (skills, titles, qualifications, etc.).
        self.dynamic_vocab = set()
        self.add_to_vocab(title_texts)
        self.add_to_vocab(qual_texts)
        self.add_to_vocab(resp_texts)
        self.add_to_vocab(req_texts)
        self.add_to_vocab(skill_texts)
        log_success(f"   Typo-correction vocabulary ready: {len(self.dynamic_vocab)} terms")

        # Semantic fallback embeddings   one compact (title + skills) vector per job
        if self.semantic_model:
            log_info("🧠 Training Level: SEMANTIC (fallback)...")
            semantic_texts = [self._job_semantic_text(job) for job in jobs]
            try:
                self.semantic_matrix = self.semantic_model.encode(
                    semantic_texts, batch_size=32, show_progress_bar=False
                )
                log_success(f"   SEMANTIC fallback ready. Embedded {len(jobs)} jobs.")
            except Exception as e:
                log_error(f"Semantic embedding failed, disabling semantic fallback: {e}")
                self.semantic_matrix = None
        else:
            self.semantic_matrix = None

        self.is_fitted = True
        log_success("''All 5 models trained successfully!")
        write_log(TRAINING_LOG, "Training completed successfully", "SUCCESS")
    
    def search(self, query: str, thresholds: Dict = None) -> Dict:
        "Search using 5 priority levels with complete logging"
        if thresholds is None:
            thresholds = {
                'title': 0.20,
                'qualification': 0.15,
                'responsibility': 0.12,
                'requirement': 0.10,
                'skill': 0.05
            }
        
        if not self.is_fitted or not self.jobs:
            log_error("Search engine not ready!")
            return self._empty_results()
        
        log_query(f"Original query: '{query}'")
        # Typo-correct against real terms from the postings BEFORE lemmatizing,
        # so e.g. "pyhton devloper" -> "python developer" still hits Level 1/5.
        processed_query = preprocess_text(query, "query", vocab=self.dynamic_vocab)
        log_query(f"Processed query: '{processed_query}'")
        log_info(f"📊 Thresholds: Title={thresholds['title']}, Qual={thresholds['qualification']}, Resp={thresholds['responsibility']}, Req={thresholds['requirement']}, Skills={thresholds['skill']}")

        matched_indices = set()
        results = {
            'title_matches': [],
            'qualification_matches': [],
            'responsibility_matches': [],
            'requirement_matches': [],
            'skill_matches': [],
            'semantic_matches': []
        }
        
        # Process each priority level in order
        priority_order = ['title', 'qualification', 'responsibility', 'requirement', 'skill']
        
        for level in priority_order:
            data = self.models[level]
            threshold = thresholds.get(level, data['threshold'])
            
            log_info("=" * 50)
            log_info(f"{data['icon']} LEVEL: Checking {data['name']} matches...")
            write_log(SEARCH_LOG, f"Checking {data['name']} level with threshold {threshold}", "INFO")
            
            # Transform query
            query_vec = data['vectorizer'].transform([processed_query])
            
            # Calculate similarities
            similarities = cosine_similarity(query_vec, data['vectors']).flatten()
            log_vector(f"Similarities calculated for {data['name']}")
            
            for idx, score in enumerate(similarities):
                if idx in matched_indices:
                    log_debug(f"   Job {idx} already matched in higher priority, skipping")
                    continue
                
                job = self.jobs[idx]
                job_title = job.get('title', 'Unknown')
                
                log_vector(f"   Job {idx}: '{job_title}'- {data['name']} score: {score:.4f}")
                write_log(VECTOR_LOG, f"{data['name']} - '{job_title}': {score:.4f}", "SCORE")
                
                if score >= threshold:
                    log_match(f"   '''{job_title}'- Score: {score:.4f} (threshold: {threshold})")
                    write_log(MATCH_LOG, f"MATCH at {data['name']} level: '{job_title}'score {score:.4f}", "MATCH")
                    
                    results[f"{level}_matches"].append({
                        'job': job,
                        'score': float(score),
                        'priority': len(results[f"{level}_matches"]) + 1,
                        'priority_name': data['name'],
                        'icon': data['icon']
                    })
                    matched_indices.add(idx)
                else:
                    log_debug(f"    '{job_title}'- Score: {score:.4f} < {threshold}")
            
            log_success(f"   {data['name']} matches: {len(results[f'{level}_matches'])}")
            write_log(SEARCH_LOG, f"{data['name']} matches: {len(results[f'{level}_matches'])}", "INFO")

        # LEVEL 6 (fallback): SEMANTIC   catches jobs with no lexical overlap at
        # all against the ORIGINAL (uncorrected) query, e.g. "backend developer"
        # matching a posting titled "Node.js Engineer". Only fills in jobs the
        # 5 lexical levels above didn't already match.
        if self.semantic_model is not None and self.semantic_matrix is not None:
            log_info("=" * 50)
            log_info("🧠 LEVEL: Checking SEMANTIC matches...")
            try:
                query_embedding = self.semantic_model.encode([query])[0]
                norms = np.linalg.norm(self.semantic_matrix, axis=1) * np.linalg.norm(query_embedding)
                norms[norms == 0] = 1e-9
                sem_similarities = (self.semantic_matrix @ query_embedding) / norms

                for idx, score in enumerate(sem_similarities):
                    if idx in matched_indices:
                        continue
                    job = self.jobs[idx]
                    job_title = job.get('title', 'Unknown')
                    log_vector(f"   Job {idx}: '{job_title}'- SEMANTIC score: {score:.4f}")
                    if score >= self.SEMANTIC_THRESHOLD:
                        log_match(f"   '''{job_title}'- Semantic score: {score:.4f}")
                        results['semantic_matches'].append({
                            'job': job,
                            'score': float(score),
                            'priority': len(results['semantic_matches']) + 1,
                            'priority_name': 'SEMANTIC (related)',
                            'icon': '🧠'
                        })
                        matched_indices.add(idx)
                log_success(f"   SEMANTIC matches: {len(results['semantic_matches'])}")
            except Exception as e:
                log_error(f"Semantic search failed: {e}")

        # Summary
        total = sum(len(v) for v in results.values())
        log_info("=" * 50)
        log_success(f"📊 SEARCH SUMMARY: {total} total matches")
        log_success(f"   ''Title: {len(results['title_matches'])}")
        log_success(f"    Qualifications: {len(results['qualification_matches'])}")
        log_success(f"   📋 Responsibilities: {len(results['responsibility_matches'])}")
        log_success(f"   ''Requirements: {len(results['requirement_matches'])}")
        log_success(f"   💪 Skills: {len(results['skill_matches'])}")
        log_success(f"   🧠 Semantic: {len(results['semantic_matches'])}")
        log_info("=" * 50)

        write_log(SEARCH_LOG, f"SEARCH COMPLETE: {total} matches found", "SUCCESS")

        return results

    def _empty_results(self):
        return {
            'title_matches': [],
            'qualification_matches': [],
            'responsibility_matches': [],
            'requirement_matches': [],
            'skill_matches': [],
            'semantic_matches': []
        }

# =====================================================
# BACKEND CLIENT
# =====================================================

class BackendClient:
    def __init__(self):
        self.base_url = BASE_URL
        self.token = None
        self.headers = {"Content-Type": "application/json"}
        self.jobs_cache = []
        self.search_engine = PrioritySearchEngine()
        log_success("Backend client initialized")
    
    def login(self):
        log_info("Logging into backend...")
        try:
            resp = requests.post(f"{self.base_url}/auth/login", 
                                json={"email": EMAIL, "password": PASSWORD}, 
                                timeout=30)
            if resp.status_code == 200:
                data = resp.json()
                if data.get("success"):
                    self.token = data["data"]["token"]
                    self.headers["Authorization"] = f"Bearer {self.token}"
                    log_success("Login successful!")
                    return True
            log_error(f"Login failed: {resp.status_code}")
            return False
        except Exception as e:
            log_error(f"Login error: {e}")
            return False
    
    def _fetch_all_job_summaries(self):
        "/jobs/candidate/list paginates (default limit=20, max=100) since it's
        built for candidates browsing the UI   search needs the full active set,
        not just the most recent 20 (same fix as ai_job_matcher_og.py's
        BackendClient.get_jobs())."
        all_jobs = []
        page = 1
        page_size = 100
        while True:
            resp = requests.get(
                f"{self.base_url}/jobs/candidate/list",
                params={"page": page, "limit": page_size},
                headers=self.headers,
                timeout=30,
            )
            if resp.status_code != 200:
                break
            data = resp.json()
            if not (data.get("success") and data.get("data")):
                break
            jobs_data = data["data"]
            page_jobs = jobs_data.get("data") if isinstance(jobs_data, dict) else jobs_data
            if not page_jobs:
                break
            all_jobs.extend(page_jobs)
            pagination = jobs_data.get("pagination") if isinstance(jobs_data, dict) else None
            if not pagination or not pagination.get("has_next_page"):
                break
            page += 1
        return all_jobs

    def fetch_jobs(self):
        if not self.token and not self.login():
            return []

        try:
            log_info("Fetching jobs from backend...")
            jobs = self._fetch_all_job_summaries()
            if not jobs:
                return self.jobs_cache

            log_success(f"Found {len(jobs)} jobs")
            write_log(DATA_LOG, f"Found {len(jobs)} jobs in list response", "INFO")

            # Fetch full details
            enriched_jobs = []
            for job in jobs:
                job_id = job.get('id')
                job_title = job.get('title', 'Unknown')
                if job_id:
                    detail_resp = requests.get(
                        f"{self.base_url}/jobs/candidate/{job_id}",
                        headers=self.headers,
                        timeout=30
                    )
                    if detail_resp.status_code == 200:
                        detail_data = detail_resp.json()
                        if detail_data.get("success"):
                            full_job = detail_data.get("data", job)
                            enriched_jobs.append(full_job)
                            log_success(f"  Fetched details for: {job_title}")
                            write_log(DATA_LOG, f"Fetched details for job {job_id}: {job_title}", "SUCCESS")
                        else:
                            enriched_jobs.append(job)
                    else:
                        enriched_jobs.append(job)
                else:
                    enriched_jobs.append(job)

            self.jobs_cache = enriched_jobs
            active_jobs = [j for j in enriched_jobs if j.get('status') == 'active']
            log_info(f"Active jobs: {len(active_jobs)}")

            # Train search engine
            self.search_engine.fit(active_jobs)
            return enriched_jobs
        except Exception as e:
            log_error(f"Fetch error: {e}")
            traceback.print_exc()
            write_log(ERROR_LOG, f"Fetch error: {e}\n{traceback.format_exc()}", "ERROR")
            return self.jobs_cache

backend = BackendClient()

# =====================================================
# JOB FORMATTING
# =====================================================

def format_job(job: dict, match_info: dict = None) -> dict:
    "Format job with match information"
    try:
        # Extract skills
        skills = []
        required_skills = job.get('skills_required', [])
        if isinstance(required_skills, str):
            try:
                required_skills = json.loads(required_skills)
            except:
                required_skills = []
        
        for skill in required_skills[:10]:
            if isinstance(skill, dict):
                name = skill.get('name', '')
                if name:
                    skills.append(name)
            elif isinstance(skill, str):
                skills.append(skill)
        
        result = {
            "id": job.get('id'),
            "title": job.get('title', 'Untitled'),
            "company": job.get('company_name', 'Unknown Company'),
            "description": (job.get('description', '')[:300] + '...') if len(job.get('description', '')) > 300 else job.get('description', ''),
            "location": ["Kigali, Rwanda"],
            "job_type": job.get('job_type', 'full-time'),
            "work_arrangement": job.get('work_arrangement', 'remote'),
            "salary": None,
            "skills": skills[:10]
        }
        
        if match_info:
            result["match_priority"] = match_info.get("priority_name")
            result["match_score"] = round(match_info.get("score", 0), 3)
            result["priority_icon"] = match_info.get("icon")
        
        return result
    except Exception as e:
        log_error(f"Format error: {e}")
        return {"id": job.get('id'), "title": job.get('title', 'Unknown')}

# =====================================================
# API ENDPOINTS
# =====================================================

@app.get("/search")
async def search_jobs(
    q: str = Query(default=, description="Search query"),
    limit: int = Query(default=50, ge=1, le=100)
):
    "5-level priority search with complete logging"
    start_time = datetime.now()
    write_log(SEARCH_LOG, f"NEW SEARCH: '{q}'", "INFO")
    
    jobs = backend.fetch_jobs()
    
    if not q:
        active_jobs = [j for j in jobs if j.get('status') == 'active']
        formatted = [format_job(job) for job in active_jobs[:limit]]
        return {
            "success": True,
            "total": len(formatted),
            "results": formatted,
            "search_term": q
        }
    
    # Perform priority search
    results = backend.search_engine.search(q)
    
    # Combine results in priority order (semantic is the lowest-priority
    # fallback   it only ever contains jobs the 5 lexical levels above missed)
    all_matches = []
    all_matches.extend(results['title_matches'])
    all_matches.extend(results['qualification_matches'])
    all_matches.extend(results['responsibility_matches'])
    all_matches.extend(results['requirement_matches'])
    all_matches.extend(results['skill_matches'])
    all_matches.extend(results['semantic_matches'])
    
    # Format results
    formatted_results = []
    for match in all_matches[:limit]:
        formatted_results.append(format_job(match['job'], {
            'priority_name': match['priority_name'],
            'score': match['score'],
            'icon': match['icon']
        }))
    
    elapsed = (datetime.now() - start_time).total_seconds()
    
    response = {
        "success": True,
        "total": len(formatted_results),
        "results": formatted_results,
        "search_term": q,
        "processing_time_ms": round(elapsed * 1000, 2),
        "breakdown": {
            "title_matches": len(results['title_matches']),
            "qualification_matches": len(results['qualification_matches']),
            "responsibility_matches": len(results['responsibility_matches']),
            "requirement_matches": len(results['requirement_matches']),
            "skill_matches": len(results['skill_matches']),
            "semantic_matches": len(results['semantic_matches'])
        },
        "corrected_query": display_corrected_query(q, backend.search_engine.dynamic_vocab)
    }
    
    write_log(SEARCH_LOG, f"SEARCH RESULT: {len(formatted_results)} matches in {elapsed:.2f}s", "SUCCESS")
    
    return response

@app.get("/logs/all")
async def get_all_logs():
    "Get all log files content"
    all_logs = {}
    for log_file in [DEBUG_LOG, SEARCH_LOG, ERROR_LOG, NLP_LOG, DATA_LOG, MATCH_LOG, VECTOR_LOG, SKILLS_LOG, QUERY_LOG, TRAINING_LOG]:
        if log_file.exists():
            with open(log_file, 'r', encoding='utf-8') as f:
                content = f.read()
                all_logs[log_file.name] = content[-50000:]  # Last 50000 chars
        else:
            all_logs[log_file.name] = "File not found"
    
    return {
        "success": True,
        "log_files": all_logs,
        "log_directory": str(LOG_DIR.absolute())
    }

@app.get("/logs/{log_type}")
async def get_log(log_type: str):
    "Get specific log file"
    log_map = {
        "debug": DEBUG_LOG,
        "search": SEARCH_LOG,
        "error": ERROR_LOG,
        "nlp": NLP_LOG,
        "data": DATA_LOG,
        "match": MATCH_LOG,
        "vector": VECTOR_LOG,
        "skills": SKILLS_LOG,
        "query": QUERY_LOG,
        "training": TRAINING_LOG
    }
    
    log_file = log_map.get(log_type, DEBUG_LOG)
    
    if log_file.exists():
        with open(log_file, 'r', encoding='utf-8') as f:
            content = f.read()
        return {"log_type": log_type, "content": content[-50000:]}
    else:
        return {"log_type": log_type, "content": "Log file not found"}

@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "service": "6-Level Priority Job Search API - Pure NLP + Semantic + Typo Correction",
        "priority_levels": [
            {"level": 1, "name": "JOB TITLE", "icon": "''", "threshold": 0.20},
            {"level": 2, "name": "QUALIFICATIONS & EDUCATION", "icon": "", "threshold": 0.15},
            {"level": 3, "name": "RESPONSIBILITIES", "icon": "📋", "threshold": 0.12},
            {"level": 4, "name": "REQUIREMENTS", "icon": "''", "threshold": 0.10},
            {"level": 5, "name": "SKILLS", "icon": "💪", "threshold": 0.05},
            {"level": 6, "name": "SEMANTIC (fallback, related jobs with no keyword overlap)", "icon": "🧠", "threshold": PrioritySearchEngine.SEMANTIC_THRESHOLD}
        ],
        "cached_jobs": len(backend.jobs_cache),
        "model_ready": backend.search_engine.is_fitted,
        "semantic_search_available": backend.search_engine.semantic_model is not None,
        "typo_correction_vocabulary_size": len(backend.search_engine.dynamic_vocab),
        "log_directory": str(LOG_DIR.absolute()),
        "log_files": [f.name for f in LOG_DIR.glob("*.log")]
    }

@app.post("/refresh")
async def refresh():
    jobs = backend.fetch_jobs()
    return {
        "success": True,
        "jobs_fetched": len(jobs),
        "model_ready": backend.search_engine.is_fitted
    }

@app.get("/")
async def root():
    return {
        "api": "5-Level Priority Job Search API - Pure NLP (No Hardcoded Terms)",
        "description": "Searches in priority order using pure NLP - NO hardcoded tech terms",
        "priority_logic": [
            "1️⃣ ''JOB TITLE (Highest Priority) - Threshold 0.20",
            "2️⃣  QUALIFICATIONS & EDUCATION - Threshold 0.15",
            "3️⃣ 📋 RESPONSIBILITIES - Threshold 0.12",
            "4️⃣ ''REQUIREMENTS - Threshold 0.10",
            "5️⃣ 💪 SKILLS (Lowest Priority / Fallback) - Threshold 0.05"
        ],
        "logging": {
            "log_directory": str(LOG_DIR.absolute()),
            "log_files": {
                "debug.log": "All debug messages",
                "search_requests.log": "All search queries and results",
                "errors.log": "All errors",
                "nlp_processing.log": "NLP preprocessing steps",
                "data_fetched.log": "Data fetched from backend",
                "match_decisions.log": "All match decisions",
                "vector_scores.log": "Similarity scores",
                "skills_extraction.log": "Skill extraction details",
                "query_processing.log": "Query processing",
                "training.log": "Model training details"
            }
        },
        "endpoints": {
            "GET /search?q=query": "Search jobs using 5-level priority",
            "GET /health": "Health check",
            "GET /logs/all": "View all logs",
            "GET /logs/{log_type}": "View specific log",
            "POST /refresh": "Refresh jobs"
        }
    }

if __name__ == "__main__":
    print("\n" + "=" * 80)
    print("''5-LEVEL PRIORITY JOB SEARCH API - PURE NLP (NO HARDCODED TERMS)")
    print("=" * 80)
    print("\n📋 PRIORITY LEVELS (in search order):")
    print("   1️⃣ ''JOB TITLE (Highest) - Threshold: 0.20")
    print("   2️⃣  QUALIFICATIONS & EDUCATION - Threshold: 0.15")
    print("   3️⃣ 📋 RESPONSIBILITIES - Threshold: 0.12")
    print("   4️⃣ ''REQUIREMENTS - Threshold: 0.10")
    print("   5️⃣ 💪 SKILLS (Fallback) - Threshold: 0.05")
    print("\n📁 LOG DIRECTORY:", LOG_DIR.absolute())
    print("\n📋 LOG FILES CREATED:")
    for log_file in ["debug.log", "search_requests.log", "errors.log", "nlp_processing.log", 
                     "data_fetched.log", "match_decisions.log", "vector_scores.log", 
                     "skills_extraction.log", "query_processing.log", "training.log"]:
        print(f"   - {log_file}")
    print("=" * 80)
    
    # Initial fetch
    print("\n🔄 Initializing search engine...")
    backend.fetch_jobs()
    
    print("\n🌐 Server starting on http://localhost:8001")
    print("\n Test commands:")
    print("   curl 'http://localhost:8001/search?q=Software%20Engineer'")
    print("   curl 'http://localhost:8001/search?q=node%20js'")
    print("   curl 'http://localhost:8001/search?q=Bachelor%20Computer%20Science'")
    print("   curl 'http://localhost:8001/health'")
    print("   curl 'http://localhost:8001/logs/all' # View all logs")
    print("=" * 80 + "\n")
    
    uvicorn.run(app, host="0.0.0.0", port=8001)