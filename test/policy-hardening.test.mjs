/**
 * Failing tests that lock the post-0.2.0 adviseAllowsShell rewrite (PLAN-0.2.0 item 1).
 *
 * Expected failures against today's lib/policy.mjs (pre-fix):
 *
 * ASK that currently ALLOW (must flip to ask after fix):
 *   - newline / CR / comment-newline / U+2028 smuggles  — backlog 0006
 *     (control-char class not rejected; only first line's head is matched)
 *
 * ALLOW that currently ASK (must flip to allow after fix):
 *   - `cat a && cat b`, `ls && rg foo .`                — backlog 0001
 *     (`&&` trips the bare-`&` branch of /[;&`<>]/ before any segment split)
 *   - head / wc / sed -n / test / find as heads         — backlog 0002
 *     (not in ADVISE_ALLOW; head/wc only in SAFE_FILTER as pipe tails)
 *
 * Cases that already pass today still assert the intended post-fix behavior
 * (metachar reject, danger flags, safe pipes, existing heads). Do not weaken
 * any assertion to make this file green before the rewrite lands.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
const { decideToolCall } = await import('../lib/policy.mjs')

const exec = cmd => ({ kind: 'execute', title: `Execute \`${cmd}\``, rawInput: { variant: 'Bash', command: cmd } })
const decide = cmd => decideToolCall('advise', exec(cmd))

// Build control chars with String.fromCharCode — never raw control literals.
const NL = String.fromCharCode(10)   // \n
const CR = String.fromCharCode(13)   // \r
const LS = String.fromCharCode(0x2028) // U+2028 LINE SEPARATOR

// ─── ASK: must not auto-allow ───────────────────────────────────────────────

test('advise asks on newline-smuggled second command (0006)', () => {
  const c = 'cat a' + NL + 'rm -rf x'
  assert.equal(decide(c), 'ask', 'newline between cat and rm must ask')
})

test('advise asks on CR-smuggled second command (0006)', () => {
  const c = 'cat a' + CR + 'rm -rf x'
  assert.equal(decide(c), 'ask', 'CR between cat and rm must ask')
})

test('advise asks on comment-newline smuggle (0006)', () => {
  const c = 'cat a #' + NL + 'rm -rf x'
  assert.equal(decide(c), 'ask', 'comment-eaten first line + newline + rm must ask')
})

test('advise asks on U+2028-smuggled second command (0006)', () => {
  const c = 'cat a' + LS + 'rm -rf x'
  assert.equal(decide(c), 'ask', 'U+2028 LINE SEPARATOR between cat and rm must ask')
})

test('advise asks on bare & background', () => {
  assert.equal(decide('cat a & cat b'), 'ask', 'bare & background must ask')
})

test('advise asks on semicolon chain', () => {
  assert.equal(decide('cat a; rm -rf x'), 'ask', '; chain must ask')
})

test('advise asks when && RHS is not allow-listed (0001)', () => {
  assert.equal(decide('cat a && rm -rf x'), 'ask', 'cat && rm must ask (RHS not allow-listed)')
})

test('advise asks on || with dangerous RHS (accidental safety preserved)', () => {
  assert.equal(decide('cat a || rm -rf x'), 'ask', '|| with rm RHS must ask')
})

test('advise asks on |& with dangerous RHS (accidental safety preserved)', () => {
  assert.equal(decide('cat a |& rm -rf x'), 'ask', '|& with rm RHS must ask')
})

test('advise asks on backtick substitution', () => {
  assert.equal(decide('cat `payload`'), 'ask', 'backtick substitution must ask')
})

test('advise asks on $(...) command substitution', () => {
  assert.equal(decide('cat $(payload)'), 'ask', '$(...) substitution must ask')
})

test('advise asks on process substitution <(...)', () => {
  assert.equal(decide('cat <(payload)'), 'ask', 'process substitution <(...) must ask')
})

test('advise asks on > redirect', () => {
  assert.equal(decide('cat a > /tmp/out'), 'ask', '> redirect must ask')
})

test('advise asks on sed -i (write-in-place danger guard, 0002)', () => {
  assert.equal(decide('sed -i s/a/b/ f'), 'ask', 'sed -i must ask')
})

test('advise asks on bare sed without -n (0002)', () => {
  assert.equal(decide('sed s/a/b/ f'), 'ask', 'bare sed (no -n) must ask')
})

test('advise asks on find -delete (0002)', () => {
  assert.equal(decide('find . -delete'), 'ask', 'find -delete must ask')
})

test('advise asks on find -exec (0002)', () => {
  assert.equal(decide('find . -exec rm {} ;'), 'ask', 'find -exec must ask')
})

test('advise asks on rg --pre (danger flag)', () => {
  assert.equal(decide('rg --pre sh x'), 'ask', 'rg --pre must ask')
})

test('advise asks when pipe target is not a safe filter', () => {
  assert.equal(decide('cat a | sh'), 'ask', 'pipe to non-filter sh must ask')
})

// ─── ALLOW: must still auto-allow (no regression / intended expansion) ──────

test('advise allows existing read-only heads', () => {
  for (const c of ['cat a', 'ls -la', 'rg -n foo src/', 'git status', 'git diff'])
    assert.equal(decide(c), 'allow', c)
})

test('advise allows allowed head piped to safe filter', () => {
  assert.equal(decide('cat a | tail -40'), 'allow', 'cat | tail must allow')
})

test('advise allows npm test 2>&1 | tail when GROK_CC_ADVISE_TESTS=1', () => {
  process.env.GROK_CC_ADVISE_TESTS = '1'
  try {
    assert.equal(decide('npm test 2>&1 | tail -5'), 'allow', 'npm test 2>&1 | tail -5 under ADVISE_TESTS must allow')
  } finally {
    delete process.env.GROK_CC_ADVISE_TESTS
  }
})

test('advise allows && of two allow-listed heads (0001)', () => {
  assert.equal(decide('cat a && cat b'), 'allow', 'cat a && cat b must allow')
})

test('advise allows && of ls and rg (0001)', () => {
  assert.equal(decide('ls && rg foo .'), 'allow', 'ls && rg foo . must allow')
})

test('advise allows head as head (0002)', () => {
  assert.equal(decide('head -20 f'), 'allow', 'head -20 f must allow')
})

test('advise allows wc as head (0002)', () => {
  assert.equal(decide('wc -l f'), 'allow', 'wc -l f must allow')
})

test('advise asks on sed even with -n (admits -i / e — audit)', () => {
  assert.equal(decide('sed -n 1,10p f'), 'ask', 'sed dropped from heads; -n still admits -i/e')
})

test('advise allows test as head (0002)', () => {
  assert.equal(decide('test -f f'), 'allow', 'test -f f must allow')
})

test('advise allows find with read-ish predicates (0002)', () => {
  assert.equal(decide('find . -name x'), 'allow', 'find . -name x must allow')
})

// ─── Adversarial audit findings (fresh Grok pass on the v1 fix) ─────────────

test('advise asks on sed -i in-place write (audit)', () => {
  assert.equal(decide('sed -n -i s/a/b/ f'), 'ask', 'sed -n -i writes in place')
})

test("advise asks on sed's exec flag (audit)", () => {
  assert.equal(decide('sed -n s/.*/id/e f'), 'ask', 'sed s///e executes shell')
})

