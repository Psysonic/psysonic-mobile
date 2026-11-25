// ⚠️ Android territory. Run after `tauri android init` (CI and local builds): the
// generated Gradle project under `src-tauri/gen/android` is not in git, so whatever the
// Android app needs beyond Tauri's template is added here. Every step is idempotent.
//
// - every `*.kt` in this folder into the app's package (our MainActivity replaces the
//   template's; PsysonicMedia + PsysonicMediaService: lock screen and background play;
//   PsysonicAutoService: Android Auto; PsysonicDownloadService: whole-library downloads
//   in the background; PsysonicWidgets: home screen widgets and Quick Settings tiles), and
//   everything under `res/` into the app's res/;
// - the manifest entries those need (services, Android Auto, permissions);
// - Gradle dependencies: `androidx.media` (MediaSession, media notification), Media3's
//   ExoPlayer (PsysonicCarPlayer: Android Auto with the app closed) and the
//   Kotlin half of `rustls-platform-verifier` (reqwest checks certificates through
//   Android's trust store). The verifier ships it as a local Maven repository; its path
//   comes from `cargo metadata`, so the version always matches Cargo.lock;
// - the beta build (`PSYSONIC_ANDROID_BETA=1`): own application id and name, so the tester
//   APK installs next to the Play version.

import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const srcTauri = resolve(here, '..');
const appDir = join(srcTauri, 'gen', 'android', 'app');
const gradleFile = join(appDir, 'build.gradle.kts');
const manifestFile = join(appDir, 'src', 'main', 'AndroidManifest.xml');
const packageDir = join(appDir, 'src', 'main', 'java', 'dev', 'psysonic', 'player');

const ANDROIDX_MEDIA = 'androidx.media:media:1.7.0';
const MEDIA3_EXOPLAYER = 'androidx.media3:media3-exoplayer:1.11.1';

/** Ends every line this script adds to build.gradle.kts (see the Gradle step). */
const GRADLE_TAG = '// psysonic-gen';
/** Markers of an older version of this script, which added each block only once. */
const LEGACY_MARKER = /<!-- psysonic: |\/\/ psysonic: /;
const REGENERATE = 'delete src-tauri/gen/android, then run `npx tauri android init --ci`, this script and '
  + '`npx tauri icon src-tauri/icons/ios-app-icon.png`';

// A generated project lives on between local builds: what this script put there and later
// dropped must go again, or a removed Kotlin file or resource stays in the next APK.

// ── Kotlin sources. The template's only file in the package is the MainActivity this
// folder replaces (its own code sits in `generated/`), so any other top-level `.kt` is ours.
const kotlinSources = readdirSync(here).filter(f => f.endsWith('.kt'));
for (const file of kotlinSources) {
  copyFileSync(join(here, file), join(packageDir, file));
}
for (const entry of readdirSync(packageDir, { withFileTypes: true })) {
  if (entry.isFile() && entry.name.endsWith('.kt') && !kotlinSources.includes(entry.name)) {
    rmSync(join(packageDir, entry.name));
    console.log(`[patch-gen] removed ${entry.name} (no longer in src-tauri/android)`);
  }
}

// ── Resources: everything under ./res (drawables, xml) into the app's res/. The template has
// files of its own there, so what came from here is listed, and only that list is cleaned up.
const resSource = join(here, 'res');
const resTarget = join(appDir, 'src', 'main', 'res');
const resRecord = join(appDir, 'psysonic-res.json');
const copiedRes = [];
for (const folder of readdirSync(resSource)) {
  mkdirSync(join(resTarget, folder), { recursive: true });
  for (const file of readdirSync(join(resSource, folder))) {
    copyFileSync(join(resSource, folder, file), join(resTarget, folder, file));
    copiedRes.push(`${folder}/${file}`);
  }
}
const previousRes = existsSync(resRecord) ? JSON.parse(readFileSync(resRecord, 'utf8')) : [];
for (const stale of previousRes.filter(path => !copiedRes.includes(path))) {
  rmSync(join(resTarget, stale), { force: true });
  console.log(`[patch-gen] removed res/${stale} (no longer in src-tauri/android/res)`);
}
writeFileSync(resRecord, `${JSON.stringify(copiedRes, null, 2)}\n`);

