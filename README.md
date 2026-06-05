<p align="center">
  <img src="assets/discordlyrics-bg.png" alt="DiscordLyrics by MallyDev2" width="100%">
</p>

<h1 align="center">DiscordLyrics</h1>

<p align="center">
  <strong>Spotify lyrics in your Discord status.</strong>
</p>

<p align="center">
  <a href="https://github.com/MallyDev2/DiscordLyrics/releases/latest"><img alt="Latest release" src="https://img.shields.io/github/v/release/MallyDev2/DiscordLyrics?style=for-the-badge&label=release&labelColor=101014&color=d7b982"></a>
  <a href="https://github.com/MallyDev2/DiscordLyrics/releases/latest/download/DiscordLyrics-Installer.exe"><img alt="Windows installer" src="https://img.shields.io/badge/Auto_Install-Windows-ffffff?style=for-the-badge&labelColor=101014&color=5865f2"></a>
  <a href="https://github.com/MallyDev2/DiscordLyrics/releases/latest/download/DiscordLyrics-release.zip"><img alt="Full package" src="https://img.shields.io/badge/Download-Full_Package-101014?style=for-the-badge&labelColor=f4ead8&color=d7b982"></a>
</p>

DiscordLyrics syncs your current Spotify track to Discord. If synced lyrics are found, your custom status follows the lyric line. If not, it falls back to the song and artist.

This changes your Discord status automatically, so use it responsibly.

## Features

- Synced lyrics from LRCLIB.
- Spotify pause and song-change handling.
- BetterDiscord plugin support.
- Vencord, Equicord, and Dorian source-client support.
- Update checks with install and restart prompts.
- Windows installer with the command installer still available.

## Download

| Client | File |
| --- | --- |
| Auto installer | [DiscordLyrics-Installer.exe](https://github.com/MallyDev2/DiscordLyrics/releases/latest/download/DiscordLyrics-Installer.exe) |
| Command installer | [DiscordLyrics-Installer.cmd](https://github.com/MallyDev2/DiscordLyrics/releases/latest/download/DiscordLyrics-Installer.cmd) |
| BetterDiscord | [SpotifyLyricsStatus.plugin.js](https://github.com/MallyDev2/DiscordLyrics/releases/latest/download/SpotifyLyricsStatus.plugin.js) |
| Vencord package | [vencord-spotifyLyricsStatus.zip](https://github.com/MallyDev2/DiscordLyrics/releases/latest/download/vencord-spotifyLyricsStatus.zip) |
| Full package | [DiscordLyrics-release.zip](https://github.com/MallyDev2/DiscordLyrics/releases/latest/download/DiscordLyrics-release.zip) |

## Install

Download `DiscordLyrics-Installer.exe`, run it, and choose your Discord client.

For a direct PowerShell install:

```powershell
irm https://github.com/MallyDev2/DiscordLyrics/releases/latest/download/DiscordLyrics-Installer.ps1 -OutFile "$env:TEMP\DiscordLyrics-Installer.ps1"; powershell -ExecutionPolicy Bypass -File "$env:TEMP\DiscordLyrics-Installer.ps1"
```

## BetterDiscord

1. Download `SpotifyLyricsStatus.plugin.js`.
2. Move it to `%AppData%\BetterDiscord\plugins`.
3. Reload Discord.
4. Enable `DiscordLyrics`.

## Vencord

1. Download `vencord-spotifyLyricsStatus.zip`.
2. Extract `spotifyLyricsStatus`.
3. Copy it to `Vencord/src/userplugins/spotifyLyricsStatus`.
4. Run `pnpm build`, then inject or reinstall your client.
5. Restart Discord and enable `DiscordLyrics`.

## Build

```bash
npm install
npm run check
npm run build
```

## Troubleshooting

- Spotify must be connected to Discord and visible as activity.
- Reload Discord after enabling or updating the plugin.
- If a song has no synced lyrics in LRCLIB, DiscordLyrics falls back to the song name.
- Source clients need to be rebuilt after plugin updates.

## License

Released under the [MIT License](LICENSE).
