---
id: 0009
title: Auto-allowed `git diff`/`git log -p` run the repo's configured textconv/ext-diff (arbitrary code)
severity: major
area: policy
found: 2026-07-10
---

## What happened

Building the `read` grip (0.2.0), a fresh Grok worker was run under `--grip read`
to attack the new grip for a bypass. It found that `git diff` and `git log -p`
auto-allow under the shell whitelist AND execute whatever `textconv` / `ext-diff`
driver the repo's git config names — **by default**, with no flag. The item-1
whitelist blocks the `--textconv`/`--ext-diff` *flags*, but git runs the driver
without them, so flag-blocking never sees the exec.

This is the failure mode the whole "bulletproof whitelist" was meant to prevent:
a command that *looks* read-only from its string but secretly runs a program.

## Evidence

Runnable. Policy verdict (before fix, all grips auto-allowed):

```
node -e 'import("./lib/policy.mjs").then(({decideToolCall})=>{
  const e=c=>({kind:"execute",rawInput:{command:c}});
  console.log(decideToolCall("advise", e("git diff")));      // allow
  console.log(decideToolCall("advise", e("git log -p -1"))); // allow
})'
```

Proof the allow actually executes code (isolated /tmp repo, not this tree):

```
TMP=$(mktemp -d); cd "$TMP"; git init -q; git config user.email t@t; git config user.name t
printf 'hi\n' > f.txt; git add -A; git commit -q -m init
printf '*.txt diff=evil\n' > .gitattributes
git config diff.evil.textconv "touch $TMP/PWNED; cat"
printf 'x\n' >> f.txt
git diff >/dev/null 2>&1; ls PWNED    # -> PWNED exists: textconv ran
git diff --no-textconv >/dev/null 2>&1 # control: no PWNED written
```

## Root cause

`lib/policy.mjs` `RESTRICTED_HEADS` (git diff/log) + `GIT_LONG`/`GIT_SHORT`
whitelist the *flags* but cannot see git's default textconv/ext-diff behavior,
which is driven by the repo's `.git/config` + in-tree `.gitattributes`, not by the
command string. A raw-string policy is blind to config-driven subprocess exec.

Precondition to exploit: a `textconv`/`ext-diff` driver defined in a git config
git will read from the worker's cwd (repo-local `.git/config`, `~/.gitconfig`, or
`/etc/gitconfig`). `git clone` does NOT transmit `.git/config`, so a cloned
untrusted repo is safe; the danger is a directory whose `.git/config` was authored
by someone else (e.g. a copied working tree / tarball).

## Cost

One adversarial-audit worker turn (~6 human approvals of read-only probes) to find
and prove it. Also exposed that the read-grip caveat in docs understated the risk
as touching `.git/index.lock` (a benign lockfile) when it is arbitrary code exec.

## Proposed fix

Shipped in 0.2.0 (user call: **strict on `read` only**):

- Under `read`, `git diff`/`git log` auto-allow only when BOTH `--no-textconv` and
  `--no-ext-diff` are present; otherwise ask (`partIsReadOnly` `strictGit`).
- `advise`/`leash` are unchanged — they are trusted-tree grips, so running the
  tree's own configured textconv is the operator's own code, an accepted residual.
- Docs (work.md, delegation-contract, policy.mjs) now state the real risk and
  "never aim `read` at a `.git/config` you didn't write."

Trade-off named: bare `git diff` under `read` now asks (false-ask on the common
review command), accepted because `read` exists precisely for untrusted code. The
`advise`/`leash` residual is documented, not closed.

## Not the fix

- **Denylist the textconv/ext-diff flags** — already done and useless: the exec is
  the *default*, triggered by absence of flags, not their presence.
- **Rewrite the worker's command to inject `--no-textconv`** — the policy only
  returns allow/ask; it never edits the command. Injection would need a shell
  wrapper the plugin does not have.
- **Make it strict in every grip** — considered; rejected by the user because it
  taxes the single most common review command in the trusted-tree grips where the
  config is the operator's own.
