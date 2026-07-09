# grok-cc-plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Build the "Advisor & Fleet" plugin from `docs/superpowers/specs/2026-07-09-grok-cc-plugin-design.md`: a broker (`grokd`) + CLI (`grokctl`) that let Claude Code drive veto-gated, resumable Grok workers over ACP, plus the Claude-side commands/skills/hooks.

**Architecture:** One Node daemon (`grokd`) speaks ACP to `grok agent stdio` children and exposes a unix-socket control plane; a thin CLI (`grokctl`) is the only thing Claude runs; declarative `.md` files form the Claude Code surface. See spec §4.

**Tech Stack:** Node ≥ 20 ESM (`.mjs`), stdlib only (`node:net`, `node:child_process`, `node:readline`, `node:test`), grok CLI 0.2.91+.

**Build model (dogfood):** Each task is tagged **[CAPTAIN]** (Claude implements) or **[SAILOR]** (Grok implements against pre-written tests). For SAILOR tasks the flow is: Captain writes+commits failing tests → Captain runs the exact `grok -p` delegation command given in the task → Captain reviews the diff with the task's checklist → tests green → commit. Sailor never edits tests. Record every sailor outcome (good/bad) — Task 9's skills feed on these observations.

## Global Constraints

- Node ≥ 20, ESM `.mjs`, **zero runtime dependencies** (stdlib only).
- grok binary: `~/.grok/bin/grok` (override `GROK_CC_GROK_BIN`); floor version 0.2.91.
- State root `~/.grok-cc/` — **always overridable via `GROK_CC_HOME`**; every test sets it to a temp dir.
- Socket: `<GROK_CC_HOME>/broker.sock`. Max 4 concurrent workers (`GROK_CC_MAX_WORKERS`).
- Live tests (spawn real grok) run only when `GROK_CC_LIVE=1`; otherwise they self-skip. `npm test` must pass offline.
- Permission answer timeout: 30 min → deny + `blocked`. Workers spawn with `mcpServers: []`.
- Grip levels exactly: `gate` | `advise` (default) | `leash` (spec §5.1).
- Worker statuses exactly: `starting|running|paused|advising|need_input|done|blocked|dead|killed`.
- Commit after every task minimum; prefer after every green step.

## File Structure

```
package.json                 # type:module, test scripts
.claude-plugin/plugin.json   # name "grok" → /grok:* commands
bin/grokd.mjs                # broker daemon entry (socket server, ops, reaper)
bin/grokctl.mjs              # CLI socket client (only thing Claude invokes)
lib/store.mjs                # GROK_CC_HOME paths, JSONL, meta, ids
lib/contract.mjs             # STATUS/QUESTION/RESULT parsing
lib/policy.mjs               # grip → allow/ask decision (data-driven lists)
lib/fs-mediator.mjs          # client-fs handlers, containment, audit, staging
lib/acp-client.mjs           # JSON-RPC/JSONL over child stdio, handshake, probes
lib/worker.mjs               # worker lifecycle, permission hold, contract wiring
commands/{work,status,advise,result,fork,resume,kill}.md
skills/delegation-contract/SKILL.md
skills/advisory-loop/SKILL.md
agents/grok-worker.md
hooks/hooks.json
test/{store,contract,policy,fs-mediator}.test.mjs        # offline unit
test/{handshake,roundtrip,veto,resume,wait}.test.mjs     # live (GROK_CC_LIVE=1)
test/helpers.mjs
```

---

### Task 1: Scaffold + store.mjs — [SAILOR]

**Files:**
- Create: `package.json`, `.gitignore`, `.claude-plugin/plugin.json`, `test/store.test.mjs` (Captain)
- Create: `lib/store.mjs` (Sailor)

**Interfaces:**
- Produces (all later tasks import these exact names from `lib/store.mjs`):
  - `ROOT: string` — resolved from `GROK_CC_HOME` at import time
  - `sockPath(): string` — `path.join(ROOT, 'broker.sock')`
  - `newId(): string` — `'w' + Date.now().toString(36) + '-' + 4 random base36 chars`
  - `workerDir(id): string` — `<ROOT>/workers/<id>`, mkdir -p, returns path
  - `appendJsonl(file, obj): void` — mkdir -p parent, append `JSON.stringify(obj) + '\n'`
  - `readJsonl(file): object[]` — `[]` if file missing; skip unparsable lines
  - `writeMeta(id, patch): object` — shallow-merge patch into existing meta (or `{}`), set `updatedAt` ISO string, write `<workerDir>/meta.json`, return merged meta
  - `readMeta(id): object|null` — null if absent
  - `listMetas(): object[]` — every `workers/*/meta.json`, unparsable/missing skipped

- [x] **Step 1 (Captain): scaffold repo files**

`package.json`:
```json
{
  "name": "grok-cc-plugin",
  "version": "0.1.0",
  "type": "module",
  "private": true,
  "scripts": {
    "test": "node --test test/",
    "test:live": "GROK_CC_LIVE=1 node --test test/"
  }
}
```

`.claude-plugin/plugin.json`:
```json
{
  "name": "grok",
  "description": "Claude advises, Grok works: veto-gated resumable Grok worker fleet over ACP",
  "version": "0.1.0"
}
```

`.gitignore`:
```
node_modules/
*.log
```

- [x] **Step 2 (Captain): write failing tests**

`test/store.test.mjs`:
```js
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

process.env.GROK_CC_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'gcc-store-'))
const store = await import('../lib/store.mjs')

test('ROOT honors GROK_CC_HOME and sockPath is under it', () => {
  assert.equal(store.ROOT, process.env.GROK_CC_HOME)
  assert.equal(store.sockPath(), path.join(store.ROOT, 'broker.sock'))
})

test('newId returns unique w-prefixed ids', () => {
  const a = store.newId(), b = store.newId()
  assert.match(a, /^w[a-z0-9]+-[a-z0-9]{4}$/)
  assert.notEqual(a, b)
})

test('workerDir creates directory', () => {
  const d = store.workerDir('w1')
  assert.equal(d, path.join(store.ROOT, 'workers', 'w1'))
  assert.ok(fs.existsSync(d))
})

test('appendJsonl/readJsonl roundtrip, missing file -> [], bad lines skipped', () => {
  const f = path.join(store.ROOT, 'x', 'log.jsonl')
  assert.deepEqual(store.readJsonl(f), [])
  store.appendJsonl(f, { a: 1 })
  store.appendJsonl(f, { b: 2 })
  fs.appendFileSync(f, 'not-json\n')
  assert.deepEqual(store.readJsonl(f), [{ a: 1 }, { b: 2 }])
})

test('writeMeta merges patches and stamps updatedAt; readMeta null when absent', () => {
  assert.equal(store.readMeta('nope'), null)
  const m1 = store.writeMeta('w2', { id: 'w2', status: 'starting' })
  assert.equal(m1.status, 'starting')
  const m2 = store.writeMeta('w2', { status: 'running' })
  assert.equal(m2.id, 'w2')
  assert.equal(m2.status, 'running')
  assert.ok(m2.updatedAt >= m1.updatedAt)
  assert.equal(store.readMeta('w2').status, 'running')
})

test('listMetas returns all metas', () => {
  store.writeMeta('w3', { id: 'w3' })
  const ids = store.listMetas().map(m => m.id).sort()
  assert.ok(ids.includes('w2') && ids.includes('w3'))
})
```

- [x] **Step 3: run tests, verify FAIL**

Run: `node --test test/store.test.mjs` — Expected: FAIL, `Cannot find module '../lib/store.mjs'`.

- [x] **Step 4 (Captain→Sailor): delegate implementation**

