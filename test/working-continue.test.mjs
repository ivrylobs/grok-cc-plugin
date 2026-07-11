import test from 'node:test'
import assert from 'node:assert/strict'
import { shouldAutoContinueWorking } from '../lib/worker.mjs'

// R2 / F2: a STATUS: WORKING checkpoint auto-continues (run through to DONE) under
// advise/leash/read, but never under gate, and never past the runaway cap.
test('shouldAutoContinueWorking: grip + cap gate', () => {
  for (const grip of ['advise', 'leash', 'read']) {
    assert.equal(shouldAutoContinueWorking({ grip }), true, grip)
    assert.equal(shouldAutoContinueWorking({ grip, workingRuns: 3 }), true, grip)
  }
  // gate steers between turns — never auto-continue
  assert.equal(shouldAutoContinueWorking({ grip: 'gate' }), false)
  assert.equal(shouldAutoContinueWorking({ grip: 'gate', workingRuns: 0 }), false)
  // runaway cap: stop auto-continuing once too many WORKING turns have chained
  assert.equal(shouldAutoContinueWorking({ grip: 'advise', workingRuns: 25 }), false)
  assert.equal(shouldAutoContinueWorking({ grip: 'advise', workingRuns: 99 }), false)
  // defensive
  assert.equal(shouldAutoContinueWorking(null), false)
})
