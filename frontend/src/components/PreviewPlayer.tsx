"use client";

import React, { useRef, useState, useEffect } from "react";
import { 
  Maximize2, ZoomOut, ZoomIn, RotateCcw, EyeOff, SlidersHorizontal, Download, Play, Pause, Volume2, VolumeX, Maximize
} from "lucide-react";
import { TimelineBlock, TimelineMemeImageItem } from "@/types";

export interface PreviewPlayerProps {
  selectedBg: string;
  previewActiveBlock: TimelineBlock | null;
  baseScale: number;
  zoomScale: number;
  setZoomScale: React.Dispatch<React.SetStateAction<number>>;
  showZoomPanel: boolean;
  setShowZoomPanel: React.Dispatch<React.SetStateAction<boolean>>;
  isDragging: boolean;
  handleMouseDownOnImage: (e: React.MouseEvent) => void;
  handleWheelZoom: (e: React.WheelEvent) => void;
  renderedUrl: string | null;
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
}

export const PreviewPlayer: React.FC<PreviewPlayerProps> = ({
  selectedBg,
  previewActiveBlock,
  baseScale,
  zoomScale,
  setZoomScale,
  showZoomPanel,
  setShowZoomPanel,
  isDragging,
  handleMouseDownOnImage,
  handleWheelZoom,
  renderedUrl,
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

  const getFullMediaUrl = (url: string | null | undefined): string => {
    if (!url) return "";
    if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("blob:")) return url;
    const cleanPath = url.startsWith("/") ? url : `/${url}`;
    return cleanPath.startsWith("/media/") ? `http://127.0.0.1:8000${cleanPath}` : `http://127.0.0.1:8000/media/backgrounds${cleanPath}`;
  };

  const bgUrl = getFullMediaUrl(selectedBg);
  const isVideo = /\.(mp4|mov|webm|mkv|avi|m4v)(\?.*)?$/i.test(bgUrl);
  const isInsideBgVideo = currentTime >= bgStartTime && currentTime <= (bgStartTime + bgDuration);

  // ĐỒNG BỘ VIDEO NỀN THÔNG MINH: CHỐNG LẶP SEEKING GÂY ĐỨNG HÌNH TRÊN VIDEO DÀI
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !isVideo) return;

    if (isInsideBgVideo) {
      const targetVideoTime = Math.max(0, bgTrimStart + (currentTime - bgStartTime));
      
      // Chỉ can thiệp seek khi video đang tạm dừng hoặc bị lệch quá 0.45s
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
  }, [currentTime, isPlaying, isVideo, isInsideBgVideo, bgStartTime, bgDuration, bgTrimStart]);

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
      const deltaX = (e.clientX - resizeStartData.current.mouseX) / (baseScale * zoomScale);
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
  }, [isResizingImage, previewActiveBlock, baseScale, zoomScale, setBlocks]);

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
      const deltaX = e.clientX - dragMemeStartPos.current.mouseX;
      const deltaY = e.clientY - dragMemeStartPos.current.mouseY;
      const scaleMultiplier = baseScale * zoomScale;
      const moveXOriginal = Math.round(deltaX / scaleMultiplier);
      const moveYOriginal = Math.round(deltaY / scaleMultiplier);

      setMemeImageList((prev) =>
        prev.map((m) => {
          if (m.id !== draggedMemeId) return m;
          const newX = Math.max(0, Math.min(1080 - (m.img_width || 300), dragMemeStartPos.current.initialX + moveXOriginal));
          const newY = Math.max(0, Math.min(1920 - 100, dragMemeStartPos.current.initialY + moveYOriginal));
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
  }, [isDraggingMeme, draggedMemeId, baseScale, zoomScale, setMemeImageList]);

  const formatTimecode = (secs: number) => {
    const h = Math.floor(secs / 3600).toString().padStart(2, "0");
    const m = Math.floor((secs % 3600) / 60).toString().padStart(2, "0");
    const s = Math.floor(secs % 60).toString().padStart(2, "0");
    const f = Math.floor((secs % 1) * 30).toString().padStart(2, "0");
    return `${h}:${m}:${s}:${f}`;
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
    <div onWheel={handleWheelZoom} className="w-full flex flex-col items-center justify-start py-2 select-none">
      <div className="mb-2 flex items-center justify-center">
        {showZoomPanel ? (
          <div className="flex items-center gap-2 bg-slate-900/90 backdrop-blur border border-slate-800 px-3 py-1 rounded-full shadow-xl">
            <span className="text-[11px] text-slate-300 font-medium flex items-center gap-1.5">
              <Maximize2 size={13} className="text-amber-400" /> 9:16 Preview
            </span>
            <div className="h-3 w-[1px] bg-slate-700" />
            <button onClick={() => setZoomScale((p) => Math.max(0.5, p - 0.05))} className="text-slate-400 hover:text-white p-0.5"><ZoomOut size={13} /></button>
            <input type="range" min="0.5" max="1.6" step="0.05" value={zoomScale} onChange={(e) => setZoomScale(Number(e.target.value))} className="w-20 accent-amber-500 h-1 bg-slate-800 rounded cursor-pointer" />
            <button onClick={() => setZoomScale((p) => Math.min(1.6, p + 0.05))} className="text-slate-400 hover:text-white p-0.5"><ZoomIn size={13} /></button>
            <span className="text-[11px] font-mono text-amber-400 min-w-9">{Math.round(zoomScale * 100)}%</span>
            <button onClick={() => setZoomScale(1)} title="Reset 100%" className="text-slate-400 hover:text-white p-0.5 ml-0.5"><RotateCcw size={12} /></button>
            <div className="h-3 w-[1px] bg-slate-700" />
            <button onClick={() => setShowZoomPanel(false)} title="Thu gọn" className="text-slate-400 hover:text-rose-400 p-0.5 ml-0.5"><EyeOff size={13} /></button>
          </div>
        ) : (
          <button onClick={() => setShowZoomPanel(true)} className="flex items-center gap-1.5 bg-slate-900/90 border border-slate-800 hover:border-slate-700 px-3 py-1.5 rounded-full text-[11px] text-slate-300 shadow-lg transition">
            <SlidersHorizontal size={13} className="text-amber-400" />
            <span>Zoom: {Math.round(zoomScale * 100)}%</span>
          </button>
        )}
      </div>

      <div ref={containerRef} className="flex flex-col items-center">
        <div style={{ transform: `scale(${zoomScale})`, transformOrigin: "top center", transition: isDragging || isResizingImage || isDraggingMeme ? "none" : "transform 0.15s ease-out" }} className="rounded-2xl overflow-hidden shadow-2xl border-4 border-slate-800 bg-black flex-shrink-0">
          <div style={{ width: "320px", height: "568px" }} className="relative overflow-hidden select-none bg-slate-950">
            {bgUrl ? (
              isVideo ? (
                <>
                  <video
                    ref={videoRef}
                    key={bgUrl}
                    src={bgUrl}
                    className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-150 ${isInsideBgVideo ? "opacity-100" : "opacity-0"}`}
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
              <div className="w-full h-full flex flex-col items-center justify-center text-xs text-slate-600 gap-1.5">
                <span>Chưa chọn video nền</span>
                <span className="text-[10px] text-slate-700 font-mono">Tỷ lệ 9:16 (1080x1920)</span>
              </div>
            )}

            {/* 1. LỚP ẢNH COMMENT */}
            {previewActiveBlock && (previewActiveBlock.image_url || previewActiveBlock.image_path) && (
              <div
                onMouseDown={handleMouseDownOnImage}
                style={{
                  left: `${previewActiveBlock.img_x * baseScale}px`,
                  top: `${previewActiveBlock.img_y * baseScale}px`,
                  width: `${(previewActiveBlock.img_width || 800) * baseScale}px`,
                  borderRadius: `${previewActiveBlock.borderRadius || 12}px`,
                  opacity: previewActiveBlock.opacity ?? 1.0,
                }}
                className={`absolute group cursor-grab active:cursor-grabbing z-25 overflow-hidden ${isDragging ? "ring-2 ring-rose-500 shadow-2xl" : "hover:ring-1 hover:ring-amber-400"}`}
              >
                <img src={getFullMediaUrl(previewActiveBlock.image_url || previewActiveBlock.image_path)} alt="Comment" draggable={false} className="w-full pointer-events-none drop-shadow-2xl block select-none" />
                <div onMouseDown={handleStartResizeImage} title="Kéo góc để thu nhỏ/phóng to" className="absolute -bottom-2 -right-2 w-4 h-4 bg-amber-400 border border-slate-900 rounded-full cursor-se-resize shadow-lg flex items-center justify-center hover:scale-125 transition-transform" />
              </div>
            )}

            {/* 2. LỚP ẢNH/VIDEO MEME */}
            {activeMemes.map((meme) => {
              const fullMemeUrl = getFullMediaUrl(meme.url);
              const isVidMeme = meme.type === "video" || /\.(mp4|mov|webm|mkv)(\?.*)?$/i.test(meme.url);
              const isSelectedMeme = selectedMemeId === meme.id;

              return (
                <div
                  key={meme.id}
                  onMouseDown={(e) => handleMouseDownOnMeme(meme, e)}
                  style={{
                    left: `${meme.img_x * baseScale}px`,
                    top: `${meme.img_y * baseScale}px`,
                    width: `${meme.img_width * baseScale}px`,
                    opacity: meme.opacity ?? 1.0,
                  }}
                  className={`absolute z-35 cursor-grab active:cursor-grabbing rounded overflow-hidden transition-shadow ${
                    isSelectedMeme ? "ring-2 ring-pink-500 shadow-2xl" : "hover:ring-1 hover:ring-pink-400"
                  }`}
                >
                  {isVidMeme ? (
                    <video
                      src={fullMemeUrl}
                      autoPlay
                      loop
                      muted
                      playsInline
                      className="w-full drop-shadow-2xl pointer-events-none"
                    />
                  ) : (
                    <img src={fullMemeUrl} alt="meme" className="w-full drop-shadow-2xl pointer-events-none select-none" />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* THANH PLAYER CONTROL BAR */}
        <div style={{ width: `${320 * zoomScale}px` }} className="mt-3 flex items-center justify-between px-3 py-1.5 bg-slate-900/90 border border-slate-800 rounded-xl text-slate-300 shadow-lg text-[11px] font-mono">
          <div className="flex items-center gap-1.5">
            <span className="text-cyan-400 font-semibold">{formatTimecode(currentTime)}</span>
            <span className="text-slate-600">/</span>
            <span className="text-slate-400">{formatTimecode(totalDuration)}</span>
          </div>

          <button
            onClick={() => setIsPlaying && setIsPlaying(!isPlaying)}
            className="p-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-full shadow transition active:scale-95 flex items-center justify-center"
            title={isPlaying ? "Tạm dừng" : "Phát"}
          >
            {isPlaying ? <Pause size={13} fill="currentColor" /> : <Play size={13} fill="currentColor" />}
          </button>

          <div className="flex items-center gap-2 text-slate-400">
            <span className="px-1.5 py-0.5 rounded border border-slate-700 bg-slate-800 text-[10px] text-slate-300 font-sans">Ratio 9:16</span>
            <button onClick={handleFullscreen} title="Toàn màn hình" className="hover:text-white transition">
              <Maximize size={13} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PreviewPlayer;
