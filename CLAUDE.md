# Crumbtrail API

Backend for Crumbtrail, a recipe-sharing app. Built with NestJS 12 and MongoDB (through Mongoose). The Angular frontend lives in a separate project.

@api/AGENTS.md

## Repo layout

- `docs/` holds the design docs. They are the source of truth for what to build.
  - `high_level_design.md`: feature phases and which phase is current.
  - `model/*.txt`: data models.
  - `endpoints/*.txt`: endpoint contracts (request and response shapes, status codes).
- `api/` holds the Nest app. Run all npm commands from `api/`.

## How to work on a feature

1. Read `high_level_design.md` and the model and endpoint docs for the feature.
2. Audit the design for the part being built, and bring questions or suggestions to the user before writing code.
3. When a decision changes the design, update `docs/` in the same change so the docs and code stay in sync.
4. Branch off `dev` (for example `feature/<name>`) and open the PR into `dev`. Don't commit until the user has reviewed the work.

## Commands (run in `api/`)

- `npm run start:dev`: needs MongoDB (`docker compose up -d`) and a `.env` file (see `.env.example`).
- `npm test`: unit tests (`*.spec.ts`, kept next to the source file).
- `npm run test:e2e`: e2e tests (`test/*.e2e-spec.ts`). They run against `mongodb-memory-server`, so no database is needed.
- `npm run lint`, `npm run format`, `npx tsc --noEmit -p tsconfig.json`

## Code conventions

- **Folder per feature:** `src/<feature>/` contains:
  - `*.module.ts`, `*.controller.ts`, `*.service.ts`
  - `*.schema.ts`: Mongoose schema
  - `*.schemas.ts`: Zod request schemas
  - `*.views.ts`: functions that shape responses
- **Routes:** use `@Controller({ path, version: '1' })`, which serves `/api/v1/...`. The global prefix, versioning and validation pipe are set in `src/app.setup.ts`, which both `main.ts` and the e2e tests use.
- **Validation:** Zod with `@Body({ schema })` and `@Param('id', { schema })`. Use `z.strictObject` so unknown fields get a 400.
- **Auth:**
  - A global `AuthGuard` requires a bearer JWT on every route unless the route is marked `@Public()`.
  - Get the caller with `@CurrentUser()`.
  - When a user tries to change something they don't own, return 403.
  - Put `@Throttle(AUTH_THROTTLE)` on endpoints that accept credentials.
- **IDs:** GUID strings stored as Mongo `_id` (default `randomUUID()`), validated with `z.uuid()`.
- **Responses:** map documents through view functions (for example `toPublicProfile`). Never return `passwordHash`, which is `select: false` on the schema.
- **Soft deletes:** users use an `active` flag (deactivation); recipes use an `archived` flag (archiving, which may be reversible later). Lookups of live records filter on the flag. Journal entries are hard-deleted.
- **Sub-entities:** journals live in `src/recipes/` as part of `RecipesModule`, since an entry only exists as part of a recipe and both sides need each other. Ownership of an entry is checked through its recipe (`RecipesService.getOwned`).
- **Uniqueness:** enforce with unique indexes, not check-then-insert. Translate Mongo duplicate key errors (code 11000) into a 409.
- **Config:** add every new environment variable to the schema in `src/config/env.ts` and to `.env.example`. Read values through `ConfigService<Env, true>`.

## Testing

- Every endpoint gets e2e tests for its success case and each documented error code.
- Postman: when endpoints change, update the **Crumbtrail API** collection in the user's Postman workspace through the Postman MCP. Use the **Crumbtrail Local** environment.
  - The collection is ordered so the Collection Runner can run it top to bottom: registration first, deactivation last.
  - Before uploading changes, run them against the app with newman.

## Status

Update this section as work lands.

- **Current phase:** Phase 0 (MVP).
- **Done:** users and auth (PR #1). Recipes and journals CRUD (`feature/recipes-journals`, see `docs/endpoints/recipes.txt` and `docs/endpoints/journals.txt`).
- **Resolved design questions:** journals have no author field (always the recipe author); time estimates are whole minutes (`timeEstimateMinutes`).
- **Deferred:** pagination on `GET /recipes/me` and journal lists; un-archiving recipes.
