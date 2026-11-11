const fs = require("fs");
const path = require("path");

const pagePath = path.join(__dirname, "frontend", "src", "app", "page.tsx");
if (fs.existsSync(pagePath)) {
  let content = fs.readFileSync(pagePath, "utf8");

  // 1. Chèn script chặn MetaMask ném lỗi làm crash React
  const metamaskGuard = `
  useEffect(() => {
    const handleErr = (event: ErrorEvent) => {
      if (event?.message?.includes("MetaMask") || event?.filename?.includes("inpage.js")) {
        event.stopImmediatePropagation();
        event.preventDefault();
      }
    };
    window.addEventListener("error", handleErr);
    return () => window.removeEventListener("error", handleErr);
  }, []);
`;
  if (!content.includes('event?.message?.includes("MetaMask")')) {
    content = content.replace('export default function CapCutThreadsStudio() {', 'export default function CapCutThreadsStudio() {\n' + metamaskGuard);
  }

  // 2. Đồng bộ truyền cả 2 tên prop vào VoiceTab để không bao giờ bị lệch prop
  content = content.replace(
    'onAddManualVoice={handleAddManualVoiceToTimeline}',
    'onAddManualVoice={handleAddManualVoiceToTimeline}\n                  onAddManualVoiceToTimeline={handleAddManualVoiceToTimeline}'
  );

  // 3. SỬA TRIỆT ĐỂ THANH CUỘN NGANG:
  // Thay đổi container preview từ overflow-hidden thành overflow-x-auto, overflow-y-auto với min-w-max bên trong
  content = content.replace(
    /className="flex-1 flex flex-col items-center justify-between p-2 overflow-hidden bg-\[#0a0b0e\] relative"/,
    'className="flex-1 flex flex-col items-center justify-start p-2 overflow-x-auto overflow-y-auto bg-[#0a0b0e] relative min-w-0"'
  );

  content = content.replace(
    /className="flex-1 w-full flex items-center justify-center min-h-0 relative"/,
    'className="flex-1 min-w-fit w-auto flex flex-col items-center justify-center min-h-0 relative m-auto"'
  );

  fs.writeFileSync(pagePath, content, "utf8");
  console.log(">>> [2/2] Da cap nhat frontend/src/app/page.tsx: Chot thanh cuon ngang & truyen prop Voice!");
}
