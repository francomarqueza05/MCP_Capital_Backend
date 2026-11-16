# Cómo funciona Cordada: el flujo completo

## 1. La idea en una frase

Sherpas analiza el dinero de una persona y le pone una **etiqueta** a cada tema (por ejemplo: "fondo de emergencia: vulnerable"). Nosotros hacemos **una animación por cada etiqueta posible**. Así, cualquier cliente de Sherpas ve sus problemas explicados con animaciones, aunque nunca lo hayamos visto antes.

## 2. De dónde salen los datos (el MCP de Sherpas)

El MCP es una fuente de datos que nos dio Sherpas. Tiene 4 clientes de ejemplo (inventados):

| Cliente | Quiénes son | Nota de salud financiera |
|---|---|---|
| Johnson | Pareja con 2 hijos | 52 de 100 (vulnerable) |
| Carter | Hombre solo | 26 de 100 (crítica) |
| Lewis | Mujer sola con 2 hijos | 82 de 100 (fuerte) |
| Weah | Pareja con 2 hijos | 60 de 100 (estable) |

De cada cliente nos da 3 informes:

- **Salud financiera**: su nota del 0 al 100 y un análisis de cada tema de su dinero.
- **Inversiones**: cómo tiene invertido su dinero y cómo le está yendo.
- **Persona**: cómo es (edad, familia, cómo toma decisiones, qué le preocupa).

**La clave:** Sherpas no escribe opiniones libres. Para cada tema elige siempre entre **las mismas etiquetas fijas**. Por eso, aunque solo tengamos 4 clientes, sabemos cuáles son todas las situaciones posibles.

## 3. El recorrido del usuario, paso a paso

**Paso 1. Intro.** La escena de la montaña: el yak, la ruta y el amanecer. El orbe nace, se presenta con voz y pregunta si prefieres hablar o escribir. *(Ya está hecha.)*

**Paso 2. Resumen general.** Una sola pantalla que se entiende de un vistazo, sin que la IA hable:

- Arriba, la **nota** (por ejemplo 52/100) dibujada como la altura que lleva recorrida en la montaña.
- En el centro, los **temas del dinero** como tarjetas con gráfico. Cada una tiene un color: verde (bien), amarillo (atención) o rojo (problema).
- A la derecha, un **resumen en texto** con lo más importante.
- Abajo, el botón **"Explícame el resumen"**: el orbe vuela tarjeta por tarjeta, explica cada una y pregunta "¿se entendió?".

**Paso 3. Entender un tema.** Al tocar una tarjeta, esta se agranda y las demás se desenfocan. Se reproduce la **animación de su etiqueta** con los números de esa persona y un texto corto que la explica. Si algo no se entiende, tocas el orbe y le preguntas.

**Paso 4. Las soluciones.** Sherpas trae las soluciones de cada cliente y cuánto le suben la nota. Las mostramos como un **simulador**: activas una solución y ves cómo sube tu nota y el orbe avanza en la montaña. Ejemplo real: si Carter reduce lo que saca cada año de sus ahorros, su nota pasa de 26 a 62.

**Parejas:** en lugar de "tú" se habla de "ustedes", con los nombres de los dos. Donde cada persona tiene lo suyo (por ejemplo, el seguro de vida), se muestra a cada uno por separado.

## 4. Los temas y sus animaciones

Cada tabla lista las etiquetas posibles de un tema y lo que vería el usuario. La columna "¿Quién la tiene?" indica cuál de los 4 clientes de ejemplo cae ahí. Si dice **"ninguno"**, no aparece en los ejemplos, pero hacemos la animación igual para cubrir a todos los clientes.

### 4.1 Nota general

| Etiqueta | ¿Quién la tiene? | Qué ve el usuario |
|---|---|---|
| Crítica | Carter | Está al pie de la montaña. La ruta existe; el tono es de ánimo, no de alarma. |
| Vulnerable | Johnson | Ha empezado a subir y tiene algunos tramos firmes. |
| Estable | Weah | Está a media montaña. |
| Fuerte | Lewis | Está cerca de la cumbre y solo faltan ajustes finos. |

La nota se arma con 5 partes: **ahorro**, **deudas**, **inversiones**, **reserva de dinero** y **seguros**. Se ven como 5 tramos de la ruta.

Además, hay problemas que **frenan la nota** aunque todo lo demás vaya bien. Por ejemplo, una tarjeta de crédito cara, o no tener seguro de vida teniendo hijos. Se ven como una **barrera** en la ruta que se levanta al resolverlo.

### 4.2 ¿Te sobra o te falta dinero cada año?

