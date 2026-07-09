import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { tmpHome, tmpWorkspace } from './helpers.mjs'

const home = tmpHome()
const worker = await import('../lib/worker.mjs')
const store = await import('../lib/store.mjs')

const MINUTE = 60 * 1000
const inbox = id => worker.inbox(id)

test('reconcile marks orphaned ACTIVE workers dead — a broker restart cannot leave a lie', () => {
  for (const status of worker.ACTIVE_STATUSES) store.writeMeta('orph-' + status, { id: 'orph-' + status, status })
  store.writeMeta('orph-done', { id: 'orph-done', status: 'done' })

  const stale = worker.reconcile()

  assert.deepEqual(stale.sort(), worker.ACTIVE_STATUSES.map(s => 'orph-' + s).sort())
  for (const s of worker.ACTIVE_STATUSES) {
    const m = store.readMeta('orph-' + s)
    assert.equal(m.status, 'dead')
    assert.equal(m.staleFrom, s)                       // what it was pretending to be
    assert.match(inbox('orph-' + s).at(-1).error, /resume/)   // and how to get it back
  }
  assert.equal(store.readMeta('orph-done').status, 'done')    // terminal states untouched
  assert.deepEqual(worker.reconcile(), [])                    // idempotent
})

test('prune drops old terminal workers, keeps recent and ACTIVE ones', () => {
  const now = Date.parse('2026-07-09T00:00:00Z')
  const day = 24 * 60 * MINUTE
  store.writeMeta('old-done', { id: 'old-done', status: 'done' })
  store.writeMeta('old-active', { id: 'old-active', status: 'running' })
  store.writeMeta('new-done', { id: 'new-done', status: 'done' })
  // writeMeta stamps updatedAt=now(); rewrite the field directly to age them
  const age = (id, ms) => {
    const f = path.join(store.ROOT, 'workers', id, 'meta.json')
    const m = JSON.parse(fs.readFileSync(f, 'utf8'))
    fs.writeFileSync(f, JSON.stringify({ ...m, updatedAt: new Date(now - ms).toISOString() }))
  }
  age('old-done', 30 * day)
  age('old-active', 30 * day)
  age('new-done', 1 * day)

  const removed = worker.prune({ days: 7, now })

  assert.ok(removed.includes('old-done'))
  assert.ok(!removed.includes('old-active'), 'a worker still claiming to run must never be pruned')
  assert.ok(!removed.includes('new-done'))
  assert.equal(store.readMeta('old-done'), null)
  assert.ok(store.readMeta('old-active'))
})

test('sweep kills a turn that exceeds the wall-clock cap, and leaves a live one alone', async () => {
  const ws = tmpWorkspace()
  const meta = await worker.spawnWorker({ task: 'hang forever', cwd: ws, grip: 'leash' })
  try {
    // the mock never replies, so the turn is genuinely stuck in `running`
    await new Promise(r => setTimeout(r, 300))
    assert.equal(worker.status(meta.id).status, 'running')

    assert.deepEqual(worker.sweep(), [], 'a young turn must survive the watchdog')

    const killed = worker.sweep(Date.now() + 31 * MINUTE)   // past MAX_TURN_MS
    assert.equal(killed.length, 1)
    assert.equal(killed[0].id, meta.id)
    assert.match(killed[0].reason, /wall-clock cap/)
    assert.equal(worker.status(meta.id).status, 'timeout')
    assert.match(inbox(meta.id).at(-1).error, /watchdog/)
  } finally {
    try { worker.kill(meta.id) } catch { /* already reaped */ }
    worker.killWarm()
  }
})

test('sweep kills a turn whose agent went silent', async () => {
  const ws = tmpWorkspace()
  const meta = await worker.spawnWorker({ task: 'hang forever', cwd: ws, grip: 'leash' })
  try {
    await new Promise(r => setTimeout(r, 300))
    const killed = worker.sweep(Date.now() + 6 * MINUTE)   // past IDLE_MS, under MAX_TURN_MS
    assert.equal(killed.length, 1)
    assert.match(killed[0].reason, /no agent activity/)
    assert.equal(worker.status(meta.id).status, 'timeout')
  } finally {
    try { worker.kill(meta.id) } catch { /* already reaped */ }
    worker.killWarm()
  }
})

test('sweep never touches a worker resting on the advisor', async () => {
  const ws = tmpWorkspace()
  const meta = await worker.spawnWorker({ task: 'hang forever', cwd: ws, grip: 'leash' })
  try {
    await new Promise(r => setTimeout(r, 300))
    for (const resting of ['advising', 'paused', 'need_input']) {
      store.writeMeta(meta.id, { status: resting })
      assert.deepEqual(worker.sweep(Date.now() + 99 * MINUTE), [], `${resting} is waiting on a human, not burning tokens`)
      assert.equal(worker.status(meta.id).status, resting)
    }
  } finally {
    try { worker.kill(meta.id) } catch { /* already reaped */ }
    worker.killWarm()
  }
})

test.after(() => fs.rmSync(home, { recursive: true, force: true }))
