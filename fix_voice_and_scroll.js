const fs = require("fs");
const path = require("path");

const ROOT = __dirname;

// =========================================================================
// 1. SỬA CHUẨN frontend/src/components/tabs/VoiceTab.tsx:
// - Chặn triệt để MetaMask can thiệp (stopPropagation, preventDefault)
// - Bấm (+) là thêm Voice ngay lập tức, tự tính nextStart
// =========================================================================
const voiceTabPath = path.join(ROOT, "frontend", "src", "components", "tabs", "VoiceTab.tsx");
if (fs.existsSync(voiceTabPath)) {
  let content = fs.readFileSync(voiceTabPath, "utf8");

  // Nâng cấp nút (+) với stopPropagation và fallbacks an toàn
  const oldBtnPlusRegex = /<button[\s\S]*?onClick=\{\(\)\s*=>\s*\{[\s\S]*?onAddManualVoiceToTimeline[\s\S]*?\}[\s\S]*?title="Đưa voice vào Timeline"[\s\S]*?>[\s\S]*?<\/button>/;
  
  const newBtnPlus = `<button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        try {
                          if (typeof onAddManualVoiceToTimeline === "function") {
                            onAddManualVoiceToTimeline({
                              name: item.name,
                              url: item.url,
                              duration: Number(item.duration) || 3.0,
                              path: item.path || item.url
                            });
                          }
                        } catch (err) {
                          console.error("Lỗi add voice:", err);
                        }
                      }}
                      title="Đưa voice vào Timeline"
                      className="p-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-full transition shadow-md active:scale-95"
                    >
                      <Plus size={12} />
                    </button>`;

  if (oldBtnPlusRegex.test(content)) {
    content = content.replace(oldBtnPlusRegex, newBtnPlus);
  } else {
    // Thay thế mẫu click đơn giản
    content = content.replace(
      /onClick=\{\(\)\s*=>\s*onAddManualVoiceToTimeline\s*\([^)]*\)\}/g,
      `onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (typeof onAddManualVoiceToTimeline === "function") {
          onAddManualVoiceToTimeline({
            name: item.name,
            url: item.url,
            duration: Number(item.duration) || 3.0,
            path: item.path || item.url
          });
        }
      }}`
    );
  }

  fs.writeFileSync(voiceTabPath, content, "utf8");
  console.log(">>> [1/2] Da sua VoiceTab.tsx: Chan MetaMask & nut (+) Voice hoat dong!");
}

// =========================================================================
// 2. SỬA CHUẨN frontend/src/app/page.tsx:
// - Đảm bảo handleAddManualVoiceToTimeline cập nhật state chuẩn
// - Ép container PreviewPlayer CÓ THANH CUỘN NGANG THẬT SỰ (overflow-x: scroll)
// =========================================================================
const pagePath = path.join(ROOT, "frontend", "src", "app", "page.tsx");
if (fs.existsSync(pagePath)) {
  let content = fs.readFileSync(pagePath, "utf8");

  // Viết lại hàm handleAddManualVoiceToTimeline chắc chắn chèn vào voiceList
  const newVoiceFunc = `  const handleAddManualVoiceToTimeline = (voiceItem: { name: string; url: string; duration: number; path: string }) => {
    recordHistory();
    const dur = Number(voiceItem.duration) || 3.0;
    setVoiceList((prev) => {
      const safePrev = Array.isArray(prev) ? prev : [];
      const nextStart = safePrev.length > 0 
        ? Math.max(...safePrev.map((v) => (v.startTime || 0) + (v.duration || 0))) 
        : Number(currentTime.toFixed(2));

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
      setSelectedVoiceId(newVoice.id);
      return [...safePrev, newVoice];
    });
  };`;

  content = content.replace(
    /const handleAddManualVoiceToTimeline = \([\s\S]*?setSelectedVoiceId\(newVoice\.id\);\s*\};/,
    newVoiceFunc
  );

  // SỬA DỨT ĐIỂM THANH CUỘN NGANG:
  // Container chính giữa phải có: overflow-x-auto, overflow-y-auto, flex-1, w-0 (để flexbox không đẩy tràn âm)
  content = content.replace(
    /className="flex-1 relative[^"]*overflow-y-auto[^"]*"/,
    'className="flex-1 min-w-0 w-0 h-full relative flex flex-col items-center overflow-x-auto overflow-y-auto p-4 bg-[#07090e]"'
  );

  // Bọc phần hiển thị video bằng thẻ div có min-width cố định (tối thiểu 380px) để trình duyệt luôn bật thanh cuộn ngang khi thu hẹp
  if (!content.includes('id="force-scroll-container"')) {
    content = content.replace(
      '<div className="relative my-auto">',
      '<div id="force-scroll-container" style={{ minWidth: "400px" }} className="flex flex-col items-center justify-center my-auto">\n          <div className="relative">'
    );
    content = content.replace(
      '</PreviewPlayer>',
      '</PreviewPlayer>\n          </div>'
    );
  }

  fs.writeFileSync(pagePath, content, "utf8");
  console.log(">>> [2/2] Da sua page.tsx: Bat thanh cuon ngang & chot state VoiceList!");
}

console.log("=== HOAN TAT! ===");
