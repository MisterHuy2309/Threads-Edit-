import os
import re

video_py = r"D:\Desktop\Threads_Tool\backend\routers\video.py"
with open(video_py, "r", encoding="utf-8-sig") as f:
    code = f.read().replace("\ufeff", "")

# 1. Xóa các đoạn vá watermark cũ nếu còn sót
code = re.sub(r'def build_watermark_clip[\s\S]*?return ImageClip\(np\.array\(pil_img\)\)\.set_duration\(total_dur\)\.set_position\(\(pos_x, pos_y\)\)\n*', '', code)
code = re.sub(r'\n[ \t]*try:\s*\n[ \t]*wm_clip = build_watermark_clip[\s\S]*?print\(\'Watermark skip:\', _wm_err\)', '', code)

# 2. Định nghĩa hàm tạo Watermark chuẩn lấy ảnh thật từ backend/media/watermarks hoặc frontend/public/watermarks
wm_helper = '''
def _render_watermark_layer(wm_obj, total_dur, target_w, target_h):
    if not wm_obj:
        return None
    enabled = wm_obj.get("enabled") if isinstance(wm_obj, dict) else getattr(wm_obj, "enabled", False)
    if not enabled:
        return None

    import os
    import numpy as np
    from PIL import Image
    from moviepy.editor import ImageClip

    root_dir = r"D:\\Desktop\\Threads_Tool"
    fname = (wm_obj.get("file_name") if isinstance(wm_obj, dict) else getattr(wm_obj, "file_name", None)) or "watermark_1.png"

    candidates = [
        os.path.join(root_dir, "backend", "media", "watermarks", fname),
        os.path.join(root_dir, "frontend", "public", "watermarks", fname),
    ]
    wm_path = next((p for p in candidates if os.path.exists(p)), None)
    if not wm_path:
        for d in [os.path.join(root_dir, "backend", "media", "watermarks"), os.path.join(root_dir, "frontend", "public", "watermarks")]:
            if os.path.exists(d):
                pngs = [os.path.join(d, x) for x in os.listdir(d) if x.lower().endswith(".png")]
                if pngs:
                    wm_path = pngs[0]
                    break
    if not wm_path:
        print("[WM] Khong tim thay file anh watermark!")
        return None

    scale_res = target_w / 1080.0
    wm_scale = float((wm_obj.get("scale") if isinstance(wm_obj, dict) else getattr(wm_obj, "scale", 1.0)) or 1.0)
    wm_opacity = float((wm_obj.get("opacity") if isinstance(wm_obj, dict) else getattr(wm_obj, "opacity", 0.9)) or 0.9)
    pos_x = int(float((wm_obj.get("x") if isinstance(wm_obj, dict) else getattr(wm_obj, "x", 20)) or 20) * scale_res)
    pos_y = int(float((wm_obj.get("y") if isinstance(wm_obj, dict) else getattr(wm_obj, "y", 25)) or 25) * scale_res)

    pil_img = Image.open(wm_path).convert("RGBA")
    # Khớp tỉ lệ h-9 (36px trên khung preview 320px -> 121.5px trên khung 1080px)
    base_h = int(122 * scale_res * wm_scale)
    ratio = base_h / float(pil_img.height)
    new_w = max(12, int(pil_img.width * ratio))
    new_h = max(12, base_h)
    pil_img = pil_img.resize((new_w, new_h), Image.Resampling.LANCZOS)

    if wm_opacity < 1.0:
        r, g, b, a = pil_img.split()
        a = a.point(lambda p: int(p * wm_opacity))
        pil_img = Image.merge("RGBA", (r, g, b, a))

    print(f"[WM] Da gan watermark: {wm_path} tai ({pos_x}, {pos_y}), size=({new_w}x{new_h}), opacity={wm_opacity}")
    return ImageClip(np.array(pil_img)).set_duration(total_dur).set_position((pos_x, pos_y))
'''

# Chèn helper ngay trước dòng định nghĩa router đầu tiên
if "@router." in code:
    code = code.replace("@router.", wm_helper + "\n@router.", 1)
else:
    code = wm_helper + "\n" + code

# 3. Tìm hàm xử lý render background task (nơi chứa CompositeVideoClip) và chèn watermark chính xác theo tên tham số hàm
func_pattern = r'(def\s+[a-zA-Z0-9_]+\s*\(([^)]*)\)\s*:[\s\S]*?)(\n([ \t]*)([a-zA-Z0-9_]+\s*=\s*CompositeVideoClip\s*\(\s*([a-zA-Z0-9_]+)))'
m = re.search(func_pattern, code)
if m:
    params_str = m.group(2)
    indent = m.group(4)
    list_var = m.group(6)
    # Lấy tên tham số đầu tiên của hàm render (ví dụ req, request, task_data, payload...)
    first_param = params_str.split(",")[0].split(":")[0].strip()

    # Tìm tên biến chiều rộng, chiều cao và thời lượng đang dùng ngay trong hàm
    func_body = m.group(1)
    w_var = "W" if re.search(r'\bW\b', func_body) else ("width" if re.search(r'\bwidth\b', func_body) else "1080")
    h_var = "H" if re.search(r'\bH\b', func_body) else ("height" if re.search(r'\bheight\b', func_body) else "1920")
    dur_var = "total_duration" if re.search(r'\btotal_duration\b', func_body) else ("final_duration" if re.search(r'\bfinal_duration\b', func_body) else "duration")

    wm_inject = (
        f"\n{indent}_wm_cfg = {first_param}.get('watermark') if isinstance({first_param}, dict) else getattr({first_param}, 'watermark', None)"
        f"\n{indent}_wm_clip = _render_watermark_layer(_wm_cfg, {dur_var}, {w_var}, {h_var})"
        f"\n{indent}if _wm_clip is not None:"
        f"\n{indent}    {list_var}.append(_wm_clip)"
    )
    code = code[:m.start(3)] + wm_inject + m.group(3) + code[m.end(3):]
    print(f">>> Da gan Watermark vao danh sach '{list_var}' (param='{first_param}', dur='{dur_var}', size=({w_var},{h_var}))")
else:
    print(">>> CANH BAO: Khong tim thay CompositeVideoClip trong video.py!")

# 4. NÂNG CẤP CHẤT LƯỢNG MÃ HÓA FFMPEG TRONG write_videofile (CHỐNG XƯỚC, CHỐNG VỠ HÌNH)
# Ép bitrate cao (8000k), preset medium, pixel format yuv420p và CRF 18
def upgrade_write_videofile(match):
    call_str = match.group(0)
    # Gỡ các tham số bitrate/preset/ffmpeg_params cũ nếu trùng
    call_str = re.sub(r',\s*bitrate\s*=\s*[^,)]+', '', call_str)
    call_str = re.sub(r',\s*preset\s*=\s*[^,)]+', '', call_str)
    call_str = re.sub(r',\s*ffmpeg_params\s*=\s*\[[^\]]*\]', '', call_str)
    # Chèn cấu hình chất lượng cao ngay trước dấu ngoặc đóng cuối cùng
    return call_str[:-1] + ', bitrate="8000k", preset="medium", ffmpeg_params=["-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart"])'

code = re.sub(r'\.write_videofile\s*\([^)]+\)', upgrade_write_videofile, code)
print(">>> Da nang cap thong so FFmpeg (CRF 18, 8000kbps, yuv420p) chong xuoc hinh!")

with open(video_py, "w", encoding="utf-8") as f:
    f.write(code)
