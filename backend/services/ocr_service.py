# pyrefly: ignore [missing-import]
import fitz  # PyMuPDF
import io
import os
# pyrefly: ignore [missing-import]
from PIL import Image
# pyrefly: ignore [missing-import]
import pytesseract

# Allow setting tesseract path via environment variable TESSERACT_CMD
tesseract_env_path = os.getenv("TESSERACT_CMD")
if tesseract_env_path:
    pytesseract.pytesseract.tesseract_cmd = tesseract_env_path
else:
    # Fallback to standard installation path on Windows
    default_win_path = r"C:\Program Files\Tesseract-OCR\tesseract.exe"
    if os.path.exists(default_win_path):
        pytesseract.pytesseract.tesseract_cmd = default_win_path

def perform_ocr_on_pdf(pdf_bytes: bytes, dpi: int = 150) -> str:
    """
    Renders each page of a PDF bytes object to an image in memory,
    performs OCR using pytesseract, and merges the text.
    """
    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    except Exception as e:
        raise ValueError(f"Corrupted or invalid PDF file: {str(e)}")
    
    extracted_pages = []
    page_count = len(doc)
    
    for page_num in range(page_count):
        try:
            page = doc.load_page(page_num)
            # Render page to an in-memory image
            pix = page.get_pixmap(dpi=dpi)
            img_data = pix.tobytes("png")
            
            # Load bytes into Pillow image
            img = Image.open(io.BytesIO(img_data))
            
            # Run pytesseract OCR
            page_text = pytesseract.image_to_string(img)
            extracted_pages.append(f"--- Page {page_num + 1} (OCR) ---\n{page_text}")
        except pytesseract.TesseractNotFoundError:
            raise RuntimeError(
                "Tesseract OCR engine is not installed or not configured correctly on this system. "
                "Ensure that Tesseract-OCR is installed and either in your PATH or configured via "
                "the TESSERACT_CMD environment variable."
            )
        except Exception as e:
            raise RuntimeError(f"OCR failed on page {page_num + 1}: {str(e)}")
            
    return "\n\n".join(extracted_pages)

def perform_ocr_on_page(page: fitz.Page, dpi: int = 150) -> str:
    """
    Renders a single PyMuPDF Page to an image and performs OCR.
    """
    try:
        pix = page.get_pixmap(dpi=dpi)
        img_data = pix.tobytes("png")
        img = Image.open(io.BytesIO(img_data))
        page_text = pytesseract.image_to_string(img)
        return page_text
    except pytesseract.TesseractNotFoundError:
        raise RuntimeError(
            "Tesseract OCR engine is not installed or not configured correctly on this system. "
            "Ensure that Tesseract-OCR is installed and either in your PATH or configured via "
            "the TESSERACT_CMD environment variable."
        )
    except Exception as e:
        raise RuntimeError(f"OCR failed: {str(e)}")

