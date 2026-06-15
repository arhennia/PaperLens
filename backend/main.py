# pyrefly: ignore [missing-import]
from fastapi import FastAPI, UploadFile, File, HTTPException
# pyrefly: ignore [missing-import]
from fastapi.middleware.cors import CORSMiddleware
# pyrefly: ignore [missing-import]
import fitz  # PyMuPDF
# pyrefly: ignore [missing-import]
from services.ocr_service import perform_ocr_on_pdf

app = FastAPI(title="PaperLens API", description="Milestone 2 - PDF OCR Extraction Fallback")

# Enable CORS for the local frontend development server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins for MVP. Can be restricted to ["http://localhost:5173"] later.
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"message": "PaperLens API is running. Use POST /api/upload to extract text from a PDF with OCR fallback."}

@app.post("/api/upload")
async def upload_pdf(file: UploadFile = File(...)):
    # Verify file extension
    filename = file.filename
    if not filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=400,
            detail="Invalid file format. Only PDF files are supported."
        )
    
    try:
        # Read the file contents into memory
        pdf_bytes = await file.read()
        
        # Open PDF from bytes
        try:
            doc = fitz.open(stream=pdf_bytes, filetype="pdf")
            page_count = len(doc)
        except Exception as e:
            raise HTTPException(
                status_code=400,
                detail=f"Corrupted or invalid PDF file: {str(e)}"
            )
        
        # Try normal text extraction first
        extracted_pages = []
        for page_num in range(page_count):
            page = doc.load_page(page_num)
            page_text = page.get_text()
            extracted_pages.append(page_text)
        
        text_content_only = "".join(extracted_pages).strip()
        
        # Decide fallback to OCR if normal text is below 100 characters
        if len(text_content_only) >= 100:
            formatted_pages = [f"--- Page {i + 1} ---\n{text}" for i, text in enumerate(extracted_pages)]
            full_text = "\n\n".join(formatted_pages)
            method = "text"
        else:
            # Activate OCR pipeline
            try:
                full_text = perform_ocr_on_pdf(pdf_bytes)
                method = "ocr"
            except RuntimeError as re:
                raise HTTPException(
                    status_code=500,
                    detail=str(re)
                )
            except Exception as e:
                raise HTTPException(
                    status_code=500,
                    detail=f"OCR processing failed: {str(e)}"
                )
        
        return {
            "filename": filename,
            "pageCount": page_count,
            "extractionMethod": method,
            "extractedText": full_text
        }
        
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"An error occurred while processing the PDF: {str(e)}"
        )
