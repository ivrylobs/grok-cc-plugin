import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import path from 'node:path'
import { AcpClient } from './acp-client.mjs'
import { decideToolCall } from './policy.mjs'
import { makeFsHandlers } from './fs-mediator.mjs'
import { parseStatus } from './contract.mjs'
import { resolveModelEffort } from './config.mjs'
import * as store from './store.mjs'

export const events = new EventEmitter()
const live = new Map()   // id -> {client, state:{msgBuf, pendingPerm: Map}}
const nudging = new Set()   // ids whose auto-nudge turn is opening — guards re-entrant sweeps
const PERM_TIMEOUT_MS = 30 * 60 * 1000

/** A worker in one of these has an agent child that should exist. Everything else is terminal. */
export const ACTIVE_STATUSES = ['starting', 'running', 'advising', 'paused', 'need_input']
/** Only these burn tokens unattended; the rest are resting on a human. */
const BURNING_STATUSES = ['starting', 'running']

/**
 * F3: does this worker need the captain (or carry a terminal result worth knowing)?
 * `wait --actionable` wakes only on these. NOT actionable: busy (starting/running),
 * or resting on an un-escalated checkpoint (`paused` before R1's one auto-nudge has
 * given up on it — that's optional steering, not a summons).
 */
export function isActionable(m) {
  if (!m || BURNING_STATUSES.includes(m.status)) return false
  if (m.status === 'paused' && !m.pauseEscalated) return false
  return true
}

const IDLE_MS = Number(process.env.GROK_CC_IDLE_MS || 5 * 60 * 1000)
const MAX_TURN_MS = Number(process.env.GROK_CC_MAX_TURN_MS || 30 * 60 * 1000)
const RETAIN_DAYS = Number(process.env.GROK_CC_RETAIN_DAYS || 7)
// A `paused` worker (turn ended without a terminal STATUS) rests on nobody and has
// no timeout — the F1 stall. Give it ONE automatic nudge after this grace, then, if
// it pauses again, escalate to a human. Never loop a confused worker (the F1 trade-off).
const PAUSE_NUDGE_MS = Number(process.env.GROK_CC_PAUSE_NUDGE_MS || 90 * 1000)
const NUDGE_TEXT = `Continue to completion. If you genuinely need a decision or input from your advisor, end your turn with a "QUESTION: <what you need>" line and "STATUS: NEED_INPUT". If the task is done, emit the RESULT block and "STATUS: DONE". Do not stop on a bare checkpoint.`
// R2/F2: a worker that ends a turn with STATUS: WORKING is explicitly mid-task (the brief
// tells complex tasks to checkpoint a plan that way). Under advise/leash/read, auto-continue
// it — run straight through to DONE instead of costing a captain round-trip per turn — but
// cap consecutive auto-continues so a stuck worker can't burn tokens unbounded. `gate` never
// auto-continues: steering between turns is its whole purpose.
const WORKING_AUTO_CAP = Number(process.env.GROK_CC_WORKING_AUTO_CAP || 25)
const CONTINUE_TEXT = `Continue with your plan and run straight through. Emit the RESULT block and "STATUS: DONE" when finished, or a "QUESTION:" line with "STATUS: NEED_INPUT" if you truly need a decision.`

/** R2: may a WORKING checkpoint auto-continue, or must it park for a human? */
export function shouldAutoContinueWorking(m) {
  return !!m && m.grip !== 'gate' && (m.workingRuns ?? 0) < WORKING_AUTO_CAP
}

// One pre-warmed AcpClient for the most-recently-used cwd. Child is not
// cwd-agnostic in practice (spawn cwd + session/new cwd both set); pool is
// keyed by resolved cwd. Consumed on next matching fresh spawn.
let warm = null   // { cwd, client, sessionId, probes, ready, promise, gen }
let warmGen = 0

/** Warm children must not pin the event loop (tests / idle broker). */
function unrefClient(client) {
  try {
    client.child.unref()
    client.child.stdin?.unref()
    client.child.stdout?.unref()
  } catch { /* already closed */ }
}

/** Re-pin when a warm client is promoted to a live worker. */
function refClient(client) {
  try {
    client.child.ref()
    client.child.stdin?.ref()
    client.child.stdout?.ref()
  } catch { /* already closed */ }
}

