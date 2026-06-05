/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 mally
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";
import { definePluginSettings } from "@api/Settings";
import { UserSettings } from "@api/UserSettings";
import { SpotifyStore } from "@plugins/spotifyControls/SpotifyStore";
import definePlugin, { OptionType, type PluginNative } from "@utils/types";
import type { Activity } from "@vencord/discord-types";
import { ActivityFlags, ActivityStatusDisplayType, ActivityType } from "@vencord/discord-types/enums";
import { ApplicationAssetUtils, Button, ConfirmModal, FluxDispatcher, openModal, React, showToast, Toasts, UserStore } from "@webpack/common";

const Native = (VencordNative.pluginHelpers.DiscordLyrics ?? VencordNative.pluginHelpers.SpotifyLyricsStatus) as PluginNative<typeof import("./native")>;

const DEFAULT_SETTINGS = {
    lyricOffsetMs: 650,
    updateIntervalMs: 250,
    gapThresholdMs: 4000,
    maxStatusLength: 128,
    fontStyle: "normal",
    showWaitingDots: true,
    loadingText: "loading lyrics...",
    noLyricsText: "no synced lyrics",
    pausedPrefix: "Pause - ",
    usePlainLyricsFallback: false,
    enableRpc: true,
    rpcName: "Spotify",
    rpcShowWhenPaused: true,
    rpcShowAlbumArt: true
} as const;

const RELEASE_VERSION = "1.0.4";
const REPO = "MallyDev2/DiscordLyrics";
const LATEST_RELEASE_API = `https://api.github.com/repos/${REPO}/releases/latest`;
const LAST_UPDATE_CHECK_KEY = "DiscordLyrics.lastUpdateCheck";
const LAST_UPDATE_VERSION_KEY = "DiscordLyrics.lastUpdateVersion";
const AUTO_UPDATE_SESSION_KEY = "DiscordLyrics.autoUpdateCheckedAt";

type FontStyleId =
    | "normal"
    | "title"
    | "uppercase"
    | "lowercase"
    | "wide"
    | "fullwidth"
    | "mono"
    | "bold"
    | "italic"
    | "boldItalic"
    | "sans"
    | "sansItalic"
    | "sansBold"
    | "sansBoldItalic"
    | "serifBold"
    | "serifItalic"
    | "serifBoldItalic"
    | "script"
    | "scriptBold"
    | "fraktur"
    | "frakturBold"
    | "doubleStruck"
    | "smallCaps";

const FONT_OPTIONS: Array<{ label: string; value: FontStyleId; }> = [
    { label: "Normal", value: "normal" },
    { label: "Title Case", value: "title" },
    { label: "UPPERCASE", value: "uppercase" },
    { label: "Lowercase", value: "lowercase" },
    { label: "W i d e  S p a c i n g", value: "wide" },
    { label: "\u{ff26}\u{ff55}\u{ff4c}\u{ff4c}\u{ff57}\u{ff49}\u{ff44}\u{ff54}\u{ff48}", value: "fullwidth" },
    { label: "\u{1d67c}\u{1d698}\u{1d697}\u{1d698}\u{1d69c}\u{1d699}\u{1d68a}\u{1d68c}\u{1d68e}", value: "mono" },
    { label: "\u{1d401}\u{1d428}\u{1d425}\u{1d41d}", value: "bold" },
    { label: "\u{1d43c}\u{1d461}\u{1d44e}\u{1d459}\u{1d456}\u{1d450}", value: "italic" },
    { label: "\u{1d469}\u{1d490}\u{1d48d}\u{1d485} \u{1d470}\u{1d495}\u{1d482}\u{1d48d}\u{1d48a}\u{1d484}", value: "boldItalic" },
    { label: "\u{1d5b2}\u{1d5ba}\u{1d5c7}\u{1d5cc}", value: "sans" },
    { label: "\u{1d61a}\u{1d622}\u{1d62f}\u{1d634} \u{1d610}\u{1d635}\u{1d622}\u{1d62d}\u{1d62a}\u{1d624}", value: "sansItalic" },
    { label: "\u{1d5e6}\u{1d5ee}\u{1d5fb}\u{1d600} \u{1d5d5}\u{1d5fc}\u{1d5f9}\u{1d5f1}", value: "sansBold" },
    { label: "\u{1d64e}\u{1d656}\u{1d663}\u{1d668} \u{1d63d}\u{1d664}\u{1d661}\u{1d659} \u{1d644}\u{1d669}\u{1d656}\u{1d661}\u{1d65e}\u{1d658}", value: "sansBoldItalic" },
    { label: "\u{1d412}\u{1d41e}\u{1d42b}\u{1d422}\u{1d41f} \u{1d401}\u{1d428}\u{1d425}\u{1d41d}", value: "serifBold" },
    { label: "\u{1d446}\u{1d452}\u{1d45f}\u{1d456}\u{1d453} \u{1d43c}\u{1d461}\u{1d44e}\u{1d459}\u{1d456}\u{1d450}", value: "serifItalic" },
    { label: "\u{1d47a}\u{1d486}\u{1d493}\u{1d48a}\u{1d487} \u{1d469}\u{1d490}\u{1d48d}\u{1d485} \u{1d470}\u{1d495}\u{1d482}\u{1d48d}\u{1d48a}\u{1d484}", value: "serifBoldItalic" },
    { label: "\u{1d4d2}\u{1d4fe}\u{1d4fb}\u{1d4fc}\u{1d4f2}\u{1d4ff}\u{1d4ee}", value: "script" },
    { label: "\u{1d4d2}\u{1d4fe}\u{1d4fb}\u{1d4fc}\u{1d4f2}\u{1d4ff}\u{1d4ee} \u{1d4d1}\u{1d4f8}\u{1d4f5}\u{1d4ed}", value: "scriptBold" },
    { label: "\u{1d509}\u{1d52f}\u{1d51e}\u{1d528}\u{1d531}\u{1d532}\u{1d52f}", value: "fraktur" },
    { label: "\u{1d575}\u{1d597}\u{1d586}\u{1d590}\u{1d599}\u{1d59a}\u{1d597} \u{1d56d}\u{1d594}\u{1d591}\u{1d589}", value: "frakturBold" },
    { label: "\u{1d53b}\u{1d560}\u{1d566}\u{1d553}\u{1d55d}\u{1d556}-\u{1d54a}\u{1d565}\u{1d563}\u{1d566}\u{1d554}\u{1d55c}", value: "doubleStruck" },
    { label: "\u{a731}\u{1d0d}\u{1d00}\u{029f}\u{029f} \u{1d04}\u{1d00}\u{1d18}\u{a731}", value: "smallCaps" }
];

interface SpotifyArtist {
    name: string;
}

interface SpotifyAlbum {
    name: string;
    image?: {
        url?: string;
    };
    images?: Array<{
        url?: string;
    }>;
}

interface SpotifyShow {
    name?: string;
    publisher?: string;
    images?: Array<{
        url?: string;
    }>;
}

interface SpotifyTrack {
    id: string | null;
    name: string;
    duration: number;
    duration_ms?: number;
    type?: string;
    publisher?: string;
    description?: string;
    html_description?: string;
    images?: Array<{
        url?: string;
    }>;
    album?: SpotifyAlbum;
    artists?: SpotifyArtist[];
    show?: SpotifyShow;
}

interface SpotifyStateEvent {
    track: SpotifyTrack | null;
    isPlaying: boolean;
    position: number;
    receivedAt?: number;
}

interface NormalizedTrack {
    id: string;
    title: string;
    artist: string;
    album: string;
    albumImage: string;
    contentType: string;
    description: string;
    durationMs: number;
    progressMs: number;
    isPlaying: boolean;
}

interface LyricLine {
    timeMs: number;
    text: string;
}

interface ActiveLyricLine extends LyricLine {
    nextTimeMs?: number;
}

interface LrcLibResult {
    trackName?: string;
    artistName?: string;
    albumName?: string;
    duration?: number;
    plainLyrics?: string | null;
    syncedLyrics?: string | null;
    synced_lyrics?: string | null;
}

interface WindowsSpotifyState {
    processRunning?: boolean;
    track?: {
        title?: string;
        artist?: string;
        album?: string;
        status?: string;
        positionMs?: number;
        durationMs?: number;
    } | null;
}

let interval: ReturnType<typeof setInterval> | undefined;
let spotifyState: SpotifyStateEvent | undefined;
let windowsSpotifyTrack: NormalizedTrack | undefined;
let windowsSpotifyTrackReceivedAt = 0;
let windowsSpotifyProcessRunning = false;
let windowsSpotifyProcessSeenAt = 0;
let lastWindowsSpotifyPollAt = 0;
let windowsSpotifyPollInFlight = false;
let lastKnownSpotifyTrack: NormalizedTrack | undefined;
let lastKnownSpotifyTrackAt = 0;
const fallbackAlbumImageCache = new Map<string, string | undefined>();
const fallbackAlbumImageRequests = new Map<string, Promise<string | undefined>>();
let fetchController: AbortController | undefined;
let lyrics: LyricLine[] = [];
let lastTrackKey = "";
let loadingTrackKey = "";
let lastStatusText = "";
let lastRemoteStatusText: string | undefined;
let pendingRemoteStatusText = "";
let remoteStatusInFlight = false;
let remoteStatusTimer: ReturnType<typeof setTimeout> | undefined;
let nextRemoteStatusAt = 0;
let lastRpcKey = "";
let lastRpcStartedAt = 0;
let lastSpotifyPollAt = 0;
let spotifyPollInFlight = false;
let lastPlaybackPlaying: boolean | undefined;
let spotifyUnavailableAt = 0;
let spotifyPollMutedUntil = 0;
let lastRemoteStatusExpiresAt = 0;

