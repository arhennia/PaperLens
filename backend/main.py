# pyrefly: ignore [missing-import]
from fastapi import FastAPI, UploadFile, File, HTTPException
# pyrefly: ignore [missing-import]
from fastapi.middleware.cors import CORSMiddleware
# pyrefly: ignore [missing-import]
from services.pdf_service import extract_text_from_pdf_bytes
# pyrefly: ignore [missing-import]
from services.question_extraction_service import parse_questions_from_text, validate_extracted_questions


app = FastAPI(title="PaperLens API", description="Milestone 3 - Question Extraction Engine")

# Enable CORS for the local frontend development server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"message": "PaperLens API is running. Use POST /api/upload to extract structured questions from a PDF."}

@app.post("/api/upload")
async def upload_pdf(file: UploadFile = File(...)):
    filename = file.filename
    if not filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=400,
            detail="Invalid file format. Only PDF files are supported."
        )
    
    try:
        pdf_bytes = await file.read()
        
        # 1. Extract text (with standard fitz or falling back to OCR)
        try:
            raw_text, method, page_count = extract_text_from_pdf_bytes(pdf_bytes)
        except ValueError as ve:
            raise HTTPException(status_code=400, detail=str(ve))
        except RuntimeError as re:
            raise HTTPException(status_code=500, detail=str(re))
            
        # 2. Extract structured questions
        questions, sections_found, parser_warnings = parse_questions_from_text(raw_text)
        
        # 3. Validate extraction
        warnings = validate_extracted_questions(questions, page_count, parser_warnings)
        
        return {
            "filename": filename,
            "pageCount": page_count,
            "extractionMethod": method,
            "questionCount": len(questions),
            "sectionsFound": sections_found,
            "questions": questions,
            "warnings": warnings,
            "extractedText": raw_text  # Kept so the UI raw tab can display it
        }
        
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"An error occurred while processing the PDF: {str(e)}"
        )