/** Kill any warm (or in-flight warm) client. Safe to call repeatedly. */
export function killWarm() {
  warmGen++
  const w = warm
  warm = null
  if (w?.client) try { w.client.kill() } catch { /* already dead */ }
}

/** Snapshot for diagnostics / timing scripts. */
export function warmInfo() {
  if (!warm) return null
  return { cwd: warm.cwd, ready: warm.ready }
}

/**
 * Pre-warm one AcpClient for `cwd`: spawn + handshake + session/new + probes.
 * Replaces any existing warm slot. Fire-and-forget; errors abandon the slot.
 */
export function schedulePrewarm(cwd) {
  const resolved = path.resolve(cwd)
  killWarm()
  const gen = warmGen
  const client = new AcpClient({ cwd: resolved, onUpdate: () => {}, onAgentRequest: null })
  // Unref immediately so an unused warm slot cannot hang process exit.
  unrefClient(client)
  const entry = { cwd: resolved, client, sessionId: null, probes: null, ready: false, gen, promise: null }
  entry.promise = (async () => {
    await client.handshake()
    const r = await client.request('session/new', { cwd: resolved, mcpServers: [] }, 60000)
    const probes = await client.probeExtensions(r.sessionId)
    if (gen !== warmGen || warm !== entry) {
      try { client.kill() } catch { /* superseded */ }
      return
    }
    entry.sessionId = r.sessionId
    entry.probes = probes
    entry.ready = true
  })().catch(() => {
    try { client.kill() } catch { /* dying */ }
    if (warm === entry) warm = null
  })
  warm = entry
  client.closed.then(() => {
    if (warm === entry) warm = null
  })
}

/** Consume a ready warm client for `cwd`, or null on miss / failure. */
async function takeWarm(cwd) {
  const resolved = path.resolve(cwd)
  const w = warm
  if (!w || w.cwd !== resolved) return null
  try { await w.promise } catch { return null }
  if (warm !== w || !w.ready || w.cwd !== resolved) return null
  warm = null
  refClient(w.client)
  return w
}

// Reap warm on process exit (direct imports + broker).
process.on('exit', () => { try { killWarm() } catch { /* shutting down */ } })

// R8/A3: the DEVIATION line is the fix for the P1 wound — a worker that silently ships a
// "documented trade-off" is apologizing in the source, not reviewing. Deviation must block.
export function buildBrief(task, accept = null) {
  return `You are a delegated worker driven by a Claude Code orchestrator (your advisor).

TASK:
${task}
${accept ? `\nACCEPTANCE (STATUS: DONE is INVALID until this passes):\n${accept}\n` : ''}
PROTOCOL (mandatory):
- End EVERY turn with exactly one line: "STATUS: WORKING|NEED_INPUT|DONE|BLOCKED".
- If you need anything (context, a decision, credentials), write "QUESTION: <what you need>" then "STATUS: NEED_INPUT". Never guess.
- DEVIATION IS BLOCKING: if you cannot meet the task, design, or acceptance as specified and are tempted to ship a workaround or "documented trade-off", do NOT proceed. Stop the turn with "QUESTION: <the deviation and why>" then "STATUS: NEED_INPUT". A trade-off shipped without approval is a defect, not a note.
- If the task involves multiple files, ambiguity, or destructive changes: BEFORE editing, end one turn with a one-paragraph plan and "STATUS: WORKING". For trivial single-step tasks, proceed directly to the work.
- Prefer your file read/write tools over shell commands for file content.
${accept ? '- Before "STATUS: DONE", run the ACCEPTANCE check and put its real result in `verification`. Never DONE on red — fix it, or STATUS: NEED_INPUT.\n' : ''}- When finished:
RESULT:
\`\`\`json
{"summary": "<what you did>", "files_changed": ["<paths>"], "verification": "<how you verified>"}
\`\`\`
STATUS: DONE`
}

function pushInbox(id, item) {
  store.appendJsonl(path.join(store.workerDir(id), 'inbox.jsonl'), { ts: new Date().toISOString(), ...item })
  events.emit('wake', id)
}

