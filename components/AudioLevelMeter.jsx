import React, { useEffect, useRef } from "react";

export function AudioLevelMeter({ analyserNode, isRecording }) {
  const canvasRef = useRef(null);
  const requestRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;

    // Clear canvas when stopped or unavailable
    if (!canvas || !analyserNode || !isRecording) {
      const ctx = canvas?.getContext("2d");
      if (canvas && ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const bufferLength = analyserNode.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      if (!isRecording) return;

      analyserNode.getByteTimeDomainData(dataArray);

      // RMS calculation
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) {
        const x = (dataArray[i] - 128) / 128.0;
        sum += x * x;
      }
      const rms = Math.sqrt(sum / bufferLength);

      // Convert to dB (-60dB .. 0dB approx)
      const db = 20 * Math.log10(Math.max(rms, 0.00001));

      // Normalize to 0..1
      let percent = (db + 60) / 60;
      percent = Math.max(0, Math.min(1, percent));

      const width = canvas.width;
      const height = canvas.height;

      // Background
      ctx.fillStyle = "#1f2937";
      ctx.fillRect(0, 0, width, height);

      // LED-style segments
      const segmentHeight = 4;
      const gap = 1;
      const totalSegments = Math.floor(height / (segmentHeight + gap));
      const activeSegments = Math.floor(totalSegments * percent);

      for (let i = 0; i < totalSegments; i++) {
        const y = height - i * (segmentHeight + gap) - segmentHeight;

        let color = "#22c55e"; // Green
        if (i > totalSegments * 0.7) color = "#eab308"; // Yellow
        if (i > totalSegments * 0.9) color = "#ef4444"; // Red

        ctx.fillStyle = i >= activeSegments ? "#374151" : color;
        ctx.fillRect(0, y, width, segmentHeight);
      }

      requestRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
        requestRef.current = null;
      }
    };
  }, [analyserNode, isRecording]);

  return (
    <div className="h-24 w-4 bg-gray-800 rounded border border-gray-700 overflow-hidden">
      <canvas
        ref={canvasRef}
        width={16}
        height={96}
        className="w-full h-full block"
      />
    </div>
  );
}