// ── Manifest: each permission and the service only once
const PERMISSIONS = [
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK',
  'android.permission.FOREGROUND_SERVICE_DATA_SYNC',
  'android.permission.WAKE_LOCK',
  'android.permission.ACCESS_NETWORK_STATE',
  'android.permission.POST_NOTIFICATIONS',
];
// The music alarm's permissions (PsysonicAlarm): exact alarms, set again after a reboot,
// shown over the lock screen, opened over a phone in use, exempt from battery saving. Play
// Protect blocks a sideloaded APK that asks for them as a harmful app; measured on a Honor
// 28.10., any set that keeps the alarm working was blocked, the build without all of them
// passed as safe. The alarm is off on Android until Psysonic ships through the Play Store
// (`ANDROID_ALARM_AVAILABLE`), and an older generated manifest loses them here.
const RETIRED_PERMISSIONS = [
  'android.permission.USE_EXACT_ALARM',
  'android.permission.SCHEDULE_EXACT_ALARM',
  'android.permission.RECEIVE_BOOT_COMPLETED',
  'android.permission.USE_FULL_SCREEN_INTENT',
  'android.permission.SYSTEM_ALERT_WINDOW',
  'android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS',
  // Only the alarm vibrates.
  'android.permission.VIBRATE',
];
// Everything this script adds to the manifest sits between `<!-- psysonic-gen begin: … -->`
// and `<!-- psysonic-gen end: … -->` and is written anew on every run: an entry that changed
// or went away here is gone from a long-lived generated project too.
// `[ \t]`, not `\s`: in a CRLF file `^` also matches after the `\r`.
const internet = /^([ \t]*<uses-permission android:name="android\.permission\.INTERNET" \/>\r?\n)/m;
const appClose = /^([ \t]*<\/application>)/m;
let manifest = readFileSync(manifestFile, 'utf8');
if (!internet.test(manifest) || !appClose.test(manifest)) {
  throw new Error('AndroidManifest.xml does not look like the Tauri template');
}
if (LEGACY_MARKER.test(manifest)) {
  throw new Error(`AndroidManifest.xml was patched by an older patch-gen; ${REGENERATE}`);
}
const eol = manifest.includes('\r\n') ? '\r\n' : '\n';
manifest = manifest.replace(/^[ \t]*<!-- psysonic-gen begin: ([\w-]+) -->\r?\n[\s\S]*?^[ \t]*<!-- psysonic-gen end: \1 -->\r?\n/gm, '');
const manifestBlock = (name, indent, body) =>
  [`${indent}<!-- psysonic-gen begin: ${name} -->`, ...body.split('\n'), `${indent}<!-- psysonic-gen end: ${name} -->`]
    .join(eol) + eol;
const addToApplication = (name, body) => {
  manifest = manifest.replace(appClose, match => `${manifestBlock(name, '        ', body)}${match}`);
};

const missing = PERMISSIONS.filter(p => !manifest.includes(`android:name="${p}"`));
if (missing.length > 0) {
  const lines = missing.map(p => `    <uses-permission android:name="${p}" />`).join('\n');
  manifest = manifest.replace(internet, match => `${match}${manifestBlock('permissions', '    ', lines)}`);
}
// The hub's QR scan (tauri-plugin-barcode-scanner) declares the camera as a required feature,
// and Play then hides the app from every device without one: 1057023 lost 349 devices against
// 1057011, every Android Auto (car) device and most Chromebooks among them. The camera is only
// for that scan, so it is optional; the merged manifest is checked in the Gradle block below.
// Its CAMERA permission alone makes Play imply a required rear camera (`android.hardware.camera`,
// shown by `aapt2 dump badging` as uses-implied-feature), so that one is declared optional too.
if (!manifest.includes('xmlns:tools=')) {
  manifest = manifest.replace(
    '<manifest xmlns:android="http://schemas.android.com/apk/res/android"',
    '<manifest xmlns:android="http://schemas.android.com/apk/res/android" xmlns:tools="http://schemas.android.com/tools"',
  );
  if (!manifest.includes('xmlns:tools=')) throw new Error('AndroidManifest.xml: no <manifest> root to add xmlns:tools to');
}
manifest = manifest.replace(internet, match => `${match}${manifestBlock('optional-features', '    ',
  ['android.hardware.camera.any', 'android.hardware.camera']
    .map(name => `    <uses-feature android:name="${name}" android:required="false" tools:replace="android:required" />`)
    .join('\n'))}`);
