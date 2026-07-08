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
