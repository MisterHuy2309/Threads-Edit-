"use client";

import React, { useState, useRef } from "react";
import { CheckCircle2, Download, Save } from "lucide-react";

interface CoverMakerProps {
  onBack: () => void;
  onCoverSaved?: (coverUrl: string) => void;
}

export const CoverMaker: React.FC<CoverMakerProps> = ({ onBack, onCoverSaved }) => {
  const API_BASE = "http://localhost:8000";
  const coverRef = useRef<HTMLDivElement | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<"M1" | "M2" | "M3">("M2");
  const [isExporting, setIsExporting] = useState(false);
  const [savedSuccessMsg, setSavedSuccessMsg] = useState<string>("");

  const [m3MainTitle, setM3MainTitle] = useState("CÁI KẾT BẤT NGỜ...");
  const [m3SubTitle, setM3SubTitle] = useState("Có ai dám thử chưa?");

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
      target.src =
        "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'><circle cx='100' cy='100' r='95' fill='%2322c55e'/><circle cx='70' cy='80' r='12' fill='%23000'/><circle cx='130' cy='80' r='12' fill='%23000'/><path d='M60 120 Q100 160 140 120' stroke='%23000' stroke-width='8' fill='%23ef4444'/></svg>";
    }
  };

  // Hàm vẽ Canvas 1080x1920 trực tiếp đảm bảo 100% không bao giờ lỗi CORS hay html2canvas
  const renderCoverToDataUrl = async (): Promise<string> => {
    const canvas = document.createElement("canvas");
    canvas.width = 1080;
    canvas.height = 1920;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Không khởi tạo được Canvas 2D");

    // 1. Vẽ nền theo đúng mẫu M1, M2, M3
    if (selectedTemplate === "M1") {
      const grad = ctx.createLinearGradient(0, 0, 0, 1920);
      grad.addColorStop(0, "#f97316");
      grad.addColorStop(0.5, "#e11d48");
      grad.addColorStop(1, "#020617");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 1080, 1920);
    } else if (selectedTemplate === "M2") {
      ctx.fillStyle = "#121316";
      ctx.fillRect(0, 0, 1080, 1920);
      ctx.strokeStyle = "#1e293b";
      ctx.lineWidth = 12;
      ctx.strokeRect(6, 6, 1068, 1908);
    } else {
      const grad = ctx.createLinearGradient(0, 0, 0, 1920);
      grad.addColorStop(0, "#fed7aa");
      grad.addColorStop(0.5, "#fde047");
      grad.addColorStop(1, "#fdba74");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 1080, 1920);
    }

    // 2. Vẽ Tiêu Đề Chính (Tự động xuống dòng chuẩn 9:16)
    ctx.save();
    ctx.font = "900 76px Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillStyle = selectedTemplate === "M1" ? "#ffffff" : selectedTemplate === "M2" ? "#34d399" : "#090d16";

    const words = (m3MainTitle || "").toUpperCase().split(/\s+/);
    const lines: string[] = [];
    let curLine = "";
    for (const w of words) {
      const testLine = curLine ? `${curLine} ${w}` : w;
      if (ctx.measureText(testLine).width > 920 && curLine) {
        lines.push(curLine);
        curLine = w;
      } else {
        curLine = testLine;
      }
    }
    if (curLine) lines.push(curLine);

    let yPos = 190;
    for (const line of lines.slice(0, 5)) {
      ctx.fillText(line, 540, yPos);
      yPos += 96;
    }
    ctx.restore();

    // 3. Vẽ Vòng tròn Mascot ở trung tâm
    const centerX = 540;
    const centerY = 980;
    const radius = 270;

    ctx.save();
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.fillStyle = selectedTemplate === "M2" ? "#0f172a" : "rgba(255,255,255,0.35)";
    ctx.fill();
    ctx.lineWidth = 14;
    ctx.strokeStyle = selectedTemplate === "M2" ? "#10b981" : "#ffffff";
    ctx.stroke();
    ctx.clip();

    const imgEl = coverRef.current?.querySelector("img") as HTMLImageElement | null;
    if (imgEl) {
      try {
        const proxyImg = new Image();
        proxyImg.crossOrigin = "anonymous";
        await new Promise<void>((resolve) => {
          proxyImg.onload = () => resolve();
          proxyImg.onerror = () => resolve();
          proxyImg.src = imgEl.src;
        });
        if (proxyImg.width > 0) {
          ctx.drawImage(proxyImg, centerX - radius, centerY - radius, radius * 2, radius * 2);
        }
      } catch {}
    }
    ctx.restore();

    // 4. Vẽ Khung Tiêu Đề Phụ phía dưới
    const subText = m3SubTitle || "";
    ctx.save();
    const boxW = 860;
    const boxH = 120;
    const boxX = (1080 - boxW) / 2;
    const boxY = 1580;

    ctx.fillStyle = selectedTemplate === "M2" ? "#0f172a" : "#ffffff";
    ctx.strokeStyle = selectedTemplate === "M2" ? "#10b981" : "#f97316";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.roundRect(boxX, boxY, boxW, boxH, 32);
    ctx.fill();
    ctx.stroke();

    ctx.font = "800 44px Arial, sans-serif";
    ctx.fillStyle = selectedTemplate === "M2" ? "#6ee7b7" : "#0f172a";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(subText, 540, boxY + boxH / 2);
    ctx.restore();

    return canvas.toDataURL("image/png", 1.0);
  };

  const handleSaveAndDownloadCover = async (downloadToPc: boolean = true) => {
    if (isExporting) return;
    setIsExporting(true);
    setSavedSuccessMsg("");
    try {
      const dataUrl = await renderCoverToDataUrl();

      // 1. Lưu lên Backend vào media/covers/latest_cover.png để sẵn sàng gắn vào bài Facebook
      const res = await fetch(`${API_BASE}/api/facebook/save-cover`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image_base64: dataUrl,
          template: selectedTemplate,
          title: m3MainTitle,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Lỗi lưu ảnh bìa lên server");
      }

      if (onCoverSaved && data.latest_cover_url) {
        onCoverSaved(data.latest_cover_url);
      }
      localStorage.setItem("threads_latest_cover_url", data.latest_cover_url || data.cover_url);

      // 2. Tải file PNG về máy tính nếu người dùng bấm Tải & Lưu
      if (downloadToPc) {
        const link = document.createElement("a");
        link.download = data.filename || `cover_threads_${selectedTemplate}_${Date.now()}.png`;
        link.href = dataUrl;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }

      setSavedSuccessMsg("Đã lưu ảnh bìa vào hệ thống & tải về máy thành công!");
    } catch (err: any) {
      alert("Lỗi khi lưu ảnh bìa: " + (err?.message || err));
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
          {savedSuccessMsg && (
            <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1 bg-emerald-950/60 border border-emerald-500/40 px-2.5 py-1 rounded-full">
              <CheckCircle2 size={13} /> {savedSuccessMsg}
            </span>
          )}
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
            onClick={() => handleSaveAndDownloadCover(false)}
            disabled={isExporting}
            className="px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 font-bold text-xs transition shadow flex items-center gap-1.5 disabled:opacity-50"
          >
            <Save size={14} />
            {isExporting ? "Đang Lưu..." : "Lưu Làm Ảnh Bìa FB"}
          </button>

          <button
            onClick={() => handleSaveAndDownloadCover(true)}
            disabled={isExporting}
            className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-bold text-xs transition shadow flex items-center gap-1.5 disabled:opacity-50"
          >
            <Download size={14} />
            {isExporting ? "Đang Xuất Ảnh..." : "Tải Về & Lưu Ảnh Cover"}
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

          <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 text-[11px] text-slate-400 space-y-1.5 leading-relaxed">
            <p className="text-amber-300 font-bold">💡 Cơ chế đồng bộ tự động:</p>
            <p>Khi bạn bấm <b>"Tải Về & Lưu Ảnh Cover"</b> hoặc <b>"Lưu Làm Ảnh Bìa FB"</b>, ảnh bìa sẽ vừa tải xuống máy vừa tự động gắn làm ảnh bìa mặc định trong Form duyệt đăng Facebook sau khi Render.</p>
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
