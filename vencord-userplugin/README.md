# DiscordLyrics for Vencord

This is the Vencord userplugin version of DiscordLyrics.

## Install

### Windows installer

Run the installer from the latest release. It detects Vencord, Equicord, and Dorian-style source folders, copies the plugin, builds the client, and injects when supported.

```powershell
irm https://github.com/MallyDev2/DiscordLyrics/releases/latest/download/DiscordLyrics-Installer.ps1 -OutFile "$env:TEMP\DiscordLyrics-Installer.ps1"; powershell -ExecutionPolicy Bypass -File "$env:TEMP\DiscordLyrics-Installer.ps1"
```

### Manual install

1. Set up your client from source.
2. Copy `spotifyLyricsStatus` into `src/userplugins/spotifyLyricsStatus`.
3. Run `pnpm build` from the client source folder.
4. Reinstall or inject the client.
5. Restart Discord and enable `DiscordLyrics`.

Official custom plugin guide: <https://docs.vencord.dev/installing/custom-plugins/>