| Etiqueta | ¿Quién la tiene? | Qué ve el usuario |
|---|---|---|
| Gastas más de lo que entra | Carter, Lewis | Un balde que pierde más agua de la que recibe. |
| Justo, con muchas cosas que pagar | Johnson | El mismo dinero repartido entre metas que tiran de él. |
| Te sobra dinero sin destino | Weah | Dinero quieto que puedes arrastrar hacia una meta. |
| Ahorras poco | Johnson | Una barra con el % del sueldo que ahorras y la nota subiendo al moverla. |

### 4.3 Fondo de emergencia (dinero para imprevistos)

| Etiqueta | ¿Quién la tiene? | Qué ve el usuario |
|---|---|---|
| Vulnerable | Johnson (1,4 meses; debería tener 8–9) | Un paraguas pequeño bajo la lluvia. |
| No alcanza | Carter (3,2 meses; debería tener 5–6) | El paraguas tapa solo a una parte de la familia. |
| Bien | ninguno | Un paraguas del tamaño justo. |
| Te sobra | Lewis (7,9 meses; con 5–6 bastaba) | Un paraguas gigante y dinero aburrido debajo. |
| Te sobra mucho | Weah (16 meses; con 8–9 bastaba) | Una pila de billetes que la inflación va achicando. |

**Caso especial: un gasto grande cercano que se come la reserva.** Carter quiere comprar casa en enero de 2027, y al pagarla su reserva queda en **0 meses**. Se ve como una línea de tiempo donde el colchón se vacía el día del pago.

### 4.4 Deudas

| Etiqueta | ¿Quién la tiene? | Qué ve el usuario |
|---|---|---|
| Tarjeta de crédito cara que no baja | Johnson, Weah (esta le frena la nota) | Una rueda de hámster: pagas cada mes y la deuda casi no se mueve. Un control para pagar más muestra cuándo terminarías. |
| Mucho sueldo comprometido en pagos | Johnson | El sueldo como una barra de la que se van separando los pagos. |
| Deudas que siguen después de jubilarte | Johnson (hipoteca hasta 2047) | Una línea de tiempo donde la deuda cruza el día de la jubilación. |
| Sin deuda de tarjeta | Lewis | Felicitación breve. |
| Casa o auto demasiado caros para el sueldo | ninguno | Variante de la barra del sueldo. |

### 4.5 Jubilación

| Etiqueta | ¿Quién la tiene? | Qué ve el usuario |
|---|---|---|
| Lo ahorrado no alcanza | Johnson (faltan $1,43M), Carter (faltan $1,18M) | Dos montañas: lo que necesitas y lo que tendrás. Un control de "ahorrar más al año" rellena la diferencia. |
| El dinero se acaba antes de tiempo | Carter (a los 85), Lewis (a los 73) | Un reloj de arena que se vacía antes del final. |
| Sacas demasiado cada año | Lewis (12% al año) | Un grifo muy abierto vaciando un depósito. |
| Tus ingresos fijos cubren poco | Lewis, Carter | Lo que entra seguro (pensión) contra lo que gastas; el hueco lo tienen que cubrir tus ahorros. |
| Vas bien | Weah | Felicitación. |

### 4.6 Universidad de los hijos

| Etiqueta | ¿Quién la tiene? | Qué ve el usuario |
|---|---|---|
| Falta dinero | Johnson, Lewis, Weah (faltan unos $100.000 cada uno) | Una alcancía por hijo que se va llenando hacia el año de la universidad. |
| Ya empieza la universidad | Lewis (Ethan tiene 18) | Se vuelve un gasto de este año. |
| Cubierta | ninguno | Alcancías llenas. |
| No tiene hijos o no hay meta de universidad | Carter | No se muestra. |

### 4.7 Seguros

**Seguro de vida (protege a tu familia si te pasa algo):**

| Etiqueta | ¿Quién la tiene? | Qué ve el usuario |
|---|---|---|
| Le falta mucho | Johnson (los dos), Weah (los dos; le frena la nota) | Una red bajo la familia con agujeros grandes. Un control para subir la cobertura los cierra. |
| Le falta un poco | Carter | Red con un agujero chico. |
| Bien | Lewis | Red completa. |
| Le sobra un poco / le sobra mucho | ninguno | Red doble, pagando de más. |

**Seguro de responsabilidad o "umbrella" (te protege si te demandan):**

