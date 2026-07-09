/** Grip policy: data-driven allow/deny lists. Returns 'allow' | 'ask'. */

export const ADVISE_ALLOW = [
  /^\s*ls(\s|$)/,
  /^\s*cat(\s|$)/,
  /^\s*grep(\s|$)/,
  /^\s*rg(\s|$)/,
  /^\s*git\s+status(\s|$)/,
  /^\s*git\s+diff(\s|$)/,
  /^\s*git\s+log(\s|$)/,
  /^\s*pytest(\s|$)/,
  /^\s*npm\s+test(\s|$)/,
  /^\s*cargo\s+test(\s|$)/,
  /^\s*node\s+--test(\s|$)/,
]

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
  /\brm\s+-rf\b/,
  /\bgit\s+push\b/,
  /\bsudo\b/,
  /curl\b.*\|\s*sh\b/,
  /\b(node|deno|bun)\b[^;&|]*\s-{1,2}(e|eval|input-type)\b/,   // node -e 'fs.writeFileSync("/etc/…")'
  /\b(python3?|perl|ruby|php)\b[^;&|]*\s-(c|e)\b/,
  /\b(ba|z|k)?sh\s+-c\b/,
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
  const segs = norm.split('|').map(s => s.trim()).filter(Boolean)
  if (!segs.length || !matchesAny(ADVISE_ALLOW, segs[0])) return false
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
