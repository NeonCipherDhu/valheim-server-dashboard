' ========================================================
' Valheim Dedicated Server Dashboard - Silent Launcher
' Runs the dashboard node service in the background with
' zero console/terminal windows and opens the web portal.
' ========================================================

Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
currentDir = fso.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = currentDir

' Verify Node.js is installed
On Error Resume Next
nodeCheck = WshShell.Run("cmd /c where node", 0, True)
If nodeCheck <> 0 Then
    MsgBox "Node.js is not installed or not found in system PATH." & vbCrLf & vbCrLf & _
           "Please download and install Node.js from https://nodejs.org/ to launch the Valheim Web Dashboard.", _
           vbCritical, "Valheim Server Dashboard - Missing Node.js"
    WScript.Quit 1
End If
On Error Goto 0

' If SteamCMD or Valheim Server engine are missing, launch visible installer window
If Not fso.FileExists(currentDir & "\server\valheim_server.exe") Or Not fso.FileExists(currentDir & "\steamcmd\steamcmd.exe") Then
    WshShell.Run "cmd.exe /c """ & currentDir & "\start_dashboard.bat""", 1, False
    WScript.Quit 0
End If

' Ensure express dependencies are installed if first run
If Not fso.FolderExists(currentDir & "\dashboard\node_modules\express") Then
    WshShell.Run "cmd /c cd /d """ & currentDir & "\dashboard"" && npm install", 0, True
End If

' Launch dashboard server completely hidden in the background (0 = SW_HIDE)
WshShell.Run "node dashboard\server.js", 0, False

' Allow 1.5 seconds for HTTP & WebSocket listeners to bind port 8085
WScript.Sleep 1500

' Open web dashboard directly in the user's default browser
WshShell.Run "http://localhost:8085"
