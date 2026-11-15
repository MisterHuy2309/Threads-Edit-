import os
import re

ROOT = os.path.dirname(os.path.abspath(__file__))

# =========================================================================
# 1. CẬP NHẬT TRIỆT ĐỂ backend/routers/video.py
# =========================================================================
video_py_path = os.path.join(ROOT, "backend", "routers", "video.py")
with open(video_py_path, "r", encoding="utf-8") as f:
    v_code = f.read()

# Sửa resolve_local_path: Ưu tiên khớp chính xác đường dẫn tương đối từ URL, không bốc nhầm audio_cache
new_resolve = """def resolve_local_path(url_or_path: Optional[str]) -> str:
    if not url_or_path:
        return ""
    decoded = urllib.parse.unquote(url_or_path)
    clean = decoded.split("?")[0].replace("\\\\", "/")
    if os.path.isabs(clean) and os.path.exists(clean):
        return os.path.normpath(clean)

    for domain in ["http://127.0.0.1:8000", "http://localhost:8000"]:
        if clean.startswith(domain):
            clean = clean[len(domain):]
            break

    clean_rel = clean.lstrip("/")
    candidate = os.path.normpath(os.path.join(BASE_DIR, clean_rel))
    if os.path.exists(candidate):
        return candidate

    pub_candidate = os.path.normpath(os.path.join(ROOT_DIR, "frontend", "public", clean_rel))
    if os.path.exists(pub_candidate):
        return pub_candidate

    filename_only = os.path.basename(clean_rel)
    media_root = os.path.join(BASE_DIR, "media")
    for root, dirs, files in os.walk(media_root):
        if "audio_cache" in dirs:
            dirs.remove("audio_cache")
        if filename_only in files:
            return os.path.normpath(os.path.join(root, filename_only))

    return candidate"""

v_code = re.sub(
    r"def resolve_local_path\(url_or_path: Optional\[str\]\) -> str:.*?\n    return candidate",
    new_resolve,
    v_code,
    flags=re.DOTALL
)

# Sửa prepare_normalized_audio: Mô phỏng 100% HTML5 Audio (preservesPitch=false, playbackRate = speed * pitchRatio)
# Cắt chính xác bằng atrim trên luồng PCM trước khi đổi tốc độ/pitch
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

    # Trên trình duyệt (Inspector.tsx & Timeline.tsx):
    # semitones = ((pitchPct - 50) / 50) * 6
    # pitchRatio = 2 ** (semitones / 12)
    semitones = ((p_val - 50.0) / 50.0) * 6.0
    pitch_scale = 2.0 ** (semitones / 12.0)

    filters = ["aresample=44100"]

    # 1. Cắt chính xác điểm đầu (trim_start) bằng sample-accurate atrim trên file gốc
    if t_start > 0.005:
        filters.append(f"atrim=start={t_start:.4f}")
        filters.append("asetpts=PTS-STARTPTS")

    # 2. Đổi cao độ bằng asetrate (giống hệt preservesPitch=false trên trình duyệt: đổi cả cao độ lẫn tốc độ theo pitch_scale)
    if abs(semitones) >= 0.02:
        new_sr = int(round(44100.0 * pitch_scale))
        filters.append(f"asetrate={new_sr}")
        filters.append("aresample=44100")
        filters.append("asetpts=PTS-STARTPTS")

    # 3. Đổi tốc độ đọc (speed) độc lập bằng atempo (giữ nguyên cao độ đã chỉnh ở bước 2)
    if abs(spd - 1.0) >= 0.01:
        rem = spd
        while rem < 0.5:
            filters.append("atempo=0.5")
            rem /= 0.5
        while rem > 2.0:
            filters.append("atempo=2.0")
            rem /= 2.0
        filters.append(f"atempo={rem:.4f}")

    # 4. Cắt đúng thời lượng hiển thị của block trên Timeline
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
    print(f"[Audio Render] File={os.path.basename(src_path)} | Speed={spd} | Pitch={p_val}% | TrimStart={t_start} | Dur={target_duration}")
    subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
    return norm_wav"""

v_code = re.sub(
    r"def prepare_normalized_audio\(.*?\n    return norm_wav",
    new_prepare_audio,
    v_code,
    flags=re.DOTALL
)

# Cập nhật đoạn gọi prepare_normalized_audio trong run_render_task
new_audio_loop = """                p_pct = a.pitch if a.pitch is not None else 50.0
                norm_wav = prepare_normalized_audio(
                    src_path=a_p,
                    job_id=job_id,
                    idx=f"track_{aud_counter}",
                    speed=spd,
                    pitch_pct=p_pct,
                    trim_start=tr_start,
                    target_duration=a.duration
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

v_code = re.sub(
    r"p_pct = a\.pitch if a\.pitch is not None else 50\.0.*?audio_clips\.append\(a_sub\)",
    new_audio_loop.strip(),
    v_code,
    flags=re.DOTALL
)

with open(video_py_path, "w", encoding="utf-8") as f:
    f.write(v_code)
print(">>> [1/2] Đã cập nhật chuẩn xác backend/routers/video.py!")

# =========================================================================
# 2. CẬP NHẬT frontend/src/components/Timeline.tsx
# Đồng bộ cách phát Preview tổng và kéo giãn 2 đầu block Voice với Speed + Pitch
# =========================================================================
tl_path = os.path.join(ROOT, "frontend", "src", "components", "Timeline.tsx")
with open(tl_path, "r", encoding="utf-8") as f:
    tl_code = f.read()

# Đảm bảo tắt preservesPitch trên mọi trình duyệt (Chrome/Edge/Firefox) khi phát trên Timeline
tl_code = tl_code.replace(
    "el.preservesPitch = !track.hasPitch; (el as any).webkitPreservesPitch = !track.hasPitch;",
    "el.preservesPitch = !track.hasPitch; (el as any).mozPreservesPitch = !track.hasPitch; (el as any).webkitPreservesPitch = !track.hasPitch;"
)

# Khi kéo cắt 2 đầu block Voice trên Timeline, tính đúng tốc độ thực tế (speed * pitchRatio)
old_voice_drag = """        if (dragAction.target === "voice" && setVoiceList) {
          const snapVoice = applyMagneticSnap(Math.max(0, Number((dragAction.initialStart + deltaSeconds).toFixed(2))));
          setVoiceList((prev) =>
            prev.map((v) => {
              if (v.id !== dragAction.id) return v;
              const speed = v.speed || 1.0;"""

new_voice_drag = """        if (dragAction.target === "voice" && setVoiceList) {
          const snapVoice = applyMagneticSnap(Math.max(0, Number((dragAction.initialStart + deltaSeconds).toFixed(2))));
          setVoiceList((prev) =>
            prev.map((v) => {
              if (v.id !== dragAction.id) return v;
              const pPct = v.pitch ?? 50;
              const pRatio = Math.pow(2, (((pPct - 50) / 50) * 6) / 12);
              const speed = (v.speed || 1.0) * pRatio;"""

if old_voice_drag in tl_code:
    tl_code = tl_code.replace(old_voice_drag, new_voice_drag)

with open(tl_path, "w", encoding="utf-8") as f:
    f.write(tl_code)
print(">>> [2/2] Đã đồng bộ trình phát Preview trong frontend/src/components/Timeline.tsx!")
