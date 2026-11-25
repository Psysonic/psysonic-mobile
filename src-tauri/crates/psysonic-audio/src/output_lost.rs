//! Android moves the media route when Android Auto, headphones or a Bluetooth device take
//! over, and disconnects the app's open AAudio output. Rodio only printed the stream error,
//! so the engine kept writing into the dead output: the car stayed silent while the app
//! showed the song playing (car test 21.10.). The output's error callback reports the lost
//! device here and the output is reopened on the new route, the way a system resume does.
//! A burst of losses collapses into one reopen (`output_lost_burst`).

use std::sync::{Mutex, OnceLock};
use std::time::Instant;

use tauri::AppHandle;

use crate::output_lost_burst::{LossBurst, SETTLE};
use crate::power_resume::reopen_audio_after_system_resume;

static APP: OnceLock<AppHandle> = OnceLock::new();
static BURST: Mutex<LossBurst> = Mutex::new(LossBurst::new());

pub(crate) fn register(app: AppHandle) {
    let _ = APP.set(app);
}

/// Error callback of the output stream (audio thread).
pub(crate) fn on_stream_error(error: rodio::cpal::StreamError) {
    crate::app_eprintln!("[audio] output stream error: {error}");
    if !matches!(error, rodio::cpal::StreamError::DeviceNotAvailable) {
        return;
    }
    let Some(app) = APP.get() else { return };
    if !BURST.lock().unwrap().on_loss(Instant::now()) {
        return;
    }
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(SETTLE).await;
        BURST.lock().unwrap().reopen_started();
        reopen_audio_after_system_resume(&app).await;
    });
}
