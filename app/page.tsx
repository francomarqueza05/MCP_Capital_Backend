import { cookies } from "next/headers";
import { Experience } from "@/Experience";
import { asLang, LANG_COOKIE } from "@/lib/lang";
import { loadCases } from "@/server/mcp";

// English unless the link (?lang=es) or the remembered choice says Spanish.
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = (await searchParams).lang;
  const lang = asLang(typeof q === "string" ? q : (await cookies()).get(LANG_COOKIE)?.value);
  // the households, read from the Sherpas MCP on the server and handed to the browser
  const cases = await loadCases();
  return <Experience lang={lang} cases={cases} />;
}
