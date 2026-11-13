import os
import sys
import time
import json
import uuid
import shutil
import threading
import subprocess
import urllib.parse
from typing import List, Optional, Any
from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict
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
    CompositeAudioClip
)

router = APIRouter(prefix="/api/video", tags=["Video Render"])

JOB_STATES_MEM = {}
STATE_LOCK = threading.Lock()

def write_job_state(job_id: str, data: dict):
    with STATE_LOCK:
        JOB_STATES_MEM[job_id] = data.copy()
        path = os.path.join(PROGRESS_DIR, f"{job_id}.json")
        tmp_path = path + ".tmp"
        try:
            with open(tmp_path, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False)
            os.replace(tmp_path, path)
        except Exception:
            pass

def read_job_state(job_id: str) -> Optional[dict]:
    with STATE_LOCK:
        if job_id in JOB_STATES_MEM:
            return JOB_STATES_MEM[job_id].copy()
        path = os.path.join(PROGRESS_DIR, f"{job_id}.json")
        if os.path.exists(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    JOB_STATES_MEM[job_id] = data
                    return data.copy()
            except Exception:
                return None
    return None

def check_cancelled(job_id: str):
    st = read_job_state(job_id) or {}
    if st.get("cancel_requested"):
        raise InterruptedError("Da huy xuat video.")

def cleanup_job_temp_files(job_id: str, output_file: Optional[str] = None):
    if output_file and os.path.exists(output_file):
        try: os.remove(output_file)
        except Exception: pass
    if os.path.exists(TEMP_DIR):
        for f in os.listdir(TEMP_DIR):
            if job_id in f or "TEMP_MPY" in f:
                try: os.remove(os.path.join(TEMP_DIR, f))
                except Exception: pass

class CancellableRenderLogger(ProgressBarLogger):
    def __init__(self, job_id: str):
        super().__init__()
        self.job_id = job_id
        self.last_update = 0.0

    def callback(self, **changes):
        now = time.time()
        if now - self.last_update < 0.3:
            return
        self.last_update = now
        state = read_job_state(self.job_id) or {}
        if state.get("cancel_requested"):
            raise InterruptedError("Da huy xuat video.")
        for bar_name, bar in self.state.get("bars", {}).items():
            if bar.get("total") and bar.get("index") is not None:
                total = max(1, bar["total"])
                current = bar["index"]
                if bar_name == "chunk":
                    percent = 25 + int((current / total) * 10)
                else:
                    percent = 35 + int((current / total) * 63)
                state["progress"] = min(98, max(state.get("progress", 25), percent))
                write_job_state(self.job_id, state)

# Cho phép nhận thêm các trường alias từ frontend (extra="allow")
class BgClipInput(BaseModel):
    model_config = ConfigDict(extra="allow")
    video_path: Optional[str] = None
    path: Optional[str] = None
    url: Optional[str] = None
    startTime: Optional[float] = 0.0
    start: Optional[float] = None
    duration: float = 5.0
    trimStart: Optional[float] = 0.0
    trim_start: Optional[float] = None
    speed: Optional[float] = 1.0
    playbackRate: Optional[float] = None

class OverlayBlockInput(BaseModel):
    model_config = ConfigDict(extra="allow")
    image_path: Optional[str] = None
    path: Optional[str] = None
    url: Optional[str] = None
    startTime: Optional[float] = 0.0
    start: Optional[float] = None
    duration: float = 3.0
    img_x: float = 0.0
    img_y: float = 0.0
    img_width: float = 800.0
    animation: Optional[str] = "none"
    opacity: Optional[float] = 1.0

class AudioTrackInput(BaseModel):
    model_config = ConfigDict(extra="allow")
    audio_path: Optional[str] = None
    path: Optional[str] = None
    url: Optional[str] = None
    startTime: Optional[float] = 0.0
    start: Optional[float] = None
    duration: float = 3.0
    trimStart: Optional[float] = 0.0
    trim_start: Optional[float] = None
    speed: Optional[float] = None
    playbackRate: Optional[float] = None
    rate: Optional[float] = None
    volume: Optional[float] = 100.0

class WatermarkInput(BaseModel):
    model_config = ConfigDict(extra="allow")
    enabled: bool = False
    style: Optional[str] = "W1"
    image_url: Optional[str] = None
    file_name: Optional[str] = None
    opacity: Optional[float] = 0.9
    scale: Optional[float] = 1.0
    x: Optional[float] = 20.0
    y: Optional[float] = 25.0

class ExportRequest(BaseModel):
    model_config = ConfigDict(extra="allow")
    resolution: Optional[str] = "1080p"
    fps: Optional[int] = 30
    bg_clips: List[BgClipInput] = []
    blocks: List[OverlayBlockInput] = []
    meme_images: Optional[List[OverlayBlockInput]] = []
    voices: Optional[List[AudioTrackInput]] = []
    bgm_list: Optional[List[AudioTrackInput]] = []
    sound_fx_list: Optional[List[AudioTrackInput]] = []
    watermark: Optional[WatermarkInput] = None

def resolve_local_path(url_or_path: Optional[str]) -> str:
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

def extract_bg_segment_ffmpeg(
    src_path: str,
    job_id: str,
    idx: int,
    trim_start: float,
    req_duration: float,
    speed: float,
    target_w: int,
    target_h: int,
    fps: int
) -> str:
    """
    Dùng FFmpeg trích xuất chính xác từng đoạn video nền (cắt trimStart, chỉnh speed, scale+crop chuẩn 9:16, loop nếu thiếu)
    thành file mp4 sạch độc lập. Khắc phục 100% lỗi hỏng khung hình và cách đoạn của MoviePy!
    """
    seg_out = os.path.join(TEMP_DIR, f"{job_id}_bg_{idx}.mp4")
    spd = speed if (speed and speed > 0.1) else 1.0
    t_start = max(0.0, trim_start or 0.0)
    req_dur = max(0.1, req_duration)

    # Bộ lọc scale phủ kín khung hình target_w x target_h và crop chính giữa + đổi tốc độ setpts
    vf = (
        f"setpts=PTS/{spd},"
        f"scale={target_w}:{target_h}:force_original_aspect_ratio=increase,"
        f"crop={target_w}:{target_h},"
        f"fps={fps},format=yuv420p"
    )

    # Dùng -stream_loop -1 nếu clip gốc ngắn hơn req_dur để đảm bảo lấp kín toàn bộ block trên timeline
    cmd = [
        "ffmpeg", "-y",
        "-stream_loop", "-1",
        "-ss", f"{t_start:.3f}",
        "-i", src_path,
        "-t", f"{req_dur:.3f}",
        "-an",
        "-vf", vf,
        "-c:v", "libx264", "-preset", "ultrafast", "-crf", "18",
        seg_out
    ]
    subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
    return seg_out

def prepare_normalized_audio(src_path: str, job_id: str, idx: int, speed: float = 1.0) -> str:
    """
    Áp dụng chính xác tốc độ đọc của block voice/audio bằng FFmpeg atempo và xuất WAV Stereo 44100Hz.
    """
    norm_wav = os.path.join(TEMP_DIR, f"{job_id}_aud_{idx}.wav")
    spd = speed if (speed and speed > 0.1) else 1.0
    if abs(spd - 1.0) >= 0.01:
        # Xây dựng chuỗi atempo hỗ trợ mọi dải tốc độ từ 0.25x đến 4.0x
        filters = []
        rem = spd
        while rem < 0.5:
            filters.append("atempo=0.5")
            rem /= 0.5
        while rem > 2.0:
            filters.append("atempo=2.0")
            rem /= 2.0
        filters.append(f"atempo={round(rem, 4)}")
        af = ",".join(filters)
        cmd = ["ffmpeg", "-y", "-i", src_path, "-af", af, "-ar", "44100", "-ac", "2", norm_wav]
    else:
        cmd = ["ffmpeg", "-y", "-i", src_path, "-ar", "44100", "-ac", "2", norm_wav]
    subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
    return norm_wav

def run_render_task(job_id: str, req: ExportRequest):
    out_filepath = None
    final_video = None
    opened_clips = []
    state = read_job_state(job_id) or {"job_id": job_id, "status": "processing", "progress": 2}

    try:
        print(f"[Render Start] Job={job_id}, Res={req.resolution}, FPS={req.fps}")
        print(f"[Payload Debug] bg={len(req.bg_clips)}, blocks={len(req.blocks)}, voices={len(req.voices or [])}, bgm={len(req.bgm_list or [])}")
        for i, v_item in enumerate(req.voices or []):
            print(f"   -> Voice[{i}]: start={v_item.startTime}, dur={v_item.duration}, speed={v_item.speed}, playbackRate={v_item.playbackRate}, extra={v_item.model_extra}")

        state["progress"] = 3
        write_job_state(job_id, state)

        res_map = {"1080p": (1080, 1920), "2k": (1440, 2560), "4k": (2160, 3840)}
        target_w, target_h = res_map.get((req.resolution or "1080p").lower(), (1080, 1920))
        scale_factor = target_w / 1080.0
        target_fps = req.fps or 30

        video_clips = []
        audio_clips = []

        # 1. Xử lý từng clip nền bằng FFmpeg độc lập -> Không bao giờ hỏng khung hình hay cách đoạn
        sorted_bg = sorted(req.bg_clips, key=lambda x: (x.startTime if x.startTime is not None else (x.start or 0.0)))
        for idx, clip_info in enumerate(sorted_bg):
            check_cancelled(job_id)
            raw_p = clip_info.video_path or clip_info.path or clip_info.url
            real_p = resolve_local_path(raw_p)
            if os.path.exists(real_p):
                st_time = clip_info.startTime if clip_info.startTime is not None else (clip_info.start or 0.0)
                tr_start = clip_info.trimStart if clip_info.trimStart is not None else (clip_info.trim_start or 0.0)
                spd = clip_info.speed if clip_info.speed is not None else (clip_info.playbackRate or 1.0)

                seg_mp4 = extract_bg_segment_ffmpeg(
                    src_path=real_p,
                    job_id=job_id,
                    idx=idx,
                    trim_start=tr_start,
                    req_duration=clip_info.duration,
                    speed=spd,
                    target_w=target_w,
                    target_h=target_h,
                    fps=target_fps
                )
                v = VideoFileClip(seg_mp4).without_audio()
                opened_clips.append(v)
                sub_v = v.set_start(st_time).set_duration(clip_info.duration)
                video_clips.append(sub_v)

        state["progress"] = 12
        write_job_state(job_id, state)

        # 2. Ảnh Comment / Block nội dung
        for b in req.blocks:
            check_cancelled(job_id)
            raw_img = b.image_path or b.path or b.url
            img_p = resolve_local_path(raw_img)
            if os.path.exists(img_p):
                st_time = b.startTime if b.startTime is not None else (b.start or 0.0)
                target_img_w = int((b.img_width or 800) * scale_factor)
                img_clip = (
                    make_pil_image_clip(img_p, target_img_w, b.opacity if b.opacity is not None else 1.0)
                    .set_start(st_time)
                    .set_duration(b.duration)
                    .set_position((int(b.img_x * scale_factor), int(b.img_y * scale_factor)))
                )
                opened_clips.append(img_clip)
                video_clips.append(img_clip)

        state["progress"] = 15
        write_job_state(job_id, state)

        # 3. Meme Ảnh / Video
        if req.meme_images:
            for idx, m in enumerate(req.meme_images):
                check_cancelled(job_id)
                raw_m = m.image_path or m.path or m.url
                m_path = resolve_local_path(raw_m)
                if os.path.exists(m_path):
                    st_time = m.startTime if m.startTime is not None else (m.start or 0.0)
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
                        .set_start(st_time)
                        .set_duration(m.duration)
                        .set_position((int(m.img_x * scale_factor), int(m.img_y * scale_factor)))
                    )
                    opened_clips.append(meme_clip)
                    video_clips.append(meme_clip)

        state["progress"] = 18
        write_job_state(job_id, state)

        # 4. Audio (Voice + BGM + SoundFX): Bắt mọi tên trường tốc độ (speed / playbackRate / rate)
        all_audios = (req.voices or []) + (req.bgm_list or []) + (req.sound_fx_list or [])
        for idx, a in enumerate(all_audios):
            check_cancelled(job_id)
            raw_a = a.audio_path or a.path or a.url
            a_p = resolve_local_path(raw_a)
            if os.path.exists(a_p) and os.path.getsize(a_p) > 100:
                st_time = a.startTime if a.startTime is not None else (a.start or 0.0)
                tr_start = a.trimStart if a.trimStart is not None else (a.trim_start or 0.0)
                
                # Tìm tốc độ thực tế của block trên timeline
                spd = 1.0
                for cand_spd in [a.speed, a.playbackRate, a.rate]:
                    if cand_spd is not None and cand_spd > 0:
                        spd = float(cand_spd)
                        break

                norm_wav = prepare_normalized_audio(a_p, job_id, idx, speed=spd)
                a_clip = AudioFileClip(norm_wav, fps=44100)
                opened_clips.append(a_clip)

                # Sau khi đổi tốc độ bằng FFmpeg, thời lượng file norm_wav đã tự co giãn đúng tỷ lệ (dur / spd)
                t_start = max(0.0, tr_start)
                t_end = min(a_clip.duration, t_start + a.duration)
                if t_end > t_start:
                    a_sub = a_clip.subclip(t_start, t_end).set_start(st_time)
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

        state["progress"] = 25
        write_job_state(job_id, state)
        print(f"[Render Composing] Total duration={total_dur:.2f}s, Audio tracks={len(audio_clips)}")

        final_video = CompositeVideoClip(video_clips, size=(target_w, target_h)).set_duration(total_dur)
        if audio_clips:
            comp_audio = CompositeAudioClip(audio_clips)
            comp_audio.fps = 44100
            final_video.audio = comp_audio
        else:
            final_video = final_video.without_audio()

        timestamp = int(time.time())
        out_filename = f"video_export_{req.resolution}_{timestamp}.mp4"
        out_filepath = os.path.join(OUTPUT_DIR, out_filename)
        temp_audiofile_path = os.path.join(TEMP_DIR, f"{job_id}_temp_audio.m4a")

        logger = CancellableRenderLogger(job_id)
        final_video.write_videofile(
            out_filepath,
            fps=target_fps,
            codec="libx264",
            audio_codec="aac",
            audio_fps=44100,
            temp_audiofile=temp_audiofile_path,
            remove_temp=True,
            bitrate="5000k",
            preset="ultrafast",
            threads=os.cpu_count() or 8,
            ffmpeg_params=["-crf", "22", "-pix_fmt", "yuv420p", "-movflags", "+faststart"],
            logger=logger
        )

        final_video.close()
        for c in opened_clips:
            try: c.close()
            except Exception: pass
        cleanup_job_temp_files(job_id)

        state["status"] = "completed"
        state["progress"] = 100
        state["video_url"] = f"http://127.0.0.1:8000/output/{out_filename}"
        state["filename"] = out_filename
        write_job_state(job_id, state)
        print(f"[Render Done] {out_filename}")

    except InterruptedError:
        print(f"[Render Cancelled] Job={job_id}")
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
        import traceback
        traceback.print_exc()
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
    state = read_job_state(job_id) or {"job_id": job_id}
    state["cancel_requested"] = True
    state["status"] = "cancelled"
    write_job_state(job_id, state)
    return {"status": "cancelled"}
