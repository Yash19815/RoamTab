const assert = require('node:assert/strict');
const { it } = require('node:test');
const { spawnSync } = require('node:child_process');
const { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const scriptPath = path.join(__dirname, '../scripts/pre-push');
const script = readFileSync(scriptPath, 'utf8');
const bash = process.platform === 'win32'
  ? path.join(process.env.ProgramFiles || 'C:/Program Files', 'Git/bin/bash.exe') : '/bin/bash';
const shellPath = value => value.replace(/\\/g, '/');
const posixPath = value => shellPath(value).replace(/^([A-Za-z]):/, (_, drive) => `/${drive.toLowerCase()}`);
const quote = value => `'${value.replace(/'/g, `'"'"'`)}'`;

function fixture(t, options = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'roamtab hooks (test) '));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, 'source repo (draft)');
  const target = path.join(root, 'target repo (template)');
  const bin = path.join(root, 'mock bin');
  const log = path.join(root, 'clasp.log');
  mkdirSync(source);
  mkdirSync(bin);
  if (!options.missingTarget) {
    mkdirSync(target);
    if (!options.missingConfig) writeFileSync(path.join(target, '.clasp.json'), '{"scriptId":"test-only"}\n');
  }
  if (!options.missingSource) writeFileSync(path.join(source, 'Code.js'), '// Current working-tree script\nconst amount = 42;\n');
  const hook = path.join(root, 'pre-push');
  // Substitute only the two deployment paths; all hook logic runs unchanged.
  const sourceLine = /^SOURCE_REPO=.*$/m;
  const targetLine = /^TARGET_REPO=.*$/m;
  assert.ok(sourceLine.test(script));
  assert.ok(targetLine.test(script));
  writeFileSync(hook, script.replace(sourceLine, `SOURCE_REPO=${quote(shellPath(source))}`)
    .replace(targetLine, `TARGET_REPO=${quote(shellPath(target))}`));
  writeFileSync(path.join(bin, 'clasp'), [
    '#!/bin/sh',
    '{',
    '  if command -v cygpath >/dev/null 2>&1; then cygpath -m "$PWD"; else printf "%s\\n" "$PWD"; fi',
    '  printf "%s\\n" "$@"',
    '} > "$HOOK_TEST_LOG"',
    'if IFS= read -r record; then',
    '  printf "clasp received Git stdin unexpectedly\\n" >&2',
    '  exit 97',
    'fi',
    'printf "%s\\n" "${HOOK_TEST_OUTPUT:-Mock upload completed.}"',
    'exit "${HOOK_TEST_STATUS:-0}"',
    ''
  ].join('\n'), { mode: 0o755 });
  const env = {};
  // Windows environment keys are case-insensitive; do not send both Path and PATH.
  for (const [key, value] of Object.entries(process.env)) {
    if (key.toUpperCase() !== 'PATH') env[key] = value;
  }
  env.PATH = `${posixPath(bin)}:/usr/bin:/bin`;
  env.HOOK_TEST_BIN = posixPath(bin);
  env.HOOK_TEST_LOG = shellPath(log);
  const run = overrides => spawnSync(bash, ['--noprofile', '--norc', '-c',
    'PATH="$HOOK_TEST_BIN:/usr/bin:/bin"; export PATH; exec /bin/sh "$1" origin test-only',
    'hook-test', shellPath(hook)], {
    cwd: root, env: { ...env, ...overrides }, encoding: 'utf8',
    input: 'refs/heads/main old-id refs/heads/main new-id\n', timeout: 10000
  });
  return { source, target, bin, log, hook, run };
}

it('keeps the executable hook source LF-only with a valid shebang and shell syntax', () => {
  assert.ok(script.startsWith('#!/bin/sh\n'));
  assert.equal(script.includes('\r'), false);
  const result = spawnSync(bash, ['--noprofile', '--norc', '-n', shellPath(scriptPath)], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || String(result.error));
});

it('overwrites Code.js byte-for-byte, runs clasp push in the target, and isolates stdin', t => {
  const state = fixture(t);
  writeFileSync(path.join(state.target, 'Code.js'), '// Old target script\n');
  const result = state.run();
  assert.equal(result.status, 0, result.stderr || String(result.error));
  assert.deepEqual(readFileSync(path.join(state.source, 'Code.js')), readFileSync(path.join(state.target, 'Code.js')));
  const [cwd, command] = readFileSync(state.log, 'utf8').trim().split('\n');
  assert.equal(cwd.toLowerCase(), shellPath(state.target).toLowerCase());
  assert.equal(command, 'push');
  assert.match(result.stdout, /Copy verified and clasp push completed/);
});

for (const [options, message] of [
  [{ missingSource: true }, /Source file missing/],
  [{ missingTarget: true }, /Target directory missing/],
  [{ missingConfig: true }, /Target .clasp.json missing/]
]) {
  it(`aborts before clasp: ${JSON.stringify(options)}`, t => {
    const state = fixture(t, options);
    const result = state.run();
    assert.equal(result.status, 1, result.stderr || String(result.error));
    assert.match(result.stderr, message);
    assert.equal(existsSync(state.log), false);
  });
}

it('rejects a directory named Code.js instead of silently copying inside it', t => {
  const state = fixture(t);
  mkdirSync(path.join(state.target, 'Code.js'));
  const result = state.run();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Code.js is a directory/);
  assert.equal(existsSync(state.log), false);
});

for (const command of ['cp', 'cmp']) {
  it(`aborts before clasp when ${command} fails`, t => {
    const state = fixture(t);
    writeFileSync(path.join(state.bin, command), '#!/bin/sh\nexit 37\n', { mode: 0o755 });
    const result = state.run();
    assert.equal(result.status, 1);
    assert.match(result.stderr, command === 'cp' ? /Copy failed/ : /Copied file differs/);
    assert.equal(existsSync(state.log), false);
  });
}

it('returns 1 when clasp returns a different nonzero status and leaves the copied file', t => {
  const state = fixture(t);
  const result = state.run({ HOOK_TEST_STATUS: '23', HOOK_TEST_OUTPUT: 'Authentication failed.' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Authentication failed/);
  assert.match(result.stderr, /clasp push failed/);
  assert.deepEqual(readFileSync(path.join(state.source, 'Code.js')), readFileSync(path.join(state.target, 'Code.js')));
});

it('rejects clasp status zero when an unattended manifest update was skipped', t => {
  const state = fixture(t);
  const result = state.run({ HOOK_TEST_OUTPUT: 'Skipping push.' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /clasp skipped the upload/);
});

it('accepts an already-up-to-date clasp result', t => {
  const state = fixture(t);
  const result = state.run({ HOOK_TEST_OUTPUT: 'Script is already up to date.' });
  assert.equal(result.status, 0, result.stderr);
});
