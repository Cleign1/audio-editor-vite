// Unused Wavesurfer.js function

import { useEffect, useRef } from "react";
import WaveSurfer from "wavesurfer.js";
import RegionsPlugin from "wavesurfer.js/dist/plugins/regions.esm.js";

export function Waveform({
  audioBuffer,
  playbackState,
  onSeek,
  onSelectionChange,
}) {
  const containerRef = useRef(null);
  const waveSurferRef = useRef(null);

  // INIT
  useEffect(() => {
    if (!containerRef.current) return;

    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: "#4b5563",
      progressColor: "#6366f1",
      cursorColor: "#f87171",
      height: 120,
      normalize: true,
      splitChannels: true,
      plugins: [
        RegionsPlugin.create({
          dragSelection: true,
        }),
      ],
    });

    waveSurferRef.current = ws;

    // Seek → editor
    ws.on("seek", (progress) => {
      onSeek(progress * ws.getDuration());
    });

    // Selection → editor
    ws.on("region-created", (region) => {
      onSelectionChange({
        startTime: region.start,
        endTime: region.end,
      });
    });

    ws.on("region-updated", (region) => {
      onSelectionChange({
        startTime: region.start,
        endTime: region.end,
      });
    });

    return () => {
      ws.destroy();
    };
  }, []);

  // LOAD AudioBuffer
  useEffect(() => {
    if (!audioBuffer || !waveSurferRef.current) return;

    waveSurferRef.current.loadDecodedBuffer(audioBuffer);
  }, [audioBuffer]);

  // SYNC PLAYHEAD
  useEffect(() => {
    const ws = waveSurferRef.current;
    if (!ws) return;

    if (playbackState.isPlaying) {
      ws.play();
    } else {
      ws.pause();
    }

    ws.setTime(playbackState.currentTime);
  }, [playbackState.isPlaying, playbackState.currentTime]);

  return <div ref={containerRef} />;
}
