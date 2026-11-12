const fs = require("fs");
const path = require("path");

const ROOT = __dirname;

// =========================================================================
// 1. CẬP NHẬT page.tsx: Truyền đúng startTime, duration, trimStart, speed của clip nền hiện tại
// =========================================================================
const pagePath = path.join(ROOT, "frontend", "src", "app", "page.tsx");
if (fs.existsSync(pagePath)) {
  let p = fs.readFileSync(pagePath, "utf8");

  const bgPropsInjection = `<PreviewPlayer
              hasBgClipOnTimeline={!!currentActiveBgClip}
              bgStartTime={currentActiveBgClip ? currentActiveBgClip.startTime : 0}
              bgDuration={currentActiveBgClip ? currentActiveBgClip.duration : 0}
              bgTrimStart={currentActiveBgClip ? currentActiveBgClip.trimStart : 0}
              bgSpeed={currentActiveBgClip ? (currentActiveBgClip.speed || 1.0) : 1.0}`;

  p = p.replace(
    /<PreviewPlayer\s*hasBgClipOnTimeline=\{!!currentActiveBgClip\}/,
    bgPropsInjection
  );

  fs.writeFileSync(pagePath, p, "utf8");
  console.log(">>> [1/2] Da cap nhat page.tsx (Truyen dung thoi luong clip nen thuc te)!");
}

// =========================================================================
// 2. CẬP NHẬT PreviewPlayer.tsx: Đồng bộ thời gian mượt mà theo speed & không làm đen màn
// =========================================================================
const previewPath = path.join(ROOT, "frontend", "src", "components", "PreviewPlayer.tsx");
if (fs.existsSync(previewPath)) {
  let pv = fs.readFileSync(previewPath, "utf8");

  // Thêm prop bgSpeed vào destructure
  if (!pv.includes("bgSpeed = 1.0")) {
    pv = pv.replace(
      "bgTrimStart = 0,",
      "bgTrimStart = 0,\n  bgSpeed = 1.0,"
    );
  }

  // Nâng cấp useEffect đồng bộ video mượt mà, tính cả speed và tự loop nếu video gốc ngắn hơn duration kéo dài
  const oldEffectRegex = /useEffect\(\(\)\s*=>\s*\{[\s\S]*?\},\s*\[currentTime,\s*isPlaying,\s*isVideo,\s*isInsideBgVideo,\s*selectedBg,\s*bgStartTime,\s*bgDuration,\s*bgTrimStart\]\);/;
  
  const newEffectCode = `useEffect(() => {
    const video = videoRef.current;
    if (!video || !isVideo) return;

    if (isInsideBgVideo && selectedBg) {
      const elapsed = Math.max(0, currentTime - bgStartTime) * (bgSpeed || 1.0);
      const rawTarget = bgTrimStart + elapsed;
      const vidDur = video.duration && !isNaN(video.duration) && video.duration > 0 ? video.duration : 999999;
      const targetVideoTime = rawTarget % vidDur;

      if (video.playbackRate !== (bgSpeed || 1.0)) {
        video.playbackRate = bgSpeed || 1.0;
      }

      const timeDiff = Math.abs(video.currentTime - targetVideoTime);
      if (!isPlaying || timeDiff > 0.6) {
        if (!video.seeking) {
          video.currentTime = targetVideoTime;
        }
      }
      if (isPlaying) {
        if (video.paused && !video.seeking) {
          video.play().catch(() => {});
        }
      } else {
        if (!video.paused) {
          video.pause();
        }
      }
    } else {
      if (!video.paused) {
        video.pause();
      }
    }
  }, [currentTime, isPlaying, isVideo, isInsideBgVideo, selectedBg, bgStartTime, bgDuration, bgTrimStart, bgSpeed]);`;

  if (oldEffectRegex.test(pv)) {
    pv = pv.replace(oldEffectRegex, newEffectCode);
  }

  fs.writeFileSync(previewPath, pv, "utf8");
  console.log(">>> [2/2] Da cap nhat PreviewPlayer.tsx (Phat xuyen suot toan bo thoi luong clip nen)!");
}
