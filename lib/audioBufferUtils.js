/**
 * Cuts a section from an AudioBuffer and returns both the new buffer
 * and the removed portion.
 *
 * @param {AudioBuffer} sourceBuffer - The buffer to cut from.
 * @param {number} startSample - The starting sample index of the cut.
 * @param {number} endSample - The ending sample index of the cut.
 * @returns {{
 *   newBuffer: AudioBuffer,
 *   cutBuffer: AudioBuffer
 * }}
 */

/**
 * Converts a time-based selection into sample indices.
 *
 * @param {{ startTime: number, endTime: number }} selection
 * @param {number} sampleRate
 * @returns {{ startSample: number, endSample: number }}
 */
export function getSelectionSamples(selection, sampleRate) {
  const startSample = Math.floor(selection.startTime * sampleRate);
  const endSample = Math.floor(selection.endTime * sampleRate);
  return { startSample, endSample };
}

/**
 * Saves an AudioBuffer as a WAV file and triggers download.
 *
 * @param {AudioBuffer} buffer
 * @param {string} filename
 */
export function saveAudioBufferAsWav(buffer, filename) {
  const blob = audioBufferToWav(buffer);
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();

  URL.revokeObjectURL(url);
}

export function cutBufferSection(sourceBuffer, startSample, endSample) {
  const numChannels = sourceBuffer.numberOfChannels;
  const sampleRate = sourceBuffer.sampleRate;

  const cutLength = endSample - startSample;
  const newLength = sourceBuffer.length - cutLength;

  const audioContext = new AudioContext();

  const newBuffer = audioContext.createBuffer(
    numChannels,
    newLength,
    sampleRate
  );

  const cutBuffer = audioContext.createBuffer(
    numChannels,
    cutLength,
    sampleRate
  );

  for (let channel = 0; channel < numChannels; channel++) {
    const sourceData = sourceBuffer.getChannelData(channel);
    const newData = newBuffer.getChannelData(channel);
    const cutData = cutBuffer.getChannelData(channel);

    // Copy cut section
    cutData.set(sourceData.subarray(startSample, endSample));

    // Copy data before cut
    newData.set(sourceData.subarray(0, startSample), 0);

    // Copy data after cut
    newData.set(
      sourceData.subarray(endSample),
      startSample
    );
  }

  return { newBuffer, cutBuffer };
}

/**
 * Converts an AudioBuffer into a WAV Blob.
 *
 * @param {AudioBuffer} buffer
 * @returns {Blob}
 */
export function audioBufferToWav(buffer) {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const length = buffer.length * numChannels * 2 + 44;

  const arrayBuffer = new ArrayBuffer(length);
  const view = new DataView(arrayBuffer);

  writeString(view, 0, "RIFF");
  view.setUint32(4, length - 8, true);
  writeString(view, 8, "WAVE");

  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * 2, true);
  view.setUint16(32, numChannels * 2, true);
  view.setUint16(34, 16, true);

  writeString(view, 36, "data");
  view.setUint32(40, length - 44, true);

  let offset = 44;

  for (let i = 0; i < buffer.length; i++) {
    for (let channel = 0; channel < numChannels; channel++) {
      let sample = buffer.getChannelData(channel)[i];
      sample = Math.max(-1, Math.min(1, sample));
      view.setInt16(offset, sample * 0x7fff, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: "audio/wav" });
}

/**
 * Helper function to write a string into a DataView at a specific offset.
 *
 * @param {DataView} view
 * @param {number} offset
 * @param {string} string
 */
function writeString(view, offset, string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}
