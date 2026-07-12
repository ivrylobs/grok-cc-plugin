# grok-cc-plugin

<p align="center">
  <img src="https://raw.githubusercontent.com/ivrylobs/grok-cc-plugin/main/assets/hero.png" alt="grok-cc — Claude captains. Grok implements. You veto mid-flight." width="820">
</p>

<p align="center">
  A Claude Code plugin that turns Grok into a durable, <strong>veto-gated</strong> worker fleet.<br>
  Claude designs and reviews; Grok workers run the tasks over ACP while Claude gates every risky tool call <em>before it executes</em>.
</p>

> **Not** a Claude replacement, **not** an autonomous swarm, **not** a sandbox. What it adds that a raw `grok` shell-out can't: a mid-flight per-call **veto**, a blocking **NEED_INPUT** so a worker asks instead of inventing, **push-wake** (no polling), and a per-file **sha256 audit** — all measured, all reproducible below.

## Proof, not promises

<p align="center">
  <img src="https://raw.githubusercontent.com/ivrylobs/grok-cc-plugin/main/assets/benchmark.png" alt="Proof scorecard: warm spawn ~1500x faster (2205ms to 1.4ms), a ~16s autonomous bug fix, a worker that asked for the secret key instead of inventing it, and 48 offline + 48 live tests with 0 failures." width="560">
</p>

Every one of those numbers is reproducible **on your machine** — that's the whole pitch. Verify the engineering with no grok account, or the model behavior with one:

```text
$ npm run proof            # offline · no network · no grok login · ~4s

[1/4] warm pool (mock ACP agent, same cwd)
      cold spawn:     32.1 ms
      warm spawn:      1.4 ms   (reused prewarmed client)
      speedup:         23x
[2/4] ask-not-guess contract (mock)
      worker status -> need_input
      question: "which service should I change?"
      invented an answer instead of asking?  no  ok
[3/4] mid-flight veto (mock, grip=gate)
      tool requested: Execute `mkdir evil_dir`
      decision: deny
      ./evil_dir exists after deny?  no  ok
[4/4] offline suite
      47 pass  ·  0 fail  ·  1 live-only skip
──────────────────────────────────────────────────────────
PROVED (offline):  warm pool · ask-not-guess · mid-flight veto · suite
NOT PROVED HERE:   real grok-4.5 inference, ~16s autonomous bugfix
To prove those:    npm run proof:live   (requires: grok login)
proof: OK  (3.7s)
```

Every number is measured on **your** machine, this run — nothing is hardcoded. The mock speaks the identical ACP JSON-RPC/JSONL wire format as `grok agent stdio`, so `npm run proof` tests the whole control plane (broker, veto, ask-not-guess, warm pool) — just not grok's inference. For that:

```text
$ npm run proof:live       # real grok-4.5 · costs tokens · ~30s

[1/3] warm pool (real grok, same cwd)
      cold spawn:    1736 ms   (grok handshake + session/new)
      warm spawn:     1.5 ms   (prewarmed, reused)     ← ~1.7s saved per repeat spawn
[2/3] worker asks instead of guessing
      question: "What is the real production API_KEY value to put in config.txt?"
      invented a key before asking?  no  ok
[3/3] autonomous planted-bug fix  (--grip leash)
      python3 intervals.py -> OK  ✓
      wall-clock: 9.2s   (order of ~16s; varies with model load, not an SLA)
proof:live OK
```

That second stage is the whole pitch in one line: told to write a production secret it didn't have, the worker **asked for it** instead of hallucinating one — and wrote nothing to the file until answered.

## Install

This repo is its own marketplace. Add it, then install:

```bash
claude plugin marketplace add ivrylobs/grok-cc-plugin
claude plugin install grok@grok-cc
```

`marketplace add` also takes a local path or any git URL. Uninstall with `claude plugin uninstall grok@grok-cc`; update after a pull with `claude plugin marketplace update grok-cc`.

