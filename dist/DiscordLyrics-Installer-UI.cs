using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Linq;
using System.Net;
using System.Windows.Forms;

internal static class Program
{
    [STAThread]
    private static void Main(string[] args)
    {
        ServicePointManager.SecurityProtocol |= SecurityProtocolType.Tls12;
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.Run(new InstallerForm(args));
    }
}

internal sealed class InstallerForm : Form
{
    private const string Repo = "MallyDev2/DiscordLyrics";
    private readonly ComboBox targetBox = new ComboBox();
    private readonly Label detectedLabel = new Label();
    private readonly Label statusLabel = new Label();
    private readonly Button installButton = new Button();
    private readonly Button advancedButton = new Button();
    private readonly Panel advancedPanel = new Panel();
    private readonly TextBox sourceBox = new TextBox();
    private readonly TextBox packageBox = new TextBox();
    private readonly CheckBox skipBuildBox = new CheckBox();
    private readonly CheckBox noInjectBox = new CheckBox();
    private readonly RichTextBox logBox = new RichTextBox();
    private readonly string scriptRoot;
    private readonly string localPackageArg;
    private readonly string targetArg;
    private readonly string sourcePathArg;
    private readonly string updateVersionArg;
    private readonly string updateNotesPathArg;
    private readonly bool updateMode;

    private readonly Color muted = Color.FromArgb(174, 181, 198);
    private readonly Color panelColor = Color.FromArgb(31, 34, 44);
    private readonly Color fieldColor = Color.FromArgb(16, 18, 24);
    private readonly Color accent = Color.FromArgb(91, 122, 255);
    private readonly Color green = Color.FromArgb(28, 198, 165);

    public InstallerForm(string[] args)
    {
        scriptRoot = AppDomain.CurrentDomain.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar);
        localPackageArg = ReadArgument(args, "-LocalPackageDir");
        targetArg = ReadArgument(args, "-Target");
        sourcePathArg = ReadArgument(args, "-SourcePath");
        updateVersionArg = ReadArgument(args, "-UpdateVersion");
        updateNotesPathArg = ReadArgument(args, "-UpdateNotesPath");
        updateMode = HasArgument(args, "-UpdateMode");

