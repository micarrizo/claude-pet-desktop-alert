import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Espera } from '../types'

// Cuándo avisar, en milisegundos de tiempo SIN atender (se reinicia mientras escribes o miras la app).
const PRIMER_AVISO_MS = 2 * 60 * 1000
const SEGUNDO_AVISO_MS = 6 * 60 * 1000
const DISCORD_MS = 10 * 60 * 1000
const CADA_MS = 15 * 1000
// Estás atendiendo si la app de Claude está al frente y tocaste teclado o mouse hace menos de esto.
const ATENDIENDO_S = 45

const POWERSHELL = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'
// El webhook de Discord es opcional: sale de la opción `discordWebhook` del plugin (se guarda como secreto).
let webhookDiscord = ''

const espera = atom({ plugin: 'aviso-espera', key: 'espera' } as const, null as Espera | null, {
  shape: 'espera-1',
})
const pausa = atom({ plugin: 'aviso-espera', key: 'pausa' } as const, false, { shape: 'pausa-1' })

let revisando = false
// La pregunta que Claude dejó este turno en el recuadro de abajo (wrap_up `ask`) o en un
// AskUserQuestion. Muchas veces el mensaje final ya no repite la pregunta, así que buscar «?»
// solo en el mensaje dejaba el aviso mudo.
let preguntaDelRecuadro = ''

// ---------- la pregunta ----------

