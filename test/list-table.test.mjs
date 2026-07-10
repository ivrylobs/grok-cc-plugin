import test from 'node:test'
import assert from 'node:assert/strict'
import { fmtAge, renderTable } from '../bin/grokctl.mjs'

const NOW = Date.parse('2026-07-10T12:00:00Z')
const ago = ms => new Date(NOW - ms).toISOString()

test('fmtAge buckets (TZ-independent ones exact)', () => {
  assert.equal(fmtAge(ago(5_000), NOW), 'just now')      // < 60s
  assert.equal(fmtAge(ago(59_000), NOW), 'just now')
  assert.equal(fmtAge(ago(3 * 60_000), NOW), '3m')
  assert.equal(fmtAge(ago(59 * 60_000), NOW), '59m')
  assert.equal(fmtAge(ago(3 * 3600_000), NOW), '3h')
  assert.equal(fmtAge(ago(23 * 3600_000), NOW), '23h')
})

test('fmtAge is defensive: missing/invalid/future', () => {
  assert.equal(fmtAge('', NOW), '—')
  assert.equal(fmtAge(null, NOW), '—')
  assert.equal(fmtAge('not-a-date', NOW), '—')
  assert.equal(fmtAge(new Date(NOW + 5_000).toISOString(), NOW), 'just now')  // clock skew clamps
})

test('fmtAge older buckets have the right shape (TZ-safe)', () => {
  assert.match(fmtAge(ago(30 * 3600_000), NOW), /^yday \d{2}:\d{2}$/)         // ~yesterday
  assert.match(fmtAge(ago(10 * 86400_000), NOW), /^[A-Z][a-z]{2} \d{1,2}$/)   // this year: "Jul 9"
  assert.equal(fmtAge('2024-01-02T00:00:00Z', NOW), '2024-01-02')             // prior year: ISO date
})

test('renderTable ranks attention above live above terminal', () => {
  const rows = renderTable([
    { id: 'w-run', status: 'running', updatedAt: ago(60_000), task: 'runs' },
    { id: 'w-block', status: 'blocked', updatedAt: ago(3600_000), task: 'waits on you' },
    { id: 'w-done', status: 'done', updatedAt: ago(10_000), task: 'finished' },
  ], { all: true }).split('\n').filter(l => /^\w/.test(l))   // data rows (skip header/divider)
  // blocked (attention) first, then running (live), then done (terminal) —
  // even though done was updated most recently.
  assert.match(rows[1] ?? rows[0], /w-block/)
  const order = renderTable([
    { id: 'w-run', status: 'running', updatedAt: ago(60_000) },
    { id: 'w-block', status: 'blocked', updatedAt: ago(3600_000) },
    { id: 'w-done', status: 'done', updatedAt: ago(10_000) },
  ], { all: true })
  assert.ok(order.indexOf('w-block') < order.indexOf('w-run'), 'blocked before running')
  assert.ok(order.indexOf('w-run') < order.indexOf('w-done'), 'running before done')
})

test('renderTable skips metas with no id; empty -> (no workers)', () => {
  assert.equal(renderTable([{ status: 'done' }, { id: null }]), '(no workers)')
  assert.equal(renderTable([]), '(no workers)')
  const t = renderTable([{ id: 'real', status: 'done' }, { status: 'killed' }])
  assert.ok(t.includes('real'))
  assert.ok(!/^killed/m.test(t), 'the no-id killed meta is skipped, not rendered')
})

test('renderTable collapses history to 8 + footer; --all shows everything', () => {
  const many = Array.from({ length: 20 }, (_, i) => ({
    id: `w${i}`, status: i % 2 ? 'killed' : 'done', updatedAt: ago((i + 1) * 3600_000),
  }))
  const def = renderTable(many)
  assert.match(def, /\+ 12 older \([^)]*\) — grokctl list --table --all/)   // 20 - 8 shown
  const shown = def.split('\n').filter(l => /^(done|killed)/.test(l)).length
  assert.equal(shown, 8)
  const all = renderTable(many, { all: true })
  assert.ok(!all.includes('older —') && !/\+ \d+ older/.test(all), 'no footer under --all')
  assert.equal(all.split('\n').filter(l => /^(done|killed)/.test(l)).length, 20)
})
