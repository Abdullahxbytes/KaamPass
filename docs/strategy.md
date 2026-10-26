# KaamPass implementation strategy

## Purpose

This is the working build plan for the 40-hour KaamPass MVP. Use [idea.md](./idea.md) for the product direction and [techstack.md](./techstack.md) for the technical architecture.

The strategy is intentionally balanced:

- It is structured enough to protect the core workflow, data, privacy, and demo.
- It is flexible enough to change UI details, field choices, and libraries when implementation teaches us something.
- It avoids enterprise-level abstractions, premature optimization, and tests that do not protect important behavior.

The MVP succeeds when this path works reliably:

```text
Employer posts work request or chooses a known worker
→ Matching worker bids or receives a direct offer
→ Employer selects a bid
→ Formal agreement is created
→ Worker accepts
→ Employer marks work complete
→ Worker confirms completion/payment
→ One verified work record is created
→ Worker statistics and public KaamPass update
```

## Rules that stay fixed

These rules should not change during the hackathon unless the whole team agrees that the product direction has changed:

- Support only electricians, plumbers, and painters.
- Use React, TypeScript, Vite, Tailwind CSS, shadcn/ui, and react-i18next on the frontend.
- Use Node.js, TypeScript, Express.js, Zod, and Supabase on the backend/data side.
- Keep business rules and authorization in Express, not in React.
- Require employer completion and worker confirmation before creating verified history.
- Keep contact details, precise addresses, agreements, and detailed earnings private by default.
- Support English, Roman Urdu, and Urdu; Urdu must use RTL.
- Do not add payments, loans, CNIC verification, blockchain, a large dispute system, a full marketplace, or more professions.

Everything else may be adjusted inside the relevant module if the change saves time or improves the demo without breaking these rules.

## How we will work

Build one thin feature from UI to database before polishing it. Keep only one major task in progress per developer. When a task works through the real React → Express → Supabase path, mark it done and move forward.

Use three priority levels:

- **Must:** required for the main demo.
- **Should:** valuable, but may be simplified if time is short.
- **Later:** do only after every Must task works.

Use these task states in this file: `Not started`, `In progress`, `Blocked`, and `Done`.

## Progress tracker

The first incomplete Must module is the default next module.

| Module | Result | Priority | Status |
| --- | --- | --- | --- |
| 0. Quick decisions | Blocking choices are settled | Must | Done |
| 1. Foundation | Frontend, API, Supabase connection, and i18n shell run | Must | Done |
| 2. Accounts and profiles | Worker/employer accounts and three trade profiles work | Must | In progress |
| 3. Agreements and jobs | Employer posts work, selects a bid, and the worker confirms the agreement | Must | Done |
| 4. Verified history | Mutual confirmation creates one record and correct statistics | Must | Done |
| 5. Public KaamPass and QR | Public profile exposes safe verified information | Must | In progress |
| 6. Portfolio, feedback, and language polish | Supporting features complete the experience | Should | Not started |
| 7. Hardening and demo | App is secure enough, reproducible, and presentation-ready | Must | Not started |

**Current progress:** Modules 0, 1, 3, and 4 are complete for the local MVP. Module 2 Task 2.5 is implemented; browser verification of the profile forms and the full module completion check remain. Module 5 Tasks 5.1–5.4 are implemented and local privacy integration tests passed; the deployed phone scan remains to be verified.

## Build order

```mermaid
flowchart LR
    M0[0 Quick decisions] --> M1[1 Foundation]
    M1 --> M2[2 Accounts and profiles]
    M2 --> M3[3 Agreements and jobs]
    M3 --> M4[4 Verified history]
    M4 --> M5[5 Public KaamPass and QR]
    M5 --> M6[6 Supporting features]
    M6 --> M7[7 Hardening and demo]
```

The order protects the main product loop. A supporting task may start early only when it does not delay the next Must task.

## Module 0 — Quick decisions

**Goal:** Make only the decisions needed to begin coding. Timebox the module to 60 minutes.

