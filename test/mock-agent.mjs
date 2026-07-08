#!/usr/bin/env node
// Deterministic ACP agent for fast protocol tests. Same wire format as
// `grok agent stdio`; behavior keyed off prompt text. No LLM, no network.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import readline from 'node:readline'

const STATE_DIR = path.join(os.tmpdir(), 'gcc-mock-sessions')
fs.mkdirSync(STATE_DIR, { recursive: true })
const sfile = id => path.join(STATE_DIR, id + '.json')
const load = id => JSON.parse(fs.readFileSync(sfile(id), 'utf8'))
const save = s => fs.writeFileSync(sfile(s.id), JSON.stringify(s))

let seq = 1000
const pending = new Map()
const send = o => process.stdout.write(JSON.stringify(o) + '\n')
const reply = (id, result) => send({ jsonrpc: '2.0', id, result })
const request = (method, params) => new Promise(resolve => {
  const id = ++seq
  pending.set(id, resolve)
  send({ jsonrpc: '2.0', id, method, params })
})
const update = (sessionId, u) => send({ jsonrpc: '2.0', method: 'session/update', params: { sessionId, update: u } })
const chunk = (sid, text) => update(sid, { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text } })

async function handlePrompt(id, { sessionId, prompt }) {
  const s = load(sessionId)
  const text = prompt.map(p => p.text ?? '').join('\n')

  // corrective after a deny
  if (/do not run that command/i.test(text)) {
    chunk(sessionId, 'DENIED-OK\nRESULT:\n```json\n{"summary":"denied-ok","files_changed":[],"verification":"none"}\n```\nSTATUS: DONE')
    return reply(id, { stopReason: 'end_turn' })
  }
  // memory question
  if (/what exact string/i.test(text)) {
    const mem = s.written?.content ?? 'nothing'
    chunk(sessionId, `I wrote '${mem}'.\nRESULT:\n\`\`\`json\n{"summary":"earlier I wrote ${mem}","files_changed":[],"verification":"memory"}\n\`\`\`\nSTATUS: DONE`)
    return reply(id, { stopReason: 'end_turn' })
  }
  // shell command task -> permission flow
  const sh = text.match(/`(touch [^`]+)`/)
  if (sh) {
    const outcome = await request('session/request_permission', {
      sessionId,
      toolCall: { toolCallId: 'call-mock-1', kind: 'execute', title: `Execute \`${sh[1]}\``, rawInput: { variant: 'Bash', command: sh[1] } },
      options: [{ optionId: 'allow-once', kind: 'allow_once' }, { optionId: 'reject-once', kind: 'reject_once' }],
    })
    if (outcome?.outcome?.optionId === 'allow-once') {
      fs.writeFileSync(path.join(s.cwd, sh[1].split(/\s+/)[1]), '')
      chunk(sessionId, 'RESULT:\n```json\n{"summary":"touched","files_changed":[],"verification":"shell"}\n```\nSTATUS: DONE')
      return reply(id, { stopReason: 'end_turn' })
    }
    return reply(id, { stopReason: 'cancelled' })
  }
  // file-creation task -> client-mediated write (exercises real fs-mediator)
  const m = text.match(/create (\S+?) containing exactly '([^']+)'/i)
  if (m) {
    const target = path.join(s.cwd, m[1])
    update(sessionId, { sessionUpdate: 'tool_call', toolCallId: 'call-mock-w', title: 'write', rawInput: { file_path: target, content: m[2] } })
    await request('fs/write_text_file', { sessionId, path: target, content: m[2] })
    s.written = { path: target, content: m[2] }; save(s)
    chunk(sessionId, `Created ${m[1]}.\nRESULT:\n\`\`\`json\n{"summary":"created ${m[1]} with ${m[2]}","files_changed":["${m[1]}"],"verification":"mediated write"}\n\`\`\`\nSTATUS: DONE`)
    return reply(id, { stopReason: 'end_turn' })
  }
  // NEED_INPUT trigger for advisory tests
  if (/underspecified/i.test(text)) {
    chunk(sessionId, 'QUESTION: which service should I change?\nSTATUS: NEED_INPUT')
    return reply(id, { stopReason: 'end_turn' })
  }
  chunk(sessionId, 'RESULT:\n```json\n{"summary":"noop","files_changed":[],"verification":"none"}\n```\nSTATUS: DONE')
  reply(id, { stopReason: 'end_turn' })
}

readline.createInterface({ input: process.stdin }).on('line', async line => {
  let msg
  try { msg = JSON.parse(line) } catch { return }
  if (msg.id !== undefined && msg.method === undefined) {           // reply to our request
    pending.get(msg.id)?.(msg.result)
    pending.delete(msg.id)
    return
  }
  const { id, method, params } = msg
  if (method === 'initialize') return reply(id, { protocolVersion: 1, agentCapabilities: { loadSession: true }, authMethods: [] })
  if (method === 'session/new') {
    const s = { id: 'mock-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), cwd: params.cwd }
    save(s)
    return reply(id, { sessionId: s.id })
  }
  if (method === 'session/load') {
    try { load(params.sessionId); return reply(id, {}) }
    catch { return send({ jsonrpc: '2.0', id, error: { code: -32000, message: 'unknown session' } }) }
  }
  if (method === 'session/prompt') return handlePrompt(id, params)
  if (id !== undefined) return send({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found' } })
})