        Text = updateMode ? "Updating DiscordLyrics" : "DiscordLyrics Installer";
        Width = 760;
        Height = 610;
        StartPosition = FormStartPosition.CenterScreen;
        BackColor = Color.FromArgb(18, 20, 27);
        ForeColor = Color.White;
        Font = new Font("Segoe UI", 10f);
        Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath) ?? CreateIcon();
        MaximizeBox = false;

        AddText(this, updateMode ? "Updating DiscordLyrics" : "DiscordLyrics", 28, 22, 430, 42, 22f, true, Color.White);
        AddText(this, updateMode ? "Installing the update and restarting Discord." : "Install Spotify synced lyrics status for Discord.", 30, 62, 560, 24, 10f, false, muted);

        var mainPanel = new Panel
        {
            Left = 28,
            Top = 104,
            Width = 690,
            Height = 170,
            BackColor = panelColor
        };
        Controls.Add(mainPanel);

        AddText(mainPanel, "Install target", 22, 22, 180, 22, 10f, true, Color.White);
        targetBox.Left = 22;
        targetBox.Top = 50;
        targetBox.Width = 260;
        targetBox.DropDownStyle = ComboBoxStyle.DropDownList;
        targetBox.Items.AddRange(new object[] { "Auto", "Vencord", "Equicord", "Dorian", "BetterDiscord" });
        targetBox.SelectedIndex = 0;
        targetBox.SelectedIndexChanged += (_, __) => SetUiState();
        mainPanel.Controls.Add(targetBox);

        detectedLabel.Left = 22;
        detectedLabel.Top = 98;
        detectedLabel.Width = 640;
        detectedLabel.Height = 42;
        detectedLabel.ForeColor = muted;
        mainPanel.Controls.Add(detectedLabel);

        installButton.Left = 28;
        installButton.Top = 294;
        installButton.Width = 190;
        installButton.Height = 42;
        installButton.Text = "Install";
        StyleButton(installButton, accent);
        installButton.Click += (_, __) => Install();
        Controls.Add(installButton);

        advancedButton.Left = 232;
        advancedButton.Top = 294;
        advancedButton.Width = 130;
        advancedButton.Height = 42;
        advancedButton.Text = "Advanced";
        StyleButton(advancedButton, Color.FromArgb(48, 52, 66));
        advancedButton.Click += (_, __) => ToggleAdvanced();
        Controls.Add(advancedButton);

        var closeButton = new Button
        {
            Left = 376,
            Top = 294,
            Width = 110,
            Height = 42,
            Text = "Close"
        };
        StyleButton(closeButton, Color.FromArgb(48, 52, 66));
        closeButton.Click += (_, __) => Close();
        Controls.Add(closeButton);

        statusLabel.Left = 512;
        statusLabel.Top = 304;
        statusLabel.Width = 200;
        statusLabel.Height = 28;
        statusLabel.ForeColor = green;
        statusLabel.Font = new Font("Segoe UI", 10f, FontStyle.Bold);
        Controls.Add(statusLabel);

        BuildAdvancedPanel();
        BuildLog();

        packageBox.Text = GetDefaultPackageDir();
        ApplyArgumentDefaults();
        if (updateMode)
            ConfigureUpdateMode();
        SetUiState();
    }

    private void BuildAdvancedPanel()
    {
        advancedPanel.Left = 28;
        advancedPanel.Top = 354;
        advancedPanel.Width = 690;
        advancedPanel.Height = 132;
        advancedPanel.BackColor = Color.FromArgb(24, 27, 36);
        advancedPanel.Visible = false;
        Controls.Add(advancedPanel);

        AddText(advancedPanel, "Source folder", 18, 16, 130, 22, 9f, true, muted);
        ConfigureTextBox(sourceBox, 150, 14, 420);
        sourceBox.TextChanged += (_, __) => SetUiState();
        advancedPanel.Controls.Add(sourceBox);

        var sourceBrowse = new Button { Left = 584, Top = 12, Width = 82, Height = 28, Text = "Browse" };
        StyleButton(sourceBrowse, accent);
        sourceBrowse.Click += (_, __) =>
        {
            var folder = SelectFolder("Choose your Vencord, Equicord, or Dorian source folder");
            if (!string.IsNullOrWhiteSpace(folder))
                sourceBox.Text = folder;
        };
        advancedPanel.Controls.Add(sourceBrowse);

        AddText(advancedPanel, "Local release", 18, 52, 130, 22, 9f, true, muted);
        ConfigureTextBox(packageBox, 150, 50, 420);
        advancedPanel.Controls.Add(packageBox);

        var packageBrowse = new Button { Left = 584, Top = 48, Width = 82, Height = 28, Text = "Browse" };
        StyleButton(packageBrowse, accent);
        packageBrowse.Click += (_, __) =>
        {
            var folder = SelectFolder("Choose a built DiscordLyrics release folder");
            if (!string.IsNullOrWhiteSpace(folder))
                packageBox.Text = folder;
        };
        advancedPanel.Controls.Add(packageBrowse);

        skipBuildBox.Left = 150;
        skipBuildBox.Top = 88;
        skipBuildBox.Width = 160;
        skipBuildBox.Text = "Skip build";
        skipBuildBox.ForeColor = muted;
        advancedPanel.Controls.Add(skipBuildBox);

        noInjectBox.Left = 328;
        noInjectBox.Top = 88;
        noInjectBox.Width = 180;
        noInjectBox.Text = "Skip Discord injection";
        noInjectBox.ForeColor = muted;
        advancedPanel.Controls.Add(noInjectBox);
    }

    private void BuildLog()
    {
        logBox.Left = 28;
        logBox.Top = 354;
        logBox.Width = 690;
        logBox.Height = 170;
        logBox.ReadOnly = true;
        logBox.BackColor = Color.FromArgb(10, 12, 17);
        logBox.ForeColor = Color.FromArgb(218, 223, 235);
        logBox.BorderStyle = BorderStyle.None;
        logBox.Font = new Font("Cascadia Mono", 9f);
        Controls.Add(logBox);
    }

    private void ToggleAdvanced()
    {
        advancedPanel.Visible = !advancedPanel.Visible;
        logBox.Top = advancedPanel.Visible ? 504 : 354;
        logBox.Height = advancedPanel.Visible ? 42 : 170;
        Height = advancedPanel.Visible ? 640 : 610;
        advancedButton.Text = advancedPanel.Visible ? "Hide advanced" : "Advanced";
    }

    private void ApplyArgumentDefaults()
    {
        if (!string.IsNullOrWhiteSpace(targetArg))
        {
            var index = targetBox.Items.IndexOf(targetArg);
            if (index >= 0)
                targetBox.SelectedIndex = index;
        }

        if (!string.IsNullOrWhiteSpace(sourcePathArg))
            sourceBox.Text = sourcePathArg;

        if (!string.IsNullOrWhiteSpace(localPackageArg))
            packageBox.Text = localPackageArg;
    }

    private void ConfigureUpdateMode()
    {
        targetBox.Enabled = false;
        installButton.Visible = false;
        advancedButton.Visible = false;
        advancedPanel.Visible = false;

        foreach (Control control in Controls)
        {
            var button = control as Button;
            if (button != null && button.Text == "Close")
                button.Visible = false;
        }

        logBox.Top = 188;
        logBox.Height = 324;
        statusLabel.Left = 28;
        statusLabel.Top = 122;
        statusLabel.Width = 660;
        statusLabel.Text = "Preparing update...";
        Height = 590;

        Shown += (_, __) => BeginInvoke((Action)Install);
    }

    private void Install()
    {
        var plan = GetInstallPlan();
        if (string.IsNullOrWhiteSpace(plan.Target))
        {
            MessageBox.Show(this, "Choose Vencord, Equicord, Dorian, or BetterDiscord manually.", Text, MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        if (plan.Target != "BetterDiscord" && string.IsNullOrWhiteSpace(plan.SourcePath))
        {
            var folder = SelectFolder("Choose your " + plan.Target + " source folder");
            if (string.IsNullOrWhiteSpace(folder))
                return;

            sourceBox.Text = folder;
            plan = GetInstallPlan();
        }

        installButton.Enabled = false;
        advancedButton.Enabled = false;
        statusLabel.Text = updateMode ? "Updating..." : "Installing...";
        logBox.Clear();
        AppendLog((updateMode ? "Updating " : "Installing for ") + plan.Target);

        var installerPath = GetInstallerPath();
        var args = new List<string>
        {
            "-NoProfile",
            "-ExecutionPolicy", "Bypass",
            "-File", installerPath,
            "-Target", plan.Target
        };

        if (updateMode)
            args.Add("-NonInteractive");

        if (!string.IsNullOrWhiteSpace(plan.SourcePath))
            args.AddRange(new[] { "-SourcePath", plan.SourcePath });

        if (!string.IsNullOrWhiteSpace(packageBox.Text))
            args.AddRange(new[] { "-LocalPackageDir", packageBox.Text.Trim() });

        if (!string.IsNullOrWhiteSpace(updateVersionArg))
            args.AddRange(new[] { "-UpdateVersion", updateVersionArg });

        if (!string.IsNullOrWhiteSpace(updateNotesPathArg))
            args.AddRange(new[] { "-UpdateNotesPath", updateNotesPathArg });

        if (skipBuildBox.Checked)
            args.Add("-SkipBuild");

        if (noInjectBox.Checked)
            args.Add("-NoInject");

        var process = new Process
        {
            StartInfo = new ProcessStartInfo
            {
                FileName = "powershell.exe",
                Arguments = JoinArguments(args),
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true
            },
            EnableRaisingEvents = true
        };

        process.OutputDataReceived += (_, eventArgs) => AppendLog(eventArgs.Data);
        process.ErrorDataReceived += (_, eventArgs) => AppendLog(eventArgs.Data);
        process.Exited += (_, __) =>
        {
            BeginInvoke((Action)(() =>
            {
                statusLabel.Text = process.ExitCode == 0 ? "Installed" : "Failed";
                AppendLog(process.ExitCode == 0 ? "Install complete." : "Install failed with exit code " + process.ExitCode + ".");
                installButton.Enabled = !updateMode;
                advancedButton.Enabled = !updateMode;
                process.Dispose();
                if (updateMode && statusLabel.Text == "Installed")
                {
                    statusLabel.Text = "Discord reopened";
                    var timer = new Timer { Interval = 1500 };
                    timer.Tick += (timerSender, timerArgs) =>
                    {
                        timer.Stop();
                        timer.Dispose();
                        Close();
                    };
                    timer.Start();
                }
            }));
        };

        try
        {
            process.Start();
            process.BeginOutputReadLine();
            process.BeginErrorReadLine();
        }
        catch (Exception ex)
        {
            statusLabel.Text = "Failed";
            AppendLog(ex.Message);
            installButton.Enabled = !updateMode;
            advancedButton.Enabled = !updateMode;
            process.Dispose();
        }
    }

    private InstallPlan GetInstallPlan()
    {
        var selected = Convert.ToString(targetBox.SelectedItem) ?? "Auto";
        var names = new[] { "Vencord", "Equicord", "Dorian" };

        if (updateMode && !string.IsNullOrWhiteSpace(targetArg))
            return new InstallPlan(targetArg, sourcePathArg, "Updating " + targetArg, DateTime.Now);

        if (selected == "Auto")
        {
            var matches = new List<InstallPlan>();
            foreach (var name in names)
            {
                var installed = GetInstalledClientTime(name);
                var source = GetSourceCandidates(name).FirstOrDefault();
                if (installed.HasValue && !string.IsNullOrWhiteSpace(source))
                    matches.Add(new InstallPlan(name, source, "Auto detected " + name + " at " + source, installed.Value));
            }

            if (matches.Count > 0)
                return matches.OrderByDescending(item => item.LastWriteTime).First();

            var betterDiscordPlugins = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "BetterDiscord", "plugins");
            if (Directory.Exists(betterDiscordPlugins))
                return new InstallPlan("BetterDiscord", "", "Auto detected BetterDiscord", DateTime.Now);

            return new InstallPlan("", "", "No supported client was detected", DateTime.MinValue);
        }

        if (selected == "BetterDiscord")
            return new InstallPlan("BetterDiscord", "", "Ready to install for BetterDiscord", DateTime.Now);

        var manualSource = sourceBox.Text.Trim();
        if (LooksLikeSource(manualSource))
            return new InstallPlan(selected, manualSource, "Using " + selected + " source at " + manualSource, DateTime.Now);

        var detectedSource = GetSourceCandidates(selected).FirstOrDefault();
        if (!string.IsNullOrWhiteSpace(detectedSource))
            return new InstallPlan(selected, detectedSource, "Detected " + selected + " source at " + detectedSource, DateTime.Now);

        return new InstallPlan(selected, "", selected + " needs a source folder", DateTime.MinValue);
    }

    private void SetUiState()
    {
        var plan = GetInstallPlan();
        detectedLabel.Text = plan.Text;
        installButton.Enabled = !string.IsNullOrWhiteSpace(plan.Target);
        statusLabel.Text = installButton.Enabled ? "Ready" : "Choose a client";
    }

    private string GetInstallerPath()
    {
        var local = Path.Combine(scriptRoot, "DiscordLyrics-Installer.ps1");
        if (File.Exists(local))
            return local;

        var cacheDir = Path.Combine(Path.GetTempPath(), "DiscordLyricsInstaller");
        Directory.CreateDirectory(cacheDir);
        var temp = Path.Combine(cacheDir, "DiscordLyrics-Installer.ps1");
        if (File.Exists(temp))
            File.Delete(temp);

        using (var client = new WebClient())
            client.DownloadFile("https://github.com/" + Repo + "/releases/latest/download/DiscordLyrics-Installer.ps1", temp);

        return temp;
    }

    private string GetDefaultPackageDir()
    {
        var candidates = new[]
        {
            localPackageArg,
            scriptRoot,
            Path.Combine(scriptRoot, "package"),
            Path.GetFullPath(Path.Combine(scriptRoot, "..", "dist", "package"))
        };

        foreach (var candidate in candidates)
        {
            if (!string.IsNullOrWhiteSpace(candidate) && IsPackageDir(candidate))
                return Path.GetFullPath(candidate);
        }

        return "";
    }

    private static bool IsPackageDir(string path)
    {
        return Directory.Exists(Path.Combine(path, "BetterDiscord")) && Directory.Exists(Path.Combine(path, "Vencord"));
    }

    private static DateTime? GetInstalledClientTime(string clientName)
    {
        var dataDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), clientName);
        var paths = new[]
        {
            Path.Combine(dataDir, "settings", "settings.json"),
            Path.Combine(dataDir, "dist"),
            Path.Combine(dataDir, clientName.ToLowerInvariant() + ".asar")
        };

        var existing = paths.Where(path => File.Exists(path) || Directory.Exists(path))
            .Select(path => new FileInfo(path).LastWriteTime)
            .ToList();

        return existing.Count == 0 ? (DateTime?)null : existing.Max();
    }

    private static IEnumerable<string> GetSourceCandidates(string clientName)
    {
        var profile = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        var roots = new[]
        {
            Path.Combine(profile, "Documents"),
            Path.Combine(profile, "Desktop"),
            profile
        };

        return roots.Where(Directory.Exists)
            .Select(root => Path.Combine(root, clientName))
            .Where(LooksLikeSource)
            .Distinct(StringComparer.OrdinalIgnoreCase);
    }

    private static bool LooksLikeSource(string path)
    {
        return !string.IsNullOrWhiteSpace(path) && File.Exists(Path.Combine(path, "package.json"));
    }

    private static string ReadArgument(string[] args, string name)
    {
        for (var index = 0; index < args.Length - 1; index++)
        {
            if (string.Equals(args[index], name, StringComparison.OrdinalIgnoreCase))
                return args[index + 1];
        }

        return "";
    }

    private static bool HasArgument(string[] args, string name)
    {
        return args.Any(arg => string.Equals(arg, name, StringComparison.OrdinalIgnoreCase));
    }

    private static string SelectFolder(string description)
    {
        using (var dialog = new FolderBrowserDialog { Description = description })
            return dialog.ShowDialog() == DialogResult.OK ? dialog.SelectedPath : "";
    }

    private static string JoinArguments(IEnumerable<string> args)
    {
        return string.Join(" ", args.Select(QuoteArgument));
    }

    private static string QuoteArgument(string value)
    {
        if (string.IsNullOrEmpty(value))
            return "\"\"";

        return value.Any(char.IsWhiteSpace) || value.Contains("\"")
            ? "\"" + value.Replace("\"", "\\\"") + "\""
            : value;
    }

    private void AppendLog(string text)
    {
        if (string.IsNullOrWhiteSpace(text))
            return;

        if (InvokeRequired)
        {
            BeginInvoke((Action)(() => AppendLog(text)));
            return;
        }

        logBox.AppendText(text + Environment.NewLine);
        logBox.SelectionStart = logBox.TextLength;
        logBox.ScrollToCaret();
    }

    private static void ConfigureTextBox(TextBox box, int left, int top, int width)
    {
        box.Left = left;
        box.Top = top;
        box.Width = width;
        box.BackColor = Color.FromArgb(16, 18, 24);
        box.ForeColor = Color.White;
        box.BorderStyle = BorderStyle.FixedSingle;
    }

    private static Label AddText(Control parent, string text, int left, int top, int width, int height, float size, bool bold, Color color)
    {
        var label = new Label
        {
            Text = text,
            Left = left,
            Top = top,
            Width = width,
            Height = height,
            ForeColor = color,
            Font = new Font("Segoe UI", size, bold ? FontStyle.Bold : FontStyle.Regular)
        };
        parent.Controls.Add(label);
        return label;
    }

    private static void StyleButton(Button button, Color color)
    {
        button.FlatStyle = FlatStyle.Flat;
        button.FlatAppearance.BorderSize = 0;
        button.BackColor = color;
        button.ForeColor = Color.White;
    }

    private static Icon CreateIcon()
    {
        var bitmap = new Bitmap(32, 32);
        using (var graphics = Graphics.FromImage(bitmap))
        using (var brush = new LinearGradientBrush(new Rectangle(0, 0, 32, 32), Color.FromArgb(91, 122, 255), Color.FromArgb(28, 198, 165), 45f))
        using (var font = new Font("Segoe UI", 11f, FontStyle.Bold))
        using (var textBrush = new SolidBrush(Color.White))
        using (var format = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center })
        {
            graphics.SmoothingMode = SmoothingMode.AntiAlias;
            graphics.Clear(Color.Transparent);
            graphics.FillEllipse(brush, 2, 2, 28, 28);
            graphics.DrawString("DL", font, textBrush, new RectangleF(0, 0, 32, 30), format);
        }

        return Icon.FromHandle(bitmap.GetHicon());
    }

    private sealed class InstallPlan
    {
        public InstallPlan(string target, string sourcePath, string text, DateTime lastWriteTime)
        {
            Target = target;
            SourcePath = sourcePath;
            Text = text;
            LastWriteTime = lastWriteTime;
        }

        public string Target { get; private set; }
        public string SourcePath { get; private set; }
        public string Text { get; private set; }
        public DateTime LastWriteTime { get; private set; }
    }
}