| Task | What to decide/build | How | Decision required |
| --- | --- | --- | --- |
| 0.1 Project layout | Choose where web, API, and shared contracts live | Use a small npm workspace: `apps/web`, `apps/api`, `packages/contracts` | Confirm npm and this folder layout |
| 0.2 Authentication | Define sign-up, login, role, and language selection | Use Supabase Auth and store application profile data separately | Default to email/password and one role per account |
| 0.3 Workflow states | Define the smallest useful agreement/job state machine | Use server-controlled transitions, never a generic status editor | Use `pending`, `rejected`, `active`, `awaiting_confirmation`, `verified` |
| 0.4 Statistics | Define verified jobs, work days, income, and repeat employers | Calculate from verified records | Repeat employer means at least two verified jobs; money is PKR |
| 0.5 Public data | Decide exactly what anonymous users can see | Create a server-side allowlist | Use broad service area and selected records; exclude contact and earnings |
| 0.6 Demo data | Fix fictional worker/employer accounts and Ahmed's main scenario | Create repeatable seed data | Confirm demo names, locations, and safe images |

**Module complete when:** all six choices are recorded in the decision log. If the team cannot decide within the timebox, use the defaults above and continue.

## Module 1 — Foundation

**Goal:** Produce a simple codebase where the frontend and backend run together and later features have an obvious place.

**Status:** Done — Tasks 1.1 through 1.6 are implemented. The local Supabase migration and schema lint passed.

| Task | What to build | How we will build it | Decision needed during implementation |
| --- | --- | --- | --- |
| 1.1 Workspace | React/Vite app, Express API, and shared API contracts | Use strict TypeScript and root commands for dev, build, type-check, lint, and focused tests | Node version and test/lint tools; choose familiar maintained tools |
| 1.2 App structure | Feature folders for auth, profiles, agreements, jobs, and public KaamPass | Keep React components, API routes, domain services, and database queries separate | Share only API types/schemas, not server internals |
| 1.3 Walking skeleton | App shell, `/health` API endpoint, typed API client, error handling, and environment validation | Make the browser call the real API; fail clearly when config is missing | Local ports and API URL convention |
| 1.4 i18n shell | Language switcher and starter files for English, Roman Urdu, and Urdu | Use react-i18next; set document `lang` and `dir`; use CSS logical properties | Select a readable licensed Urdu font |
| 1.5 Supabase setup | Local/hosted project connection and first versioned migration | Keep credentials in environment files and secrets out of Git | Decide whether local Supabase is practical for the hackathon |
| 1.6 Quality automation | One local verification command, formatting rules, and continuous integration | Run the same format, lint, type, test, and build checks locally and in GitHub Actions | Keep automation lightweight; add tools only when they protect meaningful behavior |

Keep the structure small. Do not create generic repositories, event buses, dependency-injection systems, or microservices unless a real problem requires them.

**Module complete when:** both apps start with one command, the web app reaches the health endpoint, language direction switches, and a migration can run from a clean database.

## Module 2 — Accounts and profession-aware profiles

**Goal:** Let workers and employers authenticate and maintain credible profiles for the three supported professions.

**Status:** In progress — Tasks 2.1 through 2.4 are done; Task 2.5 is implemented and awaits browser verification.

| Task | What to build | How we will build it | Decision needed during implementation |
| --- | --- | --- | --- |
| 2.1 Data model | Users, worker profiles, employer profiles, skills, and worker skills | Use SQL migrations, foreign keys, allowlisted profession/language values, and seed data | Use normal columns for common data and a small validated JSON object only for trade-specific fields |
| 2.2 Authentication | Register, login, logout, session restoration, role, and saved language | Supabase handles credentials; Express verifies the token; frontend route guards improve UX only | Choose role during or immediately after registration |
| 2.3 Authorization | Owner and role checks for every private operation | Derive identity from the verified token; never trust a submitted user ID | Keep business-data writes behind Express |
| 2.4 Trade configuration | Skills and specialized fields for electrician, plumber, and painter | Keep stable identifiers in a typed registry and labels in translations | Select only demo-useful fields for each profession |
| 2.5 Profile screens | Worker profile form, employer profile form, and basic private dashboard | Use Zod in forms and independently in the API; show real persisted data and clear empty states | Decide which fields are required and prevent risky profession changes after verified work exists |

Tasks 2.1–2.5 provide the profile schema, account sessions, saved language, verified identity and role checks, a shared three-trade registry, and worker/employer profile forms. Profile tables remain inaccessible to browser database roles; business-data operations go through Express. Apply the same owner and role checks to each new operation as it is added. Worker profession is locked after the first profile save to protect existing skills and future verified work; a deliberate change workflow can be added later if needed. Verify the forms in a browser before marking the module complete.

