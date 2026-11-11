const fs = require("fs");
const path = require("path");

const ROOT = __dirname;

// ==========================================
// 1. SỬA page.tsx: Truyền đúng setBlocks vào TopicsTab & Bật cuộn ngang triệt để
// ==========================================
const pagePath = path.join(ROOT, "frontend", "src", "app", "page.tsx");
if (fs.existsSync(pagePath)) {
  let pageContent = fs.readFileSync(pagePath, "utf8");

  // Fix 1: Đảm bảo setBlocks={setBlocks} có mặt trong TopicsTab
  if (!pageContent.includes('setBlocks={setBlocks}')) {
    pageContent = pageContent.replace(
      '<TopicsTab',
      '<TopicsTab\n                setBlocks={setBlocks}'
    );
  }

  // Fix 2: Container bọc PreviewPlayer phải có overflow-x-auto, w-full, flex-1
  pageContent = pageContent.replace(
    /className="flex-1 relative flex flex-col items-center[^"]*"/,
    'className="flex-1 relative flex flex-col items-center overflow-y-auto overflow-x-auto p-4 min-h-0 min-w-0 w-full bg-slate-950/80"'
  );

  // Fix 3: Thẻ div cha bọc giữa
  pageContent = pageContent.replace(
    'className="flex-1 flex overflow-hidden min-h-0"',
    'className="flex-1 flex overflow-hidden min-h-0 min-w-0 w-full"'
  );

  fs.writeFileSync(pagePath, pageContent, "utf8");
  console.log(">>> [1/2] Da cap nhat page.tsx: Truyen setBlocks & Bat cuon ngang!");
}

// ==========================================
// 2. SỬA TopicsTab.tsx: An toàn tuyệt đối khi gọi setBlocks
// ==========================================
const topicsTabPath = path.join(ROOT, "frontend", "src", "components", "tabs", "TopicsTab.tsx");
if (fs.existsSync(topicsTabPath)) {
  let topicsContent = fs.readFileSync(topicsTabPath, "utf8");

  // Đảm bảo handleAddImageDirectly kiểm tra typeof setBlocks === "function"
  const safeAddImage = `  const handleAddImageDirectly = (img: any) => {
    const fullUrl = getFullImgUrl(img);
    if (typeof setBlocks !== "function") {
      console.error("setBlocks chua duoc truyen dung vao TopicsTab!");
      return;
    }
    setBlocks((prev: any) => {
      const safePrev = Array.isArray(prev) ? prev : [];
      const lastBlock = safePrev[safePrev.length - 1];
      const nextStartTime = lastBlock ? (Number(lastBlock.startTime) || 0) + (Number(lastBlock.duration) || 3) : 0;

      const newBlock: TimelineBlock = {
        id: "block_" + Date.now(),
        image_url: fullUrl,
        image_path: img.path || fullUrl,
        startTime: Number(nextStartTime.toFixed(2)),
        duration: 3.0,
        maxDuration: 999999,
        img_x: 140,
        img_y: 450,
        img_width: 800,
        voice: null,
      };
      return [...safePrev, newBlock];
    });
  };`;

  topicsContent = topicsContent.replace(
    /const handleAddImageDirectly = \([\s\S]*?return \[\.\.\.safePrev, newBlock\];\s*\}\);?\s*\};/,
    safeAddImage
  );

  fs.writeFileSync(topicsTabPath, topicsContent, "utf8");
  console.log(">>> [2/2] Da cap nhat TopicsTab.tsx: Fix triet de setBlocks!");
}

console.log("=== HOAN TAT FIX! ===");
