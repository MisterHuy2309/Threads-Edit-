import os
import re

ROOT = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.join(ROOT, "backend")

# =========================================================================
# 1. KHÔI PHỤC SẠCH THƯ VIỆN MOVIEPY TRONG VENV BỊ SỬA NHẦM
# =========================================================================
mpy_file = os.path.join(BACKEND_DIR, "venv", "Lib", "site-packages", "moviepy", "video", "compositing", "CompositeVideoClip.py")
if os.path.exists(mpy_file):
    with open(mpy_file, "r", encoding="utf-8") as f:
        mpy_code = f.read()
    
    # Cắt bỏ đoạn code chèn nhầm ở đầu file (trước docstring hoặc import gốc)
    if "def build_watermark_clip" in mpy_code:
        # Tìm vị trí bắt đầu gốc của file moviepy (thường là """ hoặc import)
        idx_doc = mpy_code.find('"""')
        idx_imp = mpy_code.find('import numpy as np\nfrom moviepy')
        cut_idx = idx_doc if idx_doc != -1 else idx_imp
        if cut_idx > 0:
            mpy_code = mpy_code[cut_idx:]

    # Xóa dòng chèn nhầm trước class CompositeVideoClip
    mpy_code = re.sub(
        r'wm_clip = build_watermark_clip[\s\S]*?\.append\(wm_clip\)\s*',
        '',
        mpy_code
    )
    with open(mpy_file, "w", encoding="utf-8") as f:
        f.write(mpy_code)
    print(">>> [1/2] Da khoi phuc sach se thu vien MoviePy trong venv!")

# =========================================================================
# 2. VÁ ĐÚNG FILE backend/routers/video.py (TUYỆT ĐỐI KHÔNG CHẠM VENV)
# =========================================================================
video_router = os.path.join(BACKEND_DIR, "routers", "video.py")
if os.path.exists(video_router):
    with open(video_router, "r", encoding="utf-8") as f:
        v_code = f.read()

    # Dọn dẹp các đoạn vá cũ nếu có
    v_code = re.sub(r'def build_watermark_clip[\s\S]*?return clip\n', '', v_code)
    v_code = re.sub(r'wm_clip = build_watermark_clip[\s\S]*?\.append\(wm_clip\)\s*', '', v_code)

    wm_helper = '''
def build_watermark_clip(wm_data, total_dur, target_w, target_h):
    if not wm_data:
        return None
    enabled = wm_data.get("enabled") if isinstance(wm_data, dict) else getattr(wm_data, "enabled", False)
    if not enabled:
        return None
    import os
    from PIL import Image
    import numpy as np
    from moviepy.editor import ImageClip

    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    wm_dir = os.path.join(base_dir, "media", "watermarks")
    fname = (wm_data.get("file_name") if isinstance(wm_data, dict) else getattr(wm_data, "file_name", None)) or "watermark_1.png"
    wm_path = os.path.join(wm_dir, fname)
    if not os.path.exists(wm_path) and os.path.exists(wm_dir):
        pngs = [f for f in os.listdir(wm_dir) if f.lower().endswith(".png")]
        if pngs:
            wm_path = os.path.join(wm_dir, pngs[0])
    if not os.path.exists(wm_path):
        return None

    scale_res = target_w / 1080.0
    wm_scale = float((wm_data.get("scale") if isinstance(wm_data, dict) else getattr(wm_data, "scale", 1.0)) or 1.0)
    wm_opacity = float((wm_data.get("opacity") if isinstance(wm_data, dict) else getattr(wm_data, "opacity", 0.9)) or 0.9)
    pos_x = int(float((wm_data.get("x") if isinstance(wm_data, dict) else getattr(wm_data, "x", 20)) or 20) * scale_res)
    pos_y = int(float((wm_data.get("y") if isinstance(wm_data, dict) else getattr(wm_data, "y", 25)) or 25) * scale_res)

    pil_img = Image.open(wm_path).convert("RGBA")
    base_h = int(122 * scale_res * wm_scale)
    ratio = base_h / float(pil_img.height)
    new_w = max(10, int(pil_img.width * ratio))
    new_h = max(10, base_h)
    pil_img = pil_img.resize((new_w, new_h), Image.Resampling.LANCZOS)

    if wm_opacity < 1.0:
        alpha = pil_img.split()[3]
        alpha = alpha.point(lambda p: int(p * wm_opacity))
        pil_img.putalpha(alpha)

    return ImageClip(np.array(pil_img)).set_duration(total_dur).set_position((pos_x, pos_y))
'''

    # Chèn hàm helper ngay sau dòng import cuối cùng
    v_code = wm_helper + "\n" + v_code

    # Tìm đúng chỗ gọi CompositeVideoClip(layers, ...) bên trong routers/video.py
    pattern = r'(\n([ \t]*))([a-zA-Z0-9_]+\s*=\s*CompositeVideoClip\s*\(\s*([a-zA-Z0-9_]+))'
    match = re.search(pattern, v_code)
    if match:
        indent = match.group(2)
        list_var = match.group(4)
        # Xác định biến request/data đang dùng trong hàm render
        req_var = "data" if "data.get(" in v_code else ("req" if "req." in v_code else "payload")
        dur_var = "total_duration" if "total_duration" in v_code else ("final_duration" if "final_duration" in v_code else "duration")
        w_var = "W" if "W," in v_code or "W =" in v_code else "target_w"
        h_var = "H" if "H)" in v_code or "H =" in v_code else "target_h"

        inject = (
            f"\n{indent}try:\n"
            f"{indent}    wm_clip = build_watermark_clip({req_var}.get('watermark') if isinstance({req_var}, dict) else getattr({req_var}, 'watermark', None), {dur_var}, {w_var}, {h_var})\n"
            f"{indent}    if wm_clip is not None:\n"
            f"{indent}        {list_var}.append(wm_clip)\n"
            f"{indent}except Exception as _wm_err:\n"
            f"{indent}    print('Watermark skip:', _wm_err)"
        )
        v_code = re.sub(pattern, inject + r'\1\3', v_code, count=1)

    with open(video_router, "w", encoding="utf-8") as f:
        f.write(v_code)
    print(">>> [2/2] Da cap nhat an toan backend/routers/video.py!")
