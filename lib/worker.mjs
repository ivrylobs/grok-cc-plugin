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
- If the task involves multiple files, ambiguity, or destructive changes: BEFORE editing, end one turn with a one-paragraph plan and "STATUS: WORKING". For trivial single-step tasks, proceed directly to the work.
- Prefer your file read/write tools over shell commands for file content.
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
  prompt(id, BRIEF(task)).catch(e => { store.writeMeta(id, { status: 'dead' }); pushInbox(id, { type: 'error', error: e.message }) })
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
    // only clean up our own registration — a resumed worker may have replaced us
    if (live.get(id)?.client !== client) return
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
  // best-effort model/effort routing; rejected shapes are logged, never fatal
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
  prompt(id, text).catch(e => { pushInbox(id, { type: 'error', error: e.message }) })
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
