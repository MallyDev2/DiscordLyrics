<p align="center">
  <img src="assets/discordlyrics-bg.png" alt="DiscordLyrics by MallyDev2" width="100%">
</p>

<h1 align="center">DiscordLyrics</h1>

<p align="center">
  <strong>A polished Spotify lyric status plugin for Discord, built by MallyDev2.</strong>
</p>

<p align="center">
  <a href="https://github.com/MallyDev2/DiscordLyrics/releases/latest"><img alt="Latest release" src="https://img.shields.io/github/v/release/MallyDev2/DiscordLyrics?style=for-the-badge&label=release&labelColor=101014&color=d7b982"></a>
  <a href="https://github.com/MallyDev2/DiscordLyrics/actions"><img alt="Build status" src="https://img.shields.io/github/actions/workflow/status/MallyDev2/DiscordLyrics/ci.yml?style=for-the-badge&label=build&labelColor=101014&color=9ec7ff"></a>
  <a href="https://github.com/MallyDev2/DiscordLyrics/releases/latest/download/SpotifyLyricsStatus.plugin.js"><img alt="Download BetterDiscord" src="https://img.shields.io/badge/Download-BetterDiscord-ffffff?style=for-the-badge&labelColor=101014&color=5865f2"></a>
  <a href="https://github.com/MallyDev2/DiscordLyrics/releases/latest/download/vencord-spotifyLyricsStatus.zip"><img alt="Download Vencord" src="https://img.shields.io/badge/Download-Vencord-ffffff?style=for-the-badge&labelColor=101014&color=b9c9ff"></a>
  <a href="https://github.com/MallyDev2/DiscordLyrics/releases/latest/download/DiscordLyrics-release.zip"><img alt="Download full package" src="https://img.shields.io/badge/Download-Full_Package-101014?style=for-the-badge&labelColor=f4ead8&color=d7b982"></a>
  <a href="https://github.com/MallyDev2/DiscordLyrics/pkgs/npm/discordlyrics"><img alt="GitHub Package" src="https://img.shields.io/badge/GitHub-Package-ffffff?style=for-the-badge&labelColor=101014&color=d7b982"></a>
  <img alt="Spotify lyrics" src="https://img.shields.io/badge/Spotify-Lyrics-ffffff?style=for-the-badge&labelColor=101014&color=1db954">
</p>

DiscordLyrics syncs Spotify playback into your Discord custom status. When synced lyrics are available, your status follows the current lyric line. When lyrics are unavailable, it falls back to the current song so your profile still looks clean instead of empty.

## Highlights

- Live lyric status from Spotify playback.
- BetterDiscord plugin build.
- Vencord userplugin build.
- LRCLIB synced lyric lookup.
- Pause fallback using the last detected track.
- Rate-conscious status updates.
- Rebuildable release package with npm scripts.

## Download

| Client | Release file | Setup |
| --- | --- | --- |
| BetterDiscord | [SpotifyLyricsStatus.plugin.js](https://github.com/MallyDev2/DiscordLyrics/releases/latest/download/SpotifyLyricsStatus.plugin.js) | Place the file in your BetterDiscord plugins folder. |
| Vencord | [vencord-spotifyLyricsStatus.zip](https://github.com/MallyDev2/DiscordLyrics/releases/latest/download/vencord-spotifyLyricsStatus.zip) | Extract `spotifyLyricsStatus` into `Vencord/src/userplugins/`, then rebuild Vencord. |
| Complete package | [DiscordLyrics-release.zip](https://github.com/MallyDev2/DiscordLyrics/releases/latest/download/DiscordLyrics-release.zip) | Includes both client builds, README, license, and changelog. |

## BetterDiscord Setup

1. Download `SpotifyLyricsStatus.plugin.js`.
2. Move it into your BetterDiscord plugins folder.
3. Reload Discord with `Ctrl+R`.
4. Enable `SpotifyLyricsStatus`.
5. Make sure Spotify is connected to Discord and visible as your activity.

Common plugin folders:

```text
Windows: %AppData%\BetterDiscord\plugins
macOS: ~/Library/Application Support/BetterDiscord/plugins
Linux: ~/.config/BetterDiscord/plugins
```

## Vencord Setup

1. Download `vencord-spotifyLyricsStatus.zip`.
2. Extract the `spotifyLyricsStatus` folder.
3. Copy it into your Vencord source tree:

   ```text
   Vencord/src/userplugins/spotifyLyricsStatus
   ```

4. Rebuild Vencord:

   ```bash
   pnpm build
   ```

5. Reinstall or inject your custom Vencord build, restart Discord, then enable `SpotifyLyricsStatus`.

## How It Works

DiscordLyrics reads your Spotify activity from Discord, matches the current track through LRCLIB, and updates your custom status when the active lyric line changes.

Fallback format:

```text
Song - Artist
```

## Troubleshooting

If lyrics do not appear right away, check these first:

- Spotify must be connected to Discord and visible as your activity.
- The track title and artist should match the public LRCLIB listing.
- Reload Discord after enabling or updating the plugin.
- Wait a few seconds after changing songs so the lyric lookup can refresh.

## Project Package

DiscordLyrics is also published as a GitHub npm package for clean version tracking and repo package visibility.

```bash
npm install @mallydev2/discordlyrics --registry=https://npm.pkg.github.com
```

The package includes the BetterDiscord plugin, the Vencord userplugin source, and release artifacts.

## Build From Source

This repo includes a lightweight build workflow so releases can be rebuilt locally.

```bash
npm install
npm run check
npm run build
```

| Script | Purpose |
| --- | --- |
| `npm run check` | Validates the BetterDiscord plugin syntax. |
| `npm run build` | Rebuilds the BetterDiscord and Vencord release files in `dist/`. |
| `npm run release:pack` | Runs validation, then rebuilds all release artifacts, including the full package zip. |

## Repository Layout

```text
DiscordLyrics/
  SpotifyLyricsStatus.plugin.js
  vencord-userplugin/spotifyLyricsStatus/
  scripts/build-release.js
  dist/
  assets/
```

## Social Preview

The repository includes a GitHub-ready preview image at:

```text
assets/social-preview.jpg
```

Use that image in the repository social preview setting so links shared to Discord show the DiscordLyrics banner.

## Wiki

Wiki source pages are mirrored in `docs/wiki/` so project docs stay versioned with the repo.

## Troubleshooting

| Issue | Fix |
| --- | --- |
| Lyrics do not show | Make sure Spotify is connected to Discord and visible as activity. |
| Song shows but lyric does not | The song may not have synced lyrics in LRCLIB yet. |
| Vencord plugin missing | Confirm the folder path is `Vencord/src/userplugins/spotifyLyricsStatus`. |
| Status updates slowly | Discord can rate-limit custom status changes, so the plugin avoids unnecessary updates. |

## Compatibility

| Platform | Status |
| --- | --- |
| BetterDiscord | Supported |
| Vencord userplugin | Supported |
| Spotify activity | Required |
| LRCLIB synced lyrics | Used when available |

## Support

If DiscordLyrics helps you, you can support MallyDev2 through GitHub Sponsors:

https://github.com/sponsors/MallyDev2

## License

Released under the [MIT License](LICENSE).
