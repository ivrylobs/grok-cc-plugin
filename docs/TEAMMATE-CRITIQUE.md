# Adversarial critique: Grok as Claude's default teammate

**Mode:** attack, not grade.  
**Target:** captain design positions P1–P5 for autonomous consult / second-opinion / debate.  
**Method:** every code claim is cited `file:line` from this repo as of the review date. Behaviors not read in source are not asserted.

---

## SECTION 1 — THE STRONGEST CASE THAT P3 IS WRONG

**P3 claims:** mandatory consults should be STRUCTURALLY triggered on observable artifacts (public interface / schema / migration touched, N+ files changed, new dependency). Judgment-triggered consults become opt-in extras.

**P3 is wrong as the primary primitive for a "default teammate."** Structural triggers optimize for the shape of *diffs*, not the shape of *decisions*. The product goal in the proposal is that Claude consults when a design commitment matters. Artifacts are a lagging, lossy proxy for that.

### 1. False-positive burn on trivial diffs

The structural predicates fire on path class and churn, not on irreversible consequence:

- Renaming a public export across six call sites is high file-count, low design risk. Trigger fires. Tokens and (under today's policy) human approvals burn on a mechanical rename.
- A one-line dependency bump in `package.json` is a "new dependency" trigger. Often a patch pin or lockfile churn. Same tax.
- A generated migration that only renames a column the captain already decided is *exactly* the artifact class P3 elevates — and *exactly* the moment the design is already fixed. You pay for a consult that can only rubber-stamp or bikeshed syntax.

False positives are not a tuning problem. They are what you get when the trigger language is "touched a migration file" instead of "chose to introduce a migration." The first is cheap to observe. The second is the thing that needed a second mind.

### 2. The most consequential decisions leave few or no artifacts

Choosing an abstraction, a service boundary, a consistency model, "event vs request," "sync vs async," "who owns this ID," "do we dual-write," are decisions that often:

- live entirely in the captain's context and a plan paragraph,
- touch zero files until long after commitment,
- or touch a single private helper that matches no "public interface / schema / migration" regex.

P2 already says self-assessed certainty is anti-correlated with the need to consult. P3 responds by switching the sensor from certainty to *files*. That does not fix the anti-correlation; it correlates consults with *implementation footprint*. Confident wrongness about architecture that has not yet been written produces **zero** structural signal. That is the failure mode that costs the most, and P3 systematically misses it.

### 3. Artifact-triggered consults arrive too late to inform the decision

A structural trigger on "diff touches X" necessarily runs **after** the captain has already:

- framed the problem,
- chosen a solution shape,
- and embodied that shape in tool calls / file contents.

By then the consult is a review of *output*, not co-thinking about *commitment*. Reviews can still catch bugs. They do not replace "should we do this at all?" — which is what a default teammate for design was sold as.

Worse: once code exists, agreement bias (P5's territory) and sunk-cost in the captain's context both push the synthesist to defend the artifact. A late consult is not a neutral second opinion; it is an invitation to litigate a decision already paid for in tokens and emotional commitment.

### 4. Structural triggers reintroduce judgment under another name

"N+ files," "public interface," "schema," "migration" are not free of judgment. Someone must define:

- what counts as public,
- what N is,
- whether lockfiles count,
- whether test fixtures that mirror schema count,
- whether generated code counts.

Those definitions will be wrong on some repos and right on others. Tuning them is perpetual product work. P3 presents them as objective; they are a policy language that will be gamed by the same confident captain (split one big change into quiet commits; put the abstraction in a private module first).

### 5. Interaction with this repo's real failure mode

This plugin's collaboration backlog shows that consult cost is dominated by **permission friction and silent parking**, not by missing path heuristics:

- chained read-only commands prompt ([0001](backlog/0001-advise-blocks-chained-readonly-commands.md)),
- common readers missing from the allow-list ([0002](backlog/0002-advise-allowlist-missing-readonly-heads.md)),
- captain cannot clear the gate ([0003](backlog/0003-parent-agent-cannot-answer-permissions.md)),
- parked worker returns `null` ([0004](backlog/0004-parked-worker-yields-no-partial-output.md)).

P3 multiplies *how often* those failures fire without fixing *whether* a consult can complete silently. Structural triggers without a working silent path are a tax amplifier, not a safety net.

### Verdict on P3

**P3 is wrong** for the stated goal (autonomous design teammate). Structural triggers are a reasonable *optional* safety net for a narrow class of irreversible implementation artifacts (real migrations, public API renames after the decision is already made), and even then they are late. They are the wrong mandatory primitive.

I could not defeat only this narrower claim: *if* the product is demoted from "co-think on design" to "second pair of eyes on certain write classes," structural triggers are the only hooks the harness can observe. That is not the proposal as written.

---

## SECTION 2 — ATTACK P4

**P4 claims:** autonomous consults must run READ-ONLY; any worker that writes stays manually gated; this keeps the veto gate intact while making the common case silent.

### 2.1 What `decideToolCall('advise', …)` actually does for writes

From `lib/policy.mjs`:

```81:86:lib/policy.mjs
  if (grip === 'advise') {
    // in-tree writes/edits are auto-allowed (fs-mediator still contains + audits them)
    if (toolCall?.kind === 'edit' || toolCall?.kind === 'write' || toolCall?.kind === 'read') return 'allow'
    if (toolCall?.kind === 'execute' && adviseAllowsShell(command)) return 'allow'
    return 'ask'
  }
```

Verified at review time:

| Call | Verdict |
|------|---------|
| `decideToolCall('advise', { kind: 'write', … })` | **`allow`** |
| `decideToolCall('advise', { kind: 'edit', … })` | **`allow`** |
| `decideToolCall('advise', { kind: 'read', … })` | **`allow`** |
| `decideToolCall('advise', { kind: 'execute', command: 'cat a.ts' })` | **`allow`** |
| `decideToolCall('advise', { kind: 'execute', command: 'cat a.ts && cat b.ts' })` | **`ask`** (0001) |
| `decideToolCall('gate', { kind: 'write', … })` | **`ask`** |
| `decideToolCall('leash', { kind: 'write', … })` | **`allow`** |

The unit suite locks this in: `test/policy.test.mjs:38-41` — *"advise auto-allows in-tree write/edit/read"*.

**A consult spawned under the default grip `advise` is not read-only.** File-tool writes and edits are auto-allowed. The veto gate does **not** hold them for a human or for the captain. "Manually gated writes" is false for `advise`.

### 2.2 The fs mediator makes non-`gate` writes land on disk

Permission policy is only half the story. ACP client-delegated file tools do not go through `holdPermission`; they go straight to the mediator (`lib/worker.mjs:260-264`):

```260:264:lib/worker.mjs
async function onAgentRequest(id, state, fsH, method, params) {
  if (method === 'fs/read_text_file') return fsH.readTextFile(params)
  if (method === 'fs/write_text_file') return fsH.writeTextFile(params)
  if (method === 'session/request_permission') return holdPermission(id, state, params)
```

And `writeTextFile` under any grip other than `gate` writes the workspace **directly** (`lib/fs-mediator.mjs:100-107`):

```100:107:lib/fs-mediator.mjs
      if (meta.grip === 'gate') {
        const staged = path.join(workerDir(meta.id), 'staged', rel)
        fs.mkdirSync(path.dirname(staged), { recursive: true })
        fs.writeFileSync(staged, content, 'utf8')
      } else {
        fs.mkdirSync(path.dirname(abs), { recursive: true })
        fs.writeFileSync(abs, content, 'utf8')
      }
```

So under `advise` (default spawn grip, `lib/worker.mjs:136` and `commands/work.md:15`):

1. Permission path: `write`/`edit` → `allow` (`lib/policy.mjs:83`).
2. FS path: `fs/write_text_file` → live tree write (`lib/fs-mediator.mjs:105-106`).

Containment is cwd-only, audited, **not** read-only. README states this explicitly for advise: *in-tree writes = direct, audited, contained* (`README.md` grip table ~L139-142).

### 2.3 Shell under `advise` is "mostly ask," not "read-only"

`ADVISE_ALLOW` is a short allow-list (`lib/policy.mjs:8-16`): `ls`, `cat`, `grep`, `rg`, `git status|diff|log`. Everything else on the execute path returns `ask` (`lib/policy.mjs:85-86`).

That is the opposite of a reliable silent consult:

- Natural multi-file reads with `&&` force `ask` (`lib/policy.mjs:65`; backlog 0001).
- `head`/`wc` may appear only as pipe filters (`SAFE_FILTER`, `lib/policy.mjs:31-33`), not as heads — so `head -200 f` alone is `ask` (backlog 0002).
- The captain cannot answer those prompts; the human must (`docs/backlog/0003-…`; skill claims otherwise at `skills/advisory-loop/SKILL.md:8`).

So "autonomous read-only consult under advise" is:

- **not read-only** on file tools (writes auto-run),
- **not autonomous** on the shell tools a reviewer actually uses (human gate).

P4's "common case silent" and "veto gate intact" cannot both be true under the default grip. File mutations are silent (bad). Useful reads often are not (also bad).

### 2.4 Is any grip in this repo actually read-only?

| Grip | File writes | Shell | Read-only? |
|------|-------------|-------|------------|
| `gate` | Staged under `staged/` (`lib/fs-mediator.mjs:100-103`); `decideToolCall` asks for essentially everything (`lib/policy.mjs:93-94`) | Every execute → `ask` | **No.** Writes still occur (to staging). Consults under `gate` maximize human interrupts (every shell call). |
| `advise` | Direct to tree + policy auto-allow write/edit | Only allow-listed readers auto; rest `ask` | **No.** |
| `leash` | Direct to tree; write/edit not specially denied (policy only special-cases shell deny-list, `lib/policy.mjs:88-90`) | Almost all auto-allow | **No.** Explicitly not a sandbox (`lib/policy.mjs:35-40`, `README.md` ~L146). |

**Finding: there is no read-only grip.** Competitive analysis already filed this as future work: `/grok:review (read-only)` is Tier 2, not shipped (`docs/COMPETITIVE-ANALYSIS.md:378` item 2.1).

### 2.5 What would have to be built for P4 to be true

P4 is a product claim about a mode that does not exist. Minimum build:

1. **A new grip** (e.g. `review` / `readonly`), not a prompt instruction.
2. **`decideToolCall`**: for that grip, `write`/`edit` → never `allow` (prefer hard deny or permanent `ask` with no path to silent write). Today only `gate` asks on write kinds (`lib/policy.mjs:93-94`), and even that is incomplete because of (3).
3. **`fs-mediator.writeTextFile`**: for that grip, refuse or no-op writes (do not only stage — staging is still a write side-effect a "read-only consult" should not perform without an explicit apply path). Today only `gate` special-cases (`lib/fs-mediator.mjs:100-107`).
4. **Shell allow-list** sufficient for real reviews: 0001 (`&&` of allow-listed segments) + 0002 (`sed -n`, `find` with guards, `head`/`wc`/`test` as heads). Without these, "silent" is a lie for any non-toy brief.
5. **Spawn default for autonomous consults** must force that grip; default `advise` (`lib/worker.mjs:136`) is unsafe for unsupervised second opinions.
6. Optionally **spawn-time pre-auth** for read-only shell (0003 proposed fix #1), because the captain still cannot `grokctl answer` for residual asks.

Until that exists, "autonomous consults are read-only" is a prompt hope fighting `lib/policy.mjs:83` and `lib/fs-mediator.mjs:105-106`. The veto gate is **not** intact for the default grip's file tools.

---

## SECTION 3 — THE TRIGGER MECHANISM YOU WOULD BUILD INSTEAD

### 3.1 What this harness actually has today

This plugin registers one Claude Code hook (`hooks/hooks.json:1-7`):

- **`SessionStart`** → `grokctl broker start` only.

Config surface (`commands/config.md`, `lib/config.mjs`) is **model + effort only** — not teammate mode, not consult budget, not path triggers (`lib/config.mjs:5-9`, `17-27`, `30-38`).

Delegation is **opt-in per task**: `/grok:work` or the `grok-worker` agent (`commands/work.md`, `agents/grok-worker.md`). Skills tell Claude how to brief and how to run the advisory loop; they do not fire without model judgment (`skills/delegation-contract/SKILL.md`, `skills/advisory-loop/SKILL.md`).

### 3.2 Hook events that could carry a teammate feature (and their limits)

P1 is correct: hooks fire on artifacts and session lifecycle, not on "about to commit to a design." Useful carriers, ranked honestly:

| Event / surface | Could carry | Failure mode for *design* consult |
|-----------------|-------------|-----------------------------------|
| **`Stop`** (not in this plugin; proposed as optional stop-time review in `docs/COMPETITIVE-ANALYSIS.md:380` item 2.3; codex peer has this and documents usage burn) | End-of-turn second pass on the turn's edits | Late; tax every turn if on by default; still post-commitment |
| **`PostToolUse`** (Write/Edit) | Path-class structural triggers after a write | Strictly after embodiment; false positives; re-entry if consult causes more writes |
| **`PreToolUse`** (Write/Edit) | Block or force consult *before* a write lands | Still after the captain decided what to write; blocks throughput; no signal for pure reasoning turns |
| **`UserPromptSubmit`** | "User just asked for architecture" heuristics | Keyword junk; user intent ≠ design commitment |
| **`SessionStart`** (exists here) | Enable broker / load teammate config | Too coarse; not per decision |
| **Skill / plan-mode / slash-command lifecycle** (not a hook: captain protocol) | Mandatory consult at *named* workflow boundaries: exit plan mode, `/design` complete, before `execute-plan` | Only works when the captain uses those workflows; not ambient |

There is **no** hook for "belief crystallized." Any design that pretends otherwise is lying about the harness.

### 3.3 What I would build instead of P3's path regexes

**Do not build always-on structural mandatory consults.** Build **budgeted, mode-bound, explicit-boundary consults**:

1. **Config** (extend `lib/config.mjs` / `/grok:config`, not only model/effort):
   - `teammate: off | review | debate` (default **`off`**).
   - `teammate_budget_per_session: N` (hard cap on worker spawns; default low, e.g. 3).
   - `teammate_grip: review` (the not-yet-built read-only grip from §2.5).
   - Never default to `advise` or `leash` for autonomous consults.

2. **Mandatory only at harness-visible *workflow* boundaries**, not at path globs:
   - When the user (or a skill) exits a design/plan phase with an artifact the captain is about to execute (design doc, PR plan, plan-mode exit). That is still an artifact, but it is a **decision artifact the human already marked**, not a regex over `**/migrations/**`.
   - Optional **`Stop` hook**, **default off**, session budget 0–1 review spawn, only if `teammate=review` and budget remains — same warning competitive analysis already filed (`docs/COMPETITIVE-ANALYSIS.md:385`: do not ship stop-gate on-by-default).

3. **Judgment-triggered consults stay opt-in** (agree with P2's diagnosis): skills may *suggest* "consider a second opinion," never pretend self-certainty is a reliable sensor.

4. **Structural path triggers**: optional, off by default, for *implementation review* only (migrations / public API), and only after §2.5 read-only grip + 0001/0002 land. Never market them as design co-thinking.

### 3.4 Cost per Claude turn (order of magnitude)

If teammate is **off**: **0** spawns, **0** extra wall-clock, **0** approvals.

If teammate is **on** with a Stop/PostToolUse consult every turn that writes:

- **≥1 worker spawn** per firing turn (cold pre-prompt ~2.2 s, warm attach ~1.4 ms for the pooled handshake segment — `BENCHMARK.md:18`; full review content still costs full model turns, not milliseconds).
- Plus captain overhead: arm `grokctl wait`, drain inbox (`skills/advisory-loop/SKILL.md:7-8`) — context and tool turns on Claude every wake.

### 3.5 Plain answer on reliability

**There is no reliable mechanism in this harness to detect "Claude is about to commit to a design."**  
P1 is right. P3's substitute (path/churn heuristics) is a different product. The honest design is:

- default **off**,
- on only at **explicit human or workflow boundaries**,
- with a **real read-only grip** and a **session budget**,
- and without claiming belief-level coverage the hooks cannot provide.

---

## SECTION 4 — THE COST MODEL NOBODY COMPUTED

Evidence anchors:

- Cold spawn pre-prompt ≈ **2205 ms**, warm ≈ **1.4 ms** (`BENCHMARK.md:18`).
- Full autonomous mechanical task under `leash` ≈ **16 s** wall-clock (`BENCHMARK.md:26`).
- Real `advise` review under current policy: **3 human approvals**, **`result` = null**, captain abandoned delegation ([0001](backlog/0001-advise-blocks-chained-readonly-commands.md), [0003](backlog/0003-parent-agent-cannot-answer-permissions.md), [0004](backlog/0004-parked-worker-yields-no-partial-output.md)).
- Captain **cannot** run `grokctl answer` for the worker ([0003](backlog/0003-parent-agent-cannot-answer-permissions.md)).
- Permission hold timeout **30 min** (`lib/worker.mjs:13`, `267-282`).

### 4.1 Unit of cost: one "consult"

Assume one autonomous second-opinion spawn per triggering Claude turn (P3-style or Stop-style).

| Line item | Unfixed policy (today: 0001/0002 open) | After 0001+0002 fixed only |
|-----------|----------------------------------------|----------------------------|
| Worker spawns | 1 | 1 |
| Spawn attach overhead | ~0–2.2 s (warm/cold) | same |
| Shell tool calls in a realistic multi-file review | ~5–15 (see 0005 worker command list) | same intent, fewer prompts |
| Auto-allowed shell (today) | Only single-head allow-list / safe pipes (`lib/policy.mjs:8-16,63-70`) | + `&&` of allow-listed segments; + `head`/`sed -n`/`find`/… as heads if 0002 implemented as proposed |
| Expected **human** approvals per consult | **2–5** (0001 session needed 3; captain cannot batch/answer — 0003) | **~0** if the worker stays on the expanded allow-list and never runs tests/mutations; **≥1** per non-allow-listed execute |
| Usable result probability if parked mid-turn | **0** (`result` null — 0004; `lib/worker.mjs:405-408`) | still 0 if any residual ask parks the turn |
| Wall-clock if humans are responsive | minutes (approval round-trips dominate) | tens of seconds to a few minutes (model time dominates) |
| Wall-clock if humans are not at the keyboard | up to **30 min** then deny/block (`lib/worker.mjs:13,277-281`) | same for residual asks |
| File-tool write risk | **Silent direct writes** under `advise` (`policy.mjs:83`, `fs-mediator.mjs:105-106`) | **unchanged** — 0001/0002 do not fix this |

### 4.2 Arithmetic: always-on teammate, structural or Stop, ~1 consult / writing turn

Assume a busy hour: **12** Claude turns that write enough to fire a trigger (conservative for "default teammate" enabled).

**Unfixed (today):**

```
spawns/hour              = 12
human_approvals/hour     = 12 consults × 3 approvals ≈ 36
usable_results/hour      ≈ 0–few   (parking + null result pattern from 0004)
captain_tool_overhead    = 12 × (wait arm + inbox drain + user-facing paste of grokctl answer)
feature_value            ≈ negative (cost without findings; captain abandons — 0001 "Cost")
```

**36 human interrupts/hour** is not a teammate. It is a pager.

**0001+0002 fixed, still on `advise`, no read-only grip:**

```
spawns/hour              = 12
human_approvals/hour     ≈ 0 for pure allow-listed reads
                           + K for any test/mutation/unknown shell
wall_clock_extra/hour    ≈ 12 × (0.5–3 min model review) ≈ 6–36 min of serialized wait
                           if the captain blocks on each consult before continuing
token_cost               = 12 × (full Grok review context + Claude synthesis)
write_risk               = still silent auto-write under advise
```

Silent common case becomes plausible **only if** the worker never leaves the allow-list **and** never uses file write tools. The policy does not enforce the second. Prompt text is not a control plane.

**0001+0002 + read-only grip + spawn pre-auth (0003 option 1) + budget cap:**

```
spawns/hour              ≤ budget (e.g. 3/session), not 12
human_approvals/hour     ≈ 0 for on-policy reviews
wall_clock_extra         = budget × model time (bounded)
feature_viable           = maybe, as optional review assist — not as belief-level co-thinker
```

### 4.3 Debate mode multiplies cost

A debate is at least **two** model positions plus synthesis. Under P5 the captain is synthesist; under this plugin each Grok position is still a worker with grip policy.

```
debate_cost ≥ 2 × consult_cost  (+ captain synthesis tokens)
```

Under unfixed policy: **≥6 human approvals** per debate episode using the 0001 empirical rate, still with null-result risk if either worker parks.

### 4.4 Honest viability call

**This feature is not viable as "default autonomous teammate" until at least:**

1. **0001 and 0002** land (silent read path for real reviews),
2. **a real read-only grip** (§2.5) — 0001/0002 alone leave auto-write under `advise`,
3. **0003 is resolved in product truth** (pre-auth or human-as-approver with no captain fantasy) — otherwise any residual `ask` breaks "without the user asking,"
4. **0004** at least mitigated if anything can still park (otherwise paid consults return null),
5. **default off + session budget** (competitive analysis already warns stop-gates burn usage — `docs/COMPETITIVE-ANALYSIS.md:380,385`).

Shipping P3+P4 on **0.1.x policy** is a reliability and safety regression: more spawns into a grip that auto-writes and a shell policy that randomly pages the human.

**Verdict: not viable until the 0.2.0-class fixes (0001/0002 minimum; 0003/0004 + read-only grip for the claim as marketed).**

---

## SECTION 5 — WHAT I DID NOT ASK ABOUT

**Autonomous teammate assumes the captain can close the advisory loop. Backlog 0003 shows it cannot.**

P4 talks about veto integrity and silent reads. P5 talks about debate synthesis bias. Neither names the control-plane contradiction already proven in this repo:

- Plugin design: pending permissions are for the **captain** to answer (`lib/worker.mjs:267-292`; inbox `type: 'permission'`).
- Claude Code design: an agent answering another agent's permission is correctly **denied** as satisfying a human gate ([0003](backlog/0003-parent-agent-cannot-answer-permissions.md)).
- Skill text still says never leave a permission pending (`skills/advisory-loop/SKILL.md:8`).

Therefore "Claude decides when to consult, without the user asking" is false for any consult that leaves the auto-allow set: the **human** becomes the permission clerk mid-task, while Claude is also supposed to be thinking. That is not a teammate feature; it is a distributed interrupt generator. Structural triggers (P3) only increase how often that contradiction is hit.

(This is distinct from P4's read-only claim: even a perfectly read-only allow-list fails open to the human the moment the worker runs one non-allow-listed tool, and the captain cannot clear it.)

---

## Summary for the captain

| Position | Attack result |
|----------|----------------|
| P1 | Hold: hooks do not fire on beliefs. |
| P2 | Hold: judgment-triggered consult fails when confidently wrong. |
| P3 | **Reject** as mandatory primitive for design co-thinking; optional late implementation net only. |
| P4 | **Reject as implemented:** `advise` auto-allows write/edit (`lib/policy.mjs:83`); non-gate writes hit disk (`lib/fs-mediator.mjs:105-106`); **no read-only grip exists**. |
| P5 | Not the focus of this attack; agreement bias is real but smaller than the missing read-only grip and 0003 loop break. |

**Ship blockers before any "default teammate" flag:** read-only grip + 0001/0002 + truthful permission story (0003) + budget default off.
