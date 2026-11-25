// ⚠️ iOS territory. Used by `patch-gen.mjs`.

/**
 * Sets the version lines of `target`'s Info.plist properties in an XcodeGen `project.yml`.
 * `patch-gen.mjs` adds the widget extension once; a `gen/apple` that is reused (a local
 * build after an earlier one) would otherwise keep the build number of that first run, and
 * an extension whose version differs from the app's is rejected on upload.
 */
export function setTargetVersion(yml, target, version, build) {
  const at = yml.indexOf(`\n  ${target}:\n`);
  if (at < 0) throw new Error(`no ${target} target in project.yml`);
  // The target runs to the next target or the end of the file.
  const next = yml.slice(at + 1).search(/\n {2}\S[^\n]*:\n/);
  const end = next < 0 ? yml.length : at + 1 + next;
  let block = yml.slice(at, end);
  for (const [key, value] of [['CFBundleShortVersionString', version], ['CFBundleVersion', build]]) {
    const line = new RegExp(`^( +${key}: ).*$`, 'm');
    if (!line.test(block)) throw new Error(`${target}: ${key} not found`);
    block = block.replace(line, `$1"${value}"`);
  }
  return yml.slice(0, at) + block + yml.slice(end);
}
