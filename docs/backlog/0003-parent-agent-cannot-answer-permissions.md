---
id: 0003
title: "The captain cannot answer a worker's permission prompt"
severity: blocker
area: protocol
found: 2026-07-10
---

## What happened

`skills/advisory-loop/SKILL.md` instructs the captain:

> Never leave a permission pending — the 30-minute timeout denies and blocks the
> worker.

The captain cannot comply. Under Claude Code's auto-approval mode, the
classifier refuses to let an agent run `grokctl answer <id> allow`, on the
grounds that one agent approving another agent's permission request satisfies a
human-approval gate on the user's behalf. It refused the sub-agent, and then
refused the top-level agent when it retried.

The refusal is **correct**. The gate exists so a human decides. An agent
clearing it for another agent defeats it entirely. But the skill's central
instruction is written as though the captain can do this, and the design assumes
it.

## Evidence

Both denials, verbatim:

> **(to the sub-agent)** the Claude Code auto-mode classifier **denied me from
> answering the worker's permission prompt** — its rationale is that an agent
> approving another agent's permission request would satisfy the human-approval
> gate on your behalf.

> **(to the captain, retrying)** `[Auto-Mode Bypass]` The agent is re-issuing the
> exact `grokctl answer <id> allow` command that the classifier already denied to
> its subagent, satisfying a human-approval gate on the user's behalf.

The worker sat in `advising` until the human ran the command by hand — three
times, once per tool call.

## Root cause

Two systems with incompatible models of who the approver is.

`lib/worker.mjs:267` `holdPermission()` consults `decideToolCall(meta.grip, …)`;
anything not auto-allowed is pushed to the inbox for **the captain** to answer.
The plugin's approver is the captain.

Claude Code's approver is the human, and it actively prevents an agent from
standing in for one. So every prompt the plugin's policy does not auto-allow
becomes a human interrupt — one per tool call, with no batching.

The plugin is not wrong to want an approver; it is wrong to assume the captain
is allowed to be one.

## Cost

The delegation is unusable for anything the policy does not already auto-allow.
In practice: a read-only code review needed three human keystrokes and returned
zero findings. The captain gave up and did the work itself. The whole point of
the worker — a second, independent perspective — was lost to plumbing.

Sharpening [0001](0001-advise-blocks-chained-readonly-commands.md) and
[0002](0002-advise-allowlist-missing-readonly-heads.md) shrinks this a lot: if
read-only reviews never prompt, the gate is never hit for the common case. That
is mitigation, not a fix.

## Proposed fix

Pick one, deliberately:

1. **Pre-authorize at spawn.** `grokctl spawn --grip advise --allow-readonly`
   records consent once, in the human's own invocation, and the worker never
   prompts for allow-listed reads. The human still authorizes — once, up front,
   rather than per call. This is the honest version of what everyone wants.

2. **Make the human the approver, and say so.** Keep the gate, drop the pretence
   that the captain can clear it. Rewrite `advisory-loop` to tell the captain to
   surface the pending command to the user with a copy-pasteable
   `grokctl answer …`, and to keep working on something else meanwhile. Slower,
   but truthful.

3. **Batch the prompts.** A worker that wants six reads should ask once for six,
   not six times for one. Reduces interrupts by ~6× without changing who
   approves.

(1) and (3) compose. (2) is the fallback if the harness is not willing to let a
spawn-time flag stand in for per-call consent.

## Not the fix

- **Have the captain shell out to `grokctl answer`.** This is the denied action.
  Do not route around a permission gate; that is what the gate is for.
- **Document a Bash permission rule that lets the agent answer.** Same thing
  with extra steps — it hands the gate to the agent permanently, for every
  future worker, silently.
