---
name: advisory-loop
description: How to run the advisor loop for Grok workers - wakes, inbox draining, veto etiquette. Use whenever a grokctl wait background task exits or a worker needs an answer.
---
# Running the advisory loop

- After every spawn, ALWAYS arm `grokctl wait <id> --actionable --timeout 570` as a **harness-tracked background Bash task** (`run_in_background: true`), NOT a `&`-detached subshell. Exit 0 = an actionable event (permission / done / blocked / need_input / a stalled worker) — drain the inbox now; exit 2 = heartbeat timeout (re-arm; check status while you're there). `--actionable` skips the non-actionable `paused` checkpoint wakes, so one tracked wait per worker replaces the hand-rolled `while … status … sleep` pollers that leak (F4). For a fleet, `grokctl wait <id1> <id2> … --actionable --any` returns when ANY listed worker needs action.
- NEVER hand-roll a status poller (`while true; do grokctl status; sleep N; done`) or background a subshell inside a foreground command (`( … ) &`). Both detach from the harness and leak stale processes with no exit signal. The single `wait --actionable` is the only polling primitive you need.
- A worker that ends a turn without a terminal STATUS is auto-nudged once by the broker after ~90s; if it re-pauses it escalates to a `stalled` inbox item (which `--actionable` wakes on). So you no longer babysit `paused` — but do steer on a checkpoint if you have a course-correction.
- On wake: `grokctl inbox <id>`, handle the LAST unhandled item first (see /grok:advise steps). Never leave a permission pending - the 30-minute timeout denies and blocks the worker.
- Veto etiquette: a deny cancels the worker's whole turn. Follow it with `say` guidance or the worker sits idle - but as a SEPARATE step, after `answer` returns. `say` refuses while a permission is still held, and waits for the cancelled turn to settle before opening a new one.
- Never `say` to a worker in `advising` status without answering its permission first. That is what the permission is waiting on.
- checkpoint items are your cheap steering moment - one `say` course-correction here saves a wasted turn later.
- Verify done results yourself (diff, tests) before telling the user it's done. Workers' verification claims are input, not truth.
- If a worker dies (status dead), `grokctl resume <id>` restores it with memory intact - do not respawn from scratch.
