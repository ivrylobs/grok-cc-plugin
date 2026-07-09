import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

process.env.GROK_CC_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'gcc-store-'))
const store = await import('../lib/store.mjs')

test('ROOT honors GROK_CC_HOME and sockPath is under it', () => {
  assert.equal(store.ROOT, process.env.GROK_CC_HOME)
  assert.equal(store.sockPath(), path.join(store.ROOT, 'broker.sock'))
})

test('newId returns unique w-prefixed ids', () => {
  const a = store.newId(), b = store.newId()
  assert.match(a, /^w[a-z0-9]+-[a-z0-9]{4}$/)
  assert.notEqual(a, b)
})

test('workerDir creates directory', () => {
  const d = store.workerDir('w1')
  assert.equal(d, path.join(store.ROOT, 'workers', 'w1'))
  assert.ok(fs.existsSync(d))
})

test('appendJsonl/readJsonl roundtrip, missing file -> [], bad lines skipped', () => {
  const f = path.join(store.ROOT, 'x', 'log.jsonl')
  assert.deepEqual(store.readJsonl(f), [])
  store.appendJsonl(f, { a: 1 })
  store.appendJsonl(f, { b: 2 })
  fs.appendFileSync(f, 'not-json\n')
  assert.deepEqual(store.readJsonl(f), [{ a: 1 }, { b: 2 }])
})

test('writeMeta merges patches and stamps updatedAt; readMeta null when absent', () => {
  assert.equal(store.readMeta('nope'), null)
  const m1 = store.writeMeta('w2', { id: 'w2', status: 'starting' })
  assert.equal(m1.status, 'starting')
  const m2 = store.writeMeta('w2', { status: 'running' })
  assert.equal(m2.id, 'w2')
  assert.equal(m2.status, 'running')
  assert.ok(m2.updatedAt >= m1.updatedAt)
  assert.equal(store.readMeta('w2').status, 'running')
})

test('listMetas returns all metas', () => {
  store.writeMeta('w3', { id: 'w3' })
  const ids = store.listMetas().map(m => m.id).sort()
  assert.ok(ids.includes('w2') && ids.includes('w3'))
})
