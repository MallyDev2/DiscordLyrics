# Changelog

## 1.0.6

- Fix the one-click `.cmd` bootstrap installer so its work folder no longer tries to delete the running installer exe.

## 1.0.5

- Set lyric custom statuses to forever instead of using a timed expiration.
- Clear DiscordLyrics status earlier when Discord is closing or unloading.
- Avoid update installer file locks by launching each update from a fresh installer exe path.
- Let update installs auto-detect the saved source client path when the updater is launched without a source argument.
- Read the saved install profile directly from the update installer so source-client updates do not ask users for folders.

## 1.0.4

- Added a Discord-styled progress window for update installs.
- Show installer output inside the update window while Discord closes, updates, and reopens.
- Updated the automatic updater to launch the UI installer directly from the GitHub release.
- Kept the command-line installer path available for manual installs.
- Forced source-client installs to use the native pnpm command path during install, build, and inject.
- Cleared the temporary installer download folder before fetching a fresh installer.
- Fixed pnpm warnings being treated as installer failures on Windows PowerShell.
- Fixed the installer UI download path so it avoids stale loose temp scripts.
- Fixed pnpm build-approval failures during source-client installs.
- Fixed source-client builds so pnpm runs from the selected client folder instead of the installer launch folder.

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
