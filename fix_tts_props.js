const fs = require("fs");
const path = require("path");

const pagePath = path.join(__dirname, "frontend", "src", "app", "page.tsx");
if (fs.existsSync(pagePath)) {
  let content = fs.readFileSync(pagePath, "utf8");

  const cleanVoiceTabJSX = `<VoiceTab
                standaloneText={standaloneText}
                setStandaloneText={setStandaloneText}
                standaloneVoice={standaloneVoice}
                setStandaloneVoice={setStandaloneVoice}
                standaloneSpeed={standaloneSpeed}
                setStandaloneSpeed={setStandaloneSpeed}
                voices={voices}
                isScanningOcr={isScanningOcr}
                isGeneratingTts={isGeneratingTts}
                latestAudio={latestAudio}
                handleOcrToStandaloneText={handleOcrToStandaloneText}
                handleGenerateStandaloneVoice={handleGenerateStandaloneVoice}
                handleAddLatestVoiceToTimeline={handleAddLatestVoiceToTimeline}
                onAddManualVoiceToTimeline={handleAddManualVoiceToTimeline}
                onAddManualVoice={handleAddManualVoiceToTimeline}
                currentTopic={currentTopic}
                topics={topics.length > 0 ? topics : ["general"]}
              />`;

  content = content.replace(/<VoiceTab[\s\S]*?\/>/, cleanVoiceTabJSX);
  fs.writeFileSync(pagePath, content, "utf8");
  console.log(">>> Da dong bo toan bo props cho VoiceTab trong page.tsx!");
}
