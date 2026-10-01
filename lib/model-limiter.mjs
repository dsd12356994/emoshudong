/**
 * Small in-memory limiter for expensive model calls.
 * It intentionally does not persist request bodies or queue work: a process
 * restart clears the queue and keeps sensitive conversations out of storage.
 */
export class LimiterError extends Error {
  constructor(message = "小院现在有点拥挤，请稍后再试。") {
    super(message);
    this.code = "overloaded";
    this.status = 429;
    this.retryAfter = 5;
  }
}

export class LimiterAbortedError extends Error {
  constructor() {
    super("请求已取消。");
    this.code = "aborted";
  }
}

export function createModelLimiter({
  concurrency = 2,
  pendingLimit = 6,
  waitMs = 15000,
} = {}) {
  if (!Number.isInteger(concurrency) || concurrency < 1)
    throw new Error("Invalid limiter concurrency");
  if (!Number.isInteger(pendingLimit) || pendingLimit < 0)
    throw new Error("Invalid limiter pending limit");
  if (!Number.isInteger(waitMs) || waitMs < 1)
    throw new Error("Invalid limiter wait time");

  let active = 0;
  const queue = [];
  const activeByKey = new Map();

  const remove = (job) => {
    const index = queue.indexOf(job);
    if (index !== -1) queue.splice(index, 1);
    clearTimeout(job.timer);
  };

  const lease = (key) => {
    active++;
    activeByKey.set(key, (activeByKey.get(key) || 0) + 1);
    let released = false;
    return {
      release() {
        if (released) return;
        released = true;
        active--;
        const count = (activeByKey.get(key) || 1) - 1;
        if (count > 0) activeByKey.set(key, count);
        else activeByKey.delete(key);
        drain();
      },
    };
  };

  function drain() {
    while (active < concurrency) {
      const index = queue.findIndex(
        (job) => !(activeByKey.get(job.key) || 0),
      );
      if (index === -1) return;
      const job = queue.splice(index, 1)[0];
      clearTimeout(job.timer);
      if (job.signal?.aborted) {
        job.reject(new LimiterAbortedError());
        continue;
      }
      job.resolve(lease(job.key));
    }
  }

  function acquire(key, { signal } = {}) {
    if (signal?.aborted) return Promise.reject(new LimiterAbortedError());
    if (!(activeByKey.get(key) || 0) && active < concurrency)
      return Promise.resolve(lease(key));
    const keyQueued = queue.some((job) => job.key === key);
    if (keyQueued || queue.length >= pendingLimit)
      return Promise.reject(new LimiterError());
    return new Promise((resolve, reject) => {
      const job = { key, resolve, reject, signal, timer: null };
      const onAbort = () => {
        remove(job);
        reject(new LimiterAbortedError());
      };
      if (signal) signal.addEventListener("abort", onAbort, { once: true });
      job.timer = setTimeout(() => {
        remove(job);
        reject(new LimiterError("排队时间有点久，请稍后重新寄出。"));
      }, waitMs);
      queue.push(job);
    });
  }

  return {
    acquire,
    snapshot: () => ({ active, pending: queue.length }),
  };
}
