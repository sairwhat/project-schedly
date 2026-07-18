<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:release-pipeline -->
# Android Release Pipeline

Two separate GitHub Actions workflows manage the Android release lifecycle:

## CI Pipeline (`.github/workflows/ci.yml`)
- **Trigger:** Every push/PR to `main`
- **Purpose:** Verify the project builds successfully
- **Does:**
  - TypeScript type check
  - Lint
  - Next.js build
  - Capacitor sync
  - Android release APK build (unsigned)
  - Upload APK as ephemeral artifact (7-day retention)
- **Does NOT:**
  - Increment versions
  - Create releases
  - Upload public APKs
  - Modify `version.json`
  - Push commits

## Release Pipeline (`.github/workflows/android-release.yml`)
- **Trigger:** Git tag `v*` pushed, OR manual `workflow_dispatch` with version name
- **Purpose:** Build, sign, and publish a production APK
- **Does:**
  - Derives versionName and versionCode from the tag (e.g., `v1.3` → name=`1.3`, code=`13`)
  - Updates `android/app/build.gradle` with new version
  - Updates `version.json` with new version and APK download URL
  - Next.js build → Capacitor sync → Android release build
  - Signs APK (via GitHub Secrets keystore, or auto-generated debug keystore)
  - Renames APK to `Schedly-{versionName}-release.apk`
  - Creates GitHub Release with APK asset
  - Updates `version.json` `apkUrl` to point to GitHub Release download
  - Commits and pushes updated `build.gradle` and `version.json` back to `main`

## How to Release a New Version

### Option A: Tag push (recommended)
```bash
# Update version locally, commit, tag, and push
git tag v1.3
git push origin v1.3
```

### Option B: Manual workflow dispatch
1. Go to GitHub → Actions → Android Release → Run workflow
2. Enter version name (e.g., `1.3`)
3. The pipeline creates the tag, release, and commits version files

## GitHub Secrets Required (for production signing)

| Secret | Description |
|--------|-------------|
| `KEYSTORE_BASE64` | Base64-encoded release keystore file |
| `KEYSTORE_PASSWORD` | Keystore password |
| `KEY_ALIAS` | Key alias |
| `KEY_PASSWORD` | Key password |

If `KEYSTORE_BASE64` is not set, the pipeline auto-generates a debug keystore. Debug-signed APKs are NOT suitable for production distribution.

## Helper Scripts

- `scripts/update-versions.sh` — Updates `build.gradle` and `version.json` with a given version name, version code, and APK URL.

## version.json format

Used by the existing in-app update system. Automatically updated by the release pipeline:

```json
{
  "versionCode": 13,
  "versionName": "1.3",
  "apkUrl": "https://github.com/sairwhat/project-schedly/releases/download/v1.3/Schedly-1.3-release.apk",
  "updateMessage": "New version 1.3 is now available with bug fixes, performance improvements, and new features!"
}
```
<!-- END:release-pipeline -->
