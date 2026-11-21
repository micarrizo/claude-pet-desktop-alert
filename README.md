<p align="center">
  <img src="assets/mascota.svg" alt="Hoppy, the pixel pet" width="144">
</p>

<h1 align="center">Hoppy 🐸</h1>

<p align="center"><b>The tiny pixel pet that lets you know when Claude is waiting for you.</b><br>
A Claude Code mod for Windows.</p>

---

Ten Claude chats open and no idea which one is waiting on you? Hoppy knows.

When Claude leaves you a question and you don't answer, after 2 minutes a little orange critter
shows up and **hops** across the bottom of your screen with a speech bubble:

```
💬 Fix the login page
Hey, I left you a question 👀
Should I go with option A or B?
click: open chat · right-click: close · hover: pause
```

- 🐸 **It hops, it doesn't walk.** Hoppy sits still between hops, so you can actually read the bubble.
- 🏷️ **It tells you which chat:** the conversation's title sits at the top of the bubble.
- 🖱️ **One click and you're there:** it opens that chat in the Claude desktop app and highlights it in the sidebar.
- ✋ **Hover to pause.** Right-click and Hoppy leaves.
- 🔔 A soft two-note chime (no alarms, promise).
- 🌎 Speaks English and Spanish.

## When does Hoppy show up?

| Time without attention | What happens |
|---:|---|
| 2 min | First hop across the screen: "Hey, I left you a question 👀" |
| 6 min | Second nudge: "Still waiting for your answer" |
| 10 min | A Discord message, only if you set up a webhook (optional) |

The timer resets while you type in the chat box, or while the Claude app is in front and you're
using the keyboard or mouse. If you're reading, Hoppy leaves you alone.

A "question" is the one Claude leaves in the app's prompt box at the end of a turn, an
`AskUserQuestion`, or a sentence ending in "?" at the end of Claude's reply. As soon as you
answer, Hoppy forgets about it.

## Install

You need **Windows 10 or 11** (Hoppy uses PowerShell and WPF, both built into Windows) and
Claude Code. The click-to-open-the-chat part works with the **Claude desktop app** (Code tab).

At the prompt of a terminal session of Claude Code:

```
/plugin install hoppy --marketplace micarrizo/claude-pet-desktop-alert
```

Answer `y` to add the marketplace and pick a scope ("user" puts Hoppy in all your sessions).

From a shell:

```
claude plugin install hoppy --marketplace micarrizo/claude-pet-desktop-alert
```

In the desktop app, where `/plugin` doesn't run: click **+** next to the prompt box →
**Plugins** → **Add marketplace** with `micarrizo/claude-pet-desktop-alert` → **Add plugin**.

## Try it

| Command | What it does |
|---|---|
| `/hoppy-test` | Sends Hoppy across your screen right now, with this chat's title |
| `/hoppy-snooze` | Snoozes or wakes Hoppy's alerts in this chat |

## Options

Set them in the plugins config menu:

| Option | Default | What it does |
|---|---|---|
| `language` | `en` | Bubble and messages in English (`en`) or Spanish (`es`) |
| `discordWebhook` | *(empty)* | Optional Discord webhook for the 10-minute ping |

To get the Discord ping on your phone, create a webhook in a Discord channel of yours
(*Edit Channel → Integrations → Webhooks*) and paste it into `discordWebhook`. It's stored as a
secret, and only `https://discord.com/api/webhooks/...` URLs are accepted.

## How it works

| Piece | What it does |
|---|---|
| `hooks/register.tsx` | Spots Claude's questions, tracks how long you've been away and sends Hoppy |
| `scripts/aviso.ps1` | Hoppy himself: a transparent, always-on-top WPF window that hops left to right |
| `scripts/sesion.ps1` | Finds the chat's id and title in the Claude app's local data |
| `scripts/presencia.ps1` | Checks which app is in front and how long since your last key press or mouse move |
| `scripts/hacer_campanita.py` | Builds `campanita.wav`, the chime (Python standard library only) |

The click opens `claude://code/continue?session=<chat id>`, a link the Claude desktop app already
knows how to handle.

### Privacy

Everything happens on your computer. Hoppy reads the session metadata the Claude app keeps
locally, only to get the chat's title. Nothing is sent anywhere, except the Discord message if
you set up a webhook yourself.

## Make it yours

- Alert timings: the constants at the top of `hooks/register.tsx`.
- Pet size, hop height and length, and how long Hoppy rests: `$px`, `$ALTURA`, `$PASO` and `$DESCANSO` in `scripts/aviso.ps1`.
- A different chime: change the notes in `scripts/hacer_campanita.py` and run `python scripts/hacer_campanita.py`.

> The code comments are in Spanish: Hoppy was born in Chile 🇨🇱.

## Development

```
claude plugin validate .
claude plugin test .
```

## License

MIT. Use it, tweak it, and pass it on to a friend who also lives with twenty chats open. 🧡
