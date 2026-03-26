/* eslint-disable react-hooks/set-state-in-effect */
import React, { useState, useEffect } from "react";
import { Edit2, Check, X, Clock, FileAudio } from "lucide-react";
import { formatTime } from "./utils"; 

export function TrackMetadataOverlay({
  title,
  artist,
  duration,
  onSave,
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({ title, artist });

  useEffect(() => {
    setFormData({ title, artist });
  }, [title, artist]);

  const handleSave = () => {
    onSave(formData);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setFormData({ title, artist });
    setIsEditing(false);
  };

  // LAYOUT: Relative (not absolute), Full Width, Margin Bottom
  return (
    <div className="w-full flex items-start justify-between mb-2 px-1">
      
      {/* LEFT: TITLE & ARTIST (The "Container on the Top Left") */}
      <div className="flex-1 max-w-2xl">
        {isEditing ? (
          /* EDIT MODE: Inline Form */
          <div className="flex items-start gap-3 bg-gray-800 p-2 rounded border border-gray-600 animate-in fade-in slide-in-from-top-1">
             <div className="space-y-2 flex-1">
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="Track Title"
                  className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-white font-bold focus:border-emerald-500 outline-none"
                  autoFocus
                />
                <input
                  type="text"
                  value={formData.artist}
                  onChange={(e) => setFormData({ ...formData, artist: e.target.value })}
                  placeholder="Artist Name"
                  className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-gray-300 focus:border-emerald-500 outline-none"
                />
             </div>
             
             {/* Action Buttons */}
             <div className="flex flex-col gap-2">
                <button onClick={handleSave} className="p-1.5 bg-emerald-600 hover:bg-emerald-500 rounded text-white" title="Save">
                   <Check size={14} />
                </button>
                <button onClick={handleCancel} className="p-1.5 bg-gray-700 hover:bg-gray-600 rounded text-white" title="Cancel">
                   <X size={14} />
                </button>
             </div>
          </div>
        ) : (
          /* VIEW MODE: Clean Text */
          <div className="group flex items-start gap-3">
             {/* Icon */}
             <div className="mt-1 p-2 bg-gray-800 rounded text-emerald-500">
                <FileAudio size={20} />
             </div>

             <div className="flex flex-col">
                <div className="flex items-center gap-2">
                   <h3 
                     onClick={() => setIsEditing(true)}
                     className="text-lg font-bold text-white cursor-pointer hover:text-emerald-400 transition-colors border-b border-transparent hover:border-emerald-400/50"
                     title="Click to Edit"
                   >
                     {title || "Untitled Project"}
                   </h3>
                   <button 
                      onClick={() => setIsEditing(true)}
                      className="text-gray-500 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
                   >
                      <Edit2 size={12} />
                   </button>
                </div>
                <p className="text-sm text-gray-400 font-medium cursor-pointer" onClick={() => setIsEditing(true)}>
                   {artist || "Unknown Artist"}
                </p>
             </div>
          </div>
        )}
      </div>

      {/* RIGHT: DURATION BADGE */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-900 rounded-full border border-gray-800 text-emerald-500 font-mono text-xs">
        <Clock size={12} />
        <span>{formatTime(duration)}</span>
      </div>
    </div>
  );
}