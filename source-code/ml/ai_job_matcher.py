#!/usr/bin/env python3
"""
AI JOB MATCHING API - COMPLETE 4-FACTOR PURE LOCAL ML
FULL LOGGING OF CANDIDATE SIDE, JOB SIDE, AND MATCHING RESULTS
"""

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Dict
import requests
import json
import re
import uvicorn
import time
import os
import sys
from datetime import datetime
from pathlib import Path
import numpy as np
from collections import Counter

# =====================================================
# FORCE OFFLINE MODE - NO EXTERNAL CALLS
# =====================================================
os.environ['TRANSFORMERS_OFFLINE'] = '1'
os.environ['HF_DATASETS_OFFLINE'] = '1'

# =====================================================
# LOGGING SETUP
# =====================================================

LOG_DIR = Path(__file__).parent / "logs"
LOG_DIR.mkdir(exist_ok=True)

# Log files
MAIN_LOG = LOG_DIR / "ai_service.log"
ERROR_LOG = LOG_DIR / "ai_service_errors.log"
PERFORMANCE_LOG = LOG_DIR / "performance.log"
REQUEST_LOG = LOG_DIR / "requests.log"
ML_LOG = LOG_DIR / "ml_matching.log"
CANDIDATE_LOG = LOG_DIR / "candidate_data.log"
JOB_LOG = LOG_DIR / "job_data.log"
MATCH_LOG = LOG_DIR / "match_results.log"

def write_log(log_file, message, log_type="INFO"):
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
    try:
        with open(log_file, "a", encoding="utf-8") as f:
            f.write(f"[{timestamp}] [{log_type}] {message}\n")
    except:
        pass

def log_info(message):
    print(message)
    write_log(MAIN_LOG, message, "INFO")

def log_error(message):
    print(f"❌ {message}")
    write_log(ERROR_LOG, message, "ERROR")

def log_performance(operation, duration_ms, details=""):
    message = f"⏱️ {operation}: {duration_ms:.2f}ms {details}"
    print(message)
    write_log(PERFORMANCE_LOG, f"{operation}|{duration_ms:.2f}ms|{details}", "PERF")

def log_candidate(message):
    """Log candidate-side data"""
    print(f"👤 {message}")
    write_log(CANDIDATE_LOG, message, "CANDIDATE")

def log_job(message):
    """Log job-side data"""
    print(f"💼 {message}")
    write_log(JOB_LOG, message, "JOB")

def log_match(message):
    """Log matching results"""
    print(f"🎯 {message}")
    write_log(MATCH_LOG, message, "MATCH")

def log_request(endpoint, candidate_id, duration_ms, status):
    write_log(REQUEST_LOG, f"{endpoint}|{candidate_id}|{duration_ms:.2f}ms|{status}", "REQUEST")

log_info("="*70)
log_info("🚀 AI JOB MATCHING API - 4-FACTOR LOCAL ML")
log_info(f"📁 Log directory: {LOG_DIR}")
log_info("="*70)

# =====================================================
# INSTALL REQUIRED LOCAL ML PACKAGES
# =====================================================

try:
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.metrics.pairwise import cosine_similarity
    import nltk
    from nltk.stem import PorterStemmer, WordNetLemmatizer
    from nltk.tokenize import word_tokenize
    
    try:
        nltk.data.find('tokenizers/punkt')
    except LookupError:
        nltk.download('punkt', quiet=True)
    
    try:
        nltk.data.find('corpora/wordnet')
    except LookupError:
        nltk.download('wordnet', quiet=True)
    
    log_info("✅ NLTK loaded")
    
except ImportError:
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "scikit-learn", "nltk", "numpy"])
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.metrics.pairwise import cosine_similarity
    import nltk
    from nltk.stem import PorterStemmer, WordNetLemmatizer
    from nltk.tokenize import word_tokenize
    nltk.download('punkt', quiet=True)
    nltk.download('wordnet', quiet=True)
    log_info("✅ Packages installed")

try:
    from sentence_transformers import SentenceTransformer
    USE_SENTENCE_TRANSFORMERS = True
    log_info("✅ Sentence Transformers loaded")
except ImportError:
    USE_SENTENCE_TRANSFORMERS = False
    log_info("⚠️ Sentence Transformers not available")

try:
    from textblob import TextBlob
    USE_TEXTBLOB = True
    log_info("✅ TextBlob loaded")
except ImportError:
    USE_TEXTBLOB = False
    log_info("⚠️ TextBlob not available")

# API Configuration
BASE_URL = "http://localhost:3001/api/v1"
EMAIL = "turikumwenimanadaniel727@gmail.com"
PASSWORD = "password123"

