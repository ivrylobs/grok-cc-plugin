---
description: Review and answer a Grok worker's pending request
argument-hint: '<worker-id>'
allowed-tools: Bash(node:*), Read, AskUserQuestion
---
For worker $ARGUMENTS:

1. Run `node "${CLAUDE_PLUGIN_ROOT}/bin/grokctl.mjs" inbox <id>` and read the LAST unhandled item.
2. `permission` item → show the user the toolCall title; decide (or ask the user if judgment is unclear):
   - approve: `... answer <id> allow`
   - veto: `... answer <id> deny --why "<reason>"` **then** `... say <id> "<corrective guidance>"`
3. `need_input` item → answer with `... say <id> "<answer>"`.
4. `checkpoint` item → review the plan summary; `... say <id> "continue"` or send corrections.
5. `done` item → verify the result against the original task (read the diff / run tests) before accepting.
6. Re-arm `... wait <id> --timeout 570` as a background task unless the worker is done/killed.
