import { useState, useCallback } from "react";

/**
 * Custom hook for handling mouse interactions with the waveform display.
 * Manages selection creation, seeking, and channel-specific interactions.
 *
 * @param {Object} params
 * @param {AudioBuffer|null} params.audioBuffer
 * @param {number} params.viewportStart
 * @param {number} params.viewportDuration
 * @param {{ left: boolean, right: boolean }} params.channelVisibility
 * @param {Function} params.seekWithoutResume
 * @param {Function} params.setSelection
 */
export function useWaveformInteraction({
  audioBuffer,
  viewportStart,
  viewportDuration,
  channelVisibility,
  seekWithoutResume,
  setSelection,
}) {
  // ===== INTERACTION STATE =====

  // Track whether user is actively dragging
  const [isDragging, setIsDragging] = useState(false);

  // Store drag start time (seconds)
  const [dragStart, setDragStart] = useState(null);

  /**
   * Convert mouse X position on canvas to audio time
   */
  const getPointerTime = useCallback(
    (e) => {
      if (!audioBuffer) return 0;

      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const relX = x / rect.width;

      const time = viewportStart + relX * viewportDuration;

      return Math.max(0, Math.min(time, audioBuffer.duration));
    },
    [audioBuffer, viewportStart, viewportDuration]
  );

  /**
   * Mouse down: start selection or prepare for seek
   */
  const handleMouseDown = useCallback(
    (e, channel) => {
      if (!audioBuffer) return;
      if (!channel || !channelVisibility[channel]) return;

      const time = getPointerTime(e);
      setDragStart(time);
    },
    [audioBuffer, channelVisibility, getPointerTime]
  );

  /**
   * Mouse move: update selection while dragging
   */
  const handleMouseMove = useCallback(
    (e, channel) => {
      if (!audioBuffer || dragStart === null) return;
      if (!channel || !channelVisibility[channel]) return;

      const time = getPointerTime(e);

      if (!isDragging) {
        // Drag threshold: 1% of viewport
        if (Math.abs(time - dragStart) > viewportDuration * 0.01) {
          setIsDragging(true);
        }
      }

      if (isDragging) {
        const startTime = Math.min(dragStart, time);
        const endTime = Math.max(dragStart, time);

        let targetChannel;

        if (channelVisibility.left && channelVisibility.right) {
          targetChannel = undefined; // stereo
        } else {
          targetChannel = channel === "left" ? 0 : 1;
        }

        setSelection({
          startTime,
          endTime,
          channel: targetChannel,
        });
      }
    },
    [
      audioBuffer,
      dragStart,
      isDragging,
      channelVisibility,
      viewportDuration,
      getPointerTime,
      setSelection,
    ]
  );

  /**
   * Mouse up: seek (click) or finalize selection (drag)
   */
  const handleMouseUp = useCallback(
    (e, channel) => {
      if (!audioBuffer) return;
      if (channel && !channelVisibility[channel]) return;

      if (!isDragging && dragStart !== null) {
        seekWithoutResume(dragStart);
      }

      setIsDragging(false);
      setDragStart(null);
    },
    [audioBuffer, isDragging, dragStart, seekWithoutResume, channelVisibility]
  );

  return {
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
  };
}
