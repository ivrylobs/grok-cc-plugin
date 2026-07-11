/** Grip policy: data-driven allow/deny lists. Returns 'allow' | 'ask'. */

// Auto-allow under advise is a WHITELIST, not a denylist. Three audits showed
// that denylisting dangerous flags on feature-rich tools is unsound — each tool
// (rg, git, find, sed, sort) has its own exec/write flags, they vary by version,
// and every pass found another. So we invert: a command auto-allows only if we
// positively recognize it as read-only. An unknown flag ASKS — a new exec flag
// in a future tool version fails safe instead of slipping a denylist.

// TIER 1 — SIMPLE heads: tools with NO ability to exec a command or write a file
// through ANY flag. Safe with arbitrary options. (grep is the always-safe search
// fallback: it has no --pre, no output-file flag, no exec — unlike rg.)
const SIMPLE_HEADS = [
  /^\s*ls(\s|$)/,
  /^\s*cat(\s|$)/,
  /^\s*grep(\s|$)/,
  /^\s*head(\s|$)/,
  /^\s*tail(\s|$)/,
  /^\s*wc(\s|$)/,
  /^\s*test(\s|$)/,
  /^\s*cut(\s|$)/,
  /^\s*tr(\s|$)/,
  // git plumbing readers with NO write/exec flag on ANY option (verified via `-h`):
  // they resolve refs / list the index / list refs, never mutate .git or run a driver.
  // NOTE: `git cat-file` is deliberately NOT here — `cat-file --textconv <rev>:<path>`
  // runs the repo's configured textconv driver (arbitrary code), the same exec path
  // guarded for diff/log/show, and SIMPLE_HEADS ignores that guard.
  /^\s*git\s+rev-parse(\s|$)/,
  /^\s*git\s+ls-files(\s|$)/,
  /^\s*git\s+show-ref(\s|$)/,
]

// Test runners are opt-in (GROK_CC_ADVISE_TESTS=1): auto-allowing a test run AND
// the in-tree write that defines it (npm test → package.json script) is a
// write-then-run escalation. Simple heads when enabled.
const ADVISE_TEST = [
  /^\s*pytest(\s|$)/,
  /^\s*npm\s+test(\s|$)/,
  /^\s*cargo\s+test(\s|$)/,
  /^\s*node\s+--test(\s|$)/,
]

// TIER 2 — RESTRICTED heads: tools that CAN exec/write via some option. Auto-
// allow only when EVERY option token is on the tool's safe list; any unknown
// option asks. rg exec flags (--pre/--pre-glob/--hostname-bin) and git write/exec
// flags (--output/--ext-diff/--textconv) are simply absent from the safe lists.
//
// CAVEAT (audit, read grip): flag-absence is NOT enough for git textconv/ext-diff.
// git runs a configured `textconv`/`ext-diff` driver for `git diff`/`git log -p`
// BY DEFAULT — no flag needed — so blocking the flags does not block the exec.
// advise/leash accept this (trusted tree, its own .git/config); the `read` grip
// is stricter (see partIsReadOnly strictGit): git diff/log auto-allow only with
// --no-textconv --no-ext-diff present.
//
// find predicates are whole words (`-name`, `-exec`); safe set is the read-only
// predicates. Write/exec predicates (-exec*, -ok*, -delete, -fprint*, -fls) are
// absent → ask.
const FIND_SAFE = new Set(
  ('-name -iname -type -path -ipath -wholename -iwholename -lname -ilname -regex '
  + '-iregex -maxdepth -mindepth -depth -prune -quit -print -print0 -printf -ls '
  + '-newer -anewer -cnewer -mtime -atime -ctime -mmin -amin -cmin -size -empty '
  + '-user -group -uid -gid -nouser -nogroup -perm -readable -writable -executable '
  + '-fstype -inum -links -samefile -not -a -and -o -or -true -false -follow -xdev '
  + '-mount -H -L -P -O0 -O1 -O2 -O3 -D').split(/\s+/))

// rg/git flags: long (`--x`, value after `=`) and short (combinable `-ni`,
// numeric-attached `-A3`). Safe long names listed; safe short LETTERS listed.
const RG_LONG = new Set(
  ('--line-number --no-line-number --column --byte-offset --ignore-case '
  + '--case-sensitive --smart-case --word-regexp --line-regexp --invert-match '
  + '--fixed-strings --regexp --file --count --count-matches --files '
  + '--files-with-matches --files-without-match --only-matching --after-context '
  + '--before-context --context --context-separator --max-count --max-columns '
  + '--max-depth --with-filename --no-filename --heading --no-heading --color '
  + '--colors --json --null --null-data --hidden --no-hidden --no-ignore '
  + '--no-ignore-vcs --glob --iglob --type --type-not --type-add --sort --sortr '
  + '--stats --trim --vimgrep --pretty --no-messages --text --binary --multiline '
  + '--multiline-dotall --pcre2 --engine --encoding --crlf --passthru --replace '
  + '--search-zip --mmap --no-mmap --line-buffered --block-buffered --one-file-system '
  + '--follow --no-follow --sortr --debug --field-match-separator').split(/\s+/))
