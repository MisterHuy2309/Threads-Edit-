import os
import json
import base64
import time
import shutil
import threading
import urllib.parse
import urllib.request
from typing import Optional
from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel

router = APIRouter(prefix="/api/facebook", tags=["Facebook Auto Publish"])

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MEDIA_DIR = os.path.join(BASE_DIR, "media")
OUTPUT_DIR = os.path.join(BASE_DIR, "output")
COVER_DIR = os.path.join(MEDIA_DIR, "covers")
FB_PROFILE_DIR = os.path.join(BASE_DIR, "fb_chrome_profile")
FB_CONFIG_PATH = os.path.join(BASE_DIR, "fb_config.json")

os.makedirs(COVER_DIR, exist_ok=True)
os.makedirs(FB_PROFILE_DIR, exist_ok=True)

class SaveCoverBase64Request(BaseModel):
    image_base64: str
    template: Optional[str] = "M1"
    title: Optional[str] = ""

class FbConfigModel(BaseModel):
    mode: str = "browser"  # "graph_api" hoac "browser"
    page_id: Optional[str] = ""
    access_token: Optional[str] = ""
    auto_click_publish: bool = True

class FbPublishRequest(BaseModel):
    approved: bool = False
    video_url: str
    cover_url: Optional[str] = ""
    title: str
    hashtags: str
    full_description: Optional[str] = ""
    mode: Optional[str] = "browser"
    page_id: Optional[str] = ""
    access_token: Optional[str] = ""
    auto_click_publish: Optional[bool] = True

