// Exchange law (the chat guard). The quality path (duel / cross-attack) must NEVER let one
// model's free-text turn content become another model's input — that is bidirectional serial
// handoff, which composes by min() twice: the exact P1 regression, now invisible because
// there's no slow chatter for a human to notice. So the ONLY things that may cross between
// arms are structured, verifiable references. This module is the enforceable definition; the
// duel orchestrator MUST route every inter-arm payload through assertExchangeLegal(), and the
// duel report records proseHops (attempts blocked here) — which must be 0 on a clean duel.
//
// See example/0.3.0/EXCHANGE-LAW.md for the spec and rationale.

// The allowed payloads, each a structured reference — not a message:
//  problem — the frozen problem statement P (bytes or a ref); identical to both arms.
//  tree    — a finished candidate as a git object (sha); the peer reads the ARTIFACT.
//  finding — a typed Finding by id (R6): repro-gated, self-proving, not prose.
//  court   — the adjudicator script's structured I/O.
export const ALLOWED_KINDS = ['problem', 'tree', 'finding', 'court']

// Free-text carriers: if a payload has any of these, it is a model talking, not a reference.
const PROSE_FIELDS = ['text', 'prose', 'message', 'reasoning', 'transcript', 'note']

/**
 * Assert one inter-arm payload is a legal structured exchange. Returns its kind, or throws.
 * A bare string, or an object carrying a free-text field, is a chat hop → forbidden.
 * @param {{kind?: string}} payload
 * @returns {string} the legal kind
 */
export function assertExchangeLegal(payload) {
  if (typeof payload === 'string') {
    throw new Error('exchange forbidden: a raw string is model prose, not a structured reference')
  }
  if (!payload || typeof payload !== 'object') {
    throw new Error('exchange forbidden: payload must be a structured reference {kind, …}')
  }
  if (!ALLOWED_KINDS.includes(payload.kind)) {
    throw new Error(`exchange forbidden: kind must be one of ${ALLOWED_KINDS.join('|')} (got ${JSON.stringify(payload.kind)})`)
  }
  const leaked = PROSE_FIELDS.find(f => typeof payload[f] === 'string' && payload[f].trim().length > 0)
  if (leaked) {
    throw new Error(`exchange forbidden: a '${payload.kind}' reference carries free text in '${leaked}' — pass a ref, not prose`)
  }
  return payload.kind
}

/**
 * A hop counter for a duel. The orchestrator wraps each inter-arm pass in .pass(): a legal
 * structured payload goes through; an illegal one is COUNTED (proseHops++) and rethrown, so
 * the duel fails closed AND the report can show the breach. proseHops must be 0 on a clean duel.
 */
export function makeExchangeLog() {
  let proseHops = 0
  return {
    pass(payload) {
      try { return assertExchangeLegal(payload) }
      catch (e) { proseHops++; throw e }
    },
    get proseHops() { return proseHops },
  }
}
