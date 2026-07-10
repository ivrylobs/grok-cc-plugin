/**
 * Failing tests that lock the intended `read` grip (read-only FS + advise shell allow-list).
 *
 * Expected failures against today's code (no `read` grip yet):
 *   - decideToolCall('read', …) falls through to gate → always 'ask'
 *   - makeFsHandlers({ grip: 'read' }) writeTextFile still writes in place (no reject)
 *
 * Cases that already pass (advise regression, readTextFile under any grip) still assert
 * intended post-implementation behavior. Do not weaken assertions to make this green
 * before the captain lands the grip.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { tmpHome } from './helpers.mjs'

const { decideToolCall } = await import('../lib/policy.mjs')

const exec = cmd => ({ kind: 'execute', rawInput: { command: cmd } })

// ─── A) decideToolCall('read', …) ───────────────────────────────────────────

test('read allows kind:read', () => {
  assert.equal(decideToolCall('read', { kind: 'read' }), 'allow')
})

test('read asks on kind:write', () => {
  assert.equal(decideToolCall('read', { kind: 'write' }), 'ask')
})

test('read asks on kind:edit', () => {
  assert.equal(decideToolCall('read', { kind: 'edit' }), 'ask')
})

test('read allows read-only shell (same allow-list as advise)', () => {
  assert.equal(decideToolCall('read', exec('ls -la')), 'allow', 'ls -la')
  assert.equal(decideToolCall('read', exec('rg -n foo src/')), 'allow', 'rg -n foo src/')
})

test('read asks on mutating shell', () => {
  assert.equal(decideToolCall('read', exec('rm -rf build')), 'ask', 'rm -rf build')
  assert.equal(decideToolCall('read', exec('echo hi > f')), 'ask', 'redirect write')
  assert.equal(decideToolCall('read', exec('git commit -am x')), 'ask', 'git commit')
})

test('read asks on unknown kind with no command', () => {
  assert.equal(decideToolCall('read', { kind: 'fetch' }), 'ask')
  assert.equal(decideToolCall('read', {}), 'ask')
})

test('advise write still allows (read grip must not change advise)', () => {
  assert.equal(decideToolCall('advise', { kind: 'write' }), 'allow')
})

// ─── B) makeFsHandlers under read grip ──────────────────────────────────────

test('read grip: readTextFile works; writeTextFile rejects without stage or disk write', async () => {
  tmpHome()
  const store = await import('../lib/store.mjs')
  const { makeFsHandlers } = await import('../lib/fs-mediator.mjs')

  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'gcc-read-ws-'))
  const existing = path.join(cwd, 'existing.txt')
  fs.writeFileSync(existing, 'hello-read', 'utf8')

  const id = store.newId()
  const h = makeFsHandlers({ id, cwd, grip: 'read' })

  // Reads still work under read.
  const { content } = await h.readTextFile({ path: existing })
  assert.equal(content, 'hello-read')

  // Writes must reject — not write in place, not stage.
  const target = path.join(cwd, 'new-under-read.txt')
  await assert.rejects(
    () => h.writeTextFile({ path: target, content: 'must-not-land' }),
    'read grip writeTextFile must reject',
  )
  assert.ok(!fs.existsSync(target), 'target must not exist on disk after reject')
  const stagedRoot = path.join(store.workerDir(id), 'staged')
  assert.ok(
    !fs.existsSync(stagedRoot) || fs.readdirSync(stagedRoot).length === 0,
    'read must not stage; staged/ must be empty or absent',
  )
})

test('contrast: gate stages write; advise writes in place', async () => {
  tmpHome()
  const store = await import('../lib/store.mjs')
  const { makeFsHandlers } = await import('../lib/fs-mediator.mjs')

  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'gcc-read-contrast-'))

  // gate: write stages, does not land in cwd
  const gateId = store.newId()
  const gateH = makeFsHandlers({ id: gateId, cwd, grip: 'gate' })
  const gated = path.join(cwd, 'gated.txt')
  await gateH.writeTextFile({ path: gated, content: 'staged!' })
  assert.ok(!fs.existsSync(gated), 'gate must not write in place')
  assert.equal(
    fs.readFileSync(path.join(store.workerDir(gateId), 'staged/gated.txt'), 'utf8'),
    'staged!',
  )

  // advise: write lands in place
  const adviseId = store.newId()
  const adviseH = makeFsHandlers({ id: adviseId, cwd, grip: 'advise' })
  const advised = path.join(cwd, 'advised.txt')
  await adviseH.writeTextFile({ path: advised, content: 'in-place' })
  assert.equal(fs.readFileSync(advised, 'utf8'), 'in-place')
})
