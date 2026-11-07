import os
import tempfile

# ÉP TOÀN BỘ TIẾN TRÌNH MOVIEPY / FFMPEG DÙNG TEMP Ổ D ĐỂ KHÔNG ĐẦY Ổ C
CUSTOM_TEMP_DIR = r"D:\render_temp"
os.makedirs(CUSTOM_TEMP_DIR, exist_ok=True)
os.environ["TEMP"] = CUSTOM_TEMP_DIR
os.environ["TMP"] = CUSTOM_TEMP_DIR
tempfile.tempdir = CUSTOM_TEMP_DIR

# XỬ LÝ LỖI PIL ĐỌC ẢNH SCREENSHOT BỊ TRÀN RAM / ĐỨT STREAM
try:
    from PIL import Image, ImageFile
    ImageFile.LOAD_TRUNCATED_IMAGES = True
    Image.MAX_IMAGE_PIXELS = None
except Exception:
    pass

import os
import tempfile

# ÉP TOÀN BỘ TIẾN TRÌNH PYTHON VÀ THƯ VIỆN GHI TẠM VÀO Ổ D
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
TEMP_DIR = os.path.join(BASE_DIR, "temp_render")
os.makedirs(TEMP_DIR, exist_ok=True)

os.environ["TEMP"] = TEMP_DIR
os.environ["TMP"] = TEMP_DIR
tempfile.tempdir = TEMP_DIR

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from routers import tts, topics, backgrounds, video, assets

app = FastAPI(title="Threads Video Generator API", version="1.5.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

MEDIA_DIR = os.path.join(BASE_DIR, "media")
OUTPUT_DIR = os.path.join(BASE_DIR, "output")

for sub in ["backgrounds", "topics", "voices", "audio_cache", "bgm", "meme_audio", "meme_images", "progress_jobs"]:
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
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)