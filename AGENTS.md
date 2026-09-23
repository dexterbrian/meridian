# Notes for coding agents

- Read [docs/phases.md](docs/phases.md) first. Work phase by phase and tick tasks when done.
- `src/lib` is pure and tested. `src/server` holds all I/O. Only `src/server` may import the service-role Supabase client. Lint enforces this.
- Server functions live in `src/server/*-actions.ts` files marked `"use server"`. Validate input with the Zod schemas in `src/lib/schemas.ts`.
- Before pushing: `npm run lint`, `npm run typecheck`, `npm test`.
- Do not rewrite pushed history.
