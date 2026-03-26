import React from "react";

/**
 * Formats time in seconds to MM:SS.T format for display.
 *
 * @param {number} seconds
 * @returns {string}
 *
 * @example
 * formatTime(83.456) // "1:23.4"
 */
const formatTime = (seconds) => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 10);

  return `${mins}:${secs.toString().padStart(2, "0")}.${ms}`;
};

/**
 * AudioTimeline Component
 *
 * Renders a timeline ruler showing time markers for the current viewport.
 */
export function AudioTimeline({
  duration,
  viewportStart,
  viewportDuration,
  canvasWidth,
  className = "",
}) {
  return (
    <div
      className={`relative bg-gray-800 border-t border-gray-700 select-none ${className}`}
      style={{ width: `${canvasWidth}px`, height: "48px" }}
    >
      {/* Time markers */}
      <div className="flex justify-between items-center mt-1 px-1 text-xs text-gray-400 font-mono">
        {/* Start */}
        <span>{formatTime(viewportStart)}</span>

        {/* Middle */}
        <span>{formatTime(viewportStart + viewportDuration / 2)}</span>

        {/* End (clamped to duration) */}
        <span>
          {formatTime(Math.min(duration, viewportStart + viewportDuration))}
        </span>
      </div>

      {/* Baseline */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gray-700" />
    </div>
  );
}