**Requires:** Node ≥ 20 · the `grok` CLI (0.2.91+) logged in (`grok login`) · Claude Code. The SessionStart hook auto-starts the broker; restart Claude Code after install so the hook and `/grok:*` commands load.

## What you just proved

| Proof line | The claim it backs |
|---|---|
| cold → warm spawn | **Warm pool** pre-handshakes a worker per cwd; the repeat spawn skips grok's ~2s handshake. |
| `status -> need_input` + question | **Workers ask, not guess** — no context, no hallucination; the turn blocks on a real question. |
| denied `mkdir`, dir absent | **Real veto** — every tool call routes through the grip policy *before* it runs. A denied action never executes. |
| 48 tests, 0 fail | The control plane is covered by a deterministic mock ACP agent; live runs prove grok itself. |
| autonomous fix → `OK` | A worker fixed a planted off-by-one under `--grip leash`, fully autonomous, verified by the file's own test. |

Two more you don't see in the proof but get for free: **push-wake** (worker events wake Claude via background-task notifications — no polling loop) and **durability** (kill the broker mid-task; `/grok:resume <id>` re-attaches the session with full memory).

## The 30-second model

You (via Claude) delegate a task with `/grok:work`. A broker daemon spawns a real `grok agent stdio` process and drives it over ACP. Every file the worker touches goes through Claude's mediator (contained to the workspace, sha256-audited); every risky tool call pauses for your veto; every question it raises wakes you. You stay the captain — Grok never runs unsupervised, and never silently runs on a model you didn't pick.

```mermaid
%%{init: {'theme':'base','themeVariables':{'fontFamily':'-apple-system,Segoe UI,Roboto,sans-serif','primaryColor':'#E9E2D0','primaryBorderColor':'#111111','lineColor':'#C65E39','actorBkg':'#E9E2D0','actorBorder':'#111111','actorTextColor':'#111111','noteBkgColor':'#C65E39','noteTextColor':'#111111','noteBorderColor':'#111111'}}}%%
sequenceDiagram
  autonumber
  participant You as You · Claude
  participant Broker as grokd broker
  participant Grok as Grok worker
  You->>Grok: /grok:work "fix the failing test"
  Grok->>Broker: tool call — run `rm -rf build`
  Broker->>You: veto? (turn paused before it runs)
  You-->>Broker: deny
  Note over Grok: the command never executes
  Grok->>Broker: NEED_INPUT — "what's the prod API key?"
  Broker->>You: worker is asking (wakes you — no polling)
  You-->>Grok: here's the key
  Grok->>You: STATUS: DONE + result (you verify)
```

```bash
/grok:work fix the failing test in auth/           # delegate; a background wait arms itself
# ... you get woken when it asks, finishes, or hits something risky ...
/grok:advise <id>                                  # approve, veto (+ guidance), or answer
/grok:result <id>                                  # verify its work before you accept it
```

## Commands

| Command | Does |
|---|---|
| `/grok:work <task>` | Delegate a task to a worker; arms a background wait so events wake you |
| `/grok:status [id]` | List workers, or show one |
| `/grok:advise <id>` | Review a worker's pending request; approve, veto (`+ guidance`), or answer |
| `/grok:result <id>` | Fetch a finished worker's result (verify before accepting) |
| `/grok:resume <id>` | Re-attach a dead worker with memory intact |
| `/grok:fork <id>` | Branch a worker's session — *not wired in v0.1.0; returns a clear error, use `spawn --session` to branch manually* |
| `/grok:kill <id>` | Stop a worker |
| `/grok:config [--model <id>] [--effort low\|medium\|high]` | Show or set the default worker model / reasoning effort |

Under the hood everything is one CLI: `node bin/grokctl.mjs <op>` (JSON in/out). Commands are thin wrappers.

## Grip levels

Set per worker with `--grip` on spawn (default `advise`):