| Etiqueta | ¿Quién la tiene? | Qué ve el usuario |
|---|---|---|
| No tiene | Johnson, Carter, Weah | Un paraguas grande sobre casa, autos e inversiones. Sin él, un rayo llega al patrimonio. Es barato de resolver. |
| Tiene, pero poco | ninguno | Un paraguas pequeño. |
| Bien | Lewis | Felicitación. |

### 4.8 Inversiones

| Etiqueta | ¿Quién la tiene? | Qué ve el usuario |
|---|---|---|
| Demasiado prudente para su edad | Johnson, Carter | Una balanza entre acciones y bonos que se arrastra hacia el punto ideal. |
| Más riesgo del que le corresponde | Lewis, Weah | La misma balanza al revés y una caída de mercado simulada. |
| Cartera fuera de su perfil | Johnson, Weah | La balanza con la marca del perfil que le corresponde. |
| Todo en el mismo sector (tecnología) | los 4 | Casi todos los huevos en la misma canasta, que se tambalea. |
| Producto muy arriesgado (apalancado) | Weah (UPRO) | Una caída de mercado multiplicada por 3. |
| Paga impuestos que podría evitar | Carter, Weah | Las mismas inversiones movidas a otra cuenta y el ahorro sumándose. |

### 4.9 Cuentas con ventajas de impuestos

| Etiqueta | ¿Quién la tiene? | Qué ve el usuario |
|---|---|---|
| No está aportando a su plan de jubilación | Johnson | Variante de "lo ahorrado no alcanza". |
| No aprovecha el dinero que pone la empresa | ninguno | La mano de la empresa ofreciendo dinero que nadie recoge. |
| Lo aprovecha bien | Carter, Weah | Felicitación. |

### 4.10 Depende demasiado de su sueldo

| Etiqueta | ¿Quién la tiene? | Qué ve el usuario |
|---|---|---|
| Casi todo su patrimonio depende de un solo empleo | Carter (82%), Johnson (55%) | Todo su dinero sostenido por una sola columna. |

## 5. Decisiones mientras no tengamos más información

Trabajamos solo con lo que vemos en los 4 ejemplos:

1. **Soluciones:** usamos las 10 que vimos. Si llega una desconocida, se muestra igual como tarjeta genérica (título, esfuerzo y cuánto sube la nota), solo sin animación propia.
2. **Problemas que frenan la nota:** usamos los 2 que vimos. Uno desconocido se muestra como barrera genérica con el texto que trae Sherpas.
3. **Etiquetas no vistas** (por ejemplo, fondo de emergencia "Bien"): se deducen del color que trae Sherpas. Verde = bien, amarillo = atención, rojo = problema.
4. **Dinero que pone la empresa:** cualquier valor distinto de "aprovechado" o "no aplica" lo tratamos como "no lo aprovecha".
5. **Límite de retiro anual:** usamos un 6%, que es el que Sherpas le propone a Carter.

---

## Anexo técnico (para programar)

De dónde sale cada etiqueta en los datos del MCP. FH = informe `financial-health`, IA = informe `investment-analysis`.

| Tema | Campos |
|---|---|
| Nota general | `FH score.band`, `score.pillars[]`, `score.caps_applied[]` |
| Sobra o falta dinero | `FH key_metrics.facts.retirement.netCashFlowThisYear`, `ratios.savingsLevel.ratio` |
| Fondo de emergencia | `FH ratios.emergencyFund.claim` / `.color`, `facts.cash.monthsCovered`, `monthsCoveredAfterNearTermGoals` |
| Deudas | `FH ratios.creditCardDebt`, `debtToIncome`, `housingRatio`, `vehiclePRI`, `currentDPD` |
| Jubilación | `FH ratios.retirementSavings`, `retirementAndOtherGoals.assetDepletion`, `facts.retirement.withdrawalRateAverage`, `incomeShareOfNeed` |
| Universidad | `FH ratios.educationSavings.totalGAP`, `doTheyHaveEducationFundingGoals` |
| Seguro de vida | `FH ratios.lifeInsurance.clientCoverageKey` / `coClientCoverageKey` |
| Umbrella | `FH ratios.umbrella.claim` |
| Inversiones | `IA analysis.summary.assetAllocation`, `performanceAnalysis.goalGroups[].inBand`, `concentration`, `positions[].category`, `taxDragAnalysis` |
| Plan de jubilación de la empresa | `FH assetsAndInvestments.matchGapAnalysis[].matchMaximizationStatus`, `activeContributions` |
| Soluciones | `FH score.top_moves[]` (título, esfuerzo, nota antes y después), `combined_moves[]` |
| Pareja / hijos / casa propia | `case.household[].role`, `ratios.indebtedness.housing` |
