import os
import re

p = os.path.join("frontend", "src", "components", "Timeline.tsx")
with open(p, "r", encoding="utf-8") as f:
    code = f.read()

# 1. Thay thế toàn bộ khối xử lý dragAction.target === "meme_img" trong handleMouseMove
new_meme_drag_block = """        if (dragAction.target === "meme_img" && setMemeImageList) {
          const shouldRipple = rippleTracks.meme;
          const oldEnd = dragAction.initialStart + dragAction.initialDuration;

          setMemeImageList((prev) => {
            const currentItem = prev.find((m) => m.id === dragAction.id);
            if (!currentItem) return prev;

            const isVid = currentItem.type === "video" || /\\.(mp4|mov|webm|mkv)(\\?.*)?$/i.test(currentItem.url);
            // Nếu block đã lỡ bị kéo lố lên 21.49s trước đó, lấy lại maxDuration chuẩn của video
            const maxOrig = isVid ? (currentItem.maxDuration || dragAction.maxOriginalDuration || currentItem.duration) : 999999;

            let updatedStart = dragAction.initialStart;
            let updatedDur = dragAction.initialDuration;
            let updatedTrim = dragAction.initialTrimStart || 0;

            if (dragAction.type === "move") {
              const rawMoved = Math.max(0, Number((dragAction.initialStart + deltaSeconds).toFixed(2)));
              updatedStart = applyMagneticSnap(rawMoved, 0.25);
              updatedDur = dragAction.initialDuration;
              updatedTrim = dragAction.initialTrimStart || 0;
            } else if (dragAction.type === "resize-right") {
              const rawNewDur = Number((dragAction.initialDuration + deltaSeconds).toFixed(2));
              if (isVid) {
                const maxAllowedDur = Math.max(0.2, maxOrig - updatedTrim);
                updatedDur = Number(Math.max(0.2, Math.min(maxAllowedDur, rawNewDur)).toFixed(2));
              } else {
                updatedDur = Number(Math.max(0.2, rawNewDur).toFixed(2));
              }
            } else if (dragAction.type === "resize-left") {
              if (isVid) {
                // Kéo sang phải (deltaSeconds > 0): Cắt ngắn đầu video, tối đa đến khi còn 0.2s
                const maxCutRight = Math.max(0, dragAction.initialDuration - 0.2);
                // Kéo sang trái (deltaSeconds < 0): Chỉ được mở rộng lại phần đã cắt (initialTrimStart), KHÔNG vượt quá độ dài gốc!
                const maxExtendLeft = Math.min(dragAction.initialStart, dragAction.initialTrimStart || 0);
                const clampedDelta = Math.max(-maxExtendLeft, Math.min(maxCutRight, deltaSeconds));

                updatedStart = Number(Math.max(0, dragAction.initialStart + clampedDelta).toFixed(2));
                updatedTrim = Number(Math.max(0, (dragAction.initialTrimStart || 0) + clampedDelta).toFixed(2));
                updatedDur = Number(Math.max(0.2, dragAction.initialDuration - clampedDelta).toFixed(2));
              } else {
                // Ảnh tĩnh: cho phép co giãn tự do nhưng giữ nguyên mép phải
                const maxCutRight = Math.max(0, dragAction.initialDuration - 0.2);
                const maxExtendLeft = dragAction.initialStart;
                const clampedDelta = Math.max(-maxExtendLeft, Math.min(maxCutRight, deltaSeconds));
                updatedStart = Number(Math.max(0, dragAction.initialStart + clampedDelta).toFixed(2));
                updatedDur = Number(Math.max(0.2, dragAction.initialDuration - clampedDelta).toFixed(2));
              }
            }

            const newEnd = updatedStart + updatedDur;
            const deltaEnd = newEnd - oldEnd;

            return prev.map((m) => {
              if (m.id === dragAction.id) {
                return { ...m, startTime: updatedStart, duration: updatedDur, trimStart: updatedTrim };
              }
              if (shouldRipple && m.startTime >= oldEnd - 0.05) {
                return { ...m, startTime: Math.max(newEnd, Number((m.startTime + deltaEnd).toFixed(2))) };
              }
              return m;
            });
          });
        }"""

code = re.sub(
    r'if \(dragAction\.target === "meme_img" && setMemeImageList\) \{.*?\n        \}\n\n        if \(dragAction\.target === "overlay"',
    new_meme_drag_block + '\n\n        if (dragAction.target === "overlay"',
    code,
    flags=re.DOTALL
)

