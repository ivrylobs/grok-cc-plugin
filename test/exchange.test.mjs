import test from 'node:test'
import assert from 'node:assert/strict'
import { assertExchangeLegal, makeExchangeLog, ALLOWED_KINDS } from '../lib/exchange.mjs'

// The chat guard: only structured references cross between duel arms; prose is a min() hop.
test('assertExchangeLegal: structured refs pass, prose is forbidden', () => {
  assert.equal(assertExchangeLegal({ kind: 'problem', ref: 'P.md' }), 'problem')
  assert.equal(assertExchangeLegal({ kind: 'tree', sha: 'abc123' }), 'tree')
  assert.equal(assertExchangeLegal({ kind: 'finding', id: 'f9' }), 'finding')
  assert.equal(assertExchangeLegal({ kind: 'court', result: {} }), 'court')

  // a raw string is model prose
  assert.throws(() => assertExchangeLegal('grok says the design is wrong because…'), /raw string is model prose/)
  // an unknown kind
  assert.throws(() => assertExchangeLegal({ kind: 'advice' }), /kind must be one of/)
  // a legal kind that smuggles free text
  assert.throws(() => assertExchangeLegal({ kind: 'finding', id: 'f9', reasoning: 'here is my full argument…' }), /carries free text/)
  assert.throws(() => assertExchangeLegal({ kind: 'tree', sha: 'x', transcript: 'the other model said…' }), /free text/)
  // empty prose fields are fine (not a leak)
  assert.equal(assertExchangeLegal({ kind: 'tree', sha: 'x', note: '' }), 'tree')
  assert.deepEqual(ALLOWED_KINDS, ['problem', 'tree', 'finding', 'court'])
})

test('makeExchangeLog counts blocked prose hops and fails closed', () => {
  const log = makeExchangeLog()
  log.pass({ kind: 'tree', sha: 'a' })
  assert.equal(log.proseHops, 0)
  assert.throws(() => log.pass({ kind: 'finding', id: 'f', message: 'chat' }), /free text/)
  assert.throws(() => log.pass('raw prose'), /raw string/)
  assert.equal(log.proseHops, 2, 'every blocked attempt is counted for the report')
})
