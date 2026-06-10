# EAS cloud builds (with the Rust crypto)

Both `npx expo run:android` (local) and `eas build` (cloud) produce a real app
that runs the native Rust crypto — never Expo Go. Use EAS when you don't want the
local Android toolchain or want to share a build with testers.

## Profiles (`eas.json`)

| Profile | Output | Use |
|---|---|---|
| `development` | dev-client **APK**, internal | connects to Metro; everyday dev |
| `preview` | standalone **APK**, internal | QA / share a fixed build |
| `production` | **AAB** (autoIncrement) | Play Store |

```bash
eas build --profile development --platform android
eas build --profile preview     --platform android
eas build --profile production   --platform android
```

## How the Rust crypto gets built in the cloud

`package.json` → `eas-build-pre-install` runs `scripts/eas-build-rust.sh` on the
EAS Android builder: it installs Rust + cargo-ndk (into `/tmp` per the `env` in
`eas.json`) and runs `scripts/build.sh android` to produce
`android/app/src/main/jniLibs/<abi>/libsudoproto_ffi_mobile.so`. Those `.so` are
gitignored — built fresh each time, never committed.

## ⚠️ Prerequisite: this must be a git repo

EAS uploads the **git root** for a monorepo. The Rust source lives in
`../sdk-rust` and `../scripts` — *outside* `mobile/`. If the repo isn't a git
repository, EAS uploads only `mobile/` and the hook fails with
`sdk-rust not found`. Fix once, at the repo root:

```bash
cd /Users/sudip/SChat
git init && git add -A && git commit -m "init"
```

Then run `eas build` from `mobile/` as usual.

## Local builds are unaffected

`npm run rust:android` (→ `../scripts/build.sh android`) then `npx expo
run:android` still works the same — no git or cloud needed.

## Notes

- iOS isn't wired in the hook yet (its native module is still TODO; the
  XCFramework build will be added to `eas-build-rust.sh` then).
- If the cloud build can't find the NDK, set `ANDROID_NDK_HOME` in each profile's
  `env` (EAS Android images normally expose it).
- This cloud path is **unverified from here** (no EAS account/runner in this env);
  the first `eas build` may need a tweak to the NDK path or toolchain install.
