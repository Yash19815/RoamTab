# Windows pre-push synchronization and Apps Script upload

The complete hook is [`scripts/pre-push`](../scripts/pre-push). Install it in the source repository's `.git/hooks/pre-push`, without an extension. Git for Windows executes its `#!/bin/sh` interpreter even when `git push` starts in PowerShell.

Each invocation copies the current working-tree `Code.js` from `D:\DATA\Documents(old)\projects\Main_Projects\travel-expense-excel` to `D:\DATA\Documents(old)\projects\Main_Projects\roamtab-template`, verifies the bytes, changes to the target directory, and runs `clasp push`. Missing inputs, copy errors, verification errors, and nonzero clasp exits abort the Git push with status 1. The script also rejects the current clasp English `Skipping push.` message, which can accompany status zero after a declined manifest update.

## Prerequisites

1. Install Git for Windows, Node.js supported by your clasp release, and clasp:

   ```powershell
   npm install -g @google/clasp
   clasp --version
   ```

2. Confirm the target repository exists and its `.clasp.json` points to the intended Apps Script project. `rootDir` must resolve to the target root containing `Code.js`. The hook checks for `.clasp.json`; it does not change that project mapping.
3. Enable the Google Apps Script API in [Apps Script user settings](https://script.google.com/home/usersettings). Authenticate and inspect the target's upload list:

   ```powershell
   Set-Location -LiteralPath 'D:\DATA\Documents(old)\projects\Main_Projects\roamtab-template'
   clasp login
   clasp status
   ```

4. Run `clasp push` interactively in that directory once when ready to upload. Resolve any manifest confirmation before relying on an unattended hook. The hook closes stdin so clasp cannot read Git's ref records. The skip-message check targets current English clasp output; review it if upgrading clasp or changing its output language.
5. In Git Bash, verify `command -v node` and `command -v clasp` succeed. PowerShell aliases/functions are unavailable to the hook. npm normally supplies a `clasp` shell launcher alongside `clasp.cmd` and `clasp.ps1`. Restart terminals and Git GUIs after changing PATH.

[`clasp push` uploads the target project's configured files](https://github.com/google/clasp), including its manifest and other nonignored files. It does not create a versioned web-app deployment. This hook copies only `Code.js`; keep the target's other required files synchronized separately. RoamTab's JSON dialog requires `TripJson.html`, which this hook does not copy.

## Install using Git Bash

The tracked script is the complete source; copying through `pre-push.new` preserves it for future reinstalls. `.gitattributes` enforces LF line endings. An existing hook is backed up before replacement.

```bash
cd 'D:/DATA/Documents(old)/projects/Main_Projects/travel-expense-excel' || exit 1
mkdir -p .git/hooks || exit 1
if [ -e .git/hooks/pre-push ]; then
  cp -p .git/hooks/pre-push ".git/hooks/pre-push.backup.$(date +%Y%m%d%H%M%S)" || exit 1
fi
cp scripts/pre-push .git/hooks/pre-push.new || exit 1
mv -f .git/hooks/pre-push.new .git/hooks/pre-push || exit 1
chmod +x .git/hooks/pre-push || exit 1
git config --local core.hooksPath .git/hooks
```

The commands create the hooks directory, copy the script, move it into its active filename, grant execute permission, and select the requested local directory. Setting `core.hooksPath` overrides any inherited hook directory for this repository. If an existing hook performs other work, combine its checks with this script before replacing it; the backup alone does not run those checks.

## Install using PowerShell

PowerShell delegates `chmod` to Git Bash. Use the Git for Windows Bash executable, not `C:\Windows\System32\bash.exe`, which can invoke WSL.

```powershell
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath 'D:\DATA\Documents(old)\projects\Main_Projects\travel-expense-excel'
$gitBash = 'C:\Program Files\Git\bin\bash.exe'
New-Item -ItemType Directory -Path '.git/hooks' -Force | Out-Null
if (Test-Path -LiteralPath '.git/hooks/pre-push') {
  $backupName = '.git/hooks/pre-push.backup.' + (Get-Date -Format 'yyyyMMddHHmmssfff')
  Copy-Item -LiteralPath '.git/hooks/pre-push' -Destination $backupName
}
$hookText = [System.IO.File]::ReadAllText((Join-Path $PWD 'scripts/pre-push'))
$hookText = $hookText.Replace("`r`n", "`n")
$utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText((Join-Path $PWD '.git/hooks/pre-push.new'), $hookText, $utf8WithoutBom)
Move-Item -LiteralPath '.git/hooks/pre-push.new' -Destination '.git/hooks/pre-push' -Force
& $gitBash --noprofile --norc -c 'chmod +x .git/hooks/pre-push'
if ($LASTEXITCODE -ne 0) { throw 'chmod failed' }
git config --local core.hooksPath .git/hooks
if ($LASTEXITCODE -ne 0) { throw 'Setting core.hooksPath failed' }
```

Reinstall after changing `scripts/pre-push`: the installed hook is a local copy. Git does not distribute `.git/hooks` to other clones.

## Verification

1. Check installation and syntax without uploading anything, from the source root in Git Bash:

   ```bash
   git config --show-origin --get core.hooksPath
   ls -l .git/hooks/pre-push
   cmp scripts/pre-push .git/hooks/pre-push
   sh -n .git/hooks/pre-push
   command -v clasp
   ```

   Expect `.git/hooks`, matching files, and exit status 0 from `cmp` and `sh -n`. The hook needs an LF-terminated first line and no UTF-8 BOM. `[ -f ... ]` and quoted paths handle spaces and parentheses.

2. Run the isolated regression tests:

   ```bash
   node --test tests/pre-push.test.cjs
   ```

   They use temporary source/target directories with spaces and parentheses, and a fake clasp. They verify copy success, overwrite behavior, target working directory, EOF on clasp stdin, missing inputs, copy failure, nonzero clasp failure, and a status-zero skipped upload. They never touch the real target or Google.

3. When ready for an actual copy and upload, invoke the installed hook manually:

   ```bash
   sh .git/hooks/pre-push origin manual-test </dev/null
   hook_status=$?
   printf 'Hook exit: %s\n' "$hook_status"
   ```

   Expect exit 0 and clasp's upload or already-up-to-date output. A nonzero clasp exit or detected skipped upload must yield hook exit 1. This step changes the real target file and can upload to Google; it does not push Git refs.

4. Verify local bytes and inspect the actual project:

   ```bash
   cmp 'D:/DATA/Documents(old)/projects/Main_Projects/travel-expense-excel/Code.js' \
       'D:/DATA/Documents(old)/projects/Main_Projects/roamtab-template/Code.js'
   cd 'D:/DATA/Documents(old)/projects/Main_Projects/roamtab-template' || exit 1
   clasp open-script
   ```

   `cmp` must return 0. Check `Code.js` in the Apps Script editor for a known current function/change. A zero clasp exit alone is not a remote byte-for-byte verification.

5. From the source repository, run your normal `git push`. The hook's copy and clasp messages should appear before Git sends updates. The hook runs once per invocation, regardless of branch or remote. The [Git pre-push contract](https://git-scm.com/docs/githooks#_pre_push) aborts ref updates when the hook exits nonzero. Do not use `git push --dry-run` as an upload-free check: hooks can still execute during a dry run.

## Behavior to account for

- The hook uploads the working-tree file, including uncommitted edits; it does not extract the commit being pushed. It also runs on branch deletions or a push that has no file changes.
- The target overwrite is intentional. No target commit or target Git push is performed. A failed upload leaves the copied file in the target for inspection and retry.
- Apps Script upload happens before the Git push finishes. A later network error or Git server rejection does not undo the upload.
- `git push --no-verify` bypasses pre-push hooks. Every clone needs its own installation.
- Removing the local override with `git config --local --unset core.hooksPath` restores inherited/default hook-directory behavior; it does not delete the installed hook.
