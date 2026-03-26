/**
 * Formats time in seconds to MM:SS.T format.
 *
 * @param {number} seconds
 * @returns {string}
 */
export function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 10);
  return `${mins}:${secs.toString().padStart(2, "0")}.${ms}`;
}

/**
 * Generates ruler tick marks for the timeline.
 *
 * @param {AudioBuffer|null} audioBuffer
 * @param {number} viewportStart
 * @param {number} viewportDuration
 * @param {number} canvasWidth
 * @returns {Array<{ time:number, pixelOffset:number, label:string }>}
 */
export function generateRulerTicks(
  audioBuffer,
  viewportStart,
  viewportDuration,
  canvasWidth
) {
  if (!audioBuffer || viewportDuration === 0) return [];

  const pixelsPerSecond = canvasWidth / viewportDuration;
  const minPxBetweenTicks = 100;
  const rawStep = minPxBetweenTicks / pixelsPerSecond;

  const niceSteps = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];
  const step = niceSteps.find((s) => s >= rawStep) || rawStep;

  const ticks = [];
  const startTick = Math.floor(viewportStart / step) * step;
  const viewEnd = Math.min(
    viewportStart + viewportDuration,
    audioBuffer.duration
  );

  for (let t = startTick; t <= viewEnd; t += step) {
    if (t < viewportStart) continue;
    if (t > audioBuffer.duration + 0.0001) break;

    const pixelOffset = (t - viewportStart) * pixelsPerSecond;

    if (pixelOffset >= -1 && pixelOffset <= canvasWidth + 2) {
      const label = t % 1 === 0 ? t.toString() : t.toFixed(1);
      ticks.push({ time: t, pixelOffset, label });
    }
  }

  return ticks;
}

/**
 * Draws waveform visualization on canvas.
 * UPDATED: Uses smooth paths and gradient-based played/unplayed coloring.
 */
