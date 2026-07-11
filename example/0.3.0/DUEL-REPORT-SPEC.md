# Duel report spec — the receipt for every 2× purchase

Designed BEFORE the court, because the report's shape drives the court's data model
(Fable, FLAWS §E product-gap #1). A duel that charges 2× and says "trust me, B won" is a
black box that dies commercially regardless of whether it wins statistically. The report is
the single user-facing value moment of the expensive tier — it must let a human see *why*.

## Rule

Every completed duel emits exactly one report (JSON + a rendered human view). No report → the
duel is not "done", it's a silent charge. The court writes the report as it adjudicates, so
the data model below IS the court's output contract.

## Schema (`duel-report@1`)

```json
{
  "schema": "duel-report@1",
  "duelId": "d<...>",
  "task": "<the frozen problem statement P (or a ref to it)>",
  "createdAt": "<ISO>",
  "arms": [
    { "arm": "A", "model": "claude-...",  "worktree": "<sha>", "cost": { "tokens": 0, "usd": 0.0 }, "wallClockMs": 0 },
    { "arm": "B", "model": "grok-4.5",    "worktree": "<sha>", "cost": { "tokens": 0, "usd": 0.0 }, "wallClockMs": 0 }
  ],
  "court": {
    "version": "court@<pinned>",              // S-7: the court version is pinned in every report
    "sBeh": {                                  // executable behavioral suite, per arm
      "command": "<test command>",
      "A": { "passed": 0, "failed": 0, "failing": ["<test> — repro cmd"] },
      "B": { "passed": 0, "failed": 0, "failing": [] }
    },
    "sArch": {                                 // conformance to the pre-frozen contract (NOT open-form taste)
      "contractRef": "<path/sha of the frozen contract>",
      "A": { "conforms": true,  "violations": [] },
      "B": { "conforms": false, "violations": ["domain imports adapter (contract §2)"] }
    }
  },
  "decision": {
    "winner": "A",                             // whole-tree winner (no cherry-pick in 0.3.0)
    "basis": "sBeh: A 33/33 vs B 31/33; sArch: both conform",
    "integration": { "applied": true, "nonRegression": "green", "retries": 0 }
  },
  "findings": [                                 // typed Findings (R6) surfaced during cross-attack
    { "id": "f<..>", "class": "REPRO", "title": "double-decrement under concurrent dispense",
      "status": "reproduced", "against": "B", "by": "A",
      "repro": { "command": "node --test x", "expected": "stock 9", "actual": "stock 8" } },
    { "id": "f<..>", "class": "JUDGMENT", "title": "anemic domain", "status": "accepted",
      "against": "A", "by": "B", "designDelta": "...", "counterfactual": "..." }
  ],
  "discarded": [                               // shown, not hidden: silent truncation reads as "clean"
    { "id": "f<..>", "class": "REPRO", "title": "flaky?", "status": "discarded", "reason": "did not reproduce" }
  ],
  "exchange": { "proseHops": 0 },              // exchange-law proof: MUST be 0 (see EXCHANGE-LAW)
  "totalCost": { "tokens": 0, "usd": 0.0, "multiplier": 2.0 }
}
```

## Human-rendered view (what the developer reads)

```
DUEL d3f8  ·  "Prescription fulfillment service"  ·  2.1×  ·  4m12s
  winner: A (claude)   basis: sBeh A 33/33 vs B 31/33; both conform to contract
  ✗ B failed 2 behavioral tests:
      - concurrent dispense double-decrements stock   (node --test stock.test.mjs)
  findings folded in:
      ✓ REPRO  double-decrement under concurrent dispense   (from A, reproduced)
      ✓ JUDGE  anemic domain → push logic into aggregate     (from B, accepted)
  discarded: 1 (flaky? — did not reproduce)
  exchange: 0 prose hops (clean)   cost: A $0.31 / B $0.28
```

## Non-negotiables the report enforces

1. **`exchange.proseHops` must be 0** — a non-zero value means the duel degraded into
   Claude↔Grok chat (the invisible min() regression). The report surfaces it; the guard fails it.
2. **`court.version` is pinned** — a buggy court is a false license forever (S-7); the report
   records which court judged.
3. **Discarded findings are shown, not dropped** — "clean" must mean "checked", not "hidden".
4. **Per-arm cost + multiplier are explicit** — the receipt justifies the 2× the user consented to.