const STATUS_SOCKET_ID = "SpotifyLyricsStatus";
const RPC_SOCKET_ID = "SpotifyLyricsStatusRpc";
const MIN_REMOTE_STATUS_INTERVAL_MS = 150;
const SPOTIFY_POLL_INTERVAL_MS = 500;
const WINDOWS_SPOTIFY_POLL_INTERVAL_MS = 2000;
const SPOTIFY_STATE_FRESH_MS = 15000;
const WINDOWS_SPOTIFY_STATE_FRESH_MS = 10000;
const WINDOWS_SPOTIFY_PROCESS_GRACE_MS = 15000;
const SPOTIFY_UNAVAILABLE_GRACE_MS = 5000;
const LAST_KNOWN_SPOTIFY_TRACK_MS = 30 * 60 * 1000;
const STATUS_EXPIRATION_MS = 120000;
const STATUS_EXPIRATION_REFRESH_MS = 45000;
const albumAssetCache = new Map<string, Promise<string | undefined>>();
const albumAssetResolved = new Map<string, string | undefined>();
const pluginAuthor = { name: "mally", id: 0n };

function updatePluginAuthor() {
    try {
        pluginAuthor.id = BigInt(UserStore.getCurrentUser()?.id ?? "0");
    } catch {
        pluginAuthor.id = 0n;
    }
}

function debugLog(message: string) {
    const promise = Native?.logDebug?.(message) as Promise<void> | undefined;
    void promise?.catch(() => void 0);
}

function logStatusUserSettings() {
    try {
        const statusSettings = Object.values(UserSettings ?? {})
            .filter(setting => setting?.userSettingsAPIGroup === "status")
            .map(setting => {
                let value: unknown;
                try {
                    value = setting.getSetting();
                } catch (error) {
                    value = stringifyError(error);
                }

                return {
                    name: setting.userSettingsAPIName,
                    value
                };
            });

        debugLog(`status user settings ${JSON.stringify(statusSettings)}`);
    } catch (error) {
        debugLog(`status user settings failed ${stringifyError(error)}`);
    }
}

function getStatusSetting(name: string) {
    return Object.values(UserSettings ?? {})
        .find(setting => setting?.userSettingsAPIGroup === "status" && setting.userSettingsAPIName === name);
}

function resetPluginDefaults() {
    Object.entries(DEFAULT_SETTINGS).forEach(([key, value]) => {
        (settings.store as Record<string, unknown>)[key] = value;
    });

    restartTimer();
    tick();
    showToast("DiscordLyrics settings reset", Toasts.Type.SUCCESS);
}

interface GithubRelease {
    tag_name?: string;
    name?: string;
    html_url?: string;
    body?: string;
}

function normalizeVersion(value: unknown) {
    const match = String(value ?? "").match(/\d+\.\d+\.\d+/);
    return match ? match[0] : "";
}

function compareVersions(a: string, b: string) {
    const left = a.split(".").map(Number);
    const right = b.split(".").map(Number);

    for (let index = 0; index < 3; index++) {
        if ((left[index] || 0) > (right[index] || 0)) return 1;
        if ((left[index] || 0) < (right[index] || 0)) return -1;
    }

    return 0;
}

function formatLastChecked(value: string | null) {
    const timestamp = Number(value);
    if (!Number.isFinite(timestamp) || timestamp <= 0) return "Last checked: never";
    return `Last checked: ${new Date(timestamp).toLocaleString()}`;
}

async function fetchLatestRelease() {
    const response = await Native.fetchGithubRelease(LATEST_RELEASE_API) as { status: number; data: GithubRelease | null; };
    if (response.status < 200 || response.status >= 300 || !response.data) {
        throw new Error(`Release lookup returned ${response.status}`);
    }

    return response.data;
}

async function checkForDiscordLyricsUpdate(options: { silentIfCurrent?: boolean; source?: "startup" | "manual"; } = {}) {
    const checkedAt = String(Date.now());
    await DataStore.set(LAST_UPDATE_CHECK_KEY, checkedAt);

    try {
        const release = await fetchLatestRelease();
        const latest = normalizeVersion(release.tag_name || release.name || "");
        if (latest) await DataStore.set(LAST_UPDATE_VERSION_KEY, latest);

        if (!latest || compareVersions(latest, RELEASE_VERSION) <= 0) {
            if (!options.silentIfCurrent) showToast("DiscordLyrics is up to date", Toasts.Type.SUCCESS);
            return { latest: latest || RELEASE_VERSION, checkedAt };
        }

        debugLog(`update available current=${RELEASE_VERSION} latest=${latest} source=${options.source || "manual"}`);
        showUpdateFoundModal(latest, release);

        return { latest, checkedAt };
    } catch (error) {
        debugLog(`update check failed ${stringifyError(error)}`);
        if (!options.silentIfCurrent) showToast("DiscordLyrics update check failed", Toasts.Type.FAILURE);
        return { latest: "", checkedAt };
    }
}

async function checkForDiscordLyricsUpdateOnStartup() {
    try {
        const sessionKey = `${Date.now() - performance.now()}`;
        if (await DataStore.get<string>(AUTO_UPDATE_SESSION_KEY) === sessionKey) return;
        await DataStore.set(AUTO_UPDATE_SESSION_KEY, sessionKey);
        await checkForDiscordLyricsUpdate({ silentIfCurrent: true, source: "startup" });
    } catch (error) {
        debugLog(`startup update check failed ${stringifyError(error)}`);
    }
}

function releaseBodyPreview(body: string) {
    const value = typeof body === "object" && body && "value" in body ? (body as any).value : body;
    const text = String(value || "No release notes were provided.")
        .replace(/\r\n/g, "\n")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    return text.length > 1200 ? `${text.slice(0, 1200)}...` : text;
}

function renderReleaseNotes(body: string) {
    const text = releaseBodyPreview(body);
    const blocks: any[] = [];
    let listItems: string[] = [];
    const mutedText = "var(--text-muted)";
    const headingText = "var(--header-primary)";

    const flushList = () => {
        if (!listItems.length) return;
        const items = listItems;
        listItems = [];
        blocks.push(React.createElement("ul", {
            key: `list-${blocks.length}`,
            style: { margin: "0 0 0 18px", padding: 0, color: "var(--text-normal)" }
        }, items.map((item, index) => React.createElement("li", {
            key: index,
            style: { marginBottom: "4px" }
        }, item))));
    };

    for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line) {
            flushList();
            continue;
        }

        const heading = /^(#{1,4})\s+(.+)$/.exec(line);
        if (heading) {
            flushList();
            const level = heading[1].length;
            blocks.push(React.createElement("div", {
                key: `heading-${blocks.length}`,
                style: {
                    color: headingText,
                    fontWeight: 700,
                    fontSize: level <= 2 ? "16px" : "14px",
                    marginTop: blocks.length ? "6px" : 0
                }
            }, heading[2]));
            continue;
        }

        const bullet = /^[-*]\s+(.+)$/.exec(line);
        if (bullet) {
            listItems.push(bullet[1]);
            continue;
        }

        flushList();
        blocks.push(React.createElement("p", {
            key: `paragraph-${blocks.length}`,
            style: { margin: 0, color: mutedText, lineHeight: 1.45 }
        }, line));
    }

    flushList();
    return blocks.length ? blocks : React.createElement("p", { style: { margin: 0, color: mutedText } }, "No release notes were provided.");
}

const themedModalBodyStyle = {
    display: "grid",
    gap: "10px",
    maxHeight: "280px",
    overflow: "auto",
    color: "var(--text-normal)"
};

const themedMutedMetaStyle = {
    color: "var(--text-muted)",
    fontSize: "12px"
};

function showUpdateFoundModal(version: string, release: GithubRelease) {
    openModal(props => React.createElement(ConfirmModal, {
        ...props,
        title: "Update found",
        subtitle: `DiscordLyrics ${version} is available. Install it and restart Discord?`,
        confirmText: "Install and restart",
        cancelText: "Later",
        variant: "primary",
        onConfirm: () => {
            showToast("DiscordLyrics update started", Toasts.Type.MESSAGE);
            void Native.installUpdate(version, release.body || "").catch(error => {
                debugLog(`update install failed ${stringifyError(error)}`);
                showToast("DiscordLyrics update could not start", Toasts.Type.FAILURE);
            });
        },
        onCancel: () => void 0
    }, React.createElement("div", {
        style: {
            ...themedModalBodyStyle,
            display: "grid",
            gap: "10px",
            maxHeight: "260px",
            overflow: "auto"
        }
    },
        React.createElement("strong", { style: { color: "var(--header-primary)" } }, "What's new"),
        React.createElement("div", { style: { display: "grid", gap: "8px" } }, renderReleaseNotes(release.body || "")),
        React.createElement("div", { style: themedMutedMetaStyle }, release.html_url || `https://github.com/${REPO}/releases/latest`)
    )));
}

