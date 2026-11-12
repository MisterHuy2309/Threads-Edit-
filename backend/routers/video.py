import os
import sys
import time
import json
import uuid
import threading
import urllib.parse
from typing import List, Optional
from fastapi import APIRouter
from pydantic import BaseModel
from proglog import ProgressBarLogger
from PIL import Image
import numpy as np

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROOT_DIR = os.path.dirname(BASE_DIR)
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

if not hasattr(Image, "ANTIALIAS"):
    Image.ANTIALIAS = getattr(Image, "LANCZOS", getattr(Image.Resampling, "LANCZOS", None))

from moviepy.editor import (
    VideoFileClip,
    AudioFileClip,
    ImageClip,
    CompositeVideoClip,
    CompositeAudioClip,
    vfx
)

router = APIRouter(prefix="/api/video", tags=["Video Render"])

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

def cleanup_job_temp_files(job_id: str, output_file: Optional[str] = None):
    if output_file and os.path.exists(output_file):
        try:
            os.remove(output_file)
        except Exception:
            pass
    if os.path.exists(TEMP_DIR):
        for f in os.listdir(TEMP_DIR):
            if job_id in f or "TEMP_MPY" in f:
                try:
                    os.remove(os.path.join(TEMP_DIR, f))
                except Exception:
                    pass

class CancellableRenderLogger(ProgressBarLogger):
    def __init__(self, job_id: str):
        super().__init__()
        self.job_id = job_id
        self.last_update = 0.0

    def callback(self, **changes):
        now = time.time()
        if now - self.last_update < 0.35:
            return
        self.last_update = now
        state = read_job_state(self.job_id) or {}
        if state.get("cancel_requested"):
            raise InterruptedError("Da huy xuat video.")
        for bar in self.state.get("bars", {}).values():
            if bar.get("total") and bar.get("index") is not None:
                total = max(1, bar["total"])
                current = bar["index"]
                percent = int((current / total) * 95)
                state["progress"] = min(98, max(1, percent))
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
    file_name: Optional[str] = None
    opacity: Optional[float] = 0.9
    scale: Optional[float] = 1.0
    x: Optional[float] = 20.0
    y: Optional[float] = 25.0

class ExportRequest(BaseModel):
    resolution: Optional[str] = "1080p"
    fps: Optional[int] = 30
    bg_clips: List[BgClipInput] = []
    blocks: List[OverlayBlockInput] = []
    meme_images: Optional[List[OverlayBlockInput]] = []
    voices: Optional[List[AudioTrackInput]] = []
    bgm_list: Optional[List[AudioTrackInput]] = []
    sound_fx_list: Optional[List[AudioTrackInput]] = []
    watermark: Optional[WatermarkInput] = None

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

    pub_candidate = os.path.normpath(os.path.join(ROOT_DIR, "frontend", "public", clean))
    if os.path.exists(pub_candidate):
        return pub_candidate

    filename_only = os.path.basename(clean)
    media_root = os.path.join(BASE_DIR, "media")
    for root, _, files in os.walk(media_root):
        if filename_only in files:
            return os.path.normpath(os.path.join(root, filename_only))

    return candidate

def get_watermark_file_path(wm: WatermarkInput) -> str:
    if wm.image_url:
        p = resolve_local_path(wm.image_url)
        if os.path.exists(p):
            return p
    if wm.file_name:
        p2 = resolve_local_path(f"/media/watermarks/{wm.file_name}")
        if os.path.exists(p2):
            return p2

    style_key = (wm.style or "W1").lower()
    num_key = style_key.replace("w", "")
    candidates = [
        os.path.join(WATERMARK_DIR, f"watermark_{num_key}.png"),
        os.path.join(WATERMARK_DIR, f"watermark_{style_key}.png"),
        os.path.join(ROOT_DIR, "frontend", "public", "watermarks", f"watermark_{num_key}.png"),
    ]
    for c in candidates:
        if os.path.exists(c):
            return c
    if os.path.exists(WATERMARK_DIR):
        pngs = [os.path.join(WATERMARK_DIR, f) for f in os.listdir(WATERMARK_DIR) if f.lower().endswith(".png")]
        if pngs:
            return pngs[0]
    return ""

