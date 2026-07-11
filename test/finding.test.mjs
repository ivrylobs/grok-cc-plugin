import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { tmpHome } from './helpers.mjs'

const home = tmpHome()
const { validateFinding, canTransition, addFinding, listFindings, transitionFinding, activeFindings } = await import('../lib/finding.mjs')

test('validateFinding enforces class-specific fields', () => {
  assert.throws(() => validateFinding({ class: 'NOPE', title: 'x' }), /class must be/)
  assert.throws(() => validateFinding({ class: 'REPRO', title: '' }), /title is required/)
  // REPRO needs a runnable reproduction
  assert.throws(() => validateFinding({ class: 'REPRO', title: 'bug' }), /repro\.command or repro\.testFile/)
  assert.equal(validateFinding({ class: 'REPRO', title: 'bug', repro: { command: 'npm test' } }).status, 'proposed')
  // JUDGMENT needs a counterfactual, not just a complaint
  assert.throws(() => validateFinding({ class: 'JUDGMENT', title: 'ugly', designDelta: 'x' }), /counterfactual/)
  assert.ok(validateFinding({ class: 'JUDGMENT', title: 'coupling', designDelta: 'adapter leaks', counterfactual: 'introduce a port' }))
  // GAP needs spec + deviation
  assert.throws(() => validateFinding({ class: 'GAP', title: 'g', specRef: 'S3' }), /deviation/)
})

test('the REPRO gate: a proposed REPRO cannot jump straight to accepted', () => {
  const repro = { class: 'REPRO', title: 'double decrement', status: 'proposed' }
  assert.equal(canTransition(repro, 'accepted'), false)          // must reproduce first
  assert.equal(canTransition(repro, 'reproduced'), true)
  assert.equal(canTransition({ ...repro, status: 'reproduced' }, 'accepted'), true)
  // JUDGMENT/GAP have no repro step
  assert.equal(canTransition({ class: 'JUDGMENT', status: 'proposed' }, 'accepted'), true)
})

test('store round-trip + transitions + the active filter', () => {
  const wid = 'wfind1'
  const a = addFinding(wid, { class: 'REPRO', title: 'concurrency bug', repro: { command: 'node --test x', expected: 'stock 9', actual: 'stock 8' } })
  const b = addFinding(wid, { class: 'JUDGMENT', title: 'anemic domain', designDelta: 'logic in service', counterfactual: 'push into aggregate' })
  addFinding(wid, { class: 'REPRO', title: 'flaky', repro: { command: 'npm test' } })

  assert.equal(listFindings(wid).length, 3)
  assert.deepEqual(activeFindings(wid), [])                       // nothing acted on yet

  // illegal jump is refused
  assert.throws(() => transitionFinding(wid, a.id, 'accepted'), /reproduced before it can be accepted/)
  // legal path: reproduce → accept
  transitionFinding(wid, a.id, 'reproduced')
  transitionFinding(wid, a.id, 'accepted')
  transitionFinding(wid, b.id, 'accepted')

  const active = activeFindings(wid).map(f => f.title).sort()
  assert.deepEqual(active, ['anemic domain', 'concurrency bug'])  // the flaky REPRO stays proposed → excluded
})

test.after(() => fs.rmSync(home, { recursive: true, force: true }))
