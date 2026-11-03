// ⚠️ iOS territory: the widget extension (`patch-gen.mjs` adds the target).
//
// Frank's drafts of 03.11. (all variants): small A1 cover, A2 now playing, A3 mix; medium
// B1 now playing, B2 recently played; large C1 now playing with up next; lock screen L1
// rectangle, L2 mix button, L3 line above the clock; Control Center K1 mix, K2 play/pause.
// Everything shown comes from `WidgetState` (the app's last report); buttons run
// `PsysonicCommandIntent`.

import AppIntents
import SwiftUI
import WidgetKit

@main
struct PsysonicWidgets: WidgetBundle {
    var body: some Widget {
        CoverWidget()
        NowPlayingWidget()
        MixWidget()
        RecentWidget()
        if #available(iOS 18.0, *) {
            MixControl()
            PlayPauseControl()
        }
    }
}

// MARK: - Timeline

struct StateEntry: TimelineEntry {
    let date: Date
    let state: WidgetState
}

struct StateProvider: TimelineProvider {
    func placeholder(in context: Context) -> StateEntry {
        StateEntry(date: Date(), state: WidgetState())
    }

    func getSnapshot(in context: Context, completion: @escaping (StateEntry) -> Void) {
        completion(StateEntry(date: Date(), state: WidgetState.load()))
    }

    /// The app asks for a redraw on every change. A playing song also ends at a known time:
    /// redraw then, so a widget does not keep showing a song the app has moved past.
    func getTimeline(in context: Context, completion: @escaping (Timeline<StateEntry>) -> Void) {
        let state = WidgetState.load()
        var policy: TimelineReloadPolicy = .never
        if let now = state.now, now.playing, let end = now.endDate {
            policy = .after(end.addingTimeInterval(5))
        }
        completion(Timeline(entries: [StateEntry(date: Date(), state: state)], policy: policy))
    }
}

/// A name from the app's language; widgets read it when they are listed.
func displayName(_ name: String) -> LocalizedStringResource {
    // The name itself is the key: an interpolation would make the key "%@", which the
    // gallery shows as is (it resolves the name in another process, without the argument).
    LocalizedStringResource(String.LocalizationValue(name))
}

// MARK: - Look

enum Palette {
    static let base = Color(red: 0x1e / 255, green: 0x1e / 255, blue: 0x2e / 255)
    static let surface = Color(red: 0x31 / 255, green: 0x32 / 255, blue: 0x44 / 255)
    static let track = Color(red: 0x45 / 255, green: 0x47 / 255, blue: 0x5a / 255)
    static let text = Color(red: 0xcd / 255, green: 0xd6 / 255, blue: 0xf4 / 255)
    static let subtext = Color(red: 0xa6 / 255, green: 0xad / 255, blue: 0xc8 / 255)
    static let ink = Color(red: 0x11 / 255, green: 0x11 / 255, blue: 0x1b / 255)
    static let lilac = Color(red: 0xcb / 255, green: 0xa6 / 255, blue: 0xf7 / 255)

    /// The app theme's accent (`#rrggbb`), else the default theme's lilac.
    static func accent(_ hex: String?) -> Color {
        guard var digits = hex?.trimmingCharacters(in: .whitespaces) else { return lilac }
        if digits.hasPrefix("#") { digits.removeFirst() }
        guard digits.count == 6, let value = UInt64(digits, radix: 16) else { return lilac }
        return Color(
            red: Double((value >> 16) & 0xff) / 255,
            green: Double((value >> 8) & 0xff) / 255,
            blue: Double(value & 0xff) / 255
        )
    }
}

struct CoverImage: View {
    let url: URL?

    var body: some View {
        if let url, let image = UIImage(contentsOfFile: url.path) {
            Image(uiImage: image).resizable().scaledToFill()
        } else {
            ZStack {
                Palette.surface
                Image(systemName: "music.note")
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundStyle(Palette.subtext)
            }
        }
    }
}

struct Cover: View {
    let url: URL?
    let size: CGFloat
    let radius: CGFloat

    var body: some View {
        CoverImage(url: url)
            .frame(width: size, height: size)
            .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
    }
}

struct ToggleButton: View {
    let playing: Bool
    let accent: Color
    let size: CGFloat

    var body: some View {
        Button(intent: PsysonicCommandIntent(action: "toggle")) {
            Image(systemName: playing ? "pause.fill" : "play.fill")
                .font(.system(size: size * 0.38, weight: .bold))
                .foregroundStyle(Palette.ink)
                .frame(width: size, height: size)
                .background(Circle().fill(accent))
        }
        .buttonStyle(.plain)
    }
}

struct SkipButton: View {
    let action: String
    let symbol: String

    var body: some View {
        Button(intent: PsysonicCommandIntent(action: action)) {
            Image(systemName: symbol)
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(Palette.text)
                .frame(width: 40, height: 40)
        }
        .buttonStyle(.plain)
    }
}

