/**
 * HIDDEN acceptance suite for Problem P1 (AsyncTaskQueue). DO NOT show to any arm.
 *
 * Usage: copy this single file into the root of an arm's delivered tree, then:
 *   bun score.ts
 * It imports ./src/queue and prints a per-check table + JSON total (0-100).
 *
 * Every check is wrapped in a hard 3s cap; a hang scores 0 for that check only.
 */
import { AsyncTaskQueue, TimeoutError, QueueClosedError } from "./src/queue";

// ---------- tiny harness ----------
type Check = { id: string; points: number; name: string; fn: () => Promise<void> };
const checks: Check[] = [];
function check(id: string, points: number, name: string, fn: () => Promise<void>) {
  checks.push({ id, points, name, fn });
}
class Deferred<T = void> {
  promise: Promise<T>;
  resolve!: (v: T) => void;
  reject!: (e: unknown) => void;
  constructor() {
    this.promise = new Promise<T>((res, rej) => ((this.resolve = res), (this.reject = rej)));
  }
}
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const tick = () => sleep(15); // generous yield; spec allows deferred starts
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error("ASSERT: " + msg);
}
function eq(a: unknown, b: unknown, msg: string) {
  assert(Object.is(a, b) || JSON.stringify(a) === JSON.stringify(b), `${msg} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`);
}
async function expectReject(p: Promise<unknown>, msg: string): Promise<unknown> {
  let err: unknown, rejected = false;
  try {
    await Promise.race([p, sleep(1500).then(() => Symbol.for("score.timeout"))]).then(
      (v) => { if (v === Symbol.for("score.timeout")) throw new Error("ASSERT: " + msg + " — promise did not settle in time"); },
      (e) => { rejected = true; err = e; },
    );
  } catch (e) { throw e; }
  assert(rejected, msg + " — expected rejection, got resolution");
  return err;
}
function errName(e: unknown): string {
  return e && typeof e === "object" && "name" in e ? String((e as Error).name) : String(e);
}
let unhandled = 0;
process.on("unhandledRejection", () => { unhandled++; });

// ============================================================
// Group A — fundamentals (34 pts)
// ============================================================

check("A1", 4, "resolve value / reject error passthrough", async () => {
  const q = new AsyncTaskQueue();
  eq(await q.run(async () => 42), 42, "resolved value");
  const boom = new Error("boom");
  const e = await expectReject(q.run(async () => { throw boom; }), "task error");
  assert(e === boom, "rejection is the task's own error object");
});

check("A2", 6, "concurrency cap: never exceeded, actually parallel", async () => {
  const q = new AsyncTaskQueue({ concurrency: 3 });
  let cur = 0, max = 0, done = 0;
  const all = Array.from({ length: 20 }, () =>
    q.run(async () => {
      cur++; max = Math.max(max, cur);
      await sleep(20);
      cur--; done++;
    }),
  );
  await Promise.all(all);
  eq(done, 20, "all tasks completed");
  assert(max <= 3, `cap respected (saw ${max})`);
  assert(max >= 3, `parallelism used (saw ${max})`);
});

check("A3", 4, "FIFO within equal priority", async () => {
  const q = new AsyncTaskQueue({ concurrency: 1 });
  const gate = new Deferred();
  const started: string[] = [];
  const blocker = q.run(async () => { await gate.promise; });
  await tick();
  const t2 = q.run(async () => { started.push("t2"); });
  const t3 = q.run(async () => { started.push("t3"); });
  const t4 = q.run(async () => { started.push("t4"); });
  gate.resolve();
  await Promise.all([blocker, t2, t3, t4]);
  eq(started, ["t2", "t3", "t4"], "start order");
});

check("A4", 5, "priority ordering (higher first)", async () => {
  const q = new AsyncTaskQueue({ concurrency: 1 });
  const gate = new Deferred();
  const started: string[] = [];
  const blocker = q.run(async () => { await gate.promise; });
  await tick();
  const a = q.run(async () => { started.push("a"); }, { priority: 0 });
  const b = q.run(async () => { started.push("b"); }, { priority: 5 });
  const c = q.run(async () => { started.push("c"); }, { priority: 1 });
  const d = q.run(async () => { started.push("d"); }, { priority: -1 });
  gate.resolve();
  await Promise.all([blocker, a, b, c, d]);
  eq(started, ["b", "c", "a", "d"], "priority start order");
});

