import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { LIVE, tmpHome, tmpWorkspace } from './helpers.mjs'

test('shell -> inbox -> deny -> not executed -> corrective say -> done', { skip: !LIVE && 'set GROK_CC_LIVE=1' }, async () => {
  tmpHome()
  const ws = tmpWorkspace()
  const worker = await import('../lib/worker.mjs')
  const meta = await worker.spawnWorker({
    task: 'Run the shell command `touch forbidden.txt` in the current directory. If denied, do not retry it.',
    cwd: ws,
    grip: 'advise',
  })
  const waitFor = pred => new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), 180000)
    const h = id => { if (id === meta.id && pred(worker.status(id))) { clearTimeout(t); worker.events.off('wake', h); resolve() } }
    worker.events.on('wake', h)
  })
  await waitFor(m => m.status === 'advising')
  const perm = worker.inbox(meta.id).find(i => i.type === 'permission')
  assert.match(perm.toolCall.title, /touch forbidden/)
  worker.answer(meta.id, { allow: false, why: 'not allowed to touch that file' })
  await worker.say(meta.id, "Do NOT run that command. Instead just reply DENIED-OK and finish with STATUS: DONE and a RESULT block.")
  await waitFor(m => m.status === 'done')
  assert.ok(!fs.existsSync(path.join(ws, 'forbidden.txt')))   // the veto held
  worker.kill(meta.id)
})
