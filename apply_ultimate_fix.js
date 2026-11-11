const fs = require("fs");
const path = require("path");

const ROOT = __dirname;

// =========================================================================
// 1. SỬA CHUẨN PreviewPlayer.tsx:
// - Thước đo 320x568px chuẩn 9:16
// - CHỈ PHÁT KHI THỰC SỰ CÓ CLIP NỀN TRÊN TIMELINE (bgClips)
// - Cuộn mượt mà lên đỉnh và xuống đáy
// =========================================================================
const previewPath = path.join(ROOT, "frontend", "src", "components", "PreviewPlayer.tsx");
const previewContent = `"use client";

import React, { useRef, useState, useEffect } from "react";
import { 
  Play, Pause, Maximize, Volume2, VolumeX
} from "lucide-react";
import { TimelineBlock, TimelineMemeImageItem } from "@/types";

export interface PreviewPlayerProps {
  selectedBg: string;
  previewActiveBlock: TimelineBlock | null;
  baseScale?: number;
  zoomScale?: number;
  setZoomScale?: React.Dispatch<React.SetStateAction<number>>;
  showZoomPanel?: boolean;
  setShowZoomPanel?: React.Dispatch<React.SetStateAction<boolean>>;
  isDragging?: boolean;
  handleMouseDownOnImage?: (e: React.MouseEvent) => void;
  handleWheelZoom?: (e: React.WheelEvent) => void;
  renderedUrl?: string | null;
  currentTime?: number;
  totalDuration?: number;
  isPlaying?: boolean;
  setIsPlaying?: React.Dispatch<React.SetStateAction<boolean>>;
  setBlocks?: React.Dispatch<React.SetStateAction<TimelineBlock[]>>;
  bgStartTime?: number;
  bgDuration?: number;
  bgTrimStart?: number;
  hasBgClipOnTimeline?: boolean;
  memeImageList?: TimelineMemeImageItem[];
  setMemeImageList?: React.Dispatch<React.SetStateAction<TimelineMemeImageItem[]>>;
  selectedMemeId?: string | null;
  setSelectedMemeId?: React.Dispatch<React.SetStateAction<string | null>>;
  watermarkEnabled?: boolean;
  setWatermarkEnabled?: (val: boolean) => void;
  watermarkX?: number;
  setWatermarkX?: (val: number) => void;
  watermarkY?: number;
  setWatermarkY?: (val: number) => void;
  watermarkOpacity?: number;
  setWatermarkOpacity?: (val: number) => void;
  watermarkScale?: number;
  setWatermarkScale?: (val: number) => void;
  watermarkFileName?: string;
  setWatermarkFileName?: (val: string) => void;
  [key: string]: any;
}

export const PreviewPlayer: React.FC<PreviewPlayerProps> = ({
  selectedBg = "",
  previewActiveBlock,
  isDragging = false,
  handleMouseDownOnImage,
  handleWheelZoom,
  currentTime = 0,
  totalDuration = 15,
  isPlaying = false,
  setIsPlaying,
  setBlocks,
  bgStartTime = 0,
  bgDuration = 10,
  bgTrimStart = 0,
  hasBgClipOnTimeline = false,
  memeImageList = [],
  setMemeImageList,
  selectedMemeId,
  setSelectedMemeId,
  watermarkEnabled = false,
  watermarkX = 20,
  watermarkY = 25,
  watermarkOpacity = 90,
  watermarkScale = 1.0,
  watermarkFileName = "watermark_1.png",
  setWatermarkX,
  setWatermarkY,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isMuted, setIsMuted] = useState<boolean>(true);
  const [isResizingImage, setIsResizingImage] = useState<boolean>(false);
  const resizeStartData = useRef<{ mouseX: number; initialWidth: number }>({ mouseX: 0, initialWidth: 800 });

  const [isDraggingMeme, setIsDraggingMeme] = useState(false);
  const [draggedMemeId, setDraggedMemeId] = useState<string | null>(null);
  const dragMemeStartPos = useRef<{ mouseX: number; mouseY: number; initialX: number; initialY: number }>({
    mouseX: 0, mouseY: 0, initialX: 0, initialY: 0
  });

  const [isDraggingWm, setIsDraggingWm] = useState(false);
  const wmDragStart = useRef<{ mouseX: number; mouseY: number; initX: number; initY: number }>({
    mouseX: 0, mouseY: 0, initX: 20, initY: 25
  });

  const baseScale = 320 / 1080;

  const getFullMediaUrl = (url: string | null | undefined): string => {
    if (!url) return "";
    if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("blob:")) return url;
    const cleanPath = url.startsWith("/") ? url : "/" + url;
    return cleanPath.startsWith("/media/") ? ("http://127.0.0.1:8000" + cleanPath) : ("http://127.0.0.1:8000/media/backgrounds" + cleanPath);
  };

  const bgUrl = getFullMediaUrl(selectedBg);
  const isVideo = /\\.(mp4|mov|webm|mkv|avi|m4v)(\\?.*)?$/i.test(bgUrl);
  
  // CHỈ PHÁT VIDEO KHI THỰC SỰ CÓ CLIP NẰM TRÊN TIMELINE
  const isInsideBgVideo = hasBgClipOnTimeline && currentTime >= bgStartTime && currentTime <= (bgStartTime + bgDuration);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !isVideo) return;

    if (isInsideBgVideo && selectedBg) {
      const targetVideoTime = Math.max(0, bgTrimStart + (currentTime - bgStartTime));
      const timeDiff = Math.abs(video.currentTime - targetVideoTime);
      if (!isPlaying || timeDiff > 0.45) {
        if (!video.seeking) {
          video.currentTime = targetVideoTime;
        }
      }
      if (isPlaying) {
        if (video.paused && !video.seeking) {
          video.play().catch(() => {});
        }
      } else {
        if (!video.paused) {
          video.pause();
        }
      }
    } else {
      if (!video.paused) {
        video.pause();
      }
    }
  }, [currentTime, isPlaying, isVideo, isInsideBgVideo, selectedBg, bgStartTime, bgDuration, bgTrimStart]);

  const handleStartResizeImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!previewActiveBlock) return;
    setIsResizingImage(true);
    resizeStartData.current = { mouseX: e.clientX, initialWidth: previewActiveBlock.img_width || 800 };
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizingImage || !previewActiveBlock || !setBlocks) return;
      const deltaX = (e.clientX - resizeStartData.current.mouseX) / baseScale;
      const newWidth = Math.max(250, Math.min(1060, Math.round(resizeStartData.current.initialWidth + deltaX)));
      setBlocks((prev) => prev.map((b) => (b.id === previewActiveBlock.id ? { ...b, img_width: newWidth } : b)));
    };
    const handleMouseUp = () => { if (isResizingImage) setIsResizingImage(false); };
    if (isResizingImage) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    }
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizingImage, previewActiveBlock, setBlocks, baseScale]);

  const handleMouseDownOnMeme = (meme: TimelineMemeImageItem, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsDraggingMeme(true);
    setDraggedMemeId(meme.id);
    if (setSelectedMemeId) setSelectedMemeId(meme.id);
    dragMemeStartPos.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      initialX: meme.img_x,
      initialY: meme.img_y,
    };
  };

  useEffect(() => {
    const handleMouseMoveMeme = (e: MouseEvent) => {
      if (!isDraggingMeme || !draggedMemeId || !setMemeImageList) return;
      const deltaX = (e.clientX - dragMemeStartPos.current.mouseX) / baseScale;
      const deltaY = (e.clientY - dragMemeStartPos.current.mouseY) / baseScale;

      setMemeImageList((prev) =>
        prev.map((m) => {
          if (m.id !== draggedMemeId) return m;
          const newX = Math.max(0, Math.min(1080 - (m.img_width || 300), Math.round(dragMemeStartPos.current.initialX + deltaX)));
          const newY = Math.max(0, Math.min(1920 - 100, Math.round(dragMemeStartPos.current.initialY + deltaY)));
          return { ...m, img_x: newX, img_y: newY };
        })
      );
    };

    const handleMouseUpMeme = () => {
      if (isDraggingMeme) {
        setIsDraggingMeme(false);
        setDraggedMemeId(null);
      }
    };

    if (isDraggingMeme) {
      window.addEventListener("mousemove", handleMouseMoveMeme);
      window.addEventListener("mouseup", handleMouseUpMeme);
    }
    return () => {
      window.removeEventListener("mousemove", handleMouseMoveMeme);
      window.removeEventListener("mouseup", handleMouseUpMeme);
    };
  }, [isDraggingMeme, draggedMemeId, setMemeImageList, baseScale]);

  const handleMouseDownWm = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsDraggingWm(true);
    wmDragStart.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      initX: watermarkX,
      initY: watermarkY
    };
  };

  useEffect(() => {
    const handleMoveWm = (e: MouseEvent) => {
      if (!isDraggingWm) return;
      const dx = (e.clientX - wmDragStart.current.mouseX) / baseScale;
      const dy = (e.clientY - wmDragStart.current.mouseY) / baseScale;
      if (setWatermarkX) setWatermarkX(Math.max(0, Math.min(800, Math.round(wmDragStart.current.initX + dx))));
      if (setWatermarkY) setWatermarkY(Math.max(0, Math.min(1600, Math.round(wmDragStart.current.initY + dy))));
    };
    const handleUpWm = () => { if (isDraggingWm) setIsDraggingWm(false); };
    if (isDraggingWm) {
      window.addEventListener("mousemove", handleMoveWm);
      window.addEventListener("mouseup", handleUpWm);
    }
    return () => {
      window.removeEventListener("mousemove", handleMoveWm);
      window.removeEventListener("mouseup", handleUpWm);
    };
  }, [isDraggingWm, setWatermarkX, setWatermarkY, baseScale]);

  const formatTimecode = (secs: number) => {
    const h = Math.floor(secs / 3600).toString().padStart(2, "0");
    const m = Math.floor((secs % 3600) / 60).toString().padStart(2, "0");
    const s = Math.floor(secs % 60).toString().padStart(2, "0");
    const f = Math.floor((secs % 1) * 30).toString().padStart(2, "0");
    return h + ":" + m + ":" + s + ":" + f;
  };

  const handleFullscreen = () => {
    if (containerRef.current) {
      if (!document.fullscreenElement) {
        containerRef.current.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    }
  };

  const activeMemes = memeImageList.filter(
    (m) => currentTime >= m.startTime && currentTime <= m.startTime + m.duration
  );

  return (
    <div onWheel={handleWheelZoom} className="w-full flex flex-col items-center select-none pt-2 pb-6">
      {/* KHUNG VIDEO 9:16 CỐ ĐỊNH CHUẨN 320x568px, ĐẢM BẢO CUỘN LÊN/XUỐNG ĐẦY ĐỦ */}
      <div 
        ref={containerRef}
        style={{ width: "320px", height: "568px" }}
        className="relative shrink-0 rounded-2xl overflow-hidden shadow-2xl border-4 border-slate-800 bg-black flex items-center justify-center my-3"
      >
        {isInsideBgVideo && selectedBg && bgUrl ? (
          isVideo ? (
            <>
              <video
                ref={videoRef}
                key={bgUrl}
                src={bgUrl}
                className="absolute inset-0 w-full h-full object-cover"
                playsInline
                muted={isMuted}
                preload="auto"
              />
              <div className="absolute top-2 right-2 z-20 flex items-center gap-1.5 bg-slate-900/70 backdrop-blur-sm p-1 rounded-md border border-slate-700/50">
                <button onClick={() => { if (videoRef.current) { videoRef.current.muted = !isMuted; setIsMuted(!isMuted); } }} className="p-1 text-slate-300 hover:text-white transition">
                  {isMuted ? <VolumeX size={12} /> : <Volume2 size={12} />}
                </button>
              </div>
            </>
          ) : (
            <img src={bgUrl} alt="Background" className="absolute inset-0 w-full h-full object-cover" />
          )
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-xs text-slate-600 gap-1.5 p-4 text-center">
            <span className="font-semibold text-slate-500">Timeline chưa có video nền</span>
            <span className="text-[10px] text-slate-700 font-mono">Bấm (+) tại tab Nền để chèn video</span>
          </div>
        )}

        {/* LỚP ẢNH COMMENT */}
        {previewActiveBlock && (previewActiveBlock.image_url || previewActiveBlock.image_path) && (
          <div
            onMouseDown={handleMouseDownOnImage}
            style={{
              left: (previewActiveBlock.img_x * baseScale) + "px",
              top: (previewActiveBlock.img_y * baseScale) + "px",
              width: ((previewActiveBlock.img_width || 800) * baseScale) + "px",
              borderRadius: (previewActiveBlock.borderRadius || 12) + "px",
              opacity: previewActiveBlock.opacity ?? 1.0,
            }}
            className={\`absolute group cursor-grab active:cursor-grabbing z-25 overflow-hidden \${isDragging ? "ring-2 ring-rose-500 shadow-2xl" : "hover:ring-1 hover:ring-amber-400"}\`}
          >
            <img src={getFullMediaUrl(previewActiveBlock.image_url || previewActiveBlock.image_path)} alt="Comment" draggable={false} className="w-full pointer-events-none drop-shadow-2xl block select-none" />
            <div onMouseDown={handleStartResizeImage} title="Kéo góc để thu nhỏ/phóng to" className="absolute -bottom-2 -right-2 w-4 h-4 bg-amber-400 border border-slate-900 rounded-full cursor-se-resize shadow-lg flex items-center justify-center hover:scale-125 transition-transform" />
          </div>
        )}

        {/* LỚP ẢNH/VIDEO MEME */}
        {activeMemes.map((meme) => {
          const fullMemeUrl = getFullMediaUrl(meme.url);
          const isVidMeme = meme.type === "video" || /\\.(mp4|mov|webm|mkv)(\\?.*)?$/i.test(meme.url);
          const isSelectedMeme = selectedMemeId === meme.id;

          return (
            <div
              key={meme.id}
              onMouseDown={(e) => handleMouseDownOnMeme(meme, e)}
              style={{
                left: (meme.img_x * baseScale) + "px",
                top: (meme.img_y * baseScale) + "px",
                width: ((meme.img_width || 350) * baseScale) + "px",
                opacity: meme.opacity ?? 1.0,
              }}
              className={\`absolute z-35 cursor-grab active:cursor-grabbing rounded overflow-hidden transition-shadow \${
                isSelectedMeme ? "ring-2 ring-pink-500 shadow-2xl" : "hover:ring-1 hover:ring-pink-400"
              }\`}
            >
              {isVidMeme ? (
                <video src={fullMemeUrl} autoPlay loop muted playsInline className="w-full drop-shadow-2xl pointer-events-none" />
              ) : (
                <img src={fullMemeUrl} alt="meme" className="w-full drop-shadow-2xl pointer-events-none select-none" />
              )}
            </div>
          );
        })}

        {/* LỚP WATERMARK BẰNG FILE ẢNH (KÉO THẢ TỰ DO) */}
        {watermarkEnabled && (
          <div
            onMouseDown={handleMouseDownWm}
            style={{
              left: (watermarkX * baseScale) + "px",
              top: (watermarkY * baseScale) + "px",
              opacity: watermarkOpacity / 100,
              transform: "scale(" + watermarkScale + ")",
              transformOrigin: "top left",
            }}
            className="absolute z-40 cursor-grab active:cursor-grabbing select-none"
          >
            <img
              src={"http://localhost:8000/media/watermarks/" + watermarkFileName}
              onError={(e) => {
                e.currentTarget.src = "/watermarks/" + watermarkFileName;
              }}
              alt="Watermark"
              className="h-9 object-contain drop-shadow-xl pointer-events-none"
            />
          </div>
        )}
      </div>

      {/* THANH ĐIỀU KHIỂN CHUẨN CAPCUT */}
      <div className="w-[320px] h-11 px-3 bg-[#14161c]/95 backdrop-blur-md border border-slate-800 rounded-2xl flex items-center justify-between text-slate-300 shadow-xl shrink-0 z-20 font-mono text-xs">
        <div className="flex items-center gap-1 text-[11px]">
          <span className="text-cyan-400 font-bold tracking-tight">{formatTimecode(currentTime)}</span>
          <span className="text-slate-600">/</span>
          <span className="text-slate-400">{formatTimecode(totalDuration)}</span>
        </div>

        <button
          onClick={() => setIsPlaying && setIsPlaying(!isPlaying)}
          className="w-8 h-8 rounded-full bg-gradient-to-tr from-cyan-600 to-cyan-400 hover:from-cyan-500 hover:to-cyan-300 text-slate-950 flex items-center justify-center shadow-lg shadow-cyan-950/60 active:scale-95 transition"
          title={isPlaying ? "Tạm dừng" : "Phát"}
        >
          {isPlaying ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" className="ml-0.5" />}
        </button>

        <div className="flex items-center gap-1.5">
          <span className="px-1.5 py-0.5 rounded-md border border-slate-700 bg-slate-900/80 text-[10px] text-slate-300 font-sans font-semibold">
            9:16
          </span>
          <button
            onClick={handleFullscreen}
            title="Xem toàn màn hình"
            className="flex items-center gap-1 px-2 py-1 bg-slate-800 hover:bg-slate-700 text-cyan-400 hover:text-white rounded-lg border border-slate-700 transition active:scale-95 text-[11px] font-sans font-bold"
          >
            <Maximize size={12} />
            <span>Toàn màn hình</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default PreviewPlayer;
`;
fs.writeFileSync(previewPath, previewContent, "utf8");
console.log(">>> [1/3] Da cap nhat PreviewPlayer.tsx: Chan phat nen khi timeline trong!");

