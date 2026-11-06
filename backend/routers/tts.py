import os
import uuid
import time
import hashlib
import shutil
from typing import Optional
from fastapi import APIRouter, HTTPException, Response, UploadFile, File, Form
from pydantic import BaseModel
from moviepy.editor import AudioFileClip
from utils.edge_ws_client import synthesize_via_websocket
from utils.helpers import map_analog_speed

router = APIRouter(prefix="/api/tts", tags=["TTS"])

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MEDIA_DIR = os.path.join(BASE_DIR, "media")
VOICES_DIR = os.path.join(MEDIA_DIR, "voices")
CACHE_AUDIO_DIR = os.path.join(MEDIA_DIR, "audio_cache")

os.makedirs(VOICES_DIR, exist_ok=True)
os.makedirs(CACHE_AUDIO_DIR, exist_ok=True)

AVAILABLE_VOICES = {
    "vi-VN-NamMinhNeural": "Nam - Nam Minh (Kể chuyện drama, Review phim, Trầm ấm chuẩn)",
    "review-nam-gaycan": "Nam - Review Phim Kịch Tính (Nam Minh, Nhịp dồn dập, Cuốn hút)",
    "review-nam-chieurap": "Nam - Tóm Tắt Chiếu Rạp (Nam Minh, Trầm sâu bí ẩn)",
    "vi-VN-HoaiMyNeural": "Nữ - Hoài My (Review TikTok, Giọng đọc Threads nhẹ nhàng)",
    "story-lanhuong": "Nữ - Tâm Sự Đêm Muộn (Hoài My, Chậm rãi, Truyền cảm)",
    "meme-chipmunk": "Nữ - Bé Dâu / Hoạt Hình Cute (Nhí nhảnh, Vui tươi)",
    "en-US-GuyNeural": "Nam - Guy (Tiếng Anh US chuẩn, Tự tin)",
    "en-US-JennyNeural": "Nữ - Jenny (Tiếng Anh US chuẩn, Dịu dàng)",
}

@router.get("/voices-list")
def get_available_voices():
    return AVAILABLE_VOICES

class TTSRequest(BaseModel):
    text: str
    voice: Optional[str] = "vi-VN-NamMinhNeural"
    speed_level: Optional[int] = 50
    topic_name: Optional[str] = "general"

# 1. TẠO VOICE TTS TỰ ĐỘNG LƯU VĨNH VIỄN & BẢO VỆ BẰNG CACHE
@router.post("/generate")
async def generate_speech(req: TTSRequest, response: Response):
    content = req.text.strip()
    if not content:
        raise HTTPException(status_code=400, detail="Văn bản không được để trống!")

    raw_voice = (req.voice or "vi-VN-NamMinhNeural").strip()
    user_rate = map_analog_speed(req.speed_level or 50)
    topic = (req.topic_name or "general").strip()

    topic_voice_dir = os.path.join(VOICES_DIR, topic)
    os.makedirs(topic_voice_dir, exist_ok=True)

    base_edge_voice = raw_voice
    rate_val = user_rate
    if raw_voice == "review-nam-gaycan":
        base_edge_voice = "vi-VN-NamMinhNeural"
        rate_val = "+18%"
    elif raw_voice == "review-nam-chieurap":
        base_edge_voice = "vi-VN-NamMinhNeural"
        rate_val = "+10%"
    elif raw_voice == "story-lanhuong":
        base_edge_voice = "vi-VN-HoaiMyNeural"
        rate_val = "-5%"
    elif raw_voice == "meme-chipmunk":
        base_edge_voice = "vi-VN-HoaiMyNeural"
        rate_val = "+20%"

    cache_key = f"{content}_{base_edge_voice}_{rate_val}"
    content_hash = hashlib.md5(cache_key.encode("utf-8")).hexdigest()
    cached_file_path = os.path.join(CACHE_AUDIO_DIR, f"{content_hash}.mp3")

    # Đặt tên file theo 6 từ đầu để dễ nhận diện trong thư mục
    words = content.split()
    short_slug = "_".join(words[:4]) if words else "voice"
    short_slug = "".join([c for c in short_slug if c.isalnum() or c in ("_", "-")])
    unique_token = f"{int(time.time())}_{short_slug[:20]}"
    final_file_name = f"{unique_token}.mp3"
    final_file_path = os.path.join(topic_voice_dir, final_file_name)

    if os.path.exists(cached_file_path) and os.path.getsize(cached_file_path) > 0:
        print(f"[Cache Hit] Sử dụng lại voice có sẵn: {content_hash}.mp3")
        shutil.copyfile(cached_file_path, final_file_path)
    else:
        print(f"[TTS Server] Sinh audio mới cho: '{content[:30]}...'")
        try:
            await synthesize_via_websocket(
                text=content,
                voice=base_edge_voice,
                output_path=final_file_path,
                rate=rate_val,
                pitch="+0Hz"
            )
            if os.path.exists(final_file_path) and os.path.getsize(final_file_path) > 0:
                shutil.copyfile(final_file_path, cached_file_path)
            else:
                raise RuntimeError("Lỗi tạo file âm thanh.")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Không thể tạo audio: {str(e)}")

    dur = 3.0
    try:
        clip = AudioFileClip(final_file_path)
        dur = float(clip.duration)
        clip.close()
    except Exception:
        pass

    rel_url = f"/media/voices/{topic}/{final_file_name}"
    return {
        "status": "success",
        "name": content[:30] + ("..." if len(content) > 30 else ""),
        "audio_url": rel_url,
        "file_path": final_file_path.replace("\\", "/"),
        "duration": round(dur, 2),
        "voice_used": raw_voice
    }

