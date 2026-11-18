// The households, read from the Sherpas MCP (MCP_URL, MCP_TOKEN): every case it lists, each
// turned into what the app shows by detect(). Kept in memory for a while, so a page or a
// question doesn't wait on the MCP each time. If the MCP can't be reached (no token, an
// expired one, a timeout), the copy bundled with the app (src/data/cases.json, made from the
// same MCP) stands in, so the app never opens without its families.
import raw from "@/data/cases.json";
import { setCases, type Case } from "@/data/cases";
import { env } from "./env";
import { detect } from "./mcp-detect";

const FRESH_MS = 10 * 60_000; // how long a read stays good
const RETRY_MS = 60_000; // after a failure, how long before the MCP is asked again
const CALL_MS = 8000; // per call to the MCP

const bundled = raw as unknown as Record<string, Case>;

type Loaded = { cases: Record<string, Case>; source: "mcp" | "bundled"; at: number; error?: string };
let last: Loaded | null = null;
let inflight: Promise<Loaded> | null = null;

/** Where the households came from last time (for /api/status). */
export const casesSource = () => last?.source ?? "bundled";

async function fromMcp(): Promise<Record<string, Case>> {
  const url = env.mcpUrl;
  const token = env.mcpToken;
  if (!url || !token) throw new Error("MCP_URL / MCP_TOKEN not set");
  let session: string | null = null;
  let id = 1;
  const rpc = async (method: string, params: unknown) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", Authorization: `Bearer ${token}`, ...(session ? { "mcp-session-id": session } : {}) },
      body: JSON.stringify({ jsonrpc: "2.0", id: id++, method, params }),
      signal: AbortSignal.timeout(CALL_MS),
    });
    if (!res.ok) throw new Error(`${method}: ${res.status} ${(await res.text()).slice(0, 120)}`);
    session = res.headers.get("mcp-session-id") ?? session;
    // a plain JSON reply, or a server-sent event whose data line holds it
    const text = await res.text();
    const line = text.split("\n").find((l) => l.startsWith("data:"));
    const msg = JSON.parse(line ? line.slice(5) : text);
    if (msg.error) throw new Error(`${method}: ${msg.error.message ?? "error"}`);
    return msg.result;
  };
  const tool = async (name: string, args: Record<string, string>) => {
    const r = await rpc("tools/call", { name, arguments: args });
    if (r?.isError) throw new Error(`${name}: ${String(r.content?.[0]?.text ?? "error").slice(0, 120)}`);
    return (r.content as { text: string }[]).map((c) => c.text).join("\n");
  };

  await rpc("initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "cordada", version: "0.1" } });
  const list: { id: string }[] = JSON.parse(await tool("list_cases", {}));
  const out: Record<string, Case> = {};
  // one case after the other: the MCP serves a session one request at a time
  for (const { id: caseId } of list) {
    const fh = JSON.parse(await tool("get_case", { caseId, part: "financial-health" }));
    const ia = JSON.parse(await tool("get_case", { caseId, part: "investment-analysis" }));
    const c = detect(fh, ia) as unknown as Case & { topics: { detail?: unknown }[] };
    for (const t of c.topics) delete t.detail; // the app doesn't use the detail table
    out[c.id] = c;
  }
  if (!Object.keys(out).length) throw new Error("the MCP listed no cases");
  return out;
}

/**
 * The households, from the MCP (kept fresh for a while) or else the bundled copy. Also puts
 * them where the rest of the server reads them (setCases), so it's awaited before any route
 * looks a family up.
 */
export async function loadCases(): Promise<Record<string, Case>> {
  const now = Date.now();
  const good = last && (last.source === "mcp" ? now - last.at < FRESH_MS : now - last.at < RETRY_MS);
  if (!good) {
    inflight ??= fromMcp()
      .then((cases): Loaded => ({ cases, source: "mcp", at: Date.now() }))
      .catch((e): Loaded => {
        const error = e instanceof Error ? e.message : String(e);
        // the last good read from the MCP, if there was one, before the bundled copy
        if (last?.source === "mcp") return { ...last, at: Date.now() - FRESH_MS + RETRY_MS, error };
        console.error("cases: MCP unavailable, using the bundled copy:", error);
        return { cases: bundled, source: "bundled", at: Date.now(), error };
      })
      .finally(() => {
        inflight = null;
      });
    last = await inflight;
  }
  setCases(last!.cases);
  return last!.cases;
}