log_info(f"📡 API Configuration:")
log_info(f"   BASE_URL: {BASE_URL}")
log_info(f"   EMAIL: {EMAIL}")

# =====================================================
# LOCAL TEXT PROCESSOR
# =====================================================

class LocalTextProcessor:
    def __init__(self):
        self.stemmer = PorterStemmer()
        self.lemmatizer = WordNetLemmatizer()
        
        if USE_SENTENCE_TRANSFORMERS:
            try:
                self.semantic_model = SentenceTransformer('all-MiniLM-L6-v2')
                log_info("✅ Sentence Transformer loaded")
            except:
                self.semantic_model = None
        else:
            self.semantic_model = None
        
        self.embeddings_cache = {}
        self.cache_hits = 0
        self.cache_misses = 0
    
    def local_spell_check(self, text: str) -> str:
        if not text or not USE_TEXTBLOB:
            return text
        try:
            blob = TextBlob(text)
            return str(blob.correct())
        except:
            return text
    
    def lemmatize(self, text: str) -> str:
        if not text:
            return text
        try:
            tokens = word_tokenize(text.lower())
            lemmatized = [self.lemmatizer.lemmatize(token) for token in tokens]
            return ' '.join(lemmatized)
        except:
            return text
    
    def process(self, text: str) -> str:
        if not text:
            return ""
        text = text.lower()
        text = re.sub(r'[^\w\s]', ' ', text)
        text = self.local_spell_check(text)
        text = self.lemmatize(text)
        return text
    
    def get_local_embedding(self, text: str) -> np.ndarray:
        if not text:
            return np.zeros(384)
        if text in self.embeddings_cache:
            self.cache_hits += 1
            return self.embeddings_cache[text]
        self.cache_misses += 1
        if self.semantic_model:
            try:
                emb = self.semantic_model.encode([text])[0]
                self.embeddings_cache[text] = emb
                return emb
            except:
                pass
        return np.zeros(384)
    
    def local_semantic_similarity(self, text1: str, text2: str) -> float:
        if not text1 or not text2:
            return 0.0
        emb1 = self.get_local_embedding(text1)
        emb2 = self.get_local_embedding(text2)
        if np.linalg.norm(emb1) > 0 and np.linalg.norm(emb2) > 0:
            return float(np.dot(emb1, emb2) / (np.linalg.norm(emb1) * np.linalg.norm(emb2)))
        try:
            vec = TfidfVectorizer(max_features=300)
            tfidf = vec.fit_transform([text1, text2])
            return float(cosine_similarity(tfidf[0:1], tfidf[1:2])[0][0])
        except:
            return 0.0
    
    def get_cache_stats(self):
        return {"hits": self.cache_hits, "misses": self.cache_misses}


# =====================================================
# FACTOR 1: SKILLS MATCHER (40%)
# =====================================================

class Factor1_SkillsMatcher:
    def __init__(self, tp):
        self.tp = tp
    
    def extract_candidate_skills(self, profile_data):
        skills = set()
        for skill in profile_data.get('skills', []):
            name = skill.get('skill_name', '') or skill.get('name', '')
            if name:
                processed = self.tp.process(name)
                if processed:
                    skills.add(processed)
                    log_candidate(f"   Skill extracted: {name} → {processed}")
        for work in profile_data.get('work_experience', []):
            for skill in work.get('skills', []):
                if skill and isinstance(skill, str):
                    processed = self.tp.process(skill)
                    if processed:
                        skills.add(processed)
                        log_candidate(f"   Skill from work: {skill} → {processed}")
        return list(skills)
    
    def extract_job_skills(self, job):
        skills = set()
        for skill in job.get('skills_required', []):
            if isinstance(skill, dict):
                name = skill.get('name', '')
            elif isinstance(skill, str):
                name = skill
            else:
                continue
            if name:
                name = name.replace('•', '').strip()
                processed = self.tp.process(name)
                if processed:
                    skills.add(processed)
                    log_job(f"   Required skill: {name} → {processed}")
        return list(skills)
    
    def match(self, candidate_skills, job_skills):
        if not job_skills:
            return {"score": 1.0, "match_percentage": 100.0, "matched_count": 0, "total": 0, "weight": 0.40, "weighted_score": 0.40}
        if not candidate_skills:
            return {"score": 0.0, "match_percentage": 0.0, "matched_count": 0, "total": len(job_skills), "weight": 0.40, "weighted_score": 0.0}
        
        matched = []
        for js in job_skills:
            best = 0.0
            for cs in candidate_skills:
                sim = self.tp.local_semantic_similarity(cs, js)
                if sim > best:
                    best = sim
            if best >= 0.3:
                matched.append(js)
                log_match(f"      Skill matched: '{js}' with similarity {best:.2f}")
        
        score = len(matched) / len(job_skills)
        return {
            "score": round(score, 4),
            "match_percentage": round(score * 100, 1),
            "matched_count": len(matched),
            "total_job_skills": len(job_skills),
            "matched_skills": matched,
            "weight": 0.40,
            "weighted_score": round(score * 0.40, 4)
        }


