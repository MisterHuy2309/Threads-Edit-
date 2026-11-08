"use client";

import React, { useRef, useEffect, useState, useCallback, useMemo } from "react";
import { 
  Play, Pause, RotateCcw, Film, Layers, Volume2, Trash2, ZoomIn, ZoomOut, Link, Unlink, Music, Smile, ChevronDown, ChevronUp, Scissors, Undo2, Redo2, Magnet, Copy
} from "lucide-react";
import { BgClipItem, TimelineBlock, TimelineAudioItem, TimelineMemeImageItem, VoiceItem } from "@/types";

export interface TimelineProps {
  bgClips?: BgClipItem[];
  setBgClips?: React.Dispatch<React.SetStateAction<BgClipItem[]>>;
  selectedClipId?: string | null;
  setSelectedClipId?: React.Dispatch<React.SetStateAction<string | null>>;

  blocks?: TimelineBlock[];
  setBlocks?: React.Dispatch<React.SetStateAction<TimelineBlock[]>>;
  selectedBlockId?: string | null;
  setSelectedBlockId?: React.Dispatch<React.SetStateAction<string | null>>;

  voiceList?: VoiceItem[];
  setVoiceList?: React.Dispatch<React.SetStateAction<VoiceItem[]>>;
  selectedVoiceId?: string | null;
  setSelectedVoiceId?: React.Dispatch<React.SetStateAction<string | null>>;

  currentTime: number;
  setCurrentTime: React.Dispatch<React.SetStateAction<number>>;
  isPlaying?: boolean;
  setIsPlaying?: React.Dispatch<React.SetStateAction<boolean>>;
  totalDuration?: number;

  bgmList?: TimelineAudioItem[];
  setBgmList?: React.Dispatch<React.SetStateAction<TimelineAudioItem[]>>;
  soundFxList?: TimelineAudioItem[];
  setSoundFxList?: React.Dispatch<React.SetStateAction<TimelineAudioItem[]>>;
  selectedAudioId?: string | null;
  setSelectedAudioId?: React.Dispatch<React.SetStateAction<string | null>>;

  memeImageList?: TimelineMemeImageItem[];
  setMemeImageList?: React.Dispatch<React.SetStateAction<TimelineMemeImageItem[]>>;
  selectedMemeId?: string | null;
  setSelectedMemeId?: React.Dispatch<React.SetStateAction<string | null>>;

  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onRecordHistory?: () => void;
}

const AudioWaveformSvg: React.FC<{
  id: string;
  width: number;
  color: string;
  seedStr?: string;
}> = ({ id, width, color, seedStr = "" }) => {
  const bars = useMemo(() => {
    const barWidth = 3;
    const gap = 1.5;
    const count = Math.max(8, Math.floor(width / (barWidth + gap)));
    const result: number[] = [];
    let hash = 0;
    for (let i = 0; i < seedStr.length; i++) {
      hash = (hash << 5) - hash + seedStr.charCodeAt(i);
      hash |= 0;
    }
    for (let i = 0; i < count; i++) {
      const pseudo = Math.sin(i * 0.35 + (hash % 100)) * 0.4 + Math.cos(i * 0.8 + (hash % 50)) * 0.3 + 0.5;
      const heightPercent = Math.max(18, Math.min(95, Math.round(pseudo * 85)));
      result.push(heightPercent);
    }
    return result;
  }, [width, seedStr]);

  return (
    <div className="absolute inset-0 flex items-center justify-start gap-[1.5px] px-2 pointer-events-none overflow-hidden opacity-45">
      {bars.map((h, idx) => (
        <div
          key={`${id}_bar_${idx}`}
          style={{ height: `${h}%`, backgroundColor: color }}
          className="w-[3px] rounded-full shrink-0 transition-all duration-75"
        />
      ))}
    </div>
  );
};

