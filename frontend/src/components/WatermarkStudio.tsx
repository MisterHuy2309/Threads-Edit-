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
    <div className="flex flex-col h-screen bg-slate-950 text-slate-100 font-sans select-none overflow-hidden">
      <header className="h-12 border-b border-slate-800 px-5 flex items-center justify-between bg-slate-900/90 shrink-0">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-xs font-semibold text-slate-300 hover:text-white px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg transition"
        >
          <ArrowLeft size={14} /> Quay lại Video Editor
        </button>

        <span className="text-xs font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent flex items-center gap-1.5">
          <ShieldCheck size={16} className="text-emerald-400" /> STUDIO THIẾT KẾ WATERMARK KÊNH
        </span>

        <button
          onClick={handleDownloadWatermark}
          disabled={isExporting}
          className="flex items-center gap-2 text-xs font-bold px-4 py-1.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 rounded-lg shadow-lg active:scale-95 transition"
        >
          <Download size={14} /> {isExporting ? "Đang xuất PNG..." : "Tải Watermark PNG Trong Suốt"}
        </button>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* PANEL TRÁI */}
        <div className="w-[380px] border-r border-slate-800 bg-[#121316] flex flex-col p-4 space-y-4 overflow-y-auto shrink-0 text-xs">
          <div>
            <label className="text-slate-400 font-bold block mb-2">1. Chọn Kiểu Watermark (Chuẩn Ảnh Mẫu):</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: "W1", name: "Mini Badge", desc: "Ảnh mẫu W1" },
                { id: "W2", name: "Minimal Text", desc: "Ảnh mẫu W2 (@)" },
                { id: "W3", name: "Ribbon Badge", desc: "Ảnh mẫu W3" },
              ].map((w) => (
                <button
                  key={w.id}
                  onClick={() => {
                    setSelectedStyle(w.id as any);
                    if (w.id === "W1" && text === "Sợi Chỉ Biết Tuốt") setText("soichibiettuot");
                    if (w.id !== "W1" && text === "soichibiettuot") setText("Sợi Chỉ Biết Tuốt");
                  }}
                  className={`p-2.5 rounded-xl border text-center transition ${
                    selectedStyle === w.id
                      ? "bg-emerald-500/20 border-emerald-400 text-emerald-300 font-bold shadow-lg shadow-emerald-950/40"
                      : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white"
                  }`}
                >
                  <span className="block">{w.name}</span>
                  <span className="block text-[10px] opacity-75">{w.desc}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="border-t border-slate-800/80 pt-3 space-y-3">
            <div>
              <label className="text-slate-400 block mb-1">Nội dung text watermark:</label>
              <input
                type="text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white outline-none focus:border-emerald-400 font-bold"
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-slate-400">
                <span>Độ mờ / Độ đậm nhạt (Opacity):</span>
                <span className="text-emerald-400 font-mono font-bold">{Math.round(opacity * 100)}%</span>
              </div>
              <input
                type="range"
                min={0.1}
                max={1.0}
                step={0.05}
                value={opacity}
                onChange={(e) => setOpacity(Number(e.target.value))}
                className="w-full accent-emerald-500 h-1.5 bg-slate-800 rounded cursor-pointer"
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-slate-400">
                <span>Kích thước phóng to / thu nhỏ:</span>
                <span className="text-emerald-400 font-mono font-bold">{scale}x</span>
              </div>
              <input
                type="range"
                min={0.6}
                max={2.0}
                step={0.1}
                value={scale}
                onChange={(e) => setScale(Number(e.target.value))}
                className="w-full accent-emerald-500 h-1.5 bg-slate-800 rounded cursor-pointer"
              />
            </div>

            <div className="pt-2">
              <label className="text-slate-400 block mb-1">Nền xem thử:</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: "checker", label: "Trong Suốt" },
                  { id: "dark", label: "Nền Tối" },
                  { id: "light", label: "Nền Sáng" },
                ].map((bg) => (
                  <button
                    key={bg.id}
                    onClick={() => setPreviewBg(bg.id as any)}
                    className={`py-1.5 rounded-lg border text-center transition ${
                      previewBg === bg.id
                        ? "bg-emerald-500/20 border-emerald-400 text-emerald-300 font-bold"
                        : "bg-slate-900 border-slate-800 text-slate-400"
                    }`}
                  >
                    {bg.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* KHUNG XEM THỬ WATERMARK CHUẨN XÁC MẪU ẢNH GỐC */}
        <div
          className={`flex-1 flex items-center justify-center p-8 transition-colors ${
            previewBg === "dark"
              ? "bg-[#0b0c0e]"
              : previewBg === "light"
              ? "bg-slate-200"
              : "bg-[linear-gradient(45deg,#1e222b_25%,transparent_25%),linear-gradient(-45deg,#1e222b_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#1e222b_75%),linear-gradient(-45deg,transparent_75%,#1e222b_75%)] [background-size:20px_20px] bg-slate-950"
          }`}
        >
          <div
            ref={watermarkRef}
            style={{
              opacity: opacity,
              transform: `scale(${scale})`,
              transformOrigin: "center center",
            }}
            className="p-4 transition-all duration-150 inline-block"
          >
            {/* KIỂU W1: MINI BADGE (CHUẨN ẢNH GỐC) */}
            {selectedStyle === "W1" && (
              <div className="flex items-center gap-3 bg-[#1e222b]/95 backdrop-blur-md pl-1.5 pr-4 py-1.5 rounded-full border border-slate-700 shadow-2xl">
                <div className="w-8 h-8 rounded-full bg-[#f97316] p-0.5 border border-white/50 shrink-0 overflow-hidden flex items-center justify-center shadow">
                  <img src={mascotAvatar} alt="Avatar" className="w-full h-full object-contain" />
                </div>
                <div className="flex items-center gap-1.5 leading-none">
                  <span className="font-extrabold text-white text-sm tracking-wide">
                    {text}
                  </span>
                  <svg className="w-3.5 h-3.5 text-[#0095f6] fill-current shrink-0" viewBox="0 0 24 24">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15l-5-5 1.41-1.41L11 14.17l7.59-7.59L20 8l-9 9z"/>
                  </svg>
                </div>
              </div>
            )}

            {/* KIỂU W2: MINIMAL TEXT (CHUẨN ẢNH GỐC: @ VÀNG CÁCH ĐIỆU + 2 DÒNG HOẶC 1 DÒNG CHỮ ĐẬM) */}
            {selectedStyle === "W2" && (
              <div className="flex items-center gap-2.5 text-white font-black text-2xl drop-shadow-[0_2px_10px_rgba(0,0,0,0.9)]">
                <span className="font-mono text-[#f59e0b] text-3xl font-black drop-shadow-[0_0_8px_rgba(245,158,11,0.6)]">@</span>
                <span className="tracking-tight uppercase font-extrabold">{text}</span>
              </div>
            )}

            {/* KIỂU W3: DYNAMIC RIBBON (CHUẨN ẢNH GỐC: RUY BĂNG CAM CÓ VIỀN TRẮNG VÀ ĐUÔI TƯƠI) */}
            {selectedStyle === "W3" && (
              <div className="relative inline-flex items-center">
                {/* Đuôi ruy băng xanh lá ngầm phía sau */}
                <div className="absolute -bottom-1 -right-2 w-8 h-6 bg-[#16a34a] rounded-sm transform rotate-12 -z-10" />
                {/* Dải ruy băng chính */}
                <div className="px-5 py-2 bg-gradient-to-r from-[#ea580c] to-[#f97316] text-white font-black text-base rounded-2xl shadow-2xl border-2 border-white uppercase tracking-wider drop-shadow-xl transform rotate-[-2deg]">
                  {text}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default WatermarkStudio;