Build the electrician profile first. Once it works end to end, add plumber and painter through the same trade configuration instead of copying screens.

**Module complete when:** seeded worker and employer accounts can log in again, retain language/role, edit only their own data, and render distinct realistic profiles for all three professions.

## Module 3 — Agreements and active jobs

**Goal:** Allow an employer to offer clear terms and the intended worker to accept or reject them.

**Status:** Done — Work requests, private problem images, profession-matched bidding, atomic bid selection, direct hiring, agreement responses, and active-job creation are implemented and live API-tested. In Edge, the employer posted a request, the matching worker bid, the employer selected the bid, and the worker accepted; both saw the active job. English, Roman Urdu, and Urdu RTL were checked, including a mobile-width worker view. Image uploads, privacy, authorization, and retries were checked by live API tests.

| Task | What to build | How we will build it | Decision needed during implementation |
| --- | --- | --- | --- |
| 3.1 Work request | Employer posts profession, broad service area, description, timing, materials, trade details, and up to three optional problem images | Store private images in Supabase Storage and expose only short-lived signed URLs to eligible users | Keep exact addresses and contact details private before selection |
| 3.2 Worker bidding | Matching workers browse open requests and submit one price, pricing model, estimated days, and short message | Match against the worker's saved profession in Express and enforce one bid per worker/request | No paid proposals, bid boosting, or public bid amounts |
| 3.3 Bid selection and agreement | Employer compares bids and KaamPass profiles, selects one, or directly chooses a known worker | Atomically close the request, select one bid, and create the existing pending formal agreement | Preserve both `fixed_total` and `daily_rate`; worker confirms final terms |
| 3.4 Worker response and active job | Pending agreement detail, accept/reject, and participant-only active job | Show every important term and use conditional server transitions so retries cannot duplicate jobs | Rejection reason is optional and private; accepted terms are immutable |
| 3.5 Core checks | Authorization, image privacy, profession matching, and retry checks | Test the API with the correct worker/employer plus unrelated users | Integration-test important state changes; avoid low-value UI snapshots |

Use one service method per business action, such as `createAgreement`, `acceptAgreement`, and `rejectAgreement`. Route handlers should authenticate, validate, call the service, and return the result.

**Module complete when:** an employer can post a request with optional images, only matching workers can bid, the employer can select one bid or use direct hiring, the selected worker can confirm the resulting agreement, and retries cannot create duplicate agreements or jobs.

## Module 4 — Completion and verified history

**Goal:** Implement the central product promise safely.

**Status:** Done for the local MVP — Employer completion, worker confirmation/dispute, private verified history, and statistics are implemented. Local integration checks cover participant authorization, confirmation races and retries, private database access, the three-day PKR 6,000 example, disputed jobs, and repeat-employer totals. The browser flow and Urdu mobile profile were checked. Production deployment and its security configuration remain unverified.

**Retention limitation:** Ordinary clients cannot update or delete verified records, but the trusted service role and database administrators can delete them, including through cascading parent deletion. Restrict privileged credentials and address stronger retention controls before relying on the records as tamper-proof evidence. Verification means participant confirmation, not independent payment verification.

| Task | What to build | How we will build it | Decision needed during implementation |
| --- | --- | --- | --- |
| 4.1 Employer completion | Employer records completed days and agreed payment information | Check participant and current state in Express; move job to worker confirmation | If final values differ, preserve original terms and clearly show both |
| 4.2 Worker confirmation | Confirm completion/payment or report inability to confirm | Use one transaction for state change and work-record creation; make the action safe to retry | A non-confirmed job remains unverified; no large dispute workflow |
| 4.3 Verified record | Immutable record for confirmed work | Add a unique constraint so one job creates at most one record | Decide which short record details may later be public |
| 4.4 Statistics | Verified jobs, work days, private income, and repeat employers | Query canonical verified records first; do not introduce cached counters unless required | Detailed income remains private |
| 4.5 Invariant tests | Mutual confirmation, authorization, uniqueness, and correct totals | Use unit tests for calculations and integration tests for transaction/state behavior | Test only behavior that protects trust or the demo |

