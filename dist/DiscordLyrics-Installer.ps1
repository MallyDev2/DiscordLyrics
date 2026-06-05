param(
    [ValidateSet("Auto", "BetterDiscord", "Vencord", "Equicord", "Dorian")]
    [string]$Target = "Auto",
    [string]$SourcePath = "",
    [string]$LocalPackageDir = "",
    [string]$UpdateVersion = "",
    [string]$UpdateNotesPath = "",
    [switch]$NonInteractive,
    [switch]$SkipBuild,
    [switch]$NoInject
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$Repo = "MallyDev2/DiscordLyrics"
$WorkDir = Join-Path $env:TEMP "DiscordLyricsInstaller"
$ReleaseZip = Join-Path $WorkDir "DiscordLyrics-release.zip"
$PackageDir = Join-Path $WorkDir "package"
$StateDir = Join-Path $env:APPDATA "DiscordLyrics"
$InstallProfilePath = Join-Path $StateDir "install-profile.json"
$PendingUpdatePath = Join-Path $StateDir "pending-update.json"

try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls13
} catch {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
}

function Write-Step($Text) {
    Write-Host ""
    Write-Host "== $Text" -ForegroundColor Cyan
}

function Write-Ok($Text) {
    Write-Host "   $Text" -ForegroundColor Green
}

function Write-Warn($Text) {
    Write-Host "   $Text" -ForegroundColor Yellow
}

function Save-InstallProfile {
    param(
        [string]$ClientName,
        [string]$ClientRoot = ""
    )

    New-Item -ItemType Directory -Force $StateDir | Out-Null
    [pscustomobject]@{
        target = $ClientName
        sourcePath = $ClientRoot
        updatedAt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    } | ConvertTo-Json -Compress | Set-Content -LiteralPath $InstallProfilePath -Encoding UTF8
}

function Save-PendingUpdateNotice {
    param(
        [string]$Version,
        [string]$NotesPath = ""
    )

    if (!$Version) {
        return
    }

    $Body = ""
    if ($NotesPath -and (Test-Path -LiteralPath $NotesPath)) {
        $Body = [string](Get-Content -LiteralPath $NotesPath -Raw)
    }

    New-Item -ItemType Directory -Force $StateDir | Out-Null
    $NoticeJson = [pscustomobject]@{
        version = $Version
        body = $Body
        installedAt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    } | ConvertTo-Json -Compress
    [System.IO.File]::WriteAllText($PendingUpdatePath, $NoticeJson, [System.Text.UTF8Encoding]::new($false))
}

