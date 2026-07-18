import uvicorn
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from classifier import classifier
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

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
