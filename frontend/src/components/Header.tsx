import React from "react";
import { Play, RefreshCw, ChevronDown, ChevronUp, Image as ImageIcon, ShieldCheck } from "lucide-react";

interface HeaderProps {
  showTimeline: boolean;
  setShowTimeline: React.Dispatch<React.SetStateAction<boolean>>;
  handleRenderTimeline: () => void;
  onOpenCoverMaker: () => void;
  onOpenWatermarkStudio: () => void;
  isRendering: boolean;
  hasBlocks: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  showTimeline,
  setShowTimeline,
  handleRenderTimeline,
  onOpenCoverMaker,
  onOpenWatermarkStudio,
  isRendering,
  hasBlocks,
}) => {
  return (
    <header className="h-12 border-b border-slate-800/80 px-5 flex items-center justify-between bg-slate-900/80 shrink-0 select-none">
      <div className="flex items-center gap-3">
        <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />
        <h1 className="text-sm font-bold bg-gradient-to-r from-rose-400 via-amber-300 to-indigo-300 bg-clip-text text-transparent">
          Sợi Chỉ Biết Tuốt - Threads Video Editor
        </h1>
      </div>

      <div className="flex items-center gap-2.5">
        {/* NÚT TẠO ẢNH BÌA */}
        <button
          onClick={onOpenCoverMaker}
          className="px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition border bg-amber-500/10 border-amber-500/40 text-amber-300 hover:bg-amber-500/20 active:scale-95 shadow-sm"
        >
          <ImageIcon size={14} className="text-amber-400" />
          <span>Tạo Ảnh Bìa 9:16</span>
        </button>

        {/* NÚT TẠO WATERMARK (ĐẶT KẾ BÊN MENU ẢNH BÌA) */}
        <button
          onClick={onOpenWatermarkStudio}
          className="px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition border bg-emerald-500/10 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/20 active:scale-95 shadow-sm"
        >
          <ShieldCheck size={14} className="text-emerald-400" />
          <span>Tạo Watermark</span>
        </button>

        <div className="h-4 w-[1px] bg-slate-800 mx-0.5" />

        <button
          onClick={() => setShowTimeline((prev) => !prev)}
          className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition border ${
            showTimeline
              ? "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"
              : "bg-indigo-600/30 border-indigo-500/80 text-indigo-200 hover:bg-indigo-600/40"
          }`}
        >
          {showTimeline ? (
            <>
              <ChevronDown size={14} /> Ẩn Timeline
            </>
          ) : (
            <>
              <ChevronUp size={14} /> Hiện Timeline
            </>
          )}
        </button>

        <button
          onClick={handleRenderTimeline}
          disabled={isRendering || !hasBlocks}
          className="px-4 py-1.5 bg-gradient-to-r from-rose-600 to-orange-500 hover:opacity-90 disabled:opacity-40 text-white rounded-md text-xs font-bold flex items-center gap-2 shadow-lg shadow-rose-950/40 transition active:scale-95"
        >
          {isRendering ? (
            <>
              <RefreshCw className="animate-spin" size={13} /> Đang xuất Video...
            </>
          ) : (
            <>
              <Play size={13} /> Xuất Video 9:16
            </>
          )}
        </button>
      </div>
    </header>
  );
};
