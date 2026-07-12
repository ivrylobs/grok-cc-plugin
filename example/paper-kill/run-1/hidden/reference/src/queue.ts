/**
 * REFERENCE implementation — exists ONLY to calibrate hidden/score.ts (a buggy court is a
 * false license forever). Never shown to any arm, never graded, never compared.
 */
export class TimeoutError extends Error {
  constructor(msg = "Task attempt timed out") {
    super(msg);
    this.name = "TimeoutError";
  }
}
export class QueueClosedError extends Error {
  constructor(msg = "Queue is shut down") {
    super(msg);
    this.name = "QueueClosedError";
  }
}

interface TaskContext {
  signal: AbortSignal;
  attempt: number;
}
interface TaskOptions {
  key?: string;
  priority?: number;
  signal?: AbortSignal;
  timeoutMs?: number;
  retries?: number;
  backoffMs?: number;
}

type State = "queued" | "running" | "backoff";

interface Caller {
  resolve: (v: unknown) => void;
  reject: (e: unknown) => void;
  signal?: AbortSignal;
  onAbort?: () => void;
  aborted: boolean;
}

interface Execution {
  key?: string;
  priority: number;
  seq: number;
  fn: (ctx: TaskContext) => unknown;
  retries: number;
  backoffMs: number;
  timeoutMs?: number;
  attempt: number;
  state: State;
  callers: Caller[];
  attemptController?: AbortController;
  timeoutTimer?: ReturnType<typeof setTimeout>;
  backoffTimer?: ReturnType<typeof setTimeout>;
  token: number; // increments when an attempt is orphaned/cancelled
}

function abortError(): Error {
  return new DOMException("This operation was aborted", "AbortError") as unknown as Error;
}

export class AsyncTaskQueue {
  #concurrency: number;
  #queue: Execution[] = [];
  #running = new Set<Execution>();
  #byKey = new Map<string, Execution>();
  #idleWaiters: (() => void)[] = [];
  #drainWaiters: (() => void)[] = [];
  #closed = false;
  #seq = 0;

  constructor(opts?: { concurrency?: number }) {
    const c = opts?.concurrency ?? 4;
    if (!Number.isInteger(c) || c < 1) throw new RangeError("concurrency must be an integer >= 1");
    this.#concurrency = c;
  }

