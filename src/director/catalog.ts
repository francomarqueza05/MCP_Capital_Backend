
// The block catalog shared with the front end: every block that can go on screen, in the order
// of the Sherpas report. Each block knows when it applies to a family (`when`), what the guide
// would say with it (`says`), and the profile signals that make it a good pick (`picks`).
// Ported from the front end (web/components/blocks/registry.tsx) without its rendering: the front
// draws a block by id, the director (./director.ts) decides which blocks play and when.
import type { Plan, PersonId } from "../plan/build";
import { pct, short, toWhole, usd } from "../plan/format";

export type Depth = "plain" | "detailed";
export type Ctx = { data: Plan; who: PersonId; depth: Depth };

export type Block = {
  id: string;
  name: string;
  wide?: boolean;
  when?: (c: Ctx) => boolean;
  says?: (c: Ctx) => string;
  picks: string[];
};

export type Section = { id: string; name: string; about: string; blocks: Block[] };

const me = (c: Ctx) => c.data.household.adults.find((a) => a.id === c.who) ?? c.data.household.adults[0];
const you = (c: Ctx) => (c.data.household.couple ? "you both" : "you");
const has = (s: string | undefined | null) => Boolean(s && s.trim());

const read = (id: string, name: string, get: (c: Ctx) => string, look?: (c: Ctx) => string, picks: string[] = ["Reads the analysis", "Detail seekers"]): Block => ({
  id,
  name,
  wide: true,
  picks,
  when: (c) => has(get(c)),
});

