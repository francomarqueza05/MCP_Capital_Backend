# Backlog: from good to winning

Branch `ganar-hackathon`. Hand-in **18 Nov 23:59** (repo, MVP, 2-minute video, one page). Demo **19 Nov 12:45**.

Judging (from the Sherpas brief): Captivating 20 · Understanding 20 · **Motivation to act 20** · Personal 15 · Creativity 15 · Friday plan 10 · bonus for "the days after".

Status: `[ ]` to do · `[~]` in progress · `[x]` done.

## P0: before the hand-in

### 1. English by default, Spanish as an option
- [ ] `src/lib/lang.ts`: `lang` store (`en` | `es`), read from `?lang=` and `localStorage`. `tr(en, es)` helper. The app remounts when the language changes, so everything built from the case rebuilds.
- [ ] EN/ES switch in the top bar and on the profile picker.
- [ ] Case data in English: an overlay for topic titles, labels, headlines, pillar names and goals (`src/data/cases.en.ts`).
- [ ] Every text the person sees: `copy.ts`, `talk.ts`, `steps.ts`, `beats.ts`, `qa-bank.ts`, `remarks.ts`, `confirm.ts`, `player.ts`, the UI components and the scenes.
- [ ] Number format follows the language (`$1.43M` in English, `$1,43 M` in Spanish).
- [ ] Server: `/api/ask`, `/api/remark`, `/api/suggest`, the agent's briefs (`cordi.ts`, `brief.ts`, `map.ts`, `knowledge.ts`, `agent/tool`) answer in the person's language.
- [ ] Recorded narrations (intro and so on): an English set, or live TTS with cache when there is no recording.

### 2. English ElevenLabs agent
- [ ] A copy of "Cordada guide" with English as its language and a native English voice. `ELEVENLABS_AGENT_ID_EN`.
- [ ] `/api/agent/session` picks the agent by language. The Spanish one stays as is.
- [ ] `VOICE_ID_EN` for narrations and the local call in English.

### 3. The conversation never gets stuck
- [ ] Map every place where screen and voice wait on each other (`player.ts`, `agent.ts`, `call.ts`).
- [ ] Watchdogs: if the agent says nothing for N seconds after `show_block` or after a step, the app narrates the step itself and continues.
- [ ] If the WebSocket drops or the agent fails to open, reconnect once and then switch to the local call, without losing the step.
- [ ] Every agent tool answers within a time limit, with a fallback.
- [ ] "Continue" always works, even while Cordi is talking.

### 4. Summit = commitment (Motivation to act)
- [ ] At the summit, Cordi proposes the first step. The person accepts it and picks a date.
- [ ] "Add to my calendar" (`.ics` file, no backend) with the step and how to do it.
- [ ] "What if": the score before and after the step, and what it changes in their life, using only the case's figures.
- [ ] A checklist of concrete sub-steps for each kind of move (for example, life cover: get quotes, choose term, sign).

### 5. Coming back on day 3 or day 30 (bonus)
- [ ] Save progress per case: flags planted, the chosen step, its date, what was understood.
- [ ] On return, Cordi welcomes them back: what they saw, the step they chose and "did you do it?". Done = celebration and the next step. Not done = what is stopping you?
- [ ] A hidden demo control that moves time forward (+3 days, +30 days) to show it in the pitch.

### 6. Couples: one plan, two people (Personal)
- [ ] Each partner answers on their own (for example, how much risk they are comfortable with). Cordi shows where they agree and where they don't.
- [ ] Each partner accepts the step. "Waiting for Melanie" until both have.

## P1: if there is time

### 7. Figures that mean something
- [ ] Big amounts in everyday terms: "$2.37M = X years of what you spend today", calculated from the case's own data.

### 8. Expert mode
- [ ] An "I know finance" switch: shorter explanations, raw figures and the Sherpas terms.

## P0: hand-in and demo
- [ ] README in English: what it is, how to run it, and the language option.
- [ ] One page on what we built and why.
- [ ] Script for the 2-minute video and the pitch: the problem, Cordi in 20 s, the commitment, the return on day 30 and the close.
- [ ] Full test on all 4 cases in EN and ES: `npm run typecheck`, `npm run build`.
