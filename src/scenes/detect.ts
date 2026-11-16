// Turns a Sherpas case (financial-health + investment-analysis parts from the MCP) into the
// labelled topics the animated summary shows. Rules follow docs/matriz-escenas.md: every
// topic gets one fixed label, and labels never seen in the samples fall back to Sherpas'
// own colour (G/Y/R) so any case still lands somewhere.

export type Status = "good" | "warn" | "bad";

export interface Topic {
  id: string;
  title: string;
  status: Status;
  label: string;
  scene: string;
  headline: string;
  numbers: Record<string, unknown>;
}

export interface Summary {
  id: string;
  household: { names: string[]; couple: boolean; kids: string[]; housing: "own" | "rent" };
  score: { value: number; band: string; pillars: { name: string; score: number; points: string }[]; caps: string[] };
  topics: Topic[];
  moves: { title: string; effort: string; before: number; after: number; liftsCap: boolean }[];
}

// The yearly draw Sherpas steers Carter toward; used as the sustainable line.
const SUSTAINABLE_WITHDRAWAL = 6;

const fromColour = (c: string | undefined): Status => (c === "G" ? "good" : c === "Y" ? "warn" : "bad");
const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const pct = (s: string) => parseFloat(s);

const PILLARS: Record<string, string> = {
  "Savings and cash flow": "Ahorro",
  Debt: "Deudas",
  Investments: "Inversiones",
  "Liquidity and emergency fund": "Reserva",
  "Insurance and protection": "Seguros",
};