let pendingUpdateNoticeOpen = false;

async function showPendingUpdateNotice(attempt = 1) {
    if (pendingUpdateNoticeOpen) return;

    const readPendingUpdateNotice = Native.readPendingUpdateNotice;
    if (typeof readPendingUpdateNotice !== "function") {
        debugLog(`pending update notice reader unavailable attempt=${attempt}`);
        if (attempt < 6) window.setTimeout(() => void showPendingUpdateNotice(attempt + 1), 5000);
        return;
    }

    const notice = await readPendingUpdateNotice() as { version?: string; body?: string; } | null;
    if (!notice?.version) {
        return;
    }

    pendingUpdateNoticeOpen = true;
    const clearNotice = () => {
        pendingUpdateNoticeOpen = false;
        void Native.clearPendingUpdateNotice?.();
    };

    try {
        openModal(props => React.createElement(ConfirmModal, {
            ...props,
            title: "DiscordLyrics updated",
            subtitle: `Version ${notice.version} is installed.`,
            confirmText: "Nice",
            cancelText: "Close",
            variant: "primary",
            onConfirm: clearNotice,
            onCancel: clearNotice
        }, React.createElement("div", {
            style: themedModalBodyStyle
        },
            React.createElement("strong", { style: { color: "var(--header-primary)" } }, "What's new"),
            React.createElement("div", { style: { display: "grid", gap: "8px" } }, renderReleaseNotes(notice.body || ""))
        )));
        debugLog(`pending update notice opened version=${notice.version}`);
    } catch (error) {
        pendingUpdateNoticeOpen = false;
        debugLog(`pending update notice failed attempt=${attempt} ${stringifyError(error)}`);
        if (attempt < 6) window.setTimeout(() => void showPendingUpdateNotice(attempt + 1), 5000);
    }
}

function UpdateSettingsControl() {
    const [lastChecked, setLastChecked] = React.useState<string | null>(null);
    const [latestVersion, setLatestVersion] = React.useState<string | null>(null);
    const [checking, setChecking] = React.useState(false);

    React.useEffect(() => {
        let mounted = true;

        void Promise.all([
            DataStore.get<string>(LAST_UPDATE_CHECK_KEY),
            DataStore.get<string>(LAST_UPDATE_VERSION_KEY)
        ]).then(([storedLastChecked, storedLatestVersion]) => {
            if (!mounted) return;
            setLastChecked(storedLastChecked ?? null);
            setLatestVersion(storedLatestVersion ?? null);
        });

        return () => {
            mounted = false;
        };
    }, []);

    return React.createElement("div", {
        style: {
            display: "grid",
            gap: "8px",
            padding: "12px",
            border: "1px solid var(--background-modifier-accent)",
            borderRadius: "8px",
            background: "var(--background-secondary)",
            color: "var(--text-normal)"
        }
    },
        React.createElement(Button, {
            color: Button.Colors.PRIMARY,
            disabled: checking,
            onClick: async () => {
                setChecking(true);
                const result = await checkForDiscordLyricsUpdate({ source: "manual" });
                setLastChecked(result.checkedAt);
                setLatestVersion(result.latest || ((await DataStore.get<string>(LAST_UPDATE_VERSION_KEY)) ?? null));
                setChecking(false);
            }
        }, checking ? "Checking..." : "Check for updates"),
        React.createElement("div", { style: themedMutedMetaStyle }, `Current version: ${RELEASE_VERSION}`),
        React.createElement("div", { style: themedMutedMetaStyle }, `Latest on GitHub: ${latestVersion || "not checked"}`),
        React.createElement("div", { style: themedMutedMetaStyle }, formatLastChecked(lastChecked))
    );
}

const settings = definePluginSettings({
    fontStyle: {
        type: OptionType.SELECT,
        description: "Readable Discord-safe text style for lyric statuses.",
        options: FONT_OPTIONS.map(option => ({
            ...option,
            default: option.value === DEFAULT_SETTINGS.fontStyle
        }))
    },
    showWaitingDots: {
        type: OptionType.BOOLEAN,
        description: "Show dots during intros and long lyric gaps.",
        default: DEFAULT_SETTINGS.showWaitingDots
    },
    loadingText: {
        type: OptionType.STRING,
        description: "Text shown while lyrics load.",
        default: DEFAULT_SETTINGS.loadingText
    },
    noLyricsText: {
        type: OptionType.STRING,
        description: "Text shown when synced lyrics are not found.",
        default: DEFAULT_SETTINGS.noLyricsText
    },
    pausedPrefix: {
        type: OptionType.STRING,
        description: "Text before the song title while Spotify is paused.",
        default: DEFAULT_SETTINGS.pausedPrefix
    },
    usePlainLyricsFallback: {
        type: OptionType.BOOLEAN,
        description: "Use unsynced lyrics if synced lyrics are missing. This is less accurate.",
        default: DEFAULT_SETTINGS.usePlainLyricsFallback
    },
    enableRpc: {
        type: OptionType.BOOLEAN,
        description: "Show a Rich Presence card for the current Spotify song.",
        default: DEFAULT_SETTINGS.enableRpc
    },
    rpcName: {
        type: OptionType.STRING,
        description: "Rich Presence app name.",
        default: DEFAULT_SETTINGS.rpcName
    },
    rpcShowWhenPaused: {
        type: OptionType.BOOLEAN,
        description: "Keep the Rich Presence card visible while Spotify is paused.",
        default: DEFAULT_SETTINGS.rpcShowWhenPaused
    },
    rpcShowAlbumArt: {
        type: OptionType.BOOLEAN,
        description: "Show the song cover on Rich Presence.",
        default: DEFAULT_SETTINGS.rpcShowAlbumArt
    },
    resetToDefaults: {
        type: OptionType.COMPONENT,
        component: () => React.createElement(Button, {
            color: Button.Colors.RED,
            onClick: resetPluginDefaults
        }, "Reset DiscordLyrics Defaults")
    }
});

function cleanText(value: unknown) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
}

function cleanDescription(value: unknown) {
    return cleanText(String(value ?? "")
        .replace(/<br\s*\/?>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, "\"")
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">"));
}

function getStoredNumber(key: keyof typeof DEFAULT_SETTINGS, fallback: number) {
    const value = Number((settings.store as Record<string, unknown>)[key] ?? fallback);
    return Number.isFinite(value) ? value : fallback;
}

function truncateStatus(value: string) {
    const maxLength = Math.min(
        getStatusBubbleLimit(),
        Math.max(1, getStoredNumber("maxStatusLength", DEFAULT_SETTINGS.maxStatusLength))
    );
    const text = cleanText(value);
    return shortenToWords(text, maxLength);
}

function getStatusBubbleLimit() {
    switch (settings.store.fontStyle as FontStyleId) {
        case "wide":
        case "fullwidth":
            return 24;
        case "script":
        case "scriptBold":
        case "fraktur":
        case "frakturBold":
        case "doubleStruck":
        case "serifBoldItalic":
        case "sansBoldItalic":
            return 34;
        case "mono":
        case "bold":
        case "boldItalic":
        case "sansBold":
        case "serifBold":
            return 38;
        case "uppercase":
            return 42;
        case "smallCaps":
        case "italic":
        case "sans":
        case "sansItalic":
        case "serifItalic":
        case "title":
        case "lowercase":
        case "normal":
        default:
            return 46;
    }
}

function shortenToWords(text: string, maxLength: number) {
    const chars = [...text];
    if (chars.length <= maxLength) return text;

    const suffix = "...";
    const limit = Math.max(1, maxLength - suffix.length);
    const cut = chars.slice(0, limit).join("").trimEnd();
    const wordCut = cut.replace(/\s+\S*$/, "").trimEnd();
    const shortened = wordCut.length >= Math.floor(limit * 0.55) ? wordCut : cut;

    return `${shortened.replace(/[,.!?;:-]+$/, "")}${suffix}`;
}

