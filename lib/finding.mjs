// R6 / FLAWS A5: a first-class typed Finding. Attack-tier workers emit findings; the
// captain reproduces/judges them. The point is that "unreproduced REPRO findings are
// discarded" is a SYSTEM rule enforced here — not a wish in a skill file. Findings are
// files (append-only event log per worker; latest event per id wins).

import path from 'node:path'
import * as store from './store.mjs'

// Three classes, from the 0.3.0 finding schema:
//  REPRO    — a behavioral defect that ships WITH a reproduction (failing test / exact
//             command + expected-vs-actual). Self-proving: no trust in the reporter needed.
//  JUDGMENT — a design/architecture critique. Not test-shaped, so not repro-gated — but it
//             must carry a concrete design-delta AND a counterfactual (what to do instead),
//             or it is a vague nit and is rejected at creation.
//  GAP      — a divergence from a frozen spec/DESIGN: cite the spec point and the deviation.
export const CLASSES = ['REPRO', 'JUDGMENT', 'GAP']
export const STATUSES = ['proposed', 'reproduced', 'discarded', 'accepted', 'rejected']

// Legal status transitions. The REPRO gate lives here: a REPRO finding CANNOT reach
// `accepted` from `proposed` — it must be `reproduced` first (a human/captain ran the
// repro and saw it fail). JUDGMENT/GAP have no repro step, so they accept/reject directly.
const TRANSITIONS = {
  REPRO:    { proposed: ['reproduced', 'discarded'], reproduced: ['accepted', 'rejected'], accepted: [], rejected: [], discarded: [] },
  JUDGMENT: { proposed: ['accepted', 'rejected', 'discarded'], accepted: [], rejected: [], discarded: [] },
  GAP:      { proposed: ['accepted', 'rejected', 'discarded'], accepted: [], rejected: [], discarded: [] },
}

function nonEmpty(v) { return typeof v === 'string' && v.trim().length > 0 }

/**
 * Validate + normalize a raw finding into a stored shape. Throws on anything a
 * downstream consumer would have to guess about — the class gate is the product rule.
 */
export function validateFinding(input) {
  if (!input || typeof input !== 'object') throw new Error('finding must be an object')
  const { class: cls, title } = input
  if (!CLASSES.includes(cls)) throw new Error(`finding.class must be one of ${CLASSES.join('|')}`)
  if (!nonEmpty(title)) throw new Error('finding.title is required')

  const f = { class: cls, title: title.trim(), status: 'proposed' }
  if (cls === 'REPRO') {
    // A REPRO without a runnable reproduction is not a REPRO — it is an unverifiable claim.
    const repro = input.repro
    const ok = nonEmpty(repro?.command) || nonEmpty(repro?.testFile)
    if (!ok) throw new Error('REPRO finding requires repro.command or repro.testFile')
    f.repro = {
      command: repro.command?.trim() || null,
      testFile: repro.testFile?.trim() || null,
      expected: repro.expected ?? null,
      actual: repro.actual ?? null,
    }
  } else if (cls === 'JUDGMENT') {
    // A JUDGMENT with no counterfactual is a nit; the plan rejects it at the door.
    if (!nonEmpty(input.designDelta)) throw new Error('JUDGMENT finding requires designDelta')
    if (!nonEmpty(input.counterfactual)) throw new Error('JUDGMENT finding requires counterfactual (what to do instead)')
    f.designDelta = input.designDelta.trim()
    f.counterfactual = input.counterfactual.trim()
  } else { // GAP
    if (!nonEmpty(input.specRef)) throw new Error('GAP finding requires specRef')
    if (!nonEmpty(input.deviation)) throw new Error('GAP finding requires deviation')
    f.specRef = input.specRef.trim()
    f.deviation = input.deviation.trim()
  }
  if (nonEmpty(input.detail)) f.detail = input.detail.trim()
  return f
}

/** Is `to` a legal next status for this finding's class + current status? */
export function canTransition(finding, to) {
  if (!STATUSES.includes(to)) return false
  const table = TRANSITIONS[finding?.class]
  if (!table) return false
  return (table[finding.status] ?? []).includes(to)
}

const findingsFile = workerId => path.join(store.workerDir(workerId), 'findings.jsonl')

/** Append a validated finding for a worker. Returns the stored finding (with id). */
export function addFinding(workerId, input, now = new Date().toISOString()) {
  const f = validateFinding(input)
  f.id = store.newId().replace(/^w/, 'f')
  f.workerId = workerId
  f.createdAt = now
  f.updatedAt = now
  store.appendJsonl(findingsFile(workerId), f)
  return f
}

/** Latest event per finding id (the jsonl is an append-only history). */
export function listFindings(workerId) {
  const byId = new Map()
  for (const ev of store.readJsonl(findingsFile(workerId))) {
    if (ev?.id) byId.set(ev.id, ev)
  }
  return [...byId.values()]
}

/**
 * Move a finding to a new status, enforcing the class transition table (the REPRO gate).
 * Throws on an illegal transition rather than silently dropping the rule.
 */
export function transitionFinding(workerId, findingId, to, now = new Date().toISOString()) {
  const cur = listFindings(workerId).find(f => f.id === findingId)
  if (!cur) throw new Error(`no finding ${findingId} for worker ${workerId}`)
  if (!canTransition(cur, to)) {
    throw new Error(`illegal ${cur.class} transition ${cur.status} → ${to}` +
      (cur.class === 'REPRO' && cur.status === 'proposed' && to === 'accepted'
        ? ' (a REPRO must be reproduced before it can be accepted)' : ''))
  }
  const next = { ...cur, status: to, updatedAt: now }
  store.appendJsonl(findingsFile(workerId), next)
  return next
}

/**
 * The findings a consumer should act on: accepted, plus REPRO that reproduced.
 * Discarded/rejected are dropped; a still-`proposed` REPRO is NOT yet trustworthy.
 */
export function activeFindings(workerId) {
  return listFindings(workerId).filter(f =>
    f.status === 'accepted' || (f.class === 'REPRO' && f.status === 'reproduced'))
}
