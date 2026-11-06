"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  TimelineBlock,
  GeneratedVoiceItem,
  BgData,
  BgClipItem,
  VoiceItem,
  TimelineAudioItem,
  TimelineMemeImageItem,
} from "@/types";
import { Header } from "@/components/Header";
import { PreviewPlayer } from "@/components/PreviewPlayer";
import { Inspector } from "@/components/Inspector";
import { Timeline } from "@/components/Timeline";
import { VoiceTab } from "@/components/tabs/VoiceTab";
import { TopicsTab } from "@/components/tabs/TopicsTab";
import { BackgroundTab } from "@/components/tabs/BackgroundTab";
import { AssetsTab } from "@/components/tabs/AssetsTab";
import { Mic, Image as ImageIcon, Video, Sparkles, X, Film, CheckCircle2, Download } from "lucide-react";

interface TimelineSnapshot {
  bgClips: BgClipItem[];
  blocks: TimelineBlock[];
  voiceList: VoiceItem[];
  memeImageList: TimelineMemeImageItem[];
  bgmList: TimelineAudioItem[];
  soundFxList: TimelineAudioItem[];
}

export default function CapCutThreadsStudio() {
  const API_BASE = "http://localhost:8000";

  const [leftTab, setLeftTab] = useState<"topics" | "tts" | "bg" | "assets">("tts");
  const [inspectorTab, setInspectorTab] = useState<"video" | "audio">("audio");
  const [voices, setVoices] = useState<Record<string, string>>({});

  const [standaloneText, setStandaloneText] = useState("");
  const [standaloneVoice, setStandaloneVoice] = useState("vi-VN-NamMinhNeural");
  const [standaloneSpeed, setStandaloneSpeed] = useState(50);
  const [isScanningOcr, setIsScanningOcr] = useState(false);
  const [isGeneratingTts, setIsGeneratingTts] = useState(false);
  const [latestAudio, setLatestAudio] = useState<GeneratedVoiceItem | null>(null);

  const [topics, setTopics] = useState<string[]>([]);
  const [currentTopic, setCurrentTopic] = useState("");
  const [topicImages, setTopicImages] = useState<any[]>([]);

  const [bgVideos, setBgVideos] = useState<BgData[]>([]);
  const [selectedBgUrl, setSelectedBgUrl] = useState<string>("");

  const [bgClips, setBgClips] = useState<BgClipItem[]>([]);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);

  // Track Ảnh Comment
  const [blocks, setBlocks] = useState<TimelineBlock[]>([]);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);

  // Track Voice TTS
  const [voiceList, setVoiceList] = useState<VoiceItem[]>([]);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string | null>(null);

  // Track Nhạc Nền & Meme Sound
  const [bgmList, setBgmList] = useState<TimelineAudioItem[]>([]);
  const [soundFxList, setSoundFxList] = useState<TimelineAudioItem[]>([]);
  const [selectedAudioId, setSelectedAudioId] = useState<string | null>(null);

  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  const [memeImageList, setMemeImageList] = useState<TimelineMemeImageItem[]>([]);

  // MODAL XUẤT BẢN VIDEO & TIẾN TRÌNH (%)
  const [showExportModal, setShowExportModal] = useState<boolean>(false);
  const [exportRes, setExportRes] = useState<"1080p" | "2k" | "4k">("1080p");
  const [isRendering, setIsRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState<number>(0);
  const [renderJobId, setRenderJobId] = useState<string | null>(null);
  const [renderedUrl, setRenderedUrl] = useState<string | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // UNDO / REDO HISTORY
  const [undoStack, setUndoStack] = useState<TimelineSnapshot[]>([]);
  const [redoStack, setRedoStack] = useState<TimelineSnapshot[]>([]);

  const recordHistory = useCallback(() => {
    setUndoStack((prev) => {
      const snap: TimelineSnapshot = {
        bgClips: JSON.parse(JSON.stringify(bgClips)),
        blocks: JSON.parse(JSON.stringify(blocks)),
        voiceList: JSON.parse(JSON.stringify(voiceList)),
        memeImageList: JSON.parse(JSON.stringify(memeImageList)),
        bgmList: JSON.parse(JSON.stringify(bgmList)),
        soundFxList: JSON.parse(JSON.stringify(soundFxList)),
      };
      const next = [...prev, snap];
      return next.length > 30 ? next.slice(next.length - 30) : next;
    });
    setRedoStack([]);
  }, [bgClips, blocks, voiceList, memeImageList, bgmList, soundFxList]);

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    const prevSnap = undoStack[undoStack.length - 1];
    const currentSnap: TimelineSnapshot = {
      bgClips: JSON.parse(JSON.stringify(bgClips)),
      blocks: JSON.parse(JSON.stringify(blocks)),
      voiceList: JSON.parse(JSON.stringify(voiceList)),
      memeImageList: JSON.parse(JSON.stringify(memeImageList)),
      bgmList: JSON.parse(JSON.stringify(bgmList)),
      soundFxList: JSON.parse(JSON.stringify(soundFxList)),
    };
    setRedoStack((p) => [...p, currentSnap]);
    setUndoStack((p) => p.slice(0, p.length - 1));

    setBgClips(prevSnap.bgClips);
    setBlocks(prevSnap.blocks);
    setVoiceList(prevSnap.voiceList || []);
    setMemeImageList(prevSnap.memeImageList);
    setBgmList(prevSnap.bgmList);
    setSoundFxList(prevSnap.soundFxList || []);
  }, [undoStack, bgClips, blocks, voiceList, memeImageList, bgmList, soundFxList]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    const nextSnap = redoStack[redoStack.length - 1];
    const currentSnap: TimelineSnapshot = {
      bgClips: JSON.parse(JSON.stringify(bgClips)),
      blocks: JSON.parse(JSON.stringify(blocks)),
      voiceList: JSON.parse(JSON.stringify(voiceList)),
      memeImageList: JSON.parse(JSON.stringify(memeImageList)),
      bgmList: JSON.parse(JSON.stringify(bgmList)),
      soundFxList: JSON.parse(JSON.stringify(soundFxList)),
    };
    setUndoStack((p) => [...p, currentSnap]);
    setRedoStack((p) => p.slice(0, p.length - 1));

    setBgClips(nextSnap.bgClips);
    setBlocks(nextSnap.blocks);
    setVoiceList(nextSnap.voiceList || []);
    setMemeImageList(nextSnap.memeImageList);
    setBgmList(nextSnap.bgmList);
    setSoundFxList(nextSnap.soundFxList || []);
  }, [redoStack, bgClips, blocks, voiceList, memeImageList, bgmList, soundFxList]);

  // HÀM HỦY XUẤT VIDEO (CANCEL RENDER)
  const handleCancelExportVideo = useCallback(async () => {
    if (!renderJobId) return;
    try {
      await fetch(`${API_BASE}/api/video/cancel/${renderJobId}`, { method: "POST" });
    } catch (e) {
      console.error("Lỗi khi gửi tín hiệu hủy:", e);
    } finally {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      setIsRendering(false);
      setRenderProgress(0);
      setRenderJobId(null);
    }
  }, [renderJobId, API_BASE]);

  // BẮT PHÍM TẮT ESCAPE (ESC) ĐỂ HỦY RENDER HOẶC ĐÓNG MODAL
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (isRendering) {
          e.preventDefault();
          handleCancelExportVideo();
        } else if (showExportModal) {
          e.preventDefault();
          setShowExportModal(false);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isRendering, showExportModal, handleCancelExportVideo]);

  const [showTimeline, setShowTimeline] = useState<boolean>(true);
  const [showZoomPanel, setShowZoomPanel] = useState<boolean>(true);
  const [zoomScale, setZoomScale] = useState(1);

  const [isDragging, setIsDragging] = useState(false);
  const dragStartPos = useRef<{ mouseX: number; mouseY: number; initialX: number; initialY: number }>({
    mouseX: 0,
    mouseY: 0,
    initialX: 0,
    initialY: 0,
  });

  const baseScale = 320 / 1080;

  const bgEnds = bgClips.map((c) => c.startTime + c.duration);
  const blockEnds = blocks.map((b) => b.startTime + b.duration);
  const voiceEnds = voiceList.map((v) => v.startTime + v.duration);
  const memeEnds = memeImageList.map((m) => m.startTime + m.duration);
  const bgmEnds = [...bgmList, ...soundFxList].map((m) => m.startTime + m.duration);
  const totalDuration = Math.max(...bgEnds, ...blockEnds, ...voiceEnds, ...memeEnds, ...bgmEnds, 15);

  useEffect(() => {
    fetch(`${API_BASE}/api/tts/voices-list`)
      .then((r) => r.json())
      .then((v) => setVoices(v))
      .catch(() => {});
    loadTopics();
    loadBackgrounds();
  }, []);

  const loadTopics = () => {
    fetch(`${API_BASE}/api/topics/list`)
      .then((r) => r.json())
      .then((d) => {
        setTopics(d);
        if (d.length > 0 && !currentTopic) {
          setCurrentTopic(d[0]);
          loadTopicImages(d[0]);
        }
      })
      .catch(() => {});
  };

  const loadTopicImages = (topic: string) => {
    fetch(`${API_BASE}/api/topics/images?topic_name=${encodeURIComponent(topic)}`)
      .then((r) => r.json())
      .then(setTopicImages)
      .catch(() => {});
  };

  const loadBackgrounds = () => {
    fetch(`${API_BASE}/api/backgrounds/list`)
      .then((r) => r.json())
      .then((data: BgData[]) => {
        setBgVideos(data);
        if (data.length > 0 && !selectedBgUrl) {
          setSelectedBgUrl(data[0].url);
        }
      })
      .catch(() => {});
  };

  const handleAddBgToTimeline = (bg: BgData) => {
    recordHistory();
    const nextStart = bgClips.length > 0 ? Math.max(...bgClips.map((c) => c.startTime + c.duration)) : 0;
    const newClip: BgClipItem = {
      id: "bg_clip_" + Date.now(),
      name: bg.name,
      url: bg.url,
      startTime: Number(nextStart.toFixed(2)),
      duration: bg.duration,
      maxDuration: bg.maxDuration || bg.duration,
      trimStart: 0,
      thumbs: bg.thumbs || []
    };
    setBgClips((prev) => [...prev, newClip]);
    setSelectedClipId(newClip.id);
  };

  const handleAddAudioToTimeline = (item: any, type: "bgm" | "sound_effect") => {
    recordHistory();
    const startTime = Number(currentTime.toFixed(2));
    const newAudio: TimelineAudioItem = {
      id: `${type}_` + Date.now(),
      name: item.name,
      url: item.url,
      startTime: startTime,
      duration: item.duration || 3.0,
      maxDuration: item.duration || 3.0,
      type: type,
      volume: 100,
    };

    if (type === "bgm") {
      setBgmList((prev) => [...prev, newAudio]);
    } else {
      setSoundFxList((prev) => [...prev, newAudio]);
    }
    setSelectedAudioId(newAudio.id);
  };

  const handleUpdateAudioItem = (id: string, updatedProps: Partial<TimelineAudioItem>) => {
    setBgmList((prev) => prev.map((a) => (a.id === id ? { ...a, ...updatedProps } : a)));
    setSoundFxList((prev) => prev.map((a) => (a.id === id ? { ...a, ...updatedProps } : a)));
  };

  const handleAddMemeImageToTimeline = (item: any) => {
    recordHistory();
    const startTime = Number(currentTime.toFixed(2));
    const newMeme: TimelineMemeImageItem = {
      id: "meme_" + Date.now(),
      name: item.name,
      url: item.url,
      startTime: startTime,
      duration: 3.0,
      img_x: 350,
      img_y: 200,
      img_width: 350,
    };
    setMemeImageList((prev) => [...prev, newMeme]);
  };

  const handleAddLatestVoiceToTimeline = () => {
    if (!latestAudio) return;
    recordHistory();
    const nextStart = voiceList.length > 0 ? Math.max(...voiceList.map((v) => v.startTime + v.duration)) : 0;
    const newVoice: VoiceItem = {
      id: "voice_" + Date.now(),
      name: latestAudio.name || latestAudio.text?.slice(0, 20) || "Voice TTS",
      url: latestAudio.audio_url,
      path: latestAudio.file_path,
      startTime: Number(nextStart.toFixed(2)),
      duration: latestAudio.duration,
      maxDuration: latestAudio.maxDuration || latestAudio.duration,
    };
    setVoiceList((prev) => [...prev, newVoice]);
    setSelectedVoiceId(newVoice.id);
  };

  const handleAddManualVoiceToTimeline = (voiceItem: { name: string; url: string; duration: number; path: string }) => {
    recordHistory();
    const nextStart = voiceList.length > 0 ? Math.max(...voiceList.map((v) => v.startTime + v.duration)) : 0;
    const newVoice: VoiceItem = {
      id: "voice_" + Date.now(),
      name: voiceItem.name,
      url: voiceItem.url,
      path: voiceItem.path,
      startTime: Number(nextStart.toFixed(2)),
      duration: voiceItem.duration,
      maxDuration: voiceItem.duration,
    };
    setVoiceList((prev) => [...prev, newVoice]);
    setSelectedVoiceId(newVoice.id);
  };

  const handleCreateTopic = async (name: string) => {
    const fd = new FormData();
    fd.append("topic_name", name);
    await fetch(`${API_BASE}/api/topics/create`, { method: "POST", body: fd });
    loadTopics();
    setCurrentTopic(name);
  };

  const handleRenameTopic = async (oldName: string, newName: string) => {
    await fetch(`${API_BASE}/api/topics/rename`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ old_name: oldName, new_name: newName }),
    });
    if (currentTopic === oldName) setCurrentTopic(newName);
    loadTopics();
  };

  const handleDeleteTopic = async (name: string) => {
    await fetch(`${API_BASE}/api/topics/${encodeURIComponent(name)}`, { method: "DELETE" });
    if (currentTopic === name) {
      setCurrentTopic("");
      setTopicImages([]);
    }
    loadTopics();
  };

  const handleDeleteSingleImage = async (filename: string) => {
    await fetch(`${API_BASE}/api/topics/images/delete`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic_name: currentTopic, filename }),
    });
    loadTopicImages(currentTopic);
  };

  const handleUploadBg = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return;
    const fd = new FormData();
    fd.append("file", e.target.files[0]);
    try {
      const res = await fetch(`${API_BASE}/api/backgrounds/upload`, { method: "POST", body: fd });
      const d: BgData = await res.json();
      setSelectedBgUrl(d.url);
      loadBackgrounds();
      handleAddBgToTimeline(d);
    } catch {
      alert("Lỗi tải video nền!");
    } finally {
      e.target.value = "";
    }
  };

  const handleOcrToStandaloneText = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return;
    const file = e.target.files[0];
    setIsScanningOcr(true);
    const fd = new FormData();
    fd.append("topic_name", "temp_scan");
    fd.append("file", file);
    try {
      const res = await fetch(`${API_BASE}/api/topics/upload-image`, { method: "POST", body: fd });
      const data = await res.json();
      if (data.ocr_text) {
        const clean = data.ocr_text.replace(/Translate/gi, "").replace(/\b\d{1,2}h\b/gi, "").trim();
        setStandaloneText(clean);
      }
    } catch {
      alert("Lỗi OCR ảnh!");
    } finally {
      setIsScanningOcr(false);
      e.target.value = "";
    }
  };

  const handleGenerateStandaloneVoice = async () => {
    if (!standaloneText.trim()) return;
    setIsGeneratingTts(true);
    try {
      const res = await fetch(`${API_BASE}/api/tts/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: standaloneText,
          voice: standaloneVoice,
          speed_level: standaloneSpeed,
          topic_name: currentTopic || "general"
        }),
      });
      const data = await res.json();
      if (data.audio_url) {
        const dur = data.duration || 3.0;
        setLatestAudio({
          id: Math.random().toString(36).substring(7),
          name: data.name || standaloneText.slice(0, 25),
          text: standaloneText,
          voice: data.voice_used || standaloneVoice,
          speed: standaloneSpeed,
          audio_url: data.audio_url.startsWith("http") ? data.audio_url : `${API_BASE}${data.audio_url}`,
          file_path: data.file_path,
          duration: dur,
          maxDuration: dur,
        });
      }
    } catch {
      alert("Lỗi tạo giọng đọc!");
    } finally {
      setIsGeneratingTts(false);
    }
  };

  const handleUploadImageToTopic = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0] || !currentTopic) return;
    const file = e.target.files[0];
    const fd = new FormData();
    fd.append("topic_name", currentTopic);
    fd.append("file", file);

    try {
      const res = await fetch(`${API_BASE}/api/topics/upload-image`, { method: "POST", body: fd });
      const data = await res.json();
      loadTopicImages(currentTopic);

      recordHistory();
      const lastBlock = blocks[blocks.length - 1];
      const nextStartTime = lastBlock ? lastBlock.startTime + lastBlock.duration : 0;

      const newBlock: TimelineBlock = {
        id: "block_" + Date.now(),
        image_path: data.path,
        image_url: data.url?.startsWith("http") ? data.url : `${API_BASE}${data.url}`,
        text: data.ocr_text || "",
        startTime: Number(nextStartTime.toFixed(2)),
        duration: 3.0,
        img_x: 140,
        img_y: 450,
        img_width: 800,
      };
      setBlocks((prev) => [...prev, newBlock]);
      setSelectedBlockId(newBlock.id);
    } catch {
      alert("Lỗi tải ảnh!");
    } finally {
      e.target.value = "";
    }
  };

  const handleUpdateBlockVoice = async (blockId: string, updatedProps: Partial<TimelineBlock>) => {
    const target = blocks.find((b) => b.id === blockId);
    if (!target) return;
    const merged = { ...target, ...updatedProps };
    recordHistory();
    setBlocks((prev) => prev.map((b) => (b.id === blockId ? merged : b)));
  };

  const activeBlock = blocks.find((b) => b.id === selectedBlockId) || null;
  const activeVoiceItem = voiceList.find((v) => v.id === selectedVoiceId) || null;
  const activeAudioItem = [...bgmList, ...soundFxList].find((a) => a.id === selectedAudioId) || null;
  const activeBgClip = bgClips.find((c) => c.id === selectedClipId) || null;

  const previewActiveBlock = blocks.find((b) => {
    return currentTime >= b.startTime && currentTime <= b.startTime + b.duration;
  }) || null;

  const currentActiveBgClip = bgClips.find(
    (c) => currentTime >= c.startTime && currentTime <= c.startTime + c.duration
  ) || null;

  const handleMouseDownOnImage = (e: React.MouseEvent) => {
    if (!previewActiveBlock) return;
    e.stopPropagation();
    e.preventDefault();
    recordHistory();
    setIsDragging(true);
    setSelectedBlockId(previewActiveBlock.id);
    dragStartPos.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      initialX: previewActiveBlock.img_x,
      initialY: previewActiveBlock.img_y,
    };
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || !activeBlock) return;
      const deltaX = e.clientX - dragStartPos.current.mouseX;
      const deltaY = e.clientY - dragStartPos.current.mouseY;
      const scaleMultiplier = baseScale * zoomScale;
      const moveXOriginal = Math.round(deltaX / scaleMultiplier);
      const moveYOriginal = Math.round(deltaY / scaleMultiplier);

      const newX = Math.max(0, Math.min(1080 - (activeBlock.img_width || 800), dragStartPos.current.initialX + moveXOriginal));
      const newY = Math.max(0, Math.min(1920 - 150, dragStartPos.current.initialY + moveYOriginal));

      setBlocks((prev) =>
        prev.map((b) => (b.id === activeBlock.id ? { ...b, img_x: newX, img_y: newY } : b))
      );
    };

    const handleMouseUp = () => { if (isDragging) setIsDragging(false); };
    if (isDragging) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    }
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, activeBlock, zoomScale, baseScale]);

  // HÀM BẮT ĐẦU XUẤT BẢN VIDEO (TẮT HOÀN TOÀN ÂM NỀN + POLLING TIẾN TRÌNH %)
  const handleStartExportVideo = async () => {
    if (bgClips.length === 0 && blocks.length === 0) {
      alert("Vui lòng thêm ít nhất 1 video nền hoặc 1 ảnh comment vào timeline!");
      return;
    }
    setIsRendering(true);
    setRenderedUrl(null);
    setRenderProgress(0);

    try {
      const res = await fetch(`${API_BASE}/api/video/export-task`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resolution: exportRes,
          fps: 30,
          bg_clips: bgClips.map((c) => ({
            video_path: c.url,
            startTime: c.startTime,
            duration: c.duration,
            trimStart: c.trimStart,
          })),
          blocks: blocks.map((b) => ({
            image_path: b.image_path || b.image_url,
            startTime: b.startTime,
            duration: b.duration,
            img_x: b.img_x,
            img_y: b.img_y,
            img_width: b.img_width || 800,
          })),
          meme_images: memeImageList.map((m) => ({
            image_path: m.url,
            startTime: m.startTime,
            duration: m.duration,
            img_x: m.img_x,
            img_y: m.img_y,
            img_width: m.img_width,
          })),
          voices: voiceList.map((v) => ({
            audio_path: v.path || v.url,
            startTime: v.startTime,
            duration: v.duration,
            volume: 100.0,
          })),
          bgm_list: bgmList.map((b) => ({
            audio_path: b.url,
            startTime: b.startTime,
            duration: b.duration,
            volume: b.volume !== undefined ? b.volume : 100.0,
          })),
          sound_fx_list: soundFxList.map((s) => ({
            audio_path: s.url,
            startTime: s.startTime,
            duration: s.duration,
            volume: s.volume !== undefined ? s.volume : 100.0,
          })),
        }),
      });

      const data = await res.json();
      if (data.job_id) {
        setRenderJobId(data.job_id);

        if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);

        pollingIntervalRef.current = setInterval(async () => {
          try {
            const pollRes = await fetch(`${API_BASE}/api/video/progress/${data.job_id}`);
            const pollData = await pollRes.json();

            setRenderProgress(pollData.progress || 0);

            if (pollData.status === "completed") {
              if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
              setRenderedUrl(pollData.video_url);
              setIsRendering(false);
              setRenderProgress(100);
            } else if (pollData.status === "cancelled") {
              if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
              setIsRendering(false);
              setRenderProgress(0);
            } else if (pollData.status === "error") {
              if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
              setIsRendering(false);
              alert("Lỗi xuất video: " + (pollData.error || "Không xác định"));
            }
          } catch (err) {
            console.error("Lỗi polling:", err);
          }
        }, 400);
      }
    } catch {
      setIsRendering(false);
      alert("Không thể khởi tạo tiến trình render!");
    }
  };

  const handleWheelZoom = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.05 : 0.05;
      setZoomScale((prev) => Math.min(Math.max(0.5, prev + delta), 1.8));
    }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-100 overflow-hidden font-sans select-none">
      {/* HEADER CÓ NÚT XUẤT VIDEO MỞ MODAL */}
      <Header
        showTimeline={showTimeline}
        setShowTimeline={setShowTimeline}
        handleRenderTimeline={() => setShowExportModal(true)}
        isRendering={isRendering}
        hasBlocks={blocks.length > 0 || bgClips.length > 0}
      />

      <div className="flex-1 flex overflow-hidden">
        {/* TABS TRÁI */}
        <div className="w-[340px] border-r border-slate-800/80 bg-slate-900/30 flex flex-col shrink-0 h-full overflow-hidden">
          <div className="flex border-b border-slate-800/80 bg-slate-950/60 text-xs shrink-0">
            <button
              onClick={() => setLeftTab("tts")}
              className={`flex-1 py-2.5 font-semibold flex items-center justify-center gap-1.5 transition ${
                leftTab === "tts" ? "border-b-2 border-amber-400 text-amber-300 bg-slate-900/80" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Mic size={13} /> Voice
            </button>
            <button
              onClick={() => setLeftTab("topics")}
              className={`flex-1 py-2.5 font-semibold flex items-center justify-center gap-1.5 transition ${
                leftTab === "topics" ? "border-b-2 border-rose-500 text-rose-300 bg-slate-900/80" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <ImageIcon size={13} /> Kho Ảnh
            </button>
            <button
              onClick={() => setLeftTab("bg")}
              className={`flex-1 py-2.5 font-semibold flex items-center justify-center gap-1.5 transition ${
                leftTab === "bg" ? "border-b-2 border-teal-400 text-teal-300 bg-slate-900/80" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Video size={13} /> Nền
            </button>
            <button
              onClick={() => setLeftTab("assets")}
              className={`flex-1 py-2.5 font-semibold flex items-center justify-center gap-1.5 transition ${
                leftTab === "assets" ? "border-b-2 border-indigo-400 text-indigo-300 bg-slate-900/80" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Sparkles size={13} /> Nhạc & Meme
            </button>
          </div>

          <div className="flex-1 min-h-0 p-3.5 flex flex-col overflow-hidden">
            {leftTab === "tts" && (
              <div className="flex-1 overflow-y-auto pr-1">
                <VoiceTab
                  standaloneText={standaloneText}
                  setStandaloneText={setStandaloneText}
                  standaloneVoice={standaloneVoice}
                  setStandaloneVoice={setStandaloneVoice}
                  standaloneSpeed={standaloneSpeed}
                  setStandaloneSpeed={setStandaloneSpeed}
                  voices={voices}
                  isScanningOcr={isScanningOcr}
                  isGeneratingTts={isGeneratingTts}
                  latestAudio={latestAudio}
                  handleOcrToStandaloneText={handleOcrToStandaloneText}
                  handleGenerateStandaloneVoice={handleGenerateStandaloneVoice}
                  handleAddLatestVoiceToTimeline={handleAddLatestVoiceToTimeline}
                  onAddManualVoiceToTimeline={handleAddManualVoiceToTimeline}
                  currentTopic={currentTopic}
                  topics={topics.length > 0 ? topics : ["general"]}
                />
              </div>
            )}

            {leftTab === "topics" && (
              <TopicsTab
                topics={topics}
                currentTopic={currentTopic}
                setCurrentTopic={(t) => {
                  setCurrentTopic(t);
                  loadTopicImages(t);
                }}
                topicImages={topicImages}
                apiBase={API_BASE}
                activeBlock={activeBlock}
                setBlocks={setBlocks}
                handleCreateTopic={handleCreateTopic}
                handleRenameTopic={handleRenameTopic}
                handleDeleteTopic={handleDeleteTopic}
                handleUploadImageToTopic={handleUploadImageToTopic}
                handleDeleteSingleImage={handleDeleteSingleImage}
              />
            )}

            {leftTab === "bg" && (
              <div className="flex-1 overflow-y-auto pr-1">
                <BackgroundTab
                  bgVideos={bgVideos}
                  selectedBg={selectedBgUrl}
                  setSelectedBg={setSelectedBgUrl}
                  handleUploadBg={handleUploadBg}
                  onAddBgToTimeline={handleAddBgToTimeline}
                />
              </div>
            )}

            {leftTab === "assets" && (
              <div className="flex-1 overflow-y-auto pr-1">
                <AssetsTab
                  onAddAudioToTimeline={handleAddAudioToTimeline}
                  onAddMemeImageToTimeline={handleAddMemeImageToTimeline}
                />
              </div>
            )}
          </div>
        </div>

        {/* PREVIEW PLAYER: LUÔN TẮT TIẾNG VIDEO NỀN (MUTED=TRUE) */}
        <PreviewPlayer
          selectedBg={currentActiveBgClip?.url || ""}
          previewActiveBlock={previewActiveBlock}
          baseScale={baseScale}
          zoomScale={zoomScale}
          setZoomScale={setZoomScale}
          showZoomPanel={showZoomPanel}
          setShowZoomPanel={setShowZoomPanel}
          isDragging={isDragging}
          handleMouseDownOnImage={handleMouseDownOnImage}
          handleWheelZoom={handleWheelZoom}
          renderedUrl={renderedUrl}
          currentTime={currentTime}
          totalDuration={totalDuration}
          isPlaying={isPlaying}
          setIsPlaying={setIsPlaying}
          setBlocks={setBlocks}
          bgStartTime={currentActiveBgClip?.startTime || 0}
          bgDuration={currentActiveBgClip?.duration || 10}
          bgTrimStart={currentActiveBgClip?.trimStart || 0}
          memeImageList={memeImageList}
        />

        <Inspector
          inspectorTab={inspectorTab}
          setInspectorTab={setInspectorTab}
          activeBlock={activeBlock}
          setBlocks={setBlocks}
          activeAudioItem={activeAudioItem}
          onUpdateAudioItem={handleUpdateAudioItem}
          activeVoiceItem={activeVoiceItem}
          handleUpdateBlockVoice={handleUpdateBlockVoice}
          voices={voices}
        />
      </div>

      {/* TIMELINE */}
      {showTimeline && (
        <Timeline
          bgClips={bgClips}
          setBgClips={setBgClips}
          selectedClipId={selectedClipId}
          setSelectedClipId={setSelectedClipId}
          blocks={blocks}
          setBlocks={setBlocks}
          selectedBlockId={selectedBlockId}
          setSelectedBlockId={setSelectedBlockId}
          voiceList={voiceList}
          setVoiceList={setVoiceList}
          selectedVoiceId={selectedVoiceId}
          setSelectedVoiceId={setSelectedVoiceId}
          currentTime={currentTime}
          setCurrentTime={setCurrentTime}
          totalDuration={totalDuration}
          isPlaying={isPlaying}
          setIsPlaying={setIsPlaying}
          bgmList={bgmList}
          setBgmList={setBgmList}
          soundFxList={soundFxList}
          setSoundFxList={setSoundFxList}
          selectedAudioId={selectedAudioId}
          setSelectedAudioId={setSelectedAudioId}
          memeImageList={memeImageList}
          setMemeImageList={setMemeImageList}
          onUndo={handleUndo}
          onRedo={handleRedo}
          canUndo={undoStack.length > 0}
          canRedo={redoStack.length > 0}
          onRecordHistory={recordHistory}
        />
      )}

      {/* MODAL XUẤT BẢN VIDEO ĐA ĐỊNH DẠNG (1080P, 2K, 4K) CÓ PHÍM ESC HỦY NHANH */}
      {showExportModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#16181d] border border-slate-700 w-full max-w-md rounded-2xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <span className="font-bold text-slate-100 flex items-center gap-2">
                <Film size={16} className="text-rose-500" /> Xuất Bản Video (Render)
              </span>
              {!isRendering && (
                <button
                  onClick={() => setShowExportModal(false)}
                  title="Đóng (ESC)"
                  className="text-slate-400 hover:text-white p-1 rounded-lg"
                >
                  <X size={16} />
                </button>
              )}
            </div>

            <div className="space-y-3">
              <label className="text-slate-300 font-medium block text-xs">Chọn chất lượng độ phân giải:</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: "1080p", label: "Full HD", res: "1080x1920" },
                  { id: "2k", label: "2K QHD", res: "1440x2560" },
                  { id: "4k", label: "4K Ultra", res: "2160x3840" },
                ].map((item) => (
                  <button
                    key={item.id}
                    disabled={isRendering}
                    onClick={() => setExportRes(item.id as any)}
                    className={`p-3 rounded-xl border flex flex-col items-center justify-center gap-1 transition ${
                      exportRes === item.id
                        ? "bg-rose-600/20 border-rose-500 text-rose-300 shadow-lg shadow-rose-950"
                        : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white"
                    } ${isRendering ? "opacity-50 cursor-not-allowed" : ""}`}
                  >
                    <span className="font-bold text-xs">{item.label}</span>
                    <span className="text-[10px] font-mono opacity-70">{item.res}</span>
                  </button>
                ))}
              </div>

              {/* KHUNG TIẾN ĐỘ RENDER KÈM PHÍM TẮT ESC */}
              {isRendering && (
                <div className="p-3.5 bg-slate-900/90 rounded-xl border border-rose-500/30 space-y-2.5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-rose-300 font-semibold flex items-center gap-1.5 animate-pulse">
                      <span className="w-2 h-2 rounded-full bg-rose-500" />
                      Đang kết xuất ({exportRes.toUpperCase()})...
                    </span>
                    <span className="font-mono text-white font-bold text-sm">{renderProgress}%</span>
                  </div>

                  <div className="w-full bg-slate-950 h-3 rounded-full overflow-hidden p-0.5 border border-slate-800">
                    <div
                      style={{ width: `${renderProgress}%` }}
                      className="h-full bg-gradient-to-r from-rose-600 to-amber-500 rounded-full transition-all duration-300 shadow-[0_0_12px_rgba(244,63,94,0.6)]"
                    />
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[10px] text-slate-400">
                      Bấm <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-[9px] text-amber-300 font-mono">ESC</kbd> để hủy ngay
                    </span>
                    <button
                      onClick={handleCancelExportVideo}
                      className="px-2.5 py-1 bg-slate-800 hover:bg-rose-950/80 text-rose-400 border border-slate-700 hover:border-rose-500 rounded-lg text-xs font-semibold transition active:scale-95"
                    >
                      Hủy Ngay
                    </button>
                  </div>
                </div>
              )}

              {/* XUẤT XONG THÀNH CÔNG */}
              {renderedUrl && (
                <div className="p-3 bg-emerald-950/60 border border-emerald-500/50 rounded-xl flex items-center justify-between">
                  <div className="flex items-center gap-2 text-emerald-300 text-xs">
                    <CheckCircle2 size={16} />
                    <span>Xuất video thành công 100%!</span>
                  </div>
                  <a
                    href={renderedUrl}
                    download
                    className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-bold flex items-center gap-1 shadow"
                  >
                    <Download size={12} /> Tải Về
                  </a>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={() => setShowExportModal(false)}
                disabled={isRendering}
                className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 rounded-xl font-medium transition text-xs"
              >
                Đóng
              </button>
              <button
                onClick={handleStartExportVideo}
                disabled={isRendering}
                className="flex-1 py-2 bg-rose-600 hover:bg-rose-500 active:scale-95 text-white rounded-xl font-bold transition flex items-center justify-center gap-2 shadow-lg shadow-rose-950 disabled:opacity-50 text-xs"
              >
                {isRendering ? `Đang Render ${renderProgress}%...` : "Bắt Đầu Xuất Bản"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}