```bash
grok -p "You are implementing one module of grok-cc-plugin (repo = current dir).
Read test/store.test.mjs — it is the complete contract. Implement lib/store.mjs
(ESM, Node stdlib only, no dependencies) so that \`node --test test/store.test.mjs\`
passes. ROOT must be resolved from process.env.GROK_CC_HOME at import time,
falling back to ~/.grok-cc. Do NOT modify any test file. Keep it minimal — no
classes, no extra exports. When done, run the test yourself and report PASS or
FAIL with output." \
  --cwd "$(pwd)" --always-approve --check
```

- [x] **Step 5 (Captain): review + verify**

Review `git diff -- lib/store.mjs` against: stdlib only; no test edits (`git diff --stat test/` empty); no extra exports. Run: `npm test` — Expected: store tests PASS.

- [x] **Step 6: commit**

```bash
git add -A && git commit -m "feat: scaffold plugin + store module (sailor: grok)"
```

---

### Task 2: contract.mjs — [SAILOR]

**Files:**
- Create: `test/contract.test.mjs` (Captain), `lib/contract.mjs` (Sailor)

**Interfaces:**
- Produces: `parseStatus(text: string) -> {status, question, result, raw}` where `status ∈ 'WORKING'|'NEED_INPUT'|'DONE'|'BLOCKED'`, `question: string|null`, `result: object|null`, `raw = text`.
- Rules (spec §5.2 + §6 drift): status = **last** `STATUS: X` line; `QUESTION:` captures text after marker up to the STATUS line; `RESULT:` = last ```` ```json ```` fenced block, parsed; missing STATUS **or** malformed result JSON on DONE → `{status:'DONE', result:{summary: text}}`.

- [x] **Step 1 (Captain): failing tests**

`test/contract.test.mjs`:
```js
import test from 'node:test'
import assert from 'node:assert/strict'
const { parseStatus } = await import('../lib/contract.mjs')

test('DONE with fenced RESULT json', () => {
  const t = 'work done\nRESULT:\n```json\n{"summary":"fixed","files_changed":["a.js"],"verification":"tests pass"}\n```\nSTATUS: DONE'
  const p = parseStatus(t)
  assert.equal(p.status, 'DONE')
  assert.equal(p.result.summary, 'fixed')
  assert.deepEqual(p.result.files_changed, ['a.js'])
})

test('NEED_INPUT captures question', () => {
  const p = parseStatus('I checked both.\nQUESTION: which auth provider should I target?\nSTATUS: NEED_INPUT')
  assert.equal(p.status, 'NEED_INPUT')
  assert.match(p.question, /auth provider/)
})

test('WORKING and BLOCKED pass through', () => {
  assert.equal(parseStatus('plan: do X then Y\nSTATUS: WORKING').status, 'WORKING')
  assert.equal(parseStatus('cannot proceed\nSTATUS: BLOCKED').status, 'BLOCKED')
})

test('last STATUS line wins', () => {
  const p = parseStatus('STATUS: WORKING\nmore text\nSTATUS: DONE')
  assert.equal(p.status, 'DONE')
})

test('missing STATUS degrades to DONE with raw summary', () => {
  const p = parseStatus('just some prose with no protocol')
  assert.equal(p.status, 'DONE')
  assert.equal(p.result.summary, 'just some prose with no protocol')
})

test('malformed RESULT json on DONE degrades to raw summary', () => {
  const t = 'RESULT:\n```json\n{broken\n```\nSTATUS: DONE'
  const p = parseStatus(t)
  assert.equal(p.status, 'DONE')
  assert.equal(p.result.summary, t)
})
```

- [x] **Step 2: verify FAIL** — `node --test test/contract.test.mjs` → `Cannot find module`.

- [x] **Step 3 (Sailor): delegate**

```bash
grok -p "Implement lib/contract.mjs in this repo (ESM, stdlib only): export
function parseStatus(text) satisfying test/contract.test.mjs exactly. Read the
test first; it is the contract. Do not modify tests. Single exported function,
regex-based, no dependencies. Run \`node --test test/contract.test.mjs\` and
report PASS/FAIL with output." \
  --cwd "$(pwd)" --always-approve --check
```

- [x] **Step 4 (Captain): review** — diff review (no test edits, one export); `npm test` PASS.
- [x] **Step 5: commit** — `git add -A && git commit -m "feat: worker contract parser (sailor: grok)"`

---

### Task 3: policy.mjs — [SAILOR]

**Files:**
- Create: `test/policy.test.mjs` (Captain), `lib/policy.mjs` (Sailor)

**Interfaces:**
- Produces: `decideToolCall(grip, toolCall) -> 'allow'|'ask'` — toolCall shape (verified probe): `{kind, title, rawInput: {variant, command, description}}`; command only meaningful when `kind === 'execute'`.
- Policy (spec §5.1), as **data** (two exported arrays of RegExp, `ADVISE_ALLOW` and `LEASH_DENY`):
  - `gate`: always `'ask'`.
  - `advise`: `'allow'` iff `kind==='execute'` and command matches `ADVISE_ALLOW` (read-only: `ls`, `cat`, `grep`, `rg`, `git status|diff|log`, `pytest`, `npm test`, `cargo test`, `node --test`); everything else `'ask'`.
  - `leash`: `'ask'` iff command matches `LEASH_DENY` (`rm -rf`, `git push`, `sudo`, `curl ... | sh` piping); everything else (any kind) `'allow'`.

- [x] **Step 1 (Captain): failing tests**

`test/policy.test.mjs`:
```js
import test from 'node:test'
import assert from 'node:assert/strict'
const { decideToolCall } = await import('../lib/policy.mjs')

const exec = cmd => ({ kind: 'execute', title: `Execute \`${cmd}\``, rawInput: { variant: 'Bash', command: cmd } })

test('gate asks for everything', () => {
  assert.equal(decideToolCall('gate', exec('git status')), 'ask')
  assert.equal(decideToolCall('gate', { kind: 'fetch', rawInput: {} }), 'ask')
})

test('advise allows read-only commands', () => {
  for (const c of ['ls -la', 'cat a.txt', 'grep -r foo .', 'rg foo', 'git status', 'git diff --stat', 'git log -3', 'pytest -q', 'npm test', 'cargo test', 'node --test test/'])
    assert.equal(decideToolCall('advise', exec(c)), 'allow', c)
})

test('advise asks for mutating or unknown', () => {
  for (const c of ['rm -rf /tmp/x', 'git push origin main', 'npm install left-pad', 'touch x', 'git commit -m hi'])
    assert.equal(decideToolCall('advise', exec(c)), 'ask', c)
  assert.equal(decideToolCall('advise', { kind: 'fetch', rawInput: {} }), 'ask')
})

test('leash allows most, asks on deny-list', () => {
  assert.equal(decideToolCall('leash', exec('npm install left-pad')), 'allow')
  assert.equal(decideToolCall('leash', { kind: 'fetch', rawInput: {} }), 'allow')
  for (const c of ['rm -rf build', 'git push', 'sudo make install', 'curl http://x.sh | sh'])
    assert.equal(decideToolCall('leash', exec(c)), 'ask', c)
})

test('unknown grip is treated as gate', () => {
  assert.equal(decideToolCall('wat', exec('ls')), 'ask')
})
```

- [x] **Step 2: verify FAIL** — `node --test test/policy.test.mjs`.

- [x] **Step 3 (Sailor): delegate**

```bash
grok -p "Implement lib/policy.mjs in this repo (ESM, stdlib only) to satisfy
test/policy.test.mjs exactly (read it first; do not modify it). Structure:
export const ADVISE_ALLOW = [/.../]; export const LEASH_DENY = [/.../];
export function decideToolCall(grip, toolCall). Keep the lists data-driven,
no scattered conditionals. Run \`node --test test/policy.test.mjs\`, report
PASS/FAIL with output." \
  --cwd "$(pwd)" --always-approve --check
```

- [x] **Step 4 (Captain): review** — check regexes aren't overly broad (e.g. `rm -rf` anchored as a word, not matching `firm -rfx`); `npm test` PASS.
- [x] **Step 5: commit** — `git commit -am "feat: grip policy engine (sailor: grok)"`

