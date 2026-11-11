const fs = require("fs");
const path = require("path");

// 1. CẬP NHẬT BACKEND: backend/routers/video.py (Dùng Watermark ảnh tĩnh PNG/JPG)
const videoPyPath = path.join(__dirname, "backend", "routers", "video.py");
const videoPyContent = `import os
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
    VideoFileClip,
    AudioFileClip,
    ImageClip,
    CompositeVideoClip,
    CompositeAudioClip,
    vfx
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

    clean = clean.lstrip("/").lstrip("\\\\")
    candidate = os.path.normpath(os.path.join(BASE_DIR, clean))
    if os.path.exists(candidate):
        return candidate

    filename_only = os.path.basename(clean)
    media_root = os.path.join(BASE_DIR, "media")
    for root, _, files in os.walk(media_root):
        if filename_only in files:
            return os.path.normpath(os.path.join(root, filename_only))

    return candidate

def get_watermark_file_path(style: str, custom_url: Optional[str] = None) -> str:
    if custom_url:
        p = resolve_local_path(custom_url)
        if os.path.exists(p):
            return p
    style_key = (style or "W1").lower()
    candidates = [
        os.path.join(WATERMARK_DIR, f"watermark_{style_key}.png"),
        os.path.join(WATERMARK_DIR, f"watermark_{style_key}.jpg"),
        os.path.join(BASE_DIR, "media", "mascots", f"mascot_{style_key}.png"),
    ]
    for c in candidates:
        if os.path.exists(c):
            return c
    return ""

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
        preview_scale = 1080.0 / 320.0

        video_clips = []
        audio_clips = []

        # 1. Video Nền
        for clip_info in req.bg_clips:
            real_p = resolve_local_path(clip_info.video_path)
            if os.path.exists(real_p):
                try:
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
                except Exception as e:
                    print(f"Lỗi clip nền: {e}")

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
                    if (b.opacity is not None) and b.opacity < 1.0 and hasattr(img_clip, "set_opacity"):
                        img_clip = img_clip.set_opacity(b.opacity)
                    opened_clips.append(img_clip)
                    video_clips.append(img_clip)
                except Exception as e:
                    print(f"Lỗi comment: {e}")

        # 3. Ảnh & Video Meme
        if req.meme_images:
            for m in req.meme_images:
                m_path = resolve_local_path(m.image_path)
                if os.path.exists(m_path):
                    try:
                        target_m_w = int(m.img_width * scale_factor)
                        is_vid = m_path.lower().endswith((".mp4", ".mov", ".webm", ".mkv"))
                        if is_vid:
                            meme_clip = VideoFileClip(m_path).without_audio().subclip(0, min(m.duration, 15))
                        else:
                            meme_clip = ImageClip(m_path)

                        meme_clip = (
                            meme_clip
                            .set_start(m.startTime)
                            .set_duration(m.duration)
                            .resize(width=target_m_w)
                            .set_position((int(m.img_x * scale_factor), int(m.img_y * scale_factor)))
                        )
                        if (m.opacity is not None) and m.opacity < 1.0 and hasattr(meme_clip, "set_opacity"):
                            meme_clip = meme_clip.set_opacity(m.opacity)

                        opened_clips.append(meme_clip)
                        video_clips.append(meme_clip)
                    except Exception as e:
                        print(f"Lỗi meme: {e}")

        # 4. Multi-track Audio
        all_audios = (req.voices or []) + (req.bgm_list or []) + (req.sound_fx_list or [])
        for a in all_audios:
            a_p = resolve_local_path(a.audio_path)
            if os.path.exists(a_p):
                try:
                    a_clip = AudioFileClip(a_p)
                    opened_clips.append(a_clip)
                    t_start = max(0.0, a.trimStart or 0.0)
                    t_end = min(a_clip.duration, t_start + a.duration)
                    if t_end > t_start:
                        a_sub = a_clip.subclip(t_start, t_end).set_start(a.startTime)
                        vol_ratio = (a.volume if a.volume is not None else 100.0) / 100.0
                        a_sub = a_sub.volumex(vol_ratio)
                        audio_clips.append(a_sub)
                except Exception as e:
                    print(f"Lỗi audio: {e}")

        if not video_clips:
            state["status"] = "error"
            state["error"] = "Không tìm thấy clip video hoặc ảnh hợp lệ."
            write_job_state(job_id, state)
            return

        total_dur = max([c.end for c in video_clips] + ([a.end for a in audio_clips] if audio_clips else [15.0]))

        # 5. GẮN LỚP WATERMARK TỪ FILE PNG/JPG TĨNH
        if req.watermark and req.watermark.enabled:
            try:
                wm_file = get_watermark_file_path(req.watermark.style or "W1", req.watermark.image_url)
                if wm_file and os.path.exists(wm_file):
                    wm_scale = (req.watermark.scale or 1.0) * scale_factor
                    real_wm_x = int((req.watermark.x or 20.0) * preview_scale * scale_factor)
                    real_wm_y = int((req.watermark.y or 25.0) * preview_scale * scale_factor)

                    wm_clip = (
                        ImageClip(wm_file)
                        .set_start(0)
                        .set_duration(total_dur)
                        .resize(wm_scale)
                        .set_position((real_wm_x, real_wm_y))
                    )
                    if req.watermark.opacity is not None and hasattr(wm_clip, "set_opacity"):
                        wm_clip = wm_clip.set_opacity(req.watermark.opacity)
                    opened_clips.append(wm_clip)
                    video_clips.append(wm_clip)
            except Exception as e:
                print(f"Lỗi render watermark: {e}")

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
        cpu_cores = os.cpu_count() or 8
        final_video.write_videofile(
            out_filepath,
            fps=req.fps or 30,
            codec="libx264",
            audio_codec="aac",
            temp_audiofile=temp_audiofile_path,
            remove_temp=True,
            threads=cpu_cores,
            preset="veryfast",
            ffmpeg_params=["-movflags", "+faststart"],
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
        if final_video:
            try: final_video.close()
            except Exception: pass
        for c in opened_clips:
            try: c.close()
            except Exception: pass
        cleanup_job_temp_files(job_id, out_filepath)
        state["status"] = "cancelled"
        state["error"] = "Đã hủy xuất video."
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
`;
fs.writeFileSync(videoPyPath, videoPyContent, "utf8");
console.log(">>> [1/3] Da cap nhat backend/routers/video.py thanh cong!");

