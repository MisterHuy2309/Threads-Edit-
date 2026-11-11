const fs = require("fs");
const path = require("path");

const ROOT = __dirname;

// ==========================================================
// 1. SỬA CHUẨN: frontend/src/app/page.tsx
// ==========================================================
const pagePath = path.join(ROOT, "frontend", "src", "app", "page.tsx");
if (fs.existsSync(pagePath)) {
  let content = fs.readFileSync(pagePath, "utf8");

  // Định nghĩa hàm thêm block ảnh trực tiếp
  const directAddBlockCode = `
  const handleDirectAddBlock = (imgData: any) => {
    recordHistory();
    const lastBlock = blocks[blocks.length - 1];
    const nextStart = lastBlock 
      ? Number((lastBlock.startTime + lastBlock.duration).toFixed(2)) 
      : Number(currentTime.toFixed(2));
    const rawUrl = imgData.url || imgData.image_url || imgData.imageUrl || "";
    const cleanPath = rawUrl.startsWith("/") ? rawUrl : "/" + rawUrl;
    const fullUrl = rawUrl.startsWith("http") ? rawUrl : (API_BASE + cleanPath);
    const p = imgData.path || imgData.image_path || fullUrl;
    
    const newBlock: TimelineBlock = {
      id: "block_" + Date.now(),
      image_url: fullUrl,
      image_path: p,
      startTime: nextStart,
      duration: 3.0,
      maxDuration: 999999,
      img_x: 140,
      img_y: 450,
      img_width: 800,
      borderRadius: 12,
      opacity: 1.0,
    };
    setBlocks((prev) => [...prev, newBlock]);
    setSelectedBlockId(newBlock.id);
  };
`;

  if (!content.includes("handleDirectAddBlock")) {
    content = content.replace("const handleUploadImageToTopic =", directAddBlockCode + "\n  const handleUploadImageToTopic =");
  }

  // Đảm bảo truyền setBlocks và onAddImageDirectly vào TopicsTab
  if (!content.includes("onAddImageDirectly={handleDirectAddBlock}")) {
    content = content.replace(
      "<TopicsTab",
      "<TopicsTab\n                setBlocks={setBlocks}\n                onAddImageDirectly={handleDirectAddBlock}"
    );
  }

  // SỬA CONTAINER PREVIEW: Bật scroll ngang và không để items-center đẩy lệch video ra ngoài mép
  content = content.replace(
    /className="flex-1 relative flex flex-col items-center[^"]*"/,
    'className="flex-1 relative overflow-x-auto overflow-y-auto p-4 min-h-0 min-w-0 bg-[#07090e]"'
  );

  // Bọc khung player bằng container có min-width fit để thanh cuộn ngang hoạt động khi zoom to
  if (!content.includes('id="preview-scroll-wrapper"')) {
    content = content.replace(
      '<div className="relative my-auto">',
      '<div id="preview-scroll-wrapper" className="min-w-fit flex flex-col items-center justify-center m-auto py-2">\n          <div className="relative">'
    );
    content = content.replace(
      '</PreviewPlayer>',
      '</PreviewPlayer>\n          </div>'
    );
  }

  fs.writeFileSync(pagePath, content, "utf8");
  console.log(">>> [1/2] Da sua frontend/src/app/page.tsx thanh cong!");
}

// ==========================================================
// 2. SỬA CHUẨN: frontend/src/components/tabs/TopicsTab.tsx
// ==========================================================
const topicsTabPath = path.join(ROOT, "frontend", "src", "components", "tabs", "TopicsTab.tsx");
if (fs.existsSync(topicsTabPath)) {
  let content = fs.readFileSync(topicsTabPath, "utf8");

  // 1. Thêm onAddImageDirectly vào Interface
  if (!content.includes("onAddImageDirectly?:")) {
    content = content.replace(
      "interface TopicsTabProps {",
      "interface TopicsTabProps {\n  onAddImageDirectly?: (img: any) => void;"
    );
  }

  // 2. Thêm onAddImageDirectly vào Props destructure
  if (!content.includes("onAddImageDirectly,")) {
    content = content.replace(
      "setBlocks,",
      "setBlocks,\n  onAddImageDirectly,"
    );
  }

  // 3. Hàm click nút (+) xử lý chuẩn 100%, đúng cú pháp dấu phẩy
  const safeHandler = `  const handleAddImageDirectly = (img: any) => {
    if (typeof onAddImageDirectly === "function") {
      onAddImageDirectly(img);
      return;
    }
    const fullUrl = getFullImgUrl(img);
    if (typeof setBlocks === "function") {
      setBlocks((prev: any) => {
        const safePrev = Array.isArray(prev) ? prev : [];
        const lastBlock = safePrev[safePrev.length - 1];
        const nextStartTime = lastBlock ? (Number(lastBlock.startTime) || 0) + (Number(lastBlock.duration) || 3) : 0;
        return [
          ...safePrev,
          {
            id: "block_" + Date.now(),
            image_url: fullUrl,
            image_path: img.path || fullUrl,
            startTime: Number(nextStartTime.toFixed(2)),
            duration: 3.0,
            maxDuration: 999999,
            img_x: 140,
            img_y: 450,
            img_width: 800,
            borderRadius: 12,
            opacity: 1.0,
          }
        ];
      });
    }
  };`;

  content = content.replace(
    /const handleAddImageDirectly = \([\s\S]*?return \[\.\.\.safePrev, newBlock\];\s*\}\);?\s*\};/,
    safeHandler
  );

  fs.writeFileSync(topicsTabPath, content, "utf8");
  console.log(">>> [2/2] Da sua frontend/src/components/tabs/TopicsTab.tsx thanh cong!");
}

console.log("=== HOAN TAT! ===");
