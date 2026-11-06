import os
import sys
import time
import json
import uuid
import shutil
import threading
import urllib.parse
from typing import List, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from proglog import ProgressBarLogger

# 1. ÉP TOÀN BỘ BỘ ĐỆM TẠM THỜI (TEMP) SANG Ổ D (KHÔNG CHẠM Ổ C)
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEMP_DIR = os.path.join(BASE_DIR, "temp_render")
OUTPUT_DIR = os.path.join(BASE_DIR, "output")
PROGRESS_DIR = os.path.join(BASE_DIR, "media", "progress_jobs")

for p in [TEMP_DIR, OUTPUT_DIR, PROGRESS_DIR]:
    os.makedirs(p, exist_ok=True)

# Ghi đè biến môi trường hệ thống cho tiến trình Python hiện tại
os.environ["TEMP"] = TEMP_DIR
os.environ["TMP"] = TEMP_DIR
import tempfile
tempfile.tempdir = TEMP_DIR

# VÁ LỖI PILLOW 10+
import PIL.Image
if not hasattr(PIL.Image, 'ANTIALIAS'):
    PIL.Image.ANTIALIAS = getattr(PIL.Image, 'LANCZOS', getattr(PIL.Image.Resampling, 'LANCZOS', None))

from moviepy.editor import (
    VideoFileClip,
    AudioFileClip,
    ImageClip,
    CompositeVideoClip,
    CompositeAudioClip
)

router = APIRouter(prefix="/api/video", tags=["Video Render"])

def cleanup_job_temp_files(job_id: str, output_file: Optional[str] = None):
    """Xóa sạch mọi file tạm phát sinh trên ổ D khi hủy hoặc lỗi"""
    if output_file and os.path.exists(output_file):
        try:
            os.remove(output_file)
        except Exception:
            pass
            
    # Dọn sạch các file tạm có chứa job_id hoặc temp audio của MoviePy trong temp_render
    if os.path.exists(TEMP_DIR):
        for f in os.listdir(TEMP_DIR):
            if job_id in f or f.endswith((".wav", ".mp3", ".mp4", ".tmp")):
                try:
                    os.remove(os.path.join(TEMP_DIR, f))
                except Exception:
                    pass

def write_job_state(job_id: str, data: dict):
    path = os.path.join(PROGRESS_DIR, f"{job_id}.json")
    try:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False)
    except Exception:
        pass

def read_job_state(job_id: str) -> Optional[dict]:
    path = os.path.join(PROGRESS_DIR, f"{job_id}.json")
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return None
    return None

class CancellableRenderLogger(ProgressBarLogger):
    def __init__(self, job_id: str):
        super().__init__()
        self.job_id = job_id

    def callback(self, **changes):
        state = read_job_state(self.job_id) or {}
        if state.get("cancel_requested"):
            raise InterruptedError("Tiến trình render đã bị người dùng hủy bỏ.")

        for bar in self.state.get("bars", {}).values():
            if bar.get("total") and bar.get("index") is not None:
                total = bar["total"]
                current = bar["index"]
                percent = int((current / total) * 100)
                state["progress"] = min(99, percent)
                state["current_frame"] = current
                state["total_frames"] = total
                write_job_state(self.job_id, state)

class BgClipInput(BaseModel):
    video_path: str
    startTime: float
    duration: float
    trimStart: Optional[float] = 0.0

class OverlayBlockInput(BaseModel):
    image_path: str
    startTime: float
    duration: float
    img_x: float
    img_y: float
    img_width: float

class AudioTrackInput(BaseModel):
    audio_path: str
    startTime: float
    duration: float
    volume: Optional[float] = 100.0

class ExportRequest(BaseModel):
    resolution: Optional[str] = "1080p"
    fps: Optional[int] = 30
    bg_clips: List[BgClipInput]
    blocks: List[OverlayBlockInput]
    meme_images: Optional[List[OverlayBlockInput]] = []
    voices: Optional[List[AudioTrackInput]] = []
    bgm_list: Optional[List[AudioTrackInput]] = []
    sound_fx_list: Optional[List[AudioTrackInput]] = []

