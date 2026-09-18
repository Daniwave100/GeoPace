// Small helpers for the parallel columns a Course Bundle stores its course line in.

/** Index of the value in a sorted array closest to `value`. Binary search: scrubbing calls it a lot. */
export function nearestIndex(sorted: number[], value: number): number {
  let low = 0;
  let high = sorted.length - 1;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (sorted[mid] < value) low = mid + 1;
    else high = mid;
  }
  return low > 0 && Math.abs(sorted[low - 1] - value) < Math.abs(sorted[low] - value) ? low - 1 : low;
}

export function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high);
}
