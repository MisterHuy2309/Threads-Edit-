import os
import uuid
import shutil
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from pydantic import BaseModel
from utils.ocr import process_ocr_enhanced

router = APIRouter(prefix="/api/topics", tags=["Topics & Images"])

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOPICS_DIR = os.path.join(BASE_DIR, "media", "threads_topics")
os.makedirs(TOPICS_DIR, exist_ok=True)

class RenameTopicRequest(BaseModel):
    old_name: str
    new_name: str

class DeleteImageRequest(BaseModel):
    topic_name: str
    filename: str

# 1. Tạo kho ảnh mới
@router.post("/create")
def create_topic(topic_name: str = Form(...)):
    name = topic_name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Tên kho ảnh không được rỗng")
    topic_dir = os.path.join(TOPICS_DIR, name)
    os.makedirs(topic_dir, exist_ok=True)
    return {"status": "success", "topic": name}

# 2. Lấy danh sách các kho ảnh
@router.get("/list")
def list_topics():
    if not os.path.exists(TOPICS_DIR):
        return []
    return [t for t in os.listdir(TOPICS_DIR) if os.path.isdir(os.path.join(TOPICS_DIR, t))]

# 3. Đổi tên kho ảnh (Sửa)
@router.put("/rename")
def rename_topic(req: RenameTopicRequest):
    old_p = os.path.join(TOPICS_DIR, req.old_name.strip())
    new_p = os.path.join(TOPICS_DIR, req.new_name.strip())
    if not os.path.exists(old_p):
        raise HTTPException(status_code=404, detail="Không tìm thấy kho ảnh cần sửa")
    if os.path.exists(new_p):
        raise HTTPException(status_code=400, detail="Tên kho ảnh mới đã tồn tại")
    os.rename(old_p, new_p)
    return {"status": "success", "topic": req.new_name.strip()}

# 4. Xóa toàn bộ kho ảnh và ảnh con bên trong
@router.delete("/{topic_name}")
def delete_topic(topic_name: str):
    p = os.path.join(TOPICS_DIR, topic_name.strip())
    if os.path.exists(p):
        shutil.rmtree(p)
        return {"status": "success", "message": f"Đã xóa kho ảnh {topic_name}"}
    raise HTTPException(status_code=404, detail="Kho ảnh không tồn tại")

# 5. Upload ảnh vào kho và tự động chạy OCR
@router.post("/upload-image")
async def upload_image_to_topic(topic_name: str = Form(...), file: UploadFile = File(...)):
    topic_dir = os.path.join(TOPICS_DIR, topic_name.strip())
    os.makedirs(topic_dir, exist_ok=True)
    clean_filename = f"{uuid.uuid4().hex[:6]}_{file.filename}"
    file_path = os.path.join(topic_dir, clean_filename)

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    extracted_text = process_ocr_enhanced(file_path)

    return {
        "status": "success",
        "filename": clean_filename,
        "path": file_path.replace("\\", "/"),
        "url": f"/media/threads_topics/{topic_name.strip()}/{clean_filename}",
        "ocr_text": extracted_text
    }

# 6. Lấy danh sách ảnh trong 1 kho
@router.get("/images")
def list_topic_images(topic_name: str):
    topic_dir = os.path.join(TOPICS_DIR, topic_name.strip())
    if not os.path.exists(topic_dir):
        return []
    images = []
    for f in os.listdir(topic_dir):
        p = os.path.join(topic_dir, f).replace("\\", "/")
        if os.path.isfile(p):
            images.append({
                "filename": f,
                "path": p,
                "url": f"/media/threads_topics/{topic_name.strip()}/{f}"
            })
    return images

# 7. Xóa 1 ảnh con trong kho
@router.delete("/images/delete")
def delete_single_image(req: DeleteImageRequest):
    img_path = os.path.join(TOPICS_DIR, req.topic_name.strip(), req.filename.strip())
    if os.path.exists(img_path):
        os.remove(img_path)
        return {"status": "success", "message": "Đã xóa ảnh thành công"}
    raise HTTPException(status_code=404, detail="Không tìm thấy ảnh")