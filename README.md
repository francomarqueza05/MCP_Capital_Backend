# Cordada

Cordada es nuestra propuesta para la hackathon Sherpas x UPV ("Bring the plan to life"). Convierte el análisis financiero de Sherpas en una montaña que se sube con Cordi, una guía que explica cada parte del plan con su propia voz y con gráficos que se construyen mientras habla.

- **La montaña.** Cada tema del análisis es un campamento con su bandera. En la intro se dibujan la montaña y la ruta. Después se puede seguir la visita guiada o tocar cualquier bandera.
- **"Explícame esto".** Cordi explica el campamento paso a paso, cada paso con su gráfico. Hay dos modos que se cambian en cualquier momento:
  - **llamada** (por defecto): conversación por voz en vivo;
  - **chat**: la conversación escrita, para releerla.
- **Las cifras** salen solo de los datos de cada caso. Ni la guía ni ningún modelo inventa números.

## Arrancarlo

Node 22 o superior.

```bash
npm install
cp .env.example .env   # rellena las claves
npm run dev            # http://localhost:3100
```

- `?case=<id>` abre directamente una familia. Los ids son `daniel-emily-johnson`, `michael-carter`, `samantha-lewis` y `timothy-melanie-weah`.
- Comprobación de tipos: `npm run typecheck`. Versión de producción: `npm run build` y luego `npm start`.

## Claves (`.env`)

| Variable | Para qué |
|---|---|
| `LLM_PROXY_URL`, `TEAM_KEY` | Proxy de IA de Sherpas: chat, comentarios de Cordi, sugerencias y voz de las narraciones |
| `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID` | Agente de voz en vivo de ElevenLabs, y voz de reserva para las narraciones |
| `VOICE_ID` | Voz de Cordi |

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
