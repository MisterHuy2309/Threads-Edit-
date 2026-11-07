"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Mic,
  Play,
  Pause,
  Plus,
  ScanText,
  Edit2,
  Check,
  Upload,
  Folder,
  Trash2,
  Loader2,
  Clock,
  AlertCircle,
  CheckCircle2,
  Sparkles
} from "lucide-react";
import { GeneratedVoiceItem } from "@/types";

interface VoiceTabProps {
  standaloneText: string;
  setStandaloneText: (v: string) => void;
  standaloneVoice: string;
  setStandaloneVoice: (v: string) => void;
  standaloneSpeed: number;
  setStandaloneSpeed: (v: number) => void;
  voices: Record<string, string>;
  isScanningOcr: boolean;
  isGeneratingTts: boolean;
  latestAudio: GeneratedVoiceItem | null;
  handleOcrToStandaloneText: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  handleGenerateStandaloneVoice: () => Promise<void>;
  handleAddLatestVoiceToTimeline: () => void;
  onAddManualVoiceToTimeline?: (voiceItem: { name: string; url: string; duration: number; path: string }) => void;
  currentTopic?: string;
  topics?: string[];
}

export const VoiceTab: React.FC<VoiceTabProps> = ({
  standaloneText,
  setStandaloneText,
  standaloneVoice,
  setStandaloneVoice,
  standaloneSpeed,
  setStandaloneSpeed,
  voices,
  isScanningOcr,
  isGeneratingTts,
  latestAudio,
  handleOcrToStandaloneText,
  handleGenerateStandaloneVoice,
  handleAddLatestVoiceToTimeline,
  onAddManualVoiceToTimeline,
  currentTopic = "general",
  topics = ["general"]
}) => {
  const API_BASE = "http://localhost:8000";
  const [subMode, setSubMode] = useState<"generator" | "library">("generator");
  const [voiceLibrary, setVoiceLibrary] = useState<any[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<string>(currentTopic || "general");
  const [playingUrl, setPlayingUrl] = useState<string | null>(null);
  const [audioTitle, setAudioTitle] = useState("");
  const [isEditingTitle, setIsEditingTitle] = useState(false);

  // Trạng thái tối ưu hóa trải nghiệm & chống Rate-limit
  const [cooldown, setCooldown] = useState(0);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileUploadRef = useRef<HTMLInputElement | null>(null);

  // Bộ đếm lùi Cooldown chống spam click
  useEffect(() => {
    if (cooldown > 0) {
      const timer = setTimeout(() => setCooldown((prev) => prev - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [cooldown]);

  // Tự đặt tên thoại bằng 6 từ đầu
  useEffect(() => {
    if (standaloneText) {
      const words = standaloneText.trim().split(/\s+/);
      const shortTitle = words.slice(0, 6).join(" ") + (words.length > 6 ? "..." : "");
      setAudioTitle(shortTitle);
    }
  }, [standaloneText]);

  // Tải danh sách voice từ kho lưu trữ
  const loadVoiceLibrary = () => {
    fetch(`${API_BASE}/api/tts/library?topic_name=${encodeURIComponent(selectedTopic)}`)
      .then((r) => r.json())
      .then((data) => setVoiceLibrary(Array.isArray(data) ? data : []))
      .catch(() => {});
  };

  useEffect(() => {
    loadVoiceLibrary();
  }, [selectedTopic, latestAudio]);

  const togglePlayAudio = (url: string) => {
    if (!audioRef.current) return;
    const finalUrl = url.startsWith("http") ? url : `${API_BASE}${url}`;
    if (playingUrl === finalUrl) {
      audioRef.current.pause();
      setPlayingUrl(null);
    } else {
      audioRef.current.src = finalUrl;
      audioRef.current
        .play()
        .then(() => setPlayingUrl(finalUrl))
        .catch(() => {});
    }
  };

  // Wrapper gọi hàm tạo giọng với khóa Cooldown & thông báo trạng thái
  const onTriggerGenerateVoice = async () => {
    if (!standaloneText.trim() || isGeneratingTts || cooldown > 0) return;

    setErrorMessage("");
    setStatusMessage("Đang kết nối hệ thống đọc...");

    try {
      await handleGenerateStandaloneVoice();
      setStatusMessage("Tạo âm thanh thành công!");
      // Khóa nút 3 giây sau khi hoàn tất để bảo vệ IP khỏi bị rate-limit
      setCooldown(3);
    } catch (err: any) {
      setErrorMessage("Đường truyền đang được cân bằng tải, vui lòng thử lại sau 3s...");
      setCooldown(4);
    } finally {
      setTimeout(() => {
        setStatusMessage("");
        setErrorMessage("");
      }, 4000);
    }
  };

  const handleUploadManualAudio = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return;
    const file = e.target.files[0];
    const fd = new FormData();
    fd.append("topic_name", selectedTopic);
    fd.append("file", file);

    try {
      await fetch(`${API_BASE}/api/tts/upload-manual`, { method: "POST", body: fd });
      loadVoiceLibrary();
    } catch {
      alert("Lỗi tải lên file voice thủ công!");
    } finally {
      e.target.value = "";
    }
  };

  const handleDeleteVoice = async (filename: string) => {
    if (!confirm("Xóa file voice này khỏi kho?")) return;
    try {
      await fetch(
        `${API_BASE}/api/tts/delete-voice?topic_name=${encodeURIComponent(selectedTopic)}&filename=${encodeURIComponent(filename)}`,
        { method: "DELETE" }
      );
      loadVoiceLibrary();
    } catch {
      alert("Lỗi khi xóa file!");
    }
  };

  // Tính toán ký tự tối ưu
  const charCount = standaloneText.length;
  const isOptimalLength = charCount >= 30 && charCount <= 250;
  const isTooLong = charCount > 300;

  return (
    <div className="flex flex-col h-full space-y-3 text-xs select-none overflow-hidden">
      {/* THANH CHUYỂN ĐỔI CHẾ ĐỘ: TẠO VOICE / KHO VOICE */}
      <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800 shrink-0">
        <button
          onClick={() => setSubMode("generator")}
          className={`flex-1 py-1.5 rounded flex items-center justify-center gap-1.5 font-medium transition ${
            subMode === "generator" ? "bg-amber-500 text-slate-950 font-bold shadow" : "text-slate-400 hover:text-white"
          }`}
        >
          <Mic size={13} /> Tạo Voice Mới
        </button>
        <button
          onClick={() => {
            setSubMode("library");
            loadVoiceLibrary();
          }}
          className={`flex-1 py-1.5 rounded flex items-center justify-center gap-1.5 font-medium transition ${
            subMode === "library" ? "bg-emerald-600 text-white font-bold shadow" : "text-slate-400 hover:text-white"
          }`}
        >
          <Folder size={13} /> Kho Voice Có Sẵn
        </button>
      </div>

      {/* CHẾ ĐỘ 1: TẠO VOICE MỚI TỰ ĐỘNG */}
      {subMode === "generator" && (
        <div className="flex-1 flex flex-col space-y-3 overflow-y-auto pr-1">
          {/* KHUNG NHẬP LIỆU */}
          <div className="space-y-1.5 shrink-0">
            <div className="flex justify-between items-center text-slate-400">
              <span className="font-medium text-slate-300 flex items-center gap-1">
                <Sparkles size={12} className="text-amber-400" />
                Nội dung thoại:
              </span>
              <div className="flex items-center gap-3">
                <span
                  className={`font-mono text-[10px] ${
                    isTooLong
                      ? "text-rose-400 font-bold"
                      : isOptimalLength
                      ? "text-emerald-400 font-semibold"
                      : "text-slate-500"
                  }`}
                >
                  {charCount}/250 ký tự
                </span>
                <label className="cursor-pointer text-amber-400 hover:text-amber-300 flex items-center gap-1 text-[11px] transition">
                  <ScanText size={12} />
                  <span>{isScanningOcr ? "Đang quét..." : "Quét OCR"}</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleOcrToStandaloneText}
                    className="hidden"
                    disabled={isScanningOcr}
                  />
                </label>
              </div>
            </div>

            <textarea
              value={standaloneText}
              onChange={(e) => setStandaloneText(e.target.value)}
              disabled={isGeneratingTts}
              placeholder="Nhập 1 - 2 câu hoàn chỉnh (VD: Áo sơ mi trắng form rộng, phối cùng quần tây tôn dáng lịch sự...)"
              rows={4}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-slate-200 outline-none focus:border-amber-400 resize-none leading-relaxed transition"
            />

            {isTooLong && (
              <p className="text-[11px] text-amber-400 flex items-center gap-1 pt-0.5">
                <AlertCircle size={11} className="shrink-0" />
                <span>Nên chia đoạn này thành 2 lần tạo để giọng đọc tự nhiên và tránh bị ngắt nhịp.</span>
              </p>
            )}
          </div>

          {/* CHỌN GIỌNG ĐỌC */}
          <div className="space-y-1 shrink-0">
            <label className="text-slate-400 font-medium block">Giọng đọc:</label>
            <select
              value={standaloneVoice}
              onChange={(e) => setStandaloneVoice(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-slate-200 outline-none focus:border-amber-400 cursor-pointer"
            >
              {Object.entries(voices).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {/* TỐC ĐỘ ĐỌC */}
          <div className="space-y-1 shrink-0">
            <div className="flex justify-between text-slate-400">
              <span>Tốc độ:</span>
              <span className="text-amber-400 font-mono">{standaloneSpeed}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={standaloneSpeed}
              onChange={(e) => setStandaloneSpeed(Number(e.target.value))}
              className="w-full accent-amber-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
            />
          </div>

          {/* THÔNG BÁO TIẾN TRÌNH */}
          {(statusMessage || errorMessage) && (
            <div className="text-[11px] px-1 py-0.5 transition-all">
              {statusMessage && (
                <span className="text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 size={12} />
                  {statusMessage}
                </span>
              )}
              {errorMessage && (
                <span className="text-amber-400 flex items-center gap-1">
                  <AlertCircle size={12} />
                  {errorMessage}
                </span>
              )}
            </div>
          )}

          {/* NÚT BẤM TẠO VOICE VỚI BỘ ĐẾM NGHỈ CHỐNG SPAM */}
          <button
            onClick={onTriggerGenerateVoice}
            disabled={isGeneratingTts || cooldown > 0 || !standaloneText.trim()}
            className={`w-full py-2.5 rounded-lg shadow-lg flex items-center justify-center gap-2 font-bold transition shrink-0 ${
              isGeneratingTts || cooldown > 0 || !standaloneText.trim()
                ? "bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700/60"
                : "bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 active:scale-[0.99]"
            }`}
          >
            {isGeneratingTts ? (
              <>
                <Loader2 size={14} className="animate-spin text-amber-300" />
                <span>Đang tạo & lưu cache...</span>
              </>
            ) : cooldown > 0 ? (
              <>
                <Clock size={14} className="text-slate-400" />
                <span>Hệ thống nghỉ ({cooldown}s)...</span>
              </>
            ) : (
              <>
                <Mic size={14} />
                <span>Tạo Voice (Lưu Kho)</span>
              </>
            )}
          </button>

          {/* KẾT QUẢ VOICE VỪA TẠO */}
          {latestAudio && (
            <div className="p-3 bg-slate-900 border border-emerald-500/50 rounded-xl space-y-2 shadow-lg shrink-0">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-emerald-400 font-semibold uppercase">
                  Voice Hoàn Tất ({latestAudio.duration}s)
                </span>
                <button
                  onClick={() => setIsEditingTitle(!isEditingTitle)}
                  className="text-slate-400 hover:text-amber-300 p-0.5 transition"
                >
                  {isEditingTitle ? <Check size={13} className="text-emerald-400" /> : <Edit2 size={13} />}
                </button>
              </div>

              {isEditingTitle ? (
                <input
                  type="text"
                  value={audioTitle}
                  onChange={(e) => setAudioTitle(e.target.value)}
                  className="w-full bg-slate-950 border border-amber-500/80 rounded px-2 py-1 text-xs text-amber-200 outline-none"
                  autoFocus
                />
              ) : (
                <p className="text-xs font-medium text-slate-200 italic line-clamp-2">
                  "{audioTitle || latestAudio.text.slice(0, 30)}..."
                </p>
              )}

              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={() => togglePlayAudio(latestAudio.audio_url)}
                  className="flex-1 py-1.5 bg-emerald-600/30 hover:bg-emerald-600/40 text-emerald-300 border border-emerald-500/40 rounded flex items-center justify-center gap-1.5 font-medium transition"
                >
                  {playingUrl === (latestAudio.audio_url.startsWith("http") ? latestAudio.audio_url : `${API_BASE}${latestAudio.audio_url}`) ? (
                    <Pause size={13} />
                  ) : (
                    <Play size={13} />
                  )}
                  <span>
                    {playingUrl === (latestAudio.audio_url.startsWith("http") ? latestAudio.audio_url : `${API_BASE}${latestAudio.audio_url}`)
                      ? "Dừng"
                      : "Nghe"}
                  </span>
                </button>
                <button
                  onClick={handleAddLatestVoiceToTimeline}
                  className="flex-1 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded flex items-center justify-center gap-1.5 font-bold transition shadow"
                >
                  <Plus size={13} />
                  <span>Gắn Timeline</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* CHẾ ĐỘ 2: KHO VOICE QUẢN LÝ THEO THƯ MỤC & FILE CÓ SẴN */}
      {subMode === "library" && (
        <div className="flex-1 flex flex-col min-h-0 space-y-2.5">
          {/* CHỌN THƯ MỤC CHỦ ĐỀ */}
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-slate-400">Thư mục:</span>
            <select
              value={selectedTopic}
              onChange={(e) => setSelectedTopic(e.target.value)}
              className="flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200 outline-none text-xs cursor-pointer"
            >
              {topics.map((t) => (
                <option key={t} value={t}>
                  📁 {t}
                </option>
              ))}
            </select>
          </div>

          {/* NÚT TẢI LÊN FILE VOICE THỦ CÔNG */}
          <div className="shrink-0 border border-dashed border-emerald-500/30 bg-emerald-950/10 rounded-lg p-2 text-center">
            <input
              type="file"
              ref={fileUploadRef}
              onChange={handleUploadManualAudio}
              accept="audio/*"
              className="hidden"
            />
            <button
              onClick={() => fileUploadRef.current?.click()}
              className="w-full py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 rounded flex items-center justify-center gap-1.5 font-medium transition"
            >
              <Upload size={13} /> Tải file Voice có sẵn (.mp3, .wav)
            </button>
          </div>

          {/* DANH SÁCH FILE VOICE TRONG KHO */}
          <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 min-h-0">
            {voiceLibrary.map((item, idx) => {
              const fullItemUrl = item.url.startsWith("http") ? item.url : `${API_BASE}${item.url}`;
              const isItemPlaying = playingUrl === fullItemUrl;

              return (
                <div
                  key={idx}
                  className="p-2 bg-slate-900 border border-slate-800 hover:border-emerald-500/80 rounded-lg flex items-center justify-between transition group"
                >
                  <div className="truncate flex-1 pr-2">
                    <span className="font-medium text-slate-200 block truncate text-xs">{item.name}</span>
                    <span className="text-[10px] text-emerald-400 font-mono">{item.duration}s</span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => togglePlayAudio(item.url)}
                      className="p-1.5 bg-slate-800 hover:bg-emerald-600 text-slate-300 hover:text-white rounded-full transition"
                      title={isItemPlaying ? "Dừng" : "Phát"}
                    >
                      {isItemPlaying ? <Pause size={12} /> : <Play size={12} />}
                    </button>

                    <button
                      onClick={() => {
                        if (onAddManualVoiceToTimeline) {
                          onAddManualVoiceToTimeline(item);
                        }
                      }}
                      title="Đưa voice vào Timeline"
                      className="p-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-full transition"
                    >
                      <Plus size={12} />
                    </button>

                    <button
                      onClick={() => handleDeleteVoice(item.id || item.name)}
                      title="Xóa voice"
                      className="p-1.5 opacity-0 group-hover:opacity-100 text-rose-400 hover:text-white transition"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              );
            })}

            {voiceLibrary.length === 0 && (
              <div className="text-center py-10 text-slate-600 italic">
                Thư mục chưa có file voice nào. Hãy tạo hoặc tải file lên!
              </div>
            )}
          </div>
        </div>
      )}

      {/* THẺ AUDIO ẨN ĐỂ PHÁT NHẠC */}
      <audio ref={audioRef} onEnded={() => setPlayingUrl(null)} className="hidden" />
    </div>
  );
};

export default VoiceTab;