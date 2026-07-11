# Benchmark findings — collaboration friction (feeds the backlog)

Difficulties observed while running the Claude-vs-Grok-vs-together benchmark.
Each becomes a backlog entry once confirmed with evidence.

## F1 — A `paused` worker (turn ended without DONE) stalls indefinitely
**Severity:** major. **Area:** worker / advisory-loop.
**What happened:** Both Grok workers ended their first turn after minimal
exploration and went to `status: paused` (worker.mjs:257 sets `paused` + a
checkpoint when an ACP turn ends without `STATUS: DONE`). Nothing nudged them, so
they sat idle **~36 minutes** with empty output dirs until a `/grok:status`
happened to reveal it.
**Why it's easy to miss:** unlike a permission (30-min timeout → auto-deny +
`blocked`), `paused` has **no timeout** and no "captain must act" signal. The
accompanying checkpoint wakes the advisory-loop `wait`, but the skill frames
checkpoints as *optional* steering — so a captain reasonably ignores it and the
worker never resumes. A status poller that watches for `advising/blocked/done`
misses `paused` entirely (I hit exactly this).
**Cost:** ~36 min wall-clock on two of three conditions; required a manual `say`
"continue to DONE" to each.
**Fix direction:** either (a) `paused` needs a timeout/escalation like permissions,
or (b) the advisory-loop skill + any monitor must treat `paused` as actionable
("say to resume"), or (c) the broker auto-nudges once. Name the trade-off:
auto-resume could loop a confused worker.

## F2 — Workers pause after minimal work on a large task
**Severity:** minor–major. **Area:** delegation-contract / worker.
**What happened:** given a substantial multi-file build, the worker did one small
turn (env probe / read) then ended the turn (→ paused) instead of running through.
**Fix direction:** the brief should say "run straight through, do not checkpoint";
OR the broker should keep the turn going until DONE for `advise`/`leash`. Under
test this cost a full round-trip per worker just to say "keep going."

## F3 — Advisory `wait` wakes the captain on non-actionable checkpoints
**Severity:** minor. **Area:** advisory-loop / grokctl.
**What happened:** every progress checkpoint fires `grokctl wait` (exit 0), waking
the captain to check an inbox that needs no action. Running 2–3 workers made this
a stream of no-op wakes; I replaced per-worker `wait` with a status poller.
**Fix direction:** a `wait --actionable` that only returns on permission/done/
paused/blocked, not checkpoints.

## F4 — Hand-rolled status pollers leak stale background processes
**Severity:** minor (operational). **Area:** advisory-loop / grokctl / captain workflow.
**What happened:** Because there is no `grokctl wait --actionable` (F3), I hand-rolled
`while … grokctl status … sleep 12` pollers as `run_in_background` tasks and, worse,
some as `( … ) &` subshells inside a foreground command. Across problem 1 that left
**5 poller loops still running (up to 45 min old)** plus their live `sleep` children,
none of which exit cleanly when the captain stops needing them; the `&`-subshell ones
orphan immediately. Found only because the user asked "any stale shell?" — I had to
`ps | grep | kill` process groups by hand and `grokctl kill` the done workers to reap
their `grok agent stdio` children.
**Root cause:** the F3 gap forces a polling workaround, and a sleep-loop background
task has no "you're no longer needed, exit" signal; the `( … ) &` pattern detaches
from the task the harness tracks.
**Fix direction:** ship the `grokctl wait --actionable` primitive (kills F3 and F4 at
once — one tracked, self-terminating wait per worker instead of N leaking pollers), and
never background a subshell inside a foreground command. Also: `grokctl` could offer a
`grokctl wait <ids...> --any` that returns when ANY listed worker needs action, so the
captain arms one wait for a whole fleet.

_(more added as problems 2–3 run)_
