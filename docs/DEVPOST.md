# Devpost submission draft

Copy each section into the matching Devpost field. Everything below is stated as measured in this repo; numbers come from `npm run eval` (sample data, 60 random groups) and `npm run smoke:live` (real Qloo).

## Hackathon requirements checklist (Qloo Agentic Hackathon, deadline Oct 30, 2026, 11:45pm EDT)

- [x] Working application that integrates the Qloo API (live `/search`, `/v2/tags`, `/v2/insights`)
- [x] Public code repository: https://github.com/jenish1345/TasteBridge-Groups
- [x] Open-source license: MIT (`LICENSE`)
- [ ] **Live, externally hosted demo URL** (deploy with the button in the README, then paste the URL below)
- [ ] Demo video (use `docs/DEMO_SCRIPT.md`; confirm on the Devpost page whether it is required)
- [ ] Confirm the final rules and criteria on https://qloo.devpost.com/ (the page blocks automated reading)

## Project name and tagline

**TasteBridge Groups.** The taste diplomat for real-life plans.

## Elevator pitch (one or two sentences)

Planning a night out for five people usually ends with the loudest voice winning or a bland compromise nobody loves. TasteBridge Groups uses Qloo's Taste AI to find where a group's tastes clash, bridge those conflicts, and build an evening where everyone gets a stop that fits them.

## Inspiration

Group plans fail in a predictable way: tastes are averaged, and the person with the most unusual taste gets steamrolled. Qloo knows how tastes relate across music, film, food and places, which is exactly what you need to reason about a *group* instead of one person. We started from a two-person "common ground" agent and asked what changes at five people with real conflicts.

## What it does

- Seat 2 to 8 guests and give each a few things they love (artists, films, shows, books, games, brands, foods, places, vibes) and hard no's. Mark a guest of honor.
- The agent resolves each anchor to a real Qloo entity, asks Qloo what each person would enjoy at every stop, and measures where tastes conflict on five scales: loud vs quiet, spicy vs mild, nightlife vs family-friendly, experimental vs mainstream, expensive vs budget.
- It builds a multi-stop plan (activity, dinner, drinks and dessert, wind-down, and an encore if someone is left out) scored with `0.5 × group coverage + 0.3 × lowest individual fit + 0.2 × conflict-free`.
- Every stop shows why it fits, who it serves, what conflict it carries and how the plan handles it, and the Qloo entity IDs, tags and affinity numbers behind it.
- It shows its work: venues it ruled out and why (a hard no, the guest of honor's veto, the budget, or closed at that hour per Qloo's listed hours), and what a plain "highest average" ranking would have picked instead.
- One click rebalances a single stop while keeping everyone's win, and each change is logged as a revision.
- A side-by-side comparison shows the same request planned with Qloo and with a generic recommender. The original two-person flow is still there.
- Also available as a CLI and an MCP server (`plan_group_outing`, `rebalance_group_plan`, `find_common_ground`, `resolve_taste_anchors`).

## How we use Qloo

Qloo is the only source of cultural knowledge in the product.

1. `/search` resolves free-text anchors ("Mad Max") to real entities with tags.
2. `/v2/tags` resolves foods and vibes, and gives us verified tag IDs for each kind of stop.
3. `/v2/insights` with `signal.interests.entities` returns venue recommendations for each person's tastes, filtered by locality and price level.
4. `/v2/insights` with `filter.results.entities` scores every pooled venue for every person in one call (up to 50 per call), and `feature.explainability` tells us which of a person's anchors drove each match.
5. Qloo's tags on a person's anchors are what we place on the five conflict scales, so conflicts come from Qloo's cultural graph rather than from keywords the user typed.

## How we built it

TypeScript on Node 20, no build step. A real agent loop (plan, resolve, retrieve, reflect and retry, score, synthesize) with a visible trace that streams to the UI as NDJSON. A server-side cache with in-flight de-duplication, rate limiting, 429/5xx backoff and stale-if-error. If `QLOO_API_KEY` is missing the app runs in a clearly labelled SAMPLE DATA mode; the key never reaches the browser. The interface is plain ES modules drawn as a set of engineering drawings: the table is a plan view, conflicts are cables under tension that become truss spans when the plan bridges them, and the evening is a bridge elevation.

## Challenges we ran into

- **Qloo tag signals are slow in scoring calls** (about 14 seconds versus under one second for entity signals), so scoring uses entity anchors when a person has them.
- **Locality matching is fuzzy**: an unknown city can resolve to a small town elsewhere, so every venue is checked against the requested city and the plan warns where Qloo actually placed it.
- **Live restaurants carry dozens of descriptive tags**, which made every restaurant look like every kind of stop until we classified from category tags only.
- **Qloo's listed hours are sometimes wrong** (well-known venues listed as closed on weekends), so reasons say "per Qloo's listed hours".
- **"Personal win" was too easy to satisfy.** We made wins exclusive (a real lead over the rest of the table) and added an honest "closest fit" fallback for guests who have no exclusive win.

## Accomplishments we are proud of

- A measured evaluation instead of claims. Across 60 random groups (sample data): zero hard-rule violations by an independently written checker, where a plain highest-average ranker broke a rule at 8.3% of stops; everyone has a win or a closest fit in 100% of groups; people sharing each "personal win" dropped from 2.39 to 1.69.
- A full plan for five people on live Qloo data in roughly 30 to 45 seconds cold, with zero fallbacks, and seconds when cached.
- An honest account of limits: average lowest-person fit is about level with a naive ranker (61.4% vs 61.7%). The gains are in rule-keeping, fewer badly served people, and visible reasoning.

## What we learned

Fairness is less about a score than about what you refuse to do: ruling out a venue for a stated reason, showing what a naive ranking would have cost, and labelling a "closest fit" as a closest fit.

## What's next

Reservations and map links, saved and shareable plans, a learned conflict model in place of keyword rules, real-user validation, and using Qloo trends and audiences to weight the group.

## Built with

TypeScript, Node.js, Qloo Taste AI API, Model Context Protocol, vanilla JavaScript and canvas, Render.

## Try it

- Live demo: PASTE-URL-HERE
- Source: https://github.com/jenish1345/TasteBridge-Groups
- Run it yourself: `npm install && npm start` (SAMPLE DATA without a key; add `QLOO_API_KEY` for live Qloo)