addToApplication('media-service', `        <service
            android:name=".PsysonicMediaService"
            android:exported="false"
            android:foregroundServiceType="mediaPlayback" />`);
for (const p of RETIRED_PERMISSIONS) {
  const line = new RegExp(`^[ \t]*<uses-permission android:name="${p.replaceAll('.', '\\.')}"[^>]*/>\r?\n`, 'm');
  if (line.test(manifest)) {
    manifest = manifest.replace(line, '');
    console.log(`[patch-gen] manifest: removed ${p}`);
  }
}
addToApplication('alarm', `        <receiver
            android:name=".PsysonicAlarmReceiver"
            android:exported="false">
            <intent-filter>
                <action android:name="android.intent.action.BOOT_COMPLETED" />
                <action android:name="android.intent.action.MY_PACKAGE_REPLACED" />
                <action android:name="android.intent.action.TIME_SET" />
                <action android:name="android.intent.action.TIMEZONE_CHANGED" />
            </intent-filter>
        </receiver>
        <service
            android:name=".PsysonicAlarmService"
            android:exported="false"
            android:foregroundServiceType="mediaPlayback" />`);
addToApplication('download-service', `        <service
            android:name=".PsysonicDownloadService"
            android:exported="false"
            android:foregroundServiceType="dataSync" />`);
addToApplication('android-auto', `        <service
            android:name=".PsysonicAutoService"
            android:exported="true">
            <intent-filter>
                <action android:name="android.media.browse.MediaBrowserService" />
            </intent-filter>
        </service>
        <meta-data
            android:name="com.google.android.gms.car.application"
            android:resource="@xml/automotive_app_desc" />`);
// Home screen widgets and Quick Settings tiles (PsysonicWidgets, PsysonicWidgetProviders).
const provider = (name, label, info) => `        <receiver
            android:name=".${name}"
            android:exported="false"
            android:label="@string/${label}">
            <intent-filter>
                <action android:name="android.appwidget.action.APPWIDGET_UPDATE" />
            </intent-filter>
            <meta-data
                android:name="android.appwidget.provider"
                android:resource="@xml/${info}" />
        </receiver>`;
const tile = (name, label, icon) => `        <service
            android:name=".${name}"
            android:exported="true"
            android:icon="@drawable/${icon}"
            android:label="@string/${label}"
            android:permission="android.permission.BIND_QUICK_SETTINGS_TILE">
            <intent-filter>
                <action android:name="android.service.quicksettings.action.QS_TILE" />
            </intent-filter>
            <meta-data
                android:name="android.service.quicksettings.ACTIVE_TILE"
                android:value="true" />
        </service>`;
addToApplication('widgets', `${provider('PsysonicCoverWidget', 'widget_cover', 'psysonic_widget_cover')}
${provider('PsysonicNowWidget', 'widget_now', 'psysonic_widget_now')}
${provider('PsysonicMixWidget', 'widget_mix', 'psysonic_widget_mix')}
${provider('PsysonicRecentWidget', 'widget_recent', 'psysonic_widget_recent')}
        <activity
            android:name=".PsysonicWidgetActivity"
            android:exported="false"
            android:excludeFromRecents="true"
            android:noHistory="true"
            android:taskAffinity=""
            android:theme="@android:style/Theme.Translucent.NoTitleBar" />
${tile('PsysonicPlayTile', 'tile_play_pause', 'ic_tile_play_pause')}
${tile('PsysonicMixTile', 'widget_mix', 'ic_tile_shuffle')}`);
// Labels as placeholders, so the beta build (Gradle below) can rename itself.
for (const [resource, placeholder] of [
  ['@string/app_name', 'appLabel'],
  ['@string/main_activity_title', 'activityLabel'],
]) {
  const label = `android:label="${resource}"`;
  if (manifest.includes(label)) {
    manifest = manifest.replace(label, `android:label="\${${placeholder}}"`);
    console.log(`[patch-gen] manifest: ${resource} label as \${${placeholder}}`);
  } else if (!manifest.includes(`android:label="\${${placeholder}}"`)) {
    throw new Error(`AndroidManifest.xml has no ${resource} label`);
  }
}
writeFileSync(manifestFile, manifest);