  run<T>(task: (ctx: TaskContext) => Promise<T> | T, opts: TaskOptions = {}): Promise<T> {
    if (this.#closed) return Promise.reject(new QueueClosedError());
    if (opts.signal?.aborted) return Promise.reject(opts.signal.reason ?? abortError());

    return new Promise<T>((resolve, reject) => {
      const caller: Caller = { resolve: resolve as (v: unknown) => void, reject, signal: opts.signal, aborted: false };

      // Dedup: join an active execution for this key.
      const existing = opts.key !== undefined ? this.#byKey.get(opts.key) : undefined;
      if (existing) {
        existing.callers.push(caller);
        this.#armCallerAbort(existing, caller);
        return;
      }

      const exec: Execution = {
        key: opts.key,
        priority: opts.priority ?? 0,
        seq: this.#seq++,
        fn: task,
        retries: opts.retries ?? 0,
        backoffMs: opts.backoffMs ?? 0,
        timeoutMs: opts.timeoutMs,
        attempt: 0,
        state: "queued",
        callers: [caller],
        token: 0,
      };
      if (exec.key !== undefined) this.#byKey.set(exec.key, exec);
      this.#queue.push(exec);
      this.#armCallerAbort(exec, caller);
      this.#dispatch();
    });
  }

  setConcurrency(n: number): void {
    if (!Number.isInteger(n) || n < 1) throw new RangeError("concurrency must be an integer >= 1");
    this.#concurrency = n;
    this.#dispatch();
  }

  size(): number {
    return this.#queue.length + this.#backoffCount;
  }
  #backoffCount = 0;

  pending(): number {
    return this.#running.size;
  }

  onIdle(): Promise<void> {
    if (this.size() === 0 && this.pending() === 0) return Promise.resolve();
    return new Promise((r) => this.#idleWaiters.push(r));
  }

  shutdown(): Promise<void> {
    this.#closed = true;
    // Reject everything waiting (queued + backoff).
    const waiting = this.#queue.splice(0);
    for (const exec of waiting) this.#settle(exec, "reject", new QueueClosedError());
    for (const exec of [...this.#backoffSet]) {
      clearTimeout(exec.backoffTimer);
      this.#backoffSet.delete(exec);
      this.#backoffCount--;
      this.#settle(exec, "reject", new QueueClosedError());
    }
    this.#checkIdle();
    if (this.#running.size === 0) return Promise.resolve();
    return new Promise((r) => this.#drainWaiters.push(r));
  }
  #backoffSet = new Set<Execution>();

  // ---------- internals ----------

  #armCallerAbort(exec: Execution, caller: Caller) {
    const sig = caller.signal;
    if (!sig) return;
    const onAbort = () => {
      caller.aborted = true;
      caller.reject(sig.reason ?? abortError());
      exec.callers = exec.callers.filter((c) => c !== caller);
      if (exec.callers.length === 0) this.#cancelExecution(exec, sig.reason ?? abortError());
    };
    caller.onAbort = onAbort;
    sig.addEventListener("abort", onAbort, { once: true });
  }

  #cancelExecution(exec: Execution, _reason: unknown) {
    if (exec.state === "queued") {
      const i = this.#queue.indexOf(exec);
      if (i >= 0) this.#queue.splice(i, 1);
      this.#cleanup(exec);
      this.#checkIdle();
    } else if (exec.state === "backoff") {
      clearTimeout(exec.backoffTimer);
      if (this.#backoffSet.delete(exec)) this.#backoffCount--;
      this.#cleanup(exec);
      this.#checkIdle();
    } else if (exec.state === "running") {
      exec.token++; // orphan the in-flight attempt
      clearTimeout(exec.timeoutTimer);
      exec.attemptController?.abort(_reason);
      this.#running.delete(exec);
      this.#cleanup(exec);
      this.#dispatch();
    }
  }

  #dispatch() {
    while (this.#running.size < this.#concurrency && this.#queue.length > 0) {
      let best = 0;
      for (let i = 1; i < this.#queue.length; i++) {
        const a = this.#queue[i], b = this.#queue[best];
        if (a.priority > b.priority || (a.priority === b.priority && a.seq < b.seq)) best = i;
      }
      const exec = this.#queue.splice(best, 1)[0];
      this.#startAttempt(exec);
    }
    this.#checkIdle();
  }

  #startAttempt(exec: Execution) {
    exec.state = "running";
    exec.attempt++;
    const myToken = exec.token;
    const controller = new AbortController();
    exec.attemptController = controller;
    this.#running.add(exec);

    if (exec.timeoutMs !== undefined) {
      exec.timeoutTimer = setTimeout(() => {
        if (exec.token !== myToken) return;
        exec.token++; // orphan
        const err = new TimeoutError();
        controller.abort(err);
        this.#running.delete(exec);
        this.#afterAttemptFailure(exec, err, /*retryable*/ true);
        this.#dispatch();
      }, exec.timeoutMs);
    }

    (async () => exec.fn({ signal: controller.signal, attempt: exec.attempt }))().then(
      (value) => {
        if (exec.token !== myToken) return; // orphaned
        clearTimeout(exec.timeoutTimer);
        this.#running.delete(exec);
        this.#settle(exec, "resolve", value);
        this.#dispatch();
      },
      (err) => {
        if (exec.token !== myToken) return; // orphaned
        clearTimeout(exec.timeoutTimer);
        this.#running.delete(exec);
        this.#afterAttemptFailure(exec, err, /*retryable*/ true);
        this.#dispatch();
      },
    );
  }

  #afterAttemptFailure(exec: Execution, err: unknown, retryable: boolean) {
    if (retryable && exec.attempt <= exec.retries) {
      // wait backoffMs * 2^(attempt-1) before attempt attempt+1
      const delay = exec.backoffMs * Math.pow(2, exec.attempt - 1);
      exec.state = "backoff";
      this.#backoffSet.add(exec);
      this.#backoffCount++;
      exec.backoffTimer = setTimeout(() => {
        if (this.#backoffSet.delete(exec)) this.#backoffCount--;
        exec.seq = this.#seq++; // re-enter behind equal-priority peers
        exec.state = "queued";
        this.#queue.push(exec);
        this.#dispatch();
      }, delay);
    } else {
      this.#settle(exec, "reject", err);
    }
  }

  #settle(exec: Execution, how: "resolve" | "reject", value: unknown) {
    this.#cleanup(exec);
    for (const c of exec.callers) {
      if (c.aborted) continue;
      if (how === "resolve") c.resolve(value);
      else c.reject(value);
    }
    exec.callers = [];
  }

  #cleanup(exec: Execution) {
    if (exec.key !== undefined && this.#byKey.get(exec.key) === exec) this.#byKey.delete(exec.key);
    clearTimeout(exec.timeoutTimer);
    for (const c of exec.callers) {
      if (c.signal && c.onAbort) c.signal.removeEventListener("abort", c.onAbort);
    }
  }

  #checkIdle() {
    if (this.size() === 0 && this.pending() === 0) {
      const idle = this.#idleWaiters.splice(0);
      for (const w of idle) w();
    }
    if (this.#running.size === 0 && this.#closed) {
      const drain = this.#drainWaiters.splice(0);
      for (const w of drain) w();
    }
  }
}
