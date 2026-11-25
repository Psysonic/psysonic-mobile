//! Siri: "play X in Psysonic" (and the assistant cell in CarPlay). The intent is handled
//! in the app itself, without an Intents extension (iOS 14+): UIKit asks the app delegate
//! for a handler (`application:handlerForIntent:`, only called for apps with multiple
//! scenes, which the CarPlay setup turns on) and the intents the app supports are listed
//! in `Info.ios.plist` (`INIntentsSupported`).
//!
//! The handler does no searching. It passes what Siri understood to the web layer
//! (`siri:play`), which searches the library and plays; Siri is answered with success
//! once the request reached it. A request that arrives before the web layer listens (cold
//! start from the car) waits here and is sent when it reports `siri:ready`; Siri's answer
//! waits with it. Started by Siri in the background with no scene, the app never starts its
//! web layer: if it has not reported ready after `ANSWER_WAIT`, Siri is told to continue in
//! the app (`ContinueInApp`), which brings it to the front, instead of claiming success for
//! music that does not play. A request that waited longer than `WAIT_LIMIT` is dropped, so
//! it does not start the next time the app is opened, hours later. A page load (also the
//! reload after the WebContent process died) means nobody listens until ready again.

use std::cell::RefCell;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use block2::{Block, RcBlock};
use objc2::rc::{Allocated, Retained};
use objc2::runtime::{AnyClass, AnyObject, Bool, NSObject, Sel};
use objc2::{class, define_class, ffi, msg_send, sel, AnyThread, ClassType};
use objc2_foundation::NSString;
use tauri::webview::PageLoadEvent;
use tauri::{AppHandle, Emitter, Listener};

/// `INPlayMediaIntentResponseCodeContinueInApp` (Intents SDK, `INPlayMediaIntentResponse.h`).
const RESPONSE_CONTINUE_IN_APP: isize = 2;
/// `INPlayMediaIntentResponseCodeSuccess` (Intents SDK, `INPlayMediaIntentResponse.h`).
const RESPONSE_SUCCESS: isize = 4;
/// How long Siri's answer waits for the web layer before asking to continue in the app.
const ANSWER_WAIT: Duration = Duration::from_secs(6);
/// How long a request waits for the web layer at all.
const WAIT_LIMIT: Duration = Duration::from_secs(120);
/// `INVocabularyStringTypeMediaMusicArtistName` (Intents SDK, `INVocabulary.h`).
const VOCABULARY_MUSIC_ARTIST: isize = 701;

static APP: OnceLock<AppHandle> = OnceLock::new();
static WEB_READY: AtomicBool = AtomicBool::new(false);
/// Requests waiting for the web layer, with the time they came in.
static WAITING: Mutex<Vec<(PlayRequest, Instant)>> = Mutex::new(Vec::new());
static NEXT_ANSWER: AtomicU64 = AtomicU64::new(0);

/// Siri's completion block, called with a response object.
type Completion = RcBlock<dyn Fn(*mut AnyObject)>;

thread_local! {
    /// The one handler object, created on first use (UIKit asks on the main queue).
    static HANDLER: RefCell<Option<Retained<MediaIntentHandler>>> = const { RefCell::new(None) };
    /// Siri's answers still owed, by request; main thread only.
    static ANSWERS: RefCell<HashMap<u64, Completion>> = RefCell::new(HashMap::new());
}

/// What Siri understood. `media_type` is `INMediaItemType`: 1 song, 2 album, 3 artist,
/// 4 genre, 5 playlist, 0 unknown.
#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct PlayRequest {
    media_name: Option<String>,
    media_type: isize,
    artist_name: Option<String>,
    album_name: Option<String>,
}

define_class!(
    #[unsafe(super(NSObject))]
    #[name = "PsysonicMediaIntentHandler"]
    struct MediaIntentHandler;

    impl MediaIntentHandler {
        #[unsafe(method(handlePlayMedia:completion:))]
        fn handle_play_media(&self, intent: &AnyObject, completion: &Block<dyn Fn(*mut AnyObject)>) {
            let request = unsafe { request_from(intent) };
            crate::app_eprintln!(
                "[siri] play request: type={} name={:?} artist={:?} album={:?}",
                request.media_type,
                request.media_name,
                request.artist_name,
                request.album_name
            );
            if deliver(request) {
                answer(completion, RESPONSE_SUCCESS);
                return;
            }
            // Waits for the web layer; Siri hears once it listens, or after `ANSWER_WAIT`.
            let id = NEXT_ANSWER.fetch_add(1, Ordering::Relaxed);
            ANSWERS.with(|answers| answers.borrow_mut().insert(id, completion.copy()));
            // SAFETY: UIKit calls the handler on the main queue; the timer runs on its run loop.
            unsafe {
                after_on_main(ANSWER_WAIT, move || {
                    answer_waiting(Some(id), RESPONSE_CONTINUE_IN_APP)
                })
            };
        }
    }
);

