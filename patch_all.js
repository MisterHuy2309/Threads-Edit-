const fs = require("fs");
const path = require("path");

const ROOT = __dirname;

// ==========================================
// 1. SỬA BACKEND: backend/routers/tts.py
// ==========================================
const ttsPyPath = path.join(ROOT, "backend", "routers", "tts.py");
if (fs.existsSync(ttsPyPath)) {
  let ttsContent = fs.readFileSync(ttsPyPath, "utf8");
  
  // Nâng cấp API library để quét tìm file trong cả thư mục con lẫn thư mục cha nếu folder rỗng
  const libraryLogic = `@router.get("/library")
def get_voice_library(topic_name: str = "general"):
    topic_dir = os.path.join(VOICES_DIR, topic_name)
    os.makedirs(topic_dir, exist_ok=True)
    items = []
    
    # 1. Quét trong thư mục được chọn
    search_dirs = [topic_dir]
    # Nếu là general mà rỗng, quét thêm trực tiếp thư mục cha VOICES_DIR và các thư mục con
    if topic_name.lower() == "general" or not os.listdir(topic_dir):
        search_dirs.append(VOICES_DIR)
        for sub in os.listdir(VOICES_DIR):
            sub_p = os.path.join(VOICES_DIR, sub)
            if os.path.isdir(sub_p):
                search_dirs.append(sub_p)

    seen_files = set()
    for s_dir in search_dirs:
        if not os.path.exists(s_dir):
            continue
        for f in sorted(os.listdir(s_dir), reverse=True):
            p = os.path.join(s_dir, f)
            if os.path.isfile(p) and f.lower().endswith((".mp3", ".wav", ".m4a", ".aac")) and f not in seen_files:
                seen_files.add(f)
                dur = 3.0
                try:
                    clip = AudioFileClip(p)
                    dur = float(clip.duration)
                    clip.close()
                except Exception:
                    pass
                rel_topic = os.path.basename(s_dir) if s_dir != VOICES_DIR else topic_name
                items.append({
                    "id": f,
                    "name": f,
                    "url": f"http://127.0.0.1:8000/media/voices/{rel_topic}/{f}",
                    "path": p.replace("\\\\", "/"),
                    "duration": round(dur, 2)
                })
    return items`;

  ttsContent = ttsContent.replace(/@router\.get\("\/library"\)[\s\S]*?return items/, libraryLogic);
  fs.writeFileSync(ttsPyPath, ttsContent, "utf8");
  console.log(">>> [1/4] Da cap nhat backend/routers/tts.py (Load Voice thong minh)");
}

// ==========================================
// 2. SỬA PREVIEW PLAYER: PreviewPlayer.tsx
// ==========================================
const previewPath = path.join(ROOT, "frontend", "src", "components", "PreviewPlayer.tsx");
if (fs.existsSync(previewPath)) {
  let prevContent = fs.readFileSync(previewPath, "utf8");

  // Chỉ phát khi ĐÃ CÓ CLIP TRÊN TIMELINE (Không lấy fallback selectedBg)
  prevContent = prevContent.replace(
    'const bgUrl = getFullMediaUrl(selectedBg);',
    'const bgUrl = getFullMediaUrl(isInsideBgVideo ? selectedBg : "");'
  );

  // Thêm nút Phóng To Fullscreen chuẩn CapCut vào thanh điều khiển
  const capcutFullscreenBtn = `<button 
            onClick={handleFullscreen} 
            title="Xem toàn màn hình (CapCut Style)" 
            className="flex items-center gap-1.5 px-3 py-1 bg-slate-800 hover:bg-slate-700 text-cyan-400 hover:text-white rounded-lg border border-slate-700 transition active:scale-95 text-xs font-bold"
          >
            <Maximize size={13} />
            <span>Toàn màn hình</span>
          </button>`;

  if (!prevContent.includes('title="Xem toàn màn hình (CapCut Style)"')) {
    prevContent = prevContent.replace(
      '<button onClick={handleFullscreen} title="Toàn màn hình"',
      `${capcutFullscreenBtn}\n          <button onClick={handleFullscreen} title="Toàn màn hình"`
    );
  }

  fs.writeFileSync(previewPath, prevContent, "utf8");
  console.log(">>> [2/4] Da cap nhat PreviewPlayer.tsx (Chặn tự phát video nền & thêm nút Phóng to)");
}

