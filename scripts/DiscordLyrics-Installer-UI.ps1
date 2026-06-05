param(
    [string]$LocalPackageDir = ""
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$Repo = "MallyDev2/DiscordLyrics"
$InstallerUrl = "https://github.com/$Repo/releases/latest/download/DiscordLyrics-Installer.ps1"
$TempInstaller = Join-Path $env:TEMP "DiscordLyrics-Installer.ps1"
$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$LocalInstaller = Join-Path $ScriptRoot "DiscordLyrics-Installer.ps1"

function Get-InstallerPath {
    if (Test-Path $LocalInstaller) {
        return $LocalInstaller
    }

    Invoke-WebRequest -UseBasicParsing -Uri $InstallerUrl -OutFile $TempInstaller
    return $TempInstaller
}

function Test-PackageDir {
    param([string]$Path)

    if (!$Path) {
        return $false
    }

    (Test-Path (Join-Path $Path "BetterDiscord")) -and (Test-Path (Join-Path $Path "Vencord"))
}

function Get-DefaultPackageDir {
    $Candidates = @(
        $LocalPackageDir,
        $ScriptRoot,
        (Join-Path $ScriptRoot "package"),
        (Join-Path $ScriptRoot "..\dist\package")
    )

    foreach ($Candidate in $Candidates) {
        if ($Candidate -and (Test-PackageDir $Candidate)) {
            return (Resolve-Path $Candidate).Path
        }
    }

    return ""
}

function Get-ClientDataDir {
    param([string]$ClientName)
    Join-Path $env:APPDATA $ClientName
}

function Get-SourceCandidates {
    param([string]$ClientName)

    $Roots = @(
        (Join-Path $env:USERPROFILE "Documents"),
        (Join-Path $env:USERPROFILE "Desktop"),
        $env:USERPROFILE
    ) | Where-Object { $_ -and (Test-Path $_) }

    $Candidates = New-Object System.Collections.Generic.List[string]
    foreach ($Root in $Roots) {
        $Direct = Join-Path $Root $ClientName
        if (Test-Path (Join-Path $Direct "package.json")) {
            $Candidates.Add($Direct)
        }
    }

    $Candidates | Select-Object -Unique
}

function Get-InstalledClientInfo {
    param([string]$ClientName)

    $DataDir = Get-ClientDataDir $ClientName
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
            LastWriteTime = $Newest.LastWriteTime
        }
    }

    return $null
}

function Get-InstallPlan {
    $Selected = [string]$TargetBox.SelectedItem
    $Names = @("Vencord", "Equicord", "Dorian")

    if ($Selected -eq "Auto") {
        $Matches = New-Object System.Collections.Generic.List[object]
        foreach ($Name in $Names) {
            $Installed = Get-InstalledClientInfo $Name
            $Sources = @(Get-SourceCandidates $Name)
            if ($Installed -and $Sources.Count -gt 0) {
                $Matches.Add([pscustomobject]@{
                    Target = $Name
                    SourcePath = $Sources[0]
                    Text = "Auto detected $Name at $($Sources[0])"
                    LastWriteTime = $Installed.LastWriteTime
                })
            }
        }

        if ($Matches.Count -gt 0) {
            return $Matches | Sort-Object LastWriteTime -Descending | Select-Object -First 1
        }

        if (Test-Path (Join-Path $env:APPDATA "BetterDiscord\plugins")) {
            return [pscustomobject]@{
                Target = "BetterDiscord"
                SourcePath = ""
                Text = "Auto detected BetterDiscord"
            }
        }

        return [pscustomobject]@{
            Target = ""
            SourcePath = ""
            Text = "No supported client was detected"
        }
    }

    if ($Selected -eq "BetterDiscord") {
        return [pscustomobject]@{
            Target = "BetterDiscord"
            SourcePath = ""
            Text = "Ready to install for BetterDiscord"
        }
    }

    $ManualSource = $SourceBox.Text.Trim()
    if ($ManualSource -and (Test-Path (Join-Path $ManualSource "package.json"))) {
        return [pscustomobject]@{
            Target = $Selected
            SourcePath = $ManualSource
            Text = "Using $Selected source at $ManualSource"
        }
    }

    $Sources = @(Get-SourceCandidates $Selected)
    if ($Sources.Count -gt 0) {
        return [pscustomobject]@{
            Target = $Selected
            SourcePath = $Sources[0]
            Text = "Detected $Selected source at $($Sources[0])"
        }
    }

    return [pscustomobject]@{
        Target = $Selected
        SourcePath = ""
        Text = "$Selected needs a source folder"
    }
}