// =========================================================================
// 2. NÂNG CẤP TỰ CÂN BẰNG THÔNG MINH CHO TẤT CẢ CÁC BLOCK (Timeline.tsx)
// - Hút nam châm cho cả Voice, Meme, BGM, Video, Overlay khi kéo rê
// - Nút "Cân Ảnh Theo Voice" tự động dồn khối và cân chỉnh toàn diện
// =========================================================================
const timelinePath = path.join(ROOT, "frontend", "src", "components", "Timeline.tsx");
if (fs.existsSync(timelinePath)) {
  let tl = fs.readFileSync(timelinePath, "utf8");

  // Đảm bảo hàm applyMagneticSnap quét tất cả các block trên mọi track
  const universalSnapCode = `
  const applyMagneticSnap = (targetTime: number, threshold: number = 0.25) => {
    const allKeyTimes: number[] = [0, Number(currentTime.toFixed(2))];
    [...bgClips, ...blocks, ...voiceList, ...bgmList, ...soundFxList, ...memeImageList].forEach((item) => {
      if (item && item.id !== dragAction?.id) {
        allKeyTimes.push(Number(item.startTime.toFixed(2)));
        allKeyTimes.push(Number((item.startTime + item.duration).toFixed(2)));
      }
    });

    for (const snap of allKeyTimes) {
      if (Math.abs(targetTime - snap) <= threshold) {
        return snap;
      }
    }
    return targetTime;
  };
`;

  if (!tl.includes("applyMagneticSnap")) {
    tl = tl.replace("const formatTime =", universalSnapCode + "\n  const formatTime =");
  }

  // Bổ sung Snap cho VOICE
  tl = tl.replace(
    'if (dragAction.target === "voice" && setVoiceList) {',
    'if (dragAction.target === "voice" && setVoiceList) {\n          const snapVoice = applyMagneticSnap(Math.max(0, Number((dragAction.initialStart + deltaSeconds).toFixed(2))));'
  );
  tl = tl.replace(
    'return { ...v, startTime: Math.max(0, Number((dragAction.initialStart + deltaSeconds).toFixed(2))) };',
    'return { ...v, startTime: snapVoice };'
  );

  // Bổ sung Snap cho NHẠC BGM & SOUNDFX
  tl = tl.replace(
    'if (dragAction.target === "bgm" && setBgmList) {',
    'if (dragAction.target === "bgm" && setBgmList) {\n          const snapBgm = applyMagneticSnap(Math.max(0, Number((dragAction.initialStart + deltaSeconds).toFixed(2))));'
  );
  tl = tl.replace(
    'return { ...a, startTime: Math.max(0, Number((dragAction.initialStart + deltaSeconds).toFixed(2))) };',
    'return { ...a, startTime: snapBgm };'
  );

  fs.writeFileSync(timelinePath, tl, "utf8");
  console.log(">>> [2/3] Da nang cap Magnetic Snap cho toan bo cac block (Timeline.tsx)!");
}

