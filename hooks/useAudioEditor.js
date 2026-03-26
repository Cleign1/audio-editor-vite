/* eslint-disable no-unused-vars */
/**
 * useAudioEditor Hook
 * Main hook for managing audio editor state and operations
 */

import { useState, useRef, useCallback, useEffect } from "react";
import {
  getSelectionSamples,
  saveAudioBufferAsWav,
  audioBufferToWav
} from "../lib/audioBufferUtils";

import { saveProjectAudio, getProjectAudio, saveRecording } from "../lib/db";

// Helper to force 2 channels (Stereo)
function forceStereoBuffer(buffer, context) {
  if (buffer.numberOfChannels >= 2) return buffer;
  const stereoBuffer = context.createBuffer(2, buffer.length, buffer.sampleRate);
  const data = buffer.getChannelData(0);
  stereoBuffer.copyToChannel(data, 0);
  stereoBuffer.copyToChannel(data, 1);
  return stereoBuffer;
}

// Helper to force 1 channel (Mono)
function forceMonoBuffer(buffer, context) {
  if (buffer.numberOfChannels === 1) return buffer;
  const monoBuffer = context.createBuffer(1, buffer.length, buffer.sampleRate);
  // Copy just the left channel (0) to the mono buffer
  monoBuffer.copyToChannel(buffer.getChannelData(0), 0);
  return monoBuffer;
}

/**
 * A comprehensive hook for managing audio editing operations and playback state.
 *
 * This hook provides a high-level API for loading, playing, seeking, and editing
 * audio buffers using the Web Audio API. It handles complex synchronization between
 * React state and the low-level audio engine using thread-safe refs.
 *
 * @returns An object containing the current audio state and a set of control functions.
 */
