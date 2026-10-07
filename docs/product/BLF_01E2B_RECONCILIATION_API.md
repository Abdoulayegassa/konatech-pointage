# BLF-01E2B — reconciliation decisions and evidence lifecycle

This is the backend contract for BLF-01E3. No reconciliation screen is introduced in this phase.

## Review transitions and ownership

Only an authenticated, currently active organization ADMIN may decide a case in their authenticated organization. Platform credentials, employee sessions and legacy administrators do not grant this access. The subscription must permit operational writes. Site identifiers only filter/navigation scope; every case lookup also requires the authenticated organization.

- `PENDING_REVIEW → APPROVED → RESOLVED`: APPROVED is internal to one database transaction. The existing attendance engine applies the historical event, records the APPROVE decision, sets the resulting Attendance reference and commits RESOLVED together. No intermediate approved-without-attendance state is published.
- `PENDING_REVIEW → REJECTED`: a durable REJECT decision; no Attendance mutation. REJECTED is terminal and needs no additional RESOLVED state.
- Same actor, same decision and same trimmed reason on the matching terminal state returns an idempotent result. Other repeated or opposing decisions return 409.
- EXPIRED is never promoted into review or approval. Cases whose original event was already over 24 hours at intake cannot be approved. A case properly admitted within 24 hours can be reviewed later; the administrator's review deadline is not the automatic synchronization deadline.

The service owns all review transitions. A serializable transaction, the established organization entitlement lock and a tenant-scoped case row lock protect decisions. A concurrency/unique-result failure returns 409; callers reload the case rather than overwriting history.

## Correction provenance and conflicts

Approval reuses `AttendanceService.recordCheckIn/recordCheckOut`; it does not create a second calculation engine. Its timestamp is the original capturedAt, and its business date/timezone, site/assignment lineage, schedule and calendar interpretation come from the original server-verified context. A checkout must match the persisted session's original schedule, calendar and site assignment. Existing daily attendance blocks check-in approval, including placeholder rows, so ambiguous corrections require explicit administrative handling. Checkout cannot precede check-in, replace an existing checkout, change site or silently change a session's interpretation.

The existing `checkInVerificationReason` / `checkOutVerificationReason` records `OFFLINE_RECONCILIATION_ADMIN_CORRECTION`. The immutable original sync ledger and reconciliation case retain clientRequestId, action, snapshots, original comments, evidence metadata and private evidence reference. The case and history retain the actor, decision time/reason and resulting Attendance ID. Approval leaves the sync transport classified as RECONCILIATION_REQUIRED with an Attendance reference; it never claims normal automatic ACCEPTED synchronization.

Required historical selfie evidence must exist server-side, and original GPS/event-time evidence policy is checked before a correction. These checks do not replace current account, membership, organization, employee or subscription eligibility. Historical site inactivity can be reviewed; ordinary online attendance still requires an active site.

A separate arbitrary attendance amendment workflow is not introduced here. In particular, EXPIRED events require a separately audited administrative correction process if the business chooses to support that later.

## Organization ADMIN APIs

Backend prefix: `/api/v1/attendance`. Frontend cookie proxies: `/api/attendance` with the same suffixes.

