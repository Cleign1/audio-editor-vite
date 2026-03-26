import React, { useEffect, useRef } from "react";
import { useRecordingContext } from "../context/RecordingContext";

/**
 * WaveformCanvas - Professional Recording Visualization
 *
 * Audacity-style incremental waveform rendering with stable history,
 * fixed zoom, and auto-scroll.
 */
export function WaveformCanvas({
  width,
  height,
  className = "",
  channelIndex,
  label,
  dimmed = false,
}) {
  const canvasRef = useRef(null);

  // Recording context
  const { peaksByChannelRef, channelCount, getElapsedSeconds } =
    useRecordingContext();

  // Incremental rendering state
  const lastRenderedIndexRef = useRef(0);
  const viewOffsetRef = useRef(0);

  /* ===== VISUAL CONFIG ===== */

  const PIXELS_PER_SECOND = 50; // fixed zoom (documented, not dynamically used)
  const BAR_WIDTH = 1;

  const WAVEFORM_COLOR = dimmed ? "#2d4d3d" : "#00ff88";
  const CENTER_LINE_COLOR = "#2f2f35";
  const BACKGROUND_COLOR = "#0d0d10";
  const GRID_COLOR = "#1f1f26";
  const SEPARATOR_COLOR = "#1b1b20";
  const GRID_SPACING = 32;

  /**
   * Draw static background, grid, centerlines, and labels
   */
  const drawBaseLayer = (
    ctx,
    canvasWidth,
    canvasHeight,
    lanes,
    overlayLabel,
    isDimmed
  ) => {
    // Background
    ctx.fillStyle = BACKGROUND_COLOR;
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // Grid
    ctx.strokeStyle = GRID_COLOR;
    ctx.lineWidth = 1;
    ctx.beginPath();

    for (let x = 0; x <= canvasWidth; x += GRID_SPACING) {
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, canvasHeight);
    }
    for (let y = 0; y <= canvasHeight; y += GRID_SPACING) {
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(canvasWidth, y + 0.5);
    }
    ctx.stroke();

    if (lanes === 1) {
      // Mono
      ctx.strokeStyle = CENTER_LINE_COLOR;
      ctx.beginPath();
      ctx.moveTo(0, canvasHeight / 2);
      ctx.lineTo(canvasWidth, canvasHeight / 2);
      ctx.stroke();
    } else {
      // Stereo / multi-lane
      const laneHeight = canvasHeight / lanes;

      for (let ch = 0; ch < lanes; ch++) {
        const centerY = ch * laneHeight + laneHeight / 2;
        ctx.strokeStyle = CENTER_LINE_COLOR;
        ctx.beginPath();
        ctx.moveTo(0, centerY);
        ctx.lineTo(canvasWidth, centerY);
        ctx.stroke();
      }

      // Separators
      ctx.strokeStyle = SEPARATOR_COLOR;
      ctx.beginPath();
      for (let ch = 1; ch < lanes; ch++) {
        const y = ch * laneHeight;
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(canvasWidth, y + 0.5);
      }
      ctx.stroke();

      // Channel labels
      ctx.fillStyle = "#7dd3a7";
      ctx.font = "10px sans-serif";
      ctx.textAlign = "left";

      ctx.textBaseline = "top";
      ctx.fillText("L", 6, 4);

      if (lanes >= 2) {
        ctx.textBaseline = "bottom";
        ctx.fillText("R", 6, canvasHeight - 4);
      }
    }

    // Overlay label (single-channel view)
    if (overlayLabel) {
      ctx.fillStyle = isDimmed ? "#4a5568" : "#7dd3a7";
      ctx.font = "11px sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText(overlayLabel, 6, 6);
    }
  };

  /* ===== INITIAL BASE LAYER ===== */

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const lanes =
      channelIndex !== undefined ? 1 : Math.max(1, channelCount || 1);

    const overlayLabel =
      channelIndex !== undefined ? label : undefined;

    drawBaseLayer(
      ctx,
      canvas.width,
      canvas.height,
      lanes,
      overlayLabel,
      dimmed
    );
  }, [width, height, channelCount, channelIndex, label, dimmed]);

  /* ===== INCREMENTAL RENDER LOOP ===== */

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let rafId = 0;

    const render = () => {
      const peaksByChannel = peaksByChannelRef.current;

      const effectiveChannelIndex =
        channelIndex !== undefined
          ? channelCount === 1
            ? 0
            : channelIndex
          : 0;

      const primaryPeaks =
        peaksByChannel[effectiveChannelIndex] || [];

      const canvasWidth = canvas.width;
      const canvasHeight = canvas.height;

      const lanes =
        channelIndex !== undefined ? 1 : Math.max(1, channelCount || 1);
      const laneHeight = canvasHeight / lanes;

      const pixelsPerPeak = BAR_WIDTH;

      // Auto-scroll
      const waveformWorldX = primaryPeaks.length * pixelsPerPeak;
      const waveformCanvasX =
        waveformWorldX - viewOffsetRef.current;

      if (waveformCanvasX >= canvasWidth - 20) {
        const targetCanvasX = canvasWidth * 0.8;
        viewOffsetRef.current =
          waveformWorldX - targetCanvasX;

        ctx.fillStyle = BACKGROUND_COLOR;
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);

        const overlayLabel =
          channelIndex !== undefined ? label : undefined;

        drawBaseLayer(
          ctx,
          canvasWidth,
          canvasHeight,
          lanes,
          overlayLabel,
          dimmed
        );

        lastRenderedIndexRef.current = 0;
      }

      // Draw new peaks
      while (
        lastRenderedIndexRef.current < primaryPeaks.length
      ) {
        const peakIndex = lastRenderedIndexRef.current;
        const worldX = peakIndex * pixelsPerPeak;
        const canvasX = worldX - viewOffsetRef.current;

        if (canvasX >= 0 && canvasX < canvasWidth) {
          if (channelIndex !== undefined) {
            const peak =
              peaksByChannel[effectiveChannelIndex]?.[
                peakIndex
              ];
            if (peak) {
              const { min, max } = peak;
              const centerY = canvasHeight / 2;
              const minY =
                centerY - min * (canvasHeight / 2);
              const maxY =
                centerY - max * (canvasHeight / 2);
              const topY = Math.min(minY, maxY);
              const barHeight = Math.max(
                1,
                Math.abs(maxY - minY)
              );

              ctx.fillStyle = WAVEFORM_COLOR;
              ctx.fillRect(
                canvasX,
                topY,
                BAR_WIDTH,
                barHeight
              );
            }
          } else {
            for (let ch = 0; ch < lanes; ch++) {
              const peak =
                peaksByChannel[ch]?.[peakIndex];
              if (!peak) continue;

              const { min, max } = peak;
              const yOffset = ch * laneHeight;
              const centerY =
                yOffset + laneHeight / 2;

              const minY =
                centerY - min * (laneHeight / 2);
              const maxY =
                centerY - max * (laneHeight / 2);

              const topY = Math.min(minY, maxY);
              const barHeight = Math.max(
                1,
                Math.abs(maxY - minY)
              );

              ctx.fillStyle = WAVEFORM_COLOR;
              ctx.fillRect(
                canvasX,
                topY,
                BAR_WIDTH,
                barHeight
              );
            }
          }
        }

        lastRenderedIndexRef.current++;
      }

      rafId = requestAnimationFrame(render);
    };

    rafId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafId);
  }, []);

  /* ===== ELAPSED TIME POLL ===== */

  useEffect(() => {
    const id = setInterval(() => {
      getElapsedSeconds();
    }, 500);

    return () => clearInterval(id);
  }, [getElapsedSeconds]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className={className}
      style={{ display: "block" }}
    />
  );
}
