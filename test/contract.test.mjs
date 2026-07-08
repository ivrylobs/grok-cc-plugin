import test from 'node:test'
import assert from 'node:assert/strict'
const { parseStatus } = await import('../lib/contract.mjs')

test('DONE with fenced RESULT json', () => {
  const t = 'work done\nRESULT:\n```json\n{"summary":"fixed","files_changed":["a.js"],"verification":"tests pass"}\n```\nSTATUS: DONE'
  const p = parseStatus(t)
  assert.equal(p.status, 'DONE')
  assert.equal(p.result.summary, 'fixed')
  assert.deepEqual(p.result.files_changed, ['a.js'])
})

test('NEED_INPUT captures question', () => {
  const p = parseStatus('I checked both.\nQUESTION: which auth provider should I target?\nSTATUS: NEED_INPUT')
  assert.equal(p.status, 'NEED_INPUT')
  assert.match(p.question, /auth provider/)
})

test('WORKING and BLOCKED pass through', () => {
  assert.equal(parseStatus('plan: do X then Y\nSTATUS: WORKING').status, 'WORKING')
  assert.equal(parseStatus('cannot proceed\nSTATUS: BLOCKED').status, 'BLOCKED')
})

test('last STATUS line wins', () => {
  const p = parseStatus('STATUS: WORKING\nmore text\nSTATUS: DONE')
  assert.equal(p.status, 'DONE')
})

test('missing STATUS degrades to DONE with raw summary', () => {
  const p = parseStatus('just some prose with no protocol')
  assert.equal(p.status, 'DONE')
  assert.equal(p.result.summary, 'just some prose with no protocol')
})

test('malformed RESULT json on DONE degrades to raw summary', () => {
  const t = 'RESULT:\n```json\n{broken\n```\nSTATUS: DONE'
  const p = parseStatus(t)
  assert.equal(p.status, 'DONE')
  assert.equal(p.result.summary, t)
})
