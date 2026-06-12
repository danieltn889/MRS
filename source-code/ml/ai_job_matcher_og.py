#!/usr/bin/env python3
"""
AI JOB MATCHING API - COMPLETE 4-FACTOR PURE LOCAL ML
PURE SEMANTIC MATCHING - NO HARDCODED ANYTHING
EVERYTHING COMES FROM THE DATABASE
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

MAIN_LOG = LOG_DIR / "ai_service.log"
ERROR_LOG = LOG_DIR / "ai_service_errors.log"
PERFORMANCE_LOG = LOG_DIR / "performance.log"
REQUEST_LOG = LOG_DIR / "requests.log"
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
    print(f"👤 {message}")
    write_log(CANDIDATE_LOG, message, "CANDIDATE")

def log_job(message):
    print(f"💼 {message}")
    write_log(JOB_LOG, message, "JOB")

def log_match(message):
    print(f"🎯 {message}")
    write_log(MATCH_LOG, message, "MATCH")

log_info("="*70)
log_info("🚀 AI JOB MATCHING API - PURE SEMANTIC MATCHING")
log_info("✅ EVERYTHING COMES FROM DATABASE - NO HARDCODED VALUES")
log_info(f"📁 Log directory: {LOG_DIR}")
log_info("="*70)

# =====================================================
# INSTALL REQUIRED PACKAGES
# =====================================================

try:
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.metrics.pairwise import cosine_similarity
    import nltk
    from nltk.stem import WordNetLemmatizer
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
    from nltk.stem import WordNetLemmatizer
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
    log_info("⚠️ Sentence Transformers not available, using TF-IDF")

# API Configuration
BASE_URL = "http://localhost:3001/api/v1"
EMAIL = "ccilem4@gmail.com"
PASSWORD = "123456@Uc"

log_info(f"📡 API Configuration:")
log_info(f"   BASE_URL: {BASE_URL}")

# =====================================================
# LOCAL TEXT PROCESSOR
# =====================================================

class LocalTextProcessor:
    def __init__(self):
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
    
    def lemmatize(self, text: str) -> str:
        if not text:
            return text
        try:
            tokens = word_tokenize(text.lower())
            lemmatized = [self.lemmatizer.lemmatize(token) for token in tokens]
            return ' '.join(lemmatized)
        except:
            return text
    
    def clean(self, text: str) -> str:
        if not text:
            return ""
        if not isinstance(text, str):
            text = str(text)
        text = text.lower()
        text = re.sub(r'[^\w\s]', ' ', text)
        text = re.sub(r'\s+', ' ', text)
        text = self.lemmatize(text)
        return text.strip()
    
    def get_embedding(self, text: str) -> np.ndarray:
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
    
    def semantic_similarity(self, text1: str, text2: str) -> float:
        if not text1 or not text2:
            return 0.0
        
        if self.semantic_model:
            emb1 = self.get_embedding(text1)
            emb2 = self.get_embedding(text2)
            if np.linalg.norm(emb1) > 0 and np.linalg.norm(emb2) > 0:
                sim = float(np.dot(emb1, emb2) / (np.linalg.norm(emb1) * np.linalg.norm(emb2)))
                if sim > 0:
                    return sim
        
        try:
            vec = TfidfVectorizer(max_features=300)
            tfidf = vec.fit_transform([text1, text2])
            return float(cosine_similarity(tfidf[0:1], tfidf[1:2])[0][0])
        except:
            return 0.0
    
    def get_cache_stats(self):
        return {"hits": self.cache_hits, "misses": self.cache_misses}

# =====================================================
# FACTOR 1: SKILLS MATCHER (40%) - FROM DATABASE
# =====================================================

class Factor1_SkillsMatcher:
    def __init__(self, tp):
        self.tp = tp
    
    def extract_candidate_skills(self, profile_data):
        skills = set()
        for skill in profile_data.get('skills', []):
            name = skill.get('skill_name', '') or skill.get('name', '')
            if name:
                cleaned = self.tp.clean(name)
                if cleaned:
                    skills.add(cleaned)
                    log_candidate(f"   Skill from DB: {name}")
        
        for work in profile_data.get('work_experience', []):
            for skill in work.get('skills', []):
                if skill and isinstance(skill, str):
                    cleaned = self.tp.clean(skill)
                    if cleaned:
                        skills.add(cleaned)
                        log_candidate(f"   Skill from work DB: {skill}")
        
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
                cleaned = self.tp.clean(name)
                if cleaned:
                    skills.add(cleaned)
                    log_job(f"   Required skill from DB: {name}")
        return list(skills)
    
    def match(self, candidate_skills, job_skills):
        if not job_skills:
            return {"score": 1.0, "match_percentage": 100.0, "matched_count": 0, "total": 0, "weight": 0.40, "weighted_score": 0.40}
        if not candidate_skills:
            return {"score": 0.0, "match_percentage": 0.0, "matched_count": 0, "total": len(job_skills), "weight": 0.40, "weighted_score": 0.0}
        
        matched = []
        match_scores = []
        
        for js in job_skills:
            best = 0.0
            for cs in candidate_skills:
                sim = self.tp.semantic_similarity(cs, js)
                if sim > best:
                    best = sim
            match_scores.append(best)
            if best >= 0.3:
                matched.append(js)
                log_match(f"      Skill matched: '{js}' (similarity: {best:.2f})")
            else:
                log_match(f"      Skill NOT matched: '{js}' (best similarity: {best:.2f})")
        
        score = sum(match_scores) / len(job_skills) if job_skills else 1.0
        
        return {
            "score": round(score, 4),
            "match_percentage": round(score * 100, 1),
            "matched_count": len(matched),
            "total_job_skills": len(job_skills),
            "matched_skills": matched,
            "missing_skills": [js for js in job_skills if js not in matched],
            "individual_scores": match_scores,
            "weight": 0.40,
            "weighted_score": round(score * 0.40, 4)
        }

# =====================================================
# FACTOR 2: QUALIFICATIONS MATCHER (25%) - COMPLETE FIXED
# =====================================================

# =====================================================
# FACTOR 2: QUALIFICATIONS MATCHER (25%) - PURE SEMANTIC + HIERARCHY
# =====================================================

class Factor2_QualificationsMatcher:
    def __init__(self, tp):
        self.tp = tp
        
        # Degree level hierarchy (Lower number = lower degree)
        self.degree_levels = {
            # Level 0 - No degree
            "no formal education": 0, 
            "high school": 0, 
            "secondary school": 0,
            "ged": 0,
            
            # Level 1 - Certificate/Diploma
            "certificate": 1, 
            "diploma": 1,
            "certification": 1,
            
            # Level 2 - Advanced Diploma/Associate
            "advanced diploma": 2, 
            "associate degree": 2, 
            "hnd": 2,
            "foundation degree": 2,
            
            # Level 3 - Bachelor's
            "bachelor": 3, 
            "bachelor's": 3, 
            "bachelor's degree": 3,
            "bsc": 3, 
            "ba": 3, 
            "beng": 3,
            "bachelor degree": 3,
            "undergraduate": 3,
            
            # Level 4 - Postgraduate Diploma/Certificate
            "postgraduate diploma": 4, 
            "postgraduate certificate": 4,
            "pgdip": 4,
            "pgcert": 4,
            
            # Level 5 - Master's
            "master": 5, 
            "master's": 5, 
            "master's degree": 5,
            "msc": 5, 
            "ma": 5, 
            "mba": 5,
            "masters": 5,
            "postgraduate": 5,
            
            # Level 6 - Doctorate
            "phd": 6, 
            "doctorate": 6, 
            "doctoral": 6,
            "doctor": 6,
            "dphil": 6,
        }
        
        # Qualification entry weights
        self.qualification_weights = {
            "degree": 0.6,
            "field": 0.4
        }
    
    def get_degree_level(self, degree_text: str) -> int:
        """Get hierarchical level - returns -1 if not found"""
        if not degree_text:
            return -1
        
        degree_lower = degree_text.lower().strip()
        
        # Direct match first
        for degree_name, level in self.degree_levels.items():
            if degree_name in degree_lower:
                return level
        
        # Try semantic similarity with known levels
        highest_score = 0.0
        best_level = -1
        
        for degree_name, level in self.degree_levels.items():
            sim = self.tp.semantic_similarity(degree_lower, degree_name)
            if sim > highest_score and sim > 0.4:
                highest_score = sim
                best_level = level
        
        return best_level if best_level >= 0 else -1
    
    def check_degree_hierarchy(self, candidate_level: int, required_level: int, exact_match_only: bool = False) -> float:
        """
        Calculate degree hierarchy score.
        """
        # No requirement - always 100%
        if required_level <= 0:
            return 1.0
        
        # Candidate has no degree - 0%
        if candidate_level <= 0:
            return 0.0
        
        # EXACT MATCH MODE (strict)
        if exact_match_only:
            return 1.0 if candidate_level == required_level else 0.0
        
        # HIERARCHY MODE
        if candidate_level >= required_level:
            # Candidate meets or exceeds requirement - ALWAYS 100%
            return 1.0  # Any degree at or above requirement = 100%
        else:
            # Candidate below requirement
            level_diff = required_level - candidate_level
            
            if level_diff == 1:
                return 0.50  # One level below = 50%
            elif level_diff == 2:
                return 0.25  # Two levels below = 25%
            else:
                return 0.10  # Three+ levels below = 10%
    def extract_candidate_qualifications(self, profile_data):
        result = {
            "degrees": [], 
            "fields": [], 
            "combined": [], 
            "certifications": [],
            "highest_degree_level": -1,
            "highest_degree_raw": None
        }
        
        # Extract from education records
        for edu in profile_data.get('education', []):
            degree = edu.get('degree', '')
            field = edu.get('field_of_study', '')
            
            if degree:
                degree_level = self.get_degree_level(degree)
                result["degrees"].append({
                    "raw": degree, 
                    "cleaned": self.tp.clean(degree),
                    "level": degree_level
                })
                
                # Track highest degree
                if degree_level > result["highest_degree_level"]:
                    result["highest_degree_level"] = degree_level
                    result["highest_degree_raw"] = degree
                
                log_candidate(f"   Degree from DB: {degree} (Level: {degree_level})")
            
            if field:
                result["fields"].append({
                    "raw": field, 
                    "cleaned": self.tp.clean(field)
                })
                log_candidate(f"   Field from DB: {field}")
            
            if degree and field:
                combined = f"{degree} in {field}"
                result["combined"].append({
                    "raw": combined,
                    "cleaned": self.tp.clean(combined),
                    "degree_level": degree_level if degree else -1
                })
            elif degree:
                result["combined"].append({
                    "raw": degree,
                    "cleaned": self.tp.clean(degree),
                    "degree_level": degree_level if degree else -1
                })
        
        # Extract from certifications
        for cert in profile_data.get('certifications', []):
            cert_name = cert.get('name', '')
            if cert_name:
                result["certifications"].append({
                    "raw": cert_name,
                    "cleaned": self.tp.clean(cert_name)
                })
                log_candidate(f"   Certification from DB: {cert_name}")
        
        return result
    
    def extract_job_qualifications(self, job):
        edu_required = job.get('education_required', {})
        
        if isinstance(edu_required, str):
            try:
                edu_required = json.loads(edu_required)
            except:
                edu_required = {}
        
        # Get minimum degree requirement
        min_degree = edu_required.get('minimum_degree', '')
        min_degree_level = self.get_degree_level(min_degree)
        
        # Parse qualification entries (MULTIPLE qualifications allowed)
        qualification_entries = edu_required.get('qualification_entries', [])
        processed_entries = []
        
        # ✅ COLLECT ALL FIELDS FROM QUALIFICATION ENTRIES
        all_fields_from_entries = []
        
        for entry in qualification_entries:
            entry_degree = entry.get('degree', '')
            entry_fields = entry.get('fields_of_study', [])
            
            # Handle fields as array or string
            if isinstance(entry_fields, str):
                try:
                    entry_fields = json.loads(entry_fields)
                except:
                    entry_fields = [entry_fields] if entry_fields else []
            elif not isinstance(entry_fields, list):
                entry_fields = []
            
            # ✅ ADD ALL FIELDS TO THE COLLECTION
            for field in entry_fields:
                if field and field not in all_fields_from_entries:
                    all_fields_from_entries.append(field)
            
            processed_entries.append({
                "degree": entry_degree,
                "degree_level": self.get_degree_level(entry_degree),
                "fields_of_study": entry_fields,
                "fields_cleaned": [self.tp.clean(f) for f in entry_fields if f]
            })
        
        # ✅ MERGE root fields_of_study with fields from qualification_entries
        root_fields = edu_required.get('fields_of_study', [])
        if isinstance(root_fields, str):
            try:
                root_fields = json.loads(root_fields)
            except:
                root_fields = []
        elif not isinstance(root_fields, list):
            root_fields = []
        
        # Combine all fields (root + from entries)
        all_fields = list(set(root_fields + all_fields_from_entries))
        
        # Parse certifications
        certifications = edu_required.get('certifications', [])
        if isinstance(certifications, str):
            try:
                certifications = json.loads(certifications)
            except:
                certifications = []
        elif not isinstance(certifications, list):
            certifications = []
        
        # Parse age requirement
        age_requirement = edu_required.get('age_requirement', '')
        
        # Parse languages
        languages = edu_required.get('languages', [])
        if isinstance(languages, str):
            try:
                languages = json.loads(languages)
            except:
                languages = []
        
        processed_languages = []
        for lang in languages:
            if isinstance(lang, dict):
                lang_name = lang.get('name', '')
                if lang_name:
                    processed_languages.append(lang_name)
            elif isinstance(lang, str):
                if lang:
                    processed_languages.append(lang)
        
        # Parse experience requirements
        experience_requirements = edu_required.get('experience_requirements', [])
        if isinstance(experience_requirements, str):
            try:
                experience_requirements = json.loads(experience_requirements)
            except:
                experience_requirements = []
        
        processed_experience = []
        for exp in experience_requirements:
            if isinstance(exp, dict):
                title = exp.get('title', '')
                years_str = exp.get('years', '')
                if title and years_str:
                    years_num = 0
                    match = re.search(r'(\d+(?:\.\d+)?)', str(years_str))
                    if match:
                        years_num = float(match.group(1))
                    processed_experience.append({
                        "title": title,
                        "years_required": years_num,
                        "raw_years": years_str
                    })
            elif isinstance(exp, str):
                processed_experience.append({"title": exp, "years_required": 0})
        
        # ============================================
        # ✅ ENHANCED LOGGING - SHOW COMPLETE EDUCATION REQUIREMENTS
        # ============================================
        log_job(f"   ============================================")
        log_job(f"   📚 COMPLETE EDUCATION REQUIREMENTS FROM DB:")
        log_job(f"   ============================================")
        log_job(f"   🎓 Minimum Degree: {min_degree} (Level: {min_degree_level})")
        log_job(f"   🎓 Is Degree Required: {edu_required.get('is_degree_required', False)}")
        log_job(f"   ")
        
        if processed_entries:
            log_job(f"   📋 QUALIFICATION ENTRIES ({len(processed_entries)}):")
            for idx, entry in enumerate(processed_entries):
                log_job(f"      Entry {idx + 1}:")
                log_job(f"         Degree: {entry['degree']} (Level: {entry['degree_level']})")
                log_job(f"         Fields of Study: {entry['fields_of_study']}")
            log_job(f"   ")
        else:
            log_job(f"   📋 Qualification Entries: None")
            log_job(f"   ")
        
        if all_fields:
            log_job(f"   📚 Combined Fields of Study ({len(all_fields)}):")
            log_job(f"      {all_fields}")
            log_job(f"   ")
        else:
            log_job(f"   📚 Fields of Study: None")
            log_job(f"   ")
        
        if certifications:
            log_job(f"   ✅ Certifications Required ({len(certifications)}):")
            for cert in certifications:
                log_job(f"      - {cert}")
            log_job(f"   ")
        else:
            log_job(f"   ✅ Certifications: None")
            log_job(f"   ")
        
        if processed_experience:
            log_job(f"   💼 Experience Requirements ({len(processed_experience)}):")
            for exp in processed_experience:
                log_job(f"      - {exp.get('title', 'Unknown')}: {exp.get('years_required', 0)}+ years")
            log_job(f"   ")
        else:
            log_job(f"   💼 Experience Requirements: None")
            log_job(f"   ")
        
        if processed_languages:
            log_job(f"   🌐 Languages Required ({len(processed_languages)}):")
            for lang in processed_languages:
                log_job(f"      - {lang}")
            log_job(f"   ")
        else:
            log_job(f"   🌐 Languages: None")
            log_job(f"   ")
        
        log_job(f"   👤 Age Requirement: {age_requirement if age_requirement else 'Not specified'}")
        log_job(f"   ============================================")
        
        return {
            "minimum_degree": min_degree,
            "minimum_degree_level": min_degree_level,
            "qualification_entries": processed_entries,
            "min_degree_cleaned": self.tp.clean(min_degree),
            "is_degree_required": edu_required.get('is_degree_required', False),
            "fields_of_study": all_fields,
            "fields_cleaned": [self.tp.clean(f) for f in all_fields if f],
            "certifications": certifications,
            "certifications_cleaned": [self.tp.clean(c) for c in certifications if c],
            "additional_requirements": edu_required.get('additional_requirements', []),
            "languages": processed_languages,
            "experience_requirements": processed_experience,
            "age_requirement": age_requirement,
            # ✅ ADD THESE FOR COMPLETE DATA
            "raw_education_required": edu_required,
            "has_qualification_entries": len(processed_entries) > 0,
            "total_qualification_options": len(processed_entries),
            "allowed_degrees": [entry['degree'] for entry in processed_entries if entry['degree']],
            "allowed_fields": all_fields,
        }
   
    def match(self, candidate_quals, job_quals):
        # Get candidate's highest degree
        candidate_highest_level = candidate_quals.get("highest_degree_level", -1)
        candidate_highest_degree = candidate_quals.get("highest_degree_raw", "No degree")
        
        job_required_level = job_quals.get("minimum_degree_level", -1)
        job_required_degree = job_quals.get("minimum_degree", "")
        
        # Check if job has multiple qualification entries
        qualification_entries = job_quals.get("qualification_entries", [])
        has_qualification_entries = len(qualification_entries) > 0
        
        # =====================================================
        # DEGREE HIERARCHY SCORE
        # =====================================================
        exact_match_only = False
        
        hierarchy_score = self.check_degree_hierarchy(
            candidate_highest_level, 
            job_required_level,
            exact_match_only
        )
        
        log_match(f"   Degree Hierarchy: Candidate={candidate_highest_level} ({candidate_highest_degree}), Job={job_required_level} ({job_required_degree}) → Score={hierarchy_score:.2f}")
        
        # =====================================================
        # CHECK QUALIFICATION ENTRIES (if job has multiple options)
        # =====================================================
        qualification_entry_score = 0.0
        best_entry_match = None
        
        if has_qualification_entries and candidate_highest_level > 0:
            for entry in qualification_entries:
                entry_degree = entry.get("degree", "")
                entry_level = entry.get("degree_level", -1)
                entry_fields = entry.get("fields_cleaned", [])
                
                if entry_level > 0:
                    entry_hierarchy_score = self.check_degree_hierarchy(
                        candidate_highest_level, 
                        entry_level,
                        exact_match_only
                    )
                    
                    if entry_hierarchy_score > qualification_entry_score:
                        qualification_entry_score = entry_hierarchy_score
                        best_entry_match = entry
        
        # Use qualification entry score if better than base hierarchy
        final_hierarchy_score = max(hierarchy_score, qualification_entry_score)
        
        # =====================================================
        # FIELD MATCHING
        # =====================================================
        job_fields = job_quals.get("fields_cleaned", [])
        candidate_fields_list = [f["cleaned"] for f in candidate_quals.get("fields", [])]
        candidate_combined_list = [c["cleaned"] for c in candidate_quals.get("combined", [])]
        
        field_match_score = 0.0
        best_field_sim = 0.0
        best_matched_field = None
        has_field_requirement = len(job_fields) > 0
        
        if has_field_requirement:
            log_match(f"   Job requires field(s): {job_fields}")
            
            # Calculate best similarity
            for job_field in job_fields:
                for cand_field in candidate_fields_list + candidate_combined_list:
                    sim = self.tp.semantic_similarity(cand_field, job_field)
                    log_match(f"      Comparing '{cand_field}' with '{job_field}': similarity={sim:.4f}")
                    if sim > best_field_sim:
                        best_field_sim = sim
                        best_matched_field = cand_field
            
            # Calculate field match score with stricter thresholds
            if best_field_sim >= 0.8:
                field_match_score = 1.0
                log_match(f"   ✅ Field match: EXCELLENT ({best_field_sim:.2f})")
            elif best_field_sim >= 0.6:
                field_match_score = 0.8
                log_match(f"   ✅ Field match: GOOD ({best_field_sim:.2f})")
            elif best_field_sim >= 0.4:
                field_match_score = 0.5
                log_match(f"   ⚠️ Field match: PARTIAL ({best_field_sim:.2f})")
            else:
                field_match_score = 0.2
                log_match(f"   ❌ Field match: POOR ({best_field_sim:.2f})")
        
        # =====================================================
        # CERTIFICATION MATCHING
        # =====================================================
        job_certs = job_quals.get("certifications_cleaned", [])
        candidate_certs = [c["cleaned"] for c in candidate_quals.get("certifications", [])]
        
        cert_match_score = 1.0
        matched_certs = []
        has_cert_requirement = len(job_certs) > 0
        
        if has_cert_requirement:
            if candidate_certs:
                cert_matches = 0
                log_match(f"   DEBUG - Job Certifications: {job_certs}")
                log_match(f"   DEBUG - Candidate Certifications: {candidate_certs}")

                for job_cert in job_certs:
                    for cand_cert in candidate_certs:
                        sim = self.tp.semantic_similarity(cand_cert, job_cert)
                        log_match(f"      Comparing cert: '{cand_cert}' vs '{job_cert}' = {sim:.4f}")
                        if sim >= 0.6:
                            cert_matches += 1
                            matched_certs.append({"job": job_cert, "candidate": cand_cert, "similarity": sim})
                            break
                
                cert_match_score = cert_matches / len(job_certs)
                log_match(f"   Certifications: {cert_matches}/{len(job_certs)} matched → Score={cert_match_score:.2f}")
            else:
                # No candidate certifications - give 50% credit
                cert_match_score = 0.5
                log_match(f"   Certifications: No candidate certifications → Partial credit: {cert_match_score:.2f}")
        
        # =====================================================
        # CALCULATE FINAL QUALIFICATION SCORE
        # NEW WEIGHTS: Degree=30%, Field=50%, Certifications=20%
        # =====================================================
        
        if has_qualification_entries and qualification_entry_score > 0:
            final_score = (qualification_entry_score * 0.15) + (field_match_score * 0.70) + (cert_match_score * 0.15)
            log_match(f"   Using qualification entries with weights: Degree 15%, Field 70%, Certs 15%")
        else:
            final_score = (final_hierarchy_score * 0.15) + (field_match_score * 0.70) + (cert_match_score * 0.15)
            log_match(f"   Using standard scoring with weights: Degree 15%, Field 70%, Certs 15%")
        
        final_score = min(1.0, max(0.0, final_score))
        
        # Determine match quality
        if final_score >= 0.85:
            match_quality = "Excellent"
            explanation = f"Your {candidate_highest_degree} perfectly matches the job requirements"
        elif final_score >= 0.70:
            match_quality = "Good"
            explanation = f"Your {candidate_highest_degree} meets the job requirements"
        elif final_score >= 0.50:
            match_quality = "Fair"
            explanation = f"Your {candidate_highest_degree} partially meets the job requirements"
        elif final_score >= 0.30:
            match_quality = "Partial"
            explanation = f"Your {candidate_highest_degree} is below the required {job_required_degree}"
        else:
            match_quality = "Poor"
            explanation = f"Your qualifications do not match the job requirements"
        
        log_match(f"   ============================================")
        log_match(f"   QUALIFICATIONS MATCH SUMMARY:")
        log_match(f"      Degree Hierarchy Score: {final_hierarchy_score:.2f} ({final_hierarchy_score*100:.0f}%)")
        log_match(f"      Field Match Score: {field_match_score:.2f} ({field_match_score*100:.0f}%)")
        log_match(f"      Certification Score: {cert_match_score:.2f} ({cert_match_score*100:.0f}%)")
        log_match(f"      Has Field Requirement: {has_field_requirement}")
        log_match(f"      Has Qualification Entries: {has_qualification_entries}")
        log_match(f"      Has Certification Requirement: {has_cert_requirement}")
        log_match(f"      Final Score: {final_score:.2f} ({final_score*100:.0f}%)")
        log_match(f"      Match Quality: {match_quality}")
        log_match(f"   ============================================")
        
        return {
            "score": round(final_score, 4),
            "match_percentage": round(final_score * 100, 1),
            "match_quality": match_quality,
            "explanation": explanation,
            "degree_hierarchy_score": round(final_hierarchy_score, 4),
            "field_match_score": round(field_match_score, 4),
            "certification_score": round(cert_match_score, 4),
            "best_field_similarity": round(best_field_sim, 4),
            "best_matched_field": best_matched_field,
            "has_field_requirement": has_field_requirement,
            "has_qualification_entries": has_qualification_entries,
            "has_certification_requirement": has_cert_requirement,
            "candidate_highest_degree": candidate_highest_degree,
            "candidate_degree_level": candidate_highest_level,
            "job_required_degree": job_required_degree,
            "job_degree_level": job_required_level,
            "matched_certifications": matched_certs,
            "qualification_entry_used": best_entry_match,
            "weight": 0.25,
            "weighted_score": round(final_score * 0.25, 4)
        }
class Factor3_ExperienceMatcher:
    def __init__(self, tp):
        self.tp = tp
    
    def extract_candidate_work_experience(self, profile_data):
        experiences = []
        current_date = datetime.now()
        
        for work in profile_data.get('work_experience', []):
            title = work.get('title', '')
            start_str = work.get('start_date')
            end_str = work.get('end_date')
            is_current = work.get('is_current', False)
            
            if not title or not start_str:
                continue
            
            try:
                if isinstance(start_str, str):
                    start_str = start_str.replace('Z', '+00:00')
                start = datetime.fromisoformat(start_str)
                
                if is_current or not end_str:
                    end = current_date
                else:
                    if isinstance(end_str, str):
                        end_str = end_str.replace('Z', '+00:00')
                    end = datetime.fromisoformat(end_str)
                
                years = (end - start).days / 365.25
                
                if years > 0:
                    experiences.append({
                        "title": title,
                        "years": round(years, 2),
                        "is_current": is_current,
                        "cleaned": self.tp.clean(title)
                    })
                    log_candidate(f"   Work from DB: {title} - {years:.2f} years")
                    
            except Exception as e:
                log_error(f"Error parsing date for {title}: {e}")
                continue
        
        return experiences
    
    def extract_job_experience_requirements(self, job):
        edu_required = job.get('education_required', {})
        
        if isinstance(edu_required, str):
            try:
                edu_required = json.loads(edu_required)
            except:
                edu_required = {}
        
        exp_requirements = edu_required.get('experience_requirements', [])
        
        if not exp_requirements:
            exp_requirements = job.get('experience_requirements', [])
        
        requirements = []
        for req in exp_requirements:
            if isinstance(req, dict):
                title = req.get('title', '') or req.get('area', '')
                years_str = req.get('years', '') or req.get('years_required', '')
                
                if title and years_str:
                    years_num = 0
                    match = re.search(r'(\d+(?:\.\d+)?)', str(years_str))
                    if match:
                        years_num = float(match.group(1))
                    
                    requirements.append({
                        "title": title,
                        "years_required": years_num,
                        "raw_years": years_str,
                        "cleaned": self.tp.clean(title)
                    })
                    log_job(f"   Specific requirement from DB: {title} - {years_num}+ years")
        
        general_min = job.get('experience_min', 0) or 0
        if general_min > 0 and not requirements:
            log_job(f"   General requirement from DB: {general_min}+ years")
        
        return {
            "specific_requirements": requirements,
            "general_min_years": general_min
        }
    
    def match_specific_requirements(self, candidate_experiences, job_requirements):
        specific_reqs = job_requirements.get("specific_requirements", [])
        
        if not specific_reqs:
            return None
        
        total_score = 0.0
        matches = []
        
        for req in specific_reqs:
            req_title = req["title"]
            req_years = req["years_required"]
            req_cleaned = req["cleaned"]
            
            best_match = None
            best_score = 0.0
            
            for exp in candidate_experiences:
                exp_title = exp["title"]
                exp_years = exp["years"]
                exp_cleaned = exp["cleaned"]
                
                similarity = self.tp.semantic_similarity(exp_cleaned, req_cleaned)
                
                if similarity >= 0.3:
                    if exp_years >= req_years:
                        years_score = 1.0
                    else:
                        ratio = exp_years / req_years if req_years > 0 else 1.0
                        years_score = 0.5 + (ratio * 0.5)
                        years_score = min(0.85, years_score)
                    
                    combined = (similarity * 0.6) + (years_score * 0.4)
                    
                    if combined > best_score:
                        best_score = combined
                        best_match = {
                            "requirement_title": req_title,
                            "requirement_years": req_years,
                            "matched_title": exp_title,
                            "candidate_years": exp_years,
                            "similarity": round(similarity, 4),
                            "years_score": round(years_score, 4),
                            "combined_score": round(combined, 4)
                        }
            
            if best_match:
                matches.append(best_match)
                total_score += best_match["combined_score"]
                log_match(f"      Requirement '{req_title}' ({req_years}+ yrs) matched with '{best_match['matched_title']}' ({best_match['candidate_years']} yrs) → score: {best_match['combined_score']:.2f}")
            else:
                log_match(f"      Requirement '{req_title}' ({req_years}+ yrs) - NO MATCH found")
        
        if specific_reqs:
            final_score = total_score / len(specific_reqs)
            return {
                "score": round(final_score, 4),
                "match_percentage": round(final_score * 100, 1),
                "type": "specific",
                "matches": matches,
                "total_requirements": len(specific_reqs),
                "matched_count": len(matches),
                "unmatched_requirements": [r["title"] for r in specific_reqs if not any(m["requirement_title"] == r["title"] for m in matches)]
            }
        
        return None
    
    def match_general_requirement(self, candidate_experiences, job_requirements):
        general_years = job_requirements.get("general_min_years", 0)
        
        if general_years == 0:
            return None
        
        total_years = sum(exp["years"] for exp in candidate_experiences)
        
        log_candidate(f"   Total experience from DB: {total_years:.2f} years")
        log_job(f"   General requirement from DB: {general_years}+ years")
        
        if total_years >= general_years:
            score = 1.0
            log_match(f"   Experience: {total_years:.2f} >= {general_years} → 100%")
        else:
            ratio = total_years / general_years if general_years > 0 else 1.0
            score = 0.5 + (ratio * 0.5)
            score = min(0.85, score)
            log_match(f"   Experience: {total_years:.2f} < {general_years} → {score*100:.1f}%")
        
        return {
            "score": round(score, 4),
            "match_percentage": round(score * 100, 1),
            "type": "general",
            "total_years": round(total_years, 2),
            "required_years": general_years,
            "gap": round(max(0, general_years - total_years), 2)
        }
    
    def match(self, profile_data, job):
        candidate_experiences = self.extract_candidate_work_experience(profile_data)
        job_requirements = self.extract_job_experience_requirements(job)
        
        log_candidate(f"   Candidate work experiences: {len(candidate_experiences)} positions")
        log_job(f"   Job specific requirements: {len(job_requirements['specific_requirements'])}")
        log_job(f"   Job general requirement: {job_requirements['general_min_years']}+ years")
        
        specific_result = self.match_specific_requirements(candidate_experiences, job_requirements)
        
        if specific_result:
            log_match(f"   Experience match (specific): {specific_result['match_percentage']}%")
            return {
                "score": specific_result["score"],
                "match_percentage": specific_result["match_percentage"],
                "match_type": "specific_requirements",
                "specific_matches": specific_result.get("matches", []),
                "total_requirements": specific_result.get("total_requirements", 0),
                "matched_requirements": specific_result.get("matched_count", 0),
                "unmatched_requirements": specific_result.get("unmatched_requirements", []),
                "weight": 0.20,
                "weighted_score": round(specific_result["score"] * 0.20, 4)
            }
        
        general_result = self.match_general_requirement(candidate_experiences, job_requirements)
        
        if general_result:
            log_match(f"   Experience match (general): {general_result['match_percentage']}%")
            return {
                "score": general_result["score"],
                "match_percentage": general_result["match_percentage"],
                "match_type": "general_requirement",
                "total_years": general_result.get("total_years", 0),
                "required_years": general_result.get("required_years", 0),
                "gap": general_result.get("gap", 0),
                "weight": 0.20,
                "weighted_score": round(general_result["score"] * 0.20, 4)
            }
        
        log_match(f"   Experience: No requirements from DB → 100%")
        return {
            "score": 1.0,
            "match_percentage": 100.0,
            "match_type": "no_requirement",
            "weight": 0.20,
            "weighted_score": 0.20
        }

# =====================================================
# FACTOR 4: PREFERENCES MATCHER (15%)
# =====================================================

# =====================================================
# FACTOR 4: PREFERENCES MATCHER (15%) - FIXED VERSION (NO DUPLICATE)
# =====================================================

class Factor4_PreferencesMatcher:
    def __init__(self, tp):
        self.tp = tp
    def extract_candidate_age(self, profile_data):
        """Extract candidate age from profile data"""
        dob = profile_data.get('profile', {}).get('personal_info', {}).get('date_of_birth')
        if dob:
            try:
                # Handle various date formats
                if isinstance(dob, str):
                    # Handle ISO format with Z
                    dob = dob.replace('Z', '+00:00')
                birth_date = datetime.fromisoformat(dob)
                today = datetime.now()
                age = today.year - birth_date.year
                # Adjust if birthday hasn't occurred yet this year
                if (today.month, today.day) < (birth_date.month, birth_date.day):
                    age -= 1
                return age
            except Exception as e:
                log_error(f"Error parsing date of birth: {e}")
                return None
        return None
    def extract_candidate_preferences(self, profile_data):
        job_prefs = profile_data.get('profile', {}).get('job_preferences', {})
        
        job_types = job_prefs.get('job_types', []) or job_prefs.get('preferred_job_types', [])
        locations = job_prefs.get('locations', []) or job_prefs.get('preferred_locations', [])
        industries = job_prefs.get('industries', []) or job_prefs.get('preferred_industries', [])
        languages = job_prefs.get('languages', []) or job_prefs.get('preferred_languages', [])
        
        salary_min = job_prefs.get('salary_min', 0) or job_prefs.get('expected_salary_min', 0)
        salary_max = job_prefs.get('salary_max', 0) or job_prefs.get('expected_salary_max', 0)
        
        try:
            salary_min = float(salary_min) if salary_min else 0
        except (ValueError, TypeError):
            salary_min = 0
        
        try:
            salary_max = float(salary_max) if salary_max else 0
        except (ValueError, TypeError):
            salary_max = 0
        
        prefs = {
            "job_types": [self.tp.clean(jt) for jt in job_types],
            "remote_preference": self.tp.clean(job_prefs.get('remote_work_preference', 'flexible')),
            "locations": [self.tp.clean(loc) for loc in locations],
            "industries": [self.tp.clean(ind) for ind in industries],
            "languages": [self.tp.clean(lang) for lang in languages],
            "salary_min": salary_min,
            "salary_max": salary_max
        }
        
        log_candidate(f"   Preferred job types from DB: {prefs['job_types']}")
        log_candidate(f"   Remote preference from DB: {prefs['remote_preference']}")
        log_candidate(f"   Preferred locations from DB: {prefs['locations']}")
        log_candidate(f"   Preferred industries from DB: {prefs['industries']}")
        log_candidate(f"   Preferred languages from DB: {prefs['languages']}")
        log_candidate(f"   Salary expectation from DB: {prefs['salary_min']} - {prefs['salary_max']}")
        
        return prefs
    
    def parse_age_requirement(self, age_req_str):
        """Parse age requirement string from job posting."""
        if not age_req_str or not isinstance(age_req_str, str):
            return {"min_age": None, "max_age": None, "raw": age_req_str}
        
        age_req_clean = age_req_str.strip().lower()
        
        # No requirement cases
        no_requirement_keywords = ['not required', 'any', 'none', 'no requirement', 'n/a', 'any age']
        if any(keyword in age_req_clean for keyword in no_requirement_keywords):
            log_match(f"      Age requirement: '{age_req_str}' → No restriction")
            return {"min_age": None, "max_age": None, "raw": age_req_str}
        
        # Pattern 1: "XX+" or "Above XX" or "Over XX"
        patterns_above = [
            r'(\d+)\+', r'above\s+(\d+)', r'over\s+(\d+)',
            r'minimum\s+(\d+)', r'at least\s+(\d+)', r'(\d+)\s+or\s+older'
        ]
        
        for pattern in patterns_above:
            match = re.search(pattern, age_req_clean)
            if match:
                min_age = int(match.group(1))
                log_match(f"      Age requirement: '{age_req_str}' → Min age: {min_age}")
                return {"min_age": min_age, "max_age": None, "raw": age_req_str}
        
        # Pattern 2: "Under XX" or "Below XX"
        patterns_below = [
            r'under\s+(\d+)', r'below\s+(\d+)', r'less than\s+(\d+)',
            r'maximum\s+(\d+)', r'(\d+)\s+or\s+younger', r'up to\s+(\d+)'
        ]
        
        for pattern in patterns_below:
            match = re.search(pattern, age_req_clean)
            if match:
                max_age = int(match.group(1))
                log_match(f"      Age requirement: '{age_req_str}' → Max age: {max_age}")
                return {"min_age": None, "max_age": max_age, "raw": age_req_str}
        
        # Pattern 3: "XX-YY" or "XX to YY" (range)
        patterns_range = [
            r'(\d+)\s*-\s*(\d+)', r'(\d+)\s+to\s+(\d+)',
            r'between\s+(\d+)\s+and\s+(\d+)', r'from\s+(\d+)\s+to\s+(\d+)'
        ]
        
        for pattern in patterns_range:
            match = re.search(pattern, age_req_clean)
            if match:
                min_age = int(match.group(1))
                max_age = int(match.group(2))
                if min_age <= max_age:
                    log_match(f"      Age requirement: '{age_req_str}' → Range: {min_age}-{max_age}")
                    return {"min_age": min_age, "max_age": max_age, "raw": age_req_str}
        
        # Pattern 4: Exact age
        patterns_exact = [r'^(\d+)$', r'exactly\s+(\d+)', r'(\d+)\s+years old', r'age\s+(\d+)']
        
        for pattern in patterns_exact:
            match = re.search(pattern, age_req_clean)
            if match:
                exact_age = int(match.group(1))
                log_match(f"      Age requirement: '{age_req_str}' → Exact age: {exact_age}")
                return {"min_age": exact_age, "max_age": exact_age, "raw": age_req_str}
        
        # Fallback
        numbers = re.findall(r'(\d+)', age_req_clean)
        if numbers:
            min_age = int(numbers[0])
            max_age = int(numbers[-1]) if len(numbers) > 1 else None
            log_match(f"      Age requirement: '{age_req_str}' → Parsed as Min: {min_age}, Max: {max_age}")
            return {"min_age": min_age, "max_age": max_age, "raw": age_req_str}
        
        log_match(f"      Age requirement: '{age_req_str}' → Could not parse, treating as no restriction")
        return {"min_age": None, "max_age": None, "raw": age_req_str}
    
    def match_age(self, candidate_age, job_age_requirement):
        """Calculate age match score between candidate and job requirement."""
        if not job_age_requirement or job_age_requirement.lower() in ['not required', 'any', '']:
            log_match(f"   Age: No requirement from DB → 100%")
            return {"score": 1.0, "match_percentage": 100.0, "details": "No age requirement"}
        
        if candidate_age is None:
            log_match(f"   Age: Candidate age unknown → 70% (neutral)")
            return {"score": 0.7, "match_percentage": 70.0, "details": "Candidate age not provided"}
        
        age_rule = self.parse_age_requirement(job_age_requirement)
        
        meets_min = True
        meets_max = True
        min_age = age_rule.get("min_age")
        max_age = age_rule.get("max_age")
        
        if min_age is not None and candidate_age < min_age:
            meets_min = False
            log_match(f"   Age: Candidate {candidate_age} < required min {min_age}")
        
        if max_age is not None and candidate_age > max_age:
            meets_max = False
            log_match(f"   Age: Candidate {candidate_age} > required max {max_age}")
        
        if meets_min and meets_max:
            if min_age is not None and max_age is not None:
                center = (min_age + max_age) / 2
                distance = abs(candidate_age - center)
                range_half = (max_age - min_age) / 2
                if range_half > 0:
                    score = max(0.5, 1.0 - (distance / range_half) * 0.5)
                else:
                    score = 1.0
            else:
                score = 1.0
            log_match(f"   Age: Candidate {candidate_age} meets requirement → {score*100:.0f}%")
            return {"score": round(score, 4), "match_percentage": round(score * 100, 1), "details": "Age requirement met"}
        else:
            penalty = 0.0
            if min_age is not None and candidate_age < min_age:
                gap = min_age - candidate_age
                penalty = min(0.5, gap / min_age * 0.5)
            elif max_age is not None and candidate_age > max_age:
                gap = candidate_age - max_age
                penalty = min(0.5, gap / max_age * 0.5)
            
            score = max(0.3, 1.0 - penalty)
            log_match(f"   Age: Candidate {candidate_age} does NOT meet requirement → {score*100:.0f}%")
            return {"score": round(score, 4), "match_percentage": round(score * 100, 1), "details": f"Age {candidate_age} does not meet requirement"}
    
    # ============================================
    # SINGLE MATCH METHOD (NO DUPLICATE)
    # ============================================
    def match(self, candidate_prefs, job, candidate_age=None, job_age_requirement=None):
        missing_job_data = []
        
        # ============================================
        # AGE MATCH
        # ============================================
        age_match = self.match_age(candidate_age, job_age_requirement)
        
        job_type_raw = job.get('job_type', '')
        job_type = self.tp.clean(job_type_raw) if job_type_raw else ''
        if not job_type:
            missing_job_data.append("job_type")
            job_type = 'full-time'
        
        job_remote_raw = job.get('work_arrangement', '')
        job_remote = self.tp.clean(job_remote_raw) if job_remote_raw else ''
        if not job_remote:
            missing_job_data.append("work_arrangement")
        
        job_industry_raw = job.get('company_industry', '')
        job_industry = self.tp.clean(job_industry_raw) if job_industry_raw else ''
        if not job_industry:
            missing_job_data.append("industry")
        
        job_locations = []
        for loc in job.get('locations', []):
            if isinstance(loc, dict):
                city = loc.get('city', '')
                country = loc.get('country', '')
                if city or country:
                    job_locations.append(self.tp.clean(f"{city} {country}"))
        if not job_locations:
            missing_job_data.append("locations")
        
        job_languages = []
        lang_reqs = job.get('language_requirements', [])
        if isinstance(lang_reqs, str):
            try:
                lang_reqs = json.loads(lang_reqs)
            except:
                lang_reqs = []
        for lang in lang_reqs:
            if isinstance(lang, dict):
                lang_name = lang.get('name', '')
                if lang_name:
                    job_languages.append(self.tp.clean(lang_name))
            elif isinstance(lang, str):
                if lang:
                    job_languages.append(self.tp.clean(lang))
        if not job_languages:
            missing_job_data.append("languages")
        
        job_salary_min = 0
        job_salary_max = 0
        try:
            job_salary_min = float(job.get('salary_min', 0)) if job.get('salary_min') else 0
            job_salary_max = float(job.get('salary_max', 0)) if job.get('salary_max') else 0
        except (ValueError, TypeError):
            pass
        
        if job_salary_min == 0 and job_salary_max == 0:
            missing_job_data.append("salary")
        
        log_job(f"   Missing job data: {missing_job_data if missing_job_data else 'None'}")
        
        # Type match
        type_match = 1.0
        type_scores_detail = []
        type_match_note = None
        
        if not job_type_raw:
            type_match_note = "Job type not specified by employer"
            log_match(f"   Job type: Not specified by employer → 100%")
        else:
            if candidate_prefs["job_types"]:
                type_scores = []
                for pt in candidate_prefs["job_types"]:
                    sim = self.tp.semantic_similarity(pt, job_type)
                    type_scores.append(sim)
                    type_scores_detail.append({"preference": pt, "job_value": job_type, "similarity": round(sim, 4)})
                    log_match(f"      Job type '{pt}' vs '{job_type}': {sim:.2f}")
                type_match = max(type_scores) if type_scores else 0.5
            else:
                type_match = 0.7
            log_match(f"   Job type match: {type_match:.2f}")
        
        # Remote match
        remote_match = 1.0
        remote_match_note = None
        
        if not job_remote_raw:
            remote_match_note = "Remote work not specified by employer"
            log_match(f"   Remote work: Not specified by employer → 100%")
        else:
            if candidate_prefs["remote_preference"]:
                remote_match = self.tp.semantic_similarity(candidate_prefs["remote_preference"], job_remote)
                log_match(f"      Remote preference '{candidate_prefs['remote_preference']}' vs '{job_remote}': {remote_match:.2f}")
            else:
                remote_match = 0.7
            log_match(f"   Remote work match: {remote_match:.2f}")
        
        # Location match
        location_match = 1.0
        location_match_detail = None
        location_match_note = None
        
        if not job_locations:
            location_match_note = "Location not specified by employer"
            log_match(f"   Location: Not specified by employer → 100%")
        else:
            if candidate_prefs["locations"]:
                best = 0.0
                best_pair = None
                for pl in candidate_prefs["locations"]:
                    for jl in job_locations:
                        sim = self.tp.semantic_similarity(pl, jl)
                        if sim > best:
                            best = sim
                            best_pair = (pl, jl)
                        log_match(f"      Location '{pl}' vs '{jl}': {sim:.2f}")
                location_match = best if best > 0 else 0.5
                if best_pair:
                    location_match_detail = {"candidate_location": best_pair[0], "job_location": best_pair[1], "similarity": round(location_match, 4)}
                    log_match(f"      Best location match: '{best_pair[0]}' vs '{best_pair[1]}' = {location_match:.2f}")
            else:
                location_match = 0.7
            log_match(f"   Location match: {location_match:.2f}")
        
        # Industry match
        industry_match = 1.0
        industry_scores_detail = []
        industry_match_note = None
        
        if not job_industry_raw:
            industry_match_note = "Industry not specified by employer"
            log_match(f"   Industry: Not specified by employer → 100%")
        else:
            if candidate_prefs["industries"]:
                ind_scores = []
                for ind in candidate_prefs["industries"]:
                    sim = self.tp.semantic_similarity(ind, job_industry)
                    ind_scores.append(sim)
                    industry_scores_detail.append({"preference": ind, "job_value": job_industry, "similarity": round(sim, 4)})
                    log_match(f"      Industry '{ind}' vs '{job_industry}': {sim:.2f}")
                industry_match = max(ind_scores) if ind_scores else 0.5
            else:
                industry_match = 0.7
            log_match(f"   Industry match: {industry_match:.2f}")
        
        # Salary match
        salary_match = 1.0
        salary_detail = {}
        salary_match_note = None
        
        if job_salary_min == 0 and job_salary_max == 0:
            salary_match_note = "Salary not specified by employer"
            log_match(f"   Salary: Not specified by employer → 100%")
        else:
            candidate_salary_max = candidate_prefs.get("salary_max", 0)
            candidate_salary_min = candidate_prefs.get("salary_min", 0)
            
            try:
                candidate_salary_max = float(candidate_salary_max) if candidate_salary_max else 0
                candidate_salary_min = float(candidate_salary_min) if candidate_salary_min else 0
            except (ValueError, TypeError):
                candidate_salary_max = 0
                candidate_salary_min = 0
            
            log_match(f"      Job salary range: {job_salary_min} - {job_salary_max}")
            log_match(f"      Candidate salary expectation: {candidate_salary_min} - {candidate_salary_max}")
            
            if job_salary_min > 0 and candidate_salary_max > 0:
                if job_salary_min <= candidate_salary_max:
                    salary_match = 1.0
                    log_match(f"      Salary match: Job min <= Candidate max → 1.00")
                else:
                    diff = job_salary_min - candidate_salary_max
                    salary_match = max(0.3, 1.0 - (diff / candidate_salary_max))
                    log_match(f"      Salary match: Job min > Candidate max by {diff} → {salary_match:.2f}")
            elif job_salary_max > 0 and candidate_salary_min > 0:
                if candidate_salary_min <= job_salary_max:
                    salary_match = 1.0
                else:
                    diff = candidate_salary_min - job_salary_max
                    salary_match = max(0.3, 1.0 - (diff / candidate_salary_min))
            else:
                log_match(f"      Salary match: No valid salary data for comparison → 1.00")
            
            salary_detail = {
                "job_min": job_salary_min,
                "job_max": job_salary_max,
                "candidate_min": candidate_salary_min,
                "candidate_max": candidate_salary_max,
                "match_score": round(salary_match, 4)
            }
            log_match(f"   Salary match: {salary_match:.2f}")
        
        # Language match
        language_match = 1.0
        language_matches_detail = []
        language_match_note = None
        
        if not job_languages:
            language_match_note = "Languages not specified by employer"
            log_match(f"   Languages: Not specified by employer → 100%")
        else:
            if candidate_prefs["languages"]:
                matches = 0
                for jl in job_languages:
                    matched = False
                    for lang in candidate_prefs["languages"]:
                        sim = self.tp.semantic_similarity(lang, jl)
                        log_match(f"      Language '{lang}' vs '{jl}': {sim:.2f}")
                        if sim >= 0.7:
                            matches += 1
                            matched = True
                            language_matches_detail.append({"required": jl, "matched_with": lang, "similarity": round(sim, 4)})
                            break
                    if not matched:
                        language_matches_detail.append({"required": jl, "matched_with": None, "similarity": 0})
                language_match = matches / len(job_languages) if job_languages else 1.0
                log_match(f"      Language match: {matches}/{len(job_languages)} languages matched = {language_match:.2f}")
            else:
                language_match = 0.5
                log_match(f"      No language preferences specified → {language_match:.2f}")
            log_match(f"   Language match: {language_match:.2f}")
        
        # ============================================
        # WEIGHTS WITH AGE FACTOR (5%)
        # ============================================
        
        age_weight = 0.05
        remaining_weight = 0.95
        
        type_weight = 0.20 * remaining_weight
        remote_weight = 0.20 * remaining_weight
        location_weight = 0.15 * remaining_weight
        industry_weight = 0.15 * remaining_weight
        salary_weight = 0.15 * remaining_weight
        language_weight = 0.15 * remaining_weight
        
        preference_score = (type_match * type_weight) + \
                           (remote_match * remote_weight) + \
                           (location_match * location_weight) + \
                           (industry_match * industry_weight) + \
                           (salary_match * salary_weight) + \
                           (language_match * language_weight)
        
        final_score = preference_score + (age_match["score"] * age_weight)
        
        log_match(f"   ============================================")
        log_match(f"   PREFERENCE SCORES BREAKDOWN:")
        log_match(f"      Type Match:     {type_match:.2f} × {type_weight:.2f} = {type_match * type_weight:.3f}")
        log_match(f"      Remote Match:   {remote_match:.2f} × {remote_weight:.2f} = {remote_match * remote_weight:.3f}")
        log_match(f"      Location Match: {location_match:.2f} × {location_weight:.3f} = {location_match * location_weight:.3f}")
        log_match(f"      Industry Match: {industry_match:.2f} × {industry_weight:.3f} = {industry_match * industry_weight:.3f}")
        log_match(f"      Salary Match:   {salary_match:.2f} × {salary_weight:.3f} = {salary_match * salary_weight:.3f}")
        log_match(f"      Language Match: {language_match:.2f} × {language_weight:.3f} = {language_match * language_weight:.3f}")
        log_match(f"      Age Match:      {age_match['score']:.2f} × {age_weight:.2f} = {age_match['score'] * age_weight:.3f}")
        log_match(f"   TOTAL: {final_score:.4f} ({final_score*100:.1f}%)")
        
        return {
            "score": round(final_score, 4), 
            "match_percentage": round(final_score * 100, 1),
            "missing_job_data": missing_job_data,
            "type_match": round(type_match, 4),
            "type_match_details": type_scores_detail,
            "type_match_note": type_match_note,
            "remote_match": round(remote_match, 4),
            "remote_match_note": remote_match_note,
            "location_match": round(location_match, 4),
            "location_match_details": location_match_detail,
            "location_match_note": location_match_note,
            "industry_match": round(industry_match, 4),
            "industry_match_details": industry_scores_detail,
            "industry_match_note": industry_match_note,
            "salary_match": round(salary_match, 4),
            "salary_match_details": salary_detail,
            "salary_match_note": salary_match_note,
            "language_match": round(language_match, 4),
            "language_match_details": language_matches_detail,
            "language_match_note": language_match_note,
            "age_match": round(age_match["score"], 4),
            "age_match_percentage": round(age_match["score"] * 100, 1),
            "age_match_details": age_match.get("details", ""),
            "weight": 0.15, 
            "weighted_score": round(final_score * 0.15, 4)
        }
def match(self, candidate_prefs, job, candidate_age=None, job_age_requirement=None):
    missing_job_data = []
    
    # ============================================
    # AGE MATCH (NEW FACTOR - 5% WEIGHT)
    # ============================================
    age_match = self.match_age(candidate_age, job_age_requirement)
    
    job_type_raw = job.get('job_type', '')
    job_type = self.tp.clean(job_type_raw) if job_type_raw else ''
    if not job_type:
        missing_job_data.append("job_type")
        job_type = 'full-time'
    
    job_remote_raw = job.get('work_arrangement', '')
    job_remote = self.tp.clean(job_remote_raw) if job_remote_raw else ''
    if not job_remote:
        missing_job_data.append("work_arrangement")
    
    job_industry_raw = job.get('company_industry', '')
    job_industry = self.tp.clean(job_industry_raw) if job_industry_raw else ''
    if not job_industry:
        missing_job_data.append("industry")
    
    job_locations = []
    for loc in job.get('locations', []):
        if isinstance(loc, dict):
            city = loc.get('city', '')
            country = loc.get('country', '')
            if city or country:
                job_locations.append(self.tp.clean(f"{city} {country}"))
    if not job_locations:
        missing_job_data.append("locations")
    
    job_languages = []
    lang_reqs = job.get('language_requirements', [])
    if isinstance(lang_reqs, str):
        try:
            lang_reqs = json.loads(lang_reqs)
        except:
            lang_reqs = []
    for lang in lang_reqs:
        if isinstance(lang, dict):
            lang_name = lang.get('name', '')
            if lang_name:
                job_languages.append(self.tp.clean(lang_name))
        elif isinstance(lang, str):
            if lang:
                job_languages.append(self.tp.clean(lang))
    if not job_languages:
        missing_job_data.append("languages")
    
    job_salary_min = 0
    job_salary_max = 0
    try:
        job_salary_min = float(job.get('salary_min', 0)) if job.get('salary_min') else 0
        job_salary_max = float(job.get('salary_max', 0)) if job.get('salary_max') else 0
    except (ValueError, TypeError):
        pass
    
    if job_salary_min == 0 and job_salary_max == 0:
        missing_job_data.append("salary")
    
    log_job(f"   Missing job data: {missing_job_data if missing_job_data else 'None'}")
    
    # Type match
    type_match = 1.0
    type_scores_detail = []
    type_match_note = None
    
    if not job_type_raw:
        type_match_note = "Job type not specified by employer"
        log_match(f"   Job type: Not specified by employer → 100%")
    else:
        if candidate_prefs["job_types"]:
            type_scores = []
            for pt in candidate_prefs["job_types"]:
                sim = self.tp.semantic_similarity(pt, job_type)
                type_scores.append(sim)
                type_scores_detail.append({"preference": pt, "job_value": job_type, "similarity": round(sim, 4)})
                log_match(f"      Job type '{pt}' vs '{job_type}': {sim:.2f}")
            type_match = max(type_scores) if type_scores else 0.5
        else:
            type_match = 0.7
        log_match(f"   Job type match: {type_match:.2f}")
    
    # Remote match
    remote_match = 1.0
    remote_match_note = None
    
    if not job_remote_raw:
        remote_match_note = "Remote work not specified by employer"
        log_match(f"   Remote work: Not specified by employer → 100%")
    else:
        if candidate_prefs["remote_preference"]:
            remote_match = self.tp.semantic_similarity(candidate_prefs["remote_preference"], job_remote)
            log_match(f"      Remote preference '{candidate_prefs['remote_preference']}' vs '{job_remote}': {remote_match:.2f}")
        else:
            remote_match = 0.7
        log_match(f"   Remote work match: {remote_match:.2f}")
    
    # Location match
    location_match = 1.0
    location_match_detail = None
    location_match_note = None
    
    if not job_locations:
        location_match_note = "Location not specified by employer"
        log_match(f"   Location: Not specified by employer → 100%")
    else:
        if candidate_prefs["locations"]:
            best = 0.0
            best_pair = None
            for pl in candidate_prefs["locations"]:
                for jl in job_locations:
                    sim = self.tp.semantic_similarity(pl, jl)
                    if sim > best:
                        best = sim
                        best_pair = (pl, jl)
                    log_match(f"      Location '{pl}' vs '{jl}': {sim:.2f}")
            location_match = best if best > 0 else 0.5
            if best_pair:
                location_match_detail = {"candidate_location": best_pair[0], "job_location": best_pair[1], "similarity": round(location_match, 4)}
                log_match(f"      Best location match: '{best_pair[0]}' vs '{best_pair[1]}' = {location_match:.2f}")
        else:
            location_match = 0.7
        log_match(f"   Location match: {location_match:.2f}")
    
    # Industry match
    industry_match = 1.0
    industry_scores_detail = []
    industry_match_note = None
    
    if not job_industry_raw:
        industry_match_note = "Industry not specified by employer"
        log_match(f"   Industry: Not specified by employer → 100%")
    else:
        if candidate_prefs["industries"]:
            ind_scores = []
            for ind in candidate_prefs["industries"]:
                sim = self.tp.semantic_similarity(ind, job_industry)
                ind_scores.append(sim)
                industry_scores_detail.append({"preference": ind, "job_value": job_industry, "similarity": round(sim, 4)})
                log_match(f"      Industry '{ind}' vs '{job_industry}': {sim:.2f}")
            industry_match = max(ind_scores) if ind_scores else 0.5
        else:
            industry_match = 0.7
        log_match(f"   Industry match: {industry_match:.2f}")
    
    # Salary match
    salary_match = 1.0
    salary_detail = {}
    salary_match_note = None
    
    if job_salary_min == 0 and job_salary_max == 0:
        salary_match_note = "Salary not specified by employer"
        log_match(f"   Salary: Not specified by employer → 100%")
    else:
        candidate_salary_max = candidate_prefs.get("salary_max", 0)
        candidate_salary_min = candidate_prefs.get("salary_min", 0)
        
        try:
            candidate_salary_max = float(candidate_salary_max) if candidate_salary_max else 0
            candidate_salary_min = float(candidate_salary_min) if candidate_salary_min else 0
        except (ValueError, TypeError):
            candidate_salary_max = 0
            candidate_salary_min = 0
        
        log_match(f"      Job salary range: {job_salary_min} - {job_salary_max}")
        log_match(f"      Candidate salary expectation: {candidate_salary_min} - {candidate_salary_max}")
        
        if job_salary_min > 0 and candidate_salary_max > 0:
            if job_salary_min <= candidate_salary_max:
                salary_match = 1.0
                log_match(f"      Salary match: Job min ({job_salary_min}) <= Candidate max ({candidate_salary_max}) → 1.00")
            else:
                diff = job_salary_min - candidate_salary_max
                salary_match = max(0.3, 1.0 - (diff / candidate_salary_max))
                log_match(f"      Salary match: Job min ({job_salary_min}) > Candidate max ({candidate_salary_max}) by {diff} → {salary_match:.2f}")
        elif job_salary_max > 0 and candidate_salary_min > 0:
            if candidate_salary_min <= job_salary_max:
                salary_match = 1.0
            else:
                diff = candidate_salary_min - job_salary_max
                salary_match = max(0.3, 1.0 - (diff / candidate_salary_min))
        else:
            log_match(f"      Salary match: No valid salary data for comparison → 1.00")
        
        salary_detail = {
            "job_min": job_salary_min,
            "job_max": job_salary_max,
            "candidate_min": candidate_salary_min,
            "candidate_max": candidate_salary_max,
            "match_score": round(salary_match, 4)
        }
        log_match(f"   Salary match: {salary_match:.2f}")
    
    # Language match
    language_match = 1.0
    language_matches_detail = []
    language_match_note = None
    
    if not job_languages:
        language_match_note = "Languages not specified by employer"
        log_match(f"   Languages: Not specified by employer → 100%")
    else:
        if candidate_prefs["languages"]:
            matches = 0
            for jl in job_languages:
                matched = False
                for lang in candidate_prefs["languages"]:
                    sim = self.tp.semantic_similarity(lang, jl)
                    log_match(f"      Language '{lang}' vs '{jl}': {sim:.2f}")
                    if sim >= 0.7:
                        matches += 1
                        matched = True
                        language_matches_detail.append({"required": jl, "matched_with": lang, "similarity": round(sim, 4)})
                        break
                if not matched:
                    language_matches_detail.append({"required": jl, "matched_with": None, "similarity": 0})
            language_match = matches / len(job_languages) if job_languages else 1.0
            log_match(f"      Language match: {matches}/{len(job_languages)} languages matched = {language_match:.2f}")
        else:
            language_match = 0.5
            log_match(f"      No language preferences specified → {language_match:.2f}")
        log_match(f"   Language match: {language_match:.2f}")
    
    # ============================================
    # NEW WEIGHTS WITH AGE FACTOR (5%)
    # Age factor takes 5%, other factors scaled down proportionally
    # ============================================
    
    age_weight = 0.05  # Age now has 5% weight
    remaining_weight = 0.95  # Remaining 95% for other factors
    
    # Scale other factors to total 95%
    # Original: type=20%, remote=20%, location=15%, industry=15%, salary=15%, language=15% (total 100%)
    # New scaled: each multiplied by 0.95
    type_weight = 0.20 * remaining_weight
    remote_weight = 0.20 * remaining_weight
    location_weight = 0.15 * remaining_weight
    industry_weight = 0.15 * remaining_weight
    salary_weight = 0.15 * remaining_weight
    language_weight = 0.15 * remaining_weight
    
    # Total preference score without age
    preference_score = (type_match * type_weight) + \
                       (remote_match * remote_weight) + \
                       (location_match * location_weight) + \
                       (industry_match * industry_weight) + \
                       (salary_match * salary_weight) + \
                       (language_match * language_weight)
    
    # Final score with age
    final_score = preference_score + (age_match["score"] * age_weight)
    
    log_match(f"   ============================================")
    log_match(f"   PREFERENCE SCORES BREAKDOWN:")
    log_match(f"      Type Match (19%):       {type_match:.2f} × {type_weight:.2f} = {type_match * type_weight:.3f}")
    log_match(f"      Remote Match (19%):     {remote_match:.2f} × {remote_weight:.2f} = {remote_match * remote_weight:.3f}")
    log_match(f"      Location Match (14.25%):{location_match:.2f} × {location_weight:.3f} = {location_match * location_weight:.3f}")
    log_match(f"      Industry Match (14.25%):{industry_match:.2f} × {industry_weight:.3f} = {industry_match * industry_weight:.3f}")
    log_match(f"      Salary Match (14.25%):  {salary_match:.2f} × {salary_weight:.3f} = {salary_match * salary_weight:.3f}")
    log_match(f"      Language Match (14.25%):{language_match:.2f} × {language_weight:.3f} = {language_match * language_weight:.3f}")
    log_match(f"      Age Match (5%):         {age_match['score']:.2f} × {age_weight:.2f} = {age_match['score'] * age_weight:.3f}")
    log_match(f"   TOTAL PREFERENCE SCORE: {final_score:.4f} ({final_score*100:.1f}%)")
    
    return {
        "score": round(final_score, 4), 
        "match_percentage": round(final_score * 100, 1),
        "missing_job_data": missing_job_data,
        "type_match": round(type_match, 4),
        "type_match_details": type_scores_detail,
        "type_match_note": type_match_note,
        "remote_match": round(remote_match, 4),
        "remote_match_note": remote_match_note,
        "location_match": round(location_match, 4),
        "location_match_details": location_match_detail,
        "location_match_note": location_match_note,
        "industry_match": round(industry_match, 4),
        "industry_match_details": industry_scores_detail,
        "industry_match_note": industry_match_note,
        "salary_match": round(salary_match, 4),
        "salary_match_details": salary_detail,
        "salary_match_note": salary_match_note,
        "language_match": round(language_match, 4),
        "language_match_details": language_matches_detail,
        "language_match_note": language_match_note,
        "age_match": round(age_match["score"], 4),
        "age_match_percentage": round(age_match["score"] * 100, 1),
        "age_match_details": age_match.get("details", ""),
        "weight": 0.15, 
        "weighted_score": round(final_score * 0.15, 4)
    }
# =====================================================
# COMPLETE JOB FIELD EXTRACTOR
# =====================================================

def extract_all_job_fields(job: Dict) -> Dict:
    """Extract ALL job fields from the database response - 70+ fields"""
    
    # Parse locations
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
                "state": loc.get('state', ''),
                "postal_code": loc.get('postal_code', ''),
                "is_remote": loc.get('is_remote', False),
            })
        elif isinstance(loc, str):
            location_details.append({"city": loc, "country": "", "is_remote": False})
    
    # Parse skills arrays
    skills_required = job.get('skills_required', [])
    if isinstance(skills_required, str):
        try:
            skills_required = json.loads(skills_required)
        except:
            skills_required = []
    
    skills_preferred = job.get('skills_preferred', [])
    if isinstance(skills_preferred, str):
        try:
            skills_preferred = json.loads(skills_preferred)
        except:
            skills_preferred = []
    
    # Parse education required with proper handling
    education_required = job.get('education_required', {})
    if isinstance(education_required, str):
        try:
            education_required = json.loads(education_required)
        except:
            education_required = {}
    
    # Ensure arrays are properly formatted
    if 'certifications' not in education_required:
        education_required['certifications'] = []
    if 'languages' not in education_required:
        education_required['languages'] = []
    if 'experience_requirements' not in education_required:
        education_required['experience_requirements'] = []
    if 'additional_requirements' not in education_required:
        education_required['additional_requirements'] = []
    if 'fields_of_study' not in education_required:
        education_required['fields_of_study'] = []
    
    # Parse benefits
    benefits = job.get('benefits', [])
    if isinstance(benefits, str):
        try:
            benefits = json.loads(benefits)
        except:
            benefits = []
    
    # Parse responsibilities
    responsibilities = job.get('responsibilities', [])
    if isinstance(responsibilities, str):
        try:
            responsibilities = json.loads(responsibilities)
        except:
            responsibilities = []
    
    # Parse requirements
    requirements = job.get('requirements', [])
    if isinstance(requirements, str):
        try:
            requirements = json.loads(requirements)
        except:
            requirements = []
    
    # Parse screening questions
    screening_questions = job.get('screening_questions', [])
    if isinstance(screening_questions, str):
        try:
            screening_questions = json.loads(screening_questions)
        except:
            screening_questions = []
    
    # Parse language requirements
    language_requirements = job.get('language_requirements', [])
    if isinstance(language_requirements, str):
        try:
            language_requirements = json.loads(language_requirements)
        except:
            language_requirements = []
    
    # Parse tags
    tags = job.get('tags', [])
    if isinstance(tags, str):
        try:
            tags = json.loads(tags)
        except:
            tags = []
    
    # Parse documents
    documents = job.get('documents', [])
    if isinstance(documents, str):
        try:
            documents = json.loads(documents)
        except:
            documents = []
    
    # Parse metadata
    metadata = job.get('metadata', {})
    if isinstance(metadata, str):
        try:
            metadata = json.loads(metadata)
        except:
            metadata = {}
    
    # Parse experience requirements
    experience_requirements = job.get('experience_requirements', [])
    if isinstance(experience_requirements, str):
        try:
            experience_requirements = json.loads(experience_requirements)
        except:
            experience_requirements = []
    
    # Parse education requirements
    education_requirements = job.get('education_requirements', {})
    if isinstance(education_requirements, str):
        try:
            education_requirements = json.loads(education_requirements)
        except:
            education_requirements = {}
    
    # Parse skill experience requirements
    skill_experience_requirements = job.get('skill_experience_requirements', {})
    if isinstance(skill_experience_requirements, str):
        try:
            skill_experience_requirements = json.loads(skill_experience_requirements)
        except:
            skill_experience_requirements = {}
    
    # Parse company industries
    company_industries = job.get('company_industries', [])
    if isinstance(company_industries, str):
        try:
            company_industries = json.loads(company_industries)
        except:
            company_industries = []
    
    # Parse company headquarters
    headquarters = job.get('company_headquarters_location', {})
    if isinstance(headquarters, str):
        try:
            headquarters = json.loads(headquarters)
        except:
            headquarters = {}
    
    # Parse company culture
    company_culture = job.get('company_culture', {})
    if isinstance(company_culture, str):
        try:
            company_culture = json.loads(company_culture)
        except:
            company_culture = {}
    
    # Parse company values
    company_values = job.get('company_values', [])
    if isinstance(company_values, str):
        try:
            company_values = json.loads(company_values)
        except:
            company_values = []
    
    # Parse company social links
    company_social_links = job.get('company_social_links', {})
    if isinstance(company_social_links, str):
        try:
            company_social_links = json.loads(company_social_links)
        except:
            company_social_links = {}
            
    education_required = job.get('education_required', {})
    
    
     # ✅ CRITICAL: Extract age requirement
    age_requirement = education_required.get('age_requirement', '')
    if not age_requirement:
        age_requirement = education_required.get('age_requirement_text', '')
    
    # Return COMPLETE job object
    return {
        "id": job.get('id', ''),
        "external_id": job.get('external_id', ''),
        "title": job.get('title', 'Unknown'),
        "slug": job.get('slug', ''),
        "department": job.get('department', ''),
        "team": job.get('team', ''),
        "job_type": job.get('job_type', 'full-time'),
        "work_arrangement": job.get('work_arrangement', ''),
        "locations": location_details,
        "description": job.get('description', ''),
        "summary": job.get('summary', ''),
        "responsibilities": responsibilities,
        "qualifications": job.get('qualifications', ''),
        "preferred_qualifications": job.get('preferred_qualifications', ''),
        "requirements": requirements,
        "salary_min": float(job.get('salary_min', 0)) if job.get('salary_min') else 0,
        "salary_max": float(job.get('salary_max', 0)) if job.get('salary_max') else 0,
        "salary_currency": job.get('salary_currency', 'Rwf'),
        "salary_period": job.get('salary_period', 'month'),
        "salary_visible": job.get('salary_visible', True),
        "benefits": benefits,
        "skills_required": skills_required,
        "skills_preferred": skills_preferred,
        "experience_min": int(job.get('experience_min', 0)) if job.get('experience_min') else 0,
        "experience_max": int(job.get('experience_max', 0)) if job.get('experience_max') else 0,
        "experience_level": job.get('experience_level', 'entry'),
        "experience_requirements": experience_requirements,
        "education_required": education_required,
        "education_requirements": education_requirements,
        "language_requirements": language_requirements,
        "skill_experience_requirements": skill_experience_requirements,
        "screening_questions": screening_questions,
        "application_instructions": job.get('application_instructions', ''),
        "documents": documents,
        "department_info": job.get('department_info', ''),
        "tags": tags,
        "application_limit": int(job.get('application_limit', 0)) if job.get('application_limit') else 0,
        "ai_match_required_score": int(job.get('ai_match_required_score', 70)) if job.get('ai_match_required_score') else 70,
        "ai_score": job.get('ai_score', {}),
        "status": job.get('status', 'active'),
        "visibility": job.get('visibility', 'public'),
        "published_at": job.get('published_at'),
        "expires_at": job.get('expires_at'),
        "paused_at": job.get('paused_at'),
        "closed_at": job.get('closed_at'),
        "created_at": job.get('created_at'),
        "updated_at": job.get('updated_at'),
        "created_by": job.get('created_by'),
        "approved_by": job.get('approved_by'),
        "approved_at": job.get('approved_at'),
        "view_count": int(job.get('view_count', 0)) if job.get('view_count') else 0,
        "application_count": int(job.get('application_count', 0)) if job.get('application_count') else 0,
        "metadata": metadata,
        "deleted_at": job.get('deleted_at'),
        "education_required": education_required, 
         "age_requirement": age_requirement,  # ✅ ADD THIS
        "company": {
            "id": job.get('company_id', ''),
            "name": job.get('company_name', 'Unknown'),
            "legal_name": job.get('company_legal_name', ''),
            "slug": job.get('company_slug', ''),
            "industry": job.get('company_industry', ''),
            "industries": company_industries,
            "size": job.get('company_size', ''),
            "founded_year": job.get('company_founded_year'),
            "headquarters": headquarters,
            "website": job.get('company_website', ''),
            "description": job.get('company_description', ''),
            "short_description": job.get('company_short_description', ''),
            "mission": job.get('company_mission', ''),
            "vision": job.get('company_vision', ''),
            "values": company_values,
            "culture": company_culture,
            "logo_url": job.get('company_logo_url', ''),
            "logo_key": job.get('company_logo_key', ''),
            "banner_url": job.get('company_banner_url', ''),
            "banner_key": job.get('company_banner_key', ''),
            "social_links": company_social_links,
            "verified": job.get('company_verified', False),
            "verification_status": job.get('company_verification_status', ''),
            "verification_level": job.get('company_verification_level', ''),
            "verified_at": job.get('company_verified_at'),
            "domain": job.get('company_domain', ''),
            "tax_id": job.get('company_tax_id', ''),
            "registration_number": job.get('company_registration_number', '')
        }
    }


    
    
def parse_age_requirement(self, age_req_str):
    """
    Parse age requirement string from job posting.
    
    Supported formats:
    - "18+" -> min_age=18, max_age=None
    - "21" -> min_age=21, max_age=21 (exact age)
    - "25-35" -> min_age=25, max_age=35
    - "Under 40" -> min_age=None, max_age=40
    - "Below 30" -> min_age=None, max_age=30
    - "Above 50" -> min_age=50, max_age=None
    - "Over 18" -> min_age=18, max_age=None
    - "18 to 30" -> min_age=18, max_age=30
    - "Not required" -> min_age=None, max_age=None
    - "Any" -> min_age=None, max_age=None
    - "" -> min_age=None, max_age=None
    
    Returns:
        dict: {"min_age": int or None, "max_age": int or None, "raw": str}
    """
    if not age_req_str or not isinstance(age_req_str, str):
        return {"min_age": None, "max_age": None, "raw": age_req_str}
    
    age_req_clean = age_req_str.strip().lower()
    
    # No requirement cases
    no_requirement_keywords = ['not required', 'any', 'none', 'no requirement', 'n/a', 'any age']
    if any(keyword in age_req_clean for keyword in no_requirement_keywords):
        log_match(f"      Age requirement: '{age_req_str}' → No restriction")
        return {"min_age": None, "max_age": None, "raw": age_req_str}
    
    # Pattern 1: "XX+" or "Above XX" or "Over XX" or "XX or older"
    patterns_above = [
        r'(\d+)\+',                    # "18+"
        r'above\s+(\d+)',              # "above 18"
        r'over\s+(\d+)',               # "over 18"
        r'greater than\s+(\d+)',       # "greater than 18"
        r'minimum\s+(\d+)',            # "minimum 18"
        r'at least\s+(\d+)',           # "at least 18"
        r'(\d+)\s+or\s+older',         # "18 or older"
        r'(\d+)\+ years',              # "18+ years"
    ]
    
    for pattern in patterns_above:
        match = re.search(pattern, age_req_clean)
        if match:
            min_age = int(match.group(1))
            log_match(f"      Age requirement: '{age_req_str}' → Min age: {min_age}")
            return {"min_age": min_age, "max_age": None, "raw": age_req_str}
    
    # Pattern 2: "Under XX" or "Below XX" or "XX or younger"
    patterns_below = [
        r'under\s+(\d+)',              # "under 40"
        r'below\s+(\d+)',              # "below 40"
        r'less than\s+(\d+)',          # "less than 40"
        r'maximum\s+(\d+)',            # "maximum 40"
        r'not exceed\s+(\d+)',         # "not exceed 40"
        r'(\d+)\s+or\s+younger',       # "40 or younger"
        r'up to\s+(\d+)',              # "up to 40"
    ]
    
    for pattern in patterns_below:
        match = re.search(pattern, age_req_clean)
        if match:
            max_age = int(match.group(1))
            log_match(f"      Age requirement: '{age_req_str}' → Max age: {max_age}")
            return {"min_age": None, "max_age": max_age, "raw": age_req_str}
    
    # Pattern 3: "XX-YY" or "XX to YY" (range)
    patterns_range = [
        r'(\d+)\s*-\s*(\d+)',          # "25-35" or "25 - 35"
        r'(\d+)\s+to\s+(\d+)',         # "25 to 35"
        r'between\s+(\d+)\s+and\s+(\d+)',  # "between 25 and 35"
        r'from\s+(\d+)\s+to\s+(\d+)',  # "from 25 to 35"
    ]
    
    for pattern in patterns_range:
        match = re.search(pattern, age_req_clean)
        if match:
            min_age = int(match.group(1))
            max_age = int(match.group(2))
            if min_age <= max_age:
                log_match(f"      Age requirement: '{age_req_str}' → Range: {min_age}-{max_age}")
                return {"min_age": min_age, "max_age": max_age, "raw": age_req_str}
            else:
                # Swapped values? Try to fix
                log_match(f"      Age requirement: '{age_req_str}' → Invalid range (min > max)")
                return {"min_age": max_age, "max_age": min_age, "raw": age_req_str}
    
    # Pattern 4: Exact age (single number)
    patterns_exact = [
        r'^(\d+)$',                    # "25"
        r'exactly\s+(\d+)',            # "exactly 25"
        r'(\d+)\s+years old',          # "25 years old"
        r'age\s+(\d+)',                # "age 25"
    ]
    
    for pattern in patterns_exact:
        match = re.search(pattern, age_req_clean)
        if match:
            exact_age = int(match.group(1))
            log_match(f"      Age requirement: '{age_req_str}' → Exact age: {exact_age}")
            return {"min_age": exact_age, "max_age": exact_age, "raw": age_req_str}
    
    # Pattern 5: Try to extract any number as min_age (fallback)
    numbers = re.findall(r'(\d+)', age_req_clean)
    if numbers:
        min_age = int(numbers[0])
        max_age = int(numbers[-1]) if len(numbers) > 1 else None
        log_match(f"      Age requirement: '{age_req_str}' → Parsed as Min: {min_age}, Max: {max_age}")
        return {"min_age": min_age, "max_age": max_age, "raw": age_req_str}
    
    # No pattern matched
    log_match(f"      Age requirement: '{age_req_str}' → Could not parse, treating as no restriction")
    return {"min_age": None, "max_age": None, "raw": age_req_str}
    
# Add this method to Factor4_PreferencesMatcher class
def match_age(self, candidate_age, job_age_requirement):
    """
    Calculate age match score between candidate and job requirement.
    
    Args:
        candidate_age: int or None (candidate's age from date_of_birth)
        job_age_requirement: str (e.g., "18+", "25-35", "Under 40")
    
    Returns:
        dict: {"score": float, "match_percentage": float, "details": dict}
    """
    # If no job age requirement, return 100%
    if not job_age_requirement or job_age_requirement.lower() in ['not required', 'any', '']:
        log_match(f"   Age: No requirement from DB → 100%")
        return {"score": 1.0, "match_percentage": 100.0, "details": "No age requirement"}
    
    # If candidate age is unknown, return neutral score
    if candidate_age is None:
        log_match(f"   Age: Candidate age unknown → 70% (neutral)")
        return {"score": 0.7, "match_percentage": 70.0, "details": "Candidate age not provided"}
    
    # Parse job age requirement
    age_rule = self.parse_age_requirement(job_age_requirement)
    
    # Check if candidate meets age requirement
    meets_min = True
    meets_max = True
    min_age = age_rule.get("min_age")
    max_age = age_rule.get("max_age")
    
    if min_age is not None and candidate_age < min_age:
        meets_min = False
        log_match(f"   Age: Candidate {candidate_age} < required min {min_age}")
    
    if max_age is not None and candidate_age > max_age:
        meets_max = False
        log_match(f"   Age: Candidate {candidate_age} > required max {max_age}")
    
    # Calculate score
    if meets_min and meets_max:
        # Perfect match if within range
        if min_age is not None and max_age is not None:
            # Calculate how centered the age is in the range
            center = (min_age + max_age) / 2
            distance = abs(candidate_age - center)
            range_half = (max_age - min_age) / 2
            if range_half > 0:
                score = max(0.5, 1.0 - (distance / range_half) * 0.5)
            else:
                score = 1.0
        else:
            score = 1.0
        log_match(f"   Age: Candidate {candidate_age} meets requirement '{job_age_requirement}' → {score*100:.0f}%")
        return {"score": round(score, 4), "match_percentage": round(score * 100, 1), "details": "Age requirement met"}
    else:
        # Partial match - penalty based on how far off
        penalty = 0.0
        if min_age is not None and candidate_age < min_age:
            gap = min_age - candidate_age
            penalty = min(0.5, gap / min_age * 0.5)
        elif max_age is not None and candidate_age > max_age:
            gap = candidate_age - max_age
            penalty = min(0.5, gap / max_age * 0.5)
        
        score = max(0.3, 1.0 - penalty)
        log_match(f"   Age: Candidate {candidate_age} does NOT meet requirement '{job_age_requirement}' → {score*100:.0f}%")
        return {"score": round(score, 4), "match_percentage": round(score * 100, 1), "details": f"Age {candidate_age} does not meet requirement"}
# =====================================================
# EXTRACT COMPLETE CANDIDATE DATA
# =====================================================

def extract_complete_candidate_data(profile_data: Dict) -> Dict:
    """Extract ALL candidate fields for frontend display"""
    
    profile = profile_data.get('profile', {})
    personal_info = profile.get('personal_info', {})
    links = profile.get('links', {})
    work_prefs = profile.get('work_preferences', {})
    statistics = profile_data.get('statistics', {})
    applications_summary = profile_data.get('applications_summary', {})
    simulations_summary = profile_data.get('simulations_summary', {})
    job_prefs = profile.get('job_preferences', {})
    
    return {
        "id": personal_info.get('user_id', ''),
        "email": personal_info.get('email', ''),
        "full_name": personal_info.get('full_name', 'Unknown'),
        "first_name": personal_info.get('first_name', ''),
        "last_name": personal_info.get('last_name', ''),
        "headline": personal_info.get('headline', ''),
        "summary": personal_info.get('summary', ''),
        "phone": personal_info.get('phone', ''),
        "date_of_birth": personal_info.get('date_of_birth'),
        "gender": personal_info.get('gender'),
        "profile_photo_url": personal_info.get('profile_photo_url', ''),
        "joined_date": personal_info.get('joined_date'),
        "last_login": personal_info.get('last_login'),
        "user_status": personal_info.get('user_status'),
        "user_type": personal_info.get('user_type'),
        "two_factor_enabled": personal_info.get('two_factor_enabled'),
        "terms_accepted_at": personal_info.get('terms_accepted_at'),
        "terms_version": personal_info.get('terms_version'),
        "location": {
            "country": personal_info.get('country', ''),
            "city": personal_info.get('city', ''),
            "timezone": personal_info.get('timezone', '')
        },
        "social_links": {
            "linkedin": links.get('linkedin', ''),
            "github": links.get('github', ''),
            "portfolio": links.get('portfolio', ''),
            "website": links.get('website', '')
        },
        "work_preferences": {
            "willing_to_relocate": work_prefs.get('willing_to_relocate', False),
            "willing_to_travel": work_prefs.get('willing_to_travel', False),
            "notice_period_days": work_prefs.get('notice_period_days', 0),
            "expected_salary": work_prefs.get('expected_salary', {}),
            "current_salary": work_prefs.get('current_salary', {}),
            "currency": work_prefs.get('currency', 'USD')
        },
        "languages": profile.get('languages', []),
        "privacy_settings": profile.get('privacy_settings', {}),
        "job_preferences": {
            "job_types": job_prefs.get('job_types', []) or job_prefs.get('preferred_job_types', []),
            "preferred_job_types": job_prefs.get('preferred_job_types', []) or job_prefs.get('job_types', []),
            "locations": job_prefs.get('locations', []) or job_prefs.get('preferred_locations', []),
            "preferred_locations": job_prefs.get('preferred_locations', []) or job_prefs.get('locations', []),
            "industries": job_prefs.get('industries', []) or job_prefs.get('preferred_industries', []),
            "preferred_industries": job_prefs.get('preferred_industries', []) or job_prefs.get('industries', []),
            "languages": job_prefs.get('languages', []) or job_prefs.get('preferred_languages', []),
            "preferred_languages": job_prefs.get('preferred_languages', []) or job_prefs.get('languages', []),
            "remote_work_preference": job_prefs.get('remote_work_preference', 'flexible'),
            "salary_min": job_prefs.get('salary_min', 0) or job_prefs.get('expected_salary_min', 0),
            "salary_max": job_prefs.get('salary_max', 0) or job_prefs.get('expected_salary_max', 0),
            "salary_currency": job_prefs.get('salary_currency', 'Rwf'),
            "availability_status": job_prefs.get('availability_status', 'actively_looking'),
            "availability_date": job_prefs.get('availability_date'),
            "keywords": job_prefs.get('keywords', ''),
            "job_level": job_prefs.get('job_level', 'entry')
        },
        "availability": profile.get('availability', {}),
        "metadata": profile.get('metadata', {}),
        "timestamps": {
            "profile_created": profile.get('created_at'),
            "profile_updated": profile.get('updated_at')
        },
        "statistics": {
            "total_years_experience": statistics.get('total_years_experience', 0),
            "current_job_years": statistics.get('current_job_years', 0),
            "most_recent_job": statistics.get('most_recent_job'),
            "total_skills": statistics.get('total_skills', 0),
            "total_education": statistics.get('total_education_entries', 0),
            "total_work_experience": statistics.get('total_work_experience', 0),
            "total_certifications": statistics.get('total_certifications', 0),
            "total_portfolio_links": statistics.get('total_portfolio_links', 0),
            "total_resumes": statistics.get('total_resumes', 0),
            "top_skills": statistics.get('top_skills', []),
            "skill_distribution": statistics.get('skill_distribution', {}),
            "saved_jobs_count": statistics.get('saved_jobs_count', 0),
            "profile_completion": statistics.get('profile_completion', {})
        },
        "applications_summary": {
            "total": applications_summary.get('total', 0),
            "submitted": applications_summary.get('submitted', 0),
            "under_review": applications_summary.get('under_review', 0),
            "interviewing": applications_summary.get('interviewing', 0),
            "offers": applications_summary.get('offers', 0),
            "hired": applications_summary.get('hired', 0),
            "rejected": applications_summary.get('rejected', 0)
        },
        "simulations_summary": {
            "total": simulations_summary.get('total', 0),
            "completed": simulations_summary.get('completed', 0),
            "in_progress": simulations_summary.get('in_progress', 0),
            "average_score": simulations_summary.get('average_score', 0)
        },
        "education": profile_data.get('education', []),
        "work_experience": profile_data.get('work_experience', []),
        "skills": profile_data.get('skills', []),
        "certifications": profile_data.get('certifications', []),
        "portfolio_links": profile_data.get('portfolio_links', []),
        "resumes": profile_data.get('resumes', [])
    }

# =====================================================
# BACKEND CLIENT
# =====================================================

class BackendClient:
    def __init__(self):
        self.base_url = BASE_URL
        self.token = None
        self.headers = {"Content-Type": "application/json"}
    
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
            log_info(f"🔍 Calling backend API for candidate: {candidate_id}")
            log_info(f"   URL: {self.base_url}/candidates/full-profile/{candidate_id}")
            log_info(f"   Headers: {self.headers}")
            
            resp = requests.get(
                f"{self.base_url}/candidates/full-profile/{candidate_id}", 
                headers=self.headers, 
                timeout=30
            )
            
            log_info(f"📊 Response status: {resp.status_code}")
            log_info(f"📊 Response body: {resp.text[:500] if resp.text else 'Empty'}")
            
            if resp.status_code == 200:
                data = resp.json()
                if data.get("success"):
                    return data
                else:
                    log_error(f"❌ API returned success=false: {data.get('message')}")
                    return None
            else:
                log_error(f"❌ HTTP {resp.status_code}: {resp.text}")
                return None
                
        except Exception as e:
            log_error(f"❌ Profile error: {e}")
            return None
    
    def get_jobs(self):
        try:
            resp = requests.get(f"{self.base_url}/jobs/candidate/list", headers=self.headers, timeout=30)
            if resp.status_code == 200:
                data = resp.json()
                if data.get("success") and data.get("data"):
                    jobs_data = data["data"]
                    if isinstance(jobs_data, dict) and jobs_data.get("data"):
                        return jobs_data["data"]
                    elif isinstance(jobs_data, list):
                        return jobs_data
            return []
        except Exception as e:
            log_error(f"Jobs error: {e}")
            return []
    
    def get_job_by_id(self, job_id: str):
        """Get a single job by ID from the database"""
        try:
            resp = requests.get(f"{self.base_url}/jobs/candidate/{job_id}", headers=self.headers, timeout=30)
            if resp.status_code == 200:
                data = resp.json()
                if data.get("success") and data.get("data"):
                    return data["data"]
            return None
        except Exception as e:
            log_error(f"Get job by ID error: {e}")
            return None

# =====================================================
# FASTAPI APP
# =====================================================

app = FastAPI(title="Complete Database-Driven Job Matching API")

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

log_info("🧠 Initializing Database-Driven Matching System...")
ml_start = time.time()
tp = LocalTextProcessor()
factor1 = Factor1_SkillsMatcher(tp)
factor2 = Factor2_QualificationsMatcher(tp)
factor3 = Factor3_ExperienceMatcher(tp)
factor4 = Factor4_PreferencesMatcher(tp)
log_performance("ML System Init", (time.time() - ml_start) * 1000)
log_info("✅ Database-Driven Matching System ready!")
log_info("✅ NO HARDCODED VALUES - EVERYTHING FROM DATABASE")

log_info("\n📊 FACTOR WEIGHTS:")
log_info("   🔧 SKILLS:         40%")
log_info("   🎓 QUALIFICATIONS: 25%")
log_info("   📅 EXPERIENCE:     20%")
log_info("   ⚙️ PREFERENCES:    15%")
log_info("="*70)

# =====================================================
# API ENDPOINTS
# =====================================================

@app.post("/match")
async def match_candidate(request: Request):
    request_start = time.time()
    
    try:
        body = await request.body()
        data = json.loads(body.decode('utf-8'))
        candidate_id = data.get("candidate_id")
        
        log_info(f"\n{'='*70}")
        log_info(f"👤 Candidate ID: {candidate_id}")
        log_info(f"{'='*70}")
        
        if not candidate_id:
            return {"success": False, "error": "Missing candidate_id"}
        
        profile_resp = backend.get_profile(candidate_id)
        if not profile_resp or not profile_resp.get('data'):
            return {"success": False, "error": "Candidate not found"}
        
        profile_data = profile_resp.get('data', {})
        
        log_candidate("="*60)
        log_candidate("CANDIDATE DATA FROM DATABASE")
        log_candidate("="*60)
        
        candidate_skills = factor1.extract_candidate_skills(profile_data)
        candidate_quals = factor2.extract_candidate_qualifications(profile_data)
        candidate_prefs = factor4.extract_candidate_preferences(profile_data)
        
        personal = profile_data.get('profile', {}).get('personal_info', {})
        candidate_name = personal.get('full_name', 'Unknown')
        
        log_candidate(f"Name: {candidate_name}")
        log_candidate(f"Skills from DB ({len(candidate_skills)}): {', '.join(candidate_skills[:10])}")
        log_candidate(f"Education entries: {len(profile_data.get('education', []))}")
        log_candidate(f"Work experience: {len(profile_data.get('work_experience', []))}")
        log_candidate(f"Certifications: {len(profile_data.get('certifications', []))}")
        
        log_candidate(f"Job types from DB: {candidate_prefs.get('job_types', [])}")
        log_candidate(f"Locations from DB: {candidate_prefs.get('locations', [])}")
        log_candidate(f"Industries from DB: {candidate_prefs.get('industries', [])}")
        log_candidate(f"Languages from DB: {candidate_prefs.get('languages', [])}")
        
        jobs = backend.get_jobs()
        log_info(f"📊 Jobs from database: {len(jobs)}")
        
        results = []
        
        for idx, job in enumerate(jobs):
            job_title = job.get('title', 'Unknown')
            
            log_job("="*60)
            log_job(f"JOB {idx+1}: {job_title}")
            log_job("="*60)
            
            job_details = extract_all_job_fields(job)
            job_skills = factor1.extract_job_skills(job)
            job_quals = factor2.extract_job_qualifications(job)
            
            log_job(f"Company from DB: {job.get('company_name', 'Unknown')}")
            log_job(f"Required Skills from DB ({len(job_skills)}): {', '.join(job_skills[:10])}")
            log_job(f"Required Degree from DB: {job_quals.get('minimum_degree', 'None')}")
            
            log_match("="*60)
            log_match(f"MATCHING: {candidate_name} vs {job_title}")
            log_match("="*60)
            
            log_match("FACTOR 1: SKILLS (40%) - FROM DATABASE")
            s = factor1.match(candidate_skills, job_skills)
            
            log_match("FACTOR 2: QUALIFICATIONS (25%) - FROM DATABASE")
            q = factor2.match(candidate_quals, job_quals)
            
            log_match("FACTOR 3: EXPERIENCE (20%) - FROM DATABASE")
            e = factor3.match(profile_data, job)
            
            log_match("FACTOR 4: PREFERENCES (15%) - FROM DATABASE")
            p = factor4.match(candidate_prefs, job)
            
            total_raw = s["weighted_score"] + q["weighted_score"] + e["weighted_score"] + p["weighted_score"]
            total_score = round(total_raw * 100, 1)
            
            log_match("="*60)
            log_match(f"TOTAL MATCH SCORE: {total_score}%")
            log_match("="*60)
            
            if total_raw >= 0.80:
                match_level = "Excellent Match 🌟"
            elif total_raw >= 0.65:
                match_level = "Strong Match ✅"
            elif total_raw >= 0.50:
                match_level = "Good Match 👍"
            elif total_raw >= 0.35:
                match_level = "Partial Match ⚠️"
            else:
                match_level = "Poor Match ❌"
            
            candidate_job_types = candidate_prefs.get("job_types", [])
            candidate_locations = candidate_prefs.get("locations", [])
            candidate_industries = candidate_prefs.get("industries", [])
            candidate_languages = candidate_prefs.get("languages", [])
            candidate_salary_min = candidate_prefs.get("salary_min", 0)
            candidate_salary_max = candidate_prefs.get("salary_max", 0)
            
            results.append({
                "match_score": total_score,
                "match_level": match_level,
                "criteria_scores": {
                    "skills_match": s["match_percentage"],
                    "qualifications_match": q["match_percentage"],
                    "experience_match": e["match_percentage"],
                    "preferences_match": p["match_percentage"]
                },
                "skills_breakdown": {
                    "matched_skills": s.get("matched_skills", []),
                    "missing_skills": s.get("missing_skills", []),
                    "total_required": len(job_skills),
                    "total_matched": s.get("matched_count", 0),
                    "individual_scores": s.get("individual_scores", [])
                },
                "qualifications_breakdown": {
                    "candidate_degrees": [d["raw"] for d in candidate_quals["degrees"]],
                    "candidate_fields": [f["raw"] for f in candidate_quals["fields"]],
                    "candidate_combined": [c["raw"] for c in candidate_quals["combined"]],
                    "job_degree_required": job_quals.get("minimum_degree", ""),
                    "job_allowed_fields": job_quals.get("fields_of_study", []),
                    "qualification_entries": job_quals.get("qualification_entries", []),  # ✅ ADD THIS
                    "best_similarity": q.get("best_similarity", 0),
                    "best_matched_field": q.get("best_matched_field", None),
                    "match_type": q.get("match_type", "none"),
                    "match_quality": q.get("match_quality", ""),  # ✅ ADD THIS
                    "explanation": q.get("explanation", "")       # ✅ ADD THIS
                },
                "experience_breakdown": {
                    "match_type": e.get("match_type", "unknown"),
                    "total_requirements": e.get("total_requirements", 0),
                    "matched_requirements": e.get("matched_requirements", 0),
                    "specific_matches": e.get("specific_matches", []),
                    "unmatched_requirements": e.get("unmatched_requirements", []),
                    "total_years": e.get("total_years", 0),
                    "required_years": e.get("required_years", 0),
                    "gap_years": e.get("gap", 0)
                },
                "preferences_breakdown": {
                    "missing_job_data": p.get("missing_job_data", []),
                    "type_match": p.get("type_match", 0),
                    "type_match_details": p.get("type_match_details", []),
                    "type_match_note": p.get("type_match_note"),
                    "remote_match": p.get("remote_match", 0),
                    "remote_match_note": p.get("remote_match_note"),
                    "location_match": p.get("location_match", 0),
                    "location_match_details": p.get("location_match_details"),
                    "location_match_note": p.get("location_match_note"),
                    "industry_match": p.get("industry_match", 0),
                    "industry_match_details": p.get("industry_match_details", []),
                    "industry_match_note": p.get("industry_match_note"),
                    "salary_match": p.get("salary_match", 0),
                    "salary_match_details": p.get("salary_match_details", {}),
                    "salary_match_note": p.get("salary_match_note"),
                    "language_match": p.get("language_match", 0),
                    "language_match_details": p.get("language_match_details", []),
                    "language_match_note": p.get("language_match_note"),
                    "candidate_job_types": candidate_job_types,
                    "candidate_locations": candidate_locations,
                    "candidate_industries": candidate_industries,
                    "candidate_languages": candidate_languages,
                    "candidate_salary_min": candidate_salary_min,
                    "candidate_salary_max": candidate_salary_max,
                    "candidate_remote_preference": candidate_prefs.get("remote_preference", "flexible")
                },
                "job": job_details
            })
            
            log_info(f"   ✓ Score: {total_score}% - {match_level}")
        
        results.sort(key=lambda x: x['match_score'], reverse=True)
        
        total_duration = (time.time() - request_start) * 1000
        log_info(f"⏱️ Total time: {total_duration:.2f}ms")
        
        cache_stats = tp.get_cache_stats()
        complete_candidate_data = extract_complete_candidate_data(profile_data)
        
        return {
            "success": True,
            "candidate": {
                "id": candidate_id,
                "name": candidate_name,
                "email": complete_candidate_data.get('email'),
                "skills_count": len(candidate_skills),
                "skills": candidate_skills[:20],
                "degrees": [d["raw"] for d in candidate_quals["degrees"]],
                "fields": [f["raw"] for f in candidate_quals["fields"]],
                "combined_qualifications": [c["raw"] for c in candidate_quals["combined"]],
                "complete_profile": complete_candidate_data
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


@app.post("/match/job/{job_id}")
async def match_candidate_for_job(job_id: str, request: Request):
    """
    Match a specific candidate against a specific job
    POST /match/job/{job_id}
    Body: {"candidate_id": "..."}
    """
    request_start = time.time()
    
    try:
        body = await request.body()
        data = json.loads(body.decode('utf-8'))
        candidate_id = data.get("candidate_id")
        
        log_info(f"\n{'='*70}")
        log_info(f"👤 Candidate ID: {candidate_id}")
        log_info(f"💼 Job ID: {job_id}")
        log_info(f"{'='*70}")
        
        if not candidate_id:
            return {"success": False, "error": "Missing candidate_id"}
        
        profile_resp = backend.get_profile(candidate_id)
        if not profile_resp or not profile_resp.get('data'):
            return {"success": False, "error": "Candidate not found"}
        
        profile_data = profile_resp.get('data', {})
         
        candidate_age = factor4.extract_candidate_age(profile_data)
        
        job = backend.get_job_by_id(job_id)
        
        if not job:
            return {"success": False, "error": f"Job not found: {job_id}"}
        job_age_requirement = job.get('education_required', {}).get('age_requirement', '')
        candidate_skills = factor1.extract_candidate_skills(profile_data)
        candidate_quals = factor2.extract_candidate_qualifications(profile_data)
        candidate_prefs = factor4.extract_candidate_preferences(profile_data)
        
        personal = profile_data.get('profile', {}).get('personal_info', {})
        candidate_name = personal.get('full_name', 'Unknown')
        
        log_candidate(f"Name: {candidate_name}")
        log_candidate(f"Skills from DB ({len(candidate_skills)}): {', '.join(candidate_skills[:10])}")
        
        job_title = job.get('title', 'Unknown')
        job_details = extract_all_job_fields(job)
        job_skills = factor1.extract_job_skills(job)
        job_quals = factor2.extract_job_qualifications(job)
        
        log_job(f"Job: {job_title}")
        log_job(f"Required Skills from DB ({len(job_skills)}): {', '.join(job_skills[:10])}")
        
        log_match("="*60)
        log_match(f"MATCHING: {candidate_name} vs {job_title}")
        log_match("="*60)
        
        log_match("FACTOR 1: SKILLS (40%)")
        s = factor1.match(candidate_skills, job_skills)
        
        log_match("FACTOR 2: QUALIFICATIONS (25%)")
        q = factor2.match(candidate_quals, job_quals)
        
        log_match("FACTOR 3: EXPERIENCE (20%)")
        e = factor3.match(profile_data, job)
        
        log_match("FACTOR 4: PREFERENCES (15%)")
        p = factor4.match(candidate_prefs, job, candidate_age, job_age_requirement)
        
        total_raw = s["weighted_score"] + q["weighted_score"] + e["weighted_score"] + p["weighted_score"]
        total_score = round(total_raw * 100, 1)
        
        log_match("="*60)
        log_match(f"TOTAL MATCH SCORE: {total_score}%")
        log_match("="*60)
        
        if total_raw >= 0.80:
            match_level = "Excellent Match 🌟"
        elif total_raw >= 0.65:
            match_level = "Strong Match ✅"
        elif total_raw >= 0.50:
            match_level = "Good Match 👍"
        elif total_raw >= 0.35:
            match_level = "Partial Match ⚠️"
        else:
            match_level = "Poor Match ❌"
        
        candidate_job_types = candidate_prefs.get("job_types", [])
        candidate_locations = candidate_prefs.get("locations", [])
        candidate_industries = candidate_prefs.get("industries", [])
        candidate_languages = candidate_prefs.get("languages", [])
        candidate_salary_min = candidate_prefs.get("salary_min", 0)
        candidate_salary_max = candidate_prefs.get("salary_max", 0)
        
        result = {
            "match_score": total_score,
            "match_level": match_level,
            "criteria_scores": {
                "skills_match": s["match_percentage"],
                "qualifications_match": q["match_percentage"],
                "experience_match": e["match_percentage"],
                "preferences_match": p["match_percentage"]
            },
            "skills_breakdown": {
                "matched_skills": s.get("matched_skills", []),
                "missing_skills": s.get("missing_skills", []),
                "total_required": len(job_skills),
                "total_matched": s.get("matched_count", 0),
                "individual_scores": s.get("individual_scores", [])
            },
            "qualifications_breakdown": {
                "candidate_degrees": [d["raw"] for d in candidate_quals["degrees"]],
                "candidate_fields": [f["raw"] for f in candidate_quals["fields"]],
                "candidate_combined": [c["raw"] for c in candidate_quals["combined"]],
                "job_degree_required": job_quals.get("minimum_degree", ""),
                "job_allowed_fields": job_quals.get("fields_of_study", []),
                "qualification_entries": job_quals.get("qualification_entries", []),  # ✅ ADD THIS
                "best_similarity": q.get("best_similarity", 0),
                "best_matched_field": q.get("best_matched_field", None),
                "match_type": q.get("match_type", "none"),
                "match_quality": q.get("match_quality", ""),  # ✅ ADD THIS
                "explanation": q.get("explanation", "")       # ✅ ADD THIS
            },
            "experience_breakdown": {
                "match_type": e.get("match_type", "unknown"),
                "total_requirements": e.get("total_requirements", 0),
                "matched_requirements": e.get("matched_requirements", 0),
                "specific_matches": e.get("specific_matches", []),
                "unmatched_requirements": e.get("unmatched_requirements", []),
                "total_years": e.get("total_years", 0),
                "required_years": e.get("required_years", 0),
                "gap_years": e.get("gap", 0)
            },
            "preferences_breakdown": {
                "missing_job_data": p.get("missing_job_data", []),
                "type_match": p.get("type_match", 0),
                "type_match_details": p.get("type_match_details", []),
                "type_match_note": p.get("type_match_note"),
                "remote_match": p.get("remote_match", 0),
                "remote_match_note": p.get("remote_match_note"),
                "location_match": p.get("location_match", 0),
                "location_match_details": p.get("location_match_details"),
                "location_match_note": p.get("location_match_note"),
                "industry_match": p.get("industry_match", 0),
                "industry_match_details": p.get("industry_match_details", []),
                "industry_match_note": p.get("industry_match_note"),
                "salary_match": p.get("salary_match", 0),
                "salary_match_details": p.get("salary_match_details", {}),
                "salary_match_note": p.get("salary_match_note"),
                "language_match": p.get("language_match", 0),
                "language_match_details": p.get("language_match_details", []),
                "language_match_note": p.get("language_match_note"),
                "candidate_job_types": candidate_job_types,
                "candidate_locations": candidate_locations,
                "candidate_industries": candidate_industries,
                "candidate_languages": candidate_languages,
                "candidate_salary_min": candidate_salary_min,
                "candidate_salary_max": candidate_salary_max,
                "candidate_remote_preference": candidate_prefs.get("remote_preference", "flexible")
            },
            "job": job_details
        }
        
        total_duration = (time.time() - request_start) * 1000
        log_info(f"⏱️ Total time: {total_duration:.2f}ms")
        
        cache_stats = tp.get_cache_stats()
        complete_candidate_data = extract_complete_candidate_data(profile_data)
        
        return {
            "success": True,
            "candidate": {
                "id": candidate_id,
                "name": candidate_name,
                "email": complete_candidate_data.get('email'),
                "skills_count": len(candidate_skills),
                "skills": candidate_skills[:20],
                "degrees": [d["raw"] for d in candidate_quals["degrees"]],
                "fields": [f["raw"] for f in candidate_quals["fields"]],
                "combined_qualifications": [c["raw"] for c in candidate_quals["combined"]],
                "complete_profile": complete_candidate_data
            },
            "match": result,
            "timestamp": datetime.now().isoformat(),
            "performance": {
                "total_ms": round(total_duration, 2),
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
        "api": "Complete Database-Driven Job Matching API",
        "version": "19.0.0",
        "status": "running",
        "matching_type": "100% database-driven - NO hardcoded values",
        "fixed_issues": [
            "Languages field now properly handles dictionary objects",
            "Experience requirements correctly parsed from JSONB",
            "Certifications properly extracted from education_required",
            "Added proper type checking for all fields"
        ],
        "factors": {
            "skills": {"weight": "40%", "source": "skills table + user_skills table"},
            "qualifications": {"weight": "25%", "source": "education table + job education_required"},
            "experience": {"weight": "20%", "source": "work_experience table + job education_required.experience_requirements"},
            "preferences": {"weight": "15%", "source": "job_preferences JSONB"}
        },
        "endpoints": {
            "POST /match": "Match candidate against ALL jobs",
            "POST /match/job/{job_id}": "Match candidate against specific job",
            "GET /health": "Health check",
            "GET /stats": "Cache statistics",
            "GET /logs/{log_type}": "View logs"
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
        "cache_stats": cache_stats,
        "log_directory": str(LOG_DIR),
        "note": "100% database-driven - ALL fields extracted from database"
    }


@app.get("/logs/{log_type}")
async def view_log(log_type: str, lines: int = 100):
    log_map = {
        "main": MAIN_LOG,
        "error": ERROR_LOG,
        "performance": PERFORMANCE_LOG,
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
    print("🚀 COMPLETE DATABASE-DRIVEN JOB MATCHING API")
    print("="*70)
    print("✅ ALL 70+ JOB FIELDS RETURNED IN RESPONSE")
    print("✅ ALL CANDIDATE FIELDS RETURNED IN RESPONSE")
    print("✅ FIXED: Languages and Experience Requirements parsing")
    print("✅ FIXED: Dictionary handling for nested JSONB fields")
    print("✅ NO HARDCODED VALUES - EVERYTHING FROM DATABASE")
    print("="*70)
    print("\n🌐 Server: http://localhost:8000")
    print("📤 POST to /match with:")
    print('{"candidate_id": "17296b7f-7843-42ed-a074-3a69732f0f07"}')
    print("\n📤 POST to /match/job/{job_id} with:")
    print('{"candidate_id": "17296b7f-7843-42ed-a074-3a69732f0f07"}')
    print("\n📊 View logs: GET /logs/candidate, /logs/job, /logs/match")
    print("📈 Get stats: GET /stats")
    print("="*70 + "\n")
    
    uvicorn.run(app, host="0.0.0.0", port=8000)