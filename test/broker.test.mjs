import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import net from 'node:net'
import path from 'node:path'
import { spawn, execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { MOCK_BIN, tmpWorkspace } from './helpers.mjs'

const GROKD = fileURLToPath(new URL('../bin/grokd.mjs', import.meta.url))

const rpc = (sock, req) => new Promise((resolve, reject) => {
  const c = net.connect(sock)
  c.on('error', reject)
  c.on('connect', () => c.write(JSON.stringify(req) + '\n'))
  c.on('data', d => { resolve(JSON.parse(d.toString().split('\n')[0])); c.end() })
})

const waitFor = async (pred, ms, what) => {
  const deadline = Date.now() + ms
  while (!(await pred())) {
    assert.ok(Date.now() < deadline, what)
    await new Promise(r => setTimeout(r, 50))
  }
}

// Children of THIS broker only — test files run in parallel processes, so a
// global pgrep for the mock agent counts other tests' children too.
const childrenOf = pid => {
  try { return execSync(`pgrep -P ${pid} || true`).toString().trim().split('\n').filter(Boolean).length }
  catch { return 0 }
}

// Regression: the first real run failed with EACCES because ~/.grok-cc did not
// exist — every test until now handed the broker an mkdtemp'd dir that did.
test('broker creates its state dir before binding the socket', async t => {
  const home = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gcc-broker-')), 'does', 'not', 'exist')
  assert.equal(fs.existsSync(home), false)

  const child = spawn(process.execPath, [GROKD], { env: { ...process.env, GROK_CC_HOME: home }, stdio: 'ignore' })
  t.after(() => child.kill('SIGKILL'))

  const sock = path.join(home, 'broker.sock')
  const deadline = Date.now() + 10_000
  while (!fs.existsSync(sock)) {
    assert.ok(Date.now() < deadline, 'broker never created its socket')
    await new Promise(r => setTimeout(r, 50))
  }

  const reply = await new Promise((resolve, reject) => {
    const c = net.connect(sock)
    c.on('error', reject)
    c.on('connect', () => c.write(JSON.stringify({ id: 1, op: 'ping' }) + '\n'))
    c.on('data', d => { resolve(JSON.parse(d.toString().split('\n')[0])); c.end() })
  })
  assert.equal(reply.ok, true)
  assert.equal(reply.data.pid, child.pid)
})

// Invariant: stopping the broker strands no agent children. The warm slot is
// killed explicitly (nothing else owns it); worker children exit on stdin EOF.
// Both mock and real grok honour EOF — verified 2026-07-09. Detaching a child,
// or holding its pipes open past exit, would break this.
test('broker stop leaves no agent children behind', async t => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'gcc-orphan-'))

  const child = spawn(process.execPath, [GROKD], {
    env: { ...process.env, GROK_CC_HOME: home, GROK_CC_GROK_BIN: MOCK_BIN },
    stdio: 'ignore',
  })
  t.after(() => child.kill('SIGKILL'))

  const sock = path.join(home, 'broker.sock')
  await waitFor(async () => fs.existsSync(sock), 10_000, 'broker never bound')

  const ws = tmpWorkspace()
  const spawned = await rpc(sock, { id: 1, op: 'spawn', args: { task: 'say hi', cwd: ws, grip: 'leash' } })
  assert.equal(spawned.ok, true, spawned.error)

  // one child for the worker, one for the warm slot it schedules behind it
  await waitFor(async () => childrenOf(child.pid) >= 2, 15_000, 'worker + warm children never appeared')

  await rpc(sock, { id: 2, op: 'stop' })
  await waitFor(async () => childrenOf(child.pid) === 0, 10_000, 'broker stop left orphaned agent children')
})