// ── R8 (release builds) cannot see JNI calls into the verifier. The template already
// feeds every `*.pro` under app/ to R8.
writeFileSync(
  join(appDir, 'rustls-platform-verifier.pro'),
  '-keep, includedescriptorclasses class org.rustls.platformverifier.** { *; }\n',
);

// ── Gradle. Every line this script adds ends in `// psysonic-gen`; they are all taken out and
// written anew on every run, so a changed version or a dropped setting does not linger.
let gradle = readFileSync(gradleFile, 'utf8');
if (LEGACY_MARKER.test(gradle)) {
  throw new Error(`build.gradle.kts was patched by an older patch-gen; ${REGENERATE}`);
}
const gradleEol = gradle.includes('\r\n') ? '\r\n' : '\n';
gradle = gradle
  .split(/\r?\n/)
  .filter(line => !line.trimEnd().endsWith(GRADLE_TAG))
  .join(gradleEol);
/** `text` with every line tagged, each followed by the file's line end. */
const tagged = text => text.split('\n').map(line => `${line} ${GRADLE_TAG}${gradleEol}`).join('');

const depsOpen = /^dependencies \{\r?\n/m;
if (!depsOpen.test(gradle)) throw new Error('no top-level dependencies block in build.gradle.kts');
const namespaceLine = /^( *)namespace = "dev\.psysonic\.player"\r?\n/m;
if (!namespaceLine.test(gradle)) throw new Error('no namespace line in build.gradle.kts');
const applicationIdLine = /^( *)applicationId = "dev\.psysonic\.player"\r?\n/m;
if (!applicationIdLine.test(gradle)) throw new Error('no applicationId line in build.gradle.kts');

// Dependencies: `androidx.media` (MediaSession, media notification), Media3's ExoPlayer (the
// car player) and the Kotlin half of `rustls-platform-verifier`, which ships as a local Maven
// repository; its path comes from `cargo metadata`, so the version always matches Cargo.lock.
const metadata = JSON.parse(
  execFileSync(
    'cargo',
    ['metadata', '--format-version', '1', '--filter-platform', 'aarch64-linux-android',
      '--manifest-path', join(srcTauri, 'Cargo.toml')],
    { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 },
  ),
);
const verifier = metadata.packages.find(p => p.name === 'rustls-platform-verifier-android');
if (!verifier) throw new Error('rustls-platform-verifier-android not in the Android dependency graph');
const mavenDir = join(dirname(verifier.manifest_path), 'maven').replaceAll('\\', '/');
gradle = gradle.replace(depsOpen, match => `${tagged(`repositories {
    maven {
        url = uri("${mavenDir}")
    }
}
`)}${match}${tagged(`    implementation("rustls:rustls-platform-verifier:${verifier.version}")
    implementation("${ANDROIDX_MEDIA}")
    implementation("${MEDIA3_EXOPLAYER}")`)}`);

// The car player streams through Android's own HTTP stack, which refuses plain http in a
// release build; a server on the home network often has no certificate. The app's own
// player (Rust) never asked Android, so this only brings the car player level with it.
const cleartextOff = 'manifestPlaceholders["usesCleartextTraffic"] = "false"';
if (gradle.includes(cleartextOff)) {
  gradle = gradle.replace(cleartextOff, 'manifestPlaceholders["usesCleartextTraffic"] = "true"');
}

// Our own signing key for tester and store builds, in place of the debug key: Play Protect
// started to block every new APK signed with the debug key as a harmful app (Honor,
// 28.10.: even an unchanged APK 122 repacked as a new file). The key stays outside the
// repository; PSYSONIC_ANDROID_SIGNING names a properties file with storeFile,
// storePassword, keyAlias and keyPassword. Without it (CI) the build signs as before.
// Android lint (`android-lint.yml`): the findings that were there when lint came in stay in
// `lint-baseline.xml` next to this script; any new one fails the run.
gradle = gradle.replace(namespaceLine, (match, indent) => `${match}${tagged(`${indent}System.getenv("PSYSONIC_ANDROID_SIGNING")?.let { path ->
${indent}    val signing = Properties().apply { file(path).inputStream().use { load(it) } }
${indent}    signingConfigs {
${indent}        create("psysonic") {
${indent}            storeFile = file(signing.getProperty("storeFile"))
${indent}            storePassword = signing.getProperty("storePassword")
${indent}            keyAlias = signing.getProperty("keyAlias")
${indent}            keyPassword = signing.getProperty("keyPassword")
${indent}        }
${indent}    }
${indent}}
${indent}lint {
${indent}    baseline = file("../../../android/lint-baseline.xml")
${indent}}`)}`);
for (const type of ['debug', 'release']) {
  const open = new RegExp(`^( *)getByName\\("${type}"\\) \\{\\r?\\n`, 'm');
  if (!open.test(gradle)) throw new Error(`no ${type} build type in build.gradle.kts`);
  gradle = gradle.replace(open, (match, indent) =>
    `${match}${tagged(`${indent}    signingConfigs.findByName("psysonic")?.let { signingConfig = it }`)}`);
}

// The tester APK installs next to the Play version: Play owns `dev.psysonic.player`, an
// APK with the same id but another signature can only replace it. PSYSONIC_ANDROID_BETA=1
// builds `dev.psysonic.player.beta` named "Psysonic Beta"; the Kotlin package stays, and
// every intent, the file provider and the data folder already follow the application id.
gradle = gradle.replace(applicationIdLine, (match, indent) => `${match}${tagged(`${indent}manifestPlaceholders["appLabel"] = "@string/app_name"
${indent}manifestPlaceholders["activityLabel"] = "@string/main_activity_title"
${indent}if (System.getenv("PSYSONIC_ANDROID_BETA") == "1") {
${indent}    applicationIdSuffix = ".beta"
${indent}    manifestPlaceholders["appLabel"] = "Psysonic Beta"
${indent}    manifestPlaceholders["activityLabel"] = "Psysonic Beta"
${indent}}`)}`);
// A library that declares a hardware feature as required takes the app away from every device
// without it on Play (the camera of the QR scan, see the manifest above). The merged manifest
// may only carry optional features; anything else stops the build.
gradle = gradle.trimEnd() + gradleEol + tagged(`afterEvaluate {
    tasks.matching { it.name.startsWith("process") && it.name.endsWith("MainManifest") }.configureEach {
        doLast {
            outputs.files.asFileTree.matching { include("**/AndroidManifest.xml") }.forEach { merged ->
                val text = merged.readText()
                Regex("<uses-feature[^>]*>").findAll(text)
                    .filterNot { it.value.contains("android:required=\\"false\\"") }
                    .forEach { throw GradleException("\${merged}: \${it.value} is required, Play would hide the app from devices without it; make it optional in patch-gen.mjs") }
                // A permission alone implies a required feature unless the feature is declared.
                if (text.contains("android.permission.CAMERA") &&
                    !Regex("<uses-feature[^>]*android.hardware.camera\\"[^>]*android:required=\\"false\\"").containsMatchIn(text)) {
                    throw GradleException("\${merged}: CAMERA implies a required android.hardware.camera; declare it optional in patch-gen.mjs")
                }
            }
        }
    }
}`);
writeFileSync(gradleFile, gradle);
console.log(`[patch-gen] gradle: dependencies (verifier ${verifier.version}), signing, lint baseline, beta build, optional features check`);
