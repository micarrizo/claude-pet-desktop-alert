# Devuelve en JSON la app que está en primer plano y los segundos desde la última tecla o movimiento del mouse.
# Lo usa el mod Hoppy para no avisar mientras estás mirando la app de Claude.
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class Presencia {
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
    [StructLayout(LayoutKind.Sequential)] public struct LastInput { public uint cbSize; public uint dwTime; }
    [DllImport("user32.dll")] public static extern bool GetLastInputInfo(ref LastInput info);
}
'@
$ventana = [Presencia]::GetForegroundWindow()
[uint32]$idProceso = 0
[void][Presencia]::GetWindowThreadProcessId($ventana, [ref]$idProceso)
$nombre = ''
try { $nombre = (Get-Process -Id $idProceso -ErrorAction Stop).ProcessName } catch {}
$ultima = New-Object Presencia+LastInput
$ultima.cbSize = 8
[void][Presencia]::GetLastInputInfo([ref]$ultima)
$inactivo = [int][Math]::Max(0, ([Environment]::TickCount - [int]$ultima.dwTime) / 1000)
[Console]::Out.Write((@{ foco = $nombre; inactivo = $inactivo } | ConvertTo-Json -Compress))
