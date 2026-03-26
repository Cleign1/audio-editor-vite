import { useEffect, useState, useCallback } from "react";
import { getRecordings, deleteRecording } from "../lib/db";
import { Play, Trash2, FileAudio, UploadCloud } from "lucide-react";

export function SavedAudioList({ onLoad, refreshTrigger }) {
  const [recordings, setRecordings] = useState([]);
  const [uploadingId, setUploadingId] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState(null);

  const loadRecordings = useCallback(async () => {
    try {
      const list = await getRecordings();
      // Sort by date desc
      list.sort((a, b) => b.createdAt - a.createdAt);
      setRecordings(list);
    } catch (err) {
      console.error("Failed to load recordings", err);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadRecordings();
  }, [loadRecordings, refreshTrigger]);

  const handleDelete = async (id, e) => {
    e.stopPropagation();
    if (window.confirm("Are you sure you want to delete this recording?")) {
      await deleteRecording(id);
      loadRecordings();
    }
  };

  /**
   * Uploads the selected recording to the music server.
   */
  const handleUpload = async (rec, e) => {
    e.stopPropagation();

    if (!rec.blob) {
      alert("Error: No audio data found to upload.");
      return;
    }

    const baseUrl = import.meta.env.VITE_API_URL || "http://localhost:3000";
    const uploadToken =
      import.meta.env.VITE_EDITOR_UPLOAD_TOKEN ||
      import.meta.env.VITE_SOCKET_AUTH_TOKEN ||
      null;
    const fallbackName = rec.name.endsWith(".wav")
      ? rec.name
      : `${rec.name}.wav`;
    const targetFilename = rec.sourceFilename || fallbackName;
    const audioId = rec.id || null;
    const fileType = rec.blob.type || "audio/wav";
    const file = new File([rec.blob], targetFilename, { type: fileType });

    const url =
      `${baseUrl}/api/editor/upload?filename=${encodeURIComponent(targetFilename)}` +
      (audioId ? `&id=${encodeURIComponent(audioId)}` : "");

    setUploadError(null);
    setUploadingId(rec.id);
    setUploadProgress(0);

    try {
      await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", url, true);
        xhr.setRequestHeader("Content-Type", file.type);
        if (targetFilename) xhr.setRequestHeader("x-filename", targetFilename);
        if (audioId) xhr.setRequestHeader("x-audio-id", audioId);
        if (uploadToken) {
          xhr.setRequestHeader("x-editor-token", uploadToken);
          xhr.setRequestHeader("Authorization", `Bearer ${uploadToken}`);
        }

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const percent = Math.round((event.loaded / event.total) * 100);
            setUploadProgress(percent);
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            setUploadProgress(100);
            resolve();
          } else {
            reject(
              new Error(
                `Status ${xhr.status}: ${xhr.responseText || "Upload failed"}`,
              ),
            );
          }
        };

        xhr.onerror = () => {
          reject(new Error("Network error during upload"));
        };

        xhr.send(file);
      });

      alert(`Successfully uploaded "${targetFilename}" to the music server!`);
      setUploadError(null);
    } catch (err) {
      console.error("Upload error:", err);
      setUploadError({ id: rec.id, message: err.message });
      alert(
        `Upload failed: ${err.message}. Is the server running at ${baseUrl}?`,
      );
    } finally {
      setUploadingId(null);
      setUploadProgress(0);
    }
  };

  return (
    <div className="mt-4 border border-green-500/30 rounded-lg bg-gray-900/50 p-4 w-full">
      <h3 className="text-green-400 text-sm font-medium mb-3 flex items-center gap-2">
        <FileAudio size={16} />
        Saved Audio Files
      </h3>

      {recordings.length === 0 ? (
        <div className="text-green-500/70 text-sm text-center py-8 border-2 border-dashed border-green-500/20 rounded-lg">
          Audio are saved here, can be edited or deleted using buttons attached
          to the audio file
        </div>
      ) : (
        <div className="grid gap-2 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
          {recordings.map((rec) => (
            <div
              key={rec.id}
              className="flex items-center justify-between p-3 bg-gray-800 rounded border border-gray-700 hover:border-green-500/50 transition-colors group"
            >
              <div className="flex flex-col overflow-hidden mr-4">
                <span
                  className="text-gray-200 font-medium truncate"
                  title={rec.name}
                >
                  {rec.name}
                </span>
                <span className="text-gray-500 text-xs">
                  {new Date(rec.createdAt).toLocaleString()}
                </span>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => handleUpload(rec, e)}
                    disabled={uploadingId !== null}
                    className={`flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                      uploadingId === rec.id
                        ? "bg-blue-700/40 text-blue-200 cursor-wait"
                        : "bg-blue-900/30 hover:bg-blue-600 text-blue-400 hover:text-white"
                    } ${
                      uploadingId !== null && uploadingId !== rec.id
                        ? "opacity-50 cursor-not-allowed"
                        : ""
                    }`}
                    title="Upload to Music Server"
                  >
                    <UploadCloud size={14} />
                    {uploadingId === rec.id
                      ? `Uploading ${uploadProgress}%`
                      : "Upload"}
                  </button>
                  {uploadError?.id === rec.id && (
                    <button
                      onClick={(e) => handleUpload(rec, e)}
                      className="flex items-center gap-1 px-3 py-1.5 bg-red-900/40 hover:bg-red-700 text-red-300 hover:text-white rounded text-xs font-medium transition-colors"
                      title="Retry upload"
                    >
                      Retry
                    </button>
                  )}
                  <button
                    onClick={() =>
                      onLoad(rec.blob, {
                        name: rec.name,
                        id: rec.id,
                        sourceFilename: rec.sourceFilename || rec.name,
                      })
                    }
                    className="flex items-center gap-1 px-3 py-1.5 bg-green-900/30 hover:bg-green-600 text-green-400 hover:text-white rounded text-xs font-medium transition-colors"
                    title="Load into Editor"
                  >
                    <Play size={14} />
                    Load
                  </button>
                  <button
                    onClick={(e) => handleDelete(rec.id, e)}
                    className="p-2 hover:bg-red-900/50 text-gray-500 hover:text-red-400 rounded-full transition-colors opacity-0 group-hover:opacity-100"
                    title="Delete"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                {uploadingId === rec.id && (
                  <div className="flex flex-col items-end gap-1 w-full">
                    <span className="text-xs text-blue-300">
                      Uploading {uploadProgress}%
                    </span>
                    <div className="w-full min-w-[180px] h-2 rounded bg-blue-900/40 overflow-hidden">
                      <div
                        className="h-full bg-blue-500 transition-[width] duration-200 ease-out"
                        style={{ width: `${Math.min(uploadProgress, 100)}%` }}
                      />
                    </div>
                  </div>
                )}
                {uploadError?.id === rec.id && (
                  <span
                    className="text-xs text-red-400 max-w-[240px] text-right"
                    title={uploadError.message}
                  >
                    {uploadError.message}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
