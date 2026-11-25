//! Downloaded music lives in Application Support, which iOS backs up by default, and so do
//! the cover cache and the stream spill files next to it. Apple asks apps to keep anything
//! that can be downloaded again out of iCloud and computer backups, so every launch marks
//! these folders "do not back up"; the flag covers everything inside each of them.
//!
//! The folders are only ever emptied, never removed (`cover_cache::bucket` keeps the cache
//! root), so the flag set at launch stays on them.

use std::path::Path;

use objc2::runtime::AnyObject;
use objc2_foundation::{NSNumber, NSString, NSURLIsExcludedFromBackupKey, NSURL};
use tauri::{AppHandle, Manager};

/// The audio engine's spill folder under app data (`psysonic-audio` `helpers/stream_spill.rs`).
const STREAM_SPILL_DIR: &str = "stream-spill";

/// Marks the media folder and the caches "do not back up".
pub(crate) fn exclude_media_dir(app: &AppHandle) {
    match psysonic_syncfs::cache::local::resolve_media_dir(None, app) {
        Ok(dir) => exclude_dir(&dir),
        Err(e) => crate::app_eprintln!("[offline] media folder unknown, backup flag not set: {e}"),
    }
    match crate::cover_cache::cover_cache_root(app) {
        Ok(dir) => exclude_dir(&dir),
        Err(e) => crate::app_eprintln!("[offline] cover cache unknown, backup flag not set: {e}"),
    }
    match app.path().app_data_dir() {
        Ok(data) => exclude_dir(&data.join(STREAM_SPILL_DIR)),
        Err(e) => {
            crate::app_eprintln!("[offline] app data folder unknown, backup flag not set: {e}")
        }
    }
}

fn exclude_dir(dir: &Path) {
    if let Err(e) = std::fs::create_dir_all(dir) {
        crate::app_eprintln!("[offline] could not create {}: {e}", dir.display());
        return;
    }
    let url = NSURL::fileURLWithPath_isDirectory(&NSString::from_str(&dir.to_string_lossy()), true);
    let excluded = NSNumber::new_bool(true);
    let value: &AnyObject = &excluded;
    // SAFETY: the key is a framework constant, and the value for it is an NSNumber
    // holding a BOOL, as the key requires.
    let result =
        unsafe { url.setResourceValue_forKey_error(Some(value), NSURLIsExcludedFromBackupKey) };
    if let Err(e) = result {
        crate::app_eprintln!("[offline] backup flag on {} not set: {e:?}", dir.display());
    }
}
