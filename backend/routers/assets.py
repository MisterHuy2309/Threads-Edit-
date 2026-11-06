import os
import shutil
from fastapi import APIRouter, UploadFile, File, HTTPException
from moviepy.editor import AudioFileClip

router = APIRouter(prefix="/api/assets", tags=["Media Assets"])

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MEDIA_DIR = os.path.join(BASE_DIR, "media")

DIR_BGM = os.path.join(MEDIA_DIR, "bgm")
DIR_MEME_AUDIO = os.path.join(MEDIA_DIR, "meme_audio")
DIR_MEME_IMG = os.path.join(MEDIA_DIR, "meme_images")

for d in [DIR_BGM, DIR_MEME_AUDIO, DIR_MEME_IMG]:
    os.makedirs(d, exist_ok=True)

def list_files(dir_path: str, url_prefix: str, is_audio: bool = False):
    items = []
    if os.path.exists(dir_path):
        for f in os.listdir(dir_path):
            p = os.path.join(dir_path, f)
            if not os.path.isfile(p):
                continue
            ext = os.path.splitext(f)[1].lower()
            dur = 0.0
            if is_audio and ext in [".mp3", ".wav", ".aac", ".ogg", ".m4a"]:
                try:
                    clip = AudioFileClip(p)
                    dur = float(clip.duration)
                    clip.close()
                except Exception:
                    dur = 3.0
            items.append({
                "name": f,
                "url": f"http://127.0.0.1:8000/media/{url_prefix}/{f}",
                "path": p.replace("\\", "/"),
                "duration": round(dur, 2)
            })
    return items

@router.get("/list")
def get_all_assets():
    return {
        "bgm": list_files(DIR_BGM, "bgm", is_audio=True),
        "meme_audio": list_files(DIR_MEME_AUDIO, "meme_audio", is_audio=True),
        "meme_images": list_files(DIR_MEME_IMG, "meme_images", is_audio=False)
    }

@router.post("/upload/{asset_type}")
async def upload_asset(asset_type: str, file: UploadFile = File(...)):
    target_dir = {
        "bgm": DIR_BGM,
        "meme_audio": DIR_MEME_AUDIO,
        "meme_images": DIR_MEME_IMG
    }.get(asset_type)

    if not target_dir:
        raise HTTPException(status_code=400, detail="Loại tài nguyên không hợp lệ!")

    safe_name = file.filename.replace(" ", "_")
    out_path = os.path.join(target_dir, safe_name)
    with open(out_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    dur = 0.0
    if asset_type in ["bgm", "meme_audio"]:
        try:
            clip = AudioFileClip(out_path)
            dur = float(clip.duration)
            clip.close()
        except Exception:
            dur = 3.0

    return {
        "status": "success",
        "name": safe_name,
        "url": f"http://127.0.0.1:8000/media/{asset_type}/{safe_name}",
        "path": out_path.replace("\\", "/"),
        "duration": round(dur, 2)
    }