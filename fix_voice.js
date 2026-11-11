const fs = require("fs");
const path = require("path");

const ROOT = __dirname;

// ==========================================
// 1. SỬA BACKEND: backend/routers/tts.py
// Bổ sung API lấy danh sách thư mục voice thực tế
// ==========================================
const ttsPyPath = path.join(ROOT, "backend", "routers", "tts.py");
if (fs.existsSync(ttsPyPath)) {
  let ttsContent = fs.readFileSync(ttsPyPath, "utf8");

  const foldersEndpoint = `
@router.get("/folders")
def get_voice_folders():
    folders = ["general"]
    if os.path.exists(VOICES_DIR):
        for f in os.listdir(VOICES_DIR):
            p = os.path.join(VOICES_DIR, f)
            if os.path.isdir(p) and f not in folders:
                folders.append(f)
    return folders
`;

  if (!ttsContent.includes('/folders')) {
    ttsContent = ttsContent.replace('router = APIRouter(prefix="/api/tts", tags=["TTS"])', 'router = APIRouter(prefix="/api/tts", tags=["TTS"])\n' + foldersEndpoint);
    fs.writeFileSync(ttsPyPath, ttsContent, "utf8");
    console.log(">>> [1/3] Da bo sung API /api/tts/folders vao backend/routers/tts.py");
  }
}

// ==========================================
// 2. SỬA VoiceTab.tsx:
// - Tự động tải danh sách thư mục từ backend
// - Sửa nút (+) gắn voice vào timeline chắc chắn 100%
// ==========================================
const voiceTabPath = path.join(ROOT, "frontend", "src", "components", "tabs", "VoiceTab.tsx");
if (fs.existsSync(voiceTabPath)) {
  let voiceTabContent = fs.readFileSync(voiceTabPath, "utf8");

  // Load folders từ API /api/tts/folders
  const folderEffect = `
  const [folderList, setFolderList] = useState<string[]>(["general"]);

  useEffect(() => {
    fetch(\`\${API_BASE}/api/tts/folders\`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setFolderList(data);
        }
      })
      .catch(() => {});
  }, []);
`;

  if (!voiceTabContent.includes('/api/tts/folders')) {
    voiceTabContent = voiceTabContent.replace(
      'const [voiceLibrary, setVoiceLibrary] = useState<any[]>([]);',
      'const [voiceLibrary, setVoiceLibrary] = useState<any[]>([]);\n' + folderEffect
    );
  }

  // Đổi mapping danh sách thư mục
  voiceTabContent = voiceTabContent.replace(
    '{topics.map((t) => (',
    '{folderList.map((t) => ('
  );

  // Đảm bảo nút (+) truyền dữ liệu đầy đủ, an toàn
  voiceTabContent = voiceTabContent.replace(
    /onAddManualVoiceToTimeline\s*\(\s*item\s*\)/g,
    `onAddManualVoiceToTimeline({
                        name: item.name,
                        url: item.url,
                        duration: Number(item.duration) || 3.0,
                        path: item.path || item.url
                      })`
  );

  fs.writeFileSync(voiceTabPath, voiceTabContent, "utf8");
  console.log(">>> [2/3] Da cap nhat VoiceTab.tsx (Load du thu muc & nut + voice)");
}

// ==========================================
// 3. SỬA page.tsx:
// - Hàm handleAddManualVoiceToTimeline tính đúng thời gian và ép cập nhật
// ==========================================
const pagePath = path.join(ROOT, "frontend", "src", "app", "page.tsx");
if (fs.existsSync(pagePath)) {
  let pageContent = fs.readFileSync(pagePath, "utf8");

  const newAddManualVoice = `const handleAddManualVoiceToTimeline = (voiceItem: { name: string; url: string; duration: number; path: string }) => {
    recordHistory();
    const nextStart = voiceList.length > 0 
      ? Math.max(...voiceList.map((v) => v.startTime + v.duration)) 
      : 0;
    const dur = Number(voiceItem.duration) || 3.0;
    const newVoice: VoiceItem = {
      id: "voice_" + Date.now(),
      name: voiceItem.name || "Voice Audio",
      url: voiceItem.url,
      path: voiceItem.path || voiceItem.url,
      startTime: Number(nextStart.toFixed(2)),
      duration: dur,
      maxDuration: dur,
      trimStart: 0,
      speed: 1.0,
    };
    setVoiceList((prev) => [...prev, newVoice]);
    setSelectedVoiceId(newVoice.id);
  };`;

  pageContent = pageContent.replace(
    /const handleAddManualVoiceToTimeline = \([\s\S]*?setSelectedVoiceId\(newVoice\.id\);\s*\};/,
    newAddManualVoice
  );

  fs.writeFileSync(pagePath, pageContent, "utf8");
  console.log(">>> [3/3] Da cap nhat page.tsx (Ham them voice vao Timeline)");
}

console.log("=== HOAN TAT! ===");