const FONT_RANGES = {
    fullwidth: { upper: 0xff21, lower: 0xff41, digit: 0xff10 },
    mono: { upper: 0x1d670, lower: 0x1d68a, digit: 0x1d7f6 },
    bold: { upper: 0x1d400, lower: 0x1d41a, digit: 0x1d7ce },
    italic: { upper: 0x1d434, lower: 0x1d44e },
    boldItalic: { upper: 0x1d468, lower: 0x1d482 },
    sans: { upper: 0x1d5a0, lower: 0x1d5ba, digit: 0x1d7e2 },
    sansItalic: { upper: 0x1d608, lower: 0x1d622 },
    sansBold: { upper: 0x1d5d4, lower: 0x1d5ee, digit: 0x1d7ec },
    sansBoldItalic: { upper: 0x1d63c, lower: 0x1d656 },
    serifBold: { upper: 0x1d400, lower: 0x1d41a, digit: 0x1d7ce },
    serifItalic: { upper: 0x1d434, lower: 0x1d44e },
    serifBoldItalic: { upper: 0x1d468, lower: 0x1d482 },
    script: { upper: 0x1d49c, lower: 0x1d4b6 },
    scriptBold: { upper: 0x1d4d0, lower: 0x1d4ea },
    fraktur: { upper: 0x1d504, lower: 0x1d51e },
    frakturBold: { upper: 0x1d56c, lower: 0x1d586 },
    doubleStruck: { upper: 0x1d538, lower: 0x1d552, digit: 0x1d7d8 }
} as const;

const FONT_EXCEPTIONS: Partial<Record<keyof typeof FONT_RANGES, Record<string, string>>> = {
    script: {
        B: "\u{212c}", E: "\u{2130}", F: "\u{2131}", H: "\u{210b}", I: "\u{2110}", L: "\u{2112}", M: "\u{2133}", R: "\u{211b}",
        e: "\u{212f}", g: "\u{210a}", o: "\u{2134}"
    },
    fraktur: {
        C: "\u{212d}", H: "\u{210c}", I: "\u{2111}", R: "\u{211c}", Z: "\u{2128}"
    },
    doubleStruck: {
        C: "\u{2102}", H: "\u{210d}", N: "\u{2115}", P: "\u{2119}", Q: "\u{211a}", R: "\u{211d}", Z: "\u{2124}"
    }
};

function styleAlphabet(value: string, style: keyof typeof FONT_RANGES) {
    const ranges = FONT_RANGES[style];
    const exceptions = FONT_EXCEPTIONS[style] ?? {};

    return [...value].map(char => {
        if (exceptions[char]) return exceptions[char];

        const code = char.charCodeAt(0);
        if (code >= 65 && code <= 90) return String.fromCodePoint(ranges.upper + code - 65);
        if (code >= 97 && code <= 122) return String.fromCodePoint(ranges.lower + code - 97);
        if ("digit" in ranges && code >= 48 && code <= 57) return String.fromCodePoint(ranges.digit + code - 48);
        if (style === "fullwidth" && char === " ") return " ";
        return char;
    }).join("");
}

function styleSmallCaps(value: string) {
    const letters: Record<string, string> = {
        a: "\u{1d00}", b: "\u{0299}", c: "\u{1d04}", d: "\u{1d05}", e: "\u{1d07}", f: "\u{a730}", g: "\u{0262}", h: "\u{029c}", i: "\u{026a}", j: "\u{1d0a}",
        k: "\u{1d0b}", l: "\u{029f}", m: "\u{1d0d}", n: "\u{0274}", o: "\u{1d0f}", p: "\u{1d18}", q: "\u{01eb}", r: "\u{0280}", s: "\u{a731}", t: "\u{1d1b}",
        u: "\u{1d1c}", v: "\u{1d20}", w: "\u{1d21}", x: "x", y: "\u{028f}", z: "\u{1d22}"
    };

    return [...value.toLowerCase()].map(char => letters[char] ?? char).join("");
}

function applyFontStyle(value: string) {
    const text = cleanText(value);
    switch (settings.store.fontStyle as FontStyleId) {
        case "uppercase": return text.toUpperCase();
        case "lowercase": return text.toLowerCase();
        case "title": return text.toLowerCase().replace(/\b\w/g, char => char.toUpperCase());
        case "wide": return text.split("").join(" ");
        case "fullwidth": return styleAlphabet(text, "fullwidth");
        case "mono": return styleAlphabet(text, "mono");
        case "bold": return styleAlphabet(text, "bold");
        case "italic": return styleAlphabet(text, "italic");
        case "boldItalic": return styleAlphabet(text, "boldItalic");
        case "sans": return styleAlphabet(text, "sans");
        case "sansItalic": return styleAlphabet(text, "sansItalic");
        case "sansBold": return styleAlphabet(text, "sansBold");
        case "sansBoldItalic": return styleAlphabet(text, "sansBoldItalic");
        case "serifBold": return styleAlphabet(text, "serifBold");
        case "serifItalic": return styleAlphabet(text, "serifItalic");
        case "serifBoldItalic": return styleAlphabet(text, "serifBoldItalic");
        case "script": return styleAlphabet(text, "script");
        case "scriptBold": return styleAlphabet(text, "scriptBold");
        case "fraktur": return styleAlphabet(text, "fraktur");
        case "frakturBold": return styleAlphabet(text, "frakturBold");
        case "doubleStruck": return styleAlphabet(text, "doubleStruck");
        case "smallCaps": return styleSmallCaps(text);
        case "normal":
        default: return text;
    }
}

function formatStatus(value: string, styled = true) {
    return truncateStatus(styled ? applyFontStyle(value) : value);
}

function getTickMs() {
    return Math.max(150, getStoredNumber("updateIntervalMs", DEFAULT_SETTINGS.updateIntervalMs));
}

function restartTimer() {
    if (interval) clearInterval(interval);
    interval = setInterval(tick, getTickMs());
}

function getWaitingStatus() {
    return ".".repeat(Math.floor(Date.now() / 700) % 3 + 1);
}

function isWaitingStatus(status: string) {
    return /^\.{1,3}$/.test(status) || status === settings.store.loadingText || status === settings.store.noLyricsText;
}

function getCurrentCustomStatusText() {
    try {
        const value = getStatusSetting("customStatus")?.getSetting() as { text?: unknown; } | undefined;
        return cleanText(value?.text);
    } catch {
        return "";
    }
}

function forceRemoteStatus(status: string, reason: string) {
    if (!status || isWaitingStatus(status)) return;

    debugLog(`custom status force "${status}" ${reason}`);
    lastRemoteStatusText = undefined;
    lastRemoteStatusExpiresAt = 0;
    setRemoteStatus(status, true);
}

function ensureRemoteStatusMatches(status: string) {
    if (!status || isWaitingStatus(status)) return;

    const currentStatus = getCurrentCustomStatusText();
    if (currentStatus !== status) {
        forceRemoteStatus(status, `actual="${currentStatus}"`);
        return;
    }

    refreshRemoteStatusExpiration(status);
}

function setProfileStatus(text: string) {
    const status = truncateStatus(text);
    const waitingStatus = isWaitingStatus(status);

    if (status === lastStatusText) {
        ensureRemoteStatusMatches(status);
        return;
    }
    lastStatusText = status;
    debugLog(`local status "${status}"`);

    if (waitingStatus) {
        clearPendingWaitingRemoteStatus();
    } else if (getCurrentCustomStatusText() !== status && lastRemoteStatusText === status) {
        forceRemoteStatus(status, "cache-mismatch");
    } else {
        setRemoteStatus(status, true);
    }

    FluxDispatcher.dispatch({
        type: "LOCAL_ACTIVITY_UPDATE",
        activity: status ? {
            id: "custom",
            name: "Custom Status",
            state: status,
            type: ActivityType.CUSTOM_STATUS,
            flags: ActivityFlags.INSTANCE,
            created_at: Date.now()
        } satisfies Activity : null,
        socketId: STATUS_SOCKET_ID,
    });
}

function refreshRemoteStatusExpiration(status: string) {
    if (!status || isWaitingStatus(status)) return;
    if (status !== lastRemoteStatusText) return;
    if (Date.now() + STATUS_EXPIRATION_REFRESH_MS < lastRemoteStatusExpiresAt) return;

    setRemoteStatus(status);
}

function clearPendingWaitingRemoteStatus() {
    if (!isWaitingStatus(pendingRemoteStatusText)) return;

    pendingRemoteStatusText = lastRemoteStatusText ?? "";
    if (remoteStatusTimer) {
        clearTimeout(remoteStatusTimer);
        remoteStatusTimer = undefined;
    }
}

function setRemoteStatus(status: string, urgent = false) {
    pendingRemoteStatusText = status;
    scheduleRemoteStatusFlush(urgent);
}

function scheduleRemoteStatusFlush(urgent = false) {
    if (remoteStatusInFlight) return;

    if (urgent && remoteStatusTimer) {
        clearTimeout(remoteStatusTimer);
        remoteStatusTimer = undefined;
        nextRemoteStatusAt = 0;
    }

    if (remoteStatusTimer) return;

    const delay = Math.max(0, nextRemoteStatusAt - Date.now());
    if (urgent && delay === 0) {
        void flushRemoteStatus();
        return;
    }

    remoteStatusTimer = window.setTimeout(() => void flushRemoteStatus(), delay);
}

