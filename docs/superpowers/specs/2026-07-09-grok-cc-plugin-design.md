# grok-cc-plugin — Design Spec v1 "Advisor & Fleet"

**Date:** 2026-07-09
**Status:** Approved (design review 2026-07-09)
**Verified against:** grok 0.2.91 (39d0c6872354), Claude Code 2.1.x

## 1. Purpose

A Claude Code plugin that turns Grok into a durable, veto-gated worker fleet with Claude as orchestrator/advisor. It replaces the fire-and-hope delegation of CLI-wrapper sidecars (e.g. the codex plugin) with protocol-level control: Claude mediates the workers' filesystem, gates their risky actions, answers their questions mid-task, and never polls for results.

Two user pain points drive everything:

1. **Stale results** — delegation today requires manually checking whether a worker finished. → Workers push events into Claude's conversation via background-task notifications.
2. **No advisory loop** — workers guess when context is thin instead of asking. → A worker contract plus a permission inbox lets workers block on Claude's answer, and lets Claude veto actions before they execute.

## 2. Verified foundation (probed live, not assumed)

All facts below were verified by live JSON-RPC probes against `grok agent stdio` on 2026-07-09. Anything not listed here is treated as unverified until probed.

| Capability | Status | Evidence |
|---|---|---|
| ACP over stdio: `initialize` → `session/new` → `session/prompt` → `session/update` stream → `stopReason` | ✅ | round-trip probe; file created with exact content |
| Permission gate: `session/request_permission` (allow-once / reject-once); reject → tool NOT executed, turn ends `cancelled` | ✅ | denied `touch forbidden.txt`; file absent |
| Client-mediated fs: declaring `clientCapabilities.fs` routes `fs/read_text_file` / `fs/write_text_file` through the client, which physically performs I/O | ✅ | probe's Python handler executed Grok's write |
| Client-delegated writes do NOT fire permission requests (client's responsibility) | ✅ | hello.txt written with no permission event |
| `session/load`: resume session in a new process with full memory | ✅ | resumed worker recalled its earlier work |
| Streaming: `agent_thought_chunk`, `agent_message_chunk`, `tool_call` + `tool_call_update` with embedded diffs | ✅ | event summary from probe 1 |
| Extensions (underscore prefix `_x.ai/`): `_x.ai/session/fork`, `_x.ai/git/worktree/*`, `_x.ai/prompt_history`, `session/set_mode`, `session/set_model` | ✅ exist | `-32602` (exists, bad params) vs `-32601` (absent) |
| NOT existing: `x.ai/*` unprefixed, rewind, compact-as-method | ✅ absent | `-32601` |
| Models: `grok-4.5` (500k ctx, effort high/med/low) + `grok-composer-2.5-fast` (200k) — per-session switchable | ✅ | handshake `modelState` |
| Slash commands over ACP: `goal <obj> [--budget <tokens>]`, `always-approve on|off`, `compact` | ✅ advertised | `availableCommands` |
| Headless: `grok -p`, `--json-schema`, `--best-of-n`, `--check`, `--output-format json` | ✅ | `-p` exercised in duels; flags in `--help` |
| Leader daemon (`grok agent leader`, `~/.grok/leader.sock`, multi-client `--leader`) | ✅ exists | CLI surface; not running by default |
| Grok natively reads `~/.claude` (CLAUDE.md, permissions, skills) | ✅ | `grok inspect` output |
| Project hooks `.grok/hooks/` with blocking `pre_tool_use` deny; `--plugin-dir` injection | ✅ advertised | handshake `_meta` + README |

**Standing rule:** Grok's self-reports about its own API are unreliable (it reported wrong method prefixes and invented a rewind API). The broker MUST probe capabilities at handshake and degrade gracefully; never hardcode assumptions about extension methods.

## 3. Approaches considered

- **A. Thin CLI wrapper** — shell out `grok -p` per task (codex-plugin style). Simple, but forfeits the permission gate, fs mediation, streaming, and resume. Rejected.
- **B. ACP broker daemon** — long-lived Node process speaking ACP to `grok agent stdio` children; Claude drives it through a thin CLI. **Chosen.**
- **C. MCP server** — expose workers as MCP tools. MCP tool calls block Claude's turn; wrong shape for long-running workers. Deferred — the broker can grow an MCP face later without redesign.

## 4. Architecture

```
Claude Code (advisor)
  │  commands / skills / hooks (declarative .md surface, near-zero logic)
  │  grokctl — one CLI, JSON in/out
  ▼  unix socket ~/.grok-cc/broker.sock (JSONL request/response)
grokd broker (Node daemon, no runtime deps)
  │  • worker pool: one `grok agent stdio` child per worker
  │  • ACP client: handshake, capability probe, session lifecycle
  │  • fs mediation: Grok's file I/O executes in broker → audit log; writes
  │    outside the worker's workspace root are refused
  │  • permission inbox: request_permission + NEED_INPUT queued per worker
  │  • event log: JSONL per worker (thoughts, messages, tool calls, diffs)
  │  • wake bridge: `grokctl wait` blocks until inbox/terminal event, then
  │    exits → Claude Code's background-task notification wakes Claude
  ▼
Worker fleet (1 worker = 1 ACP session; durable via session/load)
  grok-4.5 (hard tasks, effort high/med/low) │ grok-composer-2.5-fast (mechanical)
```

### 4.1 grokd (broker daemon)

Single Node `.mjs` process, stdlib only (`net`, `child_process`, `fs`, `readline`). State root: `~/.grok-cc/`.

```
~/.grok-cc/
  broker.sock          # control plane (unix socket, JSONL)
  broker.pid
  workers/<id>/
    meta.json          # task, cwd, model, grip, sessionId, status, created
    events.jsonl       # full ACP update stream, timestamped
    inbox.jsonl        # pending items: permission | need_input | done | error
    fs-audit.jsonl     # every mediated read/write: path, bytes, sha256
    staged/            # grip=gate only: writes land here for review
```

Responsibilities:

1. **Spawn** — `worker.spawn {task, cwd, model?, effort?, grip?, sessionId?}` → new child `grok agent stdio`, handshake with `clientCapabilities.fs`, capability probe (record which `_x.ai/*` methods exist), `session/new` (or `session/load` when `sessionId` given), then `session/prompt` with the worker brief (task wrapped in the contract template from the delegation skill).
2. **Mediate fs** — implement `fs/read_text_file` and `fs/write_text_file`. Enforce workspace containment: resolve the absolute path and require it inside the worker's `cwd` root (deny `..`, symlink escapes via `realpath` on the parent dir). Log every operation to `fs-audit.jsonl`. Under `grip=gate`, divert writes to `staged/` (mirroring relative paths) instead of the real tree, and record the mapping so `worker.approve-stage` can apply them.
3. **Gate permissions** — on `session/request_permission`: consult the grip policy (§5). Auto-allow if policy says so; otherwise append to `inbox.jsonl` and hold the JSON-RPC reply open until `worker.answer` arrives. Configurable timeout (default 30 min) → deny + mark worker `blocked`.
4. **Detect worker questions** — on prompt completion, parse the final agent message for the `STATUS:` line (§5.2). `NEED_INPUT` → inbox. `DONE` → extract the result block, mark complete. No STATUS line → treat as `DONE` with the raw message as result (tolerate contract drift).
5. **Wake bridge** — `worker.wait {ids?, timeoutSec}` over the socket blocks until any watched worker gains an inbox item or terminates. `grokctl wait` is a thin caller; Claude runs it as a background Bash task and gets woken by the harness when it exits.
6. **Lifecycle** — `worker.list/status/result/kill/resume`, `worker.say {id, text}` (new `session/prompt` on the same session — used both for answering NEED_INPUT and for corrective guidance after a deny), `worker.fork {id}` (via `_x.ai/session/fork` when the probe confirmed it; otherwise error with a clear message). Broker exits when idle > 2h with no workers (and on `broker.stop`).

Concurrency: max 4 concurrent worker children by default (configurable via `GROK_CC_MAX_WORKERS`); further spawns queue.

### 4.2 grokctl (CLI)

Thin socket client, one subcommand per broker op: `spawn`, `list`, `status <id>`, `result <id>`, `answer <id> <allow|deny> [--why <text>]`, `say <id> <text>`, `wait [ids…]`, `fork <id>`, `resume <id>`, `kill <id>`, `approve-stage <id> [paths…]`, `broker <start|stop|status>`. All output is JSON (one object per line) so Claude parses instead of scraping. `grokctl` auto-starts the broker if the socket is absent.

### 4.3 Claude Code surface

- **Commands** (`commands/*.md`): `/grok:work <task>` (spawn + arm wait), `/grok:status`, `/grok:advise <id>` (read inbox item, answer/deny/say), `/grok:result <id>`, `/grok:fork <id>`, `/grok:resume <id>`, `/grok:kill <id>`. Each is a short instruction file telling Claude which `grokctl` invocation to run and how to present the JSON.
- **Skills** (`skills/*/SKILL.md`):
  - *delegation-contract* — how to write worker briefs: task framing, STATUS vocabulary, checkpoint cadence, result schema, model/effort routing table (composer-fast for mechanical work; grok-4.5 high for hard problems).
  - *advisory-loop* — how to run the loop: always arm `grokctl wait` in background after spawn; on wake, drain the inbox before anything else; deny with `--why` and follow with `say` guidance; verify DONE results against the task before accepting.
- **Hooks** (`hooks/hooks.json`): SessionStart → `grokctl broker start` (idempotent, <100 ms when already up); SessionEnd → nothing (broker is shared across Claude sessions; it reaps itself when idle).
- **Agent** (`agents/grok-worker.md`): forwarder subagent so `Agent`-tool dispatch can route to a Grok worker for fire-and-forget cases.

## 5. Advisory protocol

### 5.1 Grip levels (per worker, default `advise`)

| Grip | fs writes | shell / destructive / out-of-tree | Use |
|---|---|---|---|
| `gate` | staged to `staged/`, applied only on `approve-stage` | every request → inbox | untrusted tasks, production trees |
| `advise` (default) | direct, audited, workspace-contained | request → inbox unless it matches the allow-list (read-only commands: `ls`, `cat`, `grep`, `git status/diff/log`, test runners `pytest`/`npm test`/`cargo test`) | normal work |
| `leash` | direct, audited | auto-allow everything except a deny-list (`rm -rf`, `git push`, `curl|sh`, `sudo`, inline interpreters) | trusted mechanical tasks |

Allow/deny lists live in one policy module in grokd (`policy.mjs`) — data, not scattered conditionals.

**Containment boundary (corrected 2026-07-09, found by live probe).** The fs-mediator contains and audits *grok's file tools* only. Shell commands run with the broker's privileges and can write outside the workspace, so containment is **not** a backstop under `leash` — the permission gate is the only real control, and `leash` disables it. `leash`'s deny-list is a tripwire for accidental escapes, not a sandbox. Untrusted work runs under `gate`. A true sandbox would need OS-level confinement (grok's `--sandbox` flag is unverified over `agent stdio`).

