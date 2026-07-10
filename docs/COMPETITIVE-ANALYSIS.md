# Competitive analysis: grok-cc-plugin

**Date:** 2026-07-09  
**Scope:** Claude Code plugins / bridges that delegate work to an *external* agent CLI (or multi-agent fleet), plus ACP prior art.  
**Method:** Step 1 = local source inventory with file-path citations. Steps 2–4 = GitHub/`gh` searches and **fetched** README/source URLs only. No claim about another project is made without a URL that was actually retrieved in this session.

**Constraint note:** This document does not describe Grok model internals or capabilities; it compares *control planes* for delegating work out of Claude Code.

---

## Step 1 — Our feature inventory (source-backed)

Everything below is present in this repo. Citations are file paths under the repo root.

### 1.1 Product shape

| Item | Evidence |
|------|----------|
| Claude Code plugin marketplace package (`name: grok`) | `.claude-plugin/plugin.json` |
| Tagline / value prop: veto-gated, resumable Grok workers over ACP | `README.md` L1–12, `package.json` L2–4 |
| Requires Node ≥ 20, `grok` CLI (0.2.91+), Claude Code | `README.md` L76–77 |
| SessionStart hook auto-starts broker | `hooks/hooks.json`, `README.md` L77 |

### 1.2 Slash commands

| Command | Role | Evidence |
|---------|------|----------|
| `/grok:work` | Delegate task; optional `--grip`, `--model`, `--effort`; arms background `wait` | `commands/work.md` |
| `/grok:status` | List all workers or one by id | `commands/status.md` |
| `/grok:advise` | Drain inbox: approve/deny permission, answer NEED_INPUT, handle checkpoint/done | `commands/advise.md` |
| `/grok:result` | Fetch finished result JSON | `commands/result.md` |
| `/grok:resume` | Re-attach dead worker via session load | `commands/resume.md` |
| `/grok:kill` | Stop worker | `commands/kill.md` |
| `/grok:fork` | Intended session fork; **not wired in v0.1.0** (clear error; manual branch via `--session`) | `commands/fork.md` |
| `/grok:config` | Show/set default model + effort | `commands/config.md` |

All commands shell out to one CLI: `node bin/grokctl.mjs …` (`README.md` L132).

### 1.3 Skills & subagent

| Asset | Role | Evidence |
|-------|------|----------|
| `grok:advisory-loop` | Push-wake etiquette: arm `wait`, drain inbox, veto + `say` guidance order | `skills/advisory-loop/SKILL.md` |
| `grok:delegation-contract` | Brief writing, STATUS protocol, model routing, grip choice | `skills/delegation-contract/SKILL.md` |
| `grok-worker` agent | Thin spawn → wait loop → return `result` verbatim | `agents/grok-worker.md` |

### 1.4 CLI surface (`grokctl` / broker)

`bin/grokctl.mjs` ops (JSON in/out):

| Op | Notes | Evidence |
|----|-------|----------|
| `broker start\|stop\|status` | Detached daemon; auto-start on most commands | `bin/grokctl.mjs` L26–44, L188–214 |
| `spawn` | `--task`, `--cwd`, optional `--grip`, `--model`, `--effort`, `--session` | `bin/grokctl.mjs` L109–125, L219–221 |
| `list`, `status`, `result`, `inbox`, `kill`, `resume`, `fork` | Worker lifecycle | `bin/grokctl.mjs` L223–231 |
| `say`, `answer` | Mid-task guidance; allow/deny permission | `bin/grokctl.mjs` L233–241 |
| `wait` | Blocks until worker event; exit 2 on timeout (heartbeat) | `bin/grokctl.mjs` L243–247; `bin/grokd.mjs` L49–63 |
| `approve-stage` | Apply staged writes under `gate` grip | `bin/grokctl.mjs` L249–254; `lib/fs-mediator.mjs` L121–138 |
| `config`, `models` | Defaults; list models via real `grok models` | `bin/grokctl.mjs` L159–179 |
| `warm`, `sweep`, `prune` | Warm-pool diagnostics; watchdog; retention | `bin/grokctl.mjs` L184–186 |

Broker (`bin/grokd.mjs`): Unix socket RPC, concurrency cap `GROK_CC_MAX_WORKERS` (default 4), reconcile + prune on start, periodic sweep, idle exit after 2h.

### 1.5 Grip modes (permission policy)

