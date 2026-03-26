import React from "react";
import {
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Download,
  Save,
  Volume2,
  VolumeX,
  Upload,
  Edit2
} from "lucide-react";
import { formatTime } from "./utils";

/**
 * TransportControls Component
 *
 * Renders the top toolbar with transport controls and file information.
 */
export function TransportControls({
  fileName,
  totalDuration,
  isPlaying,
  isMuted,
  onUpload,
  onToggleMute,
  onSkipBack,
  onTogglePlayPause,
  onSkipForward,
  onDownload,
  onSave,
  onRename
}) {
  const handleRenameClick = () => {
    if (!fileName) return;
    
    // Show input prompt pop up
    const newName = window.prompt("Rename Audio File:", fileName);
    
    // If user didn't cancel and entered a valid name
    if (newName && newName.trim() !== "") {
      onRename(newName.trim());
    }
  };
  return (
    <div className="w-full flex flex-col gap-3 mb-6">
      {/* File Info - Top Left */}
      <div className="flex flex-col items-start px-2">
        <div className="flex items-center gap-2">
          <h3 
            className="text-white font-medium text-lg truncate max-w-md" 
            title={fileName || "No Audio Loaded"}
          >
            {fileName || "No Audio Loaded"}
          </h3>
          
          {/* Edit Button: Only shows if file is loaded */}
          {fileName && (
            <button 
              onClick={handleRenameClick}
              className="text-gray-400 hover:text-white transition-colors p-1 rounded-full hover:bg-gray-700"
              title="Rename file"
            >
              <Edit2 size={14} />
            </button>
          )}
        </div>
        <span className="text-gray-400 text-sm font-mono">
          {totalDuration > 0 ? formatTime(totalDuration) : "00:00"}
        </span>
      </div>

      {/* Controls Row */}
      <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4">
        {/* Upload */}
        <button
          className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-linear-to-br from-teal-400 to-green-500 hover:from-teal-500 hover:to-green-600 flex items-center justify-center shadow-lg transition-transform active:scale-95"
          onClick={onUpload}
          title="Upload audio"
        >
          <Upload size={20} className="text-white" />
        </button>

        {/* Mute */}
        <button
          className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-linear-to-br from-teal-400 to-green-500 hover:from-teal-500 hover:to-green-600 flex items-center justify-center shadow-lg transition-transform active:scale-95"
          onClick={onToggleMute}
          title={isMuted ? "Unmute audio" : "Mute audio"}
        >
          {isMuted ? (
            <VolumeX size={20} className="text-white" />
          ) : (
            <Volume2 size={20} className="text-white" />
          )}
        </button>

        {/* Skip Back */}
        <button
          className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center shadow-lg transition-transform ${
            isPlaying
              ? "bg-gray-600 text-gray-400 cursor-not-allowed"
              : "bg-linear-to-br from-teal-400 to-green-500 hover:from-teal-500 hover:to-green-600 active:scale-95 text-white"
          }`}
          onClick={() => !isPlaying && onSkipBack()}
          disabled={isPlaying}
          title="Skip Back"
        >
          <SkipBack size={20} />
        </button>

        {/* Play / Pause */}
        <button
          className="w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center shadow-lg transition-transform bg-linear-to-br from-teal-400 to-green-500 hover:from-teal-500 hover:to-green-600 active:scale-95"
          onClick={onTogglePlayPause}
          title={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? (
            <Pause size={28} className="text-white" />
          ) : (
            <Play size={28} className="text-white ml-1" />
          )}
        </button>

        {/* Skip Forward */}
        <button
          className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center shadow-lg transition-transform ${
            isPlaying
              ? "bg-gray-600 text-gray-400 cursor-not-allowed"
              : "bg-linear-to-br from-teal-400 to-green-500 hover:from-teal-500 hover:to-green-600 active:scale-95 text-white"
          }`}
          onClick={() => !isPlaying && onSkipForward()}
          disabled={isPlaying}
          title="Skip Forward"
        >
          <SkipForward size={20} />
        </button>

        {/* Download */}
        <button
          className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-linear-to-br from-teal-400 to-green-500 hover:from-teal-500 hover:to-green-600 flex items-center justify-center shadow-lg transition-transform active:scale-95"
          onClick={onDownload}
          title="Save / Download WAV"
        >
          <Download size={20} className="text-white" />
        </button>

        {/* Save */}
        <button
          className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-linear-to-br from-teal-400 to-green-500 hover:from-teal-500 hover:to-green-600 flex items-center justify-center shadow-lg transition-transform active:scale-95"
          onClick={onSave}
          title="Save audio state"
        >
          <Save size={20} className="text-white" />
        </button>
      </div>
    </div>
  );
}