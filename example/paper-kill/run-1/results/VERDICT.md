# Paper-kill run-1 — VERDICT

Problem P1 (AsyncTaskQueue). Pre-registration frozen in commit 2a43512; all 6 arm SHAs
frozen before scoring. Behavioral suite run once per tree. Design graded blind by a
3-model advisory panel (owner delegated grading; see "Grading authority" below).

## Verdict: KILL (provisional-fail) — advisory; owner co-sign pending

The Grok-4.5 **quality** thesis is **not proven at the pre-registered bar** on P1.
Ship the 0.3.0 throughput/reliability floor with **no quality claim**. The effect of the
Grok attack/duel was **real but sub-threshold** (see below) — this is "not proven at the
bar we set," not "Grok added nothing." A KILL on P1 is final for this grok-4.5 snapshot &
scope but reversible by future evidence (a harder problem, a suite covering deeper corners).

## The arms (frozen SHAs)

| Arm | What | src SHA | B()/100 |
|-----|------|---------|--------|
| S0a | solo Claude baseline 1 | cff685de | 100 |
| S0b | solo Claude baseline 2 | b68da1ad | 100 |
| S1a′| Claude self-attack + fix (behavioral only) | 0f08e442 | 100 |
| S2′ | Grok attack (8 findings) → Claude fix | 4cb96309 | 100 |
| DC  | duel: Grok attacks S0b → Claude fix (Claude's tree) | 4e4a1c63 | 100 |
| DG  | duel: Claude attacks G → Grok fix (Grok's tree) | 9968189a | 100 |

## Axis 1 — behavioral B(): SATURATED

All six trees = **100/100**, identical per-check breakdown. Suite verified legitimate
(each check earns 0 on throw/hang). Every bug both models found (re-entrant-join hang,
zombie-retry-after-cancel, task-after-pre-start-abort, shutdown-vs-backoff drain,
ctx.signal-abort-on-success) lives OUTSIDE the 22-check suite. Consequence:
- attackClears = [B(S2′)−B(S0a) ≥ 8] = [0 ≥ 8] = FALSE → attack tier cannot license.
- grokSpecific = [B(S2′)>B(S1a′)] = FALSE.
- duel can only license via the design axis (behavioral clause needs B(W) ≥ 108, impossible).

## Axis 2 — design D() (0–24), blind 3-model panel

Letter→arm (unsealed after grades locked): A=DC, B=S2′, C=S0a, D=S0b, E=DG.

| Arm | Grok | Fable | Claude | avg |
|-----|------|-------|--------|-----|
| DC  | 23 | 24 | 24 | 23.67 |
| S2′ | 21 | 24 | 24 | 23.00 |
| S0a | 15 | 22 | 22 | 19.67 |
| S0b | 18 | 22 | 22 | 20.67 |
| DG  | 15 | 12 | 17 | 14.67 |

Winner W (B tie → higher D): **DC** (Claude's duel tree). duelClears ⟺ D(W) ≥ D̄0 + 3
(N_D=3), D̄0 = mean(D(S0a),D(S0b)).

| Grade basis | D(W) | D̄0 | +3 bar | result | margin |
|-------------|------|-----|--------|--------|--------|
| Panel avg   | 23.67 | 20.17 | 23.17 | LICENSE | +0.50 |
| Fable (neutral) | 24 | 22.0 | 25.0 | **KILL** | −1.0 |
| Claude (arm)    | 24 | 22.0 | 25.0 | **KILL** | −1.0 |
| Grok (arm)      | 23 | 16.5 | 19.5 | LICENSE | +3.5 |

The panel-average LICENSE is razor-thin (0.5/24) and exists ONLY because Grok scores the
unguarded Claude baselines much lower than the other two graders (15/18 vs 22/22), pulling
D̄0 down. On the neutral non-arm grader (Fable) — the closest proxy to the protocol's
license-binding human grade — the winning duel tree beats baselines by only **+2**, BELOW
the 3-point noise floor. Same for Claude's own grid. The design uplift (the "settled-guard"
against zombie-resurrection, surfaced by Grok's attack and applied by Claude's fix) is real
and unanimous in DIRECTION, but its MAGNITUDE (~2 pts) is within the pre-registered noise
floor on the honest graders → not a distinguishable signal → KILL.

## Integrity checks (all clean)

- **No self-favoring.** Grok scored its OWN tree (DG) *below* the rival (DC 23 vs DG 15) —
  anti-self. Claude's DC>DG is corroborated by neutral Fable (DG even lower at 12), so it's
  not a Claude bias artifact.
- **Grok's own generated tree (DG) ranks 5-of-5, unanimously** across all three graders —
  a real anti-Grok signal on the GENERATION axis. (DG is not the winner, so it doesn't drive
  the verdict, but it's on the record: Grok's from-scratch solve was the weakest of five.)
- **Grading authority.** Pre-registration reserves a license-binding HUMAN grade; LLM grades
  are advisory only. Owner delegated to a 3-model blind panel (Fable neutral author + Claude
  & Grok arms). This verdict is therefore ADVISORY; owner co-sign (or own grade) makes it
  binding. Blindness was best-effort/same-day.

## Interventions (off the license bar, on the record)

- G solve: +2 approvals (leash). S2′ attack: ~13 approvals (advise, probe-heavy).
  DC attack: ~22 approvals (advise, S0b was a tougher target). DG fix: +1 (leash).
  Grok grade: 0 (read grip). Claude/Fable arms & graders: 0 (subagents).
- 1 human touch total that actually blocked progress: the `grok login` re-auth at start.

## What KILL means here

- Ship 0.3.0 floor (throughput + reliability). No quality claim, no duel machinery (0.4.0
  quality surface stays unbuilt — the whole point of the paper-kill: don't build before proof).
- Methodological lesson for any future re-test: the behavioral suite saturated (solo Claude =
  reference quality on covered cases), so there was no behavioral headroom for Grok to show
  value; the found bugs were all outside suite coverage. A future test needs either a harder
  problem (solo Claude < 100) or a suite that reaches the deeper reentrancy corners.
- Replication clause is moot: no LICENSE to replicate. P2 (timezone/RRULE/DST) not needed
  unless the thesis is re-opened with a redesigned, non-saturating referee.
