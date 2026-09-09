# Entity schemas — ownership

`schemas.json` in this directory is the **single, application-owned source of
truth** for all RazeKit entities: field lists, defaults, required keys and RLS
policies. Edit it directly.

## It used to be generated — that was a landmine

`server/scripts/gen-schemas.mjs` regenerated this file from
`base44/entities/*.jsonc` by **wholesale overwrite**. That made Base44 the real
source of truth, and it meant any RazeKit-owned entity (`TrackingLink`,
`TrafficEvent`, `ScoreSnapshot`) would be **silently deleted** the next time
anyone ran `npm run gen:schemas`.

Nothing automated ever ran it — not the build, not CI, not the Render deploy —
so it was retired rather than repaired:

* the `gen:schemas` npm script was removed;
* the script now lives at `server/scripts/legacy/gen-schemas.RETIRED.mjs` and
  refuses to run.

`base44/entities/` remains in the repo as a historical export only. Nothing
reads it at runtime.

## Adding an entity

1. Add a `{ name, required, defaults, fields, rls }` block here.
2. No migration is needed — the store is a single JSONB `records` table, and
   `fields` is declarative (never validated against).
3. Decide RLS deliberately. Default to the tightest policy that works.
4. If the entity is server-computed, also list it in `protected.ts` so the
   generic entity API cannot write it from a browser.

## Privacy note

`TrafficEvent` is **admin-only** at the RLS layer. Creators and brands see
aggregates (via `TrackingLink` counters and Tracker endpoints), never raw
events, and never the anti-fraud reasoning. It stores `visitor_hash` /
`ua_hash`, never a raw IP or user agent.
