const fs = require("fs");
const path = require("path");

const ROOT = __dirname;

// ==========================================================
// 1. SỬA page.tsx
// ==========================================================
const pagePath = path.join(ROOT, "frontend", "src", "app", "page.tsx");
if (fs.existsSync(pagePath)) {
  let content = fs.readFileSync(pagePath, "utf8");

  // Hàm thêm ảnh trực tiếp an toàn tuyệt đối
  const directAddBlockFunction = [
    '  const handleDirectAddBlock = (imgData: any) => {',
    '    recordHistory();',
    '    const lastBlock = blocks[blocks.length - 1];',
    '    const nextStart = lastBlock ? Number((lastBlock.startTime + lastBlock.duration).toFixed(2)) : Number(currentTime.toFixed(2));',
    '    const rawUrl = imgData.url || imgData.image_url || imgData.imageUrl || "";',
    '    const cleanPath = rawUrl.startsWith("/") ? rawUrl : "/" + rawUrl;',
    '    const fullUrl = rawUrl.startsWith("http") ? rawUrl : (API_BASE + cleanPath);',
    '    const p = imgData.path || imgData.image_path || fullUrl;',
    '    const newBlock: TimelineBlock = {',
    '      id: "block_" + Date.now(),',
    '      image_url: fullUrl,',
    '      image_path: p,',
    '      startTime: nextStart,',
    '      duration: 3.0,',
    '      img_x: 140,',
    '      img_y: 450,',
    '      img_width: 800,',
    '      borderRadius: 12,',
    '      opacity: 1.0,',
    '    };',
    '    setBlocks((prev) => [...prev, newBlock]);',
    '    setSelectedBlockId(newBlock.id);',
    '  };'
  ].join('\n');

  if (!content.includes("handleDirectAddBlock")) {
    content = content.replace(
      "const handleUploadImageToTopic =",
      directAddBlockFunction + "\n  const handleUploadImageToTopic ="
    );
  }

  // Truyền onAddImageDirectly vào TopicsTab
  content = content.replace(
    /<TopicsTab[\s\S]*?\/>/,
    [
      '<TopicsTab',
      '                topics={topics}',
      '                currentTopic={currentTopic}',
      '                setCurrentTopic={(t) => {',
      '                  setCurrentTopic(t);',
      '                  loadTopicImages(t);',
      '                }}',
      '                topicImages={topicImages}',
      '                apiBase={API_BASE}',
      '                activeBlock={activeBlock}',
      '                setBlocks={setBlocks}',
      '                onAddImageDirectly={handleDirectAddBlock}',
      '                handleCreateTopic={handleCreateTopic}',
      '                handleRenameTopic={handleRenameTopic}',
      '                handleDeleteTopic={handleDeleteTopic}',
      '                handleUploadImageToTopic={handleUploadImageToTopic}',
      '                handleDeleteSingleImage={handleDeleteSingleImage}',
      '              />'
    ].join('\n')
  );

  // Bật cuộn ngang tự do ở container PreviewPlayer
  content = content.replace(
    /className="flex-1 relative flex flex-col items-center[^"]*"/,
    'className="flex-1 relative overflow-x-auto overflow-y-auto p-4 min-h-0 min-w-0 bg-[#07090e]"'
  );

  // Ép container con có độ rộng min-w-max để thanh cuộn ngang luôn hoạt động khi zoom to
  if (!content.includes('id="preview-scroll-wrapper"')) {
    content = content.replace(
      '<div className="relative my-auto">',
      '<div id="preview-scroll-wrapper" className="min-w-max flex flex-col items-center justify-center m-auto py-2">\n          <div className="relative">'
    );
    content = content.replace(
      '</PreviewPlayer>',
      '</PreviewPlayer>\n          </div>'
    );
  }

  fs.writeFileSync(pagePath, content, "utf8");
  console.log(">>> [1/2] Da cap nhat page.tsx!");
}

// ==========================================================
// 2. SỬA TopicsTab.tsx
// ==========================================================
const topicsTabPath = path.join(ROOT, "frontend", "src", "components", "tabs", "TopicsTab.tsx");
if (fs.existsSync(topicsTabPath)) {
  let content = fs.readFileSync(topicsTabPath, "utf8");

  if (!content.includes("onAddImageDirectly?:")) {
    content = content.replace(
      "interface TopicsTabProps {",
      "interface TopicsTabProps {\n  onAddImageDirectly?: (img: any) => void;"
    );
  }

  if (!content.includes("onAddImageDirectly,")) {
    content = content.replace(
      "setBlocks,",
      "setBlocks,\n  onAddImageDirectly,"
    );
  }

  const clickAddHandler = [
    '  const handleAddImageDirectly = (img: any) => {',
    '    if (typeof onAddImageDirectly === "function") {',
    '      onAddImageDirectly(img);',
    '      return;',
    '    }',
    '    const fullUrl = getFullImgUrl(img);',
    '    if (typeof setBlocks === "function") {',
    '      setBlocks((prev: any) => {',
    '        const safePrev = Array.isArray(prev) ? prev : [];',
    '        const lastBlock = safePrev[safePrev.length - 1];',
    '        const nextStartTime = lastBlock ? (Number(lastBlock.startTime) || 0) + (Number(lastBlock.duration) || 3) : 0;',
    '        return [',
    '          ...safePrev,',
    '          {',
    '            id: "block_" + Date.now(),',
    '            image_url: fullUrl,',
    '            image_path: img.path || fullUrl,',
    '            startTime: Number(nextStartTime.toFixed(2)),',
    '            duration: 3.0,',
    '            maxDuration: 999999;',
    '            img_x: 140,',
    '            img_y: 450,',
    '            img_width: 800,',
    '            borderRadius: 12,',
    '            opacity: 1.0,',
    '          }',
    '        ];',
    '      });',
    '    }',
    '  };'
  ].join('\n');

  content = content.replace(
    /const handleAddImageDirectly = \([\s\S]*?return \[\.\.\.safePrev, newBlock\];\s*\}\);?\s*\};/,
    clickAddHandler
  );

  fs.writeFileSync(topicsTabPath, content, "utf8");
  console.log(">>> [2/2] Da cap nhat TopicsTab.tsx!");
}

console.log("=== THUC THI THANH CONG 100%! ===");