# =====================================================
# FACTOR 2: QUALIFICATIONS MATCHER (25%)
# =====================================================

class Factor2_QualificationsMatcher:
    def __init__(self, tp):
        self.tp = tp
    
    def extract_candidate_qualifications(self, profile_data):
        result = {"degrees": [], "fields": []}
        for edu in profile_data.get('education', []):
            degree = edu.get('degree', '')
            field = edu.get('field_of_study', '')
            if degree:
                result["degrees"].append({"raw": degree, "processed": self.tp.process(degree)})
                log_candidate(f"   Degree: {degree}")
            if field:
                result["fields"].append({"raw": field, "processed": self.tp.process(field)})
                log_candidate(f"   Field: {field}")
        return result
    
    def extract_job_qualifications(self, job):
        edu_required = job.get('education_required', {})
        if isinstance(edu_required, str):
            try:
                edu_required = json.loads(edu_required)
            except:
                edu_required = {}
        min_degree = edu_required.get('minimum_degree', '')
        fields = edu_required.get('fields_of_study', [])
        log_job(f"   Required degree: {min_degree}")
        log_job(f"   Required fields: {fields}")
        return {
            "minimum_degree": min_degree,
            "min_degree_processed": self.tp.process(min_degree),
            "is_degree_required": edu_required.get('is_degree_required', False),
            "fields_of_study": fields,
            "fields_processed": [self.tp.process(f) for f in fields]
        }
    
    def match(self, candidate_quals, job_quals):
        if not job_quals["is_degree_required"] or not job_quals["minimum_degree"]:
            return {"score": 1.0, "match_percentage": 100.0, "weight": 0.25, "weighted_score": 0.25}
        
        degree_sim = 0.0
        for d in candidate_quals["degrees"]:
            sim = self.tp.local_semantic_similarity(d["processed"], job_quals["min_degree_processed"])
            degree_sim = max(degree_sim, sim)
        
        field_sim = 1.0
        if job_quals["fields_of_study"] and candidate_quals["fields"]:
            field_sim = 0.0
            for jf in job_quals["fields_processed"]:
                for cf in candidate_quals["fields"]:
                    sim = self.tp.local_semantic_similarity(cf["processed"], jf)
                    field_sim = max(field_sim, sim)
        
        score = (degree_sim * 0.6) + (field_sim * 0.4)
        log_match(f"   Qualifications: degree similarity={degree_sim:.2f}, field similarity={field_sim:.2f}, score={score:.2f}")
        
        return {
            "score": round(score, 4),
            "match_percentage": round(score * 100, 1),
            "degree_similarity": round(degree_sim, 4),
            "field_similarity": round(field_sim, 4),
            "weight": 0.25,
            "weighted_score": round(score * 0.25, 4)
        }


# =====================================================
# FACTOR 3: EXPERIENCE MATCHER (20%)
# =====================================================

