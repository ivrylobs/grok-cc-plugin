/** Grip policy: data-driven allow/deny lists. Returns 'allow' | 'ask'. */

// Auto-allowed under advise: strictly READ-ONLY inspection. Test runners were
// removed deliberately — auto-allowing an in-tree write AND the command that
// executes it (npm test runs package.json's script; a worker can write that
// script) is a write-then-run escalation. Under advise a test run now asks;
// the advisor grants it. Set GROK_CC_ADVISE_TESTS=1 to auto-allow them again.
export const ADVISE_ALLOW = [
  /^\s*ls(\s|$)/,
  /^\s*cat(\s|$)/,
  /^\s*grep(\s|$)/,
  /^\s*rg(\s|$)/,
  /^\s*git\s+status(\s|$)/,
  /^\s*git\s+diff(\s|$)/,
  /^\s*git\s+log(\s|$)/,
]

const ADVISE_TEST = [
  /^\s*pytest(\s|$)/,
  /^\s*npm\s+test(\s|$)/,
  /^\s*cargo\s+test(\s|$)/,
  /^\s*node\s+--test(\s|$)/,
]

// A flag that turns an otherwise read-only allow-listed command into arbitrary
// exec or an out-of-tree write: `rg --pre <cmd>` runs cmd; `git log --output=F`
// writes F. Its presence forces the whole command back to `ask`.
const ADVISE_DANGER_FLAG = /(^|\s)(--pre(=|\s|$)|--output(=|\s|$))/

// Read-only filters that may appear downstream of an allowed command in a pipe.
export const SAFE_FILTER = [
  /^\s*(tail|head|wc|sort|uniq|cat|grep|rg|cut|tr)(\s|$)/,
]

// A TRIPWIRE, NOT A SANDBOX. `leash` runs shell commands directly, so anything
// not listed here executes with the broker's full privileges — fs-mediator
// containment only guards grok's file tools, never shell. These patterns catch
// the escapes a worker reaches for by accident (inline interpreters that write
// outside the workspace); they cannot catch a worker that is trying. Untrusted
// work belongs under `gate`, not `leash`.
export const LEASH_DENY = [
  /\brm\s+-[a-zA-Z]*r/i,                                            // rm -r, -rf, -fr, -Rf …
  /\bgit\s+push\b/i,
  /\bsudo\b/,
  /curl\b.*\|\s*sh\b/,
  /\b(node|deno|bun)\b[^;&|]*\s-{1,2}(e|eval|p|print|input-type)\b/i,  // node -e/-p/--eval, bun -e; writes anywhere
  /\bdeno\s+eval\b/i,
  /\b(python3?|perl|ruby|lua)\b[^;&|]*\s-(c|e)\b/i,                 // python -c, perl -e, ruby -e, lua -e
  /\bphp\b[^;&|]*\s-r\b/i,                                          // php -r (php uses -r, not -c/-e)
  /\b(ba|z|k)?sh\s+-c\b/i,
  /\beval\b/,
]

function matchesAny(patterns, text) {
  return patterns.some((re) => re.test(text))
}

/**
 * Under `advise`, allow `npm test 2>&1 | tail -40`: an allowed command, stderr
 * folded into stdout, piped only into read-only filters. Everything else —
 * chaining, substitution, file redirection — still asks.
 */
function adviseAllowsShell(command) {
  const norm = command.replace(/2>&1/g, ' ')            // the one redirection that writes nothing
  if (/[;&`<>]|\$\(/.test(norm)) return false           // chain / substitute / redirect-to-file
  if (ADVISE_DANGER_FLAG.test(norm)) return false        // weaponized flag on an allow-listed head
  const heads = process.env.GROK_CC_ADVISE_TESTS === '1' ? [...ADVISE_ALLOW, ...ADVISE_TEST] : ADVISE_ALLOW
  const segs = norm.split('|').map(s => s.trim()).filter(Boolean)
  if (!segs.length || !matchesAny(heads, segs[0])) return false
  return segs.slice(1).every(s => matchesAny(SAFE_FILTER, s))
}

/**
 * @param {string} grip
 * @param {{ kind?: string, rawInput?: { command?: string } }} toolCall
 * @returns {'allow'|'ask'}
 */
export function decideToolCall(grip, toolCall) {
  const command = toolCall?.rawInput?.command ?? ''

  if (grip === 'advise') {
    // in-tree writes/edits are auto-allowed (fs-mediator still contains + audits them)
    if (toolCall?.kind === 'edit' || toolCall?.kind === 'write' || toolCall?.kind === 'read') return 'allow'
    if (toolCall?.kind === 'execute' && adviseAllowsShell(command)) return 'allow'
    return 'ask'
  }

  if (grip === 'leash') {
    if (matchesAny(LEASH_DENY, command)) return 'ask'
    return 'allow'
  }

  // gate and any unknown grip
  return 'ask'
}
