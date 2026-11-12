import os
import re

ROOT = r"D:\Desktop\Threads_Tool"

# =========================================================================
# 1. CẬP NHẬT frontend/src/app/page.tsx: Gửi kèm image_url chính xác của watermark
# =========================================================================
page_tsx = os.path.join(ROOT, "frontend", "src", "app", "page.tsx")
with open(page_tsx, "r", encoding="utf-8") as f:
    p_code = f.read()

# Đảm bảo payload watermark gửi kèm image_url trỏ thẳng tới file ảnh đang hiển thị
p_code = re.sub(
    r'watermark:\s*\{[\s\S]*?\},',
    '''watermark: {
            enabled: watermarkEnabled,
            style: watermarkStyle,
            image_url: `http://127.0.0.1:8000/media/watermarks/${watermarkFileName || "watermark_1.png"}`,
            opacity: watermarkOpacity / 100,
            scale: watermarkScale,
            x: watermarkX,
            y: watermarkY,
          },''',
    p_code,
    count=1
)

with open(page_tsx, "w", encoding="utf-8") as f:
    f.write(p_code)
print(">>> [1/2] Da cap nhat payload watermark trong page.tsx!")

# =========================================================================
# 2. CẬP NHẬT backend/routers/video.py: Sửa hàm get_watermark_file_path & tọa độ/kích thước chuẩn
# =========================================================================
video_py = os.path.join(ROOT, "backend", "routers", "video.py")
with open(video_py, "r", encoding="utf-8-sig") as f:
    v_code = f.read().replace("\ufeff", "")

# Xóa bỏ hàm _attach_watermark_safe dư thừa ở cuối và dòng gọi sai tham số
v_code = re.sub(r'\n\s*_attach_watermark_safe\([^)]+\)', '', v_code)
v_code = re.sub(r'def _attach_watermark_safe[\s\S]*$', '', v_code)

# Nâng cấp hàm get_watermark_file_path để tìm chính xác watermark_1.png, watermark_2.png, watermark_3.png
new_get_wm = '''def get_watermark_file_path(style: str, custom_url: Optional[str] = None) -> str:
    if custom_url:
        p = resolve_local_path(custom_url)
        if os.path.exists(p):
            return p
    style_key = (style or "W1").lower()
    num_key = style_key.replace("w", "")
    candidates = [
        os.path.join(WATERMARK_DIR, f"watermark_{num_key}.png"),
        os.path.join(WATERMARK_DIR, f"watermark_{style_key}.png"),
        os.path.join(ROOT, "frontend", "public", "watermarks", f"watermark_{num_key}.png"),
        os.path.join(BASE_DIR, "media", "mascots", f"mascot_m{num_key}.png"),
    ]
    for c in candidates:
        if os.path.exists(c):
            return c
    if os.path.exists(WATERMARK_DIR):
        pngs = [os.path.join(WATERMARK_DIR, f) for f in os.listdir(WATERMARK_DIR) if f.lower().endswith(".png")]
        if pngs:
            return pngs[0]
    return ""'''

v_code = re.sub(r'def get_watermark_file_path[\s\S]*?return ""', new_get_wm, v_code, count=1)

# Sửa khối render watermark gốc trong run_render_task để dùng PIL resize mượt + tọa độ chính xác 1080x1920
old_wm_block_pattern = r'if req\.watermark and req\.watermark\.enabled:[\s\S]*?except Exception as e:\s*\n\s*print\(f"[^"]*watermark[^"]*"\)'

new_wm_block = '''if req.watermark and req.watermark.enabled:
            try:
                wm_file = get_watermark_file_path(req.watermark.style or "W1", req.watermark.image_url)
                print(f"[WM CHECK] enabled={req.watermark.enabled}, file={wm_file}")
                if wm_file and os.path.exists(wm_file):
                    import numpy as np
                    pil_wm = Image.open(wm_file).convert("RGBA")
                    # Khớp chiều cao h-9 (36px trên khung preview 320px -> 122px trên khung 1080px)
                    target_wm_h = max(16, int(122 * scale_factor * (req.watermark.scale or 1.0)))
                    ratio = target_wm_h / float(pil_wm.height)
                    target_wm_w = max(16, int(pil_wm.width * ratio))
                    pil_wm = pil_wm.resize((target_wm_w, target_wm_h), Image.Resampling.LANCZOS)

                    wm_op = req.watermark.opacity if req.watermark.opacity is not None else 0.9
                    if wm_op > 1.0:
                        wm_op = wm_op / 100.0
                    if wm_op < 1.0:
                        r_c, g_c, b_c, a_c = pil_wm.split()
                        a_c = a_c.point(lambda px: int(px * wm_op))
                        pil_wm = Image.merge("RGBA", (r_c, g_c, b_c, a_c))

                    # watermarkX, watermarkY đã là hệ tọa độ gốc 1080x1920
                    real_wm_x = int((req.watermark.x or 20.0) * scale_factor)
                    real_wm_y = int((req.watermark.y or 25.0) * scale_factor)

                    wm_clip = (
                        ImageClip(np.array(pil_wm))
                        .set_start(0)
                        .set_duration(total_dur)
                        .set_position((real_wm_x, real_wm_y))
                    )
                    opened_clips.append(wm_clip)
                    video_clips.append(wm_clip)
                    print(f"[WM OK] Da gan watermark tai ({real_wm_x}, {real_wm_y}), size=({target_wm_w}x{target_wm_h}), opacity={wm_op}")
            except Exception as e:
                print(f"[WM ERROR]: {e}")'''

if re.search(old_wm_block_pattern, v_code):
    v_code = re.sub(old_wm_block_pattern, new_wm_block, v_code, count=1)

# Bổ sung lại các route API export-task, progress, cancel nếu bị cắt mất ở cuối file
if "@router.post" not in v_code:
    endpoints_code = '''

@router.post("/export-task")
async def start_export_task(req: ExportRequest):
    job_id = f"job_{uuid.uuid4().hex[:10]}"
    write_job_state(job_id, {
        "job_id": job_id,
        "status": "processing",
        "progress": 0,
        "cancel_requested": False
    })
    t = threading.Thread(target=run_render_task, args=(job_id, req), daemon=True)
    t.start()
    return {"job_id": job_id}

@router.get("/progress/{job_id}")
async def get_export_progress(job_id: str):
    state = read_job_state(job_id)
    if not state:
        return {"status": "error", "progress": 0, "error": "Không tìm thấy tiến trình render."}
    return state

@router.post("/cancel/{job_id}")
async def cancel_export_task(job_id: str):
    state = read_job_state(job_id) or {}
    state["cancel_requested"] = True
    state["status"] = "cancelled"
    write_job_state(job_id, state)
    return {"status": "cancelled"}
'''
    v_code = v_code + endpoints_code

with open(video_py, "w", encoding="utf-8") as f:
    f.write(v_code)
print(">>> [2/2] Da sua chuan xac backend/routers/video.py!")
