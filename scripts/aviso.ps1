# Aviso animado: una mascota pixelada avanza a saltos por el borde inferior de la pantalla, encima de
# todo, con un globo que dice qué chat te espera. Entre salto y salto se queda quieta para que el texto
# se lea. Cursor encima: se detiene. Clic: abre ese chat en la app de Claude. Clic derecho: la cierra.
# Lo lanza el mod aviso-espera.
param(
    [string]$Texto = 'Te dejé una pregunta',
    [string]$Detalle = '',
    [string]$Titulo = '',
    # Id de la sesión en la app de escritorio (local_...), para el deep link claude://code/continue.
    [string]$Sesion = '',
    [string]$Sonido = ''
)
$ErrorActionPreference = 'Stop'

# Un solo aviso a la vez
$mutex = New-Object System.Threading.Mutex($false, 'Local\ClaudeTeEsperaAviso')
if (-not $mutex.WaitOne(0)) { exit 0 }

try {
    Add-Type -AssemblyName PresentationFramework, PresentationCore, WindowsBase

    if ($Sesion -notmatch '^local_[A-Za-z0-9-]{1,64}$') { $Sesion = '' }
    $pincel = New-Object System.Windows.Media.BrushConverter
    $naranja = '#D97757'
    $ojo = '#2B1A12'

    # Mascota de 12 x 9 pixeles: de pie, parpadeando y en el aire (patas recogidas).
    $cara = @('.oooooooooo.', '.oooooooooo.')
    $ojos = @('.ookooookoo.', '.ookooookoo.')
    $ojosCerrados = @('.oooooooooo.', '.ookooookoo.')
    $panza = @('oooooooooooo', 'oooooooooooo', '.oooooooooo.')
    $patasPie = @('.o.o....o.o.', '.o.o....o.o.')
    $patasAire = @('..oo....oo..', '............')
    # 13 px por pixel: se ve bien hasta en un ultrawide de 49" (4096 px lógicos); ajústalo a gusto.
    $px = 13

    function Nueva-Mascota([string[]]$filas) {
        $c = New-Object System.Windows.Controls.Canvas
        $c.Width = 12 * $px; $c.Height = $filas.Count * $px
        for ($y = 0; $y -lt $filas.Count; $y++) {
            for ($x = 0; $x -lt $filas[$y].Length; $x++) {
                $ch = $filas[$y][$x]
                if ($ch -eq '.') { continue }
                $r = New-Object System.Windows.Shapes.Rectangle
                $r.Width = $px; $r.Height = $px
                $r.Fill = $pincel.ConvertFromString($(if ($ch -eq 'k') { $ojo } else { $naranja }))
                [System.Windows.Controls.Canvas]::SetLeft($r, $x * $px)
                [System.Windows.Controls.Canvas]::SetTop($r, $y * $px)
                [void]$c.Children.Add($r)
            }
        }
        return $c
    }
    $dePie = Nueva-Mascota ($cara + $ojos + $panza + $patasPie)
    $parpadeo = Nueva-Mascota ($cara + $ojosCerrados + $panza + $patasPie)
    $enAire = Nueva-Mascota ($cara + $ojos + $panza + $patasAire)
    $cuadros = @($dePie, $parpadeo, $enAire)
    function Mostrar($cual) { foreach ($c in $cuadros) { $c.Visibility = $(if ($c -eq $cual) { 'Visible' } else { 'Hidden' }) } }
    Mostrar $dePie

    # ---------- el globo ----------
    $globo = New-Object System.Windows.Controls.Border
    $globo.Background = $pincel.ConvertFromString('#F5F1E8')
    $globo.BorderBrush = $pincel.ConvertFromString($naranja)
    $globo.BorderThickness = 2
    $globo.CornerRadius = 12
    $globo.Padding = '14,10,14,10'
    # Ancho mínimo: sin él, el StackPanel lo dejaba del ancho de la mascota y cortaba el texto.
    $globo.MinWidth = 380
    $globo.MaxWidth = 540
    $globo.HorizontalAlignment = 'Left'
    $sombra = New-Object System.Windows.Media.Effects.DropShadowEffect
    $sombra.BlurRadius = 14; $sombra.ShadowDepth = 2; $sombra.Opacity = 0.35
    $globo.Effect = $sombra
    $pila = New-Object System.Windows.Controls.StackPanel

    # El chat que avisa, arriba y en naranja oscuro: es lo primero que hay que leer.
    if ($Titulo) {
        $tChat = New-Object System.Windows.Controls.TextBlock
        $tChat.Text = "💬 $Titulo"
        $tChat.FontSize = 16; $tChat.FontWeight = 'Bold'
        $tChat.TextTrimming = 'CharacterEllipsis'
        $tChat.Foreground = $pincel.ConvertFromString('#A4482A')
        $tChat.Margin = '0,0,0,4'
        [void]$pila.Children.Add($tChat)
    }
    $t1 = New-Object System.Windows.Controls.TextBlock
    $t1.Text = $Texto; $t1.FontSize = 22; $t1.FontWeight = 'SemiBold'; $t1.TextWrapping = 'Wrap'
    $t1.Foreground = $pincel.ConvertFromString('#141414')
    [void]$pila.Children.Add($t1)
    if ($Detalle) {
        $t2 = New-Object System.Windows.Controls.TextBlock
        $t2.Text = $Detalle; $t2.FontSize = 16; $t2.TextWrapping = 'Wrap'; $t2.Margin = '0,4,0,0'
        $t2.Foreground = $pincel.ConvertFromString('#4C5F72')
        [void]$pila.Children.Add($t2)
    }
    $t3 = New-Object System.Windows.Controls.TextBlock
    $t3.Text = $(if ($Sesion) { 'clic: ir al chat · clic derecho: cerrar · cursor encima: pausa' } else { 'clic para cerrar · cursor encima: pausa' })
    $t3.FontSize = 12; $t3.Margin = '0,6,0,0'
    $t3.Foreground = $pincel.ConvertFromString('#7A7A7A')
    [void]$pila.Children.Add($t3)
    $globo.Child = $pila

    # ---------- la mascota y su salto ----------
    $ALTURA = 46.0        # px que sube en cada salto; el margen de arriba le deja ese espacio libre
    $mascota = New-Object System.Windows.Controls.Grid
    foreach ($c in $cuadros) { [void]$mascota.Children.Add($c) }
    $mascota.HorizontalAlignment = 'Left'
    $mascota.Margin = "22,$($ALTURA + 8),0,0"
    $escala = New-Object System.Windows.Media.ScaleTransform(1, 1)
    $escala.CenterX = 6 * $px; $escala.CenterY = 9 * $px      # se aplasta contra el piso, no contra el centro
    $alto = New-Object System.Windows.Media.TranslateTransform(0, 0)
    $grupo = New-Object System.Windows.Media.TransformGroup
    $grupo.Children.Add($escala); $grupo.Children.Add($alto)
    $mascota.RenderTransform = $grupo

    $raiz = New-Object System.Windows.Controls.StackPanel
    [void]$raiz.Children.Add($globo)
    [void]$raiz.Children.Add($mascota)
    # Fondo casi transparente: así el cursor encima y el clic cuentan en todo el recuadro, no solo en los pixeles pintados.
    $raiz.Background = $pincel.ConvertFromString('#01000000')

    $win = New-Object System.Windows.Window
    $win.Title = 'Aviso de Claude'
    $win.WindowStyle = 'None'; $win.AllowsTransparency = $true; $win.Background = 'Transparent'
    $win.Topmost = $true; $win.ShowInTaskbar = $false; $win.ShowActivated = $false
    $win.SizeToContent = 'WidthAndHeight'; $win.ResizeMode = 'NoResize'
    $win.Content = $raiz
    $win.Opacity = 0
    $win.Cursor = 'Hand'

    $area = [System.Windows.SystemParameters]::WorkArea

    # Un salto: agacharse, volar hacia la derecha, aterrizar; después quieta para leer.
    $AGACHE = 0.12; $VUELO = 0.42; $ATERRIZA = 0.14; $DESCANSO = 1.45
    $CICLO = $AGACHE + $VUELO + $ATERRIZA + $DESCANSO
    $PASO = 360.0         # px por salto: ~11 saltos y ~23 s para cruzar una pantalla de 4096 px
    $TOPE_S = 120.0       # por si queda pausada con el cursor encima

    $script:x0 = $area.Left + 24
    $script:activo = 0.0       # segundos de animación, sin contar las pausas
    $script:ultimo = 0.0
    $script:pausado = $false
    $script:cerrando = $false
    $reloj = [System.Diagnostics.Stopwatch]::StartNew()

    function Abrir-Chat {
        if ($Sesion) {
            # El manejador de claude:// de la app abre la sesión, la trae al frente y la marca en la barra lateral.
            try { Start-Process "claude://code/continue?session=$Sesion" } catch {}
        }
    }
    $win.Add_MouseEnter({ $script:pausado = $true })
    $win.Add_MouseLeave({ $script:pausado = $false })
    $win.Add_MouseLeftButtonUp({ if (-not $script:cerrando) { Abrir-Chat; $script:cerrando = $true } })
    $win.Add_MouseRightButtonUp({ $script:cerrando = $true })
    $win.Add_Loaded({
        $win.Top = $area.Bottom - $win.ActualHeight - 4
        $win.Left = $script:x0
        if ($Sonido -and (Test-Path $Sonido)) {
            try { (New-Object System.Media.SoundPlayer $Sonido).Play() } catch {}
        }
    })

    $timer = New-Object System.Windows.Threading.DispatcherTimer
    $timer.Interval = [TimeSpan]::FromMilliseconds(15)
    $timer.Add_Tick({
        $ahora = $reloj.Elapsed.TotalSeconds
        $dt = $ahora - $script:ultimo
        $script:ultimo = $ahora
        if (-not $script:pausado -and -not $script:cerrando) { $script:activo += $dt }

        $n = [Math]::Floor($script:activo / $CICLO)
        $f = $script:activo - $n * $CICLO
        $dx = $PASO; $dy = 0.0; $sx = 1.0; $sy = 1.0; $cuadro = $dePie
        if ($f -lt $AGACHE) {
            $k = [Math]::Sin(($f / $AGACHE) * [Math]::PI / 2)
            $dx = 0.0; $sy = 1 - 0.16 * $k; $sx = 1 + 0.08 * $k
        } elseif ($f -lt $AGACHE + $VUELO) {
            $u = ($f - $AGACHE) / $VUELO
            $dx = $PASO * (1 - [Math]::Cos([Math]::PI * $u)) / 2
            $dy = -$ALTURA * 4 * $u * (1 - $u)
            $sy = 1.07; $sx = 0.95; $cuadro = $enAire
        } elseif ($f -lt $AGACHE + $VUELO + $ATERRIZA) {
            $k = [Math]::Sin((($f - $AGACHE - $VUELO) / $ATERRIZA) * [Math]::PI)
            $sy = 1 - 0.18 * $k; $sx = 1 + 0.10 * $k
        } else {
            $quieta = $f - $AGACHE - $VUELO - $ATERRIZA
            if ($n % 3 -eq 1 -and $quieta -gt 0.7 -and $quieta -lt 0.82) { $cuadro = $parpadeo }
        }
        Mostrar $cuadro
        $escala.ScaleX = $sx; $escala.ScaleY = $sy
        $alto.Y = $dy
        $win.Left = $script:x0 + $n * $PASO + $dx

        # Literales double a propósito: con [Math]::Min(1, x) PowerShell elige la sobrecarga
        # Int32, redondea 0.08 a 0 y la opacidad se queda en 0 (el monito caminaba invisible).
        $salio = $win.Left + $win.ActualWidth * 0.5 -gt $area.Right
        if ($script:cerrando -or $salio -or $ahora -gt $TOPE_S) {
            $win.Opacity = [Math]::Max([double]0.0, [double]($win.Opacity - 0.06))
            if ($win.Opacity -le 0.0) { $timer.Stop(); $win.Close() }
        } elseif ($win.Opacity -lt 1.0) {
            $win.Opacity = [Math]::Min([double]1.0, [double]($win.Opacity + 0.06))
        }
    })
    $timer.Start()
    [void]$win.ShowDialog()
}
finally {
    $mutex.ReleaseMutex()
    $mutex.Dispose()
}
