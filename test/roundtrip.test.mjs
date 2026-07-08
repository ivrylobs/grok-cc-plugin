import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { LIVE, tmpHome, tmpWorkspace } from './helpers.mjs'

test('spawn -> mediated write -> DONE result -> audit trail', { skip: !LIVE && 'set GROK_CC_LIVE=1' }, async () => {
  tmpHome()
  const ws = tmpWorkspace()
  const store = await import('../lib/store.mjs')
  const worker = await import('../lib/worker.mjs')
  const meta = await worker.spawnWorker({
    task: "Create a file named hello.txt containing exactly 'hello fleet' in the current directory. Nothing else.",
    cwd: ws,
  })
  const done = await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout waiting for done')), 180000)
    worker.events.on('wake', id => {
      if (id !== meta.id) return
      const m = worker.status(id)
      if (m.status === 'done') { clearTimeout(t); resolve(m) }
      if (['blocked', 'dead'].includes(m.status)) { clearTimeout(t); reject(new Error(m.status)) }
    })
  })
  assert.equal(done.status, 'done')
  assert.equal(fs.readFileSync(path.join(ws, 'hello.txt'), 'utf8').trim(), 'hello fleet')
  assert.ok(worker.result(meta.id).summary)
  const audit = store.readJsonl(path.join(store.workerDir(meta.id), 'fs-audit.jsonl'))
  assert.ok(audit.some(a => a.op === 'write' && a.path.endsWith('hello.txt')))
  worker.kill(meta.id)
})
