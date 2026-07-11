import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { tmpHome, tmpWorkspace } from './helpers.mjs'

const home = tmpHome()
const worker = await import('../lib/worker.mjs')
const store = await import('../lib/store.mjs')

const MIN = 60 * 1000

// R1 / F1: a `paused` worker rests on nobody with no timeout — the 36-min stall.
// One auto-nudge after a grace period, then escalate to a human on a true re-pause.
test('nudgePaused: grace → one nudge (latched on success) → escalate only on true re-pause', async () => {
  const ws = tmpWorkspace()
  const { id } = await worker.spawnWorker({ task: 'hang forever', cwd: ws, grip: 'leash' })
  const says = []
  const spy = (i) => { says.push(i) }
  try {
    await new Promise(r => setTimeout(r, 300))
    const t0 = Date.now()
    store.writeMeta(id, { status: 'paused', pausedAt: t0, pauseNudged: false, pauseEscalated: false })

    // within grace → nothing
    assert.deepEqual(await worker.nudgePaused(t0 + 10_000, spy), [])
    assert.equal(says.length, 0)

    // past grace → exactly one nudge, latched WITH a timestamp
    assert.deepEqual(await worker.nudgePaused(t0 + 2 * MIN, spy), [{ id, action: 'nudge' }])
    assert.equal(says.length, 1)
    const nudgedAt = store.readMeta(id).nudgedAt
    assert.ok(nudgedAt > 0 && store.readMeta(id).pauseNudged === true)

    // still the SAME pause (pausedAt not advanced past the nudge) → must NOT escalate
    assert.deepEqual(await worker.nudgePaused(t0 + 4 * MIN, spy), [])
    assert.notEqual(store.readMeta(id).pauseEscalated, true)

    // a TRUE re-pause: new pausedAt stamped after the nudge → escalate, no second nudge
    const t1 = nudgedAt + 1000
    store.writeMeta(id, { status: 'paused', pausedAt: t1 })
    assert.deepEqual(await worker.nudgePaused(t1 + 2 * MIN, spy), [{ id, action: 'escalate' }])
    assert.equal(says.length, 1, 'one auto-nudge per worker, ever')
    assert.equal(store.readMeta(id).pauseEscalated, true)
    assert.equal(worker.inbox(id).at(-1).type, 'stalled')
  } finally {
    try { worker.kill(id) } catch { /* reaped */ }
    worker.killWarm()
  }
})

// Grok's #1: a failed say() must NOT latch — the next tick has to retry, not falsely escalate.
test('a failed nudge stays unlatched and retries', async () => {
  const ws = tmpWorkspace()
  const { id } = await worker.spawnWorker({ task: 'hang forever', cwd: ws, grip: 'leash' })
  try {
    await new Promise(r => setTimeout(r, 300))
    const t0 = Date.now()
    store.writeMeta(id, { status: 'paused', pausedAt: t0, pauseNudged: false, pauseEscalated: false })

    const boom = () => { throw new Error('say failed') }
    assert.deepEqual(await worker.nudgePaused(t0 + 2 * MIN, boom), [])        // threw → nothing acted
    assert.notEqual(store.readMeta(id).pauseNudged, true, 'must not latch on failure')

    const ok = []
    assert.deepEqual(await worker.nudgePaused(t0 + 3 * MIN, (i) => ok.push(i)), [{ id, action: 'nudge' }])
    assert.equal(store.readMeta(id).pauseNudged, true)
  } finally {
    try { worker.kill(id) } catch { /* reaped */ }
    worker.killWarm()
  }
})

// Grok's #3: human steering restarts the budget, so a later stall can't silently recur.
test('human say resets the nudge latches', async () => {
  const ws = tmpWorkspace()
  const { id } = await worker.spawnWorker({ task: 'hang forever', cwd: ws, grip: 'leash' })
  try {
    await new Promise(r => setTimeout(r, 300))
    store.writeMeta(id, { status: 'paused', pausedAt: Date.now(), pauseNudged: true, pauseEscalated: true, nudgedAt: Date.now() })
    await worker.say(id, 'keep going')   // revive path
    const m = store.readMeta(id)
    assert.equal(m.pauseNudged, false)
    assert.equal(m.pauseEscalated, false)
  } finally {
    try { worker.kill(id) } catch { /* reaped */ }
    worker.killWarm()
  }
})

test('nudgePaused ignores non-live and non-paused workers', async () => {
  store.writeMeta('ghost', { id: 'ghost', status: 'paused', pausedAt: Date.now() - 10 * MIN })
  assert.deepEqual(await worker.nudgePaused(Date.now(), () => { throw new Error('should not fire') }), [])
})

test.after(() => fs.rmSync(home, { recursive: true, force: true }))