def load_fb_config() -> dict:
    if os.path.exists(FB_CONFIG_PATH):
        try:
            with open(FB_CONFIG_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {
        "mode": "browser",
        "page_id": "",
        "access_token": "",
        "auto_click_publish": True
    }

def save_fb_config(cfg: dict):
    with open(FB_CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(cfg, f, ensure_ascii=False, indent=2)

def resolve_local_file(url_or_path: Optional[str]) -> str:
    if not url_or_path:
        return ""
    decoded = urllib.parse.unquote(url_or_path).split("?")[0].replace("\\", "/")
    if os.path.isabs(decoded) and os.path.exists(decoded):
        return os.path.normpath(decoded)
    for prefix in ["http://127.0.0.1:8000", "http://localhost:8000"]:
        if decoded.startswith(prefix):
            decoded = decoded[len(prefix):]
            break
    rel = decoded.lstrip("/")
    cand = os.path.normpath(os.path.join(BASE_DIR, rel))
    if os.path.exists(cand):
        return cand
    return ""

@router.get("/config")
def get_fb_config():
    cfg = load_fb_config()
    latest_cover = os.path.join(COVER_DIR, "latest_cover.png")
    has_cover = os.path.exists(latest_cover)
    return {
        **cfg,
        "latest_cover_url": f"http://127.0.0.1:8000/media/covers/latest_cover.png?t={int(time.time())}" if has_cover else ""
    }

@router.post("/config")
def update_fb_config(req: FbConfigModel):
    cfg = req.model_dump()
    save_fb_config(cfg)
    return {"status": "success", "config": cfg}

@router.post("/save-cover")
def save_cover_image(req: SaveCoverBase64Request):
    try:
        raw_b64 = req.image_base64
        if "," in raw_b64:
            raw_b64 = raw_b64.split(",", 1)[1]
        img_bytes = base64.b64decode(raw_b64)

        ts = int(time.time())
        file_name = f"cover_{req.template}_{ts}.png"
        file_path = os.path.join(COVER_DIR, file_name)
        latest_path = os.path.join(COVER_DIR, "latest_cover.png")

        with open(file_path, "wb") as f:
            f.write(img_bytes)
        shutil.copyfile(file_path, latest_path)

        return {
            "status": "success",
            "filename": file_name,
            "cover_url": f"http://127.0.0.1:8000/media/covers/{file_name}",
            "latest_cover_url": f"http://127.0.0.1:8000/media/covers/latest_cover.png?t={ts}",
            "saved_path": file_path.replace("\\", "/")
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi lưu ảnh bìa: {str(e)}")

@router.post("/upload-custom-cover")
async def upload_custom_cover(file: UploadFile = File(...)):
    try:
        ts = int(time.time())
        ext = os.path.splitext(file.filename or "cover.png")[1] or ".png"
        file_name = f"custom_cover_{ts}{ext}"
        file_path = os.path.join(COVER_DIR, file_name)
        latest_path = os.path.join(COVER_DIR, "latest_cover.png")

        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        shutil.copyfile(file_path, latest_path)

        return {
            "status": "success",
            "cover_url": f"http://127.0.0.1:8000/media/covers/{file_name}",
            "latest_cover_url": f"http://127.0.0.1:8000/media/covers/latest_cover.png?t={ts}"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Không thể tải ảnh bìa: {str(e)}")

def upload_via_graph_api(video_path: str, cover_path: str, description: str, page_id: str, access_token: str) -> dict:
    """Đăng video kèm ảnh bìa (thumb) và mô tả qua Facebook Graph API chính thức"""
    import mimetypes
    import uuid

    url = f"https://graph-video.facebook.com/v21.0/{page_id}/videos"
    boundary = f"----WebKitFormBoundary{uuid.uuid4().hex}"

    body = bytearray()

    def add_field(name: str, value: str):
        body.extend(f"--{boundary}\r\n".encode("utf-8"))
        body.extend(f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode("utf-8"))
        body.extend(f"{value}\r\n".encode("utf-8"))

    def add_file(field_name: str, filepath: str):
        filename = os.path.basename(filepath)
        mime_type = mimetypes.guess_type(filepath)[0] or "application/octet-stream"
        body.extend(f"--{boundary}\r\n".encode("utf-8"))
        body.extend(
            f'Content-Disposition: form-data; name="{field_name}"; filename="{filename}"\r\n'.encode("utf-8")
        )
        body.extend(f"Content-Type: {mime_type}\r\n\r\n".encode("utf-8"))
        with open(filepath, "rb") as f:
            body.extend(f.read())
        body.extend(b"\r\n")

    add_field("access_token", access_token)
    add_field("description", description)
    add_field("title", description.splitlines()[0][:100] if description else "Threads Reels")
    add_file("source", video_path)

    if cover_path and os.path.exists(cover_path):
        add_file("thumb", cover_path)

    body.extend(f"--{boundary}--\r\n".encode("utf-8"))

    req = urllib.request.Request(url, data=bytes(body), method="POST")
    req.add_header("Content-Type", f"multipart/form-data; boundary={boundary}")

    with urllib.request.urlopen(req, timeout=180) as resp:
        resp_data = json.loads(resp.read().decode("utf-8"))
        return resp_data

def _run_browser_reels_automation(video_path: str, cover_path: str, description: str, auto_click_publish: bool):
    """Tự động mở Facebook Reels (Chế độ chuyên nghiệp), nạp Video, điền Mô tả (Tiêu đề + Hashtag) và thay Ảnh bìa"""
    try:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as p:
            context = p.chromium.launch_persistent_context(
                user_data_dir=FB_PROFILE_DIR,
                headless=False,
                args=["--start-maximized", "--disable-blink-features=AutomationControlled"]
            )
            page = context.pages[0] if context.pages else context.new_page()
            page.goto("https://www.facebook.com/reels/create", timeout=60000)
            time.sleep(3)

            # 1. Tải file video lên
            file_inputs = page.locator('input[type="file"]')
            if file_inputs.count() > 0:
                file_inputs.first.set_input_files(video_path)
                time.sleep(4)

            # 2. Bấm "Tiếp" (Next) ở bước cắt video nếu có
            for next_text in ["Tiếp", "Next"]:
                btn = page.locator(f'div[role="button"]:has-text("{next_text}"), span:has-text("{next_text}")')
                if btn.count() > 0:
                    try:
                        btn.last.click(timeout=3000)
                        time.sleep(2.5)
                        break
                    except Exception:
                        pass

            # 3. Điền Mô tả thước phim (Tiêu đề + Hashtag theo đúng thứ tự)
            desc_box = page.locator('div[role="textbox"][contenteditable="true"]')
            if desc_box.count() > 0:
                desc_box.first.click()
                desc_box.first.fill(description)
                time.sleep(1.5)

            # 4. Thay ảnh bìa từ file đã tạo trước đó
            if cover_path and os.path.exists(cover_path):
                for cover_label in ["Ảnh bìa", "Tải ảnh lên", "Upload image", "Cover"]:
                    cov_btn = page.locator(f'span:has-text("{cover_label}"), div[role="button"]:has-text("{cover_label}")')
                    if cov_btn.count() > 0:
                        try:
                            cov_btn.first.click(timeout=2500)
                            time.sleep(1)
                            break
                        except Exception:
                            pass
                all_inputs = page.locator('input[type="file"]')
                if all_inputs.count() > 1:
                    try:
                        all_inputs.last.set_input_files(cover_path)
                        time.sleep(2.5)
                    except Exception:
                        pass

            # 5. Nếu bật tự động bấm Đăng sau khi đã Duyệt
            if auto_click_publish:
                for pub_label in ["Đăng", "Publish", "Chia sẻ", "Share"]:
                    pub_btn = page.locator(f'div[role="button"]:has-text("{pub_label}"), span:has-text("{pub_label}")')
                    if pub_btn.count() > 0:
                        try:
                            pub_btn.last.click(timeout=3000)
                            break
                        except Exception:
                            pass

            time.sleep(120)
    except Exception as e:
        print(f"[FB Browser Automation Info]: {e}")
        import webbrowser
        webbrowser.open("https://www.facebook.com/reels/create")

@router.post("/open-login")
def open_facebook_login():
    def _open():
        try:
            from playwright.sync_api import sync_playwright
            with sync_playwright() as p:
                ctx = p.chromium.launch_persistent_context(
                    user_data_dir=FB_PROFILE_DIR,
                    headless=False,
                    args=["--start-maximized"]
                )
                pg = ctx.pages[0] if ctx.pages else ctx.new_page()
                pg.goto("https://www.facebook.com/reels/create")
                time.sleep(300)
        except Exception:
            import webbrowser
            webbrowser.open("https://www.facebook.com/reels/create")

    threading.Thread(target=_open, daemon=True).start()
    return {
        "status": "success",
        "message": "Đã mở trình duyệt Facebook! Hãy đăng nhập tài khoản bật Chế độ chuyên nghiệp của bạn."
    }

@router.post("/publish")
def approve_and_publish_facebook(req: FbPublishRequest):
    # CHỐT CHẶN AN TOÀN: Không bao giờ cho phép đăng nếu người dùng chưa bấm Duyệt (approved != True)
    if not req.approved:
        raise HTTPException(
            status_code=403,
            detail="Chưa được phép đăng! Chỉ khi bạn bấm nút 'Duyệt & Đăng Lên Facebook' hệ thống mới được phép tải lên."
        )

    video_path = resolve_local_file(req.video_url)
    if not video_path or not os.path.exists(video_path):
        raise HTTPException(status_code=404, detail=f"Không tìm thấy file video đã xuất: {req.video_url}")

    cover_path = resolve_local_file(req.cover_url)
    if not cover_path or not os.path.exists(cover_path):
        default_cov = os.path.join(COVER_DIR, "latest_cover.png")
        if os.path.exists(default_cov):
            cover_path = default_cov

    clean_title = (req.title or "").strip()
    clean_hashtags = (req.hashtags or "#viral #ThreadsVietNam").strip()
    ordered_description = f"{clean_title}\n\n{clean_hashtags}".strip() if clean_title else clean_hashtags

    # Lưu lại cấu hình nếu người dùng có nhập Page ID / Token
    cfg = load_fb_config()
    if req.page_id:
        cfg["page_id"] = req.page_id.strip()
    if req.access_token:
        cfg["access_token"] = req.access_token.strip()
    if req.mode:
        cfg["mode"] = req.mode
    save_fb_config(cfg)

    use_mode = req.mode or cfg.get("mode", "browser")
    page_id = (req.page_id or cfg.get("page_id") or "").strip()
    access_token = (req.access_token or cfg.get("access_token") or "").strip()

    # Nhánh 1: Đăng trực tiếp qua Facebook Graph API nếu có Access Token & Page/Professional ID
    if use_mode == "graph_api" and page_id and access_token:
        try:
            res_data = upload_via_graph_api(
                video_path=video_path,
                cover_path=cover_path,
                description=ordered_description,
                page_id=page_id,
                access_token=access_token
            )
            video_id = res_data.get("id", "unknown")
            return {
                "status": "success",
                "method": "graph_api",
                "video_id": video_id,
                "description": ordered_description,
                "cover_used": os.path.basename(cover_path) if cover_path else "Mặc định",
                "message": f"Đã tự động đăng Video + Ảnh bìa lên Facebook qua API thành công! (Post ID: {video_id})"
            }
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Lỗi Facebook Graph API: {str(e)}")

    # Nhánh 2: Tự động hóa giao diện Tạo Thước Phim (Chế độ chuyên nghiệp Facebook)
    threading.Thread(
        target=_run_browser_reels_automation,
        args=(video_path, cover_path, ordered_description, bool(req.auto_click_publish)),
        daemon=True
    ).start()

    return {
        "status": "success",
        "method": "browser_automation",
        "description": ordered_description,
        "cover_used": os.path.basename(cover_path) if cover_path else "Chưa chọn",
        "message": "Đã duyệt! Hệ thống đang tự động nạp Video, thay Ảnh bìa và điền Mô tả theo đúng thứ tự lên Facebook Reels."
    }