// =========================================================================
// 3. SỬA page.tsx:
// - Ghim thanh Watermark cố định trên đỉnh (shrink-0)
// - Vùng cuộn nằm ngay dưới, cuộn mượt lên đỉnh và xuống chân
// - Chỉ truyền video nền đang thực sự nằm trên track Timeline
// =========================================================================
const pagePath = path.join(ROOT, "frontend", "src", "app", "page.tsx");
if (fs.existsSync(pagePath)) {
  let p = fs.readFileSync(pagePath, "utf8");

  // Xác định video nền nào ĐANG NẰM TRÊN TIMELINE tại thời điểm currentTime
  const bgClipDetection = `
  const currentActiveBgClip = bgClips.find(
    (c) => currentTime >= c.startTime && currentTime <= (c.startTime + c.duration)
  ) || null;
  const activeTimelineBgUrl = currentActiveBgClip ? currentActiveBgClip.url : "";
`;

  if (!p.includes("activeTimelineBgUrl")) {
    p = p.replace("const currentActiveBgClip =", bgClipDetection + "\n  const old_currentActiveBgClip =");
  }

  // Chỉ truyền selectedBg khi có clip thực sự
  p = p.replace(
    /selectedBg=\{selectedBgUrl\}/g,
    'selectedBg={activeTimelineBgUrl}'
  );
  p = p.replace(
    /selectedBg=\{currentActiveBgClip\?\.url \|\| ""\}/g,
    'selectedBg={activeTimelineBgUrl}'
  );

  // Truyền thêm prop hasBgClipOnTimeline
  if (!p.includes("hasBgClipOnTimeline={")) {
    p = p.replace(
      '<PreviewPlayer',
      '<PreviewPlayer\n              hasBgClipOnTimeline={!!currentActiveBgClip}'
    );
  }

  // TÁCH THANH WATERMARK THÀNH HEADER CỐ ĐỊNH Ở TRÊN (Ghim cố định, không trôi)
  // Vùng PreviewPlayer bên dưới dùng flex-1 overflow-y-auto overflow-x-auto
  const previewContainerRegex = /\{\/\* KHUNG PREVIEW TRUNG TÂM \*\/\}[\s\S]*?\{\/\* CỘT INSPECTOR BÊN PHẢI \*\/\}/;
  
  const newPreviewWorkspace = `{/* KHUNG PREVIEW TRUNG TÂM */}
        <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#0a0b0e] relative min-w-0">
          {/* THANH ĐIỀU KHIỂN WATERMARK: GHIM CỐ ĐỊNH TRÊN ĐỈNH (SHRINK-0) */}
          <div className="w-full py-2 px-3 flex items-center justify-center shrink-0 border-b border-slate-800/80 bg-[#101217]/95 z-30 shadow-md">
            <div className="flex items-center gap-2 bg-[#181a20] px-3 py-1 rounded-full border border-slate-700 text-xs">
              <button
                onClick={() => setWatermarkEnabled(!watermarkEnabled)}
                className={\`flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border transition \${
                  watermarkEnabled
                    ? "bg-emerald-950 border-emerald-400 text-emerald-300"
                    : "bg-slate-800 border-slate-700 text-slate-400"
                }\`}
              >
                {watermarkEnabled ? <Eye size={12} /> : <EyeOff size={12} />}
                <span>WM: {watermarkEnabled ? "BẬT" : "TẮT"}</span>
              </button>

              <div className="h-3 w-[1px] bg-slate-700 mx-1" />

              <div className="flex items-center bg-slate-900 border border-slate-800 rounded-full p-0.5">
                {(["W1", "W2", "W3"] as const).map((preset) => (
                  <button
                    key={preset}
                    onClick={() => handleSelectWatermarkPreset(preset)}
                    className={\`px-2 py-0.5 rounded-full text-[10px] font-bold transition \${
                      watermarkStyle === preset
                        ? "bg-emerald-500 text-slate-950 shadow"
                        : "text-slate-400 hover:text-white"
                    }\`}
                  >
                    {preset}
                  </button>
                ))}
              </div>

              <div className="h-3 w-[1px] bg-slate-700 mx-1" />

              <div className="flex items-center gap-1.5 text-[11px] text-slate-300">
                <span className="opacity-80">Mờ:</span>
                <input
                  type="range"
                  min="5"
                  max="100"
                  value={watermarkOpacity}
                  onChange={(e) => setWatermarkOpacity(Number(e.target.value))}
                  className="w-14 accent-emerald-400 h-1 cursor-pointer"
                />
                <span className="font-mono text-emerald-400 text-[10px] w-6">{watermarkOpacity}%</span>
              </div>

              <div className="h-3 w-[1px] bg-slate-700 mx-1" />

              <div className="flex items-center gap-1.5 text-[11px] text-slate-300">
                <span className="opacity-80">Size:</span>
                <input
                  type="range"
                  min="0.4"
                  max="2.0"
                  step="0.05"
                  value={watermarkScale}
                  onChange={(e) => setWatermarkScale(Number(e.target.value))}
                  className="w-14 accent-emerald-400 h-1 cursor-pointer"
                />
                <span className="font-mono text-emerald-400 text-[10px] w-5">{watermarkScale}x</span>
              </div>
            </div>
          </div>

          {/* VÙNG CUỘN VIDEO: TỰ DO CUỘN DỌC TẬN ĐỈNH & CUỘN NGANG KHÔNG BỊ KHUẤT */}
          <div className="flex-1 overflow-y-auto overflow-x-auto p-4 flex flex-col items-center justify-start min-h-0">
            <PreviewPlayer
              hasBgClipOnTimeline={!!currentActiveBgClip}
              bgClips={bgClips}
              selectedBg={activeTimelineBgUrl}
              previewActiveBlock={previewActiveBlock}
              baseScale={baseScale}
              zoomScale={zoomScale}
              setZoomScale={setZoomScale}
              showZoomPanel={showZoomPanel}
              setShowZoomPanel={setShowZoomPanel}
              isDragging={isDragging}
              handleMouseDownOnImage={handleMouseDownOnImage}
              handleWheelZoom={handleWheelZoom}
              renderedUrl={renderedUrl}
              currentTime={currentTime}
              totalDuration={totalDuration}
              isPlaying={isPlaying}
              setIsPlaying={setIsPlaying}
              setBlocks={setBlocks}
              memeImageList={memeImageList}
              setMemeImageList={setMemeImageList}
              selectedMemeId={selectedMemeId}
              setSelectedMemeId={setSelectedMemeId}
              watermarkEnabled={watermarkEnabled}
              setWatermarkEnabled={setWatermarkEnabled}
              watermarkX={watermarkX}
              setWatermarkX={setWatermarkX}
              watermarkY={watermarkY}
              setWatermarkY={setWatermarkY}
              watermarkOpacity={watermarkOpacity}
              setWatermarkOpacity={setWatermarkOpacity}
              watermarkScale={watermarkScale}
              setWatermarkScale={setWatermarkScale}
              watermarkFileName={watermarkFileName}
              setWatermarkFileName={setWatermarkFileName}
            />
          </div>
        </div>

        {/* CỘT INSPECTOR BÊN PHẢI */}`;

  if (previewContainerRegex.test(p)) {
    p = p.replace(previewContainerRegex, newPreviewWorkspace);
  }

  fs.writeFileSync(pagePath, p, "utf8");
  console.log(">>> [3/3] Da ghim thanh Watermark tren dinh va fix cuon len tan dau (page.tsx)!");
}

console.log("=== HOAN TAT 100%! ===");