function Invoke-CheckedCommand {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Command,
        [Parameter(ValueFromRemainingArguments = $true)]
        [string[]]$Arguments
    )

    $ResolvedCommand = Resolve-NativeCommand -Command $Command
    $CommandLine = Join-CommandLine -Command $ResolvedCommand -Arguments $Arguments
    $StartInfo = [System.Diagnostics.ProcessStartInfo]::new()
    $StartInfo.FileName = "$env:ComSpec"
    $StartInfo.Arguments = "/d /s /c `"$CommandLine 2>&1`""
    $StartInfo.WorkingDirectory = (Get-Location).ProviderPath
    $StartInfo.UseShellExecute = $false
    $StartInfo.RedirectStandardOutput = $true
    $StartInfo.CreateNoWindow = $true

    $Process = [System.Diagnostics.Process]::new()
    $Process.StartInfo = $StartInfo
    $Output = [System.Collections.Generic.List[string]]::new()
    [void]$Process.Start()

    while (!$Process.StandardOutput.EndOfStream) {
        $Line = $Process.StandardOutput.ReadLine()
        if ($null -ne $Line) {
            $Output.Add($Line)
            Write-Host $Line
        }
    }

    $Process.WaitForExit()
    $ExitCode = $Process.ExitCode
    $Process.Dispose()

    $Text = ($Output | ForEach-Object { "$_" }) -join [Environment]::NewLine

    if ($ExitCode -ne 0) {
        throw "$Command $($Arguments -join ' ') failed with exit code $ExitCode."
    }

    if ($Text -match "(?m)(ERROR|Failed!|Something went wrong)") {
        throw "$Command $($Arguments -join ' ') reported a failed operation."
    }
}

function Resolve-NativeCommand {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Command
    )

    if ([System.IO.Path]::GetExtension($Command) -ne "") {
        $FoundExact = Get-Command $Command -ErrorAction SilentlyContinue | Where-Object { $_.Source -and $_.Source -notmatch '\.ps1$' } | Select-Object -First 1
        if ($FoundExact) {
            return $FoundExact.Source
        }

        return $Command
    }

    $Extensions = @(".cmd", ".exe", ".bat", "")
    foreach ($Directory in ($env:PATH -split [System.IO.Path]::PathSeparator)) {
        if ([string]::IsNullOrWhiteSpace($Directory)) {
            continue
        }

        foreach ($Extension in $Extensions) {
            $Candidate = Join-Path $Directory "$Command$Extension"
            if (Test-Path -LiteralPath $Candidate -PathType Leaf) {
                return $Candidate
            }
        }
    }

    foreach ($Name in @("$Command.cmd", "$Command.exe", "$Command.bat", $Command)) {
        $Found = Get-Command $Name -ErrorAction SilentlyContinue | Where-Object { $_.Source -and $_.Source -notmatch '\.ps1$' } | Select-Object -First 1
        if ($Found) {
            return $Found.Source
        }
    }

    return $Command
}

function Join-CommandLine {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Command,
        [string[]]$Arguments = @()
    )

    $Parts = @($Command) + $Arguments
    return ($Parts | ForEach-Object { ConvertTo-CommandArgument $_ }) -join " "
}

function ConvertTo-CommandArgument {
    param(
        [AllowNull()]
        [string]$Value
    )

    if ($null -eq $Value) {
        return '""'
    }

    $Text = [string]$Value
    if ($Text -notmatch '[\s"]') {
        return $Text
    }

    return '"' + ($Text -replace '"', '\"') + '"'
}

function Download-File {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Url,
        [Parameter(Mandatory = $true)]
        [string]$OutFile
    )

    $LastError = $null
    for ($Attempt = 1; $Attempt -le 3; $Attempt++) {
        $Client = $null
        try {
            $Client = [System.Net.WebClient]::new()
            $Client.Headers.Set("User-Agent", "DiscordLyrics-Installer")
            $Client.DownloadFile($Url, $OutFile)
            return
        } catch {
            $LastError = $_
            Start-Sleep -Seconds $Attempt
        } finally {
            if ($Client) {
                $Client.Dispose()
            }
        }
    }

    throw "Could not download $Url. $($LastError.Exception.Message)"
}

function Reset-WorkDir {
    if (Test-Path $WorkDir) {
        Remove-Item $WorkDir -Recurse -Force
    }
    New-Item -ItemType Directory -Force $WorkDir | Out-Null
}

function Ensure-Pnpm {
    $PnpmCommand = Resolve-NativeCommand -Command "pnpm"
    if ($PnpmCommand -and $PnpmCommand -notmatch '\.ps1$' -and (Test-Path -LiteralPath $PnpmCommand -PathType Leaf)) {
        Write-Ok "pnpm is ready"
        return $PnpmCommand
    }

    Write-Warn "pnpm was not found"

    if (Get-Command corepack -ErrorAction SilentlyContinue) {
        Write-Step "Installing pnpm with Corepack"
        Invoke-CheckedCommand corepack enable
        Invoke-CheckedCommand corepack prepare pnpm@latest --activate
        $PnpmCommand = Resolve-NativeCommand -Command "pnpm"
        if ($PnpmCommand -and $PnpmCommand -notmatch '\.ps1$' -and (Test-Path -LiteralPath $PnpmCommand -PathType Leaf)) {
            Write-Ok "pnpm installed"
            return $PnpmCommand
        }
    }

    if (Get-Command npm -ErrorAction SilentlyContinue) {
        Write-Step "Installing pnpm with npm"
        Invoke-CheckedCommand npm install -g pnpm
        $PnpmCommand = Resolve-NativeCommand -Command "pnpm"
        if ($PnpmCommand -and $PnpmCommand -notmatch '\.ps1$' -and (Test-Path -LiteralPath $PnpmCommand -PathType Leaf)) {
            Write-Ok "pnpm installed"
            return $PnpmCommand
        }
    }

    throw "Node.js is required before source clients can be built. Install Node.js from https://nodejs.org, then run this installer again."
}

function Download-Release {
    Write-Step "Downloading DiscordLyrics"
    $Url = "https://github.com/$Repo/releases/latest/download/DiscordLyrics-release.zip"
    Download-File -Url $Url -OutFile $ReleaseZip
    Expand-Archive -Path $ReleaseZip -DestinationPath $WorkDir -Force
    if (!(Test-Path $PackageDir) -and (Test-Path (Join-Path $WorkDir "BetterDiscord"))) {
        $script:PackageDir = $WorkDir
    }
    if (!(Test-Path $PackageDir)) {
        throw "Release package did not contain the expected package folder."
    }
    Write-Ok "Release package ready"
}

function Use-LocalPackage {
    param([string]$Path)

    if (!(Test-Path $Path)) {
        throw "LocalPackageDir was not found: $Path"
    }

    $Resolved = (Resolve-Path $Path).Path
    if (!(Test-Path (Join-Path $Resolved "BetterDiscord")) -or !(Test-Path (Join-Path $Resolved "Vencord"))) {
        throw "LocalPackageDir must point to the built package folder containing BetterDiscord and Vencord."
    }

    $script:PackageDir = $Resolved
    Write-Ok "Using local release package: $PackageDir"
}

function Install-BetterDiscord {
    $PluginSource = Join-Path $PackageDir "BetterDiscord\SpotifyLyricsStatus.plugin.js"
    $PluginDir = Join-Path $env:APPDATA "BetterDiscord\plugins"

    if (!(Test-Path $PluginSource)) {
        throw "BetterDiscord plugin was not found in the release package."
    }

    New-Item -ItemType Directory -Force $PluginDir | Out-Null
    Copy-Item $PluginSource (Join-Path $PluginDir "SpotifyLyricsStatus.plugin.js") -Force
    Write-Ok "Installed BetterDiscord plugin"
}

function Stop-Discord {
    $DiscordProcesses = Get-Process -Name "Discord", "DiscordCanary", "DiscordPTB", "DiscordDevelopment" -ErrorAction SilentlyContinue
    if (!$DiscordProcesses) {
        return
    }

    Write-Step "Closing Discord"
    $DiscordProcesses | Stop-Process -Force
    Start-Sleep -Seconds 2
}

function Repair-DiscordAsar {
    $InstallRoots = @(
        (Join-Path $env:LOCALAPPDATA "Discord"),
        (Join-Path $env:LOCALAPPDATA "DiscordCanary"),
        (Join-Path $env:LOCALAPPDATA "DiscordPTB"),
        (Join-Path $env:LOCALAPPDATA "DiscordDevelopment")
    ) | Where-Object { Test-Path $_ }

    foreach ($Root in $InstallRoots) {
        $Apps = Get-ChildItem $Root -Directory -Filter "app-*" -ErrorAction SilentlyContinue
        foreach ($App in $Apps) {
            $Resources = Join-Path $App.FullName "resources"
            $AppAsar = Join-Path $Resources "app.asar"
            $OriginalAsar = Join-Path $Resources "_app.asar"

            if ((Test-Path $Resources) -and !(Test-Path $AppAsar) -and !(Test-Path $OriginalAsar)) {
                $ResourceFiles = Get-ChildItem $Resources -Force -ErrorAction SilentlyContinue
                if (!$ResourceFiles -or $ResourceFiles.Count -eq 0) {
                    Write-Warn "Removing incomplete Discord app package before injection: $($App.FullName)"
                    Remove-Item $App.FullName -Recurse -Force
                }
                continue
            }

            if (!(Test-Path $OriginalAsar)) {
                continue
            }

            $NeedsRestore = !(Test-Path $AppAsar)
            if (!$NeedsRestore) {
                $AppAsarItem = Get-Item $AppAsar
                $OriginalItem = Get-Item $OriginalAsar
                $NeedsRestore = $AppAsarItem.Length -lt 4096 -and $OriginalItem.Length -gt $AppAsarItem.Length
            }

            if ($NeedsRestore) {
                Write-Warn "Restoring Discord app package before injection: $AppAsar"
                if (Test-Path $AppAsar) {
                    Remove-Item -LiteralPath $AppAsar -Recurse -Force
                }
                Move-Item $OriginalAsar $AppAsar -Force
            }
        }
    }
}

function Test-DiscordRunning {
    $null -ne (Get-Process -Name "Discord", "DiscordCanary", "DiscordPTB", "DiscordDevelopment" -ErrorAction SilentlyContinue | Select-Object -First 1)
}

function Start-DiscordProcess {
    param(
        [string]$FilePath,
        [string[]]$ArgumentList = @()
    )

    if (!(Test-Path $FilePath)) {
        return $false
    }

    try {
        $WorkingDirectory = Split-Path $FilePath -Parent
        if ($ArgumentList.Count -gt 0) {
            Start-Process -FilePath $FilePath -WorkingDirectory $WorkingDirectory -ArgumentList $ArgumentList | Out-Null
        } else {
            Start-Process -FilePath $FilePath -WorkingDirectory $WorkingDirectory | Out-Null
        }

        Start-Sleep -Seconds 3
        return (Test-DiscordRunning)
    } catch {
        Write-Warn "Launch attempt failed: $($_.Exception.Message)"
        Start-Sleep -Seconds 2
        return (Test-DiscordRunning)
    }
}

function Start-Discord {
    if (Test-DiscordRunning) {
        Write-Ok "Discord is already open"
        return
    }

    $ExeCandidates = @(
        (Get-ChildItem (Join-Path $env:LOCALAPPDATA "Discord\app-*") -Filter "Discord.exe" -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1 -ExpandProperty FullName),
        (Get-ChildItem (Join-Path $env:LOCALAPPDATA "DiscordCanary\app-*") -Filter "DiscordCanary.exe" -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1 -ExpandProperty FullName),
        (Get-ChildItem (Join-Path $env:LOCALAPPDATA "DiscordPTB\app-*") -Filter "DiscordPTB.exe" -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1 -ExpandProperty FullName),
        (Get-ChildItem (Join-Path $env:LOCALAPPDATA "DiscordDevelopment\app-*") -Filter "DiscordDevelopment.exe" -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1 -ExpandProperty FullName)
    ) | Where-Object { $_ -and (Test-Path $_) }

    if ($ExeCandidates.Count -gt 0) {
        Write-Step "Opening Discord"
        foreach ($Candidate in $ExeCandidates) {
            if (Start-DiscordProcess -FilePath $Candidate) {
                Write-Ok "Discord opened"
                return
            }
        }
    }

    $UpdateCandidates = @(
        (Join-Path $env:LOCALAPPDATA "Discord\Update.exe"),
        (Join-Path $env:LOCALAPPDATA "DiscordCanary\Update.exe"),
        (Join-Path $env:LOCALAPPDATA "DiscordPTB\Update.exe"),
        (Join-Path $env:LOCALAPPDATA "DiscordDevelopment\Update.exe")
    ) | Where-Object { Test-Path $_ }

    if ($UpdateCandidates.Count -gt 0) {
        Write-Step "Opening Discord"
        foreach ($Candidate in $UpdateCandidates) {
            if (Start-DiscordProcess -FilePath $Candidate -ArgumentList @("--processStart", "Discord.exe")) {
                Write-Ok "Discord opened"
                return
            }
        }
    }

    Write-Warn "Discord was installed, but it could not be opened automatically. Open Discord manually."
}

function Select-InstallTarget {
    if ($NonInteractive) {
        $Detected = Get-AutoDetectedClient
        if ($Detected) {
            Write-Ok "Auto-detected $($Detected.Name)"
            return $Detected.Name
        }

        throw "Auto install could not find one clear source client. Run the installer once manually, then try the update again."
    }

    Write-Host ""
    Write-Host "Install mode:" -ForegroundColor Cyan
    Write-Host "[1] Auto-detect installed client"
    Write-Host "[2] Choose manually"
    Write-Host ""

    $ModeChoice = Read-Host "Enter 1 or 2"
    switch ($ModeChoice.Trim()) {
        "1" {
            $Detected = Get-AutoDetectedClient
            if ($Detected) {
                Write-Ok "Auto-detected $($Detected.Name)"
                return $Detected.Name
            }

            Write-Warn "Auto-detect did not find one clear source client."
            return Select-ManualInstallTarget
        }
        "2" { return Select-ManualInstallTarget }
        default { throw "Invalid install mode. Run the installer again and choose 1 or 2." }
    }
}

function Select-ManualInstallTarget {
    Write-Host ""
    Write-Host "Choose your Discord client:" -ForegroundColor Cyan
    Write-Host "[1] Vencord"
    Write-Host "[2] Equicord"
    Write-Host "[3] Dorian"
    Write-Host "[4] BetterDiscord"
    Write-Host ""

    $Choice = Read-Host "Enter 1, 2, 3, or 4"
    switch ($Choice.Trim()) {
        "1" { return "Vencord" }
        "2" { return "Equicord" }
        "3" { return "Dorian" }
        "4" { return "BetterDiscord" }
        default { throw "Invalid client selection. Run the installer again and choose 1, 2, 3, or 4." }
    }
}

function Get-InstalledClientInfo {
    param([string]$ClientName)

    $DataDir = Get-ClientDataDir -ClientName $ClientName
    $SettingsFile = Join-Path $DataDir "settings\settings.json"
    $DistDir = Join-Path $DataDir "dist"
    $AsarFile = Join-Path $DataDir "$($ClientName.ToLowerInvariant()).asar"

    if ((Test-Path $SettingsFile) -or (Test-Path $DistDir) -or (Test-Path $AsarFile)) {
        $Newest = @($SettingsFile, $DistDir, $AsarFile) |
            Where-Object { Test-Path $_ } |
            ForEach-Object { Get-Item $_ } |
            Sort-Object LastWriteTime -Descending |
            Select-Object -First 1

        return [pscustomobject]@{
            Name = $ClientName
            DataDir = $DataDir
            LastWriteTime = $Newest.LastWriteTime
        }
    }

    $null
}

function Get-AutoDetectedClient {
    $Names = @("Vencord", "Equicord", "Dorian")
    $Matches = New-Object System.Collections.Generic.List[object]

    foreach ($Name in $Names) {
        $Installed = Get-InstalledClientInfo -ClientName $Name
        $Sources = @(Get-SourceCandidates -ClientName $Name)

        if ($Installed -and $Sources.Count -eq 1) {
            $Matches.Add([pscustomobject]@{
                Name = $Name
                SourcePath = $Sources[0]
                LastWriteTime = $Installed.LastWriteTime
            })
        }
    }

    if ($Matches.Count -eq 1) {
        return $Matches[0]
    }

    if ($Matches.Count -gt 1) {
        Write-Warn "Auto-detect found multiple possible clients."
        $Matches |
            Sort-Object LastWriteTime -Descending |
            ForEach-Object { Write-Warn "$($_.Name): $($_.SourcePath)" }
    }

    $null
}

function Get-ClientDataDir {
    param([string]$ClientName)

    Join-Path $env:APPDATA $ClientName
}

function Get-SourceCandidates {
    param([string]$ClientName = "")

    $Roots = @(
        (Join-Path $env:USERPROFILE "Documents"),
        (Join-Path $env:USERPROFILE "Desktop"),
        $env:USERPROFILE
    ) | Where-Object { $_ -and (Test-Path $_) }

    $Names = if ($ClientName) { @($ClientName) } else { @("Vencord", "Equicord", "Dorian") }
    $Candidates = New-Object System.Collections.Generic.List[string]

    foreach ($Root in $Roots) {
        foreach ($Name in $Names) {
            $Direct = Join-Path $Root $Name
            if (Test-Path (Join-Path $Direct "package.json")) {
                $Candidates.Add($Direct)
            }
        }
    }

    $Candidates | Select-Object -Unique
}

function Clone-SourceClient {
    param([string]$ClientName)

    $Repos = @{
        Vencord = "https://github.com/Vendicated/Vencord.git"
        Equicord = "https://github.com/Equicord/Equicord.git"
        Dorian = "https://github.com/SpikeHD/Dorian.git"
    }

    if (!(Get-Command git -ErrorAction SilentlyContinue)) {
        throw "$ClientName source was not found, and Git is required to download it. Install Git, then run this installer again."
    }

    $DefaultPath = Join-Path (Join-Path $env:USERPROFILE "Documents") $ClientName
    if (Test-Path $DefaultPath) {
        throw "$ClientName source was not found in a usable folder, but $DefaultPath already exists. Move it, fix it, or pass -SourcePath to the correct $ClientName source folder."
    }

    $RepoUrl = $Repos[$ClientName]
    if (!$RepoUrl) {
        throw "No source repository is configured for $ClientName."
    }

    Write-Step "Downloading $ClientName source"
    Invoke-CheckedCommand git clone $RepoUrl $DefaultPath
    return $DefaultPath
}

function Select-SourcePath {
    param([string]$ClientName)

    if ($SourcePath) {
        if (!(Test-Path (Join-Path $SourcePath "package.json"))) {
            throw "SourcePath must point to a Vencord, Equicord, or Dorian source folder with package.json."
        }
        return (Resolve-Path $SourcePath).Path
    }

    if ($ClientName) {
        Write-Ok "Selected Discord mod: $ClientName"
        $MatchingCandidates = @(Get-SourceCandidates -ClientName $ClientName)

        if ($MatchingCandidates.Count -eq 1) {
            Write-Ok "Using matching source client: $($MatchingCandidates[0])"
            return $MatchingCandidates[0]
        }

        if ($NonInteractive -and $MatchingCandidates.Count -gt 1) {
            $Selected = $MatchingCandidates |
                ForEach-Object { Get-Item -LiteralPath $_ } |
                Sort-Object LastWriteTime -Descending |
                Select-Object -First 1

            Write-Ok "Using newest matching source client: $($Selected.FullName)"
            return $Selected.FullName
        }

        if ($MatchingCandidates.Count -gt 1) {
            Write-Host ""
            Write-Host "Detected matching $ClientName source folders:" -ForegroundColor Cyan
            for ($i = 0; $i -lt $MatchingCandidates.Count; $i++) {
                Write-Host "[$($i + 1)] $($MatchingCandidates[$i])"
            }
            $Choice = Read-Host "Choose the source folder for $ClientName"
            $Index = [int]$Choice - 1
            if ($Index -ge 0 -and $Index -lt $MatchingCandidates.Count) {
                return $MatchingCandidates[$Index]
            }
        }

        Write-Warn "No matching $ClientName source folder was found automatically."

        if ($NonInteractive) {
            return Clone-SourceClient -ClientName $ClientName
        }

        Write-Host ""
        Write-Host "[1] Download fresh $ClientName source into Documents\\$ClientName"
        Write-Host "[2] Paste the exact $ClientName source folder path"
        Write-Host ""
        $SourceChoice = Read-Host "Enter 1 or 2"

        if ($SourceChoice.Trim() -eq "1") {
            return Clone-SourceClient -ClientName $ClientName
        }

        if ($SourceChoice.Trim() -ne "2") {
            throw "Invalid source selection. Run the installer again and choose 1 or 2."
        }
    }

    if ($NonInteractive) {
        throw "Auto install needs a valid source folder for $ClientName."
    }

    $Manual = Read-Host "Paste your $ClientName source folder path"
    if (!(Test-Path (Join-Path $Manual "package.json"))) {
        throw "That folder does not look like a $ClientName source client."
    }

    (Resolve-Path $Manual).Path
}

function Install-SourceClient {
    param([string]$ClientName)

    $PnpmCommand = Ensure-Pnpm

    $ClientRoot = Select-SourcePath -ClientName $ClientName
    $PluginZip = Join-Path $PackageDir "Vencord\vencord-spotifyLyricsStatus.zip"
    $UserPlugins = Join-Path $ClientRoot "src\userplugins"
    $PluginDir = Join-Path $UserPlugins "spotifyLyricsStatus"
    $ClientDataDir = Get-ClientDataDir -ClientName $ClientName

    if (!(Test-Path $PluginZip)) {
        throw "Vencord userplugin zip was not found in the release package."
    }

    New-Item -ItemType Directory -Force $UserPlugins | Out-Null
    if (Test-Path $PluginDir) {
        Remove-Item $PluginDir -Recurse -Force
    }

    Expand-Archive -Path $PluginZip -DestinationPath $UserPlugins -Force

    if (!(Test-Path (Join-Path $PluginDir "index.ts"))) {
        $Nested = Get-ChildItem $UserPlugins -Directory |
            Where-Object { Test-Path (Join-Path $_.FullName "spotifyLyricsStatus\index.ts") } |
            Select-Object -First 1

        if ($Nested) {
            Move-Item (Join-Path $Nested.FullName "spotifyLyricsStatus") $PluginDir -Force
        }
    }

    if (!(Test-Path (Join-Path $PluginDir "index.ts"))) {
        throw "Plugin folder was not installed correctly."
    }

    Write-Ok "Installed userplugin into $PluginDir"

    if ($SkipBuild) {
        Write-Warn "Skipped build"
        return
    }

    $PreviousAllowAllBuilds = $env:PNPM_CONFIG_DANGEROUSLY_ALLOW_ALL_BUILDS
    $env:PNPM_CONFIG_DANGEROUSLY_ALLOW_ALL_BUILDS = "true"

    Push-Location $ClientRoot
    try {
        Write-Step "Building client"
        if (!(Test-Path (Join-Path $ClientRoot "node_modules"))) {
            Write-Step "Installing client dependencies"
            Invoke-CheckedCommand $PnpmCommand install --frozen-lockfile
        } else {
            Write-Ok "Client dependencies already installed"
        }

        Invoke-CheckedCommand $PnpmCommand build

        if (Test-Path (Join-Path $ClientRoot "dist")) {
            $ActiveDist = Join-Path $ClientDataDir "dist"
            New-Item -ItemType Directory -Force $ActiveDist | Out-Null
            Copy-Item (Join-Path $ClientRoot "dist\*") $ActiveDist -Recurse -Force
            Write-Ok "Updated $ClientName build at $ActiveDist"
        } else {
            Write-Warn "Client build completed, but no dist folder was found to copy into $ClientDataDir."
        }

        $PackageJson = Get-Content "package.json" -Raw
        $CanInject = $PackageJson -match '"inject"\s*:'
        if (!$NoInject -and $CanInject) {
            Stop-Discord
            Repair-DiscordAsar
            Write-Step "Reinstalling client into Discord"
            if ($ClientName -eq "Vencord") {
                Invoke-CheckedCommand $PnpmCommand inject -- -branch stable
            } else {
                Invoke-CheckedCommand $PnpmCommand inject
            }
            Write-Ok "Client was rebuilt and injected"
        } elseif ($NoInject -and $CanInject) {
            Write-Warn "Build complete. Injection skipped because -NoInject was used."
        } else {
            Write-Warn "No inject script found. Reinstall or inject this client the normal way."
        }
    } finally {
        Pop-Location
        if ($null -eq $PreviousAllowAllBuilds) {
            Remove-Item Env:\PNPM_CONFIG_DANGEROUSLY_ALLOW_ALL_BUILDS -ErrorAction SilentlyContinue
        } else {
            $env:PNPM_CONFIG_DANGEROUSLY_ALLOW_ALL_BUILDS = $PreviousAllowAllBuilds
        }
    }

    return $ClientRoot
}

if ($LocalPackageDir) {
    Use-LocalPackage -Path $LocalPackageDir
} else {
    Reset-WorkDir
    Download-Release
}

$SelectedTarget = if ($Target -eq "Auto") { Select-InstallTarget } else { $Target }

if ($SelectedTarget -eq "BetterDiscord") {
    Stop-Discord
    Write-Step "Installing BetterDiscord"
    Install-BetterDiscord
    Save-InstallProfile -ClientName "BetterDiscord"
}

if ($SelectedTarget -in @("Vencord", "Equicord", "Dorian")) {
    Write-Step "Installing $SelectedTarget source plugin"
    $InstalledSourcePath = Install-SourceClient -ClientName $SelectedTarget
    Save-InstallProfile -ClientName $SelectedTarget -ClientRoot $InstalledSourcePath
}

Save-PendingUpdateNotice -Version $UpdateVersion -NotesPath $UpdateNotesPath
Start-Discord

Write-Host ""
Write-Host "DiscordLyrics install complete. Enable DiscordLyrics if it is not already enabled." -ForegroundColor Green
