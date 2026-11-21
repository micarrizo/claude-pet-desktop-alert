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

// ---------- textos (opción `language`: en | es) ----------

type Idioma = 'en' | 'es'
let idioma: Idioma = 'en'

const TEXTOS = {
  en: {
    primero: 'Hey, I left you a question 👀',
    segundo: 'Still waiting for your answer',
    prueba: 'Test: this is how I nudge you 👀',
    pruebaDetalle: "When I leave you a question and you don't answer within 2 minutes",
    lanzado: 'Hoppy is on its way: it hops across the bottom of your screen. Click it to open this chat.',
    pausado: 'Hoppy is snoozing in this chat.',
    activo: 'Hoppy is awake again in this chat.',
    sinPregunta: 'You have a pending question.',
    discord: (min: number, donde: string) => `⏳ Claude has been waiting for ${min} min in ${donde}.`,
    chat: (t: string) => `the chat “${t}”`,
    carpeta: (c: string) => `the session in “${c}”`,
  },
  es: {
    primero: 'Oye, te dejé una pregunta 👀',
    segundo: 'Sigo esperando tu respuesta',
    prueba: 'Prueba: así te aviso 👀',
    pruebaDetalle: 'Cuando te deje una pregunta y no contestes en 2 minutos',
    lanzado: 'Hoppy va en camino: cruza a saltos la parte de abajo de tu pantalla. Clic: abre este chat.',
    pausado: 'Hoppy está durmiendo en este chat.',
    activo: 'Hoppy despertó en este chat.',
    sinPregunta: 'Te dejó una pregunta.',
    discord: (min: number, donde: string) => `⏳ Claude te espera hace ${min} min en ${donde}.`,
    chat: (t: string) => `el chat «${t}»`,
    carpeta: (c: string) => `la sesión de «${c}»`,
  },
} as const

const txt = () => TEXTOS[idioma]

const espera = atom({ plugin: 'hoppy', key: 'espera' } as const, null as Espera | null, {
  shape: 'espera-1',
})
const pausa = atom({ plugin: 'hoppy', key: 'pausa' } as const, false, { shape: 'pausa-1' })

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
        '-Idioma', idioma,
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
  const donde = chat?.titulo ? txt().chat(chat.titulo) : txt().carpeta(carpeta)
  const cuerpo = {
    username: 'Hoppy',
    content: `${txt().discord(minutos, donde)}\n> ${e.pregunta || txt().sinPregunta}`,
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
      await lanzarAviso($, txt().primero, e.pregunta)
    } else if (e.avisos === 1 && sinAtender >= SEGUNDO_AVISO_MS) {
      await update($, espera, x => (x ? { ...x, avisos: 2 } : x))
      await lanzarAviso($, txt().segundo, e.pregunta)
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
  idioma = options.language === 'es' ? 'es' : 'en'

  on('session.start', async ($, ev, next) => {
    const started = await next(ev)
    await $.command.register({
      name: 'hoppy-test',
      description: 'Send Hoppy across your screen right now, to see how the alert looks',
    })
    await $.command.register({
      name: 'hoppy-snooze',
      description: "Snooze or wake Hoppy's alerts in this chat",
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

  on('command.run', { command: 'hoppy-test' }, async $ => {
    await lanzarAviso($, txt().prueba, txt().pruebaDetalle)
    return { text: txt().lanzado }
  })

  on('command.run', { command: 'hoppy-snooze' }, async $ => {
    const ahora = !(await read($, pausa))
    await update($, pausa, () => ahora)
    return { text: ahora ? txt().pausado : txt().activo }
  })
}
