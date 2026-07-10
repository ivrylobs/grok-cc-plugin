import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { tmpHome } from './helpers.mjs'

// A worker dir whose meta.json is missing/unparseable/id-less used to crash
// prune (path.join(ROOT, 'workers', undefined)); the user's `grokctl prune` died
// mid-loop. listMetas now falls back to the dir name, and prune GC's the junk.
test('prune garbage-collects malformed worker dirs without crashing', async () => {
  tmpHome()
  const store = await import('../lib/store.mjs')
  const worker = await import('../lib/worker.mjs')
  const mk = (id, meta) => {
    const d = path.join(store.ROOT, 'workers', id)
    fs.mkdirSync(d, { recursive: true })
    if (meta !== undefined) fs.writeFileSync(path.join(d, 'meta.json'), JSON.stringify(meta))
    return d
  }
  mk('good-recent', { id: 'good-recent', status: 'done', updatedAt: new Date().toISOString() })
  mk('good-old', { id: 'good-old', status: 'killed', updatedAt: '2020-01-01T00:00:00Z' })
  mk('junk-noid', { status: 'blocked' })            // meta present but no id, no dates
  mk('--json')                                       // dir with no meta.json at all

  // every dir is listable, each with a usable id (dir name fallback)
  assert.deepEqual(store.listMetas().map(m => m.id).sort(), ['--json', 'good-old', 'good-recent', 'junk-noid'])

  // generous retention keeps dated workers but still GC's undated junk
  const removed = worker.prune({ days: 3650 })
  assert.deepEqual(removed.sort(), ['--json', 'junk-noid'])
  assert.deepEqual(store.listMetas().map(m => m.id).sort(), ['good-old', 'good-recent'])

  // days:0 clears the rest
  worker.prune({ days: 0 })
  assert.deepEqual(store.listMetas(), [])
})