function New-LauncherIcon {
    $Bitmap = New-Object System.Drawing.Bitmap 32, 32
    $Graphics = [System.Drawing.Graphics]::FromImage($Bitmap)
    $Graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $Graphics.Clear([System.Drawing.Color]::Transparent)

    $Brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        (New-Object System.Drawing.Rectangle 0, 0, 32, 32),
        [System.Drawing.Color]::FromArgb(91, 122, 255),
        [System.Drawing.Color]::FromArgb(28, 198, 165),
        45
    )
    $Graphics.FillEllipse($Brush, 2, 2, 28, 28)

    $Font = New-Object System.Drawing.Font("Segoe UI Semibold", 11)
    $StringBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
    $Format = New-Object System.Drawing.StringFormat
    $Format.Alignment = [System.Drawing.StringAlignment]::Center
    $Format.LineAlignment = [System.Drawing.StringAlignment]::Center
    $Graphics.DrawString("DL", $Font, $StringBrush, (New-Object System.Drawing.RectangleF 0, 0, 32, 30), $Format)

    [System.Drawing.Icon]::FromHandle($Bitmap.GetHicon())
}

function Add-Text {
    param(
        [System.Windows.Forms.Control]$Parent,
        [string]$Text,
        [int]$Left,
        [int]$Top,
        [int]$Width,
        [int]$Height,
        [int]$Size = 10,
        [bool]$Bold = $false,
        [System.Drawing.Color]$Color = [System.Drawing.Color]::White
    )

    $Label = New-Object System.Windows.Forms.Label
    $Label.Text = $Text
    $Label.Left = $Left
    $Label.Top = $Top
    $Label.Width = $Width
    $Label.Height = $Height
    $Label.ForeColor = $Color
    $Label.Font = New-Object System.Drawing.Font("Segoe UI", $Size, $(if ($Bold) { [System.Drawing.FontStyle]::Bold } else { [System.Drawing.FontStyle]::Regular }))
    $Parent.Controls.Add($Label)
    return $Label
}

function Add-Log {
    param([string]$Text)

    if (!$Text) {
        return
    }

    $Log.AppendText("$Text`r`n")
    $Log.SelectionStart = $Log.TextLength
    $Log.ScrollToCaret()
    [System.Windows.Forms.Application]::DoEvents()
}

function Set-UiState {
    $Plan = Get-InstallPlan
    $DetectedLabel.Text = $Plan.Text

    if ($Plan.Target) {
        $InstallButton.Enabled = $true
        $StatusLabel.Text = "Ready"
    } else {
        $InstallButton.Enabled = $false
        $StatusLabel.Text = "Choose a client"
    }
}

function Select-Folder {
    param([string]$Description)

    $Dialog = New-Object System.Windows.Forms.FolderBrowserDialog
    $Dialog.Description = $Description
    if ($Dialog.ShowDialog($Form) -eq [System.Windows.Forms.DialogResult]::OK) {
        return $Dialog.SelectedPath
    }

    return ""
}

function Join-Arguments {
    param([string[]]$Items)

    ($Items | ForEach-Object {
        if ($_ -match "\s|`"") {
            '"' + ($_ -replace '"', '\"') + '"'
        } else {
            $_
        }
    }) -join " "
}

