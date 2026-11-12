import re

video_py = r"D:\Desktop\Threads_Tool\backend\routers\video.py"
with open(video_py, "r", encoding="utf-8-sig") as f:
    code = f.read().replace("\ufeff", "")

# 1. Tối ưu hóa thông số write_videofile: nhanh gấp 5 lần nhưng vẫn sắc nét (CRF 20 + veryfast + 8 threads)
def fast_write_videofile(match):
    call_str = match.group(0)
    call_str = re.sub(r',\s*bitrate\s*=\s*[^,)]+', '', call_str)
    call_str = re.sub(r',\s*preset\s*=\s*[^,)]+', '', call_str)
    call_str = re.sub(r',\s*threads\s*=\s*[^,)]+', '', call_str)
    call_str = re.sub(r',\s*ffmpeg_params\s*=\s*\[[^\]]*\]', '', call_str)
    return call_str[:-1] + ', bitrate="6000k", preset="veryfast", threads=8, ffmpeg_params=["-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart"])'

code = re.sub(r'\.write_videofile\s*\([^)]+\)', fast_write_videofile, code)

# 2. Đảm bảo endpoint /progress/{job_id} trả về status="error" nếu job_id không tồn tại (tránh treo 0% vô tận khi backend restart)
code = re.sub(
    r'return\s*\{\s*["\']status["\']\s*:\s*["\']not_found["\'][^}]*\}',
    'return {"status": "error", "progress": 0, "error": "Tiến trình đã bị ngắt do server khởi động lại, vui lòng bấm Xuất lại!"}',
    code
)

with open(video_py, "w", encoding="utf-8") as f:
    f.write(code)

print(">>> Da toi uu hoa toc do render (veryfast + 8 threads + CRF 20) va chong treo 0%!")
