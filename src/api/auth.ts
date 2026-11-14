// Who is calling. Families use the token from their personal link; Sherpas' own servers
// (advisor views) use the server key.
import type { MiddlewareHandler } from "hono";
import { isServerKey, readToken } from "../auth/token";
import { getCase, type CaseData, type Member } from "../cases/load";
import type { Owner } from "../store/store";
import { ApiError } from "./errors";

export type Caller = { caseData: CaseData; member: Member; owner: Owner };
export type Env = { Variables: { caller: Caller } };

/** `Authorization: Bearer <member token>`, or `?t=<token>` for links opened in a browser. */
export const memberAuth: MiddlewareHandler<Env> = async (c, next) => {
  const header = c.req.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : c.req.query("t");
  const claims = readToken(token);
  if (!claims) throw new ApiError(401, "unauthorized", "Missing or invalid member token.");
  const caseData = getCase(claims.caseId);
  const member = caseData?.members.find((m) => m.id === claims.memberId);
  if (!caseData || !member) throw new ApiError(401, "unauthorized", "This link no longer matches a household member.");
  c.set("caller", { caseData, member, owner: { caseId: claims.caseId, memberId: claims.memberId } });
  await next();
};

/** `x-api-key: <SERVER_KEY>`. */
export const serverAuth: MiddlewareHandler = async (c, next) => {
  if (!isServerKey(c.req.header("x-api-key") ?? null)) throw new ApiError(401, "unauthorized", "Missing or invalid server key.");
  await next();
};
