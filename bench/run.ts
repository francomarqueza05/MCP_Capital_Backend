// npm run bench                      all three benchmarks
// npm run bench -- translate brief    only some of them
// BENCH_REPS=3 npm run bench -- agent  more repetitions
// Writes bench/results/<timestamp>.json and .md, and prints the tables.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { benchAgent } from "./agent";
import { benchBrief } from "./brief";
import { ms, usd } from "./lib";
import { benchTranslate } from "./translate";

const PROXY_MODELS = ["gemini-3.5-flash-lite", "gpt-5-mini", "deepseek-flash"];
const AGENT_MODELS = (process.env.BENCH_AGENT_MODELS ?? "gemini-3.5-flash,gemini-3.5-flash-lite,gemini-3.1-flash-lite,gpt-5.4-mini,claude-haiku-5-5,deepseek-v41-flash").split(",");
const reps = Number(process.env.BENCH_REPS ?? 2);
const only = process.argv.slice(2);
const want = (k: string) => !only.length || only.includes(k);

const fmt = (n: unknown, d = 1) => (typeof n === "number" && Number.isFinite(n) ? n.toFixed(d) : "n/a");
const table = (head: string[], rows: (string | number)[][]) =>
  [`| ${head.join(" | ")} |`, `|${head.map(() => "---").join("|")}|`, ...rows.map((r) => `| ${r.join(" | ")} |`)].join("\n");

async function main() {
  const out: Record<string, unknown> = { at: new Date().toISOString(), reps };
  const md: string[] = [`# Model benchmarks, ${new Date().toISOString().slice(0, 16).replace("T", " ")}`, ""];

  if (want("translate")) {
    console.log("translate…");
    const r = await benchTranslate(PROXY_MODELS, { judgeSample: 4 });
    out.translate = r;
    md.push(
      "## Translation to Spanish (Spain), per phase packet",
      "",
      table(
        ["Model", "Figures kept", "Fidelity /5", "Natural /5", "LatAm words", "Bad JSON", "p50", "p95", "Cost / 1000 packets"],
        r.map((x) => [x.model, `${fmt(x.figuresKeptPct)}%`, fmt(x.fidelity), fmt(x.natural), x.latamWords.join(", ") || "none", x.badJson + x.errors, ms(x.p50), ms(x.p95), usd(x.costPer1000Batches)]),
      ),
      "",
    );
  }

  if (want("brief")) {
    console.log("brief…");
    const r = await benchBrief(PROXY_MODELS, { reps });
    out.brief = r;
    md.push(
      "## Advisor brief",
      "",
      table(
        ["Model", "Faithful /5", "Useful /5", "Spanish /5", "Invented figures", "Names the worry", "Bad JSON", "p50", "p95", "Cost / 1000"],
        r.map((x) => [x.model, fmt(x.faithful), fmt(x.useful), fmt(x.spanish), `${fmt(x.inventedFiguresPct, 0)}%`, `${fmt(x.mentionsWorryPct, 0)}%`, x.badJson + x.errors, ms(x.p50), ms(x.p95), usd(x.costPer1000)]),
      ),
      "",
    );
  }

  if (want("agent")) {
    console.log("agent…");
    const r = await benchAgent(AGENT_MODELS, { reps });
    out.agent = r;
    md.push(
      "## Live agent LLM (text-only, voice adds a constant ~0.55 s)",
      "",
      table(
        ["Model", "Faithful /5", "Spain Spanish /5", "Voice /5", "Boundaries /5", "Flow /5", "Invented numbers", "Read its instructions aloud", "phase_done / conv", "First token p50", "p95", "Server first reply p50", "Full reply p50", "LLM $ / conv", "Credits / conv"],
        r.map((x) => [
          x.model,
          fmt(x.faithful),
          fmt(x.spanish_es),
          fmt(x.voice),
          fmt(x.boundaries),
          fmt(x.flow),
          x.inventedNumbers,
          x.leakedBrief,
          fmt(x.phaseDoneCalls),
          ms(x.firstTokenP50),
          ms(x.firstTokenP95),
          ms(x.serverLlmTtfbP50),
          ms(x.fullReplyP50),
          x.llmUsdPerConversation ? usd(x.llmUsdPerConversation) : "n/a",
          fmt(x.creditsPerConversation, 0),
        ]),
      ),
      "",
    );
  }

  const dir = join("bench", "results");
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
  writeFileSync(join(dir, `${stamp}.json`), JSON.stringify(out, null, 1));
  writeFileSync(join(dir, `${stamp}.md`), md.join("\n"));
  console.log("\n" + md.join("\n"));
  console.log(`\nSaved bench/results/${stamp}.md`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
