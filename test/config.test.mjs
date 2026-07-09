import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

process.env.GROK_CC_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'gcc-cfg-'))
delete process.env.GROK_CC_MODEL
delete process.env.GROK_CC_EFFORT
const { resolveModelEffort, readConfig, writeConfig, EFFORTS } = await import('../lib/config.mjs')

test('no config -> nulls (grok default)', () => {
  assert.deepEqual(resolveModelEffort(), { model: null, effort: null })
})

test('config.json supplies defaults', () => {
  writeConfig({ model: 'grok-composer-2.5-fast', effort: 'low' })
  assert.deepEqual(resolveModelEffort(), { model: 'grok-composer-2.5-fast', effort: 'low' })
  assert.equal(readConfig().model, 'grok-composer-2.5-fast')
})

test('env overrides config.json', () => {
  process.env.GROK_CC_MODEL = 'grok-4.5'
  process.env.GROK_CC_EFFORT = 'high'
  assert.deepEqual(resolveModelEffort(), { model: 'grok-4.5', effort: 'high' })
})

test('per-spawn flag overrides env and config', () => {
  const r = resolveModelEffort({ model: 'grok-composer-2.5-fast', effort: 'medium' })
  assert.deepEqual(r, { model: 'grok-composer-2.5-fast', effort: 'medium' })
  delete process.env.GROK_CC_MODEL
  delete process.env.GROK_CC_EFFORT
})

test('writeConfig with null clears a key', () => {
  writeConfig({ model: null })
  assert.equal(readConfig().model, undefined)
  assert.equal(readConfig().effort, 'low')   // untouched
})

test('invalid effort throws', () => {
  assert.throws(() => resolveModelEffort({ effort: 'ultra' }), /invalid effort/)
  assert.deepEqual(EFFORTS, ['low', 'medium', 'high'])
})
