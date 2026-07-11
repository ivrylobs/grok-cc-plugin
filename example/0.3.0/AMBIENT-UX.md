# Ambient vs command — the UX spine (3-model convergence)

Owner's vision: Claude Code is *just* the entry point + interactive channel; behind it,
Claude + Grok work autonomously **without the human typing `/grok`**. Question: strong
autonomous workflow (no commands) or keep commands + general chat?

Claude, Grok, and Fable answered independently. They converged. This is the conclusion.

## The one correction the owner needs

You can delete the command from your **fingers**. You cannot delete the **consent
decision** for 2× spend — you can only *relocate* it: from a per-invocation typed command
to a **one-time budget policy** + rare one-tap confirmations. Zero `/grok` typing is
achievable. "Silently spend 2×, never a setting, never asked" is the only version that
isn't — it produces bill-shock that breaks the vision from the other side.

## The shape: a tiered ambient ladder (the ladder IS the product)

Not "duel, invoked by a command." The product is *turn it on → Claude gains a co-worker*.
Split by **cost tier**, not by task:

| Tier | What | Cost | Trigger | Consent |
|------|------|------|---------|---------|
| **solo** | Claude alone | 1.0× | trivial / read-only / question / house-style greenfield | none |
| **attack** (cheap) | Grok red-teams Claude's finished artifact, read-grip, repro-gated, unreproduced discarded | ~1.3× | **ambient + silent** on any *nontrivial* artifact | pre-authorized once |
| **duel** (expensive) | parallel-blind solve + cross-attack + scripted court | ~2× | ambient *trigger*, never silent | standing budget policy OR one-tap |

- The **cheap tier is your invisible co-worker.** It catches the blind spots you *cannot
  ask for* — decorrelation means Claude can't detect its own blind spot, so a self-router
  can never predict when a second look is needed. Fix (Fable): don't make the router detect
  blindness; run the cheap tier *often enough* (always-attack-on-nontrivial) that blindness
  gets caught anyway. The router's hard problem evaporates.
- **Commands survive as the manual override + power-user escape hatch**, never the front door.

## The router: cheap fail-closed rule-stack, NOT Claude's free-text judgment

- Claude-as-router is a new `min()` bottleneck: optimistic about hardness (over-fires),
  is the house-style author (under-fires on the concurrency/edge tasks where a peer pays).
- Build it as a rule-stack on **observable** signals: token-count vs window (over-context),
  is-it-hexagonal (house-style), concurrency/security keywords, blast-radius (file/pkg count),
  does a test suite even exist (no suite → can't adjudicate → no auto-duel). LLM only
  *advises* a tier; it cannot *authorize spend*.
- **Asymmetric failure design:** false-positive (duel when solo wins) = bounded ~1× waste,
  visible. False-negative (solo when peer would catch a bug) = unbounded, invisible. So bias
  the router to let the **cheap tier** absorb false-negatives, and **never silently commit
  the 2× tier**. Worst silent mistake is then capped at ~1.3×. That single rule is what stops
  the router from being load-bearing.
- **The router's rules come OUT of the paper-kill** — per-problem-type regime wins ARE the
  routing table. So the router cannot be built before the experiment. Plus: shadow-duel a
  small random % of solo-routed tasks as the router's standing kill experiment.

## Non-negotiable build rules (all three)

1. **Duel stays the primitive; ambient is only a trigger+consent layer.** Do not invent a
   third "just work together" mode.
2. **The hidden path must be parallel-blind + scripted court — NEVER background Claude↔Grok
   chat.** Chat = bidirectional serial handoff = `min()` twice = the P1 regression, now
   *invisible* (no slow-chatter tripwire the human would notice). Harness test **fails if the
   ambient path does more than one round-trip between the models.**
3. **Ambient attack is async/non-blocking:** Claude returns its answer immediately; findings
   arrive as a follow-up ("Grok found 2, fixed 1, flagging 1"). Preserves the interactive feel.
4. **Mode legibility (Grok):** one-line footer `mode=solo|attack|duel  cost≈1.0×|1.3×|2.1×`.
   Without it, a regime-mismatch quality dip gets blamed on "the plugin," and it gets disabled.
5. **Ambient recruit defaults to attack/read, not work/write (Grok)** — else you silently
   re-ship A1 (quality claims via min-path delegation).
6. **"Claude recruits Grok" ≠ peerage (Grok).** Triggers must be scripted/policy, not Claude's
   discretion, or it's captaincy with a softer UI — against the vision.

## Build order (unchanged, one addition)

F1–F4 now → null-product PRD → corrected S3 paper-kill (**now also emits the router's routing
table**) → then build the tiered ambient ladder with duel as its top rung. Ambient is a
*distribution* decision on top of a still-unproven quality thesis — shipping ambient-duel
before the kill experiment industrializes a hypothesis that already failed once.
