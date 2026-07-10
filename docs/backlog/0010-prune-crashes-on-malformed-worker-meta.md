---
id: 0010
title: `grokctl prune` crashes on a worker dir with a malformed (id-less) meta
severity: major
area: worker
found: 2026-07-10
---

## What happened

A user ran `grokctl prune --days 0` to clear the `/grok:status` board. It errored
out mid-run: `The "path" argument must be of type string. Received undefined`. By
then it had already `rmSync`'d some worker dirs but could not finish, leaving the
board half-cleared and two malformed dirs stuck (one named `--json`, one whose
`meta.json` had no `id` field — the `—` row in the status table).

## Evidence

```
$ node bin/grokctl.mjs prune --days 0
{"error":"The \"path\" argument must be of type string. Received undefined"}
```

Reproduce from a clean store:

```
mkdir -p ~/.grok-cc/workers/junk && echo '{"status":"blocked"}' > ~/.grok-cc/workers/junk/meta.json
node bin/grokctl.mjs broker stop && node bin/grokctl.mjs broker start
node bin/grokctl.mjs prune --days 0   # -> path-argument error (pre-fix)
```

## Root cause

`lib/store.mjs` `listMetas()` returned the parsed `meta.json` **content only**,
dropping the directory name. A meta missing its own `id` field therefore yielded
`{ id: undefined }`, and `lib/worker.mjs` `prune()` then called
`path.join(store.ROOT, 'workers', m.id)` with `m.id === undefined` → throw. A dir
with no/unparseable `meta.json` at all (`--json`) was invisible to `listMetas`
entirely, so prune could never collect it.

Two upstream sources create such dirs: a spawn that writes a partial meta before
its `id`, and a mis-parsed CLI arg that lands a directory named `--json`.

## Cost

The user's cleanup command failed outright and left the store in a worse state
(partially pruned, two zombie dirs). Diagnosis took a broker restart plus a walk
of `~/.grok-cc/workers` to find the two malformed dirs by hand.

## Proposed fix

Shipped:

- `store.listMetas()` now reads dir entries with `withFileTypes`, skips non-dirs,
  and returns `{ ...(meta || {}), id: meta?.id || dirName }` — the dir name is the
  worker's identity and is never lost, so every dir is listable and prunable.
- `worker.prune()` guards `if (!m.id) continue` (defensive) and treats an UNDATED
  meta as garbage to collect rather than skipping it — every real spawn writes
  `createdAt`, and active/live workers are already excluded, so an undated
  terminal meta is malformed junk. The broker's startup reconcile now self-heals
  these dirs.
- `test/prune-malformed.test.mjs` locks: all dirs listable with a usable id;
  generous retention still GC's undated junk; `--days 0` clears the rest.

## Not the fix

- **Skip id-less metas in prune only** — stops the crash but leaves the junk dirs
  uncollectable forever; the real fix is that the dir name IS the id.
- **Delete undated metas unconditionally, everywhere** — a live worker mid-spawn
  could momentarily lack dates; prune is safe only because it already excludes
  `ACTIVE_STATUSES` and `live`. Do not port this rule to code without those guards.
