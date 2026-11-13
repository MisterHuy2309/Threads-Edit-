import os
import re
import uuid
import time
import asyncio
import hashlib
import shutil
from typing import Optional, List
from fastapi import APIRouter, HTTPException, Response, UploadFile, File, Form
from pydantic import BaseModel
from moviepy.editor import AudioFileClip

from tts_fallback import generate_tts_safe

try:
    from utils.helpers import map_analog_speed
except ImportError:
    def map_analog_speed(speed: int) -> str:
        diff = int((speed - 50) * 1.5)
        return f"+{diff}%" if diff >= 0 else f"{diff}%"

router = APIRouter(prefix="/api/tts", tags=["TTS"])

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MEDIA_DIR = os.path.join(BASE_DIR, "media")
VOICES_DIR = os.path.join(MEDIA_DIR, "voices")
CACHE_AUDIO_DIR = os.path.join(MEDIA_DIR, "audio_cache")
TEMP_CHUNK_DIR = os.path.join(BASE_DIR, "temp_render", "tts_chunks")

os.makedirs(VOICES_DIR, exist_ok=True)
os.makedirs(CACHE_AUDIO_DIR, exist_ok=True)
os.makedirs(TEMP_CHUNK_DIR, exist_ok=True)

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

@router.get("/folders")
def get_voice_folders():
    folders = ["general"]
    if os.path.exists(VOICES_DIR):
        for f in os.listdir(VOICES_DIR):
            p = os.path.join(VOICES_DIR, f)
            if os.path.isdir(p) and f not in folders:
                folders.append(f)
    return folders

def split_text_into_chunks(text: str, max_chars: int = 220) -> List[str]:
    clean_text = text.strip()
    if not clean_text:
        return []

    raw_sentences = re.split(r'([.!?;\n]+)', clean_text)
    chunks = []
    current_chunk = ""

    for part in raw_sentences:
        if not part:
            continue
        if len(current_chunk) + len(part) <= max_chars:
            current_chunk += part
        else:
            if current_chunk.strip():
                chunks.append(current_chunk.strip())
            current_chunk = part

    if current_chunk.strip():
        chunks.append(current_chunk.strip())

    return chunks if chunks else [clean_text]

async def synthesize_chunk_robust(text: str, raw_voice: str, output_path: str, rate: str):
    engine_used = await generate_tts_safe(
        text=text,
        output_path=output_path,
        voice=raw_voice,
        rate=rate,
        pitch="+0Hz"
    )
    if os.path.exists(output_path) and os.path.getsize(output_path) > 500:
        return engine_used
    raise RuntimeError(f"File audio tao ra qua nho hoac rong ({engine_used})")

def combine_mp3_files(chunk_files: List[str], target_path: str):
    import subprocess
    list_txt = target_path + ".concat.txt"
    with open(list_txt, "w", encoding="utf-8") as f:
        for cf in chunk_files:
            if os.path.exists(cf):
                safe_p = cf.replace("\\", "/")
                f.write(f"file '{safe_p}'\n")
    try:
        subprocess.run(
            ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", list_txt, "-c", "copy", target_path],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=True
        )
    finally:
        if os.path.exists(list_txt):
            os.remove(list_txt)
        for cf in chunk_files:
            if os.path.exists(cf):
                try: os.remove(cf)
                except Exception: pass

@router.get("/voices-list")
def get_available_voices():
    return AVAILABLE_VOICES

class TTSRequest(BaseModel):
    text: str
    voice: Optional[str] = "vi-VN-NamMinhNeural"
    speed_level: Optional[int] = 50
    topic_name: Optional[str] = "general"