class Factor3_ExperienceMatcher:
    def __init__(self, tp):
        self.tp = tp
    
    def extract_candidate_experience(self, profile_data):
        experiences = []
        for work in profile_data.get('work_experience', []):
            title = work.get('title', '')
            start = work.get('start_date')
            end = work.get('end_date')
            years = 0.0
            if start and end:
                try:
                    s = datetime.fromisoformat(start.replace('Z', '+00:00'))
                    e = datetime.fromisoformat(end.replace('Z', '+00:00'))
                    years = (e - s).days / 365.25
                except:
                    pass
            if title and years > 0:
                experiences.append({"title": title, "years": round(years, 2), "processed_title": self.tp.process(title)})
                log_candidate(f"   Work: {title} - {years:.2f} years")
        return experiences
    
    def extract_job_specific_requirements(self, job):
        requirements = []
        edu_required = job.get('education_required', {})
        if isinstance(edu_required, str):
            try:
                edu_required = json.loads(edu_required)
            except:
                edu_required = {}
        exp_reqs = edu_required.get('experience_requirements', [])
        if not exp_reqs:
            exp_reqs = job.get('experience_requirements', [])
        for req in exp_reqs:
            if isinstance(req, dict):
                title = req.get('title', '')
                years = req.get('years', '')
                if title and years:
                    years_num = 0.0
                    match = re.search(r'(\d+(?:\.\d+)?)', str(years))
                    if match:
                        years_num = float(match.group(1))
                    requirements.append({"title": title, "years_required": years_num, "processed_title": self.tp.process(title)})
                    log_job(f"   Specific requirement: {title} - {years_num}+ years")
        return requirements
    
    def calculate_total_experience(self, profile_data):
        total = 0.0
        for work in profile_data.get('work_experience', []):
            start = work.get('start_date')
            end = work.get('end_date')
            if start and end:
                try:
                    s = datetime.fromisoformat(start.replace('Z', '+00:00'))
                    e = datetime.fromisoformat(end.replace('Z', '+00:00'))
                    total += (e - s).days / 365.25
                except:
                    pass
        return total
    
    def match(self, candidate_exp_list, job_specific_reqs, total_candidate_years, job_min_years):
        if job_specific_reqs:
            return self._match_specific(candidate_exp_list, job_specific_reqs)
        return self._match_general(total_candidate_years, job_min_years)
    
    def _match_specific(self, candidate_exp, job_reqs):
        if not job_reqs:
            return {"score": 1.0, "match_percentage": 100.0, "type": "no_requirement", "weight": 0.20, "weighted_score": 0.20}
        if not candidate_exp:
            return {"score": 0.0, "match_percentage": 0.0, "type": "specific", "matches": [], "weight": 0.20, "weighted_score": 0.0}
        
        matches = []
        total_score = 0.0
        for req in job_reqs:
            best = None
            best_score = 0.0
            for exp in candidate_exp:
                title_sim = self.tp.local_semantic_similarity(req["processed_title"], exp["processed_title"])
                if title_sim >= 0.3:
                    if exp["years"] >= req["years_required"]:
                        years_score = 1.0
                    else:
                        ratio = exp["years"] / req["years_required"] if req["years_required"] > 0 else 1.0
                        years_score = 0.5 + (ratio * 0.5)
                        years_score = min(0.85, years_score)
                    combined = (title_sim * 0.6) + (years_score * 0.4)
                    if combined > best_score:
                        best_score = combined
                        best = {"requirement": req["title"], "required_years": req["years_required"], "matched_with": exp["title"], "candidate_years": exp["years"], "combined_score": combined}
            if best:
                matches.append(best)
                total_score += best["combined_score"]
                log_match(f"      Experience matched: '{best['requirement']}' with '{best['matched_with']}' ({best['candidate_years']}yrs) → {best['combined_score']:.2f}")
            else:
                log_match(f"      Experience NOT matched: '{req['title']}' (requires {req['years_required']}+ years)")
        score = total_score / len(job_reqs) if job_reqs else 1.0
        return {"score": round(score, 4), "match_percentage": round(score * 100, 1), "type": "specific", "matches": matches, "weight": 0.20, "weighted_score": round(score * 0.20, 4)}
    
    def _match_general(self, candidate_years, job_min_years):
        log_candidate(f"   Total experience: {candidate_years:.2f} years")
        log_job(f"   Required experience: {job_min_years}+ years")
        if job_min_years == 0:
            log_match(f"   Experience: No requirement → 100%")
            return {"score": 1.0, "match_percentage": 100.0, "type": "no_requirement", "weight": 0.20, "weighted_score": 0.20}
        if candidate_years >= job_min_years:
            score = 1.0
            log_match(f"   Experience: {candidate_years:.2f} >= {job_min_years} → 100%")
        else:
            ratio = candidate_years / job_min_years
            score = 0.5 + (ratio * 0.5)
            score = min(0.85, score)
            log_match(f"   Experience: {candidate_years:.2f} < {job_min_years} → flexible score {score*100:.1f}%")
        return {"score": round(score, 4), "match_percentage": round(score * 100, 1), "type": "general", "candidate_years": round(candidate_years, 2), "job_min_years": job_min_years, "gap": round(max(0, job_min_years - candidate_years), 2), "weight": 0.20, "weighted_score": round(score * 0.20, 4)}


# =====================================================
# FACTOR 4: PREFERENCES MATCHER (15%)
# =====================================================

