# ============================================
# MRS COMMUNICATION CLASSIFIER - COMPLETE API
# RUN ON PORT 8091
# ============================================

import re
import joblib
import pandas as pd
import numpy as np
import os
import json
from typing import Dict, Any, List, Optional
from fastapi import FastAPI, HTTPException, UploadFile, File, Form, BackgroundTasks
from fastapi.responses import JSONResponse, FileResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from datetime import datetime
import io
import uvicorn
from contextlib import asynccontextmanager
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, accuracy_score

# ============================================
# CONFIGURATION
# ============================================

CSV_PATH = 'emails_subset.csv'
MODEL_PATH = 'email_style_classifier.pkl'
VECTORIZER_PATH = 'vectorizer.pkl'
API_PORT = 8091
API_HOST = "0.0.0.0"

# Global variables
rf_model = None
vectorizer_model = None
training_status = {
    "is_training": False,
    "last_training_time": None,
    "accuracy": None,
    "samples_used": None,
    "class_report": None,
    "message": None
}

# ============================================
# TEXT CLEANING FUNCTION
# ============================================

def extract_email_body(raw_message: str) -> str:
    "Extract clean text body from raw email format"
    if not isinstance(raw_message, str):
        return 
    
    parts = re.split(r'\n\s*\n', raw_message, maxsplit=1)
    body = parts[1] if len(parts) > 1 else raw_message
    
    lines = body.split('\n')
    clean_lines = []
    skip_header = False
    
    for line in lines:
        if re.match(r'^(From:|To:|Cc:|Bcc:|Subject:|Date:|Sent:|Received:)', line, re.IGNORECASE):
            skip_header = True
            continue
        elif skip_header and line.strip() == '':
            skip_header = False
            continue
        elif not skip_header:
            clean_lines.append(line)
    
    clean_body = ''.join(clean_lines)
    clean_body = re.sub(r'\s+', '', clean_body).strip()
    return clean_body[:2000]

# ============================================
# AUTO-LABEL FUNCTION
# ============================================

def auto_label_email(text: str) -> str:
    "Automatically label email as formal, semi-formal, or informal"
    text_lower = text.lower()
    
    formal_patterns = [
        'dear sir', 'dear madam', 'attached please', 'please find attached',
        'per our', 'pursuant', 'sincerely', 'submitted for your approval'
    ]
    for pattern in formal_patterns:
        if pattern in text_lower:
            return 'formal'
    
    informal_patterns = [
        'no problem', 'pls', 'u ', 'ur ', 'thx', 'dumb',
        'sent from my blackberry', 'hey ', 'sorry'
    ]
    for pattern in informal_patterns:
        if pattern in text_lower:
            return 'informal'
    
    return 'semi-formal'

# ============================================
# TRAIN MODEL FUNCTION
# ============================================

def train_model_from_csv(csv_path: str = None, max_samples: int = 10000):
    "Train the Random Forest model"
    
    global training_status
    
    training_status["is_training"] = True
    training_status["message"] = "Training started..."
    
    try:
        file_path = csv_path if csv_path else CSV_PATH
        
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"CSV file not found at: {file_path}")
        
        print(f"📂 Loading data from: {file_path}")
        df = pd.read_csv(file_path)
        
        df['clean_body'] = df['message'].apply(extract_email_body)
        df = df[df['clean_body'].str.len() > 50]
        df = df.head(max_samples)
        
        df['label'] = df['clean_body'].apply(auto_label_email)
        
        # Balance dataset
        min_class = df['label'].value_counts().min()
        balanced_dfs = []
        for label in df['label'].unique():
            class_df = df[df['label'] == label]
            sampled = class_df.sample(n=min(min_class, 2000), random_state=42)
            balanced_dfs.append(sampled)
        
        balanced_df = pd.concat(balanced_dfs, ignore_index=True)
        
        # Train model
        vectorizer = TfidfVectorizer(
            max_features=1000,
            stop_words='english',
            ngram_range=(1, 2)
        )
        
        X = vectorizer.fit_transform(balanced_df['clean_body'])
        y = balanced_df['label']
        
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.2, random_state=42, stratify=y
        )
        
        rf = RandomForestClassifier(
            n_estimators=200,
            max_depth=20,
            random_state=42,
            n_jobs=-1
        )
        
        rf.fit(X_train, y_train)
        
        y_pred = rf.predict(X_test)
        accuracy = accuracy_score(y_test, y_pred)
        report = classification_report(y_test, y_pred, output_dict=True)
        
        # Save model
        joblib.dump(rf, MODEL_PATH)
        joblib.dump(vectorizer, VECTORIZER_PATH)
        
        training_status["is_training"] = False
        training_status["last_training_time"] = datetime.now().isoformat()
        training_status["accuracy"] = accuracy
        training_status["samples_used"] = len(balanced_df)
        training_status["class_report"] = report
        training_status["message"] = "Training completed successfully"
        
        print(f"''Training complete! Accuracy: {accuracy:.3f}")
        
        return rf, vectorizer, accuracy, report
        
    except Exception as e:
        training_status["is_training"] = False
        training_status["message"] = f"Training failed: {str(e)}"
        print(f" Training failed: {e}")
        raise

