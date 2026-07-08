import test from 'node:test'
import assert from 'node:assert/strict'
import { LIVE, tmpHome, tmpWorkspace, driveUntil } from './helpers.mjs'

test('kill child mid-session, resume restores memory', async () => {
  tmpHome()
  const ws = tmpWorkspace()
  const worker = await import('../lib/worker.mjs')
  const meta = await worker.spawnWorker({
    task: "Use your file write tool (not shell) to create magic.txt containing exactly 'xyzzy-7421'. Then finish.",
    cwd: ws,
  })
  try {
    await driveUntil(worker, meta.id, 'done')
    worker.kill(meta.id)                       // simulate death
    await worker.say(meta.id, 'In one sentence: what exact string did you write into magic.txt earlier? Then STATUS: DONE with a RESULT block whose summary contains that string.')
    await driveUntil(worker, meta.id, 'done')
    assert.match(worker.result(meta.id).summary, /xyzzy-7421/)   // memory survived process death
  } finally {
    worker.kill(meta.id)
  }
})
