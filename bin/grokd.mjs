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
    throw new Error('fork params not yet mapped; spawn with --session <sessionId> to branch manually')  // ponytail: honest v1 limit, upgrade when fork params are probed
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
    fs.writeFileSync(SOCK + '.pid', String(process.pid))
    setInterval(() => {
      if (!ACTIVE().length && Date.now() - lastActivity > IDLE_EXIT_MS) process.exit(0)
    }, 10 * 60 * 1000).unref()
  })
}

// single-instance: probe existing socket before claiming it
const probe = net.connect(SOCK)
probe.on('connect', () => { console.log('already running'); process.exit(0) })
probe.on('error', () => { try { fs.unlinkSync(SOCK) } catch {} ; serve() })
