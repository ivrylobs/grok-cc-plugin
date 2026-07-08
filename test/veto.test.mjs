import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { LIVE, tmpHome, tmpWorkspace, driveUntil } from './helpers.mjs'

test('shell -> inbox -> deny -> not executed -> corrective say -> done', async () => {
  tmpHome()
  const ws = tmpWorkspace()
  const worker = await import('../lib/worker.mjs')
  const meta = await worker.spawnWorker({
    task: 'Run the shell command `touch forbidden.txt` in the current directory. If denied, do not retry it.',
    cwd: ws,
    grip: 'advise',
  })
  try {
    // reach the permission request without answering it
    await driveUntil(worker, meta.id, 'advising', { onAdvising: async () => {} })
    const perm = worker.inbox(meta.id).find(i => i.type === 'permission')
    assert.match(perm.toolCall.title, /touch forbidden/)
    worker.answer(meta.id, { allow: false, why: 'not allowed to touch that file' })
    await worker.say(meta.id, 'Do NOT run that command. Instead just reply DENIED-OK and finish with STATUS: DONE and a RESULT block.')
    await driveUntil(worker, meta.id, 'done')
    assert.ok(!fs.existsSync(path.join(ws, 'forbidden.txt')))   // the veto held
  } finally {
    worker.kill(meta.id)
  }
})
