// components/audio-editor/WaveformDisplay.jsx
import React, { useRef, useEffect } from "react";
import { WaveformCanvas } from "../WaveformCanvas";
import { AudioChannel } from "../AudioChannel";
import { generateRulerTicks } from "./utils";

export function WaveformDisplay({
  audioBuffer,
  viewportStart,
  setViewportStart,
  viewportDuration,
  selection,
  currentTime,
  canvasWidth,
  setCanvasWidth,
  channelVisibility,
  onToggleChannel,
  recordingState,
  channelCount,
  onMouseDown,
  onMouseMove,
  onMouseUp,
}) {
  const waveformContainerRef = useRef(null);
  const scrollContainerRef = useRef(null);

  // Refs for scroll optimization
  const isUserScrolling = useRef(false);
  const scrollTimeoutRef = useRef(null);
  const rafRef = useRef(null);

  const isStereo = audioBuffer ? audioBuffer.numberOfChannels > 1 : false;
  const isRecording = recordingState.isRecording;

  // --- 1. CALCULATE VIRTUAL DIMENSIONS ---
  const totalDuration = audioBuffer?.duration || 0;
  
  // How wide the waveform would be in pixels if fully rendered
  const virtualWidth =
    totalDuration > 0 && viewportDuration > 0
      ? (canvasWidth / viewportDuration) * totalDuration
      : canvasWidth;

  const showScrollbar = !isRecording && totalDuration > viewportDuration;

  // --- 2. SYNC SCROLLBAR POSITION (State -> DOM) ---
  // When viewportStart changes (playback or zoom), move the scrollbar thumb.
  useEffect(() => {
    const el = scrollContainerRef.current;
    
    // Don't fight the user if they are currently dragging/swiping
    if (isUserScrolling.current || !el || !showScrollbar) return;

    const scrollRatio = viewportStart / totalDuration;
    const targetScrollLeft = scrollRatio * virtualWidth;

    // Threshold of 1px prevents micro-jitter loops
    if (Math.abs(el.scrollLeft - targetScrollLeft) > 1) {
      el.scrollLeft = targetScrollLeft;
    }
  }, [viewportStart, totalDuration, virtualWidth, showScrollbar]);

  // --- 3. HANDLE TRACKPAD / MOUSE WHEEL (DOM -> State) ---
  const handleWheel = (e) => {
    if (isRecording || !showScrollbar) return;

    // Stop browser back/forward swipe gestures
    e.preventDefault();

    // 1. Detect scroll amount
    // Trackpads usually send deltaX. 
    // Shift + MouseWheel sends deltaY as deltaX in many browsers.
    // We fall back to deltaY if deltaX is 0 to allow vertical wheel scrolling.
    let pixelDelta = e.deltaX;
    if (pixelDelta === 0) pixelDelta = e.deltaY;

    if (pixelDelta === 0) return;

    // 2. Convert Pixels to Seconds
    // speedFactor: Adjust this if scrolling feels too fast/slow (1.0 is 1:1 pixel mapping)
    const speedFactor = 1.0; 
    const pixelsPerSecond = canvasWidth / viewportDuration;
    const secondsDelta = (pixelDelta / pixelsPerSecond) * speedFactor;

    // 3. Apply with clamping
    const newStart = Math.min(
      Math.max(0, viewportStart + secondsDelta),
      totalDuration - viewportDuration
    );

    // 4. Mark as user interaction so useEffect doesn't fight us
    isUserScrolling.current = true;
    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    scrollTimeoutRef.current = setTimeout(() => {
      isUserScrolling.current = false;
    }, 150);

    // 5. Update State
    setViewportStart(newStart);
  };

  // --- 4. HANDLE SCROLLBAR DRAG (DOM -> State) ---
  const handleScrollbarScroll = (e) => {
    if (!showScrollbar) return;

    isUserScrolling.current = true;
    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    scrollTimeoutRef.current = setTimeout(() => {
      isUserScrolling.current = false;
    }, 150);

    const newScrollLeft = e.target.scrollLeft;

    // Throttle high-frequency scroll events
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const newTime = (newScrollLeft / virtualWidth) * totalDuration;
      setViewportStart(
        Math.max(0, Math.min(newTime, totalDuration - viewportDuration))
      );
    });
  };

  // --- RULER & RESIZE LOGIC ---
  const rulerTicks = generateRulerTicks(
    audioBuffer,
    viewportStart,
    viewportDuration,
    canvasWidth
  );

  useEffect(() => {
    const el = waveformContainerRef.current;
    if (!el) return;
    const update = () => {
      const width = el.clientWidth;
      if (width > 0) setCanvasWidth(width);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [setCanvasWidth]);

  return (
    <div className="flex flex-col w-full space-y-2">
      {/* MAIN WAVEFORM AREA */}
      <div
        ref={waveformContainerRef}
        // ATTACH WHEEL HANDLER HERE
        onWheel={handleWheel}
        className="relative group w-full min-w-full shrink-0 space-y-2 select-none outline-none"
      >
        {isRecording ? (
          /* RECORDING VIEW */
          channelCount > 1 ? (
            <>
              <WaveformCanvas
                width={canvasWidth}
                height={110}
                className="w-full rounded bg-gray-900 border border-gray-700"
                channelIndex={0}
                label="Left"
                dimmed={!channelVisibility.left}
              />
              <WaveformCanvas
                width={canvasWidth}
                height={110}
                className="w-full rounded bg-gray-900 border border-gray-700"
                channelIndex={1}
                label="Right"
                dimmed={!channelVisibility.right}
              />
            </>
          ) : (
            <WaveformCanvas
              width={canvasWidth}
              height={200}
              className="w-full rounded bg-gray-900 border border-gray-700"
              channelIndex={0}
              label="Mono"
            />
          )
        ) : (
          /* EDITOR / PLAYBACK VIEW */
          <>
            <AudioChannel
              audioBuffer={audioBuffer}
              channelIndex={0}
              viewportStart={viewportStart}
              viewportDuration={viewportDuration}
              selection={selection}
              currentTime={currentTime}
              isChannelEnabled={channelVisibility.left}
              isRecording={isRecording}
              canvasWidth={canvasWidth}
              canvasHeight={isStereo ? 110 : 200}
              label={isStereo ? "L" : "M"}
              onToggleChannel={isStereo ? () => onToggleChannel("left") : () => {}}
              onMouseDown={(e) => onMouseDown(e, "left")}
              onMouseMove={(e) => onMouseMove(e, "left")}
              onMouseUp={(e) => onMouseUp(e, "left")}
              onMouseLeave={(e) => onMouseUp(e, "left")}
            />

            {isStereo && (
              <AudioChannel
                audioBuffer={audioBuffer}
                channelIndex={1}
                viewportStart={viewportStart}
                viewportDuration={viewportDuration}
                selection={selection}
                currentTime={currentTime}
                isChannelEnabled={channelVisibility.right}
                isRecording={isRecording}
                canvasWidth={canvasWidth}
                canvasHeight={110}
                label="R"
                onToggleChannel={() => onToggleChannel("right")}
                onMouseDown={(e) => onMouseDown(e, "right")}
                onMouseMove={(e) => onMouseMove(e, "right")}
                onMouseUp={(e) => onMouseUp(e, "right")}
                onMouseLeave={(e) => onMouseUp(e, "right")}
              />
            )}
          </>
        )}

        {/* Timeline Ruler */}
        {audioBuffer && !isRecording && (
          <div className="flex items-center gap-3 w-full">
            <div className="bg-gray-800 border-t border-gray-700 relative h-7 overflow-hidden w-full flex-1">
              {rulerTicks.map((tick) => (
                <div
                  key={tick.time}
                  className="absolute top-0 h-full border-l border-gray-600"
                  style={{ left: `${tick.pixelOffset}px` }}
                >
                  <span className="absolute top-1 left-1 text-[10px] text-gray-400 font-mono pointer-events-none select-none">
                    {tick.label}
                  </span>
                </div>
              ))}
            </div>
            <div className="w-9 shrink-0" />
          </div>
        )}
      </div>

      {/* --- SCROLLBAR --- */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScrollbarScroll}
        className={`w-full h-4 bg-gray-900 border-t border-gray-800 overflow-x-auto overflow-y-hidden custom-scrollbar ${
          showScrollbar ? "" : "invisible"
        }`}
      >
        <div
          style={{ width: `${virtualWidth}px` }}
          className="h-full relative"
        >
          <div 
            className="absolute h-full bg-gray-600 opacity-30 pointer-events-none rounded-sm"
            style={{
              left: `${(viewportStart / totalDuration) * virtualWidth}px`,
              width: `${canvasWidth}px` 
            }}
          />
        </div>
      </div>
    </div>
  );
}