Avoid a generic workflow engine. A small set of explicit transition functions is faster to understand and safer to demo.

**Module complete when:** Ahmed moves from 0 jobs, 0 days, Rs 0 to exactly 1 verified job, 3 days, Rs 6,000, even if a request is retried. Employer completion alone must not create history.

## Module 5 — Public KaamPass and QR

**Goal:** Make the worker's permitted professional history portable without leaking private data.

**Status:** In progress — The public page uses an anonymous allowlisted API and owner-only sharing controls. Profiles are private by default; publication requires a separately entered broad public service area. Workers may select verified records by writing separate public summaries; private job descriptions and earnings are not exposed. Workers are warned not to include addresses or contact details in public text. QR codes contain only the HTTPS public profile URL; localhost provides a link and a hosting notice instead. The public route is `/p/<public-id>`; production hosting must serve the web app for that route on direct visits and refreshes. Local privacy integration tests passed; verify the deployed QR with a logged-out phone.

**API:** `GET /public-profiles/:public_id` returns an enabled profile without authentication. `GET /account/public-profile` retrieves the worker's sharing settings; `PATCH /account/public-profile` accepts `{ "is_public": true, "public_service_area": "Lahore" }` to publish or `{ "is_public": false }` to revoke sharing. The owner routes require a worker session.

| Task | What to build | How we will build it | Decision needed during implementation |
| --- | --- | --- | --- |
| 5.1 Public API | Anonymous profile response by opaque public identifier | Select/map only allowlisted fields; do not return private rows and hide fields in React | Decide whether record visibility is explicitly controlled by the worker |
| 5.2 Public page | Name, trade, broad area, experience, skills, verified counts, selected records, and validity explanation | Make work evidence more prominent than ratings; handle invalid links clearly | Implemented: mobile-first page and explicit profile and record sharing controls |
| 5.3 QR | QR containing only the public HTTPS profile URL | Use a maintained package and provide copy/share link fallback | Implemented; deployed phone scan remains |
| 5.4 Privacy check | Anonymous response and storage-access review | Test public JSON directly for forbidden fields | Implemented; local privacy integration tests passed |

**Module complete when:** a logged-out phone can scan Ahmed's QR, open the correct profile, see updated verified history, and cannot obtain phone number, private agreement data, precise address, or detailed earnings.

## Module 6 — Portfolio, feedback, and language polish

**Goal:** Complete the product experience without putting supporting features ahead of the core loop.

**Status:** Done by user decision; the user will perform the remaining mobile and multilingual transaction tests. Portfolio supports private uploads, captions, individual sharing and removal; public image access checks both photo and profile visibility. Removal confirmation, cancellation and save feedback were checked in Edge with a disposable image that was subsequently removed. Feedback was submitted in Edge on a disposable verified job, seen by the worker, and a duplicate request was rejected; the test data was removed. Translation resources cover English, Urdu and Roman Urdu, with matching keys and interpolation values checked automatically; the public profile was reviewed in all three languages. Urdu worker profile, worker jobs, and employer form were reviewed on mobile, and the mobile sign-out control was restored. Language persistence was checked while signed out, after reload, and across demo account sign-ins. Home, jobs and profile layouts were refined for readability and mobile widths. An English desktop browser rehearsal successfully posted a request, submitted and selected a bid, accepted the agreement, recorded completion and verified it as the worker; the profile showed the updated totals, and the disposable records were removed. The resulting worker job views were also checked in all three languages on mobile without horizontal page overflow. The full set of transactional steps has not been repeated on mobile or in each language.

| Task | What to build | How we will build it | Priority and decision |
| --- | --- | --- | --- |
| 6.1 Portfolio | Upload, caption, visibility, removal, and public rendering | Store files in Supabase Storage and ownership/visibility metadata in PostgreSQL; limit file type and size | Should; simple ordering is enough |
| 6.2 Feedback | Optional employer rating/comment after a verified job | Allow one feedback entry per verified job and validate it in Express | Should; no editing/moderation system in the MVP |
| 6.3 Full translations | Core auth, profile, agreement, job, confirmation, error, and public-profile strings | Translate meaning rather than individual words; keep stable keys | Must; agree on Urdu/Roman Urdu work terminology |
| 6.4 RTL pass | Forms, navigation, icons, mixed-script values, and mobile layout | Test the entire Ahmed flow at mobile and desktop widths | Must; mirror only icons whose meaning is directional |
| 6.5 Language persistence | Restore profile language after login and a local choice while logged out | Profile setting wins after authentication | Must |

