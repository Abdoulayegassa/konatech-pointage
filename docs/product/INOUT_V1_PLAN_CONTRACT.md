# InOut V1 Plan Contract

Status: Product Owner approved

All plans include the same available product functionality. Plan differentiation is quantitative only for the approved V1 dimensions below.

| Plan | Max active employees | Administrator capacity | Max active sites |
|---|---:|---:|---:|
| STARTER | 10 | 1 | 1 |
| PRO | 50 | 3 | 3 |
| BUSINESS | 200 | 10 | 10 |

All three plans include monthly reports and custom-period reports/exports, including CSV/PDF where those formats are already supported. QR/site attendance, PWA attendance, and GPS/selfie capabilities remain available where supported and according to the applicable attendance policy.

Historical data still retained by the platform is available equally to all plans, subject to normal authentication, authorization, tenant/site scope, and reporting rules. This contract defines no global legal or platform retention duration and makes no promise of indefinite retention.

Administrator capacity used is the count of active ADMIN memberships plus valid outstanding ADMIN invitations for the same organization. An invitation reserves capacity only while unaccepted, unrevoked, and unexpired.

BUSINESS is a current V1 commercial plan. Standard/Priority/Premium support tiers, prices, billing, SLAs, and additional feature differences are not part of this contract.

The backend `EntitlementsService` is the source of truth for plan limits. The read-only `GET /platform/plan-entitlements` endpoint exposes those definitions only to Platform Admin. The Platform Plans screen consumes that API and does not manage plan definitions.
