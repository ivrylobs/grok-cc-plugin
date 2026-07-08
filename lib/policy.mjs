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

export const LEASH_DENY = [
  /\brm\s+-rf\b/,
  /\bgit\s+push\b/,
  /\bsudo\b/,
  /curl\b.*\|\s*sh\b/,
]

function matchesAny(patterns, text) {
  return patterns.some((re) => re.test(text))
}

// chaining/redirection/substitution can smuggle mutations behind an allowed prefix
const SHELL_META = /[;&|><`]|\$\(/

/**
 * @param {string} grip
 * @param {{ kind?: string, rawInput?: { command?: string } }} toolCall
 * @returns {'allow'|'ask'}
 */
export function decideToolCall(grip, toolCall) {
  const command = toolCall?.rawInput?.command ?? ''

  if (grip === 'advise') {
    if (toolCall?.kind === 'execute' && !SHELL_META.test(command) && matchesAny(ADVISE_ALLOW, command)) return 'allow'
    return 'ask'
  }

  if (grip === 'leash') {
    if (matchesAny(LEASH_DENY, command)) return 'ask'
    return 'allow'
  }

  // gate and any unknown grip
  return 'ask'
}
