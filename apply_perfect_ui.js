const fs = require("fs");
const path = require("path");

const ROOT = __dirname;

// =========================================================================
// 1. THIẾT KẾ LẠI PREVIEW PLAYER (PreviewPlayer.tsx)
// - Bỏ hoàn toàn thanh zoom đè lên nút phát (Ảnh 1)
// - Thiết kế thanh player bar đẹp chuẩn CapCut (Ảnh 2)
// - Khung video 9:16 Responsive Auto-fit, không bị mất đầu hay tràn màn hình
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

  const getFullMediaUrl = (url: string | null | undefined): string => {
    if (!url) return "";
    if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("blob:")) return url;
    const cleanPath = url.startsWith("/") ? url : "/" + url;
    return cleanPath.startsWith("/media/") ? ("http://127.0.0.1:8000" + cleanPath) : ("http://127.0.0.1:8000/media/backgrounds" + cleanPath);
  };

  const bgUrl = getFullMediaUrl(selectedBg);
  const isVideo = /\\.(mp4|mov|webm|mkv|avi|m4v)(\\?.*)?$/i.test(bgUrl);
  const isInsideBgVideo = currentTime >= bgStartTime && currentTime <= (bgStartTime + bgDuration);

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
      const deltaX = (e.clientX - resizeStartData.current.mouseX) / 0.3;
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
  }, [isResizingImage, previewActiveBlock, setBlocks]);

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
      const deltaX = (e.clientX - dragMemeStartPos.current.mouseX) / 0.3;
      const deltaY = (e.clientY - dragMemeStartPos.current.mouseY) / 0.3;

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
  }, [isDraggingMeme, draggedMemeId, setMemeImageList]);

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
      const dx = (e.clientX - wmDragStart.current.mouseX) / 0.3;
      const dy = (e.clientY - wmDragStart.current.mouseY) / 0.3;
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
  }, [isDraggingWm, setWatermarkX, setWatermarkY]);

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
    <div onWheel={handleWheelZoom} className="w-full h-full flex flex-col items-center justify-between select-none py-1 overflow-hidden">
      {/* KHUNG XEM TRƯỚC 9:16 RESPONSIVE AUTO-FIT TRÁNH TRÀN KHUNG */}
      <div 
        ref={containerRef}
        className="flex-1 w-full flex items-center justify-center min-h-0 relative my-auto p-1"
      >
        <div 
          className="relative h-full aspect-[9/16] max-h-full max-w-full rounded-2xl overflow-hidden shadow-2xl border-2 border-slate-800/90 bg-black flex items-center justify-center"
        >
          {bgUrl && selectedBg ? (
            isVideo ? (
              <>
                <video
                  ref={videoRef}
                  key={bgUrl}
                  src={bgUrl}
                  className={\`absolute inset-0 w-full h-full object-cover transition-opacity duration-150 \${isInsideBgVideo ? "opacity-100" : "opacity-0"}\`}
                  playsInline
                  muted={isMuted}
                  preload="auto"
                />
                {!isInsideBgVideo && (
                  <div className="w-full h-full flex flex-col items-center justify-center text-xs text-slate-600 font-mono">
                    [Ngoài đoạn Video Nền]
                  </div>
                )}
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
              <span className="font-semibold text-slate-500">Chưa có video nền</span>
              <span className="text-[10px] text-slate-700 font-mono">Kéo hoặc bấm (+) từ tab Nền để chèn</span>
            </div>
          )}

          {/* LỚP ẢNH COMMENT */}
          {previewActiveBlock && (previewActiveBlock.image_url || previewActiveBlock.image_path) && (
            <div
              onMouseDown={handleMouseDownOnImage}
              style={{
                left: ((previewActiveBlock.img_x / 1080) * 100) + "%",
                top: ((previewActiveBlock.img_y / 1920) * 100) + "%",
                width: (((previewActiveBlock.img_width || 800) / 1080) * 100) + "%",
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
                  left: ((meme.img_x / 1080) * 100) + "%",
                  top: ((meme.img_y / 1920) * 100) + "%",
                  width: (((meme.img_width || 350) / 1080) * 100) + "%",
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

          {/* WATERMARK BẰNG FILE ẢNH (KÉO THẢ TỰ DO) */}
          {watermarkEnabled && (
            <div
              onMouseDown={handleMouseDownWm}
              style={{
                left: ((watermarkX / 1080) * 100) + "%",
                top: ((watermarkY / 1920) * 100) + "%",
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
      </div>

      {/* THANH ĐIỀU KHIỂN CHUẨN CAPCUT DUY NHẤT (THIẾT KẾ ĐẸP THEO ẢNH 2) */}
      <div className="w-[340px] max-w-[95%] h-11 px-4 bg-[#14161c]/95 backdrop-blur-md border border-slate-800 rounded-2xl flex items-center justify-between text-slate-300 shadow-xl shrink-0 z-20 font-mono text-xs">
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

        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded-md border border-slate-700 bg-slate-900/80 text-[10px] text-slate-300 font-sans font-semibold">
            9:16
          </span>
          <button
            onClick={handleFullscreen}
            title="Xem toàn màn hình (CapCut Style)"
            className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-cyan-400 hover:text-white rounded-lg border border-slate-700 transition active:scale-95 text-[11px] font-sans font-bold"
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
console.log(">>> [1/3] Da cap nhat PreviewPlayer.tsx thanh cong!");

// =========================================================================
// 2. NÂNG CẤP TIMELINE: TỰ CÂN BẰNG NAM CHÂM THÔNG MINH (Timeline.tsx)
// =========================================================================
const timelinePath = path.join(ROOT, "frontend", "src", "components", "Timeline.tsx");
if (fs.existsSync(timelinePath)) {
  let tlContent = fs.readFileSync(timelinePath, "utf8");

  const snapFunction = `
  // THUẬT TOÁN TỰ CÂN BẰNG NAM CHÂM THÔNG MINH (MAGNETIC SNAPPING)
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

  if (!tlContent.includes("applyMagneticSnap")) {
    tlContent = tlContent.replace("const formatTime =", snapFunction + "\n  const formatTime =");
  }

  tlContent = tlContent.replace(
    'updatedStart = Math.max(0, Number((dragAction.initialStart + deltaSeconds).toFixed(2)));',
    'const rawMoved = Math.max(0, Number((dragAction.initialStart + deltaSeconds).toFixed(2)));\n            updatedStart = applyMagneticSnap(rawMoved, 0.25);'
  );

  tlContent = tlContent.replace(
    'updatedStart = Math.max(0, Number((dragAction.initialStart + deltaSeconds).toFixed(2)));',
    'const rawMemeMoved = Math.max(0, Number((dragAction.initialStart + deltaSeconds).toFixed(2)));\n            updatedStart = applyMagneticSnap(rawMemeMoved, 0.25);'
  );

  fs.writeFileSync(timelinePath, tlContent, "utf8");
  console.log(">>> [2/3] Da tich hop Magnetic Snap vao Timeline.tsx!");
}

// =========================================================================
// 3. SỬA PAGE (page.tsx): Khung Preview chuẩn không che đầu, hỗ trợ scroll
// =========================================================================
const pagePath = path.join(ROOT, "frontend", "src", "app", "page.tsx");
if (fs.existsSync(pagePath)) {
  let pContent = fs.readFileSync(pagePath, "utf8");

  pContent = pContent.replace(
    /className="flex-1 flex flex-col items-center[^"]*"/,
    'className="flex-1 flex flex-col items-center justify-between p-2 overflow-x-auto overflow-y-auto bg-[#0a0b0e] relative min-w-0 h-full"'
  );

  fs.writeFileSync(pagePath, pContent, "utf8");
  console.log(">>> [3/3] Da cap nhat page.tsx!");
}

console.log("=== THIET LAP HOAN TAT 100%! ===");
