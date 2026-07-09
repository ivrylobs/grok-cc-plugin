# grok-cc-plugin

**Claude advises, Grok works.** A Claude Code plugin that turns Grok into a durable, veto-gated worker fleet. Claude orchestrates; Grok workers run tasks over the Agent Client Protocol (ACP) while Claude mediates their filesystem, gates every risky action in-flight, answers their questions, and never polls for results.

It replaces fire-and-hope CLI delegation with protocol-level control:

- **Real veto** — every worker tool call routes through Claude's grip policy before it executes. A denied action never runs. (Forced on regardless of your global grok permission mode.)
- **Workers ask, not guess** — a worker that lacks context blocks with a `NEED_INPUT` question instead of hallucinating.
- **Push, not poll** — worker events wake Claude via background-task notifications. No status polling.
- **Durable** — kill the broker mid-task; `resume` re-attaches the session with full memory.
- **Audited** — every file a worker reads or writes is logged with a sha256 hash, reconstructable after the fact.

## Install

A plugin installs from a marketplace. This repo is its own marketplace (`.claude-plugin/marketplace.json`), so add it as a local marketplace, then install:

```bash
claude plugin marketplace add /path/to/grok-cc-plugin
claude plugin install grok@grok-cc
```

`marketplace add` also accepts a GitHub repo or URL. Uninstall with `claude plugin uninstall grok@grok-cc`; update after a pull with `claude plugin marketplace update grok-cc`.

Requires: Node ≥ 20, the `grok` CLI (0.2.91+) logged in (`grok login`). The SessionStart hook auto-starts the broker; restart Claude Code (or start a new session) after install so the hook and `/grok:*` commands load.

## Commands

| Command | Does |
|---|---|
| `/grok:work <task>` | Delegate a task to a worker; arms a background wait so events wake you |
| `/grok:status [id]` | List workers, or show one |
| `/grok:advise <id>` | Review a worker's pending request; approve, veto (`+ guidance`), or answer |
| `/grok:result <id>` | Fetch a finished worker's result (verify before accepting) |
| `/grok:resume <id>` | Re-attach a dead worker with memory intact |
| `/grok:fork <id>` | Branch a worker's session (needs a grok build that supports it) |
| `/grok:kill <id>` | Stop a worker |
| `/grok:config [--model <id>] [--effort low\|medium\|high]` | Show or set the default worker model / reasoning effort |

Under the hood everything is one CLI: `node bin/grokctl.mjs <op>` (JSON in/out). Commands are thin wrappers.

## Grip levels

Set per worker with `--grip` on spawn (default `advise`):

| Grip | In-tree writes | Shell / destructive / out-of-tree | Use |
|---|---|---|---|
| `gate` | staged until `approve-stage` | every request → you decide | untrusted tasks, production trees |
| `advise` *(default)* | direct, audited, contained | read-only shell auto-runs; mutations → you decide | normal work |
| `leash` | direct, audited | everything auto-runs except a deny-list (`rm -rf`, `git push`, `sudo`, `curl\|sh`, inline interpreters) | trusted mechanical tasks |

