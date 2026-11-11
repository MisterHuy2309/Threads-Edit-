import React from "react";
import { Film, Image as ImageIcon, ShieldCheck, ChevronDown, ChevronUp } from "lucide-react";

export interface HeaderProps {
  currentView?: "editor" | "cover_maker" | "watermark_studio";
  setCurrentView?: (view: "editor" | "cover_maker" | "watermark_studio") => void;
  showExportModal?: boolean;
  setShowExportModal?: (show: boolean) => void;
  isRendering?: boolean;
  renderProgress?: number;
  showTimeline?: boolean;
  setShowTimeline?: React.Dispatch<React.SetStateAction<boolean>> | ((fn: (prev: boolean) => boolean) => void);
  onOpenCoverMaker?: () => void;
  onOpenWatermarkStudio?: () => void;
  hasBlocks?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  currentView,
  setCurrentView,
  showExportModal,
  setShowExportModal,
  isRendering,
  renderProgress = 0,
  showTimeline = true,
  setShowTimeline,
  onOpenCoverMaker,
  onOpenWatermarkStudio,
  hasBlocks,
}) => {
  const handleOpenCover = () => {
    if (typeof setCurrentView === "function") {
      setCurrentView("cover_maker");
    } else if (typeof onOpenCoverMaker === "function") {
      onOpenCoverMaker();
    }
  };

  const handleOpenWatermark = () => {
    if (typeof setCurrentView === "function") {
      setCurrentView("watermark_studio");
    } else if (typeof onOpenWatermarkStudio === "function") {
      onOpenWatermarkStudio();
    }
  };

  const handleToggleTimeline = () => {
    if (typeof setShowTimeline === "function") {
      setShowTimeline((prev: boolean) => !prev);
    }
  };

  return (
    <header className="h-12 border-b border-slate-800/80 px-5 flex items-center justify-between bg-slate-900/80 shrink-0 select-none">
      <div className="flex items-center gap-3">
        <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />
        <h1 className="text-sm font-bold bg-gradient-to-r from-rose-400 via-amber-300 to-indigo-300 bg-clip-text text-transparent">
          Sợi Chỉ Biết Tuốt - Threads Video Editor
        </h1>
      </div>

      <div className="flex items-center gap-3">
        {/* NÚT TẠO ẢNH BÌA 9:16 */}
        <button
          onClick={handleOpenCover}
          className="px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 border border-amber-500/40 bg-amber-950/30 text-amber-300 hover:bg-amber-900/50 hover:border-amber-400 transition active:scale-95 shadow-sm"
        >
          <ImageIcon size={14} className="text-amber-400" />
          <span>Tạo Ảnh Bìa 9:16</span>
        </button>

        {/* NÚT TẠO WATERMARK */}
        <button
          onClick={handleOpenWatermark}
          className="px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 border border-emerald-500/40 bg-emerald-950/30 text-emerald-300 hover:bg-emerald-900/50 hover:border-emerald-400 transition active:scale-95 shadow-sm"
        >
          <ShieldCheck size={14} className="text-emerald-400" />
          <span>Tạo Watermark</span>
        </button>

        {/* NÚT ẨN/HIỆN TIMELINE */}
        <button
          onClick={handleToggleTimeline}
          className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition border ${
            showTimeline
              ? "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"
              : "bg-cyan-950/50 border-cyan-500/50 text-cyan-300 hover:bg-cyan-900/50"
          }`}
        >
          {showTimeline ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          <span>{showTimeline ? "Ẩn Timeline" : "Hiện Timeline"}</span>
        </button>

        {/* NÚT XUẤT VIDEO */}
        <button
          onClick={() => {
            if (typeof setShowExportModal === "function") {
              setShowExportModal(true);
            }
          }}
          disabled={isRendering}
          className="px-3.5 py-1.5 rounded-md text-xs font-bold flex items-center gap-1.5 bg-rose-600 hover:bg-rose-500 text-white shadow-md shadow-rose-950 transition active:scale-95 disabled:opacity-50"
        >
          <Film size={14} />
          <span>{isRendering ? `Đang Render ${renderProgress}%...` : "Xuất Video 9:16"}</span>
        </button>
      </div>
    </header>
  );
};

export default Header;
