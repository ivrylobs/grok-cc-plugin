import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, execFile } from 'node:child_process'
import path from 'node:path'
import { LIVE, tmpHome, tmpWorkspace } from './helpers.mjs'

const CTL = path.resolve('bin/grokctl.mjs')
const run = (args, env) => JSON.parse(execFileSync('node', [CTL, ...args], { env: { ...process.env, ...env }, encoding: 'utf8' }).trim())

test('ctl auto-starts broker; wait blocks then wakes on worker event', async () => {
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

test('wait exits 2 on timeout with no workers', async () => {
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
