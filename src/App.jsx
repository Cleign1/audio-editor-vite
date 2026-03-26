import { AudioEditorWidget } from "../components/AudioEditorWidget";

export default function AudioEditorPage() {
  const handleSave = (audioBlob) => {
    const url = URL.createObjectURL(audioBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "edited-audio.wav";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    // Changed to full screen width/height, removed padding and max-width constraints
    <main className="h-screen w-screen overflow-hidden bg-gray-800">
      <AudioEditorWidget initialVolume={1.0} onSave={handleSave} />
    </main>
  );
}