def load_model():
    "Load existing model"
    global rf_model, vectorizer_model
    if os.path.exists(MODEL_PATH) and os.path.exists(VECTORIZER_PATH):
        rf_model = joblib.load(MODEL_PATH)
        vectorizer_model = joblib.load(VECTORIZER_PATH)
        print("''Model loaded successfully")
        return True
    print(" No model found. Use POST /train to train")
    return False

# ============================================
# PREDICTION FUNCTION
# ============================================

def predict_style(email_text: str) -> Dict[str, Any]:
    "Predict communication style"
    global rf_model, vectorizer_model
    
    cleaned = extract_email_body(email_text)
    
    if len(cleaned) < 20:
        return {
            'style': 'too_short',
            'confidence': 0.0,
            'communication_score': 0
        }
    
    vec = vectorizer_model.transform([cleaned])
    pred = rf_model.predict(vec)[0]
    probs = rf_model.predict_proba(vec)[0]
    
    score_map = {'formal': 100, 'semi-formal': 70, 'informal': 30}
    
    return {
        'style': pred,
        'confidence': float(max(probs)),
        'communication_score': score_map.get(pred, 50),
        'probabilities': dict(zip(rf_model.classes_, [float(p) for p in probs]))
    }

def analyze_chat(messages: List[str]) -> Dict[str, Any]:
    "Analyze chat conversation"
    results = [predict_style(msg) for msg in messages]
    
    formal = sum(1 for r in results if r['style'] == 'formal')
    semi = sum(1 for r in results if r['style'] == 'semi-formal')
    informal = sum(1 for r in results if r['style'] == 'informal')
    avg_score = sum(r['communication_score'] for r in results) / len(results)
    avg_conf = sum(r['confidence'] for r in results) / len(results)
    
    counts = {'formal': formal, 'semi-formal': semi, 'informal': informal}
    dominant = max(counts, key=counts.get)
    
    return {
        'dominant_style': dominant,
        'communication_score': round(avg_score, 2),
        'style_counts': counts,
        'total_messages': len(results),
        'average_confidence': round(avg_conf, 3),
        'recommendation': 'Excellent'if avg_score >= 80 else 'Good'if avg_score >= 60 else 'Needs Improvement'
    }

# ============================================
# PYDANTIC MODELS
# ============================================

class PredictRequest(BaseModel):
    text: str
    candidate_id: Optional[str] = None

class PredictResponse(BaseModel):
    candidate_id: Optional[str] = None
    style: str
    confidence: float
    communication_score: int
    probabilities: Dict[str, float]
    timestamp: str = Field(default_factory=lambda: datetime.now().isoformat())

class ChatRequest(BaseModel):
    messages: List[str]
    conversation_id: Optional[str] = None
    candidate_id: Optional[str] = None

class ChatResponse(BaseModel):
    conversation_id: Optional[str] = None
    candidate_id: Optional[str] = None
    dominant_style: str
    communication_score: float
    style_counts: Dict[str, int]
    total_messages: int
    average_confidence: float
    recommendation: str
    timestamp: str = Field(default_factory=lambda: datetime.now().isoformat())

class TrainRequest(BaseModel):
    csv_path: Optional[str] = None
    max_samples: int = 10000

class TrainResponse(BaseModel):
    success: bool
    message: str
    accuracy: Optional[float] = None
    samples_used: Optional[int] = None
    timestamp: str = Field(default_factory=lambda: datetime.now().isoformat())

class HealthResponse(BaseModel):
    status: str
    model_loaded: bool
    model_accuracy: Optional[float] = None
    version: str = "1.0.0"

class BatchPredictRequest(BaseModel):
    candidates: List[PredictRequest]

class BatchPredictResponse(BaseModel):
    results: List[PredictResponse]
    total_processed: int

