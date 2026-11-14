# Cordada API

Backend de **Cordada**, nuestra propuesta para la hackathon Sherpas x UPV ("Bring the plan to life"): una guía por voz que acompaña a una familia por su plan financiero de Sherpas y después la ayuda a avanzar con un único siguiente paso cada vez.

El front está en otro repositorio ([MCP_Capital](https://github.com/francomarqueza05/MCP_Capital)) y habla con esta API por HTTP.

## Arrancarlo

Node 22 o superior.

```bash
npm install
cp .env.example .env   # rellena las claves
npm run dev            # http://localhost:8787
```

- Documentación de la API (se puede probar cada llamada desde el navegador): http://localhost:8787/docs
- Documento OpenAPI: http://localhost:8787/openapi.json
- Tests: `npm test`. Comprobación de tipos: `npm run typecheck`.
- Benchmarks de modelos: `npm run bench` (ver [bench/README.md](bench/README.md)).

Sin `DATABASE_URL`, la API arranca un Postgres embebido (PGlite) en `./.data`, así que funciona sin configurar nada. Con `DATABASE_URL` (Neon, Supabase…) usa un Postgres alojado; el esquema es el mismo y las migraciones se aplican al arrancar.

## Cómo funciona

1. **Motor de fases** (`src/engine`). El código, no el modelo de lenguaje, decide qué se cuenta y en qué orden: descubrimiento, dónde estás, lo que más destaca, la tensión, el camino por delante, el primer paso y el compromiso. La preocupación de la familia decide el foco. Cada fase es un *paquete*: su objetivo, las únicas cifras que la guía puede decir, las palabras del propio plan, un visual, cuándo se da por terminada y un guion de reserva.
2. **Voz en vivo** (agente de ElevenLabs, que abre el front). El agente solo habla. Cuando termina una fase llama a su herramienta `phase_done`; el front la reenvía a `POST /v1/sessions/{id}/phase-done` y el motor responde con la fase siguiente. Las preguntas fuera de guion pasan por `lookup`.
3. **Cifras**: salen solo de los datos etiquetados del plan (`key_metrics.facts` de cada caso), así que la guía no puede inventar números. Un test comprueba cada cifra de cada paquete contra el plan.
4. **Español por defecto**, con inglés disponible. Lo que ve la familia se traduce una vez y se guarda; si una traducción cambia alguna cifra, se descarta.
5. **Seguimiento**: metas con avances, un siguiente paso y un resumen para el asesor.

## Para el front

Todas las llamadas, salvo `/v1/topics` y `/v1/demo/households`, necesitan el token de la persona: `Authorization: Bearer <token>`. En la demo, los tokens salen de `GET /v1/demo/households`; en el producto, cada persona recibe un enlace personal de su asesor.

Una llamada en vivo:

```ts
const view = await api("POST /v1/sessions", { lang: "es" });          // persona, packet, agentBrief
const { signedUrl } = await api("POST /v1/voice/agent-session");
conversation.startSession({
  signedUrl,
  connectionType: "websocket",             // envía el tiempo de cada letra: subtítulos exactos
  overrides: { agent: { language: "es" } },
  dynamicVariables: { name, language_name, household, level, worry, motivation, decision_style, previous_conversation, phase_brief: view.agentBrief },
  clientTools: {
    phase_done: async (p) => (await api(`POST /v1/sessions/${view.session.id}/phase-done`, mapped(p))).agentBrief ?? "END ...",
    lookup: async ({ topic }) => format(await api(`GET /v1/lookup?topic=${topic}`)),
  },
});
```

### Bloques: el director decide, el front dibuja

El catálogo de bloques de la biblioteca del front (`web/components/blocks/registry.tsx`) vive también aquí, sin la parte visual, en `src/director/catalog.ts`. El **director** (`src/director/director.ts`) elige qué bloques salen en cada fase, en qué orden y a qué profundidad, para esta familia y esta persona:

- Cada fase tiene una escalera de 3 niveles: 1 (la idea, en claro), 2 (lo que recibe quien pide más), 3 (el detalle y el análisis del propio plan).
- La fase "lo que más destaca" usa la escalera del tema principal: su preocupación primero, si no el riesgo más grave del plan (O1…).
- Un experto empieza un nivel más abajo; cada "cuéntame más" baja un nivel (hasta dos veces); si no entiende, se le vuelve a contar una vez con bloques más sencillos (`hundred`, `card-bite`, `terms`…).
- Las parejas ven bloques para dos personas (`family-lanes`, `who-holds`, `risk-spectrum`, `account-returns`). Ningún bloque se repite en la conversación.

Cada paquete trae `packet.steps`: la lista ordenada de bloques con `block` (id del catálogo), `depth` (`plain` o `detailed`), `level`, `say` (lo que dice la guía, ya en el idioma de la familia) y `who`.

| Llamada | Para qué |
|---|---|
| `GET /v1/plan` | Todas las cifras que dibujan los bloques (el mismo objeto que construía `buildPlan` en el front) |
| `GET /v1/catalog` | Secciones y bloques que el director puede elegir |

El agente tiene una herramienta nueva, **`show_block({ block })`**: la llama justo antes de hablar de cada bloque. El front, al recibirla, muestra ese bloque. Así voz y pantalla van a la vez.

Mientras la guía habla, muestra el bloque activo de `packet.steps` y `packet.ask[].chips` como respuestas pulsables. `packet.visual` (y `GET /v1/visuals/ridge`) se mantienen para la pantalla anterior.

## Estructura

```
src/
  app.ts          rutas, validación, OpenAPI
  api/            autenticación, esquemas (el contrato), servicio
  engine/         motor de fases, temas, lookup, formato de cifras
  cases/          carga los cuatro casos de Sherpas desde ./cases
  director/       catálogo de bloques (compartido con el front) y director de fases
  plan/           todas las cifras del plan para dibujar bloques (buildPlan)
  i18n/           español para la pantalla, instrucciones para el agente
  llm/            router de modelos sobre el proxy de Sherpas (niveles con respaldo)
  voice/          ElevenLabs: URL de sesión del agente, voz con caché
  store/          Postgres / PGlite, migraciones, consultas por persona
scripts/agent.ts  crea o actualiza el agente de ElevenLabs desde código (npm run agent)
bench/            benchmarks de calidad, tiempo y precio de los modelos
cases/            las cuatro familias sintéticas del repositorio de la hackathon
```

## Seguridad

- Los enlaces personales son pares `(familia, persona)` firmados con HMAC; cada consulta filtra por ellos, así que nadie puede leer la conversación ni las metas de otra persona (cubierto por tests).
- `APP_SECRET` es obligatorio en producción. Las claves se quedan en el servidor; el agente de ElevenLabs es privado y solo se abre con una URL firmada por esta API.
