' ========================================================
' Valheim Dedicated Server Dashboard - Silent Stopper
' Terminates the dashboard background process silently
' ========================================================

Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
currentDir = fso.GetParentFolderName(WScript.ScriptFullName)

pidFile = currentDir & "\cache\dashboard.pid"
If fso.FileExists(pidFile) Then
    On Error Resume Next
    Set f = fso.OpenTextFile(pidFile, 1)
    dashPid = Trim(f.ReadLine)
    f.Close
    If Len(dashPid) > 0 Then
        WshShell.Run "taskkill /f /pid " & dashPid, 0, True
    End If
    fso.DeleteFile pidFile, True
    On Error Goto 0
End If

' Also terminate any process listening on 8085
WshShell.Run "cmd /c for /f ""tokens=5"" %a in ('netstat -aon ^| findstr "":8085"" ^| findstr ""LISTENING""') do taskkill /f /pid %a", 0, True
