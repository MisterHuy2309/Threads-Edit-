"use client";

import React, { useState, useRef } from "react";
import { ArrowLeft, Download, Sparkles, Type, Hash, Heart, MessageCircle, Send, Bookmark } from "lucide-react";

interface CoverMakerProps {
  onBack: () => void;
}

export const CoverMaker: React.FC<CoverMakerProps> = ({ onBack }) => {
  const [selectedTemplate, setSelectedTemplate] = useState<"M1" | "M2" | "M3">("M2");
  const coverPreviewRef = useRef<HTMLDivElement>(null);
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
    <div className="flex flex-col h-screen bg-slate-950 text-slate-100 font-sans select-none overflow-hidden">
      <header className="h-12 border-b border-slate-800 px-5 flex items-center justify-between bg-slate-900/90 shrink-0">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-xs font-semibold text-slate-300 hover:text-white px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg transition"
        >
          <ArrowLeft size={14} /> Quay lại Video Editor
        </button>

        <span className="text-xs font-bold bg-gradient-to-r from-amber-400 to-rose-400 bg-clip-text text-transparent flex items-center gap-1.5">
          <Sparkles size={14} className="text-amber-400" /> STUDIO THIẾT KẾ ẢNH BÌA VIDEO 9:16
        </span>

        <button
          onClick={handleDownloadCover}
          disabled={isExporting}
          className="flex items-center gap-2 text-xs font-bold px-4 py-1.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 rounded-lg shadow-lg active:scale-95 transition disabled:opacity-50"
        >
          <Download size={14} /> {isExporting ? "Đang xuất PNG..." : "Tải Ảnh Bìa PNG (1080x1920)"}
        </button>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* PANEL TRÁI */}
        <div className="w-[380px] border-r border-slate-800 bg-[#121316] flex flex-col p-4 space-y-4 overflow-y-auto shrink-0 text-xs">
          <div>
            <label className="text-slate-400 font-bold block mb-2">1. Chọn Mẫu Bìa Chuẩn:</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: "M1", name: "Mẫu 1", desc: "Pop-Art" },
                { id: "M2", name: "Mẫu 2", desc: "Drama Post" },
                { id: "M3", name: "Mẫu 3", desc: "Minimalist" },
              ].map((tpl) => (
                <button
                  key={tpl.id}
                  onClick={() => setSelectedTemplate(tpl.id as any)}
                  className={`p-2.5 rounded-xl border flex flex-col items-center justify-center transition ${
                    selectedTemplate === tpl.id
                      ? "bg-amber-500/20 border-amber-400 text-amber-300 shadow-lg shadow-amber-950/40 font-bold"
                      : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white"
                  }`}
                >
                  <span>{tpl.name}</span>
                  <span className="text-[10px] opacity-75">{tpl.desc}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="border-t border-slate-800/80 pt-3 space-y-3">
            <span className="text-slate-300 font-bold block flex items-center gap-1.5">
              <Type size={13} className="text-amber-400" /> 2. Điền nội dung cho {selectedTemplate}:
            </span>

            {/* FORM MẪU 2 CHUẨN */}
            {selectedTemplate === "M2" && (
              <div className="space-y-2.5">
                <div>
                  <label className="text-slate-400 block mb-1">Tên tài khoản Threads:</label>
                  <input
                    type="text"
                    value={m2Author}
                    onChange={(e) => setM2Author(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-slate-100 outline-none focus:border-amber-400 font-mono text-xs"
                  />
                </div>

                <div>
                  <label className="text-slate-400 block mb-1">Nội dung câu nói / Drama chính:</label>
                  <textarea
                    value={m2Content}
                    onChange={(e) => setM2Content(e.target.value)}
                    rows={3}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-slate-100 outline-none focus:border-amber-400 font-medium leading-snug"
                  />
                </div>

                <div>
                  <label className="text-slate-400 block mb-1">Số lượt thích (Likes):</label>
                  <input
                    type="text"
                    value={m2Likes}
                    onChange={(e) => setM2Likes(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-slate-100 outline-none focus:border-amber-400 font-mono text-xs"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div>
                    <label className="text-slate-400 block mb-1 flex items-center gap-1">
                      <Hash size={11} className="text-amber-400" /> Hashtag 1:
                    </label>
                    <input
                      type="text"
                      value={m2Tag1}
                      onChange={(e) => setM2Tag1(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-amber-300 font-bold outline-none focus:border-amber-400 uppercase text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 block mb-1 flex items-center gap-1">
                      <Hash size={11} className="text-amber-400" /> Hashtag 2:
                    </label>
                    <input
                      type="text"
                      value={m2Tag2}
                      onChange={(e) => setM2Tag2(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-amber-300 font-bold outline-none focus:border-amber-400 uppercase text-xs"
                    />
                  </div>
                </div>
              </div>
            )}

            {selectedTemplate === "M1" && (
              <div className="space-y-2">
                <label className="text-slate-400 block">Tiêu đề bong bóng chat:</label>
                <textarea
                  value={m1Title}
                  onChange={(e) => setM1Title(e.target.value)}
                  rows={3}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-slate-100 outline-none focus:border-amber-400 font-semibold uppercase leading-snug"
                />
              </div>
            )}

            {selectedTemplate === "M3" && (
              <div className="space-y-2.5">
                <div>
                  <label className="text-slate-400 block mb-1">Tiêu đề lớn phía trên:</label>
                  <input
                    type="text"
                    value={m3MainTitle}
                    onChange={(e) => setM3MainTitle(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-slate-100 outline-none focus:border-amber-400 font-bold uppercase"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Câu dẫn phụ (Ruy băng):</label>
                  <input
                    type="text"
                    value={m3SubTitle}
                    onChange={(e) => setM3SubTitle(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-slate-100 outline-none focus:border-amber-400 font-medium"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* KHUNG PREVIEW TRUNG TÂM */}
        <div className="flex-1 bg-slate-950 flex flex-col items-center justify-center p-4 overflow-auto">
          <div
            ref={coverPreviewRef}
            style={{ width: "320px", height: "568px" }}
            className="relative rounded-2xl overflow-hidden shadow-2xl border-4 border-slate-800 shrink-0 select-none bg-black"
          >
            {/* MẪU 2: DRAMA POST */}
            {selectedTemplate === "M2" && (
              <div className="w-full h-full bg-[#101217] relative flex flex-col justify-between p-4 overflow-hidden">
                {/* THREADS POST CARD */}
                <div className="relative z-10 bg-[#1e222b] border border-slate-700/80 rounded-2xl p-4 shadow-2xl space-y-2.5 mt-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-[#f97316] p-0.5 border border-white/40 shadow-sm shrink-0 overflow-hidden flex items-center justify-center">
                        <img
                          src={mascotCandidatesM1[0]}
                          data-try-idx="0"
                          onError={(e) => handleImgFallback(e, mascotCandidatesM1)}
                          className="w-full h-full object-contain"
                        />
                      </div>
                      
                      <div className="flex items-center gap-1.5 leading-none">
                        <span className="text-white font-extrabold text-xs tracking-tight">
                          {m2Author}
                        </span>
                        <svg className="w-3.5 h-3.5 text-[#0095f6] fill-current shrink-0" viewBox="0 0 24 24">
                          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15l-5-5 1.41-1.41L11 14.17l7.59-7.59L20 8l-9 9z"/>
                        </svg>
                      </div>
                    </div>

                    <span className="text-slate-400 font-mono text-sm leading-none font-bold">@</span>
                  </div>

                  <p className="text-slate-100 font-black text-[13px] leading-snug line-clamp-3">
                    {m2Content}
                  </p>

                  <div className="flex items-center gap-3 pt-0.5 text-slate-400">
                    <Heart size={14} className="text-rose-500 fill-rose-500" />
                    <MessageCircle size={14} />
                    <Send size={14} />
                    <Bookmark size={14} className="ml-auto" />
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono block pt-0.5">{m2Likes}</span>
                </div>

                {/* VÙNG DƯỚI: KHỦNG LONG M2 & HASHTAG */}
                <div className="relative z-10 flex items-end justify-between -mb-4">
                  <div className="w-44 h-44 -ml-4 -mb-1 relative flex items-end overflow-hidden pointer-events-none">
                    <img
                      src={mascotCandidatesM2[0]}
                      data-try-idx="0"
                      onError={(e) => handleImgFallback(e, mascotCandidatesM2)}
                      alt="Mascot M2"
                      style={{ mixBlendMode: "multiply" }}
                      className="w-full h-full object-contain drop-shadow-2xl"
                    />
                  </div>

                  <div className="space-y-2 pb-10 pr-2 flex flex-col items-end">
                    {m2Tag1 && (
                      <div className="px-4 py-1.5 bg-[#ea580c] text-white font-black rounded-full text-[11px] shadow-lg border border-orange-400/50 uppercase tracking-wider">
                        #{m2Tag1}
                      </div>
                    )}
                    {m2Tag2 && (
                      <div className="px-4 py-1.5 bg-[#ea580c] text-white font-black rounded-full text-[11px] shadow-lg border border-orange-400/50 uppercase tracking-wider">
                        #{m2Tag2}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* MẪU 1: POP ART */}
            {selectedTemplate === "M1" && (
              <div className="w-full h-full bg-gradient-to-b from-[#ff8a3d] via-[#f97316] to-[#ea580c] relative flex flex-col items-center justify-between p-4 overflow-hidden">
                <div className="absolute inset-0 opacity-15 bg-[radial-gradient(#fff_2px,transparent_2px)] [background-size:16px_16px] pointer-events-none" />
                <div className="relative z-10 w-full mt-4 bg-white rounded-2xl p-3 shadow-xl border-2 border-black rotate-[-1deg]">
                  <h2 className="text-black font-extrabold text-sm text-center leading-snug tracking-tight">
                    {m1Title}
                  </h2>
                  <div className="absolute -bottom-2 left-10 w-4 h-4 bg-white border-r-2 border-b-2 border-black transform rotate-45" />
                </div>
                <div className="relative z-10 my-auto flex flex-col items-center">
                  <img
                    src={mascotCandidatesM1[0]}
                    data-try-idx="0"
                    onError={(e) => handleImgFallback(e, mascotCandidatesM1)}
                    alt="Mascot M1"
                    className="w-48 h-48 object-contain drop-shadow-[0_10px_20px_rgba(0,0,0,0.35)]"
                  />
                </div>
                <div className="relative z-10 mb-2 bg-black/85 backdrop-blur px-3 py-1 rounded-full border border-white/40 text-[10px] font-bold text-amber-300">
                  @soichibiettuot • Threads Channel
                </div>
              </div>
            )}

            {/* MẪU 3: MINIMALIST */}
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
