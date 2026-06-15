# pyrefly: ignore [missing-import]
import fitz
from services.ocr_service import perform_ocr_on_pdf

def extract_text_from_pdf_bytes(pdf_bytes: bytes) -> tuple[str, str, int]:
    """
    Given PDF bytes, extracts text using PyMuPDF.
    If the text length is under 100 characters, falls back to OCR.
    Returns: (extracted_text, method, page_count)
    """
    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        page_count = len(doc)
    except Exception as e:
        raise ValueError(f"Corrupted or invalid PDF file: {str(e)}")
        
    extracted_pages = []
    for page_num in range(page_count):
        page = doc.load_page(page_num)
        page_text = page.get_text()
        extracted_pages.append(page_text)
        
    text_content_only = "".join(extracted_pages).strip()
    
    if len(text_content_only) >= 100:
        formatted_pages = [f"--- Page {i + 1} ---\n{text}" for i, text in enumerate(extracted_pages)]
        full_text = "\n\n".join(formatted_pages)
        method = "text"
    else:
        full_text = perform_ocr_on_pdf(pdf_bytes)
        method = "ocr"
        
    return full_text, method, page_count