$Muted = [System.Drawing.Color]::FromArgb(174, 181, 198)
$PanelColor = [System.Drawing.Color]::FromArgb(31, 34, 44)
$FieldColor = [System.Drawing.Color]::FromArgb(16, 18, 24)
$Accent = [System.Drawing.Color]::FromArgb(91, 122, 255)
$Green = [System.Drawing.Color]::FromArgb(28, 198, 165)

$Form = New-Object System.Windows.Forms.Form
$Form.Text = "DiscordLyrics Installer"
$Form.Width = 760
$Form.Height = 610
$Form.StartPosition = "CenterScreen"
$Form.BackColor = [System.Drawing.Color]::FromArgb(18, 20, 27)
$Form.ForeColor = [System.Drawing.Color]::White
$Form.Font = New-Object System.Drawing.Font("Segoe UI", 10)
$Form.Icon = New-LauncherIcon

Add-Text $Form "DiscordLyrics" 28 22 360 42 22 $true | Out-Null
Add-Text $Form "Install Spotify synced lyrics status for Discord." 30 62 560 24 10 $false $Muted | Out-Null

$MainPanel = New-Object System.Windows.Forms.Panel
$MainPanel.Left = 28
$MainPanel.Top = 104
$MainPanel.Width = 690
$MainPanel.Height = 170
$MainPanel.BackColor = $PanelColor
$Form.Controls.Add($MainPanel)

Add-Text $MainPanel "Install target" 22 22 180 22 10 $true | Out-Null
$TargetBox = New-Object System.Windows.Forms.ComboBox
$TargetBox.Left = 22
$TargetBox.Top = 50
$TargetBox.Width = 260
$TargetBox.Height = 34
$TargetBox.DropDownStyle = "DropDownList"
[void]$TargetBox.Items.AddRange(@("Auto", "Vencord", "Equicord", "Dorian", "BetterDiscord"))
$TargetBox.SelectedIndex = 0
$MainPanel.Controls.Add($TargetBox)

$DetectedLabel = Add-Text $MainPanel "" 22 98 640 42 10 $false $Muted

$InstallButton = New-Object System.Windows.Forms.Button
$InstallButton.Left = 28
$InstallButton.Top = 294
$InstallButton.Width = 190
$InstallButton.Height = 42
$InstallButton.Text = "Install"
$InstallButton.FlatStyle = "Flat"
$InstallButton.BackColor = $Accent
$InstallButton.ForeColor = [System.Drawing.Color]::White
$Form.Controls.Add($InstallButton)

$AdvancedButton = New-Object System.Windows.Forms.Button
$AdvancedButton.Left = 232
$AdvancedButton.Top = 294
$AdvancedButton.Width = 130
$AdvancedButton.Height = 42
$AdvancedButton.Text = "Advanced"
$AdvancedButton.FlatStyle = "Flat"
$AdvancedButton.BackColor = [System.Drawing.Color]::FromArgb(48, 52, 66)
$AdvancedButton.ForeColor = [System.Drawing.Color]::White
$Form.Controls.Add($AdvancedButton)

$CloseButton = New-Object System.Windows.Forms.Button
$CloseButton.Left = 376
$CloseButton.Top = 294
$CloseButton.Width = 110
$CloseButton.Height = 42
$CloseButton.Text = "Close"
$CloseButton.FlatStyle = "Flat"
$CloseButton.BackColor = [System.Drawing.Color]::FromArgb(48, 52, 66)
$CloseButton.ForeColor = [System.Drawing.Color]::White
$CloseButton.Add_Click({ $Form.Close() })
$Form.Controls.Add($CloseButton)

$StatusLabel = Add-Text $Form "Ready" 512 304 200 28 10 $true $Green

