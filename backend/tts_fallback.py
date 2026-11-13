import asyncio
import os
import re
import wave
import subprocess
import edge_tts
from gtts import gTTS
from piper.voice import PiperVoice

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PIPER_MODEL_PATH = os.path.join(BASE_DIR, "models", "vi_VN-vais1000-medium.onnx")

_piper_voice = None

def _get_piper_voice():
    global _piper_voice
    if _piper_voice is None and os.path.exists(PIPER_MODEL_PATH):
        _piper_voice = PiperVoice.load(PIPER_MODEL_PATH)
    return _piper_voice

# Giữ tốc độ gốc = 1.0 để khớp 100% với thanh speed_level mà người dùng chỉnh trên UI
VOICE_PROFILES = {
    "vi-VN-NamMinhNeural": {
        "edge_voice": "vi-VN-NamMinhNeural", "lang": "vi", "semitones": -4.2, "base_speed": 1.0,
        "eq": "highpass=f=85,lowpass=f=7500,equalizer=f=180:width_type=h:width=120:g=3"
    },
    "review-nam-gaycan": {
        "edge_voice": "vi-VN-NamMinhNeural", "lang": "vi", "semitones": -3.5, "base_speed": 1.0,
        "eq": "highpass=f=90,lowpass=f=8000,equalizer=f=220:width_type=h:width=150:g=2.5"
    },
    "review-nam-chieurap": {
        "edge_voice": "vi-VN-NamMinhNeural", "lang": "vi", "semitones": -5.5, "base_speed": 1.0,
        "eq": "highpass=f=75,lowpass=f=6800,equalizer=f=140:width_type=h:width=100:g=4.5"
    },
    "vi-VN-HoaiMyNeural": {
        "edge_voice": "vi-VN-HoaiMyNeural", "lang": "vi", "semitones": 0.0, "base_speed": 1.0,
        "eq": "highpass=f=110,lowpass=f=8500"
    },
    "story-lanhuong": {
        "edge_voice": "vi-VN-HoaiMyNeural", "lang": "vi", "semitones": -0.8, "base_speed": 1.0,
        "eq": "highpass=f=100,lowpass=f=7200,equalizer=f=300:width_type=h:width=200:g=2"
    },
    "meme-chipmunk": {
        "edge_voice": "vi-VN-HoaiMyNeural", "lang": "vi", "semitones": 3.4, "base_speed": 1.0,
        "eq": "highpass=f=150,equalizer=f=320:width_type=h:width=180:g=-4,equalizer=f=3200:width_type=h:width=800:g=2.5,lowpass=f=8500"
    },
    "en-US-GuyNeural": {
        "edge_voice": "en-US-GuyNeural", "lang": "en", "tld": "com", "semitones": -3.8, "base_speed": 1.0,
        "eq": "highpass=f=85,lowpass=f=8000,equalizer=f=180:width_type=h:width=120:g=3"
    },
    "en-US-JennyNeural": {
        "edge_voice": "en-US-JennyNeural", "lang": "en", "tld": "com", "semitones": 0.0, "base_speed": 1.0,
        "eq": "highpass=f=110,lowpass=f=8500"
    }
}

def _resolve_profile(voice_key: str, rate: str = "+0%") -> dict:
    prof = VOICE_PROFILES.get(voice_key, VOICE_PROFILES["vi-VN-HoaiMyNeural"]).copy()
    # Áp dụng chính xác % tốc độ từ rate (ví dụ +0% -> 1.0, +20% -> 1.2, -15% -> 0.85)
    speed = 1.0
    try:
        r_match = re.search(r"([+-]?\d+)", str(rate))
        if r_match:
            pct_val = int(r_match.group(1))
            speed = round(max(0.5, min(2.0, 1.0 + pct_val / 100.0)), 4)
    except Exception:
        pass
    prof["speed"] = speed
    return prof