export function useAudioEditor(enabledChannels = { left: true, right: true }) {
  // Audio Context (created lazily on user interaction)
  const [audioContext, setAudioContext] = useState(null);

  // Main audio buffer
  const [audioBuffer, setAudioBuffer] = useState(null);

  // --- NEW: File Identity State ---
  const [fileName, setFileName] = useState(null);
  const [currentRecordingId, setCurrentRecordingId] = useState(null);

  // Selection state
  const [selection, setSelection] = useState(null);

  // Playback state
  const [playbackState, setPlaybackState] = useState({
    isPlaying: false,
    currentTime: 0,
    duration: 0,
  });

  // Create a Ref to store the latest toggle state
  const enabledChannelsRef = useRef(enabledChannels);

  // Sync the Ref whenever the prop changes
  useEffect(() => {
    enabledChannelsRef.current = enabledChannels;
  }, [enabledChannels]);

  // Clipboard for cut/copy/paste
  const [clipboard, setClipboard] = useState(null);

  // Mute state for global audio output
  const [isMuted, setIsMuted] = useState(false);

  // History management
  const [historyStack, setHistoryStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  /**
   * Helper: Get channels based on Selection AND UI Toggles.
   */
  const getTargetChannels = useCallback(() => {
    if (!audioBuffer) return [];

    let candidates= [];
    if (selection?.channel !== undefined) {
      candidates = [selection.channel];
    } else {
      candidates = [...Array(audioBuffer.numberOfChannels).keys()];
    }

    return candidates.filter((ch) => {
      if (ch === 0) return enabledChannelsRef.current.left;
      if (ch === 1) return enabledChannelsRef.current.right;
      return true;
    });
  }, [audioBuffer, selection]);

  // Refs for playback control
  const sourceNodeRef = useRef(null);
  const startTimeRef = useRef(0);
  const startOffsetRef = useRef(0);
  const animationFrameRef = useRef(0);
  const isManualStopRef = useRef(false);

  // Gain node for mute control
  const gainNodeRef = useRef(null);

  // Thread-safe refs
  const isPlayingRef = useRef(false);
  const currentTimeRef = useRef(0);
  const durationRef = useRef(0);
  const selectionRef = useRef(null);
  const audioContextRef = useRef(null);

  /**
   * Creates a deep copy of an AudioBuffer for history snapshots.
   *
   * CRITICAL: AudioBuffer objects are immutable once created, but we need to create
   * new instances with copied data to ensure history snapshots are independent.
   *
   * @param {AudioBuffer} buffer - The buffer to clone
   * @returns {AudioBuffer} A new AudioBuffer with identical data
   */
  const cloneAudioBuffer = useCallback((buffer) => {
    const cloned = new AudioBuffer({
      numberOfChannels: buffer.numberOfChannels,
      length: buffer.length,
      sampleRate: buffer.sampleRate,
    });

    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const originalData = buffer.getChannelData(channel);
      const clonedData = cloned.getChannelData(channel);
      clonedData.set(originalData);
    }

    return cloned;
  }, []);

  /**
   * Captures the current audio state as a history snapshot.
   *
   * This function creates an immutable snapshot of the current audio buffer,
   * playback position, and selection state. Called before any destructive operation.
   *
   * @returns {AudioHistoryState | null} The captured state, or null if no audio loaded
   */
  const captureHistorySnapshot = useCallback(() => {
    if (!audioBuffer) return null;

    return {
      audioBuffer: cloneAudioBuffer(audioBuffer),
      currentTime: playbackState.currentTime,
      selection: selection ? { ...selection } : null,
      timestamp: Date.now(),
    };
  }, [audioBuffer, playbackState.currentTime, selection, cloneAudioBuffer]);

  /**
   * Pushes a new state to the history stack and clears the redo stack.
   *
   * CRITICAL: This function implements the standard undo/redo behavior where
   * performing a new action after undo clears the redo history.
   *
   * @param {AudioHistoryState} state - The state to push to history
   */
  const pushToHistory = useCallback((state) => {
    setHistoryStack((prev) => {
      const newStack = [...prev, state];
      return newStack.slice(-20);
    });
    setRedoStack([]);
  }, []);

  /**
   * Restores the audio editor to a previous state from history.
   *
   * This function safely restores the audio buffer, playback position, and selection
   * while ensuring playback is stopped to prevent audio conflicts.
   *
   * @param {AudioHistoryState} state - The state to restore
   */
  const restoreFromHistory = useCallback((state) => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = 0;
    }

    if (sourceNodeRef.current) {
      isManualStopRef.current = true;
      try {
        sourceNodeRef.current.stop(0);
        sourceNodeRef.current.disconnect();
      } catch (e) {
        // Already stopped or disconnected, ignore
      }
      sourceNodeRef.current = null;
    }

    setAudioBuffer(state.audioBuffer);
    setSelection(state.selection);

    setPlaybackState((prev) => ({
      ...prev,
      isPlaying: false,
      currentTime: state.currentTime,
      duration: state.audioBuffer.duration,
    }));

    durationRef.current = state.audioBuffer.duration;
    startOffsetRef.current = state.currentTime;
    currentTimeRef.current = state.currentTime;
    isPlayingRef.current = false;
  }, []);

  /**
   * Undoes the last editing operation by restoring the previous state.
   *
   * CRITICAL: This function implements safe undo by stopping playback first,
   * then restoring the previous audio state from the history stack.
   *
   * @returns {boolean} True if undo was performed, false if no history available
   */
  const undo = useCallback(() => {
    if (historyStack.length === 0) {
      console.warn("No history available for undo");
      return false;
    }

    const currentState = captureHistorySnapshot();
    if (!currentState) return false;

    const previousState = historyStack[historyStack.length - 1];
    const newHistoryStack = historyStack.slice(0, -1);

    setHistoryStack(newHistoryStack);
    setRedoStack((prev) => [...prev, currentState]);

    restoreFromHistory(previousState);
    return true;
  }, [historyStack, captureHistorySnapshot, restoreFromHistory]);

  /**
   * Redoes the last undone operation by restoring the next state.
   *
   * @returns {boolean} True if redo was performed, false if no redo history available
   */
  const redo = useCallback(() => {
    if (redoStack.length === 0) {
      console.warn("No redo history available");
      return false;
    }

    const currentState = captureHistorySnapshot();
    if (!currentState) return false;

    const nextState = redoStack[redoStack.length - 1];
    const newRedoStack = redoStack.slice(0, -1);

    setRedoStack(newRedoStack);
    setHistoryStack((prev) => [...prev, currentState]);

    restoreFromHistory(nextState);
    return true;
  }, [redoStack, captureHistorySnapshot, restoreFromHistory]);

  /**
   * Executes a destructive audio operation with automatic history management.
   *
   * This wrapper function captures the current state before executing the operation,
   * ensuring that all destructive edits can be undone.
   *
   * @param {() => void} operation - The destructive operation to execute
   * @param {string} operationName - Name of the operation for debugging
   */
  const executeWithHistory = useCallback(
    (operation, operationName) => {
      const snapshot = captureHistorySnapshot();
      if (!snapshot) {
        console.warn(`Cannot capture history for ${operationName}: no audio buffer`);
        return;
      }
      pushToHistory(snapshot);
      operation();
      console.log(`Executed ${operationName} with history capture`);
    },
    [captureHistorySnapshot, pushToHistory]
  );

  /**
   * Initializes the AudioContext lazily (Client-Side Only).
   *
   * Browsers often require a user gesture to start audio. This function
   * ensures the context is created only when needed (e.g., on play or load).
   *
   * **SSR-Safe:** Checks for window object before creating AudioContext.
   * **Cross-Browser:** Falls back to webkitAudioContext for Safari/older browsers.
   * **Autoplay Policy:** Automatically resumes suspended contexts.
   *
   * Creates a gain node for mute control and connects it to the destination.
   *
   * @returns {AudioContext} The initialized or existing AudioContext.
   */
  const initAudioContext = useCallback(() => {
    if (!audioContext) {
      if (typeof window === "undefined") return null;

      const AudioContextClass = window.AudioContext || (window).webkitAudioContext;
      if (!AudioContextClass) {
        console.error("Web Audio API is not supported in this browser");
        return null;
      }

      const ctx = new AudioContextClass();
      setAudioContext(ctx);
      audioContextRef.current = ctx;

      const gainNode = ctx.createGain();
      gainNode.connect(ctx.destination);
      gainNodeRef.current = gainNode;

      return ctx;
    }

    if (!gainNodeRef.current && audioContext) {
      const gainNode = audioContext.createGain();
      gainNode.connect(audioContext.destination);
      gainNodeRef.current = gainNode;
    }

    audioContextRef.current = audioContext;
    return audioContext;
  }, [audioContext]);

  /**
   * Loads and decodes an audio file into an AudioBuffer.
   *
   * @param {File} file - The audio file to be loaded.
   * @returns {Promise<AudioBuffer>} A promise that resolves to the decoded AudioBuffer.
   * @throws {Error} If decoding the audio data fails.
   */
  const loadAudioFile = useCallback(
    async (file) => {
      const ctx = initAudioContext();
      if (!ctx) throw new Error("Failed to initialize AudioContext");

      try {
        const arrayBuffer = await file.arrayBuffer();
        const decodedBuffer = await ctx.decodeAudioData(arrayBuffer);

        setAudioBuffer(decodedBuffer);
        
        // --- UPDATED: Set File Name ---
        setFileName(file.name);
        setCurrentRecordingId(null);

        durationRef.current = decodedBuffer.duration;

        setPlaybackState({
          isPlaying: false,
          currentTime: 0,
          duration: decodedBuffer.duration,
        });
        setSelection(null);

        return decodedBuffer;
      } catch (error) {
        console.error("Error loading audio file:", error);
        throw error;
      }
    },
    [initAudioContext]
  );

  /**
   * Loads a recording Blob.
   * Now supports forcing Mono or Stereo based on recording settings.
   */
  const loadRecording = useCallback(async (blob, options = {}) => {
    const ctx = initAudioContext();
    if (!ctx) return;

    let buffer = await ctx.decodeAudioData(await blob.arrayBuffer());

    if (options.forceStereo && buffer.numberOfChannels === 1) {
      buffer = forceStereoBuffer(buffer, ctx);
    }

    if (options.forceMono && buffer.numberOfChannels > 1) {
      buffer = forceMonoBuffer(buffer, ctx);
    }

    setAudioBuffer(buffer);
    
    // --- UPDATED: Set File Name from options or default ---
    setFileName(options.name || "Recording");
    setCurrentRecordingId(options.id || null);

    setSelection(null);

    setPlaybackState({
      isPlaying: false,
      currentTime: 0,
      duration: buffer.duration,
    });
  }, [initAudioContext]);

  /**
   * Exports the current audio buffer as a WAV file and triggers a download.
   *
   * @param {string} [filename] - Optional custom filename. Defaults to a timestamped name.
   */
  const saveAudio = useCallback(
    (filename) => {
      if (!audioBuffer) {
        console.warn("No audio buffer to save");
        return;
      }
      // Use stored fileName as default if available
      const defaultName = filename || fileName || `audio-${Date.now()}.wav`;
      saveAudioBufferAsWav(audioBuffer, defaultName);
    },
    [audioBuffer, fileName]
  );

  /**
   * NEW FUNCTION: Saves the current project to the internal Library (IndexedDB).
   * This uses the updated saveRecording logic to overwrite if name exists.
   */
  const saveToLibrary = useCallback(async (customName) => {
    if (!audioBuffer) {
      console.warn("No audio buffer to save to library");
      return;
    }

    const nameToSave = customName || fileName || `Recording ${new Date().toLocaleString()}`;
    const wavBlob = audioBufferToWav(audioBuffer);
    
    const recording = {
      // Use existing ID if we are editing an existing recording, otherwise generate new
      id: currentRecordingId || crypto.randomUUID(), 
      name: nameToSave,
      blob: wavBlob,
      createdAt: new Date().toISOString(),
      duration: audioBuffer.duration,
      // Description is handled in saveRecording if overwriting, or default below
      description: `Created at ${new Date().toLocaleString()}`
    };

    await saveRecording(recording);
    
    // Update local state to reflect the name
    setFileName(nameToSave);
  }, [audioBuffer, fileName, currentRecordingId]);

  /**
   * Safely stops and disconnects the current AudioBufferSourceNode.
   *
   * This is a critical cleanup step to prevent memory leaks and overlapping audio.
   * It marks the stop as 'manual' to prevent the `onended` handler from triggering
   * unintended state updates.
   *
   * CRITICAL: This function also cancels any running animation frame to prevent
   * race conditions where multiple animation loops might be running simultaneously.
   *
   * CRITICAL FIX: We do NOT reset isManualStopRef here. It stays true until the
   * next startPlayback() call. This prevents delayed onended callbacks from
   * executing after cleanup, which was causing ghost audio nodes.
   */
  const cleanupSource = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = 0;
    }

    if (sourceNodeRef.current) {
      isManualStopRef.current = true;
      try {
        sourceNodeRef.current.stop(0);
        sourceNodeRef.current.disconnect();
      } catch (e) {
        // ignore
      }
      sourceNodeRef.current = null;
    }

    isPlayingRef.current = false;
  }, []);

  /**
   * The main animation loop for updating the playhead position.
   *
   * CRITICAL FIX: This function is now completely stable with NO closure dependencies.
   * All values are read from refs to prevent stale closure issues that caused:
   * - Case 2: Playhead freezing while audio continues
   * - Animation loop dying due to stale audioContext reference
   *
   * This uses `requestAnimationFrame` for smooth 60fps UI updates synchronized
   * with the browser's refresh rate.
   *
   * The loop ONLY runs during active playback, started by startPlayback() and
   * stopped by cleanupSource().
   */
  const updatePlayhead = useCallback(() => {
    const ctx = audioContextRef.current;
    if (!ctx) return;

    if (isPlayingRef.current) {
      const elapsed = ctx.currentTime - startTimeRef.current;
      const currentTime = startOffsetRef.current + elapsed;

      const currentSelection = selectionRef.current;
      const maxTime = currentSelection ? currentSelection.endTime : durationRef.current;

      if (currentTime >= maxTime) {
        isPlayingRef.current = false;
        currentTimeRef.current = maxTime;

        setPlaybackState((prev) => ({
          ...prev,
          isPlaying: false,
          currentTime: maxTime,
        }));

        if (sourceNodeRef.current) {
          try {
            sourceNodeRef.current.stop();
            sourceNodeRef.current.disconnect();
          } catch (e) {
            // ignore
          }
          sourceNodeRef.current = null;
        }
      } else {
        currentTimeRef.current = currentTime;
        setPlaybackState((prev) => ({
          ...prev,
          currentTime,
        }));
      }
    } else {
      currentTimeRef.current = startOffsetRef.current;
      setPlaybackState((prev) => ({
        ...prev,
        currentTime: startOffsetRef.current,
      }));
    }

    animationFrameRef.current = requestAnimationFrame(updatePlayhead);
  }, []);

  /**
   * Pauses the current audio playback.
   *
   * It calculates the exact elapsed time since playback started and updates
   * `startOffsetRef` so that subsequent `play()` calls can resume from the
   * correct position.
   *
   * CRITICAL: This function must cancel the animation frame to prevent the loop
   * from continuing after pause. Uses audioContextRef for timing consistency.
   */
  const pause = useCallback(() => {
    const ctx = audioContextRef.current;
    if (ctx && isPlayingRef.current && sourceNodeRef.current) {
      const elapsed = ctx.currentTime - startTimeRef.current;
      startOffsetRef.current = startOffsetRef.current + elapsed;
      startOffsetRef.current = Math.max(0, Math.min(startOffsetRef.current, durationRef.current));
    }

    cleanupSource();
    currentTimeRef.current = startOffsetRef.current;

    setPlaybackState((prev) => ({
      ...prev,
      isPlaying: false,
      currentTime: startOffsetRef.current,
    }));
  }, [cleanupSource]);

  /**
   * Initiates audio playback from a specific time offset.
   *
   * This function handles the low-level Web Audio API setup, including creating
   * the `AudioBufferSourceNode`, connecting it to the destination, and handling
   * the `onended` event.
   *
   * @param {number} [offset] - The time in seconds to start playback from.
   * Defaults to the current `startOffsetRef`.
   * @returns {Promise<void>}
   *
   * CRITICAL FIX: We reset isManualStopRef at the START of this function.
   * This is the only place where we intentionally begin new playback, so it's
   * safe to allow onended callbacks from this point forward.
   */
  const startPlayback = useCallback(
    async (offset) => {
      if (!audioBuffer || !audioContext) return;

      if (audioContext.state === "suspended") {
        try {
          await audioContext.resume();
        } catch (e) {
          console.error("AudioContext resume failed:", e);
        }
      }

      cleanupSource();
      isManualStopRef.current = false;

      if (sourceNodeRef.current) return;

      try {
        let playbackOffset = offset !== undefined ? offset : startOffsetRef.current;
        playbackOffset = Math.max(0, Math.min(playbackOffset, audioBuffer.duration));

        const currentSelection = selectionRef.current;
        if (currentSelection) {
          playbackOffset = Math.max(playbackOffset, currentSelection.startTime);
          playbackOffset = Math.min(playbackOffset, currentSelection.endTime);
        }

        startOffsetRef.current = playbackOffset;

        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;

        if (!gainNodeRef.current) {
          const gainNode = audioContext.createGain();
          gainNode.connect(audioContext.destination);
          gainNodeRef.current = gainNode;
        }

        source.connect(gainNodeRef.current);

        source.onended = () => {
          if (!isManualStopRef.current) {
            sourceNodeRef.current = null;
            isPlayingRef.current = false;
            const endSelection = selectionRef.current;
            const endTime = endSelection ? endSelection.endTime : audioBuffer.duration;
            currentTimeRef.current = endTime;

            setPlaybackState((prev) => ({
              ...prev,
              isPlaying: false,
              currentTime: endTime,
            }));
          }
        };

        let duration;
        if (currentSelection) {
          duration = Math.max(0, currentSelection.endTime - playbackOffset);
          source.start(0, playbackOffset, duration);
        } else {
          source.start(0, playbackOffset);
        }

        sourceNodeRef.current = source;
        startTimeRef.current = audioContext.currentTime;

        isPlayingRef.current = true;
        currentTimeRef.current = playbackOffset;

        setPlaybackState((prev) => ({
          ...prev,
          isPlaying: true,
          currentTime: playbackOffset,
        }));

        animationFrameRef.current = requestAnimationFrame(updatePlayhead);
      } catch (error) {
        console.error("Error starting playback:", error);
        isPlayingRef.current = false;
        setPlaybackState((prev) => ({ ...prev, isPlaying: false }));
      }
    },
    [audioBuffer, audioContext, updatePlayhead, cleanupSource]
  );

  /**
   * Resumes or starts audio playback.
   *
   * Ensures the `AudioContext` is in a 'running' state before starting playback,
   * which is required by modern browser security policies.
   *
   * @returns {Promise<void>}
   */
  const play = useCallback(async () => {
    if (!audioContext) return;
    if (audioContext.state === "suspended") {
      try {
        await audioContext.resume();
      } catch (e) {
        return;
      }
    }
    await startPlayback();
  }, [audioContext, startPlayback]);

  /**
   * Moves the playhead to a new position without starting playback.
   *
   * This is used for "scrubbing" or clicking on the waveform to set the
   * starting point for the next playback.
   *
   * @param {number} time - The target time in seconds.
   * @returns {Promise<void>}
   *
   * CRITICAL: This does NOT restart the animation loop. The loop should only
   * run during active playback.
   */
  const seekWithoutResume = useCallback(
    async (time) => {
      if (!audioBuffer || !audioContext) return;

      const clampedTime = Math.max(0, Math.min(time, audioBuffer.duration));
      cleanupSource();

      startTimeRef.current = 0;
      startOffsetRef.current = clampedTime;
      currentTimeRef.current = clampedTime;

      setPlaybackState((prev) => ({
        ...prev,
        isPlaying: false,
        currentTime: clampedTime,
      }));
    },
    [audioBuffer, audioContext, cleanupSource]
  );

  /**
   * Moves the playhead to a new position and resumes playback if it was already playing.
   *
   * This is the primary function for navigating through the audio track.
   *
   * @param {number} time - The target time in seconds.
   * @returns {Promise<void>}
   *
   * CRITICAL FIX: The animation loop is ONLY started by startPlayback, not here.
   * This prevents the double-loop bug that caused ghost playback.
   */
  const seekTo = useCallback(
    async (time) => {
      if (!audioBuffer || !audioContext) return;

      if (audioContext.state === "suspended") {
        try {
          await audioContext.resume();
        } catch (e) {
          console.error("AudioContext resume failed:", e);
        }
      }

      const clampedTime = Math.max(0, Math.min(time, audioBuffer.duration));
      const wasPlaying = isPlayingRef.current;

      cleanupSource();

      startTimeRef.current = 0;
      startOffsetRef.current = clampedTime;
      currentTimeRef.current = clampedTime;

      setPlaybackState((prev) => ({
        ...prev,
        isPlaying: false,
        currentTime: clampedTime,
      }));

      if (wasPlaying) {
        await startPlayback(clampedTime);
      }
    },
    [audioBuffer, audioContext, startPlayback, cleanupSource]
  );

  /**
   * Skips the playhead forward by a specified number of seconds.
   *
   * CRITICAL FIX: Skip operations are now ONLY allowed when audio is paused/stopped.
   * This prevents the ghost audio bug caused by creating multiple concurrent AudioBufferSourceNodes.
   *
   * @param {number} [seconds=5] - The number of seconds to skip.
   * @returns {boolean} - Returns true if skip was executed, false if blocked due to playback state.
   */
  const skipForward = useCallback(async (seconds = 5) => {
    if (isPlayingRef.current) return false;
    await seekTo(playbackState.currentTime + seconds);
    return true;
  }, [playbackState.currentTime, seekTo]);

  /**
   * Skips the playhead backward by a specified number of seconds.
   *
   * CRITICAL FIX: Skip operations are now ONLY allowed when audio is paused/stopped.
   * This prevents the ghost audio bug caused by creating multiple concurrent AudioBufferSourceNodes.
   *
   * @param {number} [seconds=5] - The number of seconds to skip.
   * @returns {boolean} - Returns true if skip was executed, false if blocked due to playback state.
   */
  const skipBackward = useCallback(async (seconds = 5) => {
    if (isPlayingRef.current) return false;
    await seekTo(playbackState.currentTime - seconds);
    return true;
  }, [playbackState.currentTime, seekTo]);

  const togglePlayPause = useCallback(async () => {
    if (isPlayingRef.current) {
      pause();
    } else {
      await play();
    }
  }, [pause, play]);

  // --- Editing Operations ---

  const cut = useCallback(() => {
    if (!audioBuffer || !selection || !audioContextRef.current) return;

    executeWithHistory(() => {
      const { startSample, endSample } = getSelectionSamples(selection, audioBuffer.sampleRate);
      const channelsToCut = getTargetChannels();
      const cutLength = endSample - startSample;
      const isCuttingAll = channelsToCut.length === audioBuffer.numberOfChannels;
      const newLength = isCuttingAll ? audioBuffer.length - cutLength : audioBuffer.length;

      if (newLength <= 0) return;

      const ctx = audioContextRef.current;
      const newBuffer = ctx.createBuffer(audioBuffer.numberOfChannels, newLength, audioBuffer.sampleRate);

      for (let c = 0; c < audioBuffer.numberOfChannels; c++) {
        const originalData = audioBuffer.getChannelData(c);
        const newData = newBuffer.getChannelData(c);

        if (channelsToCut.includes(c)) {
          newData.set(originalData.subarray(0, startSample), 0);
          const remainder = originalData.subarray(endSample);
          const spaceRemaining = newLength - startSample;
          if (spaceRemaining > 0) {
            newData.set(remainder.subarray(0, spaceRemaining), startSample);
          }
        } else {
          newData.set(originalData.subarray(0, newLength), 0);
        }
      }

      setAudioBuffer(newBuffer);
      setSelection(null);

      setPlaybackState((prev) => ({
        ...prev,
        duration: newBuffer.duration,
        currentTime: Math.min(prev.currentTime, newBuffer.duration),
      }));
    }, "cut");
  }, [audioBuffer, selection, executeWithHistory, getTargetChannels]);

  const copy = useCallback(() => {
    if (!audioBuffer || !selection) return;

    const { startSample, endSample } = getSelectionSamples(selection, audioBuffer.sampleRate);
    const channels = getTargetChannels();
    if (channels.length === 0) return;

    const copied = new AudioBuffer({
      numberOfChannels: audioBuffer.numberOfChannels,
      length: endSample - startSample,
      sampleRate: audioBuffer.sampleRate,
    });

    channels.forEach((c) => {
      copied.getChannelData(c).set(audioBuffer.getChannelData(c).slice(startSample, endSample));
    });

    setClipboard(copied);
  }, [audioBuffer, selection, getTargetChannels]);

  /**
   * Inserts the audio from the clipboard into the current playhead position.
   *
   * CRITICAL: Now uses executeWithHistory to enable undo functionality.
   * Complexity: This creates a new `AudioBuffer` by splicing the clipboard
   * buffer into the main buffer at the specified sample index.
   */
  const paste = useCallback(() => {
    if (!audioBuffer || !clipboard || !audioContextRef.current) return;

    executeWithHistory(() => {
      const insertSample = Math.min(
        Math.floor(playbackState.currentTime * audioBuffer.sampleRate),
        audioBuffer.length
      );

      const channelsToEdit = getTargetChannels();
      if (channelsToEdit.length === 0) return;

      const newLength = audioBuffer.length + clipboard.length;
      const ctx = audioContextRef.current;
      const newBuffer = ctx.createBuffer(audioBuffer.numberOfChannels, newLength, audioBuffer.sampleRate);

      for (let c = 0; c < audioBuffer.numberOfChannels; c++) {
        const originalData = audioBuffer.getChannelData(c);
        const newData = newBuffer.getChannelData(c);
        
        newData.set(originalData.subarray(0, insertSample), 0);

        const isTargetChannel = channelsToEdit.includes(c);
        if (isTargetChannel) {
          const clipboardChannel = c < clipboard.numberOfChannels ? c : 0;
          const clipData = clipboard.getChannelData(clipboardChannel);
          newData.set(clipData, insertSample);
        }

        newData.set(originalData.subarray(insertSample), insertSample + clipboard.length);
      }

      setAudioBuffer(newBuffer);
      setPlaybackState((prev) => ({
        ...prev,
        duration: newBuffer.duration,
        currentTime: (insertSample + clipboard.length) / newBuffer.sampleRate,
      }));
    }, "paste");
  }, [audioBuffer, clipboard, playbackState.currentTime, executeWithHistory, getTargetChannels]);

  /**
   * Applies a fade-in effect to the selected audio region.
   *
   * CRITICAL: Now uses executeWithHistory to enable undo functionality.
   * Uses an exponential curve for a more natural-sounding volume transition.
   */
  const fadeIn = useCallback(() => {
    if (!audioBuffer || !selection) return;

    executeWithHistory(() => {
      const { startSample, endSample } = getSelectionSamples(selection, audioBuffer.sampleRate);
      const channels = getTargetChannels();
      if (channels.length === 0) return;

      const newBuffer = cloneAudioBuffer(audioBuffer);
      channels.forEach((c) => {
        const data = newBuffer.getChannelData(c);
        const len = endSample - startSample;
        for (let i = 0; i < len; i++) {
          const t = i / len;
          data[startSample + i] *= t;
        }
      });
      setAudioBuffer(newBuffer);
    }, "fadeIn");
  }, [audioBuffer, selection, executeWithHistory, getTargetChannels, cloneAudioBuffer]);

  /**
   * Applies a fade-out effect to the selected audio region.
   *
   * CRITICAL: Now uses executeWithHistory to enable undo functionality.
   * Uses an exponential curve for a more natural-sounding volume transition.
   */
  const fadeOut = useCallback(() => {
    if (!audioBuffer || !selection) return;

    executeWithHistory(() => {
      const { startSample, endSample } = getSelectionSamples(selection, audioBuffer.sampleRate);
      const channels = getTargetChannels();
      if (channels.length === 0) return;

      const newBuffer = cloneAudioBuffer(audioBuffer);
      channels.forEach((c) => {
        const data = newBuffer.getChannelData(c);
        const len = endSample - startSample;
        for (let i = 0; i < len; i++) {
          const t = 1 - i / len;
          data[startSample + i] *= t;
        }
      });
      setAudioBuffer(newBuffer);
    }, "fadeOut");
  }, [audioBuffer, selection, executeWithHistory, getTargetChannels, cloneAudioBuffer]);

  /**
   * Adjusts the volume of the selected audio region by a multiplier.
   *
   * CRITICAL: Now uses executeWithHistory to enable undo functionality.
   * @param {number} [multiplier=1.5] - The factor to multiply the sample values by.
   */
  const volumeUp = useCallback((multiplier = 1.5) => {
    if (!audioBuffer || !selection) return;
    const channels = getTargetChannels();
    if (channels.length === 0) return;

    executeWithHistory(() => {
      const { startSample, endSample } = getSelectionSamples(selection, audioBuffer.sampleRate);
      const newBuffer = cloneAudioBuffer(audioBuffer);
      channels.forEach((c) => {
        const data = newBuffer.getChannelData(c);
        for (let i = startSample; i < endSample; i++) {
          data[i] *= multiplier;
        }
      });
      setAudioBuffer(newBuffer);
    }, "volumeUp");
  }, [audioBuffer, selection, executeWithHistory, getTargetChannels, cloneAudioBuffer]);

  /**
   * Adjusts the volume of the selected audio region by a multiplier.
   *
   * CRITICAL: Now uses executeWithHistory to enable undo functionality.
   * @param {number} [multiplier=0.5] - The factor to multiply the sample values by.
   */
  const volumeDown = useCallback((multiplier = 0.5) => {
    if (!audioBuffer || !selection) return;
    const channels = getTargetChannels();
    if (channels.length === 0) return;

    executeWithHistory(() => {
      const { startSample, endSample } = getSelectionSamples(selection, audioBuffer.sampleRate);
      const newBuffer = cloneAudioBuffer(audioBuffer);
      channels.forEach((c) => {
        const data = newBuffer.getChannelData(c);
        for (let i = startSample; i < endSample; i++) {
          data[i] *= multiplier;
        }
      });
      setAudioBuffer(newBuffer);
    }, "volumeDown");
  }, [audioBuffer, selection, executeWithHistory, getTargetChannels, cloneAudioBuffer]);

  const clearSelection = useCallback(() => setSelection(null), []);

  /**
   * Toggles the global audio output mute state.
   *
   * When muted, the gain node's gain value is set to 0, silencing all audio output.
   * When unmuted, the gain node's gain value is set back to 1 (normal volume).
   *
   * This is a non-destructive operation that only affects playback output, not the audio buffer.
   */
  const toggleMute = useCallback(() => {
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = isMuted ? 1 : 0;
    }
    setIsMuted((prev) => !prev);
  }, [isMuted]);

  /**
   * Uploads the current audio state to the server
   */
  const sendToStation = useCallback(async () => {
    if (!audioBuffer) return;

    try {
      // 1. Get the current state as a Blob
      const wavBlob = audioBufferToWav(audioBuffer);
      
      // 2. Prepare form data
      const formData = new FormData();
      formData.append('audio', wavBlob, 'session-recording.wav');
      
      // 3. Upload (Replace with your actual API endpoint)
      // edit this later
      const response = await fetch('https://upload address', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        alert("Sent to Station Master!");
      } else {
        alert("Upload failed.");
      }
    } catch (err) {
      console.error("Upload error:", err);
      alert("Error sending audio.");
    }
  }, [audioBuffer]);

  /**
   * Update undo/redo button states when history changes
   */
  useEffect(() => {
    setCanUndo(historyStack.length > 0);
    setCanRedo(redoStack.length > 0);
  }, [historyStack.length, redoStack.length]);

  useEffect(() => {
    isPlayingRef.current = playbackState.isPlaying;
    currentTimeRef.current = playbackState.currentTime;
    durationRef.current = playbackState.duration;
  }, [playbackState]);

  useEffect(() => {
    selectionRef.current = selection;
  }, [selection]);

  useEffect(() => {
    audioContextRef.current = audioContext;
  }, [audioContext]);

  useEffect(() => {
    if (audioBuffer) {
      durationRef.current = audioBuffer.duration;
    }
  }, [audioBuffer]);

  useEffect(() => {
    return () => {
      if (sourceNodeRef.current) {
        try {
          sourceNodeRef.current.stop();
          sourceNodeRef.current.disconnect();
        } catch (e) {
          // ignore
        }
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (audioContext) {
        audioContext.close();
      }
    };
  }, [audioContext]);

  /**
   * Clears the current audio and resets the editor to a fresh state.
   */
  const clearAudio = useCallback(() => {
    // 1. Stop playback and disconnect nodes
    cleanupSource();

    // 2. Reset Audio State
    setAudioBuffer(null);
    setFileName(null);
    setCurrentRecordingId(null);
    setSelection(null);

    // 3. Reset Playback State
    setPlaybackState({
      isPlaying: false,
      currentTime: 0,
      duration: 0,
    });
    
    // 4. Reset Refs
    durationRef.current = 0;
    startOffsetRef.current = 0;
    currentTimeRef.current = 0;
    startTimeRef.current = 0;
    isManualStopRef.current = true; // Prevent onended triggers

    // 5. Clear History & Clipboard
    setHistoryStack([]);
    setRedoStack([]);
    setClipboard(null);
    setCanUndo(false);
    setCanRedo(false);
    
    // 6. Reset Mute if desired (optional, but "clean state" implies defaults)
    setIsMuted(false);
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = 1;
    }

    console.log("Audio editor state cleared.");
  }, [cleanupSource]);

  /**
   * AUTO-SAVE: Save to IndexedDB when audioBuffer changes
   */
  useEffect(() => {
    if (!audioBuffer) return;

    const timeoutId = setTimeout(async () => {
      try {
        const wavBlob = audioBufferToWav(audioBuffer);
        await saveProjectAudio(wavBlob, 'current-draft');
      } catch (err) {
        console.error("Auto-save failed:", err);
      }
    }, 1000);

    return () => clearTimeout(timeoutId);
  }, [audioBuffer]);

  return {
    audioBuffer,
    audioContext,
    selection,
    playbackState,
    clipboard,
    isMuted,
    
    // --- NEW: Export fileName ---
    fileName,
    currentRecordingId,
    updateFileName: setFileName,

    canUndo,
    canRedo,

    loadAudioFile,
    loadRecording,
    saveAudio,
    saveToLibrary,
    clearAudio,

    play,
    pause,
    togglePlayPause,
    seekTo,
    seekWithoutResume,
    skipForward,
    skipBackward,

    setSelection,
    clearSelection,

    cut,
    copy,
    paste,
    fadeIn,
    fadeOut,
    volumeUp,
    volumeDown,

    undo,
    redo,
    toggleMute,
  };
}