test('advise asks on sort -o write via filter position (audit)', () => {
  assert.equal(decide('cat a | sort -o /tmp/pwned'), 'ask', 'sort -o writes a file')
})

test('advise asks on uniq OUTPUT write via filter position (audit)', () => {
  assert.equal(decide('cat a | uniq /dev/null /tmp/pwned'), 'ask', 'uniq positional output writes a file')
})

test('advise asks on quote-evaded find -delete (audit)', () => {
  assert.equal(decide('find . -"delete"'), 'ask', 'quotes must not hide -delete')
})

test('advise asks on backslash-evaded find -delete (audit)', () => {
  assert.equal(decide('find . -delet\\e'), 'ask', 'backslash must not hide -delete')
})

test('advise asks on quote-evaded rg --pre (audit)', () => {
  assert.equal(decide('rg --pre"" sh x .'), 'ask', 'quotes must not hide --pre')
})

test('advise asks on quote-evaded git --output (audit)', () => {
  assert.equal(decide('git log --output""=/tmp/x'), 'ask', 'quotes must not hide --output')
})

// ─── Second adversarial audit: shell string-transforms defeat raw-string regex ──
// v2 stripped quotes/backslashes, but brace expansion and ANSI-C quoting still
// reconstruct danger flags or inject separators. v3 rejects the shell machinery
// characters outright (quotes, backslash, $, braces, parens, backtick, ; <> &),
// keeping only globs. Cost: quoted/braced/$-bearing commands now ask.

