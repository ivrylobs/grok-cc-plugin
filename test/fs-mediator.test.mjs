import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

process.env.GROK_CC_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'gcc-fsm-'))
const store = await import('../lib/store.mjs')
const { containedPath, makeFsHandlers, applyStage } = await import('../lib/fs-mediator.mjs')

const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'gcc-ws-'))

test('containedPath accepts inside, rejects escape and symlink escape', () => {
  assert.equal(containedPath(ws, 'a/b.txt'), path.join(fs.realpathSync(ws), 'a/b.txt'))
  assert.throws(() => containedPath(ws, '../outside.txt'), e => e.code === 'PATH_ESCAPE')
  assert.throws(() => containedPath(ws, '/etc/passwd'), e => e.code === 'PATH_ESCAPE')
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'gcc-out-'))
  fs.symlinkSync(outside, path.join(ws, 'sneaky'))
  assert.throws(() => containedPath(ws, 'sneaky/x.txt'), e => e.code === 'PATH_ESCAPE')
})

test('advise grip: write lands in workspace and audits', async () => {
  const meta = { id: 'wfs1', cwd: ws, grip: 'advise' }
  const h = makeFsHandlers(meta)
  await h.writeTextFile({ path: path.join(ws, 'out.txt'), content: 'hi' })
  assert.equal(fs.readFileSync(path.join(ws, 'out.txt'), 'utf8'), 'hi')
  const { content } = await h.readTextFile({ path: path.join(ws, 'out.txt') })
  assert.equal(content, 'hi')
  const audit = store.readJsonl(path.join(store.workerDir('wfs1'), 'fs-audit.jsonl'))
  assert.deepEqual(audit.map(a => a.op), ['write', 'read'])
  assert.equal(audit[0].bytes, 2)
  assert.match(audit[0].sha256, /^[a-f0-9]{64}$/)
})

test('escape attempt is audited as denied and throws', async () => {
  const h = makeFsHandlers({ id: 'wfs2', cwd: ws, grip: 'advise' })
  await assert.rejects(h.writeTextFile({ path: '/tmp/evil.txt', content: 'x' }), e => e.code === 'PATH_ESCAPE')
  const audit = store.readJsonl(path.join(store.workerDir('wfs2'), 'fs-audit.jsonl'))
  assert.equal(audit[0].op, 'denied')
})

test('gate grip: writes stage, applyStage applies', async () => {
  const meta = { id: 'wfs3', cwd: ws, grip: 'gate' }
  const h = makeFsHandlers(meta)
  await h.writeTextFile({ path: path.join(ws, 'sub/gated.txt'), content: 'staged!' })
  assert.ok(!fs.existsSync(path.join(ws, 'sub/gated.txt')))
  assert.equal(fs.readFileSync(path.join(store.workerDir('wfs3'), 'staged/sub/gated.txt'), 'utf8'), 'staged!')
  const applied = applyStage('wfs3')
  assert.deepEqual(applied, ['sub/gated.txt'])
  assert.equal(fs.readFileSync(path.join(ws, 'sub/gated.txt'), 'utf8'), 'staged!')
})
