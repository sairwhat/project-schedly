# APK Release Guide (Manual / Local Builds)

This document explains how Android release APKs are produced and published for
Schedly **without GitHub Actions** (GitHub Actions is unavailable due to a
billing lock). Releases are built locally and published through the
**APK Release Manager** (external tool) using the files in this `apk/` folder.

---

## 1. Files in this folder

| File | Purpose |
|------|---------|
| `Schedly-<version>-release.apk` | Signed release APK for that version (e.g. `Schedly-1.4.2-release.apk`). |
| `releases.json` | Fixed list of the next available versions for the Release Manager's dropdown. |
| `README.md` | This file. |

`version.json` (repo root) is the in-app updater's source of truth:
it tells the app what the latest `versionCode`, `versionName`, `apkUrl`,
and `updateMessage` are.

---

## 2. Version scheme

We follow the live scheme where `versionCode` is derived as:

```
versionCode = major * 10000 + minor * 100 + patch
```

Examples:

| versionName | versionCode |
|-------------|-------------|
| 1.4.1       | 10401       |
| 1.4.2       | 10402       |
| 1.4.9       | 10409       |
| 1.5.0       | 10500       |
| 1.6.1       | 10601       |

The patch rolls `1.4.9 -> 1.5.0` automatically.

> Each new release must have a **higher `versionCode`** than what is currently
> live, otherwise the in-app updater will not prompt users.

---

## 3. Building a signed APK locally

Prerequisites: Android Studio / Android SDK installed, and the signing keystore
present at `android/app/release-key.keystore` (gitignored). Credentials live in
`android/local.properties` (also gitignored).

```bash
# 1. (optional) bump version in android/app/build.gradle
#    defaultConfig { versionCode 10402  versionName "1.4.2" }

# 2. Sync Capacitor native project
npx cap sync android

# 3. Build + sign the release APK
cd android
./gradlew assembleRelease
cd ..

# Output: android/app/build/outputs/apk/release/app-release.apk
```

Verify the result is signed and has the expected version:

```bash
# list version info
$ANDROID_SDK/build-tools/*/aapt2 dump badging \
  android/app/build/outputs/apk/release/app-release.apk

# confirm it is signed (exit 0 = OK)
$ANDROID_SDK/build-tools/*/apksigner verify \
  android/app/build/outputs/apk/release/app-release.apk
```

---

## 4. Publishing a version

1. Rename the built APK to match the version and place it in this folder:
   ```bash
   cp android/app/build/outputs/apk/release/app-release.apk \
      apk/Schedly-1.4.2-release.apk
   ```
2. Update `version.json` (repo root) so the in-app updater points at the new
   version:
   ```json
   {
     "versionCode": 10402,
     "versionName": "1.4.2",
     "apkUrl": "https://github.com/sairwhat/project-schedly/releases/download/v1.4.2/Schedly-1.4.2-release.apk",
     "updateMessage": "New version 1.4.2 is now available ..."
   }
   ```
3. Commit and push so the APK + metadata exist in the **repository**:
   ```bash
   git add apk/ version.json
   git commit -m "build: release Schedly-1.4.2"
   git push tropa master
   ```
4. In the **APK Release Manager**, choose the version from the dropdown and
   publish. The manager fetches `apk/Schedly-<version>-release.apk` from the
   repo and uploads it to Blob storage.

> The manager reads the APK **from the GitHub repo**, not your local disk.
> If you skip step 3 the manager will report `404 Could not fetch APK`.

---

## 5. Using `releases.json` (Release Manager dropdown)

`releases.json` is the fixed data source for the manager's version combobox.
It lists the next 20 versions so the text field can be replaced by a dropdown.

```json
{
  "current": { "versionName": "1.4.1", "versionCode": 10401 },
  "next": "1.4.2",
  "generatedAt": "2026-07-21",
  "versions": [
    {
      "versionName": "1.4.2",
      "versionCode": 10402,
      "apkUrl": "https://github.com/sairwhat/project-schedly/releases/download/v1.4.2/Schedly-1.4.2-release.apk",
      "updateMessage": "New version 1.4.2 is now available ..."
    }
    /* ... 1.4.3 .. 1.4.9, 1.5.0 .. 1.6.1 */
  ]
}
```

**How the manager should consume it:**

1. Replace the free-text version input with a `<select>` populated from
   `releases.json["versions"]`.
2. When a version is selected (e.g. `1.4.3`):
   - read its `apkUrl` / target file `apk/Schedly-1.4.3-release.apk`,
   - fetch that file from the repository,
   - upload it to Blob storage,
   - use its `updateMessage` for the in-app prompt.
3. The `next` field is a convenience pointer to the immediate next version.

> Only versions whose APK file has been built **and pushed to the repo** will
> succeed. Publishing a version listed in `releases.json` but missing its APK
> will 404 — build + push that APK first (Section 3–4).

---

## 6. Important notes

- **Do NOT change `applicationId` (`com.schedly.app`).** Changing the package
  name makes the app a separate install, not an update.
- **Signing key must stay consistent.** All releases are signed with
  `android/app/release-key.keystore`. If a device has an app installed from a
  different key, Android shows *"App not installed as package conflicts with an
  existing package"*. Fix: uninstall the old app once, then install the new one.
  After that, updates with the same key are seamless.
- `*.keystore`, `*.jks`, and `android/local.properties` are gitignored — the
  signing secret is never committed.
- The `.github/workflows/android-release.yml` workflow is kept in the repo but
  not used until GitHub Actions billing is resolved.