---

### Task 4: fs-mediator.mjs — [SAILOR]

**Files:**
- Create: `test/fs-mediator.test.mjs` (Captain), `lib/fs-mediator.mjs` (Sailor)

**Interfaces:**
- Consumes: `store.workerDir`, `store.appendJsonl` (Task 1).
- Produces:
  - `containedPath(rootDir, p): string` — resolves `p` (absolute or relative to rootDir); throws `Error` with `code='PATH_ESCAPE'` unless the resolved path, after `fs.realpathSync` of its nearest **existing** ancestor, is inside `fs.realpathSync(rootDir)`.
  - `makeFsHandlers(meta): {readTextFile({path}) -> {content}, writeTextFile({path, content}) -> {}}` — meta `{id, cwd, grip}`. Every call appends to `<workerDir>/fs-audit.jsonl`: `{ts, op:'read'|'write'|'denied', path, bytes, sha256}` (sha256 of content via `node:crypto`, write/read only). Denied ops log `op:'denied'` then rethrow. Under `grip==='gate'`, writes divert to `<workerDir>/staged/<relative-path>`.
  - `applyStage(id, paths=null): string[]` — copy staged files to their real locations (all, or the given relative paths); returns applied relative paths.

- [x] **Step 1 (Captain): failing tests**

`test/fs-mediator.test.mjs`:
```js
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

process.env.GROK_CC_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'gcc-fsm-'))
const store = await import('../lib/store.mjs')
const { containedPath, makeFsHandlers, applyStage } = await import('../lib/fs-mediator.mjs')

const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'gcc-ws-'))

test('containedPath accepts inside, rejects escape and symlink escape', () => {
  assert.equal(containedPath(ws, 'a/b.txt'), path.join(fs.realpathSync(ws), 'a/b.txt'))
  assert.throws(() => containedPath(ws, '../outside.txt'), e => e.code === 'PATH_ESCAPE')
  assert.throws(() => containedPath(ws, '/etc/passwd'), e => e.code === 'PATH_ESCAPE')
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'gcc-out-'))
  fs.symlinkSync(outside, path.join(ws, 'sneaky'))
  assert.throws(() => containedPath(ws, 'sneaky/x.txt'), e => e.code === 'PATH_ESCAPE')
})

test('advise grip: write lands in workspace and audits', async () => {
  const meta = { id: 'wfs1', cwd: ws, grip: 'advise' }
  const h = makeFsHandlers(meta)
  await h.writeTextFile({ path: path.join(ws, 'out.txt'), content: 'hi' })
  assert.equal(fs.readFileSync(path.join(ws, 'out.txt'), 'utf8'), 'hi')
  const { content } = await h.readTextFile({ path: path.join(ws, 'out.txt') })
  assert.equal(content, 'hi')
  const audit = store.readJsonl(path.join(store.workerDir('wfs1'), 'fs-audit.jsonl'))
  assert.deepEqual(audit.map(a => a.op), ['write', 'read'])
  assert.equal(audit[0].bytes, 2)
  assert.match(audit[0].sha256, /^[a-f0-9]{64}$/)
})

test('escape attempt is audited as denied and throws', async () => {
  const h = makeFsHandlers({ id: 'wfs2', cwd: ws, grip: 'advise' })
  await assert.rejects(h.writeTextFile({ path: '/tmp/evil.txt', content: 'x' }), e => e.code === 'PATH_ESCAPE')
  const audit = store.readJsonl(path.join(store.workerDir('wfs2'), 'fs-audit.jsonl'))
  assert.equal(audit[0].op, 'denied')
})

test('gate grip: writes stage, applyStage applies', async () => {
  const meta = { id: 'wfs3', cwd: ws, grip: 'gate' }
  const h = makeFsHandlers(meta)
  await h.writeTextFile({ path: path.join(ws, 'sub/gated.txt'), content: 'staged!' })
  assert.ok(!fs.existsSync(path.join(ws, 'sub/gated.txt')))
  assert.equal(fs.readFileSync(path.join(store.workerDir('wfs3'), 'staged/sub/gated.txt'), 'utf8'), 'staged!')
  const applied = applyStage('wfs3')
  assert.deepEqual(applied, ['sub/gated.txt'])
  assert.equal(fs.readFileSync(path.join(ws, 'sub/gated.txt'), 'utf8'), 'staged!')
})
```

- [x] **Step 2: verify FAIL** — `node --test test/fs-mediator.test.mjs`.

- [x] **Step 3 (Sailor): delegate**

```bash
grok -p "Implement lib/fs-mediator.mjs in this repo (ESM, stdlib only:
node:fs, node:path, node:crypto). Contract = test/fs-mediator.test.mjs — read
it first, do not modify it. Import workerDir/appendJsonl from ./store.mjs.
applyStage needs meta cwd: read it via readMeta(id) from ./store.mjs — tests
that call applyStage created handlers whose meta you should persist with
writeMeta(id, {cwd, grip}) inside makeFsHandlers. Security matters: the
symlink-escape test must pass by realpath-ing the nearest existing ancestor.
Run \`node --test test/fs-mediator.test.mjs\`, report PASS/FAIL with output." \
  --cwd "$(pwd)" --always-approve --check
```

- [x] **Step 4 (Captain): review hard** — this is a security module. Checklist: realpath on nearest existing ancestor (walk up until `existsSync`); denial logged before throw; staged paths derived from the contained relative path (no re-derivation from raw input); `npm test` PASS.
- [x] **Step 5: commit** — `git commit -am "feat: fs mediation with containment, audit, staging (sailor: grok)"`

---

### Task 5: acp-client.mjs + live handshake test — [CAPTAIN]

**Files:**
- Create: `lib/acp-client.mjs`, `test/helpers.mjs`, `test/handshake.test.mjs`

**Interfaces:**
- Produces:
  - `GROK_BIN: string` (env `GROK_CC_GROK_BIN` fallback `~/.grok/bin/grok`)
  - `class AcpClient` — `constructor({cwd, onUpdate, onAgentRequest})`; `request(method, params, timeoutMs=15000)` (0 = no timeout); `handshake() -> initialize result`; `probeExtensions(sessionId) -> {method: bool}`; `kill()`; `closed: Promise<exitCode>`. `onAgentRequest(method, params)` may return a promise held open arbitrarily long (permission holds); throwing `{code, message}` sends a JSON-RPC error reply.

- [x] **Step 1: write helpers + failing live test**

`test/helpers.mjs`:
```js
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
export const LIVE = process.env.GROK_CC_LIVE === '1'
export function tmpHome() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'gcc-live-'))
  process.env.GROK_CC_HOME = d
  return d
}
export function tmpWorkspace() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'gcc-ws-'))
}
```

`test/handshake.test.mjs`:
```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { LIVE, tmpHome, tmpWorkspace } from './helpers.mjs'

test('handshake + capability probe classify extensions', { skip: !LIVE && 'set GROK_CC_LIVE=1' }, async () => {
  tmpHome()
  const { AcpClient } = await import('../lib/acp-client.mjs')
  const c = new AcpClient({ cwd: tmpWorkspace(), onUpdate: () => {} })
  const init = await c.handshake()
  assert.equal(init.protocolVersion, 1)
  assert.ok(init.agentCapabilities.loadSession)
  const { sessionId } = await c.request('session/new', { cwd: process.cwd(), mcpServers: [] })
  assert.ok(sessionId)
  const probes = await c.probeExtensions(sessionId)
  assert.equal(typeof probes['_x.ai/session/fork'], 'boolean')
  assert.equal(typeof probes['session/set_model'], 'boolean')
  c.kill()
})
```

- [x] **Step 2: verify FAIL** — `GROK_CC_LIVE=1 node --test test/handshake.test.mjs` → `Cannot find module '../lib/acp-client.mjs'`. Also `node --test test/handshake.test.mjs` → SKIP (offline gate works).

