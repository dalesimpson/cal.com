# Architecture

Primary technical context for AI coding agents working in this repository,
per LBi Phase 3 Master Plan § 3.2.2. Complements — but does not duplicate —
the agent operating manual in [CLAUDE.md](CLAUDE.md) / [AGENTS.md](AGENTS.md).

## 1. System overview

Cal.com is an open-source scheduling and booking platform. Users publish
event types, share booking links, and accept reservations that sync to
their calendars (Google, Outlook, Office 365, etc.) and downstream
integrations (video meetings, payment, email, SMS).

Architecture style: a **Yarn + Turborepo monorepo** containing one
primary Next.js web application plus two generations of REST APIs, all
sharing a TypeScript codebase and a single PostgreSQL database. Cross-
cutting functionality lives in yarn workspaces under `packages/`; Turborepo
orchestrates builds and caching across them.

## 2. Directory structure

```text
cal.com/
├── apps/
│   ├── web/                      # Primary Next.js application (mix of App Router + Pages Router)
│   └── api/
│       ├── v1/                   # Next.js Pages Router-based REST API (maintained)
│       └── v2/                   # NestJS-based REST API (current for platform customers)
├── packages/
│   ├── prisma/                   # PostgreSQL schema.prisma + migrations (source of truth)
│   ├── trpc/                     # tRPC router tree; server/routers/_app.ts is the entry
│   ├── features/                 # Feature-scoped business logic (bookings, workflows, insights…)
│   ├── app-store/                # Third-party app integrations (GoogleCalendar, Stripe, Zoom, …)
│   ├── ui/                       # Shared UI component library (imported via direct paths, not barrels)
│   ├── lib/                      # Cross-cutting utilities (constants, query helpers, date helpers)
│   ├── emails/                   # Transactional email templates
│   ├── platform/                 # Platform customer SDKs + the API v2 re-export bridge
│   ├── i18n/                     # next-i18next translations (English source: locales/en/common.json)
│   ├── ee/                       # Enterprise edition features (licensed separately)
│   ├── app-store-cli/            # Code generator for app-store registrations
│   ├── dayjs/ · kysely/ · sms/ · testing/ · types/ · tsconfig/ · embeds/   # focused smaller packages
│   └── debugging/                # Debug tooling
├── turbo.json                    # Build graph and globalEnv
├── vitest.workspace.ts           # Vitest workspace configuration
├── playwright.config.ts          # Playwright E2E suite configuration
├── biome.json                    # Biome lint + format rules
├── CLAUDE.md / AGENTS.md         # Agent operating manual (see § 7)
└── architecture.md               # (this file)
```

## 3. Key patterns

- **Service + Repository split.** Repositories are thin Prisma access
  layers; business logic lives in services. Do not embed business logic
  in repositories.
- **Prisma `select`, not `include`.** Every query enumerates fields
  explicitly — for performance and to avoid leaking sensitive columns
  (notably `credential.key`).
- **tRPC as the type-safe bridge.** Web client code calls tRPC procedures
  defined under `packages/trpc/server/routers/`. The tree is assembled in
  `packages/trpc/server/routers/_app.ts`.
- **Error handling boundary.** Use `TRPCError` only inside tRPC routers.
  Everywhere else (services, repositories, utilities) throw
  `ErrorWithCode`. This keeps the HTTP-ification of errors at the edge.
- **Direct imports, no barrels.** `import { Button } from "@calcom/ui/components/button"`
  — not `from "@calcom/ui"`. Prevents bundle bloat and makes symbol
  ownership obvious.
- **Generated code is read-only.** Files matching `*.generated.ts` are
  produced by `yarn app-store-cli` and must be regenerated, never hand-edited.

## 4. Module boundaries

- `apps/web` depends on most of `packages/*` — the primary consumer of
  shared code.
- `apps/api/v1` is a Next.js (Pages Router) REST API layered on tRPC;
  still maintained but not the target for new platform work.
- `apps/api/v2` is NestJS + `@nestjs/platform-express`, the current REST
  surface for platform customers. **It has a tsconfig quirk**: direct
  imports from `@calcom/features/*` or `@calcom/trpc/*` fail with
  "module not found". Instead, re-export the needed symbols from
  `packages/platform/libraries/index.ts` and import them from
  `@calcom/platform-libraries`. Adding a new feature to v2 usually means
  adding a re-export first.
- `packages/prisma` is the schema source of truth. Schema changes are
  coordinated — announced and reviewed separately, never slipped into an
  unrelated PR.
- `packages/trpc` is the public interface between `apps/web` and the
  backend. Router additions are the primary way to add capabilities to
  the web app.
- `packages/app-store` houses third-party integrations. Adding a new app
  means creating `packages/app-store/<app-name>/` and running
  `yarn app-store-cli` to regenerate the registration indices.
- `packages/ee` contains enterprise-edition features governed by a
  separate license. Symbols defined under `ee/` must not be imported
  unconditionally from OSS code paths.

## 5. Testing strategy

