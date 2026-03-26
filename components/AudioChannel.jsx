import React, { useRef, useEffect } from "react";
import { drawWaveformOnCanvas } from "./audio-editor/utils";

/**
 * AudioChannel Component
 *
 * Renders a single audio channel with its waveform visualization and toggle button.
 * Handles canvas rendering, mouse interactions, and channel enable/disable functionality.
 */
export function AudioChannel({
  audioBuffer,
  channelIndex,
  viewportStart,
  viewportDuration,
  selection,
  currentTime,
  isChannelEnabled,
  isRecording,
  canvasWidth,
  canvasHeight,
  label,
  onToggleChannel,
  onMouseDown,
  onMouseMove,
  onMouseUp,
  onMouseLeave,
}) {
  const canvasRef = useRef(null);
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;

  /**
   * Canvas Rendering Effect
   *
   * Redraws the waveform whenever any rendering dependency changes.
   */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    drawWaveformOnCanvas(
      canvas,
      audioBuffer,
      viewportStart,
      viewportDuration,
      selection,
      currentTime,
      channelIndex,
      isChannelEnabled,
      isRecording
    );
  }, [
    audioBuffer,
    viewportStart,
    viewportDuration,
    selection,
    currentTime,
    channelIndex,
    isChannelEnabled,
    isRecording,
    canvasWidth, // Re-render if size changes
    canvasHeight,
    dpr, // Re-render if moved to different screen density
  ]);

  return (
    <div className="flex items-center gap-3">
      {/* Waveform Canvas */}
      <canvas
        ref={canvasRef}
        width={canvasWidth * dpr}
        height={canvasHeight * dpr}
        style={{
           height: `${canvasHeight}px`
        }}
        className="flex-1 cursor-crosshair rounded bg-gray-900 border border-gray-700 block touch-none overflow-visible w-full"
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseLeave}
      />

      {/* Channel Toggle Button */}
      <button
        onClick={onToggleChannel}
        className={`
          w-9 h-9 shrink-0 rounded-md font-bold flex items-center justify-center
          transition-all duration-200 z-20
          ${
            isChannelEnabled
              ? "bg-green-600 text-white shadow-md"
              : "bg-gray-700 text-gray-400 hover:bg-gray-600"
          }
        `}
      >
        {label}
      </button>
    </div>
  );
}