function logEvent(id, params) {
  store.appendJsonl(path.join(store.workerDir(id), 'events.jsonl'), { ts: new Date().toISOString(), ...params })
}

export async function spawnWorker({ task, cwd, model = null, effort = null, grip = 'advise', sessionId = null, allowTests = false, accept = null }) {
  const id = store.newId()
  const resolved = resolveModelEffort({ model, effort })   // flag > env > config.json > grok default
  store.writeMeta(id, { id, task, cwd: path.resolve(cwd), grip, model: resolved.model, effort: resolved.effort, sessionId, allowTests: !!allowTests, accept: accept || null, status: 'starting', createdAt: new Date().toISOString() })
  await attach(id, { fresh: !sessionId })
  // Keep one warm client for this cwd so the next same-cwd spawn is cheap.
  schedulePrewarm(path.resolve(cwd))
  prompt(id, buildBrief(task, accept)).catch(e => { store.writeMeta(id, { status: 'dead' }); pushInbox(id, { type: 'error', error: e.message }) })
  return store.readMeta(id)
}

function wireClient(id, client, state, fsH) {
  client.onUpdate = p => {
    logEvent(id, p)
    state.lastEventAt = Date.now()   // watchdog heartbeat: proof the agent is still doing something
    const u = p.update ?? {}
    if (u.sessionUpdate === 'agent_message_chunk' && u.content?.text) state.msgBuf += u.content.text
  }
  client.onAgentRequest = (method, params) => onAgentRequest(id, state, fsH, method, params)
  live.set(id, { client, state })
  client.closed.then(code => {
    // only clean up our own registration — a resumed worker may have replaced us
    if (live.get(id)?.client !== client) return
    live.delete(id)
    const m = store.readMeta(id)
    if (m && !['done', 'killed'].includes(m.status)) {
      store.writeMeta(id, { status: 'dead' })
      pushInbox(id, { type: 'error', error: `agent process exited (${code})` })
    }
  })
}

async function attach(id, { fresh }) {
  const meta = store.readMeta(id)
  const fsH = makeFsHandlers(meta)
  const state = { msgBuf: '', pendingPerm: new Map(), turn: 0, inflight: null, turnStartedAt: null, lastEventAt: null }

  // Warm path: reuse pre-handshaken client + session for matching cwd (fresh only).
  const taken = fresh ? await takeWarm(meta.cwd) : null
  if (taken) {
    wireClient(id, taken.client, state, fsH)
    store.writeMeta(id, { sessionId: taken.sessionId, probes: taken.probes })
  } else {
    const client = new AcpClient({
      cwd: meta.cwd,
      onUpdate: () => {},
      onAgentRequest: null,
    })
    wireClient(id, client, state, fsH)
    await client.handshake()
    if (fresh) {
      const r = await client.request('session/new', { cwd: meta.cwd, mcpServers: [] }, 60000)
      store.writeMeta(id, { sessionId: r.sessionId })
    } else {
      await client.request('session/load', { sessionId: meta.sessionId, cwd: meta.cwd, mcpServers: [] }, 120000)
    }
    const probes = await client.probeExtensions(store.readMeta(id).sessionId)
    store.writeMeta(id, { probes })
  }

  // model/effort routing — verified shapes (grok 0.2.91): modelId / modeId.
  // A rejected choice is recorded on meta so it surfaces instead of silently
  // falling back to grok's default model.
  const client = live.get(id).client
  const sid = store.readMeta(id).sessionId
  const applied = {}
  if (meta.model) applied.model = await trySet(client, 'session/set_model', { sessionId: sid, modelId: meta.model }, id)
  if (meta.effort) applied.effort = await trySet(client, 'session/set_mode', { sessionId: sid, modeId: meta.effort }, id)
  if (Object.keys(applied).length) store.writeMeta(id, { applied })
}

/** Returns true if accepted; false (and logs + records) if grok rejected it. */
async function trySet(client, method, params, id) {
  try { await client.request(method, params, 8000); return true }
  catch (e) {
    logEvent(id, { note: `${method} REJECTED`, code: e.code, message: e.message, params })
    pushInbox(id, { type: 'error', error: `${method} rejected (${e.message}); worker is running on grok's default, not your choice` })
    return false
  }
}