struct SongProgress: View {
    let now: WidgetState.Now
    let tint: Color

    var body: some View {
        if now.playing, let start = now.startDate, let end = now.endDate, end > start {
            ProgressView(timerInterval: start...end, countsDown: false) {
                EmptyView()
            } currentValueLabel: {
                EmptyView()
            }
            .progressViewStyle(.linear)
            .tint(tint)
        } else {
            ProgressView(value: now.fraction)
                .progressViewStyle(.linear)
                .tint(tint)
        }
    }
}

struct SongTitle: View {
    let title: String
    let subtitle: String?
    let size: CGFloat

    var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(title)
                .font(.system(size: size, weight: .semibold))
                .foregroundStyle(Palette.text)
                .lineLimit(1)
            if let subtitle, !subtitle.isEmpty {
                Text(subtitle)
                    .font(.system(size: size - 3))
                    .foregroundStyle(Palette.subtext)
                    .lineLimit(1)
            }
        }
    }
}

struct LogoMark: View {
    let accent: Color

    var body: some View {
        Text("P")
            .font(.system(size: 17, weight: .heavy))
            .foregroundStyle(accent)
    }
}

extension WidgetState {
    var accentColor: Color { Palette.accent(accent) }
    var nowTitle: String { now?.title ?? nothingPlayingLabel }
    var nowSubtitle: String? { now?.artist }
    var playing: Bool { now?.playing ?? false }
}

// MARK: - A1: the cover fills the widget

struct CoverWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "PsysonicCover", provider: StateProvider()) { entry in
            CoverWidgetView(state: entry.state)
        }
        .configurationDisplayName(displayName("\(WidgetState.load().nowPlayingLabel) · Cover"))
        .supportedFamilies([.systemSmall])
        .contentMarginsDisabled()
    }
}

struct CoverWidgetView: View {
    let state: WidgetState

    var body: some View {
        VStack(spacing: 0) {
            Spacer(minLength: 0)
            HStack(spacing: 8) {
                SongTitle(title: state.nowTitle, subtitle: state.nowSubtitle, size: 13)
                Spacer(minLength: 0)
                ToggleButton(playing: state.playing, accent: state.accentColor, size: 30)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(Palette.ink.opacity(0.82))
        }
        .containerBackground(for: .widget) {
            CoverImage(url: state.imageURL(state.now?.image))
        }
    }
}

// MARK: - A2, B1, C1, L1, L3: now playing

struct NowPlayingWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "PsysonicNowPlaying", provider: StateProvider()) { entry in
            NowPlayingView(state: entry.state)
        }
        .configurationDisplayName(displayName(WidgetState.load().nowPlayingLabel))
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge, .accessoryRectangular, .accessoryInline])
    }
}

struct NowPlayingView: View {
    @Environment(\.widgetFamily) private var family
    let state: WidgetState

    var body: some View {
        switch family {
        case .systemMedium: medium.containerBackground(Palette.base, for: .widget)
        case .systemLarge: large.containerBackground(Palette.base, for: .widget)
        case .accessoryRectangular: rectangular.containerBackground(.clear, for: .widget)
        case .accessoryInline: inline.containerBackground(.clear, for: .widget)
        default: small.containerBackground(Palette.base, for: .widget)
        }
    }

    private var cover: URL? { state.imageURL(state.now?.image) }

    private var small: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top) {
                Cover(url: cover, size: 64, radius: 10)
                Spacer(minLength: 0)
                ToggleButton(playing: state.playing, accent: state.accentColor, size: 34)
            }
            SongTitle(title: state.nowTitle, subtitle: state.nowSubtitle, size: 14)
            Spacer(minLength: 0)
            if let now = state.now {
                SongProgress(now: now, tint: state.accentColor)
            }
        }
    }

    private var label: some View {
        Text(state.nowPlayingLabel.uppercased())
            .font(.system(size: 11, weight: .semibold))
            .foregroundStyle(state.accentColor)
            .lineLimit(1)
    }

    private var controls: some View {
        HStack {
            SkipButton(action: "previous", symbol: "backward.fill")
            Spacer(minLength: 0)
            ToggleButton(playing: state.playing, accent: state.accentColor, size: 44)
            Spacer(minLength: 0)
            SkipButton(action: "next", symbol: "forward.fill")
        }
    }

    private var medium: some View {
        HStack(spacing: 14) {
            Cover(url: cover, size: 128, radius: 14)
            VStack(alignment: .leading, spacing: 6) {
                label
                SongTitle(title: state.nowTitle, subtitle: state.nowSubtitle, size: 15)
                if let now = state.now {
                    SongProgress(now: now, tint: state.accentColor)
                }
                Spacer(minLength: 0)
                controls
            }
        }
    }

    private var large: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 14) {
                Cover(url: cover, size: 112, radius: 14)
                VStack(alignment: .leading, spacing: 6) {
                    label
                    SongTitle(title: state.nowTitle, subtitle: state.nowSubtitle, size: 16)
                    Spacer(minLength: 0)
                    controls
                }
            }
            if let now = state.now {
                SongProgress(now: now, tint: state.accentColor)
            }
            Text(state.upNextLabel)
                .font(.system(size: 13, weight: .bold))
                .foregroundStyle(Palette.text)
            VStack(alignment: .leading, spacing: 8) {
                ForEach(Array((state.next ?? []).prefix(3).enumerated()), id: \.offset) { _, song in
                    HStack(spacing: 10) {
                        Cover(url: state.imageURL(song.image), size: 38, radius: 8)
                        SongTitle(title: song.title, subtitle: song.artist, size: 13)
                    }
                }
            }
            Spacer(minLength: 0)
        }
    }

    private var rectangular: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(state.nowTitle)
                .font(.headline)
                .lineLimit(1)
            if let artist = state.nowSubtitle {
                Text(artist)
                    .font(.caption)
                    .lineLimit(1)
            }
            if let now = state.now {
                SongProgress(now: now, tint: .primary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var inline: some View {
        Label(state.nowTitle, systemImage: "music.note")
    }
}

// MARK: - A3, L2: start a mix

struct MixWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "PsysonicMix", provider: StateProvider()) { entry in
            MixView(state: entry.state)
        }
        .configurationDisplayName(displayName(WidgetState.load().mixTitle))
        .supportedFamilies([.systemSmall, .accessoryCircular])
    }
}

