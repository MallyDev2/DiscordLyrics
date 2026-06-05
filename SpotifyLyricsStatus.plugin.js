/**
 * @name DiscordLyrics
 * @author mally
 * @description Sets your Discord custom status to the current synced lyric from Spotify, or a pause status when playback stops.
 * @version 1.0.4
 * @source https://lrclib.net
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile, spawn } = require("child_process");

module.exports = class DiscordLyrics {
    constructor() {
        this.name = "DiscordLyrics";
        this.version = "1.0.4";
        this.repo = "MallyDev2/DiscordLyrics";
        this.latestReleaseApi = `https://api.github.com/repos/${this.repo}/releases/latest`;
        this.interval = null;
        this.lastStatus = null;
        this.lastTrackKey = null;
        this.pauseTrack = null;
        this.windowsSpotifyTrack = null;
        this.windowsSpotifyTrackAt = 0;
        this.windowsSpotifyProcessRunning = false;
        this.windowsSpotifyProcessSeenAt = 0;
        this.windowsSpotifyPollAt = 0;
        this.windowsSpotifyPollInFlight = false;
        this.lastKnownTrack = null;
        this.lastKnownTrackAt = 0;
        this.lyrics = [];
        this.lyricsSource = null;
        this.fetchController = null;
        this.statusCooldownUntil = 0;
        this.spotifyState = null;
        this.spotifyStateListener = null;
        this.lastStatusExpiresAt = 0;
        this.lastRemoteStatus = null;
        this.lastForcedStatusAt = 0;
        this.spotifyUnavailableAt = 0;
        this.lastUpdateCheckedAt = Number(BdApi.Data.load(this.name, "lastUpdateCheckedAt") || 0);
        this.latestVersion = BdApi.Data.load(this.name, "latestVersion") || "";
        this.autoUpdateChecked = false;
        this.stateDir = path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "DiscordLyrics");
        this.installProfilePath = path.join(this.stateDir, "install-profile.json");
        this.pendingUpdatePath = path.join(this.stateDir, "pending-update.json");
        this.updateNotesPath = path.join(this.stateDir, "update-notes.txt");
        this.updateInstallerPath = path.join(this.stateDir, "DiscordLyrics-Installer.ps1");
        this.updateUiPath = path.join(this.stateDir, "DiscordLyrics-Installer.exe");
        this.updateLogPath = path.join(this.stateDir, "update-install.log");
        this.pendingUpdateNoticeOpen = false;

        this.config = {
            tickMs: 1000,
            statusMinMs: 1000,
            lyricLeadMs: 0,
            maxStatusLength: 128,
            pausedPrefix: "\u23f8 Pause - ",
            noLyricsPrefix: "\u266b ",
            clearWhenNoSong: true,
            statusExpirationMs: 120000,
            statusExpirationRefreshMs: 45000,
            windowsSpotifyPollMs: 2000,
            windowsSpotifyFreshMs: 10000,
            windowsSpotifyProcessGraceMs: 15000,
            lastKnownTrackMs: 1800000
        };
    }

    start() {
        this.findModules();
        this.subscribeSpotifyState();
        this.interval = setInterval(() => this.tick(), this.config.tickMs);
        setTimeout(() => this.showPendingUpdateNotice(), 2500);
        this.tick();
        setTimeout(() => this.pollWindowsSpotifyState(true), 1000);
        setTimeout(() => this.pollWindowsSpotifyState(true), 3000);
        setTimeout(() => this.checkForUpdatesOnStartup(), 7000);
        BdApi.showToast("DiscordLyrics started", { type: "success" });
    }

    stop() {
        clearInterval(this.interval);
        this.interval = null;

        if (this.fetchController) this.fetchController.abort();
        this.fetchController = null;
        this.unsubscribeSpotifyState();

        this.lyrics = [];
        this.lastTrackKey = null;
        this.lastStatus = null;
        this.lastRemoteStatus = null;
        this.lastForcedStatusAt = 0;
        this.pauseTrack = null;
        this.windowsSpotifyTrack = null;
        this.windowsSpotifyTrackAt = 0;
        this.lastKnownTrack = null;
        this.lastKnownTrackAt = 0;
        this.spotifyState = null;

        this.clearStatusForShutdown();
        BdApi.showToast("DiscordLyrics stopped", { type: "info" });
    }

    clearStatusForShutdown = () => {
        this.lastStatus = null;
        this.pauseTrack = null;
        this.setCustomStatus("");
    };

    findModules() {
        const wp = BdApi.Webpack;
        this.PresenceStore = wp.getStore?.("PresenceStore")
            || wp.getModule(m => m?.getLocalPresence && m?.getState);

        this.UserStore = wp.getStore?.("UserStore")
            || wp.getModule(m => m?.getCurrentUser && m?.getUser);

        this.HTTP = wp.getModule(wp.Filters.byProps("patch", "get", "post"));
        this.FluxDispatcher = wp.getModule(wp.Filters.byProps("subscribe", "unsubscribe", "dispatch"));
    }

    subscribeSpotifyState() {
        if (!this.FluxDispatcher?.subscribe || this.spotifyStateListener) return;

        this.spotifyStateListener = event => {
            if (!event?.track) {
                this.spotifyState = null;
                this.spotifyUnavailableAt = Date.now();
                this.handleClosedOrIdle();
                return;
            }

            this.spotifyUnavailableAt = 0;
            this.spotifyState = {
                track: event.track,
                isPlaying: Boolean(event.isPlaying),
                position: Number(event.position || 0),
                updatedAt: Date.now()
            };
        };

        this.FluxDispatcher.subscribe("SPOTIFY_PLAYER_STATE", this.spotifyStateListener);
    }

    unsubscribeSpotifyState() {
        if (!this.FluxDispatcher?.unsubscribe || !this.spotifyStateListener) return;
        this.FluxDispatcher.unsubscribe("SPOTIFY_PLAYER_STATE", this.spotifyStateListener);
        this.spotifyStateListener = null;
    }

    async tick() {
        try {
            this.pollWindowsSpotifyState();

            const stateTrack = this.trackFromSpotifyState();
            if (stateTrack) {
                if (!stateTrack.isPlaying) {
                    this.pauseTrack = stateTrack;
                    await this.handlePausedTrack(stateTrack);
                    return;
                }

                await this.handlePlayingTrack(stateTrack);
                return;
            }

            const activity = this.getSpotifyActivity();

            if (!activity) {
                const windowsTrack = this.getWindowsSpotifyTrack();
                if (windowsTrack) {
                    if (!windowsTrack.isPlaying) {
                        this.pauseTrack = windowsTrack;
                        await this.handlePausedTrack(windowsTrack);
                    } else {
                        await this.handlePlayingTrack(windowsTrack);
                    }
                    return;
                }

                if (
                    (this.windowsSpotifyProcessRunning || Date.now() - this.windowsSpotifyProcessSeenAt < this.config.windowsSpotifyProcessGraceMs)
                    && this.lastKnownTrack
                    && Date.now() - this.lastKnownTrackAt < this.config.lastKnownTrackMs
                ) {
                    await this.handlePausedTrack({ ...this.lastKnownTrack, isPlaying: false });
                    return;
                }

                await this.handleClosedOrIdle();
                return;
            }

            const track = this.trackFromActivity(activity);
            if (!track?.title || !track?.artist) return;

            await this.handlePlayingTrack(track);
        } catch (error) {
            console.error("[SpotifyLyricsStatus]", error);
        }
    }

    async handlePlayingTrack(track) {
        this.pauseTrack = track;
        const trackKey = this.getTrackKey(track);

        if (trackKey !== this.lastTrackKey) {
            this.lastTrackKey = trackKey;
            this.lastStatus = null;
            this.lyrics = [];
            this.lyricsSource = null;
            this.loadLyrics(track);
        }

        const line = this.getCurrentLyric(track.progressMs);
        const status = line || `${this.config.noLyricsPrefix}${track.title} - ${track.artist}`;
        await this.setCustomStatus(status);
    }

    getSpotifyActivity() {
        const localPresence = this.PresenceStore?.getLocalPresence?.()
            || this.PresenceStore?.getState?.()?.localPresence;

        const activities = localPresence?.activities || [];
        return activities.find(activity => {
            const name = String(activity?.name || "").toLowerCase();
            return activity?.type === 2 || name === "spotify";
        });
    }

    trackFromSpotifyState() {
        if (!this.spotifyState?.track) return null;

        const { track, isPlaying, position, updatedAt } = this.spotifyState;
        const artist = Array.isArray(track.artists)
            ? track.artists.map(item => item?.name).filter(Boolean).join(", ")
            : "";
        const progressMs = position + (isPlaying ? Date.now() - updatedAt : 0) + this.config.lyricLeadMs;

        return {
            title: this.cleanText(track.name),
            artist: this.cleanText(artist),
            album: this.cleanText(track.album?.name),
            syncId: track.id || "",
            durationMs: this.normalizeDurationMs(track.duration_ms ?? track.duration),
            progressMs: Math.max(0, progressMs),
            isPlaying
        };
    }

    trackFromActivity(activity) {
        const title = activity.details || activity.name;
        const artist = activity.state || "";
        const album = activity.assets?.large_text || "";
        const syncId = activity.sync_id || activity.metadata?.spotify_id || "";
        const startedAt = activity.timestamps?.start || null;
        const endsAt = activity.timestamps?.end || null;
        const now = Date.now();
        const durationMs = startedAt && endsAt ? Math.max(0, endsAt - startedAt) : 0;
        const progressMs = startedAt ? Math.max(0, now - startedAt + this.config.lyricLeadMs) : 0;

        return {
            title: this.cleanText(title),
            artist: this.cleanText(artist),
            album: this.cleanText(album),
            syncId,
            durationMs: this.normalizeDurationMs(durationMs),
            progressMs,
            isPlaying: true
        };
    }

    getWindowsSpotifyTrack() {
        return this.windowsSpotifyTrack && Date.now() - this.windowsSpotifyTrackAt < this.config.windowsSpotifyFreshMs
            ? this.windowsSpotifyTrack
            : null;
    }

    normalizeWindowsSpotifyTrack(state) {
        const media = state?.track;
        const title = this.cleanText(media?.title);
        if (!title) return null;

        const fallback = this.findLastKnownTrack(title, media?.artist);
        return this.rememberTrack({
            title,
            artist: this.cleanText(media?.artist),
            album: this.cleanText(media?.album) || fallback?.album || "",
            syncId: fallback?.syncId || "",
            durationMs: this.normalizeDurationMs(media?.durationMs) || fallback?.durationMs || 0,
            progressMs: Math.max(0, Number(media?.positionMs || 0) + this.config.lyricLeadMs),
            isPlaying: this.cleanText(media?.status).toLowerCase() === "playing"
        });
    }

    findLastKnownTrack(title, artist) {
        if (!this.lastKnownTrack) return null;
        if (this.comparable(title) !== this.comparable(this.lastKnownTrack.title)) return null;

        const mediaArtist = this.comparable(this.firstArtist(artist));
        const knownArtist = this.comparable(this.firstArtist(this.lastKnownTrack.artist));
        if (mediaArtist && knownArtist && mediaArtist !== knownArtist) return null;

        return this.lastKnownTrack;
    }

    rememberTrack(track) {
        if (!track?.title) return track;
        this.lastKnownTrack = track;
        this.lastKnownTrackAt = Date.now();
        return track;
    }

    async handlePausedTrack(track) {
        this.lastTrackKey = null;
        this.lyrics = [];

        if (track?.title) {
            await this.setCustomStatus(`${this.config.pausedPrefix}${track.title}`, true);
            return;
        }

        await this.setCustomStatus("");
    }

    pollWindowsSpotifyState(force = false) {
        if (process.platform !== "win32") return;
        if (this.windowsSpotifyPollInFlight) return;
        if (!force && Date.now() - this.windowsSpotifyPollAt < this.config.windowsSpotifyPollMs) return;

        this.windowsSpotifyPollInFlight = true;
        this.windowsSpotifyPollAt = Date.now();

        const script = `
$ErrorActionPreference = "SilentlyContinue"
$processRunning = [bool](Get-Process Spotify -ErrorAction SilentlyContinue | Select-Object -First 1)
$track = $null
try {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  function Await($AsyncOperation, $ResultType) {
    $asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.IsGenericMethod })[0]
    $task = $asTask.MakeGenericMethod($ResultType).Invoke($null, @($AsyncOperation))
    return $task.GetAwaiter().GetResult()
  }
  [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime] | Out-Null
  [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties, Windows.Media.Control, ContentType = WindowsRuntime] | Out-Null
  $manager = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
  foreach ($session in $manager.GetSessions()) {
    if (($session.SourceAppUserModelId -as [string]) -notmatch "Spotify") { continue }
    $props = Await ($session.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
    $timeline = $session.GetTimelineProperties()
    if ($props.Title) {
      $track = [pscustomobject]@{
        title = $props.Title
        artist = $props.Artist
        album = $props.AlbumTitle
        status = $session.GetPlaybackInfo().PlaybackStatus.ToString()
        positionMs = [math]::Max(0, [int64]$timeline.Position.TotalMilliseconds)
        durationMs = [math]::Max(0, [int64]$timeline.EndTime.TotalMilliseconds)
      }
      break
    }
  }
} catch {}
[pscustomobject]@{ processRunning = $processRunning; track = $track } | ConvertTo-Json -Compress
`;

        execFile("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], {
            windowsHide: true,
            timeout: 2500,
            maxBuffer: 64 * 1024
        }, (error, stdout) => {
            this.windowsSpotifyPollInFlight = false;
            if (error) return;

            try {
                const state = JSON.parse(String(stdout || "{\"processRunning\":false,\"track\":null}").trim());
                this.windowsSpotifyProcessRunning = Boolean(state?.processRunning);
                if (this.windowsSpotifyProcessRunning) this.windowsSpotifyProcessSeenAt = Date.now();

                const track = this.normalizeWindowsSpotifyTrack(state);
                if (track) {
                    this.windowsSpotifyTrack = track;
                    this.windowsSpotifyTrackAt = Date.now();
                    this.spotifyUnavailableAt = 0;
                } else if (!this.windowsSpotifyProcessRunning && Date.now() - this.windowsSpotifyProcessSeenAt > this.config.windowsSpotifyProcessGraceMs) {
                    this.windowsSpotifyTrack = null;
                    this.windowsSpotifyTrackAt = 0;
                }
            } catch (parseError) {
                console.warn("[SpotifyLyricsStatus] Could not read Windows Spotify state", parseError);
            }
        });
    }

    async handleClosedOrIdle() {
        this.lastTrackKey = null;
        this.lyrics = [];
        this.pauseTrack = null;
        await this.setCustomStatus("");
    }

    async checkForUpdatesOnStartup() {
        if (this.autoUpdateChecked) return;
        this.autoUpdateChecked = true;
        await this.checkForUpdates({ silentIfCurrent: true });
    }

    async fetchLatestRelease() {
        const response = await fetch(this.latestReleaseApi, {
            headers: {
                Accept: "application/vnd.github+json",
                "User-Agent": "DiscordLyrics"
            }
        });
        if (!response.ok) throw new Error(`Release lookup returned ${response.status}`);
        return response.json();
    }

    async checkForUpdates(options = {}) {
        this.lastUpdateCheckedAt = Date.now();
        BdApi.Data.save(this.name, "lastUpdateCheckedAt", this.lastUpdateCheckedAt);

        try {
            const release = await this.fetchLatestRelease();
            const latest = this.normalizeVersion(release.tag_name || release.name || "");
            this.latestVersion = latest || this.version;
            BdApi.Data.save(this.name, "latestVersion", this.latestVersion);

            if (!latest || this.compareVersions(latest, this.version) <= 0) {
                if (!options.silentIfCurrent) BdApi.showToast("DiscordLyrics is up to date", { type: "success" });
                return { latest: this.latestVersion, checkedAt: this.lastUpdateCheckedAt };
            }

            this.showUpdateFoundModal(latest, release);
            return { latest, checkedAt: this.lastUpdateCheckedAt };
        } catch (error) {
            console.warn("[SpotifyLyricsStatus] Update check failed", error);
            if (!options.silentIfCurrent) BdApi.showToast("DiscordLyrics update check failed", { type: "error" });
            return { latest: "", checkedAt: this.lastUpdateCheckedAt };
        }
    }

    showUpdateFoundModal(version, release) {
        const theme = this.getThemeStyles();
        BdApi.UI.showConfirmationModal(
            "Update found",
            BdApi.React.createElement("div", {
                style: {
                    display: "grid",
                    gap: "10px",
                    maxHeight: "280px",
                    overflow: "auto",
                    color: theme.text
                }
            },
                BdApi.React.createElement("div", null, `DiscordLyrics ${version} is available. Install it and restart Discord?`),
                BdApi.React.createElement("strong", { style: { color: theme.heading } }, "What's new"),
                BdApi.React.createElement("div", { style: { display: "grid", gap: "8px" } }, this.renderReleaseNotes(release.body || "")),
                BdApi.React.createElement("div", { style: { color: theme.muted, fontSize: "12px" } }, release.html_url || `https://github.com/${this.repo}/releases/latest`)
            ),
            {
                confirmText: "Install and restart",
                cancelText: "Later",
                onConfirm: () => this.installUpdate(version, release.body || "")
            }
        );
    }

    async installUpdate(version, body) {
        try {
            fs.mkdirSync(this.stateDir, { recursive: true });
            fs.rmSync(this.pendingUpdatePath, { force: true });
            fs.writeFileSync(this.updateNotesPath, String(body || ""), "utf8");
            fs.writeFileSync(this.updateLogPath, `DiscordLyrics update started ${new Date().toISOString()}\n`, "utf8");

            let profile = {};
            try {
                profile = JSON.parse(fs.readFileSync(this.installProfilePath, "utf8"));
            } catch {
                profile = {};
            }

            const response = await fetch(`https://github.com/${this.repo}/releases/latest/download/DiscordLyrics-Installer.ps1`);
            if (!response.ok) throw new Error(`Installer download returned ${response.status}`);
            fs.writeFileSync(this.updateInstallerPath, await response.text(), "utf8");
            fs.appendFileSync(this.updateLogPath, `Installer script downloaded ${new Date().toISOString()}\n`);

            const uiResponse = await fetch(`https://github.com/${this.repo}/releases/latest/download/DiscordLyrics-Installer.exe`);
            if (!uiResponse.ok) throw new Error(`Installer UI download returned ${uiResponse.status}`);
            fs.writeFileSync(this.updateUiPath, Buffer.from(await uiResponse.arrayBuffer()));
            fs.appendFileSync(this.updateLogPath, `Installer UI downloaded ${new Date().toISOString()}\n`);

            const updateUiArgs = [
                "-UpdateMode",
                "-Target", "BetterDiscord",
                "-UpdateVersion", String(version || ""),
                "-UpdateNotesPath", this.updateNotesPath
            ];

            if (profile.sourcePath) updateUiArgs.push("-SourcePath", profile.sourcePath);

            fs.appendFileSync(this.updateLogPath, `Installer UI launching ${new Date().toISOString()}\n`);

            const child = spawn(this.updateUiPath, updateUiArgs, {
                detached: true,
                windowsHide: true,
                stdio: "ignore"
            });

            child.unref();

            BdApi.showToast("DiscordLyrics update started", { type: "info" });
        } catch (error) {
            console.warn("[SpotifyLyricsStatus] Update install failed", error);
            BdApi.showToast("DiscordLyrics update could not start", { type: "error" });
        }
    }

    showPendingUpdateNotice(attempt = 1) {
        try {
            if (this.pendingUpdateNoticeOpen) return;
            if (!fs.existsSync(this.pendingUpdatePath)) {
                if (attempt < 6) setTimeout(() => this.showPendingUpdateNotice(attempt + 1), 5000);
                return;
            }
            const notice = JSON.parse(fs.readFileSync(this.pendingUpdatePath, "utf8").replace(/^\uFEFF/, ""));
            if (!notice?.version) {
                if (attempt < 6) setTimeout(() => this.showPendingUpdateNotice(attempt + 1), 5000);
                return;
            }
            const theme = this.getThemeStyles();

            this.pendingUpdateNoticeOpen = true;
            const clearNotice = () => {
                this.pendingUpdateNoticeOpen = false;
                fs.rmSync(this.pendingUpdatePath, { force: true });
            };

            BdApi.UI.showConfirmationModal(
                "DiscordLyrics updated",
                BdApi.React.createElement("div", {
                    style: {
                        display: "grid",
                        gap: "10px",
                        maxHeight: "280px",
                        overflow: "auto",
                        color: theme.text
                    }
                },
                    BdApi.React.createElement("div", null, `Version ${notice.version} is installed.`),
                    BdApi.React.createElement("strong", { style: { color: theme.heading } }, "What's new"),
                    BdApi.React.createElement("div", { style: { display: "grid", gap: "8px" } }, this.renderReleaseNotes(notice.body || ""))
                ),
                {
                    confirmText: "Nice",
                    cancelText: "Close",
                    onConfirm: clearNotice,
                    onCancel: clearNotice
                }
            );
        } catch (error) {
            console.warn("[SpotifyLyricsStatus] Could not show update notice", error);
        }
    }

    getThemeValue(name, fallback) {
        try {
            return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
        } catch {
            return fallback;
        }
    }

    getThemeStyles() {
        return {
            surface: this.getThemeValue("--background-secondary", "#2b2d31"),
            surfaceAlt: this.getThemeValue("--background-tertiary", "#1e1f22"),
            border: this.getThemeValue("--background-modifier-accent", "rgba(255, 255, 255, 0.08)"),
            text: this.getThemeValue("--text-normal", "#dbdee1"),
            heading: this.getThemeValue("--header-primary", "#f2f3f5"),
            muted: this.getThemeValue("--text-muted", "#949ba4"),
            accent: this.getThemeValue("--brand-500", this.getThemeValue("--brand-experiment", "#5865f2")),
            accentText: this.getThemeValue("--white-500", "#ffffff")
        };
    }

    getSettingsPanel() {
        const theme = this.getThemeStyles();
        const panel = document.createElement("div");
        panel.style.display = "grid";
        panel.style.gap = "8px";
        panel.style.padding = "12px";
        panel.style.background = theme.surface;
        panel.style.border = `1px solid ${theme.border}`;
        panel.style.borderRadius = "8px";
        panel.style.color = theme.text;

        const button = document.createElement("button");
        button.textContent = "Check for updates";
        button.style.width = "fit-content";
        button.style.padding = "8px 12px";
        button.style.borderRadius = "6px";
        button.style.border = "0";
        button.style.cursor = "pointer";
        button.style.background = theme.accent;
        button.style.color = theme.accentText;
        button.style.fontWeight = "600";

        const current = document.createElement("div");
        const latest = document.createElement("div");
        const checked = document.createElement("div");
        [current, latest, checked].forEach(item => {
            item.style.fontSize = "12px";
            item.style.color = theme.muted;
        });

        const render = () => {
            current.textContent = `Current version: ${this.version}`;
            latest.textContent = `Latest on GitHub: ${this.latestVersion || "not checked"}`;
            checked.textContent = this.formatLastChecked(this.lastUpdateCheckedAt);
        };

        button.addEventListener("click", async () => {
            button.disabled = true;
            button.textContent = "Checking...";
            await this.checkForUpdates();
            button.disabled = false;
            button.textContent = "Check for updates";
            render();
        });

        render();
        panel.append(button, current, latest, checked);
        return panel;
    }

    async loadLyrics(track) {
        if (this.fetchController) this.fetchController.abort();
        this.fetchController = new AbortController();

        const params = new URLSearchParams({
            track_name: track.title,
            artist_name: track.artist
        });

        if (track.album) params.set("album_name", track.album);
        if (track.durationMs) params.set("duration", String(Math.round(track.durationMs / 1000)));

        try {
            const response = await fetch(`https://lrclib.net/api/get?${params}`, {
                signal: this.fetchController.signal,
                headers: {
                    "Accept": "application/json"
                }
            });

            if (!response.ok) throw new Error(`LRCLIB returned ${response.status}`);

            const data = await response.json();
            this.lyricsSource = data;
            this.lyrics = this.parseSyncedLyrics(data.syncedLyrics || data.synced_lyrics || "");
        } catch (error) {
            if (error.name !== "AbortError") {
                console.warn("[SpotifyLyricsStatus] Could not load synced lyrics", error);
                this.lyrics = [];
            }
        }
    }

    parseSyncedLyrics(raw) {
        return raw
            .split(/\r?\n/)
            .map(line => {
                const match = line.match(/^\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]\s*(.*)$/);
                if (!match) return null;

                const minutes = Number(match[1]);
                const seconds = Number(match[2]);
                const fraction = match[3] || "0";
                const millis = Number(fraction.padEnd(3, "0").slice(0, 3));
                const text = this.cleanLyric(match[4]);

                return { timeMs: minutes * 60000 + seconds * 1000 + millis, text };
            })
            .filter(line => line && line.text)
            .sort((a, b) => a.timeMs - b.timeMs);
    }

    getCurrentLyric(progressMs) {
        if (!this.lyrics.length) return "";

        let low = 0;
        let high = this.lyrics.length - 1;
        let current = -1;

        while (low <= high) {
            const mid = Math.floor((low + high) / 2);
            if (this.lyrics[mid].timeMs <= progressMs) {
                current = mid;
                low = mid + 1;
            } else {
                high = mid - 1;
            }
        }

        return current >= 0 ? this.lyrics[current].text : "";
    }

    getCurrentCustomStatusText() {
        try {
            const localPresence = this.PresenceStore?.getLocalPresence?.()
                || this.PresenceStore?.getState?.()?.localPresence;
            return this.cleanText(localPresence?.customStatus?.text || localPresence?.custom_status?.text);
        } catch {
            return "";
        }
    }

    async setCustomStatus(text, force = false) {
        const status = this.trimStatus(text);
        const now = Date.now();
        const actualStatus = this.getCurrentCustomStatusText();
        const cacheMismatch = status && status === this.lastStatus && actualStatus !== status;
        const shouldRefreshExpiration = status
            && status === this.lastStatus
            && now + this.config.statusExpirationRefreshMs >= this.lastStatusExpiresAt;
        const canForce = force && status && now - this.lastForcedStatusAt >= this.config.statusMinMs;

        if (!cacheMismatch && !canForce && ((status === this.lastStatus && !shouldRefreshExpiration) || now < this.statusCooldownUntil)) return;

        this.statusCooldownUntil = now + this.config.statusMinMs;
        this.lastStatus = status;
        if (force || cacheMismatch) this.lastForcedStatusAt = now;

        const customStatus = status ? {
            text: status,
            expires_at: new Date(now + this.config.statusExpirationMs).toISOString()
        } : null;
        this.lastStatusExpiresAt = status ? now + this.config.statusExpirationMs : 0;
        this.lastRemoteStatus = status;

        const body = { custom_status: customStatus };

        if (this.HTTP?.patch) {
            await this.HTTP.patch({
                url: "/users/@me/settings",
                body
            });
            return;
        }

        throw new Error("Could not find Discord HTTP module.");
    }

    getTrackKey(track) {
        return [
            track.syncId,
            track.title.toLowerCase(),
            track.artist.toLowerCase(),
            Math.round((track.durationMs || 0) / 1000)
        ].join("|");
    }

    normalizeDurationMs(duration) {
        const value = Number(duration || 0);
        if (!Number.isFinite(value) || value <= 0) return 0;
        return value < 10000 ? Math.round(value * 1000) : Math.round(value);
    }

    normalizeVersion(value) {
        const match = String(value || "").match(/\d+\.\d+\.\d+/);
        return match ? match[0] : "";
    }

    compareVersions(a, b) {
        const left = String(a || "").split(".").map(Number);
        const right = String(b || "").split(".").map(Number);

        for (let index = 0; index < 3; index++) {
            if ((left[index] || 0) > (right[index] || 0)) return 1;
            if ((left[index] || 0) < (right[index] || 0)) return -1;
        }

        return 0;
    }

    releaseBodyPreview(body) {
        const value = typeof body === "object" && body && "value" in body ? body.value : body;
        const text = String(value || "No release notes were provided.")
            .replace(/\r\n/g, "\n")
            .replace(/[ \t]+\n/g, "\n")
            .replace(/\n{3,}/g, "\n\n")
            .trim();
        return text.length > 1200 ? `${text.slice(0, 1200)}...` : text;
    }

    renderReleaseNotes(body) {
        const React = BdApi.React;
        const text = this.releaseBodyPreview(body);
        const theme = this.getThemeStyles();
        const blocks = [];
        let listItems = [];

        const flushList = () => {
            if (!listItems.length) return;
            const items = listItems;
            listItems = [];
            blocks.push(React.createElement("ul", {
                key: `list-${blocks.length}`,
                style: { margin: "0 0 0 18px", padding: 0, color: theme.text }
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
                        color: theme.heading,
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
                style: { margin: 0, color: theme.muted, lineHeight: 1.45 }
            }, line));
        }

        flushList();
        return blocks.length ? blocks : React.createElement("p", { style: { margin: 0, color: theme.muted } }, "No release notes were provided.");
    }

    formatLastChecked(value) {
        const timestamp = Number(value || 0);
        if (!Number.isFinite(timestamp) || timestamp <= 0) return "Last checked: never";
        return `Last checked: ${new Date(timestamp).toLocaleString()}`;
    }

    comparable(value) {
        return this.cleanText(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    }

    firstArtist(value) {
        return this.cleanText(value).split(",")[0] || "";
    }

    cleanLyric(value) {
        const text = this.cleanText(value)
            .replace(/\s*\[[^\]]+\]\s*/g, " ")
            .replace(/\s*\([^)]+instrumental[^)]*\)\s*/ig, " ");

        return text || "\u266a";
    }

    cleanText(value) {
        return String(value || "")
            .replace(/\s+/g, " ")
            .trim();
    }

    trimStatus(value) {
        const text = this.cleanText(value);
        if (text.length <= this.config.maxStatusLength) return text;
        return `${text.slice(0, this.config.maxStatusLength - 1).trim()}...`;
    }
};

