---
description: Show or set the default Grok model and reasoning effort for workers
---
Configure worker model / reasoning effort. $ARGUMENTS may contain `--model <id>` and/or `--effort low|medium|high`.

1. If `$ARGUMENTS` is empty: run `node "${CLAUDE_PLUGIN_ROOT}/bin/grokctl.mjs" config` and show the current defaults.
2. Otherwise run `node "${CLAUDE_PLUGIN_ROOT}/bin/grokctl.mjs" config $ARGUMENTS` and show the new defaults.
3. To see valid model ids, run `node "${CLAUDE_PLUGIN_ROOT}/bin/grokctl.mjs" models`.
4. Pass `--model none` or `--effort none` to clear a setting and fall back to grok's own default.

Precedence (highest first): per-spawn `--model`/`--effort` on `/grok:work` → env `GROK_CC_MODEL`/`GROK_CC_EFFORT` → this config → grok's default.

Note: a model grok rejects is reported as an inbox `error` on the worker — it never silently falls back.