export function drawWaveformOnCanvas(
  canvas,
  audioBuffer,
  viewportStart,
  viewportDuration,
  selection,
  currentTime,
  channelIndex,
  isChannelEnabled = true,
  isRecording = false
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const width = canvas.width;
  const height = canvas.height;

  // 1. Clear Background (Dark)
  ctx.fillStyle = "#0b0f14"; // Deep dark background
  ctx.fillRect(0, 0, width, height);

  // Placeholder text
  if (isRecording || !audioBuffer) {
    ctx.fillStyle = "#6b7280";
    ctx.font = "14px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Waiting for audio...", width / 2, height / 2);
    return;
  }

  const sampleRate = audioBuffer.sampleRate;
  const safeDuration = Math.max(viewportDuration, 0.0001);

  // Calculate X coordinates for selection bounds ONCE
  let selStartX = null;
  let selEndX = null;
  if (selection) {
    selStartX = ((selection.startTime - viewportStart) / safeDuration) * width;
    selEndX = ((selection.endTime - viewportStart) / safeDuration) * width;

    // Optional: Draw a subtle background tint for the selected area
    // Increased opacity slightly since we rely on this for selection visibility now
    ctx.fillStyle = "rgba(6, 182, 212, 0.15)"; // Cyan tint
    ctx.fillRect(selStartX, 0, selEndX - selStartX, height);
  }

  // 2. Draw Subtle Grid
  ctx.strokeStyle = "#1f2933";
  ctx.lineWidth = 1;
  ctx.beginPath();
  const gridSeconds = viewportDuration > 10 ? 1 : 0.5; // Adapt grid spacing depending on zoom
  const startTime = viewportStart - (viewportStart % gridSeconds);
  for (
    let t = startTime;
    t < viewportStart + viewportDuration;
    t += gridSeconds
  ) {
    const x = ((t - viewportStart) / viewportDuration) * width;
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
  }
  ctx.stroke();

  // --- WAVEFORM DRAWING PARAMETERS ---
  const channelCount = audioBuffer.numberOfChannels;
  const channelHeight =
    channelIndex !== undefined ? height : height / channelCount;
  const startSample = Math.floor(viewportStart * sampleRate);
  const endSample = Math.min(
    startSample + Math.floor(safeDuration * sampleRate),
    audioBuffer.length
  );
  // Calculate how many samples represent one horizontal pixel
  const samplesPerPixel = Math.max((endSample - startSample) / width, 0.5); // Ensure min step

  // THRESHOLD: If fewer than 5 samples per pixel, we are "Zoomed In"
  const isZoomedIn = samplesPerPixel < 5;

  const channelsToRender =
    channelIndex !== undefined
      ? [channelIndex]
      : Array.from({ length: channelCount }, (_, i) => i);

  // Playhead X Position for gradient split
  const headX = ((currentTime - viewportStart) / safeDuration) * width;
  const safeHeadX = Math.max(0, Math.min(width, headX));

  // 3. Main Loop: Render Waveforms using Paths
  for (const c of channelsToRender) {
    if (c >= channelCount) continue;

    const data = audioBuffer.getChannelData(c);
    const yOffset = channelIndex !== undefined ? 0 : c * channelHeight;
    const centerY = yOffset + channelHeight / 2;
    
    // Vertical Scaling: Use 90% of available half-height.
    // This creates headroom for loud signals (0dB), preventing visual clipping
    // and ensuring peaks are clearly defined rather than squashed against the edges.
    const verticalScale = 0.90;
    const half = (channelHeight / 2) * verticalScale;

    // Channel divider line
    if (channelCount > 1 && c > 0) {
      ctx.strokeStyle = "#2b2f33";
      ctx.beginPath();
      ctx.moveTo(0, yOffset);
      ctx.lineTo(width, yOffset);
      ctx.stroke();
    }

    // Apply opacity if channel is disabled
    ctx.globalAlpha = isChannelEnabled ? 1 : 0.3;

    // Create Gradient: Left = Played (Purple/Blue), Right = Unplayed (Green)
    const gradient = ctx.createLinearGradient(0, 0, width, 0);
    const stopPercent = Math.max(0, Math.min(1, safeHeadX / width));
    
    // Played Color (Muted Indigo/Blue)
    gradient.addColorStop(0, "#818CF8"); 
    gradient.addColorStop(stopPercent, "#818CF8");
    // Unplayed Color (Green)
    gradient.addColorStop(stopPercent, "#4ADE80"); 
    gradient.addColorStop(1, "#4ADE80");

    ctx.fillStyle = gradient;
    ctx.strokeStyle = gradient; // Used for stroked lines in zoom mode

    ctx.beginPath();
    
    // --- MODE A: ZOOMED OUT (Dense Data, Sharp Envelope) ---
    if (!isZoomedIn) {
        const step = 1; // High detail scan
        
        // 1. Top Envelope
        ctx.moveTo(0, centerY);

        for (let x = 0; x < width; x += step) {
          const idx = Math.floor(startSample + x * samplesPerPixel);
          const windowEnd = Math.floor(idx + samplesPerPixel * step);
          const scanEnd = Math.min(windowEnd, data.length);
          
          let max = 0;
          for (let i = idx; i < scanEnd; i++) {
            if (data[i] > max) max = data[i];
          }
          
          const y = centerY - max * half;
          ctx.lineTo(x, y);
        }

        // 2. Bottom Envelope (Reverse)
        for (let x = width; x >= 0; x -= step) {
            const idx = Math.floor(startSample + x * samplesPerPixel);
            const windowEnd = Math.floor(idx + samplesPerPixel * step);
            const scanEnd = Math.min(windowEnd, data.length);

            let min = 0;
            for (let i = idx; i < scanEnd; i++) {
               if (data[i] < min) min = data[i];
            }

            const y = centerY - min * half;
            ctx.lineTo(x, y);
        }
        
        ctx.closePath();
        ctx.fill();

    } 
    // --- MODE B: ZOOMED IN (Sparse Data, Smooth Curves) ---
    else {
        // In this mode, we draw the actual wave curve
        ctx.lineWidth = 3; 
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        
        // Strategy: Calculate points for every few pixels to get smoother curves
        // We will stroke a line through the points instead of filling a shape
        
        // Move to first point
        const firstIdx = Math.floor(startSample);
        const firstVal = data[firstIdx] || 0;
        const startY = centerY - firstVal * half;
        ctx.moveTo(0, startY);

        let prevX = 0;
        let prevY = startY;

        // Iterate pixel by pixel
        for (let x = 1; x <= width; x++) {
           const idx = Math.floor(startSample + x * samplesPerPixel);
           const val = data[idx] || 0;
           const y = centerY - val * half;
           
           // Simple smoothing: Quadratic Curve to midpoint
           // This makes it look "buttery" and analog
           const midX = (prevX + x) / 2;
           const midY = (prevY + y) / 2;
           
           ctx.quadraticCurveTo(prevX, prevY, midX, midY);
           
           prevX = x;
           prevY = y;
        }
        
        // Finish last segment
        ctx.lineTo(prevX, prevY);
        ctx.stroke();
    }


    // Reset opacity
    ctx.globalAlpha = 1;
  }

  // 4. Draw Selection Borders (Clean edges)
  if (selection && selStartX !== null) {
    ctx.strokeStyle = "#67E8F9"; // Bright Cyan border
    ctx.lineWidth = 1;
    ctx.beginPath();
    // Left Edge
    ctx.moveTo(selStartX, 0);
    ctx.lineTo(selStartX, height);
    // Right Edge
    ctx.moveTo(selEndX, 0);
    ctx.lineTo(selEndX, height);
    ctx.stroke();
  }

  // 5. Draw Playhead (Always white on top)
  // Glow effect
  ctx.shadowColor = "rgba(255, 255, 255, 0.5)";
  ctx.shadowBlur = 4;
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(headX, 0);
  ctx.lineTo(headX, height);
  ctx.stroke();
  // Reset shadow
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
}

/**
 * Forces an AudioBuffer to stereo (2 channels).
 */
export function forceStereoBuffer(buffer, context) {
  if (buffer.numberOfChannels >= 2) return buffer;

  const stereoBuffer = context.createBuffer(
    2,
    buffer.length,
    buffer.sampleRate
  );

  const monoData = buffer.getChannelData(0);
  stereoBuffer.copyToChannel(monoData, 0);
  stereoBuffer.copyToChannel(monoData, 1);

  return stereoBuffer;
}
