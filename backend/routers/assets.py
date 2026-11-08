import os
import shutil
from fastapi import APIRouter, UploadFile, File, HTTPException
from moviepy.editor import AudioFileClip, VideoFileClip

router = APIRouter(prefix="/api/assets", tags=["Media Assets"])

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MEDIA_DIR = os.path.join(BASE_DIR, "media")

DIR_BGM = os.path.join(MEDIA_DIR, "bgm")
DIR_MEME_AUDIO = os.path.join(MEDIA_DIR, "meme_audio")
DIR_MEME_IMG = os.path.join(MEDIA_DIR, "meme_images")

for d in [DIR_BGM, DIR_MEME_AUDIO, DIR_MEME_IMG]:
    os.makedirs(d, exist_ok=True)

def list_files(dir_path: str, url_prefix: str, asset_type: str = "audio"):
    items = []
    if os.path.exists(dir_path):
        for f in os.listdir(dir_path):
            p = os.path.join(dir_path, f)
            if not os.path.isfile(p):
                continue
            ext = os.path.splitext(f)[1].lower()
            dur = 3.0
            media_kind = "image"

            if ext in [".mp3", ".wav", ".aac", ".ogg", ".m4a"]:
                media_kind = "audio"
                try:
                    clip = AudioFileClip(p)
                    dur = float(clip.duration)
                    clip.close()
                except Exception:
                    dur = 3.0
            elif ext in [".mp4", ".mov", ".webm", ".mkv", ".avi"]:
                media_kind = "video"
                try:
                    clip = VideoFileClip(p)
                    dur = float(clip.duration)
                    clip.close()
                except Exception:
                    dur = 5.0

            items.append({
                "name": f,
                "url": f"http://127.0.0.1:8000/media/{url_prefix}/{f}",
                "path": p.replace("\\", "/"),
                "duration": round(dur, 2),
                "type": media_kind
            })
    return items

@router.get("/list")
def get_all_assets():
    return {
        "bgm": list_files(DIR_BGM, "bgm", asset_type="audio"),
        "meme_audio": list_files(DIR_MEME_AUDIO, "meme_audio", asset_type="audio"),
        "meme_images": list_files(DIR_MEME_IMG, "meme_images", asset_type="mixed")
    }

@router.post("/upload/{asset_type}")
async def upload_asset(asset_type: str, file: UploadFile = File(...)):
    normalized_type = "meme_images" if asset_type in ["meme_img", "meme_images"] else asset_type

    target_dir = {
        "bgm": DIR_BGM,
        "meme_audio": DIR_MEME_AUDIO,
        "meme_images": DIR_MEME_IMG
    }.get(normalized_type)

    if not target_dir:
        raise HTTPException(status_code=400, detail="Loại tài nguyên không hợp lệ!")

    safe_name = file.filename.replace(" ", "_")
    out_path = os.path.join(target_dir, safe_name)
    with open(out_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    dur = 3.0
    ext = os.path.splitext(safe_name)[1].lower()
    media_kind = "image"

    if ext in [".mp3", ".wav", ".aac", ".ogg", ".m4a"]:
        media_kind = "audio"
        try:
            clip = AudioFileClip(out_path)
            dur = float(clip.duration)
            clip.close()
        except Exception:
            dur = 3.0
    elif ext in [".mp4", ".mov", ".webm", ".mkv", ".avi"]:
        media_kind = "video"
        try:
            clip = VideoFileClip(out_path)
            dur = float(clip.duration)
            clip.close()
        except Exception:
            dur = 5.0

    return {
        "status": "success",
        "name": safe_name,
        "url": f"http://127.0.0.1:8000/media/{normalized_type}/{safe_name}",
        "path": out_path.replace("\\", "/"),
        "duration": round(dur, 2),
        "type": media_kind
    }