export const sections: Section[] = [
  {
    id: "summary",
    name: "Summary",
    about: "Who they are, the score, and what the plan recommends.",
    blocks: [
      {
        id: "family-snapshot",
        name: "The family at a glance",
        wide: true,
        says: (c) => `${c.data.household.family}: ${short(c.data.snapshot.income)} a year coming in, and ${usd(c.data.snapshot.netWorth)} of net worth.`,
        picks: ["Opening", "Any profile"],
      },
      {
        id: "score-dial",
        name: "Score dial",
        says: (c) => {
          const s = c.data.score;
          const next = s.bands.find((b) => b.to > s.value);
          const after = next ? s.bands[s.bands.indexOf(next) + 1] : null;
          return `Your plan scores ${s.value} out of 100, in the ${s.band} band.${after ? ` ${next!.to - s.value} points from ${after.name}.` : ""}`;
        },
        picks: ["Opening", "Any profile"],
      },
      {
        id: "pillars",
        name: "Score by area",
        says: (c) => {
          const low = [...c.data.score.pillars].sort((a, b) => a.got / a.max - b.got / b.max)[0];
          return `${low.name} is the weakest area, with ${low.got} of its ${low.max} points.`;
        },
        picks: ["After the score", "Detail seekers"],
      },
      read("plan-summary", "The plan, point by point", (c) => c.data.writing.summary, undefined, ["Opening", "Reads the analysis"]),
      {
        id: "recommendations",
        name: "What the plan recommends",
        wide: true,
        when: (c) => has(c.data.writing.recommendations),
        says: (c) => `The plan makes ${c.data.writing.recommendations.trim().split(/\n+- /).length} recommendations. Here they are, in its order.`,
        picks: ["Closing a section", "Ready to act"],
      },
      {
        id: "move-sim",
        name: "Try the moves",
        wide: true,
        when: (c) => c.data.score.moves.length > 0,
        says: (c) => {
          const s = c.data.score;
          const best = Math.max(...s.moves.map((m) => m.after), ...s.combos.map((x) => x.after));
          return `The plan lists ${s.moves.length} moves that lift your score. Together they can take you from ${s.value} to ${best}. Try them.`;
        },
        picks: ["Ready to act", "Likes to explore"],
      },
      {
        id: "competing-needs",
        name: "What competes for your money",
        wide: true,
        when: (c) => c.data.tension.needs.length >= 2,
        says: (c) =>
          c.data.tension.free >= 0
            ? `${c.data.tension.needs.map((n) => n.label.toLowerCase()).join(", ")}: they all want the same ${usd(c.data.tension.free)} a year. The plan doesn't pick for you.`
            : `You're ${usd(-c.data.tension.free)} short each year, and ${c.data.tension.needs.map((n) => n.label.toLowerCase()).join(", ")} still need money.`,
        picks: ["Tension T1", "Couples"],
      },
    ],
  },
  {
    id: "retirement",
    name: "Retirement and goals",
    about: "What they want, and whether the money gets them there.",
    blocks: [
      {
        id: "goals",
        name: "Your goals",
        wide: true,
        when: (c) => c.data.goals.list.length > 0,
        says: (c) => `You told us ${c.data.goals.list.length} things you want. Here they are on the calendar.`,
        picks: ["Opening the future", "Family first"],
      },
      {
        id: "net-worth-path",
        name: "Net worth through life",
        wide: true,
        says: (c) => {
          const at = c.data.netWorthPath.find((r) => r.age === c.data.household.adults[0].retireAge);
          return `In today's dollars, your net worth reaches about ${short(at?.value ?? 0)} when ${you(c)} stop working, and ends near ${short(c.data.netWorthPath[c.data.netWorthPath.length - 1].value)}.`;
        },
        picks: ["Retirement (O1)", "Visual learners"],
      },
      {
        id: "savings-line",
        name: "Savings line",
        wide: true,
        says: (c) =>
          c.data.retirement.runsOutAt
            ? `This is your savings, year by year. On today's path they run out at ${c.data.retirement.runsOutAt}.`
            : `This is your savings, year by year. It climbs until you stop working at ${me(c).retireAge}, then you live off it, and it lasts the whole plan.`,
        picks: ["Retirement (O1)", "Opening the future"],
      },
      {
        id: "family-lanes",
        name: "Everyone's ages, one calendar",
        wide: true,
        says: (c) => {
          const y = c.data.timeline.retireYear;
          const d = y - c.data.timeline.from;
          const people = [...c.data.household.adults, ...c.data.household.kids].map((p) => `${p.name} ${p.age + d}`);
          return `In ${y} ${you(c)} stop working. ${people.join(", ")}.`;
        },
        picks: ["Family first", "Couples", "Timing questions"],
      },
      {
        id: "retirement-mix",
        name: "Paying for retirement",
        when: (c) => c.data.retirement.need !== null && c.data.retirement.fromIncome !== null,
        says: (c) => `Each year of retirement costs about ${usd(c.data.retirement.need!)} in today's money. Guaranteed income pays ${pct(c.data.retirement.fromIncome! / c.data.retirement.need!)}; your savings pay the rest.`,
        picks: ["Retirement (O1)", "Detail seekers"],
      },
      {
        id: "retirement-income",
        name: "Where retirement income comes from",
        wide: true,
        when: (c) => c.data.retirementIncome.streams.length > 0,
        says: (c) => `Social Security starts in ${c.data.retirementIncome.streams[0].from} for ${c.data.retirementIncome.streams[0].who}. Before and alongside it, your savings carry you.`,
        picks: ["Retirement (O1)", "Detail seekers"],
      },
      {
        id: "gap-vs-room",
        name: "Needed against what's left",
        when: (c) => c.data.retirement.extraPerYear > 0 && c.data.retirement.free > 0,
        says: (c) => `Retirement needs ${usd(c.data.retirement.extraPerYear)} more saving a year. That's ${(c.data.retirement.extraPerYear / c.data.retirement.free).toFixed(1)} times what's left over.`,
        picks: ["Tension T1", "Retirement (O1)"],
      },
      read("retirement-reading", "The retirement analysis", (c) => c.data.writing.retirement, (c) => c.data.writing.retirementLook),
    ],
  },
  {
    id: "assets",
    name: "Assets and investments",
    about: "What they own, and how much of it is really theirs.",
    blocks: [
      {
        id: "assets",
        name: "What you own",
        wide: true,
        when: (c) => c.data.assets.rows.length > 0,
        says: (c) => `You own ${usd(c.data.assets.total)}. After what you owe, ${usd(c.data.assets.netWorth)} is yours.`,
        picks: ["Net worth questions", "Visual learners"],
      },
      {
        id: "home-equity",
        name: "How much of the home is yours",
        when: (c) => Boolean(c.data.assets.home),
        says: (c) => `${pct(c.data.assets.home!.share)} of your home is yours: ${short(c.data.assets.home!.equity)} of a ${short(c.data.assets.home!.value)} house.`,
        picks: ["Homeowners", "Debt (O5)"],
      },
      {
        id: "who-holds",
        name: "Whose name is on what",
        wide: true,
        says: (c) => (c.data.household.couple ? "Here is whose name is on each account and each debt." : `Here is every account and debt in your name, ${me(c).name}.`),
        picks: ["Decision style (D5)", "Couples"],
      },
      read("assets-reading", "The assets analysis", (c) => c.data.writing.assets, (c) => c.data.writing.assetsLook),
    ],
  },
  {
    id: "debt",
    name: "Debt",
    about: "How much, what it costs, and when it ends.",
    blocks: [
      {
        id: "debt-ratios",
        name: "Debt against what lenders accept",
        when: (c) => c.data.debt.total > 0,
        says: (c) => `Your debt payments take ${pct(c.data.debtRatios.ratios[0].value)} of income. Lenders start to worry at ${pct(c.data.debtRatios.lines[0])}.`,
        picks: ["Debt (O5)", "Worried about debt"],
      },
      {
        id: "debt-ladder",
        name: "Debts by cost",
        when: (c) => c.data.debt.list.length > 0,
        says: (c) => `Your ${c.data.debt.list[0].kind.toLowerCase()} is the most expensive: ${pct(c.data.debt.list[0].rate, 1)} a year.`,
        picks: ["Debt (O5)", "Tension T4"],
      },
      {
        id: "monthly-debt",
        name: "Where the monthly payments go",
        when: (c) => c.data.debt.list.some((d) => d.monthly > 0),
        says: (c) => `${usd(c.data.debtRatios.monthly)} goes out to debt every month.`,
        picks: ["Debt (O5)", "Monthly budget questions"],
      },
      {
        id: "card-bite",
        name: "Where a card payment goes",
        when: (c) => Boolean(c.data.debt.card && c.data.debt.card.monthly > 0),
        says: (c) => {
          const k = c.data.debt.card!;
          return `Of the ${usd(k.monthly)} you pay the card each month, $${k.interest.toFixed(2)} is interest.`;
        },
        picks: ["Debt (O5)", "New to finance"],
      },
      {
        id: "debt-payoff",
        name: "When the debt is gone",
        wide: true,
        when: (c) => Boolean(c.data.debtRatios.debtFree) && c.data.debt.total > 0,
        says: (c) => `At today's pace, you're debt-free at ${c.data.debtRatios.debtFree!.age}, in ${c.data.debtRatios.debtFree!.year}.`,
        picks: ["Debt (O5)", "Retirement (O1)"],
      },
      read("debt-reading", "The debt analysis", (c) => c.data.writing.debt, (c) => c.data.writing.debtLook),
    ],
  },
  {
    id: "savings",
    name: "Savings and expenses",
    about: "Where the year's money goes, and what is left.",
    blocks: [
      {
        id: "money-river",
        name: "Where the money goes",
        wide: true,
        says: (c) =>
          c.data.cashflow.free >= 0
            ? `Here's a year of your ${usd(c.data.cashflow.income)}. After everything, ${usd(c.data.cashflow.free)} is left over.`
            : `Here's a year of your ${usd(c.data.cashflow.income)}. More goes out than comes in: ${usd(-c.data.cashflow.free)} short.`,
        picks: ["Visual learners", "Cash-flow questions"],
      },
      {
        id: "hundred",
        name: "Of every $100",
        says: (c) => {
          const n = toWhole(
            c.data.cashflow.flows.map((f) => f.amount),
            100,
          );
          const parts = c.data.cashflow.flows.map((f, i) => `${n[i]} ${f.key === "free" ? "are left over" : `to ${f.label.toLowerCase()}`}`);
          return `Think of every hundred dollars going out: ${parts.join(", ")}.`;
        },
        picks: ["New to finance", "Short sessions on a phone"],
      },
      {
        id: "outflow-detail",
        name: "Every outflow, line by line",
        wide: true,
        says: () => "Here is every line of the year, tax by tax and payment by payment.",
        picks: ["Detail seekers", "Experts"],
      },
      {
        id: "saving-now",
        name: "Where today's saving goes",
        when: (c) => c.data.savingNow.split.length > 0 || c.data.savingNow.retirement > 0,
        says: (c) => `You save ${usd(c.data.savingNow.total)} a year today, ${pct(c.data.savingNow.rate, 1)} of income.`,
        picks: ["Retirement (O1)", "Saving habits"],
      },
      {
        id: "cushion",
        name: "Cash cushion",
        says: (c) => `If your pay stopped, your cash would last about ${c.data.cushion.months} months. The plan suggests ${c.data.cushion.minMonths} to ${c.data.cushion.maxMonths}.`,
        picks: ["Gap: cash reserve", "Income at risk"],
      },
      {
        id: "college",
        name: "College, child by child",
        wide: true,
        when: (c) => Boolean(c.data.college),
        says: (c) => `${c.data.college!.kids.map((k) => `${k.name} starts college in ${k.span.slice(0, 4)}`).join(", ")}.`,
        picks: ["College", "Family first"],
      },
      {
        id: "waterfall",
        name: "The order for each saved dollar",
        wide: true,
        when: (c) => c.data.waterfall.length > 0,
        says: () => "The plan has an order for where each saved dollar goes. Here are the steps, and how full each one is.",
        picks: ["Too many options", "Ready to act"],
      },
      read("savings-reading", "The savings analysis", (c) => c.data.writing.savings, (c) => c.data.writing.savingsLook),
    ],
  },
  {
    id: "protection",
    name: "Insurance and protection",
    about: "Emergency fund, life cover and umbrella cover.",
    blocks: [
      {
        id: "shield",
        name: "Layers of protection",
        says: () => "These are the layers that keep one bad day from undoing the plan.",
        picks: ["Anchor: protection", "Opening a hard topic"],
      },
      read("protection-intro", "Why protection matters", (c) => c.data.writing.protectionIntro, undefined, ["Anchor: protection", "Opening a hard topic"]),
      read("emergency-reading", "The emergency fund analysis", (c) => c.data.writing.emergency),
      {
        id: "life-cover",
        name: "Life cover",
        when: (c) => c.data.protection.life.length > 0,
        says: (c) => {
          const l = c.data.protection.life.find((x) => x.who === c.who) ?? c.data.protection.life[0];
          return `${l.name}, your life cover is ${short(l.has)}. The plan suggests ${short(l.min)} to ${short(l.max)}.`;
        },
        picks: ["Gap: life cover", "Speaks to one person"],
      },
      read("life-reading", "The life insurance analysis", (c) => c.data.writing.life),
      {
        id: "umbrella",
        name: "Umbrella cover",
        says: (c) =>
          c.data.protection.umbrella.has
            ? `You have ${short(c.data.protection.umbrella.has)} of umbrella cover over your home, car and savings.`
            : "One large claim could reach your savings, your property and your income. An umbrella policy sits over all of it.",
        picks: ["Gap: umbrella"],
      },
      read("umbrella-reading", "The umbrella analysis", (c) => c.data.writing.umbrella),
    ],
  },
  {
    id: "investments",
    name: "Investment analysis",
    about: "What the portfolio is for, what it does, and what changes.",
    blocks: [
      read("invest-summary", "The investment summary", (c) => c.data.writing.invSummary),
      read("invest-snapshot", "Your investments at a glance", (c) => [c.data.writing.invSnapshot, c.data.writing.invIntro].filter(Boolean).join("\n\n")),
      {
        id: "proposal",
        name: "Today against the proposal",
        wide: true,
        says: (c) => `The proposal moves you from ${c.data.proposal.rows[0].now} to ${c.data.proposal.rows[0].next} stocks and bonds.`,
        picks: ["Investors", "Detail seekers"],
      },
      {
        id: "buckets",
        name: "Accounts by how they're taxed",
        wide: true,
        says: (c) => `You have ${short(c.data.buckets.reduce((s, b) => s + b.amount, 0))} across ${c.data.buckets.reduce((s, b) => s + b.count, 0)} accounts.`,
        picks: ["Tax questions", "Experts"],
      },
      read("invest-jobs", "What the portfolio needs to do", (c) => c.data.writing.invJobs),
      {
        id: "mix-shift",
        name: "Mix against target",
        says: (c) => `Your money is ${Math.round(c.data.portfolio.now.stocks * 100)}% in stocks; the target is ${Math.round(c.data.portfolio.target.stocks * 100)}%.`,
        picks: ["Investors", "Detail seekers"],
      },
      {
        id: "class-shift",
        name: "Asset classes, today and proposed",
        says: (c) => {
          const big = [...c.data.proposal.classes].sort((a, b) => Math.abs(b.next - b.now) - Math.abs(a.next - a.now))[0];
          return `The biggest change is in ${big.label.replace("Non-U.S.", "international").replace("U.S.", "US")}: ${pct(big.now)} to ${pct(big.next)}.`;
        },
        picks: ["Investors", "Experts"],
      },
      {
        id: "holdings-map",
        name: "Every holding",
        wide: true,
        says: (c) => `Here is everything you hold, account by account: ${c.data.portfolio.holdings.length} holdings.`,
        picks: ["Experts", "What do I own?"],
      },
      {
        id: "exposure",
        name: "Sectors and regions",
        wide: true,
        when: (c) => c.data.exposure.sectors.length > 0,
        says: (c) => `${c.data.exposure.sectors[0].name} is ${pct(c.data.exposure.sectors[0].weight, 1)} of your stocks, and ${pct(c.data.exposure.regions[0]?.weight ?? 0)} of everything is in the US.`,
        picks: ["Experts", "Concentration questions"],
      },
      {
        id: "performance",
        name: "Three years of results",
        wide: true,
        says: (c) => `In three years your money grew ${pct(c.data.performance.you.cumulative, 1)}. A diversified mix with the same risk grew ${pct(c.data.performance.same.cumulative, 1)}.`,
        picks: ["Investors", "How am I doing?"],
      },
      {
        id: "account-returns",
        name: "Each account's results",
        when: (c) => c.data.performance.accounts.length > 0,
        says: (c) => {
          const best = [...c.data.performance.accounts].sort((a, b) => b.yearly - a.yearly)[0];
          return `${best.name} did best, ${pct(best.yearly, 1)} a year.`;
        },
        picks: ["Experts", "Per person"],
      },
      {
        id: "market-timeline",
        name: "Through the market's ups and downs",
        wide: true,
        when: (c) => c.data.market.events.length > 0,
        says: () => "Here are the market events of the last three years, and how your portfolio took each one.",
        picks: ["Worried about markets", "Experts"],
      },
      read("invest-timeline", "How it performed, in words", (c) => c.data.writing.invTimeline),
      {
        id: "scenarios",
        name: "Through past crises",
        wide: true,
        when: (c) => c.data.market.scenarios.length > 0,
        says: () => "And here is how each mix would have done through four big moments in market history.",
        picks: ["Worried about markets", "Risk questions"],
      },
      read("invest-scenarios", "What the scenarios show", (c) => c.data.writing.invScenarios),
      read("invest-doing", "What the portfolio is actually doing", (c) => c.data.writing.invDoing),
      read("invest-working", "What's working", (c) => c.data.writing.invWorking, undefined, ["Good news first", "Hard news makes them look away"]),
      read("invest-priorities", "What needs to change", (c) => c.data.writing.invPriorities),
      read("invest-verdict", "Your retirement accounts", (c) => c.data.writing.invVerdict),
      {
        id: "on-table",
        name: "Money left on the table",
        wide: true,
        when: (c) => c.data.taxes.onTable.length > 0,
        says: (c) => `Up to ${usd(c.data.taxes.onTable.reduce((s, t) => s + t.amount, 0))} a year in employer money and lower tax may be going unclaimed.`,
        picks: ["Motivated by money back", "Ready to act"],
      },
      {
        id: "tax-back",
        name: "Tax back from saving",
        when: (c) => Boolean(c.data.retirement.taxCut && c.data.retirement.taxCutOn),
        says: (c) => `Putting ${usd(c.data.retirement.taxCutOn!)} more a year into your 401(k) would cut your tax by about ${usd(c.data.retirement.taxCut!)}.`,
        picks: ["Retirement (O1)", "Motivated by money back"],
      },
      read("invest-hsa", "Health savings", (c) => c.data.writing.invHsa),
      read("invest-recs", "What the plan recommends for investments", (c) => c.data.writing.invRecs, undefined, ["Closing a section", "Ready to act"]),
      {
        id: "risk-spectrum",
        name: "Risk, said and real",
        when: (c) => c.data.risk.readings.some((r) => r.value),
        says: (c) => {
          const [say, hold, whole] = c.data.risk.readings.map((r) => r.value.toLowerCase());
          return `You say ${say}, your portfolio holds ${hold}, and your whole picture adds up to ${whole}.`;
        },
        picks: ["Risk orientation (D4)", "Couples with split risk"],
      },
    ],
  },
  {
    id: "profile",
    name: "Who they are as clients",
    about: "The persona: D0 to D6, the concerns the data shows, and where they pull against each other.",
    blocks: [
      {
        id: "profile-dims",
        name: "Their profile, D0 to D6",
        wide: true,
        when: (c) => c.data.persona.dims.length > 0,
        picks: ["Backend: choosing blocks", "Advisor view"],
      },
      {
        id: "concerns",
        name: "Concerns the data shows",
        wide: true,
        when: (c) => c.data.persona.concerns.length > 0,
        picks: ["Backend: choosing blocks", "Advisor view"],
      },
      {
        id: "tensions",
        name: "Where concerns pull against each other",
        wide: true,
        when: (c) => c.data.persona.tensions.length > 0,
        picks: ["Backend: choosing blocks", "Couples"],
      },
      {
        id: "unknowns",
        name: "What we don't know yet",
        wide: true,
        says: () => "The plan answers what it can calculate. What keeps you up at night is the first thing I'd like to hear.",
        picks: ["The worry nobody asked about", "Opening"],
      },
    ],
  },
  {
    id: "act",
    name: "Explain and act",
    about: "Words at each person's depth, one first step, and the plan's assumptions.",
    blocks: [
      {
        id: "terms",
        name: "Words explained",
        wide: true,
        says: (c) => (c.depth === "plain" ? "A few words from your plan, in plain terms." : "A few terms from your plan, with the detail."),
        picks: ["Any jargon question", "New to finance or expert"],
      },
      {
        id: "first-step",
        name: "First step",
        when: (c) => has(c.data.firstStep.title),
        says: (c) => `One step to start with: ${c.data.firstStep.title.replace(/^\w/, (x) => x.toLowerCase())}.`,
        picks: ["Closing", "Ready to act"],
      },
      {
        id: "assumptions",
        name: "What the plan assumes",
        wide: true,
        picks: ["Experts", "How sure is this?"],
      },
    ],
  },
];

export const applicable = (c: Ctx) =>
  sections.map((s) => ({ ...s, blocks: s.blocks.filter((b) => !b.when || b.when(c)) })).filter((s) => s.blocks.length > 0);