async function flushRemoteStatus() {
    if (remoteStatusInFlight) return;
    if (remoteStatusTimer) {
        clearTimeout(remoteStatusTimer);
        remoteStatusTimer = undefined;
    }

    const status = pendingRemoteStatusText;
    const shouldRefreshExpiration = Boolean(status)
        && status === lastRemoteStatusText
        && Date.now() + STATUS_EXPIRATION_REFRESH_MS >= lastRemoteStatusExpiresAt;
    if (status === lastRemoteStatusText && !shouldRefreshExpiration) return;

    remoteStatusInFlight = true;
    debugLog(`custom status update start "${status}"`);
    try {
        const customStatus = getStatusSetting("customStatus");
        if (!customStatus) throw new Error("status.customStatus setting was not found");

        if (status !== lastRemoteStatusText) {
            await customStatus.updateSetting(status ? { text: status } : undefined);
        }

        const expiresAtMs = getStatusSetting("statusExpiresAtMs");
        if (expiresAtMs) {
            if (status) {
                lastRemoteStatusExpiresAt = Date.now() + STATUS_EXPIRATION_MS;
                await expiresAtMs.updateSetting(String(lastRemoteStatusExpiresAt));
            } else {
                lastRemoteStatusExpiresAt = 0;
                await expiresAtMs.updateSetting("0");
            }
        }

        const createdAtMs = getStatusSetting("statusCreatedAtMs");
        if (createdAtMs && status) await createdAtMs.updateSetting({ value: String(Date.now()) });

        lastRemoteStatusText = status;
        nextRemoteStatusAt = Date.now() + MIN_REMOTE_STATUS_INTERVAL_MS;
        debugLog(`custom status update ok "${status}"`);
    } catch (error) {
        nextRemoteStatusAt = Date.now() + getRetryAfterMs(error);
        debugLog(`custom status update failed "${status}" ${stringifyError(error)}`);
        console.warn("[SpotifyLyricsStatus] Discord rejected custom status update", error);
    } finally {
        remoteStatusInFlight = false;
        if (pendingRemoteStatusText !== lastRemoteStatusText) scheduleRemoteStatusFlush();
    }
}

function stringifyError(error: unknown) {
    if (error instanceof Error) return `${error.name}: ${error.message}`;

    const maybeError = error as { message?: unknown; status?: unknown; text?: unknown; body?: unknown; };
    if (maybeError?.message || maybeError?.status || maybeError?.text) {
        return `${String(maybeError.message ?? error)} status=${String(maybeError.status ?? "")} text=${String(maybeError.text ?? "")}`;
    }

    try {
        return JSON.stringify(error);
    } catch {
        return String(error);
    }
}

function getRetryAfterMs(error: unknown) {
    const maybeError = error as { retryAfter?: unknown; body?: { retry_after?: unknown; }; };
    const retryAfterSeconds = Number(maybeError.retryAfter ?? maybeError.body?.retry_after);
    return Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
        ? Math.ceil(retryAfterSeconds * 1000)
        : MIN_REMOTE_STATUS_INTERVAL_MS;
}

function clearRpc() {
    if (!lastRpcKey) return;
    lastRpcKey = "";
    lastRpcStartedAt = 0;
    FluxDispatcher.dispatch({
        type: "LOCAL_ACTIVITY_UPDATE",
        activity: null,
        socketId: RPC_SOCKET_ID,
    });
}

function normalizeDurationMs(duration: unknown) {
    const value = Number(duration || 0);
    if (!Number.isFinite(value) || value <= 0) return 0;
    return value < 10000 ? Math.round(value * 1000) : Math.round(value);
}

function rawSpotifyTrackKey(track: SpotifyTrack | null | undefined) {
    if (!track?.name) return "";

    const artists = track.artists?.map(artist => artist.name).filter(Boolean).join(", ") ?? "";
    return [
        cleanText(track.type || (track.show ? "episode" : "track")).toLowerCase(),
        track.id ?? "",
        cleanText(track.name).toLowerCase(),
        cleanText(artists || track.show?.publisher || track.publisher).toLowerCase(),
        Math.round(normalizeDurationMs(track.duration_ms ?? track.duration) / 1000)
    ].join("|");
}

function getSpotifyImageAsset(url: string) {
    const match = cleanText(url).match(/^https?:\/\/i\.scdn\.co\/image\/([a-z0-9]+)$/i);
    return match ? `spotify:${match[1]}` : undefined;
}

function getAlbumAsset(track: NormalizedTrack) {
    if (!settings.store.rpcShowAlbumArt || !track.albumImage) return undefined;

    const spotifyAsset = getSpotifyImageAsset(track.albumImage);
    if (spotifyAsset) return spotifyAsset;

    if (albumAssetResolved.has(track.albumImage)) return albumAssetResolved.get(track.albumImage);

    if (!albumAssetCache.has(track.albumImage)) {
        albumAssetCache.set(track.albumImage, ApplicationAssetUtils.fetchAssetIds("0", [track.albumImage])
            .then(ids => {
                const asset = ids[0];
                albumAssetResolved.set(track.albumImage, asset);
                debugLog(`album art resolved "${track.albumImage}" -> "${asset ?? ""}"`);
                const current = getCurrentTrack();
                if (current && trackKey(current) === trackKey(track)) tick();
                return asset;
            })
            .catch(error => {
                console.warn("[SpotifyLyricsStatus] Could not fetch album art", error);
                albumAssetResolved.set(track.albumImage, undefined);
                return undefined;
            }));
    }

    return undefined;
}

function updateRpc(track: NormalizedTrack, paused = false) {
    if (!settings.store.enableRpc || (paused && !settings.store.rpcShowWhenPaused)) {
        clearRpc();
        return;
    }

    const fallbackImage = !track.albumImage ? requestFallbackAlbumImage(track, paused) : undefined;
    const rpcTrack = fallbackImage ? {
        ...track,
        albumImage: fallbackImage
    } : track;
    const largeImage = getAlbumAsset(rpcTrack);
    const duration = normalizeDurationMs(rpcTrack.durationMs);
    const progress = Math.max(0, duration ? Math.min(track.progressMs, duration) : track.progressMs);
    const now = Date.now();
    const startedAt = paused || !duration ? 0 : now - progress;
    const key = `${trackKey(rpcTrack)}|${paused}|${largeImage ?? ""}|${duration}`;
    const timingDrift = startedAt && lastRpcStartedAt ? Math.abs(startedAt - lastRpcStartedAt) : 0;
    if (key === lastRpcKey && (!startedAt || timingDrift < 5000)) return;
    lastRpcKey = key;
    lastRpcStartedAt = startedAt;

    const rpcName = settings.store.rpcName === "Spotify Lyrics"
        ? DEFAULT_SETTINGS.rpcName
        : settings.store.rpcName || DEFAULT_SETTINGS.rpcName;
    const activity: Activity = {
        application_id: "0",
        name: rpcName,
        details: paused ? `${settings.store.pausedPrefix}${rpcTrack.title}` : rpcTrack.title,
        state: getTrackSubtitle(rpcTrack),
        type: ActivityType.LISTENING,
        timestamps: paused || !duration ? undefined : {
            start: startedAt,
            end: startedAt + duration
        },
        assets: largeImage ? {
            large_image: largeImage,
            large_text: rpcTrack.album || rpcTrack.title
        } : undefined,
        status_display_type: ActivityStatusDisplayType.DETAILS,
        flags: ActivityFlags.INSTANCE
    };

    FluxDispatcher.dispatch({
        type: "LOCAL_ACTIVITY_UPDATE",
        activity,
        socketId: RPC_SOCKET_ID,
    });
    debugLog(`rpc update ${paused ? "paused" : "playing"} "${track.title}" progress=${Math.round(progress)}ms duration=${duration}ms start=${startedAt || ""} image=${largeImage ?? ""}`);
}

function getTrackSubtitle(track: NormalizedTrack) {
    if (track.album && track.artist) return `${track.artist} - ${track.album}`;
    return track.artist || track.album || spotifyContentLabel(track);
}

function fallbackAlbumImageKey(track: NormalizedTrack) {
    return `${comparableMediaText(track.title)}|${comparableMediaText(firstArtist(track.artist))}|${comparableMediaText(track.album)}`;
}

async function lookupFallbackAlbumImage(track: NormalizedTrack) {
    const key = fallbackAlbumImageKey(track);
    if (!key.replace(/\|/g, "")) return undefined;
    if (fallbackAlbumImageCache.has(key)) return fallbackAlbumImageCache.get(key);
    if (fallbackAlbumImageRequests.has(key)) return fallbackAlbumImageRequests.get(key);

    const request = (async () => {
        try {
            const searchAlbumImage = Native?.searchAlbumImage as ((title: string, artist: string, album: string) => Promise<string>) | undefined;
            const url = searchAlbumImage ? cleanText(await searchAlbumImage(track.title, track.artist, track.album)) : undefined;
            fallbackAlbumImageCache.set(key, url);
            return url;
        } catch (error) {
            debugLog(`fallback album art failed ${stringifyError(error)}`);
            fallbackAlbumImageCache.set(key, undefined);
            return undefined;
        } finally {
            fallbackAlbumImageRequests.delete(key);
        }
    })();

    fallbackAlbumImageRequests.set(key, request);
    return request;
}

