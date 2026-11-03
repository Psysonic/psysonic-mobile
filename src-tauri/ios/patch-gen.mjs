// ⚠️ iOS territory. Run after `tauri ios init` (CI, `ios.yml`): the generated Xcode project
// under `src-tauri/gen/apple` is not in git, so what the iPhone app needs beyond Tauri's
// template is added to its `project.yml` here, and the project is generated again.
// Every step is idempotent.
//
// - the widget extension (`widgets/Extension` + `widgets/Shared`), embedded in the app,
//   with the App Group the app writes the widget state to;
// - the app target compiles `widgets/App` + `widgets/Shared` (the intent the widgets'
//   buttons run, the bridge to Rust), with `PSYSONIC_APP` set and the bridging header.
//
// The app's own App Group entitlement is added in `ios.yml`, next to CarPlay and Siri.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const srcTauri = resolve(here, '..');
const projectDir = join(srcTauri, 'gen', 'apple');
const projectFile = join(projectDir, 'project.yml');
const iosConfig = JSON.parse(readFileSync(join(srcTauri, 'tauri.ios.conf.json'), 'utf8'));

const APP_GROUP = 'group.dev.psysonic.player';
const EXTENSION = 'PsysonicWidgets';
const EXTENSION_ID = `${iosConfig.identifier}.widgets`;
/** Interactive widgets (buttons) need iOS 17; the app itself starts at 15. */
const EXTENSION_IOS = '17.0';
/** Paths in `project.yml` are relative to `gen/apple`. */
const WIDGETS = '../../ios/widgets';
const MARKER = '# psysonic: widgets';

// The extension's version must match the app's (`--build-number` in `ios.yml`).
const version = iosConfig.version;
const build = process.env.PSYSONIC_BUILD_NUMBER || process.env.GITHUB_RUN_NUMBER || '1';
const team = process.env.APPLE_DEVELOPMENT_TEAM || '';

let yml = readFileSync(projectFile, 'utf8').replace(/\r\n/g, '\n');
if (yml.includes(MARKER)) {
  console.log('project.yml already patched');
} else {
  const appTarget = yml.match(/^ {2}(\S+_iOS):$/m)?.[1];
  if (!appTarget) throw new Error('no *_iOS target in project.yml');
  const start = yml.indexOf(`\n  ${appTarget}:\n`);
  // The app target runs to the next target or the end of the file.
  const nextTarget = yml.slice(start + 1).search(/\n {2}\S[^\n]*:\n/);
  const end = nextTarget < 0 ? yml.length : start + 1 + nextTarget;
  let app = yml.slice(start, end);

  const insertAfter = (block, anchor, lines) => {
    const at = block.indexOf(anchor);
    if (at < 0) throw new Error(`${appTarget}: "${anchor.trim()}" not found`);
    return block.slice(0, at + anchor.length) + lines + block.slice(at + anchor.length);
  };
  app = insertAfter(app, '\n    sources:\n', [
    `      - path: ${WIDGETS}/Shared`,
    `      - path: ${WIDGETS}/App`,
    '',
  ].join('\n'));
  app = insertAfter(app, '\n    settings:\n      base:\n', [
    `        ${MARKER}`,
    '        SWIFT_VERSION: "5.0"',
    '        SWIFT_ACTIVE_COMPILATION_CONDITIONS: $(inherited) PSYSONIC_APP',
    `        SWIFT_OBJC_BRIDGING_HEADER: ${WIDGETS}/App/PsysonicWidgets-Bridging.h`,
    '',
  ].join('\n'));
  // AppIntents exists from iOS 16, the app starts at 15: linked weakly, used behind
  // availability checks.
  app = insertAfter(app, '\n    dependencies:\n', [
    `      - target: ${EXTENSION}`,
    '        embed: true',
    '      - sdk: AppIntents.framework',
    '        weak: true',
    '',
  ].join('\n'));

  const extension = [
    `  ${EXTENSION}:`,
    '    type: app-extension',
    '    platform: iOS',
    `    deploymentTarget: "${EXTENSION_IOS}"`,
    '    sources:',
    `      - path: ${WIDGETS}/Shared`,
    `      - path: ${WIDGETS}/Extension`,
    '    info:',
    `      path: ${EXTENSION}/Info.plist`,
    '      properties:',
    '        CFBundleDisplayName: Psysonic',
    `        CFBundleShortVersionString: "${version}"`,
    `        CFBundleVersion: "${build}"`,
    '        NSExtension:',
    '          NSExtensionPointIdentifier: com.apple.widgetkit-extension',
    '    entitlements:',
    `      path: ${EXTENSION}/${EXTENSION}.entitlements`,
    '      properties:',
    '        com.apple.security.application-groups:',
    `          - ${APP_GROUP}`,
    '    settings:',
    '      base:',
    `        PRODUCT_BUNDLE_IDENTIFIER: ${EXTENSION_ID}`,
    `        PRODUCT_NAME: ${EXTENSION}`,
    '        SWIFT_VERSION: "5.0"',
    '        TARGETED_DEVICE_FAMILY: "1,2"',
    '        CODE_SIGN_STYLE: Automatic',
    ...(team ? [`        DEVELOPMENT_TEAM: ${team}`] : []),
    '        SKIP_INSTALL: true',
    '        ENABLE_BITCODE: false',
    // `tauri ios build` with the API key archives without signing and then gives only the
    // app binary a stand-in signature carrying its entitlements; the export re-signs from
    // those. The extension needs the same, or it loses the App Group.
    '    postBuildScripts:',
    '      - name: Keep the entitlements for the export',
    '        basedOnDependencyAnalysis: false',
    '        script: |',
    '          if [ "$CODE_SIGNING_ALLOWED" = "NO" ]; then',
    `            /usr/bin/codesign --force --sign - --entitlements "$PROJECT_DIR/${EXTENSION}/${EXTENSION}.entitlements" "$TARGET_BUILD_DIR/$WRAPPER_NAME"`,
    '          fi',
    '    dependencies:',
    '      - sdk: WidgetKit.framework',
    '      - sdk: SwiftUI.framework',
    '      - sdk: AppIntents.framework',
    '',
  ].join('\n');

  yml = yml.slice(0, start) + app + yml.slice(end);
  if (!yml.endsWith('\n')) yml += '\n';
  yml += extension;
  writeFileSync(projectFile, yml);
  console.log(`project.yml: ${EXTENSION} added, ${appTarget} compiles the widget bridge`);
}

execFileSync('xcodegen', ['generate', '--spec', projectFile, '--project', projectDir], { stdio: 'inherit' });