check("A5", 4, "size()/pending() accounting", async () => {
  const q = new AsyncTaskQueue({ concurrency: 2 });
  const g1 = new Deferred(), g2 = new Deferred();
  const p1 = q.run(async () => { await g1.promise; });
  const p2 = q.run(async () => { await g2.promise; });
  const rest = [q.run(async () => {}), q.run(async () => {}), q.run(async () => {})];
  await tick();
  eq(q.pending(), 2, "pending while 2 running");
  eq(q.size(), 3, "size while 3 queued");
  g1.resolve(); g2.resolve();
  await Promise.all([p1, p2, ...rest]);
  eq(q.pending(), 0, "pending after drain");
  eq(q.size(), 0, "size after drain");
});

check("A6", 4, "onIdle: immediate when idle, resolves after drain, multiple waiters", async () => {
  const q = new AsyncTaskQueue({ concurrency: 2 });
  await Promise.race([q.onIdle(), sleep(300).then(() => { throw new Error("ASSERT: onIdle on fresh queue did not resolve"); })]);
  const gate = new Deferred();
  const p = q.run(async () => { await gate.promise; return 1; });
  await tick();
  let idle1 = false, idle2 = false;
  q.onIdle().then(() => (idle1 = true));
  q.onIdle().then(() => (idle2 = true));
  await sleep(40);
  assert(!idle1 && !idle2, "onIdle must not resolve while a task runs");
  gate.resolve();
  await p;
  await sleep(40);
  assert(idle1 && idle2, "all onIdle waiters resolve after drain");
});

check("A7", 4, "pre-aborted signal: immediate reject, task never invoked", async () => {
  const q = new AsyncTaskQueue();
  const ctl = new AbortController();
  ctl.abort();
  let called = false;
  const e = await expectReject(q.run(async () => { called = true; }, { signal: ctl.signal }), "pre-aborted run()");
  eq(errName(e), "AbortError", "rejects with the abort reason");
  assert(!called, "task function never invoked");
  await tick();
  eq(q.size(), 0, "nothing enqueued");
  eq(q.pending(), 0, "nothing running");
});

check("A8", 3, "error isolation: a failing task doesn't poison the queue", async () => {
  const q = new AsyncTaskQueue({ concurrency: 1 });
  await expectReject(q.run(async () => { throw new Error("x"); }), "first task fails");
  eq(await q.run(async () => "alive"), "alive", "queue still works after a failure");
});

// ============================================================
// Group B — interactions (66 pts)
// ============================================================

check("B1", 6, "dedup: concurrent same-key calls share one execution", async () => {
  const q = new AsyncTaskQueue();
  const gate = new Deferred();
  let callsA = 0, callsB = 0;
  const p1 = q.run(async () => { callsA++; await gate.promise; return "v"; }, { key: "k" });
  await tick();
  const p2 = q.run(async () => { callsB++; return "OTHER"; }, { key: "k" });
  gate.resolve();
  eq(await p1, "v", "original resolves");
  eq(await p2, "v", "joiner gets the SHARED result");
  eq(callsA, 1, "original task ran once");
  eq(callsB, 0, "joiner's task function never invoked");
});

check("B2", 4, "dedup: key frees after settle — later run is fresh", async () => {
  const q = new AsyncTaskQueue();
  let calls = 0;
  eq(await q.run(async () => { calls++; return calls; }, { key: "k" }), 1, "first execution");
  eq(await q.run(async () => { calls++; return calls; }, { key: "k" }), 2, "fresh execution after settle");
  eq(calls, 2, "two executions total");
});

check("B3", 6, "dedup + partial abort: one joiner detaches, execution survives", async () => {
  const q = new AsyncTaskQueue();
  const gate = new Deferred();
  let execSignal: AbortSignal | undefined;
  const p1 = q.run(async (ctx) => { execSignal = ctx.signal; await gate.promise; return "r"; }, { key: "k" });
  await tick();
  const ctl = new AbortController();
  const p2 = q.run(async () => "x", { key: "k", signal: ctl.signal });
  const p3 = q.run(async () => "y", { key: "k" });
  p2.catch(() => {});
  ctl.abort();
  const e = await expectReject(p2, "aborting joiner rejects");
  eq(errName(e), "AbortError", "joiner rejects with abort reason");
  await tick();
  assert(execSignal && !execSignal.aborted, "shared execution's ctx.signal must NOT abort");
  gate.resolve();
  eq(await p1, "r", "original unaffected");
  eq(await p3, "r", "remaining joiner unaffected");
});

