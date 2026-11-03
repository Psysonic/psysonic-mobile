//! Home and lock screen widgets, Control Center controls. The widgets live in their own
//! extension (Swift, `src-tauri/ios/widgets/`) and cannot read the app's files; they read
//! what this module puts in the shared App Group folder.
//!
//! The web layer reports what the widgets show (`widget:update`: playing song, recently
//! played albums, up next, the mix it would start), with covers as paths in the cover
//! cache. Those covers are copied next to `state.json` and WidgetKit is told to redraw.
//!
//! A widget's buttons run an App Intent in the app (`AudioPlaybackIntent`), which calls
//! `psysonic_widget_command`; the action goes to the web layer as `widget:command`. One
//! that arrives before the web layer listens (the app was started by the tap) waits here
//! until it reports `widget:ready`.

use std::collections::hash_map::DefaultHasher;
use std::collections::HashSet;
use std::ffi::{c_char, CStr};
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};

use objc2::runtime::AnyObject;
use objc2::{class, msg_send};
use objc2_foundation::NSString;
use serde_json::Value;
use tauri::{AppHandle, Emitter, Listener};

/// Registered for `dev.psysonic.player` and `dev.psysonic.player.widgets` in the developer
/// portal; both targets carry it in their entitlements (`ios.yml`, `patch-gen.mjs`).
const APP_GROUP: &str = "group.dev.psysonic.player";
/// Folder inside the App Group the extension reads (`WidgetState.swift`).
const WIDGET_DIR: &str = "widget";
const STATE_FILE: &str = "state.json";
const IMAGE_PREFIX: &str = "img-";

static APP: OnceLock<AppHandle> = OnceLock::new();
static WEB_READY: AtomicBool = AtomicBool::new(false);
static WAITING: Mutex<Vec<String>> = Mutex::new(Vec::new());
/// One writer at a time: updates come fast while skipping through a queue.
static WRITING: Mutex<()> = Mutex::new(());
static FOLDER: OnceLock<Option<PathBuf>> = OnceLock::new();

unsafe extern "C" {
    /// `WidgetBridge.swift` in the app target: `WidgetCenter.shared.reloadAllTimelines()`.
    fn psysonic_widget_reload();
    /// `WidgetBridge.swift`: taps the system ran in the extension reach the app.
    fn psysonic_widget_observe();
}

#[derive(Clone, serde::Serialize)]
struct CommandRequest {
    action: String,
}

pub(crate) fn listen(app: &AppHandle) {
    if APP.set(app.clone()).is_err() {
        return;
    }
    let _ = app.run_on_main_thread(|| {
        // SAFETY: plain C call into the app's Swift code, on the main thread.
        unsafe { psysonic_widget_observe() };
    });
    let updates = app.clone();
    app.listen_any("widget:update", move |event| {
        let Ok(state) = serde_json::from_str::<Value>(event.payload()) else {
            crate::app_eprintln!("[widgets] unreadable update");
            return;
        };
        if let Err(error) = write_state(state) {
            crate::app_eprintln!("[widgets] state not written: {error}");
            return;
        }
        let _ = updates.run_on_main_thread(|| {
            // SAFETY: plain C call into the app's Swift code, on the main thread.
            unsafe { psysonic_widget_reload() };
        });
    });

    let ready = app.clone();
    app.listen_any("widget:ready", move |_| {
        WEB_READY.store(true, Ordering::SeqCst);
        let waiting = WAITING
            .lock()
            .map(|mut waiting| std::mem::take(&mut *waiting))
            .unwrap_or_default();
        for action in waiting {
            let _ = ready.emit("widget:command", CommandRequest { action });
        }
    });
}

fn deliver(action: String) {
    if WEB_READY.load(Ordering::SeqCst) {
        if let Some(app) = APP.get() {
            let _ = app.emit("widget:command", CommandRequest { action });
            return;
        }
    }
    if let Ok(mut waiting) = WAITING.lock() {
        waiting.push(action);
    }
}

/// A widget button or control was tapped (`PsysonicIntents.swift`).
///
/// # Safety
/// `action` is null or a NUL-terminated UTF-8 string that stays valid for the call.
#[no_mangle]
pub unsafe extern "C" fn psysonic_widget_command(action: *const c_char) {
    if action.is_null() {
        return;
    }
    let action = CStr::from_ptr(action).to_string_lossy().into_owned();
    crate::app_eprintln!("[widgets] command: {action}");
    deliver(action);
}

