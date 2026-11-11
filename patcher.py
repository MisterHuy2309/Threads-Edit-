import os

# 1. Ghi backend/routers/video.py
video_py = """import os, sys, time, json, uuid, shutil, threading, urllib.parse
from typing import List, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from proglog import ProgressBarLogger
from PIL import Image

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEMP_DIR = os.path.join(BASE_DIR, "temp_render")
OUTPUT_DIR = os.path.join(BASE_DIR, "output")
PROGRESS_DIR = os.path.join(BASE_DIR, "media", "progress_jobs")
WATERMARK_DIR = os.path.join(BASE_DIR, "media", "watermarks")

for p in [TEMP_DIR, OUTPUT_DIR, PROGRESS_DIR, WATERMARK_DIR]:
    os.makedirs(p, exist_ok=True)

os.environ["TEMP"] = TEMP_DIR
os.environ["TMP"] = TEMP_DIR
import tempfile
tempfile.tempdir = TEMP_DIR

import PIL.Image
if not hasattr(PIL.Image, 'ANTIALIAS'):
    PIL.Image.ANTIALIAS = getattr(PIL.Image, 'LANCZOS', getattr(PIL.Image.Resampling, 'LANCZOS', None))

from moviepy.editor import (
    VideoFileClip, AudioFileClip, ImageClip, CompositeVideoClip, CompositeAudioClip, vfx
)

router = APIRouter(prefix="/api/video", tags=["Video Render"])

def cleanup_job_temp_files(job_id: str, output_file: Optional[str] = None):
    if output_file and os.path.exists(output_file):
        try: os.remove(output_file)
        except Exception: pass
    if os.path.exists(TEMP_DIR):
        for f in os.listdir(TEMP_DIR):
            if job_id in f or f.endswith((".wav", ".mp3", ".mp4", ".tmp", ".png")):
                try: os.remove(os.path.join(TEMP_DIR, f))
                except Exception: pass

def write_job_state(job_id: str, data: dict):
    path = os.path.join(PROGRESS_DIR, f"{job_id}.json")
    try:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False)
    except Exception: pass

def read_job_state(job_id: str) -> Optional[dict]:
    path = os.path.join(PROGRESS_DIR, f"{job_id}.json")
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception: return None
    return None

class CancellableRenderLogger(ProgressBarLogger):
    def __init__(self, job_id: str):
        super().__init__()
        self.job_id = job_id

    def callback(self, **changes):
        state = read_job_state(self.job_id) or {}
        if state.get("cancel_requested"):
            raise InterruptedError("Tien trinh render da bi huy.")
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
    speed: Optional[float] = 1.0

class OverlayBlockInput(BaseModel):
    image_path: str
    startTime: float
    duration: float
    img_x: float
    img_y: float
    img_width: float
    animation: Optional[str] = "none"
    opacity: Optional[float] = 1.0

class AudioTrackInput(BaseModel):
    audio_path: str
    startTime: float
    duration: float
    trimStart: Optional[float] = 0.0
    speed: Optional[float] = 1.0
    volume: Optional[float] = 100.0

class WatermarkInput(BaseModel):
    enabled: bool = False
    style: Optional[str] = "W1"
    image_url: Optional[str] = None
    opacity: Optional[float] = 0.9
    scale: Optional[float] = 1.0
    x: Optional[float] = 20.0
    y: Optional[float] = 25.0

class ExportRequest(BaseModel):
    resolution: Optional[str] = "1080p"
    fps: Optional[int] = 30
    bg_clips: List[BgClipInput]
    blocks: List[OverlayBlockInput]
    meme_images: Optional[List[OverlayBlockInput]] = []
    voices: Optional[List[AudioTrackInput]] = []
    bgm_list: Optional[List[AudioTrackInput]] = []
    sound_fx_list: Optional[List[AudioTrackInput]] = []
    watermark: Optional[WatermarkInput] = None

def resolve_local_path(url_or_path: str) -> str:
    if not url_or_path: return ""
    decoded = urllib.parse.unquote(url_or_path)
    clean = decoded.split("?")[0]
    if os.path.isabs(clean) and os.path.exists(clean):
        return os.path.normpath(clean)
    for domain in ["http://127.0.0.1:8000", "http://localhost:8000"]:
        if clean.startswith(domain):
            clean = clean[len(domain):]
            break
    clean = clean.lstrip("/").lstrip("\\\\")
    cand = os.path.normpath(os.path.join(BASE_DIR, clean))
    if os.path.exists(cand): return cand
    fname = os.path.basename(clean)
    media_root = os.path.join(BASE_DIR, "media")
    for root, _, files in os.walk(media_root):
        if fname in files:
            return os.path.normpath(os.path.join(root, fname))
    return cand

def get_watermark_file_path(style: str, custom_url: Optional[str] = None) -> str:
    if custom_url:
        p = resolve_local_path(custom_url)
        if os.path.exists(p): return p
    s = (style or "W1").lower()
    cands = [
        os.path.join(WATERMARK_DIR, f"watermark_{s}.png"),
        os.path.join(WATERMARK_DIR, f"watermark_{s}.jpg"),
        os.path.join(WATERMARK_DIR, f"watermark_{s}.svg"),
        os.path.join(BASE_DIR, "media", "mascots", f"mascot_{s}.png"),
    ]
    for c in cands:
        if os.path.exists(c): return c
    return ""

def run_render_task(job_id: str, req: ExportRequest):
    out_filepath = None
    final_video = None
    opened_clips = []
    state = read_job_state(job_id) or {}
    try:
        res_map = {"1080p": (1080, 1920), "2k": (1440, 2560), "4k": (2160, 3840)}
        target_w, target_h = res_map.get(req.resolution.lower(), (1080, 1920))
        scale_factor = target_w / 1080.0
        preview_scale = 1080.0 / 320.0
        video_clips, audio_clips = [], []

        for c_info in req.bg_clips:
            rp = resolve_local_path(c_info.video_path)
            if os.path.exists(rp):
                v = VideoFileClip(rp).without_audio()
                opened_clips.append(v)
                speed = c_info.speed or 1.0
                if speed != 1.0 and hasattr(vfx, "speedx"): v = v.fx(vfx.speedx, speed)
                t_start = max(0.0, c_info.trimStart or 0.0)
                t_end = min(v.duration, t_start + c_info.duration)
                if t_end > t_start:
                    sub_v = v.subclip(t_start, t_end).set_start(c_info.startTime).resize(height=target_h)
                    if sub_v.w > target_w: sub_v = sub_v.crop(x_center=sub_v.w/2, width=target_w)
                    video_clips.append(sub_v)

        for b in req.blocks:
            ip = resolve_local_path(b.image_path)
            if os.path.exists(ip):
                target_w_img = int(b.img_width * scale_factor)
                ic = ImageClip(ip).set_start(b.startTime).set_duration(b.duration).resize(width=target_w_img).set_position((int(b.img_x * scale_factor), int(b.img_y * scale_factor)))
                if (b.opacity is not None) and b.opacity < 1.0 and hasattr(ic, "set_opacity"): ic = ic.set_opacity(b.opacity)
                opened_clips.append(ic); video_clips.append(ic)

        if req.meme_images:
            for m in req.meme_images:
                mp = resolve_local_path(m.image_path)
                if os.path.exists(mp):
                    target_w_m = int(m.img_width * scale_factor)
                    is_vid = mp.lower().endswith((".mp4", ".mov", ".webm", ".mkv"))
                    mc = VideoFileClip(mp).without_audio().subclip(0, min(m.duration, 15)) if is_vid else ImageClip(mp)
                    mc = mc.set_start(m.startTime).set_duration(m.duration).resize(width=target_w_m).set_position((int(m.img_x * scale_factor), int(m.img_y * scale_factor)))
                    if (m.opacity is not None) and m.opacity < 1.0 and hasattr(mc, "set_opacity"): mc = mc.set_opacity(m.opacity)
                    opened_clips.append(mc); video_clips.append(mc)

        all_audios = (req.voices or []) + (req.bgm_list or []) + (req.sound_fx_list or [])
        for a in all_audios:
            ap = resolve_local_path(a.audio_path)
            if os.path.exists(ap):
                ac = AudioFileClip(ap)
                opened_clips.append(ac)
                t_start = max(0.0, a.trimStart or 0.0)
                t_end = min(ac.duration, t_start + a.duration)
                if t_end > t_start:
                    asub = ac.subclip(t_start, t_end).set_start(a.startTime)
                    vol_r = (a.volume if a.volume is not None else 100.0) / 100.0
                    asub = asub.volumex(vol_r)
                    audio_clips.append(asub)

        if not video_clips:
            state["status"] = "error"; state["error"] = "Khong tim thay video hoac anh hop le."
            write_job_state(job_id, state); return

        total_dur = max([c.end for c in video_clips] + ([a.end for a in audio_clips] if audio_clips else [15.0]))

        if req.watermark and req.watermark.enabled:
            wm_f = get_watermark_file_path(req.watermark.style or "W1", req.watermark.image_url)
            if wm_f and os.path.exists(wm_f):
                wm_scale = (req.watermark.scale or 1.0) * scale_factor
                rx = int((req.watermark.x or 20.0) * preview_scale * scale_factor)
                ry = int((req.watermark.y or 25.0) * preview_scale * scale_factor)
                wmc = ImageClip(wm_f).set_start(0).set_duration(total_dur).resize(wm_scale).set_position((rx, ry))
                if req.watermark.opacity is not None and hasattr(wmc, "set_opacity"): wmc = wmc.set_opacity(req.watermark.opacity)
                opened_clips.append(wmc); video_clips.append(wmc)

        final_video = CompositeVideoClip(video_clips, size=(target_w, target_h))
        final_video.audio = CompositeAudioClip(audio_clips) if audio_clips else None

        ts = int(time.time())
        out_fname = f"video_export_{req.resolution}_{ts}.mp4"
        out_filepath = os.path.join(OUTPUT_DIR, out_fname)
        temp_audio = os.path.join(TEMP_DIR, f"{job_id}_temp.m4a")

        final_video.write_videofile(
            out_filepath, fps=req.fps or 30, codec="libx264", audio_codec="aac",
            temp_audiofile=temp_audio, remove_temp=True, threads=os.cpu_count() or 8,
            preset="veryfast", ffmpeg_params=["-movflags", "+faststart"],
            logger=CancellableRenderLogger(job_id)
        )
        final_video.close()
        for c in opened_clips:
            try: c.close()
            except Exception: pass

        state["status"] = "completed"; state["progress"] = 100
        state["video_url"] = f"http://127.0.0.1:8000/output/{out_fname}"
        state["filename"] = out_fname
        write_job_state(job_id, state)
    except InterruptedError:
        if final_video: final_video.close()
        for c in opened_clips: c.close()
        cleanup_job_temp_files(job_id, out_filepath)
        state["status"] = "cancelled"; state["error"] = "Da huy xuat."
        write_job_state(job_id, state)
    except Exception as err:
        if final_video: final_video.close()
        for c in opened_clips: c.close()
        cleanup_job_temp_files(job_id, out_filepath)
        state["status"] = "error"; state["error"] = str(err)
        write_job_state(job_id, state)

@router.post("/export-task")
def start_export_task(req: ExportRequest):
    jid = "job_" + uuid.uuid4().hex[:10]
    write_job_state(jid, {"status": "rendering", "progress": 0, "current_frame": 0, "total_frames": 0, "video_url": None, "error": None, "cancel_requested": False})
    t = threading.Thread(target=run_render_task, args=(jid, req), daemon=True)
    t.start()
    return {"status": "started", "job_id": jid}

@router.get("/progress/{job_id}")
def get_render_progress(job_id: str):
    s = read_job_state(job_id)
    if not s: raise HTTPException(status_code=404, detail="Job ID khong ton tai")
    return s

@router.post("/cancel/{job_id}")
def cancel_render_task(job_id: str):
    s = read_job_state(job_id)
    if not s: raise HTTPException(status_code=404, detail="Job ID khong ton tai")
    s["cancel_requested"] = True
    write_job_state(job_id, s)
    return {"status": "cancelling"}
"""
with open(os.path.join("backend", "routers", "video.py"), "w", encoding="utf-8") as f:
    f.write(video_py)
print(">>> [1/2] Cap nhat backend/routers/video.py thanh cong!")