/// Answers Siri with a fresh `INPlayMediaIntentResponse` carrying `code`.
fn answer(completion: &Block<dyn Fn(*mut AnyObject)>, code: isize) {
    // SAFETY: plain Objective-C allocation of the response class (the Intents framework is
    // linked); the completion block takes the response object.
    unsafe {
        let response: Allocated<AnyObject> = msg_send![class!(INPlayMediaIntentResponse), alloc];
        let response: Retained<AnyObject> = msg_send![
            response,
            initWithCode: code,
            userActivity: std::ptr::null::<AnyObject>()
        ];
        completion.call((Retained::as_ptr(&response) as *mut AnyObject,));
    }
}

/// Answers the waiting request `id` (all of them for `None`), if still owed. Main thread.
fn answer_waiting(id: Option<u64>, code: isize) {
    let owed: Vec<Completion> = ANSWERS.with(|answers| {
        let mut answers = answers.borrow_mut();
        match id {
            Some(id) => answers.remove(&id).into_iter().collect(),
            None => answers.drain().map(|(_, completion)| completion).collect(),
        }
    });
    for completion in owed {
        if code != RESPONSE_SUCCESS {
            crate::app_eprintln!("[siri] web layer not ready; asking to continue in the app");
        }
        answer(&completion, code);
    }
}

/// Runs `then` on the main run loop after `delay`. Works before Tauri runs (no app handle).
///
/// # Safety
/// Main thread.
unsafe fn after_on_main(delay: Duration, then: impl Fn() + 'static) {
    let block: RcBlock<dyn Fn(*mut AnyObject)> = RcBlock::new(move |_timer: *mut AnyObject| then());
    // The run loop keeps the scheduled timer, and the timer its own copy of the block.
    let _timer: *mut AnyObject = msg_send![
        class!(NSTimer),
        scheduledTimerWithTimeInterval: delay.as_secs_f64(),
        repeats: Bool::NO,
        block: &*block
    ];
}

/// # Safety
/// `intent` is a live `INPlayMediaIntent`.
unsafe fn request_from(intent: &AnyObject) -> PlayRequest {
    let search: *mut AnyObject = msg_send![intent, mediaSearch];
    if search.is_null() {
        return PlayRequest {
            media_name: None,
            media_type: 0,
            artist_name: None,
            album_name: None,
        };
    }
    let media_type: isize = msg_send![search, mediaType];
    PlayRequest {
        media_name: text(msg_send![search, mediaName]),
        media_type,
        artist_name: text(msg_send![search, artistName]),
        album_name: text(msg_send![search, albumName]),
    }
}

/// # Safety
/// `value` is null or a live NSString.
unsafe fn text(value: *mut NSString) -> Option<String> {
    if value.is_null() {
        return None;
    }
    let text = (*value).to_string();
    (!text.trim().is_empty()).then_some(text)
}

/// Sends the request to the web layer; `false` when it waits for it.
fn deliver(request: PlayRequest) -> bool {
    if WEB_READY.load(Ordering::SeqCst) {
        if let Some(app) = APP.get() {
            let _ = app.emit("siri:play", request);
            return true;
        }
    }
    if let Ok(mut waiting) = WAITING.lock() {
        waiting.push((request, Instant::now()));
    }
    false
}

