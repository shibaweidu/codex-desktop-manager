# Windows GitHub Release

This fork publishes Windows releases through GitHub Actions only. It does not
use the upstream R2/S3 mirrors or Apple signing pipeline.

## One-time setup

1. Keep the repository public so installed clients can download `latest.json`
   and updater bundles without a GitHub login.
2. In the GitHub repository, open **Settings > Secrets and variables > Actions**.
3. Create the repository secret `TAURI_SIGNING_PRIVATE_KEY` with the complete
   contents of the private updater key created for this fork. Never commit that
   file or share it in a release.

The public half of this key is compiled into `src-tauri/tauri.conf.json` and is
safe to commit. Its private half is stored locally at
`C:\Users\Administrator\.tauri\codex-desktop-manager-update.key`.

## Publish a release

1. Change the version in `package.json`, `src-tauri/tauri.conf.json`, and
   `src-tauri/Cargo.toml` to the same value, for example `0.5.1`.
2. Commit and push the version change.
3. Create and push the matching tag:

```powershell
git tag v0.5.1
git push origin v0.5.1
```

The `Release Windows` workflow builds the NSIS installer, signs that installer
for the Tauri updater, generates its `.sig` file and `latest.json`, then
attaches all of them to the GitHub Release. Users manually download the
`*-setup.exe`; installed clients use `latest.json` to check for a newer version.

Do not delete or rotate the updater private key after distributing a release:
older clients only trust updates signed by its matching public key.