class FeedbackRequest(BaseModel):
    text: str
    correct_style: str
    candidate_id: Optional[str] = None

class FeedbackResponse(BaseModel):
    success: bool
    message: str
    feedback_recorded: bool

# ============================================
# FASTAPI APPLICATION
# ============================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("\n" + "="*70)
    print("🔥 MRS COMMUNICATION CLASSIFIER API")
    print("="*70)
    load_model()
    print(f" API: http://{API_HOST}:{API_PORT}")
    print(f" Swagger UI: http://{API_HOST}:{API_PORT}/docs")
    print("="*70)
    yield

app = FastAPI(
    title="MRS Communication Style Classifier API",
    description="Virtual Workspace Evaluation System - Communication Analyzer",
    version="2.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================
# HEALTH & STATUS ENDPOINTS
# ============================================

@app.get("/", response_model=HealthResponse)
async def root():
    return HealthResponse(
        status="running",
        model_loaded=rf_model is not None,
        model_accuracy=training_status.get("accuracy") if training_status else None
    )

@app.get("/health", response_model=HealthResponse)
async def health():
    return HealthResponse(
        status="healthy",
        model_loaded=rf_model is not None,
        model_accuracy=training_status.get("accuracy") if training_status else None
    )

@app.get("/status")
async def status():
    return {
        "model_loaded": rf_model is not None,
        "training_status": training_status,
        "model_info": {
            "classes": list(rf_model.classes_) if rf_model else None
        }
    }

# ============================================
# TRAINING ENDPOINTS
# ============================================

@app.post("/train", response_model=TrainResponse)
async def train(request: TrainRequest, background_tasks: BackgroundTasks):
    "Train the model using CSV data"
    global rf_model, vectorizer_model
    
    if training_status["is_training"]:
        raise HTTPException(status_code=409, detail="Training already in progress")
    
    def training_task():
        global rf_model, vectorizer_model
        rf, vec, acc, _ = train_model_from_csv(request.csv_path, request.max_samples)
        rf_model, vectorizer_model = rf, vec
    
    background_tasks.add_task(training_task)
    
    return TrainResponse(
        success=True,
        message="Training started in background. Check /status for progress.",
        accuracy=None,
        samples_used=None
    )

@app.post("/train/sync")
async def train_sync(request: TrainRequest):
    "Synchronous training - waits for completion"
    global rf_model, vectorizer_model
    
    try:
        rf, vec, acc, report = train_model_from_csv(request.csv_path, request.max_samples)
        rf_model, vectorizer_model = rf, vec
        return {
            "success": True,
            "accuracy": acc,
            "samples_used": training_status["samples_used"],
            "classification_report": report,
            "message": "Training completed successfully"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ============================================
# PREDICTION ENDPOINTS
# ============================================

@app.post("/predict", response_model=PredictResponse)
async def predict(request: PredictRequest):
    "Classify a single message"
    if rf_model is None:
        raise HTTPException(status_code=400, detail="Model not trained. POST to /train first")
    
    result = predict_style(request.text)
    return PredictResponse(
        candidate_id=request.candidate_id,
        style=result['style'],
        confidence=result['confidence'],
        communication_score=result['communication_score'],
        probabilities=result['probabilities']
    )

@app.post("/predict/batch", response_model=BatchPredictResponse)
async def predict_batch(request: BatchPredictRequest):
    "Classify multiple messages"
    if rf_model is None:
        raise HTTPException(status_code=400, detail="Model not trained")
    
    results = []
    for c in request.candidates:
        r = predict_style(c.text)
        results.append(PredictResponse(
            candidate_id=c.candidate_id,
            style=r['style'],
            confidence=r['confidence'],
            communication_score=r['communication_score'],
            probabilities=r['probabilities']
        ))
    
    return BatchPredictResponse(results=results, total_processed=len(results))

# ============================================
# CHAT ANALYSIS ENDPOINTS
# ============================================

@app.post("/analyze/chat", response_model=ChatResponse)
async def analyze(request: ChatRequest):
    "Analyze a chat conversation"
    if rf_model is None:
        raise HTTPException(status_code=400, detail="Model not trained")
    
    result = analyze_chat(request.messages)
    return ChatResponse(
        conversation_id=request.conversation_id,
        candidate_id=request.candidate_id,
        dominant_style=result['dominant_style'],
        communication_score=result['communication_score'],
        style_counts=result['style_counts'],
        total_messages=result['total_messages'],
        average_confidence=result['average_confidence'],
        recommendation=result['recommendation']
    )

# ============================================
# FILE UPLOAD ENDPOINTS
# ============================================

@app.post("/upload/csv")
async def upload_csv(
    file: UploadFile = File(...),
    message_column: str = Form("message")
):
    "Upload and classify CSV file"
    if rf_model is None:
        raise HTTPException(status_code=400, detail="Model not trained")
    
    contents = await file.read()
    df = pd.read_csv(io.BytesIO(contents))
    
    if message_column not in df.columns:
        raise HTTPException(status_code=400, detail=f"Column '{message_column}'not found")
    
    df['predicted_style'] = df[message_column].apply(lambda x: predict_style(str(x))['style'])
    df['confidence'] = df[message_column].apply(lambda x: predict_style(str(x))['confidence'])
    df['communication_score'] = df[message_column].apply(lambda x: predict_style(str(x))['communication_score'])
    
    output_file = f"classified_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
    df.to_csv(output_file, index=False)
    
    return {
        "success": True,
        "total_processed": len(df),
        "style_distribution": df['predicted_style'].value_counts().to_dict(),
        "output_file": output_file,
        "download_url": f"/download/{output_file}"
    }

@app.get("/download/{filename}")
async def download(filename: str):
    "Download a file"
    if os.path.exists(filename):
        return FileResponse(filename, filename=filename)
    raise HTTPException(status_code=404, detail="File not found")

# ============================================
# MODEL MANAGEMENT ENDPOINTS
# ============================================

@app.get("/model/info")
async def model_info():
    "Get model information"
    if rf_model is None:
        return {"model_loaded": False}
    
    return {
        "model_loaded": True,
        "classes": list(rf_model.classes_),
        "model_path": MODEL_PATH,
        "vectorizer_path": VECTORIZER_PATH,
        "training_info": training_status
    }

@app.delete("/model")
async def delete_model():
    "Delete the trained model"
    global rf_model, vectorizer_model
    
    try:
        if os.path.exists(MODEL_PATH):
            os.remove(MODEL_PATH)
        if os.path.exists(VECTORIZER_PATH):
            os.remove(VECTORIZER_PATH)
        
        rf_model, vectorizer_model = None, None
        return {"message": "Model deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ============================================
# FEEDBACK ENDPOINTS
# ============================================

feedback_log = []

@app.post("/feedback")
async def submit_feedback(request: FeedbackRequest):
    "Submit feedback for model improvement"
    feedback_log.append({
        "timestamp": datetime.now().isoformat(),
        "text": request.text,
        "correct_style": request.correct_style,
        "candidate_id": request.candidate_id
    })
    
    with open("feedback_log.json", "w") as f:
        json.dump(feedback_log, f, indent=2)
    
    return FeedbackResponse(
        success=True,
        message="Feedback recorded. Thank you!",
        feedback_recorded=True
    )

@app.get("/feedback")
async def get_feedback():
    "Get all feedback"
    return {"total_feedback": len(feedback_log), "feedback": feedback_log}

# ============================================
# DEMO & TEST ENDPOINTS
# ============================================

@app.get("/demo")
async def demo():
    "Run demo with example messages"
    if rf_model is None:
        return {"error": "Model not trained. Please POST to /train first"}
    
    test_messages = [
        "Dear Sir, attached please find the documents. Sincerely, John",
        "Hey, can u send me that file? thx!",
        "Thanks for the update. I'll review it tomorrow."
    ]
    
    results = []
    for msg in test_messages:
        r = predict_style(msg)
        results.append({
            "text": msg[:60] + "...",
            "style": r['style'],
            "confidence": r['confidence']
        })
    
    return {
        "demo_results": results,
        "model_status": "loaded"
    }

@app.get("/test")
async def test():
    "Test all endpoints"
    return {
        "status": "API is running",
        "endpoints": [
            "GET  /",
            "GET  /health",
            "GET  /status",
            "POST /train",
            "POST /train/sync",
            "POST /predict",
            "POST /predict/batch",
            "POST /analyze/chat",
            "POST /upload/csv",
            "GET  /download/{filename}",
            "GET  /model/info",
            "DELETE /model",
            "POST /feedback",
            "GET  /feedback",
            "GET  /demo",
            "GET  /test"
        ],
        "total_endpoints": 16
    }

# ============================================
# MAIN
# ============================================

if __name__ == "__main__":
    uvicorn.run(app, host=API_HOST, port=API_PORT, reload=False)