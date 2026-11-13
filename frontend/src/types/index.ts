export interface BgData {
  name: string;
  url: string;
  type: string;
  duration: number;
  maxDuration?: number;
  startTime?: number;
  trimStart?: number;
  trimEnd?: number;
  thumbs: string[];
}

export interface BgClipItem {
  id: string;
  name: string;
  url: string;
  startTime: number;
  duration: number;
  maxDuration: number;
  trimStart: number;
  speed?: number;
  groupId?: string;
  thumbs: string[];
}

export interface VoiceItem {
  id: string;
  name: string;
  url: string;
  path?: string;
  startTime: number;
  duration: number;
  maxDuration: number;
  trimStart?: number;
  speed?: number;
  pitch?: number;
  originalDuration?: number;
  groupId?: string;
}

export interface GeneratedVoiceItem {
  id?: string;
  name?: string;
  text?: string;
  voice?: string;
  voice_used?: string;
  speed?: number;
  audio_url: string;
  audio_path?: string;
  file_path?: string;
  duration: number;
  maxDuration?: number;
}

export interface TimelineBlock {
  id: string;
  image_url: string;
  image_path?: string;
  img_x: number;
  img_y: number;
  img_width: number;
  startTime: number;
  duration: number;
  maxDuration?: number;
  trimStart?: number;
  groupId?: string;
  text?: string;
  voice?: string | GeneratedVoiceItem | null;
  speed?: number;
  animation?: "none" | "fade" | "pop" | "slide_up";
  borderRadius?: number;
  opacity?: number;
  audio_path?: string;
  audio_url?: string;
  audioDuration?: number;
  audioMaxDuration?: number;
  [key: string]: any;
}

export interface MediaAssetItem {
  name: string;
  url: string;
  path?: string;
  duration?: number;
  maxDuration?: number;
  type?: "image" | "video" | "audio";
}

export interface TimelineAudioItem {
  id: string;
  name: string;
  url: string;
  startTime: number;
  duration: number;
  maxDuration: number;
  trimStart?: number;
  speed?: number;
  originalDuration?: number;
  type: "bgm" | "sound_effect";
  volume?: number;
  groupId?: string;
}

export interface TimelineMemeImageItem {
  id: string;
  name: string;
  url: string;
  startTime: number;
  duration: number;
  maxDuration?: number;
  trimStart?: number;
  img_x: number;
  img_y: number;
  img_width: number;
  type?: "image" | "video";
  animation?: "none" | "fade" | "pop" | "slide_up";
  opacity?: number;
  volume?: number;
  groupId?: string;
}

export interface WatermarkConfig {
  enabled: boolean;
  style: "W1" | "W2" | "W3";
  text: string;
  opacity: number;
  scale: number;
  x: number;
  y: number;
}
