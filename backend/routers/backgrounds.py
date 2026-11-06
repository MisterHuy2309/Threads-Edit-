import os
import shutil
import subprocess
from fastapi import APIRouter, UploadFile, File, HTTPException
import imageio_ffmpeg
from moviepy.editor import VideoFileClip

router = APIRouter(prefix="/api/backgrounds", tags=["Backgrounds"])

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BG_DIR = os.path.join(BASE_DIR, "media", "backgrounds")
THUMB_DIR = os.path.join(BG_DIR, "thumbs")

os.makedirs(BG_DIR, exist_ok=True)
os.makedirs(THUMB_DIR, exist_ok=True)

FFMPEG_EXE = imageio_ffmpeg.get_ffmpeg_exe()

def extract_filmstrip(video_path: str, thumb_folder: str, count: int = 12):
    """Trích xuất 12 frame ảnh làm filmstrip chuẩn CapCut"""
    os.makedirs(thumb_folder, exist_ok=True)
    try:
        clip = VideoFileClip(video_path)
        duration = float(clip.duration)
        clip.close()
    except Exception:
        duration = 10.0

    interval = max(0.4, duration / count)
    cmd = [
        FFMPEG_EXE, "-y",
        "-i", video_path,
        "-vf", f"fps=1/{interval},scale=160:-1",
        "-q:v", "4",
        os.path.join(thumb_folder, "frame_%03d.jpg")
    ]
    try:
        subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
    except Exception:
        pass
    return duration

@router.get("/list")
def list_backgrounds():
    results = []
    if os.path.exists(BG_DIR):
        for f in os.listdir(BG_DIR):
            p = os.path.join(BG_DIR, f)
            if not os.path.isfile(p):
                continue
            # Tự động dọn dẹp các file rác temp_ hoặc _9_16 cũ
            if f.startswith("temp_") or "_9_16.mp4" in f:
                try:
                    os.remove(p)
                    continue
                except Exception:
                    pass

            ext = os.path.splitext(f)[1].lower()
            if ext in [".mp4", ".mov", ".mkv", ".webm"]:
                video_name = os.path.splitext(f)[0]
                thumb_folder = os.path.join(THUMB_DIR, video_name)
                
                duration = 10.0
                if not os.path.exists(thumb_folder) or len(os.listdir(thumb_folder)) == 0:
                    duration = extract_filmstrip(p, thumb_folder)
                else:
                    try:
                        clip = VideoFileClip(p)
                        duration = float(clip.duration)
                        clip.close()
                    except Exception:
                        duration = 10.0

                thumbs = []
                if os.path.exists(thumb_folder):
                    for tf in sorted(os.listdir(thumb_folder)):
                        if tf.endswith(".jpg"):
                            thumbs.append(f"http://127.0.0.1:8000/media/backgrounds/thumbs/{video_name}/{tf}")

                results.append({
                    "name": f,
                    "url": f"http://127.0.0.1:8000/media/backgrounds/{f}",
                    "type": "video",
                    "duration": round(duration, 2),
                    "maxDuration": round(duration, 2),
                    "thumbs": thumbs
                })
    return results

@router.post("/upload")
async def upload_background(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(status_code=400, detail="File không hợp lệ")

    safe_name = file.filename.replace(" ", "_")
    final_path = os.path.join(BG_DIR, safe_name)

    # Lưu DUY NHẤT 1 file gốc, KHÔNG render nhân bản file
    with open(final_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    video_name = os.path.splitext(safe_name)[0]
    thumb_folder = os.path.join(THUMB_DIR, video_name)
    duration = extract_filmstrip(final_path, thumb_folder)

    thumbs = []
    if os.path.exists(thumb_folder):
        for tf in sorted(os.listdir(thumb_folder)):
            if tf.endswith(".jpg"):
                thumbs.append(f"http://127.0.0.1:8000/media/backgrounds/thumbs/{video_name}/{tf}")

    return {
        "status": "success",
        "name": safe_name,
        "url": f"http://127.0.0.1:8000/media/backgrounds/{safe_name}",
        "type": "video",
        "duration": round(duration, 2),
        "maxDuration": round(duration, 2),
        "thumbs": thumbs
    }