/**
 * Calculates the min and max amplitude of a block of audio samples.
 *
 * @param {Float32Array} samples
 * @returns {{ min: number, max: number }}
 */
export function calculatePeak(samples) {
  let min = 1.0;
  let max = -1.0;

  for (let i = 0; i < samples.length; i++) {
    const value = samples[i];
    if (value < min) min = value;
    if (value > max) max = value;
  }

  return { min, max };
}

/**
 * Reduces raw audio samples into peak blocks for visualization.
 *
 * @param {Float32Array} samples
 * @param {number} [blockSize=512]
 * @returns {{ min: number, max: number }[]}
 */
export function batchCalculatePeaks(samples, blockSize = 512) {
  const peaks = [];

  for (let i = 0; i < samples.length; i += blockSize) {
    const blockEnd = Math.min(i + blockSize, samples.length);
    const block = samples.subarray(i, blockEnd);
    peaks.push(calculatePeak(block));
  }

  return peaks;
}
