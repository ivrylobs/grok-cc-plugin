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
    // mkdir is shell-only (not file content), so it must go through the execute permission gate
    task: 'Use ONLY your shell/bash tool to run exactly this command: `mkdir secret_dir`. Do not use any file-writing tool. If the command is denied, do not retry it.',
    cwd: ws,
    grip: 'advise',
  })
  try {
    // reach the permission request without answering it
    await driveUntil(worker, meta.id, 'advising', { onAdvising: async () => {} })
    const perm = worker.inbox(meta.id).find(i => i.type === 'permission')
    assert.match(perm.toolCall.title, /mkdir secret_dir/)
    // advising while a permission is held: say() must refuse rather than clobber
    // status and orphan the resolver (grok is blocked on the answer, not on advice)
    await assert.rejects(worker.say(meta.id, 'some advice'), /pending permission/)
    worker.answer(meta.id, { allow: false, why: 'not allowed to create that directory' })
    assert.ok(!fs.existsSync(path.join(ws, 'secret_dir')))   // the veto held: command never executed
    // corrective guidance; grok may finish DONE or declare itself BLOCKED — both are clean terminal states
    await worker.say(meta.id, 'Do NOT run that command. Acknowledge with DENIED-OK and finish with STATUS: DONE and a RESULT block.')
    await driveUntil(worker, meta.id, ['done', 'blocked'])
    assert.ok(!fs.existsSync(path.join(ws, 'secret_dir')))   // still never created
  } finally {
    worker.kill(meta.id)
  }
})

test('kill during a held permission clears it — no timer left to overwrite killed->blocked', async () => {
  tmpHome()
  const ws = tmpWorkspace()
  const worker = await import('../lib/worker.mjs')
  const meta = await worker.spawnWorker({
    task: 'Use ONLY your shell/bash tool to run exactly this command: `mkdir secret_dir`. If denied, do not retry.',
    cwd: ws,
    grip: 'advise',
  })
  await driveUntil(worker, meta.id, 'advising', { onAdvising: async () => {} })
  assert.equal(worker.inbox(meta.id).filter(i => i.type === 'permission').length, 1)

  worker.kill(meta.id)
  assert.equal(worker.status(meta.id).status, 'killed')
  // the 30m timer lived inside the held permission's resolver; kill must have run it
  // (which clears the timer), so nothing is left pending to answer or to flip status
  assert.throws(() => worker.answer(meta.id, { allow: true }), /not live|no pending/)
})