function prompt(id, text) {
  const w = live.get(id)
  if (!w) throw new Error(`worker ${id} not live`)
  const p = runTurn(id, w, text)
  w.state.inflight = p.catch(() => {})   // say() waits on this so turns never overlap
  return p
}

async function runTurn(id, w, text) {
  const turn = ++w.state.turn
  // A deny cancels the turn asynchronously. If say() has since started a newer
  // turn, this one's stopReason must not stamp status — it describes a dead turn.
  const stale = () => w.state.turn !== turn
  w.state.msgBuf = ''
  w.state.turnStartedAt = Date.now()
  w.state.lastEventAt = Date.now()
  store.writeMeta(id, { status: 'running' })
  let stopReason
  try {
    const meta = store.readMeta(id)
    const r = await w.client.request('session/prompt', { sessionId: meta.sessionId, prompt: [{ type: 'text', text }] }, 0)
    stopReason = r?.stopReason
  } catch (e) {
    if (!stale() && store.readMeta(id)?.status === 'running') {
      store.writeMeta(id, { status: 'dead' })
      pushInbox(id, { type: 'error', error: e.message })
    }
    return
  }
  if (stale()) return
  const m = store.readMeta(id)
  if (stopReason === 'cancelled') {
    // our deny already moved status to 'advising'; anything else cancelled = blocked
    if (m.status === 'running') { store.writeMeta(id, { status: 'blocked' }); pushInbox(id, { type: 'blocked', reason: 'turn cancelled' }) }
    return
  }
  const parsed = parseStatus(w.state.msgBuf)
  if (parsed.status === 'DONE') { store.writeMeta(id, { status: 'done' }); pushInbox(id, { type: 'done', result: parsed.result, prose: parsed.raw }) }
  else if (parsed.status === 'NEED_INPUT') { store.writeMeta(id, { status: 'need_input' }); pushInbox(id, { type: 'need_input', question: parsed.question ?? w.state.msgBuf.slice(-500) }) }
  else if (parsed.status === 'BLOCKED') { store.writeMeta(id, { status: 'blocked' }); pushInbox(id, { type: 'blocked', reason: w.state.msgBuf.slice(-500) }) }
  else {   // STATUS: WORKING — an explicit "still working" checkpoint
    pushInbox(id, { type: 'checkpoint', summary: w.state.msgBuf.slice(-500) })
    if (shouldAutoContinueWorking(m)) {
      store.writeMeta(id, { status: 'running', workingRuns: (m.workingRuns ?? 0) + 1 })   // run through, don't park
      say(id, CONTINUE_TEXT, { revive: false }).catch(() => {})
    } else {
      // gate steers between turns; or we hit the runaway cap → park (R1's nudge/escalate covers the stall)
      store.writeMeta(id, { status: 'paused', pausedAt: Date.now(), workingRuns: (m.workingRuns ?? 0) + 1 })
    }
  }
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
  if (decideToolCall(meta.grip, params.toolCall ?? {}, { allowTests: meta.allowTests }) === 'allow') {
    logEvent(id, { note: 'auto-allow', toolCall: params.toolCall?.title })
    return { outcome: { outcome: 'selected', optionId: pick('allow_once') } }
  }
  const key = store.newId()
  return new Promise(resolve => {
    const timer = setTimeout(() => {
      state.pendingPerm.delete(key)
      store.writeMeta(id, { status: 'blocked' })
      pushInbox(id, { type: 'blocked', reason: 'permission request timed out (30m)' })
      resolve({ outcome: { outcome: 'selected', optionId: pick('reject_once') } })
    }, PERM_TIMEOUT_MS)
    timer.unref()
    // register the resolver BEFORE emitting the wake, or an advisor that answers
    // synchronously on wake finds no pending permission
    state.pendingPerm.set(key, allow => {
      clearTimeout(timer)
      resolve({ outcome: { outcome: 'selected', optionId: pick(allow ? 'allow_once' : 'reject_once') } })
    })
    store.writeMeta(id, { status: 'advising' })
    pushInbox(id, { type: 'permission', key, toolCall: params.toolCall, options: options.map(o => ({ optionId: o.optionId, kind: o.kind })) })
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

export async function say(id, text, { revive = true } = {}) {
  // `revive:false` is the auto-nudge path — it must never resurrect a worker that
  // died in the window between the sweep seeing it `paused` and this call.
  if (!live.get(id)) {
    if (!revive) return store.readMeta(id)
    await resume(id)
  }
  const w = live.get(id)
  // Saying anything while a permission is held would clobber status and orphan
  // the resolver — grok is blocked on the answer, not on advice.
  if (w.state.pendingPerm.size) throw new Error(`worker ${id} has a pending permission; answer it first (grokctl answer ${id} allow|deny --why ...)`)
  // Human steering restarts the F1 nudge budget: a fresh stall after this gets its
  // own auto-nudge cycle. The auto-nudge itself (revive:false) must not reset — that
  // would let it re-nudge forever.
  if (revive) store.writeMeta(id, { pauseNudged: false, pauseEscalated: false, workingRuns: 0 })
  // Let a just-denied turn finish cancelling before opening a new one.
  // ponytail: 5s cap, not a real barrier — runTurn's stale() guard is what makes it correct.
  await Promise.race([w.state.inflight ?? Promise.resolve(), new Promise(r => setTimeout(r, 5000).unref())])
  prompt(id, text).catch(e => { pushInbox(id, { type: 'error', error: e.message }) })
  return store.readMeta(id)
}

export async function resume(id) {
  const meta = store.readMeta(id)
  if (!meta) throw new Error(`unknown worker ${id}`)
  if (live.get(id)) return meta
  if (!meta.sessionId) throw new Error(`worker ${id} has no session to resume`)
  await attach(id, { fresh: false })
  // Fresh nudge budget on revive: a resumed worker gets its one auto-nudge again.
  return store.writeMeta(id, { status: 'paused', pausedAt: Date.now(), pauseNudged: false, pauseEscalated: false })
}

export function kill(id) {
  const w = live.get(id)
  // Resolve any held permission as reject: the resolver clears its 30m timer,
  // which would otherwise fire later and overwrite `killed` with `blocked`.
  if (w) for (const [, fn] of w.state.pendingPerm) { try { fn(false) } catch { /* dying */ } }
  w?.state.pendingPerm.clear()
  w?.client.kill()
  live.delete(id)
  return store.writeMeta(id, { status: 'killed' })
}

export function list() { return store.listMetas() }
export function status(id) { return store.readMeta(id) }

/**
 * On broker start, `live` is empty by definition — so any meta still claiming an
 * ACTIVE status is describing a child that died with the previous broker. Left
 * alone it reads `running` forever and every status check is a lie.
 * `dead` is honest and resumable (session/load restores memory).
 */
export function reconcile() {
  const stale = []
  for (const m of store.listMetas()) {
    if (!ACTIVE_STATUSES.includes(m.status) || live.has(m.id)) continue
    store.writeMeta(m.id, { status: 'dead', staleFrom: m.status })
    pushInbox(m.id, { type: 'error', error: `broker restarted while ${m.status}; the agent child is gone. \`grokctl resume ${m.id}\` re-attaches with memory intact.` })
    stale.push(m.id)
  }
  return stale
}

const dur = ms => (ms < 60000 ? `${Math.round(ms / 1000)}s` : `${Math.round(ms / 60000)}m`)

/**
 * Watchdog. A worker that streams forever burns tokens; one whose agent went
 * quiet burns a slot. Both are unattended — nobody is waiting on a human — so
 * kill them. `advising`/`paused`/`need_input` are excluded: those are resting
 * on the advisor, and the permission hold has its own timeout.
 * `now` is injectable so the check is testable without waiting 30 minutes.
 */
export function sweep(now = Date.now()) {
  const killed = []
  for (const [id, w] of [...live]) {
    const m = store.readMeta(id)
    if (!m || !BURNING_STATUSES.includes(m.status)) continue
    const started = w.state.turnStartedAt ?? now
    const idleFor = now - (w.state.lastEventAt ?? started)
    const ranFor = now - started
    const reason =
      ranFor > MAX_TURN_MS ? `turn exceeded its ${dur(MAX_TURN_MS)} wall-clock cap` :
      idleFor > IDLE_MS ? `no agent activity for ${dur(idleFor)}` :
      null
    if (!reason) continue
    try { w.client.kill() } catch { /* already dead */ }
    live.delete(id)   // before writeMeta: the closed handler must not overwrite 'timeout' with 'dead'
    store.writeMeta(id, { status: 'timeout' })
    pushInbox(id, { type: 'error', error: `killed by watchdog: ${reason}` })
    killed.push({ id, reason })
  }
  return killed
}

/**
 * Un-stall `paused` workers. A turn that ends without a terminal STATUS parks the
 * worker on nobody, with no timeout (F1: caused a 36-min silent stall). After a
 * grace period, nudge it once to run to DONE/NEED_INPUT. If that one nudge doesn't
 * take and it pauses again, escalate to a human via a `stalled` inbox item and stop
 * — auto-resuming a confused worker in a loop is the named F1 trade-off. One nudge
 * per worker, ever (reset only by an explicit `resume`). `now`/`sayFn` injectable for tests.
 */
export async function nudgePaused(now = Date.now(), sayFn = (id, text) => say(id, text, { revive: false })) {
  const acted = []
  for (const [id] of [...live]) {
    const m = store.readMeta(id)
    if (!m || m.status !== 'paused' || nudging.has(id)) continue
    if (m.pausedAt == null) { store.writeMeta(id, { pausedAt: now }); continue }   // backfill: grace from here, never insta-nudge or skip-forever
    if (now - m.pausedAt <= PAUSE_NUDGE_MS) continue                               // still in grace

    if (!m.pauseNudged) {
      // Spend the one nudge. Latch ONLY after the turn actually opens — a failed
      // say() must leave it unlatched so the next tick retries (not falsely escalate).
      // `nudging` blocks a concurrent sweep from double-firing across the await.
      nudging.add(id)
      try {
        if (live.get(id) && store.readMeta(id)?.status === 'paused') {
          await sayFn(id, NUDGE_TEXT)
          store.writeMeta(id, { pauseNudged: true, nudgedAt: Date.now() })
          acted.push({ id, action: 'nudge' })
        }
      } catch { /* nudge failed — leave unlatched for the next tick */ }
      finally { nudging.delete(id) }
      continue
    }
    // Escalate only on a TRUE re-pause: a new pause stamped after the nudge fired.
    if (!m.pauseEscalated && m.nudgedAt != null && m.pausedAt > m.nudgedAt) {
      store.writeMeta(id, { pauseEscalated: true })
      pushInbox(id, { type: 'stalled', reason: `still paused after an auto-nudge — needs steering (grokctl say ${id} …) or kill` })
      acted.push({ id, action: 'escalate' })
    }
  }
  return acted
}

/** Drop terminal workers older than `days`. Active or live workers are never touched. */
export function prune({ days = RETAIN_DAYS, now = Date.now() } = {}) {
  const cutoff = now - days * 24 * 60 * 60 * 1000
  const removed = []
  for (const m of store.listMetas()) {
    if (!m.id) continue                                          // defensive: never rm an undefined path
    if (ACTIVE_STATUSES.includes(m.status) || live.has(m.id)) continue
    const seen = Date.parse(m.updatedAt ?? m.createdAt ?? '')
    // Recent, dated workers are kept. An UNDATED meta is malformed junk (every
    // real spawn writes createdAt) — and since active/live are already excluded
    // above, garbage-collect it rather than letting a broken dir linger forever.
    if (Number.isFinite(seen) && seen > cutoff) continue
    fs.rmSync(path.join(store.ROOT, 'workers', m.id), { recursive: true, force: true })
    removed.push(m.id)
  }
  return removed
}
export function inbox(id) { return store.readJsonl(path.join(store.workerDir(id), 'inbox.jsonl')) }
export function result(id) {
  const done = inbox(id).filter(i => i.type === 'done').at(-1)
  if (!done) return null
  // 0007: expose the worker's prose (its argument), not only the fenced JSON.
  // Merge so existing `.summary` callers keep working; skip when prose === the
  // fence-less summary (no distinct argument was discarded).
  if (done.result && typeof done.result === 'object' && done.prose && done.prose !== done.result.summary) {
    return { ...done.result, prose: done.prose }
  }
  return done.result ?? null
}
