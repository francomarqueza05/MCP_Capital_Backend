# Backlog: from good to winning

Branch `ganar-hackathon`. Hand-in **18 Nov 23:59** (repo, MVP, 2-minute video, one page). Demo **19 Nov 12:45**.

Judging (from the Sherpas brief): Captivating 20 · Understanding 20 · **Motivation to act 20** · Personal 15 · Creativity 15 · Friday plan 10 · bonus for "the days after".

Status: `[ ]` to do · `[~]` in progress · `[x]` done · `[!]` needs a person.

## P0: before the hand-in

### 1. English by default, Spanish as an option
- [x] `src/lib/lang.ts`: `tr(en, es)`; the language comes from `?lang=` or the `cordada.lang` cookie, and switching reloads the page.
- [x] EN/ES switch on the profile picker and in the top bar.
- [x] Case data in English (`src/data/cases.en.ts`, applied by `localize()`).
- [x] Every text the person sees: route, steps, questions, panels, scenes, chat, call, remarks.
- [x] Number format follows the language.
- [x] Server: `/api/ask`, `remark`, `suggest`, the agent's briefs and tools read the cookie (`src/server/lang.ts`) and answer in English.
- [x] Voice: `/api/tts` takes `lang` (language code, voice and cache per language). The stock lines exist in English.

### 2. English ElevenLabs agent
- [x] English voice: `VOICE_ID_EN=EXAVITQu4vr4xnSDxMaL` (Sarah, ElevenLabs premade, American; checked with a TTS call). Narrations and the local call use it.
- [x] In English the live agent runs only if `ELEVENLABS_AGENT_ID_EN` exists; otherwise the local call with the native voice. After a failed session the agent is skipped for 2 minutes, so nothing waits on it.
- [x] English agent `agent_7601m7qqnx3xekkverd5ym9x6xfr` (copy of the Spanish one, English, voice Sarah), created with `scripts/agent-en.mjs`; `.env` marks it ready (`ELEVENLABS_AGENT_EN_READY=1`). Until then the app does not use it, so Cordi never changes voice mid-way.

### 3. The conversation never gets stuck
- [x] "Continue" is always active: while Cordi talks it skips to the next step; on the last step it closes the camp.
- [x] The agent session opens within 12 s or the local call takes over; the session and tool fetches time out.
- [x] If the agent is silent 6.5 s after a block, it gets a nudge; still silent, the step is freed for "Continue".
- [x] If the WebSocket drops mid-camp, the explanation carries on from the same step with the local call (`continueWithoutAgent`).
- [x] A voice that takes more than 9 s is replaced by the bubble at reading pace; audio that stops advancing for 4 s ends the line.

### 4. Summit = commitment (Motivation to act)
- [x] `src/commit/Commit.tsx`: pick the step (biggest lift first), what it changes in their life (case figures only), how in 3–4 small steps, a date, and for a couple both say "I'm in".
- [x] Add to calendar (`.ics` with the steps and a reminder the day before), a checklist to tick off, "Done!" → Cordi celebrates and proposes the next step.

### 5. Coming back on day 3 or day 30 (bonus)
- [x] `src/commit/memory.ts`: progress, flags and the plan saved per family in the browser.
- [x] `src/commit/WelcomeBack.tsx`: "Welcome back, it's been N days. Did you do it?" Yes → new score and next step. Not yet → why? → a smaller step for today and a new date.
- [x] Demo clock: `?days=30` in the link, or Shift+T (+3 days). `?reset=1` starts a family over.

### 6. Couples: one plan, two people (Personal)
- [x] The commitment only counts when both partners say "I'm in" ("Waiting for Melanie…").
- [x] Each partner answers their risk comfort on the investments camp; Cordi says where they agree (`src/commit/Couple.tsx`).

## P1: if there is time
- [x] Big amounts as years of household spending (retirement gap, missing life cover).
- [ ] Expert mode: shorter explanations and the Sherpas terms.

## Hand-in and demo
- [x] README in English with the language option and the demo controls.
- [x] `docs/entrega.md`: one page on what we built and why.
- [x] `docs/pitch.md`: script for the 2-minute video and the pitch.
- [x] Browser run (Edge, headless) for the Weahs in EN and ES: picker, tour, investments couple widget, summit commitment, return on day 30, no console errors.
- [ ] By hand, with sound and microphone: the live call and the other 3 cases.

## Voice and AI hardening (18 Nov)
- [x] One voice per language: narrations, local call and live agent share the voice; TTS model `eleven-v4` by default (the one the Castilian voice is tuned for).
- [x] `npm test`: everything Cordi says without AI, 4 cases × EN/ES (no broken text, no mixed language, no empty step), go-ahead detection, figures read aloud.
- [x] `npm run test:ai`: 12 real conversations × EN/ES with the real models (spoilers, unexplained camps, stock tips, prompt injection, panic, "huh?", wrong language, dying, couple disagreement, repeating, gibberish, asking for a human), plus suggestions, remarks, bad input and every agent brief. Rule checks (language, invented figures, forbidden figures) and a judge model. 32/32 on the last run; the judge itself is occasionally wrong, so a single red test needs reading, not just rerunning.
- [x] Fixes found by those tests: hard moments (`HARD_MOMENTS`, `momentHint` in `src/server/cordi.ts`) go to chat, map and the live agent; temperature 0.9 → 0.6; suggestions merged into one line are split.
