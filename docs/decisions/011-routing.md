# routing, and SPEC §6 automatic placement

*2026-09-27*

- **Decision:**
  - Initial placement is Sugiyama-style: columns by the longest call path
    (every callee sits right of all its callers; recursive edges are
    ignored for layering), and rows ordered by the average row of each
    node's callers.
  - Routing (`proto/src/route.ts`): every call gets its own port on each
    side of a node.
  - Calls between adjacent columns get their own vertical channel in the
    gap, ordered to avoid crossings.
  - Longer or backward calls run along a free horizontal corridor.
  - Where lines cross, the line on top cuts a gap in the one below.
  - Hovering or selecting a function or call dims every unrelated line.
- **Why:** Shared out-ports and shared trunks made separate calls look like
  one line, and breadth-first columns produced back-edges that looped over
  the whole graph ("overlapped lines … confused").
