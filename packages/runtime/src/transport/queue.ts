type IdleCallback = () => void;

interface SchedulerGlobal {
  requestIdleCallback?: (
    callback: IdleCallback,
    options?: { timeout: number },
  ) => number;
  setImmediate?: (callback: IdleCallback) => unknown;
}

/**
 * Schedules transport queue work without assuming a browser runtime.
 */
export function scheduleQueueFlush(callback: IdleCallback): void {
  const scheduler = globalThis as typeof globalThis & SchedulerGlobal;

  if (typeof scheduler.requestIdleCallback === "function") {
    scheduler.requestIdleCallback(callback, { timeout: 250 });
    return;
  }

  if (typeof scheduler.setImmediate === "function") {
    scheduler.setImmediate(callback);
    return;
  }

  setTimeout(callback, 0);
}
