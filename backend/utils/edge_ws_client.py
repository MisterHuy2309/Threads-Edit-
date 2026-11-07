import os
import re
import ssl
import asyncio
import random
import edge_tts
from typing import Optional
from utils.proxy_checker import get_alive_proxies

# Bỏ qua xác thực SSL cho các proxy trung gian
try:
    ssl._create_default_https_context = ssl._create_unverified_context
except Exception:
    pass

def clean_text_for_ssml(text: str) -> str:
    if not text:
        return ""
    clean = re.sub(r'[\r\n]+', '. ', text)
    clean = re.sub(r'[<>&"\']', '', clean)
    clean = re.sub(r'\s+', ' ', clean).strip()
    return clean

async def synthesize_via_websocket(
    text: str,
    voice: str = "vi-VN-NamMinhNeural",
    output_path: str = "",
    rate: str = "+0%",
    pitch: str = "+0Hz",
    volume: str = "+0%",
    max_retries: int = 4
):
    clean_text = clean_text_for_ssml(text)
    if not clean_text:
        raise ValueError("Văn bản rỗng sau khi làm sạch.")

    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    alive_proxies = await get_alive_proxies()
    
    # Ưu tiên Direct IP đầu tiên, sau đó mới đến các proxy sống
    candidate_proxies = [None]
    external = [p for p in alive_proxies if p is not None]
    candidate_proxies.extend(external)

    last_error = None

    for attempt in range(max_retries):
        current_proxy = candidate_proxies[attempt % len(candidate_proxies)]
        display_label = current_proxy if current_proxy else "Direct IP"
        print(f"[TTS Attempt {attempt + 1}/{max_retries}] Đang tạo voice qua: {display_label}")

        try:
            communicate = edge_tts.Communicate(
                text=clean_text,
                voice=voice,
                rate=rate,
                volume=volume,
                pitch=pitch,
                proxy=current_proxy
            )

            # Đặt timeout tối đa 8 giây cho mỗi lượt thử
            await asyncio.wait_for(communicate.save(output_path), timeout=8.0)

            if os.path.exists(output_path) and os.path.getsize(output_path) > 1024:
                print(f"[TTS Success] Xuất voice thành công qua {display_label}!")
                await asyncio.sleep(random.uniform(0.4, 0.8))
                return output_path
            else:
                raise IOError("Không nhận được dữ liệu âm thanh hợp lệ.")

        except Exception as err:
            last_error = err
            print(f"[TTS Warning] {display_label} gặp lỗi: {err}")
            if os.path.exists(output_path):
                try:
                    os.remove(output_path)
                except Exception:
                    pass
            
            # Thời gian nghỉ giãn cách giữa các lần thử
            await asyncio.sleep(1.2)

    raise RuntimeError(f"Edge-TTS không thể xuất audio sau các lượt thử: {last_error}")