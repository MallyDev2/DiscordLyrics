/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 mally
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { IpcMainInvokeEvent } from "electron";
import { execFile, spawn } from "child_process";
import { appendFile, mkdir, readFile, unlink, writeFile } from "fs/promises";
import { join } from "path";
import { promisify } from "util";

const debugLogPath = join(process.env.USERPROFILE ?? process.cwd(), "Desktop", "DiscordLyrics", "spotify-lyrics-debug.log");
const appDataRoots = Array.from(new Set([
    process.env.APPDATA,
    process.env.USERPROFILE ? join(process.env.USERPROFILE, "AppData", "Roaming") : "",
    process.env.HOME ? join(process.env.HOME, "AppData", "Roaming") : ""
].filter(Boolean) as string[]));
const appDataDir = join(appDataRoots[0] ?? join(process.env.USERPROFILE ?? process.cwd(), "AppData", "Roaming"), "DiscordLyrics");
const pendingUpdatePaths = appDataRoots.map(root => join(root, "DiscordLyrics", "pending-update.json"));
const installProfilePath = join(appDataDir, "install-profile.json");
const pendingUpdatePath = join(appDataDir, "pending-update.json");
const updateInstallerPath = join(appDataDir, "DiscordLyrics-Installer.ps1");
const updateUiPath = join(appDataDir, "DiscordLyrics-Installer.exe");
const updateNotesPath = join(appDataDir, "update-notes.txt");
const updateLogPath = join(appDataDir, "update-install.log");
const execFileAsync = promisify(execFile);

export async function fetchJson(_: IpcMainInvokeEvent, url: string) {
    try {
        const parsed = new URL(url);
        if (parsed.origin !== "https://lrclib.net") {
            return { status: 400, data: { error: "Only LRCLIB requests are allowed" } };
        }

        const response = await fetch(parsed, {
            headers: {
                Accept: "application/json",
                "User-Agent": "Vencord SpotifyLyricsStatus"
            }
        });

        if (response.status === 404) return { status: 404, data: null };

        const text = await response.text();
        return {
            status: response.status,
            data: text ? JSON.parse(text) : null
        };
    } catch (error) {
        return {
            status: -1,
            data: { error: String(error) }
        };
    }
}

export async function fetchGithubRelease(_: IpcMainInvokeEvent, url: string) {
    try {
        const parsed = new URL(url);
        if (parsed.origin !== "https://api.github.com" || !parsed.pathname.startsWith("/repos/MallyDev2/DiscordLyrics/releases/")) {
            return { status: 400, data: { error: "Invalid release endpoint" } };
        }

        const response = await fetch(parsed, {
            headers: {
                Accept: "application/vnd.github+json",
                "User-Agent": "DiscordLyrics"
            }
        });

        const text = await response.text();
        return {
            status: response.status,
            data: text ? JSON.parse(text) : null
        };
    } catch (error) {
        return {
            status: -1,
            data: { error: String(error) }
        };
    }
}

function cleanQueryPart(value: string) {
    return String(value || "").replace(/\s+/g, " ").trim();
}