- [x] **Step 3: implement**

`lib/acp-client.mjs`:
```js
import { spawn } from 'node:child_process'
import readline from 'node:readline'
import os from 'node:os'
import path from 'node:path'

export const GROK_BIN = process.env.GROK_CC_GROK_BIN || path.join(os.homedir(), '.grok/bin/grok')

// verified 2026-07-09 (grok 0.2.91): -32601 = absent, -32602 = exists/bad params
const PROBES = ['_x.ai/session/fork', '_x.ai/git/worktree/list', '_x.ai/prompt_history', 'session/set_mode', 'session/set_model']

export class AcpClient {
  constructor({ cwd, onUpdate = () => {}, onAgentRequest = null }) {
    this.child = spawn(GROK_BIN, ['agent', 'stdio'], { cwd, stdio: ['pipe', 'pipe', 'ignore'] })
    this.nextId = 1
    this.pending = new Map()
    this.onUpdate = onUpdate
    this.onAgentRequest = onAgentRequest
    this.closed = new Promise(res => this.child.on('exit', code => { this._flush(code); res(code) }))
    readline.createInterface({ input: this.child.stdout }).on('line', l => this._onLine(l))
  }

  _flush(code) {
    for (const [, p] of this.pending) p.reject(new Error(`grok agent exited (${code})`))
    this.pending.clear()
  }

  _send(obj) {
    try { this.child.stdin.write(JSON.stringify(obj) + '\n') } catch { /* dying child; closed handles it */ }
  }

  async _onLine(line) {
    let msg
    try { msg = JSON.parse(line) } catch { return }
    if (msg.id !== undefined && msg.method === undefined) {              // reply to our request
      const p = this.pending.get(msg.id)
      if (!p) return
      this.pending.delete(msg.id)
      if (msg.error) p.reject(Object.assign(new Error(msg.error.message), { code: msg.error.code }))
      else p.resolve(msg.result)
    } else if (msg.method === 'session/update') {
      this.onUpdate(msg.params)
    } else if (msg.method !== undefined && msg.id !== undefined) {       // agent -> client request
      try {
        const result = this.onAgentRequest ? await this.onAgentRequest(msg.method, msg.params) : {}
        this._send({ jsonrpc: '2.0', id: msg.id, result: result ?? {} })
      } catch (e) {
        this._send({ jsonrpc: '2.0', id: msg.id, error: { code: e.code ?? -32603, message: e.message } })
      }
    }
    // bare notifications (_x.ai/*) are informational; onUpdate covers what we consume
  }

  request(method, params, timeoutMs = 15000) {
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this._send({ jsonrpc: '2.0', id, method, params })
      if (timeoutMs > 0) {
        setTimeout(() => {
          if (this.pending.delete(id)) reject(new Error(`${method} timed out after ${timeoutMs}ms`))
        }, timeoutMs).unref()
      }
    })
  }

  async handshake() {
    this.init = await this.request('initialize', {
      protocolVersion: 1,
      clientCapabilities: { fs: { readTextFile: true, writeTextFile: true } },
    })
    return this.init
  }

  async probeExtensions(sessionId) {
    const supported = {}
    for (const m of PROBES) {
      try { await this.request(m, { sessionId }, 8000); supported[m] = true }
      catch (e) { supported[m] = e.code !== undefined && e.code !== -32601 }
    }
    return supported
  }

  kill() { this.child.kill('SIGTERM') }
}
```

- [x] **Step 4: verify PASS** — `GROK_CC_LIVE=1 node --test test/handshake.test.mjs` PASS; `npm test` all green (live skipped offline).
- [x] **Step 5: commit** — `git commit -am "feat: ACP client with handshake and capability probe"`

---

### Task 6: worker.mjs + live roundtrip & veto tests — [CAPTAIN]

**Files:**
- Create: `lib/worker.mjs`, `test/roundtrip.test.mjs`, `test/veto.test.mjs`

