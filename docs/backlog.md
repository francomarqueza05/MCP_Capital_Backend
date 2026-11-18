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
- [x] Code: `ELEVENLABS_AGENT_ID_EN` and `VOICE_ID_EN` in `.env` are used for English. Without them, the Spanish agent runs with `language: en` (override) and the voice stays the same.
- [!] Create the agent. From this machine `api.elevenlabs.io` timed out on 18 Nov, so it was not done. Steps: duplicate "Cordada guide" in ElevenLabs, set language English, pick a native English voice (eleven_v3_conversational), set the first message to "Hi {{name}}! I'm Cordi…", and put its id in `ELEVENLABS_AGENT_ID_EN`. Put the same voice in `VOICE_ID_EN`.

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
- [ ] Each partner answers their risk comfort and Cordi shows where they agree.

## P1: if there is time
- [ ] Big amounts in everyday terms ("$2.37M = X years of what you spend today").
- [ ] Expert mode: shorter explanations and the Sherpas terms.

## Hand-in and demo
- [x] README in English with the language option and the demo controls.
- [x] `docs/entrega.md`: one page on what we built and why.
- [x] `docs/pitch.md`: script for the 2-minute video and the pitch.
- [ ] Full test by hand on all 4 cases in EN and ES (screen, voice, microphone).