export const Timeline: React.FC<TimelineProps> = ({
  bgClips = [],
  setBgClips,
  selectedClipId = null,
  setSelectedClipId,
  blocks = [],
  setBlocks,
  selectedBlockId = null,
  setSelectedBlockId,
  voiceList = [],
  setVoiceList,
  selectedVoiceId = null,
  setSelectedVoiceId,
  currentTime,
  setCurrentTime,
  isPlaying = false,
  setIsPlaying,
  totalDuration: parentTotalDuration,
  bgmList = [],
  setBgmList,
  soundFxList = [],
  setSoundFxList,
  selectedAudioId = null,
  setSelectedAudioId,
  memeImageList = [],
  setMemeImageList,
  selectedMemeId = null,
  setSelectedMemeId,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
  onRecordHistory,
}) => {
  const [pixelsPerSec, setPixelsPerSec] = useState<number>(40);
  const [isScrubbing, setIsScrubbing] = useState<boolean>(false);
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);
  const [timelineHeight, setTimelineHeight] = useState<number>(330);
  const [isResizingHeight, setIsResizingHeight] = useState<boolean>(false);
  const resizeStartY = useRef<number>(0);
  const resizeStartHeight = useRef<number>(330);

  const [isSnappingEnabled, setIsSnappingEnabled] = useState<boolean>(true);
  const [snapGuideLineX, setSnapGuideLineX] = useState<number | null>(null);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [copiedItems, setCopiedItems] = useState<{
    bgClips: BgClipItem[];
    blocks: TimelineBlock[];
    voiceList: VoiceItem[];
    bgmList: TimelineAudioItem[];
    soundFxList: TimelineAudioItem[];
    memeImageList: TimelineMemeImageItem[];
  } | null>(null);

  useEffect(() => {
    const single = selectedClipId || selectedBlockId || selectedVoiceId || selectedAudioId || selectedMemeId;
    if (single && !selectedIds.includes(single)) {
      setSelectedIds([single]);
    }
  }, [selectedClipId, selectedBlockId, selectedVoiceId, selectedAudioId, selectedMemeId]);

  const [dragAction, setDragAction] = useState<{
    target: "overlay" | "video" | "voice" | "bgm" | "soundfx" | "meme_img";
    type: "move" | "resize-right" | "resize-left";
    id: string;
    startX: number;
    initialStart: number;
    initialDuration: number;
    initialTrimStart: number;
    maxOriginalDuration: number;
    groupId?: string;
    groupInitialStarts?: { [key: string]: number };
  } | null>(null);

  const timelineRef = useRef<HTMLDivElement>(null);

  const bgEnds = bgClips.map((c) => c.startTime + c.duration);
  const blockEnds = blocks.map((b) => b.startTime + b.duration);
  const voiceEnds = voiceList.map((v) => v.startTime + v.duration);
  const memeEnds = memeImageList.map((m) => m.startTime + m.duration);
  const bgmEnds = [...bgmList, ...soundFxList].map((m) => m.startTime + m.duration);
  const totalDuration = parentTotalDuration || Math.max(...bgEnds, ...blockEnds, ...voiceEnds, ...memeEnds, ...bgmEnds, 15);

  const getFullAudioUrl = (url: string): string => {
    if (!url) return "";
    if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("blob:")) return url;
    const clean = url.startsWith("/") ? url : `/${url}`;
    return `http://127.0.0.1:8000${clean}`;
  };

  const handleSelectBlock = (id: string, e: React.MouseEvent, type: "video" | "overlay" | "voice" | "audio" | "meme") => {
    e.stopPropagation();
    if (e.ctrlKey || e.metaKey || e.shiftKey) {
      setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    } else {
      setSelectedIds([id]);
      if (setSelectedClipId) setSelectedClipId(type === "video" ? id : null);
      if (setSelectedBlockId) setSelectedBlockId(type === "overlay" ? id : null);
      if (setSelectedVoiceId) setSelectedVoiceId(type === "voice" ? id : null);
      if (setSelectedAudioId) setSelectedAudioId(type === "audio" ? id : null);
      if (setSelectedMemeId) setSelectedMemeId(type === "meme" ? id : null);
    }
  };

  const hasGroupedSelected = [
    ...bgClips, ...blocks, ...voiceList, ...bgmList, ...soundFxList, ...memeImageList
  ].some((x) => selectedIds.includes(x.id) && x.groupId);

  const handleToggleGroup = useCallback(() => {
    if (selectedIds.length === 0) return;
    if (onRecordHistory) onRecordHistory();

    if (hasGroupedSelected) {
      const unsetGroup = (item: any) => selectedIds.includes(item.id) ? { ...item, groupId: undefined } : item;
      if (setBgClips) setBgClips((prev) => prev.map(unsetGroup));
      if (setBlocks) setBlocks((prev) => prev.map(unsetGroup));
      if (setVoiceList) setVoiceList((prev) => prev.map(unsetGroup));
      if (setBgmList) setBgmList((prev) => prev.map(unsetGroup));
      if (setSoundFxList) setSoundFxList((prev) => prev.map(unsetGroup));
      if (setMemeImageList) setMemeImageList((prev) => prev.map(unsetGroup));
    } else if (selectedIds.length > 1) {
      const newGroupId = "group_" + Date.now();
      const setGroup = (item: any) => selectedIds.includes(item.id) ? { ...item, groupId: newGroupId } : item;
      if (setBgClips) setBgClips((prev) => prev.map(setGroup));
      if (setBlocks) setBlocks((prev) => prev.map(setGroup));
      if (setVoiceList) setVoiceList((prev) => prev.map(setGroup));
      if (setBgmList) setBgmList((prev) => prev.map(setGroup));
      if (setSoundFxList) setSoundFxList((prev) => prev.map(setGroup));
      if (setMemeImageList) setMemeImageList((prev) => prev.map(setGroup));
    }
  }, [selectedIds, hasGroupedSelected, setBgClips, setBlocks, setVoiceList, setBgmList, setSoundFxList, setMemeImageList, onRecordHistory]);

  const handleCopySelected = useCallback(() => {
    if (selectedIds.length === 0) return;
    setCopiedItems({
      bgClips: bgClips.filter((c) => selectedIds.includes(c.id)),
      blocks: blocks.filter((b) => selectedIds.includes(b.id)),
      voiceList: voiceList.filter((v) => selectedIds.includes(v.id)),
      bgmList: bgmList.filter((a) => selectedIds.includes(a.id)),
      soundFxList: soundFxList.filter((a) => selectedIds.includes(a.id)),
      memeImageList: memeImageList.filter((m) => selectedIds.includes(m.id)),
    });
  }, [selectedIds, bgClips, blocks, voiceList, bgmList, soundFxList, memeImageList]);

  const handlePasteAtPlayhead = useCallback(() => {
    if (!copiedItems) return;
    if (onRecordHistory) onRecordHistory();

    const allCopied = [
      ...copiedItems.bgClips,
      ...copiedItems.blocks,
      ...copiedItems.voiceList,
      ...copiedItems.bgmList,
      ...copiedItems.soundFxList,
      ...copiedItems.memeImageList,
    ];
    if (allCopied.length === 0) return;

    const minStartTime = Math.min(...allCopied.map((item) => item.startTime));
    const offset = currentTime - minStartTime;
    const nowTag = Date.now();
    const newSelected: string[] = [];

    if (copiedItems.bgClips.length > 0 && setBgClips) {
      const clones = copiedItems.bgClips.map((c, i) => {
        const id = `bg_clip_${nowTag}_${i}`;
        newSelected.push(id);
        return { ...c, id, startTime: Math.max(0, Number((c.startTime + offset).toFixed(2))) };
      });
      setBgClips((prev) => [...prev, ...clones]);
    }
    if (copiedItems.blocks.length > 0 && setBlocks) {
      const clones = copiedItems.blocks.map((b, i) => {
        const id = `block_${nowTag}_${i}`;
        newSelected.push(id);
        return { ...b, id, startTime: Math.max(0, Number((b.startTime + offset).toFixed(2))) };
      });
      setBlocks((prev) => [...prev, ...clones]);
    }
    if (copiedItems.voiceList.length > 0 && setVoiceList) {
      const clones = copiedItems.voiceList.map((v, i) => {
        const id = `voice_${nowTag}_${i}`;
        newSelected.push(id);
        return { ...v, id, startTime: Math.max(0, Number((v.startTime + offset).toFixed(2))) };
      });
      setVoiceList((prev) => [...prev, ...clones]);
    }
    if (copiedItems.bgmList.length > 0 && setBgmList) {
      const clones = copiedItems.bgmList.map((a, i) => {
        const id = `bgm_${nowTag}_${i}`;
        newSelected.push(id);
        return { ...a, id, startTime: Math.max(0, Number((a.startTime + offset).toFixed(2))) };
      });
      setBgmList((prev) => [...prev, ...clones]);
    }
    if (copiedItems.soundFxList.length > 0 && setSoundFxList) {
      const clones = copiedItems.soundFxList.map((a, i) => {
        const id = `sound_effect_${nowTag}_${i}`;
        newSelected.push(id);
        return { ...a, id, startTime: Math.max(0, Number((a.startTime + offset).toFixed(2))) };
      });
      setSoundFxList((prev) => [...prev, ...clones]);
    }
    if (copiedItems.memeImageList.length > 0 && setMemeImageList) {
      const clones = copiedItems.memeImageList.map((m, i) => {
        const id = `meme_${nowTag}_${i}`;
        newSelected.push(id);
        return { ...m, id, startTime: Math.max(0, Number((m.startTime + offset).toFixed(2))) };
      });
      setMemeImageList((prev) => [...prev, ...clones]);
    }
    setSelectedIds(newSelected);
  }, [copiedItems, currentTime, setBgClips, setBlocks, setVoiceList, setBgmList, setSoundFxList, setMemeImageList, onRecordHistory]);

  const handleSplitAtPlayhead = useCallback(() => {
    if (selectedIds.length === 0) return;
    if (onRecordHistory) onRecordHistory();

    const splitHelper = (item: any, prefix: string) => {
      if (selectedIds.includes(item.id) && currentTime > item.startTime && currentTime < item.startTime + item.duration) {
        const firstDur = Number((currentTime - item.startTime).toFixed(2));
        const secondDur = Number((item.duration - firstDur).toFixed(2));
        const secondTrim = Number(((item.trimStart || 0) + firstDur).toFixed(2));
        const item1 = { ...item, duration: firstDur };
        const item2 = { ...item, id: `${prefix}_${Date.now()}_${Math.random().toString(36).substring(7)}`, startTime: Number(currentTime.toFixed(2)), duration: secondDur, trimStart: secondTrim };
        return [item1, item2];
      }
      return [item];
    };

    if (setBgClips) setBgClips((prev) => prev.flatMap((c) => splitHelper(c, "bg_clip")));
    if (setBlocks) setBlocks((prev) => prev.flatMap((b) => splitHelper(b, "block")));
    if (setVoiceList) setVoiceList((prev) => prev.flatMap((v) => splitHelper(v, "voice")));
    if (setBgmList) setBgmList((prev) => prev.flatMap((a) => splitHelper(a, "bgm")));
    if (setSoundFxList) setSoundFxList((prev) => prev.flatMap((a) => splitHelper(a, "sound_effect")));
  }, [selectedIds, currentTime, setBgClips, setBlocks, setVoiceList, setBgmList, setSoundFxList, onRecordHistory]);

  const handleDeleteSelected = useCallback(() => {
    if (selectedIds.length === 0) return;
    if (onRecordHistory) onRecordHistory();
    if (setBgClips) setBgClips((prev) => prev.filter((c) => !selectedIds.includes(c.id)));
    if (setBlocks) setBlocks((prev) => prev.filter((b) => !selectedIds.includes(b.id)));
    if (setVoiceList) setVoiceList((prev) => prev.filter((v) => !selectedIds.includes(v.id)));
    if (setBgmList) setBgmList((prev) => prev.filter((a) => !selectedIds.includes(a.id)));
    if (setSoundFxList) setSoundFxList((prev) => prev.filter((a) => !selectedIds.includes(a.id)));
    if (setMemeImageList) setMemeImageList((prev) => prev.filter((m) => !selectedIds.includes(m.id)));
    setSelectedIds([]);
  }, [selectedIds, setBgClips, setBlocks, setVoiceList, setBgmList, setSoundFxList, setMemeImageList, onRecordHistory]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (["INPUT", "TEXTAREA"].includes((e.target as HTMLElement)?.tagName)) return;

      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (onUndo && canUndo) onUndo();
        return;
      }
      if (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") || ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "z")) {
        e.preventDefault();
        if (onRedo && canRedo) onRedo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "c") {
        e.preventDefault();
        handleCopySelected();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "v") {
        e.preventDefault();
        handlePasteAtPlayhead();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        handleSplitAtPlayhead();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "g") {
        e.preventDefault();
        handleToggleGroup();
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        handleDeleteSelected();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onUndo, onRedo, canUndo, canRedo, handleCopySelected, handlePasteAtPlayhead, handleSplitAtPlayhead, handleToggleGroup, handleDeleteSelected]);

  // HỆ THỐNG SNAP THÔNG MINH (THỜI ĐIỂM + THỜI LƯỢNG BLOCK LÂN CẬN)
  const getAllBlocksExcept = useCallback((excludeIds: string[] = []) => {
    const all = [
      ...bgClips.map((c) => ({ id: c.id, startTime: c.startTime, duration: c.duration, type: "video" })),
      ...blocks.map((b) => ({ id: b.id, startTime: b.startTime, duration: b.duration, type: "overlay" })),
      ...voiceList.map((v) => ({ id: v.id, startTime: v.startTime, duration: v.duration, type: "voice" })),
      ...bgmList.map((a) => ({ id: a.id, startTime: a.startTime, duration: a.duration, type: "bgm" })),
      ...soundFxList.map((a) => ({ id: a.id, startTime: a.startTime, duration: a.duration, type: "soundfx" })),
      ...memeImageList.map((m) => ({ id: m.id, startTime: m.startTime, duration: m.duration, type: "meme" }))
    ];
    return all.filter((x) => !excludeIds.includes(x.id));
  }, [bgClips, blocks, voiceList, bgmList, soundFxList, memeImageList]);

  const getSnapPoints = useCallback((excludeIds: string[] = []): number[] => {
    const points: Set<number> = new Set([0, currentTime]);
    const others = getAllBlocksExcept(excludeIds);
    others.forEach((x) => {
      points.add(x.startTime);
      points.add(Number((x.startTime + x.duration).toFixed(2)));
    });
    return Array.from(points);
  }, [currentTime, getAllBlocksExcept]);

  // SNAP THỜI GIAN THEO ĐỘ NHẠY PIXEL (10px)
  const applySnapping = useCallback((targetTime: number, excludeIds: string[] = []): { snappedTime: number; snappedX: number | null } => {
    if (!isSnappingEnabled) return { snappedTime: targetTime, snappedX: null };
    const snapPoints = getSnapPoints(excludeIds);
    const snapThresholdSec = 10 / pixelsPerSec; // 10 pixel nhạy
    let closestPoint: number | null = null;
    let minDiff = Infinity;

    for (const pt of snapPoints) {
      const diff = Math.abs(pt - targetTime);
      if (diff <= snapThresholdSec && diff < minDiff) {
        minDiff = diff;
        closestPoint = pt;
      }
    }
    if (closestPoint !== null) {
      return { snappedTime: closestPoint, snappedX: closestPoint * pixelsPerSec };
    }
    return { snappedTime: targetTime, snappedX: null };
  }, [isSnappingEnabled, getSnapPoints, pixelsPerSec]);

  // CƠ CHẾ SNAP CÂN BẰNG THỜI LƯỢNG ĐỀU NHAU (EQUAL DURATION SNAP)
  const applySmartDurationSnap = useCallback((blockStart: number, rawEnd: number, excludeIds: string[] = []): { finalEnd: number; guideX: number | null } => {
    if (!isSnappingEnabled) return { finalEnd: rawEnd, guideX: null };
    
    // 1. Kiểm tra hít mép timeline thời điểm trước
    const edgeSnap = applySnapping(rawEnd, excludeIds);
    if (edgeSnap.snappedX !== null) {
      return { finalEnd: edgeSnap.snappedTime, guideX: edgeSnap.snappedX };
    }

    // 2. Tự động cân bằng đều với độ dài các block khác (Equal Duration Alignment)
    const rawDur = rawEnd - blockStart;
    const others = getAllBlocksExcept(excludeIds);
    const snapThresholdSec = 10 / pixelsPerSec;
    let bestDurMatch: number | null = null;
    let minDiff = Infinity;

    for (const other of others) {
      const diff = Math.abs(other.duration - rawDur);
      if (diff <= snapThresholdSec && diff < minDiff) {
        minDiff = diff;
        bestDurMatch = other.duration;
      }
    }

    if (bestDurMatch !== null) {
      const candidateEnd = Number((blockStart + bestDurMatch).toFixed(2));
      return { finalEnd: candidateEnd, guideX: candidateEnd * pixelsPerSec };
    }

    return { finalEnd: rawEnd, guideX: null };
  }, [isSnappingEnabled, applySnapping, getAllBlocksExcept, pixelsPerSec]);

  useEffect(() => {
    let animId: number;
    let lastTime = performance.now();
    const loop = (now: number) => {
      const delta = (now - lastTime) / 1000;
      lastTime = now;
      if (isPlaying && !isScrubbing) {
        setCurrentTime((prev) => {
          const next = prev + delta;
          if (next >= totalDuration) {
            if (setIsPlaying) setIsPlaying(false);
            return 0;
          }
          return next;
        });
      }
      if (isPlaying) animId = requestAnimationFrame(loop);
    };
    if (isPlaying) animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [isPlaying, isScrubbing, totalDuration, setCurrentTime, setIsPlaying]);

  const updateScrubTime = useCallback((clientX: number) => {
    if (!timelineRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const x = clientX - rect.left + timelineRef.current.scrollLeft;
    let targetTime = Math.max(0, Math.min(totalDuration, x / pixelsPerSec));
    const { snappedTime, snappedX } = applySnapping(targetTime);
    setCurrentTime(snappedTime);
    setSnapGuideLineX(snappedX);
  }, [totalDuration, pixelsPerSec, setCurrentTime, applySnapping]);

  const handleMouseDownPlayhead = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsScrubbing(true);
    if (isPlaying && setIsPlaying) setIsPlaying(false);
    updateScrubTime(e.clientX);
  };

  const handleStartResizeHeight = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizingHeight(true);
    resizeStartY.current = e.clientY;
    resizeStartHeight.current = timelineHeight;
  };

  useEffect(() => {
    const handleMouseMoveHeight = (e: MouseEvent) => {
      if (!isResizingHeight) return;
      const deltaY = resizeStartY.current - e.clientY;
      const newHeight = Math.min(650, Math.max(180, resizeStartHeight.current + deltaY));
      setTimelineHeight(newHeight);
    };
    const handleMouseUpHeight = () => { if (isResizingHeight) setIsResizingHeight(false); };
    if (isResizingHeight) {
      window.addEventListener("mousemove", handleMouseMoveHeight);
      window.addEventListener("mouseup", handleMouseUpHeight);
    }
    return () => {
      window.removeEventListener("mousemove", handleMouseMoveHeight);
      window.removeEventListener("mouseup", handleMouseUpHeight);
    };
  }, [isResizingHeight]);

  // XỬ LÝ RESIZE KÉO DÃN & CÂN BẰNG TỰ ĐỘNG THÔNG MINH
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isScrubbing) {
        requestAnimationFrame(() => updateScrubTime(e.clientX));
      } else if (dragAction) {
        const deltaSeconds = (e.clientX - dragAction.startX) / pixelsPerSec;
        const excludeList = [dragAction.id];
        let activeGuideX: number | null = null;

        if (dragAction.type === "move" && dragAction.groupId && dragAction.groupInitialStarts) {
          const shift = deltaSeconds;
          const updateGroupPos = (item: any) => {
            if (item.groupId === dragAction.groupId && dragAction.groupInitialStarts![item.id] !== undefined) {
              const newStart = Math.max(0, Number((dragAction.groupInitialStarts![item.id] + shift).toFixed(2)));
              return { ...item, startTime: newStart };
            }
            return item;
          };
          if (setBgClips) setBgClips((prev) => prev.map(updateGroupPos));
          if (setBlocks) setBlocks((prev) => prev.map(updateGroupPos));
          if (setVoiceList) setVoiceList((prev) => prev.map(updateGroupPos));
          if (setBgmList) setBgmList((prev) => prev.map(updateGroupPos));
          if (setSoundFxList) setSoundFxList((prev) => prev.map(updateGroupPos));
          if (setMemeImageList) setMemeImageList((prev) => prev.map(updateGroupPos));
          return;
        }

        const calcResizeLeft = (initialStart: number, initialTrim: number, initialDur: number, maxOrig: number, delta: number) => {
          const rawStart = initialStart + delta;
          const snapStart = applySnapping(rawStart, excludeList);
          const effectiveStart = snapStart.snappedX !== null ? snapStart.snappedTime : rawStart;
          activeGuideX = snapStart.snappedX;

          const effectiveDelta = effectiveStart - initialStart;
          const minDelta = -initialTrim;
          const maxDelta = initialDur - 0.5;
          const clampedDelta = Math.max(minDelta, Math.min(maxDelta, effectiveDelta));

          const newStart = Math.max(0, Number((initialStart + clampedDelta).toFixed(2)));
          const newTrim = Number((initialTrim + clampedDelta).toFixed(2));
          const newDur = Number((initialDur - clampedDelta).toFixed(2));
          return { newStart, newTrim, newDur };
        };

        // 1. VIDEO NỀN
        if (dragAction.target === "video" && setBgClips) {
          const maxOriginal = dragAction.maxOriginalDuration;
          setBgClips((prev) =>
            prev.map((clip) => {
              if (clip.id !== dragAction.id) return clip;
              if (dragAction.type === "move") {
                let rawStart = Math.max(0, dragAction.initialStart + deltaSeconds);
                const snapStart = applySnapping(rawStart, excludeList);
                activeGuideX = snapStart.snappedX;
                return { ...clip, startTime: Number((snapStart.snappedX !== null ? snapStart.snappedTime : rawStart).toFixed(2)) };
              }
              if (dragAction.type === "resize-right") {
                const curTrim = clip.trimStart || 0;
                const maxAllowed = Math.max(0.5, maxOriginal - curTrim);
                const rawEnd = dragAction.initialStart + dragAction.initialDuration + deltaSeconds;
                const smart = applySmartDurationSnap(dragAction.initialStart, rawEnd, excludeList);
                activeGuideX = smart.guideX;
                return { ...clip, duration: Number(Math.max(0.5, Math.min(maxAllowed, smart.finalEnd - dragAction.initialStart)).toFixed(2)) };
              }
              if (dragAction.type === "resize-left") {
                const { newStart, newTrim, newDur } = calcResizeLeft(dragAction.initialStart, dragAction.initialTrimStart, dragAction.initialDuration, maxOriginal, deltaSeconds);
                return { ...clip, startTime: newStart, trimStart: newTrim, duration: newDur };
              }
              return clip;
            })
          );
        }

        // 2. NHẠC BGM
        if (dragAction.target === "bgm" && setBgmList) {
          const maxOriginal = dragAction.maxOriginalDuration;
          setBgmList((prev) =>
            prev.map((a) => {
              if (a.id !== dragAction.id) return a;
              if (dragAction.type === "move") {
                let rawStart = Math.max(0, dragAction.initialStart + deltaSeconds);
                const snapStart = applySnapping(rawStart, excludeList);
                activeGuideX = snapStart.snappedX;
                return { ...a, startTime: Number((snapStart.snappedX !== null ? snapStart.snappedTime : rawStart).toFixed(2)) };
              }
              if (dragAction.type === "resize-right") {
                const curTrim = a.trimStart || 0;
                const maxAllowed = Math.max(0.5, maxOriginal - curTrim);
                const rawEnd = dragAction.initialStart + dragAction.initialDuration + deltaSeconds;
                const smart = applySmartDurationSnap(dragAction.initialStart, rawEnd, excludeList);
                activeGuideX = smart.guideX;
                return { ...a, duration: Number(Math.max(0.5, Math.min(maxAllowed, smart.finalEnd - dragAction.initialStart)).toFixed(2)) };
              }
              if (dragAction.type === "resize-left") {
                const { newStart, newTrim, newDur } = calcResizeLeft(dragAction.initialStart, dragAction.initialTrimStart, dragAction.initialDuration, maxOriginal, deltaSeconds);
                return { ...a, startTime: newStart, trimStart: newTrim, duration: newDur };
              }
              return a;
            })
          );
        }

        // 3. SOUND FX
        if (dragAction.target === "soundfx" && setSoundFxList) {
          const maxOriginal = dragAction.maxOriginalDuration;
          setSoundFxList((prev) =>
            prev.map((a) => {
              if (a.id !== dragAction.id) return a;
              if (dragAction.type === "move") {
                let rawStart = Math.max(0, dragAction.initialStart + deltaSeconds);
                const snapStart = applySnapping(rawStart, excludeList);
                activeGuideX = snapStart.snappedX;
                return { ...a, startTime: Number((snapStart.snappedX !== null ? snapStart.snappedTime : rawStart).toFixed(2)) };
              }
              if (dragAction.type === "resize-right") {
                const curTrim = a.trimStart || 0;
                const maxAllowed = Math.max(0.5, maxOriginal - curTrim);
                const rawEnd = dragAction.initialStart + dragAction.initialDuration + deltaSeconds;
                const smart = applySmartDurationSnap(dragAction.initialStart, rawEnd, excludeList);
                activeGuideX = smart.guideX;
                return { ...a, duration: Number(Math.max(0.5, Math.min(maxAllowed, smart.finalEnd - dragAction.initialStart)).toFixed(2)) };
              }
              if (dragAction.type === "resize-left") {
                const { newStart, newTrim, newDur } = calcResizeLeft(dragAction.initialStart, dragAction.initialTrimStart, dragAction.initialDuration, maxOriginal, deltaSeconds);
                return { ...a, startTime: newStart, trimStart: newTrim, duration: newDur };
              }
              return a;
            })
          );
        }

        // 4. VOICE TTS
        if (dragAction.target === "voice" && setVoiceList) {
          const maxOriginal = dragAction.maxOriginalDuration;
          setVoiceList((prev) =>
            prev.map((v) => {
              if (v.id !== dragAction.id) return v;
              if (dragAction.type === "move") {
                let rawStart = Math.max(0, dragAction.initialStart + deltaSeconds);
                const snapStart = applySnapping(rawStart, excludeList);
                activeGuideX = snapStart.snappedX;
                return { ...v, startTime: Number((snapStart.snappedX !== null ? snapStart.snappedTime : rawStart).toFixed(2)) };
              }
              if (dragAction.type === "resize-right") {
                const curTrim = v.trimStart || 0;
                const maxAllowed = Math.max(0.5, maxOriginal - curTrim);
                const rawEnd = dragAction.initialStart + dragAction.initialDuration + deltaSeconds;
                const smart = applySmartDurationSnap(dragAction.initialStart, rawEnd, excludeList);
                activeGuideX = smart.guideX;
                return { ...v, duration: Number(Math.max(0.5, Math.min(maxAllowed, smart.finalEnd - dragAction.initialStart)).toFixed(2)) };
              }
              if (dragAction.type === "resize-left") {
                const { newStart, newTrim, newDur } = calcResizeLeft(dragAction.initialStart, dragAction.initialTrimStart || 0, dragAction.initialDuration, maxOriginal, deltaSeconds);
                return { ...v, startTime: newStart, trimStart: newTrim, duration: newDur };
              }
              return v;
            })
          );
        }

        // 5. ẢNH COMMENT
        if (dragAction.target === "overlay" && setBlocks) {
          setBlocks((prev) =>
            prev.map((b) => {
              if (b.id !== dragAction.id) return b;
              if (dragAction.type === "move") {
                let rawStart = Math.max(0, dragAction.initialStart + deltaSeconds);
                const snapStart = applySnapping(rawStart, excludeList);
                activeGuideX = snapStart.snappedX;
                return { ...b, startTime: Number((snapStart.snappedX !== null ? snapStart.snappedTime : rawStart).toFixed(2)) };
              }
              if (dragAction.type === "resize-right") {
                const rawEnd = dragAction.initialStart + dragAction.initialDuration + deltaSeconds;
                const smart = applySmartDurationSnap(dragAction.initialStart, rawEnd, excludeList);
                activeGuideX = smart.guideX;
                return { ...b, duration: Math.max(0.5, Number((smart.finalEnd - dragAction.initialStart).toFixed(2))) };
              }
              if (dragAction.type === "resize-left") {
                const rawStart = dragAction.initialStart + deltaSeconds;
                const snapStart = applySnapping(rawStart, excludeList);
                activeGuideX = snapStart.snappedX;
                const finalStart = snapStart.snappedX !== null ? snapStart.snappedTime : rawStart;
                const diff = finalStart - dragAction.initialStart;
                return { ...b, startTime: Number(finalStart.toFixed(2)), duration: Math.max(0.5, Number((dragAction.initialDuration - diff).toFixed(2))) };
              }
              return b;
            })
          );
        }

        setSnapGuideLineX(activeGuideX);
      }
    };

    const handleMouseUp = () => {
      setSnapGuideLineX(null);
      if (isScrubbing) setIsScrubbing(false);
      if (dragAction) {
        if (onRecordHistory) onRecordHistory();
        setDragAction(null);
      }
    };

    if (isScrubbing || dragAction) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    }
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isScrubbing, dragAction, pixelsPerSec, updateScrubTime, setBgClips, setBlocks, setVoiceList, setBgmList, setSoundFxList, onRecordHistory, applySnapping, applySmartDurationSnap]);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, "0");
    const s = Math.floor(secs % 60).toString().padStart(2, "0");
    const f = Math.floor((secs % 1) * 30).toString().padStart(2, "0");
    return `${m}:${s}:${f}`;
  };

  return (
    <div
      style={{ height: isCollapsed ? "42px" : `${timelineHeight}px` }}
      className="w-full bg-[#121316] border-t border-slate-800 flex flex-col select-none text-slate-300 relative transition-all duration-75"
    >
      <div
        onMouseDown={handleStartResizeHeight}
        title="Kéo lên / xuống để chỉnh độ cao timeline"
        className={`w-full h-1.5 absolute -top-1 left-0 right-0 z-50 cursor-row-resize flex items-center justify-center group hover:bg-cyan-500/80 transition-colors ${
          isResizingHeight ? "bg-cyan-500" : "bg-transparent"
        }`}
      >
        <div className="w-10 h-0.5 bg-slate-600 group-hover:bg-cyan-200 rounded-full transition-colors" />
      </div>

      {/* TOOLBAR */}
      <div className="h-10 px-4 bg-[#18191c] border-b border-slate-800 flex items-center justify-between z-30 shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsPlaying && setIsPlaying(!isPlaying)}
            className="flex items-center gap-1.5 px-3 py-1 bg-cyan-600 hover:bg-cyan-500 active:scale-95 text-white font-medium rounded text-xs transition"
          >
            {isPlaying ? <Pause size={13} fill="currentColor" /> : <Play size={13} fill="currentColor" />}
            <span>{isPlaying ? "Tạm Dừng" : "Phát Tất Cả"}</span>
          </button>

          <button
            onClick={() => {
              if (setIsPlaying) setIsPlaying(false);
              setCurrentTime(0);
            }}
            title="Về đầu video"
            className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded transition"
          >
            <RotateCcw size={13} />
          </button>

          <div className="h-4 w-[1px] bg-slate-800 mx-0.5" />

          <button
            onClick={() => setIsSnappingEnabled(!isSnappingEnabled)}
            title={isSnappingEnabled ? "Từ tính & Cân bằng tự động: ĐANG BẬT" : "Từ tính: ĐÃ TẮT"}
            className={`p-1.5 rounded text-xs transition flex items-center gap-1 ${
              isSnappingEnabled ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 shadow-sm" : "bg-slate-800 text-slate-400 hover:text-white"
            }`}
          >
            <Magnet size={13} />
          </button>

          <button onClick={onUndo} disabled={!canUndo} title="Hoàn tác (Ctrl + Z)" className="p-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 rounded text-slate-300">
            <Undo2 size={13} />
          </button>
          <button onClick={onRedo} disabled={!canRedo} title="Làm lại (Ctrl + Y)" className="p-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 rounded text-slate-300">
            <Redo2 size={13} />
          </button>

          <div className="h-4 w-[1px] bg-slate-800 mx-0.5" />

          <button
            onClick={handleCopySelected}
            disabled={selectedIds.length === 0}
            title="Sao chép block đã chọn (Ctrl + C)"
            className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-cyan-900/60 border border-slate-700 text-slate-300 rounded text-xs transition disabled:opacity-40"
          >
            <Copy size={13} />
            <span>Copy (Ctrl+C)</span>
          </button>

          <button
            onClick={handlePasteAtPlayhead}
            disabled={!copiedItems}
            title="Dán block tại kim hiện tại (Ctrl + V)"
            className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-cyan-900/60 border border-slate-700 text-slate-300 rounded text-xs transition disabled:opacity-40"
          >
            <span>Paste (Ctrl+V)</span>
          </button>

          <button
            onClick={handleSplitAtPlayhead}
            disabled={selectedIds.length === 0}
            title="Cắt đôi block (Ctrl + B)"
            className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-cyan-900/60 border border-slate-700 text-slate-300 rounded text-xs transition disabled:opacity-40"
          >
            <Scissors size={13} />
            <span>Tách Clip (Ctrl+B)</span>
          </button>

          <button
            onClick={handleDeleteSelected}
            disabled={selectedIds.length === 0}
            title="Xóa block đang chọn (Delete)"
            className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-rose-950/60 border border-slate-700 text-slate-400 hover:text-rose-400 rounded text-xs transition disabled:opacity-40"
          >
            <Trash2 size={13} />
            <span>Xóa (Del)</span>
          </button>

          <div className="h-4 w-[1px] bg-slate-800 mx-0.5" />

          <button
            onClick={handleToggleGroup}
            disabled={selectedIds.length === 0 || (selectedIds.length < 2 && !hasGroupedSelected)}
            className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-semibold border transition shadow-sm ${
              hasGroupedSelected
                ? "bg-rose-950/60 text-rose-300 border-rose-500/80 hover:bg-rose-900/60" 
                : selectedIds.length > 1
                ? "bg-[#382b0e] text-[#f7b928] border-[#f7b928] animate-pulse" 
                : "bg-slate-900/50 text-slate-500 border-slate-800 cursor-not-allowed"
            }`}
          >
            {hasGroupedSelected ? <Unlink size={13} /> : <Link size={13} />}
            <span>{hasGroupedSelected ? "Rã Nhóm (Ctrl+G)" : "Khóa Nhóm (Ctrl+G)"}</span>
          </button>

          <div className="font-mono text-xs flex items-center gap-1 ml-1.5">
            <span className="text-cyan-400 font-semibold">{formatTime(currentTime)}</span>
            <span className="text-slate-600">/</span>
            <span className="text-slate-400">{formatTime(totalDuration)}</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <button onClick={() => setPixelsPerSec((p) => Math.max(20, p - 10))} className="p-1 hover:bg-slate-800 text-slate-400 rounded"><ZoomOut size={13} /></button>
            <span className="text-[11px] font-mono text-slate-400">{pixelsPerSec}px/s</span>
            <button onClick={() => setPixelsPerSec((p) => Math.min(120, p + 10))} className="p-1 hover:bg-slate-800 text-slate-400 rounded"><ZoomIn size={13} /></button>
          </div>

          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-xs text-slate-300 transition"
          >
            {isCollapsed ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            <span>{isCollapsed ? "Hiện Timeline" : "Ẩn Timeline"}</span>
          </button>
        </div>
      </div>

      {/* TRACKS CONTAINER */}
      {!isCollapsed && (
        <div className="flex flex-1 overflow-hidden transition-all duration-75 relative">
          {/* CỘT TÊN TRACK (TRÁI) */}
          <div className="w-28 bg-[#151619] border-r border-slate-800 flex flex-col flex-shrink-0 z-10 text-[11px] font-medium text-slate-400 select-none">
            <div className="h-6 flex items-center px-3 border-b border-slate-800/80 text-slate-500 font-mono text-[10px]">Thước Đo</div>
            <div className="h-12 border-b border-slate-800/60 flex items-center gap-2 px-3 hover:text-white"><Smile size={13} className="text-pink-400 shrink-0" /><span className="truncate">Ảnh Meme</span></div>
            <div className="h-12 border-b border-slate-800/60 flex items-center gap-2 px-3 hover:text-white"><Layers size={13} className="text-amber-400 shrink-0" /><span className="truncate">Ảnh Comment</span></div>
            <div className="h-12 border-b border-slate-800/60 flex items-center gap-2 px-3 hover:text-white"><Film size={13} className="text-cyan-400 shrink-0" /><span className="truncate">Video Nền</span></div>
            <div className="h-10 border-b border-slate-800/60 flex items-center gap-2 px-3 hover:text-white"><Volume2 size={13} className="text-emerald-400 shrink-0" /><span className="truncate">Voice TTS</span></div>
            <div className="h-10 border-b border-slate-800/60 flex items-center gap-2 px-3 hover:text-white"><Music size={13} className="text-indigo-400 shrink-0" /><span className="truncate">Nhạc (BGM)</span></div>
            <div className="h-10 flex items-center gap-2 px-3 hover:text-white"><Volume2 size={13} className="text-teal-400 shrink-0" /><span className="truncate">Meme Sound</span></div>
          </div>

          {/* VÙNG CHỨA BLOCK (PHẢI) */}
          <div ref={timelineRef} onMouseDown={handleMouseDownPlayhead} className="flex-1 relative overflow-x-auto overflow-y-auto bg-[#0d0e11] cursor-pointer">
            {/* ĐƯỜNG DÓNG SNAP TỪ TÍNH & CÂN BẰNG TỰ ĐỘNG */}
            {snapGuideLineX !== null && (
              <div style={{ left: `${snapGuideLineX}px` }} className="absolute top-0 bottom-0 min-h-full w-[1.5px] bg-amber-400 z-50 pointer-events-none shadow-[0_0_10px_#f59e0b]" />
            )}

            {/* KIM PLAYHEAD */}
            <div
              style={{
                left: `${currentTime * pixelsPerSec}px`,
                transition: isScrubbing || dragAction ? "none" : "left 0.05s linear",
              }}
              className="absolute top-0 min-h-full h-full z-40 flex flex-col items-center pointer-events-none"
            >
              <div onMouseDown={handleMouseDownPlayhead} className="w-3.5 h-3.5 bg-white shadow-md border border-slate-700 rounded-sm transform rotate-45 -mt-1.5 cursor-ew-resize pointer-events-auto hover:scale-125 transition-transform" />
              <div className="w-[1.5px] flex-1 min-h-[480px] bg-white shadow-[0_0_8px_rgba(255,255,255,0.9)]" />
            </div>

            {/* RULER */}
            <div style={{ width: `${totalDuration * pixelsPerSec + 200}px` }} className="h-6 border-b border-slate-800/80 relative flex items-end text-[9px] font-mono text-slate-500 select-none bg-[#101216]">
              {Array.from({ length: Math.ceil(totalDuration) + 2 }).map((_, i) => (
                <div key={i} style={{ left: `${i * pixelsPerSec}px` }} className="absolute bottom-0 flex flex-col items-center pointer-events-none">
                  <div className={`w-[1px] ${i % 5 === 0 ? "h-3 bg-slate-500" : "h-1.5 bg-slate-700"}`} />
                  {i % 5 === 0 && <span className="mb-0.5 ml-1">{i}s</span>}
                </div>
              ))}
            </div>

            {/* TRACK 0: ẢNH MEME */}
            <div style={{ width: `${totalDuration * pixelsPerSec + 200}px` }} className="h-12 border-b border-slate-800/60 relative flex items-center px-1 bg-pink-950/10">
              {memeImageList.map((meme) => {
                const isSelected = selectedIds.includes(meme.id);
                const isVid = meme.type === "video" || /\.(mp4|mov|webm|mkv)(\?.*)?$/i.test(meme.url);
                return (
                  <div
                    key={meme.id}
                    onClick={(e) => handleSelectBlock(meme.id, e, "meme")}
                    style={{ left: `${meme.startTime * pixelsPerSec}px`, width: `${meme.duration * pixelsPerSec}px` }}
                    className={`absolute h-9 rounded-md p-1 flex items-center shadow border transition cursor-pointer ${
                      isSelected ? "bg-pink-600/70 border-white ring-2 ring-white z-20" : "bg-pink-600/30 border-pink-400"
                    }`}
                  >
                    {isVid ? (
                      <video src={meme.url} className="h-full w-7 object-cover rounded pointer-events-none mr-1" />
                    ) : (
                      <img src={meme.url} alt="meme" className="h-full w-7 object-contain rounded pointer-events-none mr-1" />
                    )}
                    <span className="text-[10px] text-pink-200 truncate">{meme.duration}s</span>
                  </div>
                );
              })}
            </div>

            {/* TRACK 1: ẢNH COMMENT */}
            <div style={{ width: `${totalDuration * pixelsPerSec + 200}px` }} className="h-12 border-b border-slate-800/60 relative flex items-center px-1 bg-slate-950/20">
              {blocks.map((b) => {
                const isSelected = selectedIds.includes(b.id);
                const isGrouped = !!b.groupId;
                return (
                  <div
                    key={b.id}
                    onClick={(e) => handleSelectBlock(b.id, e, "overlay")}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      handleSelectBlock(b.id, e, "overlay");
                      const groupStarts: { [k: string]: number } = {};
                      if (b.groupId) {
                        [...bgClips, ...blocks, ...voiceList, ...bgmList, ...soundFxList, ...memeImageList].forEach((x) => {
                          if (x.groupId === b.groupId) groupStarts[x.id] = x.startTime;
                        });
                      }
                      setDragAction({
                        target: "overlay", type: "move", id: b.id, startX: e.clientX,
                        initialStart: b.startTime, initialDuration: b.duration, initialTrimStart: 0,
                        maxOriginalDuration: 999999, groupId: b.groupId, groupInitialStarts: groupStarts
                      });
                    }}
                    style={{ left: `${b.startTime * pixelsPerSec}px`, width: `${b.duration * pixelsPerSec}px` }}
                    className={`absolute h-9 rounded-md p-1 flex items-center shadow-lg group transition cursor-grab active:cursor-grabbing border ${
                      isSelected ? "bg-amber-600/70 border-white ring-2 ring-white z-20" : isGrouped ? "bg-amber-600/40 border-amber-300 ring-1 ring-amber-400/60 z-15" : "bg-amber-600/30 border-amber-400/80 hover:border-amber-300 z-10"
                    }`}
                  >
                    <div onMouseDown={(e) => { e.stopPropagation(); setDragAction({ target: "overlay", type: "resize-left", id: b.id, startX: e.clientX, initialStart: b.startTime, initialDuration: b.duration, initialTrimStart: 0, maxOriginalDuration: 999999 }); }} className="absolute left-0 top-0 bottom-0 w-2.5 hover:w-3.5 bg-amber-400/70 hover:bg-amber-300 cursor-ew-resize rounded-l-md transition-all opacity-0 group-hover:opacity-100" />
                    <div className="flex items-center gap-1.5 overflow-hidden flex-1 pointer-events-none px-1">
                      {b.image_url && <img src={b.image_url} className="h-6 w-6 object-cover rounded pointer-events-none select-none" />}
                      <span className="text-[10px] text-amber-200 font-semibold truncate">{b.duration}s {isGrouped && "🔗"}</span>
                    </div>
                    <div onMouseDown={(e) => { e.stopPropagation(); setDragAction({ target: "overlay", type: "resize-right", id: b.id, startX: e.clientX, initialStart: b.startTime, initialDuration: b.duration, initialTrimStart: 0, maxOriginalDuration: 999999 }); }} className="absolute right-0 top-0 bottom-0 w-2.5 hover:w-3.5 bg-amber-400/70 hover:bg-amber-300 cursor-ew-resize rounded-r-md transition-all opacity-0 group-hover:opacity-100" />
                  </div>
                );
              })}
            </div>

            {/* TRACK 2: VIDEO NỀN */}
            <div style={{ width: `${totalDuration * pixelsPerSec + 200}px` }} className="h-12 border-b border-slate-800/60 relative flex items-center px-1 hover:bg-teal-950/20 transition-colors">
              {bgClips.map((clip) => {
                const isSelected = selectedIds.includes(clip.id);
                const isGrouped = !!clip.groupId;
                const totalThumbs = Math.max(1, (clip.thumbs || []).length);
                const singleFrameWidth = (clip.maxDuration * pixelsPerSec) / totalThumbs;
                return (
                  <div
                    key={clip.id}
                    onClick={(e) => handleSelectBlock(clip.id, e, "video")}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      handleSelectBlock(clip.id, e, "video");
                      const groupStarts: { [k: string]: number } = {};
                      if (clip.groupId) {
                        [...bgClips, ...blocks, ...voiceList, ...bgmList, ...soundFxList, ...memeImageList].forEach((x) => {
                          if (x.groupId === clip.groupId) groupStarts[x.id] = x.startTime;
                        });
                      }
                      setDragAction({
                        target: "video", type: "move", id: clip.id, startX: e.clientX,
                        initialStart: clip.startTime, initialDuration: clip.duration, initialTrimStart: clip.trimStart || 0,
                        maxOriginalDuration: clip.maxDuration, groupId: clip.groupId, groupInitialStarts: groupStarts
                      });
                    }}
                    style={{ left: `${clip.startTime * pixelsPerSec}px`, width: `${clip.duration * pixelsPerSec}px` }}
                    className={`absolute h-9 rounded-md overflow-hidden flex items-center shadow-lg group cursor-grab active:cursor-grabbing border ${
                      isSelected ? "bg-teal-950/90 border-white ring-2 ring-white z-20" : isGrouped ? "bg-teal-950/80 border-cyan-300 ring-1 ring-cyan-400/60 z-15" : "bg-teal-950/60 border-teal-500 hover:border-teal-300 z-10"
                    }`}
                  >
                    <div onMouseDown={(e) => { e.stopPropagation(); setDragAction({ target: "video", type: "resize-left", id: clip.id, startX: e.clientX, initialStart: clip.startTime, initialDuration: clip.duration, initialTrimStart: clip.trimStart || 0, maxOriginalDuration: clip.maxDuration }); }} className="absolute left-0 top-0 bottom-0 w-3 bg-teal-400/80 hover:bg-teal-300 cursor-ew-resize z-20 opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div style={{ position: "absolute", left: `-${(clip.trimStart || 0) * pixelsPerSec}px`, width: `${clip.maxDuration * pixelsPerSec}px`, height: "100%" }} className="flex pointer-events-none overflow-hidden">
                      {clip.thumbs && clip.thumbs.length > 0 ? (
                        clip.thumbs.map((thumbUrl, idx) => (
                          <div key={idx} style={{ width: `${singleFrameWidth}px`, minWidth: `${singleFrameWidth}px` }} className="h-full border-r border-teal-900/50 overflow-hidden flex-shrink-0">
                            <img src={thumbUrl} alt="Frame" className="h-full w-full object-cover pointer-events-none select-none" />
                          </div>
                        ))
                      ) : (
                        <div className="px-3 text-xs text-teal-300 font-medium flex items-center truncate">{clip.name}</div>
                      )}
                    </div>
                    <div className="absolute top-0.5 left-3 bg-black/85 px-1.5 py-0.5 rounded text-[9px] text-teal-200 font-mono pointer-events-none z-10 shadow truncate max-w-[80%]">{clip.name} {isGrouped && "🔗"}</div>
                    <div onMouseDown={(e) => { e.stopPropagation(); setDragAction({ target: "video", type: "resize-right", id: clip.id, startX: e.clientX, initialStart: clip.startTime, initialDuration: clip.duration, initialTrimStart: clip.trimStart || 0, maxOriginalDuration: clip.maxDuration }); }} className="absolute right-0 top-0 bottom-0 w-3 bg-teal-400/80 hover:bg-teal-300 cursor-ew-resize z-20 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                );
              })}
            </div>

            {/* TRACK 3: VOICE TTS + WAVEFORM */}
            <div style={{ width: `${totalDuration * pixelsPerSec + 200}px` }} className="h-10 border-b border-slate-800/60 relative flex items-center px-1">
              {voiceList.map((v) => {
                const isSelected = selectedIds.includes(v.id);
                const isGrouped = !!v.groupId;
                const blockWidth = v.duration * pixelsPerSec;
                return (
                  <div
                    key={v.id}
                    onClick={(e) => handleSelectBlock(v.id, e, "voice")}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      handleSelectBlock(v.id, e, "voice");
                      const groupStarts: { [k: string]: number } = {};
                      if (v.groupId) {
                        [...bgClips, ...blocks, ...voiceList, ...bgmList, ...soundFxList, ...memeImageList].forEach((x) => {
                          if (x.groupId === v.groupId) groupStarts[x.id] = x.startTime;
                        });
                      }
                      setDragAction({
                        target: "voice", type: "move", id: v.id, startX: e.clientX,
                        initialStart: v.startTime, initialDuration: v.duration, initialTrimStart: v.trimStart || 0,
                        maxOriginalDuration: v.maxDuration, groupId: v.groupId, groupInitialStarts: groupStarts
                      });
                    }}
                    style={{ left: `${v.startTime * pixelsPerSec}px`, width: `${blockWidth}px` }}
                    className={`absolute h-7 rounded px-2 flex items-center justify-between text-[10px] shadow group cursor-grab active:cursor-grabbing border overflow-hidden ${
                      isSelected ? "bg-emerald-950/95 border-white ring-2 ring-white z-20 text-white" : isGrouped ? "bg-emerald-950/80 border-emerald-300 ring-1 ring-emerald-400/60 z-15 text-emerald-200" : "bg-emerald-950/70 border-emerald-500 text-emerald-300 z-10"
                    }`}
                  >
                    <AudioWaveformSvg id={v.id} width={blockWidth} color="#34d399" seedStr={v.name} />
                    <div onMouseDown={(e) => { e.stopPropagation(); setDragAction({ target: "voice", type: "resize-left", id: v.id, startX: e.clientX, initialStart: v.startTime, initialDuration: v.duration, initialTrimStart: v.trimStart || 0, maxOriginalDuration: v.maxDuration }); }} className="absolute left-0 top-0 bottom-0 w-2.5 bg-emerald-400 hover:bg-emerald-300 cursor-ew-resize opacity-0 group-hover:opacity-100 z-10" />
                    <span className="truncate z-10 font-medium drop-shadow-sm">{v.name} ({v.duration}s) {isGrouped && "🔗"}</span>
                    <div onMouseDown={(e) => { e.stopPropagation(); setDragAction({ target: "voice", type: "resize-right", id: v.id, startX: e.clientX, initialStart: v.startTime, initialDuration: v.duration, initialTrimStart: v.trimStart || 0, maxOriginalDuration: v.maxDuration }); }} className="absolute right-0 top-0 bottom-0 w-2.5 bg-emerald-400 hover:bg-emerald-300 cursor-ew-resize opacity-0 group-hover:opacity-100 z-10" />
                  </div>
                );
              })}
            </div>

            {/* TRACK 4: NHẠC NỀN BGM + WAVEFORM */}
            <div style={{ width: `${totalDuration * pixelsPerSec + 200}px` }} className="h-10 border-b border-slate-800/60 relative flex items-center px-1 bg-indigo-950/10">
              {bgmList.map((bgm) => {
                const isSelected = selectedIds.includes(bgm.id);
                const isGrouped = !!bgm.groupId;
                const vol = bgm.volume !== undefined ? bgm.volume : 100;
                const blockWidth = bgm.duration * pixelsPerSec;
                return (
                  <div
                    key={bgm.id}
                    onClick={(e) => handleSelectBlock(bgm.id, e, "audio")}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      handleSelectBlock(bgm.id, e, "audio");
                      const groupStarts: { [k: string]: number } = {};
                      if (bgm.groupId) {
                        [...bgClips, ...blocks, ...voiceList, ...bgmList, ...soundFxList, ...memeImageList].forEach((x) => {
                          if (x.groupId === bgm.groupId) groupStarts[x.id] = x.startTime;
                        });
                      }
                      setDragAction({
                        target: "bgm", type: "move", id: bgm.id, startX: e.clientX,
                        initialStart: bgm.startTime, initialDuration: bgm.duration, initialTrimStart: bgm.trimStart || 0,
                        maxOriginalDuration: bgm.maxDuration, groupId: bgm.groupId, groupInitialStarts: groupStarts
                      });
                    }}
                    style={{ left: `${bgm.startTime * pixelsPerSec}px`, width: `${blockWidth}px` }}
                    className={`absolute h-7 rounded px-2 flex items-center justify-between text-[10px] shadow group border cursor-grab active:cursor-grabbing overflow-hidden ${
                      isSelected ? "bg-indigo-900 border-white ring-2 ring-white z-20 text-white" : isGrouped ? "bg-indigo-950 border-indigo-300 ring-1 ring-indigo-400 z-15" : "bg-indigo-950/80 border-indigo-500 text-indigo-300 z-10"
                    }`}
                  >
                    <AudioWaveformSvg id={bgm.id} width={blockWidth} color="#818cf8" seedStr={bgm.name} />
                    <div onMouseDown={(e) => { e.stopPropagation(); setDragAction({ target: "bgm", type: "resize-left", id: bgm.id, startX: e.clientX, initialStart: bgm.startTime, initialDuration: bgm.duration, initialTrimStart: bgm.trimStart || 0, maxOriginalDuration: bgm.maxDuration }); }} className="absolute left-0 top-0 bottom-0 w-2.5 bg-indigo-400 hover:bg-indigo-300 cursor-ew-resize opacity-0 group-hover:opacity-100 rounded-l z-10" />
                    <span className="truncate mr-1 font-medium z-10 drop-shadow-sm">🎵 {bgm.name} ({bgm.duration}s | {vol}%) {isGrouped && "🔗"}</span>
                    <div onMouseDown={(e) => { e.stopPropagation(); setDragAction({ target: "bgm", type: "resize-right", id: bgm.id, startX: e.clientX, initialStart: bgm.startTime, initialDuration: bgm.duration, initialTrimStart: bgm.trimStart || 0, maxOriginalDuration: bgm.maxDuration }); }} className="absolute right-0 top-0 bottom-0 w-2.5 bg-indigo-400 hover:bg-indigo-300 cursor-ew-resize opacity-0 group-hover:opacity-100 rounded-r z-10" />
                  </div>
                );
              })}
            </div>

            {/* TRACK 5: MEME SOUND + WAVEFORM */}
            <div style={{ width: `${totalDuration * pixelsPerSec + 200}px` }} className="h-10 relative flex items-center px-1 bg-teal-950/10">
              {soundFxList.map((fx) => {
                const isSelected = selectedIds.includes(fx.id);
                const isGrouped = !!fx.groupId;
                const vol = fx.volume !== undefined ? fx.volume : 100;
                const blockWidth = fx.duration * pixelsPerSec;
                return (
                  <div
                    key={fx.id}
                    onClick={(e) => handleSelectBlock(fx.id, e, "audio")}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      handleSelectBlock(fx.id, e, "audio");
                      const groupStarts: { [k: string]: number } = {};
                      if (fx.groupId) {
                        [...bgClips, ...blocks, ...voiceList, ...bgmList, ...soundFxList, ...memeImageList].forEach((x) => {
                          if (x.groupId === fx.groupId) groupStarts[x.id] = x.startTime;
                        });
                      }
                      setDragAction({
                        target: "soundfx", type: "move", id: fx.id, startX: e.clientX,
                        initialStart: fx.startTime, initialDuration: fx.duration, initialTrimStart: fx.trimStart || 0,
                        maxOriginalDuration: fx.maxDuration, groupId: fx.groupId, groupInitialStarts: groupStarts
                      });
                    }}
                    style={{ left: `${fx.startTime * pixelsPerSec}px`, width: `${blockWidth}px` }}
                    className={`absolute h-7 rounded px-2 flex items-center justify-between text-[10px] shadow group border cursor-grab active:cursor-grabbing overflow-hidden ${
                      isSelected ? "bg-teal-900 border-white ring-2 ring-white z-20 text-white" : isGrouped ? "bg-teal-950 border-teal-300 ring-1 ring-teal-400 z-15" : "bg-teal-950/80 border-teal-500 text-teal-300 z-10"
                    }`}
                  >
                    <AudioWaveformSvg id={fx.id} width={blockWidth} color="#2dd4bf" seedStr={fx.name} />
                    <div onMouseDown={(e) => { e.stopPropagation(); setDragAction({ target: "soundfx", type: "resize-left", id: fx.id, startX: e.clientX, initialStart: fx.startTime, initialDuration: fx.duration, initialTrimStart: fx.trimStart || 0, maxOriginalDuration: fx.maxDuration }); }} className="absolute left-0 top-0 bottom-0 w-2.5 bg-teal-400 hover:bg-teal-300 cursor-ew-resize opacity-0 group-hover:opacity-100 rounded-l z-10" />
                    <span className="truncate mr-1 font-medium z-10 drop-shadow-sm">🔊 {fx.name} ({fx.duration}s | {vol}%) {isGrouped && "🔗"}</span>
                    <div onMouseDown={(e) => { e.stopPropagation(); setDragAction({ target: "soundfx", type: "resize-right", id: fx.id, startX: e.clientX, initialStart: fx.startTime, initialDuration: fx.duration, initialTrimStart: fx.trimStart || 0, maxOriginalDuration: fx.maxDuration }); }} className="absolute right-0 top-0 bottom-0 w-2.5 bg-teal-400 hover:bg-teal-300 cursor-ew-resize opacity-0 group-hover:opacity-100 rounded-r z-10" />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* AUDIO ENGINE ĐỒNG BỘ CHO VOICE */}
      {voiceList.map((voice) => {
        const fullUrl = getFullAudioUrl(voice.url);
        const speed = voice.speed || 1.0;
        const isInside = currentTime >= voice.startTime && currentTime <= (voice.startTime + voice.duration);
        const targetOffset = ((currentTime - voice.startTime) * speed) + (voice.trimStart || 0);

        return (
          <audio
            key={"voice_elem_" + voice.id}
            ref={(el) => {
              if (!el) return;
              if (el.playbackRate !== speed) {
                el.playbackRate = speed;
              }
              if (isPlaying && isInside) {
                if (Math.abs(el.currentTime - targetOffset) > 0.3) {
                  el.currentTime = Math.max(0, targetOffset);
                }
                if (el.paused) {
                  el.play().catch(() => {});
                }
              } else {
                if (!el.paused) {
                  el.pause();
                }
              }
            }}
            src={fullUrl}
            preload="auto"
            className="hidden"
          />
        );
      })}

      {/* AUDIO ENGINE ĐỒNG BỘ CHO BGM & SOUND FX */}
      {[...bgmList, ...soundFxList].map((audio) => {
        const fullUrl = getFullAudioUrl(audio.url);
        const speed = audio.speed || 1.0;
        const isInside = currentTime >= audio.startTime && currentTime <= (audio.startTime + audio.duration);
        const volumeMultiplier = Math.min(1.0, (audio.volume !== undefined ? audio.volume : 100) / 100);
        const targetOffset = ((currentTime - audio.startTime) * speed) + (audio.trimStart || 0);

        return (
          <audio
            key={"audio_elem_" + audio.id}
            ref={(el) => {
              if (!el) return;
              el.volume = volumeMultiplier;
              if (el.playbackRate !== speed) {
                el.playbackRate = speed;
              }
              if (isPlaying && isInside) {
                if (Math.abs(el.currentTime - targetOffset) > 0.3) {
                  el.currentTime = Math.max(0, targetOffset);
                }
                if (el.paused) {
                  el.play().catch(() => {});
                }
              } else {
                if (!el.paused) {
                  el.pause();
                }
              }
            }}
            src={fullUrl}
            preload="auto"
            className="hidden"
          />
        );
      })}
    </div>
  );
};

export default Timeline;
