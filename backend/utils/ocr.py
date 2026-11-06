import os
from PIL import Image, ImageEnhance
import pytesseract

TESSERACT_EXE = r"C:\Program Files\Tesseract-OCR\tesseract.exe"
if os.path.exists(TESSERACT_EXE):
    pytesseract.pytesseract.tesseract_cmd = TESSERACT_EXE

def process_ocr_enhanced(image_path: str) -> str:
    try:
        img = Image.open(image_path)
        gray = img.convert("L")
        w, h = gray.size
        resized = gray.resize((w * 2, h * 2), Image.Resampling.LANCZOS)
        enhancer = ImageEnhance.Contrast(resized)
        enhanced_img = enhancer.enhance(2.0)

        text = pytesseract.image_to_string(enhanced_img, lang="vie+eng")
        if not text.strip():
            text = pytesseract.image_to_string(img, lang="vie+eng")
        return text.strip()
    except Exception as e:
        print(f"[OCR Warning]: {e}")
        try:
            return pytesseract.image_to_string(Image.open(image_path)).strip()
        except Exception:
            return ""