import { useEffect } from "react";

/**
 * Custom hook for handling keyboard shortcuts in the audio editor.
 * Provides professional keyboard shortcuts for common audio editing operations.
 *
 * @param {Object} params
 * @param {Function} params.onPlayPause
 * @param {Function} params.onUndo
 * @param {Function} params.onRedo
 * @param {Function} params.onCut
 * @param {Function} params.onCopy
 * @param {Function} params.onPaste
 * @param {Function} params.onDelete
 * @param {Function} params.onZoomIn
 * @param {Function} params.onZoomOut
 * @param {Function} params.onSkipForward
 * @param {Function} params.onSkipBackward
 * @param {boolean} params.canUndo
 * @param {boolean} params.canRedo
 */
export function useKeyboardShortcuts({
  onPlayPause,
  onUndo,
  onRedo,
  onCut,
  onCopy,
  onPaste,
  onDelete,
  onZoomIn,
  onZoomOut,
  onSkipForward,
  onSkipBackward,
  canUndo,
  canRedo,
}) {
  useEffect(() => {
    /**
     * Keyboard Event Handler
     */
    const handleKeyDown = (e) => {
      // Ignore shortcuts while typing in inputs/textareas
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      // SPACE: Play / Pause
      if (e.code === "Space") {
        e.preventDefault();
        onPlayPause();
        return;
      }

      // ARROW KEYS: Skip
      if (e.code === "ArrowLeft") {
        e.preventDefault();
        onSkipBackward();
        return;
      }

      if (e.code === "ArrowRight") {
        e.preventDefault();
        onSkipForward();
        return;
      }

      // CMD / CTRL shortcuts
      if (e.metaKey || e.ctrlKey) {
        switch (e.key.toLowerCase()) {
          case "z":
            e.preventDefault();
            if (e.shiftKey) {
              if (canRedo) onRedo();
            } else {
              if (canUndo) onUndo();
            }
            break;

          case "x":
            e.preventDefault();
            onCut();
            break;

          case "c":
            e.preventDefault();
            onCopy();
            break;

          case "v":
            e.preventDefault();
            onPaste();
            break;

          // Zoom In
          case "=":
          case "+":
            e.preventDefault();
            onZoomIn();
            break;

          // Zoom Out
          case "-":
          case "_":
            e.preventDefault();
            onZoomOut();
            break;

          default:
            break;
        }
      }

      // DELETE / BACKSPACE
      if (e.key === "Delete" || e.key === "Backspace") {
        onDelete();
      }
    };

    /**
     * Wheel Event Handler (Pinch Zoom)
     */
    const handleWheel = (e) => {
      if (e.ctrlKey) {
        e.preventDefault();

        if (e.deltaY < 0) {
          onZoomIn();
        } else {
          onZoomOut();
        }
      }
    };

    // Register listeners
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("wheel", handleWheel, { passive: false });

    // Cleanup
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("wheel", handleWheel);
    };
  }, [
    onPlayPause,
    onUndo,
    onRedo,
    onCut,
    onCopy,
    onPaste,
    onDelete,
    onZoomIn,
    onZoomOut,
    onSkipForward,
    onSkipBackward,
    canUndo,
    canRedo,
  ]);
}