**Interfaces:**
- Consumes: everything from Tasks 1–5 (exact names in their Interfaces blocks).
- Produces (imported by grokd in Task 7):
  - `events: EventEmitter` — emits `'wake'` with workerId on every inbox append
  - `spawnWorker({task, cwd, model?, effort?, grip?, sessionId?}) -> Promise<meta>` — resolves once the session exists and the brief prompt is dispatched (not when the task completes)
  - `list() -> meta[]`, `status(id) -> meta|null`, `result(id) -> object|null` (last `done` inbox item's result)
  - `inbox(id) -> object[]`
  - `answer(id, {allow: boolean, why?: string}) -> meta` — resolves the oldest pending permission
  - `say(id, text) -> Promise<meta>` — new prompt on the same session (auto-resume if dead)
  - `resume(id) -> Promise<meta>` — re-attach via `session/load`
  - `kill(id) -> meta`
  - Inbox item shapes: `{ts, type:'permission', key, toolCall, options}` | `{ts, type:'need_input', question}` | `{ts, type:'checkpoint', summary}` | `{ts, type:'done', result}` | `{ts, type:'blocked', reason}` | `{ts, type:'error', error}`

- [x] **Step 1: failing live tests**

`test/roundtrip.test.mjs`:
```js
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { LIVE, tmpHome, tmpWorkspace } from './helpers.mjs'

test('spawn -> mediated write -> DONE result -> audit trail', { skip: !LIVE && 'set GROK_CC_LIVE=1' }, async () => {
  tmpHome()
  const ws = tmpWorkspace()
  const store = await import('../lib/store.mjs')
  const worker = await import('../lib/worker.mjs')
  const meta = await worker.spawnWorker({
    task: "Create a file named hello.txt containing exactly 'hello fleet' in the current directory. Nothing else.",
    cwd: ws,
  })
  const done = await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout waiting for done')), 180000)
    worker.events.on('wake', id => {
      if (id !== meta.id) return
      const m = worker.status(id)
      if (m.status === 'done') { clearTimeout(t); resolve(m) }
      if (['blocked', 'dead'].includes(m.status)) { clearTimeout(t); reject(new Error(m.status)) }
    })
  })
  assert.equal(done.status, 'done')
  assert.equal(fs.readFileSync(path.join(ws, 'hello.txt'), 'utf8').trim(), 'hello fleet')
  assert.ok(worker.result(meta.id).summary)
  const audit = store.readJsonl(path.join(store.workerDir(meta.id), 'fs-audit.jsonl'))
  assert.ok(audit.some(a => a.op === 'write' && a.path.endsWith('hello.txt')))
  worker.kill(meta.id)
})
```

`test/veto.test.mjs`:
```js
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { LIVE, tmpHome, tmpWorkspace } from './helpers.mjs'

test('shell -> inbox -> deny -> not executed -> corrective say -> done', { skip: !LIVE && 'set GROK_CC_LIVE=1' }, async () => {
  tmpHome()
  const ws = tmpWorkspace()
  const worker = await import('../lib/worker.mjs')
  const meta = await worker.spawnWorker({
    task: 'Run the shell command `touch forbidden.txt` in the current directory. If denied, do not retry it.',
    cwd: ws,
    grip: 'advise',
  })
  const waitFor = pred => new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), 180000)
    const h = id => { if (id === meta.id && pred(worker.status(id))) { clearTimeout(t); worker.events.off('wake', h); resolve() } }
    worker.events.on('wake', h)
  })
  await waitFor(m => m.status === 'advising')
  const perm = worker.inbox(meta.id).find(i => i.type === 'permission')
  assert.match(perm.toolCall.title, /touch forbidden/)
  worker.answer(meta.id, { allow: false, why: 'not allowed to touch that file' })
  await worker.say(meta.id, "Do NOT run that command. Instead just reply DENIED-OK and finish with STATUS: DONE and a RESULT block.")
  await waitFor(m => m.status === 'done')
  assert.ok(!fs.existsSync(path.join(ws, 'forbidden.txt')))   // the veto held
  worker.kill(meta.id)
})
```

- [x] **Step 2: verify FAIL** — `GROK_CC_LIVE=1 node --test test/roundtrip.test.mjs` → `Cannot find module '../lib/worker.mjs'`.

- [x] **Step 3: implement**

`lib/worker.mjs`:
```js
import { EventEmitter } from 'node:events'
import path from 'node:path'
import { AcpClient } from './acp-client.mjs'
import { decideToolCall } from './policy.mjs'
import { makeFsHandlers } from './fs-mediator.mjs'
import { parseStatus } from './contract.mjs'
import * as store from './store.mjs'

export const events = new EventEmitter()
const live = new Map()   // id -> {client, state:{msgBuf, pendingPerm: Map}}
const PERM_TIMEOUT_MS = 30 * 60 * 1000

const BRIEF = task => `You are a delegated worker driven by a Claude Code orchestrator (your advisor).

TASK:
${task}

PROTOCOL (mandatory):
- End EVERY turn with exactly one line: "STATUS: WORKING|NEED_INPUT|DONE|BLOCKED".
- If you need anything (context, a decision, credentials), write "QUESTION: <what you need>" then "STATUS: NEED_INPUT". Never guess.
- After investigating and before large edits, end a turn with a one-paragraph plan and "STATUS: WORKING".
- When finished:
RESULT:
\`\`\`json
{"summary": "<what you did>", "files_changed": ["<paths>"], "verification": "<how you verified>"}
\`\`\`
STATUS: DONE`

function pushInbox(id, item) {
  store.appendJsonl(path.join(store.workerDir(id), 'inbox.jsonl'), { ts: new Date().toISOString(), ...item })
  events.emit('wake', id)
}

function logEvent(id, params) {
  store.appendJsonl(path.join(store.workerDir(id), 'events.jsonl'), { ts: new Date().toISOString(), ...params })
}

export async function spawnWorker({ task, cwd, model = null, effort = null, grip = 'advise', sessionId = null }) {
  const id = store.newId()
  store.writeMeta(id, { id, task, cwd: path.resolve(cwd), grip, model, effort, sessionId, status: 'starting', createdAt: new Date().toISOString() })
  await attach(id, { fresh: !sessionId })
  void prompt(id, BRIEF(task))
  return store.readMeta(id)
}

async function attach(id, { fresh }) {
  const meta = store.readMeta(id)
  const fsH = makeFsHandlers(meta)
  const state = { msgBuf: '', pendingPerm: new Map() }
  const client = new AcpClient({
    cwd: meta.cwd,
    onUpdate: p => {
      logEvent(id, p)
      const u = p.update ?? {}
      if (u.sessionUpdate === 'agent_message_chunk' && u.content?.text) state.msgBuf += u.content.text
    },
    onAgentRequest: (method, params) => onAgentRequest(id, state, fsH, method, params),
  })
  live.set(id, { client, state })
  client.closed.then(code => {
    live.delete(id)
    const m = store.readMeta(id)
    if (m && !['done', 'killed'].includes(m.status)) {
      store.writeMeta(id, { status: 'dead' })
      pushInbox(id, { type: 'error', error: `agent process exited (${code})` })
    }
  })
  await client.handshake()
  if (fresh) {
    const r = await client.request('session/new', { cwd: meta.cwd, mcpServers: [] }, 60000)
    store.writeMeta(id, { sessionId: r.sessionId })
  } else {
    await client.request('session/load', { sessionId: meta.sessionId, cwd: meta.cwd, mcpServers: [] }, 120000)
  }
  const probes = await client.probeExtensions(store.readMeta(id).sessionId)
  store.writeMeta(id, { probes })
  // best-effort model/effort routing; -32602 shapes are logged, never fatal
  const sid = store.readMeta(id).sessionId
  if (meta.model) await trySet(client, 'session/set_model', [{ sessionId: sid, modelId: meta.model }, { sessionId: sid, model: meta.model }], id)
  if (meta.effort) await trySet(client, 'session/set_mode', [{ sessionId: sid, modeId: meta.effort }, { sessionId: sid, mode: meta.effort }], id)
}

async function trySet(client, method, shapes, id) {
  for (const params of shapes) {
    try { await client.request(method, params, 8000); return }
    catch (e) { logEvent(id, { note: `${method} rejected`, code: e.code, params }) }
  }
}

async function prompt(id, text) {
  const w = live.get(id)
  if (!w) throw new Error(`worker ${id} not live`)
  w.state.msgBuf = ''
  store.writeMeta(id, { status: 'running' })
  let stopReason
  try {
    const meta = store.readMeta(id)
    const r = await w.client.request('session/prompt', { sessionId: meta.sessionId, prompt: [{ type: 'text', text }] }, 0)
    stopReason = r?.stopReason
  } catch (e) {
    if (store.readMeta(id)?.status === 'running') {
      store.writeMeta(id, { status: 'dead' })
      pushInbox(id, { type: 'error', error: e.message })
    }
    return
  }
  const m = store.readMeta(id)
  if (stopReason === 'cancelled') {
    // our deny already moved status to 'advising'; anything else cancelled = blocked
    if (m.status === 'running') { store.writeMeta(id, { status: 'blocked' }); pushInbox(id, { type: 'blocked', reason: 'turn cancelled' }) }
    return
  }
  const parsed = parseStatus(w.state.msgBuf)
  if (parsed.status === 'DONE') { store.writeMeta(id, { status: 'done' }); pushInbox(id, { type: 'done', result: parsed.result }) }
  else if (parsed.status === 'NEED_INPUT') { store.writeMeta(id, { status: 'need_input' }); pushInbox(id, { type: 'need_input', question: parsed.question ?? w.state.msgBuf.slice(-500) }) }
  else if (parsed.status === 'BLOCKED') { store.writeMeta(id, { status: 'blocked' }); pushInbox(id, { type: 'blocked', reason: w.state.msgBuf.slice(-500) }) }
  else { store.writeMeta(id, { status: 'paused' }); pushInbox(id, { type: 'checkpoint', summary: w.state.msgBuf.slice(-500) }) }
}

async function onAgentRequest(id, state, fsH, method, params) {
  if (method === 'fs/read_text_file') return fsH.readTextFile(params)
  if (method === 'fs/write_text_file') return fsH.writeTextFile(params)
  if (method === 'session/request_permission') return holdPermission(id, state, params)
  return {}
}

function holdPermission(id, state, params) {
  const meta = store.readMeta(id)
  const options = params.options ?? []
  const pick = kind => (options.find(o => o.kind === kind) ?? options[0])?.optionId
  if (decideToolCall(meta.grip, params.toolCall ?? {}) === 'allow') {
    logEvent(id, { note: 'auto-allow', toolCall: params.toolCall?.title })
    return { outcome: { outcome: 'selected', optionId: pick('allow_once') } }
  }
  const key = store.newId()
  pushInbox(id, { type: 'permission', key, toolCall: params.toolCall, options: options.map(o => ({ optionId: o.optionId, kind: o.kind })) })
  store.writeMeta(id, { status: 'advising' })
  return new Promise(resolve => {
    const timer = setTimeout(() => {
      state.pendingPerm.delete(key)
      store.writeMeta(id, { status: 'blocked' })
      pushInbox(id, { type: 'blocked', reason: 'permission request timed out (30m)' })
      resolve({ outcome: { outcome: 'selected', optionId: pick('reject_once') } })
    }, PERM_TIMEOUT_MS)
    timer.unref()
    state.pendingPerm.set(key, allow => {
      clearTimeout(timer)
      resolve({ outcome: { outcome: 'selected', optionId: pick(allow ? 'allow_once' : 'reject_once') } })
    })
  })
}

export function answer(id, { allow, why = null }) {
  const w = live.get(id)
  if (!w) throw new Error(`worker ${id} not live`)
  const entry = w.state.pendingPerm.entries().next().value
  if (!entry) throw new Error(`worker ${id} has no pending permission`)
  const [key, resolveFn] = entry
  w.state.pendingPerm.delete(key)
  store.writeMeta(id, { status: allow ? 'running' : 'advising', lastAnswer: { allow, why } })
  resolveFn(allow)
  return store.readMeta(id)
}

export async function say(id, text) {
  if (!live.get(id)) await resume(id)
  void prompt(id, text)
  return store.readMeta(id)
}

export async function resume(id) {
  const meta = store.readMeta(id)
  if (!meta) throw new Error(`unknown worker ${id}`)
  if (live.get(id)) return meta
  if (!meta.sessionId) throw new Error(`worker ${id} has no session to resume`)
  await attach(id, { fresh: false })
  return store.writeMeta(id, { status: 'paused' })
}

export function kill(id) {
  live.get(id)?.client.kill()
  live.delete(id)
  return store.writeMeta(id, { status: 'killed' })
}

export function list() { return store.listMetas() }
export function status(id) { return store.readMeta(id) }
export function inbox(id) { return store.readJsonl(path.join(store.workerDir(id), 'inbox.jsonl')) }
export function result(id) {
  const done = inbox(id).filter(i => i.type === 'done').at(-1)
  return done?.result ?? null
}
```

- [x] **Step 4: verify PASS** — `GROK_CC_LIVE=1 node --test test/roundtrip.test.mjs test/veto.test.mjs` → both PASS (~2–4 min). `npm test` offline still green.
- [x] **Step 5: commit** — `git commit -am "feat: worker lifecycle with permission hold and contract wiring"`

---

### Task 7: grokd broker + live resume test — [CAPTAIN]

**Files:**
- Create: `bin/grokd.mjs`, `test/resume.test.mjs`

**Interfaces:**
- Produces: unix-socket JSONL protocol. Request `{id, op, args}` → reply `{id, ok: true, data}` or `{id, ok: false, error}`. Ops: `ping, spawn, list, status, result, inbox, say, answer, wait, kill, resume, fork, approve-stage, stop`.
  - `wait {ids?, timeoutSec=570}` → `{woke: [{id, status}]}` when any watched worker's status ∉ {starting, running}, else `{timeout: true}` after timeoutSec.
  - `fork {id}` → calls `_x.ai/session/fork` only if that worker's probes said supported, else error `fork not supported by this grok version`.
  - Single instance: if the socket is already live (ping succeeds) exit 0 with `already running`; stale socket file is unlinked.

- [x] **Step 1: failing live test**

`test/resume.test.mjs` (drives worker module directly for the kill/resume cycle — broker resume op reuses the same functions; socket round-trip is covered by Task 8's wait test):
```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { LIVE, tmpHome, tmpWorkspace } from './helpers.mjs'

test('kill child mid-session, resume restores memory', { skip: !LIVE && 'set GROK_CC_LIVE=1' }, async () => {
  tmpHome()
  const ws = tmpWorkspace()
  const worker = await import('../lib/worker.mjs')
  const meta = await worker.spawnWorker({
    task: "Create magic.txt containing exactly 'xyzzy-7421'. Then finish.",
    cwd: ws,
  })
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), 180000)
    worker.events.on('wake', id => { if (id === meta.id && worker.status(id).status === 'done') { clearTimeout(t); resolve() } })
  })
  worker.kill(meta.id)                       // simulate death
  await worker.say(meta.id, 'In one sentence: what exact string did you write into magic.txt earlier? Then STATUS: DONE with a RESULT block whose summary contains that string.')
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), 120000)
    worker.events.on('wake', id => { if (id === meta.id && worker.status(id).status === 'done') { clearTimeout(t); resolve() } })
  })
  assert.match(worker.result(meta.id).summary, /xyzzy-7421/)   // memory survived process death
  worker.kill(meta.id)
})
```

- [x] **Step 2: verify behavior gap** — `GROK_CC_LIVE=1 node --test test/resume.test.mjs`. Expected: PASS already if Task 6's `say`-auto-resume works; if it fails, fix `resume()` until green (this test pins the spec's §6 resume requirement).

- [x] **Step 3: implement broker**

`bin/grokd.mjs`:
```js
#!/usr/bin/env node
import net from 'node:net'
import fs from 'node:fs'
import * as store from '../lib/store.mjs'
import * as worker from '../lib/worker.mjs'
import { applyStage } from '../lib/fs-mediator.mjs'

