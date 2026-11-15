import os
import re

ROOT = os.path.dirname(os.path.abspath(__file__))

# =========================================================================
# 1. CẬP NHẬT backend/routers/video.py
# =========================================================================
video_py_path = os.path.join(ROOT, "backend", "routers", "video.py")
with open(video_py_path, "r", encoding="utf-8") as f:
    v_code = f.read()

new_prepare_audio = """def prepare_normalized_audio(
    src_path: str,
    job_id: str,
    idx: int,
    speed: float = 1.0,
    pitch_pct: float = 50.0,
    trim_start: float = 0.0
) -> str:
    norm_wav = os.path.join(TEMP_DIR, f"{job_id}_aud_{idx}.wav")
    spd = speed if (speed and speed > 0.1) else 1.0
    p_val = 50.0 if pitch_pct is None else float(pitch_pct)
    t_start = max(0.0, float(trim_start or 0.0))

    semitones = ((p_val - 50.0) / 50.0) * 6.0
    pitch_scale = 2 ** (semitones / 12.0)

    # Chuẩn hóa đầu vào về đúng 44100Hz trước khi đổi asetrate (chống lỗi lệch tần số 24000Hz của file mp3 có sẵn)
    filters = ["aresample=44100"]

    if abs(semitones) >= 0.02:
        new_sr = int(round(44100 * pitch_scale))
        filters.append(f"asetrate={new_sr}")
        filters.append("aresample=44100")

    # Trên trình duyệt: preservesPitch = false và playbackRate = speed * pitchRatio
    # Do asetrate đã tự động nhân tốc độ với pitch_scale, nên phần tốc độ spd còn lại chỉ cần đưa vào atempo
    if abs(spd - 1.0) >= 0.01:
        rem = spd
        while rem < 0.5:
            filters.append("atempo=0.5")
            rem /= 0.5
        while rem > 2.0:
            filters.append("atempo=2.0")
            rem /= 2.0
        filters.append(f"atempo={round(rem, 4)}")

    af = ",".join(filters)
    cmd = [
        "ffmpeg", "-y",
        "-ss", f"{t_start:.3f}",
        "-i", src_path,
        "-af", af,
        "-ar", "44100", "-ac", "2",
        norm_wav
    ]
    subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
    return norm_wav"""

v_code = re.sub(
    r"def prepare_normalized_audio\(.*?\n    return norm_wav",
    new_prepare_audio,
    v_code,
    flags=re.DOTALL
)

old_audio_loop = """                p_pct = a.pitch if a.pitch is not None else 50.0
                norm_wav = prepare_normalized_audio(a_p, job_id, f"track_{aud_counter}", speed=spd, pitch_pct=p_pct)
                aud_counter += 1
                a_clip = AudioFileClip(norm_wav, fps=44100)
                opened_clips.append(a_clip)

                t_start = max(0.0, tr_start)
                t_end = min(a_clip.duration, t_start + a.duration)
                if t_end > t_start:
                    a_sub = a_clip.subclip(t_start, t_end).set_start(st_time)
                    vol_ratio = (a.volume if a.volume is not None else 100.0) / 100.0
                    a_sub = a_sub.volumex(vol_ratio)
                    audio_clips.append(a_sub)"""

new_audio_loop = """                p_pct = a.pitch if a.pitch is not None else 50.0
                norm_wav = prepare_normalized_audio(
                    src_path=a_p,
                    job_id=job_id,
                    idx=f"track_{aud_counter}",
                    speed=spd,
                    pitch_pct=p_pct,
                    trim_start=tr_start
                )
                aud_counter += 1
                a_clip = AudioFileClip(norm_wav, fps=44100)
                opened_clips.append(a_clip)

                t_end = min(a_clip.duration, max(0.05, float(a.duration)))
                if t_end > 0.05:
                    a_sub = a_clip.subclip(0, t_end).set_start(st_time)
                    vol_ratio = (a.volume if a.volume is not None else 100.0) / 100.0
                    a_sub = a_sub.volumex(vol_ratio)
                    audio_clips.append(a_sub)"""

if old_audio_loop in v_code:
    v_code = v_code.replace(old_audio_loop, new_audio_loop)
else:
    v_code = re.sub(
        r"p_pct = a\.pitch if a\.pitch is not None else 50\.0.*?audio_clips\.append\(a_sub\)",
        new_audio_loop.strip(),
        v_code,
        flags=re.DOTALL
    )

with open(video_py_path, "w", encoding="utf-8") as f:
    f.write(v_code)
print(">>> [1/2] Đã cập nhật thành công backend/routers/video.py!")

# =========================================================================
# 2. CẬP NHẬT frontend/src/components/Inspector.tsx
# =========================================================================
inspector_path = os.path.join(ROOT, "frontend", "src", "components", "Inspector.tsx")
with open(inspector_path, "r", encoding="utf-8") as f:
    i_code = f.read()

old_handlers = """    const handleVoiceSpeedChange = (newSpeed: number) => {
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
    };"""

new_handlers = """    const calcRealVoiceDuration = (origDur: number, spd: number, pitchPct: number) => {
      const semitones = ((pitchPct - 50) / 50) * 6;
      const pitchRatio = Math.pow(2, semitones / 12);
      const effectiveRate = Math.max(0.4, Math.min(3.0, spd * pitchRatio));
      return Number((origDur / effectiveRate).toFixed(2));
    };

    const handleVoiceSpeedChange = (newSpeed: number) => {
      if (!onUpdateVoiceItem) return;
      const original = activeVoiceItem.originalDuration || activeVoiceItem.maxDuration || activeVoiceItem.duration;
      const currentPitch = activeVoiceItem.pitch ?? 50;
      const newDuration = calcRealVoiceDuration(original, newSpeed, currentPitch);
      onUpdateVoiceItem(activeVoiceItem.id, {
        speed: newSpeed,
        duration: newDuration,
        originalDuration: original
      });
    };

    const handleVoicePitchChange = (newPitch: number) => {
      if (!onUpdateVoiceItem) return;
      const original = activeVoiceItem.originalDuration || activeVoiceItem.maxDuration || activeVoiceItem.duration;
      const currentSpeed = activeVoiceItem.speed || 1.0;
      const newDuration = calcRealVoiceDuration(original, currentSpeed, newPitch);
      onUpdateVoiceItem(activeVoiceItem.id, {
        pitch: newPitch,
        duration: newDuration,
        originalDuration: original
      });
    };"""

if old_handlers in i_code:
    i_code = i_code.replace(old_handlers, new_handlers)
else:
    i_code = re.sub(
        r"const handleVoiceSpeedChange = \(newSpeed: number\) => \{.*?\n    \};\n\n    const handleVoicePitchChange = \(newPitch: number\) => \{.*?\n    \};",
        new_handlers.strip(),
        i_code,
        flags=re.DOTALL
    )

with open(inspector_path, "w", encoding="utf-8") as f:
    f.write(i_code)
print(">>> [2/2] Đã cập nhật thành công frontend/src/components/Inspector.tsx!")
print("=== HOÀN TẤT SỬA LỖI VOICE SPEED & PITCH KHI XUẤT VIDEO! ===")