function requestFallbackAlbumImage(track: NormalizedTrack, paused: boolean) {
    const key = fallbackAlbumImageKey(track);
    const cached = fallbackAlbumImageCache.get(key);
    if (cached) return cached;

    void lookupFallbackAlbumImage(track).then(url => {
        if (!url) return;

        const enriched = rememberSpotifyTrack({
            ...track,
            albumImage: url
        });
        if (windowsSpotifyTrack && trackKey(windowsSpotifyTrack) === trackKey(track)) {
            windowsSpotifyTrack = enriched;
            windowsSpotifyTrackReceivedAt = Date.now();
        }

        lastRpcKey = "";
        updateRpc(enriched, paused);
    });

    return undefined;
}

function normalizeWindowsSpotifyTrack(state: WindowsSpotifyState): NormalizedTrack | undefined {
    const media = state.track;
    const title = cleanText(media?.title);
    if (!title) return undefined;

    const status = cleanText(media?.status).toLowerCase();
    const progressMs = Number(media?.positionMs ?? 0) + getStoredNumber("lyricOffsetMs", DEFAULT_SETTINGS.lyricOffsetMs);

    const fallback = findLastKnownTrackForMedia(title, cleanText(media?.artist));

    return {
        id: "",
        title,
        artist: cleanText(media?.artist),
        album: cleanText(media?.album) || fallback?.album || "",
        albumImage: fallback?.albumImage || "",
        contentType: "track",
        description: "",
        durationMs: normalizeDurationMs(media?.durationMs) || fallback?.durationMs || 0,
        progressMs: Math.max(0, progressMs),
        isPlaying: status === "playing"
    };
}

function comparableMediaText(value: string) {
    return cleanComparable(value || "");
}

function findLastKnownTrackForMedia(title: string, artist: string) {
    if (!lastKnownSpotifyTrack) return undefined;

    const mediaTitle = comparableMediaText(title);
    const knownTitle = comparableMediaText(lastKnownSpotifyTrack.title);
    if (!mediaTitle || !knownTitle || mediaTitle !== knownTitle) return undefined;

    const mediaArtist = firstArtist(artist);
    const knownArtist = firstArtist(lastKnownSpotifyTrack.artist);
    if (mediaArtist && knownArtist && comparableMediaText(mediaArtist) !== comparableMediaText(knownArtist)) return undefined;

    return lastKnownSpotifyTrack;
}

function rememberSpotifyTrack(track: NormalizedTrack) {
    if (!track.albumImage && lastKnownSpotifyTrack) {
        const fallback = findLastKnownTrackForMedia(track.title, track.artist);
        if (fallback?.albumImage) {
            track = {
                ...track,
                id: track.id || fallback.id,
                album: track.album || fallback.album,
                albumImage: fallback.albumImage,
                durationMs: normalizeDurationMs(track.durationMs) || fallback.durationMs
            };
        }
    }

    lastKnownSpotifyTrack = track;
    lastKnownSpotifyTrackAt = Date.now();
    return track;
}

async function pollWindowsSpotifyState(force = false) {
    const now = Date.now();
    if (windowsSpotifyPollInFlight || (!force && now - lastWindowsSpotifyPollAt < WINDOWS_SPOTIFY_POLL_INTERVAL_MS)) return;

    const getWindowsSpotifyState = Native?.getWindowsSpotifyState as (() => Promise<WindowsSpotifyState>) | undefined;
    if (!getWindowsSpotifyState) return;

    windowsSpotifyPollInFlight = true;
    lastWindowsSpotifyPollAt = now;

    try {
        const state = await getWindowsSpotifyState();
        windowsSpotifyProcessRunning = Boolean(state?.processRunning);
        if (windowsSpotifyProcessRunning) windowsSpotifyProcessSeenAt = Date.now();
        const track = normalizeWindowsSpotifyTrack(state ?? {});

        if (track) {
            windowsSpotifyTrack = rememberSpotifyTrack(track);
            windowsSpotifyTrackReceivedAt = Date.now();
            spotifyUnavailableAt = 0;
            debugLog(`windows spotify ${windowsSpotifyTrack.isPlaying ? "playing" : "paused"} "${windowsSpotifyTrack.title}" ${Math.round(windowsSpotifyTrack.progressMs)}ms`);
            tick();
            return;
        }

        if (!windowsSpotifyProcessRunning && Date.now() - windowsSpotifyProcessSeenAt > WINDOWS_SPOTIFY_PROCESS_GRACE_MS) {
            windowsSpotifyTrack = undefined;
            windowsSpotifyTrackReceivedAt = 0;
        }
    } catch (error) {
        debugLog(`windows spotify check failed ${stringifyError(error)}`);
    } finally {
        windowsSpotifyPollInFlight = false;
    }
}

function getCurrentTrack(): NormalizedTrack | undefined {
    const stateAge = spotifyState?.receivedAt ? Date.now() - spotifyState.receivedAt : Number.POSITIVE_INFINITY;
    const recentlyUnavailable = spotifyUnavailableAt > 0 && Date.now() - spotifyUnavailableAt < SPOTIFY_UNAVAILABLE_GRACE_MS;
    const stateTrack = spotifyState?.track ?? null;
    const storeTrack = SpotifyStore.track ?? null;
    const storePosition = Number(SpotifyStore.position ?? NaN);
    const storeHasPosition = Number.isFinite(storePosition) && storePosition >= 0;
    const storeRawKey = rawSpotifyTrackKey(storeTrack);
    const storeHasTrack = Boolean(storeTrack?.name)
        && (!recentlyUnavailable || Boolean(SpotifyStore.isPlaying) || (storeRawKey && storeRawKey !== lastTrackKey));
    const storeChangedTrack = storeHasTrack
        && Boolean(stateTrack?.name)
        && storeRawKey !== rawSpotifyTrackKey(stateTrack);
    const useState = Boolean(stateTrack && stateAge < SPOTIFY_STATE_FRESH_MS && !storeChangedTrack);
    const useStore = !useState && storeHasTrack;
    const track: SpotifyTrack | null = useStore ? storeTrack : useState ? stateTrack : null;
    if (!track) {
        if (windowsSpotifyTrack && Date.now() - windowsSpotifyTrackReceivedAt < WINDOWS_SPOTIFY_STATE_FRESH_MS) {
            return windowsSpotifyTrack;
        }

        if (
            (windowsSpotifyProcessRunning || Date.now() - windowsSpotifyProcessSeenAt < WINDOWS_SPOTIFY_PROCESS_GRACE_MS)
            && lastKnownSpotifyTrack
            && Date.now() - lastKnownSpotifyTrackAt < LAST_KNOWN_SPOTIFY_TRACK_MS
        ) {
            return {
                ...lastKnownSpotifyTrack,
                isPlaying: false
            };
        }

        return undefined;
    }

    const isPlaying = useStore ? Boolean(SpotifyStore.isPlaying) : Boolean(spotifyState!.isPlaying);
    const statePosition = Number(spotifyState?.position || 0) + (isPlaying && spotifyState?.receivedAt ? Math.max(0, stateAge) : 0);
    const rawPosition = useStore && storeHasPosition ? storePosition : statePosition;
    const position = rawPosition + getStoredNumber("lyricOffsetMs", DEFAULT_SETTINGS.lyricOffsetMs);
    const artists = track.artists?.map(artist => artist.name).filter(Boolean).join(", ") ?? "";
    const contentType = cleanText(track.type || (track.show ? "episode" : "track")).toLowerCase();
    const creator = artists || cleanText(track.show?.publisher || track.publisher);
    const collection = cleanText(track.album?.name || track.show?.name);
    const albumImage = cleanText(
        track.album?.image?.url
        || track.album?.images?.[0]?.url
        || track.show?.images?.[0]?.url
        || track.images?.[0]?.url
    );
    const description = cleanDescription(track.description || track.html_description);

    const normalized = {
        id: track.id ?? "",
        title: cleanText(track.name),
        artist: creator,
        album: collection,
        albumImage,
        contentType,
        description,
        durationMs: normalizeDurationMs(track.duration_ms ?? track.duration),
        progressMs: Math.max(0, position),
        isPlaying
    };

    rememberSpotifyTrack(normalized);
    return normalized;
}

