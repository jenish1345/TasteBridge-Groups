# Demo script (2½ minutes)

**Story:** five friends, one Saturday in New York — a metalhead, a quiet-and-cozy guest of honor, an art-house film fan, a parent who loves Bluey, and a thrift-store budgeter. Normal tools average them into a mediocre dinner. TasteBridge negotiates.

| Time | Show | Say |
|---|---|---|
| 0:00 | The table: five seats, anchors orbiting each. Point at a seat | "Five friends, each with a few things they love. Every dot orbiting a seat is something Qloo will resolve." |
| 0:15 | Press **Plan the night** and watch the table | "Each taste lifts off its seat and lands on the table once Qloo has matched it to a real entity. The orange cables are conflicts: Maya wants loud, Dan wants quiet." |
| 0:45 | The cables turn into trusses | "When the agent finds a compromise, the cable becomes a span. That's the whole product: conflicts get bridged, not averaged away." |
| 1:05 | **Verdict** sheet | "89% fair, and everyone has a stop that's theirs. Nothing anyone ruled out made it in." |
| 1:20 | **The night** bridge: the traveller tours the piers. Open *What it costs* | "Birdland scored well but Qloo lists it closed at 9:30, so it's ruled out. A plain highest-average ranking would have picked it." |
| 1:45 | **Rebalance plan** | "Swap one stop. Everyone keeps their personal win, and the change is logged as Rev B." |
| 2:00 | **Who carries what** | "Each circle is how well a stop fits a person. Gold rings are personal wins." |
| 2:10 | **Compare**: drag the gold line | "Same five people, same night. Left is built from Qloo. Right is a generic suggestion with no entities, no affinity scores, no conflicts." |
| 2:30 | Terminal: `npm run eval` | "And it's measured: across 60 random groups everyone got a win and no hard rule was broken. A naive ranker broke one at 8% of stops." |

**Prep checklist:** `QLOO_API_KEY` set · run the demo once beforehand so the server cache is warm (repeat plans return in ~2 s) · `ANTHROPIC_API_KEY` set so the *Without Qloo* column is a real LLM guess.
