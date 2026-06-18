# pyrefly: ignore [missing-import]
import fitz
from services.ocr_service import perform_ocr_on_page

def extract_text_from_pdf_bytes(pdf_bytes: bytes) -> tuple[str, str, int]:
    """
    Given PDF bytes, extracts text using PyMuPDF.
    If the page text length is low or it contains images/drawings, runs OCR on that page.
    Returns: (extracted_text, method, page_count)
    """
    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        page_count = len(doc)
    except Exception as e:
        raise ValueError(f"Corrupted or invalid PDF file: {str(e)}")
        
    formatted_pages = []
    ocr_pages_count = 0
    text_pages_count = 0
    
    for page_num in range(page_count):
        page = doc.load_page(page_num)
        page_text = page.get_text()
        
        page_text_stripped = page_text.strip()
        
        # Determine if page needs OCR:
        # 1. Text length is under 100 characters, or
        # 2. Page contains images/drawings and text is under 250 characters.
        needs_ocr = len(page_text_stripped) < 100 or (len(page.get_images()) > 0 and len(page_text_stripped) < 250)
        
        if needs_ocr:
            try:
                ocr_text = perform_ocr_on_page(page)
                if ocr_text.strip():
                    formatted_pages.append(f"--- Page {page_num + 1} (OCR) ---\n{ocr_text}")
                    ocr_pages_count += 1
                else:
                    # Fallback to whatever text PyMuPDF extracted if OCR returned nothing
                    formatted_pages.append(f"--- Page {page_num + 1} ---\n{page_text}")
                    text_pages_count += 1
            except Exception:
                # If page OCR fails, fallback to page_text to avoid crashing the pipeline
                formatted_pages.append(f"--- Page {page_num + 1} ---\n{page_text}")
                text_pages_count += 1
        else:
            formatted_pages.append(f"--- Page {page_num + 1} ---\n{page_text}")
            text_pages_count += 1
            
    full_text = "\n\n".join(formatted_pages)
    
    if ocr_pages_count == page_count:
        method = "ocr"
    elif text_pages_count == page_count:
        method = "text"
    else:
        method = "hybrid"
        
    return full_text, method, page_count