def make_pil_image_clip(img_path: str, target_w: int, opacity: float = 1.0):
    pil_img = Image.open(img_path).convert("RGBA")
    ratio = target_w / float(pil_img.width)
    target_h = max(4, int(pil_img.height * ratio))
    pil_img = pil_img.resize((max(4, target_w), target_h), Image.Resampling.LANCZOS)
    if opacity is not None and opacity < 1.0:
        r, g, b, a = pil_img.split()
        a = a.point(lambda px: int(px * opacity))
        pil_img = Image.merge("RGBA", (r, g, b, a))
    return ImageClip(np.array(pil_img))

def run_render_task(job_id: str, req: ExportRequest):
    out_filepath = None
    final_video = None
    opened_clips = []
    state = read_job_state(job_id) or {}

    try:
        print(f"[Render Start] Job={job_id}, Res={req.resolution}")
        state["progress"] = 2
        write_job_state(job_id, state)

        res_map = {"1080p": (1080, 1920), "2k": (1440, 2560), "4k": (2160, 3840)}
        target_w, target_h = res_map.get((req.resolution or "1080p").lower(), (1080, 1920))
        scale_factor = target_w / 1080.0

        video_clips = []
        audio_clips = []

        # 1. Video nền
        for clip_info in req.bg_clips:
            real_p = resolve_local_path(clip_info.video_path)
            if os.path.exists(real_p):
                v = VideoFileClip(real_p).without_audio()
                opened_clips.append(v)
                speed = clip_info.speed or 1.0
                if speed != 1.0 and hasattr(vfx, "speedx"):
                    v = v.fx(vfx.speedx, speed)

                t_start = max(0.0, clip_info.trimStart or 0.0)
                t_end = min(v.duration, t_start + clip_info.duration)
                if t_end > t_start:
                    sub_v = v.subclip(t_start, t_end).set_start(clip_info.startTime)
                    sub_v = sub_v.resize(height=target_h)
                    if sub_v.w > target_w:
                        sub_v = sub_v.crop(x_center=sub_v.w / 2, width=target_w)
                    video_clips.append(sub_v)

        state["progress"] = 5
        write_job_state(job_id, state)

        # 2. Ảnh Comment
        for b in req.blocks:
            img_p = resolve_local_path(b.image_path)
            if os.path.exists(img_p):
                target_img_w = int((b.img_width or 800) * scale_factor)
                img_clip = (
                    make_pil_image_clip(img_p, target_img_w, b.opacity if b.opacity is not None else 1.0)
                    .set_start(b.startTime)
                    .set_duration(b.duration)
                    .set_position((int(b.img_x * scale_factor), int(b.img_y * scale_factor)))
                )
                opened_clips.append(img_clip)
                video_clips.append(img_clip)

        # 3. Meme Ảnh / Video
        if req.meme_images:
            for m in req.meme_images:
                m_path = resolve_local_path(m.image_path)
                if os.path.exists(m_path):
                    target_m_w = int((m.img_width or 350) * scale_factor)
                    if m_path.lower().endswith((".mp4", ".mov", ".webm", ".mkv")):
                        mv = VideoFileClip(m_path).without_audio()
                        opened_clips.append(mv)
                        meme_clip = mv.subclip(0, min(m.duration, mv.duration)).resize(width=target_m_w)
                        if m.opacity is not None and m.opacity < 1.0 and hasattr(meme_clip, "set_opacity"):
                            meme_clip = meme_clip.set_opacity(m.opacity)
                    else:
                        meme_clip = make_pil_image_clip(m_path, target_m_w, m.opacity if m.opacity is not None else 1.0)
                    meme_clip = (
                        meme_clip
                        .set_start(m.startTime)
                        .set_duration(m.duration)
                        .set_position((int(m.img_x * scale_factor), int(m.img_y * scale_factor)))
                    )
                    opened_clips.append(meme_clip)
                    video_clips.append(meme_clip)

        # 4. Audio (Voice + BGM + SoundFX)
        all_audios = (req.voices or []) + (req.bgm_list or []) + (req.sound_fx_list or [])
        for a in all_audios:
            a_p = resolve_local_path(a.audio_path)
            if os.path.exists(a_p):
                a_clip = AudioFileClip(a_p)
                opened_clips.append(a_clip)
                t_start = max(0.0, a.trimStart or 0.0)
                t_end = min(a_clip.duration, t_start + a.duration)
                if t_end > t_start:
                    a_sub = a_clip.subclip(t_start, t_end).set_start(a.startTime)
                    vol_ratio = (a.volume if a.volume is not None else 100.0) / 100.0
                    a_sub = a_sub.volumex(vol_ratio)
                    audio_clips.append(a_sub)

        if not video_clips:
            state["status"] = "error"
            state["error"] = "Khong tim thay clip video hoac anh hop le tren timeline."
            write_job_state(job_id, state)
            return

        total_dur = max([c.end for c in video_clips] + ([a.end for a in audio_clips] if audio_clips else [5.0]))

        # 5. Watermark (Lớp trên cùng)
        if req.watermark and req.watermark.enabled:
            wm_file = get_watermark_file_path(req.watermark)
            print(f"[WM] enabled=True, file={wm_file}")
            if wm_file and os.path.exists(wm_file):
                pil_wm = Image.open(wm_file).convert("RGBA")
                target_wm_h = max(16, int(122 * scale_factor * (req.watermark.scale or 1.0)))
                ratio = target_wm_h / float(pil_wm.height)
                target_wm_w = max(16, int(pil_wm.width * ratio))
                pil_wm = pil_wm.resize((target_wm_w, target_wm_h), Image.Resampling.LANCZOS)

                wm_op = req.watermark.opacity if req.watermark.opacity is not None else 0.9
                if wm_op > 1.0:
                    wm_op = wm_op / 100.0
                if wm_op < 1.0:
                    r_c, g_c, b_c, a_c = pil_wm.split()
                    a_c = a_c.point(lambda px: int(px * wm_op))
                    pil_wm = Image.merge("RGBA", (r_c, g_c, b_c, a_c))

                real_wm_x = int((req.watermark.x or 20.0) * scale_factor)
                real_wm_y = int((req.watermark.y or 25.0) * scale_factor)

                wm_clip = (
                    ImageClip(np.array(pil_wm))
                    .set_start(0)
                    .set_duration(total_dur)
                    .set_position((real_wm_x, real_wm_y))
                )
                opened_clips.append(wm_clip)
                video_clips.append(wm_clip)
                print(f"[WM OK] Gan watermark tai ({real_wm_x}, {real_wm_y}), size={target_wm_w}x{target_wm_h}")

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
        final_video.write_videofile(
            out_filepath,
            fps=req.fps or 30,
            codec="libx264",
            audio_codec="aac",
            temp_audiofile=temp_audiofile_path,
            remove_temp=True,
            bitrate="6000k",
            preset="ultrafast",
            threads=os.cpu_count() or 8,
            ffmpeg_params=["-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart"],
            logger=logger
        )

        final_video.close()
        for c in opened_clips:
            try:
                c.close()
            except Exception:
                pass
        cleanup_job_temp_files(job_id)

        state["status"] = "completed"
        state["progress"] = 100
        state["video_url"] = f"http://127.0.0.1:8000/output/{out_filename}"
        state["filename"] = out_filename
        write_job_state(job_id, state)
        print(f"[Render Done] {out_filename}")

    except InterruptedError:
        if final_video:
            try: final_video.close()
            except Exception: pass
        for c in opened_clips:
            try: c.close()
            except Exception: pass
        cleanup_job_temp_files(job_id, out_filepath)
        state["status"] = "cancelled"
        state["error"] = "Da huy xuat video."
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
async def start_export_task(req: ExportRequest):
    job_id = f"job_{uuid.uuid4().hex[:10]}"
    write_job_state(job_id, {
        "job_id": job_id,
        "status": "processing",
        "progress": 1,
        "cancel_requested": False
    })
    t = threading.Thread(target=run_render_task, args=(job_id, req), daemon=True)
    t.start()
    return {"job_id": job_id}

@router.get("/progress/{job_id}")
async def get_export_progress(job_id: str):
    state = read_job_state(job_id)
    if not state:
        return {"status": "error", "progress": 0, "error": "Tien trinh da bi ngat, vui long bam Xuat lai."}
    return state

@router.post("/cancel/{job_id}")
async def cancel_export_task(job_id: str):
    state = read_job_state(job_id) or {}
    state["cancel_requested"] = True
    state["status"] = "cancelled"
    write_job_state(job_id, state)
    return {"status": "cancelled"}