def _apply_clean_voice_filter(input_audio: str, output_mp3: str, profile: dict):
    semitones = profile["semitones"]
    speed = profile["speed"]
    eq_filter = profile["eq"]

    if abs(semitones) < 0.1:
        filters = []
        if abs(speed - 1.0) >= 0.01:
            filters.append(f"atempo={speed}")
        if eq_filter:
            filters.append(eq_filter)
        af_str = ",".join(filters) if filters else "anull"
    else:
        base_sr = 22050 if input_audio.endswith(".wav") else 24000
        pitch_scale = 2 ** (semitones / 12.0)
        new_sr = int(base_sr * pitch_scale)
        
        tempo_adj = speed / pitch_scale
        if tempo_adj < 0.5:
            atempo_chain = f"atempo=0.5,atempo={round(tempo_adj / 0.5, 4)}"
        elif tempo_adj > 2.0:
            atempo_chain = f"atempo=2.0,atempo={round(tempo_adj / 2.0, 4)}"
        else:
            atempo_chain = f"atempo={round(tempo_adj, 4)}"

        af_str = f"asetrate={new_sr},aresample=44100,{atempo_chain},{eq_filter}"

    subprocess.run(
        [
            "ffmpeg", "-y", "-i", input_audio,
            "-af", af_str,
            "-ar", "44100", "-ac", "2", "-codec:a", "libmp3lame", "-b:a", "192k",
            output_mp3
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=True
    )

def _run_gtts_sync(text: str, output_path: str, profile: dict):
    raw_mp3 = output_path + ".raw.mp3"
    try:
        tts = gTTS(text=text, lang=profile.get("lang", "vi"), tld=profile.get("tld", "com"), slow=False)
        tts.save(raw_mp3)
        _apply_clean_voice_filter(raw_mp3, output_path, profile)
    finally:
        if os.path.exists(raw_mp3):
            os.remove(raw_mp3)

def _run_piper_sync(text: str, output_mp3_path: str, profile: dict):
    voice = _get_piper_voice()
    if voice is None:
        raise FileNotFoundError(f"Khong tim thay model Piper tai {PIPER_MODEL_PATH}")
    
    temp_wav = output_mp3_path + ".temp.wav"
    try:
        with wave.open(temp_wav, "wb") as wav_file:
            voice.synthesize(text, wav_file)
        _apply_clean_voice_filter(temp_wav, output_mp3_path, profile)
    finally:
        if os.path.exists(temp_wav):
            os.remove(temp_wav)

async def generate_tts_safe(
    text: str,
    output_path: str,
    voice: str = "vi-VN-HoaiMyNeural",
    rate: str = "+0%",
    pitch: str = "+0Hz"
) -> str:
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    profile = _resolve_profile(voice, rate)
    edge_voice = profile["edge_voice"]

    try:
        communicate = edge_tts.Communicate(text=text, voice=edge_voice, rate=rate, pitch=pitch)
        await communicate.save(output_path)
        if os.path.exists(output_path) and os.path.getsize(output_path) > 500:
            return "edge-tts"
    except Exception as e:
        print(f"[TTS Warning] Edge-TTS loi ({e}) -> Chuyen sang gTTS Backup ({voice})...")

    try:
        await asyncio.to_thread(_run_gtts_sync, text, output_path, profile)
        if os.path.exists(output_path) and os.path.getsize(output_path) > 500:
            return f"gtts-{voice}"
    except Exception as e:
        print(f"[TTS Warning] gTTS loi ({e}) -> Chuyen sang Piper Offline Backup ({voice})...")

    try:
        await asyncio.to_thread(_run_piper_sync, text, output_path, profile)
        if os.path.exists(output_path) and os.path.getsize(output_path) > 500:
            return f"piper-{voice}"
    except Exception as e:
        raise RuntimeError(f"Toan bo 3 engine TTS deu that bai: {e}")

    raise RuntimeError("Khong the xuat file am thanh.")
