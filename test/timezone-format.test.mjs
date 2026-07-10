import test from 'node:test'
import assert from 'node:assert/strict'
import { fmtLocal } from '../bin/grokctl.mjs'

// 0008: a stored UTC ISO string must NOT be rendered as if the digits were local
// time (the bug: 13:06:37Z shown as "13:06" local). fmtLocal shifts by the host
// offset and always states that offset explicitly.
test('fmtLocal renders UTC as local wall-clock with an explicit offset', () => {
  const iso = '2026-07-10T13:06:37.639Z'
  const s = fmtLocal(iso)

  // offset suffix is always present and well-formed: ` +HHMM` / ` -HHMM`
  const m = /([+-])(\d{2})(\d{2})$/.exec(s)
  assert.ok(m, `expected an offset suffix, got: ${s}`)

  // the printed hour equals the UTC hour shifted by the host's real offset —
  // i.e. it agrees with the platform's own conversion of this instant.
  const d = new Date(iso)
  const pad = n => String(n).padStart(2, '0')
  const expected = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} `
    + `${pad(d.getHours())}:${pad(d.getMinutes())}`
  assert.ok(s.startsWith(expected), `expected "${expected}…", got "${s}"`)
})

test('fmtLocal is defensive on empty / bad input', () => {
  assert.equal(fmtLocal(''), '—')
  assert.equal(fmtLocal(null), '—')
  assert.equal(fmtLocal('not-a-date'), 'not-a-date')
})
