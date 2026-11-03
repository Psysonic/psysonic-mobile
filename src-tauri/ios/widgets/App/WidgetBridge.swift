// ⚠️ iOS territory, app target only (`patch-gen.mjs` sets `PSYSONIC_APP` for it).
//
// The app's side of the widgets: Rust (`src-tauri/src/ios/widgets.rs`) calls in to redraw
// them and to listen for taps that ran in the extension (`PsysonicWidgetCenter`); taps go
// out to Rust, declared in `PsysonicWidgets-Bridging.h`.

import AppIntents
import Foundation
import WidgetKit

/// Rust looks this class up at run time (`widgets.rs`): the Rust library is also linked on
/// its own, without the app's Swift code, so it cannot name these functions directly.
@objc(PsysonicWidgetCenter)
final class PsysonicWidgetCenter: NSObject {
    /// The state file changed: widgets and controls draw it again.
    @objc static func reload() {
        WidgetCenter.shared.reloadAllTimelines()
        if #available(iOS 18.0, *) {
            ControlCenter.shared.reloadAllControls()
        }
    }

    /// Taps the system ran in the extension arrive as a Darwin notification.
    @objc static func observe() {
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
