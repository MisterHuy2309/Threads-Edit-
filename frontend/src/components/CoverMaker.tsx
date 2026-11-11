"use client";

import React, { useState, useRef } from "react";
import { ArrowLeft, Download, Sparkles, Type, Hash, Heart, MessageCircle, Send, Bookmark } from "lucide-react";

interface CoverMakerProps {
  onBack: () => void;
}

export const CoverMaker: React.FC<CoverMakerProps> = ({ onBack }) => {
  const coverRef = useRef<HTMLDivElement | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<"M1" | "M2" | "M3">("M2");
  const coverPreviewRef = useRef<HTMLDivElement>(null);
    const handleExportCover = typeof handleExport !== "undefined" ? handleExport : async () => {
    alert("Chức năng tải ảnh cover!");
  };

  const [isExporting, setIsExporting] = useState(false);

  const [m1Title, setM1Title] = useState("TIÊU ĐỀ NÓNG HỔI TRÊN THREADS!");
  
  const [m2Author, setM2Author] = useState("soichibiettuot");
  const [m2Content, setM2Content] = useState("CHUYỆN CHƯA KỂ VỀ DRAMA HÔM NAY...");
  const [m2Likes, setM2Likes] = useState("1,133 likes");
  const [m2Tag1, setM2Tag1] = useState("DRAMA");
  const [m2Tag2, setM2Tag2] = useState("TÂM_SỰ");

  const [m3MainTitle, setM3MainTitle] = useState("CÁI KẾT BẤT NGỜ...");
  const [m3SubTitle, setM3SubTitle] = useState("Có ai dám thử chưa?");

  // Hỗ trợ tự động fallback tìm ảnh nếu tên file là .jpg hay .png
  const mascotCandidatesM1 = [
    "http://localhost:8000/media/mascots/mascot_m1.png",
    "http://localhost:8000/media/mascots/mascot_m1.jpg",
    "http://localhost:8000/media/meme_images/mascot_m1.png",
    "/mascot_m1.png"
  ];
  const mascotCandidatesM2 = [
    "http://localhost:8000/media/mascots/mascot_m2.png",
    "http://localhost:8000/media/mascots/mascot_m2.jpg",
    "http://localhost:8000/media/meme_images/mascot_m2.png",
    "/mascot_m2.png"
  ];
  const mascotCandidatesM3 = [
    "http://localhost:8000/media/mascots/mascot_m3.png",
    "http://localhost:8000/media/mascots/mascot_m3.jpg",
    "http://localhost:8000/media/meme_images/mascot_m3.png",
    "/mascot_m3.png"
  ];

  const handleImgFallback = (e: React.SyntheticEvent<HTMLImageElement, Event>, candidates: string[]) => {
    const target = e.currentTarget;
    const curIdx = Number(target.getAttribute("data-try-idx") || "0");
    if (curIdx < candidates.length - 1) {
      const nextIdx = curIdx + 1;
      target.setAttribute("data-try-idx", String(nextIdx));
      target.src = candidates[nextIdx];
    } else {
      // Nếu không tìm thấy file nào trên ổ đĩa, tạo hình chú khủng long placeholder SVG
      target.src = "data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 200 200\'><circle cx=\'100\' cy=\'100\' r=\'95\' fill=\'%2322c55e\'/><circle cx=\'70\' cy=\'80\' r=\'12\' fill=\'%23000\'/><circle cx=\'130\' cy=\'80\' r=\'12\' fill=\'%23000\'/><path d=\'M60 120 Q100 160 140 120\' stroke=\'%23000\' stroke-width=\'8\' fill=\'%23ef4444\'/></svg>";
    }
  };

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

  const convertImgToBase64 = async (url: string): Promise<string> => {
    try {
      const res = await fetch(url + (url.includes("?") ? "&" : "?") + "v=" + Date.now());
      const blob = await res.blob();
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = () => resolve(url);
        reader.readAsDataURL(blob);
      });
    } catch {
      return url;
    }
  };

  const handleDownloadCover = async () => {
    if (!coverPreviewRef.current || isExporting) return;
    setIsExporting(true);
    try {
      const html2canvas = await loadHtml2CanvasScript();
      if (!html2canvas) {
        alert("Chưa nạp được trình xuất ảnh!");
        return;
      }

      const imgs = coverPreviewRef.current.querySelectorAll("img");
      const originalSrcs: string[] = [];
      for (let i = 0; i < imgs.length; i++) {
        const img = imgs[i];
        originalSrcs.push(img.src);
        if (img.src && !img.src.startsWith("data:")) {
          const b64 = await convertImgToBase64(img.src);
          img.src = b64;
        }
      }

      const canvas = await html2canvas(coverPreviewRef.current, {
        scale: 3.375,
        useCORS: true,
        backgroundColor: "#101217",
        logging: false,
      });

      for (let i = 0; i < imgs.length; i++) {
        imgs[i].src = originalSrcs[i];
      }

      canvas.toBlob((blob: Blob | null) => {
        if (!blob) {
          alert("Lỗi tạo ảnh PNG!");
          return;
        }
        const fileUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.download = `cover_threads_${selectedTemplate}_${Date.now()}.png`;
        link.href = fileUrl;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(fileUrl), 2000);
      }, "image/png", 1.0);

    } catch (err: any) {
      alert("Lỗi xuất ảnh: " + (err?.message || err));
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-[#0d0e12] text-slate-100 select-none overflow-hidden">
      {/* HEADER COVER MAKER */}
      <div className="h-14 border-b border-slate-800 bg-[#16181d] px-6 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition"
          >
            ← Quay Lại Editor
          </button>
          <span className="text-sm font-bold text-slate-100">Cover Maker Studio (9:16)</span>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex bg-slate-900 border border-slate-800 rounded-lg p-1">
            {(["M1", "M2", "M3"] as const).map((tmpl) => (
              <button
                key={tmpl}
                onClick={() => setSelectedTemplate(tmpl)}
                className={`px-3 py-1 rounded-md text-xs font-bold transition ${
                  selectedTemplate === tmpl
                    ? "bg-rose-600 text-white shadow"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Mẫu {tmpl}
              </button>
            ))}
          </div>

          <button
            onClick={handleExportCover}
            disabled={isExporting}
            className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-bold text-xs transition shadow flex items-center gap-1.5 disabled:opacity-50"
          >
            {isExporting ? "Đang Xuất Ảnh..." : "Tải Ảnh Cover"}
          </button>
        </div>
      </div>

      {/* WORKSPACE */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* PANEL CÀI ĐẶT BÊN TRÁI */}
        <div className="w-[360px] border-r border-slate-800 bg-[#121316] p-4 flex flex-col gap-4 overflow-y-auto">
          <div>
            <label className="text-xs font-semibold text-slate-400 block mb-1.5">Tiêu Đề Chính:</label>
            <textarea
              value={m3MainTitle}
              onChange={(e) => setM3MainTitle(e.target.value)}
              rows={3}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-rose-500 resize-none font-bold"
              placeholder="Nhập tiêu đề chính cho cover..."
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-400 block mb-1.5">Tiêu Đề Phụ / Tác Giả:</label>
            <input
              type="text"
              value={m3SubTitle}
              onChange={(e) => setM3SubTitle(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-2 text-xs text-slate-200 focus:outline-none focus:border-rose-500 font-semibold"
              placeholder="Nhập tiêu đề phụ..."
            />
          </div>
        </div>

        {/* KHUNG PREVIEW TRUNG TÂM */}
        <div className="flex-1 flex items-center justify-center p-4 bg-[#0a0b0e] overflow-hidden">
          <div
            ref={coverRef}
            className="w-[320px] h-[568px] rounded-2xl shadow-2xl relative overflow-hidden flex flex-col justify-between select-none"
          >
            {/* MẪU 1: VIBRANT GRADIENT */}
            {selectedTemplate === "M1" && (
              <div className="w-full h-full bg-gradient-to-b from-orange-500 via-rose-600 to-slate-950 p-6 flex flex-col justify-between items-center text-center">
                <h1 className="text-white font-black text-2xl uppercase tracking-tight drop-shadow-md">
                  {m3MainTitle}
                </h1>
                <div className="w-40 h-40 rounded-full border-4 border-white/90 bg-white/30 backdrop-blur-sm p-1 shadow-2xl overflow-hidden flex items-center justify-center">
                  <img
                    src={mascotCandidatesM3[0]}
                    data-try-idx="0"
                    onError={(e) => handleImgFallback(e, mascotCandidatesM3)}
                    alt="Mascot M1"
                    className="w-full h-full object-contain rounded-full"
                  />
                </div>
                <div className="bg-white/90 border border-white rounded-xl py-1.5 px-4 shadow">
                  <span className="text-slate-900 font-black text-xs uppercase">{m3SubTitle}</span>
                </div>
              </div>
            )}

            {/* MẪU 2: DARK MINIMALIST */}
            {selectedTemplate === "M2" && (
              <div className="w-full h-full bg-[#121316] border-2 border-slate-800 p-6 flex flex-col justify-between items-center text-center">
                <h1 className="text-emerald-400 font-black text-xl uppercase tracking-tight drop-shadow">
                  {m3MainTitle}
                </h1>
                <div className="w-40 h-40 rounded-full border-4 border-emerald-500/80 bg-slate-900 p-1 shadow-2xl overflow-hidden flex items-center justify-center">
                  <img
                    src={mascotCandidatesM3[0]}
                    data-try-idx="0"
                    onError={(e) => handleImgFallback(e, mascotCandidatesM3)}
                    alt="Mascot M2"
                    className="w-full h-full object-contain rounded-full"
                  />
                </div>
                <div className="bg-slate-900/90 border border-emerald-500/40 rounded-xl py-1.5 px-4 shadow">
                  <span className="text-emerald-300 font-bold text-xs">{m3SubTitle}</span>
                </div>
              </div>
            )}

            {/* MẪU 3: MINIMALIST WARM */}
            {selectedTemplate === "M3" && (
              <div className="w-full h-full bg-gradient-to-b from-[#fed7aa] via-[#fde047]/60 to-[#fdba74] relative flex flex-col items-center justify-between p-4 overflow-hidden">
                <div className="relative z-10 w-full mt-4 text-center">
                  <h1 className="text-slate-950 font-black text-xl uppercase tracking-tight leading-tight">
                    {m3MainTitle}
                  </h1>
                </div>
                <div className="relative z-10 my-auto">
                  <div className="w-40 h-40 rounded-full border-4 border-white/90 bg-white/40 backdrop-blur-sm p-1 shadow-2xl flex items-center justify-center overflow-hidden">
                    <img
                      src={mascotCandidatesM3[0]}
                      data-try-idx="0"
                      onError={(e) => handleImgFallback(e, mascotCandidatesM3)}
                      alt="Mascot M3"
                      className="w-full h-full object-contain rounded-full"
                    />
                  </div>
                </div>
                <div className="relative z-10 w-full mb-3 bg-white/95 border-2 border-orange-500 rounded-xl py-1.5 px-3 text-center shadow-lg">
                  <span className="text-orange-950 font-extrabold text-xs block">
                    {m3SubTitle}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CoverMaker;
