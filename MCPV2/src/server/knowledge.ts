// What Cordi knows as a specialist, camp by camp: what the measure is, what's healthy, which
// levers move it, and where people usually get confused. General knowledge, no family figures:
// those come from the analysis. Keyed by the same topic ids Sherpas returns.
export const KNOWLEDGE: Record<string, string> = {
  base: [
    "La nota de salud financiera (0 a 100) suma cinco tramos con un máximo de puntos cada uno: Ahorro, Deudas, Inversiones, Reserva (colchón) y Seguros.",
    "Franjas: crítica, vulnerable, estable, fuerte. Una 'barrera' es una situación grave (deuda de tarjeta cara, falta de seguro de vida con hijos) que pone techo a la nota aunque el resto vaya bien.",
    "Confusión típica: creer que la nota es un juicio personal. Es una foto de hoy y sube con pasos concretos.",
  ].join(" "),
  cashflow: [
    "Flujo de caja: lo que entra en un año menos lo que sale (gastos, deudas, ahorro comprometido). Positivo = margen para metas; negativo = se tira de ahorros.",
    "Tasa de ahorro sana: 15 a 20% de los ingresos o más.",
    "Palancas: recortar gastos fijos, ajustar metas en el tiempo, subir ingresos. Un año negativo puntual no es grave; si se repite, erosiona la jubilación.",
  ].join(" "),
  emergency: [
    "Colchón de emergencia: dinero líquido para vivir si los ingresos paran (despido, baja). Se mide en meses de gastos.",
    "Lo sano suele ser 3 a 6 meses; más si depende de un solo sueldo, hay hijos o ingresos variables (de ahí rangos como 8-9).",
    "Debe estar en algo seguro y disponible (cuenta remunerada), no invertido en bolsa. Tener de más no es peligroso pero ese exceso no crece.",
    "Confusión típica: contar inversiones o el plan de pensiones como colchón.",
  ].join(" "),
  "near-goal": [
    "Meta próxima: un gasto grande cercano (comprar casa) que saldría del colchón.",
    "Riesgo: quedarse sin reserva justo después; cualquier imprevisto acabaría en deuda.",
    "Palancas: ahorrar aparte para la meta, aplazarla, o reponer el colchón cuanto antes.",
  ].join(" "),
  debt: [
    "Deuda de tarjeta (revolving): interés muy alto; si el pago mensual apenas cubre intereses, el saldo no baja.",
    "DTI: parte del sueldo que va a pagar deudas cada mes; hasta 36% se considera sano.",
    "Palancas: pagar primero la deuda de interés más alto (método avalancha), dejar de usar la tarjeta, consolidar a un interés menor.",
    "Confusión típica: pensar que pagar el mínimo es suficiente.",
  ].join(" "),
  retirement: [
    "Jubilación: si lo ahorrado más lo que se aportará llega para los gastos previstos desde la edad de retiro.",
    "Tasa de retirada: % de los ahorros que se saca cada año; alrededor de 4% se considera sostenible. Por encima, los ahorros pueden agotarse antes de tiempo.",
    "Palancas: ahorrar más cada año, retrasar algo la jubilación, gastar algo menos de jubilado, invertir con el riesgo adecuado.",
    "Confusión típica: mirar solo el saldo acumulado y no cuánto dura al sacar dinero.",
  ].join(" "),
  education: [
    "Educación: coste estimado de la universidad de los hijos frente a lo ahorrado para ello.",
    "El tiempo hasta la universidad es la palanca principal: empezar antes reduce mucho la aportación anual.",
    "Suele ahorrarse en vehículos específicos para estudios; la jubilación tiene prioridad sobre la universidad.",
  ].join(" "),
  life: [
    "Seguro de vida: protege a quien depende de tus ingresos si faltas. La cobertura necesaria suma años de ingresos a sustituir, deudas pendientes y metas como la universidad, menos lo ya ahorrado.",
    "Con hijos y cobertura muy baja, es una barrera que frena la nota.",
    "Los seguros temporales (a plazo) suelen ser la forma barata de cubrir el hueco.",
  ].join(" "),
  umbrella: [
    "Seguro paraguas (umbrella): responsabilidad civil extra por encima de los seguros de casa y coche, ante demandas.",
    "Importa más cuanto más patrimonio hay en juego; suele ser barato para lo que cubre (habitualmente desde $1.000.000).",
  ].join(" "),
  investments: [
    "Reparto de inversiones: qué parte está en acciones (más crecimiento y más vaivén) frente a renta fija o liquidez.",
    "El % objetivo depende de la edad, los plazos y la tolerancia al riesgo; desviarse unos puntos no es grave, mucho sí.",
    "Concentración: mucho peso en un sector o en una empresa aumenta el riesgo. Fondos apalancados amplifican subidas y bajadas.",
    "Palancas: rebalancear hacia el objetivo, diversificar, reducir apalancamiento.",
  ].join(" "),
  summit: [
    "La cima resume los pasos que propone Sherpas, ordenados por cuánto suben la nota, con su esfuerzo.",
    "Conviene empezar por uno, idealmente de poco esfuerzo y mucho impacto, y hablarlo con el asesor.",
  ].join(" "),
};
