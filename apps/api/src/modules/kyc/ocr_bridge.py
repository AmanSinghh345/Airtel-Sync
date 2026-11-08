import sys
import json
import os
import cv2
import numpy as np
import pytesseract

sys.stdout.reconfigure(encoding='utf-8')

# Ensure standard Windows Tesseract path if not on PATH
if os.path.exists(r"C:\Program Files\Tesseract-OCR\tesseract.exe"):
    pytesseract.pytesseract.tesseract_cmd = r"C:\Program Files\Tesseract-OCR\tesseract.exe"

def process_document(file_path):
    if not os.path.exists(file_path):
        return {"error": f"File not found: {file_path}"}

    img = cv2.imread(file_path)
    if img is None:
        return {"error": f"Failed to decode image: {file_path}"}

    h, w, _ = img.shape
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # 1. Blur Detection using Variance of Laplacian
    lap_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    is_blurred = lap_var < 50.0  # Sharp documents are > 500; heavily blurred K04 is 1.03

    # 2. Orientation / Skew Detection
    rotation_angle = 0.0
    try:
        osd = pytesseract.image_to_osd(gray, output_type=pytesseract.Output.DICT)
        rotation_angle = float(osd.get('rotate', 0))
    except Exception:
        rotation_angle = 0.0

    # 3. OCR Extraction & Confidence
    data = pytesseract.image_to_data(gray, output_type=pytesseract.Output.DICT)
    confidences = [int(c) for c in data.get('conf', []) if int(c) > 0]
    avg_conf = float(np.mean(confidences)) if confidences else 0.0

    raw_text = pytesseract.image_to_string(gray).strip()

    return {
        "width": w,
        "height": h,
        "blurVariance": round(lap_var, 2),
        "isBlurred": is_blurred,
        "rotationAngle": rotation_angle,
        "ocrConfidence": round(avg_conf, 2),
        "rawOcrText": raw_text
    }

if __name__ == '__main__':
    if len(sys.argv) > 1:
        result = process_document(sys.argv[1])
        print(json.dumps(result, ensure_ascii=False))
    else:
        print(json.dumps({"error": "No file path provided"}))
