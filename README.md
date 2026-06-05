<p align="center">
  <img src="IMG_9016.webp" alt="DiscordLyrics by MallyDev2" width="100%">
</p>

<h1 align="center">DiscordLyrics</h1>

<p align="center">
  <strong>Just another Spotify lyric status changer</strong>
</p>

<p align="center">
  <a href="https://github.com/MallyDev2/DiscordLyrics/releases/latest"><img alt="Latest release" src="https://img.shields.io/github/v/release/MallyDev2/DiscordLyrics?style=for-the-badge&labelColor=101014&color=d7b981"></a>
  <a href="https://github.com/MallyDev2/DiscordLyrics/actions"><img alt="Build status" src="https://img.shields.io/github/actions/workflow/status/MallyDev2/DiscordLyrics/ci.yml?style=for-the-badge&label=build&labelColor=101014&color=9ec7ff"></a>
  <a href="https://github.com/MallyDev2/DiscordLyrics/releases/latest/download/DiscordLyrics-Installer.cmd"><img alt="Windows installer" src="https://img.shields.io/badge/Auto_Install-Windows-ffffff?style=for-the-badge&labelColor=101014&color=d7b981"></a>
  <a href="https://github.com/MallyDev2/DiscordLyrics/releases/latest/download/DiscordLyrics-release.zip"><img alt="Download full package" src="https://img.shields.io/badge/Download-Full_Package-101014?style=for-the-badge&labelColor=f4ead8&color=d7b981"></a>
</p>

DiscordLyrics syncs Spotify lyrics from currently playing song to your custom status. By doing this it is a breach of discord tos for self botting so please use responsibly.

## Highlights

- Live lyric status from Spotify playback.
- LRCLIB synced lyric lookup.
- Pause fallback using the last detected track.
- Rate-conscious status updates.

## Client Support

| Client | Status | Notes |
| --- | --- | --- |
| BetterDiscord | Supported | Uses the packaged `.plugin.js` release file. |
| Vencord | Supported | Installs as a source userplugin and rebuilds the client. |
| Equicord | Supported | Uses the same source userplugin layout as Vencord-style clients. |
| Dorian | Supported | Works when the local source tree follows the Vencord plugin structure. |

## Download

| Client | Release file | Setup |
| --- | --- | --- |
| Auto installer | [DiscordLyrics-Installer.cmd](https://github.com/MallyDev2/DiscordLyrics/releases/latest/download/DiscordLyrics-Installer.cmd) | Runs the Windows installer for BetterDiscord, Vencord, Equicord, or Dorian-style source clients. |
| Complete package | [DiscordLyrics-release.zip](https://github.com/MallyDev2/DiscordLyrics/releases/latest/download/DiscordLyrics-release.zip) | Includes both client builds, README, license, and changelog. |

## One-Click Windows Setup

Download `DiscordLyrics-Installer.cmd`, run it, and let it install the correct build.

The installer:

- Installs the BetterDiscord plugin when BetterDiscord is detected.
- Installs the source userplugin for Vencord, Equicord, and Dorian-style clients.
- Builds the source client with `pnpm build`.
- Runs `pnpm inject` when that client exposes an inject script.

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
- For source clients, rebuild and inject after every plugin update.

## Repository Layout

```text
DiscordLyrics/
  SpotifyLyricsStatus.plugin.js
  vencord-userplugin/spotifyLyricsStatus/
  scripts/build-release.js
  dist/
  assets/
```

## Compatibility

| Platform | Status |
| --- | --- |
| BetterDiscord | Supported |
| Vencord userplugin | Supported |

## Support

If you enjoy discordlyrics, you can support me through GitHub Sponsors:

https://github.com/sponsors/MallyDev2

## License

Released under the [GPL-3.0 icense](LICENSE).