- **Unit tests use Vitest.** Run with `TZ=UTC yarn test`. The `TZ=UTC`
  prefix is non-negotiable — many booking and availability tests assume
  UTC and silently produce wrong answers otherwise. Vitest workspace
  layout is in [vitest.workspace.ts](vitest.workspace.ts).
- **E2E tests use Playwright**, configured in
  [playwright.config.ts](playwright.config.ts). CI uses tight 10s
  timeouts; local runs use generous 120s timeouts for interactive
  debugging.
- **Type checking is part of the test suite.** `yarn type-check:ci --force`
  must pass before a PR is opened. Type errors are typically a faster
  path to root cause than test failures — fix type errors first.
- **TDD is required for Phase 3 agent work** (Master Plan § 3.2.1): every
  coding task follows red → green → refactor. Write failing tests first,
  implement the minimum code to pass, then refactor. Commits that
  introduce implementation before the corresponding tests will be
  flagged in automated review.
- **Coverage expectation:** no hard numeric threshold. The expectation is
  that every new branch or edge case has an explicit assertion, and that
  negative cases are covered alongside positive ones.

## 6. Dependencies

Core stack (abridged — see root `package.json` for the complete list):

- **Framework:** Next.js 13+ (mix of App Router and Pages Router by route).
- **Language:** TypeScript, strict mode.
- **Database:** PostgreSQL via Prisma ORM; Kysely is used in select places
  where raw SQL or custom joins are clearer.
- **API layers:** tRPC (primary, web client), NestJS (`apps/api/v2`),
  Next.js Pages Router API routes (`apps/api/v1`).
- **Auth:** NextAuth.js with a Prisma adapter.
- **UI:** Tailwind CSS plus the shared component library in `packages/ui`.
- **Testing:** Vitest (unit/integration), Playwright (E2E).
- **i18n:** `next-i18next`; English source strings live in
  `packages/i18n/locales/en/common.json` — every new UI string must be
  added there first.
- **Build orchestration:** Turborepo across yarn workspaces.
- **Lint + format:** Biome.
- **Date handling:** prefer `date-fns` or native `Date`; reach for Day.js
  only when timezone-aware logic genuinely requires it.

Dependencies to avoid introducing casually: Day.js for new code, any
additional ORM, or any new styling library beyond Tailwind.

## 7. Coding conventions

The full rule set — "do / don't", PR size limits, error handling
patterns, Prisma query examples, the API v2 import workaround, the PR
checklist — lives in [CLAUDE.md](CLAUDE.md) (identical to
[AGENTS.md](AGENTS.md)). Claude Code auto-loads `CLAUDE.md` when a
session starts in the repository root, so those rules are already in
every agent's context on every run. Do not duplicate them here.

Architecture-level conventions worth reinforcing:

- **PR size: ≤500 lines, ≤10 code files, single responsibility.** Split
  large features into layered or componentized PRs. For the Phase 3
  experiment, this also serves as the "task complexity" boundary — any
  task that cannot fit within one such PR is implicitly "complex" and
  should be decomposed before agent handoff.
- **Conventional commits.** `feat(scope): ...`, `fix(scope): ...`,
  `refactor(scope): ...`. Scope is usually the package name or affected
  app.
- **Draft PRs by default**, so review happens before ready-for-review.
- **Comments explain why, not what.** Comments that merely restate the
  code are removed.

## 8. Known constraints

- **Containerized agent execution (Phase 3).** Agent coding work runs
  inside the isolated `phase3-claude-agent` Docker container, not on
  developer workstations. The repository on the host is a reference
  working tree; actual agent mutations happen in the container with
  cal.com bind-mounted at `/workspace/cal.com`.
- **API v2 path-mapping quirk** (see § 4). Always route new `apps/api/v2`
  imports through `@calcom/platform-libraries`.
- **Generated files are read-only.** `*.generated.ts` in `packages/app-store`
  is produced by `app-store-cli` — regenerate, don't hand-edit.
- **`credential.key` is sensitive.** Must never appear in any query
  projection, API response, log line, or error message. It contains
  third-party integration credentials.
- **Schema changes are coordinated.** Edits to
  `packages/prisma/schema.prisma` are reviewed in isolation, not bundled
  into feature PRs.
- **Enterprise vs OSS license boundary.** Symbols from `packages/ee` must
  not leak into OSS-only code paths.
- **Full build / full E2E runs are expensive.** Prefer scoped
  `yarn workspace <name> <script>` runs; ask before kicking off a full
  monorepo build or the complete Playwright suite.

## Reference documents

- [CLAUDE.md](CLAUDE.md) — agent operating manual (do/don't, PR rules,
  commands, PR checklist)
- [AGENTS.md](AGENTS.md) — same content as CLAUDE.md, mirrored for tools
  that read `AGENTS.md`
- [SPEC-WORKFLOW.md](SPEC-WORKFLOW.md) — opt-in spec-driven workflow for
  larger features
- [PERMISSIONS.md](PERMISSIONS.md) — project permission boundaries
- [turbo.json](turbo.json) — Turborepo build graph and globalEnv
- LBi Phase 3 Master Plan § 3.2.2 — the standard this document implements
