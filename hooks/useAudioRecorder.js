import { useState, useRef, useCallback, useEffect } from "react";
import { batchCalculatePeaks } from '../lib/peakCalculator'

export function useAudioRecorder(audioContext) {
  /* =======================
     STATE (UI ONLY)
  ======================= */

  const [recordingState, setRecordingState] = useState({
    isRecording: false,
    isInitializing: false,
    error: null,
  });

  const [devices, setDevices] = useState({
    inputs: [],
    outputs: [],
  });

  const [selectedInputId, setSelectedInputId] = useState("");
  const [selectedOutputId, setSelectedOutputId] = useState("");

  const [analyserNode, setAnalyserNode] = useState(null);

  /* =======================
     REFS (ENGINE DATA)
  ======================= */

  const mediaStreamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const analyserNodeRef = useRef(null);
  const processorNodeRef = useRef(null);
  const gainNodeRef = useRef(null);

  const recordedChunksRef = useRef([]);
  const peaksByChannelRef = useRef([]);

  const isRecordingRef = useRef(false);
  const sampleRateRef = useRef(44100);
  const channelCountRef = useRef(1);
  const samplesProcessedRef = useRef(0);

  /* =======================
     DEVICE ENUMERATION
  ======================= */

  useEffect(() => {
    let mounted = true;

    const loadDevices = async () => {
      if (!navigator.mediaDevices) return;

      try {
        const list = await navigator.mediaDevices.enumerateDevices();
        if (!mounted) return;

        const inputs = list.filter((d) => d.kind === "audioinput");
        const outputs = list.filter((d) => d.kind === "audiooutput");

        setDevices({ inputs, outputs });

        if (!selectedInputId && inputs.length > 0) {
          setSelectedInputId(
            inputs.find((d) => d.deviceId === "default")?.deviceId ||
              inputs[0].deviceId
          );
        }

        if (!selectedOutputId && outputs.length > 0) {
          setSelectedOutputId(
            outputs.find((d) => d.deviceId === "default")?.deviceId ||
              outputs[0].deviceId
          );
        }
      } catch (err) {
        console.error("Failed to enumerate devices", err);
      }
    };

    loadDevices();
    navigator.mediaDevices.addEventListener("devicechange", loadDevices);

    return () => {
      mounted = false;
      navigator.mediaDevices.removeEventListener("devicechange", loadDevices);
    };
  }, [selectedInputId, selectedOutputId]);

  /* =======================
     START RECORDING
  ======================= */

  const startRecording = useCallback(
    async ({ channels = 1 } = {}) => {
      try {
        setRecordingState({
          isRecording: false,
          isInitializing: true,
          error: null,
        });

        const ctx =
          audioContext ||
          new (window.AudioContext || window.webkitAudioContext)();

        if (ctx.state === "suspended") {
          await ctx.resume();
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: selectedInputId
              ? { exact: selectedInputId }
              : undefined,
            channelCount: channels,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });

        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 2048;

        const processor = ctx.createScriptProcessor(
          4096,
          channels,
          channels
        );

        processor.onaudioprocess = (e) => {
          if (!isRecordingRef.current) return;

          for (let ch = 0; ch < e.inputBuffer.numberOfChannels; ch++) {
            const peaks = batchCalculatePeaks(
              e.inputBuffer.getChannelData(ch)
            );
            if (peaksByChannelRef.current[ch]) {
              peaksByChannelRef.current[ch].push(...peaks);
            }
          }

          samplesProcessedRef.current += e.inputBuffer.length;
        };

        const gain = ctx.createGain();
        gain.gain.value = 0; // mute monitoring

        source.connect(analyser);
        source.connect(processor);
        processor.connect(gain);
        gain.connect(ctx.destination);

        const recorder = new MediaRecorder(stream);
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) {
            recordedChunksRef.current.push(e.data);
          }
        };

        recorder.start(100);

        mediaStreamRef.current = stream;
        mediaRecorderRef.current = recorder;
        analyserNodeRef.current = analyser;
        processorNodeRef.current = processor;
        gainNodeRef.current = gain;

        peaksByChannelRef.current = Array.from(
          { length: channels },
          () => []
        );

        channelCountRef.current = channels;
        sampleRateRef.current = ctx.sampleRate;
        samplesProcessedRef.current = 0;
        recordedChunksRef.current = [];
        isRecordingRef.current = true;

        setAnalyserNode(analyser);
        setRecordingState({
          isRecording: true,
          isInitializing: false,
          error: null,
        });
      } catch (error) {
        console.error("Failed to start recording", error);
        setRecordingState({
          isRecording: false,
          isInitializing: false,
          error:
            error instanceof Error
              ? error.message
              : "Failed to start recording",
        });
      }
    },
    [audioContext, selectedInputId]
  );

  /* =======================
     STOP RECORDING
  ======================= */

  const stopRecording = useCallback(() => {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state === "inactive") {
        resolve(null);
        return;
      }

      recorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        resolve(blob);
      };

      recorder.stop();
      isRecordingRef.current = false;

      setRecordingState((s) => ({
        ...s,
        isRecording: false,
      }));
    });
  }, []);

  /* =======================
     CLEANUP
  ======================= */

  const cleanup = useCallback(() => {
    if (mediaRecorderRef.current?.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }

    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());

    mediaRecorderRef.current = null;
    mediaStreamRef.current = null;
    analyserNodeRef.current = null;
    processorNodeRef.current = null;
    gainNodeRef.current = null;

    setAnalyserNode(null);

    isRecordingRef.current = false;
    samplesProcessedRef.current = 0;
    peaksByChannelRef.current = [];
    recordedChunksRef.current = [];
  }, []);

  /* =======================
     PUBLIC API (SAFE)
  ======================= */

  return {
    // UI state
    recordingState,
    analyserNode,

    // Controls
    startRecording,
    stopRecording,
    cleanup,

    // Devices
    devices,
    selectedInputId,
    selectedOutputId,
    setInputDevice: setSelectedInputId,
    setOutputDevice: setSelectedOutputId,

    // Engine refs
    peaksByChannelRef,

    // SAFE getters (no render-time ref access)
    getChannelCount: () => channelCountRef.current,
    getSampleRate: () => sampleRateRef.current,
    getElapsedSeconds: () =>
      samplesProcessedRef.current / sampleRateRef.current,
  };
}
