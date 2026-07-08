---
name: advisory-loop
description: How to run the advisor loop for Grok workers - wakes, inbox draining, veto etiquette. Use whenever a grokctl wait background task exits or a worker needs an answer.
---
# Running the advisory loop

- After every spawn, ALWAYS arm `grokctl wait <id> --timeout 570` as a background Bash task. Exit 0 = event (drain inbox now); exit 2 = heartbeat timeout (re-arm; check status while you're there).
- On wake: `grokctl inbox <id>`, handle the LAST unhandled item first (see /grok:advise steps). Never leave a permission pending - the 30-minute timeout denies and blocks the worker.
- Veto etiquette: a deny cancels the worker's whole turn. Always follow deny with `say` guidance in the same breath, or the worker sits idle.
- checkpoint items are your cheap steering moment - one `say` course-correction here saves a wasted turn later.
- Verify done results yourself (diff, tests) before telling the user it's done. Workers' verification claims are input, not truth.
- If a worker dies (status dead), `grokctl resume <id>` restores it with memory intact - do not respawn from scratch.