check("B4", 5, "dedup + ALL callers abort: execution itself is cancelled", async () => {
  const q = new AsyncTaskQueue();
  const gate = new Deferred();
  let execSignal: AbortSignal | undefined;
  const c1 = new AbortController(), c2 = new AbortController();
  const p1 = q.run(async (ctx) => { execSignal = ctx.signal; await gate.promise; }, { key: "k", signal: c1.signal });
  await tick();
  const p2 = q.run(async () => {}, { key: "k", signal: c2.signal });
  p1.catch(() => {}); p2.catch(() => {});
  c1.abort();
  await tick();
  assert(execSignal && !execSignal.aborted, "one abort of two: execution still live");
  c2.abort();
  await expectReject(p1, "caller 1 rejected");
  await expectReject(p2, "caller 2 rejected");
  await sleep(30);
  assert(execSignal && execSignal.aborted, "all callers aborted -> ctx.signal aborts");
  eq(q.pending(), 0, "slot freed after full cancellation");
});

check("B5", 5, "abort while queued: removed, never starts", async () => {
  const q = new AsyncTaskQueue({ concurrency: 1 });
  const gate = new Deferred();
  const blocker = q.run(async () => { await gate.promise; });
  await tick();
  let called = false;
  const ctl = new AbortController();
  const p = q.run(async () => { called = true; }, { signal: ctl.signal });
  p.catch(() => {});
  await tick();
  eq(q.size(), 1, "queued before abort");
  ctl.abort();
  const e = await expectReject(p, "queued task rejects on abort");
  eq(errName(e), "AbortError", "abort reason");
  await tick();
  eq(q.size(), 0, "removed from queue");
  gate.resolve();
  await blocker;
  assert(!called, "aborted queued task never ran");
});

check("B6", 5, "abort while running: prompt reject + slot freed immediately (orphan)", async () => {
  const q = new AsyncTaskQueue({ concurrency: 1 });
  const never = new Deferred();
  let execSignal: AbortSignal | undefined;
  const ctl = new AbortController();
  const pA = q.run(async (ctx) => { execSignal = ctx.signal; await never.promise; }, { signal: ctl.signal });
  pA.catch(() => {});
  await tick();
  let bStartedAt = 0;
  const t0 = Date.now();
  const pB = q.run(async () => { bStartedAt = Date.now(); });
  ctl.abort();
  const e = await expectReject(pA, "running task's promise rejects promptly on abort");
  eq(errName(e), "AbortError", "abort reason");
  assert(execSignal && execSignal.aborted, "ctx.signal aborted");
  await pB;
  assert(bStartedAt > 0 && bStartedAt - t0 < 1000, "slot freed immediately: B ran while A's fn still hung");
});

check("B7", 5, "timeout: TimeoutError, ctx.signal aborted, slot freed immediately", async () => {
  const q = new AsyncTaskQueue({ concurrency: 1 });
  const never = new Deferred();
  let execSignal: AbortSignal | undefined;
  const pA = q.run(async (ctx) => { execSignal = ctx.signal; await never.promise; }, { timeoutMs: 60 });
  pA.catch(() => {});
  const pB = q.run(async () => "b");
  const e = await expectReject(pA, "hung task times out");
  assert(e instanceof TimeoutError, "rejects with exported TimeoutError (instanceof)");
  eq(errName(e), "TimeoutError", "error name");
  assert(execSignal && execSignal.aborted, "ctx.signal aborted at timeout");
  eq(await pB, "b", "slot freed: next task ran though the orphan never settled");
});

check("B8", 5, "retry: fail, fail, succeed — with correct attempt numbers", async () => {
  const q = new AsyncTaskQueue();
  const attempts: number[] = [];
  const v = await q.run(
    async (ctx) => {
      attempts.push(ctx.attempt);
      if (ctx.attempt < 3) throw new Error("flaky");
      return "ok";
    },
    { retries: 2 },
  );
  eq(v, "ok", "eventually resolves");
  eq(attempts, [1, 2, 3], "attempt numbering");
});

check("B9", 4, "retry backoff: exponential delays honored", async () => {
  const q = new AsyncTaskQueue();
  const starts: number[] = [];
  const p = q.run(
    async () => { starts.push(Date.now()); throw new Error("always"); },
    { retries: 2, backoffMs: 40 },
  );
  await expectReject(p, "final failure after retries");
  eq(starts.length, 3, "three attempts");
  assert(starts[1] - starts[0] >= 30, `first backoff ~40ms (saw ${starts[1] - starts[0]}ms)`);
  assert(starts[2] - starts[1] >= 60, `second backoff ~80ms (saw ${starts[2] - starts[1]}ms)`);
});

check("B10", 4, "abort is never retried", async () => {
  const q = new AsyncTaskQueue();
  const never = new Deferred();
  let calls = 0;
  const ctl = new AbortController();
  const p = q.run(async () => { calls++; await never.promise; }, { retries: 3, signal: ctl.signal });
  p.catch(() => {});
  await tick();
  ctl.abort();
  const e = await expectReject(p, "rejects on abort");
  eq(errName(e), "AbortError", "abort reason");
  await sleep(150);
  eq(calls, 1, "no retry after abort");
});

