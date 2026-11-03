// ⚠️ iOS territory, app target only (`patch-gen.mjs` sets `PSYSONIC_APP` for it).
//
// The app's side of the widgets: Rust (`src-tauri/src/ios/widgets.rs`) calls in to redraw
// them and to listen for taps that ran in the extension; taps go out to Rust, declared in
// `PsysonicWidgets-Bridging.h`.

import AppIntents
import Foundation
import WidgetKit

/// The state file changed: widgets and controls draw it again.
@_cdecl("psysonic_widget_reload")
public func psysonicWidgetReload() {
    WidgetCenter.shared.reloadAllTimelines()
    if #available(iOS 18.0, *) {
        ControlCenter.shared.reloadAllControls()
    }
}

/// Taps the system ran in the extension arrive as a Darwin notification.
@_cdecl("psysonic_widget_observe")
public func psysonicWidgetObserve() {
    CFNotificationCenterAddObserver(
        CFNotificationCenterGetDarwinNotifyCenter(),
        nil,
        { _, _, _, _, _ in
            if let action = WidgetCommandDrop.take() {
                WidgetBridge.send(action)
            }
        },
        WidgetCommandDrop.notification as CFString,
        nil,
        .deliverImmediately
    )
}

enum WidgetBridge {
    static func send(_ action: String) {
        action.withCString { psysonic_widget_command($0) }
    }

    /// Hands the action to Rust, which keeps it until the web layer listens. A tap that
    /// started the app in the background has no web layer: it only runs with a window, so
    /// the app comes to the front.
    @available(iOS 17.0, *)
    static func run(_ action: String, intent: PsysonicCommandIntent) async throws {
        send(action)
        if psysonic_widget_web_ready() { return }
        if #available(iOS 26.0, *) {
            if intent.systemContext.currentMode.canContinueInForeground {
                try await intent.continueInForeground(nil, alwaysConfirm: false)
            }
        } else {
            throw intent.needsToContinueInForegroundError()
        }
    }
}
