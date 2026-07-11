import test from 'node:test'
import assert from 'node:assert/strict'
import { isActionable } from '../lib/worker.mjs'

// R3 / F3: `wait --actionable` wakes only when a worker needs the captain or has a
// terminal result — never on a busy turn or an un-escalated `paused` checkpoint.
test('isActionable: the F3 filter', () => {
  // busy — not actionable
  assert.equal(isActionable({ status: 'starting' }), false)
  assert.equal(isActionable({ status: 'running' }), false)
  // an un-escalated checkpoint is optional steering, not a summons
  assert.equal(isActionable({ status: 'paused' }), false)
  assert.equal(isActionable({ status: 'paused', pauseEscalated: false }), false)
  // R1's escalation IS a summons
  assert.equal(isActionable({ status: 'paused', pauseEscalated: true }), true)
  // needs the captain
  assert.equal(isActionable({ status: 'advising' }), true)
  assert.equal(isActionable({ status: 'need_input' }), true)
  assert.equal(isActionable({ status: 'blocked' }), true)
  // terminal results worth waking for
  for (const s of ['done', 'dead', 'timeout', 'killed']) assert.equal(isActionable({ status: s }), true, s)
  // defensive
  assert.equal(isActionable(null), false)
  assert.equal(isActionable(undefined), false)
})
