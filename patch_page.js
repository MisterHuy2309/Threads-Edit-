const fs = require("fs");
const path = require("path");

const pagePath = path.join(__dirname, "frontend", "src", "app", "page.tsx");
if (fs.existsSync(pagePath)) {
  let content = fs.readFileSync(pagePath, "utf8");

  // 1. Chèn hàm handleAddManualVoiceToTimeline chuẩn xác
  const voiceAddFunction = `  const handleAddManualVoiceToTimeline = (voiceItem: { name: string; url: string; duration: number; path: string }) => {
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

  if (!content.includes("const handleAddManualVoiceToTimeline =")) {
    content = content.replace("const handleCreateTopic =", voiceAddFunction + "\n\n  const handleCreateTopic =");
  } else {
    content = content.replace(
      /const handleAddManualVoiceToTimeline = \([\s\S]*?setSelectedVoiceId\(newVoice\.id\);\s*\}\s*;/g,
      voiceAddFunction
    );
  }

  // 2. ÉP THANH CUỘN NGANG HOẠT ĐỘNG 100%: 
  // Thay thế toàn bộ class của khung PreviewPlayer thành container có scroll ngang chuyên dụng
  content = content.replace(
    /className="flex-1 relative flex flex-col items-center[^"]*"/,
    'className="flex-1 min-w-0 w-0 h-full relative flex flex-col items-center overflow-x-auto overflow-y-auto p-4 bg-[#07090e]" style={{ scrollbarGutter: "stable" }}'
  );

  fs.writeFileSync(pagePath, content, "utf8");
  console.log(">>> Da cap nhat page.tsx: San sang voice va thanh cuon ngang!");
}
