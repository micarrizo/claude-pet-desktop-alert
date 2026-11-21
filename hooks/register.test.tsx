import { expect, test } from 'claude-code/testing'

const COMANDO = {
  args: '',
  origin: { kind: 'composer' },
  presentation: { isFullscreen: false, columns: 100 },
} as const

const FIN = { durationMs: 1000, isAborted: false, reason: 'answer' } as const

type Cuerpo = Extract<Parameters<typeof test>[1], (...args: never[]) => unknown>
type On = Parameters<Cuerpo>[1]

/** Motor mínimo para el ciclo de una pregunta: reloj fijo y registro de lo que el mod guarda en `espera`. */
function motor(on: On): unknown[] {
  const escrito: unknown[] = []
  on('command.register', () => ({ value: { command: 'ok' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('clock.every', () => ({ value: undefined }))
  on('clock.now', () => ({ value: 1_000_000 }))
  on('tool.call', () => ({ result: {} }))
  on('turn.complete', () => ({ text: '' }))
  on('state.set', async (_, e, next) => {
    if (e.key === 'espera') escrito.push(e.value)
    return next(e)
  })
  return escrito
}

test('hoppy-snooze alterna entre dormido y despierto', async ($, on) => {
  on('command.register', () => ({ value: { command: 'ok' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const primera = await $.command.run({ ...COMANDO, command: 'hoppy-snooze' })
  expect(primera.text).toContain('snoozing')
  const segunda = await $.command.run({ ...COMANDO, command: 'hoppy-snooze' })
  expect(segunda.text).toContain('awake')
})

test('la pregunta del recuadro (wrap_up ask) deja a Claude esperando aunque el mensaje no tenga «?»', async ($, on) => {
  const escrito = motor(on)

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'mcp__ccd_turn__wrap_up', recap: 'Listo.', ask: '¿Aplico la A y la B?' })
  await $.turn.complete({ ...FIN, turnId: 't1', answer: 'Hice el cambio. La recomendación es la A.' })

  expect(JSON.stringify(escrito.at(-1))).toContain('Aplico la A y la B')
})

test('un turno sin pregunta en el recuadro ni «?» no deja espera', async ($, on) => {
  const escrito = motor(on)

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'mcp__ccd_turn__wrap_up', recap: 'Listo.' })
  await $.turn.complete({ ...FIN, turnId: 't2', answer: 'Hecho, nada pendiente.' })

  expect(escrito.length).toBe(0)
})

test('hoppy-test pasa el título y el id del chat (local_…) a la mascota', async ($, on) => {
  const lanzados: string[][] = []
  on('command.register', () => ({ value: { command: 'ok' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('clock.every', () => ({ value: undefined }))
  on('session.id', () => ({ value: '11111111-2222-3333-4444-555555555555' }))
  on('process.run', (_, e) => {
    const argv = [...e.argv]
    const salida = argv.some(a => a.endsWith('sesion.ps1'))
      ? '{"id":"local_aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee","titulo":"Arreglar el login"}'
      : ''
    if (argv.some(a => a.endsWith('aviso.ps1'))) lanzados.push(argv)
    return { value: { exitCode: 0, stdout: salida, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const r = await $.command.run({ ...COMANDO, command: 'hoppy-test' })

  expect(r.text).toContain('open this chat')
  const argv = lanzados[0] ?? []
  expect(argv[argv.indexOf('-Titulo') + 1]).toBe('Arreglar el login')
  expect(argv[argv.indexOf('-Sesion') + 1]).toBe('local_aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')
})

test('sin metadatos de la app (sesión de terminal) la mascota sale igual, sin título ni id', async ($, on) => {
  const lanzados: string[][] = []
  on('command.register', () => ({ value: { command: 'ok' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('clock.every', () => ({ value: undefined }))
  on('session.id', () => ({ value: 'zzzzzzzz-0000' }))
  on('process.run', (_, e) => {
    const argv = [...e.argv]
    if (argv.some(a => a.endsWith('aviso.ps1'))) lanzados.push(argv)
    return { value: { exitCode: 0, stdout: '{}', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run({ ...COMANDO, command: 'hoppy-test' })

  const argv = lanzados[0] ?? []
  expect(argv[argv.indexOf('-Titulo') + 1]).toBe('')
  expect(argv[argv.indexOf('-Sesion') + 1]).toBe('')
})

test('con language = es, Hoppy habla español (globo y pie)', { options: { language: 'es' } }, async ($, on) => {
  const lanzados: string[][] = []
  on('command.register', () => ({ value: { command: 'ok' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('clock.every', () => ({ value: undefined }))
  on('session.id', () => ({ value: '11111111-2222-3333-4444-555555555555' }))
  on('process.run', (_, e) => {
    const argv = [...e.argv]
    if (argv.some(a => a.endsWith('aviso.ps1'))) lanzados.push(argv)
    return { value: { exitCode: 0, stdout: '{}', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const r = await $.command.run({ ...COMANDO, command: 'hoppy-test' })

  expect(r.text).toContain('Hoppy va en camino')
  const argv = lanzados[0] ?? []
  expect(argv[argv.indexOf('-Texto') + 1]).toBe('Prueba: así te aviso 👀')
  expect(argv[argv.indexOf('-Idioma') + 1]).toBe('es')
})