const SOCK = store.sockPath()
const MAX_WORKERS = Number(process.env.GROK_CC_MAX_WORKERS || 4)
const IDLE_EXIT_MS = 2 * 60 * 60 * 1000
let lastActivity = Date.now()

const ACTIVE = () => worker.list().filter(m => ['starting', 'running', 'advising', 'paused', 'need_input'].includes(m.status))

const ops = {
  async ping() { return { pid: process.pid } },
  async spawn(args) {
    if (ACTIVE().filter(m => ['starting', 'running'].includes(m.status)).length >= MAX_WORKERS) {
      throw new Error(`worker limit ${MAX_WORKERS} reached; kill or wait first`)
    }
    return worker.spawnWorker(args)
  },
  async list() { return worker.list() },
  async status({ id }) { return worker.status(id) },
  async result({ id }) { return worker.result(id) },
  async inbox({ id }) { return worker.inbox(id) },
  async say({ id, text }) { return worker.say(id, text) },
  async answer({ id, allow, why }) { return worker.answer(id, { allow, why }) },
  async kill({ id }) { return worker.kill(id) },
  async resume({ id }) { return worker.resume(id) },
  async 'approve-stage'({ id, paths }) { return { applied: applyStage(id, paths ?? null) } },
  async fork({ id }) {
    const m = worker.status(id)
    if (!m?.probes?.['_x.ai/session/fork']) throw new Error('fork not supported by this grok version')
    throw new Error('fork params not yet mapped; run /grok:work with --session to branch manually')  // ponytail: v1 surfaces honesty, upgrade when params are probed
  },
  async wait({ ids = null, timeoutSec = 570 }) {
    const watched = () => ids ?? worker.list().map(m => m.id)
    const ready = () => worker.list()
      .filter(m => watched().includes(m.id) && !['starting', 'running'].includes(m.status))
      .map(m => ({ id: m.id, status: m.status }))
    const now = ready()
    if (now.length) return { woke: now }
    return new Promise(resolve => {
      const timer = setTimeout(() => { worker.events.off('wake', h); resolve({ timeout: true }) }, timeoutSec * 1000)
      const h = () => {
        const r = ready()
        if (r.length) { clearTimeout(timer); worker.events.off('wake', h); resolve({ woke: r }) }
      }
      worker.events.on('wake', h)
    })
  },
  async stop() { setTimeout(() => process.exit(0), 50); return { stopping: true } },
}

function serve() {
  const server = net.createServer(sock => {
    let buf = ''
    sock.on('data', async chunk => {
      buf += chunk
      let nl
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl); buf = buf.slice(nl + 1)
        if (!line.trim()) continue
        lastActivity = Date.now()
        let req
        try { req = JSON.parse(line) } catch { sock.write(JSON.stringify({ ok: false, error: 'bad json' }) + '\n'); continue }
        try {
          const op = ops[req.op]
          if (!op) throw new Error(`unknown op ${req.op}`)
          sock.write(JSON.stringify({ id: req.id, ok: true, data: await op(req.args ?? {}) }) + '\n')
        } catch (e) {
          sock.write(JSON.stringify({ id: req.id, ok: false, error: e.message }) + '\n')
        }
      }
    })
    sock.on('error', () => {})
  })
  server.listen(SOCK, () => {
    fs.writeFileSync(store.sockPath() + '.pid', String(process.pid))
    setInterval(() => {
      if (!ACTIVE().length && Date.now() - lastActivity > IDLE_EXIT_MS) process.exit(0)
    }, 10 * 60 * 1000).unref()
  })
}

