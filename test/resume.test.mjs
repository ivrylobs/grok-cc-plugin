import test from 'node:test'
import assert from 'node:assert/strict'
import { LIVE, tmpHome, tmpWorkspace } from './helpers.mjs'

test('kill child mid-session, resume restores memory', { skip: !LIVE && 'set GROK_CC_LIVE=1' }, async () => {
  tmpHome()
  const ws = tmpWorkspace()
  const worker = await import('../lib/worker.mjs')
  const meta = await worker.spawnWorker({
    task: "Create magic.txt containing exactly 'xyzzy-7421'. Then finish.",
    cwd: ws,
  })
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), 180000)
    worker.events.on('wake', id => { if (id === meta.id && worker.status(id).status === 'done') { clearTimeout(t); resolve() } })
  })
  worker.kill(meta.id)                       // simulate death
  await worker.say(meta.id, 'In one sentence: what exact string did you write into magic.txt earlier? Then STATUS: DONE with a RESULT block whose summary contains that string.')
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), 120000)
    worker.events.on('wake', id => { if (id === meta.id && worker.status(id).status === 'done') { clearTimeout(t); resolve() } })
  })
  assert.match(worker.result(meta.id).summary, /xyzzy-7421/)   // memory survived process death
  worker.kill(meta.id)
})
