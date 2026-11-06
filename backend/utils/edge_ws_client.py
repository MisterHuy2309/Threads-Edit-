import os
import asyncio
import edge_tts
from gtts import gTTS

async def synthesize_via_websocket(text: str, voice: str, output_path: str, rate: str = "+0%", pitch: str = "+0Hz"):
    """
    Tạo audio thông qua Edge-TTS với cơ chế bảo vệ kép:
    1. Chuẩn hóa tham số (tránh lỗi No audio was received do pitch không tương thích)
    2. Tự động fallback sang Google TTS nếu Microsoft tạm khóa kết nối
    """
    clean_text = text.strip()
    if not clean_text:
        raise ValueError("Văn bản rỗng")

    # Đảm bảo rate có định dạng hợp lệ
    r = rate.strip() if rate else "+0%"
    if not (r.startswith("+") or r.startswith("-")):
        r = f"+{r}"
    if not r.endswith("%"):
        r = f"{r}%"

    # Edge TTS tiếng Việt chỉ ổn định tuyệt đối khi pitch là +0Hz
    p = "+0Hz"

    # TẦNG 1: Edge-TTS Native Async
    try:
        comm = edge_tts.Communicate(text=clean_text, voice=voice, rate=r, pitch=p)
        await comm.save(output_path)
        if os.path.exists(output_path) and os.path.getsize(output_path) > 0:
            return True
    except Exception as edge_err:
        print(f"[Edge-TTS Error: {edge_err}] -> Kích hoạt Fallback an toàn...")

    # TẦNG 2: Thử lại Edge-TTS với cấu hình mặc định (rate="+0%", pitch="+0Hz")
    try:
        comm = edge_tts.Communicate(text=clean_text, voice=voice)
        await comm.save(output_path)
        if os.path.exists(output_path) and os.path.getsize(output_path) > 0:
            print("[Edge-TTS] Khôi phục thành công với cấu hình mặc định!")
            return True
    except Exception:
        pass

    # TẦNG 3: Fallback Google TTS (Không bao giờ lỗi 403, đảm bảo có audio)
    print("[Fallback] Chuyển hướng sang Google TTS Engine...")
    try:
        lang_code = "vi" if "vi-VN" in voice or "nam" in voice or "hoaimy" in voice else "en"
        tts = gTTS(text=clean_text, lang=lang_code, slow=False)
        # Chạy trong executor để không block event loop
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, tts.save, output_path)
        if os.path.exists(output_path) and os.path.getsize(output_path) > 0:
            return True
    except Exception as gtts_err:
        raise RuntimeError(f"Tất cả engine TTS đều thất bại: {gtts_err}")

    return False