/// Whether the web layer listens. Without it the intent brings the app to the front,
/// which starts the web layer (a start in the background has no window).
#[no_mangle]
pub extern "C" fn psysonic_widget_web_ready() -> bool {
    WEB_READY.load(Ordering::SeqCst)
}

fn widget_folder() -> Option<&'static Path> {
    FOLDER
        .get_or_init(|| {
            // SAFETY: NSFileManager's shared instance may be used from any thread; the
            // returned NSURL and NSString are read before this call returns.
            let group = unsafe { group_container() }?;
            let folder = group.join(WIDGET_DIR);
            std::fs::create_dir_all(&folder).ok()?;
            Some(folder)
        })
        .as_deref()
}

unsafe fn group_container() -> Option<PathBuf> {
    let manager: *mut AnyObject = msg_send![class!(NSFileManager), defaultManager];
    if manager.is_null() {
        return None;
    }
    let group = NSString::from_str(APP_GROUP);
    let url: *mut AnyObject =
        msg_send![manager, containerURLForSecurityApplicationGroupIdentifier: &*group];
    if url.is_null() {
        crate::app_eprintln!("[widgets] no App Group container ({APP_GROUP})");
        return None;
    }
    let path: *mut NSString = msg_send![url, path];
    if path.is_null() {
        return None;
    }
    Some(PathBuf::from((*path).to_string()))
}

/// Copies each `image` (a path in the cover cache) into the widget folder, points the
/// state at the copy's file name, writes `state.json` and removes covers no longer shown.
fn write_state(mut state: Value) -> Result<(), String> {
    let _writing = WRITING
        .lock()
        .map_err(|_| "writer lock poisoned".to_string())?;
    let folder = widget_folder().ok_or("App Group folder unavailable")?;
    let mut kept = HashSet::new();
    for image in image_fields(&mut state) {
        let Some(source) = image.as_str().map(PathBuf::from) else {
            continue;
        };
        match copy_image(folder, &source) {
            Some(name) => {
                kept.insert(name.clone());
                *image = Value::String(name);
            }
            None => *image = Value::Null,
        }
    }
    let text = serde_json::to_vec(&state).map_err(|error| error.to_string())?;
    let partial = folder.join(format!("{STATE_FILE}.partial"));
    std::fs::write(&partial, text).map_err(|error| error.to_string())?;
    std::fs::rename(&partial, folder.join(STATE_FILE)).map_err(|error| error.to_string())?;
    remove_unused_images(folder, &kept);
    Ok(())
}

/// The `image` fields the extension reads: `now`, and each entry of `recent` and `next`.
fn image_fields(state: &mut Value) -> Vec<&mut Value> {
    let mut fields = Vec::new();
    let Some(object) = state.as_object_mut() else {
        return fields;
    };
    for (key, value) in object.iter_mut() {
        match (key.as_str(), value) {
            ("now", Value::Object(now)) => fields.extend(now.get_mut("image")),
            ("recent" | "next", Value::Array(entries)) => {
                for entry in entries.iter_mut() {
                    if let Some(entry) = entry.as_object_mut() {
                        fields.extend(entry.get_mut("image"));
                    }
                }
            }
            _ => {}
        }
    }
    fields
}

/// The copy is named after the source path and size, so an unchanged cover is not copied again.
fn copy_image(folder: &Path, source: &Path) -> Option<String> {
    let size = std::fs::metadata(source).ok()?.len();
    let mut hasher = DefaultHasher::new();
    source.hash(&mut hasher);
    size.hash(&mut hasher);
    let extension = source
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or("img");
    let name = format!("{IMAGE_PREFIX}{:016x}.{extension}", hasher.finish());
    let target = folder.join(&name);
    if !target.exists() {
        std::fs::copy(source, &target).ok()?;
    }
    Some(name)
}

fn remove_unused_images(folder: &Path, kept: &HashSet<String>) {
    let Ok(entries) = std::fs::read_dir(folder) else {
        return;
    };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with(IMAGE_PREFIX) && !kept.contains(&name) {
            let _ = std::fs::remove_file(entry.path());
        }
    }
}