def resolve_local_path(url_or_path: str) -> str:
    if not url_or_path:
        return ""
    decoded = urllib.parse.unquote(url_or_path)
    clean = decoded.split("?")[0]
    if os.path.isabs(clean) and os.path.exists(clean):
        return os.path.normpath(clean)

    for domain in ["http://127.0.0.1:8000", "http://localhost:8000"]:
        if clean.startswith(domain):
            clean = clean[len(domain):]
            break

    clean = clean.lstrip("/").lstrip("\\")
    candidate = os.path.normpath(os.path.join(BASE_DIR, clean))
    if os.path.exists(candidate):
        return candidate

    filename_only = os.path.basename(clean)
    media_root = os.path.join(BASE_DIR, "media")
    for root, _, files in os.walk(media_root):
        if filename_only in files:
            return os.path.normpath(os.path.join(root, filename_only))

    return candidate

def run_render_task(job_id: str, req: ExportRequest):
    out_filepath = None
    final_video = None
    opened_clips = []
    state = read_job_state(job_id) or {}

    try:
        res_map = {
            "1080p": (1080, 1920),
            "2k": (1440, 2560),
            "4k": (2160, 3840)
        }
        target_w, target_h = res_map.get(req.resolution.lower(), (1080, 1920))
        scale_factor = target_w / 1080.0

        video_clips = []
        audio_clips = []

        # 1. Video nền (TẮT HOÀN TOÀN TIẾNG GỐC)
        for clip_info in req.bg_clips:
            real_p = resolve_local_path(clip_info.video_path)
            if os.path.exists(real_p):
                try:
                    v = VideoFileClip(real_p).without_audio()
                    opened_clips.append(v)
                    t_start = max(0.0, clip_info.trimStart or 0.0)
                    t_end = min(v.duration, t_start + clip_info.duration)
                    if t_end > t_start:
                        sub_v = v.subclip(t_start, t_end).set_start(clip_info.startTime)
                        sub_v = sub_v.resize(height=target_h)
                        if sub_v.w > target_w:
                            sub_v = sub_v.crop(x_center=sub_v.w / 2, width=target_w)
                        video_clips.append(sub_v)
                except Exception as e:
                    print(f"Lỗi clip: {e}")

        # 2. Ảnh Comment
        for b in req.blocks:
            img_p = resolve_local_path(b.image_path)
            if os.path.exists(img_p):
                try:
                    target_img_w = int(b.img_width * scale_factor)
                    img_clip = (
                        ImageClip(img_p)
                        .set_start(b.startTime)
                        .set_duration(b.duration)
                        .resize(width=target_img_w)
                        .set_position((int(b.img_x * scale_factor), int(b.img_y * scale_factor)))
                    )
                    opened_clips.append(img_clip)
                    video_clips.append(img_clip)
                except Exception as e:
                    print(f"Lỗi comment: {e}")

        # 3. Ảnh Meme
        if req.meme_images:
            for m in req.meme_images:
                m_path = resolve_local_path(m.image_path)
                if os.path.exists(m_path):
                    try:
                        target_m_w = int(m.img_width * scale_factor)
                        meme_clip = (
                            ImageClip(m_path)
                            .set_start(m.startTime)
                            .set_duration(m.duration)
                            .resize(width=target_m_w)
                            .set_position((int(m.img_x * scale_factor), int(m.img_y * scale_factor)))
                        )
                        opened_clips.append(meme_clip)
                        video_clips.append(meme_clip)
                    except Exception as e:
                        print(f"Lỗi meme: {e}")

        # 4. Mix Audio
        all_audios = (req.voices or []) + (req.bgm_list or []) + (req.sound_fx_list or [])
        for a in all_audios:
            a_p = resolve_local_path(a.audio_path)
            if os.path.exists(a_p):
                try:
                    a_clip = AudioFileClip(a_p)
                    opened_clips.append(a_clip)
                    a_clip = a_clip.subclip(0, min(a_clip.duration, a.duration)).set_start(a.startTime)
                    vol_ratio = (a.volume if a.volume is not None else 100.0) / 100.0
                    a_clip = a_clip.volumex(vol_ratio)
                    audio_clips.append(a_clip)
                except Exception as e:
                    print(f"Lỗi audio: {e}")

        if not video_clips:
            state["status"] = "error"
            state["error"] = "Không tìm thấy clip video hoặc ảnh hợp lệ."
            write_job_state(job_id, state)
            return

        final_video = CompositeVideoClip(video_clips, size=(target_w, target_h))
        if audio_clips:
            final_video.audio = CompositeAudioClip(audio_clips)
        else:
            final_video = final_video.without_audio()

        timestamp = int(time.time())
        out_filename = f"video_export_{req.resolution}_{timestamp}.mp4"
        out_filepath = os.path.join(OUTPUT_DIR, out_filename)
        temp_audiofile_path = os.path.join(TEMP_DIR, f"{job_id}_temp_audio.m4a")

        logger = CancellableRenderLogger(job_id)
        
        # Chỉ định temp_audiofile nằm ở ổ D, không tạo file tạm ở ổ C
        final_video.write_videofile(
            out_filepath,
            fps=req.fps or 30,
            codec="libx264",
            audio_codec="aac",
            temp_audiofile=temp_audiofile_path,
            remove_temp=True,
            threads=4,
            preset="fast",
            logger=logger
        )

        final_video.close()
        for c in opened_clips:
            try: c.close()
            except Exception: pass

        state["status"] = "completed"
        state["progress"] = 100
        state["video_url"] = f"http://127.0.0.1:8000/output/{out_filename}"
        state["filename"] = out_filename
        write_job_state(job_id, state)

    except InterruptedError:
        print(f"[Render] Job {job_id} đã bị hủy bởi người dùng. Đang xóa sạch cache trên ổ D...")
        if final_video:
            try: final_video.close()
            except Exception: pass
        for c in opened_clips:
            try: c.close()
            except Exception: pass
            
        # Xóa sạch file xuất dở dang và cache tạm
        cleanup_job_temp_files(job_id, out_filepath)

        state["status"] = "cancelled"
        state["error"] = "Đã hủy xuất video và dọn dẹp sạch sẽ ổ đĩa."
        write_job_state(job_id, state)

    except Exception as err:
        print(f"[Render Error]: {err}")
        if final_video:
            try: final_video.close()
            except Exception: pass
        for c in opened_clips:
            try: c.close()
            except Exception: pass

        cleanup_job_temp_files(job_id, out_filepath)

        state["status"] = "error"
        state["error"] = str(err)
        write_job_state(job_id, state)

@router.post("/export-task")
def start_export_task(req: ExportRequest):
    job_id = "job_" + uuid.uuid4().hex[:10]
    initial_state = {
        "status": "rendering",
        "progress": 0,
        "current_frame": 0,
        "total_frames": 0,
        "video_url": None,
        "error": None,
        "cancel_requested": False
    }
    write_job_state(job_id, initial_state)
    thread = threading.Thread(target=run_render_task, args=(job_id, req), daemon=True)
    thread.start()
    return {"status": "started", "job_id": job_id}

@router.get("/progress/{job_id}")
def get_render_progress(job_id: str):
    state = read_job_state(job_id)
    if not state:
        raise HTTPException(status_code=404, detail="Job ID không tồn tại!")
    return state

@router.post("/cancel/{job_id}")
def cancel_render_task(job_id: str):
    state = read_job_state(job_id)
    if not state:
        raise HTTPException(status_code=404, detail="Job ID không tồn tại!")
    state["cancel_requested"] = True
    write_job_state(job_id, state)
    return {"status": "cancelling", "message": "Đã gửi tín hiệu ngắt tiến trình và dọn dẹp cache."}