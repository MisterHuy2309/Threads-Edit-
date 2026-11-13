"use client";

import React, { useRef, useState, useEffect } from "react";
import { 
  Volume2, VolumeX, Volume1, Sliders, Music, Mic, RotateCcw, Play, Pause, Sparkles, Gauge, Film, Smile, Activity
} from "lucide-react";
import { TimelineBlock, TimelineAudioItem, VoiceItem, BgClipItem, TimelineMemeImageItem } from "@/types";

export interface InspectorProps {
  inspectorTab: "video" | "audio";
  setInspectorTab: (tab: "video" | "audio") => void;
  activeBlock: TimelineBlock | null;
  setBlocks?: React.Dispatch<React.SetStateAction<TimelineBlock[]>>;
  activeAudioItem?: TimelineAudioItem | null;
  onUpdateAudioItem?: (id: string, updatedProps: Partial<TimelineAudioItem>) => void;
  activeVoiceItem?: VoiceItem | null;
  onUpdateVoiceItem?: (id: string, updatedProps: Partial<VoiceItem>) => void;
  activeBgClip?: BgClipItem | null;
  onUpdateBgClip?: (id: string, updatedProps: Partial<BgClipItem>) => void;
  activeMemeItem?: TimelineMemeImageItem | null;
  onUpdateMemeItem?: (id: string, updatedProps: Partial<TimelineMemeImageItem>) => void;
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
  activeMemeItem,
  onUpdateMemeItem,
  handleUpdateBlockVoice,
  voices,
}) => {
  const audioPreviewRef = useRef<HTMLAudioElement | null>(null);
  const [isPlayingPreview, setIsPlayingPreview] = useState<boolean>(false);

  const getFullUrl = (url: string) => {
    if (!url) return "";
    if (url.startsWith("http") || url.startsWith("blob:")) return url;
    return `http://127.0.0.1:8000${url.startsWith("/") ? "" : "/"}${url}`;
  };

  const togglePreviewWithSpeedAndPitch = (url: string, speed: number = 1.0, pitchPct: number = 50) => {
    const el = audioPreviewRef.current;
    if (!el) return;
    if (isPlayingPreview) {
      el.pause();
      setIsPlayingPreview(false);
    } else {
      el.src = getFullUrl(url);
      // Tính hệ số pitch (50% = 1.0, 0% = 0.707, 100% = 1.414)
      const semitones = ((pitchPct - 50) / 50) * 6;
      const pitchRatio = Math.pow(2, semitones / 12);
      el.preservesPitch = false;
      (el as any).mozPreservesPitch = false;
      (el as any).webkitPreservesPitch = false;
      el.playbackRate = Math.max(0.4, Math.min(3.0, speed * pitchRatio));
      el.play().then(() => setIsPlayingPreview(true)).catch(() => {});
    }
  };

  useEffect(() => {
    const el = audioPreviewRef.current;
    if (!el || !isPlayingPreview || !activeVoiceItem) return;
    const speed = activeVoiceItem.speed || 1.0;
    const pitchPct = activeVoiceItem.pitch ?? 50;
    const semitones = ((pitchPct - 50) / 50) * 6;
    const pitchRatio = Math.pow(2, semitones / 12);
    el.preservesPitch = false;
    el.playbackRate = Math.max(0.4, Math.min(3.0, speed * pitchRatio));
  }, [activeVoiceItem?.speed, activeVoiceItem?.pitch, isPlayingPreview]);

  // 1. CẤU HÌNH BLOCK MEME (ẢNH HOẶC VIDEO MEME)
  if (activeMemeItem) {
    const opacity = activeMemeItem.opacity ?? 1.0;
    const isVidMeme = activeMemeItem.type === "video" || /\.(mp4|mov|webm|mkv)(\?.*)?$/i.test(activeMemeItem.url);
    const memeVol = activeMemeItem.volume ?? 100;

    return (
      <div className="w-[320px] border-l border-slate-800 bg-[#121316] flex flex-col shrink-0 select-none text-xs">
        <div className="h-10 px-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/60 font-medium">
          <span className="text-slate-200 flex items-center gap-1.5 font-semibold">
            <Smile size={14} className="text-pink-400" /> Cài Đặt {isVidMeme ? "Video Meme" : "Ảnh Meme"}
          </span>
          <span className="text-[10px] text-slate-500 font-mono">{activeMemeItem.duration}s</span>
        </div>

        <div className="flex-1 p-4 space-y-4 overflow-y-auto">
          <div className="p-3 bg-slate-900/90 border border-slate-800 rounded-xl space-y-1">
            <span className="text-[11px] text-slate-400 block font-medium">Tên file meme:</span>
            <p className="text-slate-200 font-semibold truncate text-xs">{activeMemeItem.name}</p>
          </div>

          {isVidMeme && (
            <div className="p-3.5 bg-slate-900/90 border border-slate-800 rounded-xl space-y-2.5">
              <div className="flex items-center justify-between text-slate-300">
                <span className="font-semibold flex items-center gap-1.5">
                  {memeVol === 0 ? <VolumeX size={14} className="text-rose-400" /> : <Volume2 size={14} className="text-amber-400" />}
                  Âm lượng Video Meme
                </span>
                <span className="font-mono text-amber-400 font-bold text-xs">{memeVol}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={200}
                step={5}
                value={memeVol}
                onChange={(e) => {
                  if (onUpdateMemeItem) onUpdateMemeItem(activeMemeItem.id, { volume: Number(e.target.value) });
                }}
                className="w-full accent-amber-500 h-1.5 bg-slate-800 rounded cursor-pointer"
              />
            </div>
          )}

          <div className="p-3.5 bg-slate-900/90 border border-slate-800 rounded-xl space-y-2.5">
            <div className="flex items-center justify-between text-slate-300">
              <span className="font-semibold flex items-center gap-1.5">
                <Sparkles size={14} className="text-pink-400" /> Độ mờ / Watermark
              </span>
              <span className="font-mono text-pink-400 font-bold text-xs">{Math.round(opacity * 100)}%</span>
            </div>

            <input
              type="range"
              min={0.05}
              max={1.0}
              step={0.05}
              value={opacity}
              onChange={(e) => {
                if (onUpdateMemeItem) onUpdateMemeItem(activeMemeItem.id, { opacity: Number(e.target.value) });
              }}
              className="w-full accent-pink-500 h-1.5 bg-slate-800 rounded cursor-pointer"
            />

            <div className="grid grid-cols-4 gap-1 pt-1">
              {[0.2, 0.5, 0.8, 1.0].map((lvl) => (
                <button
                  key={lvl}
                  onClick={() => onUpdateMemeItem && onUpdateMemeItem(activeMemeItem.id, { opacity: lvl })}
                  className={`py-1 rounded text-[10px] font-mono border transition ${
                    opacity === lvl ? "bg-pink-600/30 border-pink-500 text-pink-300 font-bold" : "bg-slate-800/60 border-slate-700/60 text-slate-400 hover:text-white"
                  }`}
                >
                  {Math.round(lvl * 100)}%
                </button>
              ))}
            </div>
          </div>

          <div className="p-3.5 bg-slate-900/90 border border-slate-800 rounded-xl space-y-3">
            <div className="space-y-1">
              <div className="flex justify-between text-slate-400">
                <span>Chiều rộng (Width):</span>
                <span className="text-pink-400 font-mono">{activeMemeItem.img_width}px</span>
              </div>
              <input
                type="range"
                min={100}
                max={1080}
                value={activeMemeItem.img_width}
                onChange={(e) => {
                  if (onUpdateMemeItem) onUpdateMemeItem(activeMemeItem.id, { img_width: Number(e.target.value) });
                }}
                className="w-full accent-pink-500 h-1.5 bg-slate-800 rounded cursor-pointer"
              />
            </div>

            <div className="grid grid-cols-2 gap-2 text-slate-400 pt-1">
              <div className="p-2 bg-slate-950 border border-slate-800 rounded">
                <span className="block text-[10px]">Tọa độ X</span>
                <span className="text-white font-mono font-semibold">{Math.round(activeMemeItem.img_x)}px</span>
              </div>
              <div className="p-2 bg-slate-950 border border-slate-800 rounded">
                <span className="block text-[10px]">Tọa độ Y</span>
                <span className="text-white font-mono font-semibold">{Math.round(activeMemeItem.img_y)}px</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 2. CẤU HÌNH NHẠC NỀN & MEME SOUND
  if (activeAudioItem) {
    const vol = activeAudioItem.volume !== undefined ? activeAudioItem.volume : 100;
    const speed = activeAudioItem.speed || 1.0;
    const isMeme = activeAudioItem.type === "sound_effect";

    const handleSpeedChange = (newSpeed: number) => {
      if (!onUpdateAudioItem) return;
      const original = activeAudioItem.originalDuration || activeAudioItem.maxDuration || activeAudioItem.duration;
      const newDuration = Number((original / newSpeed).toFixed(2));
      onUpdateAudioItem(activeAudioItem.id, {
        speed: newSpeed,
        duration: newDuration,
        originalDuration: original
      });
      if (audioPreviewRef.current) {
        audioPreviewRef.current.playbackRate = newSpeed;
      }
    };

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
          <div className="p-3 bg-slate-900/90 border border-slate-800 rounded-xl space-y-2">
            <span className="text-[11px] text-slate-400 block font-medium">Tệp âm thanh:</span>
            <p className="text-slate-200 font-semibold truncate text-xs">{activeAudioItem.name}</p>

            <button
              onClick={() => togglePreviewWithSpeedAndPitch(activeAudioItem.url, speed, 50)}
              className="w-full mt-2 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded flex items-center justify-center gap-1.5 transition font-medium"
            >
              {isPlayingPreview ? <Pause size={13} /> : <Play size={13} />}
              <span>{isPlayingPreview ? "Tạm dừng" : `Nghe thử (${speed}x)`}</span>
            </button>
          </div>

          <div className="p-3.5 bg-slate-900/90 border border-slate-800 rounded-xl space-y-2.5">
            <div className="flex items-center justify-between text-slate-300">
              <span className="font-semibold flex items-center gap-1.5">
                <Gauge size={14} className="text-amber-400" /> Tốc độ phát (Speed)
              </span>
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-amber-400 font-bold text-xs">{speed}x</span>
                <button
                  onClick={() => handleSpeedChange(1.0)}
                  title="Đặt lại 1.0x mặc định"
                  className="p-1 hover:bg-slate-800 text-slate-500 hover:text-white rounded transition"
                >
                  <RotateCcw size={11} />
                </button>
              </div>
            </div>

            <input
              type="range"
              min={0.5}
              max={2.0}
              step={0.05}
              value={speed}
              onChange={(e) => handleSpeedChange(Number(e.target.value))}
              className="w-full accent-amber-500 h-1.5 bg-slate-800 rounded cursor-pointer"
            />

            <div className="grid grid-cols-4 gap-1 pt-1">
              {[0.75, 1.0, 1.25, 1.5].map((lvl) => (
                <button
                  key={lvl}
                  onClick={() => handleSpeedChange(lvl)}
                  className={`py-1 rounded text-[10px] font-mono border transition ${
                    speed === lvl ? "bg-amber-600/30 border-amber-500 text-amber-300 font-bold" : "bg-slate-800/60 border-slate-700/60 text-slate-400 hover:text-white"
                  }`}
                >
                  {lvl}x
                </button>
              ))}
            </div>
          </div>

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
          </div>
        </div>
        <audio ref={audioPreviewRef} onEnded={() => setIsPlayingPreview(false)} className="hidden" />
      </div>
    );
  }

  // 3. CẤU HÌNH VOICE TTS (CÓ THANH CHỈNH SPEED + THANH CHỈNH PITCH GỐC 50%)
  if (activeVoiceItem) {
    const speed = activeVoiceItem.speed || 1.0;
    const pitch = activeVoiceItem.pitch ?? 50;

    const handleVoiceSpeedChange = (newSpeed: number) => {
      if (!onUpdateVoiceItem) return;
      const original = activeVoiceItem.originalDuration || activeVoiceItem.maxDuration || activeVoiceItem.duration;
      const newDuration = Number((original / newSpeed).toFixed(2));
      onUpdateVoiceItem(activeVoiceItem.id, {
        speed: newSpeed,
        duration: newDuration,
        originalDuration: original
      });
    };

    const handleVoicePitchChange = (newPitch: number) => {
      if (!onUpdateVoiceItem) return;
      onUpdateVoiceItem(activeVoiceItem.id, {
        pitch: newPitch
      });
    };

    return (
      <div className="w-[320px] border-l border-slate-800 bg-[#121316] flex flex-col shrink-0 select-none text-xs">
        <div className="h-10 px-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/60 font-medium">
          <span className="text-slate-200 flex items-center gap-1.5 font-semibold">
            <Mic size={14} className="text-emerald-400" /> Cài Đặt Voice TTS
          </span>
          <span className="text-[10px] text-slate-500 font-mono">{activeVoiceItem.duration}s</span>
        </div>

        <div className="flex-1 p-4 space-y-4 overflow-y-auto">
          <div className="p-3 bg-slate-900/90 border border-slate-800 rounded-xl space-y-2">
            <span className="text-[11px] text-slate-400 block font-medium">Lời thoại:</span>
            <p className="text-slate-200 font-semibold italic text-xs">"{activeVoiceItem.name}"</p>
            <button
              onClick={() => togglePreviewWithSpeedAndPitch(activeVoiceItem.url, speed, pitch)}
              className="w-full mt-2 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded flex items-center justify-center gap-1.5 transition font-medium"
            >
              {isPlayingPreview ? <Pause size={13} /> : <Play size={13} />}
              <span>{isPlayingPreview ? "Dừng" : `Nghe thử (${speed}x | Pitch ${pitch}%)`}</span>
            </button>
          </div>

          {/* THANH CHỈNH TỐC ĐỘ ĐỌC (SPEED) */}
          <div className="p-3.5 bg-slate-900/90 border border-slate-800 rounded-xl space-y-2.5">
            <div className="flex items-center justify-between text-slate-300">
              <span className="font-semibold flex items-center gap-1.5">
                <Gauge size={14} className="text-emerald-400" /> Tốc độ đọc (Speed)
              </span>
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-emerald-400 font-bold text-xs">{speed}x</span>
                <button
                  onClick={() => handleVoiceSpeedChange(1.0)}
                  title="Đặt lại 1.0x mặc định"
                  className="p-1 hover:bg-slate-800 text-slate-500 hover:text-white rounded transition"
                >
                  <RotateCcw size={11} />
                </button>
              </div>
            </div>

            <input
              type="range"
              min={0.5}
              max={2.0}
              step={0.05}
              value={speed}
              onChange={(e) => handleVoiceSpeedChange(Number(e.target.value))}
              className="w-full accent-emerald-500 h-1.5 bg-slate-800 rounded cursor-pointer"
            />

            <div className="grid grid-cols-4 gap-1 pt-1">
              {[0.75, 1.0, 1.25, 1.5].map((lvl) => (
                <button
                  key={lvl}
                  onClick={() => handleVoiceSpeedChange(lvl)}
                  className={`py-1 rounded text-[10px] font-mono border transition ${
                    speed === lvl ? "bg-emerald-600/30 border-emerald-500 text-emerald-300 font-bold" : "bg-slate-800/60 border-slate-700/60 text-slate-400 hover:text-white"
                  }`}
                >
                  {lvl}x
                </button>
              ))}
            </div>
          </div>

          {/* THANH CHỈNH CAO ĐỘ GIỌNG (PITCH - GỐC 50%) */}
          <div className="p-3.5 bg-slate-900/90 border border-slate-800 rounded-xl space-y-2.5">
            <div className="flex items-center justify-between text-slate-300">
              <span className="font-semibold flex items-center gap-1.5">
                <Activity size={14} className="text-amber-400" /> Độ cao giọng (Pitch)
              </span>
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-amber-400 font-bold text-xs">{pitch}%</span>
                <button
                  onClick={() => handleVoicePitchChange(50)}
                  title="Đặt lại 50% (Giọng gốc)"
                  className="p-1 hover:bg-slate-800 text-slate-500 hover:text-white rounded transition"
                >
                  <RotateCcw size={11} />
                </button>
              </div>
            </div>

            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={pitch}
              onChange={(e) => handleVoicePitchChange(Number(e.target.value))}
              className="w-full accent-amber-500 h-1.5 bg-slate-800 rounded cursor-pointer"
            />

            <div className="grid grid-cols-4 gap-1 pt-1">
              {[
                { val: 25, label: "25% Trầm" },
                { val: 50, label: "50% Gốc" },
                { val: 75, label: "75% Thanh" },
                { val: 90, label: "90% Cute" },
              ].map((preset) => (
                <button
                  key={preset.val}
                  onClick={() => handleVoicePitchChange(preset.val)}
                  className={`py-1 rounded text-[10px] font-mono border transition ${
                    pitch === preset.val ? "bg-amber-600/30 border-amber-500 text-amber-300 font-bold" : "bg-slate-800/60 border-slate-700/60 text-slate-400 hover:text-white"
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <audio ref={audioPreviewRef} onEnded={() => setIsPlayingPreview(false)} className="hidden" />
      </div>
    );
  }

  // 4. CẤU HÌNH VIDEO BACKGROUND
  if (activeBgClip) {
    const speed = activeBgClip.speed || 1.0;
    return (
      <div className="w-[320px] border-l border-slate-800 bg-[#121316] flex flex-col shrink-0 select-none text-xs">
        <div className="h-10 px-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/60 font-medium">
          <span className="text-slate-200 flex items-center gap-1.5 font-semibold">
            <Film size={14} className="text-cyan-400" /> Cài Đặt Video Nền
          </span>
          <span className="text-[10px] text-slate-500 font-mono">{activeBgClip.duration}s</span>
        </div>

        <div className="flex-1 p-4 space-y-4 overflow-y-auto">
          <div className="p-3 bg-slate-900/90 border border-slate-800 rounded-xl space-y-1">
            <span className="text-[11px] text-slate-400 block font-medium">Tên video:</span>
            <p className="text-slate-200 font-semibold truncate text-xs">{activeBgClip.name}</p>
          </div>

          <div className="p-3.5 bg-slate-900/90 border border-slate-800 rounded-xl space-y-2.5">
            <div className="flex items-center justify-between text-slate-300">
              <span className="font-semibold flex items-center gap-1.5">
                <Gauge size={14} className="text-cyan-400" /> Tua nhanh / chậm (Speed)
              </span>
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-cyan-400 font-bold text-xs">{speed}x</span>
                <button
                  onClick={() => onUpdateBgClip && onUpdateBgClip(activeBgClip.id, { speed: 1.0 })}
                  title="Đặt lại 1.0x"
                  className="p-1 hover:bg-slate-800 text-slate-500 hover:text-white rounded transition"
                >
                  <RotateCcw size={11} />
                </button>
              </div>
            </div>

            <input
              type="range"
              min={0.5}
              max={2.0}
              step={0.1}
              value={speed}
              onChange={(e) => onUpdateBgClip && onUpdateBgClip(activeBgClip.id, { speed: Number(e.target.value) })}
              className="w-full accent-cyan-500 h-1.5 bg-slate-800 rounded cursor-pointer"
            />
          </div>
        </div>
      </div>
    );
  }

  // 5. CẤU HÌNH ẢNH COMMENT MẶC ĐỊNH
  return (
    <div className="w-[320px] border-l border-slate-800 bg-[#121316] flex flex-col shrink-0 select-none text-xs">
      <div className="h-10 border-b border-slate-800 flex bg-slate-950/60 text-xs shrink-0">
        <button
          onClick={() => setInspectorTab("audio")}
          className={`flex-1 font-semibold flex items-center justify-center gap-1.5 transition ${
            inspectorTab === "audio" ? "border-b-2 border-amber-400 text-amber-300 bg-slate-900/80" : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <Volume2 size={13} /> Audio & Thoại
        </button>
        <button
          onClick={() => setInspectorTab("video")}
          className={`flex-1 font-semibold flex items-center justify-center gap-1.5 transition ${
            inspectorTab === "video" ? "border-b-2 border-cyan-400 text-cyan-300 bg-slate-900/80" : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <Sliders size={13} /> Hiệu Ứng & Vị Trí
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
            </div>
          ) : (
            <div className="space-y-3.5">
              <div className="p-3 bg-slate-900/90 border border-slate-800 rounded-xl space-y-2">
                <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                  <Sparkles size={14} className="text-amber-400" /> Hiệu ứng xuất hiện
                </span>
                <div className="grid grid-cols-2 gap-1.5 pt-1">
                  {[
                    { id: "none", label: "Không có" },
                    { id: "fade", label: "Mờ dần (Fade)" },
                    { id: "pop", label: "Bật nảy (Pop)" },
                    { id: "slide_up", label: "Trượt lên" },
                  ].map((anim) => (
                    <button
                      key={anim.id}
                      onClick={() => {
                        if (setBlocks) {
                          setBlocks((prev) =>
                            prev.map((b) => (b.id === activeBlock.id ? { ...b, animation: anim.id as any } : b))
                          );
                        }
                      }}
                      className={`py-1.5 px-2 rounded text-[11px] border text-left transition ${
                        (activeBlock.animation || "none") === anim.id
                          ? "bg-amber-600/30 border-amber-500 text-amber-300 font-semibold"
                          : "bg-slate-800/60 border-slate-700/60 text-slate-400 hover:text-white"
                      }`}
                    >
                      {anim.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-3 bg-slate-900/90 border border-slate-800 rounded-xl space-y-3">
                <div className="space-y-1">
                  <div className="flex justify-between text-slate-400">
                    <span>Bo tròn góc viền:</span>
                    <span className="text-cyan-400 font-mono">{activeBlock.borderRadius || 12}px</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={40}
                    value={activeBlock.borderRadius || 12}
                    onChange={(e) => {
                      const r = Number(e.target.value);
                      if (setBlocks) setBlocks((prev) => prev.map((b) => (b.id === activeBlock.id ? { ...b, borderRadius: r } : b)));
                    }}
                    className="w-full accent-cyan-500 h-1.5 bg-slate-800 rounded cursor-pointer"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-slate-400">
                    <span>Độ rõ / Trong suốt:</span>
                    <span className="text-cyan-400 font-mono">{Math.round((activeBlock.opacity ?? 1.0) * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0.05}
                    max={1.0}
                    step={0.05}
                    value={activeBlock.opacity ?? 1.0}
                    onChange={(e) => {
                      const op = Number(e.target.value);
                      if (setBlocks) setBlocks((prev) => prev.map((b) => (b.id === activeBlock.id ? { ...b, opacity: op } : b)));
                    }}
                    className="w-full accent-cyan-500 h-1.5 bg-slate-800 rounded cursor-pointer"
                  />
                </div>
              </div>

              <div className="p-3 bg-slate-900/90 border border-slate-800 rounded-xl space-y-3">
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
                      if (setBlocks) setBlocks((prev) => prev.map((b) => (b.id === activeBlock.id ? { ...b, img_width: w } : b)));
                    }}
                    className="w-full accent-cyan-500 h-1.5 bg-slate-800 rounded cursor-pointer"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2 text-slate-400 pt-1">
                  <div className="p-2 bg-slate-950 border border-slate-800 rounded">
                    <span className="block text-[10px]">Tọa độ X</span>
                    <span className="text-white font-mono font-semibold">{Math.round(activeBlock.img_x)}px</span>
                  </div>
                  <div className="p-2 bg-slate-950 border border-slate-800 rounded">
                    <span className="block text-[10px]">Tọa độ Y</span>
                    <span className="text-white font-mono font-semibold">{Math.round(activeBlock.img_y)}px</span>
                  </div>
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
