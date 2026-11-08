"use client";

import React, { useState, useEffect, useRef } from "react";
import { Music, Volume2, Smile, Upload, Play, Pause, Plus, Video } from "lucide-react";
import { MediaAssetItem } from "@/types";

interface AssetsTabProps {
  onAddAudioToTimeline?: (item: MediaAssetItem, type: "bgm" | "sound_effect") => void;
  onAddMemeImageToTimeline?: (item: MediaAssetItem) => void;
}

export const AssetsTab: React.FC<AssetsTabProps> = ({
  onAddAudioToTimeline,
  onAddMemeImageToTimeline,
}) => {
  const API_BASE = "http://localhost:8000";
  const [subTab, setSubTab] = useState<"bgm" | "meme_audio" | "meme_img">("meme_img");
  const [assets, setAssets] = useState<{
    bgm: MediaAssetItem[];
    meme_audio: MediaAssetItem[];
    meme_images: MediaAssetItem[];
  }>({ bgm: [], meme_audio: [], meme_images: [] });

  const [playingUrl, setPlayingUrl] = useState<string | null>(null);
  const audioPreviewRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadAssets = () => {
    fetch(`${API_BASE}/api/assets/list`)
      .then((r) => r.json())
      .then((d) => setAssets(d))
      .catch(() => {});
  };

  useEffect(() => {
    loadAssets();
  }, []);

  const handleTogglePlay = (url: string) => {
    if (playingUrl === url) {
      audioPreviewRef.current?.pause();
      setPlayingUrl(null);
    } else {
      setPlayingUrl(url);
      if (audioPreviewRef.current) {
        audioPreviewRef.current.src = url;
        audioPreviewRef.current.play().catch(() => {});
      }
    }
  };

  const handleUploadAsset = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return;
    const file = e.target.files[0];
    const fd = new FormData();
    fd.append("file", file);

    await fetch(`${API_BASE}/api/assets/upload/${subTab}`, {
      method: "POST",
      body: fd,
    });
    loadAssets();
    e.target.value = "";
  };

  return (
    <div className="flex flex-col h-full space-y-3 text-xs select-none overflow-hidden">
      <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800 shrink-0">
        <button
          onClick={() => setSubTab("bgm")}
          className={`flex-1 py-1.5 rounded flex items-center justify-center gap-1 font-medium transition ${
            subTab === "bgm" ? "bg-indigo-600 text-white shadow" : "text-slate-400 hover:text-white"
          }`}
        >
          <Music size={12} /> BGM
        </button>
        <button
          onClick={() => setSubTab("meme_audio")}
          className={`flex-1 py-1.5 rounded flex items-center justify-center gap-1 font-medium transition ${
            subTab === "meme_audio" ? "bg-emerald-600 text-white shadow" : "text-slate-400 hover:text-white"
          }`}
        >
          <Volume2 size={12} /> Meme Sound
        </button>
        <button
          onClick={() => setSubTab("meme_img")}
          className={`flex-1 py-1.5 rounded flex items-center justify-center gap-1 font-medium transition ${
            subTab === "meme_img" ? "bg-amber-600 text-white shadow" : "text-slate-400 hover:text-white"
          }`}
        >
          <Smile size={12} /> Ảnh/Video Meme
        </button>
      </div>

      <div className="border border-dashed border-slate-800 rounded-lg p-2 text-center shrink-0">
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleUploadAsset}
          accept={subTab === "meme_img" ? "image/*,video/*" : "audio/*"}
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-full py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-medium flex items-center justify-center gap-1.5 transition"
        >
          <Upload size={13} /> Tải lên {subTab === "bgm" ? "BGM" : subTab === "meme_audio" ? "Meme Audio" : "Ảnh/Video Meme"}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 min-h-0">
        {subTab === "bgm" &&
          assets.bgm.map((item, idx) => (
            <div
              key={idx}
              className="p-2 bg-slate-900 border border-slate-800 hover:border-indigo-500 rounded-lg flex items-center justify-between transition"
            >
              <div className="truncate flex-1 pr-2">
                <span className="font-medium text-slate-200 block truncate">{item.name}</span>
                <span className="text-[10px] text-slate-500 font-mono">{item.duration}s</span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => handleTogglePlay(item.url)}
                  className="p-1.5 bg-indigo-600/30 hover:bg-indigo-600 text-indigo-300 hover:text-white rounded-full transition"
                >
                  {playingUrl === item.url ? <Pause size={12} /> : <Play size={12} />}
                </button>
                <button
                  onClick={() => onAddAudioToTimeline && onAddAudioToTimeline(item, "bgm")}
                  title="Thêm vào track BGM"
                  className="p-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-full transition"
                >
                  <Plus size={12} />
                </button>
              </div>
            </div>
          ))}

        {subTab === "meme_audio" &&
          assets.meme_audio.map((item, idx) => (
            <div
              key={idx}
              className="p-2 bg-slate-900 border border-slate-800 hover:border-emerald-500 rounded-lg flex items-center justify-between transition"
            >
              <div className="truncate flex-1 pr-2">
                <span className="font-medium text-slate-200 block truncate">{item.name}</span>
                <span className="text-[10px] text-emerald-400 font-mono">{item.duration}s</span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => handleTogglePlay(item.url)}
                  className="p-1.5 bg-slate-800 hover:bg-emerald-600 text-slate-300 hover:text-white rounded-full transition"
                >
                  {playingUrl === item.url ? <Pause size={12} /> : <Play size={12} />}
                </button>
                <button
                  onClick={() => onAddAudioToTimeline && onAddAudioToTimeline(item, "sound_effect")}
                  title="Thêm vào track Meme Sound"
                  className="p-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-full transition"
                >
                  <Plus size={12} />
                </button>
              </div>
            </div>
          ))}

        {subTab === "meme_img" && (
          <div className="grid grid-cols-2 gap-2">
            {assets.meme_images.map((img, idx) => {
              const isVid = img.type === "video" || /\.(mp4|mov|webm|mkv)(\?.*)?$/i.test(img.url);
              return (
                <div
                  key={idx}
                  className="group relative bg-slate-900 border border-slate-800 hover:border-amber-400 rounded-lg p-1 transition overflow-hidden"
                >
                  {isVid ? (
                    <div className="relative w-full h-20 bg-black rounded overflow-hidden flex items-center justify-center">
                      <video src={img.url} className="w-full h-full object-cover pointer-events-none" />
                      <div className="absolute top-1 left-1 bg-amber-500 text-black px-1 rounded text-[9px] font-bold flex items-center gap-0.5">
                        <Video size={10} /> Video
                      </div>
                    </div>
                  ) : (
                    <img src={img.url} alt={img.name} className="w-full h-20 object-cover rounded pointer-events-none" />
                  )}
                  <span className="text-[10px] text-slate-400 truncate block mt-1">{img.name}</span>
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                    <button
                      onClick={() => onAddMemeImageToTimeline && onAddMemeImageToTimeline(img)}
                      title="Gắn vào Timeline"
                      className="p-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-full font-bold shadow"
                    >
                      <Plus size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <audio ref={audioPreviewRef} onEnded={() => setPlayingUrl(null)} className="hidden" />
    </div>
  );
};

export default AssetsTab;