| Grip | In-tree writes | Shell / destructive / out-of-tree | Use |
|---|---|---|---|
| `gate` | staged until `approve-stage` | every request → you decide | untrusted tasks, production trees |
| `advise` *(default)* | direct, audited, contained | read-only inspection auto-runs (`ls`/`cat`/`grep`/`git status\|diff\|log`); test runners, mutations, everything else → you decide | normal work |
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

```mermaid
%%{init: {'theme':'base','themeVariables':{'fontFamily':'-apple-system,Segoe UI,Roboto,sans-serif','fontSize':'15px'}}}%%
flowchart TB
  C["Claude Code — the captain<br/>commands · skills · hooks · your veto"]
  B["grokd — broker daemon<br/>worker pool · fs mediation · permission inbox · wake bridge"]
  W["grok agent stdio × N<br/>grok-4.5 · grok-composer-2.5-fast"]
  C -->|"grokctl · JSON over unix socket"| B
  B -->|"ACP · JSON-RPC / JSONL over stdio"| W
  W -.->|"fs read/write · contained + sha256 audited"| B
  W -.->|"risky tool call · held for your veto"| B
  classDef captain fill:#111111,color:#E9E2D0,stroke:#C65E39,stroke-width:2px;
  classDef broker fill:#E9E2D0,color:#111111,stroke:#111111,stroke-width:2px;
  classDef worker fill:#C65E39,color:#111111,stroke:#111111,stroke-width:2px;
  class C captain
  class B broker
  class W worker
```

- **grokd** — one Node daemon (stdlib only). Spawns a `grok agent stdio` child per worker, mediates `fs/read|write` (audit + containment + optional staging), holds `session/request_permission` calls open until you answer, and blocks `wait` until a worker event fires.
- **grokctl** — the only thing Claude runs. Auto-starts the broker.
- **Managed permissions** — workers spawn under a plugin-managed `GROK_HOME` that forces `permission_mode = default`, so the grip policy is the sole authority. Your global grok config is untouched.

State lives in `~/.grok-cc/` (override `GROK_CC_HOME`): per-worker `meta.json`, `events.jsonl`, `inbox.jsonl`, `fs-audit.jsonl`, and `staged/`.

## Testing & honesty

```bash
npm run proof       # offline scorecard: warm pool + ask-not-guess + veto + suite (~4s, no login)
npm run proof:live  # real grok-4.5: warm pool + API_KEY ask + autonomous bugfix (~30s, costs tokens)
npm test            # deterministic mock ACP agent, milliseconds, no grok/network
npm run test:live   # truth pass: real grok-4.5 (needs login), ~50s
npm run e2e         # full spec §9 walk via grokctl vs real grok
```

The mock (`test/mock-agent.mjs`) speaks the identical ACP wire format, so protocol regressions surface instantly; live runs prove real grok behavior. Verified 2026-07-09 (grok 0.2.91, node 22.22.3): **48 offline (1 live-only skip) + 48 live, 0 failures.**

What we **don't** claim, on purpose:

- **`leash` is not a sandbox** (see below). Shell under `leash` runs with the broker's privileges.
- The warm-pool ~2s saving is real-grok handshake time — the offline proof shows the mechanism on the mock, not that number; `proof:live` shows the number.
- Live wall-clock (`~16s` bugfix) varies with model load; it's an order of magnitude, not an SLA.
- We make **no** claim to fix bugs "better" than any other tool. That isn't a hedge — it's a
  **measured result**. We ran a pre-registered, blind, adversarial experiment (the *paper-kill*)
  to test the stronger claim — *does a Grok peer make the code better than solo Claude?* — and it
  returned **KILL** for greenfield scope. So the 0.4.0 "duel" machinery is deliberately unbuilt.
  The whole honest story, with the data: **[THESIS.md](THESIS.md)** and
  **[example/paper-kill/](example/paper-kill/)**. See [BENCHMARK.md](BENCHMARK.md) for the
  capability matrix.

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