// single-instance: probe existing socket before claiming it
const probe = net.connect(SOCK)
probe.on('connect', () => { console.log('already running'); process.exit(0) })
probe.on('error', () => { try { fs.unlinkSync(SOCK) } catch {} ; serve() })
```

- [x] **Step 4: smoke test by hand**

```bash
GROK_CC_HOME=$(mktemp -d) node bin/grokd.mjs &
sleep 1
printf '{"id":1,"op":"ping"}\n' | nc -U "$GROK_CC_HOME/broker.sock"
```
Expected: `{"id":1,"ok":true,"data":{"pid":<n>}}`. Second `node bin/grokd.mjs` prints `already running`, exits 0. Then `printf '{"id":2,"op":"stop"}\n' | nc -U ...` stops it.

- [x] **Step 5: commit** — `git commit -am "feat: grokd broker with socket ops, wait, idle reaper"`

---

### Task 8: grokctl + live wait test — [SAILOR impl, CAPTAIN tests]

**Files:**
- Create: `test/wait.test.mjs` (Captain), `bin/grokctl.mjs` (Sailor)

**Interfaces:**
- Produces CLI (each prints exactly one JSON line to stdout):
  - `grokctl spawn --task <t> --cwd <dir> [--model <m>] [--effort <e>] [--grip <g>] [--session <sid>]`
  - `grokctl list|status <id>|result <id>|inbox <id>|kill <id>|resume <id>|fork <id>`
  - `grokctl say <id> <text…>` / `grokctl answer <id> allow|deny [--why <text…>]`
  - `grokctl approve-stage <id> [paths…]`
  - `grokctl wait [ids…] [--timeout <sec>]` — exit 0 on `{woke}`, exit **2** on `{timeout:true}`
  - `grokctl broker start|stop|status`
  - Exit codes: 0 success, 1 error (JSON `{error}` on stdout), 2 wait-timeout.
  - Auto-start: any op (except `broker stop|status`) that finds no live socket spawns `bin/grokd.mjs` detached (`stdio:'ignore'`, `unref()`), polls the socket up to 3 s, then proceeds.

- [x] **Step 1 (Captain): failing live test**

`test/wait.test.mjs`:
```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, execFile } from 'node:child_process'
import path from 'node:path'
import { LIVE, tmpHome, tmpWorkspace } from './helpers.mjs'

const CTL = path.resolve('bin/grokctl.mjs')
const run = (args, env) => JSON.parse(execFileSync('node', [CTL, ...args], { env: { ...process.env, ...env }, encoding: 'utf8' }).trim())

test('ctl auto-starts broker; wait blocks then wakes on worker event', { skip: !LIVE && 'set GROK_CC_LIVE=1' }, async () => {
  const home = tmpHome()
  const env = { GROK_CC_HOME: home }
  const ws = tmpWorkspace()
  const spawned = run(['spawn', '--task', "Create done.txt containing 'ok'. Nothing else.", '--cwd', ws], env)
  assert.ok(spawned.id)
  const woke = await new Promise((resolve, reject) => {
    execFile('node', [CTL, 'wait', spawned.id, '--timeout', '240'], { env: { ...process.env, ...env }, encoding: 'utf8' },
      (err, stdout) => err && err.code !== 0 && err.code !== 2 ? reject(err) : resolve({ code: err?.code ?? 0, out: JSON.parse(stdout.trim()) }))
  })
  assert.equal(woke.code, 0)
  assert.ok(woke.out.woke.some(w => w.id === spawned.id))
  run(['kill', spawned.id], env)
  run(['broker', 'stop'], env)
})

test('wait exits 2 on timeout with no workers', { skip: !LIVE && 'set GROK_CC_LIVE=1' }, async () => {
  const home = tmpHome()
  const env = { GROK_CC_HOME: home }
  const r = await new Promise(resolve => {
    execFile('node', [CTL, 'wait', '--timeout', '3'], { env: { ...process.env, ...env }, encoding: 'utf8' },
      (err, stdout) => resolve({ code: err?.code ?? 0, out: stdout.trim() }))
  })
  assert.equal(r.code, 2)
  assert.match(r.out, /timeout/)
  run(['broker', 'stop'], env)
})
```

- [x] **Step 2: verify FAIL** — `GROK_CC_LIVE=1 node --test test/wait.test.mjs` → cannot find `bin/grokctl.mjs`.

- [x] **Step 3 (Sailor): delegate**

```bash
grok -p "Implement bin/grokctl.mjs in this repo: a unix-socket JSONL client CLI
for bin/grokd.mjs. Read bin/grokd.mjs (the ops and reply shapes), lib/store.mjs
(sockPath), and test/wait.test.mjs (the contract — do not modify it). ESM, Node
stdlib only, executable via \`node bin/grokctl.mjs <cmd>\`. Subcommands and
exact flags, one JSON line to stdout each: spawn --task --cwd [--model]
[--effort] [--grip] [--session]; list; status <id>; result <id>; inbox <id>;
say <id> <text...>; answer <id> allow|deny [--why <text...>]; wait [ids...]
[--timeout <sec>] (exit 0 on woke, 2 on timeout); kill/resume/fork <id>;
approve-stage <id> [paths...]; broker start|stop|status. Any command except
'broker stop|status' auto-starts the broker when the socket is dead: spawn
'node bin/grokd.mjs' detached with stdio ignore + unref, poll the socket up to
3s. Errors: print {\"error\":...} and exit 1. Run GROK_CC_LIVE=1 node --test
test/wait.test.mjs and report PASS/FAIL with output." \
  --cwd "$(pwd)" --always-approve --check
```

- [x] **Step 4 (Captain): review** — auto-start race (poll loop, not fixed sleep); wait timeout maps broker `{timeout:true}` → exit 2; `GROK_CC_LIVE=1 node --test test/wait.test.mjs` PASS; `npm test` green.
- [x] **Step 5: commit** — `git commit -am "feat: grokctl CLI with broker auto-start (sailor: grok)"`

---

### Task 9: Claude Code surface — [SAILOR draft, CAPTAIN review]

**Files:**
- Create: `commands/work.md`, `commands/status.md`, `commands/advise.md`, `commands/result.md`, `commands/fork.md`, `commands/resume.md`, `commands/kill.md`, `skills/delegation-contract/SKILL.md`, `skills/advisory-loop/SKILL.md`, `agents/grok-worker.md`, `hooks/hooks.json`

**Interfaces:**
- Consumes: the grokctl CLI surface exactly as produced by Task 8.
- Produces: `/grok:work`, `/grok:status`, `/grok:advise`, `/grok:result`, `/grok:fork`, `/grok:resume`, `/grok:kill` commands; two skills; a forwarder agent; SessionStart hook.

- [x] **Step 1 (Captain): write hooks.json + work.md + advise.md** (the load-bearing three)

`hooks/hooks.json`:
```json
{
  "hooks": {
    "SessionStart": [
      { "hooks": [{ "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/bin/grokctl.mjs\" broker start" }] }
    ]
  }
}
```

`commands/work.md`:
```markdown
---
description: Delegate a task to a veto-gated Grok worker
---
Delegate the task in $ARGUMENTS to a Grok worker:

1. Run: `node "${CLAUDE_PLUGIN_ROOT}/bin/grokctl.mjs" spawn --task "$ARGUMENTS" --cwd "$(pwd)"`
2. Show the user the returned worker `id` and `status`.
3. Immediately run `node "${CLAUDE_PLUGIN_ROOT}/bin/grokctl.mjs" wait <id> --timeout 570` **as a background Bash task** so its exit wakes you.
4. On wake, follow the grok:advisory-loop skill: drain the inbox before anything else.

Grip control: append `--grip gate|advise|leash` to spawn if the user asked for tighter/looser control. Model routing per the grok:delegation-contract skill.
```

