"use client";
// What Cordi is saying, set straight on the sky: where we are, and the words appearing as
// they are spoken (on the voice's own timing when there is a recording).
import type { ReactNode } from "react";
import type { Step } from "./steps";

export type Line = {
  text: string;
  voice?: string;
  title?: string;
  label?: string;
  status?: Step["status"];
  step?: number;
  times?: number[];
  key?: number;
  /** The whole line is out (tapped, or done appearing): words show at once, and ▼ invites a tap. */
  whole?: boolean;
};

export function Narration({ line, total, hidden, actions }: { line: Line | null; total: number; hidden?: boolean; actions?: ReactNode }) {
  // what Cordi says shows in its bubble; here only where we are, and what to do
  if (!line || line.title === undefined) return <div className="narr" aria-live="polite" />;
  const titled = line.title !== undefined;
  return (
    <div className={`narr${titled ? " titled" : " intro"}${hidden ? " hidden" : ""}`} aria-live="polite" key={line.key}>
      {titled && (
        <header className="narr-head">
          <p className="narr-where">{line.step === 0 ? "Campamento base" : line.step === total - 1 ? "La cima" : `Campamento ${line.step} de ${total - 2}`}</p>
          <h2 className="narr-title">{line.title}</h2>
          <p className={`narr-label t-${line.status}`}>{line.label}</p>
        </header>
      )}
      {actions && <div className="narr-actions">{actions}</div>}
    </div>
  );
}
