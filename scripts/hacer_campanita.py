"""Genera campanita.wav: dos notas suaves con caída exponencial, a volumen de voz. Solo stdlib."""
import math
import struct
import sys
import wave
from pathlib import Path

TASA = 44100
SALIDA = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).with_name("campanita.wav")


def nota(frecuencia: float, segundos: float, volumen: float) -> list[float]:
    n = int(TASA * segundos)
    muestras = []
    for i in range(n):
        t = i / TASA
        envolvente = math.exp(-5.5 * t) * min(1.0, t / 0.008)  # ataque de 8 ms para que no haga clic
        tono = math.sin(2 * math.pi * frecuencia * t) + 0.25 * math.sin(2 * math.pi * 2 * frecuencia * t)
        muestras.append(volumen * envolvente * tono / 1.25)
    return muestras


def main() -> None:
    # A 0.16/0.13 quedaba en −30 LUFS y casi no se oía.
    # Ahora ronda el nivel de los audios de voz (−19 LUFS) con pico cerca de −6 dBFS.
    a = nota(1046.5, 0.55, 0.55)  # do6
    b = nota(1568.0, 0.75, 0.45)  # sol6
    silencio = [0.0] * int(TASA * 0.09)
    total = a + silencio + b
    with wave.open(str(SALIDA), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(TASA)
        w.writeframes(b"".join(struct.pack("<h", int(max(-1.0, min(1.0, s)) * 32767)) for s in total))
    print(SALIDA)


if __name__ == "__main__":
    main()
