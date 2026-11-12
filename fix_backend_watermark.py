import os
import glob
import re

ROOT = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.join(ROOT, "backend")
WM_DIR = os.path.join(BACKEND_DIR, "media", "watermarks")
os.makedirs(WM_DIR, exist_ok=True)

# 1. Kiểm tra nếu thiếu file watermark_1/2/3.png thì tự động tạo bằng Pillow để không bao giờ lỗi thiếu file
try:
    from PIL import Image, ImageDraw, ImageFont
    for idx, (fname, label, bg_color) in enumerate([
        ("watermark_1.png", "soichibiettuot", (30, 34, 43, 235)),
        ("watermark_2.png", "@SOICHIBIETTUOT", (0, 0, 0, 0)),
        ("watermark_3.png", "SOI CHI BIET TUOT", (234, 88, 12, 245)),
    ], 1):
        fpath = os.path.join(WM_DIR, fname)
        if not os.path.exists(fpath):
            img = Image.new("RGBA", (420, 90), (0, 0, 0, 0))
            draw = ImageDraw.Draw(img)
            if bg_color[3] > 0:
                draw.rounded_rectangle([5, 10, 415, 80], radius=35, fill=bg_color, outline=(255, 255, 255, 180), width=3)
            draw.text((35, 30), label, fill=(255, 255, 255, 255))
            img.save(fpath, "PNG")
            print(f">>> Da tao file watermark mac dinh: {fpath}")
except Exception as e:
    print("Note Pillow:", e)

# 2. Tìm file router/service xử lý export-task và vá logic ghép Watermark
py_files = glob.glob(os.path.join(BACKEND_DIR, "**", "*.py"), recursive=True)
patched = False

wm_helper_code = '''
def build_watermark_clip(wm_data, total_dur, target_w, target_h):
    if not wm_data or not wm_data.get("enabled"):
        return None
    import os
    from PIL import Image
    import numpy as np
    from moviepy.editor import ImageClip

    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    wm_dir = os.path.join(base_dir, "media", "watermarks")
    fname = wm_data.get("file_name") or "watermark_1.png"
    wm_path = os.path.join(wm_dir, fname)
    if not os.path.exists(wm_path):
        # Fallback lấy file png bất kỳ trong thư mục watermarks
        if os.path.exists(wm_dir):
            pngs = [f for f in os.listdir(wm_dir) if f.lower().endswith(".png")]
            if pngs:
                wm_path = os.path.join(wm_dir, pngs[0])
    if not os.path.exists(wm_path):
        return None

    scale_res = target_w / 1080.0
    wm_scale = float(wm_data.get("scale", 1.0))
    wm_opacity = float(wm_data.get("opacity", 0.9))
    pos_x = int(float(wm_data.get("x", 20)) * scale_res)
    pos_y = int(float(wm_data.get("y", 25)) * scale_res)

    pil_img = Image.open(wm_path).convert("RGBA")
    # Quy đổi kích thước khớp với PreviewPlayer (h-9 = 36px trên khung 320px -> ~122px trên khung 1080px)
    base_h = int(122 * scale_res * wm_scale)
    ratio = base_h / float(pil_img.height)
    new_w = max(10, int(pil_img.width * ratio))
    new_h = max(10, base_h)
    pil_img = pil_img.resize((new_w, new_h), Image.Resampling.LANCZOS)

    if wm_opacity < 1.0:
        alpha = pil_img.split()[3]
        alpha = alpha.point(lambda p: int(p * wm_opacity))
        pil_img.putalpha(alpha)

    clip = ImageClip(np.array(pil_img)).set_duration(total_dur).set_position((pos_x, pos_y))
    return clip
'''

for fpath in py_files:
    with open(fpath, "r", encoding="utf-8") as f:
        code = f.read()

    if "export-task" in code or "CompositeVideoClip" in code:
        if "build_watermark_clip" not in code:
            code = wm_helper_code + "\n" + code

        # Chèn wm_clip vào danh sách layers trước khi tạo CompositeVideoClip
        # Tìm đoạn tạo CompositeVideoClip(layers, ...) hoặc CompositeVideoClip(video_layers, ...)
        pattern = r'(CompositeVideoClip\s*\(\s*)([a-zA-Z0-9_]+)'
        match = re.search(pattern, code)
        if match and "wm_clip = build_watermark_clip" not in code:
            list_var = match.group(2)
            inject = (
                f"wm_clip = build_watermark_clip(getattr(req, 'watermark', None) if hasattr(req, 'watermark') else (req.get('watermark') if isinstance(req, dict) else None), total_duration, W, H)\n"
                f"        if wm_clip is not None:\n"
                f"            {list_var}.append(wm_clip)\n"
                f"        "
            )
            code = re.sub(pattern, inject + r'\1\2', code, count=1)
            with open(fpath, "w", encoding="utf-8") as f:
                f.write(code)
            print(f">>> Da cap nhat thanh cong file: {fpath}")
            patched = True

if not patched:
    print(">>> Canh bao: Chua tim thay dong CompositeVideoClip tu dong, hay kiem tra ten bien layers trong backend/routers/video.py.")
