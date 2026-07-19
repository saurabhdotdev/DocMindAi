import os
import uvicorn
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

# Load .env file manually if it exists in the current directory
if os.path.exists(".env"):
    try:
        with open(".env", "r") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, val = line.split("=", 1)
                    os.environ[key.strip()] = val.strip()
    except Exception as e:
        print(f"Error loading .env file: {e}")

from classifier import classifier
from typing import Any
import ai_engine

app = FastAPI(
    title="DocMind AI Service",
    description="Python AI Service providing document classification, OCR layout analysis, entity extraction, and resume ATS profiling.",
    version="1.0.0"
)

class ClassifyRequest(BaseModel):
    text: str

class OcrRequest(BaseModel):
    text: str

class EntityRequest(BaseModel):
    text: str

class ResumeRequest(BaseModel):
    text: str

class IndexRequest(BaseModel):
    docId: str
    text: str
    docName: str = "Document"

class ChatRequest(BaseModel):
    text: str
    question: str
    docId: Any = None

class TranslateRequest(BaseModel):
    blocks: list
    targetLang: str

class CompareRequest(BaseModel):
    docs: list

@app.get("/health")
def health_check():
    return {"status": "ok", "service": "docmind-ai-service"}

@app.post("/v1/classify")
def classify_document(payload: ClassifyRequest):
    try:
        category, confidence = classifier.classify(payload.text)
        return {
            "success": True,
            "category": category,
            "confidence": confidence
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/v1/ocr")
def ocr_document(payload: OcrRequest):
    try:
        result = ai_engine.parse_ocr_layout(payload.text)
        return {
            "success": True,
            "data": result
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/v1/entities")
def extract_document_entities(payload: EntityRequest):
    try:
        result = ai_engine.extract_entities(payload.text)
        return {
            "success": True,
            "entities": result
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/v1/analyze-resume")
def analyze_resume(payload: ResumeRequest):
    try:
        result = ai_engine.analyze_resume_profile(payload.text)
        return {
            "success": True,
            "analysis": result
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/v1/chat")
def ask_document_question(payload: ChatRequest):
    try:
        answer, sources = ai_engine.answer_question(payload.text, payload.question, payload.docId)
        return {
            "success": True,
            "answer": answer,
            "sources": sources
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/v1/index")
def index_document(payload: IndexRequest):
    try:
        success = ai_engine.index_document_to_qdrant(payload.docId, payload.text, payload.docName)
        return {
            "success": success,
            "message": "Document indexed successfully" if success else "Indexing skipped or failed"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/v1/translate")
def translate_layout(payload: TranslateRequest):
    try:
        result = ai_engine.translate_layout_blocks(payload.blocks, payload.targetLang)
        return {
            "success": True,
            "blocks": result
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/v1/compare")
def compare_docs_metrics(payload: CompareRequest):
    try:
        result = ai_engine.compare_documents(payload.docs)
        return {
            "success": True,
            "comparison": result
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
