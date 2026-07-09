# Benchmark: grok-cc-plugin vs codex plugin

Measured 2026-07-09. The comparison target is the **codex Claude Code plugin** — the best-known external-agent sidecar for Claude Code. Honest numbers, including what couldn't be measured.

## Capability matrix (evidence-based)

Each row verified: grok-cc-plugin by its live test suite (`npm run test:live`) + E2E (`npm run e2e`); codex by reading its plugin source (`~/.claude/plugins/marketplaces/openai-codex/plugins/codex/scripts`).

| Capability | grok-cc-plugin | codex plugin | Evidence |
|---|---|---|---|
| **Mid-flight veto** — deny a specific tool call *before* it executes | ✅ per-call grip gate | ⚠️ `approvalPolicy` fixed at thread start (rescue uses `never`) | grok: live `veto` test (denied `mkdir` never ran). codex: 4 `approvalPolicy` refs, no per-call client mediation |
| **Worker asks back** — blocking `NEED_INPUT` mid-task | ✅ | ❌ no mechanism found | grok: E2E (grok asked for the secret key, resumed after answer). codex: 0 matches for question-back |
| **Push wake** — events wake the advisor, no polling | ✅ `wait` bridge | ⚠️ `status`/`result` poll commands | grok: live `wait` test. codex: commands are `status.md`/`result.md`/`cancel.md` |
| **Resume after death** — re-attach with full memory | ✅ | ✅ session transfer | both proven; grok: live `resume` test |
| **Per-file audit** — every read/write logged with sha256 | ✅ `fs-audit.jsonl` | ⚠️ hashing in state, not per-file fs audit | grok: E2E (3 ops, hashes). codex: `sha256` in 2 files, job-level |
| **Headless automatability** | ✅ clean ACP stdio | ❌ not runnable headless here | see below |
| **`/command` argument hints** | ✅ all commands | ✅ all commands | was codex's only win; closed by adding `argument-hint`/`allowed-tools` frontmatter |
| **Repeat-spawn latency** (same cwd) | ✅ **1.4 ms** warm | n/a — no pre-warm | cold 2205 ms → warm 1.4 ms; cwd miss falls back to cold (1735 ms) |

## Head-to-head task (fix a planted bug)

Same task — fix an off-by-one in `merge_intervals` so `python3 intervals.py` prints `OK` — given to each agent autonomously.

| Agent | Correct | Wall-clock | Notes |
|---|---|---|---|
| **grok-cc-plugin** (`--grip leash`) | ✅ yes | **16.0 s** | spawned, fixed, verified, `done` — zero human touches |
| **grok-cc-plugin** (warm, same cwd) | ✅ yes | **~13.9 s** *(derived)* | the same run minus the 2.1 s pre-prompt the warm pool removes — not a fresh timing; only the pre-prompt segment was measured (2205 ms → 1.4 ms) |
| **codex exec** | — | — | **could not run**: `codex exec --full-auto`, `--dangerously-bypass-approvals-and-sandbox`, and even `codex login status` all hung with no output in this environment |

The codex CLI is not scriptable headless here (interactive-auth / approval gated). This is not a correctness loss — it's an **automatability finding**: grok's headless ACP drove ~40 clean live runs during development; codex's raw CLI wouldn't script at all. It's precisely why the codex plugin needs a persistent app-server broker to use codex at all, whereas grok-cc-plugin talks to `grok agent stdio` directly.

## Verdict

On every axis that could be measured, grok-cc-plugin wins or is uncontested:

- **Interactivity** — per-call veto and blocking NEED_INPUT are unique to grok-cc-plugin; codex's rescue is fire-and-poll.
- **Staleness** — push-based wakes vs poll commands.
- **Automatability** — clean headless ACP vs a CLI that wouldn't run non-interactively.
- **Auditability** — per-file hashed trail vs job-level state.

**Correctness parity** against codex could not be measured head-to-head (codex unavailable headless), so no claim is made that grok-cc-plugin fixes bugs *better* than codex — both are frontier-model-backed. grok-cc-plugin's own correctness is proven: it fixed the planted bug correctly in 16 s, and passes 39 tests (28 offline + 6 live + 5 E2E) with 0 failures.

The design goal was a **more interactive, less stale** sidecar than fire-and-hope delegation. On the measured axes, it is. No improvement loop triggered — grok-cc-plugin already leads where it was built to lead.

*Caveat: the codex comparison is limited by codex being unrunnable headless in this environment. A fairer correctness/speed head-to-head would require codex authenticated and scriptable, or driving the codex plugin from inside a live Claude session.*