// ==========================================
// 3. SỬA PAGE: page.tsx (Thanh cuộn ngang + Bỏ video nền rác)
// ==========================================
const pagePath = path.join(ROOT, "frontend", "src", "app", "page.tsx");
if (fs.existsSync(pagePath)) {
  let pageContent = fs.readFileSync(pagePath, "utf8");

  // Sửa container PreviewPlayer để có thanh cuộn ngang khi phóng to/màn hình nhỏ
  pageContent = pageContent.replace(
    'className="flex-1 relative flex flex-col items-center overflow-y-auto overflow-x-hidden p-3 min-h-0"',
    'className="flex-1 relative flex flex-col items-center overflow-y-auto overflow-x-auto p-4 min-h-0 bg-slate-950/80"'
  );

  // Truyền selectedBg rỗng nếu không có clip trên timeline
  pageContent = pageContent.replace(
    'selectedBg={currentActiveBgClip?.url || ""}',
    'selectedBg={currentActiveBgClip ? currentActiveBgClip.url : ""}'
  );

  fs.writeFileSync(pagePath, pageContent, "utf8");
  console.log(">>> [3/4] Da cap nhat page.tsx (Them cuon ngang & chan video nen tu dong)");
}

// ==========================================
// 4. SỬA TIMELINE: Timeline.tsx
// ==========================================
const timelinePath = path.join(ROOT, "frontend", "src", "components", "Timeline.tsx");
if (fs.existsSync(timelinePath)) {
  let tlContent = fs.readFileSync(timelinePath, "utf8");

  // Xóa nút Ẩn Timeline trùng lặp ở góc phải timeline toolbar
  tlContent = tlContent.replace(
    /<button\s+onClick=\{\(\)\s*=>\s*setIsCollapsed\(!isCollapsed\)\}[\s\S]*?<\/button>/,
    ''
  );

  // Thêm hỗ trợ Kéo - Thả (Drag & Drop) trực tiếp ảnh vào Track Comment
  const dropCommentTrack = `onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }}
            onDrop={(e) => {
              e.preventDefault();
              try {
                const data = JSON.parse(e.dataTransfer.getData("application/json") || "{}");
                if (data.imageUrl || data.image_url || data.path) {
                  if (onRecordHistory) onRecordHistory();
                  const targetUrl = data.imageUrl || data.image_url || data.path;
                  const newBlock = {
                    id: "block_" + Date.now(),
                    image_url: targetUrl,
                    image_path: data.image_path || targetUrl,
                    startTime: Number(currentTime.toFixed(2)),
                    duration: data.duration || 3.0,
                    img_x: 140,
                    img_y: 450,
                    img_width: 800,
                    borderRadius: 12,
                    opacity: 1.0,
                  };
                  if (setBlocks) setBlocks((prev) => [...prev, newBlock]);
                }
              } catch (_) {}
            }}`;

  if (!tlContent.includes('onDragOver={(e) => { e.preventDefault();')) {
    tlContent = tlContent.replace(
      'className="h-12 border-b border-slate-800/60 relative flex items-center px-1 bg-slate-950/20"',
      `className="h-12 border-b border-slate-800/60 relative flex items-center px-1 bg-slate-950/20" ${dropCommentTrack}`
    );
  }

  fs.writeFileSync(timelinePath, tlContent, "utf8");
  console.log(">>> [4/4] Da cap nhat Timeline.tsx (Keo tha anh truc tiep & bo nut an timeline trung lap)");
}

console.log("=== DA HOAN TAT 100%! ===");