Containment (writes confined to the worker's cwd, sha256-audited) is enforced by the fs-mediator on **grok's file tools** at every grip level.

**It does not extend to shell.** A shell command runs with the broker's full privileges and can write anywhere. Under `gate` and `advise` the permission gate is what stops it — you see the command and decide. Under `leash` shell auto-runs, so **`leash` is not a sandbox**: its deny-list is a tripwire for accidental escapes (`node -e`, `python -c`, `sh -c`, `eval`), not a boundary against a worker that means to cross it. Run untrusted work under `gate`.

## Model & reasoning effort

Workers never silently run on a model you didn't pick. Precedence, highest first:

1. per-spawn flag — `/grok:work <task> --model grok-composer-2.5-fast --effort low`
2. env — `GROK_CC_MODEL`, `GROK_CC_EFFORT`
3. config — `/grok:config --model grok-4.5 --effort high` (persisted to `<GROK_CC_HOME>/config.json`)
4. grok's own default (`grok-4.5`)

```bash
node bin/grokctl.mjs models                                  # valid model ids
node bin/grokctl.mjs config --model grok-4.5 --effort high   # set defaults
node bin/grokctl.mjs config                                  # show
node bin/grokctl.mjs config --model none                     # clear -> grok default
```

Effort is `low` | `medium` | `high` (grok-4.5 only). Routing rule of thumb: `grok-composer-2.5-fast` for mechanical, spec-clamped work; `grok-4.5` for ambiguous debugging, cross-repo tracing, and refactors.

If grok **rejects** a model or effort, the worker posts an `error` to its inbox saying so — it does not quietly fall back to the default. Verified 2026-07-09: requesting `grok-composer-2.5-fast` makes grok report that exact model on its own event stream.

## Architecture

```
Claude Code (advisor)  ── commands / skills / hooks
        │  grokctl (JSON over unix socket)
        ▼
     grokd (broker daemon)  ── worker pool, fs mediation, permission inbox, wake bridge
        │  ACP (JSON-RPC/JSONL over stdio)
        ▼
   grok agent stdio × N   ── grok-4.5 (500k) / grok-composer-2.5-fast
```

- **grokd** — one Node daemon (stdlib only). Spawns a `grok agent stdio` child per worker, mediates `fs/read|write` (audit + containment + optional staging), holds `session/request_permission` calls open until you answer, and blocks `wait` until a worker event fires.
- **grokctl** — the only thing Claude runs. Auto-starts the broker.
- **Managed permissions** — workers spawn under a plugin-managed `GROK_HOME` that forces `permission_mode = default`, so the grip policy is the sole authority. Your global grok config is untouched.

State lives in `~/.grok-cc/` (override `GROK_CC_HOME`): per-worker `meta.json`, `events.jsonl`, `inbox.jsonl`, `fs-audit.jsonl`, and `staged/`.

## Testing

Two tiers:

```bash
npm test          # fast: deterministic mock ACP agent, milliseconds, no grok/network
npm run test:live # truth pass: real grok-4.5 (needs login), ~45s
npm run e2e       # full §9 walk via grokctl vs real grok
```

The mock (`test/mock-agent.mjs`) speaks the identical ACP wire format, so protocol regressions surface instantly; live runs prove real grok behavior. Verified 2026-07-09 (grok 0.2.91, node 22.22.3): 39 offline + 39 live, 0 failures.

### Runtime: node, not bun

Measured 2026-07-09 (bun 1.3.11 vs node 22.22.3): bun saves ~5 ms per `grokctl` invocation (33 ms vs 40 ms) and nothing at all on the hot path — the warm pool already took repeat spawn from 2205 ms to 1.4 ms, and everything left is grok's inference. Against that, `bun test` runs all test files in one process where `node --test` forks per file; our tests set `GROK_CC_HOME` before importing `store.mjs`, which reads it at module scope, so a shared module cache breaks isolation (`store.test.mjs` fails under bun). Node stays. Revisit only if bun becomes the deployment target for reasons other than speed.

## Worker lifecycle & cost control

A delegated worker is a real process spending real tokens. Three mechanisms keep the fleet honest, so `status` never lies and no job runs forever:

| Mechanism | When | What it does |
|---|---|---|
| **reconcile** | every broker start | Nothing is live yet, so any worker still claiming `starting`/`running`/`advising`/`paused`/`need_input` is a corpse from the last broker. Rewritten to `dead` (with `staleFrom`), and resumable — `grokctl resume <id>` re-attaches via `session/load` with memory intact. |
| **sweep** (watchdog) | every 30 s, or `grokctl sweep` | Kills any worker whose turn exceeds a wall-clock cap, or whose agent has gone silent. Status becomes `timeout`, with the reason in the inbox. |
| **prune** | every broker start, or `grokctl prune [--days N]` | Deletes terminal worker dirs older than the retention window. Never touches an active or live worker. |

The watchdog only reaps `starting`/`running` — the states that burn tokens unattended. `advising`, `paused` and `need_input` are *resting on you*, not spending, and are never swept (a held permission has its own 30-minute timeout). Concurrency is separately capped by `GROK_CC_MAX_WORKERS` (default 4).

| Env | Default | Meaning |
|---|---|---|
| `GROK_CC_IDLE_MS` | 5 min | no agent activity → kill |
| `GROK_CC_MAX_TURN_MS` | 30 min | hard wall-clock cap per turn → kill |
| `GROK_CC_SWEEP_MS` | 30 s | how often the watchdog runs |
| `GROK_CC_RETAIN_DAYS` | 7 | prune terminal workers older than this |
| `GROK_CC_MAX_WORKERS` | 4 | concurrent `starting`/`running` workers |

## Troubleshooting

- **"broker not running"** → `node bin/grokctl.mjs broker start` (or just run any command; it auto-starts). Note the broker is `broker stop`, not `stop` — a bare `stop` is an unknown command and exits non-zero, leaving a stale broker serving old code.
- **Spawn feels slow when it should be warm** → `node bin/grokctl.mjs warm` shows whether a client is pre-warmed and for which cwd. A `null`, or a different cwd, means the next spawn pays the full ~2 s handshake.
- **Worker stuck `advising`** → `/grok:advise <id>`; an unanswered permission denies after 30 min.
- **Worker shows `timeout`** → the watchdog killed it (reason in `grokctl inbox <id>`). `grokctl resume <id>` picks it back up.
- **Worker shows `dead` with `staleFrom`** → its broker died under it. Resumable; nothing was lost.
- **grok upgraded** → capability probes adapt at handshake; unsupported extensions error clearly instead of crashing.
- **MCP 403 noise in logs** → workers suppress your MCP servers (`mcpServers: []`); harmless.
