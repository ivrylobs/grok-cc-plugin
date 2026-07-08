#!/usr/bin/env node
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import * as store from '../lib/store.mjs'

const SOCK = store.sockPath()
const GROKD = path.join(path.dirname(fileURLToPath(import.meta.url)), 'grokd.mjs')
const AUTO_START_MS = 3000

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

function isAlive() {
  return new Promise(resolve => {
    const s = net.connect(SOCK)
    let done = false
    const finish = v => { if (!done) { done = true; resolve(v) } }
    s.once('connect', () => { s.end(); finish(true) })
    s.once('error', () => finish(false))
  })
}

function startBrokerDetached() {
  const child = spawn(process.execPath, [GROKD], {
    detached: true,
    stdio: 'ignore',
    env: process.env,
  })
  child.unref()
}

async function ensureBroker() {
  if (await isAlive()) return
  startBrokerDetached()
  const deadline = Date.now() + AUTO_START_MS
  while (Date.now() < deadline) {
    await sleep(50)
    if (await isAlive()) return
  }
  throw new Error('broker failed to start within 3s')
}

async function waitUntilDead(ms = 1000) {
  const deadline = Date.now() + ms
  while (Date.now() < deadline) {
    if (!(await isAlive())) return
    await sleep(30)
  }
}

let reqSeq = 0

function rpc(op, args = {}) {
  return new Promise((resolve, reject) => {
    const sock = net.connect(SOCK)
    let buf = ''
    let settled = false
    const id = ++reqSeq
    const settle = (fn, v) => {
      if (settled) return
      settled = true
      fn(v)
    }
    sock.on('connect', () => {
      sock.write(JSON.stringify({ id, op, args }) + '\n')
    })
    sock.on('data', chunk => {
      buf += chunk
      const nl = buf.indexOf('\n')
      if (nl < 0) return
      const line = buf.slice(0, nl)
      sock.end()
      let resp
      try {
        resp = JSON.parse(line)
      } catch {
        settle(reject, new Error('bad reply from broker'))
        return
      }
      if (resp.ok) settle(resolve, resp.data)
      else settle(reject, new Error(resp.error || 'unknown error'))
    })
    sock.on('error', err => settle(reject, err))
    sock.on('close', () => settle(reject, new Error('broker connection closed')))
  })
}

function out(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n')
}

function fail(err) {
  out({ error: err?.message || String(err) })
  process.exit(1)
}

function takeFlag(argv, name) {
  const i = argv.indexOf(name)
  if (i < 0) return null
  if (i + 1 >= argv.length) throw new Error(`missing value for ${name}`)
  const v = argv[i + 1]
  argv.splice(i, 2)
  return v
}

function parseSpawn(argv) {
  const task = takeFlag(argv, '--task')
  const cwd = takeFlag(argv, '--cwd')
  const model = takeFlag(argv, '--model')
  const effort = takeFlag(argv, '--effort')
  const grip = takeFlag(argv, '--grip')
  const session = takeFlag(argv, '--session')
  if (!task) throw new Error('spawn requires --task')
  if (!cwd) throw new Error('spawn requires --cwd')
  if (argv.length) throw new Error(`unexpected args: ${argv.join(' ')}`)
  const args = { task, cwd }
  if (model != null) args.model = model
  if (effort != null) args.effort = effort
  if (grip != null) args.grip = grip
  if (session != null) args.sessionId = session
  return args
}

function parseWait(argv) {
  const timeout = takeFlag(argv, '--timeout')
  const ids = argv.length ? [...argv] : null
  const args = {}
  if (ids) args.ids = ids
  if (timeout != null) args.timeoutSec = Number(timeout)
  return args
}

function parseAnswer(argv) {
  if (argv.length < 2) throw new Error('usage: answer <id> allow|deny [--why <text...>]')
  const id = argv.shift()
  const verdict = argv.shift()
  if (verdict !== 'allow' && verdict !== 'deny') throw new Error('answer verdict must be allow|deny')
  let why
  const wi = argv.indexOf('--why')
  if (wi >= 0) {
    why = argv.slice(wi + 1).join(' ')
    argv.splice(wi)
  }
  if (argv.length) throw new Error(`unexpected args: ${argv.join(' ')}`)
  const args = { id, allow: verdict === 'allow' }
  if (why != null) args.why = why
  return args
}

async function main() {
  const argv = process.argv.slice(2)
  const cmd = argv.shift()
  if (!cmd) throw new Error('usage: grokctl <cmd> ...')

  const skipAuto = cmd === 'broker' && (argv[0] === 'stop' || argv[0] === 'status')

  if (cmd === 'broker') {
    const sub = argv.shift()
    if (sub === 'start') {
      await ensureBroker()
      out(await rpc('ping'))
      return
    }
    if (sub === 'stop') {
      if (!(await isAlive())) {
        out({ stopped: true, already: true })
        return
      }
      const data = await rpc('stop')
      await waitUntilDead()
      out(data)
      return
    }
    if (sub === 'status') {
      if (!(await isAlive())) {
        out({ running: false })
        return
      }
      const p = await rpc('ping')
      out({ running: true, ...p })
      return
    }
    throw new Error('usage: broker start|stop|status')
  }

  if (!skipAuto) await ensureBroker()

  if (cmd === 'spawn') {
    out(await rpc('spawn', parseSpawn(argv)))
    return
  }
  if (cmd === 'list') {
    out(await rpc('list'))
    return
  }
  if (cmd === 'status' || cmd === 'result' || cmd === 'inbox' || cmd === 'kill' || cmd === 'resume' || cmd === 'fork') {
    const id = argv.shift()
    if (!id) throw new Error(`usage: ${cmd} <id>`)
    out(await rpc(cmd, { id }))
    return
  }
  if (cmd === 'say') {
    const id = argv.shift()
    if (!id || !argv.length) throw new Error('usage: say <id> <text...>')
    out(await rpc('say', { id, text: argv.join(' ') }))
    return
  }
  if (cmd === 'answer') {
    out(await rpc('answer', parseAnswer(argv)))
    return
  }
  if (cmd === 'wait') {
    const data = await rpc('wait', parseWait(argv))
    out(data)
    if (data?.timeout) process.exit(2)
    return
  }
  if (cmd === 'approve-stage') {
    const id = argv.shift()
    if (!id) throw new Error('usage: approve-stage <id> [paths...]')
    const paths = argv.length ? argv : null
    out(await rpc('approve-stage', { id, paths }))
    return
  }
  throw new Error(`unknown command: ${cmd}`)
}

main().catch(fail)