const RG_SHORT = new Set('niwxvcloeFHhSsUAtTgmMpardu0z'.split(''))

const GIT_LONG = new Set(
  ('--oneline --graph --all --decorate --no-decorate --abbrev-commit --stat '
  + '--shortstat --numstat --name-only --name-status --summary --patch --no-patch '
  + '--raw --format --pretty --date --relative-date --author --committer --grep '
  + '--since --until --before --after --merges --no-merges --first-parent --reverse '
  + '--word-diff --color-words --unified --function-context --find-renames '
  + '--find-copies --diff-filter --cached --staged --stat-width --color --no-color '
  + '--follow --left-right --cherry-pick --topo-order --date-order --author-date-order '
  + '--check --exit-code --numbered --ignore-all-space --ignore-space-change '
  + '--ignore-blank-lines --minimal --histogram --patience --anchored --no-ext-diff '
  + '--no-textconv --no-renames --compact-summary --dirstat').split(/\s+/))
const GIT_SHORT = new Set('pULwMSGncsz'.split(''))

// `git status` is RESTRICTED, not simple: `git status -v/--verbose` renders a
// diff and runs the repo's configured textconv/ext-diff driver (verified). So
// -v/--verbose are excluded; plain status flags stay.
const GIT_STATUS_LONG = new Set(
  ('--short --branch --porcelain --long --untracked-files --ignored '
  + '--ignore-submodules --column --no-column --ahead-behind --no-ahead-behind '
  + '--renames --no-renames --find-renames --show-stash').split(/\s+/))
const GIT_STATUS_SHORT = new Set('sbuz'.split(''))   // NOT 'v'

const RESTRICTED_HEADS = [
  { head: /^\s*find(\s|$)/, ok: (seg) => optionTokens(seg).every(t => FIND_SAFE.has(t)) },
  { head: /^\s*rg(\s|$)/, ok: (seg) => flagsOk(seg, RG_LONG, RG_SHORT) },
  { head: /^\s*git\s+status(\s|$)/, ok: (seg) => flagsOk(seg, GIT_STATUS_LONG, GIT_STATUS_SHORT) },
  { head: /^\s*git\s+diff(\s|$)/, ok: (seg) => flagsOk(seg, GIT_LONG, GIT_SHORT) },
  { head: /^\s*git\s+log(\s|$)/, ok: (seg) => flagsOk(seg, GIT_LONG, GIT_SHORT) },
  // `git show` renders a commit/diff — same textconv/ext-diff exposure as diff/log,
  // so it shares GIT_LONG/GIT_SHORT and the strictGit treatment below.
  { head: /^\s*git\s+show(\s|$)/, ok: (seg) => flagsOk(seg, GIT_LONG, GIT_SHORT) },
]

// Read-only filters downstream of a pipe use the SAME classifier as heads (see
// partIsReadOnly), so `cat a | rg --pre sh` and `cat a | sort -o f` both ask.

function optionTokens(seg) {
  return seg.trim().split(/\s+/).filter(t => t.startsWith('-') && t !== '-')
}

// A restricted tool's flags are OK iff every long flag (name before `=`) is in
// safeLong and every single-dash token is a cluster of safeShort LETTERS with an
// optional trailing numeric value (`-A3`, `-ni`). Anything else asks.
function flagsOk(seg, safeLong, safeShort) {
  return optionTokens(seg).every(t => {
    if (t.startsWith('--')) return safeLong.has(t.split('=')[0])
    if (/^-\d+$/.test(t)) return true                  // count shorthand: git log -3, head -20
    const m = /^-([A-Za-z]+)\d*$/.exec(t)
    return m ? [...m[1]].every(ch => safeShort.has(ch)) : false
  })
}

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

