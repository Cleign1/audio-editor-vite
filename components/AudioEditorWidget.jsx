/**
 * AudioEditorWidget.jsx
 * A comprehensive, visual audio editing component that combines a polished UI with
 * robust audio manipulation logic.
 */

import { useRef, useEffect, useState, useCallback } from "react";
import { useAudioEditor } from "../hooks/useAudioEditor";
import { useAudioRecorder } from "../hooks/useAudioRecorder";
import { useWaveformInteraction } from "../hooks/useWaveformInteractions";
import { useAudioViewport } from "../hooks/useAudioViewport";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import { audioBufferToWav } from "../lib/audioBufferUtils";
import { saveRecording } from "../lib/db";
import { connectEditorSocket, onEditorIngest } from "../lib/editorSocket";
import { RecorderSidebar } from "./RecorderSidebar";
import { RecordingProvider } from "./RecordingProvider";
import { formatTime } from "./audio-editor/utils";
import { TransportControls } from "./audio-editor/TransportControls";
import { EditToolbar } from "./audio-editor/EditToolbar";
import { WaveformDisplay } from "./audio-editor/WaveformDisplay";
import { SavedAudioList } from "./SavedAudioList";

export function AudioEditorWidget({
  audioSourceUrl,
  // initialVolume = 1.0,
  onSave,
  className = "",
}) {
  // --- Refs ---
  const containerRef = useRef(null);
  const fileInputRef = useRef(null);
  // const waveformAreaRef = useRef(null);

  // --- Local UI State ---
  const [channelVisibility, setChannelVisibility] = useState({
    left: true,
    right: true,
  });
  const [error, setError] = useState(null);
  const [ingestQueue, setIngestQueue] = useState([]);
  const [sourceFilename, setSourceFilename] = useState(null);
  const [refreshList, setRefreshList] = useState(0);

  // --- Audio Engine Hook ---
  const {
    audioBuffer,
    audioContext,
    selection,
    playbackState,
    clipboard,
    isMuted,
    canUndo,
    canRedo,
    fileName,
    currentRecordingId,
    updateFileName,
    loadAudioFile,
    loadRecording,
    saveAudio: downloadAudio,
    // play,
    pause,
    togglePlayPause,
    // seekTo,
    seekWithoutResume,
    skipForward,
    skipBackward,
    setSelection,
    clearSelection,
    cut,
    copy,
    paste,
    volumeUp,
    volumeDown,
    toggleMute,
    undo,
    redo,
    filename,
    clearAudio,
  } = useAudioEditor(channelVisibility);

  // --- Audio Viewport Hook ---
  const {
    zoomLevel,
    viewportStart,
    setViewportStart,
    setZoomLevel,
    canvasWidth,
    setCanvasWidth,
    viewportDuration,
    handleZoomIn,
    handleZoomOut,
  } = useAudioViewport({
    audioBuffer,
    playbackState,
    pause,
    seekWithoutResume,
    clearSelection,
  });

  // --- Recording State ---
  const {
    recordingState,
    analyserNode,
    startRecording,
    stopRecording,
    peaksByChannelRef,
    channelCount,
    sampleRate,
    getElapsedSeconds,
    devices,
    selectedInputId,
    selectedOutputId,
    setInputDevice,
    setOutputDevice,
  } = useAudioRecorder(audioContext);

  // --- Waveform Interaction Hook ---
  const { handleMouseDown, handleMouseMove, handleMouseUp } =
    useWaveformInteraction({
      audioBuffer,
      viewportStart,
      viewportDuration,
      channelVisibility,
      seekWithoutResume,
      setSelection,
    });

  /**
   * Toggle channel visibility (Adobe Audition-style)
   */
  const toggleChannel = useCallback((channel) => {
    setChannelVisibility((prev) => ({
      ...prev,
      [channel]: !prev[channel],
    }));
  }, []);

  /**
   * Reset editor state
   */
  const handleReset = useCallback(() => {
    pause();
    seekWithoutResume(0);
    clearSelection();
    setSourceFilename(null);
    setZoomLevel(1);
    setViewportStart(0);
  }, [
    pause,
    seekWithoutResume,
    clearSelection,
    setZoomLevel,
    setViewportStart,
  ]);

  // --- Keyboard Shortcuts ---
  useKeyboardShortcuts({
    onPlayPause: togglePlayPause,
    onUndo: undo,
    onRedo: redo,
    onCut: cut,
    onCopy: copy,
    onPaste: paste,
    onDelete: clearSelection,
    canUndo,
    canRedo,
    onZoomIn: handleZoomIn,
    onZoomOut: handleZoomOut,
    onSkipForward: skipForward,
    onSkipBackward: skipBackward,
  });

  /**
   * Handle recording completion
   */
  const handleRecordingFinished = useCallback(
    async (blob, isStereo) => {
      const id = crypto.randomUUID();
      const timestamp = new Date();
      const name = `Recording ${timestamp.toLocaleDateString()} ${timestamp.toLocaleTimeString()}`;

      loadRecording(blob, {
        forceStereo: isStereo,
        forceMono: !isStereo,
        name: name,
        id: id,
      });
      setSourceFilename(null);

      // Save to recordings list
      try {
        await saveRecording({
          id,
          name,
          blob,
          createdAt: Date.now(),
          sourceFilename: null,
        });
        setRefreshList((prev) => prev + 1);
      } catch (err) {
        console.error("Failed to save recording to DB", err);
      }
    },
    [loadRecording],
  );

  /**
   * Trigger file picker
   */
  const handleUploadClick = useCallback(() => {
    if (fileInputRef.current) fileInputRef.current.click();
  }, []);

  /**
   * Handle file selection
   */
  const handleFileChange = useCallback(
    async (event) => {
      const file = event.target.files && event.target.files[0];
      if (!file) return;

      try {
        const buffer = await loadAudioFile(file);
        setSourceFilename(file.name || null);

        // Save to recordings list
        const id = crypto.randomUUID();
        await saveRecording({
          id,
          name: file.name,
          blob: file,
          createdAt: Date.now(),
          duration: buffer?.duration || 0,
          sourceFilename: file.name || null,
        });
        setRefreshList((prev) => prev + 1);

        setError(null);
      } catch (err) {
        console.error("Failed to load audio file:", err);
        setError("Failed to load audio file. Please try a different file.");
      } finally {
        event.target.value = "";
      }
    },
    [loadAudioFile],
  );

  /**
   * Download handler (WAV Export)
   */
  const handleDownload = useCallback(() => {
    if (onSave && audioBuffer) {
      const blob = audioBufferToWav(audioBuffer);
      onSave(blob);
    } else {
      downloadAudio();
    }
  }, [onSave, audioBuffer, downloadAudio]);

  /**
   * Save to Library handler (IndexedDB)
   */
  const handleSaveToIdb = useCallback(async () => {
    if (!audioBuffer) return;

    try {
      // 1. Convert current buffer to WAV Blob
      const blob = audioBufferToWav(audioBuffer);

      let id = currentRecordingId;
      let name = fileName;

      // If no ID (e.g. uploaded file or brand new), create one
      if (!id) {
        id = crypto.randomUUID();
        const timestamp = new Date();
        // Use filename if it exists, otherwise gen generic name
        if (!name || name === "Recording") {
          name = `Edited Project ${timestamp.toLocaleDateString()} ${timestamp.toLocaleTimeString()}`;
        }
      }

      // Save (Update if ID exists, Insert if not)
      await saveRecording({
        id,
        name,
        blob,
        createdAt: Date.now(), // Always update timestamp
        duration: audioBuffer.duration,
        sourceFilename,
      });

      // Update the list
      setRefreshList((prev) => prev + 1);
      console.log(`Project saved! ID: ${id}, Name: ${name}`);
    } catch (err) {
      console.error("Failed to save to library:", err);
      setError("Failed to save project to library.");
    }
  }, [audioBuffer, currentRecordingId, fileName]);

  const handleIngestSaveToLibrary = useCallback(async (item) => {
    try {
      await saveRecording({
        id: item.id,
        name: item.name,
        blob: item.file,
        createdAt: Date.now(),
        duration: item.durationSeconds || 0,
        sourceFilename: item.sourceFilename || null,
        metadata: item.metadata || null,
      });
      setRefreshList((prev) => prev + 1);
      setIngestQueue((prev) => prev.filter((q) => q.id !== item.id));
    } catch (err) {
      console.error("[AudioEditor] Failed to save ingested track:", err);
      setError("Failed to save shared track. Please try again.");
    }
  }, []);

  const handleIngestOpen = useCallback(
    (item) => {
      loadRecording(item.file, {
        name: item.name,
        id: item.id,
        sourceFilename: item.sourceFilename || item.name || null,
        metadata: item.metadata || null,
      });
      setSourceFilename(item.sourceFilename || item.name || null);
      setIngestQueue((prev) => prev.filter((q) => q.id !== item.id));
    },
    [loadRecording],
  );

  // Load initial audio URL if provided
  useEffect(() => {
    if (!audioSourceUrl) return;

    const fetchUrl = async () => {
      try {
        const response = await fetch(audioSourceUrl);
        const blob = await response.blob();
        const file = new File([blob], "loaded-audio.wav", {
          type: "audio/wav",
        });
        await loadAudioFile(file);
        setSourceFilename(file.name);
      } catch (e) {
        console.error("Failed to load initial URL", e);
      }
    };

    fetchUrl();
  }, [audioSourceUrl, loadAudioFile]);

  // Listen for ingest events from the music server and queue notifications
  useEffect(() => {
    const socket = connectEditorSocket();
    const unsubscribe = onEditorIngest(async (payload) => {
      try {
        if (!payload?.url) return;

        const apiBase =
          import.meta.env.VITE_API_URL ||
          (typeof window !== "undefined"
            ? `${window.location.protocol}//${window.location.host}`
            : "");
        const absoluteUrl = payload.url.startsWith("http")
          ? payload.url
          : `${apiBase.replace(/\/$/, "")}${
              payload.url.startsWith("/") ? "" : "/"
            }${payload.url}`;

        const response = await fetch(absoluteUrl);
        if (!response.ok) {
          throw new Error(`Fetch failed: ${response.status}`);
        }
        const contentType = (
          response.headers.get("content-type") || ""
        ).toLowerCase();
        if (!contentType.includes("audio")) {
          throw new Error("Received non-audio content for ingest");
        }

        const blob = await response.blob();
        const safeType =
          (blob.type && blob.type.startsWith("audio/") && blob.type) ||
          (contentType.includes("audio/") ? contentType : "audio/wav");
        const inferredName =
          payload.filename || payload.name || "ingested-audio.wav";
        const file = new File([blob], inferredName, {
          type: safeType,
        });
        const id = payload.id || crypto.randomUUID();
        const durationSeconds =
          payload.metadata?.duration || payload.metadata?.format?.duration || 0;

        const ingestItem = {
          id,
          name: file.name,
          file,
          sourceFilename: payload.filename || null,
          metadata: payload.metadata || null,
          durationSeconds,
        };

        setIngestQueue((prev) => [...prev, ingestItem]);
      } catch (err) {
        console.error("[AudioEditor] Failed to ingest track from socket:", err);
        setError("Failed to load shared track. Please try again.");
      }
    });

    return () => {
      if (unsubscribe) unsubscribe();
      if (socket?.off) socket.off("editor:ingest");
    };
  }, []);

  /**
   * Volume helpers
   */
  const handleVolumeDecrease = useCallback(
    (multiplier = 0.8) => {
      volumeDown(multiplier);
    },
    [volumeDown],
  );

  const handleVolumeIncrease = useCallback(
    (multiplier = 1.2) => {
      volumeUp(multiplier);
    },
    [volumeUp],
  );

  return (
    <RecordingProvider
      value={{
        recordingState,
        analyserNode,
        isPlaybackActive: playbackState.isPlaying,
        startRecording,
        stopRecording,
        peaksByChannelRef,
        channelCount,
        sampleRate,
        getElapsedSeconds,
        editingEnabled: {
          left: channelVisibility.left,
          right: channelVisibility.right,
        },
        devices,
        selectedInputId,
        selectedOutputId,
        setInputDevice,
        setOutputDevice,
      }}
    >
      <div
        ref={containerRef}
        className={`w-full h-screen bg-gray-800 text-white select-none flex flex-row ${className}`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={handleFileChange}
        />

        <RecorderSidebar onRecordingComplete={handleRecordingFinished} />

        {/* Main Content */}
        <div className="flex-1 flex flex-col p-4 sm:p-6 overflow-y-auto custom-scrollbar">
          {/* Top Toolbar */}
          <TransportControls
            fileName={fileName}
            totalDuration={audioBuffer ? audioBuffer.duration : 0}
            isPlaying={playbackState.isPlaying}
            isMuted={isMuted}
            onUpload={handleUploadClick}
            onToggleMute={toggleMute}
            onSkipBack={skipBackward}
            onTogglePlayPause={togglePlayPause}
            onSkipForward={skipForward}
            onDownload={handleDownload} // Map Download button to Download logic
            onSave={handleSaveToIdb} // Map Save button to IDB logic
            onRename={updateFileName}
          />

          {/* Error Alert */}
          {error && (
            <div className="mb-4 bg-red-900 border border-red-700 text-red-100 px-4 py-3 rounded flex items-center justify-between">
              <span>{error}</span>
              <button
                onClick={() => setError(null)}
                className="text-red-300 hover:text-red-100 ml-4"
              >
                ×
              </button>
            </div>
          )}

          {ingestQueue.length > 0 && (
            <div className="mb-4 space-y-2">
              {ingestQueue.map((item) => (
                <div
                  key={item.id}
                  className="border border-blue-500/40 bg-blue-900/30 text-blue-100 px-4 py-3 rounded"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold">
                        New track sent to editor
                      </div>
                      <div className="text-sm text-blue-200">
                        {item.name}
                        {item.sourceFilename &&
                        item.sourceFilename !== item.name
                          ? ` (${item.sourceFilename})`
                          : ""}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleIngestSaveToLibrary(item)}
                        className="px-3 py-1.5 bg-blue-800/60 hover:bg-blue-700 text-blue-100 rounded text-xs font-semibold"
                      >
                        Save to Library
                      </button>
                      <button
                        onClick={() => handleIngestOpen(item)}
                        className="px-3 py-1.5 bg-green-800/60 hover:bg-green-700 text-green-100 rounded text-xs font-semibold"
                      >
                        Open in Editor
                      </button>
                      <button
                        onClick={() =>
                          setIngestQueue((prev) =>
                            prev.filter((q) => q.id !== item.id),
                          )
                        }
                        className="px-2 py-1 text-blue-200 hover:text-white text-xs"
                        title="Dismiss"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Waveform */}
          <WaveformDisplay
            audioBuffer={audioBuffer}
            viewportStart={viewportStart}
            viewportDuration={viewportDuration}
            setViewportStart={setViewportStart}
            selection={selection}
            currentTime={playbackState.currentTime}
            canvasWidth={canvasWidth}
            setCanvasWidth={setCanvasWidth}
            channelVisibility={channelVisibility}
            onToggleChannel={toggleChannel}
            recordingState={recordingState}
            channelCount={channelCount}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
          />

          {/* Bottom Toolbar */}
          <div>
            <EditToolbar
              hasSelection={!!selection}
              hasClipboard={!!clipboard}
              canUndo={canUndo}
              canRedo={canRedo}
              canZoomOut={zoomLevel > 1}
              currentTime={formatTime(playbackState.currentTime)}
              onClearSelection={clearSelection}
              onCut={cut}
              onCopy={copy}
              onPaste={paste}
              onVolumeDecrease={() => handleVolumeDecrease(0.8)}
              onVolumeIncrease={() => handleVolumeIncrease(1.2)}
              onZoomIn={handleZoomIn}
              onZoomOut={handleZoomOut}
              onUndo={undo}
              onRedo={redo}
              onReset={handleReset}
              onClearAudio={clearAudio}
            />

            <SavedAudioList
              onLoad={(blob, options) => {
                loadRecording(blob, options);
                setSourceFilename(
                  options?.sourceFilename || options?.name || null,
                );
              }}
              refreshTrigger={refreshList}
            />
          </div>
        </div>
      </div>
    </RecordingProvider>
  );
}