| Method | Suffix                                | Contract                                                                                                                                                  |
| ------ | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/offline-reconciliation`             | Bounded list, `status`, `siteId`, `page` (default 1), `pageSize` (default 25, max 100); `{items,total,page,pageSize,totalPages}`                          |
| GET    | `/offline-reconciliation/:id`         | Review detail, minimal employee/site labels, original event/context, necessary evidence metadata, `hasSelfie`, deletion time, decision history and result |
| GET    | `/offline-reconciliation/:id/selfie`  | Authorized private binary, `private, no-store`, `nosniff`; 404 for missing/deleted/foreign evidence                                                       |
| POST   | `/offline-reconciliation/:id/approve` | `{reason}` (trimmed, 5–1000 characters), atomic correction and resolution                                                                                 |
| POST   | `/offline-reconciliation/:id/reject`  | Same input validation, durable rejection                                                                                                                  |

UUID path identifiers and filter values are validated. Responses project explicitly selected DTO fields; private provider identifiers, URLs, credentials and selfie hashes are not returned. Details contain original review GPS only for authorized administrators. Cookie-based decision proxies additionally require a same-origin Origin header. Direct backend writes use Bearer authorization and existing guards.

## Employee outcome

`GET /attendance/me/offline-reconciliation/:clientRequestId` is employee/organization scoped. It retains durable outcomes independently of local queue removal. Normal acceptance and expiry retain their original semantics; reviewed approval yields `state: resolved`, `reviewStatus: RESOLVED`; rejection yields rejected/REJECTED. Pending review retains reconciliation_required/PENDING_REVIEW. Decision reason/time and Attendance reference are returned without the private selfie, GPS, provider identity or decision actor. The employee cookie proxy supports the existing account and attendance-entry session modes.

## Local queue contract

The existing IndexedDB store is preserved. Blob persistence completes before queue success, and queue entries reference the evidence ID. Failed queue writes compensate the Blob. Legacy DataURLs migrate to the same store; unreferenced binary records are pruned.

401/403 retain the event and evidence in pending retry. A refreshed, owner-matching secured session can retry signed-context events. Over 24 hours, local expiration retains final metadata and permits binary deletion; it does not offer review approval. No context-only authentication or unauthenticated upload endpoint exists.

Local evidence IDs never enter the backend security DTO; submission sends the reconstructed photo bytes and the original security fields. Older auth-blocked signed-context queue entries without an acknowledged server intake can retry after owner-matching reauthentication; acknowledged reviews remain terminal locally. Successful acceptance requires an explicit accepted outcome. Pending review releases local evidence only when a successful server response also carries `evidenceAcknowledged: true`. Incomplete or failed intake remains retryable. Historical incomplete cases without required selfie evidence are not acknowledged as safe evidence intake and cannot be approved automatically.

## Evidence security and storage lifecycle

Exact-byte SHA-256 reuse is one organization-scoped policy across Attendance and reconciliation, for any employee in that organization. Both tables are checked before upload and again under the same organization/fingerprint transaction lock before persistence. Attendance hashes remain after binary retention; reconciliation hashes remain as audit metadata. Existing Attendance public identifiers are backfilled into hash columns only when they have the recognized fingerprint suffix.

Reconciliation uploads use a unique private provider identity and a durable upload intent written before contacting Cloudinary. Intake removes that intent atomically with the referenced case. Upload/commit failures attempt compensation, while the intent remains available for a later sweep, including ambiguous timeouts and failed deletion. Intake must own the intent when it commits; an expired upload cannot receive a safe acknowledgement. The daily worker retries intents older than one day under a row lock and checks existing case references before deleting. Failed cleanup leaves the durable intent intact.

PENDING_REVIEW and unresolved evidence references are protected. Resolved/rejected evidence becomes eligible **90 days after decidedAt**, using the existing technical retention duration; failed provider deletion retains the reference/failure metadata for retry. Successful deletion clears the provider reference and records deletion time while preserving the case, fingerprint, decision history and original metadata. Normal accepted Attendance retains its existing evidence retention lifecycle.

**90 days is a technical V1 value requiring final product/legal approval before production. It is not represented as a legal requirement.** The policy for retaining audit metadata/fingerprints also requires the product's normal privacy review.

## Human acceptance still required

BLF-01F retains installed-browser/PWA acceptance on supported employee devices: capture a real selfie offline, close/reopen the app, fail authentication, reauthenticate, retry within/after 24 hours, verify ordering and private evidence delivery, then exercise review outcomes through the intended UI. Headless Chrome IndexedDB tests validate the actual binary storage contract but do not substitute for installed mobile PWA acceptance. BLF-01E3 still owns presentation and outcome consumption; no employee reconciliation UI or broad admin redesign is added here.

## Browser-test prerequisite

The IndexedDB suite uses the repository's existing Puppeteer dependency and Node version from `.nvmrc`. It launches the configured `ATTENDANCE_PDF_EXECUTABLE_PATH`, or Puppeteer's installed default browser. Install the matching browser with the existing `pnpm --dir apps/backend exec puppeteer browsers install chrome` CLI when necessary; no new framework or dependency is required.
