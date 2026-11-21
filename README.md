<p align="center">
  <img src="assets/mascota.svg" alt="La mascota pixelada" width="144">
</p>

<h1 align="center">claude-pet-desktop-alert</h1>

<p align="center"><b>La mascota que te avisa cuando Claude se quedó esperándote.</b><br>
Un mod de Claude Code para Windows (plugin <code>aviso-espera</code>).</p>

---

¿Tienes diez chats de Claude abiertos y no sabes cuál te está esperando? Este mod te avisa.

Si Claude te deja una pregunta y no contestas, a los 2 minutos aparece un bichito naranjo
que cruza la parte de abajo de tu pantalla **a saltos**, con un globo que dice:

```
💬 Arreglar el login del panel
Oye, te dejé una pregunta 👀
¿Uso la opción A o la B?
clic: ir al chat · clic derecho: cerrar · cursor encima: pausa
```

- 🐸 **Salta, no camina.** Entre salto y salto se queda quieto, así que el texto se lee tranquilo.
- 🏷️ **Te dice qué chat es:** arriba va el título de la conversación.
- 🖱️ **Un clic y llegas:** te lleva a ese chat dentro de la app de Claude y lo deja marcado en la barra lateral.
- ✋ **Cursor encima = pausa.** Clic derecho y se va.
- 🔔 Suena una campanita suave (dos notas, nada de alarmas).

## ¿Cuándo aparece?

| Tiempo sin atender | Qué pasa |
|---:|---|
| 2 min | Primer salto por la pantalla: «Oye, te dejé una pregunta 👀» |
| 6 min | Segundo aviso: «Sigo esperando tu respuesta» |
| 10 min | Mensaje por Discord, solo si configuraste un webhook (opcional) |

El reloj se reinicia mientras escribes en la caja del chat o tienes la app de Claude al frente
y estás usando el teclado o el mouse. O sea: si estás leyendo, no te molesta.

Cuenta como pregunta la que Claude deja en el recuadro de abajo de la app, una de
`AskUserQuestion` o una frase con «?» al final de su respuesta. Apenas le contestas, se olvida
del tema.

## Instalación

Necesitas **Windows 10 u 11** (usa PowerShell y WPF, que ya vienen con Windows) y Claude Code.
El clic que abre el chat funciona con la **app de escritorio de Claude** (pestaña Code).

En una terminal con Claude Code:

```
/plugin install aviso-espera --marketplace micarrizo/claude-pet-desktop-alert
```

Responde `y` para agregar el marketplace y elige el alcance (con «user» queda en todas tus sesiones).

Desde la consola:

```
claude plugin install aviso-espera --marketplace micarrizo/claude-pet-desktop-alert
```

En la app de escritorio, donde `/plugin` no corre: clic en **+** al lado de la caja de texto →
**Plugins** → **Add marketplace** con `micarrizo/claude-pet-desktop-alert` → **Add plugin**.

## Pruébalo

| Comando | Qué hace |
|---|---|
| `/espera-probar` | Lanza la mascota ahora mismo, con el título de este chat |
| `/espera-pausa` | Pausa o reanuda los avisos en este chat |

## Aviso por Discord (opcional)

Si quieres que te avise en el celular cuando llevas 10 minutos sin contestar, crea un webhook en
un canal tuyo de Discord (*Editar canal → Integraciones → Webhooks*) y pégalo en la opción
**Webhook de Discord** del plugin, en el menú de configuración de plugins. Se guarda como
secreto, y solo se aceptan direcciones `https://discord.com/api/webhooks/...`.

## ¿Cómo funciona por dentro?

| Pieza | Qué hace |
|---|---|
| `hooks/register.tsx` | Detecta las preguntas, mide cuánto llevas sin atender y lanza los avisos |
| `scripts/aviso.ps1` | La mascota: ventana WPF transparente, siempre encima, que salta de izquierda a derecha |
| `scripts/sesion.ps1` | Busca el id y el título del chat en los datos locales de la app de Claude |
| `scripts/presencia.ps1` | Mira qué app está al frente y hace cuánto tocaste el teclado o el mouse |
| `scripts/hacer_campanita.py` | Genera `campanita.wav` (solo librería estándar de Python) |

El clic abre `claude://code/continue?session=<id del chat>`, un enlace que la propia app de
escritorio de Claude sabe abrir.

### Privacidad

Todo pasa en tu computador. El mod lee los metadatos de sesión que la app de Claude guarda
localmente, solo para sacar el título del chat. No manda nada a ningún lado, salvo el mensaje a
Discord si tú configuras el webhook.

## Personalízalo

- Tiempos de aviso: constantes al principio de `hooks/register.tsx`.
- Tamaño, altura y largo del salto, y cuánto rato se queda quieta: `$px`, `$ALTURA`, `$PASO` y `$DESCANSO` en `scripts/aviso.ps1`.
- Otra campanita: edita las notas en `scripts/hacer_campanita.py` y corre `python scripts/hacer_campanita.py`.

## Desarrollo

```
claude plugin validate .
claude plugin test .
```

## Licencia

MIT. Úsalo, cámbialo y regálaselo a alguien que también viva con veinte chats abiertos. 🧡
