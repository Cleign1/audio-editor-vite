import { io } from "socket.io-client";

/**
 * Singleton Socket.IO client for the audio editor.
 * - Used to receive tracks from the music server (editor:ingest)
 * - Used to notify the backend when an edited track is saved (editor:saved)
 * - Exposes helpers to request a specific track be pushed to the editor (editor:push_track)
 *
 * NOTE: This module does not auto-connect. Call `connectEditorSocket()` once
 * (e.g., on app start) before using the other helpers.
 */

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:3000";
const DEFAULT_EDITOR_TOKEN =
  import.meta.env.VITE_EDITOR_SOCKET_TOKEN ||
  import.meta.env.VITE_SOCKET_AUTH_TOKEN ||
  null;

const socket = io(SOCKET_URL, {
  autoConnect: false,
  transports: ["websocket"],
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
  auth: DEFAULT_EDITOR_TOKEN
    ? { editorToken: DEFAULT_EDITOR_TOKEN, token: DEFAULT_EDITOR_TOKEN }
    : undefined,
  extraHeaders: DEFAULT_EDITOR_TOKEN
    ? { "x-editor-token": DEFAULT_EDITOR_TOKEN }
    : undefined,
});

/**
 * Connect the editor socket if not already connected.
 */
function applyEditorAuthToken(token) {
  const finalToken = token ?? DEFAULT_EDITOR_TOKEN;
  if (!finalToken) return;
  socket.auth = {
    ...(socket.auth || {}),
    editorToken: finalToken,
    token: finalToken,
  };
  const existingHeaders = socket.io.opts.extraHeaders || {};
  socket.io.opts.extraHeaders = {
    ...existingHeaders,
    "x-editor-token": finalToken,
    "x-token": finalToken,
  };
}

export function connectEditorSocket(authToken) {
  applyEditorAuthToken(authToken);
  if (!socket.connected) {
    socket.connect();
  }
  return socket;
}

export function setEditorAuthToken(token) {
  applyEditorAuthToken(token);
}

/**
 * Get the singleton socket instance.
 */
export function getEditorSocket() {
  return socket;
}

/**
 * Subscribe to ingest events from the backend.
 * Returns an unsubscribe function.
 */
export function onEditorIngest(handler) {
  socket.on("editor:ingest", handler);
  return () => socket.off("editor:ingest", handler);
}

/**
 * Emit a request to push a track (by filename/id) from the music server to this editor.
 */
export function requestEditorTrack({ filename, id }, ack) {
  socket.emit("editor:push_track", { filename, id }, ack);
}

/**
 * Notify backend that an edited file has been saved/overwritten so library can refresh.
 */
export function notifyEditorSaved(payload, ack) {
  socket.emit("editor:saved", payload, ack);
}