test('advise asks on brace-expanded find -delete (audit 2)', () => {
  assert.equal(decide('find . -name x -{delete,print}'), 'ask', 'brace expansion must not hide -delete')
})

test('advise asks on ANSI-C newline injection (audit 2)', () => {
  const q = String.fromCharCode(39), bs = String.fromCharCode(92)
  assert.equal(decide('cat a$' + q + bs + 'n' + q + 'rm -rf x'), 'ask', "$'\\n' expands to a command separator")
})

test('advise asks on ANSI-C reconstructed flag (audit 2)', () => {
  const q = String.fromCharCode(39)
  assert.equal(decide('find . -name x $' + q + '-delete' + q), 'ask', "$'-delete' reconstructs the flag")
})

test('advise asks on any $ expansion (audit 2)', () => {
  assert.equal(decide('cat a$(printf x)'), 'ask', 'command substitution must ask')
  assert.equal(decide('cat ${IFS}a'), 'ask', 'parameter expansion must ask')
})

// v3 no longer strips quotes, so quoted forms now ASK (safe over-rejection).
// Unquoted plain reads and globs remain the auto-allow path.
test('advise asks on quoted commands but allows unquoted reads + globs (audit 2)', () => {
  assert.equal(decide('rg "async fn" .'), 'ask', 'quoted multi-word pattern now asks (machinery)')
  assert.equal(decide('rg async src/'), 'allow', 'unquoted single-word search still allows')
  assert.equal(decide('cat *.js'), 'allow', 'glob still allows — expands to filenames, not commands')
})

// ─── Third audit: whitelist model (bulletproof — unknown flags ask) ─────────
// Feature-rich tools (rg/git/find) self-exec via their own flags/config, and the
// dangerous-flag set is open-ended. So auto-allow flips to a whitelist: only
// recognized read-only options pass; anything unknown asks.

test('advise asks on rg --hostname-bin exec flag (audit 3)', () => {
  assert.equal(decide('rg --hostname-bin /tmp/x foo'), 'ask', 'rg --hostname-bin runs a program')
})

test('advise asks on any unknown rg flag (whitelist, audit 3)', () => {
  assert.equal(decide('rg --frobnicate foo'), 'ask', 'unrecognized rg flag must ask')
})

test('advise asks on git --ext-diff / --textconv (audit 3)', () => {
  assert.equal(decide('git log -p --ext-diff'), 'ask', 'ext-diff runs a configured command')
  assert.equal(decide('git diff --textconv'), 'ask', 'textconv runs a configured command')
})

test('advise asks on unknown find predicate (whitelist, audit 3)', () => {
  assert.equal(decide('find . -frobnicate'), 'ask', 'unrecognized find predicate must ask')
})

test('advise still auto-allows common review commands (audit 3)', () => {
  for (const c of [
    'grep -rniE foo src/',        // grep is fully safe with any flags
    'git log --oneline --graph --stat -p',
    'git log -3',                 // count shorthand
    'git diff --stat -w',
    'rg -n -i foo src/',
    'rg -niw foo .',              // combined shorts
    'rg -A3 foo .',               // attached numeric
    'find . -name x -type f -maxdepth 2',
    'rg -n foo src/ | head -5',
  ]) assert.equal(decide(c), 'allow', c)
})
