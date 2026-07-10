import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { tmpHome } from './helpers.mjs'

// 0007: a DONE worker's prose (its argument) must survive, not only the fenced JSON.
test('result() exposes prose alongside the fenced result', async () => {
  tmpHome()
  const store = await import('../lib/store.mjs')
  const worker = await import('../lib/worker.mjs')
  const id = store.newId()
  store.writeMeta(id, { id, status: 'done' })
  const inboxFile = path.join(store.workerDir(id), 'inbox.jsonl')
  const prose = 'Section 1: the argument that matters.\nSection 2: evidence.'
  store.appendJsonl(inboxFile, {
    type: 'done',
    result: { summary: 'short abstract', files_changed: [] },
    prose,
  })
  const r = worker.result(id)
  assert.equal(r.summary, 'short abstract')   // existing callers keep working
  assert.equal(r.prose, prose)                // the discarded argument is back
})

// No distinct argument (prose === the fence-less summary) → no duplicate field.
test('result() does not duplicate prose when it equals the summary', async () => {
  tmpHome()
  const store = await import('../lib/store.mjs')
  const worker = await import('../lib/worker.mjs')
  const id = store.newId()
  store.writeMeta(id, { id, status: 'done' })
  const text = 'just some prose with no protocol'
  store.appendJsonl(path.join(store.workerDir(id), 'inbox.jsonl'), {
    type: 'done',
    result: { summary: text },
    prose: text,
  })
  const r = worker.result(id)
  assert.equal(r.summary, text)
  assert.equal(r.prose, undefined)
})
