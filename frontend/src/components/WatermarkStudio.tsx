"use client";

import React, { useState, useRef } from "react";
import { ArrowLeft, Download, ShieldCheck } from "lucide-react";

interface WatermarkStudioProps {
  onBack: () => void;
}

export const WatermarkStudio: React.FC<WatermarkStudioProps> = ({ onBack }) => {
  const [selectedStyle, setSelectedStyle] = useState<"W1" | "W2" | "W3">("W1");
  const [text, setText] = useState("soichibiettuot");
  const [opacity, setOpacity] = useState(1.0);
  const [scale, setScale] = useState(1.0);
  const [previewBg, setPreviewBg] = useState<"checker" | "dark" | "light">("checker");

  const watermarkRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);

  const mascotAvatar = "http://localhost:8000/media/mascots/mascot_m1.png";

  const loadHtml2CanvasScript = (): Promise<any> => {
    return new Promise((resolve, reject) => {
      if ((window as any).html2canvas) {
        return resolve((window as any).html2canvas);
      }
      const script = document.createElement("script");
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
      script.onload = () => resolve((window as any).html2canvas);
      script.onerror = () => reject(new Error("Lỗi tải thư viện xuất ảnh"));
      document.body.appendChild(script);
    });
  };

  const handleDownloadWatermark = async () => {
    if (!watermarkRef.current) return;
    setIsExporting(true);
    try {
      const html2canvas = await loadHtml2CanvasScript();
      if (html2canvas) {
        const canvas = await html2canvas(watermarkRef.current, {
          scale: 4,
          useCORS: true,
          allowTaint: true,
          backgroundColor: null,
        });
        const link = document.createElement("a");
        link.download = `watermark_${selectedStyle}_${Date.now()}.png`;
        link.href = canvas.toDataURL("image/png");
        link.click();
      }
    } catch {
      alert("Đang chuẩn bị file watermark...");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-[#0d0e12] text-slate-100 select-none overflow-hidden">
      {/* HEADER WATERMARK STUDIO */}
      <div className="h-14 border-b border-slate-800 bg-[#16181d] px-6 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition"
          >
            ← Quay Lại Editor
          </button>
          <span className="text-sm font-bold text-slate-100">Watermark Studio & Presets</span>
        </div>
      </div>

      {/* WORKSPACE CHÍNH */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* PANEL ĐIỀU CHỈNH BÊN TRÁI */}
        <div className="w-[360px] border-r border-slate-800 bg-[#121316] p-5 flex flex-col gap-4 overflow-y-auto">
          <div className="border-t border-slate-800/80 pt-3 space-y-3">
            <div>
              <label className="text-slate-400 block mb-1 text-xs font-semibold">Nội dung text watermark:</label>
              <input
                type="text"
                value={typeof watermarkText !== "undefined" ? watermarkText : "Sợi Chỉ Biết Tuốt"}
                onChange={(e) => {
                  if (typeof setWatermarkText === "function") setWatermarkText(e.target.value);
                }}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 font-medium"
                placeholder="Nhập tên kênh hoặc text..."
              />
            </div>

            <div className="p-3 bg-emerald-950/20 border border-emerald-500/30 rounded-xl space-y-1.5">
              <span className="text-xs font-bold text-emerald-400 block">3 Presets Watermark Chuẩn:</span>
              <p className="text-[11px] text-slate-400">
                • <b>W1</b>: Signature Pill Cam bo tròn kèm avatar chú khủng long.<br />
                • <b>W2</b>: Dark Glassmorphism viền cyan hiện đại.<br />
                • <b>W3</b>: Minimal Floating Logo không khung nền.
              </p>
            </div>
          </div>
        </div>

        {/* KHUNG XEM TRƯỚC TRUNG TÂM */}
        <div className="flex-1 flex items-center justify-center p-6 bg-[#0a0b0e] overflow-hidden">
          <div className="w-[320px] h-[568px] rounded-2xl border border-slate-800 bg-slate-950/80 shadow-2xl relative overflow-hidden flex items-center justify-center">
            <span className="text-xs text-slate-600 font-mono">Khung xem trước Watermark</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WatermarkStudio;
