# Budgie for Android

Native Android client for Budgie's Google Sheets-backed budgeting workflow, with **Month Pace**
and **Recent Spend** home-screen widgets. It follows the web app's warm editorial palette and its
core data contract: the user's Google Sheet remains the source of truth.

## What it does

- **Today** shows spend, amount left, daily target, seven-day pace, end-of-month forecast, and a
  compact 14-day chart.
- **Add** appends an expense to the configured transaction tab when two-way sync is enabled.
- **Activity** shows the cached transaction history with category, date, and amount.
- **Settings** accepts a Sheet URL/ID, transaction and metadata tab names, first data row, monthly
  fallback budget, read-only/two-way mode, and arbitrary date/amount/note/category/subcategory
  column mappings.
- **Month Pace widget** mirrors the most useful dashboard card: spend, budget, amount left, pace,
  and last refresh.
- **Recent Spend widget** shows the latest three expenses; its `+` action opens Add directly.

The app renders cached data immediately. Loading, first-run empty, authorization-required,
offline/error, refreshing, and read-only states are explicit. WorkManager requests widget refreshes
about every 15 minutes when connected, the widget host asks every 30 minutes, and foreground writes
refresh both widgets immediately. Android may defer background work for battery health.

## Google authorization and safety

Budgie has no credential-bearing backend. Android preserves the web architecture by requesting the
same narrow `https://www.googleapis.com/auth/drive.file` scope through Google Play services and then
calling the Sheets API directly. Access tokens are short-lived and are not placed in source, build
configuration, or the release APK. Sheet configuration and the last-good cache live in Android's
private app preferences.

One-time Google Cloud setup is required for a new signing certificate:

1. In the same Google Cloud project used by `app.budgie.help`, create an **Android OAuth client**.
2. Use package `com.willcmcc.budgie` and the SHA-1 fingerprint printed by:
   `keytool -list -v -keystore /path/to/budgie-release.keystore -alias budgie`.
3. Keep the Sheets API enabled. Open/select the Sheet once in the Budgie web app so the shared
   Cloud project has `drive.file` access, then paste that Sheet URL into Android.

The APK download host is independent of Google authorization; no private/tailnet endpoint is baked
into the app.

## Build

Requirements: JDK 17 and an Android SDK containing platform/build-tools 36.

```bash
cd android
export JAVA_HOME=/path/to/jdk-17
export ANDROID_HOME=/path/to/android-sdk
./gradlew assembleDebug
```

Install a debug build:

```bash
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

## Signed release APK

Generate a private keystore once (never commit it):

```bash
mkdir -p "$HOME/.config/budgie-android"
keytool -genkeypair -v \
  -keystore "$HOME/.config/budgie-android/budgie-release.keystore" \
  -alias budgie -keyalg RSA -keysize 2048 -validity 10000
cp keystore.properties.example "$HOME/.config/budgie-android/keystore.properties"
```

Fill the properties file with the absolute keystore path and passwords, then run:

```bash
./scripts/build-release.sh
```

The result is `app/build/outputs/apk/release/app-release.apk`. The build fails if signing is absent,
so an accidentally unsigned "release" cannot be published. The reviewed APK is copied to
`demo/public/downloads/Budgie.apk`; `budgie-android.json` and `Budgie.apk.sha256` record its version,
build number, size, and digest.

## Install or upgrade on Pixel

1. Open the published `/downloads/Budgie.apk` URL on the phone.
2. Allow the browser to install unknown apps if Android asks, then choose **Install**.
3. Open Budgie, paste the same Google Sheet URL used by the web app, and tap **Connect** when asked.
4. Long-press the home screen and choose **Widgets → Budgie** to add Month Pace or Recent Spend.

Later APKs signed with this same key install in place and retain Sheet configuration, cache, and
widget instances. `adb install -r app-release.apk` does the same for USB installs.

