// ⚠️ iOS territory, compiled into the app and the widget extension (`patch-gen.mjs`).
//
// The one action behind every widget button and control. As an `AudioPlaybackIntent` the
// system runs it in the app (Apple: "Adding interactivity to widgets and Live Activities"),
// where it reaches the web layer through Rust (`WidgetBridge.swift`). Should it run in the
// extension after all, the action is dropped into the App Group for the running app.
//
// Actions (`widgetCommands.ts`): `toggle`, `next`, `previous`, `mix`, `album:<node>`.

import AppIntents

@available(iOS 17.0, *)
struct PsysonicCommandIntent: AudioPlaybackIntent {
    static let title: LocalizedStringResource = "Psysonic"
    /// Only for the widgets; actions for the Shortcuts app come separately.
    static let isDiscoverable = false

    @Parameter(title: "Action")
    var action: String

    init() {}

    init(action: String) {
        self.action = action
    }

    func perform() async throws -> some IntentResult {
        #if PSYSONIC_APP
        try await WidgetBridge.run(action, intent: self)
        #else
        WidgetCommandDrop.post(action)
        #endif
        return .result()
    }
}

#if PSYSONIC_APP
/// Lets a tap that started the app bring it to the front on iOS 17 to 25 (iOS 26 uses
/// `continueInForeground`, `WidgetBridge.swift`).
@available(iOS 17.0, *)
extension PsysonicCommandIntent: ForegroundContinuableIntent {}
#endif
