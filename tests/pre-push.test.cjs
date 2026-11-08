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

function fixture(t, options = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'roamtab hooks (test) '));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, 'source repo (draft)');
  const target = path.join(root, 'target repo (template)');
  const bin = path.join(root, 'mock bin');
  const log = path.join(root, 'clasp.log');
  mkdirSync(source);
  const initialized = spawnSync('git', ['init', '--quiet', source], { encoding: 'utf8' });
  assert.equal(initialized.status, 0, initialized.stderr || String(initialized.error));
  mkdirSync(bin);
  if (!options.missingSourceConfig) writeFileSync(path.join(source, '.clasp.json'), '{"scriptId":"test-main-only"}\n');
  if (!options.missingTarget) {
    mkdirSync(target);
    if (!options.missingConfig) writeFileSync(path.join(target, '.clasp.json'), '{"scriptId":"test-only"}\n');
  }
  if (!options.missingSource) writeFileSync(path.join(source, 'Code.js'), '// Current working-tree script\nconst amount = 42;\n');
  const hook = path.join(root, 'pre-push');
  // Run the hook unchanged in a real temporary checkout with an environment-configured template.
  writeFileSync(hook, script);
  writeFileSync(path.join(bin, 'clasp'), [
    '#!/bin/sh',
    '{',
    '  if command -v cygpath >/dev/null 2>&1; then cygpath -m "$PWD"; else printf "%s\\n" "$PWD"; fi',
    '  printf "%s\\n" "$@"',
    '} >> "$HOOK_TEST_LOG"',
    'if IFS= read -r record; then',
    '  printf "clasp received Git stdin unexpectedly\\n" >&2',
    '  exit 97',
    'fi',
    'case "$PWD" in',
    '  *"/source repo (draft)")',
    '    printf "%s\\n" "${HOOK_TEST_MAIN_OUTPUT:-${HOOK_TEST_OUTPUT:-Mock upload completed.}}"',
    '    exit "${HOOK_TEST_MAIN_STATUS:-${HOOK_TEST_STATUS:-0}}"',
    '    ;;',
    'esac',
    'printf "%s\\n" "${HOOK_TEST_OUTPUT:-Mock upload completed.}"',
    'exit "${HOOK_TEST_STATUS:-0}"',
    ''
  ].join('\n'), { mode: 0o755 });
  const env = {};
  // Windows environment keys are case-insensitive; do not send both Path and PATH.
  for (const [key, value] of Object.entries(process.env)) {
    if (!['PATH', 'ROAMTAB_TEMPLATE_REPO'].includes(key.toUpperCase()) && !key.startsWith('GIT_')) env[key] = value;
  }
  env.PATH = `${posixPath(bin)}:/cmd:/mingw64/bin:/usr/bin:/bin`;
  env.HOOK_TEST_BIN = posixPath(bin);
  env.HOOK_TEST_LOG = shellPath(log);
  env.ROAMTAB_TEMPLATE_REPO = shellPath(target);
  const run = (overrides, workingDirectory = source) => spawnSync(bash, ['--noprofile', '--norc', '-c',
    'PATH="$HOOK_TEST_BIN:/cmd:/mingw64/bin:/usr/bin:/bin"; export PATH; exec /bin/sh "$1" origin test-only',
    'hook-test', shellPath(hook)], {
    cwd: workingDirectory, env: { ...env, ...overrides }, encoding: 'utf8',
    input: 'refs/heads/main old-id refs/heads/main new-id\n', timeout: 10000
  });
  return { root, source, target, bin, log, hook, run };
}

it('keeps the executable hook source LF-only with a valid shebang and shell syntax', () => {
  assert.ok(script.startsWith('#!/bin/sh\n'));
  assert.equal(script.includes('\r'), false);
  const result = spawnSync(bash, ['--noprofile', '--norc', '-n', shellPath(scriptPath)], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || String(result.error));
});

