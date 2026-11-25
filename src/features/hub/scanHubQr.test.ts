import { afterEach, describe, expect, it } from 'vitest';
import { deviceHasCamera } from './scanHubQr';

describe('deviceHasCamera', () => {
  afterEach(() => {
    delete window.PsysonicAndroidShell;
  });

  it('is false only when the Android shell reports no camera', () => {
    window.PsysonicAndroidShell = { setDarkBackground: () => {}, hasCamera: () => false };
    expect(deviceHasCamera()).toBe(false);
    window.PsysonicAndroidShell = { setDarkBackground: () => {}, hasCamera: () => true };
    expect(deviceHasCamera()).toBe(true);
  });

  it('assumes a camera on iOS and on Android builds without the check', () => {
    expect(deviceHasCamera()).toBe(true);
    window.PsysonicAndroidShell = { setDarkBackground: () => {} };
    expect(deviceHasCamera()).toBe(true);
  });
});
