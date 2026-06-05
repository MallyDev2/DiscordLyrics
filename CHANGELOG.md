# Changelog

## 1.0.5

- Fixed the Windows installer so pnpm warnings no longer get treated as a failed build.
- Updated command handling to prefer native `.cmd` shims instead of PowerShell package-manager shims.

## 1.0.4

- Added a Discord-styled progress window for update installs.
- Show installer output inside the update window while Discord closes, updates, and reopens.
- Updated the automatic updater to launch the UI installer directly from the GitHub release.
- Kept the command-line installer path available for manual installs.

## 1.0.3

- Added a Windows UI installer while keeping the command-line installer path available.
- Added update checks in plugin settings with current version, latest release, and last checked time.
- Added startup update checks and an install-and-restart prompt when a newer release is available.
- Added a one-time post-update prompt with release notes after Discord reopens.
- Added paused Spotify detection when Discord opens after Spotify is already running.
- Fixed paused status restore when Discord clears the custom status during startup.
- Fixed song changes so the old status clears quickly without wiping the next song.
- Fixed Spotify album art in Vencord rich presence, including paused startup fallback art.
- Fixed rich presence timers so playback resumes from the current song position with the correct duration.
- Added BetterDiscord coverage for update checks, paused-start status restore, and installer updates.

## 1.0.2

- Fixed source client selection so choosing Vencord can no longer fall back into an Equicord or Dorian source folder.
- Added a safer installer flow with auto-detect or manual client selection.
- Added fresh source download support when the selected client source folder is missing.
- Fixed installer behavior so failed builds and failed injections stop immediately instead of continuing with stale output.
- Fixed Discord reinstall flow to rebuild, inject, and relaunch Discord after installation.
- Improved Discord relaunch handling so launch errors do not falsely mark a completed install as failed.

## 1.0.0

- Added BetterDiscord plugin support.
- Added Vencord userplugin support.
- Added Spotify activity detection.
- Added synced lyric lookup through LRCLIB.
- Added release packaging for both supported clients.