it('overwrites Code.js byte-for-byte, uploads template then main, and isolates stdin for both', t => {
  const state = fixture(t);
  writeFileSync(path.join(state.target, 'Code.js'), '// Old target script\n');
  const result = state.run();
  assert.equal(result.status, 0, result.stderr || String(result.error));
  assert.deepEqual(readFileSync(path.join(state.source, 'Code.js')), readFileSync(path.join(state.target, 'Code.js')));
  const [cwd, command, mainCwd, mainCommand, ...extra] = readFileSync(state.log, 'utf8').trim().split('\n');
  assert.equal(cwd.toLowerCase(), shellPath(state.target).toLowerCase());
  assert.equal(command, 'push');
  assert.equal(mainCwd.toLowerCase(), shellPath(state.source).toLowerCase());
  assert.equal(mainCommand, 'push');
  assert.deepEqual(extra, []);
  assert.match(result.stdout, /Copy verified and clasp push completed/);
});

for (const [options, message] of [
  [{ missingSource: true }, /Source file missing/],
  [{ missingSourceConfig: true }, /Source .clasp.json missing/],
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
  assert.equal(readFileSync(state.log, 'utf8').trim().split('\n').length, 2, 'Main upload must not run after template failure');
  assert.deepEqual(readFileSync(path.join(state.source, 'Code.js')), readFileSync(path.join(state.target, 'Code.js')));
});

it('rejects clasp status zero when an unattended manifest update was skipped', t => {
  const state = fixture(t);
  const result = state.run({ HOOK_TEST_OUTPUT: 'Skipping push.' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /clasp skipped the upload/);
  assert.match(result.stderr, /template project/);
  assert.equal(readFileSync(state.log, 'utf8').trim().split('\n').length, 2);
});

it('aborts the Git push when main upload fails after template succeeds', t => {
  const state = fixture(t);
  const result = state.run({ HOOK_TEST_MAIN_STATUS: '23', HOOK_TEST_MAIN_OUTPUT: 'Main authentication failed.' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Main authentication failed/);
  assert.match(result.stderr, /clasp push failed for main project/);
  assert.equal(readFileSync(state.log, 'utf8').trim().split('\n').length, 4);
  assert.deepEqual(readFileSync(path.join(state.source, 'Code.js')), readFileSync(path.join(state.target, 'Code.js')));
});

it('aborts the Git push when only the main upload is skipped with status zero', t => {
  const state = fixture(t);
  const result = state.run({ HOOK_TEST_MAIN_OUTPUT: 'Skipping push.' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /clasp skipped the upload for main project/);
  assert.equal(readFileSync(state.log, 'utf8').trim().split('\n').length, 4);
});

it('accepts an already-up-to-date clasp result', t => {
  const state = fixture(t);
  const result = state.run({ HOOK_TEST_OUTPUT: 'Script is already up to date.' });
  assert.equal(result.status, 0, result.stderr);
});

for (const [value, message] of [
  ['', /Set ROAMTAB_TEMPLATE_REPO/],
  ['relative/template', /must be an absolute path/]
]) {
  it(`rejects missing or relative template configuration ${JSON.stringify(value)} before copying`, t => {
    const state = fixture(t);
    const targetFile = path.join(state.target, 'Code.js');
    writeFileSync(targetFile, '// Unchanged template\n');
    const result = state.run({ ROAMTAB_TEMPLATE_REPO: value });
    assert.equal(result.status, 1);
    assert.match(result.stderr, message);
    assert.equal(readFileSync(targetFile, 'utf8'), '// Unchanged template\n');
    assert.equal(existsSync(state.log), false);
  });
}

it('rejects the source repository as the template checkout', t => {
  const state = fixture(t);
  const result = state.run({ ROAMTAB_TEMPLATE_REPO: shellPath(state.source) });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /different checkout/);
  assert.equal(existsSync(state.log), false);
});

it('accepts a native Windows path from the environment', { skip: process.platform !== 'win32' }, t => {
  const state = fixture(t);
  const result = state.run({ ROAMTAB_TEMPLATE_REPO: state.target });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(readFileSync(path.join(state.source, 'Code.js')), readFileSync(path.join(state.target, 'Code.js')));
});

it('detects the source root when run from a checkout subdirectory', t => {
  const state = fixture(t);
  const nested = path.join(state.source, 'nested folder');
  mkdirSync(nested);
  const result = state.run({}, nested);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(readFileSync(path.join(state.source, 'Code.js')), readFileSync(path.join(state.target, 'Code.js')));
});

it('fails outside a Git checkout before copying or uploading', t => {
  const state = fixture(t);
  const result = state.run({}, state.root);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Cannot detect source repository/);
  assert.equal(existsSync(path.join(state.target, 'Code.js')), false);
  assert.equal(existsSync(state.log), false);
});
