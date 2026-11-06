"use client";

import React, { useRef } from "react";
import { 
  Volume2, VolumeX, Volume1, Sliders, Music, Mic, RotateCcw, Play, Pause, Sparkles
} from "lucide-react";
import { TimelineBlock, TimelineAudioItem, VoiceItem, BgClipItem } from "@/types";

export interface InspectorProps {
  inspectorTab: "video" | "audio";
  setInspectorTab: (tab: "video" | "audio") => void;
  // Các block đang được chọn
  activeBlock: TimelineBlock | null;
  setBlocks?: React.Dispatch<React.SetStateAction<TimelineBlock[]>>;
  activeAudioItem?: TimelineAudioItem | null;
  onUpdateAudioItem?: (id: string, updatedProps: Partial<TimelineAudioItem>) => void;
  activeVoiceItem?: VoiceItem | null;
  onUpdateVoiceItem?: (id: string, updatedProps: Partial<VoiceItem>) => void;
  activeBgClip?: BgClipItem | null;
  onUpdateBgClip?: (id: string, updatedProps: Partial<BgClipItem>) => void;
  handleUpdateBlockVoice?: (blockId: string, updatedProps: Partial<TimelineBlock>) => Promise<void>;
  voices: Record<string, string>;
}

export const Inspector: React.FC<InspectorProps> = ({
  inspectorTab,
  setInspectorTab,
  activeBlock,
  setBlocks,
  activeAudioItem,
  onUpdateAudioItem,
  activeVoiceItem,
  onUpdateVoiceItem,
  activeBgClip,
  onUpdateBgClip,
  handleUpdateBlockVoice,
  voices,
}) => {
  const audioPreviewRef = useRef<HTMLAudioElement | null>(null);
  const [isPlayingPreview, setIsPlayingPreview] = React.useState<boolean>(false);

  const togglePreview = (url: string) => {
    if (!audioPreviewRef.current) return;
    if (isPlayingPreview) {
      audioPreviewRef.current.pause();
      setIsPlayingPreview(false);
    } else {
      audioPreviewRef.current.src = url;
      audioPreviewRef.current.play().then(() => setIsPlayingPreview(true)).catch(() => {});
    }
  };

  // 1. NẾU ĐANG CHỌN BLOCK TRÊN TRACK NHẠC & FX (BGM HOẶC MEME SOUND)
  if (activeAudioItem) {
    const vol = activeAudioItem.volume !== undefined ? activeAudioItem.volume : 100;
    const isMeme = activeAudioItem.type === "sound_effect";

    return (
      <div className="w-[320px] border-l border-slate-800 bg-[#121316] flex flex-col shrink-0 select-none text-xs">
        <div className="h-10 px-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/60 font-medium">
          <span className="text-slate-200 flex items-center gap-1.5 font-semibold">
            {isMeme ? <Volume2 size={14} className="text-emerald-400" /> : <Music size={14} className="text-indigo-400" />}
            {isMeme ? "Cài Đặt Meme Sound" : "Cài Đặt Nhạc Nền (BGM)"}
          </span>
          <span className="text-[10px] text-slate-500 font-mono">{activeAudioItem.duration}s</span>
        </div>

        <div className="flex-1 p-4 space-y-4 overflow-y-auto">
          {/* TÊN FILE & NGHE THỬ */}
          <div className="p-3 bg-slate-900/90 border border-slate-800 rounded-xl space-y-2">
            <span className="text-[11px] text-slate-400 block font-medium">Tên file âm thanh:</span>
            <p className="text-slate-200 font-semibold truncate text-xs">{activeAudioItem.name}</p>

            <button
              onClick={() => togglePreview(activeAudioItem.url)}
              className="w-full mt-2 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded flex items-center justify-center gap-1.5 transition font-medium"
            >
              {isPlayingPreview ? <Pause size={13} /> : <Play size={13} />}
              <span>{isPlayingPreview ? "Tạm dừng nghe thử" : "Nghe thử file âm thanh"}</span>
            </button>
          </div>

          {/* THANH TRƯỢT CHỈNH ÂM LƯỢNG (0% - 200%) */}
          <div className="p-3.5 bg-slate-900/90 border border-slate-800 rounded-xl space-y-3">
            <div className="flex items-center justify-between text-slate-300">
              <span className="font-semibold flex items-center gap-1.5">
                {vol === 0 ? <VolumeX size={14} className="text-rose-400" /> : vol > 100 ? <Volume2 size={14} className="text-amber-400" /> : <Volume1 size={14} className="text-cyan-400" />}
                Âm lượng (Volume)
              </span>
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-cyan-400 font-bold text-xs">{vol}%</span>
                <button
                  onClick={() => onUpdateAudioItem && onUpdateAudioItem(activeAudioItem.id, { volume: 100 })}
                  title="Đặt lại 100%"
                  className="p-1 hover:bg-slate-800 text-slate-500 hover:text-white rounded transition"
                >
                  <RotateCcw size={11} />
                </button>
              </div>
            </div>

            <input
              type="range"
              min={0}
              max={200}
              step={1}
              value={vol}
              onChange={(e) => {
                if (onUpdateAudioItem) {
                  onUpdateAudioItem(activeAudioItem.id, { volume: Number(e.target.value) });
                }
              }}
              className="w-full accent-cyan-500 h-1.5 bg-slate-800 rounded cursor-pointer"
            />

            {/* CÁC PHÍM TẮT MỨC ÂM LƯỢNG NHANH */}
            <div className="grid grid-cols-4 gap-1.5 pt-1">
              {[0, 50, 100, 150].map((level) => (
                <button
                  key={level}
                  onClick={() => onUpdateAudioItem && onUpdateAudioItem(activeAudioItem.id, { volume: level })}
                  className={`py-1 rounded text-[10px] font-mono border transition ${
                    vol === level ? "bg-cyan-600/30 border-cyan-500 text-cyan-300 font-bold" : "bg-slate-800/60 border-slate-700/60 text-slate-400 hover:text-white"
                  }`}
                >
                  {level}%
                </button>
              ))}
            </div>
          </div>
        </div>
        <audio ref={audioPreviewRef} onEnded={() => setIsPlayingPreview(false)} className="hidden" />
      </div>
    );
  }

  // 2. NẾU ĐANG CHỌN VOICE TTS ĐỘC LẬP
  if (activeVoiceItem) {
    return (
      <div className="w-[320px] border-l border-slate-800 bg-[#121316] flex flex-col shrink-0 select-none text-xs">
        <div className="h-10 px-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/60 font-medium">
          <span className="text-slate-200 flex items-center gap-1.5 font-semibold">
            <Mic size={14} className="text-emerald-400" /> Cài Đặt Giọng Đọc TTS
          </span>
          <span className="text-[10px] text-slate-500 font-mono">{activeVoiceItem.duration}s</span>
        </div>

        <div className="flex-1 p-4 space-y-4 overflow-y-auto">
          <div className="p-3 bg-slate-900/90 border border-slate-800 rounded-xl space-y-2">
            <span className="text-[11px] text-slate-400 block font-medium">Nội dung / Tên thoại:</span>
            <p className="text-slate-200 font-semibold italic text-xs">"{activeVoiceItem.name}"</p>
            <button
              onClick={() => togglePreview(activeVoiceItem.url)}
              className="w-full mt-2 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded flex items-center justify-center gap-1.5 transition font-medium"
            >
              {isPlayingPreview ? <Pause size={13} /> : <Play size={13} />}
              <span>{isPlayingPreview ? "Dừng" : "Nghe thử Voice"}</span>
            </button>
          </div>
        </div>
        <audio ref={audioPreviewRef} onEnded={() => setIsPlayingPreview(false)} className="hidden" />
      </div>
    );
  }

  // 3. NẾU ĐANG CHỌN ẢNH COMMENT HOẶC CLIP MẶC ĐỊNH
  return (
    <div className="w-[320px] border-l border-slate-800 bg-[#121316] flex flex-col shrink-0 select-none text-xs">
      {/* THANH CHUYỂN TABS: AUDIO & VOICE | VIDEO */}
      <div className="h-10 border-b border-slate-800 flex bg-slate-950/60 text-xs shrink-0">
        <button
          onClick={() => setInspectorTab("audio")}
          className={`flex-1 font-semibold flex items-center justify-center gap-1.5 transition ${
            inspectorTab === "audio" ? "border-b-2 border-amber-400 text-amber-300 bg-slate-900/80" : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <Volume2 size={13} /> Audio & Voice
        </button>
        <button
          onClick={() => setInspectorTab("video")}
          className={`flex-1 font-semibold flex items-center justify-center gap-1.5 transition ${
            inspectorTab === "video" ? "border-b-2 border-cyan-400 text-cyan-300 bg-slate-900/80" : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <Sliders size={13} /> Video (Transform)
        </button>
      </div>

      <div className="flex-1 p-4 space-y-4 overflow-y-auto">
        {activeBlock ? (
          inspectorTab === "audio" ? (
            <div className="space-y-3.5">
              <div className="flex justify-between items-center text-slate-400">
                <span className="font-semibold text-slate-300">Lời thoại của block:</span>
                <span className="text-amber-400 font-mono">{activeBlock.duration}s</span>
              </div>
              <textarea
                value={activeBlock.text || ""}
                onChange={(e) => {
                  if (setBlocks) {
                    setBlocks((prev) =>
                      prev.map((b) => (b.id === activeBlock.id ? { ...b, text: e.target.value } : b))
                    );
                  }
                }}
                rows={5}
                placeholder="Nội dung đọc của block này..."
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-slate-200 outline-none focus:border-amber-400 resize-none leading-relaxed"
              />

              {/* NGHE THỬ ÂM THANH */}
              {activeBlock.audio_url && (
                <div className="space-y-1">
                  <span className="text-slate-400 block font-medium">Nghe thử âm thanh:</span>
                  <audio controls src={activeBlock.audio_url} className="w-full h-8 mt-1 rounded bg-slate-800" />
                </div>
              )}

              {/* ĐỔI GIỌNG ĐỌC */}
              <div className="space-y-1">
                <label className="text-slate-400 font-medium block">Đổi giọng đọc:</label>
                <select
                  value={typeof activeBlock.voice === "string" ? activeBlock.voice : "vi-VN-NamMinhNeural"}
                  onChange={(e) => {
                    if (handleUpdateBlockVoice) {
                      handleUpdateBlockVoice(activeBlock.id, { voice: e.target.value });
                    }
                  }}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-slate-200 outline-none focus:border-amber-400"
                >
                  {Object.entries(voices).map(([k, label]) => (
                    <option key={k} value={k}>{label}</option>
                  ))}
                </select>
              </div>

              {/* TỐC ĐỘ ĐỌC */}
              <div className="space-y-1">
                <div className="flex justify-between text-slate-400">
                  <span>Tốc độ đọc (Analog 1 - 100):</span>
                  <span className="text-amber-400 font-mono">{activeBlock.speed || 50}</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={100}
                  value={activeBlock.speed || 50}
                  onChange={(e) => {
                    const sp = Number(e.target.value);
                    if (setBlocks) {
                      setBlocks((prev) =>
                        prev.map((b) => (b.id === activeBlock.id ? { ...b, speed: sp } : b))
                      );
                    }
                  }}
                  onMouseUp={() => {
                    if (handleUpdateBlockVoice) {
                      handleUpdateBlockVoice(activeBlock.id, { speed: activeBlock.speed });
                    }
                  }}
                  className="w-full accent-amber-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                />
              </div>
            </div>
          ) : (
            /* TAB VIDEO TRANSFORM CHO ẢNH COMMENT */
            <div className="space-y-3.5">
              <span className="font-semibold text-slate-300 block">Kích thước & Vị trí ảnh:</span>
              <div className="space-y-1">
                <div className="flex justify-between text-slate-400">
                  <span>Chiều rộng ảnh (Width):</span>
                  <span className="text-cyan-400 font-mono">{activeBlock.img_width}px</span>
                </div>
                <input
                  type="range"
                  min={300}
                  max={1060}
                  value={activeBlock.img_width}
                  onChange={(e) => {
                    const w = Number(e.target.value);
                    if (setBlocks) {
                      setBlocks((prev) =>
                        prev.map((b) => (b.id === activeBlock.id ? { ...b, img_width: w } : b))
                      );
                    }
                  }}
                  className="w-full accent-cyan-500 h-1.5 bg-slate-800 rounded cursor-pointer"
                />
              </div>

              <div className="grid grid-cols-2 gap-2 text-slate-400 pt-2">
                <div className="p-2 bg-slate-900 border border-slate-800 rounded">
                  <span className="block text-[10px]">Tọa độ X</span>
                  <span className="text-white font-mono font-semibold">{Math.round(activeBlock.img_x)}px</span>
                </div>
                <div className="p-2 bg-slate-900 border border-slate-800 rounded">
                  <span className="block text-[10px]">Tọa độ Y</span>
                  <span className="text-white font-mono font-semibold">{Math.round(activeBlock.img_y)}px</span>
                </div>
              </div>
            </div>
          )
        ) : (
          <div className="text-center py-20 text-slate-600 italic">
            Chọn một block trên Timeline để tùy chỉnh
          </div>
        )}
      </div>
    </div>
  );
};

export default Inspector;