Portfolio and feedback may be reduced if the core flow is behind. Language support and RTL may not be reduced because they are core accessibility requirements.

**Module complete when:** the Ahmed flow works in all three languages, Urdu layout is usable, language persists, portfolio visibility is respected, and feedback cannot be added to an unverified job.

## Module 7 — Hardening, deployment, and demo

**Goal:** Finish with a stable submission instead of adding late features.

**Revised scope:** The user has deferred 7.1 and 7.2. First refine the landing page, separate the workspace screens, make profiles view-first, and collect worker profession at registration. Then complete 7.3 and 7.5, and 7.4 if deployment is possible.

| Task | What to build/check | How we will do it | Decision needed during implementation |
| --- | --- | --- | --- |
| 7.1 Safety pass | Role/owner authorization, public/private responses, uploads, validation, and secrets | Test endpoints directly with anonymous, owner, participant, and unrelated accounts | Fix correctness/privacy issues before visual polish |
| 7.2 Reliability pass | Loading, error, empty, double-click/retry, responsive, and keyboard behavior | Focus on the demo path and likely failures | Accept small cosmetic issues that do not hurt use or trust |
| 7.3 Demo data/reset | Repeatable seed/reset and final electrician/plumber/painter profiles | Rehearse from a clean state without manual database repair | Freeze demo data after the first successful rehearsal |
| 7.4 Deployment | Deploy web/API and configure Supabase safely | Choose the quickest stack-compatible services; verify production URLs and QR on a phone | Decide providers only when the app is locally stable |
| 7.5 Repository docs | README, setup, environment variables, migration/seed commands, demo steps, acknowledgements, and contribution notes | Verify instructions from a clean checkout; retain the MIT license | Keep documentation short and runnable |

**7.3 and 7.5 progress:** The seed provides the four fictional accounts and three profession-specific profiles, as well as three matching open requests, three verified historical jobs and feedback. On October 26, 2026, it was applied twice to the local database; the second run added no fixed rows and reported existing feedback, confirming idempotency. The profiles, email identities, and demo password were checked. The README now documents local setup, keys, the demo, migrations, reset, checks, and contributions. The MIT licence remains in place. A clean-checkout setup and two complete rehearsals from a clean reset remain to be verified; resetting the current local database would delete its existing data.

**Module complete when:** the core demo succeeds twice from a reset state, required checks pass, a fresh setup works from the README, and the deployed QR flow works on a real phone.

## Time budget

Treat this as a guide. Move a small amount of time between neighboring modules when needed, but reserve the final block for stabilization.

| Module | Target time |
| --- | ---: |
| 0. Quick decisions | 1 hour |
| 1. Foundation | 4 hours |
| 2. Accounts and profiles | 7 hours |
| 3. Agreements and jobs | 7 hours |
| 4. Verified history | 7 hours |
| 5. Public KaamPass and QR | 4 hours |
| 6. Supporting features and language polish | 4 hours |
| 7. Hardening and demo | 6 hours |

If behind schedule, simplify in this order:

1. In-app QR camera scanning; keep QR generation and normal phone scanning.
2. Feedback editing and advanced feedback presentation.
3. Portfolio ordering and image polish.
4. Advanced dashboard charts and animations.
5. Optional profile and profession-specific fields.

Do not simplify mutual confirmation, authorization, public/private separation, the three professions, saved language preference, or Urdu RTL.

## Change policy

The plan accepts useful changes without reopening the whole design.

For a proposed change, answer four questions:

1. Does it help the core demo or fix a real problem?
2. Does it affect a fixed rule, database shape, workflow state, privacy, or more than one module?
3. What is the smallest version that solves the problem?
4. What existing completion check must still pass afterward?

Make the change inside the current module when it is small and local. Record it in the decision log when it changes data, workflow, security/privacy, or a major dependency. Postpone it when it is useful but not necessary for the core demo. Reject it for the hackathon when it expands the out-of-scope product.

Limit each completed module to one planned revision. Correctness, privacy, and security fixes are exceptions. Stop structural refactoring once Module 7 begins unless a real failure requires it.

## Decision log

