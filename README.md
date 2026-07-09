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

Under the hood everything is one CLI: `node bin/grokctl.mjs <op>` (JSON in/out). Commands are thin wrappers.

## Grip levels

Set per worker with `--grip` on spawn (default `advise`):

| Grip | In-tree writes | Shell / destructive / out-of-tree | Use |
|---|---|---|---|
| `gate` | staged until `approve-stage` | every request → you decide | untrusted tasks, production trees |
| `advise` *(default)* | direct, audited, contained | read-only shell auto-runs; mutations → you decide | normal work |
| `leash` | direct, audited | everything auto-runs except a deny-list (`rm -rf`, `git push`, `sudo`, `curl\|sh`) | trusted mechanical tasks |

Containment (writes confined to the worker's cwd) is enforced by the fs-mediator regardless of grip — it's the backstop under every level.

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

The mock (`test/mock-agent.mjs`) speaks the identical ACP wire format, so protocol regressions surface instantly; live runs prove real grok behavior. Verified 2026-07-09 (grok 0.2.91): 28 offline + 6 live + 5 E2E, 0 failures.

## Troubleshooting

- **"broker not running"** → `node bin/grokctl.mjs broker start` (or just run any command; it auto-starts).
- **Worker stuck `advising`** → `/grok:advise <id>`; an unanswered permission denies after 30 min.
- **grok upgraded** → capability probes adapt at handshake; unsupported extensions error clearly instead of crashing.
- **MCP 403 noise in logs** → workers suppress your MCP servers (`mcpServers: []`); harmless.
