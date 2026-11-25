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

/// A tap that ran in the extension instead of the app: the action waits in the App Group, one
/// file per tap so quick taps do not overwrite each other, and a Darwin notification tells
/// the running app to fetch them (`WidgetBridge.swift`). An app that was not running fetches
/// them when it starts; taps older than `maxAge` are dropped then, so an old tap does not
/// replace the queue the next time the app is opened.
enum WidgetCommandDrop {
    static let notification = "dev.psysonic.player.widget-command"
    static let prefix = "command-"
    static let suffix = ".txt"
    /// The single file older versions wrote.
    static let legacyFileName = "command.txt"
    static let maxAge: TimeInterval = 120

    static func post(_ action: String) {
        guard let folder = WidgetState.folder else { return }
        try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        // Milliseconds first, so the names sort in the order of the taps.
        let millis = UInt64(Date().timeIntervalSince1970 * 1000)
        let name = String(format: "%@%013llu-%@%@", prefix, millis, UUID().uuidString, suffix)
        try? Data(action.utf8).write(to: folder.appendingPathComponent(name), options: .atomic)
        CFNotificationCenterPostNotification(
            CFNotificationCenterGetDarwinNotifyCenter(),
            CFNotificationName(notification as CFString),
            nil, nil, true
        )
    }

    /// The waiting actions, oldest first, removed as they are read.
    static func takeAll() -> [String] {
        guard let folder = WidgetState.folder,
              let names = try? FileManager.default.contentsOfDirectory(atPath: folder.path)
        else { return [] }
        let waiting = names
            .filter { $0 == legacyFileName || ($0.hasPrefix(prefix) && $0.hasSuffix(suffix)) }
            .sorted()
        let oldest = Date().addingTimeInterval(-maxAge)
        var actions: [String] = []
        for name in waiting {
            let file = folder.appendingPathComponent(name)
            let written = (try? FileManager.default.attributesOfItem(atPath: file.path))?[.modificationDate] as? Date
            let data = try? Data(contentsOf: file)
            // Removed before it runs: a tap must never run twice.
            guard (try? FileManager.default.removeItem(at: file)) != nil, let data else { continue }
            guard let written, written >= oldest else { continue }
            let action = String(decoding: data, as: UTF8.self)
            if !action.isEmpty { actions.append(action) }
        }
        return actions
    }
}
