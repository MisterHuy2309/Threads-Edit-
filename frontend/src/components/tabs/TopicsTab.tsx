"use client";

import React, { useRef } from "react";
import { FolderPlus, Trash2, Edit2, Upload, Plus } from "lucide-react";
import { TimelineBlock } from "@/types";

interface TopicsTabProps {
  topics: string[];
  currentTopic: string;
  setCurrentTopic: (t: string) => void;
  topicImages: any[];
  apiBase: string;
  activeBlock: TimelineBlock | null;
  setBlocks: React.Dispatch<React.SetStateAction<TimelineBlock[]>>;
  handleCreateTopic: (name: string) => Promise<void>;
  handleRenameTopic: (oldName: string, newName: string) => Promise<void>;
  handleDeleteTopic: (name: string) => Promise<void>;
  handleUploadImageToTopic: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  handleDeleteSingleImage: (filename: string) => Promise<void>;
}

export const TopicsTab: React.FC<TopicsTabProps> = ({
  topics,
  currentTopic,
  setCurrentTopic,
  topicImages,
  apiBase,
  setBlocks,
  handleCreateTopic,
  handleRenameTopic,
  handleDeleteTopic,
  handleUploadImageToTopic,
  handleDeleteSingleImage,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const getFullImgUrl = (img: any): string => {
    const rawUrl = img.url || img.path || "";
    if (!rawUrl) return "";
    if (rawUrl.startsWith("http://") || rawUrl.startsWith("https://")) return rawUrl;
    const clean = rawUrl.startsWith("/") ? rawUrl : `/${rawUrl}`;
    return `${apiBase}${clean}`;
  };

  const handleAddImageDirectly = (img: any) => {
    const fullUrl = getFullImgUrl(img);
    setBlocks((prev) => {
      const safePrev = Array.isArray(prev) ? prev : [];
      const lastBlock = safePrev[safePrev.length - 1];
      const nextStartTime = lastBlock ? (lastBlock.startTime ?? 0) + (lastBlock.duration ?? 3) : 0;

      const newBlock: TimelineBlock = {
        id: "block_" + Date.now(),
        image_url: fullUrl,
        image_path: img.path || fullUrl,
        startTime: Number(nextStartTime.toFixed(2)),
        duration: 3.0,
        maxDuration: 999999,
        img_x: 140,
        img_y: 450,
        img_width: 800,
        voice: null,
      };
      return [...safePrev, newBlock];
    });
  };

  return (
    <div className="flex flex-col h-full w-full select-none text-xs overflow-hidden">
      {/* 1. THANH CHỌN CHỦ ĐỀ (CỐ ĐỊNH PHÍA TRÊN) */}
      <div className="flex items-center gap-1.5 shrink-0 mb-3">
        <select
          value={currentTopic}
          onChange={(e) => setCurrentTopic(e.target.value)}
          className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 text-slate-200 outline-none focus:border-rose-500 text-xs"
        >
          {topics.length === 0 && <option value="">Chưa có chủ đề</option>}
          {topics.map((t) => (
            <option key={t} value={t}>📁 {t}</option>
          ))}
        </select>

        <button
          onClick={() => {
            const name = prompt("Nhập tên chủ đề mới:");
            if (name?.trim()) handleCreateTopic(name.trim());
          }}
          title="Tạo chủ đề mới"
          className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 shrink-0"
        >
          <FolderPlus size={14} />
        </button>

        {currentTopic && (
          <>
            <button
              onClick={() => {
                const newName = prompt("Đổi tên chủ đề:", currentTopic);
                if (newName?.trim() && newName.trim() !== currentTopic) {
                  handleRenameTopic(currentTopic, newName.trim());
                }
              }}
              title="Đổi tên chủ đề"
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg border border-slate-700 shrink-0"
            >
              <Edit2 size={13} />
            </button>
            <button
              onClick={() => {
                if (confirm(`Bạn có chắc muốn xóa chủ đề "${currentTopic}"?`)) {
                  handleDeleteTopic(currentTopic);
                }
              }}
              title="Xóa chủ đề"
              className="p-2 bg-slate-800 hover:bg-rose-950/60 text-slate-400 hover:text-rose-400 rounded-lg border border-slate-700 shrink-0"
            >
              <Trash2 size={13} />
            </button>
          </>
        )}
      </div>

      {/* 2. NÚT UPLOAD ẢNH (CỐ ĐỊNH) */}
      {currentTopic && (
        <div className="shrink-0 mb-3 border border-dashed border-rose-500/30 hover:border-rose-500/60 bg-rose-950/10 rounded-xl p-2.5 text-center transition">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleUploadImageToTopic}
            accept="image/*"
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full flex items-center justify-center gap-2 py-2 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/40 rounded-lg font-medium transition"
          >
            <Upload size={14} /> Tải Ảnh Comment Vào Chủ Đề
          </button>
        </div>
      )}

      {/* 3. TIÊU ĐỀ SỐ LƯỢNG ẢNH */}
      <div className="flex justify-between items-center text-slate-400 mb-2 shrink-0">
        <span>Ảnh trong kho ({topicImages.length}):</span>
        <span className="text-[10px] text-amber-400/80">Kéo hoặc bấm (+) để gắn</span>
      </div>

      {/* 4. KHUNG CUỘN DANH SÁCH ẢNH (BẬT CON LĂN CUỘN MƯỢT 100%) */}
      <div className="flex-1 min-h-0 overflow-y-auto pr-1 pb-4 space-y-2">
        <div className="grid grid-cols-2 gap-2">
          {topicImages.map((img, idx) => {
            const fullUrl = getFullImgUrl(img);
            return (
              <div
                key={idx}
                draggable={true}
                onDragStart={(e) => {
                  e.dataTransfer.setData(
                    "application/json",
                    JSON.stringify({
                      type: "overlay",
                      imageUrl: fullUrl,
                      image_url: fullUrl,
                      image_path: img.path || fullUrl,
                      duration: 3.0,
                    })
                  );
                  e.dataTransfer.effectAllowed = "copy";
                }}
                className="group relative bg-slate-900 border border-slate-800 hover:border-amber-400 rounded-lg overflow-hidden cursor-grab active:cursor-grabbing transition-all shadow-md h-24"
              >
                <img
                  src={fullUrl}
                  alt="Comment"
                  className="w-full h-full object-cover pointer-events-none select-none bg-slate-950"
                />
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-2 transition-opacity">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAddImageDirectly(img);
                    }}
                    title="Gắn vào Timeline"
                    className="p-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-full font-bold shadow"
                  >
                    <Plus size={14} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteSingleImage(img.name || img.filename);
                    }}
                    title="Xóa ảnh"
                    className="p-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-full shadow"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {topicImages.length === 0 && currentTopic && (
          <div className="text-center py-10 text-slate-600 italic">
            Chưa có ảnh nào trong chủ đề này.
          </div>
        )}
      </div>
    </div>
  );
};

export default TopicsTab;