struct MixView: View {
    @Environment(\.widgetFamily) private var family
    let state: WidgetState

    var body: some View {
        if family == .accessoryCircular {
            Button(intent: PsysonicCommandIntent(action: "mix")) {
                ZStack {
                    AccessoryWidgetBackground()
                    Image(systemName: "shuffle")
                        .font(.system(size: 22, weight: .semibold))
                }
            }
            .buttonStyle(.plain)
            .containerBackground(.clear, for: .widget)
        } else {
            Button(intent: PsysonicCommandIntent(action: "mix")) {
                VStack(alignment: .leading) {
                    HStack {
                        Image(systemName: "shuffle")
                            .font(.system(size: 19, weight: .bold))
                            .foregroundStyle(Palette.ink)
                            .frame(width: 44, height: 44)
                            .background(Circle().fill(state.accentColor))
                        Spacer(minLength: 0)
                        LogoMark(accent: state.accentColor)
                    }
                    Spacer(minLength: 0)
                    Text(state.mixTitle)
                        .font(.system(size: 16, weight: .bold))
                        .foregroundStyle(Palette.text)
                        .lineLimit(1)
                    if let hint = state.mix?.hint {
                        Text(hint)
                            .font(.system(size: 12))
                            .foregroundStyle(Palette.subtext)
                            .lineLimit(2)
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
            }
            .buttonStyle(.plain)
            .containerBackground(Palette.base, for: .widget)
        }
    }
}

// MARK: - B2: recently played albums

struct RecentWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "PsysonicRecent", provider: StateProvider()) { entry in
            RecentView(state: entry.state)
        }
        .configurationDisplayName(displayName(WidgetState.load().recentlyPlayedLabel))
        .supportedFamilies([.systemMedium])
    }
}

struct RecentView: View {
    let state: WidgetState

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(state.recentlyPlayedLabel)
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(Palette.text)
                Spacer(minLength: 0)
                LogoMark(accent: state.accentColor)
            }
            HStack(alignment: .top, spacing: 10) {
                ForEach(Array((state.recent ?? []).prefix(4).enumerated()), id: \.offset) { _, album in
                    Button(intent: PsysonicCommandIntent(action: "album:\(album.node)")) {
                        VStack(alignment: .leading, spacing: 4) {
                            CoverImage(url: state.imageURL(album.image))
                                .aspectRatio(1, contentMode: .fit)
                                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                            Text(album.title)
                                .font(.system(size: 11))
                                .foregroundStyle(Palette.text)
                                .lineLimit(1)
                        }
                        .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.plain)
                }
            }
            Spacer(minLength: 0)
        }
        .containerBackground(Palette.base, for: .widget)
    }
}

// MARK: - K1, K2: Control Center

@available(iOS 18.0, *)
struct MixControl: ControlWidget {
    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: "PsysonicMixControl") {
            ControlWidgetButton(action: PsysonicCommandIntent(action: "mix")) {
                Label(WidgetState.load().mixTitle, systemImage: "shuffle")
            }
        }
        .displayName(displayName(WidgetState.load().mixTitle))
    }
}

@available(iOS 18.0, *)
struct PlayPauseControl: ControlWidget {
    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: "PsysonicPlayPauseControl") {
            ControlWidgetButton(action: PsysonicCommandIntent(action: "toggle")) {
                Label("Psysonic", systemImage: "playpause.fill")
            }
        }
        .displayName("Psysonic")
    }
}