| Grip | Behavior | Evidence |
|------|----------|----------|
| `gate` | Every tool call asks; **file writes staged** until `approve-stage` | `README.md` L136–142; `lib/policy.mjs` L93–94; `lib/fs-mediator.mjs` L100–104 |
| `advise` *(default)* | In-tree read/write/edit auto; read-only shell (`ls`/`cat`/`grep`/`rg`/`git status\|diff\|log`) auto; else ask. Tests auto only if `GROK_CC_ADVISE_TESTS=1` | `lib/policy.mjs` L8–94; `README.md` L140–141 |
| `leash` | Auto-allow except deny-list (`rm -r*`, `git push`, `sudo`, `curl\|sh`, inline interpreters, `sh -c`, `eval`) | `lib/policy.mjs` L41–90; `README.md` L142–146 |

Explicit honesty: **leash is not a sandbox**; shell runs with broker privileges; fs containment applies to grok file tools only (`README.md` L144–146; `lib/policy.mjs` L35–40).

### 1.6 Mid-flight veto & managed permissions

| Mechanism | Evidence |
|-----------|----------|
| ACP `session/request_permission` held until advisor answers | `lib/worker.mjs` L267–293 |
| Policy decision `allow` vs `ask` via `decideToolCall` | `lib/policy.mjs`; `lib/worker.mjs` L271–274 |
| `answer allow\|deny`; deny cancels turn; 30 min permission timeout | `lib/worker.mjs` L13, L275–305; `skills/advisory-loop/SKILL.md` |
| Managed `GROK_HOME` forces `permission_mode = "default"` so grip is sole authority | `lib/grok-home.mjs`; `lib/acp-client.mjs` L14–17 |

### 1.7 Ask-not-guess / STATUS protocol

| Mechanism | Evidence |
|-----------|----------|
| Brief injects mandatory `STATUS: WORKING\|NEED_INPUT\|DONE\|BLOCKED` + `QUESTION:` | `lib/worker.mjs` L110–125 |
| Parser maps status → worker state + inbox items | `lib/contract.mjs`; `lib/worker.mjs` L253–257 |
| Inbox types: `permission`, `need_input`, `checkpoint`, `done`, `blocked`, `error` | `lib/worker.mjs` pushInbox sites; `commands/advise.md` |

### 1.8 Push-wake (no polling loop)

| Mechanism | Evidence |
|-----------|----------|
| `events.emit('wake')` on inbox push | `lib/worker.mjs` L127–129 |
| `grokctl wait` resolves on wake or timeout | `bin/grokd.mjs` L49–63 |
| Commands/skills re-arm wait as background Bash | `commands/work.md` L12–13; `skills/advisory-loop/SKILL.md` L7 |

### 1.9 Resumability & durability

| Mechanism | Evidence |
|-----------|----------|
| ACP `session/load` on resume | `lib/worker.mjs` L320–327, L189–190 |
| Broker restart → reconcile active statuses to `dead` + `staleFrom` (resumable) | `lib/worker.mjs` L349–357; `README.md` L223 |
| Spawn with `--session` for manual branch | `bin/grokctl.mjs` L115–123; `commands/fork.md` |
| Fork API probed but params unmapped (v0.1.0) | `lib/acp-client.mjs` L10; `bin/grokd.mjs` L43–46 |

### 1.10 FS containment & audit

| Mechanism | Evidence |
|-----------|----------|
| `containedPath` / PATH_ESCAPE | `lib/fs-mediator.mjs` L29–37 |
| Mediate ACP `fs/read_text_file` + `fs/write_text_file` | `lib/worker.mjs` L260–263; `lib/fs-mediator.mjs` L80–112 |
| Per-op `fs-audit.jsonl` with sha256 + bytes | `lib/fs-mediator.mjs` L43–48, L84–109 |
| Gate staging under worker `staged/` | `lib/fs-mediator.mjs` L100–104 |
| State root `~/.grok-cc/` (override `GROK_CC_HOME`): meta, events, inbox, audit | `lib/store.mjs`; `README.md` L192 |

### 1.11 Warm pool & lifecycle cost control

| Mechanism | Evidence |
|-----------|----------|
| Pre-handshake one ACP client per cwd; warm spawn reuses | `lib/worker.mjs` L24–105, L173–177 |
| Watchdog sweep: idle / max-turn kill → `timeout` (only burning statuses) | `lib/worker.mjs` L360–388; `README.md` L219–236 |
| Prune terminal workers older than retain days | `lib/worker.mjs` L391–402 |
| Env knobs: `GROK_CC_IDLE_MS`, `MAX_TURN_MS`, `SWEEP_MS`, `RETAIN_DAYS`, `MAX_WORKERS` | `README.md` L229–236 |

### 1.12 Model / effort routing

