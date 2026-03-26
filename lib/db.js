// audio-editor-vite/lib/db.js
import { openDB } from 'idb';

const DB_NAME = 'AudioEditorDB';
const STORE_NAME = 'projects';
const RECORDINGS_STORE = 'recordings';
const DB_VERSION = 2;

/**
 * Initializes the IndexedDB database.
 */
export const initDB = async () => {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // Create a store named 'projects' if it doesn't exist
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
      
      // Create 'recordings' store if it doesn't exist
      if (!db.objectStoreNames.contains(RECORDINGS_STORE)) {
        db.createObjectStore(RECORDINGS_STORE, { keyPath: 'id' });
      }
    },
  });
};

/**
 * Saves the current audio state (AudioBuffer as a Blob) to IndexedDB.
 * @param {Blob} audioBlob - The WAV/Audio Blob to save.
 * @param {string} projectId - Unique ID for the project (e.g., 'current-draft').
 */
export async function saveProjectAudio(audioBlob, projectId = 'current-draft') {
  try {
    const db = await initDB();
    await db.put(STORE_NAME, audioBlob, projectId);
    console.log('Saved to IndexedDB:', projectId, audioBlob.size, 'bytes');
  } catch (error) {
    console.error('Failed to save to IndexedDB:', error);
  }
}

/**
 * Retrieves the audio state from IndexedDB.
 * @param {string} projectId - Unique ID for the project.
 * @returns {Promise<Blob|undefined>} The saved Audio Blob.
 */
export async function getProjectAudio(projectId = 'current-draft') {
  try {
    const db = await initDB();
    return await db.get(STORE_NAME, projectId);
  } catch (error) {
    console.error('Failed to load from IndexedDB:', error);
  }
}

/**
 * Saves a recording to the recordings store.
 * Checks if a recording with the same name exists:
 * - If YES: Overwrites it with new data and updates the description/timestamp.
 * - If NO: Creates a new recording.
 * * @param {Object} recording - The recording object { id, name, blob, createdAt, duration }.
 */
export async function saveRecording(recording) {
  try {
    const db = await initDB();
    
    // Check for existing recording with the same name
    const allRecordings = await db.getAll(RECORDINGS_STORE);
    const existing = allRecordings.find(r => r.name === recording.name);

    if (existing) {
      // OVERWRITE EXISTING
      const updatedRecording = {
        ...existing,         // Keep original properties (like original createdAt)
        ...recording,        // Apply new data (blob, duration)
        id: existing.id,     // CRITICAL: Force same ID to perform update, not insert
        updatedAt: new Date().toISOString(),
        description: `Updated version: ${new Date().toLocaleString()}` 
      };

      await db.put(RECORDINGS_STORE, updatedRecording);
      console.log('Overwrote existing recording:', updatedRecording.name);
    } else {
      // CREATE NEW
      // Ensure it has a description if one wasn't provided
      const newRecording = {
        ...recording,
        description: recording.description || `Created at ${new Date().toLocaleString()}`
      };
      
      await db.put(RECORDINGS_STORE, newRecording);
      console.log('Saved new recording to IndexedDB:', newRecording.id);
    }
  } catch (error) {
    console.error('Failed to save recording to IndexedDB:', error);
  }
}

/**
 * Retrieves all saved recordings.
 * @returns {Promise<Array>} List of recordings.
 */
export async function getRecordings() {
  try {
    const db = await initDB();
    return await db.getAll(RECORDINGS_STORE);
  } catch (error) {
    console.error('Failed to load recordings from IndexedDB:', error);
    return [];
  }
}

/**
 * Deletes a recording by ID.
 * @param {string} id - The ID of the recording to delete.
 */
export async function deleteRecording(id) {
  try {
    const db = await initDB();
    await db.delete(RECORDINGS_STORE, id);
    console.log('Deleted recording from IndexedDB:', id);
  } catch (error) {
    console.error('Failed to delete recording from IndexedDB:', error);
  }
}