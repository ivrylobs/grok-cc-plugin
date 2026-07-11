import test from 'node:test'
import assert from 'node:assert/strict'
import { buildBrief } from '../lib/worker.mjs'

// R8 / A3: deviation must be a blocking NEED_INPUT, and an acceptance command makes DONE
// objectively checkable.
test('buildBrief always blocks on deviation', () => {
  const b = buildBrief('do the thing')
  assert.match(b, /do the thing/)
  assert.match(b, /DEVIATION IS BLOCKING/)
  assert.match(b, /trade-off shipped without approval is a defect/)
  assert.doesNotMatch(b, /ACCEPTANCE/)          // none unless supplied
})

test('buildBrief injects acceptance criteria and the DONE-on-red rule', () => {
  const b = buildBrief('build X', 'node --test test/x.test.mjs')
  assert.match(b, /ACCEPTANCE \(STATUS: DONE is INVALID until this passes\)/)
  assert.match(b, /node --test test\/x\.test\.mjs/)
  assert.match(b, /Never DONE on red/)
})
