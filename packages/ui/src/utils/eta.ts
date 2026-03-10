/**
 * Shared ETA calculation utilities
 */

/** Sample point for ETA calculation */
export interface ETASample {
  time: number;
  value: number;
}

/** ETA calculation result */
export interface ETAResult {
  /** Estimated seconds remaining, or null if insufficient data */
  seconds: number | null;
  /** Formatted ETA string (e.g., "1:30", "2:15:30", "--:--") */
  formatted: string;
}

/**
 * Calculate ETA from a buffer of samples
 *
 * @param buffer - Array of {time, value} samples
 * @param current - Current progress value
 * @param total - Total target value
 * @returns ETA in seconds (null if insufficient data)
 *
 * @example
 * ```ts
 * const buffer = [
 *   { time: 1000, value: 0 },
 *   { time: 2000, value: 10 },
 * ];
 * const eta = calculateETA(buffer, 10, 100);
 * // eta = 9 (9 seconds remaining at 10 items/sec)
 * ```
 */
export function calculateETA(buffer: ETASample[], current: number, total: number): number | null {
  if (buffer.length < 2) {
    return null;
  }

  const first = buffer[0]!;
  const last = buffer[buffer.length - 1]!;

  const elapsed = (last.time - first.time) / 1000; // seconds
  const progress = last.value - first.value;

  if (elapsed <= 0 || progress <= 0) {
    return null;
  }

  const rate = progress / elapsed; // items per second
  const remaining = total - current;

  return remaining / rate;
}

/**
 * Format ETA seconds as human-readable string
 *
 * @param eta - ETA in seconds (null for unknown)
 * @returns Formatted string (e.g., "1:30", "2:15:30", "--:--", ">1d")
 *
 * @example
 * ```ts
 * formatETA(90)    // "1:30"
 * formatETA(3665)  // "1:01:05"
 * formatETA(null)  // "--:--"
 * formatETA(100000) // ">1d"
 * ```
 */
export function formatETA(eta: number | null): string {
  if (eta === null || !isFinite(eta)) {
    return "--:--";
  }

  if (eta > 86400) {
    // > 24 hours
    return ">1d";
  }

  const hours = Math.floor(eta / 3600);
  const minutes = Math.floor((eta % 3600) / 60);
  const seconds = Math.floor(eta % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/**
 * Calculate and format ETA in one call
 *
 * @param buffer - Array of {time, value} samples
 * @param current - Current progress value
 * @param total - Total target value
 * @returns Object with seconds (number|null) and formatted string
 */
export function getETA(buffer: ETASample[], current: number, total: number): ETAResult {
  const seconds = calculateETA(buffer, current, total);
  return {
    seconds,
    formatted: formatETA(seconds),
  };
}

/** Default buffer size for ETA smoothing */
export const DEFAULT_ETA_BUFFER_SIZE = 10;

/**
 * Create an ETA tracker with automatic buffer management
 *
 * @param bufferSize - Number of samples to keep (default: 10)
 * @returns ETA tracker object
 *
 * @example
 * ```ts
 * const tracker = createETATracker();
 * tracker.record(0);
 * // ... later ...
 * tracker.record(50);
 * const eta = tracker.getETA(50, 100);
 * console.log(eta.formatted); // "0:30"
 * ```
 */
export function createETATracker(bufferSize = DEFAULT_ETA_BUFFER_SIZE) {
  const buffer: ETASample[] = [];

  return {
    /** Record a new sample */
    record(value: number): void {
      buffer.push({ time: Date.now(), value });
      if (buffer.length > bufferSize) {
        buffer.shift();
      }
    },

    /** Get current ETA */
    getETA(current: number, total: number): ETAResult {
      return getETA(buffer, current, total);
    },

    /** Reset the buffer */
    reset(): void {
      buffer.length = 0;
    },

    /** Get buffer for external use */
    getBuffer(): readonly ETASample[] {
      return buffer;
    },
  };
}