`commands/advise.md`:
```markdown
---
description: Review and answer a Grok worker's pending request
---
For worker $ARGUMENTS:

1. Run `node "${CLAUDE_PLUGIN_ROOT}/bin/grokctl.mjs" inbox <id>` and read the LAST unhandled item.
2. `permission` item → show the user the toolCall title; decide (or ask the user if judgment is unclear):
   - approve: `... answer <id> allow`
   - veto: `... answer <id> deny --why "<reason>"` **then** `... say <id> "<corrective guidance>"`
3. `need_input` item → answer with `... say <id> "<answer>"`.
4. `checkpoint` item → review the plan summary; `... say <id> "continue"` or send corrections.
5. `done` item → verify the result against the original task (read the diff / run tests) before accepting.
6. Re-arm `... wait <id> --timeout 570` as a background task unless the worker is done/killed.
```

- [x] **Step 2 (Sailor): delegate the remaining five commands + agent**

```bash
grok -p "In this repo create five Claude Code command files and one agent file,
matching the style of commands/work.md and commands/advise.md (read both, plus
bin/grokctl.mjs for the CLI surface). Each command file: YAML frontmatter with
a one-line description, then terse numbered instructions that run the matching
grokctl subcommand via node \"\${CLAUDE_PLUGIN_ROOT}/bin/grokctl.mjs\" and
present the JSON to the user. Files: commands/status.md (list all workers or
one), commands/result.md (fetch + verify a result), commands/fork.md (fork a
session; note it errors on unsupported grok versions), commands/resume.md
(resume a dead worker), commands/kill.md (kill a worker). Also
agents/grok-worker.md: frontmatter name 'grok-worker', description 'Forward a
self-contained task to a Grok worker and return its result', tools Bash; body
instructs: spawn via grokctl, wait, on done return the result JSON verbatim.
Do not invent CLI flags that do not exist. STATUS: DONE with a files list." \
  --cwd "$(pwd)" --always-approve
```

- [x] **Step 3 (Captain): write the two skills** (these encode our hard-won delegation lessons — Captain writes, using real observations from Tasks 1–8 sailor runs)

`skills/delegation-contract/SKILL.md`:
```markdown
---
name: delegation-contract
description: How to write briefs for Grok workers - task framing, STATUS protocol, model routing. Use whenever composing a /grok:work task or any grokctl spawn.
---
# Writing Grok worker briefs

- One task, one worker. Scope so DONE is objectively checkable.
- State constraints explicitly (files not to touch, no pushes, stdlib only). Grok respects narrow prompts and stops; it expands vague ones.
- The broker wraps your task in the STATUS protocol automatically; do not restate it, but DO define what DONE means for this task.
- Give file paths, not descriptions. Give the verification command you will run.
- Model routing: mechanical/spec-clamped work -> --model grok-composer-2.5-fast; ambiguous debugging, cross-repo tracing, refactors -> default grok-4.5 (--effort low|medium|high).
- Untrusted or production tree -> --grip gate (writes staged until approve-stage). Trusted mechanical -> --grip leash. Default advise.
- Known trap: Grok misreports its own API/capabilities. Never let a worker's claims about grok internals into a design without a live probe.
```

`skills/advisory-loop/SKILL.md`:
```markdown
---
name: advisory-loop
description: How to run the advisor loop for Grok workers - wakes, inbox draining, veto etiquette. Use whenever a grokctl wait background task exits or a worker needs an answer.
---
# Running the advisory loop

- After every spawn, ALWAYS arm `grokctl wait <id> --timeout 570` as a background Bash task. Exit 0 = event (drain inbox now); exit 2 = heartbeat timeout (re-arm; check status while you're there).
- On wake: `grokctl inbox <id>`, handle the LAST unhandled item first (see /grok:advise steps). Never leave a permission pending - the 30-minute timeout denies and blocks the worker.
- Veto etiquette: a deny cancels the worker's whole turn. Always follow deny with `say` guidance in the same breath, or the worker sits idle.
- checkpoint items are your cheap steering moment - one `say` course-correction here saves a wasted turn later.
- Verify done results yourself (diff, tests) before telling the user it's done. Workers' verification claims are input, not truth.
- If a worker dies (status dead), `grokctl resume <id>` restores it with memory intact - do not respawn from scratch.
```

- [x] **Step 4 (Captain): review sailor files** — no invented flags (cross-check each against grokctl); frontmatter valid; commit.

```bash
git add -A && git commit -m "feat: Claude Code surface - commands, skills, agent, hook"
```

---

### Task 10: E2E success criteria + README — [CAPTAIN]

**Files:**
- Create: `README.md`
- Verify: spec §9 criteria against the real plugin

- [x] **Step 1: install plugin locally and dogfood**

```bash
claude plugin install "$(pwd)"   # or add to marketplace config if install-by-path is unavailable
```
Open a fresh Claude session in a scratch repo, run `/grok:work create a Makefile with test and lint targets for this node project`.

- [x] **Step 2: walk spec §9 checklist, record evidence**

1. Zero manual polling — the wait background task woke the session for every event (transcript shows task-notifications, no polling loops).
2. Veto — during the E2E run, deny one shell request via `/grok:advise`; confirm the command never executed (`fs-audit.jsonl` + filesystem).
3. NEED_INPUT observed — give one deliberately underspecified task (`/grok:work improve the error handling` in a repo with three services); worker must ask, not guess.
4. Broker kill mid-task → `grokctl resume` → task completes (rerun of test/resume.test.mjs counts).
5. Audit reconstruction — `cat ~/.grok-cc/workers/<id>/fs-audit.jsonl` lists every touched file with hashes.

Any criterion failing = fix before README.

- [x] **Step 3: write README.md** — what it is (one paragraph), install, the seven commands, grip table (copy from spec §5.1), architecture diagram (copy from spec §4), troubleshooting (broker not running → `grokctl broker start`; grok upgrade → capability probes auto-adapt; live tests need `GROK_CC_LIVE=1`).

- [x] **Step 4: final commit + tag**

```bash
git add -A && git commit -m "docs: README + E2E success criteria evidence"
git tag v0.1.0
```

---

## Self-Review (done at plan time)

- **Spec coverage:** §4.1 grokd (T7), fs mediation (T4), permission gate+timeout (T6), wake bridge (T7 wait + T8 ctl + T9 loop skill), lifecycle ops incl. fork-honest-error (T7), §4.2 grokctl (T8), §4.3 commands/skills/hooks/agent (T9), §5 policy+contract+loop (T3, T2, T9), §6 error handling (dead→resume T6/T7, MCP suppression T6 `mcpServers: []`, STATUS drift T2, capability drift T5 probes), §7 six tests (T1,T2,T3,T4 offline containment variant + handshake T5, roundtrip+veto T6, resume T7, wait T8), §8 scope respected, §9 criteria (T10).
- **Placeholder scan:** fork op intentionally ships an honest unsupported error (spec §8 defers worktree/fork orchestration; the command surface exists per §4.3) — explicit, not a TBD.
- **Type consistency:** store/contract/policy/fs-mediator signatures used in worker.mjs and grokd match their Interfaces blocks verbatim; inbox item shapes consistent across worker.mjs, grokd wait, and advise.md.

---

### Task 11: Benchmark vs codex plugin — [CAPTAIN] (added mid-execution by user)

After Task 10 E2E passes:

- [x] **Step 1:** Run the same 3 tasks (planted bugfix, YAGNI refactor, cross-repo trace — reuse the duel seeds) through `/grok:work` and through the codex plugin's rescue path. Record: correctness, wall-clock, orchestrator tokens.
- [x] **Step 2:** Capability matrix, measured not claimed: mid-task veto, worker-asks-back (NEED_INPUT), push wake (zero polls), resume-after-death, per-file audit. Codex plugin scored on the same axes.
- [x] **Step 3:** Verdict: grok-cc-plugin must win on interactivity + staleness with correctness parity. If not → /loop improvement iterations until it does.
- [x] **Step 4:** Write benchmark results into README (honest numbers, including losses).
