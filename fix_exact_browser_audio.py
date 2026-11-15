import os
import re

ROOT = os.path.dirname(os.path.abspath(__file__))
video_py_path = os.path.join(ROOT, "backend", "routers", "video.py")

with open(video_py_path, "r", encoding="utf-8") as f:
    v_code = f.read()

new_prepare_audio = """def prepare_normalized_audio(
    src_path: str,
    job_id: str,
    idx: int,
    speed: float = 1.0,
    pitch_pct: float = 50.0,
    trim_start: float = 0.0,
    target_duration: Optional[float] = None
) -> str:
    norm_wav = os.path.join(TEMP_DIR, f"{job_id}_aud_{idx}.wav")
    spd = float(speed) if (speed and speed > 0.1) else 1.0
    p_val = 50.0 if pitch_pct is None else float(pitch_pct)
    t_start = max(0.0, float(trim_start or 0.0))

    # Công thức giống hệt 100% trên Inspector.tsx và Timeline.tsx:
    semitones = ((p_val - 50.0) / 50.0) * 6.0
    pitch_ratio = 2.0 ** (semitones / 12.0)

    # BẮT BUỘC: Ép luồng âm thanh về đúng chuẩn 44100Hz bằng aformat trước khi dùng asetrate!
    # (Nếu chỉ dùng aresample=44100 mà không có aformat, file TTS 24000Hz khi gặp asetrate=44100*R sẽ bị tăng tốc gấp 44100/24000 = 1.8375 lần!)
    filters = ["aresample=44100", "aformat=sample_rates=44100:channel_layouts=stereo"]

    # 1. Cắt phần đầu bị gọt (trimStart) trên thời gian gốc của file
    if t_start > 0.005:
        filters.append(f"atrim=start={t_start:.4f}")
        filters.append("asetpts=PTS-STARTPTS")

    # 2. Kiểm tra xem người dùng có chỉnh Pitch khác 50% hay không:
    # - Trên trình duyệt (Timeline.tsx dòng 386 & Inspector.tsx dòng 61):
    #   Khi chỉnh Pitch (hoặc nghe thử trong Inspector), trình duyệt đặt:
    #   el.preservesPitch = false;
    #   el.playbackRate = speed * pitchRatio;
    #   Khi preservesPitch = false, trình duyệt tăng tốc độ đọc mẫu (sample rate) lên (speed * pitchRatio) lần
    #   (tức là cả Tốc độ lẫn Độ cao giọng đều nhân theo hệ số R = spd * pitch_ratio, KHÔNG dùng atempo!).
    # - Nếu Pitch == 50% (không đổi pitch): trên Timeline.tsx đặt preservesPitch = true, chỉ đổi tốc độ bằng atempo.
    if abs(p_val - 50.0) >= 0.1:
        effective_rate = max(0.4, min(3.0, spd * pitch_ratio))
        new_sr = int(round(44100.0 * effective_rate))
        filters.append(f"asetrate={new_sr}")
        filters.append("aresample=44100")
        filters.append("aformat=sample_rates=44100:channel_layouts=stereo")
        filters.append("asetpts=PTS-STARTPTS")
    else:
        if abs(spd - 1.0) >= 0.01:
            rem = spd
            while rem < 0.5:
                filters.append("atempo=0.5")
                rem /= 0.5
            while rem > 2.0:
                filters.append("atempo=2.0")
                rem /= 2.0
            filters.append(f"atempo={rem:.4f}")

    # 3. Cắt đúng thời lượng hiển thị của block trên Timeline
    if target_duration is not None and target_duration > 0.05:
        filters.append(f"atrim=start=0:duration={float(target_duration):.4f}")
        filters.append("asetpts=PTS-STARTPTS")

    af = ",".join(filters)
    cmd = [
        "ffmpeg", "-y",
        "-i", src_path,
        "-vn",
        "-af", af,
        "-ar", "44100", "-ac", "2",
        norm_wav
    ]
    print(f"[Audio Render Fix] File={os.path.basename(src_path)} | Speed={spd} | Pitch={p_val}% | Filter={af}")
    subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
    return norm_wav"""

v_code = re.sub(
    r"def prepare_normalized_audio\(.*?\n    return norm_wav",
    new_prepare_audio,
    v_code,
    flags=re.DOTALL
)

with open(video_py_path, "w", encoding="utf-8") as f:
    f.write(v_code)

print(">>> ĐÃ CẬP NHẬT THÀNH CÔNG backend/routers/video.py (Bổ sung aformat=sample_rates=44100 & đồng bộ preservesPitch=false)!")
