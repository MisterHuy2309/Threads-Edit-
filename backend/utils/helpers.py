import os
import time

def purge_old_cache(directory: str, max_age_seconds: int = 120):
    if not os.path.exists(directory):
        return
    now = time.time()
    for root, _, files in os.walk(directory):
        for f in files:
            p = os.path.join(root, f)
            try:
                if now - os.path.getmtime(p) > max_age_seconds:
                    os.remove(p)
            except Exception:
                pass

def map_analog_speed(speed: int) -> str:
    speed = max(1, min(100, speed))
    if speed == 50:
        return "+0%"
    elif speed < 50:
        return f"{int(((speed - 50) / 49) * 50)}%"
    else:
        return f"+{int(((speed - 50) / 50) * 100)}%"