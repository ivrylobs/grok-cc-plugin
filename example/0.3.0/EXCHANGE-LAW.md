# The exchange law — the chat guard

The single most important structural rule of the quality path, and the cheapest insurance in
the plan (Fable, FLAWS §E "keep"). Enforced by `lib/exchange.mjs`; proven by `test/exchange.test.mjs`.

## Why it exists

The benchmark proved collaboration *subtracted* because serial handoff / chat composes by
`min()`. The naive way to build "Claude and Grok work together autonomously" is a background
loop where the two models **chat** their way to an answer — which is bidirectional serial
handoff, `min()` twice, the exact P1 failure. Under ambient/autonomous operation this failure
becomes **invisible**: when it was a visible command, a min() implementation showed up as slow
chatter a human would notice; ambient removes that tripwire. So the no-dialogue rule is no
longer just a quality rule — it is the difference between an invisible win and an invisible
regression.

## The law

On the quality path (duel, cross-attack, counter), the ONLY things that may cross between the
two model arms are **structured, verifiable references** — never one model's free-text turn
content as another model's input, *including a captain pasting "Grok said…"*.

| Allowed (a reference) | Forbidden (a message) |
|-----------------------|-----------------------|
| `problem` — the frozen statement P (identical to both arms) | any raw string |
| `tree` — a finished candidate as a git sha (the peer reads the ARTIFACT) | a `tree`/`finding` ref that smuggles `text`/`prose`/`reasoning`/`transcript`/`note` |
| `finding` — a typed Finding id (R6): repro-gated, self-proving | one model's turn transcript |
| `court` — the adjudicator script's structured I/O | a summary of what the other model "thinks" |

Cross-attack is NOT a round-trip: model B reads model A's **tree** (an artifact), which is a
`tree` reference, not chat.

## Enforcement (in prod, not only tests)

- The duel orchestrator MUST route every inter-arm payload through
  `assertExchangeLegal(payload)` / `makeExchangeLog().pass(payload)`. A raw string or a
  prose-carrying object throws → the duel **fails closed**.
- `makeExchangeLog` counts blocked attempts as `proseHops`. The duel report records
  `exchange.proseHops`, which **must be 0** on a clean duel. A non-zero value is a visible
  breach in the receipt.
- Harness test asserts a fixture duel does 0 prose hops (the regression net).

## What this is NOT

- Not a limit on how the human talks to the plugin — the developer chats freely with Claude;
  the guard governs only the machine-to-machine quality path beneath.
- Not built into a duel yet — the duel is post-paper-kill (§8). This is the **contract** that
  path is required to call, shipped first so the duel cannot be built wrong.