Update `Status` to `Decided` and write the final choice before the related module begins. Deferred decisions stay open until their module starts.

| ID | Decision | Default | Needed by | Status | Final choice/reason |
| --- | --- | --- | --- | --- | --- |
| D-001 | Workspace/package manager | npm workspace with web, API, contracts | Module 1 | Decided | npm workspace using `apps/web`, `apps/api`, and `packages/contracts`; matches the small MVP and shares only deliberate API contracts |
| D-002 | Authentication method | Email/password | Module 1 | Decided | Use email/password for the MVP; phone OTP would add an SMS-provider dependency |
| D-003 | Account roles | One role per MVP account | Module 2 | Decided | Each account is either a worker or employer, keeping onboarding and authorization explicit |
| D-004 | Money storage | Integer minor units with PKR currency | Module 2 | Decided | Store PKR in integer minor units and format rupees at the application boundary to avoid floating-point errors |
| D-005 | Repeat employer | Two or more verified jobs with same employer | Module 2 | Decided | Count an employer as repeat after two mutually confirmed jobs with the worker |
| D-006 | Public fields | Explicit server allowlist; no contact or earnings | Module 2 | Decided | Public responses contain professional fields and selected evidence only; contact data, exact addresses, agreements, and earnings remain private |
| D-007 | Trade-specific fields | Common columns plus small validated structured details | Module 2 | Decided | Keep common profile data relational and validate a bounded JSONB object for electrician, plumber, or painter details |
| D-008 | QR scanning | Generation Must; in-app camera Should | Module 5 | Deferred | — |
| D-009 | Completion differences | Preserve agreed and final values; worker confirms final values | Module 4 | Decided | Preserve immutable agreed terms alongside actual days and amount already paid; the worker confirms both or reports inability to confirm |
| D-010 | Hosting | Fastest compatible services after local stability | Module 7 | Deferred | — |
| D-011 | Supabase development mode | Keep local CLI support with hosted-project compatibility | Module 1 | Decided | Local Docker development is working, the baseline migration is applied and linted, and the same clients remain compatible with a hosted project |
| D-012 | Agreement and job states | Separate agreement and job state machines | Module 2 | Decided | Agreements use pending, accepted, or rejected; jobs use active, awaiting worker confirmation, verified, or confirmation disputed |
| D-013 | Fictional demo identities | One main flow plus three profession-aware profiles | Module 2 | Decided | Use Ahmed the electrician, Bilal the plumber, Sana the painter, and Ali Raza the household employer |

## Clean-code rules

These rules give us readable code without slowing the hackathon:

- Use TypeScript strict mode and meaningful domain names. Avoid `any` unless a third-party boundary makes it unavoidable and documented.
- Organize code by feature. Keep UI, API route, domain rule, and database query responsibilities separate, but do not create abstractions with only one unclear use.
- Keep React components focused on rendering and interaction. Put API calls in a small typed client/hooks layer.
- Keep Express handlers thin: authenticate, validate, call a service, and return a consistent response.
- Validate every external input in Express with Zod. Frontend validation improves UX but is not trusted.
- Use explicit functions for workflow transitions. Do not let clients write status fields directly.
- Use database migrations for schema changes and repeatable seeds for demo data.
- Add tests for calculations, workflow transitions, authorization, privacy, transactions, and retry safety. Skip tests that merely mirror framework or styling code.
- Prefer clear multi-line code over compressed clever code. Comment reasons and constraints, not obvious syntax.
- Remove dead code, temporary logs, and unused dependencies before completing a module.
- Do not optimize or generalize until there is a demonstrated need.

## Definition of done

A task is done when its main behavior works through the real frontend, API, and database path; affected authorization and privacy rules are enforced; important errors/retries are handled; translations are added for user-facing copy; relevant focused checks pass; and the tracker/decision log is updated.

A module is done only when its stated module completion check passes. Once a Must module passes, protect it with at least one useful automated check or a repeatable demo verification before continuing.

## Daily rhythm

At the start of a work block, pick the first incomplete Must task and write down its completion check. Build the smallest end-to-end version, verify it through the real path, update this tracker, and select the next task. Rehearse Ahmed's full workflow after Module 4 and at the end of every later module. Reserve the final six hours for fixing, setup verification, deployment, and demo rehearsal—no new features.