check("B11", 5, "timeout is retryable: attempt 1 times out, attempt 2 succeeds", async () => {
  const q = new AsyncTaskQueue();
  const never = new Deferred();
  const v = await q.run(
    async (ctx) => {
      if (ctx.attempt === 1) { await never.promise; }
      return "recovered";
    },
    { timeoutMs: 50, retries: 1 },
  );
  eq(v, "recovered", "retry after timeout succeeds");
});

check("B12", 5, "shutdown: waiting reject, running finishes, then closed", async () => {
  const q = new AsyncTaskQueue({ concurrency: 1 });
  const gate = new Deferred();
  const running = q.run(async () => { await gate.promise; return "done"; });
  await tick();
  const q1 = q.run(async () => "q1");
  const q2 = q.run(async () => "q2");
  q1.catch(() => {}); q2.catch(() => {});
  let shutdownSettled = false;
  const sd = q.shutdown().then(() => (shutdownSettled = true));
  const e1 = await expectReject(q1, "queued task rejected on shutdown");
  assert(e1 instanceof QueueClosedError, "queued rejection is QueueClosedError");
  await expectReject(q2, "second queued task rejected on shutdown");
  await sleep(40);
  assert(!shutdownSettled, "shutdown() must wait for the running task");
  gate.resolve();
  eq(await running, "done", "running task settles normally");
  await sd;
  assert(shutdownSettled, "shutdown resolved after running settled");
  const e2 = await expectReject(q.run(async () => 1), "run() after shutdown rejects");
  assert(e2 instanceof QueueClosedError, "post-shutdown rejection is QueueClosedError");
});

check("B13", 4, "setConcurrency: raise starts work now; lower never preempts", async () => {
  const q = new AsyncTaskQueue({ concurrency: 1 });
  const gates = [new Deferred(), new Deferred(), new Deferred(), new Deferred()];
  const ps = gates.map((g) => q.run(async () => { await g.promise; }));
  await tick();
  eq(q.pending(), 1, "one running at concurrency 1");
  eq(q.size(), 3, "three queued");
  q.setConcurrency(3);
  await tick();
  eq(q.pending(), 3, "raise: immediately 3 running");
  eq(q.size(), 1, "one still queued");
  q.setConcurrency(1);
  await tick();
  eq(q.pending(), 3, "lower: no preemption");
  gates[0].resolve();
  await tick();
  eq(q.pending(), 2, "settle under lowered limit: no new start");
  eq(q.size(), 1, "queued task still waits");
  q.setConcurrency(4);
  gates.forEach((g) => g.resolve());
  await Promise.all(ps);
});

check("B14", 3, "onIdle waits through a retry backoff window", async () => {
  const q = new AsyncTaskQueue();
  const p = q.run(
    async (ctx) => { if (ctx.attempt === 1) throw new Error("once"); return "ok"; },
    { retries: 1, backoffMs: 100 },
  );
  await tick();
  let idle = false;
  q.onIdle().then(() => (idle = true));
  await sleep(50); // inside the backoff window
  assert(!idle, "not idle during backoff");
  eq(await p, "ok", "task recovers");
  await sleep(30);
  assert(idle, "idle after final settle");
});

// ---------- runner ----------
const CAP_MS = 3000;
async function main() {
  let total = 0;
  const rows: { id: string; points: number; earned: number; name: string; error?: string }[] = [];
  for (const c of checks) {
    let earned = 0, error: string | undefined;
    try {
      await Promise.race([
        c.fn(),
        sleep(CAP_MS).then(() => { throw new Error("CHECK TIMED OUT (hang)"); }),
      ]);
      earned = c.points;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    total += earned;
    rows.push({ id: c.id, points: c.points, earned, name: c.name, error });
  }
  const width = Math.max(...rows.map((r) => r.name.length));
  for (const r of rows) {
    const mark = r.earned === r.points ? "PASS" : "FAIL";
    console.log(`${r.id.padEnd(4)} ${mark} ${String(r.earned).padStart(2)}/${String(r.points).padStart(2)}  ${r.name.padEnd(width)}${r.error ? "  — " + r.error : ""}`);
  }
  const max = rows.reduce((s, r) => s + r.points, 0);
  console.log(`\nTOTAL ${total}/${max}  (unhandledRejections observed: ${unhandled})`);
  console.log(JSON.stringify({ total, max, unhandled, checks: rows.map(({ id, earned, points }) => ({ id, earned, points })) }));
  process.exit(0);
}
main();
