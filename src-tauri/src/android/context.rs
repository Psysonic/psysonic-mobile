//! Android: hand the Java VM and the activity to `rustls-platform-verifier`, which reqwest
//! uses to check server certificates through Android's own trust store (its Kotlin half
//! comes in via `src-tauri/android/patch-gen.mjs`). `ndk-context` (cpal's AAudio backend)
//! is set by tao itself.
//!
//! tao starts `run` on its own thread while the activity is still being created, so the
//! context can arrive a moment after `run` begins: wait for it briefly.

use std::time::{Duration, Instant};

use jni::objects::JObject;
use jni::JavaVM;

/// Usually there within milliseconds; a slow start is reported, then waited out longer.
const SLOW_AFTER: Duration = Duration::from_secs(5);
/// `run` goes on without a context after this. cpal's AAudio output needs the same context
/// (tao sets both when the activity is created), so opening audio without it panics: on this
/// thread (not the UI thread) a long wait is the better failure.
const WAIT_LIMIT: Duration = Duration::from_secs(30);
const POLL_STEP: Duration = Duration::from_millis(10);

pub fn init() {
    let started = Instant::now();
    let mut reported_slow = false;
    let ctx = loop {
        if let Some(ctx) = tao::platform::android::prelude::main_android_context() {
            break ctx;
        }
        let waited = started.elapsed();
        if waited >= WAIT_LIMIT {
            crate::app_eprintln!(
                "[android] no activity context after {} s, audio and HTTPS will fail",
                WAIT_LIMIT.as_secs()
            );
            return;
        }
        if waited >= SLOW_AFTER && !reported_slow {
            reported_slow = true;
            crate::app_eprintln!("[android] activity context still missing after 5 s, waiting");
        }
        std::thread::sleep(POLL_STEP);
    };

    // `ndk-context` is set by tao itself since 0.37 (with the application context, when the
    // first activity is created); setting it a second time panics.

    // SAFETY: tao keeps the VM pointer and a global reference to the activity alive for
    // the whole process; the verifier takes its own global reference from it.
    let vm = unsafe { JavaVM::from_raw(ctx.java_vm.cast()) };
    let result = vm.attach_current_thread(|env| -> Result<(), jni::errors::Error> {
        let activity = unsafe { JObject::from_raw(env, ctx.context_jobject.cast()) };
        rustls_platform_verifier::android::init_with_env(env, activity)
    });
    match result {
        Ok(()) => crate::app_eprintln!(
            "[android] context ready after {} ms",
            started.elapsed().as_millis()
        ),
        Err(e) => crate::app_eprintln!("[android] certificate verifier init failed: {e}"),
    }
}