function comparableQueryPart(value: string) {
    return cleanQueryPart(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function scoreAlbumImageResult(result: { trackName?: string; artistName?: string; collectionName?: string; }, track: { title: string; artist: string; album: string; }) {
    let score = 0;
    const title = comparableQueryPart(track.title);
    const artist = comparableQueryPart(track.artist.split(",")[0] || track.artist);
    const album = comparableQueryPart(track.album);
    const resultTitle = comparableQueryPart(result.trackName || "");
    const resultArtist = comparableQueryPart(result.artistName || "");
    const resultAlbum = comparableQueryPart(result.collectionName || "");

    if (title && resultTitle === title) score += 4;
    else if (title && resultTitle.includes(title)) score += 2;

    if (artist && resultArtist === artist) score += 4;
    else if (artist && resultArtist.includes(artist)) score += 2;

    if (album && resultAlbum === album) score += 2;

    return score;
}

export async function searchAlbumImage(_: IpcMainInvokeEvent, title: string, artist: string, album: string) {
    const query = [cleanQueryPart(title), cleanQueryPart(artist.split(",")[0] || artist), cleanQueryPart(album)].filter(Boolean).join(" ");
    if (!query) return "";

    const response = await fetch(`https://itunes.apple.com/search?${new URLSearchParams({
        term: query,
        media: "music",
        entity: "song",
        limit: "8"
    })}`, {
        headers: {
            Accept: "application/json",
            "User-Agent": "DiscordLyrics"
        }
    });
    if (!response.ok) return "";

    const data = await response.json() as {
        results?: Array<{
            trackName?: string;
            artistName?: string;
            collectionName?: string;
            artworkUrl100?: string;
        }>;
    };
    const track = { title, artist, album };
    const best = data.results
        ?.filter(result => result.artworkUrl100)
        .sort((a, b) => scoreAlbumImageResult(b, track) - scoreAlbumImageResult(a, track))[0];

    return best?.artworkUrl100?.replace(/\/\d+x\d+bb\./, "/600x600bb.") || "";
}

export async function installUpdate(_: IpcMainInvokeEvent, version: string, body: string) {
    await mkdir(appDataDir, { recursive: true });
    await unlink(pendingUpdatePath).catch(() => void 0);
    await writeFile(updateNotesPath, String(body || ""), "utf8");
    await writeFile(updateLogPath, `DiscordLyrics update started ${new Date().toISOString()}\n`, "utf8");

    let profile: { target?: string; sourcePath?: string; };
    try {
        profile = JSON.parse(await readFile(installProfilePath, "utf8"));
    } catch {
        profile = {};
    }

    const response = await fetch("https://github.com/MallyDev2/DiscordLyrics/releases/latest/download/DiscordLyrics-Installer.ps1");
    if (!response.ok) throw new Error(`Installer download returned ${response.status}`);
    await writeFile(updateInstallerPath, await response.text(), "utf8");
    await writeFile(updateLogPath, `Installer script downloaded ${new Date().toISOString()}\n`, { flag: "a" });

    const uiResponse = await fetch("https://github.com/MallyDev2/DiscordLyrics/releases/latest/download/DiscordLyrics-Installer.exe");
    if (!uiResponse.ok) throw new Error(`Installer UI download returned ${uiResponse.status}`);
    await writeFile(updateUiPath, Buffer.from(await uiResponse.arrayBuffer()));
    await writeFile(updateLogPath, `Installer UI downloaded ${new Date().toISOString()}\n`, { flag: "a" });

    const target = ["Vencord", "Equicord", "Dorian"].includes(String(profile.target || ""))
        ? String(profile.target)
        : "Vencord";

    const updateUiArgs: string[] = [
        "-UpdateMode",
        "-Target", target,
        "-UpdateVersion", String(version || ""),
        "-UpdateNotesPath", updateNotesPath
    ];

    if (profile.sourcePath) updateUiArgs.push("-SourcePath", profile.sourcePath);

    await writeFile(updateLogPath, `Installer UI launching ${new Date().toISOString()}\n`, { flag: "a" });

    const child = spawn(updateUiPath, updateUiArgs, {
        detached: true,
        windowsHide: true,
        stdio: "ignore"
    });

    child.unref();

    return true;
}

export async function readPendingUpdateNotice() {
    const errors: string[] = [];
    const candidates = Array.from(new Set([pendingUpdatePath, ...pendingUpdatePaths]));
    for (const candidate of candidates) {
        try {
            const notice = JSON.parse((await readFile(candidate, "utf8")).replace(/^\uFEFF/, ""));
            return notice;
        } catch (error) {
            errors.push(`${candidate}: ${String(error)}`);
        }
    }

    try {
        await mkdir(appDataDir, { recursive: true });
    } catch {
        void 0;
    }

    return { error: "No pending update notice found", paths: candidates, errors };
}

export async function clearPendingUpdateNotice() {
    await Promise.all(Array.from(new Set([pendingUpdatePath, ...pendingUpdatePaths])).map(path => unlink(path).catch(() => void 0)));
    return true;
}

export async function getWindowsSpotifyState() {
    if (process.platform !== "win32") return { processRunning: false, track: null };

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

    try {
        const { stdout } = await execFileAsync("powershell.exe", [
            "-NoProfile",
            "-ExecutionPolicy", "Bypass",
            "-Command", script
        ], {
            windowsHide: true,
            timeout: 2500,
            maxBuffer: 64 * 1024
        });

        return JSON.parse(stdout.trim() || "{\"processRunning\":false,\"track\":null}");
    } catch (error) {
        return { processRunning: false, track: null, error: String(error) };
    }
}

export async function logDebug(_: IpcMainInvokeEvent, message: string) {
    await appendFile(debugLogPath, `${new Date().toISOString()} ${message}\n`, "utf8");
}
