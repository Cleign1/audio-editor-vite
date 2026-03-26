/* eslint-disable no-unused-vars */
import React from "react";
import {
  Scissors,
  Copy,
  Clipboard,
  ZoomIn,
  ZoomOut,
  Volume1,
  Volume2,
  Eraser,
  RotateCcw,
  RefreshCcw,
  RotateCw,
  Trash2,
} from "lucide-react";

/**
 * ControlButton Component
 *
 * Reusable circular icon button for toolbar controls.
 */
const ControlButton = ({
  onClick,
  disabled = false,
  icon: Icon,
  title,
}) => (
  <button
    className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200 
      ${
        disabled
          ? "bg-gray-700 text-gray-500 cursor-not-allowed"
          : "bg-linear-to-br from-teal-400 to-green-500 hover:from-teal-500 hover:to-green-600 text-white shadow-md active:scale-95"
      }`}
    onClick={onClick}
    disabled={disabled}
    title={title}
  >
    <Icon size={16} />
  </button>
);

/**
 * EditToolbar Component
 */
export function EditToolbar({
  hasSelection,
  hasClipboard,
  canUndo,
  canRedo,
  canZoomOut,
  currentTime,
  onClearSelection,
  onCut,
  onCopy,
  onPaste,
  onVolumeDecrease,
  onVolumeIncrease,
  onZoomIn,
  onZoomOut,
  onUndo,
  onRedo,
  onReset,
  onClearAudio,
}) {
  return (
    <div className="flex items-center justify-between gap-4 flex-wrap">
      {/* Time Display */}
      <div className="w-full sm:w-auto text-center sm:text-left text-white font-mono text-xl min-w-25">
        {currentTime}
      </div>

      {/* Toolbar Controls */}
      <div className="flex flex-wrap items-center justify-center sm:justify-end gap-2">
        {/* Selection */}
        <ControlButton
          onClick={onClearSelection}
          disabled={!hasSelection}
          icon={Eraser}
          title="Clear Selection"
        />

        <div className="w-px h-8 bg-gray-700 mx-1" />

        {/* Clipboard */}
        <ControlButton
          onClick={onCut}
          disabled={!hasSelection}
          icon={Scissors}
          title="Cut"
        />
        <ControlButton
          onClick={onCopy}
          disabled={!hasSelection}
          icon={Copy}
          title="Copy"
        />
        <ControlButton
          onClick={onPaste}
          disabled={!hasClipboard}
          icon={Clipboard}
          title="Paste"
        />

        <div className="w-px h-8 bg-gray-700 mx-1" />

        {/* Volume */}
        <ControlButton
          onClick={onVolumeDecrease}
          disabled={!hasSelection}
          icon={Volume1}
          title="Decrease Volume (-10%)"
        />
        <ControlButton
          onClick={onVolumeIncrease}
          disabled={!hasSelection}
          icon={Volume2}
          title="Increase Volume (+20%)"
        />

        <div className="w-px h-8 bg-gray-700 mx-1" />

        {/* Zoom */}
        <ControlButton
          onClick={onZoomIn}
          icon={ZoomIn}
          title="Zoom In"
        />
        <ControlButton
          onClick={onZoomOut}
          disabled={!canZoomOut}
          icon={ZoomOut}
          title="Zoom Out"
        />

        <div className="w-px h-8 bg-gray-700 mx-1" />

        {/* History */}
        <ControlButton
          onClick={onUndo}
          disabled={!canUndo}
          icon={RotateCcw}
          title={canUndo ? "Undo last edit" : "No edits to undo"}
        />
        <ControlButton
          onClick={onRedo}
          disabled={!canRedo}
          icon={RotateCw}
          title={canRedo ? "Redo last undone edit" : "No edits to redo"}
        />

        <div className="w-px h-8 bg-gray-700 mx-1" />

        {/* Reset */}
        <ControlButton
          onClick={onReset}
          icon={RefreshCcw}
          title="Reset View & Selection"
        />

        <div className="w-px h-8 bg-gray-700 mx-1" />

        {/* Clear Audio */}
        <ControlButton
          onClick={onClearAudio}
          icon={Trash2}
          title="Clear Audio"
        />
      </div>
    </div>
  );
}
