# Benchmarks de modelos

> Archivo. El código de estos benchmarks (`bench/`, `npm run bench`) se quedó en el tag de git `legacy-backend`. Aquí solo se guardan los resultados que eligieron los modelos que usa la app.

Elegimos los modelos midiendo, no por su nombre. Cada tarea que usa un modelo de lenguaje se mide en **calidad, tiempo y precio**, con las mismas entradas que usa producción.

```bash
npm run bench                       # las tres
npm run bench -- translate brief    # solo algunas
BENCH_REPS=3 npm run bench -- agent # más repeticiones
BENCH_AGENT_MODELS=gemini-3.5-flash,gpt-5.4-mini npm run bench -- agent
```

Los resultados se guardan en `bench/results/<fecha>.md` (tablas) y `.json` (todo, con transcripciones de ejemplo).

## Qué se mide

| Tarea | Entradas | Calidad | Tiempo | Precio |
|---|---|---|---|---|
| **Traducción** (texto de pantalla a español de España) | Cada paquete de fase de una conversación completa, los 4 casos, por lotes como en producción | Cifras intactas (automático), vocabulario latinoamericano (automático), fidelidad y naturalidad de 1 a 5 (juez) | Por lote, p50/p95 | Tokens x precio del proxy |
| **Resumen para el asesor** | Una conversación terminada por caso: preocupación, lo que no entendió, el paso, cifras del plan | Cifras inventadas (automático), menciona la preocupación (automático), fiel / útil / español de 1 a 5 (juez) | Por resumen, p50/p95 | Tokens x precio del proxy |
| **LLM del agente en vivo** | Una llamada con guion de 5 turnos con Michael por el WebSocket real; nuestro motor responde a `phase_done` y `lookup` | Uso de herramientas, cifras inventadas (automático), fiel / español de España / estilo hablado / límites de consejo / avance de 1 a 5 (juez) | Primer token y respuesta completa por turno, más la métrica del servidor de ElevenLabs | `llm_price` de ElevenLabs por conversación |

El agente en vivo se mide con un agente aparte, **"Cordada bench"**, en modo solo texto: no gasta créditos de voz y solo cambia el modelo. La voz añade unos ~0,55 s casi constantes hasta el primer audio.

## Límites

- El juez es `gpt-5-mini`, que también es candidato en las tareas del proxy. Puede puntuarse a sí mismo con generosidad; las comprobaciones automáticas no.
- El agente suele decir las cifras con palabras ("treinta mil"), que la comprobación automática de números no lee; eso lo cubre el juez.
- Dos repeticiones por defecto: sirven para ordenar los modelos, no para percentiles finos.
