import { useState, useCallback, useMemo } from "react";

/**
 * Audio viewport logic with React-safe auto-scroll.
 * No effects, no cascading renders, StrictMode safe.
 */
export function useAudioViewport({
  audioBuffer,
  playbackState,
}) {
  /* =======================
     BASE STATE (USER CONTROLLED)
  ======================= */

  const [zoomLevel, setZoomLevel] = useState(1);
  const [baseViewportStart, setBaseViewportStart] = useState(0);
  const [canvasWidth, setCanvasWidth] = useState(800);

  const viewportDuration = audioBuffer
    ? audioBuffer.duration / Math.max(zoomLevel, 1)
    : 0;

  /* =======================
     DERIVED AUTO-SCROLL VIEWPORT
  ======================= */

  const viewportStart = useMemo(() => {
    if (!audioBuffer || !playbackState.isPlaying) {
      return baseViewportStart;
    }

    const margin = viewportDuration * 0.1;
    const current = playbackState.currentTime;

    const needsScroll =
      current < baseViewportStart ||
      current > baseViewportStart + viewportDuration - margin;

    if (!needsScroll) return baseViewportStart;

    return Math.max(
      0,
      Math.min(
        current - viewportDuration / 2,
        audioBuffer.duration - viewportDuration
      )
    );
  }, [
    audioBuffer,
    playbackState.isPlaying,
    playbackState.currentTime,
    baseViewportStart,
    viewportDuration,
  ]);

  /* =======================
     ZOOM CONTROLS
  ======================= */

  const handleZoomIn = useCallback(() => {
    if (!audioBuffer) return;

    setZoomLevel((prev) => {
      const next = Math.min(prev * 2, 16);
      const newDuration = audioBuffer.duration / next;
      const center = playbackState.currentTime;

      setBaseViewportStart(
        Math.max(
          0,
          Math.min(
            center - newDuration / 2,
            audioBuffer.duration - newDuration
          )
        )
      );

      return next;
    });
  }, [audioBuffer, playbackState.currentTime]);

  const handleZoomOut = useCallback(() => {
    if (!audioBuffer) return;

    setZoomLevel((prev) => {
      const next = Math.max(prev / 2, 1);
      const newDuration = audioBuffer.duration / next;
      const center = playbackState.currentTime;

      setBaseViewportStart(
        Math.max(
          0,
          Math.min(
            center - newDuration / 2,
            audioBuffer.duration - newDuration
          )
        )
      );

      return next;
    });
  }, [audioBuffer, playbackState.currentTime]);

  /* =======================
     PUBLIC API
  ======================= */

  return {
    zoomLevel,
    viewportStart,              // ✅ derived (auto-scroll aware)
    setViewportStart: setBaseViewportStart, // ✅ manual pan
    setZoomLevel,
    canvasWidth,
    setCanvasWidth,
    viewportDuration,
    handleZoomIn,
    handleZoomOut,
  };
}
