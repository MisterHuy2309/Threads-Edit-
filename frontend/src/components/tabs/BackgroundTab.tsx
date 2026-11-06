"use client";

import React, { useRef } from "react";
import { Upload, Plus, Check } from "lucide-react";
import { BgData } from "@/types";

interface BackgroundTabProps {
  bgVideos: BgData[];
  selectedBg: string;
  setSelectedBg: (bgUrl: string) => void;
  handleUploadBg: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  onAddBgToTimeline?: (bg: BgData) => void;
}

export const BackgroundTab: React.FC<BackgroundTabProps> = ({
  bgVideos,
  selectedBg,
  setSelectedBg,
  handleUploadBg,
  onAddBgToTimeline,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const formatSecs = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, "0");
    const s = Math.floor(secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  return (
    <div className="flex flex-col h-full w-full select-none text-xs overflow-hidden">
      {/* NÚT IMPORT VIDEO */}
      <div className="shrink-0 mb-3">
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleUploadBg}
          accept="video/*"
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-full py-2 bg-teal-600 hover:bg-teal-500 active:scale-95 text-white font-bold rounded-lg shadow flex items-center justify-center gap-2 transition"
        >
          <Upload size={14} /> Tải Video Nền Lên
        </button>
      </div>

      <div className="flex justify-between items-center text-slate-400 mb-2 shrink-0">
        <span className="font-semibold text-slate-300">Tất cả video ({bgVideos.length})</span>
        <span className="text-[10px] text-teal-400">Bấm (+) hoặc Kéo vào Timeline</span>
      </div>

      {/* DANH SÁCH THẺ FILMSTRIP CHUẨN CAPCUT (HÌNH 3) */}
      <div className="flex-1 min-h-0 overflow-y-auto space-y-2.5 pr-1">
        {bgVideos.map((bg, idx) => {
          const isCurrent = selectedBg === bg.url;
          return (
            <div
              key={idx}
              draggable={true}
              onDragStart={(e) => {
                e.dataTransfer.setData("application/json", JSON.stringify({ ...bg, type: "video" }));
                e.dataTransfer.effectAllowed = "copy";
              }}
              onClick={() => setSelectedBg(bg.url)}
              className={`group relative bg-slate-900 border rounded-xl overflow-hidden cursor-grab active:cursor-grabbing transition-all shadow-md ${
                isCurrent ? "border-teal-400 ring-1 ring-teal-400/50" : "border-slate-800 hover:border-slate-700"
              }`}
            >
              {/* DÃY FILMSTRIP PREVIEW */}
              <div className="h-16 w-full flex bg-slate-950 overflow-hidden relative">
                {bg.thumbs && bg.thumbs.length > 0 ? (
                  bg.thumbs.map((thumbUrl, tIdx) => (
                    <img
                      key={tIdx}
                      src={thumbUrl}
                      alt="frame"
                      className="h-full flex-1 object-cover border-r border-slate-900/40 pointer-events-none select-none"
                    />
                  ))
                ) : (
                  <video src={bg.url} className="w-full h-full object-cover pointer-events-none" />
                )}

                {/* BADGE THỜI LƯỢNG GÓC TRÊN BÊN PHẢI */}
                <div className="absolute top-1.5 right-2 bg-black/75 px-1.5 py-0.5 rounded text-[10px] font-mono text-white shadow pointer-events-none">
                  {formatSecs(bg.duration)}
                </div>

                {/* HUY HIỆU ADDED HOẶC NÚT DẤU CỘNG (+) */}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedBg(bg.url);
                      if (onAddBgToTimeline) onAddBgToTimeline(bg);
                    }}
                    title="Gắn video vào Timeline"
                    className="p-2 bg-teal-500 hover:bg-teal-400 text-slate-950 rounded-full shadow-lg font-bold flex items-center justify-center transition transform hover:scale-110 active:scale-95"
                  >
                    <Plus size={16} />
                  </button>
                </div>

                {isCurrent && (
                  <div className="absolute top-1.5 left-2 bg-teal-500/90 text-slate-950 px-1.5 py-0.5 rounded text-[9px] font-bold shadow flex items-center gap-1 pointer-events-none">
                    <Check size={10} strokeWidth={3} /> Đang chọn
                  </div>
                )}
              </div>

              {/* TÊN FILE PHÍA DƯỚI */}
              <div className="px-2.5 py-1.5 bg-slate-900/90 flex items-center justify-between text-[11px]">
                <span className="text-slate-300 font-medium truncate flex-1">{bg.name}</span>
              </div>
            </div>
          );
        })}

        {bgVideos.length === 0 && (
          <div className="text-center py-12 text-slate-600 italic">
            Chưa có video nền nào. Hãy tải lên video của bạn!
          </div>
        )}
      </div>
    </div>
  );
};

export default BackgroundTab;