### 5.2 Worker contract (prompt-level)

Every brief is wrapped in a template that instructs the worker:

- End every turn with exactly one line: `STATUS: WORKING | NEED_INPUT | DONE | BLOCKED`.
- `NEED_INPUT` → immediately precede it with a block `QUESTION: <what you need>`; do not guess.
- `DONE` → precede with `RESULT:` followed by a fenced JSON block matching the schema given in the brief (default: `{summary, files_changed[], verification}`).
- Checkpoint early: after investigation and before large edits, end the turn with `STATUS: WORKING` + a one-paragraph plan (this creates a natural review point — Claude may `say` corrections before the next turn).

Deny semantics (verified): a rejected permission cancels the whole turn. The broker therefore auto-marks the worker `advising` after a deny; Claude's `answer deny --why` text plus subsequent `say` guidance form the corrective re-prompt on the same session.

### 5.3 The loop, end to end

```
/grok:work "fix flaky auth test"
 → grokctl spawn … → {id: w1}
 → Claude runs `grokctl wait w1` as background task; conversation continues
… w1 hits `git push` → inbox item → wait exits → task-notification wakes Claude
 → /grok:advise w1 → Claude sees the pending call → answer deny --why "no pushes; leave the branch local"
 → grokctl say w1 "commit locally only; show me the diff instead"
 → re-arm wait
… w1 finishes → STATUS: DONE + RESULT json → wake → Claude verifies (reads diff, runs tests) → accepts or `say`s follow-up
```

