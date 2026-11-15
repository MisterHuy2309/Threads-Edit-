import os

p = os.path.join("frontend", "src", "components", "Timeline.tsx")
with open(p, "r", encoding="utf-8") as f:
    code = f.read()

# 1. Sửa lỗi b.trimStart -> meme.trimStart ở 2 đầu kéo trái/phải của block Meme và thêm z-30 để dễ cầm kéo
old_left_handle = 'onMouseDown={(e) => { e.stopPropagation(); setDragAction({ target: "meme_img", type: "resize-left", id: meme.id, startX: e.clientX, initialStart: meme.startTime, initialDuration: meme.duration, initialTrimStart: b.trimStart || 0, maxOriginalDuration: 999999 }); }} className="absolute left-0 top-0 bottom-0 w-2.5 hover:w-3.5 bg-pink-400/80 hover:bg-pink-300 cursor-ew-resize rounded-l-md transition-all opacity-0 group-hover:opacity-100"'

new_left_handle = 'onMouseDown={(e) => { e.stopPropagation(); const isVid = meme.type === "video" || /\\.(mp4|mov|webm|mkv)(\\?.*)?$/i.test(meme.url); setDragAction({ target: "meme_img", type: "resize-left", id: meme.id, startX: e.clientX, initialStart: meme.startTime, initialDuration: meme.duration, initialTrimStart: meme.trimStart || 0, maxOriginalDuration: isVid ? (meme.maxDuration || meme.duration) : 999999 }); }} className="absolute left-0 top-0 bottom-0 w-3.5 hover:w-4 bg-pink-300/90 hover:bg-white cursor-ew-resize rounded-l-md z-30 transition-all opacity-0 group-hover:opacity-100"'

old_right_handle = 'onMouseDown={(e) => { e.stopPropagation(); setDragAction({ target: "meme_img", type: "resize-right", id: meme.id, startX: e.clientX, initialStart: meme.startTime, initialDuration: meme.duration, initialTrimStart: b.trimStart || 0, maxOriginalDuration: 999999 }); }} className="absolute right-0 top-0 bottom-0 w-2.5 hover:w-3.5 bg-pink-400/80 hover:bg-pink-300 cursor-ew-resize rounded-r-md transition-all opacity-0 group-hover:opacity-100"'

new_right_handle = 'onMouseDown={(e) => { e.stopPropagation(); const isVid = meme.type === "video" || /\\.(mp4|mov|webm|mkv)(\\?.*)?$/i.test(meme.url); setDragAction({ target: "meme_img", type: "resize-right", id: meme.id, startX: e.clientX, initialStart: meme.startTime, initialDuration: meme.duration, initialTrimStart: meme.trimStart || 0, maxOriginalDuration: isVid ? (meme.maxDuration || meme.duration) : 999999 }); }} className="absolute right-0 top-0 bottom-0 w-3.5 hover:w-4 bg-pink-300/90 hover:bg-white cursor-ew-resize rounded-r-md z-30 transition-all opacity-0 group-hover:opacity-100"'

code = code.replace(old_left_handle, new_left_handle).replace(old_right_handle, new_right_handle)

# Phòng trường hợp format khoảng trắng khác, thay thế triệt để mọi chỗ b.trimStart nằm trong meme_img
code = code.replace(
    'target: "meme_img", type: "resize-left", id: meme.id, startX: e.clientX, initialStart: meme.startTime, initialDuration: meme.duration, initialTrimStart: b.trimStart || 0',
    'target: "meme_img", type: "resize-left", id: meme.id, startX: e.clientX, initialStart: meme.startTime, initialDuration: meme.duration, initialTrimStart: meme.trimStart || 0'
).replace(
    'target: "meme_img", type: "resize-right", id: meme.id, startX: e.clientX, initialStart: meme.startTime, initialDuration: meme.duration, initialTrimStart: b.trimStart || 0',
    'target: "meme_img", type: "resize-right", id: meme.id, startX: e.clientX, initialStart: meme.startTime, initialDuration: meme.duration, initialTrimStart: meme.trimStart || 0'
)

# 2. Cải tiến logic kéo đầu trái (resize-left) và đầu phải (resize-right) của meme_img để vừa cắt đúng trimStart cho Video Meme, vừa thu ngắn/kéo dài mượt mà
old_meme_resize_logic = """            } else if (dragAction.type === "resize-right") {
              const maxAllowed = Math.max(0.3, dragAction.maxOriginalDuration - updatedTrim);
              updatedDur = Math.max(0.3, Math.min(maxAllowed, Number((dragAction.initialDuration + deltaSeconds).toFixed(2))));
            } else if (dragAction.type === "resize-left") {
              if (dragAction.maxOriginalDuration < 900000) {
                const { newStart, newTrim, newDur } = calcResizeLeft(
                  dragAction.initialStart,
                  dragAction.initialTrimStart,
                  dragAction.initialDuration,
                  dragAction.maxOriginalDuration,
                  deltaSeconds,
                  1.0
                );
                updatedStart = newStart;
                updatedTrim = newTrim;
                updatedDur = newDur;
              } else {
                const rawStart = dragAction.initialStart + deltaSeconds;
                const diff = rawStart - dragAction.initialStart;
                updatedStart = Math.max(0, Number(rawStart.toFixed(2)));
                updatedDur = Math.max(0.3, Number((dragAction.initialDuration - diff).toFixed(2)));
              }
            }"""

new_meme_resize_logic = """            } else if (dragAction.type === "resize-right") {
              const rawNewDur = Number((dragAction.initialDuration + deltaSeconds).toFixed(2));
              if (dragAction.maxOriginalDuration < 900000) {
                const maxAllowed = Math.max(0.2, dragAction.maxOriginalDuration - updatedTrim);
                updatedDur = Math.max(0.2, Math.min(maxAllowed, rawNewDur));
              } else {
                updatedDur = Math.max(0.2, rawNewDur);
              }
            } else if (dragAction.type === "resize-left") {
              const maxCut = Math.max(0, dragAction.initialDuration - 0.2);
              const clampedDelta = Math.max(-dragAction.initialStart, Math.min(maxCut, deltaSeconds));
              updatedStart = Math.max(0, Number((dragAction.initialStart + clampedDelta).toFixed(2)));
              updatedDur = Math.max(0.2, Number((dragAction.initialDuration - clampedDelta).toFixed(2)));
              updatedTrim = Math.max(0, Number((dragAction.initialTrimStart + clampedDelta).toFixed(2)));
            }"""

if old_meme_resize_logic in code:
    code = code.replace(old_meme_resize_logic, new_meme_resize_logic)

with open(p, "w", encoding="utf-8") as f:
    f.write(code)

print(">>> ĐÃ SỬA XONG KÉO THU NGẮN/CẮT 2 ĐẦU BLOCK MEME VIDEO & ẢNH (KHÔNG MẤT STATE TRANG WEB)!")