$AdvancedPanel = New-Object System.Windows.Forms.Panel
$AdvancedPanel.Left = 28
$AdvancedPanel.Top = 354
$AdvancedPanel.Width = 690
$AdvancedPanel.Height = 132
$AdvancedPanel.BackColor = [System.Drawing.Color]::FromArgb(24, 27, 36)
$AdvancedPanel.Visible = $false
$Form.Controls.Add($AdvancedPanel)

Add-Text $AdvancedPanel "Source folder" 18 16 130 22 9 $true $Muted | Out-Null
$SourceBox = New-Object System.Windows.Forms.TextBox
$SourceBox.Left = 150
$SourceBox.Top = 14
$SourceBox.Width = 420
$SourceBox.BackColor = $FieldColor
$SourceBox.ForeColor = [System.Drawing.Color]::White
$SourceBox.BorderStyle = "FixedSingle"
$AdvancedPanel.Controls.Add($SourceBox)

$SourceBrowseButton = New-Object System.Windows.Forms.Button
$SourceBrowseButton.Left = 584
$SourceBrowseButton.Top = 12
$SourceBrowseButton.Width = 82
$SourceBrowseButton.Height = 28
$SourceBrowseButton.Text = "Browse"
$SourceBrowseButton.FlatStyle = "Flat"
$SourceBrowseButton.BackColor = $Accent
$SourceBrowseButton.ForeColor = [System.Drawing.Color]::White
$SourceBrowseButton.Add_Click({
    $Folder = Select-Folder "Choose your Vencord, Equicord, or Dorian source folder"
    if ($Folder) {
        $SourceBox.Text = $Folder
        Set-UiState
    }
})
$AdvancedPanel.Controls.Add($SourceBrowseButton)

Add-Text $AdvancedPanel "Local release" 18 52 130 22 9 $true $Muted | Out-Null
$PackageBox = New-Object System.Windows.Forms.TextBox
$PackageBox.Left = 150
$PackageBox.Top = 50
$PackageBox.Width = 420
$PackageBox.BackColor = $FieldColor
$PackageBox.ForeColor = [System.Drawing.Color]::White
$PackageBox.BorderStyle = "FixedSingle"
$PackageBox.Text = Get-DefaultPackageDir
$AdvancedPanel.Controls.Add($PackageBox)

$PackageBrowseButton = New-Object System.Windows.Forms.Button
$PackageBrowseButton.Left = 584
$PackageBrowseButton.Top = 48
$PackageBrowseButton.Width = 82
$PackageBrowseButton.Height = 28
$PackageBrowseButton.Text = "Browse"
$PackageBrowseButton.FlatStyle = "Flat"
$PackageBrowseButton.BackColor = $Accent
$PackageBrowseButton.ForeColor = [System.Drawing.Color]::White
$PackageBrowseButton.Add_Click({
    $Folder = Select-Folder "Choose a built DiscordLyrics release folder"
    if ($Folder) {
        $PackageBox.Text = $Folder
    }
})
$AdvancedPanel.Controls.Add($PackageBrowseButton)

$SkipBuildBox = New-Object System.Windows.Forms.CheckBox
$SkipBuildBox.Left = 150
$SkipBuildBox.Top = 88
$SkipBuildBox.Width = 160
$SkipBuildBox.Text = "Skip build"
$SkipBuildBox.ForeColor = $Muted
$AdvancedPanel.Controls.Add($SkipBuildBox)

$NoInjectBox = New-Object System.Windows.Forms.CheckBox
$NoInjectBox.Left = 328
$NoInjectBox.Top = 88
$NoInjectBox.Width = 180
$NoInjectBox.Text = "Skip Discord injection"
$NoInjectBox.ForeColor = $Muted
$AdvancedPanel.Controls.Add($NoInjectBox)

$Log = New-Object System.Windows.Forms.RichTextBox
$Log.Left = 28
$Log.Top = 354
$Log.Width = 690
$Log.Height = 170
$Log.ReadOnly = $true
$Log.BackColor = [System.Drawing.Color]::FromArgb(10, 12, 17)
$Log.ForeColor = [System.Drawing.Color]::FromArgb(218, 223, 235)
$Log.BorderStyle = "None"
$Log.Font = New-Object System.Drawing.Font("Cascadia Mono", 9)
$Form.Controls.Add($Log)