const limpiar = (s: string): string =>
  s
    .replace(/[*`#>|_]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

/** La última frase con «?» del final de la respuesta, o '' si Claude no preguntó nada. */
function preguntaDe(respuesta: string): string {
  const cola = respuesta.slice(-900)
  if (!cola.includes('?')) return ''
  const trozos = cola.split(/\n+|(?<=[.!])\s+/).map(limpiar).filter(t => t.includes('?'))
  const ultima = trozos[trozos.length - 1] ?? ''
  return ultima.length > 160 ? `${ultima.slice(0, 157)}…` : ultima
}

/** Lo que cuenta como respuesta tuya: lo que escribes tú, no un cron, una notificación u otra sesión. */
function esTuyo(kind: string): boolean {
  return !['task-notification', 'scheduled-trigger', 'peer', 'plugin'].includes(kind)
}

// ---------- estás o no estás ----------

type Presencia = { foco: string; inactivo: number }

function esPresencia(x: unknown): x is Presencia {
  if (typeof x !== 'object' || x === null) return false
  const o = x as Record<string, unknown>
  return typeof o.foco === 'string' && typeof o.inactivo === 'number'
}

async function presencia($: EngineInterface): Promise<Presencia | null> {
  try {
    const r = await $.process.run(
      [POWERSHELL, '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', `${$.plugin.root}/scripts/presencia.ps1`],
      { timeoutMs: 15_000 },
    )
    if (r.exitCode !== 0) return null
    const datos: unknown = JSON.parse(r.stdout.trim())
    return esPresencia(datos) ? datos : null
  } catch {
    return null
  }
}

// ---------- el chat que avisa ----------

/** La sesión tal como la conoce la app de escritorio: su id `local_…` (para el clic) y su título. */
type Chat = { id: string; titulo: string }

function esChat(x: unknown): x is Chat {
  if (typeof x !== 'object' || x === null) return false
  const o = x as Record<string, unknown>
  return typeof o.id === 'string' && typeof o.titulo === 'string'
}

/** Lee el id y el título del chat de los metadatos de la app; null si no está (p. ej. una sesión de terminal). */
async function chatActual($: EngineInterface): Promise<Chat | null> {
  try {
    const cli = await $.session.id()
    const r = await $.process.run(
      [POWERSHELL, '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', `${$.plugin.root}/scripts/sesion.ps1`, '-Cli', cli],
      { timeoutMs: 15_000 },
    )
    if (r.exitCode !== 0) return null
    const datos: unknown = JSON.parse(r.stdout.trim() || '{}')
    return esChat(datos) ? datos : null
  } catch {
    return null
  }
}

// ---------- los avisos ----------

async function lanzarAviso($: EngineInterface, texto: string, detalle: string): Promise<void> {
  const raiz = $.plugin.root
  const chat = await chatActual($)
  void $.process
    .run(
      [
        POWERSHELL, '-NoProfile', '-ExecutionPolicy', 'Bypass', '-STA',
        '-File', `${raiz}/scripts/aviso.ps1`,
        '-Texto', texto,
        '-Detalle', detalle,
        '-Titulo', chat?.titulo ?? '',
        '-Sesion', chat?.id ?? '',
        '-Sonido', `${raiz}/scripts/campanita.wav`,
      ],
      // Con el cursor encima la mascota se detiene: puede quedar hasta 2 min en pantalla.
      { timeoutMs: 150_000 },
    )
    .catch(() => undefined)
}

async function avisarDiscord($: EngineInterface, e: Espera, ahora: number): Promise<boolean> {
  const url = webhookDiscord
  if (!url) return false
  const minutos = Math.round((ahora - e.hecha) / 60_000)
  // Se nombra por el título del chat, o por su carpeta si no lo hay (p. ej. en una terminal).
  const chat = await chatActual($)
  const cwd = await $.session.cwd()
  const carpeta = cwd.split(/[\\/]/).filter(Boolean).pop() ?? cwd
  const donde = chat?.titulo ? `el chat «${chat.titulo}»` : `la sesión de «${carpeta}»`
  const cuerpo = {
    username: 'Claude Code',
    content: `⏳ Claude te espera hace ${minutos} min en ${donde}.\n> ${e.pregunta || 'Te dejó una pregunta.'}`,
  }
  try {
    const r = await $.http.fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(cuerpo),
    })
    return r.ok
  } catch {
    return false
  }
}

// ---------- la revisión cada 15 s ----------

async function revisar($: EngineInterface): Promise<void> {
  if (revisando) return
  revisando = true
  try {
    const e = await read($, espera)
    if (!e || (await read($, pausa))) return
    const ahora = await $.clock.now()

    // Escribiendo en la caja: está atendiendo.
    const borrador = await $.prompt.read()
    if (borrador.text.trim()) {
      await update($, espera, x => (x ? { ...x, desde: ahora } : x))
      return
    }
    // La app de Claude al frente y con actividad reciente: está leyendo.
    const p = await presencia($)
    if (p && p.foco.toLowerCase() === 'claude' && p.inactivo < ATENDIENDO_S) {
      await update($, espera, x => (x ? { ...x, desde: ahora } : x))
      return
    }

    const sinAtender = ahora - e.desde
    if (e.avisos === 0 && sinAtender >= PRIMER_AVISO_MS) {
      await update($, espera, x => (x ? { ...x, avisos: 1 } : x))
      await lanzarAviso($, 'Oye, te dejé una pregunta 👀', e.pregunta)
    } else if (e.avisos === 1 && sinAtender >= SEGUNDO_AVISO_MS) {
      await update($, espera, x => (x ? { ...x, avisos: 2 } : x))
      await lanzarAviso($, 'Sigo esperando tu respuesta', e.pregunta)
    }
    if (!e.discord && sinAtender >= DISCORD_MS) {
      const enviado = await avisarDiscord($, e, ahora)
      if (enviado) await update($, espera, x => (x ? { ...x, discord: true } : x))
    }
  } finally {
    revisando = false
  }
}

// ---------- los hooks ----------

export const register: Register = (on, options) => {
  // Solo se acepta un webhook de Discord por https: cualquier otra cosa deja el aviso por Discord apagado.
  const url = typeof options.discordWebhook === 'string' ? options.discordWebhook.trim() : ''
  webhookDiscord = /^https:\/\/(discord|discordapp)\.com\/api\/webhooks\//.test(url) ? url : ''

  on('session.start', async ($, ev, next) => {
    const started = await next(ev)
    await $.command.register({
      name: 'espera-probar',
      description: 'Muestra ahora el aviso animado de «te dejé una pregunta», para probarlo',
    })
    await $.command.register({
      name: 'espera-pausa',
      description: 'Pausa o reanuda los avisos de «Claude te espera» en esta sesión',
    })
    $.clock.every(CADA_MS, () => {
      void revisar($)
    })
    return started
  })

  on('tool.call', { tool: 'mcp__ccd_turn__wrap_up' }, async ($, ev, next) => {
    const resultado = await next(ev)
    if (!ev.agentId && ev.tool === 'mcp__ccd_turn__wrap_up' && ev.ask?.trim()) {
      preguntaDelRecuadro = limpiar(ev.ask)
    }
    return resultado
  }).catch(($, ev, next) => next(ev))

  on('tool.call', { tool: 'AskUserQuestion' }, async ($, ev, next) => {
    const resultado = await next(ev)
    if (!ev.agentId && ev.tool === 'AskUserQuestion') {
      const primera = ev.questions[0]?.question ?? ''
      if (primera.trim()) preguntaDelRecuadro = limpiar(primera)
    }
    return resultado
  }).catch(($, ev, next) => next(ev))

  on('turn.complete', async ($, ev, next) => {
    const resultado = await next(ev)
    if (ev.agentId || ev.reason !== 'answer') return resultado
    const pregunta = preguntaDelRecuadro || preguntaDe(ev.answer)
    preguntaDelRecuadro = ''
    if (pregunta) {
      const ahora = await $.clock.now()
      await update($, espera, () => ({ desde: ahora, hecha: ahora, pregunta, avisos: 0, discord: false }))
    }
    return resultado
  })

  on('prompt.submit', async ($, ev, next) => {
    // Nunca frena el prompt: si borrar la espera falla, el mensaje igual sale.
    if (esTuyo(ev.origin.kind)) {
      preguntaDelRecuadro = ''
      await update($, espera, () => null).catch(() => undefined)
    }
    return next(ev)
  }).catch(($, ev, next) => next(ev))

  on('command.run', { command: 'espera-probar' }, async $ => {
    await lanzarAviso($, 'Prueba: así te aviso 👀', 'Cuando te deje una pregunta y no contestes en 2 minutos')
    return {
      text: 'Aviso de prueba lanzado: la mascota cruza a saltos la parte de abajo de la pantalla. Clic: abre este chat.',
    }
  })

  on('command.run', { command: 'espera-pausa' }, async $ => {
    const ahora = !(await read($, pausa))
    await update($, pausa, () => ahora)
    return { text: ahora ? 'Avisos de «Claude te espera» en pausa.' : 'Avisos de «Claude te espera» activos.' }
  })
}
