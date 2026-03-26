/**
 * RecorderSidebar Component
 *
 * A dedicated left sidebar containing recording controls.
 * Features:
 * - Audio Level Meter (LED style)
 * - Record Button
 * - Input/Output Device Selectors
 */

import React, { useState } from "react";
import {
  Mic,
  Square,
  AlertCircle,
  Disc,
  CircleDot,
  ChevronDown,
  MicIcon,
  Volume2,
} from "lucide-react";

import { useRecordingContext } from "../context/RecordingContext";
import { AudioLevelMeter } from "./AudioLevelMeter";

/**
 * RecorderSidebar - Left sidebar component for audio recording
 */
export function RecorderSidebar({ onRecordingComplete }) {
  // Get recording state and controls from context
  const {
    recordingState,
    isPlaybackActive,
    startRecording,
    stopRecording,
    devices,
    selectedInputId,
    selectedOutputId,
    setInputDevice,
    setOutputDevice,
    analyserNode,
  } = useRecordingContext();

  const [isStereo, setIsStereo] = useState(false);

  /**
   * Handles the record button toggle
   */
  const handleRecordToggle = async () => {
    try {
      if (recordingState.isRecording) {
        // Stop recording
        const blob = await stopRecording();

        if (blob && blob.size > 0) {
          await onRecordingComplete(blob, isStereo);
        } else {
          console.error("Recording failed: Generated blob was empty.");
        }
      } else {
        // Start recording
        await startRecording({ channels: isStereo ? 2 : 1 });
      }
    } catch (error) {
      console.error("Error toggling record state:", error);
    }
  };

  const isDisabled =
    recordingState.isInitializing || isPlaybackActive;

  return (
    <div className="w-64 h-full bg-gray-900 border-r border-gray-700 flex flex-col p-6">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-white mb-2">
          Recording
        </h2>
        <p className="text-sm text-gray-400">
          Capture audio from your microphone
        </p>
      </div>

      {/* Channel Selector */}
      <div className="mb-8 bg-gray-800 p-1 rounded-lg flex">
        <button
          onClick={() =>
            !recordingState.isRecording && setIsStereo(false)
          }
          disabled={recordingState.isRecording}
          className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-medium rounded-md transition-all ${
            !isStereo
              ? "bg-gray-700 text-white shadow-sm"
              : "text-gray-400 hover:text-white"
          }`}
        >
          <CircleDot size={14} />
          Mono
        </button>

        <button
          onClick={() =>
            !recordingState.isRecording && setIsStereo(true)
          }
          disabled={recordingState.isRecording}
          className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-medium rounded-md transition-all ${
            isStereo
              ? "bg-indigo-600 text-white shadow-sm"
              : "text-gray-400 hover:text-white"
          }`}
        >
          <Disc size={14} />
          Stereo
        </button>
      </div>

      {/* Record Button & Meter */}
      <div className="mb-8 flex justify-center items-center gap-4">
        {/* Audio Meter */}
        <div className="flex gap-1 h-24">
          <AudioLevelMeter
            analyserNode={analyserNode}
            isRecording={recordingState.isRecording}
          />
          {isStereo && (
            <AudioLevelMeter
              analyserNode={analyserNode}
              isRecording={recordingState.isRecording}
            />
          )}
        </div>

        {/* Record Button */}
        <button
          onClick={handleRecordToggle}
          disabled={isDisabled}
          title={isStereo ? "Record Stereo" : "Record Mono"}
          className={`
            w-24 h-24 rounded-full flex items-center justify-center
            transition-all duration-200 shadow-lg shrink-0
            ${
              recordingState.isRecording
                ? "bg-gradient-to-br from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 animate-pulse"
                : isDisabled
                ? "bg-gray-700 cursor-not-allowed"
                : "bg-gradient-to-br from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 hover:scale-105 active:scale-95"
            }
          `}
        >
          {recordingState.isRecording ? (
            <Square size={32} className="text-white" />
          ) : (
            <div className="relative">
              <Mic size={32} className="text-white" />
              {isStereo && (
                <span className="absolute -top-1 -right-2 bg-indigo-500 text-[8px] px-1 rounded text-white font-bold">
                  2CH
                </span>
              )}
            </div>
          )}
        </button>
      </div>

      {/* Device Selectors */}
      <div className="w-full space-y-3">
        {/* Input Device */}
        <div className="relative">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
            <MicIcon size={14} />
          </div>
          <select
            value={selectedInputId}
            onChange={(e) => setInputDevice(e.target.value)}
            disabled={recordingState.isRecording}
            className="w-full bg-gray-800 border border-gray-700 text-gray-200 text-xs rounded-md py-2 pl-9 pr-8 appearance-none focus:outline-none focus:border-indigo-500 truncate"
          >
            {devices.inputs.length === 0 && (
              <option>Default Microphone</option>
            )}
            {devices.inputs.map((device) => (
              <option
                key={device.deviceId}
                value={device.deviceId}
              >
                {device.label ||
                  `Microphone ${device.deviceId.slice(
                    0,
                    5
                  )}...`}
              </option>
            ))}
          </select>
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
            <ChevronDown size={14} />
          </div>
        </div>

        {/* Output Device */}
        <div className="relative">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
            <Volume2 size={14} />
          </div>
          <select
            value={selectedOutputId}
            onChange={(e) => setOutputDevice(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 text-gray-200 text-xs rounded-md py-2 pl-9 pr-8 appearance-none focus:outline-none focus:border-indigo-500 truncate"
          >
            {devices.outputs.length === 0 && (
              <option>Default Speaker</option>
            )}
            {devices.outputs.map((device) => (
              <option
                key={device.deviceId}
                value={device.deviceId}
              >
                {device.label ||
                  `Speaker ${device.deviceId.slice(
                    0,
                    5
                  )}...`}
              </option>
            ))}
          </select>
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
            <ChevronDown size={14} />
          </div>
        </div>
      </div>

      {/* Status */}
      <div className="mb-6 text-center">
        {recordingState.isInitializing && (
          <p className="text-yellow-400 text-sm p-5">
            Initializing microphone...
          </p>
        )}

        {recordingState.isRecording && (
          <div className="flex items-center justify-center gap-2">
            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            <p className="text-red-400 text-sm font-medium">
              Recording ({isStereo ? "Stereo" : "Mono"})
            </p>
          </div>
        )}

        {isPlaybackActive && (
          <p className="text-gray-400 text-sm p-5">
            Ready to record{" "}
            <span className="text-gray-500 text-xs">
              ({isStereo ? "Stereo" : "Mono"})
            </span>
          </p>
        )}

        {!recordingState.isRecording &&
          !recordingState.isInitializing &&
          !isPlaybackActive && (
            <p className="text-gray-400 text-sm p-5">
              Ready to record
            </p>
          )}
      </div>

      {/* Error */}
      {recordingState.error && (
        <div className="mb-6 p-3 bg-red-900/30 border border-red-700/50 rounded-lg">
          <div className="flex items-start gap-2">
            <AlertCircle
              size={16}
              className="text-red-400 mt-0.5 flex-shrink-0"
            />
            <div>
              <p className="text-red-300 text-sm font-medium">
                Recording Error
              </p>
              <p className="text-red-200 text-xs mt-1">
                {recordingState.error}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Tips */}
      <div className="mt-6 p-3 bg-gray-800/50 rounded-lg">
        <h4 className="text-xs font-medium text-gray-300 mb-2">
          Tips
        </h4>
        <ul className="text-xs text-gray-400 space-y-1">
          <li>• Select <strong>Stereo</strong> for instruments</li>
          <li>• Recording stops automatically during playback</li>
          <li>• Recorded audio will load into the editor</li>
        </ul>
      </div>
    </div>
  );
}
