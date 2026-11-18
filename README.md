# Cordada

Our entry for the Sherpas x UPV hackathon ("Bring the plan to life"). Cordada turns a family's Sherpas plan into a mountain they climb with **Cordi**, a guide that explains each part in its own voice, with charts that build while it talks, and that ends with the family committing to their first step.

- **The mountain.** Each topic of the analysis is a camp with a flag. The intro draws the mountain and the route; then the guided tour, or any flag.
- **"Explain this to me".** Cordi explains the camp step by step, each step with its chart: on a live **call** you can interrupt (default) or in the **chat**, switchable any time. "I don't get it" says it again more simply.
- **The summit is a commitment.** Pick the first step, see what it changes in your life, do it in small steps, choose a date, and both partners say "I'm in". It goes into your calendar.
- **The days after.** Cordi remembers. On the way back: "It's been 30 days. Did you do it?" A yes gets the new score and the next step; a "not yet" gets asked why and gets something smaller for today.
- **English by default, Spanish as an option** (EN/ES switch, or `?lang=es`).
- **Every figure comes from the case data.** Neither Cordi nor any model invents numbers.
- **It never gets stuck.** Without AI, voice or microphone it carries on (recorded lines, local call, chat), and "Continue" always works.

What we built and why: [docs/entrega.md](docs/entrega.md). The 2-minute script: [docs/pitch.md](docs/pitch.md).

## Run it

Node 22 or later.

```bash
npm install
cp .env.example .env   # fill in the keys
npm run dev            # http://localhost:3100
```

| Link | What it does |
|---|---|
| `?case=<id>` | Opens a family: `daniel-emily-johnson`, `michael-carter`, `samantha-lewis`, `timothy-melanie-weah` |
| `?lang=es` | Spanish (English is the default) |
| `?days=30` | Demo clock: as if the family came back 30 days later (Shift+T adds 3 days) |
| `?reset=1` | Forgets what this browser remembers about the family |

Type check: `npm run typecheck`. Production: `npm run build`, then `npm start`.

## Keys (`.env`)

| Variable | What for |
|---|---|
| `LLM_PROXY_URL`, `TEAM_KEY` | Sherpas AI proxy: chat, Cordi's remarks, suggestions and the narration voice |
| `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID` | ElevenLabs live voice agent (Spanish), and fallback voice |
| `ELEVENLABS_AGENT_ID_EN` | Optional: the English live agent (without it, the Spanish agent runs in English) |
| `VOICE_ID`, `VOICE_ID_EN` | Cordi's voice; `VOICE_ID_EN` is an optional native English voice |

## Cómo está hecho

La arquitectura completa, con los flujos, la sincronización de voz y gráficos y quién paga qué, está en [docs/arquitectura.md](docs/arquitectura.md).

```
app/                    layout, página, globals.css (tokens y estilos)
app/api/                rutas del servidor: agent/session y agent/tool (agente en vivo),
                        ask, remark y suggest (IA del chat), tts (voz), status
src/Experience.tsx      pantalla de inicio, barra superior y la expedición
src/intro/              selector de perfil
src/expedition/         la subida: geometría (world.ts), pintor del canvas (render.ts),
                        campamentos a partir del caso (steps.ts), cámara y visita guiada
                        (Expedition.tsx), panel del campamento (Detail.tsx)
src/explain/            "Explícame esto": reproductor (player.ts), escenario y controles
                        (ExplainUI.tsx), pasos de cada campamento (beats.ts), gráficos (Visual.tsx)
src/dashboard/scenes/   una escena interactiva por tema
src/stage/              la llamada (call.ts y agent.ts), el chat, la burbuja de Cordi
src/orb/                Cordi: emociones, física de cuerpo blando y efectos
src/ai/                 cliente de las rutas de IA
src/server/             código solo de servidor: claves, instrucciones del agente, mapa
src/data/               datos de los casos y manifiestos de voz y sonidos (JSON)
src/lib/                audio, textos y formato de cifras, store mínimo
public/audio/           narraciones y efectos ya grabados
docs/                   el flujo de escenas (matriz-escenas.md) y los benchmarks de modelos
```

- **La montaña** se pinta entera en un canvas en cada fotograma.
- **Cordi** vive en coordenadas del mundo con su propio muelle, así que la cámara se mueve libremente a su alrededor.
- **En la llamada en vivo**, el agente mueve los gráficos con la herramienta `show_block`. Los avances ("Seguimos", "vamos") los hace la app, así que pantalla y voz nunca se desincronizan.

## Historia

El primer backend (una API Hono con un motor de fases), el prototipo en un solo HTML y los scripts que generaron los datos de los casos están en el tag de git `legacy-backend`. Los resultados de los benchmarks que eligieron los modelos están en [docs/benchmarks](docs/benchmarks/README.md).
