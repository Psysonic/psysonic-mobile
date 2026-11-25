import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setTargetVersion } from './extension-version.mjs';

const yml = [
  'targets:',
  '  app_iOS:',
  '    info:',
  '      properties:',
  '        CFBundleShortVersionString: "1.0.0"',
  '        CFBundleVersion: "1"',
  '  PsysonicWidgets:',
  '    info:',
  '      properties:',
  '        CFBundleShortVersionString: "1.0.0"',
  '        CFBundleVersion: "41"',
  '        NSExtension:',
  '',
].join('\n');

test('a reused project gets the current build number in the extension only', () => {
  const out = setTargetVersion(yml, 'PsysonicWidgets', '1.2.0', '170');
  assert.match(out, /PsysonicWidgets:[\s\S]*CFBundleShortVersionString: "1\.2\.0"[\s\S]*CFBundleVersion: "170"/);
  // The app target is left alone.
  assert.ok(out.startsWith(yml.slice(0, yml.indexOf('  PsysonicWidgets:'))));
});

test('running it twice changes nothing more', () => {
  const once = setTargetVersion(yml, 'PsysonicWidgets', '1.2.0', '170');
  assert.equal(setTargetVersion(once, 'PsysonicWidgets', '1.2.0', '170'), once);
});

test('a missing target is an error, not a silent no-op', () => {
  assert.throws(() => setTargetVersion(yml, 'Other', '1', '1'), /no Other target/);
});
