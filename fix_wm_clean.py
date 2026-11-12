import re

video_py = r"D:\Desktop\Threads_Tool\backend\routers\video.py"
with open(video_py, "r", encoding="utf-8-sig") as f:
    code = f.read().replace("\ufeff", "")

# 1. Dọn sạch toàn bộ hàm và đoạn chèn watermark cũ bị lỗi
code = re.sub(r'def _render_watermark_layer[\s\S]*?return ImageClip\(np\.array\(pil_img\)\)\.set_duration\(total_dur\)\.set_position\(\(pos_x, pos_y\)\)\n*', '', code)
code = re.sub(r'\n[ \t]*_wm_cfg\s*=[\s\S]*?if _wm_clip is not None:\s*\n\s*[a-zA-Z0-9_]+\.append\(_wm_clip\)', '', code)

# 2. Viết hàm gắn Watermark tự động lấy kích thước & thời lượng từ chính lớp video nền
wm_helper = '''
def _attach_watermark_safe(req_obj, layers_list):
    if not layers_list:
        return
    wm_obj = req_obj.get("watermark") if isinstance(req_obj, dict) else getattr(req_obj, "watermark", None)
    if not wm_obj:
        return
    enabled = wm_obj.get("enabled") if isinstance(wm_obj, dict) else getattr(wm_obj, "enabled", False)
    if not enabled:
        return

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
        return

    # Lấy trực tiếp kích thước (W, H) và thời lượng từ clip nền đầu tiên -> Không bao giờ lỗi undefined variable
    base_clip = layers_list[0]
    target_w, target_h = getattr(base_clip, "size", (1080, 1920))
    total_dur = getattr(base_clip, "duration", 15.0) or 15.0

    scale_res = target_w / 1080.0
    wm_scale = float((wm_obj.get("scale") if isinstance(wm_obj, dict) else getattr(wm_obj, "scale", 1.0)) or 1.0)
    wm_opacity = float((wm_obj.get("opacity") if isinstance(wm_obj, dict) else getattr(wm_obj, "opacity", 0.9)) or 0.9)
    pos_x = int(float((wm_obj.get("x") if isinstance(wm_obj, dict) else getattr(wm_obj, "x", 20)) or 20) * scale_res)
    pos_y = int(float((wm_obj.get("y") if isinstance(wm_obj, dict) else getattr(wm_obj, "y", 25)) or 25) * scale_res)

    pil_img = Image.open(wm_path).convert("RGBA")
    base_h = int(122 * scale_res * wm_scale)
    ratio = base_h / float(pil_img.height)
    new_w = max(12, int(pil_img.width * ratio))
    new_h = max(12, base_h)
    pil_img = pil_img.resize((new_w, new_h), Image.Resampling.LANCZOS)

    if wm_opacity < 1.0:
        r, g, b, a = pil_img.split()
        a = a.point(lambda p: int(p * wm_opacity))
        pil_img = Image.merge("RGBA", (r, g, b, a))

    wm_clip = ImageClip(np.array(pil_img)).set_duration(total_dur).set_position((pos_x, pos_y))
    layers_list.append(wm_clip)
    print(f"[WM] Da gan watermark thanh cong: {os.path.basename(wm_path)} | pos=({pos_x},{pos_y}) | size={new_w}x{new_h}")
'''

if "@router." in code:
    code = code.replace("@router.", wm_helper + "\n@router.", 1)
else:
    code = wm_helper + "\n" + code

# 3. Chèn duy nhất 1 dòng gọi _attach_watermark_safe(param, list_var) ngay trước CompositeVideoClip
func_pattern = r'(def\s+[a-zA-Z0-9_]+\s*\(([^)]*)\)\s*:[\s\S]*?)(\n([ \t]*)([a-zA-Z0-9_]+\s*=\s*CompositeVideoClip\s*\(\s*([a-zA-Z0-9_]+)))'
m = re.search(func_pattern, code)
if m:
    first_param = m.group(2).split(",")[0].split(":")[0].strip()
    indent = m.group(4)
    list_var = m.group(6)
    inject = f"\n{indent}_attach_watermark_safe({first_param}, {list_var})"
    code = code[:m.start(3)] + inject + m.group(3) + code[m.end(3):]
    print(f">>> Da tich hop chuan xac _attach_watermark_safe({first_param}, {list_var})!")

with open(video_py, "w", encoding="utf-8") as f:
    f.write(code)
