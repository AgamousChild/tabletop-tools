# SOUL

## Why I'm Building This

For the first time in years, I'm building something for myself.

Not for a client. Not for a deadline. Not for someone else's roadmap.

This is for the people who sit around a table and roll dice and fight battles with armies, Not TTRPG, but TTMWG, Tabletop miniature wargaming, Warhammer, for folks who've suspected for years that something wasn't right with a particular set. NoCheat gives them a real answer, backed by real math.

The goal is simple: useful, unique, honest, and lean. Nothing more.

Built for myself first. If it works for others, it goes on GitHub — open source, self-hostable, no strings. No business to run. No server bills to worry about.

---

## What It Does

NoCheat analyzes photographs or video of dice rolls — 2 to 8 dice at a time — and uses computer vision to read pip values without storing a single image. Extract, analyze, discard. No hoarding.

Those values feed into a statistical engine that computes Z-scores against the expected uniform distribution for fair dice. Over time, across multiple rolls and sessions, the picture gets clearer. You name your dice sets. You track your sessions. The math tells you the truth.

Single-user at its core: who you are, your dice, your sessions.

---

## How We Build

**Lean by design.** Few layers. A lean database. No bloat. If a feature isn't needed yet, it doesn't exist yet.

**Agile.** Build quickly, ship working pieces, iterate. A thing that works today beats a perfect thing that ships never.

**Evidence over intuition.** Statistics drive decisions — not hunches, not gut feelings, not "probably fine."

**Do one thing well.** No convolution. No feature creep. NoCheat detects loaded dice. That's it.

**Respect the user.** Real math, a responsive UI, easy to use. The complexity lives inside; the surface stays clean.

**No hoarding.** We don't store what we don't need. Photos stay local or are discarded. The only data we keep is the data that matters.

---

## What Done Looks Like

Done doesn't mean perfect. Done means it works.

Every session ends when the thing we set out to build works — not when every edge case is handled, not when the code is polished to a mirror finish. We stop when it works. We come back when there's a real reason to.

We validate statistically before claiming anything. We add no features we don't need yet. We know exactly what we're solving before we touch anything.

---

## The Stack We Trust

- **TypeScript** throughout — front to back, no exceptions
- **React** for the UI — clean, clear, uncluttered, easy to use
- **Lean database** — SQLite or a distributed equivalent; no heavy ORM
- **Computer vision layer** — reads dice values from photo or video input
- **Statistical engine** — Z-score analysis against uniform distribution
- **Deploy cheaply** — Cloudflare Workers/Pages free tier, personal use, near-zero cost

The hardware path — Arduino with a camera module, rolling dice into a box, edge-device analysis — is a real future option. Not MVP. Not forgotten.

---

## Autonomy in the Implementation Phase

When we are in the implementation phase, and everything is operating normally, as intended, or it's a simple process that just needs approval — go ahead with it. Get what you need, get your dependencies, run your tests, fix your mistakes. If you are asking me every step "Do you want to proceed?" you are doing it wrong.

The exception to that rule is system and environmental problems. If a tool is misbehaving, a dependency won't resolve, or something in the environment is broken — stop. Don't continue to try workarounds and quick fixes. Find out what the overall issue is and fix that. For the `C:\R\tabletop-tools` folder and the associated repo, you are authorized to act.

If you are fighting with a system issue and try three different fixes without success, put it on a list and move on. I will check in with you, and you can bring that list to me, and we can work on it together.

---

## The CLAUDE.md Feedback Loop

Every app in this platform has a CLAUDE.md. These are living documents, not one-time design writeups. After every implementation phase, they get updated to reflect what actually exists.

**The loop:**
```
Plan → Build → Test → Update CLAUDE.md → Next phase
```

**What triggers an update:**
- A phase of implementation completes (scaffold, schema, routers, UI)
- A design decision gets settled during implementation that differs from what was planned
- Something turns out to work differently than the doc describes

**What a CLAUDE.md must contain:**
- What this app is and why it exists — traceable to SOUL.md
- Current state: what's built, what's planned, what's not started
- Actual file structure (real paths, real port numbers)
- Architecture decisions that were made, not just proposed
- Test coverage: what tests exist and what they verify
- Known limitations or design trade-offs

**Alignment check:**
Before closing out a phase, check: does every decision in the CLAUDE.md trace back to a principle in SOUL.md? If a decision exists that doesn't — it either needs a principle behind it, or it shouldn't be there.

The CLAUDE.md files are the connective tissue between what was planned and what was actually built. Keep them honest.

---

## How Claude and I Work Together

Plan before touching anything. Evaluate the full architecture. Understand every layer. Then — and only then — suggest changes.

Think before acting. Slow down. Consider the whole picture. Make sure any change fits smoothly within what already exists.

No rushing. Smooth and deliberate. Not too fast, not too harsh.

Educated plans only. No jumping into code without a well-thought-out implementation plan.

Efficiency over speed. Solve problems the right way, not the quick way.
