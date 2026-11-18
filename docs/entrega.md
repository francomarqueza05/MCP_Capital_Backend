# Cordada: what we built and why

**Cordada turns a family's Sherpas plan into a mountain they climb with Cordi, a guide that talks.** Each part of the analysis is a camp with a flag. The summit is the one step that lifts them most, and they leave the summit having promised themselves to do it, by a date.

## The problem we chose

Sherpas already does the math. What still happens by hand is the explanation, and after it, the doing. A plan is a lot to take in alone. Hard news makes people look away (Michael's 26). Two partners want different things (the Weahs). A week later most of it is forgotten. We built for the whole arc: understand it, decide, act, and come back.

## What it does

- **It captivates in seconds.** Cordi flies in, the mountain draws itself, and every camp shows one figure that says it all. Nothing to read before it starts.
- **Explain this to me.** At each camp Cordi explains step by step, by voice (a live call you can interrupt) or by chat. Each sentence builds its chart while it is said. "I don't get it" says it again, more simply, with an everyday picture.
- **For beginners and experts.** Plain words and pictures first (the escalator that goes down, the spare tyre). Interactive scenes let you try changes: pay more on the card and see when it's gone.
- **Made for them.** Their names, their kids, their numbers. Couples are spoken to as a couple, and life cover is shown person by person.
- **They act.** At the summit they pick the first step (the biggest lift comes first) and see what changes in their life ("about $270 a month stops going to interest"). They get it in three or four small steps and choose a date. A couple only commits when both say "I'm in". It goes into their calendar, with a reminder the day before.
- **The days after.** Cordi remembers. On day 3 or day 30: "Welcome back. You committed to paying off the card. Did you do it?" Yes: the new score and the next step. Not yet: what got in the way, something smaller to do today, and a new date.
- **English by default, Spanish as an option**, with the voice, the AI and the numbers in each language.

## Rules we kept

- **Every figure comes from the case data.** The AI explains in its own words but never invents a number: the screens and the prompts are built from the case.
- **The app decides what's on screen, the AI only talks.** Voice and visuals never drift apart.
- **It never gets stuck.** No AI, no voice or no microphone: it carries on with recorded lines, the local call or the chat. "Continue" always works.

## What we ruled out, and why

- **Another dashboard or a "Wrapped" summary.** They show the plan; they don't get anyone to act.
- **A chatbot only.** Sherpas already has a chat. A blank box puts the effort on the family.
- **Scores and percentages as the headline.** They don't say if something is good or bad. Instead: months of cushion, years until savings run out, dollars a month.

## How to run it

See the README: `npm install`, `npm run dev`, open `http://localhost:3100`. `?lang=es` switches to Spanish, `?days=30` shows the return 30 days later, `?reset=1` starts a family over.