/// The web layer reports `siri:ready` once it listens; requests made earlier follow.
pub(crate) fn listen(app: &AppHandle) {
    if APP.set(app.clone()).is_err() {
        return;
    }
    // The library's artist names, so Siri hears "Motorjesus" instead of a name it knows.
    let vocabulary = app.clone();
    app.listen_any("siri:vocabulary", move |event| {
        let Ok(names) = serde_json::from_str::<Vec<String>>(event.payload()) else {
            return;
        };
        let _ = vocabulary.run_on_main_thread(move || {
            // SAFETY: main thread; INVocabulary is the shared per-app vocabulary.
            unsafe { set_artist_vocabulary(&names) };
        });
    });

    // A page starting to load has no listener until it reports ready again.
    let page_loads = tauri::plugin::Builder::<tauri::Wry, ()>::new("psysonic-siri-page")
        .on_page_load(|_webview, payload| {
            if payload.event() == PageLoadEvent::Started {
                WEB_READY.store(false, Ordering::SeqCst);
            }
        })
        .build();
    if let Err(error) = app.plugin(page_loads) {
        crate::app_eprintln!("[siri] page load watch not added: {error}");
    }

    let ready = app.clone();
    app.listen_any("siri:ready", move |_| {
        WEB_READY.store(true, Ordering::SeqCst);
        let waiting = WAITING
            .lock()
            .map(|mut waiting| std::mem::take(&mut *waiting))
            .unwrap_or_default();
        let now = Instant::now();
        for (request, at) in waiting {
            if now.duration_since(at) > WAIT_LIMIT {
                crate::app_eprintln!("[siri] dropped stale request");
                continue;
            }
            let _ = ready.emit("siri:play", request);
        }
        let _ = ready.run_on_main_thread(|| answer_waiting(None, RESPONSE_SUCCESS));
    });
}

/// UIKit's question: who handles this intent? Only play requests get the handler.
///
/// # Safety
/// Called by UIKit on the main queue.
unsafe extern "C-unwind" fn handler_for_intent(
    _this: *mut AnyObject,
    _cmd: Sel,
    _application: *mut AnyObject,
    intent: *mut AnyObject,
) -> *mut AnyObject {
    if intent.is_null() {
        return std::ptr::null_mut();
    }
    let is_play: Bool = msg_send![intent, isKindOfClass: class!(INPlayMediaIntent)];
    if !is_play.as_bool() {
        return std::ptr::null_mut();
    }
    HANDLER.with(|slot| {
        let mut slot = slot.borrow_mut();
        if slot.is_none() {
            let class = MediaIntentHandler::class();
            let protocol = ffi::objc_getProtocol(c"INPlayMediaIntentHandling".as_ptr());
            if !protocol.is_null() {
                ffi::class_addProtocol(class as *const AnyClass as *mut AnyClass, protocol);
            }
            let handler: Retained<MediaIntentHandler> =
                msg_send![MediaIntentHandler::alloc(), init];
            *slot = Some(handler);
        }
        // Kept alive by the slot; UIKit retains what it keeps.
        slot.as_ref().map_or(std::ptr::null_mut(), |handler| {
            Retained::as_ptr(handler) as *mut AnyObject
        })
    })
}

/// Teaches tao's `AppDelegate` the handler question. Call after the Tauri app is built
/// (tao declares the delegate then) and before it runs, next to `ios::scene::install`.
pub(crate) fn install() {
    let Some(delegate) = AnyClass::get(c"AppDelegate") else {
        crate::app_eprintln!("[siri] AppDelegate not declared; Siri requests are not handled");
        return;
    };
    // Object return, then self, _cmd, UIApplication, INIntent.
    let added = unsafe {
        ffi::class_addMethod(
            delegate as *const AnyClass as *mut AnyClass,
            sel!(application:handlerForIntent:),
            std::mem::transmute::<
                unsafe extern "C-unwind" fn(
                    *mut AnyObject,
                    Sel,
                    *mut AnyObject,
                    *mut AnyObject,
                ) -> *mut AnyObject,
                objc2::runtime::Imp,
            >(handler_for_intent),
            c"@@:@@".as_ptr(),
        )
    };
    if !added.as_bool() {
        crate::app_eprintln!("[siri] AppDelegate already answers application:handlerForIntent:");
    }
}

/// Hands the artist names to Siri's speech recognition for this app.
///
/// # Safety
/// Main thread.
unsafe fn set_artist_vocabulary(names: &[String]) {
    let array: Allocated<AnyObject> = msg_send![class!(NSMutableArray), alloc];
    let array: Retained<AnyObject> = msg_send![array, init];
    for name in names {
        let text = NSString::from_str(name);
        let () = msg_send![&*array, addObject: &*text];
    }
    let set: *mut AnyObject = msg_send![class!(NSOrderedSet), orderedSetWithArray: &*array];
    let vocabulary: *mut AnyObject = msg_send![class!(INVocabulary), sharedVocabulary];
    if set.is_null() || vocabulary.is_null() {
        return;
    }
    let () = msg_send![vocabulary, setVocabularyStrings: set, ofType: VOCABULARY_MUSIC_ARTIST];
    crate::app_eprintln!("[siri] vocabulary: {} artist names", names.len());
}