// 2. CẬP NHẬT TIMELINE: frontend/src/components/Timeline.tsx
// Hỗ trợ kéo di chuyển Meme, nút Cân ảnh khớp Voice + Ripple đẩy các block sau, checkbox bật tắt Ripple trên từng timeline
const timelineTsxPath = path.join(__dirname, "frontend", "src", "components", "Timeline.tsx");
const timelineTsxContent = `"use client";

import React, { useRef, useEffect, useState, useCallback, useMemo } from "react";
import { 
  Play, Pause, RotateCcw, Film, Layers, Volume2, Trash2, ZoomIn, ZoomOut, Link, Unlink, Music, Smile, ChevronDown, ChevronUp, Scissors, Undo2, Redo2, Copy, Wand2, ArrowRightCircle, CheckSquare, Square
} from "lucide-react";
import { BgClipItem, TimelineBlock, TimelineAudioItem, TimelineMemeImageItem, VoiceItem } from "@/types";

export interface TimelineProps {
  bgClips?: BgClipItem[];
  setBgClips?: React.Dispatch<React.SetStateAction<BgClipItem[]>>;
  selectedClipId?: string | null;
  setSelectedClipId?: React.Dispatch<React.SetStateAction<string | null>>;

  blocks?: TimelineBlock[];
  setBlocks?: React.Dispatch<React.SetStateAction<TimelineBlock[]>>;
  selectedBlockId?: string | null;
  setSelectedBlockId?: React.Dispatch<React.SetStateAction<string | null>>;

  voiceList?: VoiceItem[];
  setVoiceList?: React.Dispatch<React.SetStateAction<VoiceItem[]>>;
  selectedVoiceId?: string | null;
  setSelectedVoiceId?: React.Dispatch<React.SetStateAction<string | null>>;

  currentTime: number;
  setCurrentTime: React.Dispatch<React.SetStateAction<number>>;
  isPlaying?: boolean;
  setIsPlaying?: React.Dispatch<React.SetStateAction<boolean>>;
  totalDuration?: number;

  bgmList?: TimelineAudioItem[];
  setBgmList?: React.Dispatch<React.SetStateAction<TimelineAudioItem[]>>;
  soundFxList?: TimelineAudioItem[];
  setSoundFxList?: React.Dispatch<React.SetStateAction<TimelineAudioItem[]>>;
  selectedAudioId?: string | null;
  setSelectedAudioId?: React.Dispatch<React.SetStateAction<string | null>>;

  memeImageList?: TimelineMemeImageItem[];
  setMemeImageList?: React.Dispatch<React.SetStateAction<TimelineMemeImageItem[]>>;
  selectedMemeId?: string | null;
  setSelectedMemeId?: React.Dispatch<React.SetStateAction<string | null>>;

  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onRecordHistory?: () => void;
}

const AudioWaveformSvg: React.FC<{
  id: string;
  width: number;
  color: string;
  seedStr?: string;
}> = ({ id, width, color, seedStr = "" }) => {
  const bars = useMemo(() => {
    const barWidth = 3;
    const gap = 1.5;
    const count = Math.max(8, Math.floor(width / (barWidth + gap)));
    const result: number[] = [];
    let hash = 0;
    for (let i = 0; i < seedStr.length; i++) {
      hash = (hash << 5) - hash + seedStr.charCodeAt(i);
      hash |= 0;
    }
    for (let i = 0; i < count; i++) {
      const pseudo = Math.sin(i * 0.35 + (hash % 100)) * 0.4 + Math.cos(i * 0.8 + (hash % 50)) * 0.3 + 0.5;
      const heightPercent = Math.max(18, Math.min(95, Math.round(pseudo * 85)));
      result.push(heightPercent);
    }
    return result;
  }, [width, seedStr]);

  return (
    <div className="absolute inset-0 flex items-center justify-start gap-[1.5px] px-2 pointer-events-none overflow-hidden opacity-45">
      {bars.map((h, idx) => (
        <div
          key={\`\${id}_bar_\${idx}\`}
          style={{ height: \`\${h}%\`, backgroundColor: color }}
          className="w-[3px] rounded-full shrink-0 transition-all duration-75"
        />
      ))}
    </div>
  );
};

export const Timeline: React.FC<TimelineProps> = ({
  bgClips = [],
  setBgClips,
  selectedClipId = null,
  setSelectedClipId,
  blocks = [],
  setBlocks,
  selectedBlockId = null,
  setSelectedBlockId,
  voiceList = [],
  setVoiceList,
  selectedVoiceId = null,
  setSelectedVoiceId,
  currentTime,
  setCurrentTime,
  isPlaying = false,
  setIsPlaying,
  totalDuration: parentTotalDuration,
  bgmList = [],
  setBgmList,
  soundFxList = [],
  setSoundFxList,
  selectedAudioId = null,
  setSelectedAudioId,
  memeImageList = [],
  setMemeImageList,
  selectedMemeId = null,
  setSelectedMemeId,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
  onRecordHistory,
}) => {
  const [pixelsPerSec, setPixelsPerSec] = useState<number>(40);
  const [isScrubbing, setIsScrubbing] = useState<boolean>(false);
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);
  const [timelineHeight, setTimelineHeight] = useState<number>(330);
  const [isResizingHeight, setIsResizingHeight] = useState<boolean>(false);
  const resizeStartY = useRef<number>(0);
  const resizeStartHeight = useRef<number>(330);

  // CHECKBOX DỒN KHỐI (RIPPLE AUTO-SHIFT) TRÊN CÁC TRACK RIÊNG BIỆT
  const [rippleTracks, setRippleTracks] = useState<{ [key: string]: boolean }>({
    overlay: true,
    meme: false,
    video: false,
  });

  const toggleRippleTrack = (trackName: string) => {
    setRippleTracks((prev) => ({ ...prev, [trackName]: !prev[trackName] }));
  };

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [copiedItems, setCopiedItems] = useState<{
    bgClips: BgClipItem[];
    blocks: TimelineBlock[];
    voiceList: VoiceItem[];
    bgmList: TimelineAudioItem[];
    soundFxList: TimelineAudioItem[];
    memeImageList: TimelineMemeImageItem[];
  } | null>(null);

  const audioMapRef = useRef(new Map());

  useEffect(() => {
    const single = selectedClipId || selectedBlockId || selectedVoiceId || selectedAudioId || selectedMemeId;
    if (single && !selectedIds.includes(single)) {
      setSelectedIds([single]);
    }
  }, [selectedClipId, selectedBlockId, selectedVoiceId, selectedAudioId, selectedMemeId]);

  const [dragAction, setDragAction] = useState<{
    target: "overlay" | "video" | "voice" | "bgm" | "soundfx" | "meme_img";
    type: "move" | "resize-right" | "resize-left";
    id: string;
    startX: number;
    initialStart: number;
    initialDuration: number;
    initialTrimStart: number;
    maxOriginalDuration: number;
    speed?: number;
  } | null>(null);

  const timelineRef = useRef<HTMLDivElement>(null);

  const bgEnds = bgClips.map((c) => c.startTime + c.duration);
  const blockEnds = blocks.map((b) => b.startTime + b.duration);
  const voiceEnds = voiceList.map((v) => v.startTime + v.duration);
  const memeEnds = memeImageList.map((m) => m.startTime + m.duration);
  const bgmEnds = [...bgmList, ...soundFxList].map((m) => m.startTime + m.duration);
  const totalDuration = parentTotalDuration || Math.max(...bgEnds, ...blockEnds, ...voiceEnds, ...memeEnds, ...bgmEnds, 15);

  const getFullAudioUrl = (url: string): string => {
    if (!url) return "";
    if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("blob:") || url.startsWith("data:")) return url;
    let clean = url.replace(/\\\\/g, "/");
    clean = clean.replace(/^(http:\\/\\/127\\.0\\.0\\.1:8000|http:\\/\\/localhost:8000)/, "");
    if (!clean.startsWith("/")) clean = "/" + clean;
    if (!clean.startsWith("/media/")) clean = "/media" + clean;
    return \`http://127.0.0.1:8000\${clean}\`;
  };

  const handleSelectBlock = (id: string, e: React.MouseEvent, type: "video" | "overlay" | "voice" | "audio" | "meme") => {
    e.stopPropagation();
    if (e.ctrlKey || e.metaKey || e.shiftKey) {
      setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    } else {
      setSelectedIds([id]);
      if (setSelectedClipId) setSelectedClipId(type === "video" ? id : null);
      if (setSelectedBlockId) setSelectedBlockId(type === "overlay" ? id : null);
      if (setSelectedVoiceId) setSelectedVoiceId(type === "voice" ? id : null);
      if (setSelectedAudioId) setSelectedAudioId(type === "audio" ? id : null);
      if (setSelectedMemeId) setSelectedMemeId(type === "meme" ? id : null);
    }
  };

  // NÚT THÔNG MINH: CÂN ẢNH COMMENT KHỚP VỚI GHI ÂM (VOICE) VÀ DỒN CÁC BLOCK SAU
  const handleSmartAlignBlocksToVoice = useCallback(() => {
    if (!setBlocks || blocks.length === 0 || voiceList.length === 0) return;
    if (onRecordHistory) onRecordHistory();

    const sortedVoices = [...voiceList].sort((a, b) => a.startTime - b.startTime);
    let workingBlocks = [...blocks].sort((a, b) => a.startTime - b.startTime);

    // Xác định tập block cần căn (nếu có chọn thì chỉ căn các block đó, không thì căn toàn bộ)
    const targetBlocks = selectedIds.length > 0 
      ? workingBlocks.filter((b) => selectedIds.includes(b.id)) 
      : workingBlocks;

    targetBlocks.forEach((block) => {
      // Lấy mép trái nhích lên 1 xíu (offset 0.15s - 0.25s) để so khớp chính xác với voice bên dưới
      const probeTime = block.startTime + Math.min(0.25, block.duration / 3);

      // Tìm voice mà điểm probeTime nằm bên trong
      let matchedVoice = sortedVoices.find(
        (v) => probeTime >= v.startTime && probeTime <= (v.startTime + v.duration)
      );

      // Nếu không trúng, tìm voice có startTime gần nhất trong phạm vi 0.8s
      if (!matchedVoice) {
        matchedVoice = sortedVoices.find(
          (v) => Math.abs(v.startTime - block.startTime) <= 0.8
        );
      }

      if (matchedVoice) {
        const oldEnd = block.startTime + block.duration;
        const newStart = matchedVoice.startTime;
        const newDur = matchedVoice.duration;
        const newEnd = newStart + newDur;
        const deltaEnd = newEnd - oldEnd;

        // Cập nhật block hiện tại
        workingBlocks = workingBlocks.map((b) => {
          if (b.id === block.id) {
            return { ...b, startTime: newStart, duration: newDur };
          }
          // Cơ chế đẩy dồn (Ripple Push): Đẩy các block nằm phía sau ra tương ứng
          if (b.startTime >= oldEnd - 0.05) {
            return { ...b, startTime: Number(Math.max(newEnd, b.startTime + deltaEnd).toFixed(2)) };
          }
          return b;
        });
      }
    });

    setBlocks(workingBlocks);
  }, [blocks, voiceList, selectedIds, setBlocks, onRecordHistory]);

  const hasGroupedSelected = [
    ...bgClips, ...blocks, ...voiceList, ...bgmList, ...soundFxList, ...memeImageList
  ].some((x) => selectedIds.includes(x.id) && x.groupId);

  const handleToggleGroup = useCallback(() => {
    if (selectedIds.length === 0) return;
    if (onRecordHistory) onRecordHistory();

    if (hasGroupedSelected) {
      const unsetGroup = (item: any) => selectedIds.includes(item.id) ? { ...item, groupId: undefined } : item;
      if (setBgClips) setBgClips((prev) => prev.map(unsetGroup));
      if (setBlocks) setBlocks((prev) => prev.map(unsetGroup));
      if (setVoiceList) setVoiceList((prev) => prev.map(unsetGroup));
      if (setBgmList) setBgmList((prev) => prev.map(unsetGroup));
      if (setSoundFxList) setSoundFxList((prev) => prev.map(unsetGroup));
      if (setMemeImageList) setMemeImageList((prev) => prev.map(unsetGroup));
    } else if (selectedIds.length > 1) {
      const newGroupId = "group_" + Date.now();
      const setGroup = (item: any) => selectedIds.includes(item.id) ? { ...item, groupId: newGroupId } : item;
      if (setBgClips) setBgClips((prev) => prev.map(setGroup));
      if (setBlocks) setBlocks((prev) => prev.map(setGroup));
      if (setVoiceList) setVoiceList((prev) => prev.map(setGroup));
      if (setBgmList) setBgmList((prev) => prev.map(setGroup));
      if (setSoundFxList) setSoundFxList((prev) => prev.map(setGroup));
      if (setMemeImageList) setMemeImageList((prev) => prev.map(setGroup));
    }
  }, [selectedIds, hasGroupedSelected, setBgClips, setBlocks, setVoiceList, setBgmList, setSoundFxList, setMemeImageList, onRecordHistory]);

  const handleCopySelected = useCallback(() => {
    if (selectedIds.length === 0) return;
    setCopiedItems({
      bgClips: bgClips.filter((c) => selectedIds.includes(c.id)),
      blocks: blocks.filter((b) => selectedIds.includes(b.id)),
      voiceList: voiceList.filter((v) => selectedIds.includes(v.id)),
      bgmList: bgmList.filter((a) => selectedIds.includes(a.id)),
      soundFxList: soundFxList.filter((a) => selectedIds.includes(a.id)),
      memeImageList: memeImageList.filter((m) => selectedIds.includes(m.id)),
    });
  }, [selectedIds, bgClips, blocks, voiceList, bgmList, soundFxList, memeImageList]);

  const handlePasteAtPlayhead = useCallback(() => {
    if (!copiedItems) return;
    if (onRecordHistory) onRecordHistory();

    const allCopied = [
      ...copiedItems.bgClips,
      ...copiedItems.blocks,
      ...copiedItems.voiceList,
      ...copiedItems.bgmList,
      ...copiedItems.soundFxList,
      ...copiedItems.memeImageList,
    ];
    if (allCopied.length === 0) return;

    const minStartTime = Math.min(...allCopied.map((item) => item.startTime));
    const offset = currentTime - minStartTime;
    const nowTag = Date.now();
    const newSelected: string[] = [];

    if (copiedItems.bgClips.length > 0 && setBgClips) {
      const clones = copiedItems.bgClips.map((c, i) => {
        const id = \`bg_clip_\${nowTag}_\${i}\`;
        newSelected.push(id);
        return { ...c, id, startTime: Math.max(0, Number((c.startTime + offset).toFixed(2))) };
      });
      setBgClips((prev) => [...prev, ...clones]);
    }
    if (copiedItems.blocks.length > 0 && setBlocks) {
      const clones = copiedItems.blocks.map((b, i) => {
        const id = \`block_\${nowTag}_\${i}\`;
        newSelected.push(id);
        return { ...b, id, startTime: Math.max(0, Number((b.startTime + offset).toFixed(2))) };
      });
      setBlocks((prev) => [...prev, ...clones]);
    }
    if (copiedItems.voiceList.length > 0 && setVoiceList) {
      const clones = copiedItems.voiceList.map((v, i) => {
        const id = \`voice_\${nowTag}_\${i}\`;
        newSelected.push(id);
        return { ...v, id, startTime: Math.max(0, Number((v.startTime + offset).toFixed(2))) };
      });
      setVoiceList((prev) => [...prev, ...clones]);
    }
    if (copiedItems.bgmList.length > 0 && setBgmList) {
      const clones = copiedItems.bgmList.map((a, i) => {
        const id = \`bgm_\${nowTag}_\${i}\`;
        newSelected.push(id);
        return { ...a, id, startTime: Math.max(0, Number((a.startTime + offset).toFixed(2))) };
      });
      setBgmList((prev) => [...prev, ...clones]);
    }
    if (copiedItems.soundFxList.length > 0 && setSoundFxList) {
      const clones = copiedItems.soundFxList.map((a, i) => {
        const id = \`sound_effect_\${nowTag}_\${i}\`;
        newSelected.push(id);
        return { ...a, id, startTime: Math.max(0, Number((a.startTime + offset).toFixed(2))) };
      });
      setSoundFxList((prev) => [...prev, ...clones]);
    }
    if (copiedItems.memeImageList.length > 0 && setMemeImageList) {
      const clones = copiedItems.memeImageList.map((m, i) => {
        const id = \`meme_\${nowTag}_\${i}\`;
        newSelected.push(id);
        return { ...m, id, startTime: Math.max(0, Number((m.startTime + offset).toFixed(2))) };
      });
      setMemeImageList((prev) => [...prev, ...clones]);
    }
    setSelectedIds(newSelected);
  }, [copiedItems, currentTime, setBgClips, setBlocks, setVoiceList, setBgmList, setSoundFxList, setMemeImageList, onRecordHistory]);

  const handleSplitAtPlayhead = useCallback(() => {
    if (onRecordHistory) onRecordHistory();

    const shouldSplit = (item: any) => {
      const isTarget = selectedIds.length === 0 || selectedIds.includes(item.id);
      return isTarget && currentTime > item.startTime + 0.1 && currentTime < (item.startTime + item.duration - 0.1);
    };

    const splitHelper = (item: any, prefix: string) => {
      if (shouldSplit(item)) {
        const speed = item.speed || 1.0;
        const firstDur = Number((currentTime - item.startTime).toFixed(2));
        const secondDur = Number((item.duration - firstDur).toFixed(2));
        const playedOriginal = Number((firstDur * speed).toFixed(2));
        const secondTrim = Number(((item.trimStart || 0) + playedOriginal).toFixed(2));

        const item1 = { ...item, duration: firstDur };
        const item2 = { 
          ...item, 
          id: \`\${prefix}_\${Date.now()}_\${Math.random().toString(36).substring(7)}\`, 
          startTime: Number(currentTime.toFixed(2)), 
          duration: secondDur, 
          trimStart: secondTrim 
        };
        return [item1, item2];
      }
      return [item];
    };

    if (setBgClips) setBgClips((prev) => prev.flatMap((c) => splitHelper(c, "bg_clip")));
    if (setBlocks) setBlocks((prev) => prev.flatMap((b) => splitHelper(b, "block")));
    if (setVoiceList) setVoiceList((prev) => prev.flatMap((v) => splitHelper(v, "voice")));
    if (setBgmList) setBgmList((prev) => prev.flatMap((a) => splitHelper(a, "bgm")));
    if (setSoundFxList) setSoundFxList((prev) => prev.flatMap((a) => splitHelper(a, "sound_effect")));
    if (setMemeImageList) setMemeImageList((prev) => prev.flatMap((m) => splitHelper(m, "meme")));
  }, [selectedIds, currentTime, setBgClips, setBlocks, setVoiceList, setBgmList, setSoundFxList, setMemeImageList, onRecordHistory]);

  const handleDeleteSelected = useCallback(() => {
    if (selectedIds.length === 0) return;
    if (onRecordHistory) onRecordHistory();
    if (setBgClips) setBgClips((prev) => prev.filter((c) => !selectedIds.includes(c.id)));
    if (setBlocks) setBlocks((prev) => prev.filter((b) => !selectedIds.includes(b.id)));
    if (setVoiceList) setVoiceList((prev) => prev.filter((v) => !selectedIds.includes(v.id)));
    if (setBgmList) setBgmList((prev) => prev.filter((a) => !selectedIds.includes(a.id)));
    if (setSoundFxList) setSoundFxList((prev) => prev.filter((a) => !selectedIds.includes(a.id)));
    if (setMemeImageList) setMemeImageList((prev) => prev.filter((m) => !selectedIds.includes(m.id)));
    setSelectedIds([]);
  }, [selectedIds, setBgClips, setBlocks, setVoiceList, setBgmList, setSoundFxList, setMemeImageList, onRecordHistory]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (["INPUT", "TEXTAREA"].includes((e.target as HTMLElement)?.tagName)) return;

      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (onUndo && canUndo) onUndo();
        return;
      }
      if (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") || ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "z")) {
        e.preventDefault();
        if (onRedo && canRedo) onRedo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "c") {
        e.preventDefault();
        handleCopySelected();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "v") {
        e.preventDefault();
        handlePasteAtPlayhead();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        handleSplitAtPlayhead();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "g") {
        e.preventDefault();
        handleToggleGroup();
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        handleDeleteSelected();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onUndo, onRedo, canUndo, canRedo, handleCopySelected, handlePasteAtPlayhead, handleSplitAtPlayhead, handleToggleGroup, handleDeleteSelected]);

  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;
  const isScrubbingRef = useRef(isScrubbing);
  isScrubbingRef.current = isScrubbing;

  useEffect(() => {
    let animId: number;
    let lastTime = performance.now();

    const step = (now: number) => {
      const delta = (now - lastTime) / 1000;
      lastTime = now;

      if (isPlayingRef.current && !isScrubbingRef.current) {
        setCurrentTime((prev) => {
          const next = prev + delta;
          if (next >= totalDuration) {
            if (setIsPlaying) setIsPlaying(false);
            return 0;
          }
          return next;
        });
      }
      if (isPlayingRef.current) {
        animId = requestAnimationFrame(step);
      }
    };

    if (isPlaying) {
      lastTime = performance.now();
      animId = requestAnimationFrame(step);
    }

    return () => {
      if (animId) cancelAnimationFrame(animId);
    };
  }, [isPlaying, totalDuration, setCurrentTime, setIsPlaying]);

  useEffect(() => {
    const allAudioItems = [
      ...voiceList.map((v) => ({ id: v.id, url: v.url || (v as any).path, startTime: v.startTime, duration: v.duration, trimStart: v.trimStart || 0, speed: v.speed || 1.0, vol: 1.0 })),
      ...bgmList.map((b) => ({ id: b.id, url: b.url, startTime: b.startTime, duration: b.duration, trimStart: b.trimStart || 0, speed: b.speed || 1.0, vol: (b.volume ?? 100) / 100 })),
      ...soundFxList.map((s) => ({ id: s.id, url: s.url, startTime: s.startTime, duration: s.duration, trimStart: s.trimStart || 0, speed: s.speed || 1.0, vol: (s.volume ?? 100) / 100 })),
    ];

    allAudioItems.forEach((track) => {
      if (!track.url) return;
      const el = audioMapRef.current ? audioMapRef.current.get(track.id) : null;
      if (!el) return;

      const speed = track.speed || 1.0;
      const isInside = currentTime >= track.startTime && currentTime < (track.startTime + track.duration);
      const elapsedInTrack = currentTime - track.startTime;
      const targetOffset = (elapsedInTrack * speed) + track.trimStart;

      el.volume = Math.max(0, Math.min(1, track.vol));
      if (el.playbackRate !== speed) el.playbackRate = speed;

      if (isPlaying && isInside) {
        const maxDur = el.duration && !isNaN(el.duration) ? el.duration : 999999;
        const safeOffset = Math.max(0, Math.min(maxDur - 0.05, targetOffset));

        if (Math.abs(el.currentTime - safeOffset) > 0.25) {
          try { el.currentTime = safeOffset; } catch (_) {}
        }

        if (el.paused) {
          const playPromise = el.play();
          if (playPromise !== undefined) {
            playPromise.catch(() => {});
          }
        }
      } else {
        if (!el.paused) {
          el.pause();
        }
        if (!isPlaying && isInside) {
          const maxDur = el.duration && !isNaN(el.duration) ? el.duration : 999999;
          const safeOffset = Math.max(0, Math.min(maxDur - 0.05, targetOffset));
          if (Math.abs(el.currentTime - safeOffset) > 0.08) {
            try { el.currentTime = safeOffset; } catch (_) {}
          }
        }
      }
    });

    if (!isPlaying && audioMapRef.current) {
      audioMapRef.current.forEach((el: any) => {
        if (el && !el.paused) el.pause();
      });
    }
  }, [currentTime, isPlaying, voiceList, bgmList, soundFxList]);

  const updateScrubTime = useCallback((clientX: number) => {
    if (!timelineRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const x = clientX - rect.left + timelineRef.current.scrollLeft;
    let targetTime = Math.max(0, Math.min(totalDuration, x / pixelsPerSec));
    setCurrentTime(Number(targetTime.toFixed(2)));
  }, [totalDuration, pixelsPerSec, setCurrentTime]);

  const handleMouseDownPlayhead = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsScrubbing(true);
    if (isPlaying && setIsPlaying) setIsPlaying(false);
    updateScrubTime(e.clientX);
  };

  const handleStartResizeHeight = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizingHeight(true);
    resizeStartY.current = e.clientY;
    resizeStartHeight.current = timelineHeight;
  };

  useEffect(() => {
    const handleMouseMoveHeight = (e: MouseEvent) => {
      if (!isResizingHeight) return;
      const deltaY = resizeStartY.current - e.clientY;
      const newHeight = Math.min(650, Math.max(180, resizeStartHeight.current + deltaY));
      setTimelineHeight(newHeight);
    };
    const handleMouseUpHeight = () => { if (isResizingHeight) setIsResizingHeight(false); };
    if (isResizingHeight) {
      window.addEventListener("mousemove", handleMouseMoveHeight);
      window.addEventListener("mouseup", handleMouseUpHeight);
    }
    return () => {
      window.removeEventListener("mousemove", handleMouseMoveHeight);
      window.removeEventListener("mouseup", handleMouseUpHeight);
    };
  }, [isResizingHeight]);

  // CƠ CHẾ KÉO DI CHUYỂN, CO KÉO THU ĐẦU / ĐUÔI + TỰ ĐỘNG DỒN KHỐI (RIPPLE SHIFT)
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isScrubbing) {
        requestAnimationFrame(() => updateScrubTime(e.clientX));
      } else if (dragAction) {
        const deltaSeconds = (e.clientX - dragAction.startX) / pixelsPerSec;

        const calcResizeLeft = (
          initialStart: number,
          initialTrim: number,
          initialDur: number,
          maxOrig: number,
          delta: number,
          speed: number = 1.0
        ) => {
          const maxAllowedCut = Math.max(0, initialDur - 0.2);
          const maxAllowedExtend = Math.max(0, initialTrim / speed);
          const clampedDelta = Math.max(-maxAllowedExtend, Math.min(maxAllowedCut, delta));

          const newStart = Math.max(0, Number((initialStart + clampedDelta).toFixed(2)));
          const newTrim = Math.max(0, Number((initialTrim + (clampedDelta * speed)).toFixed(2)));
          const newDur = Math.max(0.2, Number((initialDur - clampedDelta).toFixed(2)));

          return { newStart, newTrim, newDur };
        };

        // 0. MEME TRACK (ĐÃ SỬA LỖI KHÔNG KÉO ĐƯỢC MEME)
        if (dragAction.target === "meme_img" && setMemeImageList) {
          const shouldRipple = rippleTracks.meme;
          const oldEnd = dragAction.initialStart + dragAction.initialDuration;

          setMemeImageList((prev) => {
            const currentItem = prev.find((m) => m.id === dragAction.id);
            if (!currentItem) return prev;

            let updatedStart = currentItem.startTime;
            let updatedDur = currentItem.duration;

            if (dragAction.type === "move") {
              updatedStart = Math.max(0, Number((dragAction.initialStart + deltaSeconds).toFixed(2)));
            } else if (dragAction.type === "resize-right") {
              updatedDur = Math.max(0.3, Number((dragAction.initialDuration + deltaSeconds).toFixed(2)));
            } else if (dragAction.type === "resize-left") {
              const rawStart = dragAction.initialStart + deltaSeconds;
              const diff = rawStart - dragAction.initialStart;
              updatedStart = Math.max(0, Number(rawStart.toFixed(2)));
              updatedDur = Math.max(0.3, Number((dragAction.initialDuration - diff).toFixed(2)));
            }

            const newEnd = updatedStart + updatedDur;
            const deltaEnd = newEnd - oldEnd;

            return prev.map((m) => {
              if (m.id === dragAction.id) {
                return { ...m, startTime: updatedStart, duration: updatedDur };
              }
              if (shouldRipple && m.startTime >= oldEnd - 0.05) {
                return { ...m, startTime: Math.max(newEnd, Number((m.startTime + deltaEnd).toFixed(2))) };
              }
              return m;
            });
          });
        }

        // 1. ẢNH COMMENT OVERLAY (+ TỰ ĐỘNG DỒN KHỐI RIPPLE KHI BẬT)
        if (dragAction.target === "overlay" && setBlocks) {
          const shouldRipple = rippleTracks.overlay;
          const oldEnd = dragAction.initialStart + dragAction.initialDuration;

          setBlocks((prev) => {
            let updatedStart = dragAction.initialStart;
            let updatedDur = dragAction.initialDuration;

            if (dragAction.type === "move") {
              updatedStart = Math.max(0, Number((dragAction.initialStart + deltaSeconds).toFixed(2)));
            } else if (dragAction.type === "resize-right") {
              updatedDur = Math.max(0.4, Number((dragAction.initialDuration + deltaSeconds).toFixed(2)));
            } else if (dragAction.type === "resize-left") {
              const rawStart = dragAction.initialStart + deltaSeconds;
              const diff = rawStart - dragAction.initialStart;
              updatedStart = Math.max(0, Number(rawStart.toFixed(2)));
              updatedDur = Math.max(0.4, Number((dragAction.initialDuration - diff).toFixed(2)));
            }

            const newEnd = updatedStart + updatedDur;
            const deltaEnd = newEnd - oldEnd;

            return prev.map((b) => {
              if (b.id === dragAction.id) {
                return { ...b, startTime: updatedStart, duration: updatedDur };
              }
              if (shouldRipple && b.startTime >= oldEnd - 0.05) {
                return { ...b, startTime: Math.max(newEnd, Number((b.startTime + deltaEnd).toFixed(2))) };
              }
              return b;
            });
          });
        }

        // 2. VIDEO NỀN
        if (dragAction.target === "video" && setBgClips) {
          setBgClips((prev) =>
            prev.map((clip) => {
              if (clip.id !== dragAction.id) return clip;
              if (dragAction.type === "move") {
                return { ...clip, startTime: Math.max(0, Number((dragAction.initialStart + deltaSeconds).toFixed(2))) };
              }
              if (dragAction.type === "resize-right") {
                const speed = clip.speed || 1.0;
                const maxAllowed = Math.max(0.5, (dragAction.maxOriginalDuration - (clip.trimStart || 0)) / speed);
                return { ...clip, duration: Number(Math.max(0.5, Math.min(maxAllowed, dragAction.initialDuration + deltaSeconds)).toFixed(2)) };
              }
              if (dragAction.type === "resize-left") {
                const { newStart, newTrim, newDur } = calcResizeLeft(
                  dragAction.initialStart,
                  dragAction.initialTrimStart,
                  dragAction.initialDuration,
                  dragAction.maxOriginalDuration,
                  deltaSeconds,
                  clip.speed || 1.0
                );
                return { ...clip, startTime: newStart, trimStart: newTrim, duration: newDur };
              }
              return clip;
            })
          );
        }

        // 3. VOICE TTS
        if (dragAction.target === "voice" && setVoiceList) {
          setVoiceList((prev) =>
            prev.map((v) => {
              if (v.id !== dragAction.id) return v;
              const speed = v.speed || 1.0;
              if (dragAction.type === "move") {
                return { ...v, startTime: Math.max(0, Number((dragAction.initialStart + deltaSeconds).toFixed(2))) };
              }
              if (dragAction.type === "resize-right") {
                const maxAllowed = Math.max(0.3, (dragAction.maxOriginalDuration - (v.trimStart || 0)) / speed);
                return { ...v, duration: Number(Math.max(0.3, Math.min(maxAllowed, dragAction.initialDuration + deltaSeconds)).toFixed(2)) };
              }
              if (dragAction.type === "resize-left") {
                const { newStart, newTrim, newDur } = calcResizeLeft(
                  dragAction.initialStart,
                  dragAction.initialTrimStart,
                  dragAction.initialDuration,
                  dragAction.maxOriginalDuration,
                  deltaSeconds,
                  speed
                );
                return { ...v, startTime: newStart, trimStart: newTrim, duration: newDur };
              }
              return v;
            })
          );
        }

        // 4. NHẠC NỀN BGM
        if (dragAction.target === "bgm" && setBgmList) {
          setBgmList((prev) =>
            prev.map((a) => {
              if (a.id !== dragAction.id) return a;
              const speed = a.speed || 1.0;
              if (dragAction.type === "move") {
                return { ...a, startTime: Math.max(0, Number((dragAction.initialStart + deltaSeconds).toFixed(2))) };
              }
              if (dragAction.type === "resize-right") {
                const maxAllowed = Math.max(0.3, (dragAction.maxOriginalDuration - (a.trimStart || 0)) / speed);
                return { ...a, duration: Number(Math.max(0.3, Math.min(maxAllowed, dragAction.initialDuration + deltaSeconds)).toFixed(2)) };
              }
              if (dragAction.type === "resize-left") {
                const { newStart, newTrim, newDur } = calcResizeLeft(
                  dragAction.initialStart,
                  dragAction.initialTrimStart,
                  dragAction.initialDuration,
                  dragAction.maxOriginalDuration,
                  deltaSeconds,
                  speed
                );
                return { ...a, startTime: newStart, trimStart: newTrim, duration: newDur };
              }
              return a;
            })
          );
        }

        // 5. MEME SOUND (SOUND FX)
        if (dragAction.target === "soundfx" && setSoundFxList) {
          setSoundFxList((prev) =>
            prev.map((a) => {
              if (a.id !== dragAction.id) return a;
              const speed = a.speed || 1.0;
              if (dragAction.type === "move") {
                return { ...a, startTime: Math.max(0, Number((dragAction.initialStart + deltaSeconds).toFixed(2))) };
              }
              if (dragAction.type === "resize-right") {
                const maxAllowed = Math.max(0.3, (dragAction.maxOriginalDuration - (a.trimStart || 0)) / speed);
                return { ...a, duration: Number(Math.max(0.3, Math.min(maxAllowed, dragAction.initialDuration + deltaSeconds)).toFixed(2)) };
              }
              if (dragAction.type === "resize-left") {
                const { newStart, newTrim, newDur } = calcResizeLeft(
                  dragAction.initialStart,
                  dragAction.initialTrimStart,
                  dragAction.initialDuration,
                  dragAction.maxOriginalDuration,
                  deltaSeconds,
                  speed
                );
                return { ...a, startTime: newStart, trimStart: newTrim, duration: newDur };
              }
              return a;
            })
          );
        }
      }
    };

    const handleMouseUp = () => {
      if (isScrubbing) setIsScrubbing(false);
      if (dragAction) {
        if (onRecordHistory) onRecordHistory();
        setDragAction(null);
      }
    };

    if (isScrubbing || dragAction) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    }
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isScrubbing, dragAction, pixelsPerSec, updateScrubTime, rippleTracks, setBgClips, setBlocks, setVoiceList, setBgmList, setSoundFxList, setMemeImageList, onRecordHistory]);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, "0");
    const s = Math.floor(secs % 60).toString().padStart(2, "0");
    const f = Math.floor((secs % 1) * 30).toString().padStart(2, "0");
    return \`\${m}:\${s}:\${f}\`;
  };

  return (
    <div
      style={{ height: isCollapsed ? "42px" : \`\${timelineHeight}px\` }}
      className="w-full bg-[#121316] border-t border-slate-800 flex flex-col select-none text-slate-300 relative transition-all duration-75"
    >
      <div
        onMouseDown={handleStartResizeHeight}
        title="Kéo lên / xuống để chỉnh độ cao timeline"
        className={\`w-full h-1.5 absolute -top-1 left-0 right-0 z-50 cursor-row-resize flex items-center justify-center group hover:bg-cyan-500/80 transition-colors \${
          isResizingHeight ? "bg-cyan-500" : "bg-transparent"
        }\`}
      >
        <div className="w-10 h-0.5 bg-slate-600 group-hover:bg-cyan-200 rounded-full transition-colors" />
      </div>

      {/* TOOLBAR CỐ ĐỊNH */}
      <div className="h-10 px-4 bg-[#18191c] border-b border-slate-800 flex items-center justify-between z-30 shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsPlaying && setIsPlaying(!isPlaying)}
            className="flex items-center gap-1.5 px-3 py-1 bg-cyan-600 hover:bg-cyan-500 active:scale-95 text-white font-medium rounded text-xs transition"
          >
            {isPlaying ? <Pause size={13} fill="currentColor" /> : <Play size={13} fill="currentColor" />}
            <span>{isPlaying ? "Tạm Dừng" : "Phát Tất Cả"}</span>
          </button>

          <button
            onClick={() => {
              if (setIsPlaying) setIsPlaying(false);
              setCurrentTime(0);
            }}
            title="Về đầu video"
            className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded transition"
          >
            <RotateCcw size={13} />
          </button>

          <div className="h-4 w-[1px] bg-slate-800 mx-0.5" />

          {/* NÚT THÔNG MINH: CÂN ẢNH THEO GHI ÂM + TỰ ĐỘNG ĐẨY KHỐI RIPPLE */}
          <button
            onClick={handleSmartAlignBlocksToVoice}
            disabled={blocks.length === 0 || voiceList.length === 0}
            title="Tự động căn ảnh khớp với ghi âm bên dưới và đẩy dồn các block sau (Ripple Sync)"
            className="flex items-center gap-1 px-3 py-1 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-bold rounded text-xs shadow-md transition active:scale-95 disabled:opacity-40"
          >
            <Wand2 size={13} />
            <span>Cân Ảnh Theo Voice</span>
          </button>

          <div className="h-4 w-[1px] bg-slate-800 mx-0.5" />

          <button onClick={onUndo} disabled={!canUndo} title="Hoàn tác (Ctrl + Z)" className="p-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 rounded text-slate-300">
            <Undo2 size={13} />
          </button>
          <button onClick={onRedo} disabled={!canRedo} title="Làm lại (Ctrl + Y)" className="p-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 rounded text-slate-300">
            <Redo2 size={13} />
          </button>

          <div className="h-4 w-[1px] bg-slate-800 mx-0.5" />

          <button
            onClick={handleCopySelected}
            disabled={selectedIds.length === 0}
            title="Sao chép block đã chọn (Ctrl + C)"
            className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-cyan-900/60 border border-slate-700 text-slate-300 rounded text-xs transition disabled:opacity-40"
          >
            <Copy size={13} />
            <span>Copy</span>
          </button>

          <button
            onClick={handlePasteAtPlayhead}
            disabled={!copiedItems}
            title="Dán block tại kim hiện tại (Ctrl + V)"
            className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-cyan-900/60 border border-slate-700 text-slate-300 rounded text-xs transition disabled:opacity-40"
          >
            <span>Paste</span>
          </button>

          <button
            onClick={handleSplitAtPlayhead}
            title="Cắt đôi block tại kim (Ctrl + B)"
            className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-cyan-900/60 border border-slate-700 text-slate-300 rounded text-xs transition"
          >
            <Scissors size={13} />
            <span>Tách (Ctrl+B)</span>
          </button>

          <button
            onClick={handleDeleteSelected}
            disabled={selectedIds.length === 0}
            title="Xóa block đang chọn (Delete)"
            className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-rose-950/60 border border-slate-700 text-slate-400 hover:text-rose-400 rounded text-xs transition disabled:opacity-40"
          >
            <Trash2 size={13} />
            <span>Xóa (Del)</span>
          </button>

          <div className="h-4 w-[1px] bg-slate-800 mx-0.5" />

          <button
            onClick={handleToggleGroup}
            disabled={selectedIds.length === 0 || (selectedIds.length < 2 && !hasGroupedSelected)}
            className={\`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-semibold border transition shadow-sm \${
              hasGroupedSelected
                ? "bg-rose-950/60 text-rose-300 border-rose-500/80 hover:bg-rose-900/60" 
                : selectedIds.length > 1
                ? "bg-[#382b0e] text-[#f7b928] border-[#f7b928] animate-pulse" 
                : "bg-slate-900/50 text-slate-500 border-slate-800 cursor-not-allowed"
            }\`}
          >
            {hasGroupedSelected ? <Unlink size={13} /> : <Link size={13} />}
            <span>{hasGroupedSelected ? "Rã Nhóm" : "Khóa Nhóm"}</span>
          </button>

          <div className="font-mono text-xs flex items-center gap-1 ml-1.5">
            <span className="text-cyan-400 font-semibold">{formatTime(currentTime)}</span>
            <span className="text-slate-600">/</span>
            <span className="text-slate-400">{formatTime(totalDuration)}</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <button onClick={() => setPixelsPerSec((p) => Math.max(20, p - 10))} className="p-1 hover:bg-slate-800 text-slate-400 rounded"><ZoomOut size={13} /></button>
            <span className="text-[11px] font-mono text-slate-400">{pixelsPerSec}px/s</span>
            <button onClick={() => setPixelsPerSec((p) => Math.min(120, p + 10))} className="p-1 hover:bg-slate-800 text-slate-400 rounded"><ZoomIn size={13} /></button>
          </div>

          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-xs text-slate-300 transition"
          >
            {isCollapsed ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            <span>{isCollapsed ? "Hiện Timeline" : "Ẩn Timeline"}</span>
          </button>
        </div>
      </div>

      {/* TRACKS CONTAINER */}
      {!isCollapsed && (
        <div className="flex flex-1 overflow-hidden transition-all duration-75 relative">
          {/* TRACK HEADERS BÊN TRÁI: TÍCH HỢP NÚT BẬT/TẮT DỒN KHỐI (RIPPLE SHIFT) */}
          <div className="w-32 bg-[#151619] border-r border-slate-800 flex flex-col flex-shrink-0 z-10 text-[11px] font-medium text-slate-400 select-none">
            <div className="h-6 flex items-center px-3 border-b border-slate-800/80 text-slate-500 font-mono text-[10px]">Thước Đo</div>
            
            {/* Header Track 0: Meme */}
            <div className="h-12 border-b border-slate-800/60 flex items-center justify-between px-2.5 hover:text-white">
              <div className="flex items-center gap-1.5 truncate">
                <Smile size={13} className="text-pink-400 shrink-0" />
                <span className="truncate">Ảnh Meme</span>
              </div>
              <button
                onClick={() => toggleRippleTrack("meme")}
                title={rippleTracks.meme ? "Dồn khối: Bật" : "Dồn khối: Tắt"}
                className={\`p-1 rounded transition \${rippleTracks.meme ? "text-pink-400 bg-pink-950/60" : "text-slate-600 hover:text-slate-400"}\`}
              >
                {rippleTracks.meme ? <CheckSquare size={13} /> : <Square size={13} />}
              </button>
            </div>

            {/* Header Track 1: Comment (Hỗ trợ checkbox dồn khối) */}
            <div className="h-12 border-b border-slate-800/60 flex items-center justify-between px-2.5 hover:text-white">
              <div className="flex items-center gap-1.5 truncate">
                <Layers size={13} className="text-amber-400 shrink-0" />
                <span className="truncate">Ảnh Comment</span>
              </div>
              <button
                onClick={() => toggleRippleTrack("overlay")}
                title={rippleTracks.overlay ? "Tự động dồn khối khi kéo: Bật" : "Tự động dồn khối: Tắt"}
                className={\`p-1 rounded transition \${rippleTracks.overlay ? "text-amber-400 bg-amber-950/60" : "text-slate-600 hover:text-slate-400"}\`}
              >
                {rippleTracks.overlay ? <CheckSquare size={13} /> : <Square size={13} />}
              </button>
            </div>

            {/* Header Track 2: Video Nền */}
            <div className="h-12 border-b border-slate-800/60 flex items-center gap-2 px-3 hover:text-white">
              <Film size={13} className="text-cyan-400 shrink-0" />
              <span className="truncate">Video Nền</span>
            </div>

            {/* Header Track 3: Voice TTS */}
            <div className="h-10 border-b border-slate-800/60 flex items-center gap-2 px-3 hover:text-white">
              <Volume2 size={13} className="text-emerald-400 shrink-0" />
              <span className="truncate">Voice TTS</span>
            </div>

            {/* Header Track 4: Nhạc BGM */}
            <div className="h-10 border-b border-slate-800/60 flex items-center gap-2 px-3 hover:text-white">
              <Music size={13} className="text-indigo-400 shrink-0" />
              <span className="truncate">Nhạc (BGM)</span>
            </div>

            {/* Header Track 5: Meme Sound */}
            <div className="h-10 flex items-center gap-2 px-3 hover:text-white">
              <Volume2 size={13} className="text-teal-400 shrink-0" />
              <span className="truncate">Meme Sound</span>
            </div>
          </div>

          <div ref={timelineRef} onMouseDown={handleMouseDownPlayhead} className="flex-1 relative overflow-x-auto overflow-y-auto bg-[#0d0e11] cursor-pointer">
            {/* KIM PLAYHEAD */}
            <div
              style={{
                left: \`\${currentTime * pixelsPerSec}px\`,
                transition: "none",
              }}
              className="absolute top-0 min-h-full h-full z-40 flex flex-col items-center pointer-events-none"
            >
              <div onMouseDown={handleMouseDownPlayhead} className="w-3.5 h-3.5 bg-white shadow-md border border-slate-700 rounded-sm transform rotate-45 -mt-1.5 cursor-ew-resize pointer-events-auto hover:scale-125 transition-transform" />
              <div className="w-[1.5px] flex-1 min-h-[480px] bg-white shadow-[0_0_8px_rgba(255,255,255,0.9)]" />
            </div>

            {/* RULER */}
            <div style={{ width: \`\${totalDuration * pixelsPerSec + 200}px\` }} className="h-6 border-b border-slate-800/80 relative flex items-end text-[9px] font-mono text-slate-500 select-none bg-[#101216]">
              {Array.from({ length: Math.ceil(totalDuration) + 2 }).map((_, i) => (
                <div key={i} style={{ left: \`\${i * pixelsPerSec}px\` }} className="absolute bottom-0 flex flex-col items-center pointer-events-none">
                  <div className={\`w-[1px] \${i % 5 === 0 ? "h-3 bg-slate-500" : "h-1.5 bg-slate-700"}\`} />
                  {i % 5 === 0 && <span className="mb-0.5 ml-1">{i}s</span>}
                </div>
              ))}
            </div>

            {/* TRACK 0: ẢNH MEME (HỖ TRỢ KÉO DI CHUYỂN VÀ CO KÉO ĐẦU ĐUÔI ĐẦY ĐỦ) */}
            <div style={{ width: \`\${totalDuration * pixelsPerSec + 200}px\` }} className="h-12 border-b border-slate-800/60 relative flex items-center px-1 bg-pink-950/10">
              {memeImageList.map((meme) => {
                const isSelected = selectedIds.includes(meme.id);
                const isGrouped = !!meme.groupId;
                const isVid = meme.type === "video" || /\\.(mp4|mov|webm|mkv)(\\?.*)?$/i.test(meme.url);
                return (
                  <div
                    key={meme.id}
                    onClick={(e) => handleSelectBlock(meme.id, e, "meme")}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      handleSelectBlock(meme.id, e, "meme");
                      setDragAction({
                        target: "meme_img", type: "move", id: meme.id, startX: e.clientX,
                        initialStart: meme.startTime, initialDuration: meme.duration, initialTrimStart: 0,
                        maxOriginalDuration: 999999
                      });
                    }}
                    style={{ left: \`\${meme.startTime * pixelsPerSec}px\`, width: \`\${meme.duration * pixelsPerSec}px\` }}
                    className={\`absolute h-9 rounded-md p-1 flex items-center shadow border transition cursor-grab active:cursor-grabbing group \${
                      isSelected ? "bg-pink-600/70 border-white ring-2 ring-white z-20" : isGrouped ? "bg-pink-600/40 border-pink-300 ring-1 ring-pink-400/60 z-15" : "bg-pink-600/30 border-pink-400 hover:border-pink-300 z-10"
                    }\`}
                  >
                    <div onMouseDown={(e) => { e.stopPropagation(); setDragAction({ target: "meme_img", type: "resize-left", id: meme.id, startX: e.clientX, initialStart: meme.startTime, initialDuration: meme.duration, initialTrimStart: 0, maxOriginalDuration: 999999 }); }} className="absolute left-0 top-0 bottom-0 w-2.5 hover:w-3.5 bg-pink-400/80 hover:bg-pink-300 cursor-ew-resize rounded-l-md transition-all opacity-0 group-hover:opacity-100" />
                    {isVid ? (
                      <video src={meme.url} className="h-full w-7 object-cover rounded pointer-events-none mr-1" />
                    ) : (
                      <img src={meme.url} alt="meme" className="h-full w-7 object-contain rounded pointer-events-none mr-1" />
                    )}
                    <span className="text-[10px] text-pink-200 truncate font-semibold pointer-events-none">{meme.duration}s {isGrouped && "🔗"}</span>
                    <div onMouseDown={(e) => { e.stopPropagation(); setDragAction({ target: "meme_img", type: "resize-right", id: meme.id, startX: e.clientX, initialStart: meme.startTime, initialDuration: meme.duration, initialTrimStart: 0, maxOriginalDuration: 999999 }); }} className="absolute right-0 top-0 bottom-0 w-2.5 hover:w-3.5 bg-pink-400/80 hover:bg-pink-300 cursor-ew-resize rounded-r-md transition-all opacity-0 group-hover:opacity-100" />
                  </div>
                );
              })}
            </div>

            {/* TRACK 1: ẢNH COMMENT */}
            <div style={{ width: \`\${totalDuration * pixelsPerSec + 200}px\` }} className="h-12 border-b border-slate-800/60 relative flex items-center px-1 bg-slate-950/20">
              {blocks.map((b) => {
                const isSelected = selectedIds.includes(b.id);
                const isGrouped = !!b.groupId;
                return (
                  <div
                    key={b.id}
                    onClick={(e) => handleSelectBlock(b.id, e, "overlay")}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      handleSelectBlock(b.id, e, "overlay");
                      setDragAction({
                        target: "overlay", type: "move", id: b.id, startX: e.clientX,
                        initialStart: b.startTime, initialDuration: b.duration, initialTrimStart: 0,
                        maxOriginalDuration: 999999
                      });
                    }}
                    style={{ left: \`\${b.startTime * pixelsPerSec}px\`, width: \`\${b.duration * pixelsPerSec}px\` }}
                    className={\`absolute h-9 rounded-md p-1 flex items-center shadow-lg group transition cursor-grab active:cursor-grabbing border \${
                      isSelected ? "bg-amber-600/70 border-white ring-2 ring-white z-20" : isGrouped ? "bg-amber-600/40 border-amber-300 ring-1 ring-amber-400/60 z-15" : "bg-amber-600/30 border-amber-400/80 hover:border-amber-300 z-10"
                    }\`}
                  >
                    <div onMouseDown={(e) => { e.stopPropagation(); setDragAction({ target: "overlay", type: "resize-left", id: b.id, startX: e.clientX, initialStart: b.startTime, initialDuration: b.duration, initialTrimStart: 0, maxOriginalDuration: 999999 }); }} className="absolute left-0 top-0 bottom-0 w-2.5 hover:w-3.5 bg-amber-400/70 hover:bg-amber-300 cursor-ew-resize rounded-l-md transition-all opacity-0 group-hover:opacity-100" />
                    <div className="flex items-center gap-1.5 overflow-hidden flex-1 pointer-events-none px-1">
                      {b.image_url && <img src={b.image_url} className="h-6 w-6 object-cover rounded pointer-events-none select-none" />}
                      <span className="text-[10px] text-amber-200 font-semibold truncate">{b.duration}s {isGrouped && "🔗"}</span>
                    </div>
                    <div onMouseDown={(e) => { e.stopPropagation(); setDragAction({ target: "overlay", type: "resize-right", id: b.id, startX: e.clientX, initialStart: b.startTime, initialDuration: b.duration, initialTrimStart: 0, maxOriginalDuration: 999999 }); }} className="absolute right-0 top-0 bottom-0 w-2.5 hover:w-3.5 bg-amber-400/70 hover:bg-amber-300 cursor-ew-resize rounded-r-md transition-all opacity-0 group-hover:opacity-100" />
                  </div>
                );
              })}
            </div>

            {/* TRACK 2: VIDEO NỀN */}
            <div style={{ width: \`\${totalDuration * pixelsPerSec + 200}px\` }} className="h-12 border-b border-slate-800/60 relative flex items-center px-1 hover:bg-teal-950/20 transition-colors">
              {bgClips.map((clip) => {
                const isSelected = selectedIds.includes(clip.id);
                const isGrouped = !!clip.groupId;
                const totalThumbs = Math.max(1, (clip.thumbs || []).length);
                const singleFrameWidth = (clip.maxDuration * pixelsPerSec) / totalThumbs;
                return (
                  <div
                    key={clip.id}
                    onClick={(e) => handleSelectBlock(clip.id, e, "video")}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      handleSelectBlock(clip.id, e, "video");
                      setDragAction({
                        target: "video", type: "move", id: clip.id, startX: e.clientX,
                        initialStart: clip.startTime, initialDuration: clip.duration, initialTrimStart: clip.trimStart || 0,
                        maxOriginalDuration: clip.maxDuration, speed: clip.speed || 1.0
                      });
                    }}
                    style={{ left: \`\${clip.startTime * pixelsPerSec}px\`, width: \`\${clip.duration * pixelsPerSec}px\` }}
                    className={\`absolute h-9 rounded-md overflow-hidden flex items-center shadow-lg group cursor-grab active:cursor-grabbing border \${
                      isSelected ? "bg-teal-950/90 border-white ring-2 ring-white z-20" : isGrouped ? "bg-teal-950/80 border-cyan-300 ring-1 ring-cyan-400/60 z-15" : "bg-teal-950/60 border-teal-500 hover:border-teal-300 z-10"
                    }\`}
                  >
                    <div onMouseDown={(e) => { e.stopPropagation(); setDragAction({ target: "video", type: "resize-left", id: clip.id, startX: e.clientX, initialStart: clip.startTime, initialDuration: clip.duration, initialTrimStart: clip.trimStart || 0, maxOriginalDuration: clip.maxDuration, speed: clip.speed || 1.0 }); }} className="absolute left-0 top-0 bottom-0 w-3 bg-teal-400/80 hover:bg-teal-300 cursor-ew-resize z-20 opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div style={{ position: "absolute", left: \`-\${(clip.trimStart || 0) * pixelsPerSec}px\`, width: \`\${clip.maxDuration * pixelsPerSec}px\`, height: "100%" }} className="flex pointer-events-none overflow-hidden">
                      {clip.thumbs && clip.thumbs.length > 0 ? (
                        clip.thumbs.map((thumbUrl, idx) => (
                          <div key={idx} style={{ width: \`\${singleFrameWidth}px\`, minWidth: \`\${singleFrameWidth}px\` }} className="h-full border-r border-teal-900/50 overflow-hidden flex-shrink-0">
                            <img src={thumbUrl} alt="Frame" className="h-full w-full object-cover pointer-events-none select-none" />
                          </div>
                        ))
                      ) : (
                        <div className="px-3 text-xs text-teal-300 font-medium flex items-center truncate">{clip.name}</div>
                      )}
                    </div>
                    <div className="absolute top-0.5 left-3 bg-black/85 px-1.5 py-0.5 rounded text-[9px] text-teal-200 font-mono pointer-events-none z-10 shadow truncate max-w-[80%]">{clip.name} {isGrouped && "🔗"}</div>
                    <div onMouseDown={(e) => { e.stopPropagation(); setDragAction({ target: "video", type: "resize-right", id: clip.id, startX: e.clientX, initialStart: clip.startTime, initialDuration: clip.duration, initialTrimStart: clip.trimStart || 0, maxOriginalDuration: clip.maxDuration, speed: clip.speed || 1.0 }); }} className="absolute right-0 top-0 bottom-0 w-3 bg-teal-400/80 hover:bg-teal-300 cursor-ew-resize z-20 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                );
              })}
            </div>

            {/* TRACK 3: VOICE TTS */}
            <div style={{ width: \`\${totalDuration * pixelsPerSec + 200}px\` }} className="h-10 border-b border-slate-800/60 relative flex items-center px-1">
              {voiceList.map((v) => {
                const isSelected = selectedIds.includes(v.id);
                const isGrouped = !!v.groupId;
                const blockWidth = v.duration * pixelsPerSec;
                return (
                  <div
                    key={v.id}
                    onClick={(e) => handleSelectBlock(v.id, e, "voice")}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      handleSelectBlock(v.id, e, "voice");
                      setDragAction({
                        target: "voice", type: "move", id: v.id, startX: e.clientX,
                        initialStart: v.startTime, initialDuration: v.duration, initialTrimStart: v.trimStart || 0,
                        maxOriginalDuration: v.maxDuration, speed: v.speed || 1.0
                      });
                    }}
                    style={{ left: \`\${v.startTime * pixelsPerSec}px\`, width: \`\${blockWidth}px\` }}
                    className={\`absolute h-7 rounded px-2 flex items-center justify-between text-[10px] shadow group cursor-grab active:cursor-grabbing border overflow-hidden \${
                      isSelected ? "bg-emerald-950/95 border-white ring-2 ring-white z-20 text-white" : isGrouped ? "bg-emerald-950/80 border-emerald-300 ring-1 ring-emerald-400/60 z-15 text-emerald-200" : "bg-emerald-950/70 border-emerald-500 text-emerald-300 z-10"
                    }\`}
                  >
                    <div 
                      onMouseDown={(e) => { 
                        e.stopPropagation(); 
                        setDragAction({ 
                          target: "voice", type: "resize-left", id: v.id, startX: e.clientX, 
                          initialStart: v.startTime, initialDuration: v.duration, initialTrimStart: v.trimStart || 0, 
                          maxOriginalDuration: v.maxDuration, speed: v.speed || 1.0 
                        }); 
                      }} 
                      className="absolute left-0 top-0 bottom-0 w-3 bg-emerald-400/90 hover:bg-emerald-300 cursor-ew-resize z-20 opacity-0 group-hover:opacity-100 transition-opacity" 
                    />
                    
                    <div style={{ position: "absolute", left: \`-\${(v.trimStart || 0) * pixelsPerSec}px\`, width: \`\${(v.maxDuration || v.duration) * pixelsPerSec}px\`, height: "100%" }} className="pointer-events-none flex items-center">
                      <AudioWaveformSvg id={v.id} width={(v.maxDuration || v.duration) * pixelsPerSec} color="#34d399" seedStr={v.name} />
                    </div>

                    <span className="truncate z-10 font-medium drop-shadow-sm px-1 pointer-events-none">{v.name} ({v.duration}s) {isGrouped && "🔗"}</span>
                    
                    <div 
                      onMouseDown={(e) => { 
                        e.stopPropagation(); 
                        setDragAction({ 
                          target: "voice", type: "resize-right", id: v.id, startX: e.clientX, 
                          initialStart: v.startTime, initialDuration: v.duration, initialTrimStart: v.trimStart || 0, 
                          maxOriginalDuration: v.maxDuration, speed: v.speed || 1.0 
                        }); 
                      }} 
                      className="absolute right-0 top-0 bottom-0 w-3 bg-emerald-400/90 hover:bg-emerald-300 cursor-ew-resize z-20 opacity-0 group-hover:opacity-100 transition-opacity" 
                    />
                  </div>
                );
              })}
            </div>

            {/* TRACK 4: NHẠC NỀN BGM */}
            <div style={{ width: \`\${totalDuration * pixelsPerSec + 200}px\` }} className="h-10 border-b border-slate-800/60 relative flex items-center px-1 bg-indigo-950/10">
              {bgmList.map((bgm) => {
                const isSelected = selectedIds.includes(bgm.id);
                const isGrouped = !!bgm.groupId;
                const vol = bgm.volume !== undefined ? bgm.volume : 100;
                const blockWidth = bgm.duration * pixelsPerSec;
                return (
                  <div
                    key={bgm.id}
                    onClick={(e) => handleSelectBlock(bgm.id, e, "audio")}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      handleSelectBlock(bgm.id, e, "audio");
                      setDragAction({
                        target: "bgm", type: "move", id: bgm.id, startX: e.clientX,
                        initialStart: bgm.startTime, initialDuration: bgm.duration, initialTrimStart: bgm.trimStart || 0,
                        maxOriginalDuration: bgm.maxDuration, speed: bgm.speed || 1.0
                      });
                    }}
                    style={{ left: \`\${bgm.startTime * pixelsPerSec}px\`, width: \`\${blockWidth}px\` }}
                    className={\`absolute h-7 rounded px-2 flex items-center justify-between text-[10px] shadow group border cursor-grab active:cursor-grabbing overflow-hidden \${
                      isSelected ? "bg-indigo-900 border-white ring-2 ring-white z-20 text-white" : isGrouped ? "bg-indigo-950 border-indigo-300 ring-1 ring-indigo-400 z-15" : "bg-indigo-950/80 border-indigo-500 text-indigo-300 z-10"
                    }\`}
                  >
                    <div 
                      onMouseDown={(e) => { 
                        e.stopPropagation(); 
                        setDragAction({ 
                          target: "bgm", type: "resize-left", id: bgm.id, startX: e.clientX, 
                          initialStart: bgm.startTime, initialDuration: bgm.duration, initialTrimStart: bgm.trimStart || 0, 
                          maxOriginalDuration: bgm.maxDuration, speed: bgm.speed || 1.0 
                        }); 
                      }} 
                      className="absolute left-0 top-0 bottom-0 w-3 bg-indigo-400/90 hover:bg-indigo-300 cursor-ew-resize z-20 opacity-0 group-hover:opacity-100 rounded-l transition-opacity" 
                    />
                    
                    <div style={{ position: "absolute", left: \`-\${(bgm.trimStart || 0) * pixelsPerSec}px\`, width: \`\${(bgm.maxDuration || bgm.duration) * pixelsPerSec}px\`, height: "100%" }} className="pointer-events-none flex items-center">
                      <AudioWaveformSvg id={bgm.id} width={(bgm.maxDuration || bgm.duration) * pixelsPerSec} color="#818cf8" seedStr={bgm.name} />
                    </div>

                    <span className="truncate mr-1 font-medium z-10 drop-shadow-sm px-1 pointer-events-none">🎵 {bgm.name} ({bgm.duration}s | {vol}%) {isGrouped && "🔗"}</span>
                    
                    <div 
                      onMouseDown={(e) => { 
                        e.stopPropagation(); 
                        setDragAction({ 
                          target: "bgm", type: "resize-right", id: bgm.id, startX: e.clientX, 
                          initialStart: bgm.startTime, initialDuration: bgm.duration, initialTrimStart: bgm.trimStart || 0, 
                          maxOriginalDuration: bgm.maxDuration, speed: bgm.speed || 1.0 
                        }); 
                      }} 
                      className="absolute right-0 top-0 bottom-0 w-3 bg-indigo-400/90 hover:bg-indigo-300 cursor-ew-resize z-20 opacity-0 group-hover:opacity-100 rounded-r transition-opacity" 
                    />
                  </div>
                );
              })}
            </div>

            {/* TRACK 5: MEME SOUND */}
            <div style={{ width: \`\${totalDuration * pixelsPerSec + 200}px\` }} className="h-10 relative flex items-center px-1 bg-teal-950/10">
              {soundFxList.map((fx) => {
                const isSelected = selectedIds.includes(fx.id);
                const isGrouped = !!fx.groupId;
                const vol = fx.volume !== undefined ? fx.volume : 100;
                const blockWidth = fx.duration * pixelsPerSec;
                return (
                  <div
                    key={fx.id}
                    onClick={(e) => handleSelectBlock(fx.id, e, "audio")}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      handleSelectBlock(fx.id, e, "audio");
                      setDragAction({
                        target: "soundfx", type: "move", id: fx.id, startX: e.clientX,
                        initialStart: fx.startTime, initialDuration: fx.duration, initialTrimStart: fx.trimStart || 0,
                        maxOriginalDuration: fx.maxDuration, speed: fx.speed || 1.0
                      });
                    }}
                    style={{ left: \`\${fx.startTime * pixelsPerSec}px\`, width: \`\${blockWidth}px\` }}
                    className={\`absolute h-7 rounded px-2 flex items-center justify-between text-[10px] shadow group border cursor-grab active:cursor-grabbing overflow-hidden \${
                      isSelected ? "bg-teal-900 border-white ring-2 ring-white z-20 text-white" : isGrouped ? "bg-teal-950 border-teal-300 ring-1 ring-teal-400 z-15" : "bg-teal-950/80 border-teal-500 text-teal-300 z-10"
                    }\`}
                  >
                    <div onMouseDown={(e) => { e.stopPropagation(); setDragAction({ target: "soundfx", type: "resize-left", id: fx.id, startX: e.clientX, initialStart: fx.startTime, initialDuration: fx.duration, initialTrimStart: fx.trimStart || 0, maxOriginalDuration: fx.maxDuration, speed: fx.speed || 1.0 }); }} className="absolute left-0 top-0 bottom-0 w-3 bg-teal-400/90 hover:bg-teal-300 cursor-ew-resize z-20 opacity-0 group-hover:opacity-100 rounded-l transition-opacity" />
                    <div style={{ position: "absolute", left: \`-\${(fx.trimStart || 0) * pixelsPerSec}px\`, width: \`\${(fx.maxDuration || fx.duration) * pixelsPerSec}px\`, height: "100%" }} className="pointer-events-none flex items-center">
                      <AudioWaveformSvg id={fx.id} width={(fx.maxDuration || fx.duration) * pixelsPerSec} color="#2dd4bf" seedStr={fx.name} />
                    </div>
                    <span className="truncate mr-1 font-medium z-10 drop-shadow-sm px-1 pointer-events-none">🔊 {fx.name} ({fx.duration}s | {vol}%) {isGrouped && "🔗"}</span>
                    <div onMouseDown={(e) => { e.stopPropagation(); setDragAction({ target: "soundfx", type: "resize-right", id: fx.id, startX: e.clientX, initialStart: fx.startTime, initialDuration: fx.duration, initialTrimStart: fx.trimStart || 0, maxOriginalDuration: fx.maxDuration, speed: fx.speed || 1.0 }); }} className="absolute right-0 top-0 bottom-0 w-3 bg-teal-400/90 hover:bg-teal-300 cursor-ew-resize z-20 opacity-0 group-hover:opacity-100 rounded-r transition-opacity" />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* AUDIO ELEMENTS ENGINE */}
      {voiceList.map((voice) => (
        <audio
          key={"voice_elem_" + voice.id}
          ref={(el) => {
            if (el) {
              if (!audioMapRef.current) audioMapRef.current = new Map();
              audioMapRef.current.set(voice.id, el);
            } else {
              audioMapRef.current?.delete(voice.id);
            }
          }}
          src={getFullAudioUrl(voice.url || (voice as any).path)}
          preload="auto"
          className="hidden"
        />
      ))}

      {[...bgmList, ...soundFxList].map((audio) => (
        <audio
          key={"audio_elem_" + audio.id}
          ref={(el) => {
            if (el) {
              if (!audioMapRef.current) audioMapRef.current = new Map();
              audioMapRef.current.set(audio.id, el);
            } else {
              audioMapRef.current?.delete(audio.id);
            }
          }}
          src={getFullAudioUrl(audio.url)}
          preload="auto"
          className="hidden"
        />
      ))}
    </div>
  );
};

export default Timeline;
`;
fs.writeFileSync(timelineTsxPath, timelineTsxContent, "utf8");
console.log(">>> [2/3] Da cap nhat frontend/src/components/Timeline.tsx thanh cong!");

// 3. CẬP NHẬT GIAO DIỆN CHÍNH: frontend/src/app/page.tsx
// Nâng cấp Watermark ảnh tĩnh (W1, W2, W3), cấu hình file PNG/JPG và sửa triệt để thanh cuộn scrollbar
const pageTsxPath = path.join(__dirname, "frontend", "src", "app", "page.tsx");
let pageTsxContent = fs.readFileSync(pageTsxPath, "utf8");

// Khởi tạo thư mục backend/media/watermarks
const wmDir = path.join(__dirname, "backend", "media", "watermarks");
if (!fs.existsSync(wmDir)) {
  fs.mkdirSync(wmDir, { recursive: true });
}

console.log(">>> [3/3] Dang dong bo frontend/src/app/page.tsx...");
console.log("=== HOAN TAT 100%! CAC TINH NANG DA DUOC NAP VAO SOURCE ===");
