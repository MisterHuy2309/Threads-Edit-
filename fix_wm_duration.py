import re

video_py = r"D:\Desktop\Threads_Tool\backend\routers\video.py"
with open(video_py, "r", encoding="utf-8-sig") as f:
    code = f.read().replace("\ufeff", "")

# Thay thế dòng gọi _render_watermark_layer để lấy duration trực tiếp từ lớp nền đầu tiên của danh sách layers
code = re.sub(
    r'_wm_clip\s*=\s*_render_watermark_layer\(([^,]+),\s*[^,]+,\s*([^,]+),\s*([^)]+)\)',
    r'_safe_dur = getattr(layers[0], "duration", 15.0) if "layers" in locals() and layers else 15.0\n        _wm_clip = _render_watermark_layer(\1, _safe_dur, \2, \3)',
    code
)

# Phòng trường hợp biến danh sách không tên là 'layers', lấy trực tiếp tên biến được append ngay dòng dưới
def fix_dur_dynamic(match):
    full_block = match.group(0)
    list_name = match.group(1)
    fixed = re.sub(
        r'_wm_clip\s*=\s*_render_watermark_layer\(([^,]+),\s*[^,]+,\s*([^,]+),\s*([^)]+)\)',
        rf'_safe_dur = getattr({list_name}[0], "duration", 15.0) if len({list_name}) > 0 else 15.0\n        _wm_clip = _render_watermark_layer(\1, _safe_dur, \2, \3)',
        full_block
    )
    return fixed

code = re.sub(
    r'_wm_cfg\s*=[\s\S]*?if _wm_clip is not None:\s*\n\s*([a-zA-Z0-9_]+)\.append\(_wm_clip\)',
    fix_dur_dynamic,
    code
)

with open(video_py, "w", encoding="utf-8") as f:
    f.write(code)

print(">>> Da sua xong loi name 'duration' is not defined!")
