import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { LIVE, tmpHome, tmpWorkspace, driveUntil } from './helpers.mjs'

test('spawn -> mediated write -> DONE result -> audit trail', async () => {
  tmpHome()
  const ws = tmpWorkspace()
  const store = await import('../lib/store.mjs')
  const worker = await import('../lib/worker.mjs')
  const meta = await worker.spawnWorker({
    task: "Use your file write tool (not shell) to create hello.txt containing exactly 'hello fleet' in the current directory. Nothing else.",
    cwd: ws,
  })
  try {
    const done = await driveUntil(worker, meta.id, 'done')
    assert.equal(done.status, 'done')
    assert.equal(fs.readFileSync(path.join(ws, 'hello.txt'), 'utf8').trim(), 'hello fleet')
    assert.ok(worker.result(meta.id).summary)
    const audit = store.readJsonl(path.join(store.workerDir(meta.id), 'fs-audit.jsonl'))
    assert.ok(audit.some(a => a.op === 'write' && a.path.endsWith('hello.txt')))
  } finally {
    worker.kill(meta.id)
  }
})