class Factor4_PreferencesMatcher:
    def __init__(self, tp):
        self.tp = tp
    
    def extract_candidate_preferences(self, profile_data):
        job_prefs = profile_data.get('profile', {}).get('job_preferences', {})
        prefs = {
            "job_types": [jt.lower() for jt in job_prefs.get('preferred_job_types', ['full-time'])],
            "remote_preference": job_prefs.get('remote_work_preference', 'flexible').lower(),
            "locations": [loc.lower() for loc in job_prefs.get('preferred_locations', [])]
        }
        log_candidate(f"   Preferred job types: {prefs['job_types']}")
        log_candidate(f"   Remote preference: {prefs['remote_preference']}")
        log_candidate(f"   Preferred locations: {prefs['locations']}")
        return prefs
    
    def match(self, candidate_prefs, job):
        job_type = job.get('job_type', 'full-time').lower()
        job_remote = job.get('work_arrangement', '').lower()
        
        log_job(f"   Job type: {job_type}")
        log_job(f"   Work arrangement: {job_remote}")
        
        type_scores = [self.tp.local_semantic_similarity(pt, job_type) for pt in candidate_prefs["job_types"]]
        type_match = max(type_scores) if type_scores else 0.5
        
        if job_remote:
            remote_match = self.tp.local_semantic_similarity(candidate_prefs["remote_preference"], job_remote)
        else:
            remote_match = 1.0
        
        location_match = 1.0
        if candidate_prefs["locations"] and job.get('locations'):
            job_locs = []
            for loc in job.get('locations', []):
                if isinstance(loc, dict):
                    job_locs.append(f"{loc.get('city', '')} {loc.get('country', '')}".lower())
            if job_locs:
                best = 0.0
                for pl in candidate_prefs["locations"]:
                    for jl in job_locs:
                        sim = self.tp.local_semantic_similarity(pl, jl)
                        best = max(best, sim)
                location_match = best if best > 0 else 0.5
        
        score = (type_match * 0.4) + (remote_match * 0.3) + (location_match * 0.3)
        log_match(f"   Preferences: type_match={type_match:.2f}, remote_match={remote_match:.2f}, location_match={location_match:.2f} → score={score:.2f}")
        
        return {"score": round(score, 4), "match_percentage": round(score * 100, 1), "weight": 0.15, "weighted_score": round(score * 0.15, 4)}


# =====================================================
# JOB FIELD EXTRACTOR - ALL DATABASE FIELDS
# =====================================================

def extract_all_job_fields(job: Dict) -> Dict:
    locations = job.get('locations', [])
    if isinstance(locations, str):
        try:
            locations = json.loads(locations)
        except:
            locations = []
    
    location_details = []
    for loc in locations:
        if isinstance(loc, dict):
            location_details.append({
                "city": loc.get('city', ''),
                "country": loc.get('country', ''),
                "is_remote": loc.get('is_remote', False),
            })
    
    skills_required = job.get('skills_required', [])
    if isinstance(skills_required, str):
        try:
            skills_required = json.loads(skills_required)
        except:
            skills_required = []
    
    benefits = job.get('benefits', [])
    if isinstance(benefits, str):
        try:
            benefits = json.loads(benefits)
        except:
            benefits = []
    
    return {
        "id": job.get('id', ''),
        "title": job.get('title', 'Unknown'),
        "slug": job.get('slug', ''),
        "department": job.get('department', ''),
        "team": job.get('team', ''),
        "job_type": job.get('job_type', 'full-time'),
        "work_arrangement": job.get('work_arrangement', ''),
        "locations": location_details,
        "description": job.get('description', ''),
        "summary": job.get('summary', ''),
        "responsibilities": job.get('responsibilities', []),
        "requirements": job.get('requirements', []),
        "qualifications": job.get('qualifications', ''),
        "salary_min": float(job.get('salary_min', 0)) if job.get('salary_min') else 0,
        "salary_max": float(job.get('salary_max', 0)) if job.get('salary_max') else 0,
        "salary_currency": job.get('salary_currency', 'USD'),
        "salary_period": job.get('salary_period', 'year'),
        "benefits": benefits,
        "skills_required": skills_required,
        "experience_min": int(job.get('experience_min', 0)) if job.get('experience_min') else 0,
        "experience_max": int(job.get('experience_max', 0)) if job.get('experience_max') else 0,
        "experience_level": job.get('experience_level', ''),
        "education_required": job.get('education_required', {}),
        "tags": job.get('tags', []),
        "status": job.get('status', 'active'),
        "published_at": job.get('published_at', ''),
        "expires_at": job.get('expires_at', ''),
        "created_at": job.get('created_at', ''),
        "view_count": int(job.get('view_count', 0)) if job.get('view_count') else 0,
        "application_count": int(job.get('application_count', 0)) if job.get('application_count') else 0,
        "company": {
            "id": job.get('company_id', ''),
            "name": job.get('company_name', 'Unknown'),
            "slug": job.get('company_slug', ''),
            "industry": job.get('company_industry', ''),
            "size": job.get('company_size', ''),
            "description": job.get('company_description', ''),
            "website": job.get('company_website', ''),
            "logo_url": job.get('company_logo_url', ''),
            "verified": job.get('company_verified', False),
        }
    }


# =====================================================
# BACKEND CLIENT
# =====================================================

