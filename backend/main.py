import os
import tempfile

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
TEMP_DIR = os.path.join(BASE_DIR, "temp_render")
os.makedirs(TEMP_DIR, exist_ok=True)

os.environ["TEMP"] = TEMP_DIR
os.environ["TMP"] = TEMP_DIR
tempfile.tempdir = TEMP_DIR

try:
    from PIL import Image, ImageFile
    ImageFile.LOAD_TRUNCATED_IMAGES = True
    Image.MAX_IMAGE_PIXELS = None
except Exception:
    pass

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from routers import tts, topics, backgrounds, video, assets

app = FastAPI(title="Threads Video Generator API", version="1.6.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

MEDIA_DIR = os.path.join(BASE_DIR, "media")
OUTPUT_DIR = os.path.join(BASE_DIR, "output")

for sub in ["backgrounds", "topics", "voices", "audio_cache", "bgm", "meme_audio", "meme_images", "progress_jobs", "mascots"]:
    os.makedirs(os.path.join(MEDIA_DIR, sub), exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)

app.mount("/media", StaticFiles(directory=MEDIA_DIR, html=False), name="media")
app.mount("/output", StaticFiles(directory=OUTPUT_DIR, html=False), name="output")

app.include_router(tts.router)
app.include_router(topics.router)
app.include_router(backgrounds.router)
app.include_router(video.router)
app.include_router(assets.router)

if __name__ == "__main__":
    import uvicorn
    # Tắt reload=False để tránh server tự restart khi ghi file vào temp_render/media lúc đang render
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=False)
