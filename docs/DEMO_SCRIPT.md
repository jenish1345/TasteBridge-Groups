# Demo script (2½ minutes)

**Story:** five friends, one Saturday in New York — a metalhead, a quiet-and-cozy guest of honor, an art-house film fan, a parent who loves Bluey, and a thrift-store budgeter. Normal tools average them into a mediocre dinner. TasteBridge negotiates.

| Time | Show | Say |
|---|---|---|
| 0:00 | Load demo group | "Five people, five taste profiles — each is just a few anchors: artists, films, foods, vibes." |
| 0:15 | Press **Plan** — the agent trace streams (`/api/plan-stream`) | "This isn't one prompt. The agent resolves each anchor to a real Qloo entity, asks Qloo what *each person* would love at every stop, and reflects when results are thin." |
| 0:45 | **Taste map** + conflict bars | "Qloo's tags show where we overlap and where we clash: nightlife vs family, loud vs quiet, expensive vs budget. Those conflicts come from Qloo's cultural graph, not from keywords." |
| 1:10 | Open one stop → *Who it serves*, *Conflicts & how resolved*, *Evidence* | "Every pick says why it fits, who it's *for*, what it trades off, and shows the Qloo entity IDs, tags and affinity numbers behind it." |
| 1:35 | Point at **Ruled out** and **Naive pick would be…** | "Birdland scored well but was closed at 9:30 per Qloo's hours. A naive 'highest average' ranker would have picked it — and broken a hard rule." |
| 1:55 | **Rebalance plan** | "Swap one stop; everyone keeps their personal win and fairness stays within three points." |
| 2:10 | **With vs without Qloo** tab | "Same request to a generic recommender: no entity IDs, no per-person evidence, no conflicts, no wins. That's the difference Qloo makes." |
| 2:25 | Terminal: `npm run eval` | "And it's measured: across 60 random groups, everyone got a win and zero hard rules were broken; a naive ranker broke one at 8% of stops." |

**Prep checklist:** `QLOO_API_KEY` set · run the demo once beforehand so the server cache is warm (repeat plans return in ~2 s) · `ANTHROPIC_API_KEY` set so the *Without Qloo* column is a real LLM guess.