# 2. Thay thế phần render JSX của memeImageList.map để 2 đầu kéo (resize-left & resize-right) nhạy 100%, không bị đè bởi thumbnail
new_meme_jsx = """              {memeImageList.map((meme) => {
                const isSelected = selectedIds.includes(meme.id);
                const isGrouped = !!meme.groupId;
                const isVid = meme.type === "video" || /\\.(mp4|mov|webm|mkv)(\\?.*)?$/i.test(meme.url);
                const maxOrigDur = isVid ? (meme.maxDuration || meme.duration) : 999999;
                return (
                  <div
                    key={meme.id}
                    onClick={(e) => handleSelectBlock(meme.id, e, "meme")}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      handleSelectBlock(meme.id, e, "meme");
                      setDragAction({
                        target: "meme_img",
                        type: "move",
                        id: meme.id,
                        startX: e.clientX,
                        initialStart: meme.startTime,
                        initialDuration: meme.duration,
                        initialTrimStart: meme.trimStart || 0,
                        maxOriginalDuration: maxOrigDur
                      });
                    }}
                    style={{ left: `${meme.startTime * pixelsPerSec}px`, width: `${meme.duration * pixelsPerSec}px` }}
                    className={`absolute h-9 rounded-md px-2.5 flex items-center shadow border transition cursor-grab active:cursor-grabbing group overflow-hidden ${
                      isSelected ? "bg-pink-600/75 border-white ring-2 ring-white z-20" : isGrouped ? "bg-pink-600/40 border-pink-300 ring-1 ring-pink-400/60 z-15" : "bg-pink-600/30 border-pink-400 hover:border-pink-300 z-10"
                    }`}
                  >
                    {/* THANH KÉO CẮT ĐẦU TRÁI (RESIZE-LEFT) */}
                    <div
                      title="Kéo sang phải để cắt đầu video"
                      onClick={(e) => e.stopPropagation()}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        handleSelectBlock(meme.id, e, "meme");
                        setDragAction({
                          target: "meme_img",
                          type: "resize-left",
                          id: meme.id,
                          startX: e.clientX,
                          initialStart: meme.startTime,
                          initialDuration: meme.duration,
                          initialTrimStart: meme.trimStart || 0,
                          maxOriginalDuration: maxOrigDur
                        });
                      }}
                      className="absolute left-0 top-0 bottom-0 w-3 bg-white/90 hover:bg-amber-300 cursor-ew-resize rounded-l-md z-40 flex items-center justify-center transition-all opacity-80 group-hover:opacity-100 shadow"
                    >
                      <div className="w-[1.5px] h-4 bg-pink-900 rounded-full pointer-events-none" />
                    </div>

                    {isVid ? (
                      <video src={meme.url} className="h-7 w-7 object-cover rounded pointer-events-none mr-1.5 ml-1 shrink-0" />
                    ) : (
                      <img src={meme.url} alt="meme" className="h-7 w-7 object-contain rounded pointer-events-none mr-1.5 ml-1 shrink-0" />
                    )}
                    <span className="text-[10px] text-pink-100 truncate font-semibold pointer-events-none select-none">
                      {meme.duration}s {meme.trimStart ? `(cắt ${meme.trimStart}s)` : ""} {isGrouped && "🔗"}
                    </span>

                    {/* THANH KÉO CẮT ĐẦU PHẢI (RESIZE-RIGHT) */}
                    <div
                      title="Kéo sang trái để cắt đuôi video"
                      onClick={(e) => e.stopPropagation()}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        handleSelectBlock(meme.id, e, "meme");
                        setDragAction({
                          target: "meme_img",
                          type: "resize-right",
                          id: meme.id,
                          startX: e.clientX,
                          initialStart: meme.startTime,
                          initialDuration: meme.duration,
                          initialTrimStart: meme.trimStart || 0,
                          maxOriginalDuration: maxOrigDur
                        });
                      }}
                      className="absolute right-0 top-0 bottom-0 w-3 bg-white/90 hover:bg-amber-300 cursor-ew-resize rounded-r-md z-40 flex items-center justify-center transition-all opacity-80 group-hover:opacity-100 shadow"
                    >
                      <div className="w-[1.5px] h-4 bg-pink-900 rounded-full pointer-events-none" />
                    </div>
                  </div>
                );
              })}"""

code = re.sub(
    r'\{memeImageList\.map\(\(meme\) => \{.*?\n              \}\)\}',
    new_meme_jsx,
    code,
    flags=re.DOTALL
)

with open(p, "w", encoding="utf-8") as f:
    f.write(code)

print(">>> ĐÃ CẬP NHẬT THÀNH CÔNG! GIỜ BẠN KÉO ĐẦU TRÁI SANG PHẢI ĐỂ CẮT ĐẦU VIDEO MEME MƯỢT 100% VÀ KHÔNG BỊ KÉO LỐ ĐỘ DÀI GỐC!")
