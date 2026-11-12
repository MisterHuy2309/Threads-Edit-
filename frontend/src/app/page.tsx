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
import { CoverMaker } from "@/components/CoverMaker";
import { WatermarkStudio } from "@/components/WatermarkStudio";
import { VoiceTab } from "@/components/tabs/VoiceTab";
import { TopicsTab } from "@/components/tabs/TopicsTab";
import { BackgroundTab } from "@/components/tabs/BackgroundTab";
import { AssetsTab } from "@/components/tabs/AssetsTab";
import {
  Mic,
  Image as ImageIcon,
  Video,
  Sparkles,
  X,
  Film,
  CheckCircle2,
  Download,
  ShieldCheck,
  Eye,
  EyeOff,
} from "lucide-react";

interface TimelineSnapshot {
  bgClips: BgClipItem[];
  blocks: TimelineBlock[];
  voiceList: VoiceItem[];
  memeImageList: TimelineMemeImageItem[];
  bgmList: TimelineAudioItem[];
  soundFxList: TimelineAudioItem[];
}

export default function CapCutThreadsStudio() {

  useEffect(() => {
    const handleErr = (event: ErrorEvent) => {
      if (event?.message?.includes("MetaMask") || event?.filename?.includes("inpage.js")) {
        event.stopImmediatePropagation();
        event.preventDefault();
      }
    };
    window.addEventListener("error", handleErr);
    return () => window.removeEventListener("error", handleErr);
  }, []);

  const API_BASE = "http://localhost:8000";
  const [currentView, setCurrentView] = useState<"editor" | "cover_maker" | "watermark_studio">("editor");
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
  const [blocks, setBlocks] = useState<TimelineBlock[]>([]);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [voiceList, setVoiceList] = useState<VoiceItem[]>([]);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string | null>(null);
  const [bgmList, setBgmList] = useState<TimelineAudioItem[]>([]);
  const [soundFxList, setSoundFxList] = useState<TimelineAudioItem[]>([]);
  const [selectedAudioId, setSelectedAudioId] = useState<string | null>(null);
  const [memeImageList, setMemeImageList] = useState<TimelineMemeImageItem[]>([]);
  const [selectedMemeId, setSelectedMemeId] = useState<string | null>(null);

  // --- HỆ THỐNG ĐIỀU KHIỂN & KÉO THẢ WATERMARK BẰNG HÌNH ẢNH ---
  const [watermarkEnabled, setWatermarkEnabled] = useState<boolean>(true);
  const [watermarkStyle, setWatermarkStyle] = useState<"W1" | "W2" | "W3">("W1");
  const [watermarkFileName, setWatermarkFileName] = useState<string>("watermark_1.png");
  const [watermarkX, setWatermarkX] = useState<number>(30);
  const [watermarkY, setWatermarkY] = useState<number>(30);
  const [watermarkOpacity, setWatermarkOpacity] = useState<number>(90);
  const [watermarkScale, setWatermarkScale] = useState<number>(1.0);

  const handleSelectWatermarkPreset = (preset: "W1" | "W2" | "W3") => {
    setWatermarkStyle(preset);
    if (preset === "W1") setWatermarkFileName("watermark_1.png");
    if (preset === "W2") setWatermarkFileName("watermark_2.png");
    if (preset === "W3") setWatermarkFileName("watermark_3.png");
  };

  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [showExportModal, setShowExportModal] = useState<boolean>(false);
  const [exportRes, setExportRes] = useState<"1080p" | "2k" | "4k">("1080p");
  const [isRendering, setIsRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState<number>(0);
  const [renderJobId, setRenderJobId] = useState<string | null>(null);
  const [renderedUrl, setRenderedUrl] = useState<string | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // --- UNDO / REDO SNAPSHOTS ---
  const [undoStack, setUndoStack] = useState<TimelineSnapshot[]>([]);
  const [redoStack, setRedoStack] = useState<TimelineSnapshot[]>([]);
  const canUndo = undoStack.length > 0;
  const canRedo = redoStack.length > 0;

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

    // --- QUẢN LÝ RESIZE KÉO THỦ CÔNG TIMELINE ---
  const [timelineHeight, setTimelineHeight] = useState<number>(260);
  const [isResizingTl, setIsResizingTl] = useState<boolean>(false);
  const resizeStartY = useRef<number>(0);
  const startTlHeight = useRef<number>(260);

  const handleStartResizeTl = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizingTl(true);
    resizeStartY.current = e.clientY;
    startTlHeight.current = timelineHeight;
  };

  useEffect(() => {
    const handleMouseMoveTl = (e: MouseEvent) => {
      if (!isResizingTl) return;
      const delta = resizeStartY.current - e.clientY;
      const newH = Math.min(Math.max(80, startTlHeight.current + delta), 600);
      setTimelineHeight(newH);
    };
    const handleMouseUpTl = () => {
      if (isResizingTl) setIsResizingTl(false);
    };
    if (isResizingTl) {
      window.addEventListener("mousemove", handleMouseMoveTl);
      window.addEventListener("mouseup", handleMouseUpTl);
    }
    return () => {
      window.removeEventListener("mousemove", handleMouseMoveTl);
      window.removeEventListener("mouseup", handleMouseUpTl);
    };
  }, [isResizingTl]);

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
      .then((data) => {
        if (Array.isArray(data)) {
          const formatted = data.map((item: any) => ({
            ...item,
            url: item.url?.startsWith("http")
              ? item.url
              : `${API_BASE}${item.url?.startsWith("/") ? "" : "/"}${item.url}`
          }));
          setTopicImages(formatted);
        } else {
          setTopicImages([]);
        }
      })
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
      thumbs: bg.thumbs || [],
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
      trimStart: 0,
      type: type,
      volume: 100,
      speed: 1.0,
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

  const handleUpdateVoiceItem = (id: string, updatedProps: Partial<VoiceItem>) => {
    setVoiceList((prev) => prev.map((v) => (v.id === id ? { ...v, ...updatedProps } : v)));
  };

  const handleUpdateBgClip = (id: string, updatedProps: Partial<BgClipItem>) => {
    setBgClips((prev) => prev.map((c) => (c.id === id ? { ...c, ...updatedProps } : c)));
  };

  const handleAddMemeImageToTimeline = (item: any) => {
    recordHistory();
    const startTime = Number(currentTime.toFixed(2));
    const isVid = item.type === "video" || /\.(mp4|mov|webm|mkv)(\?.*)?$/i.test(item.url);
    const newMeme: TimelineMemeImageItem = {
      id: "meme_" + Date.now(),
      name: item.name,
      url: item.url,
      startTime: startTime,
      duration: item.duration || 3.0,
      maxDuration: item.duration || 3.0,
      trimStart: 0,
      img_x: 350,
      img_y: 200,
      img_width: 350,
      type: isVid ? "video" : "image",
      opacity: 1.0,
    };
    setMemeImageList((prev) => [...prev, newMeme]);
    setSelectedMemeId(newMeme.id);
  };

  const handleUpdateMemeItem = (id: string, updatedProps: Partial<TimelineMemeImageItem>) => {
    setMemeImageList((prev) => prev.map((m) => (m.id === id ? { ...m, ...updatedProps } : m)));
  };

  const handleAddLatestVoiceToTimeline = () => {
    if (!latestAudio) return;
    recordHistory();
    const nextStart = voiceList.length > 0 ? Math.max(...voiceList.map((v) => v.startTime + v.duration)) : 0;
    const newVoice: VoiceItem = {
      id: "voice_" + Date.now(),
      name: latestAudio.name || (latestAudio.text ? latestAudio.text.slice(0, 20) : "Voice TTS"),
      url: latestAudio.audio_url,
      path: latestAudio.file_path,
      startTime: Number(nextStart.toFixed(2)),
      duration: latestAudio.duration,
      maxDuration: latestAudio.maxDuration || latestAudio.duration,
      trimStart: 0,
      speed: 1.0,
    };
    setVoiceList((prev) => [...prev, newVoice]);
    setSelectedVoiceId(newVoice.id);
  };

    const handleAddManualVoiceToTimeline = (voiceItem: { name: string; url: string; duration: number; path: string }) => {
    recordHistory();
    const dur = Number(voiceItem.duration) || 3.0;
    setVoiceList((prev) => {
      const safePrev = Array.isArray(prev) ? prev : [];
      const nextStart = safePrev.length > 0 
        ? Math.max(...safePrev.map((v) => (v.startTime || 0) + (v.duration || 0))) 
        : Number(currentTime.toFixed(2));

      const newVoice: VoiceItem = {
        id: "voice_" + Date.now(),
        name: voiceItem.name || "Voice Audio",
        url: voiceItem.url,
        path: voiceItem.path || voiceItem.url,
        startTime: Number(nextStart.toFixed(2)),
        duration: dur,
        maxDuration: dur,
        trimStart: 0,
        speed: 1.0,
      };
      setSelectedVoiceId(newVoice.id);
      return [...safePrev, newVoice];
    });
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
          topic_name: currentTopic || "general",
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

    const handleDirectAddBlock = (imgData: any) => {
    recordHistory();
    const lastBlock = blocks[blocks.length - 1];
    const nextStart = lastBlock ? Number((lastBlock.startTime + lastBlock.duration).toFixed(2)) : Number(currentTime.toFixed(2));
    const rawUrl = imgData.url || imgData.image_url || imgData.imageUrl || "";
    const cleanPath = rawUrl.startsWith("/") ? rawUrl : "/" + rawUrl;
    const fullUrl = rawUrl.startsWith("http") ? rawUrl : (API_BASE + cleanPath);
    const p = imgData.path || imgData.image_path || fullUrl;
    const newBlock: TimelineBlock = {
      id: "block_" + Date.now(),
      image_url: fullUrl,
      image_path: p,
      startTime: nextStart,
      duration: 3.0,
      img_x: 140,
      img_y: 450,
      img_width: 800,
      borderRadius: 12,
      opacity: 1.0,
    };
    setBlocks((prev) => [...prev, newBlock]);
    setSelectedBlockId(newBlock.id);
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
        animation: "none",
        borderRadius: 12,
        opacity: 1.0,
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
  const activeMemeItem = memeImageList.find((m) => m.id === selectedMemeId) || null;

    const currentActiveBgClip = bgClips.find(
    (c) => currentTime >= c.startTime && currentTime <= (c.startTime + c.duration)
  ) || null;
  const activeTimelineBgUrl = currentActiveBgClip ? currentActiveBgClip.url : "";

  const previewActiveBlock =
    blocks.find((b) => currentTime >= b.startTime && currentTime <= b.startTime + b.duration) || null;

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
    const handleMouseUp = () => {
      if (isDragging) setIsDragging(false);
    };
    if (isDragging) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    }
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, activeBlock, zoomScale, baseScale]);

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
            speed: c.speed || 1.0,
          })),
          blocks: blocks.map((b) => ({
            image_path: b.image_path || b.image_url,
            startTime: b.startTime,
            duration: b.duration,
            img_x: b.img_x,
            img_y: b.img_y,
            img_width: b.img_width || 800,
            animation: b.animation || "none",
            opacity: b.opacity ?? 1.0,
          })),
          meme_images: memeImageList.map((m) => ({
            image_path: m.url,
            startTime: m.startTime,
            duration: m.duration,
            img_x: m.img_x,
            img_y: m.img_y,
            img_width: m.img_width,
            animation: m.animation || "none",
            opacity: m.opacity ?? 1.0,
          })),
          voices: voiceList.map((v) => ({
            audio_path: v.path || v.url,
            startTime: v.startTime,
            duration: v.duration,
            trimStart: v.trimStart || 0,
            speed: v.speed || 1.0,
            volume: 100.0,
          })),
          bgm_list: bgmList.map((b) => ({
            audio_path: b.url,
            startTime: b.startTime,
            duration: b.duration,
            trimStart: b.trimStart || 0,
            speed: b.speed || 1.0,
            volume: b.volume !== undefined ? b.volume : 100.0,
          })),
          sound_fx_list: soundFxList.map((s) => ({
            audio_path: s.url,
            startTime: s.startTime,
            duration: s.duration,
            trimStart: s.trimStart || 0,
            speed: s.speed || 1.0,
            volume: s.volume !== undefined ? s.volume : 100.0,
          })),
          watermark: {
            enabled: watermarkEnabled,
            style: watermarkStyle,
            image_url: `http://127.0.0.1:8000/media/watermarks/${watermarkFileName || "watermark_1.png"}`,
            opacity: watermarkOpacity / 100,
            scale: watermarkScale,
            x: watermarkX,
            y: watermarkY,
          },
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

  if (currentView === "cover_maker") {
    return <CoverMaker onBack={() => setCurrentView("editor")} />;
  }
  if (currentView === "watermark_studio") {
    return <WatermarkStudio onBack={() => setCurrentView("editor")} />;
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#0d0e12] text-slate-100 select-none">
      <div className="flex-1 flex flex-col min-w-0 h-full relative">
        {/* HEADER CHÍNH */}
        <Header
          {...({
            currentView,
            setCurrentView,
            showExportModal,
            setShowExportModal,
            isRendering,
            renderProgress,
            showTimeline,
            setShowTimeline,
            onOpenCoverMaker: () => setCurrentView('cover_maker'),
            onOpenWatermarkStudio: () => setCurrentView('watermark_studio'),
          } as any)}
        />

        {/* WORKSPACE AREA */}
        <div className="flex-1 flex min-h-0 relative">
          {/* CỘT TABS TÀI NGUYÊN BÊN TRÁI */}
          <div className="w-[380px] shrink-0 border-r border-slate-800 bg-[#121316] flex flex-col h-full overflow-hidden">
            {/* Tab Buttons */}
            <div className="flex border-b border-slate-800 bg-[#16181d] shrink-0">
              <button
                onClick={() => setLeftTab("tts")}
                className={`flex-1 py-2.5 text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
                  leftTab === "tts"
                    ? "border-b-2 border-cyan-400 text-cyan-300 bg-cyan-950/20"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <Mic size={14} /> Voice
              </button>
              <button
                onClick={() => setLeftTab("topics")}
                className={`flex-1 py-2.5 text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
                  leftTab === "topics"
                    ? "border-b-2 border-cyan-400 text-cyan-300 bg-cyan-950/20"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <ImageIcon size={14} /> Kho Ảnh
              </button>
              <button
                onClick={() => setLeftTab("bg")}
                className={`flex-1 py-2.5 text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
                  leftTab === "bg"
                    ? "border-b-2 border-cyan-400 text-cyan-300 bg-cyan-950/20"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <Video size={14} /> Nền
              </button>
              <button
                onClick={() => setLeftTab("assets")}
                className={`flex-1 py-2.5 text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
                  leftTab === "assets"
                    ? "border-b-2 border-cyan-400 text-cyan-300 bg-cyan-950/20"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <Sparkles size={14} /> Nhạc & Meme
              </button>
            </div>

            {/* Tab Contents */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-3">
              {leftTab === "tts" && (
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
                onAddImageDirectly={handleDirectAddBlock}
                handleCreateTopic={handleCreateTopic}
                handleRenameTopic={handleRenameTopic}
                handleDeleteTopic={handleDeleteTopic}
                handleUploadImageToTopic={handleUploadImageToTopic}
                handleDeleteSingleImage={handleDeleteSingleImage}
              />
              )}
                                          {leftTab === "bg" && (
                <BackgroundTab
                  {...({
                    bgVideos,
                    selectedBg: selectedBgUrl,
                    selectedBgUrl: selectedBgUrl,
                    setSelectedBg: (url: string) => {
                      setSelectedBgUrl(url);
                    },
                    setSelectedBgUrl: (url: string) => {
                      setSelectedBgUrl(url);
                    },
                    onSelectBg: (target: any) => {
                      if (typeof target === "object" && target !== null && target.url) {
                        setSelectedBgUrl(target.url);
                        handleAddBgToTimeline(target);
                        return;
                      }
                      const urlStr = typeof target === "string" ? target : "";
                      setSelectedBgUrl(urlStr);
                      const matched = bgVideos.find((b) => b.url === urlStr);
                      if (matched) {
                        handleAddBgToTimeline(matched);
                      } else if (urlStr) {
                        handleAddBgToTimeline({
                          name: urlStr.split("/").pop() || "Background Video",
                          url: urlStr.startsWith("http") ? urlStr : `${API_BASE}${urlStr.startsWith("/") ? "" : "/"}${urlStr}`,
                          duration: 10.0,
                          maxDuration: 10.0,
                          thumbs: [],
                          type: "video"
                        } as any);
                      }
                    },
                    onAddBgToTimeline: (bg: any) => {
                      if (typeof bg === "object" && bg !== null) {
                        setSelectedBgUrl(bg.url || "");
                        handleAddBgToTimeline(bg);
                      } else {
                        const matched = bgVideos.find((b) => b.url === bg);
                        if (matched) handleAddBgToTimeline(matched);
                      }
                    },
                    onAddBg: (bg: any) => {
                      if (typeof bg === "object" && bg !== null) {
                        setSelectedBgUrl(bg.url || "");
                        handleAddBgToTimeline(bg);
                      }
                    },
                    onUploadBg: handleUploadBg
                  } as any)}
                />
              )}
                            {leftTab === "assets" && (
                <AssetsTab
                onAddAudioToTimeline={handleAddAudioToTimeline}
                onAddMemeImageToTimeline={handleAddMemeImageToTimeline}
                {...({
                  onAddAudio: handleAddAudioToTimeline,
                  onAddMeme: handleAddMemeImageToTimeline,
                  onSelectAudio: handleAddAudioToTimeline,
                  onSelectMeme: handleAddMemeImageToTimeline,
                } as any)}
              />
              )}
            </div>
          </div>

          {/* KHUNG PREVIEW TRUNG TÂM */}
        <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#0a0b0e] relative min-w-0">
          {/* THANH ĐIỀU KHIỂN WATERMARK: GHIM CỐ ĐỊNH TRÊN ĐỈNH (SHRINK-0) */}
          <div className="w-full py-2 px-3 flex items-center justify-center shrink-0 border-b border-slate-800/80 bg-[#101217]/95 z-30 shadow-md">
            <div className="flex items-center gap-2 bg-[#181a20] px-3 py-1 rounded-full border border-slate-700 text-xs">
              <button
                onClick={() => setWatermarkEnabled(!watermarkEnabled)}
                className={`flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border transition ${
                  watermarkEnabled
                    ? "bg-emerald-950 border-emerald-400 text-emerald-300"
                    : "bg-slate-800 border-slate-700 text-slate-400"
                }`}
              >
                {watermarkEnabled ? <Eye size={12} /> : <EyeOff size={12} />}
                <span>WM: {watermarkEnabled ? "BẬT" : "TẮT"}</span>
              </button>

              <div className="h-3 w-[1px] bg-slate-700 mx-1" />

              <div className="flex items-center bg-slate-900 border border-slate-800 rounded-full p-0.5">
                {(["W1", "W2", "W3"] as const).map((preset) => (
                  <button
                    key={preset}
                    onClick={() => handleSelectWatermarkPreset(preset)}
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold transition ${
                      watermarkStyle === preset
                        ? "bg-emerald-500 text-slate-950 shadow"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>

              <div className="h-3 w-[1px] bg-slate-700 mx-1" />

              <div className="flex items-center gap-1.5 text-[11px] text-slate-300">
                <span className="opacity-80">Mờ:</span>
                <input
                  type="range"
                  min="5"
                  max="100"
                  value={watermarkOpacity}
                  onChange={(e) => setWatermarkOpacity(Number(e.target.value))}
                  className="w-14 accent-emerald-400 h-1 cursor-pointer"
                />
                <span className="font-mono text-emerald-400 text-[10px] w-6">{watermarkOpacity}%</span>
              </div>

              <div className="h-3 w-[1px] bg-slate-700 mx-1" />

              <div className="flex items-center gap-1.5 text-[11px] text-slate-300">
                <span className="opacity-80">Size:</span>
                <input
                  type="range"
                  min="0.4"
                  max="2.0"
                  step="0.05"
                  value={watermarkScale}
                  onChange={(e) => setWatermarkScale(Number(e.target.value))}
                  className="w-14 accent-emerald-400 h-1 cursor-pointer"
                />
                <span className="font-mono text-emerald-400 text-[10px] w-5">{watermarkScale}x</span>
              </div>
            </div>
          </div>

          {/* VÙNG CUỘN VIDEO: TỰ DO CUỘN DỌC TẬN ĐỈNH & CUỘN NGANG KHÔNG BỊ KHUẤT */}
          <div className="flex-1 overflow-y-auto overflow-x-auto p-4 flex flex-col items-center justify-start min-h-0">
            <PreviewPlayer
              hasBgClipOnTimeline={!!currentActiveBgClip}
              bgStartTime={currentActiveBgClip ? currentActiveBgClip.startTime : 0}
              bgDuration={currentActiveBgClip ? currentActiveBgClip.duration : 0}
              bgTrimStart={currentActiveBgClip ? currentActiveBgClip.trimStart : 0}
              bgSpeed={currentActiveBgClip ? (currentActiveBgClip.speed || 1.0) : 1.0}
              bgClips={bgClips}
              selectedBg={activeTimelineBgUrl}
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
              memeImageList={memeImageList}
              setMemeImageList={setMemeImageList}
              selectedMemeId={selectedMemeId}
              setSelectedMemeId={setSelectedMemeId}
              watermarkEnabled={watermarkEnabled}
              setWatermarkEnabled={setWatermarkEnabled}
              watermarkX={watermarkX}
              setWatermarkX={setWatermarkX}
              watermarkY={watermarkY}
              setWatermarkY={setWatermarkY}
              watermarkOpacity={watermarkOpacity}
              setWatermarkOpacity={setWatermarkOpacity}
              watermarkScale={watermarkScale}
              setWatermarkScale={setWatermarkScale}
              watermarkFileName={watermarkFileName}
              setWatermarkFileName={setWatermarkFileName}
            />
          </div>
        </div>

        {/* CỘT INSPECTOR BÊN PHẢI */}
          <Inspector
            inspectorTab={inspectorTab}
            setInspectorTab={setInspectorTab}
            activeBlock={activeBlock}
            setBlocks={setBlocks}
            activeAudioItem={activeAudioItem}
            onUpdateAudioItem={handleUpdateAudioItem}
            activeVoiceItem={activeVoiceItem}
            onUpdateVoiceItem={handleUpdateVoiceItem}
            activeBgClip={activeBgClip}
            onUpdateBgClip={handleUpdateBgClip}
            activeMemeItem={activeMemeItem}
            onUpdateMemeItem={handleUpdateMemeItem}
            handleUpdateBlockVoice={handleUpdateBlockVoice}
            voices={voices}
          />
        </div>

        {/* TIMELINE PHÍA DƯỚI (DUY NHẤT 1 KHỐI) */}
        {/* THANH RESIZE KÉO THỦ CÔNG TIMELINE */}
        <div
          onMouseDown={handleStartResizeTl}
          title="Giữ chuột và kéo lên/xuống để chỉnh độ cao Timeline"
          className="h-2 w-full bg-[#181a20] hover:bg-cyan-500 active:bg-cyan-400 cursor-row-resize flex items-center justify-center transition-colors z-30 shrink-0 border-y border-slate-800"
        >
          <div className="w-12 h-1 bg-slate-600 rounded-full hover:bg-white pointer-events-none" />
        </div>

        {/* KHỐI TIMELINE */}
        <div
          style={{ height: showTimeline ? `${timelineHeight}px` : "46px" }}
          className="flex flex-col shrink-0 overflow-hidden border-t border-slate-800 bg-[#121316] transition-[height] duration-75 select-none"
        >
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
            isPlaying={isPlaying}
            setIsPlaying={setIsPlaying}
            totalDuration={totalDuration}
            bgmList={bgmList}
            setBgmList={setBgmList}
            soundFxList={soundFxList}
            setSoundFxList={setSoundFxList}
            selectedAudioId={selectedAudioId}
            setSelectedAudioId={setSelectedAudioId}
            memeImageList={memeImageList}
            setMemeImageList={setMemeImageList}
            selectedMemeId={selectedMemeId}
            setSelectedMemeId={setSelectedMemeId}
            onUndo={handleUndo}
            onRedo={handleRedo}
            canUndo={canUndo}
            canRedo={canRedo}
            onRecordHistory={recordHistory}
          />
        </div>
      </div>

      {/* MODAL XUẤT VIDEO */}
      {showExportModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#16181d] border border-slate-700 w-full max-w-lg rounded-2xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <span className="font-bold text-slate-100 flex items-center gap-2">
                <Film size={16} className="text-rose-500" /> Xuất Bản Video 9:16
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
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                  <ShieldCheck size={14} className="text-emerald-400" /> Trạng thái Watermark:
                </span>
                <span
                  className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                    watermarkEnabled
                      ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                      : "bg-slate-800 text-slate-400"
                  }`}
                >
                  {watermarkEnabled ? `Đang Bật (${watermarkStyle})` : "Đã Tắt"}
                </span>
              </div>

              <label className="text-slate-300 font-medium block text-xs">Độ phân giải kết xuất:</label>
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
                    className={`p-2.5 rounded-xl border flex flex-col items-center justify-center gap-1 transition ${
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