// Any character that lets the shell TRANSFORM the command string before it
// runs — so a danger flag can hide as `-{delete,x}` (brace), `-"delete"`
// (quote), `-delet\e` (backslash), `$'\n'` (ANSI-C newline), or `$(…)` (subst).
// A raw-string regex cannot see past these, so we reject their machinery
// wholesale: quotes, backslash, `$`, braces, parens, backtick, `;`, redirects,
// and a bare `&` (the `&&` chain is already split off before this runs).
// Globs (`* ? [ ]`) and `~` are NOT here — they only expand to filenames, never
// inject a command — so ordinary `cat *.js` still auto-allows.
const SHELL_MACHINERY = /[;&`'"\\<>{}()$]/

// Is one pipe part (`rg -n foo src/`, `git log --oneline`) read-only? SIMPLE
// heads pass with any flags; RESTRICTED heads pass only when every option is on
// their safe list; test runners pass when opted in.
function partIsReadOnly(part, { allowTests = false, strictGit = false } = {}) {
  if (matchesAny(SIMPLE_HEADS, part)) return true
  if (allowTests && matchesAny(ADVISE_TEST, part)) return true
  const r = RESTRICTED_HEADS.find(({ head }) => head.test(part))
  if (!r || !r.ok(part)) return false
  // strictGit (read grip): `git diff`/`git log` run the repo's configured
  // textconv/ext-diff driver — arbitrary code — BY DEFAULT, which flag-blocking
  // can't see (the exec happens when NO flag is passed). Under the read grip,
  // auto-allow them only when BOTH neutralizing flags are present; otherwise ask.
  if (strictGit && /^\s*git\s+(diff|log|show)(\s|$)/.test(part)) {
    return /(^|\s)--no-textconv(\s|$)/.test(part) && /(^|\s)--no-ext-diff(\s|$)/.test(part)
  }
  return true
}

// One `&&` sequence-segment: reject shell machinery, then require the head AND
// every downstream pipe part to be independently read-only.
function segmentAllowed(seg, opts) {
  if (SHELL_MACHINERY.test(seg)) return false           // bare & / ; / quotes / subst / brace / redirect
  const parts = seg.split('|').map(s => s.trim()).filter(Boolean)
  return parts.length > 0 && parts.every(p => partIsReadOnly(p, opts))
}

/**
 * Under `advise`, allow `npm test 2>&1 | tail -40`: an allowed command, stderr
 * folded into stdout, piped only into read-only filters. A conjunction of
 * allow-listed reads (`cat a && cat b`) is allowed — each half is validated
 * independently. Everything else — a line break (0006), a bare `&`/`;`,
 * substitution, file redirection — still asks.
 */
function adviseAllowsShell(command, { allowTests = process.env.GROK_CC_ADVISE_TESTS === '1', strictGit = false } = {}) {
  const norm = command.replace(/2>&1/g, ' ')            // the one redirection that writes nothing
  // 0006: fail closed on any line terminator / control char (except tab). A
  // newline smuggles a second command past a head-anchored allow-list; the
  // others are not bash separators but are rejected defense-in-depth.
  if (/[\x00-\x08\x0a-\x1f\x85\u2028\u2029]/.test(norm)) return false
  // Split on `&&` BEFORE segmentAllowed's machinery test (0001): every segment
  // must pass, and a lone `&` left inside a segment is caught there.
  const seqs = norm.split('&&').map(s => s.trim()).filter(Boolean)
  if (!seqs.length) return false
  return seqs.every(s => segmentAllowed(s, { allowTests, strictGit }))
}

/**
 * @param {string} grip
 * @param {{ kind?: string, rawInput?: { command?: string } }} toolCall
 * @param {{ allowTests?: boolean }} [opts] per-worker grant (grokctl spawn --allow-tests).
 *   When set it wins; when undefined we fall back to the global GROK_CC_ADVISE_TESTS env.
 *   Auto-allowing a test run is a write-then-run escalation (arbitrary project code), so
 *   it stays OFF by default — the grant is explicit and scoped to one worker. Never
 *   honored under `read`, which must stay genuinely read-only.
 * @returns {'allow'|'ask'}
 */
export function decideToolCall(grip, toolCall, { allowTests } = {}) {
  const command = toolCall?.rawInput?.command ?? ''
  const tests = allowTests ?? (process.env.GROK_CC_ADVISE_TESTS === '1')

  // A read/write/edit tool call carries no shell command; one that does is
  // mislabeled (kind is set by grok's tool layer, not the model, but defense in
  // depth is free). Route it through the shell whitelist instead of trusting the
  // kind — so `{ kind: 'read', rawInput: { command: 'rm -rf' } }` cannot ride the
  // read short-circuit past adviseAllowsShell.
  const fileKind = (toolCall?.kind === 'read' || toolCall?.kind === 'write' || toolCall?.kind === 'edit') && !command

  if (grip === 'advise') {
    // in-tree writes/edits are auto-allowed (fs-mediator still contains + audits them)
    if (fileKind) return 'allow'
    if (toolCall?.kind === 'execute' && adviseAllowsShell(command, { allowTests: tests })) return 'allow'
    return 'ask'
  }

  if (grip === 'read') {
    // The genuinely read-only grip. Reads auto-allow; read-only shell auto-allows
    // via the same whitelist as advise, MINUS test runners: a "read" grip that runs
    // `npm test` (arbitrary project code + writes) is not read-only, so it ignores
    // GROK_CC_ADVISE_TESTS. Writes/edits are NEVER auto-allowed — and decideToolCall
    // can only return allow|ask, so this is only half the fence: fs-mediator
    // .writeTextFile HARD-REFUSES under grip 'read' (a captain 'allow' to a write
    // ask still cannot land a byte). We return 'ask' so the attempt is surfaced.
    if (toolCall?.kind === 'read' && !command) return 'allow'
    if (toolCall?.kind === 'execute' && adviseAllowsShell(command, { allowTests: false, strictGit: true })) return 'allow'
    return 'ask'
  }

  if (grip === 'leash') {
    if (matchesAny(LEASH_DENY, command)) return 'ask'
    return 'allow'
  }

  // gate and any unknown grip
  return 'ask'
}
