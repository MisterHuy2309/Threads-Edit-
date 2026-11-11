const fs = require("fs");
const path = require("path");

const pagePath = path.join(__dirname, "frontend", "src", "app", "page.tsx");
if (fs.existsSync(pagePath)) {
  let content = fs.readFileSync(pagePath, "utf8");

  // Đảm bảo khai báo chuẩn xác currentActiveBgClip và activeTimelineBgUrl
  const bgLogic = `  const currentActiveBgClip = bgClips.find(
    (c) => currentTime >= c.startTime && currentTime <= (c.startTime + c.duration)
  ) || null;
  const activeTimelineBgUrl = currentActiveBgClip ? currentActiveBgClip.url : "";`;

  // Xóa sạch các khai báo cũ gây xung đột
  content = content.replace(/const activeTimelineBgUrl =[\s\S]*?;/g, "");
  content = content.replace(/const old_currentActiveBgClip =[\s\S]*?;/g, "");
  content = content.replace(/const currentActiveBgClip =[\s\S]*?;/g, "");

  // Chèn lại khai báo chuẩn ngay trước previewActiveBlock
  content = content.replace(
    "const previewActiveBlock =",
    bgLogic + "\n\n  const previewActiveBlock ="
  );

  fs.writeFileSync(pagePath, content, "utf8");
  console.log(">>> Da sua triet de loi currentActiveBgClip trong page.tsx!");
}
