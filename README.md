# TasteBridge Groups

**The taste diplomat for real-life plans.** Give TasteBridge 3–8 people's taste anchors and it uses the [Qloo Taste AI API](https://docs.qloo.com/) to map where your tastes overlap and clash, then builds a fair, multi-stop itinerary where *everyone* gets a personal win — with the Qloo evidence behind every pick.

> **Live demo:** `https://YOUR-DEPLOYMENT-URL` &nbsp;·&nbsp; **Demo video:** `https://YOUR-VIDEO-URL` &nbsp;·&nbsp; Built for the [Qloo Agentic Hackathon](https://qloo.devpost.com/)

TasteBridge started as a two-person "common ground" agent. That flow is preserved (`pair` in the CLI/API, `find_common_ground` in MCP, the *Just two of you* tab) and now runs on the same engine as group planning.

---

## What it does

| | |
|---|---|
| **Group planner** | Add/remove 3–8 people, give each a few taste anchors (artists, films, TV, books, games, brands, foods, places, vibes) and "hard no's". Set city, neighborhood, date/time, budget, dietary needs, accessibility and vibe constraints. |
| **Group taste map** | Overlap / shared / unique tags per person and a conflict spectrum for 5 axes: loud↔quiet, spicy↔mild, nightlife↔family-friendly, experimental↔mainstream, expensive↔budget. |
| **Taste Conflict Diplomacy** | Detects incompatible preferences and, instead of crowning one winner, bridges them (neutral venues) or alternates them across stops. Every person gets at least one **personal win**. |
| **Itinerary with evidence** | Activity → food → drink/dessert → wind-down (+ an optional *Encore* if someone still lacks a win). Each stop shows **why it fits**, **who it serves**, **conflicts and how they're resolved**, and **the Qloo entities, tags and affinity signals used**. |
| **Real-life checks** | Venues Qloo lists as **closed** at a stop's planned time (or permanently closed) are ruled out *per Qloo's listed hours*; stops show opening hours, website and phone when Qloo has them. |
| **Shows its work** | Each stop lists the higher-scoring venues it **ruled out and why** (hard no, key-guest veto, budget, closed) and what a naive *highest-average-affinity* ranker would have picked instead. A plan-level **fairness audit** totals the difference. |
| **Rebalance plan** | One click swaps the weakest stop (or any stop you pick) while preserving every personal win and keeping fairness within 3 points. |
| **With vs Without Qloo** | Same request through a generic recommender and through the Qloo-grounded agent, with a scorecard. |
| **MCP + CLI** | `plan_group_outing`, `rebalance_group_plan`, `find_common_ground`, `resolve_taste_anchors`; `tastebridge group / pair / resolve`. |

## How Qloo is used (it is the product, not garnish)

Qloo is the only source of cultural knowledge in the system; nothing is recommended without a Qloo signal behind it.

1. **Entity resolution** — `GET /search` turns "Mad Max" into a real Qloo entity (id, type, tags, popularity). Foods and vibes resolve through `GET /v2/tags`.
2. **Venue vocabulary** — `GET /v2/tags` maps each itinerary stop ("cocktail bar", "museum", …) to Qloo tag ids used as `filter.tags`.
3. **Per-person affinity** — every pooled venue is scored for every person with `GET /v2/insights`, `signal.interests.entities` = *that person's* anchors and `filter.results.entities` = the pooled venue ids (≤50 per call, `feature.explainability=true`). The returned `query.affinity` is that person's taste-match; `query.explainability` says which of their anchors drove it. Pool queries use `filter.type=urn:entity:place`, `filter.location.query` and `filter.price_level.max`.
4. **Group pool + favourites** — one call per stop with the union of everyone's signals to surface compromise candidates, plus one "favourites" call per person so minority tastes can surface.
5. **Conflict model** — Qloo's tags on each person's anchors (e.g. *Heavy Metal*, *Ambient*, *Family*, *Luxury*) are mapped to the five conflict axes, so conflicts come from Qloo's cultural graph, not from keywords the user typed.
6. **Evidence** — every stop exposes the venue's Qloo id, tags, the anchor→entity signals that linked it to each person, and per-person affinity.

If `QLOO_API_KEY` is missing the app runs in a clearly labelled **SAMPLE DATA** mode (banner in the UI, `!!` line in the CLI, `data_mode` in MCP/API). Fixtures use fictional venues with Qloo-shaped tags/affinities — never presented as live results. If Qloo fails mid-run, only the affected calls fall back to sample data, those stops are marked `sample-fallback`, and the run is flagged `live-degraded`.

## Architecture

```mermaid
flowchart LR
  subgraph Clients
    UI[Web UI<br/>public/] --- CLI[CLI<br/>src/cli]
    MCP[MCP server<br/>src/mcp]
  end
  UI -->|POST /api/plan, /rebalance, /compare, /pair| H[Handlers<br/>src/server]
  CLI --> AG
  MCP --> AG
  H --> AG[Group agent<br/>src/agent/agent.ts]
  subgraph Agent loop
    AG --> P1[PLAN lookups] --> P2[RESOLVE anchors] --> P3[REFLECT: retry / broaden]
    P3 --> P4[RETRIEVE per-person + group insights] --> P5[REFLECT: sparse / vetoed?] --> P6[SCORE + DIPLOMACY] --> P7[SYNTHESIZE]
  end
  P2 & P4 --> QP[Qloo provider]
  subgraph Qloo layer · server-side only
    QP --> C[(TTL cache<br/>+ in-flight de-dupe<br/>+ stale-if-error)]
    C --> RL[Rate limiter<br/>+ 429/5xx backoff]
    RL -->|X-Api-Key| Q[(Qloo Taste AI API)]
    QP -.no key.-> S[Sample fixtures]
  end
  P6 --> CORE[Core: taxonomy · conflicts · scoring · itinerary · rebalance]
  P7 -.optional.-> LLM[LLM narration<br/>Anthropic / OpenAI-compatible]
```

```
src/qloo/      live client, cache, limiter, sample provider + fixtures, entity resolution
src/core/      taxonomy, profiles, conflicts, scoring, itinerary, rebalance, pair flow, request schema
src/agent/     agent loop, optional LLM (narration/rewrites), "without Qloo" baseline, comparison
src/server/    framework-agnostic handlers + Node server (+ Vercel adapter)
api/           Vercel functions (thin wrappers)
public/        zero-build web UI
tests/         vitest suites
```

## The agent workflow

Not a single prompt — an explicit loop whose every step lands in the trace shown in the UI (*Agent trace*):

1. **Plan** — decide the lookups: anchors to resolve, venue tags per stop, per-person and group queries.
2. **Resolve** — anchors → Qloo entities/tags in parallel.
3. **Reflect (resolution)** — unresolved or low-confidence anchor? Retry without the type filter, with deterministic rewrites (`"Parasite (2019 film)"` → `Parasite`, `"X by Y"` → `Y`), as a tag, via an optional LLM rewrite, and finally as a local vibe keyword. Still nothing → reported as unresolved (never guessed).
4. **Act** — Qloo insights per person and for the group, per stop.
5. **Reflect (retrieval)** — fewer than 6 usable venues? Broaden in order: drop the neighborhood → simplify the city string → drop the tag filter (classify locally) → widen price. A stop whose only options break a key guest's veto triggers one more broadened retrieval.
6. **Score & diplomacy** — build profiles, detect conflicts, score and veto candidates, pick stops, enforce personal wins (swaps, then an *Encore* stop).
7. **Synthesize** — structured explanations from evidence; optional LLM rephrasing constrained to the evidence JSON.

## Scoring algorithm

For person *i* and candidate venue *c* within one stop:

```
q̂_i(c)   = 0.5·qlooAffinity_i(c) + 0.5·rankPercentile_i(c)      (0.2 if c is absent from i's Qloo results)
fit_i(c) = 1 − Σ_axis |pref_i − pos_c|·|pref_i| / (2·Σ|pref_i|)   (0.5 if i has no leanings)
a_i(c)   = 0.75·q̂_i(c) + 0.25·fit_i(c)                           (no Qloo signal: 0.1 + 0.8·fit_i(c), flagged low-confidence)

group_coverage(c)         = mean_i clamp((a_i − 0.35) / 0.30, 0, 1)
minimum_individual(c)     = min_i a_i
conflict_penalty(c)       = 1 − mean_i max_axis max(0, −pref_i,axis · pos_c,axis)      ← 1 = conflict-free

score(c) = group_coverage · 0.5  +  minimum_individual · 0.3  +  conflict_penalty · 0.2
```

`pref` (−1…1 per axis) comes from the Qloo tags of a person's resolved anchors; `pos_c` from the venue's Qloo tags and price level (see `src/core/taxonomy.ts`).

**Never recommend what a key person strongly dislikes (if an alternative exists).** A candidate is vetoed if (a) anyone's explicit hard no matches it, (b) a *key guest* (★) has `pref·pos ≤ −0.36` on any axis, (c) it exceeds the budget or breaks a group vibe like "no loud venues". If a stop has no viable candidate, constraints relax in order (unverifiable dietary → key-guest axis veto → vibe/budget) and the stop carries a visible warning.
Dietary/accessibility needs are *verified* against Qloo tags when possible; unverifiable ones are only flagged ("confirm vegan options with the venue") — never silently assumed.

**Personal win:** person *i* wins a stop if `a_i ≥ 0.65` and it is in their top 2 viable venues for that stop. After picking each stop's best venue (near-ties broken toward the most conflict-neutral one), anyone without a win triggers a swap that costs ≤ 0.12 score and keeps everybody ≥ 0.30; remaining people get an *Encore* stop.

**Rebalance:** replace one stop with the best feasible alternative such that nobody loses a personal win and mean fairness drops ≤ 0.03 (`mean score + 0.5·lowest person's average` is the objective). Repeated rebalances cycle through alternatives.

## Evaluation (measured, not claimed)

`npm run eval` plans 60 seeded random groups (2–8 people, random anchors, hard no's, key guests, three cities, budgets) in SAMPLE DATA mode and re-checks every chosen venue against the hard rules, independently of the selection code. `npm test` runs a 25-group version as a property test.

| Metric (60 groups · 241 stops) | TasteBridge | Naive "highest average affinity" ranker |
|---|---|---|
| Groups where **everyone got a personal win** | **100%** | not tracked |
| Hard-rule violations (hard no / key-guest veto / budget / vibe) | **0** | 20 stops (8.3%) |
| (person, stop) pairs with < 40% fit | **2** | 8 |
| Lowest person's fit, on stops where the naive pick was legal | **62.9%** | 61.9% |
| Stops where fairness-aware scoring changed the pick | 45.6% | — |

Be careful how you read this: the big, robust win is *rule-keeping and not leaving anyone behind* (and guaranteed wins). The average lowest-person fit improves only about a point — fairness scoring mostly reshuffles *who* is served rather than lifting everyone. Numbers are from fixtures, so they show the algorithm's behaviour, not Qloo's data quality. 

**Live Qloo check** (`npm run eval -- --live --n=3`: only 3 groups / 12 stops, so treat it as a sanity check, not a benchmark): everyone got a personal win, 0 hard-rule violations, and a naive ranker would have broken a rule at 7 of 12 stops — mostly picking venues Qloo lists as closed at the planned time. On stops where the naive pick was legal, lowest-person fit was identical (77.1% vs 77.1%). Qloo's listed hours are sometimes wrong (e.g. well-known weekend venues listed as closed), which is why ruled-out reasons say "per Qloo's listed hours".

## Local setup

```bash
git clone <this repo> && cd tastebridge-groups
npm install
cp .env.example .env        # add QLOO_API_KEY (optional – without it you get SAMPLE DATA mode)
npm start                   # http://localhost:3000
```

```bash
npm test                    # 60 tests: resolution, scoring, conflicts, itinerary, Qloo client, API
npm run typecheck
```

Environment variables (see `.env.example`): `QLOO_API_KEY`, `QLOO_BASE_URL` (default `https://hackathon.api.qloo.com`; production keys use `https://api.qloo.com`), `QLOO_RPS`, `QLOO_CONCURRENCY`, `QLOO_CACHE_TTL`, `QLOO_CACHE_DIR`, and optionally `ANTHROPIC_API_KEY` *or* `OPENAI_API_KEY` (+ `LLM_MODEL`, `OPENAI_BASE_URL`). **All keys are read server-side only** and are never returned to the browser (there's a test for it).

### CLI

```bash
npm run cli -- group --demo
npm run cli -- group --person "Ana: Metallica, food:Korean BBQ, vibe:loud" \
                     --person "Ben: Bon Iver, Stardew Valley, vibe:quiet" \
                     --person "Cy: Radiohead, hot pot, Parasite" \
                     --city Austin --budget 3 --when 2026-11-14T19:00 --key Ben --avoid "Ana: karaoke" [--trace] [--json] [--compare]
npm run cli -- pair --a "Alex: Radiohead, Parasite" --b "Jordan: Taylor Swift, Barbie" --city "New York"
npm run cli -- resolve "Mad Max" "hot pot" "radiohed"
```

### MCP server

```json
{ "mcpServers": { "tastebridge": { "command": "npx", "args": ["tsx", "src/mcp/server.ts"], "cwd": "/path/to/tastebridge-groups", "env": { "QLOO_API_KEY": "…" } } } }
```

| Tool | Purpose |
|---|---|
| `plan_group_outing` | `{ people[2–8]: {name, anchors[], avoid?[], isKey?}, constraints: {city, neighborhood?, datetime?, budget?(1–4), dietary?[], accessibility?[], vibes?[]}, includeWindDown? }` → itinerary with why / serves / conflicts / evidence, metrics and a `plan_id`. |
| `rebalance_group_plan` | `{ plan_id, stop? }` → swaps one stop, preserving personal wins and fairness. |
| `find_common_ground` | Original two-person flow: `{ person_a, person_b, city? }`. |
| `resolve_taste_anchors` | `{ anchors[] }` → Qloo entity/tag resolution with confidence. |

## HTTP API

| Endpoint | Body → Response |
|---|---|
| `POST /api/plan` | `GroupRequest` (same shape as the MCP tool) → `{ dataMode, banner?, profile, itinerary[], metrics, warnings, unresolved, trace[], stats, session }` |
| `POST /api/rebalance` | `{ session, slot? }` → `{ itinerary, metrics, session, rebalance:{removed, added, before, after, note} }` (stateless: the `session` from `/api/plan` is passed back) |
| `POST /api/compare` | `GroupRequest` → `{ withQloo, withoutQloo, scorecard[] }` |
| `POST /api/pair` | `{ a:{name,anchors[]}, b:{…}, city? }` → common ground across domains |
| `POST /api/plan-stream` | same body as `/api/plan`; responds with **NDJSON**: `{type:"trace",event}` lines as the agent works, then one `{type:"result",result}` (or `{type:"error",error}`) — lets a UI show live progress during the 20–45 s cold run |
| `GET /api/health`, `GET /api/demo` | mode / demo request |

**Fields worth rendering:** each itinerary stop carries `why`, `serves[]`, `conflicts[]` (with resolutions), `evidence` (entity ids, tags, signals, per-person affinity), `ruledOut[]`, `vsNaive`, `alternatives[]`, and `place.openNote / website / phone`; the plan carries `profile` (taste map + conflicts), `metrics`, `audit` (fairness audit vs a naive ranker), `warnings`, `trace[]` and `session` (pass back to `/api/rebalance`).

Errors are `{ ok:false, error }` with 4xx for bad input; internals and keys are never included. Public deployments are protected by a per-IP rate limiter so the demo can't exhaust the Qloo quota.

## Deployment

**Vercel** (zero config): import the repo — `public/` is served statically, `api/*.ts` become serverless functions (`vercel.json` sets `maxDuration: 60`). Set `QLOO_API_KEY` (and optionally `ANTHROPIC_API_KEY`) in *Project → Environment Variables*. A large first run issues dozens of Qloo calls (they are cached afterwards); raise `QLOO_RPS` if your plan allows, or use a plan with a longer function timeout.

```bash
npm i -g vercel && vercel --prod
```

**Render**: *New → Blueprint* with this repo (`render.yaml` is included), then set `QLOO_API_KEY`. Attach a disk and set `QLOO_CACHE_DIR` for a cache that survives restarts.

**Docker / Railway / Fly**: `docker build -t tastebridge . && docker run -p 3000:3000 -e QLOO_API_KEY=… tastebridge`.

Cloudflare: the core is plain TypeScript with no Node-only dependencies except the optional disk cache and the MCP/CLI entry points, so porting `src/server/handlers.ts` to a Worker is mechanical, but Vercel/Render are the supported targets.

## Status & honesty notes

* **Live Qloo path verified with a real key** (hackathon host): `/search`, `/v2/tags` and `/v2/insights` (including `filter.results.entities` and explainability) return the shapes the client expects; full plans for New York, Brooklyn, Austin and London completed with zero fallbacks. A cold plan for 5 people takes ~20–45 s (Qloo's "New York" locality is the slowest call, ~5–9 s); repeats are served from the cache. Eight-person groups on a slow locality can approach Vercel's 60 s limit — use Render, or raise `QLOO_RPS`/`QLOO_CONCURRENCY` if your key allows.
* Things learned from the live API and handled in code: tag signals make Qloo scoring calls ~15× slower, so scoring uses entity anchors when a person has them; Qloo's locality match is fuzzy (an unknown city can resolve to a small French town), so venues are checked against the requested city and the plan warns where Qloo actually placed it; tag search mixes media/music genres into place lookups, so only place-relevant tag families are accepted.
* `QLOO_DEBUG=1` logs every Qloo request (path, latency, status) to stderr — never the key.
* Sample fixtures cover New York, Austin and London with fictional venues; other cities in SAMPLE mode fall back to New York fixtures (visibly).
* Preferences are inferred from tags with keyword rules (`src/core/taxonomy.ts`); they are a transparent heuristic, not a trained model.

## License

[MIT](LICENSE)