class BackendClient:
    def __init__(self):
        self.base_url = BASE_URL
        self.token = None
        self.headers = {"Content-Type": "application/json"}
        self.request_count = 0
        self.error_count = 0
    
    def login(self):
        log_info("🔐 Attempting login...")
        try:
            resp = requests.post(f"{self.base_url}/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=30)
            if resp.status_code == 200:
                data = resp.json()
                if data.get("success"):
                    self.token = data["data"]["token"]
                    self.headers["Authorization"] = f"Bearer {self.token}"
                    log_info("✅ Login successful!")
                    return True
            log_error("❌ Login failed")
            return False
        except Exception as e:
            log_error(f"❌ Login error: {e}")
            return False
    
    def get_profile(self, candidate_id):
        try:
            resp = requests.get(f"{self.base_url}/candidates/full-profile/{candidate_id}", headers=self.headers, timeout=30)
            if resp.status_code == 200:
                return resp.json()
            return None
        except:
            return None
    
    def get_jobs(self):
        try:
            resp = requests.get(f"{self.base_url}/jobs/candidate/list", headers=self.headers, timeout=30)
            if resp.status_code == 200:
                data = resp.json()
                if data.get("success") and data.get("data"):
                    return data["data"].get("data", [])
            return []
        except:
            return []


# =====================================================
# FASTAPI APP
# =====================================================

app = FastAPI(title="4-Factor ML Job Matching API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

backend = BackendClient()
if backend.login():
    log_info("✅ Backend connected!")
else:
    log_error("❌ Backend connection failed!")

# Initialize ML components
log_info("🧠 Initializing 4-Factor ML System...")
ml_start = time.time()
tp = LocalTextProcessor()
factor1 = Factor1_SkillsMatcher(tp)
factor2 = Factor2_QualificationsMatcher(tp)
factor3 = Factor3_ExperienceMatcher(tp)
factor4 = Factor4_PreferencesMatcher(tp)
log_performance("ML System Init", (time.time() - ml_start) * 1000)
log_info("✅ 4-Factor ML System ready!")

log_info("\n📊 FACTOR WEIGHTS:")
log_info("   🔧 SKILLS:         40%")
log_info("   🎓 QUALIFICATIONS: 25%")
log_info("   📅 EXPERIENCE:     20%")
log_info("   ⚙️ PREFERENCES:    15%")
log_info("="*70)


@app.post("/match")
async def match_candidate(request: Request):
    request_start = time.time()
    
    try:
        body = await request.body()
        data = json.loads(body.decode('utf-8'))
        candidate_id = data.get("candidate_id")
        
        log_info(f"👤 Candidate ID: {candidate_id}")
        
        if not candidate_id:
            return {"success": False, "error": "Missing candidate_id"}
        
        # Get candidate profile
        profile_resp = backend.get_profile(candidate_id)
        if not profile_resp:
            return {"success": False, "error": "Candidate not found"}
        
        profile_data = profile_resp.get('data', {})
        
        # =====================================================
        # LOG CANDIDATE SIDE DATA
        # =====================================================
        log_candidate("="*60)
        log_candidate("CANDIDATE PROFILE DATA")
        log_candidate("="*60)
        
        # Extract candidate data
        candidate_skills = factor1.extract_candidate_skills(profile_data)
        candidate_quals = factor2.extract_candidate_qualifications(profile_data)
        candidate_exp_list = factor3.extract_candidate_experience(profile_data)
        candidate_total_exp = factor3.calculate_total_experience(profile_data)
        candidate_prefs = factor4.extract_candidate_preferences(profile_data)
        
        personal = profile_data.get('profile', {}).get('personal_info', {})
        candidate_name = personal.get('full_name', 'Unknown')
        
        log_candidate(f"Name: {candidate_name}")
        log_candidate(f"Total Experience: {candidate_total_exp:.2f} years")
        log_candidate(f"Skills ({len(candidate_skills)}): {', '.join(candidate_skills)}")
        log_candidate(f"Degrees: {[d['raw'] for d in candidate_quals['degrees']]}")
        log_candidate(f"Fields: {[f['raw'] for f in candidate_quals['fields']]}")
        log_candidate(f"Preferred Job Types: {candidate_prefs['job_types']}")
        log_candidate(f"Remote Preference: {candidate_prefs['remote_preference']}")
        log_candidate(f"Preferred Locations: {candidate_prefs['locations']}")
        
        # Get jobs
        jobs = backend.get_jobs()
        log_info(f"📊 Jobs found: {len(jobs)}")
        
        results = []
        
        for idx, job in enumerate(jobs):
            job_title = job.get('title', 'Unknown')
            
            # =====================================================
            # LOG JOB SIDE DATA
            # =====================================================
            log_job("="*60)
            log_job(f"JOB {idx+1}: {job_title}")
            log_job("="*60)
            
            # Extract job data
            job_details = extract_all_job_fields(job)
            job_skills = factor1.extract_job_skills(job)
            job_quals = factor2.extract_job_qualifications(job)
            job_specific_exp = factor3.extract_job_specific_requirements(job)
            job_min_years = job_details.get('experience_min', 0) or 0
            
            log_job(f"Title: {job_title}")
            log_job(f"Company: {job.get('company_name', 'Unknown')}")
            log_job(f"Required Skills ({len(job_skills)}): {', '.join(job_skills)}")
            log_job(f"Required Degree: {job_quals['minimum_degree']}")
            log_job(f"Required Fields: {job_quals['fields_of_study']}")
            log_job(f"Experience Required: {job_min_years}+ years")
            log_job(f"Job Type: {job_details.get('job_type', 'full-time')}")
            log_job(f"Work Arrangement: {job_details.get('work_arrangement', '')}")
            
            # =====================================================
            # LOG MATCHING PROCESS
            # =====================================================
            log_match("="*60)
            log_match(f"MATCHING: {candidate_name} vs {job_title}")
            log_match("="*60)
            log_match("FACTOR 1: SKILLS (40%)")
            
            # Calculate 4 factors
            s = factor1.match(candidate_skills, job_skills)
            log_match(f"   Skills match: {s['match_percentage']}% ({s['matched_count']}/{s['total_job_skills']} matched)")
            
            log_match("FACTOR 2: QUALIFICATIONS (25%)")
            q = factor2.match(candidate_quals, job_quals)
            log_match(f"   Qualifications match: {q['match_percentage']}%")
            
            log_match("FACTOR 3: EXPERIENCE (20%)")
            e = factor3.match(candidate_exp_list, job_specific_exp, candidate_total_exp, job_min_years)
            log_match(f"   Experience match: {e['match_percentage']}%")
            
            log_match("FACTOR 4: PREFERENCES (15%)")
            p = factor4.match(candidate_prefs, job)
            log_match(f"   Preferences match: {p['match_percentage']}%")
            
            # Total score
            total_raw = s["weighted_score"] + q["weighted_score"] + e["weighted_score"] + p["weighted_score"]
            total_score = round(total_raw * 100, 1)
            
            log_match("="*60)
            log_match(f"TOTAL MATCH SCORE: {total_score}%")
            log_match(f"   Skills (40%): {s['match_percentage']}% → {s['weighted_score']*100:.1f} pts")
            log_match(f"   Qualifications (25%): {q['match_percentage']}% → {q['weighted_score']*100:.1f} pts")
            log_match(f"   Experience (20%): {e['match_percentage']}% → {e['weighted_score']*100:.1f} pts")
            log_match(f"   Preferences (15%): {p['match_percentage']}% → {p['weighted_score']*100:.1f} pts")
            log_match("="*60)
            
            # Match level
            if total_raw >= 0.80:
                match_level = "Excellent Match 🌟"
                stars = "⭐⭐⭐⭐⭐"
                recommendation = "Strongly recommended - Apply now!"
            elif total_raw >= 0.65:
                match_level = "Strong Match ✅"
                stars = "⭐⭐⭐⭐"
                recommendation = "Recommended - Good fit"
            elif total_raw >= 0.50:
                match_level = "Good Match 👍"
                stars = "⭐⭐⭐"
                recommendation = "Consider applying"
            elif total_raw >= 0.35:
                match_level = "Partial Match ⚠️"
                stars = "⭐⭐"
                recommendation = "Review requirements"
            else:
                match_level = "Poor Match ❌"
                stars = "⭐"
                recommendation = "Not recommended"
            
            results.append({
                "match_score": total_score,
                "match_stars": stars,
                "match_level": match_level,
                "match_recommendation": recommendation,
                "criteria_scores": {
                    "skills_match": s["match_percentage"],
                    "qualifications_match": q["match_percentage"],
                    "experience_match": e["match_percentage"],
                    "preferences_match": p["match_percentage"]
                },
                "skills_breakdown": {
                    "matched_skills": s["matched_skills"],
                    "missing_skills": [js for js in job_skills if js not in s["matched_skills"]],
                    "total_required": len(job_skills),
                    "total_matched": s["matched_count"]
                },
                "qualifications_breakdown": {
                    "candidate_degrees": [d["raw"] for d in candidate_quals["degrees"]],
                    "candidate_fields": [f["raw"] for f in candidate_quals["fields"]],
                    "job_degree_required": job_quals["minimum_degree"],
                    "degree_similarity": q.get("degree_similarity", 0),
                    "field_similarity": q.get("field_similarity", 0)
                },
                "experience_breakdown": {
                    "candidate_years": candidate_total_exp,
                    "job_min_years": job_min_years,
                    "gap_years": e.get("gap", 0)
                },
                "job": job_details,
                "company": job_details.get("company", {})
            })
            
            log_info(f"   ✓ Score: {total_score}% - {match_level}")
        
        # Sort by match score
        results.sort(key=lambda x: x['match_score'], reverse=True)
        
        total_duration = (time.time() - request_start) * 1000
        log_info(f"⏱️ Total time: {total_duration:.2f}ms")
        log_request("/match", candidate_id, total_duration, "200")
        
        # =====================================================
        # LOG FINAL SUMMARY
        # =====================================================
        log_match("\n" + "="*70)
        log_match("FINAL MATCHING SUMMARY")
        log_match("="*70)
        for i, r in enumerate(results):
            log_match(f"{i+1}. {r['job']['title']}: {r['match_score']}% - {r['match_level']}")
        log_match("="*70)
        
        cache_stats = tp.get_cache_stats()
        
        return {
            "success": True,
            "candidate": {
                "id": candidate_id,
                "name": candidate_name,
                "experience_years": candidate_total_exp,
                "skills_count": len(candidate_skills),
                "skills": candidate_skills,
                "degrees": [d["raw"] for d in candidate_quals["degrees"]],
                "fields": [f["raw"] for f in candidate_quals["fields"]],
                "preferred_job_types": candidate_prefs["job_types"],
                "remote_preference": candidate_prefs["remote_preference"]
            },
            "total_jobs_matched": len(results),
            "matches": results,
            "timestamp": datetime.now().isoformat(),
            "performance": {
                "total_ms": round(total_duration, 2),
                "jobs_processed": len(results),
                "cache_hits": cache_stats['hits'],
                "cache_misses": cache_stats['misses']
            }
        }
        
    except Exception as e:
        import traceback
        log_error(f"ERROR: {e}")
        log_error(traceback.format_exc())
        return {"success": False, "error": str(e)}


@app.get("/")
async def root():
    return {
        "api": "4-Factor ML Job Matching API",
        "version": "7.0.0",
        "status": "running",
        "factors": {
            "skills": {"weight": "40%", "description": "Semantic skill matching"},
            "qualifications": {"weight": "25%", "description": "Degree + field matching"},
            "experience": {"weight": "20%", "description": "Flexible years matching"},
            "preferences": {"weight": "15%", "description": "Job type + remote matching"}
        }
    }


@app.get("/health")
async def health():
    return {"status": "healthy", "ml_ready": True}


@app.get("/stats")
async def get_stats():
    cache_stats = tp.get_cache_stats()
    return {
        "success": True,
        "ml_cache_stats": cache_stats,
        "log_directory": str(LOG_DIR)
    }


@app.get("/logs/{log_type}")
async def view_log(log_type: str, lines: int = 100):
    log_map = {
        "main": MAIN_LOG,
        "error": ERROR_LOG,
        "performance": PERFORMANCE_LOG,
        "requests": REQUEST_LOG,
        "ml": ML_LOG,
        "candidate": CANDIDATE_LOG,
        "job": JOB_LOG,
        "match": MATCH_LOG
    }
    log_file = log_map.get(log_type)
    if not log_file or not log_file.exists():
        return {"success": False, "error": f"Log {log_type} not found"}
    try:
        with open(log_file, "r", encoding="utf-8") as f:
            all_lines = f.readlines()
            last_lines = all_lines[-lines:] if len(all_lines) > lines else all_lines
        return {"success": True, "log_type": log_type, "lines": len(last_lines), "content": "".join(last_lines)}
    except Exception as e:
        return {"success": False, "error": str(e)}


if __name__ == "__main__":
    print("\n" + "="*70)
    print("🚀 4-FACTOR ML JOB MATCHING API")
    print("="*70)
    print("✅ Full logging of candidate side, job side, and matching results")
    print("✅ Log files:")
    print(f"   • {CANDIDATE_LOG} - Candidate data")
    print(f"   • {JOB_LOG} - Job data")
    print(f"   • {MATCH_LOG} - Matching results")
    print(f"   • {ML_LOG} - ML operations")
    print("="*70)
    print("\n🌐 Server: http://localhost:8000")
    print("📤 POST to /match with:")
    print('{"candidate_id": "17296b7f-7843-42ed-a074-3a69732f0f07"}')
    print("\n📊 View logs: GET /logs/candidate, /logs/job, /logs/match")
    print("="*70 + "\n")
    
    uvicorn.run(app, host="0.0.0.0", port=8000)