## 6. Error handling

- **Worker child dies mid-task** → broker marks `dead`, keeps `sessionId`; `worker.resume` re-spawns and `session/load`s (verified to restore memory). Inbox gains an `error` item so Claude is woken, not left waiting.
- **Broker dies** → workers die with it (children). `meta.json` + `sessionId` survive on disk; `grokctl broker start` reconciles: any worker previously `running` becomes `dead` and resumable. `grokctl` commands fail fast with a clear "broker not running" JSON error and auto-start guidance.
- **Handshake/capability drift** (grok upgrade) → probe results are recorded per worker in `meta.json`; missing extension → the dependent command errors with "not supported by grok X.Y.Z", never a crash.
- **Permission timeout** (default 30 min unanswered) → deny + `blocked` status + inbox note; nothing executes by default.
- **MCP noise** — workers spawn with the user's MCP config suppressed (`session/new` passes `mcpServers: []`; known telepharmacy-dev 403 noise disappears). If a task needs an MCP, the brief opts in explicitly.
- **STATUS-line drift** — absent/malformed contract output degrades to `DONE` with raw text; never hangs.

## 7. Testing

Integration-first; the probe scripts from the design phase seed the suite. A fake "echo agent" is NOT built — tests run against the real `grok agent stdio` (it is free with the user's login) tagged so they can be skipped offline.

1. `test/handshake.test.mjs` — initialize, capability probe, `-32601`/`-32602` classification.
2. `test/roundtrip.test.mjs` — spawn → file created via mediated fs → audit log entry → DONE parsed.
3. `test/veto.test.mjs` — shell request → inbox → deny → tool not executed → `say` corrective → next turn succeeds.
4. `test/containment.test.mjs` — worker asked to write outside cwd → broker refuses, audit records the attempt.
5. `test/resume.test.mjs` — kill child mid-session → resume → memory intact.
6. `test/wait.test.mjs` — `grokctl wait` blocks, exits on inbox item, exit code distinguishes inbox/terminal/timeout.

Each non-trivial module ships one runnable self-check (`node module.mjs --self-check`) per lazy-but-checked discipline.

## 8. V1 scope

**In:** grokd, grokctl, grip policy (3 levels), worker contract, wake bridge, commands, two skills, SessionStart hook, forwarder agent, the six integration tests.

**Out (deliberately, each an additive module later):** best-of-n tournaments, `goal --budget` autonomy, worktree tournament orchestration (`_x.ai/git/worktree/*`), WebSocket remote workers, MCP server face, terminal mediation, leader-daemon sharing with the user's own Grok TUI.

## 9. Success criteria

1. `/grok:work` on a real task completes with zero manual polling — every wake is push-based.
2. A denied action is demonstrably never executed (veto test green).
3. A worker that lacks context asks (NEED_INPUT observed in normal use) instead of guessing.
4. Kill the broker mid-task; resume completes the task with memory intact.
5. Every file a worker touched is reconstructible from `fs-audit.jsonl`.
