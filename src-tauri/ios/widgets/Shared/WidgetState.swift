// ⚠️ iOS territory, compiled into the app and the widget extension (`patch-gen.mjs`).
//
// What the app last reported for the widgets. `src-tauri/src/ios/widgets.rs` writes it to
// `<App Group>/widget/state.json`, with the covers copied next to it.

import Foundation

struct WidgetState: Codable {
    struct Now: Codable {
        var title: String
        var artist: String?
        var album: String?
        var playing: Bool
        /// Seconds since 1970 at which the song would have started, playing without pauses.
        var startedAt: Double?
        var elapsed: Double
        var duration: Double
        var image: String?
        var radio: Bool?
    }

    struct Album: Codable {
        /// The car lists' node of the album (`carplayContent.ts`), played as it is.
        var node: String
        var title: String
        var artist: String?
        var image: String?
    }

    struct Song: Codable {
        var title: String
        var artist: String?
        var image: String?
    }

    struct Mix: Codable {
        var title: String
        var hint: String?
    }

    /// Texts in the app's language.
    struct Labels: Codable {
        var nowPlaying: String?
        var nothingPlaying: String?
        var recentlyPlayed: String?
        var upNext: String?
    }

    var accent: String?
    var now: Now?
    var recent: [Album]?
    var next: [Song]?
    var mix: Mix?
    var labels: Labels?

    static let appGroup = "group.dev.psysonic.player"

    static var folder: URL? {
        FileManager.default
            .containerURL(forSecurityApplicationGroupIdentifier: appGroup)?
            .appendingPathComponent("widget", isDirectory: true)
    }

    /// The last report; before the app ever ran, an empty state.
    static func load() -> WidgetState {
        guard let file = folder?.appendingPathComponent("state.json"),
              let data = try? Data(contentsOf: file),
              let state = try? JSONDecoder().decode(WidgetState.self, from: data)
        else { return WidgetState() }
        return state
    }

    func imageURL(_ name: String?) -> URL? {
        guard let name, !name.isEmpty else { return nil }
        return WidgetState.folder?.appendingPathComponent(name)
    }

    var mixTitle: String { mix?.title ?? "Mix" }
    var nowPlayingLabel: String { labels?.nowPlaying ?? "Now Playing" }
    var nothingPlayingLabel: String { labels?.nothingPlaying ?? "Psysonic" }
    var recentlyPlayedLabel: String { labels?.recentlyPlayed ?? "Recently played" }
    var upNextLabel: String { labels?.upNext ?? "Up next" }
}

extension WidgetState.Now {
    var startDate: Date? { startedAt.map { Date(timeIntervalSince1970: $0) } }
    var endDate: Date? {
        guard let start = startDate, duration > 0 else { return nil }
        return start.addingTimeInterval(duration)
    }
    var fraction: Double { duration > 0 ? min(max(elapsed / duration, 0), 1) : 0 }
}

/// A tap that ran in the extension instead of the app: the action waits in the App Group
/// and a Darwin notification tells the running app to fetch it (`WidgetBridge.swift`).
enum WidgetCommandDrop {
    static let notification = "dev.psysonic.player.widget-command"
    static let fileName = "command.txt"

    static func post(_ action: String) {
        guard let folder = WidgetState.folder else { return }
        try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        try? Data(action.utf8).write(to: folder.appendingPathComponent(fileName), options: .atomic)
        CFNotificationCenterPostNotification(
            CFNotificationCenterGetDarwinNotifyCenter(),
            CFNotificationName(notification as CFString),
            nil, nil, true
        )
    }

    /// The waiting action, removed as it is read.
    static func take() -> String? {
        guard let file = WidgetState.folder?.appendingPathComponent(fileName),
              let data = try? Data(contentsOf: file)
        else { return nil }
        try? FileManager.default.removeItem(at: file)
        let action = String(decoding: data, as: UTF8.self)
        return action.isEmpty ? nil : action
    }
}
