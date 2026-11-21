/** Una pregunta de Claude que todavía no contestas. */
export type Espera = {
  /** Desde cuándo cuenta el tiempo sin atender: se reinicia mientras escribes o miras la app. */
  desde: number
  /** Cuándo se hizo la pregunta, para el mensaje de Discord. */
  hecha: number
  /** La pregunta, recortada, para el globo y para Discord. */
  pregunta: string
  /** Cuántos avisos animados ya se mostraron (máximo 2). */
  avisos: number
  /** Si ya se mandó el aviso por Discord. */
  discord: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'aviso-espera': {
      espera: Shaped<Espera | null>
      pausa: Shaped<boolean>
    }
  }
}