$AdvancedButton.Add_Click({
    $AdvancedPanel.Visible = !$AdvancedPanel.Visible
    $Log.Top = if ($AdvancedPanel.Visible) { 504 } else { 354 }
    $Log.Height = if ($AdvancedPanel.Visible) { 42 } else { 170 }
    $Form.Height = if ($AdvancedPanel.Visible) { 640 } else { 610 }
    $AdvancedButton.Text = if ($AdvancedPanel.Visible) { "Hide advanced" } else { "Advanced" }
})

$TargetBox.Add_SelectedIndexChanged({ Set-UiState })
$SourceBox.Add_TextChanged({ Set-UiState })

$InstallButton.Add_Click({
    $Plan = Get-InstallPlan
    if (!$Plan.Target) {
        [System.Windows.Forms.MessageBox]::Show($Form, "Choose Vencord, Equicord, Dorian, or BetterDiscord manually.", "DiscordLyrics Installer") | Out-Null
        return
    }

    if ($Plan.Target -ne "BetterDiscord" -and !$Plan.SourcePath) {
        $Folder = Select-Folder "Choose your $($Plan.Target) source folder"
        if (!$Folder) {
            return
        }
        $SourceBox.Text = $Folder
        $Plan = Get-InstallPlan
    }

    $InstallButton.Enabled = $false
    $AdvancedButton.Enabled = $false
    $StatusLabel.Text = "Installing..."
    $Log.Clear()

    try {
        $InstallerPath = Get-InstallerPath
        Add-Log "Installing for $($Plan.Target)"

        $Arguments = @(
            "-NoProfile",
            "-ExecutionPolicy", "Bypass",
            "-File", $InstallerPath,
            "-Target", $Plan.Target
        )

        if ($Plan.SourcePath) {
            $Arguments += @("-SourcePath", $Plan.SourcePath)
        }

        $PackagePath = $PackageBox.Text.Trim()
        if ($PackagePath) {
            $Arguments += @("-LocalPackageDir", $PackagePath)
        }

        if ($SkipBuildBox.Checked) {
            $Arguments += "-SkipBuild"
        }

        if ($NoInjectBox.Checked) {
            $Arguments += "-NoInject"
        }

        $Process = New-Object System.Diagnostics.Process
        $Process.StartInfo.FileName = "powershell.exe"
        $Process.StartInfo.Arguments = Join-Arguments $Arguments
        $Process.StartInfo.UseShellExecute = $false
        $Process.StartInfo.RedirectStandardOutput = $true
        $Process.StartInfo.RedirectStandardError = $true
        $Process.StartInfo.CreateNoWindow = $true

        [void]$Process.Start()
        $Output = $Process.StandardOutput.ReadToEnd()
        $ErrorText = $Process.StandardError.ReadToEnd()
        $Process.WaitForExit()

        if ($Output) {
            $Output -split "`r?`n" | Where-Object { $_ } | ForEach-Object { Add-Log $_ }
        }
        if ($ErrorText) {
            $ErrorText -split "`r?`n" | Where-Object { $_ } | ForEach-Object { Add-Log $_ }
        }

        if ($Process.ExitCode -eq 0) {
            $StatusLabel.Text = "Installed"
            Add-Log "Install complete."
        } else {
            $StatusLabel.Text = "Failed"
            Add-Log "Install failed with exit code $($Process.ExitCode)."
        }
    } catch {
        $StatusLabel.Text = "Failed"
        Add-Log $_.Exception.Message
    } finally {
        $InstallButton.Enabled = $true
        $AdvancedButton.Enabled = $true
    }
})

Set-UiState
[void]$Form.ShowDialog()