@router.post("/generate")
async def generate_speech(req: TTSRequest, response: Response):
    content = req.text.strip()
    if not content:
        raise HTTPException(status_code=400, detail="Văn bản không được để trống!")

    raw_voice = (req.voice or "vi-VN-NamMinhNeural").strip()
    # Lấy chính xác tốc độ từ thanh kéo speed_level của người dùng
    rate_val = map_analog_speed(req.speed_level if req.speed_level is not None else 50)
    topic = (req.topic_name or "general").strip()

    topic_voice_dir = os.path.join(VOICES_DIR, topic)
    os.makedirs(topic_voice_dir, exist_ok=True)

    cache_key = f"{content}_{raw_voice}_{rate_val}_v3"
    content_hash = hashlib.md5(cache_key.encode("utf-8")).hexdigest()
    cached_file_path = os.path.join(CACHE_AUDIO_DIR, f"{content_hash}.mp3")

    words = content.split()
    short_slug = "_".join(words[:4]) if words else "voice"
    short_slug = "".join([c for c in short_slug if c.isalnum() or c in ("_", "-")])
    unique_token = f"{int(time.time())}_{short_slug[:20]}"
    final_file_name = f"{unique_token}.mp3"
    final_file_path = os.path.join(topic_voice_dir, final_file_name)

    engine_used = "cache"

    if os.path.exists(cached_file_path) and os.path.getsize(cached_file_path) > 0:
        shutil.copyfile(cached_file_path, final_file_path)
    else:
        chunks = split_text_into_chunks(content, max_chars=220)
        temp_chunk_paths = []

        try:
            for idx, chunk in enumerate(chunks):
                chunk_filename = f"chunk_{uuid.uuid4().hex[:8]}_{idx}.mp3"
                chunk_file_path = os.path.join(TEMP_CHUNK_DIR, chunk_filename)
                
                engine_used = await synthesize_chunk_robust(
                    text=chunk,
                    raw_voice=raw_voice,
                    output_path=chunk_file_path,
                    rate=rate_val
                )
                temp_chunk_paths.append(chunk_file_path)

            if len(temp_chunk_paths) == 1:
                shutil.move(temp_chunk_paths[0], final_file_path)
            else:
                combine_mp3_files(temp_chunk_paths, final_file_path)

            if os.path.exists(final_file_path) and os.path.getsize(final_file_path) > 0:
                shutil.copyfile(final_file_path, cached_file_path)
            else:
                raise RuntimeError("Lỗi tạo file âm thanh sau khi nối các câu.")

        except Exception as e:
            for p in temp_chunk_paths:
                if os.path.exists(p):
                    try: os.remove(p)
                    except Exception: pass
            raise HTTPException(status_code=500, detail=f"Không thể tạo audio TTS: {str(e)}")

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
        "voice_used": raw_voice,
        "engine": engine_used
    }

@router.get("/library")
def get_voice_library(topic_name: str = "general"):
    topic_dir = os.path.join(VOICES_DIR, topic_name)
    os.makedirs(topic_dir, exist_ok=True)
    items = []
    
    search_dirs = [topic_dir]
    if topic_name.lower() == "general" or not os.listdir(topic_dir):
        search_dirs.append(VOICES_DIR)
        for sub in os.listdir(VOICES_DIR):
            sub_p = os.path.join(VOICES_DIR, sub)
            if os.path.isdir(sub_p):
                search_dirs.append(sub_p)

    seen_files = set()
    for s_dir in search_dirs:
        if not os.path.exists(s_dir):
            continue
        for f in sorted(os.listdir(s_dir), reverse=True):
            p = os.path.join(s_dir, f)
            if os.path.isfile(p) and f.lower().endswith((".mp3", ".wav", ".m4a", ".aac")) and f not in seen_files:
                seen_files.add(f)
                dur = 3.0
                try:
                    clip = AudioFileClip(p)
                    dur = float(clip.duration)
                    clip.close()
                except Exception:
                    pass
                rel_topic = os.path.basename(s_dir) if s_dir != VOICES_DIR else topic_name
                items.append({
                    "id": f,
                    "name": f,
                    "url": f"http://127.0.0.1:8000/media/voices/{rel_topic}/{f}",
                    "path": p.replace("\\", "/"),
                    "duration": round(dur, 2)
                })
    return items

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

@router.delete("/delete-voice")
def delete_voice(topic_name: str, filename: str):
    p = os.path.join(VOICES_DIR, topic_name, filename)
    if os.path.exists(p):
        os.remove(p)
        return {"status": "deleted"}
    raise HTTPException(status_code=404, detail="File không tồn tại!")
