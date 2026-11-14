// Storage behind the API. Every read and write is scoped to one member of one household
// (case_id + member_id in the WHERE clause), so a query can never return someone else's data.
import { randomUUID } from "node:crypto";
import type { SessionState } from "../engine/engine";
import type { Db } from "./db";

export type Owner = { caseId: string; memberId: string };

export type Session = Owner & { id: string; createdAt: string; updatedAt: string; state: SessionState; summary: string | null };

export type Checkin = { at: string; note: string | null };
export type Goal = Owner & {
  id: string;
  title: string;
  detail: string;
  due: string | null;
  status: "open" | "done";
  createdAt: string;
  checkins: Checkin[];
};

export interface Store {
  createSession(o: Owner, state: SessionState): Promise<Session>;
  getSession(o: Owner, id: string): Promise<Session | null>;
  saveSession(o: Owner, id: string, state: SessionState, summary?: string | null): Promise<Session | null>;
  listSessions(o: Owner): Promise<Session[]>;
  createGoal(o: Owner, g: Pick<Goal, "title" | "detail" | "due">): Promise<Goal>;
  listGoals(o: Owner): Promise<Goal[]>;
  checkin(o: Owner, id: string, note: string | null, done: boolean): Promise<Goal | null>;
  /** Product analytics: what happened in a conversation (phase reached, tool calls, latency). */
  logEvent(o: Owner, kind: string, data: Record<string, unknown>, sessionId?: string): Promise<void>;
  /** Advisor view: everything in one household. Server key only. */
  household(caseId: string): Promise<{ sessions: Session[]; goals: Goal[] }>;
}

type Row = Record<string, unknown>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v));
const day = (v: unknown) => (v == null ? null : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));
const json = <T,>(v: unknown): T => (typeof v === "string" ? JSON.parse(v) : (v as T));

const toSession = (r: Row): Session => ({
  id: String(r.id),
  caseId: String(r.case_id),
  memberId: String(r.member_id),
  state: json<SessionState>(r.state),
  summary: (r.summary as string | null) ?? null,
  createdAt: iso(r.created_at),
  updatedAt: iso(r.updated_at),
});

export class SqlStore implements Store {
  constructor(private db: Db) {}

  async createSession(o: Owner, state: SessionState) {
    const [r] = await this.db.query(
      `insert into sessions (id, case_id, member_id, state) values ($1, $2, $3, $4::jsonb) returning *`,
      [randomUUID(), o.caseId, o.memberId, JSON.stringify(state)],
    );
    return toSession(r);
  }

  async getSession(o: Owner, id: string) {
    if (!UUID.test(id)) return null;
    const [r] = await this.db.query(`select * from sessions where id = $1 and case_id = $2 and member_id = $3`, [id, o.caseId, o.memberId]);
    return r ? toSession(r) : null;
  }

  async saveSession(o: Owner, id: string, state: SessionState, summary?: string | null) {
    if (!UUID.test(id)) return null;
    const [r] = await this.db.query(
      `update sessions set state = $4::jsonb, summary = coalesce($5, summary), updated_at = now()
       where id = $1 and case_id = $2 and member_id = $3 returning *`,
      [id, o.caseId, o.memberId, JSON.stringify(state), summary ?? null],
    );
    return r ? toSession(r) : null;
  }

  async listSessions(o: Owner) {
    const rows = await this.db.query(`select * from sessions where case_id = $1 and member_id = $2 order by updated_at desc`, [o.caseId, o.memberId]);
    return rows.map(toSession);
  }

  private async goalsWhere(where: string, params: unknown[]): Promise<Goal[]> {
    const goals = await this.db.query(`select * from goals where ${where} order by created_at`, params);
    if (!goals.length) return [];
    const checks = await this.db.query(`select goal_id, at, note from checkins where goal_id = any($1::uuid[]) order by at`, [goals.map((g) => g.id)]);
    return goals.map((g) => ({
      id: String(g.id),
      caseId: String(g.case_id),
      memberId: String(g.member_id),
      title: String(g.title),
      detail: String(g.detail),
      due: day(g.due),
      status: g.status as Goal["status"],
      createdAt: iso(g.created_at),
      checkins: checks.filter((c) => String(c.goal_id) === String(g.id)).map((c) => ({ at: iso(c.at), note: (c.note as string | null) ?? null })),
    }));
  }

  async createGoal(o: Owner, g: Pick<Goal, "title" | "detail" | "due">) {
    const id = randomUUID();
    await this.db.query(`insert into goals (id, case_id, member_id, title, detail, due) values ($1, $2, $3, $4, $5, $6)`, [
      id,
      o.caseId,
      o.memberId,
      g.title,
      g.detail,
      g.due,
    ]);
    return (await this.goalsWhere(`id = $1`, [id]))[0];
  }

  listGoals(o: Owner) {
    return this.goalsWhere(`case_id = $1 and member_id = $2`, [o.caseId, o.memberId]);
  }

  async checkin(o: Owner, id: string, note: string | null, done: boolean) {
    if (!UUID.test(id)) return null;
    const [g] = await this.db.query(`select id from goals where id = $1 and case_id = $2 and member_id = $3`, [id, o.caseId, o.memberId]);
    if (!g) return null;
    await this.db.query(`insert into checkins (goal_id, note) values ($1, $2)`, [id, note]);
    if (done) await this.db.query(`update goals set status = 'done' where id = $1`, [id]);
    return (await this.goalsWhere(`id = $1`, [id]))[0];
  }

  async logEvent(o: Owner, kind: string, data: Record<string, unknown>, sessionId?: string) {
    await this.db.query(`insert into events (case_id, member_id, session_id, kind, data) values ($1, $2, $3, $4, $5::jsonb)`, [
      o.caseId,
      o.memberId,
      sessionId && UUID.test(sessionId) ? sessionId : null,
      kind,
      JSON.stringify(data),
    ]);
  }

  async household(caseId: string) {
    const sessions = (await this.db.query(`select * from sessions where case_id = $1 order by updated_at desc`, [caseId])).map(toSession);
    const goals = await this.goalsWhere(`case_id = $1`, [caseId]);
    return { sessions, goals };
  }
}

// The store the server uses, set once at start-up (or by a test).
let current: Store | null = null;
export function useStore(s: Store) {
  current = s;
}
export function getStore(): Store {
  if (!current) throw new Error("Store not initialised: call useStore() at start-up");
  return current;
}