async function pollSpotifyPlayer(force = false) {
    const now = Date.now();
    if (!force && now < spotifyPollMutedUntil) return;
    if (spotifyPollInFlight || (!force && now - lastSpotifyPollAt < SPOTIFY_POLL_INTERVAL_MS)) return;

    const request = (SpotifyStore as unknown as {
        _req?: (method: "get", route: string) => Promise<{
            is_playing?: boolean;
            progress_ms?: number;
            item?: {
                id?: string;
                name?: string;
                duration_ms?: number;
                type?: string;
                publisher?: string;
                description?: string;
                html_description?: string;
                images?: Array<{ url?: string; height?: number; width?: number; }>;
                album?: {
                    name?: string;
                    images?: Array<{ url?: string; height?: number; width?: number; }>;
                };
                artists?: Array<{ name?: string; }>;
                show?: SpotifyShow;
            } | null;
        } | null>;
    })._req;

    if (!request) return;

    spotifyPollInFlight = true;
    lastSpotifyPollAt = now;

    try {
        const player = await request.call(SpotifyStore, "get", "/currently-playing");
        if (!player?.item) {
            const stateAge = spotifyState?.receivedAt ? Date.now() - spotifyState.receivedAt : Number.POSITIVE_INFINITY;
            if ((spotifyState?.track && stateAge < SPOTIFY_STATE_FRESH_MS) || SpotifyStore.track?.name) {
                return;
            }

            spotifyState = undefined;
            spotifyUnavailableAt = Date.now();
            tick();
            return;
        }

        const image = player.item.album?.images?.[0];
        spotifyUnavailableAt = 0;
        spotifyState = {
            track: {
                id: player.item.id ?? null,
                name: player.item.name ?? "",
                duration: Number(player.item.duration_ms || 0),
                duration_ms: Number(player.item.duration_ms || 0),
                type: player.item.type,
                publisher: player.item.publisher,
                description: player.item.description,
                html_description: player.item.html_description,
                album: {
                    name: player.item.album?.name ?? "",
                    image: image ? { url: image.url } : undefined,
                    images: player.item.album?.images
                },
                artists: player.item.artists?.map(artist => ({ name: artist.name ?? "" })) ?? [],
                show: player.item.show,
                images: player.item.images
            },
            isPlaying: Boolean(player.is_playing),
            position: Number(player.progress_ms || 0),
            receivedAt: Date.now()
        };

        debugLog(`spotify poll ${spotifyState.isPlaying ? "playing" : "paused"} "${spotifyState.track?.name ?? ""}" ${spotifyState.position}ms`);
        tick();
    } catch (error) {
        debugLog(`spotify poll failed ${stringifyError(error)}`);
        spotifyPollMutedUntil = Date.now() + 10000;
    } finally {
        spotifyPollInFlight = false;
    }
}

function trackKey(track: NormalizedTrack) {
    return [
        track.contentType,
        track.id,
        track.title.toLowerCase(),
        track.artist.toLowerCase(),
        Math.round(track.durationMs / 1000)
    ].join("|");
}

function supportsSyncedLyrics(track: NormalizedTrack) {
    return !track.contentType || track.contentType === "track" || track.contentType === "song";
}

function clearProfileStatusForTrackChange() {
    lastStatusText = "";
    nextRemoteStatusAt = 0;
    setRemoteStatus("", true);
    FluxDispatcher.dispatch({
        type: "LOCAL_ACTIVITY_UPDATE",
        activity: null,
        socketId: STATUS_SOCKET_ID,
    });
}

function prepareTrack(track: NormalizedTrack) {
    const key = trackKey(track);
    if (key === lastTrackKey) return false;

    debugLog(`track change "${track.title}"`);
    lastTrackKey = key;
    lyrics = [];
    clearProfileStatusForTrackChange();

    if (supportsSyncedLyrics(track)) {
        loadingTrackKey = key;
        void loadLyrics(track);
    } else {
        loadingTrackKey = "";
    }

    return true;
}

function spotifyContentLabel(track: NormalizedTrack) {
    switch (track.contentType) {
        case "episode": return "Podcast";
        case "show": return "Podcast";
        case "audiobook": return "Audiobook";
        case "chapter": return "Audiobook";
        default: return "Spotify";
    }
}

function nonSongStatus(track: NormalizedTrack) {
    if (track.description) {
        const chunks = splitLyricChunks(track.description);
        const chunkMs = Math.max(3500, Math.min(8000, Math.floor((track.durationMs || chunks.length * 5000) / chunks.length)));
        const index = Math.min(chunks.length - 1, Math.floor(track.progressMs / chunkMs));
        return formatStatus(chunks[index]);
    }

    const label = spotifyContentLabel(track);
    return track.artist ? `${label} - ${track.title}` : `${label} - ${track.title}`;
}

function parseSyncedLyrics(raw: string): LyricLine[] {
    return raw
        .split(/\r?\n/)
        .map(line => {
            const match = line.match(/^\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]\s*(.*)$/);
            if (!match) return null;

            const minutes = Number(match[1]);
            const seconds = Number(match[2]);
            const millis = Number((match[3] || "0").padEnd(3, "0").slice(0, 3));
            const text = cleanText(match[4]).replace(/\s*\[[^\]]+\]\s*/g, " ");
            return text ? { timeMs: minutes * 60000 + seconds * 1000 + millis, text } : null;
        })
        .filter(Boolean)
        .sort((a, b) => a!.timeMs - b!.timeMs) as LyricLine[];
}

function parsePlainLyrics(raw: string, durationMs: number): LyricLine[] {
    const lines = raw.split(/\r?\n/).map(cleanText).filter(Boolean);
    if (!lines.length) return [];

    const usableDuration = Math.max(30000, durationMs || lines.length * 3500);
    const introMs = Math.min(16000, Math.max(8000, Math.round(usableDuration * 0.05)));
    const stepMs = Math.max(1800, Math.round((usableDuration - introMs) / lines.length));

    return lines.map((text, index) => ({
        timeMs: introMs + index * stepMs,
        text
    }));
}

async function nativeFetchJson<T>(url: string): Promise<{ status: number; data: T | null; }> {
    if (Native?.fetchJson) return await Native.fetchJson(url) as { status: number; data: T | null; };

    const response = await fetch(url, {
        signal: fetchController?.signal,
        headers: { Accept: "application/json" }
    });

    return {
        status: response.status,
        data: response.status === 404 ? null : await response.json()
    };
}

async function fetchLyrics(url: string): Promise<LrcLibResult | null> {
    const response = await nativeFetchJson<LrcLibResult>(url);
    if (response.status === 404) return null;
    if (response.status < 200 || response.status >= 300) throw new Error(`LRCLIB returned ${response.status}`);
    return response.data;
}

async function searchLyrics(track: NormalizedTrack): Promise<LrcLibResult | null> {
    const queries = [
        `${track.title} ${track.artist}`,
        `${stripFeatureText(track.title)} ${firstArtist(track.artist)}`,
        `${stripFeatureText(track.title)} ${track.artist}`
    ];

    for (const query of queries) {
        const params = new URLSearchParams({ q: query });
        const response = await nativeFetchJson<LrcLibResult[]>(`https://lrclib.net/api/search?${params}`);
        if (response.status < 200 || response.status >= 300 || !Array.isArray(response.data)) continue;

        const match = response.data
            .filter(result => result.syncedLyrics || result.synced_lyrics || (settings.store.usePlainLyricsFallback && result.plainLyrics))
            .sort((a, b) => scoreLyricsResult(b, track) - scoreLyricsResult(a, track))[0];

        if (match) return match;
    }

    return null;
}

async function loadLyrics(track: NormalizedTrack) {
    fetchController?.abort();
    fetchController = new AbortController();

    const key = trackKey(track);
    const params = new URLSearchParams({
        track_name: track.title,
        artist_name: track.artist
    });

    if (track.album) params.set("album_name", track.album);
    if (track.durationMs) params.set("duration", String(Math.round(track.durationMs / 1000)));

    try {
        const exact = await fetchLyrics(`https://lrclib.net/api/get?${params}`);
        const exactSynced = parseSyncedLyrics(exact?.syncedLyrics ?? exact?.synced_lyrics ?? "");
        const found = exactSynced.length ? exact : await searchLyrics(track) ?? exact;
        const synced = exactSynced.length
            ? exactSynced
            : parseSyncedLyrics(found?.syncedLyrics ?? found?.synced_lyrics ?? "");
        const nextLyrics = synced.length || !settings.store.usePlainLyricsFallback
            ? synced
            : parsePlainLyrics(found?.plainLyrics ?? "", track.durationMs);

        if (loadingTrackKey !== key || key !== lastTrackKey) return;

        lyrics = nextLyrics;
        loadingTrackKey = "";
        tick();
    } catch (error) {
        if ((error as Error).name === "AbortError") return;
        console.warn("[SpotifyLyricsStatus] Could not load lyrics", error);
        if (loadingTrackKey === key && key === lastTrackKey) {
            lyrics = [];
            loadingTrackKey = "";
            tick();
        }
    }
}

function scoreLyricsResult(result: LrcLibResult, track: NormalizedTrack) {
    let score = 0;
    const resultTitle = cleanComparable(result.trackName);
    const resultArtist = cleanComparable(result.artistName);
    const resultAlbum = cleanComparable(result.albumName);
    const title = cleanComparable(track.title);
    const artist = cleanComparable(track.artist);
    const album = cleanComparable(track.album);

    if (resultTitle === title) score += 8;
    else if (resultTitle.includes(title) || title.includes(resultTitle)) score += 4;

    if (artist && resultArtist.includes(firstArtist(artist))) score += 4;
    if (album && resultAlbum === album) score += 2;

    if (track.durationMs && result.duration) {
        const diff = Math.abs(result.duration - Math.round(track.durationMs / 1000));
        if (diff <= 2) score += 4;
        else if (diff <= 8) score += 2;
    }

    return score;
}