export function detect(fh: any, ia: any): Summary {
  const km = fh.key_metrics, r = km.ratios, f = km.facts;
  const people = fh.case.household;
  const adults = people.filter((p: any) => p.role !== "child");
  const topics: Topic[] = [];

  // cash flow
  const flow = f.retirement.netCashFlowThisYear.value, saveRate = r.savingsLevel.ratio, income = r.savingsLevel.grossIncome;
  topics.push(flow < 0
    ? { id: "cashflow", title: "Dinero de cada año", status: "bad", label: "Gastas más de lo que entra", scene: "bucket-leak", headline: `Este año salen ${usd(-flow)} más de lo que entra.`, numbers: { flow, saveRate, income } }
    : saveRate < 0.15
      ? { id: "cashflow", title: "Dinero de cada año", status: "warn", label: "Justo, con muchas cosas que pagar", scene: "split-pull", headline: `Te quedan ${usd(flow)} al año para repartir entre varias metas.`, numbers: { flow, saveRate, income } }
      : { id: "cashflow", title: "Dinero de cada año", status: "good", label: "Te sobra dinero", scene: "idle-money", headline: `Te sobran ${usd(flow)} al año.`, numbers: { flow, saveRate, income } });

  // emergency fund
  const ef = r.emergencyFund, months = parseFloat(f.cash.monthsCovered.value), after = parseFloat(f.cash.monthsCoveredAfterNearTermGoals.value);
  const efLabels: Record<string, [string, string]> = {
    Vulnerable: ["Vulnerable", "umbrella-small"],
    "Not enough": ["No alcanza", "umbrella-partial"],
    "Over-reserved": ["Te sobra", "umbrella-huge"],
    "Very over-reserved": ["Te sobra mucho", "cash-inflation"],
  };
  const [efLabel, efScene] = efLabels[ef.claim] ?? ["Bien", "umbrella-fit"];
  topics.push({
    id: "emergency", title: "Fondo de emergencia", status: fromColour(ef.color), label: efLabel, scene: efScene,
    headline: `Cubres ${months} meses de gastos; lo recomendado es ${ef.minRecommendedEFMonths}–${ef.maxRecommendedEFMonths}.`,
    numbers: { months, after, min: ef.minRecommendedEFMonths, max: ef.maxRecommendedEFMonths },
  });
  // only when the goal wipes out at least half of the cushion (Carter: 3.2 → 0 months)
  if (after <= months / 2 && after < ef.minRecommendedEFMonths) {
    // the biggest upcoming goal is the one that empties the cushion
    const goal = [...(km.savingsAndExpenses?.shortTermGoalsNeeded ?? [])].sort((a: any, b: any) => b.amount - a.amount)[0];
    const goalEs: Record<string, string> = { "Purchase a home": "Comprar casa", "Purchase a vehicle": "Comprar auto", "Take a vacation": "Vacaciones", "Go on vacation": "Vacaciones" };
    const when = goal?.date ? new Date(goal.date).toLocaleDateString("es-ES", { month: "long", year: "numeric", timeZone: "UTC" }) : "";
    topics.push({
      id: "near-goal", title: "Gasto grande cercano", status: "bad", label: "Se come tu reserva", scene: "timeline-drain",
      headline: `${goalEs[goal?.description] ?? goal?.description ?? "El próximo gasto grande"}${when ? ` (${when})` : ""} deja tu reserva en ${after} meses.`,
      numbers: { months, after, goal: goalEs[goal?.description] ?? goal?.description ?? "", amount: goal?.amount ?? 0, when },
    });
  }

  // debt
  const cc = r.creditCardDebt, capped = fh.score.caps_applied.some((c: any) => /revolving/i.test(c.reason));
  if (cc.hasDebt && cc.percentageOfCCOverGrossIncome > 0.03) {
    topics.push({ id: "debt", title: "Deudas", status: "bad", label: "Tarjeta cara que no baja", scene: "hamster-wheel", headline: `Debes ${usd(cc.balance)} en tarjetas y el pago apenas cubre los intereses.`, numbers: { balance: cc.balance, monthly: cc.monthlyPayment, interest: cc.paymentsEqualToInterest, capped: String(capped) } });
  } else if (r.debtToIncome.ratio > 0.26) {
    topics.push({ id: "debt", title: "Deudas", status: "warn", label: "Mucho sueldo comprometido", scene: "income-bar", headline: `El ${Math.round(r.debtToIncome.ratio * 100)}% de tu sueldo se va en pagos.`, numbers: { dti: r.debtToIncome.ratio } });
  } else {
    topics.push({ id: "debt", title: "Deudas", status: "good", label: cc.hasDebt ? "Bajo control" : "Sin deuda de tarjeta", scene: "praise", headline: "Tus deudas están bajo control.", numbers: { dti: r.debtToIncome.ratio } });
  }

  // retirement
  const gap = r.retirementSavings.planningGapAtRetirementAgeInTodaysDollars;
  const runOut = km.retirementAndOtherGoals.assetDepletion.ageWhenTheyRunOutOfLiquidAssets;
  const draw = pct(f.retirement.withdrawalRateAverage.value);
  const shortYears = km.retirementAndOtherGoals.assetDepletion.shortfallInNumberOfYears;
  const retNumbers = {
    gap, extraSave: r.retirementSavings.requiredExtraSavings, runOut: String(runOut), draw, incomeShare: pct(f.retirement.incomeShareOfNeed.value),
    shortYears: typeof shortYears === "number" ? shortYears : 0, retireAge: adults[0]?.retirement_age ?? 65,
    projected: r.retirementSavings.balanceInRetirementAccountsAtRetirementAgeInTodaysDollars,
  };
  if (typeof runOut === "number") {
    topics.push({ id: "retirement", title: "Jubilación", status: "bad", label: "El dinero se acaba antes de tiempo", scene: "hourglass", headline: `Tus ahorros se agotarían a los ${runOut} años.`, numbers: retNumbers });
  } else if (gap > 0) {
    topics.push({ id: "retirement", title: "Jubilación", status: "bad", label: "Lo ahorrado no alcanza", scene: "two-mountains", headline: `Faltan ${usd(gap)} para jubilarte como planeas.`, numbers: retNumbers });
  } else if (draw > SUSTAINABLE_WITHDRAWAL) {
    topics.push({ id: "retirement", title: "Jubilación", status: "warn", label: "Sacas demasiado cada año", scene: "open-tap", headline: `Sacarías un ${draw}% al año; lo sostenible ronda el ${SUSTAINABLE_WITHDRAWAL}%.`, numbers: retNumbers });
  } else {
    topics.push({ id: "retirement", title: "Jubilación", status: "good", label: "Vas bien", scene: "praise", headline: "Tu jubilación va por buen camino.", numbers: retNumbers });
  }

  // education
  const edu = r.educationSavings;
  if (edu.doTheyHaveEducationFundingGoals) {
    topics.push(edu.totalGAP > 0
      ? { id: "education", title: "Universidad", status: "warn", label: "Falta dinero", scene: "piggy-banks", headline: `Faltan ${usd(edu.totalGAP)} para la universidad.`, numbers: { gap: edu.totalGAP, extraSave: edu.totalRequiredExtraSavings, need: edu.totalEducationGoalRequiredAmountAtToday, have: edu.current529AccountsBalance } }
      : { id: "education", title: "Universidad", status: "good", label: "Cubierta", scene: "praise", headline: "La universidad está cubierta.", numbers: { gap: 0 } });
  }

  // life insurance: worst of the earners decides the card, each person keeps their own label
  const li = r.lifeInsurance;
  const lifeKeys: [string, string, string][] = [[adults[0]?.first_name, li.clientCoverageKey, li.clientCoverageColor]];
  if (li.coClientCoverageKey) lifeKeys.push([adults[1]?.first_name, li.coClientCoverageKey, li.coClientCoverageColor]);
  const lifeEs: Record<string, string> = { "Under insured": "Le falta mucho", "Slightly under insured": "Le falta un poco", "Adequately insured": "Bien", "Slightly over insured": "Le sobra un poco", "Over insured": "Le sobra mucho" };
  const worst = lifeKeys.map(([, , c]) => fromColour(c)).sort((a, b) => ["good", "warn", "bad"].indexOf(b) - ["good", "warn", "bad"].indexOf(a))[0];
  topics.push({
    id: "life", title: "Seguro de vida", status: worst, label: lifeEs[lifeKeys[0][1]] ?? lifeKeys[0][1], scene: worst === "good" ? "net-full" : "net-holes",
    headline: lifeKeys.map(([n, k]) => `${n}: ${(lifeEs[k] ?? k).toLowerCase()}`).join(" · "),
    numbers: {
      shortfall: li.lifeInsuranceCoverageGapsAndExcess.clientShortfall, coShortfall: li.lifeInsuranceCoverageGapsAndExcess.coClientShortfall ?? 0,
      // per earner: what the policy pays today vs the minimum the engine recommends
      people: [
        { name: adults[0]?.first_name, has: li.clientCoverage, need: li.recommendedClientMinCoverage },
        ...(li.coClientCoverageKey ? [{ name: adults[1]?.first_name, has: li.coClientCoverage, need: li.recommendedCoClientMinCoverage }] : []),
      ],
    },
  });

  // umbrella
  const um = r.umbrella;
  topics.push(um.claim === "No coverage"
    ? { id: "umbrella", title: "Seguro ante demandas", status: "bad", label: "No tiene", scene: "umbrella-lightning", headline: `Recomendado: ${usd(um.recommendedCoverage)} de cobertura.`, numbers: { recommended: um.recommendedCoverage } }
    : { id: "umbrella", title: "Seguro ante demandas", status: fromColour(um.color), label: um.color === "G" ? "Bien" : "Tiene, pero poco", scene: um.color === "G" ? "praise" : "umbrella-small", headline: "Tienes un seguro que cubre demandas.", numbers: { current: um.currentCoverage } });

  // investments: allocation vs target first, then the sharpest extra risk
  const a = ia.analysis.summary.assetAllocation, eq = a.currentEF.equity, target = a.targetEF.equity;
  const leveraged = ia.positions.filter((p: any) => /Leveraged/.test(p.category)).map((p: any) => p.ticker ?? p.name);
  const outOfBand = (ia.key_metrics.performanceAnalysis?.goalGroups ?? []).some((g: any) => g.inBand === false);
  const invNumbers = { equity: Math.round(eq * 100), target: Math.round(target * 100), sector: ia.key_metrics.performanceAnalysis?.concentration?.topSectorName ?? "", leveraged: leveraged.join(",") };
  const diff = Math.round((target - eq) * 100);
  topics.push({
    id: "investments", title: "Inversiones",
    status: leveraged.length || outOfBand ? "bad" : Math.abs(diff) >= 5 ? "warn" : "good",
    label: leveraged.length ? "Producto muy arriesgado" : diff >= 5 ? "Demasiado prudente" : diff <= -5 ? "Más riesgo del que te toca" : "Bien equilibradas",
    scene: leveraged.length ? "leverage-drop" : Math.abs(diff) >= 5 ? "balance-scale" : "praise",
    headline: `${invNumbers.equity}% en acciones; lo ideal para ti es ${invNumbers.target}%.`, numbers: invNumbers,
  });

  return {
    id: fh.case.slug,
    household: {
      names: adults.map((p: any) => p.first_name), couple: adults.length > 1,
      kids: people.filter((p: any) => p.role === "child").map((p: any) => p.first_name), housing: r.indebtedness.housing,
    },
    score: {
      value: fh.score.published_score, band: fh.score.band,
      pillars: fh.score.pillars.map((p: any) => ({ name: PILLARS[p.pillar] ?? p.pillar, score: p.score, points: p.points_shown_in_app })),
      caps: fh.score.caps_applied.map((c: any) => c.reason),
    },
    topics,
    moves: fh.score.top_moves.map((m: any) => ({ title: m.title, effort: m.effort, before: m.score_before, after: m.score_after, liftsCap: m.lifts_a_cap })),
  };
}