| Mechanism | Evidence |
|-----------|----------|
| Precedence: spawn flags → env → config.json → grok default | `lib/config.mjs`; `README.md` L150–155 |
| `session/set_model` / `session/set_mode`; rejection → inbox `error` (no silent fallback) | `lib/worker.mjs` L197–214 |

### 1.13 Transport

| Mechanism | Evidence |
|-----------|----------|
| Spawns `grok agent stdio` | `lib/acp-client.mjs` L17 |
| ACP JSON-RPC/JSONL: initialize, session/new\|load\|prompt, fs/*, session/request_permission | `lib/acp-client.mjs`; `lib/worker.mjs` |
| Extension probes: fork, worktree list, prompt_history, set_mode, set_model | `lib/acp-client.mjs` L10, L84–90 |
| Workers get `mcpServers: []` | `lib/worker.mjs` L187–190 |
| Client ↔ broker: JSON over Unix socket | `bin/grokctl.mjs`, `bin/grokd.mjs` |

### 1.14 Proof scripts & tests

| Asset | What it proves | Evidence |
|-------|----------------|----------|
| `npm run proof` | Offline control plane: warm pool, NEED_INPUT, mid-flight veto, suite | `scripts/proof.mjs`; `package.json` L11; `README.md` L23–44 |
| `npm run proof:live` | Real grok: warm pool, ask-not-guess secret, autonomous bugfix under leash | `scripts/proof-live.mjs`; `README.md` L48–61 |
| `npm test` | Mock ACP agent suite | `package.json` L13; `test/mock-agent.mjs` |
| `npm run test:live` / `e2e` | Live truth pass + full walk | `package.json` L14–15 |
| Capability matrix vs codex (honest gaps) | `BENCHMARK.md` |

Claimed offline+live counts in docs: **48 offline (1 live-only skip) + 48 live, 0 failures** (`README.md` L205; `BENCHMARK.md` L41).

### 1.15 What we explicitly do **not** ship (v0.1.0)

| Missing / limited | Evidence |
|-------------------|----------|
| Wired session fork | `commands/fork.md` |
| Built-in `/review` or stop-time review gate | no `commands/review*`; hooks only SessionStart |
| Head-to-head correctness claim vs codex | `BENCHMARK.md` L28–30, L41–42 |
| Shell sandbox under leash | `README.md` L144–146 |

---

## Step 2 — Prior art (fetched sources)

Research used: `gh search repos`, `gh repo view`, `gh api …/readme`, local install of OpenAI codex plugin at `~/.claude/plugins/marketplaces/openai-codex/plugins/codex/` (same marketplace as `openai/codex-plugin-cc`), and raw README fetches where noted.

### 2.1 Search notes

| Query theme | Notable hits (fetched) |
|-------------|------------------------|
| Claude Code ↔ external agent CLI | [openai/codex-plugin-cc](https://github.com/openai/codex-plugin-cc), [simplybychris/antigravity-plugin-cc](https://github.com/simplybychris/antigravity-plugin-cc), [7D-codes/kimi-for-claude](https://github.com/7D-codes/kimi-for-claude), [sshahzaiib/agy-bridge](https://github.com/sshahzaiib/agy-bridge), [sakibsadmanshajib/gemini-plugin-cc](https://github.com/sakibsadmanshajib/gemini-plugin-cc) |
| ACP bridges | [agentclientprotocol/agent-client-protocol](https://github.com/agentclientprotocol/agent-client-protocol), [cola-io/codex-acp](https://github.com/cola-io/codex-acp), [Xuanwo/acp-claude-code](https://github.com/Xuanwo/acp-claude-code) |
| Grok + Claude Code | **No first-party xAI Claude Code plugin found.** Related: this repo [ivrylobs/grok-cc-plugin](https://github.com/ivrylobs/grok-cc-plugin); [tuxclaw/grok-acp-openclaw](https://github.com/tuxclaw/grok-acp-openclaw) (OpenClaw backend notes, 0★); [hristo2612/jinn](https://github.com/hristo2612/jinn) (orchestrates grok among other CLIs); community [superagent-ai/grok-cli](https://github.com/superagent-ai/grok-cli) (standalone agent, not a CC plugin) |
| Multi-agent / fleets | [Intelligent-Internet/zenith](https://github.com/Intelligent-Internet/zenith), [aaddrick/claude-pipeline](https://github.com/aaddrick/claude-pipeline), [hristo2612/jinn](https://github.com/hristo2612/jinn) |
| zed-industries/claude-code-acp | **No repo found under `zed-industries` for that name** in this session’s `gh` searches. ACP home is now [agentclientprotocol/agent-client-protocol](https://github.com/agentclientprotocol/agent-client-protocol) (protocol org; Zed-origin ecosystem). |

### 2.2 Project dossiers (fetched URLs)

#### A. openai/codex-plugin-cc — primary category twin

| Field | Value |
|-------|--------|
| Repo | [openai/codex-plugin-cc](https://github.com/openai/codex-plugin-cc) |
| Stars / last push | **27,023** / **2026-07-08** (`gh repo view`) |
| Transport | Codex **App Server** (JSON-RPC over broker/socket), not ACP — [README](https://raw.githubusercontent.com/openai/codex-plugin-cc/main/README.md); local `scripts/lib/app-server.mjs` |
| Delegates | Codex CLI for **review**, **adversarial-review**, **rescue** tasks |
| Permission gating | Thread-level `approvalPolicy` default **`never`** + sandbox `read-only` / `workspace-write` — local `scripts/lib/codex.mjs` L67–81; **not** mid-flight per-call veto to Claude |
| Resumability | `--resume` / `--fresh` / `task-resume-candidate`; Codex thread continue — [README](https://raw.githubusercontent.com/openai/codex-plugin-cc/main/README.md) rescue section |
| Session persistence | Job state + Codex session id; `/codex:transfer` imports Claude transcript into Codex thread |
| Background / parallel | `--background` jobs, `/codex:status`, `/codex:cancel`, `/codex:result` |
| Cost / benchmark | No offline proof suite like ours; BENCHMARK.md in **this** repo notes codex CLI was unrunnable headless here |

Local marketplace tree confirms commands: `rescue`, `review`, `adversarial-review`, `status`, `result`, `cancel`, `transfer`, `setup` + Stop-hook **review gate**.

#### B. sakibsadmanshajib/gemini-plugin-cc — ACP-architecture twin (deprecated)

| Field | Value |
|-------|--------|
| Repo | [sakibsadmanshajib/gemini-plugin-cc](https://github.com/sakibsadmanshajib/gemini-plugin-cc) |
| Stars / last push | **23** / **2026-05-22** |
| Transport | **ACP** via `gemini --experimental-acp` + Unix socket broker — [README differences table](https://github.com/sakibsadmanshajib/gemini-plugin-cc) (fetched README) |
| Delegates | Gemini CLI (review / rescue / status / result / cancel / setup) |
| Permission gating | Mode switch `approvalMode: auto_edit|default|yolo|plan` via `session/set_mode` — source `plugins/gemini/scripts/lib/gemini.mjs` (default **`auto_edit`** for tasks; **`plan`** for reviews). No Claude-side mid-flight veto UI |
| Resumability | `--resume` / `--fresh`; external `gemini --resume` |
| Session / background | Same job model as codex port; stop-time review gate |
| Note | README marks plugin **DEPRECATED** (Gemini CLI retirement 2026-06-18); successor [sakibsadmanshajib/antigravity-plugin](https://github.com/sakibsadmanshajib/antigravity-plugin) **dropped ACP** (“Spike findings: why we dropped ACP”) |

#### C. simplybychris/antigravity-plugin-cc — thin shell-out

| Field | Value |
|-------|--------|
| Repo | [simplybychris/antigravity-plugin-cc](https://github.com/simplybychris/antigravity-plugin-cc) |
| Stars / last push | **46** / **2026-05-27** |
| Transport | **Raw CLI** (`agy -p`, etc.); “no Node runtime, no broker” — [README](https://github.com/simplybychris/antigravity-plugin-cc) |
| Delegates | Antigravity (`agy`) for ask / delegate / research / review / image |
| Permission gating | None in plugin; relies on host + `agy` defaults |
| Resumability | Not a durable worker fleet |
| Background | `--background` on delegate/research via Claude Code subagent |

#### D. 7D-codes/kimi-for-claude — MCP delegate

| Field | Value |
|-------|--------|
| Repo | [7D-codes/kimi-for-claude](https://github.com/7D-codes/kimi-for-claude) |
| Stars / last push | **34** / **2026-06-30** |
| Transport | **MCP stdio** → shells `kimi --prompt` — [README](https://github.com/7D-codes/kimi-for-claude) |
| Delegates | Kimi CLI coding agent |
| Permission gating | “Safety gate is Claude Code’s permission prompt on each MCP tool call” (pre-start gate), not mid-task tool veto inside Kimi |
| Resumability | `kimi_continue` / session follow-up |
| Background | `background` tool arg + `kimi_status` / `kimi_cancel` |
| Other | Optional `work_dir`, `readonly` plan mode; 6k output truncation |

#### E. sshahzaiib/agy-bridge — MCP + continuity + optional sandbox

| Field | Value |
|-------|--------|
| Repo | [sshahzaiib/agy-bridge](https://github.com/sshahzaiib/agy-bridge) |
| Stars / last push | **30** / **2026-07-04** |
| Transport | **MCP** → `agy` CLI — [README](https://github.com/sshahzaiib/agy-bridge) |
| Delegates | Purpose-built tools: analyze_files, deep_search, web_lookup, adversarial_review, delegate, follow_up |
| Permission gating | Claude MCP tool approval; optional **`--sandbox`** on agy |
| Resumability | **Session continuity** via `follow_up` |
| Background / cost | Output truncation; model routing with fallback; unit tests without agy |

#### F. hristo2612/jinn — multi-engine org (not a CC plugin)

| Field | Value |
|-------|--------|
| Repo | [hristo2612/jinn](https://github.com/hristo2612/jinn) |
| Stars / last push | **172** / **2026-07-07** |
| Transport | Gateway daemon + engines (claude, codex, **grok**, hermes/ACP, agy, …) — [README](https://github.com/hristo2612/jinn) |
| Delegates | YAML org hierarchy, cron, connectors (Slack/etc.) |
| Permission gating | Engine-dependent; Hermes noted “fully auto-approved” over ACP |
| Resumability / parallel | Full company model: child sessions, dashboard |
| Relevance | Closest **Grok-in-fleet** product; **not** Claude-captain + veto-gate design |

#### G. Protocol & adapters (infrastructure, not product competitors)

| Repo | Stars / push | Role | URL |
|------|--------------|------|-----|
| agentclientprotocol/agent-client-protocol | 3610 / 2026-07-09 | ACP schema & SDKs | https://github.com/agentclientprotocol/agent-client-protocol |
| cola-io/codex-acp | 142 / 2026-01-06 | Codex runtime as ACP agent (modes read-only/auto/full-access; client FS tools) | https://github.com/cola-io/codex-acp |
| Xuanwo/acp-claude-code | 238 / 2025-09-08 | ACP implementation for Claude Code (editor↔agent direction) | https://github.com/Xuanwo/acp-claude-code |
| tuxclaw/grok-acp-openclaw | 0 / 2026-05-22 | Grok CLI + ACP as OpenClaw backend notes | https://github.com/tuxclaw/grok-acp-openclaw |

#### H. Multi-agent Claude-native (same host, not external CLI)

| Repo | Notes | URL |
|------|-------|-----|
| Intelligent-Internet/zenith | Long-horizon harness; workers via MCP/ACP adapters (`claude-agent-acp`, `codex-acp`); published cost/rank benchmarks | https://github.com/Intelligent-Internet/zenith |
| aaddrick/claude-pipeline | Portable `.claude/` multi-agent pipeline; uses `--dangerously-skip-permissions` | https://github.com/aaddrick/claude-pipeline |

These compete for “orchestration mindshare,” not the same “external agent sidecar with per-call grip” niche.

---

## Step 3 — Feature matrix

**Columns** = us + the six most relevant external systems for Claude-captain → worker delegation.

Legend: **Y** = yes · **P** = partial · **N** = no / not found in fetched sources.

| Feature | **grok-cc** (us) | **codex-plugin-cc** | **gemini-plugin-cc** | **antigravity-cc** | **kimi-for-claude** | **agy-bridge** | **jinn** |
|---------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Claude Code plugin install | Y `plugin.json` | Y [README](https://github.com/openai/codex-plugin-cc) | Y [README](https://github.com/sakibsadmanshajib/gemini-plugin-cc) | Y [README](https://github.com/simplybychris/antigravity-plugin-cc) | N (MCP) [README](https://github.com/7D-codes/kimi-for-claude) | N (MCP) [README](https://github.com/sshahzaiib/agy-bridge) | N (own daemon) [README](https://github.com/hristo2612/jinn) |
| Transport | ACP stdio `lib/acp-client.mjs` | App Server local `app-server.mjs` | ACP broker [README](https://github.com/sakibsadmanshajib/gemini-plugin-cc) | Raw `agy` CLI [README](https://github.com/simplybychris/antigravity-plugin-cc) | MCP→CLI [README](https://github.com/7D-codes/kimi-for-claude) | MCP→CLI [README](https://github.com/sshahzaiib/agy-bridge) | multi-engine PTY/ACP [README](https://github.com/hristo2612/jinn) |
| Delegate implementation work | Y `/grok:work` | Y `/codex:rescue` | Y `/gemini:rescue` | Y `/agy:delegate` | Y `kimi_delegate` | Y `delegate` tool | Y org delegation |
| Built-in code review commands | N | Y review + adversarial | Y same port | Y `/agy:review` | N | Y `adversarial_review` | P (employee personas) |
| **Mid-flight per-call veto** (deny before execute) | **Y** grip + `request_permission` hold | **N** `approvalPolicy: never` at start | **N** mode `auto_edit` default | N | N (MCP pre-approve only) | N | engine-dependent; not Claude veto |
| **Blocking NEED_INPUT / ask-not-guess** | **Y** STATUS protocol | N (not in README/source search) | N | N | N | N | N as product feature |
| **Push-wake** (event blocks until inbox) | **Y** `wait` bridge | P poll `status` / `--wait` job | P same as codex port | P CC background notify | P MCP bg + status | P | dashboard events |
| Resume after process death | Y `session/load` + reconcile | Y thread resume | Y `--resume` / gemini resume | N durable fleet | P `kimi_continue` | Y `follow_up` | Y sessions |
| Session import Claude→worker | N | **Y** `/codex:transfer` | N (not in differences table) | N | N | N | N |
| Background multi-job tracking | Y list/status/kill | Y polished job table + cancel | Y | P | Y | P | Y fleet |
| Concurrent worker cap | Y `MAX_WORKERS` | P tracked jobs | P | N | N stated | N stated | Y org |
| Warm pool / pre-handshake | **Y** cwd warm client | N found | P persistent broker process | N | N | N | N |
| FS containment (workspace) | Y mediator PATH_ESCAPE | P sandbox modes | P approval modes | N | P `work_dir` | P optional `--sandbox` | engine-dependent |
| **Per-file sha256 fs audit log** | **Y** `fs-audit.jsonl` | P job-level/content hash in state | N found | N | N | N | N found |
| **Staged writes + approve-stage** | **Y** grip=gate | N | N | N | N | N | N |
| Grip / policy tiers | **Y** gate/advise/leash | P sandbox read-only vs write | P plan/auto_edit/yolo | N | P readonly flag | P sandbox flag | P modes |
| Model + effort routing | Y config/env/flags | Y model/effort | P model (no effort via ACP) | Y `--model` | N stated | Y routing+fallback | Y per employee |
| Stop-time review gate hook | N | **Y** Stop hook | Y (port) | N | N | N | N |
| Setup installs CLI | N (docs only) | **Y** `/codex:setup` | Y | Y `/agy:setup` | docs only | npx docs | `jinn setup` |
| Offline deterministic proof | **Y** `npm run proof` | N found | tests mentioned | N | N | unit tests (mocked) | N found |
| Live reproducible scorecard | **Y** `proof:live` + BENCHMARK | N | N | N | N | N | N |
| Worktree fan-out | P probe only (`_x.ai/git/worktree/list`) | N | N | N | P separate `work_dir` | N | P child sessions |
| Multi-engine (not single backend) | N (Grok only) | N | N | N | N | multi-model via agy | **Y** |
| Cron / Slack org layer | N | N | N | N | N | N | **Y** |
| Public stars (market) | 0 | 27k | 23 | 46 | 34 | 30 | 172 |

### 3.1 Features **we have that nobody else does** (in this set)

Intersection of unique or near-unique control-plane features, with no peer implementing the full set:

1. **Mid-flight per-call veto with Claude as captain** while the worker turn is *paused* (`session/request_permission` hold + `/grok:advise`) — peers fix approval at job start or rely on MCP pre-approval.
2. **Blocking NEED_INPUT / ask-not-guess contract** as a first-class worker state + inbox item — not found in codex/gemini/agy/kimi docs or sources reviewed.
3. **Push-wake `wait` bridge** coupled to that inbox (exit 0 event / exit 2 heartbeat) rather than status polling loops — codex has poll/`--wait` job completion, not permission/NEED_INPUT event wakes.
4. **Grip-staged writes + `approve-stage`** under `gate` — no peer stages worker file tools until human apply.
5. **Per-file sha256 `fs-audit.jsonl` on every mediated read/write** — codex hashes appear job/workspace-level, not this audit trail.
6. **Managed agent home forcing client-authoritative permissions** (`lib/grok-home.mjs`) so global agent “auto” config cannot bypass the gate.
7. **Offline mock-ACP proof scorecard** proving warm pool + veto + ask-not-guess without network/login (`scripts/proof.mjs`).

### 3.2 Features **others have that we lack**

| Gap | Who has it | Evidence | Priority note |
|-----|------------|----------|---------------|
| First-class **review / adversarial-review** commands | codex, gemini port, agy, agy-bridge | their READMEs | High UX value; different job class than “worker fleet” |
| **Stop-time review gate** | codex, gemini port | Stop hook in hooks.json / README warning | Controversial (usage burn); optional |
| **Claude→worker session transfer** | codex `/codex:transfer` | [README](https://raw.githubusercontent.com/openai/codex-plugin-cc/main/README.md) | High for “continue in native TUI” |
| Polished **job status table** + cancel UX | codex | status.md companion | Medium polish |
| **`/setup` that installs CLI** | codex, gemini, agy | READMEs | Medium onboarding |
| **Prompt-engineering skill pack** for worker model | codex `gpt-5-4-prompting` | local skills tree | Medium quality |
| **MCP install path** (broader surface) | kimi, agy-bridge | READMEs | Low if plugin is primary |
| **Optional CLI sandbox flag** | agy-bridge `--sandbox` | README | Medium; we document leash≠sandbox |
| **Multi-engine org / cron / Slack** | jinn | README | **YAGNI** for this plugin’s mission |
| **Long-horizon mission harness + published cost ranks** | zenith | [README](https://github.com/Intelligent-Internet/zenith) | Different product; don’t clone wholesale |
| **Dangerously skip permissions pipelines** | claude-pipeline | README warning | **Do not build** — opposite of our grip thesis |

### 3.3 Features **nobody has** (whitespace)

Open space where *no* reviewed project combines the pieces (or owns the idea at all):

| Whitespace | Why it matters |
|------------|----------------|
| **Interactive grip mid-task** (upgrade/downgrade gate↔advise↔leash without killing session) | Peers set mode at start only |
| **Cross-worker dependency graph** with push-wake (A finishes → B wakes) without full org platform | jinn has org; plugins are single-job |
| **Shared sha256 audit that diffs worker writes against Claude’s own edits** for merge confidence | We audit worker only |
| **Headless multi-agent proof harness comparing two external CLIs under identical planted bugs** | Our BENCHMARK couldn’t run codex headless; nobody publishes this cleanly for CC plugins |
| **Permission telemetry**: rate of denials / NEED_INPUT / auto-allows per grip** as a local dashboard | No peer productizes control-plane metrics |
| **Wire-compatible mock agents for multiple CLIs** (codex ASP + grok ACP + kimi) in one offline suite | Unique trust story if expanded carefully |

---

## Step 4 — Incremental roadmap (YAGNI-first)

Ranked roughly by **value / effort**. Each item: what · why · where in *our* tree · cheap verify.

### Tier 1 — Quick wins (< 1 day)

| # | What | Why (gap) | Shape in our files | Verify |
|---|------|-----------|--------------------|--------|
| 1.1 | **`/grok:setup`** — check `grok` binary, login health, print grip defaults, offer `broker start` | codex/agy win onboarding; we only document install | New `commands/setup.md` + `grokctl setup` reading `GROK_BIN` / `managedGrokHome` / `config` | Run setup with/without `grok` on PATH; exit codes |
| 1.2 | **Status table polish** — human table for `list` (id, grip, model, status, age, last inbox type) | codex status UX | `commands/status.md` presentation rules; optional `grokctl list --table` | Manual: two workers, compare to JSON |
| 1.3 | **Document / command-hint for `approve-stage`** | Unique feature is under-discovered | Mention in `commands/advise.md` when grip=gate + staged writes | proof gate path already; doc-only check |
| 1.4 | **Export `fs-audit` summary on `/grok:result`** | Nobody else ships per-file audit; make it visible | `lib/worker.mjs` `result()` include last N audit ops or path | Unit test on mock writes |
| 1.5 | **Link proof in marketplace README badge / one-liner** | Trust differentiator vs 27k★ codex | `README.md` already strong; ensure marketplace blurb cites `npm run proof` | Clone fresh + run proof |

**Do not build (YAGNI):** multi-engine switcher, Slack connectors, cron — that is jinn’s product; dilutes “Claude captains, Grok implements, you veto.”

### Tier 2 — Medium (days)

| # | What | Why | Shape | Verify |
|---|------|-----|-------|--------|
| 2.1 | **`/grok:review` (read-only)** — spawn worker with grip+prompt template, no writes | codex’s highest-traffic command class | `commands/review.md` + brief template in `lib/worker.mjs` or prompts/; force leash deny-list + policy allow only read tools or use `gate` with no stage apply | Offline mock: no write audit entries; live optional |
| 2.2 | **Wire fork or delete the command** | Dead command hurts trust | Either map `_x.ai/session/fork` in `bin/grokd.mjs` + tests, or mark `disable-model-invocation` and remove from README table | `test/` + clear error path already exists |
| 2.3 | **Optional Stop-hook review gate (off by default)** | codex feature; their README warns of usage burn | `hooks/hooks.json` + script calling spawn review; **default disabled** via config flag | Unit: hook no-ops when disabled |
| 2.4 | **Worktree isolation option** `--worktree` | Multi-agent fleets & zenith-style isolation; we only probe list | spawn creates git worktree, sets cwd, cleans on prune | Integration test with temp repo |
| 2.5 | **Session transfer Grok←Claude (optional)** | codex transfer is unique value | Export brief+paths from Claude transcript path env if present; `spawn` with packed context — **not** full history replay unless grok supports import | Manual one-shot; no silent huge prompts |
| 2.6 | **Control-plane metrics file** | Whitespace telemetry | Append deny/allow/NEED_INPUT counts to `~/.grok-cc/metrics.jsonl` | proof + unit |

**Do not build:** full adversarial-review steerable mini-product until basic review earns usage; avoid stop-gate on-by-default (codex documents token drain).

### Tier 3 — Large (weeks+)

| # | What | Why | Shape | Verify |
|---|------|-----|-------|--------|
| 3.1 | **Cross-CLI offline harness** (optional mock codex ASP) | Close BENCHMARK honesty hole | Separate `scripts/proof-cross.mjs` only if we can run headless; else document blocked | Exit non-zero if unavailable — never fake |
| 3.2 | **Mid-task grip change** | Whitespace interactive policy | `grokctl grip <id> <mode>`; rebind `meta.grip` + pending policy | Tests for pending permission under new grip |
| 3.3 | **Worker DAG / fan-out** | Fleet without becoming jinn | `spawn --after <id>`; wait multi-id already exists | e2e two-worker chain |
| 3.4 | **Shell mediation / real sandbox** | leash honesty problem | Only if grok exposes enough; else integrate OS sandbox — **high risk/cost** | Security review required; prefer documenting gate for untrusted |

**Do not build:** jinn-style org chart, WhatsApp connectors, “company of AI employees,” or zenith-style multi-day mission harness inside this plugin. Those are adjacent products; our wedge is **interactive, audited, veto-gated ACP workers**.

### Ranking summary (value / effort)

1. Setup command + status polish + surface audit in result (**1.1–1.4**)  
2. Read-only review command (**2.1**)  
3. Fork honesty (wire or remove) (**2.2**)  
4. Worktree option (**2.4**)  
5. Optional transfer / metrics (**2.5–2.6**)  
6. Interactive grip + DAG (**3.2–3.3**)  
7. True shell sandbox only with external demand (**3.4**)  

---

## Appendix — Source index

### Our tree (primary inventory)

- `README.md`, `BENCHMARK.md`, `package.json`
- `commands/*.md`, `skills/*/SKILL.md`, `agents/grok-worker.md`
- `bin/grokctl.mjs`, `bin/grokd.mjs`
- `lib/{acp-client,config,contract,fs-mediator,grok-home,policy,store,worker}.mjs`
- `scripts/proof.mjs`, `scripts/proof-live.mjs`
- `hooks/hooks.json`, `.claude-plugin/plugin.json`

### External URLs fetched this session (non-exhaustive list of primary evidence)

- https://github.com/openai/codex-plugin-cc  
- https://raw.githubusercontent.com/openai/codex-plugin-cc/main/README.md  
- Local mirror: `~/.claude/plugins/marketplaces/openai-codex/plugins/codex/`  
- https://github.com/sakibsadmanshajib/gemini-plugin-cc  
- https://github.com/sakibsadmanshajib/antigravity-plugin  
- https://github.com/simplybychris/antigravity-plugin-cc  
- https://github.com/7D-codes/kimi-for-claude  
- https://github.com/sshahzaiib/agy-bridge  
- https://github.com/hristo2612/jinn  
- https://github.com/agentclientprotocol/agent-client-protocol  
- https://github.com/cola-io/codex-acp  
- https://github.com/Xuanwo/acp-claude-code  
- https://github.com/Intelligent-Internet/zenith  
- https://github.com/aaddrick/claude-pipeline  
- https://github.com/tuxclaw/grok-acp-openclaw  
- https://github.com/superagent-ai/grok-cli  
- https://github.com/ivrylobs/grok-cc-plugin  

---

*End of competitive analysis. Read-only on product code; this file is the sole intentional write.*