function stripFeatureText(value: string) {
    return value
        .replace(/\s*[-(]\s*(feat\.?|ft\.?|with)\s+[^)\]-]+[)\]]?/ig, "")
        .replace(/\s*\([^)]*(remaster|sped up|slowed|nightcore|version)[^)]*\)/ig, "")
        .trim();
}

function firstArtist(value: string) {
    return cleanText(value).split(/,|&| x | feat\.?| ft\.?/i)[0]?.trim() ?? "";
}

function cleanComparable(value: unknown) {
    return stripFeatureText(cleanText(value))
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, "")
        .replace(/\s+/g, " ")
        .trim();
}

function getLyricChunkLimit() {
    switch (settings.store.fontStyle as FontStyleId) {
        case "wide":
            return 13;
        case "fullwidth":
            return 20;
        default:
            return getStatusBubbleLimit();
    }
}

function splitLyricChunks(text: string) {
    const maxLength = Math.max(8, getLyricChunkLimit());
    const words = cleanText(text).split(" ").filter(Boolean);
    const chunks: string[] = [];
    let current = "";

    for (const word of words) {
        const candidate = current ? `${current} ${word}` : word;
        if ([...candidate].length <= maxLength) {
            current = candidate;
            continue;
        }

        if (current) chunks.push(current);

        if ([...word].length <= maxLength) {
            current = word;
            continue;
        }

        const letters = [...word];
        for (let index = 0; index < letters.length; index += maxLength) {
            chunks.push(letters.slice(index, index + maxLength).join(""));
        }
        current = "";
    }

    if (current) chunks.push(current);
    return chunks.length ? chunks : [cleanText(text)];
}

function chunkWeight(text: string) {
    return Math.max(1, [...cleanText(text)].filter(char => char !== " ").length);
}

function lyricPageForStatus(line: ActiveLyricLine, progressMs: number) {
    const chunks = splitLyricChunks(line.text);
    if (chunks.length <= 1) return formatStatus(chunks[0]);

    const lyricOffsetMs = Math.max(0, getStoredNumber("lyricOffsetMs", DEFAULT_SETTINGS.lyricOffsetMs));
    const lineDurationMs = Math.max(
        chunks.length * 1500,
        (line.nextTimeMs ?? line.timeMs + chunks.length * 2200) - line.timeMs
    );
    const elapsedMs = Math.max(0, progressMs - line.timeMs - lyricOffsetMs);
    const totalWeight = chunks.reduce((total, chunk) => total + chunkWeight(chunk), 0);

    let index = 0;
    let elapsedWeight = 0;

    for (let chunkIndex = 1; chunkIndex < chunks.length; chunkIndex++) {
        elapsedWeight += chunkWeight(chunks[chunkIndex - 1]);

        const sungThreshold = lineDurationMs * elapsedWeight / totalWeight;
        const readThreshold = chunkIndex * 1300;
        if (elapsedMs >= Math.max(sungThreshold, readThreshold)) {
            index = chunkIndex;
        }
    }

    return formatStatus(chunks[index]);
}

function lyricAt(progressMs: number): ActiveLyricLine | undefined {
    if (!lyrics.length) return undefined;

    if (progressMs < lyrics[0].timeMs) return undefined;

    let low = 0;
    let high = lyrics.length - 1;
    let current = -1;

    while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        if (lyrics[mid].timeMs <= progressMs) {
            current = mid;
            low = mid + 1;
        } else {
            high = mid - 1;
        }
    }

    if (current < 0) return undefined;

    const line = lyrics[current];
    const nextLine = lyrics[current + 1];
    const gapThresholdMs = Math.max(3000, getStoredNumber("gapThresholdMs", DEFAULT_SETTINGS.gapThresholdMs));

    if (settings.store.showWaitingDots && nextLine) {
        const gapMs = nextLine.timeMs - line.timeMs;
        if (gapMs >= gapThresholdMs) {
            const chunks = splitLyricChunks(line.text);
            const holdMs = Math.min(gapMs - 250, Math.max(2600, chunks.length * 900));
            if (progressMs >= line.timeMs + holdMs) return undefined;
        }
    }

    return {
        ...line,
        nextTimeMs: nextLine?.timeMs
    };
}

function tick() {
    void pollSpotifyPlayer();
    void pollWindowsSpotifyState();

    const track = getCurrentTrack();

    if (!track) {
        lastPlaybackPlaying = undefined;
        if (!windowsSpotifyProcessRunning && Date.now() - windowsSpotifyProcessSeenAt > WINDOWS_SPOTIFY_PROCESS_GRACE_MS) {
            lastTrackKey = "";
            loadingTrackKey = "";
            lyrics = [];
            lastKnownSpotifyTrack = undefined;
            lastKnownSpotifyTrackAt = 0;
        }
        setProfileStatus("");
        clearRpc();
        return;
    }

    if (!track.isPlaying) {
        lastPlaybackPlaying = false;
        const pausedText = `${settings.store.pausedPrefix}${track.title}`;
        setProfileStatus(formatStatus(pausedText, false));
        updateRpc(track, true);
        return;
    }

    const resumedFromPause = lastPlaybackPlaying === false;
    lastPlaybackPlaying = true;

    const key = trackKey(track);
    if (key !== lastTrackKey) prepareTrack(track);

    updateRpc(track);

    if (!supportsSyncedLyrics(track)) {
        setProfileStatus(formatStatus(nonSongStatus(track)));
        return;
    }

    const lyric = lyricAt(track.progressMs);
    if (lyric) {
        setProfileStatus(lyricPageForStatus(lyric, track.progressMs));
        return;
    }

    if (settings.store.showWaitingDots) {
        if (resumedFromPause) {
            debugLog("play resumed before next lyric; clearing remote pause status");
            setRemoteStatus("", true);
        }
        setProfileStatus(getWaitingStatus());
    } else if (lastTrackKey === loadingTrackKey) {
        if (resumedFromPause) {
            debugLog("play resumed while loading lyrics; clearing remote pause status");
            setRemoteStatus("", true);
        }
        setProfileStatus(formatStatus(settings.store.loadingText, false));
    } else {
        if (resumedFromPause) {
            debugLog("play resumed with no lyric; clearing remote pause status");
            setRemoteStatus("", true);
        }
        setProfileStatus(formatStatus(settings.store.noLyricsText, false));
    }
}

function onSpotifyPlayerState(event: SpotifyStateEvent) {
    if (!event?.track) {
        spotifyState = undefined;
        spotifyUnavailableAt = Date.now();
        debugLog("spotify event cleared");
        void pollWindowsSpotifyState(true).then(() => tick());
        return;
    }

    spotifyUnavailableAt = 0;
    spotifyState = { ...event, receivedAt: Date.now() };
    debugLog(`spotify event ${event.isPlaying ? "playing" : "paused"} "${event.track?.name ?? ""}" ${event.position}ms`);
    const track = getCurrentTrack();
    if (track) rememberSpotifyTrack(track);
    if (track?.isPlaying) prepareTrack(track);
    tick();
}

function clearStatusForShutdown() {
    pendingRemoteStatusText = "";
    lastStatusText = "";
    setProfileStatus("");
    void flushRemoteStatus();
    clearRpc();
}

updatePluginAuthor();

export default definePlugin({
    name: "DiscordLyrics",
    description: "Sets your profile status to synced Spotify lyrics and shows a Spotify song RPC.",
    authors: [pluginAuthor],
    tags: ["Spotify", "Media"],
    dependencies: ["SpotifyControls", "UserSettingsAPI"],
    settings,
    settingsAboutComponent: UpdateSettingsControl,

    start() {
        updatePluginAuthor();
        FluxDispatcher.subscribe("SPOTIFY_PLAYER_STATE", onSpotifyPlayerState);
        restartTimer();
        logStatusUserSettings();
        setRemoteStatus("");
        void pollSpotifyPlayer(true);
        void pollWindowsSpotifyState(true);
        window.setTimeout(() => void pollWindowsSpotifyState(true), 2000);
        window.setTimeout(() => void pollWindowsSpotifyState(true), 5000);
        window.setTimeout(() => void showPendingUpdateNotice(), 2500);
        window.setTimeout(() => void checkForDiscordLyricsUpdateOnStartup(), 7000);
        tick();
        showToast("DiscordLyrics started", Toasts.Type.SUCCESS);
    },

    stop() {
        if (interval) clearInterval(interval);
        if (remoteStatusTimer) clearTimeout(remoteStatusTimer);
        interval = undefined;
        remoteStatusTimer = undefined;
        FluxDispatcher.unsubscribe("SPOTIFY_PLAYER_STATE", onSpotifyPlayerState);
        fetchController?.abort();
        fetchController = undefined;
        spotifyState = undefined;
        windowsSpotifyTrack = undefined;
        windowsSpotifyTrackReceivedAt = 0;
        windowsSpotifyProcessRunning = false;
        lastKnownSpotifyTrack = undefined;
        lastKnownSpotifyTrackAt = 0;
        lyrics = [];
        lastTrackKey = "";
        loadingTrackKey = "";
        lastPlaybackPlaying = undefined;
        clearStatusForShutdown();
    }
});