# 2. DANH SÁCH FILE VOICE TRONG KHO (THEO THƯ MỤC CHỦ ĐỀ)
@router.get("/library")
def get_voice_library(topic_name: str = "general"):
    topic_dir = os.path.join(VOICES_DIR, topic_name)
    os.makedirs(topic_dir, exist_ok=True)
    items = []
    for f in sorted(os.listdir(topic_dir), reverse=True):
        p = os.path.join(topic_dir, f)
        if os.path.isfile(p) and f.lower().endswith((".mp3", ".wav", ".m4a", ".aac")):
            dur = 3.0
            try:
                clip = AudioFileClip(p)
                dur = float(clip.duration)
                clip.close()
            except Exception:
                pass
            items.append({
                "id": f,
                "name": f,
                "url": f"http://127.0.0.1:8000/media/voices/{topic_name}/{f}",
                "path": p.replace("\\", "/"),
                "duration": round(dur, 2)
            })
    return items

# 3. UPLOAD VOICE THỦ CÔNG CÓ SẴN TỪ MÁY TÍNH
@router.post("/upload-manual")
async def upload_manual_voice(
    topic_name: str = Form("general"),
    file: UploadFile = File(...)
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="File không hợp lệ!")
    
    topic_dir = os.path.join(VOICES_DIR, topic_name)
    os.makedirs(topic_dir, exist_ok=True)

    safe_name = f"manual_{int(time.time())}_{file.filename.replace(' ', '_')}"
    save_path = os.path.join(topic_dir, safe_name)

    with open(save_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    dur = 3.0
    try:
        clip = AudioFileClip(save_path)
        dur = float(clip.duration)
        clip.close()
    except Exception:
        pass

    return {
        "status": "success",
        "id": safe_name,
        "name": file.filename,
        "url": f"http://127.0.0.1:8000/media/voices/{topic_name}/{safe_name}",
        "path": save_path.replace("\\", "/"),
        "duration": round(dur, 2)
    }

# 4. XÓA FILE VOICE KHỎI KHO
@router.delete("/delete-voice")
def delete_voice(topic_name: str, filename: str):
    p = os.path.join(VOICES_DIR, topic_name, filename)
    if os.path.exists(p):
        os.remove(p)
        return {"status": "deleted"}
    raise HTTPException(status_code=404, detail="File không tồn tại!")