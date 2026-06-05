Option Explicit

Dim shell, fso, scriptDir, uiPath, args, index, command

Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
uiPath = fso.BuildPath(scriptDir, "DiscordLyrics-Installer-UI.ps1")

args = ""
For index = 0 To WScript.Arguments.Count - 1
    args = args & " " & Quote(WScript.Arguments(index))
Next

command = "powershell.exe -NoProfile -ExecutionPolicy Bypass -STA -File " & Quote(uiPath) & args
shell.Run command, 1, False

Function Quote(value)
    Quote = """" & Replace(value, """", """""") & """"
End Function
