"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import { 
  Play, Pause, RotateCcw, Film, Layers, Volume2, Trash2, ZoomIn, ZoomOut, Link, Unlink, Music, Smile, ChevronDown, ChevronUp, Scissors, Undo2, Redo2, Magnet
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

  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onRecordHistory?: () => void;
}

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
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
  onRecordHistory,
}) => {
  const [pixelsPerSec, setPixelsPerSec] = useState<number>(40);
  const [isScrubbing, setIsScrubbing] = useState<boolean>(false);
  const [isLinkedSync, setIsLinkedSync] = useState<boolean>(true);
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);
  const [timelineHeight, setTimelineHeight] = useState<number>(310);
  const [isResizingHeight, setIsResizingHeight] = useState<boolean>(false);
  const resizeStartY = useRef<number>(0);
  const resizeStartHeight = useRef<number>(310);

  const [isSnappingEnabled, setIsSnappingEnabled] = useState<boolean>(true);
  const [snapGuideLineX, setSnapGuideLineX] = useState<number | null>(null);

  const [dragAction, setDragAction] = useState<{
    target: "overlay" | "video" | "voice" | "bgm" | "soundfx" | "meme_img";
    type: "move" | "resize-right" | "resize-left";
    id: string;
    startX: number;
    initialStart: number;
    initialDuration: number;
    initialTrimStart: number;
    maxOriginalDuration: number;
    linkedPartnerId?: string;
    linkedPartnerType?: "overlay" | "voice";
    partnerInitialStart?: number;
    partnerInitialDuration?: number;
  } | null>(null);

  const timelineRef = useRef<HTMLDivElement>(null);
  const voiceAudioRef = useRef<HTMLAudioElement | null>(null);

  const bgEnds = bgClips.map((c) => c.startTime + c.duration);
  const blockEnds = blocks.map((b) => b.startTime + b.duration);
  const voiceEnds = voiceList.map((v) => v.startTime + v.duration);
  const memeEnds = memeImageList.map((m) => m.startTime + m.duration);
  const bgmEnds = [...bgmList, ...soundFxList].map((m) => m.startTime + m.duration);
  const totalDuration = parentTotalDuration || Math.max(...bgEnds, ...blockEnds, ...voiceEnds, ...memeEnds, ...bgmEnds, 15);

  const selectedBlock = blocks.find((b) => b.id === selectedBlockId);
  const selectedVoice = voiceList.find((v) => v.id === selectedVoiceId);

  const canLockSync = selectedBlockId && selectedVoiceId && (!selectedBlock?.groupId || selectedBlock?.groupId !== selectedVoice?.groupId);
  const isCurrentlyGrouped = (selectedBlock && selectedBlock.groupId) || (selectedVoice && selectedVoice.groupId);

  const handleToggleGroupSync = () => {
    if (onRecordHistory) onRecordHistory();
    if (canLockSync && setBlocks && setVoiceList) {
      const newGroupId = "group_" + Date.now();
      setBlocks((prev) => prev.map((b) => (b.id === selectedBlockId ? { ...b, groupId: newGroupId } : b)));
      setVoiceList((prev) => prev.map((v) => (v.id === selectedVoiceId ? { ...v, groupId: newGroupId } : v)));
      return;
    }
    if (isCurrentlyGrouped) {
      const gId = selectedBlock?.groupId || selectedVoice?.groupId;
      if (setBlocks) setBlocks((prev) => prev.map((b) => (b.groupId === gId ? { ...b, groupId: undefined } : b)));
      if (setVoiceList) setVoiceList((prev) => prev.map((v) => (v.groupId === gId ? { ...v, groupId: undefined } : v)));
    }
  };

  const getSnapPoints = useCallback((excludeIds: string[] = []): number[] => {
    const points: Set<number> = new Set([0, currentTime]);
    bgClips.forEach((c) => { if (!excludeIds.includes(c.id)) { points.add(c.startTime); points.add(c.startTime + c.duration); } });
    blocks.forEach((b) => { if (!excludeIds.includes(b.id)) { points.add(b.startTime); points.add(b.startTime + b.duration); } });
    voiceList.forEach((v) => { if (!excludeIds.includes(v.id)) { points.add(v.startTime); points.add(v.startTime + v.duration); } });
    bgmList.forEach((a) => { if (!excludeIds.includes(a.id)) { points.add(a.startTime); points.add(a.startTime + a.duration); } });
    soundFxList.forEach((a) => { if (!excludeIds.includes(a.id)) { points.add(a.startTime); points.add(a.startTime + a.duration); } });
    return Array.from(points);
  }, [currentTime, bgClips, blocks, voiceList, bgmList, soundFxList]);

  const applySnapping = useCallback((targetTime: number, excludeIds: string[] = []): { snappedTime: number; snappedX: number | null } => {
    if (!isSnappingEnabled) return { snappedTime: targetTime, snappedX: null };
    const snapPoints = getSnapPoints(excludeIds);
    const snapThresholdSec = 8 / pixelsPerSec;
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

  // VÒNG LẶP CHẠY KIM THỜI GIAN THẬT (TỰ ĐỘNG CHẠY KHI BẬT PHÁT TẤT CẢ)
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
      const newHeight = Math.min(650, Math.max(160, resizeStartHeight.current + deltaY));
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

  // CẮT ĐÔI BLOCK (CTRL + B)
  const handleSplitAtPlayhead = useCallback(() => {
    if (onRecordHistory) onRecordHistory();

    if (selectedClipId && setBgClips) {
      const target = bgClips.find((c) => c.id === selectedClipId);
      if (target && currentTime > target.startTime && currentTime < target.startTime + target.duration) {
        const firstDur = Number((currentTime - target.startTime).toFixed(2));
        const secondDur = Number((target.duration - firstDur).toFixed(2));
        const secondTrim = Number((target.trimStart + firstDur).toFixed(2));

        const clip1 = { ...target, duration: firstDur };
        const clip2 = { ...target, id: "bg_clip_" + Date.now(), startTime: Number(currentTime.toFixed(2)), duration: secondDur, trimStart: secondTrim };
        setBgClips((prev) => prev.flatMap((c) => (c.id === target.id ? [clip1, clip2] : [c])));
        if (setSelectedClipId) setSelectedClipId(clip2.id);
        return;
      }
    }

    if (selectedBlockId && setBlocks) {
      const target = blocks.find((b) => b.id === selectedBlockId);
      if (target && currentTime > target.startTime && currentTime < target.startTime + target.duration) {
        const firstDur = Number((currentTime - target.startTime).toFixed(2));
        const secondDur = Number((target.duration - firstDur).toFixed(2));

        const b1 = { ...target, duration: firstDur };
        const b2 = { ...target, id: "block_" + Date.now(), startTime: Number(currentTime.toFixed(2)), duration: secondDur };
        setBlocks((prev) => prev.flatMap((b) => (b.id === target.id ? [b1, b2] : [b])));
        if (setSelectedBlockId) setSelectedBlockId(b2.id);
        return;
      }
    }

    if (selectedVoiceId && setVoiceList) {
      const target = voiceList.find((v) => v.id === selectedVoiceId);
      if (target && currentTime > target.startTime && currentTime < target.startTime + target.duration) {
        const firstDur = Number((currentTime - target.startTime).toFixed(2));
        const secondDur = Number((target.duration - firstDur).toFixed(2));

        const v1 = { ...target, duration: firstDur };
        const v2 = { ...target, id: "voice_" + Date.now(), startTime: Number(currentTime.toFixed(2)), duration: secondDur };
        setVoiceList((prev) => prev.flatMap((v) => (v.id === target.id ? [v1, v2] : [v])));
        if (setSelectedVoiceId) setSelectedVoiceId(v2.id);
        return;
      }
    }
  }, [currentTime, selectedClipId, selectedBlockId, selectedVoiceId, bgClips, blocks, voiceList, setBgClips, setBlocks, setVoiceList, setSelectedClipId, setSelectedBlockId, setSelectedVoiceId, onRecordHistory]);

  // XÓA BLOCK
  const handleDeleteSelected = useCallback(() => {
    if (onRecordHistory) onRecordHistory();
    if (selectedClipId && setBgClips) {
      setBgClips((prev) => prev.filter((c) => c.id !== selectedClipId));
      if (setSelectedClipId) setSelectedClipId(null);
    }
    if (selectedBlockId && setBlocks) {
      setBlocks((prev) => prev.filter((b) => b.id !== selectedBlockId));
      if (setSelectedBlockId) setSelectedBlockId(null);
    }
    if (selectedVoiceId && setVoiceList) {
      setVoiceList((prev) => prev.filter((v) => v.id !== selectedVoiceId));
      if (setSelectedVoiceId) setSelectedVoiceId(null);
    }
    if (selectedAudioId) {
      if (setBgmList) setBgmList((prev) => prev.filter((a) => a.id !== selectedAudioId));
      if (setSoundFxList) setSoundFxList((prev) => prev.filter((a) => a.id !== selectedAudioId));
      if (setSelectedAudioId) setSelectedAudioId(null);
    }
  }, [selectedClipId, selectedBlockId, selectedVoiceId, selectedAudioId, setBgClips, setBlocks, setVoiceList, setBgmList, setSoundFxList, setSelectedClipId, setSelectedBlockId, setSelectedVoiceId, setSelectedAudioId, onRecordHistory]);

  // PHÍM TẮT
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
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        handleDeleteSelected();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        handleSplitAtPlayhead();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onUndo, onRedo, canUndo, canRedo, handleDeleteSelected, handleSplitAtPlayhead]);

  // KÉO DI CHUYỂN HOẶC RESIZE MÉP BLOCK
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isScrubbing) {
        requestAnimationFrame(() => updateScrubTime(e.clientX));
      } else if (dragAction) {
        const deltaSeconds = (e.clientX - dragAction.startX) / pixelsPerSec;
        const excludeList = [dragAction.id];
        if (dragAction.linkedPartnerId) excludeList.push(dragAction.linkedPartnerId);

        let activeGuideX: number | null = null;

        // 1. KÉO BLOCK ẢNH COMMENT
        if (dragAction.target === "overlay" && setBlocks) {
          setBlocks((prev) =>
            prev.map((b) => {
              if (b.id !== dragAction.id) return b;
              if (dragAction.type === "move") {
                let rawStart = Math.max(0, dragAction.initialStart + deltaSeconds);
                const snapStart = applySnapping(rawStart, excludeList);
                const snapEnd = applySnapping(rawStart + b.duration, excludeList);
                let finalStart = rawStart;
                if (snapStart.snappedX !== null) { finalStart = snapStart.snappedTime; activeGuideX = snapStart.snappedX; }
                else if (snapEnd.snappedX !== null) { finalStart = snapEnd.snappedTime - b.duration; activeGuideX = snapEnd.snappedX; }
                return { ...b, startTime: Number(finalStart.toFixed(2)) };
              }
              if (dragAction.type === "resize-right") {
                let rawEnd = dragAction.initialStart + dragAction.initialDuration + deltaSeconds;
                const snapEnd = applySnapping(rawEnd, excludeList);
                let finalEnd = snapEnd.snappedTime !== undefined ? snapEnd.snappedTime : rawEnd;
                activeGuideX = snapEnd.snappedX;
                return { ...b, duration: Math.max(0.5, Number((finalEnd - dragAction.initialStart).toFixed(2))) };
              }
              if (dragAction.type === "resize-left") {
                let rawStart = Math.max(0, dragAction.initialStart + deltaSeconds);
                const snapStart = applySnapping(rawStart, excludeList);
                let finalStart = snapStart.snappedTime !== undefined ? snapStart.snappedTime : rawStart;
                activeGuideX = snapStart.snappedX;
                const diff = finalStart - dragAction.initialStart;
                return { ...b, startTime: Number(finalStart.toFixed(2)), duration: Math.max(0.5, Number((dragAction.initialDuration - diff).toFixed(2))) };
              }
              return b;
            })
          );
        }

        // 2. KÉO VOICE TTS
        if (dragAction.target === "voice" && setVoiceList) {
          setVoiceList((prev) =>
            prev.map((v) => {
              if (v.id !== dragAction.id) return v;
              if (dragAction.type === "move") {
                let rawStart = Math.max(0, dragAction.initialStart + deltaSeconds);
                const snapStart = applySnapping(rawStart, excludeList);
                const snapEnd = applySnapping(rawStart + v.duration, excludeList);
                let finalStart = rawStart;
                if (snapStart.snappedX !== null) { finalStart = snapStart.snappedTime; activeGuideX = snapStart.snappedX; }
                else if (snapEnd.snappedX !== null) { finalStart = snapEnd.snappedTime - v.duration; activeGuideX = snapEnd.snappedX; }
                return { ...v, startTime: Number(finalStart.toFixed(2)) };
              }
              if (dragAction.type === "resize-right") {
                let rawEnd = dragAction.initialStart + dragAction.initialDuration + deltaSeconds;
                const snapEnd = applySnapping(rawEnd, excludeList);
                let finalEnd = snapEnd.snappedTime !== undefined ? snapEnd.snappedTime : rawEnd;
                activeGuideX = snapEnd.snappedX;
                return { ...v, duration: Math.min(dragAction.maxOriginalDuration, Math.max(0.5, Number((finalEnd - dragAction.initialStart).toFixed(2)))) };
              }
              return v;
            })
          );
        }

        // 3. KÉO VIDEO NỀN
        if (dragAction.target === "video" && setBgClips) {
          const maxOriginal = dragAction.maxOriginalDuration;
          setBgClips((prev) =>
            prev.map((clip) => {
              if (clip.id !== dragAction.id) return clip;
              if (dragAction.type === "move") {
                let rawStart = Math.max(0, dragAction.initialStart + deltaSeconds);
                const snapStart = applySnapping(rawStart, excludeList);
                const snapEnd = applySnapping(rawStart + clip.duration, excludeList);
                let finalStart = rawStart;
                if (snapStart.snappedX !== null) { finalStart = snapStart.snappedTime; activeGuideX = snapStart.snappedX; }
                else if (snapEnd.snappedX !== null) { finalStart = snapEnd.snappedTime - clip.duration; activeGuideX = snapEnd.snappedX; }
                return { ...clip, startTime: Number(finalStart.toFixed(2)) };
              }
              if (dragAction.type === "resize-right") {
                const curTrim = clip.trimStart || 0;
                const maxAllowed = Math.max(0.5, maxOriginal - curTrim);
                let rawEnd = dragAction.initialStart + dragAction.initialDuration + deltaSeconds;
                const snapEnd = applySnapping(rawEnd, excludeList);
                let finalEnd = snapEnd.snappedTime !== undefined ? snapEnd.snappedTime : rawEnd;
                activeGuideX = snapEnd.snappedX;
                return { ...clip, duration: Number(Math.max(0.5, Math.min(maxAllowed, finalEnd - dragAction.initialStart)).toFixed(2)) };
              }
              if (dragAction.type === "resize-left") {
                let rawStart = Math.max(0, dragAction.initialStart + deltaSeconds);
                const snapStart = applySnapping(rawStart, excludeList);
                let finalStart = snapStart.snappedTime !== undefined ? snapStart.snappedTime : rawStart;
                activeGuideX = snapStart.snappedX;
                const deltaTrim = finalStart - dragAction.initialStart;
                const newTrimStart = Number(Math.max(0, Math.min(maxOriginal - 0.5, dragAction.initialTrimStart + deltaTrim)).toFixed(2));
                return { ...clip, startTime: Number(finalStart.toFixed(2)), trimStart: newTrimStart, duration: Number(Math.max(0.5, dragAction.initialDuration - deltaTrim).toFixed(2)) };
              }
              return clip;
            })
          );
        }

        // 4. KÉO TRACK BGM RIÊNG
        if (dragAction.target === "bgm" && setBgmList) {
          setBgmList((prev) =>
            prev.map((a) => {
              if (a.id !== dragAction.id) return a;
              if (dragAction.type === "move") {
                let rawStart = Math.max(0, dragAction.initialStart + deltaSeconds);
                const snapStart = applySnapping(rawStart, excludeList);
                const snapEnd = applySnapping(rawStart + a.duration, excludeList);
                let finalStart = rawStart;
                if (snapStart.snappedX !== null) { finalStart = snapStart.snappedTime; activeGuideX = snapStart.snappedX; }
                else if (snapEnd.snappedX !== null) { finalStart = snapEnd.snappedTime - a.duration; activeGuideX = snapEnd.snappedX; }
                return { ...a, startTime: Number(finalStart.toFixed(2)) };
              }
              if (dragAction.type === "resize-right") {
                let rawEnd = dragAction.initialStart + dragAction.initialDuration + deltaSeconds;
                const snapEnd = applySnapping(rawEnd, excludeList);
                let finalEnd = snapEnd.snappedTime !== undefined ? snapEnd.snappedTime : rawEnd;
                activeGuideX = snapEnd.snappedX;
                return { ...a, duration: Math.min(a.maxDuration, Math.max(0.5, Number((finalEnd - dragAction.initialStart).toFixed(2)))) };
              }
              return a;
            })
          );
        }

        // 5. KÉO TRACK SOUND FX (MEME SOUND) RIÊNG
        if (dragAction.target === "soundfx" && setSoundFxList) {
          setSoundFxList((prev) =>
            prev.map((a) => {
              if (a.id !== dragAction.id) return a;
              if (dragAction.type === "move") {
                let rawStart = Math.max(0, dragAction.initialStart + deltaSeconds);
                const snapStart = applySnapping(rawStart, excludeList);
                const snapEnd = applySnapping(rawStart + a.duration, excludeList);
                let finalStart = rawStart;
                if (snapStart.snappedX !== null) { finalStart = snapStart.snappedTime; activeGuideX = snapStart.snappedX; }
                else if (snapEnd.snappedX !== null) { finalStart = snapEnd.snappedTime - a.duration; activeGuideX = snapEnd.snappedX; }
                return { ...a, startTime: Number(finalStart.toFixed(2)) };
              }
              if (dragAction.type === "resize-right") {
                let rawEnd = dragAction.initialStart + dragAction.initialDuration + deltaSeconds;
                const snapEnd = applySnapping(rawEnd, excludeList);
                let finalEnd = snapEnd.snappedTime !== undefined ? snapEnd.snappedTime : rawEnd;
                activeGuideX = snapEnd.snappedX;
                return { ...a, duration: Math.min(a.maxDuration, Math.max(0.5, Number((finalEnd - dragAction.initialStart).toFixed(2)))) };
              }
              return a;
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
  }, [isScrubbing, dragAction, pixelsPerSec, updateScrubTime, setBgClips, setBlocks, setVoiceList, setBgmList, setSoundFxList, onRecordHistory, applySnapping]);

  // PHÁT ĐỒNG BỘ VOICE
  const currentVoiceItem = voiceList.find(
    (v) => currentTime >= v.startTime && currentTime <= v.startTime + v.duration
  );

  useEffect(() => {
    if (!voiceAudioRef.current) return;
    if (isPlaying && currentVoiceItem?.url) {
      const offset = currentTime - currentVoiceItem.startTime;
      if (offset >= 0 && offset <= currentVoiceItem.duration) {
        if (Math.abs(voiceAudioRef.current.currentTime - offset) > 0.2) {
          voiceAudioRef.current.currentTime = offset;
        }
        voiceAudioRef.current.play().catch(() => {});
      } else {
        voiceAudioRef.current.pause();
      }
    } else {
      voiceAudioRef.current.pause();
    }
  }, [isPlaying, currentTime, currentVoiceItem]);

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
      {/* THANH RESIZE HANDLE (VS CODE STYLE) */}
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

          {/* NÚT NAM CHÂM SNAPPING */}
          <button
            onClick={() => setIsSnappingEnabled(!isSnappingEnabled)}
            title={isSnappingEnabled ? "Từ tính (Magnetic Snapping): ĐANG BẬT" : "Từ tính (Magnetic Snapping): ĐÃ TẮT"}
            className={`p-1.5 rounded text-xs transition flex items-center gap-1 ${
              isSnappingEnabled ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 shadow-sm" : "bg-slate-800 text-slate-400 hover:text-white"
            }`}
          >
            <Magnet size={13} />
          </button>

          {/* UNDO / REDO */}
          <button onClick={onUndo} disabled={!canUndo} title="Hoàn tác (Ctrl + Z)" className="p-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 rounded text-slate-300">
            <Undo2 size={13} />
          </button>
          <button onClick={onRedo} disabled={!canRedo} title="Làm lại (Ctrl + Y)" className="p-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 rounded text-slate-300">
            <Redo2 size={13} />
          </button>

          <div className="h-4 w-[1px] bg-slate-800 mx-0.5" />

          <button
            onClick={handleSplitAtPlayhead}
            title="Cắt đôi block (Ctrl + B)"
            className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-cyan-900/60 border border-slate-700 text-slate-300 rounded text-xs transition"
          >
            <Scissors size={13} />
            <span>Tách Clip (Ctrl+B)</span>
          </button>

          <button
            onClick={handleDeleteSelected}
            disabled={!selectedClipId && !selectedBlockId && !selectedVoiceId && !selectedAudioId}
            title="Xóa block đang chọn (Delete)"
            className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-rose-950/60 border border-slate-700 text-slate-400 hover:text-rose-400 rounded text-xs transition disabled:opacity-40"
          >
            <Trash2 size={13} />
            <span>Xóa (Del)</span>
          </button>

          <div className="h-4 w-[1px] bg-slate-800 mx-0.5" />

          <button
            onClick={handleToggleGroupSync}
            disabled={!canLockSync && !isCurrentlyGrouped}
            className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-semibold border transition shadow-sm ${
              isCurrentlyGrouped
                ? "bg-[#161a23] text-slate-300 border-slate-700 hover:border-slate-500" 
                : canLockSync
                ? "bg-[#382b0e] text-[#f7b928] border-[#f7b928] animate-pulse" 
                : "bg-slate-900/50 text-slate-500 border-slate-800 cursor-not-allowed"
            }`}
          >
            {isCurrentlyGrouped ? <Unlink size={13} /> : <Link size={13} />}
            <span>{isCurrentlyGrouped ? "Độc Lập" : "Khóa Đồng Bộ"}</span>
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
          <div className="w-28 bg-[#151619] border-r border-slate-800 flex flex-col py-2 flex-shrink-0 z-10 text-[11px] font-medium text-slate-400">
            <div className="h-6 flex items-center px-3 text-slate-500">Thước Đo</div>
            <div className="h-10 flex items-center gap-2 px-3 hover:text-white"><Smile size={13} className="text-pink-400" /><span>Ảnh Meme</span></div>
            <div className="h-14 flex items-center gap-2 px-3 hover:text-white"><Layers size={13} className="text-amber-400" /><span>Ảnh Comment</span></div>
            <div className="h-14 flex items-center gap-2 px-3 hover:text-white"><Film size={13} className="text-cyan-400" /><span>Video Nền</span></div>
            <div className="h-10 flex items-center gap-2 px-3 hover:text-white"><Volume2 size={13} className="text-emerald-400" /><span>Voice TTS</span></div>
            <div className="h-10 flex items-center gap-2 px-3 hover:text-white"><Music size={13} className="text-indigo-400" /><span>Nhạc Nền (BGM)</span></div>
            <div className="h-10 flex items-center gap-2 px-3 hover:text-white"><Volume2 size={13} className="text-teal-400" /><span>Meme Sound</span></div>
          </div>

          <div ref={timelineRef} onMouseDown={handleMouseDownPlayhead} className="flex-1 relative overflow-x-auto overflow-y-auto bg-[#0d0e11] cursor-pointer">
            {/* ĐƯỜNG GIÓNG TỪ TÍNH */}
            {snapGuideLineX !== null && (
              <div style={{ left: `${snapGuideLineX}px` }} className="absolute top-0 bottom-0 w-[1.5px] bg-cyan-400 z-50 pointer-events-none shadow-[0_0_8px_#22d3ee]" />
            )}

            {/* KIM PLAYHEAD */}
            <div
              style={{
                left: `${currentTime * pixelsPerSec}px`,
                transition: isScrubbing || dragAction ? "none" : "left 0.05s linear",
              }}
              className="absolute top-0 bottom-0 z-40 flex flex-col items-center pointer-events-none"
            >
              <div onMouseDown={handleMouseDownPlayhead} className="w-3.5 h-3.5 bg-white shadow-md border border-slate-700 rounded-sm transform rotate-45 -mt-1.5 cursor-ew-resize pointer-events-auto hover:scale-125 transition-transform" />
              <div className="w-[1.5px] flex-1 bg-white shadow-[0_0_8px_rgba(255,255,255,0.9)]" />
            </div>

            {/* RULER */}
            <div style={{ width: `${totalDuration * pixelsPerSec + 200}px` }} className="h-6 border-b border-slate-800/80 relative flex items-end text-[9px] font-mono text-slate-500 select-none">
              {Array.from({ length: Math.ceil(totalDuration) + 2 }).map((_, i) => (
                <div key={i} style={{ left: `${i * pixelsPerSec}px` }} className="absolute bottom-0 flex flex-col items-center pointer-events-none">
                  <div className={`w-[1px] ${i % 5 === 0 ? "h-3 bg-slate-500" : "h-1.5 bg-slate-700"}`} />
                  {i % 5 === 0 && <span className="mb-0.5 ml-1">{i}s</span>}
                </div>
              ))}
            </div>

            {/* TRACK 0: ẢNH MEME */}
            <div style={{ width: `${totalDuration * pixelsPerSec + 200}px` }} className="h-10 border-b border-slate-800/40 relative flex items-center px-1 bg-pink-950/10">
              {memeImageList.map((meme) => (
                <div key={meme.id} style={{ left: `${meme.startTime * pixelsPerSec}px`, width: `${meme.duration * pixelsPerSec}px` }} className="absolute h-8 bg-pink-600/30 border border-pink-400 rounded-md p-1 flex items-center shadow group">
                  <img src={meme.url} alt="meme" className="h-full w-7 object-contain rounded pointer-events-none mr-1" />
                  <span className="text-[10px] text-pink-200 truncate">{meme.duration}s</span>
                </div>
              ))}
            </div>

            {/* TRACK 1: ẢNH COMMENT */}
            <div style={{ width: `${totalDuration * pixelsPerSec + 200}px` }} className="h-14 border-b border-slate-800/60 relative flex items-center px-1 bg-slate-950/20">
              {blocks.map((b) => {
                const isSelected = selectedBlockId === b.id;
                const isGrouped = !!b.groupId;
                return (
                  <div
                    key={b.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (setSelectedBlockId) setSelectedBlockId(b.id);
                      if (!e.ctrlKey && !e.metaKey) {
                        if (setSelectedClipId) setSelectedClipId(null);
                        if (setSelectedAudioId) setSelectedAudioId(null);
                      }
                    }}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      if (setSelectedBlockId) setSelectedBlockId(b.id);
                      setDragAction({ target: "overlay", type: "move", id: b.id, startX: e.clientX, initialStart: b.startTime, initialDuration: b.duration, initialTrimStart: 0, maxOriginalDuration: 999999 });
                    }}
                    style={{ left: `${b.startTime * pixelsPerSec}px`, width: `${b.duration * pixelsPerSec}px` }}
                    className={`absolute h-10 rounded-md p-1 flex items-center shadow-lg group transition cursor-grab active:cursor-grabbing border ${
                      isSelected ? "bg-amber-600/60 border-white ring-2 ring-white z-20" : isGrouped ? "bg-amber-600/40 border-amber-300 ring-1 ring-amber-400/60 z-15" : "bg-amber-600/30 border-amber-400/80 hover:border-amber-300 z-10"
                    }`}
                  >
                    <div onMouseDown={(e) => { e.stopPropagation(); setDragAction({ target: "overlay", type: "resize-left", id: b.id, startX: e.clientX, initialStart: b.startTime, initialDuration: b.duration, initialTrimStart: 0, maxOriginalDuration: 999999 }); }} className="absolute left-0 top-0 bottom-0 w-2 hover:w-3 bg-amber-400/50 hover:bg-amber-400 cursor-ew-resize rounded-l-md transition-all opacity-0 group-hover:opacity-100" />
                    <div className="flex items-center gap-1.5 overflow-hidden flex-1 pointer-events-none px-1">
                      {b.image_url && <img src={b.image_url} className="h-7 w-7 object-cover rounded pointer-events-none select-none" />}
                      <span className="text-[10px] text-amber-200 font-semibold truncate">{b.duration}s {isGrouped && "🔗"}</span>
                    </div>
                    <div onMouseDown={(e) => { e.stopPropagation(); setDragAction({ target: "overlay", type: "resize-right", id: b.id, startX: e.clientX, initialStart: b.startTime, initialDuration: b.duration, initialTrimStart: 0, maxOriginalDuration: 999999 }); }} className="absolute right-0 top-0 bottom-0 w-2 hover:w-3 bg-amber-400/50 hover:bg-amber-400 cursor-ew-resize rounded-r-md transition-all opacity-0 group-hover:opacity-100" />
                  </div>
                );
              })}
            </div>

            {/* TRACK 2: VIDEO NỀN */}
            <div style={{ width: `${totalDuration * pixelsPerSec + 200}px` }} className="h-14 border-b border-slate-800/60 relative flex items-center px-1 hover:bg-teal-950/20 transition-colors">
              {bgClips.map((clip) => {
                const isSelected = selectedClipId === clip.id;
                const totalThumbs = Math.max(1, (clip.thumbs || []).length);
                const singleFrameWidth = (clip.maxDuration * pixelsPerSec) / totalThumbs;
                return (
                  <div
                    key={clip.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (setSelectedClipId) setSelectedClipId(clip.id);
                      if (!e.ctrlKey && !e.metaKey) {
                        if (setSelectedBlockId) setSelectedBlockId(null);
                        if (setSelectedVoiceId) setSelectedVoiceId(null);
                        if (setSelectedAudioId) setSelectedAudioId(null);
                      }
                    }}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      if (setSelectedClipId) setSelectedClipId(clip.id);
                      setDragAction({ target: "video", type: "move", id: clip.id, startX: e.clientX, initialStart: clip.startTime, initialDuration: clip.duration, initialTrimStart: clip.trimStart || 0, maxOriginalDuration: clip.maxDuration });
                    }}
                    style={{ left: `${clip.startTime * pixelsPerSec}px`, width: `${clip.duration * pixelsPerSec}px` }}
                    className={`absolute h-10 rounded-md overflow-hidden flex items-center shadow-lg group cursor-grab active:cursor-grabbing border ${
                      isSelected ? "bg-teal-950/90 border-white ring-2 ring-white z-20" : "bg-teal-950/60 border-teal-500 hover:border-teal-300 z-10"
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
                    <div className="absolute top-0.5 left-3 bg-black/85 px-1.5 py-0.5 rounded text-[9px] text-teal-200 font-mono pointer-events-none z-10 shadow truncate max-w-[80%]">{clip.name}</div>
                    <div onMouseDown={(e) => { e.stopPropagation(); setDragAction({ target: "video", type: "resize-right", id: clip.id, startX: e.clientX, initialStart: clip.startTime, initialDuration: clip.duration, initialTrimStart: clip.trimStart || 0, maxOriginalDuration: clip.maxDuration }); }} className="absolute right-0 top-0 bottom-0 w-3 bg-teal-400/80 hover:bg-teal-300 cursor-ew-resize z-20 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                );
              })}
            </div>

            {/* TRACK 3: VOICE TTS */}
            <div style={{ width: `${totalDuration * pixelsPerSec + 200}px` }} className="h-10 border-b border-slate-800/40 relative flex items-center px-1">
              {voiceList.map((v) => {
                const isSelected = selectedVoiceId === v.id;
                const isGrouped = !!v.groupId;
                return (
                  <div
                    key={v.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (setSelectedVoiceId) setSelectedVoiceId(v.id);
                      if (!e.ctrlKey && !e.metaKey) {
                        if (setSelectedClipId) setSelectedClipId(null);
                        if (setSelectedAudioId) setSelectedAudioId(null);
                      }
                    }}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      if (setSelectedVoiceId) setSelectedVoiceId(v.id);
                      setDragAction({ target: "voice", type: "move", id: v.id, startX: e.clientX, initialStart: v.startTime, initialDuration: v.duration, initialTrimStart: 0, maxOriginalDuration: v.maxDuration });
                    }}
                    style={{ left: `${v.startTime * pixelsPerSec}px`, width: `${v.duration * pixelsPerSec}px` }}
                    className={`absolute h-7 rounded px-2 flex items-center justify-between text-[10px] shadow group cursor-grab active:cursor-grabbing border ${
                      isSelected ? "bg-emerald-950/95 border-white ring-2 ring-white z-20 text-white" : isGrouped ? "bg-emerald-950/80 border-emerald-300 ring-1 ring-emerald-400/60 z-15 text-emerald-200" : "bg-emerald-950/70 border-emerald-500 text-emerald-300 z-10"
                    }`}
                  >
                    <span className="truncate">{v.name} ({v.duration}s) {isGrouped && "🔗"}</span>
                    <div onMouseDown={(e) => { e.stopPropagation(); setDragAction({ target: "voice", type: "resize-right", id: v.id, startX: e.clientX, initialStart: v.startTime, initialDuration: v.duration, initialTrimStart: 0, maxOriginalDuration: v.maxDuration }); }} className="absolute right-0 top-0 bottom-0 w-2 bg-emerald-400 hover:bg-emerald-300 cursor-ew-resize opacity-0 group-hover:opacity-100" />
                  </div>
                );
              })}
            </div>

            {/* TRACK 4: NHẠC NỀN (BGM) */}
            <div style={{ width: `${totalDuration * pixelsPerSec + 200}px` }} className="h-10 border-b border-slate-800/40 relative flex items-center px-1 bg-indigo-950/10">
              {bgmList.map((bgm) => {
                const isSelected = selectedAudioId === bgm.id;
                const vol = bgm.volume !== undefined ? bgm.volume : 100;
                return (
                  <div
                    key={bgm.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (setSelectedAudioId) setSelectedAudioId(bgm.id);
                      if (setSelectedBlockId) setSelectedBlockId(null);
                      if (setSelectedVoiceId) setSelectedVoiceId(null);
                      if (setSelectedClipId) setSelectedClipId(null);
                    }}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      if (setSelectedAudioId) setSelectedAudioId(bgm.id);
                      setDragAction({ target: "bgm", type: "move", id: bgm.id, startX: e.clientX, initialStart: bgm.startTime, initialDuration: bgm.duration, initialTrimStart: 0, maxOriginalDuration: bgm.maxDuration });
                    }}
                    style={{ left: `${bgm.startTime * pixelsPerSec}px`, width: `${bgm.duration * pixelsPerSec}px` }}
                    className={`absolute h-7 rounded px-2 flex items-center justify-between text-[10px] shadow group border cursor-grab active:cursor-grabbing ${
                      isSelected ? "bg-indigo-900 border-white ring-2 ring-white z-20 text-white" : "bg-indigo-950/80 border-indigo-500 text-indigo-300 z-10"
                    }`}
                  >
                    <span className="truncate mr-1 font-medium">🎵 {bgm.name} ({bgm.duration}s | {vol}%)</span>
                    <div onMouseDown={(e) => { e.stopPropagation(); setDragAction({ target: "bgm", type: "resize-right", id: bgm.id, startX: e.clientX, initialStart: bgm.startTime, initialDuration: bgm.duration, initialTrimStart: 0, maxOriginalDuration: bgm.maxDuration }); }} className="absolute right-0 top-0 bottom-0 w-2 hover:w-3 bg-white/40 cursor-ew-resize rounded-r opacity-0 group-hover:opacity-100" />
                  </div>
                );
              })}
            </div>

            {/* TRACK 5: MEME SOUND (SOUND FX) */}
            <div style={{ width: `${totalDuration * pixelsPerSec + 200}px` }} className="h-10 relative flex items-center px-1 bg-teal-950/10">
              {soundFxList.map((fx) => {
                const isSelected = selectedAudioId === fx.id;
                const vol = fx.volume !== undefined ? fx.volume : 100;
                return (
                  <div
                    key={fx.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (setSelectedAudioId) setSelectedAudioId(fx.id);
                      if (setSelectedBlockId) setSelectedBlockId(null);
                      if (setSelectedVoiceId) setSelectedVoiceId(null);
                      if (setSelectedClipId) setSelectedClipId(null);
                    }}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      if (setSelectedAudioId) setSelectedAudioId(fx.id);
                      setDragAction({ target: "soundfx", type: "move", id: fx.id, startX: e.clientX, initialStart: fx.startTime, initialDuration: fx.duration, initialTrimStart: 0, maxOriginalDuration: fx.maxDuration });
                    }}
                    style={{ left: `${fx.startTime * pixelsPerSec}px`, width: `${fx.duration * pixelsPerSec}px` }}
                    className={`absolute h-7 rounded px-2 flex items-center justify-between text-[10px] shadow group border cursor-grab active:cursor-grabbing ${
                      isSelected ? "bg-teal-900 border-white ring-2 ring-white z-20 text-white" : "bg-teal-950/80 border-teal-500 text-teal-300 z-10"
                    }`}
                  >
                    <span className="truncate mr-1 font-medium">🔊 {fx.name} ({fx.duration}s | {vol}%)</span>
                    <div onMouseDown={(e) => { e.stopPropagation(); setDragAction({ target: "soundfx", type: "resize-right", id: fx.id, startX: e.clientX, initialStart: fx.startTime, initialDuration: fx.duration, initialTrimStart: 0, maxOriginalDuration: fx.maxDuration }); }} className="absolute right-0 top-0 bottom-0 w-2 hover:w-3 bg-white/40 cursor-ew-resize rounded-r opacity-0 group-hover:opacity-100" />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* AUDIO VOICE */}
      {currentVoiceItem?.url && <audio ref={voiceAudioRef} src={currentVoiceItem.url} preload="auto" />}

      {/* AUDIO BGM VÀ MEME SOUND ĐỒNG BỘ ÂM LƯỢNG KHI PHÁT */}
      {[...bgmList, ...soundFxList].map((audio) => {
        const isInside = currentTime >= audio.startTime && currentTime <= audio.startTime + audio.duration;
        const volumeMultiplier = Math.min(1.0, (audio.volume !== undefined ? audio.volume : 100) / 100);

        return (
          <audio
            key={"audio_player_" + audio.id}
            ref={(el) => {
              if (!el) return;
              el.volume = volumeMultiplier;
              if (isPlaying && isInside) {
                const offset = currentTime - audio.startTime;
                if (Math.abs(el.currentTime - offset) > 0.25) {
                  el.currentTime = offset;
                }
                el.play().catch(() => {});
              } else {
                el.pause();
              }
            }}
            src={audio.url}
            preload="auto"
            className="hidden"
          />
        );
      })}
    </div>
  );
};

export default Timeline;