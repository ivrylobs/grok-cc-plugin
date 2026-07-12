# Problem P1 — AsyncTaskQueue

Build a production-quality, in-memory async task queue library in **TypeScript**, runnable
under **Bun >= 1.0**, with **zero runtime dependencies**.

This is a library, not a service. There is no HTTP, no database, no framework. Judge every
design decision by how a maintainer of this file will experience it in six months.

## Deliverable

A directory containing:

- `src/queue.ts` — the implementation. You may add helper files under `src/` if you want.
- `NOTES.md` (optional, max 40 lines) — decisions you made on edges the spec leaves open.

`src/queue.ts` must export exactly:

```ts
export class AsyncTaskQueue { ... }
export class TimeoutError extends Error { ... }     // error.name === "TimeoutError"
export class QueueClosedError extends Error { ... } // error.name === "QueueClosedError"
```

Do not write your own test files into the deliverable directory. You may test however you
like elsewhere; acceptance is scored by a hidden suite you will not see.

## API

```ts
interface TaskContext {
  signal: AbortSignal; // aborts when this attempt should stop (timeout, caller abort)
  attempt: number;     // 1 for the first attempt, 2 for the first retry, ...
}

interface TaskOptions {
  key?: string;        // deduplication key (see Dedup)
  priority?: number;   // default 0; higher runs earlier; may be negative
  signal?: AbortSignal;// caller-side cancellation
  timeoutMs?: number;  // per-attempt timeout
  retries?: number;    // default 0; max ADDITIONAL attempts after a failure
  backoffMs?: number;  // default 0; base backoff delay between attempts
}

class AsyncTaskQueue {
  constructor(opts?: { concurrency?: number }); // default 4; integer >= 1
  run<T>(task: (ctx: TaskContext) => Promise<T> | T, opts?: TaskOptions): Promise<T>;
  setConcurrency(n: number): void;              // integer >= 1
  size(): number;     // executions waiting to start (queued + waiting out a retry backoff)
  pending(): number;  // executions currently holding a run slot
  onIdle(): Promise<void>;
  shutdown(): Promise<void>;
}
```

## Semantics (normative — the hidden suite tests exactly this)

### Scheduling

1. At most `concurrency` executions run at once.
2. When a slot frees, start the waiting execution with the **highest priority**; among equal
   priorities, **earliest submission first** (FIFO). Order is defined by *start* order.
3. `run()` may start the task synchronously or on a later microtask/macrotask — unspecified;
   callers may observe counters only after yielding to the event loop.
4. `setConcurrency(n)`: increasing starts more queued work immediately; decreasing never
   preempts running work — it takes effect as running executions settle.

### Abort (caller cancellation via `opts.signal`)

5. Signal already aborted at `run()` call: reject immediately with the signal's abort
   reason; the task function is never invoked; nothing is enqueued.
6. Abort while queued (or waiting in backoff): the execution is removed and never starts;
   the returned promise rejects with the abort reason.
7. Abort while running: the returned promise rejects **promptly** with the abort reason
   (do not wait for the task to notice); `ctx.signal` aborts; the run slot is **freed
   immediately** — the still-running task function is orphaned and its eventual outcome
   is ignored.
8. Aborted executions are **never retried**.

### Timeout

9. `timeoutMs` bounds each attempt, measured from that attempt's start. On expiry the
   attempt fails with a `TimeoutError`, `ctx.signal` aborts, and the slot is **freed
   immediately** (orphaning the task function, as in rule 7).
10. A timed-out attempt **is retryable** (unlike abort).

### Retry

11. `retries` = N means at most N additional attempts after the first, triggered by the
    task throwing/rejecting or by timeout. On final failure, reject with the last error.
12. Before attempt `n` (n >= 2), wait `backoffMs * 2^(n-2)` (first retry waits `backoffMs`,
    second `2 * backoffMs`, ...). While waiting, the execution holds **no slot** and counts
    in `size()`. After the wait it re-enters the queue with its original priority, behind
    already-waiting executions of equal priority.
13. `ctx.attempt` reports the attempt number (1-based).

### Dedup (`opts.key`)

14. If an execution with the same key is **active** (queued, in backoff, or running), a new
    `run()` with that key does **not** create a new execution: it returns a promise
    **joined** to the active execution. The joiner's task function is never invoked, and
    the joiner's `priority`/`timeoutMs`/`retries`/`backoffMs` are ignored — the original
    execution's options govern.
15. All joined promises settle with the shared execution's outcome.
16. A joiner's own `signal` detaches only that caller: its promise rejects with the abort
    reason; the shared execution is unaffected — **unless every attached caller has
    aborted**, in which case the execution itself is cancelled (removed if waiting;
    `ctx.signal` aborted + slot freed if running). A caller that passed no signal can never
    abort, so its execution can never be fully cancelled this way.
17. Once an execution settles (or is fully cancelled), its key is free: a later `run()`
    with the same key starts a fresh execution.

### Lifecycle

18. `onIdle()` resolves when `size() === 0 && pending() === 0`. If already idle, it
    resolves immediately. Backoff waits count as not idle. Any number of concurrent
    `onIdle()` calls must all resolve.
19. `shutdown()`: all waiting executions (queued + backoff) reject with `QueueClosedError`;
    running executions continue and settle normally; subsequent `run()` calls reject with
    `QueueClosedError`; the returned promise resolves once no execution holds a slot.
    Idempotent.
20. One task's failure must never affect other tasks or the queue itself.

## Anti-goals

- No worker threads, no child processes, no polling/busy-wait loops.
- No runtime dependencies. Dev-time types are fine.
- Do not implement persistence, metrics, events, or rate limiting. Unrequested surface
  area counts against you.

## What "good" looks like

Correctness on the interaction cases (dedup x abort, timeout x retry, shutdown mid-flight,
slot accounting when tasks are orphaned) — plus an implementation whose task lifecycle is
explicit, whose abort listeners and timers are cleaned up on every path, and which a
stranger could safely modify.
