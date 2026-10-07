# Module Pointage

| Métadonnée | Valeur |
|---|---|
| Document ID | SAR-ATT-001 |
| Version | 1.0 |
| Statut | Validé |
| Classification | Interne |
| Référence SAPDD | Module Pointage |
| Date de génération | 29 juillet 2026 |

## 1. Présentation du module

### 1.1 Objectif

Le module Pointage enregistre et restitue les présences quotidiennes des employés. Il prend en charge l'entrée, la sortie, l'état quotidien, l'historique mensuel, les indicateurs de présence, la sécurité GPS et photographique, la conservation du planning applicable au moment du pointage et les exports mensuels.

L'entité persistée est `Attendance`. Une contrainte composite garantit un seul enregistrement par employé et par date normalisée.

### 1.2 Rôle

`AttendanceService` est identifié dans le code comme source de vérité pour :

- l'entrée et la sortie ;
- le retard ;
- le départ anticipé ;
- les heures supplémentaires ;
- le travail pendant un jour non ouvré ;
- l'historique de pointage.

`AttendanceSecurityService` est identifié comme source de vérité de l'évaluation GPS et selfie. Le frontend collecte les justificatifs, mais les contrôles qui autorisent ou refusent l'enregistrement sont exécutés côté backend.

### 1.3 Responsabilités

Le périmètre constaté comprend :

- redirection publique vers la borne fixe ;
- authentification de borne par PIN ;
- pointage authentifié d'un employé ;
- pointage administratif pour un employé désigné ;
- détermination de l'action disponible ;
- validation de l'employé actif ;
- validation temporelle de l'événement ;
- calcul du retard et du statut ;
- calcul du départ anticipé et des heures supplémentaires ;
- détection du travail hors planning et des jours non ouvrés ;
- capture d'un snapshot du planning ;
- capture et stockage des preuves GPS et selfie ;
- justification textuelle du pointage hors bureau ;
- lecture quotidienne et mensuelle ;
- calcul des absences mensuelles ;
- matérialisation mensuelle des absences ;
- synthèse quotidienne ;
- export mensuel CSV et PDF.

Fichiers principaux :

- `apps/backend/src/modules/attendance/attendance.service.ts`
- `apps/backend/src/modules/attendance/attendance-security.service.ts`
- `apps/backend/src/modules/attendance/attendance.controller.ts`
- `apps/backend/prisma/schema.prisma`
- `apps/frontend/components/attendance/employee-attendance-actions.tsx`

## 2. Position dans l'architecture

### 2.1 Interaction avec Auth

Les routes du contrôleur sont soumises aux guards globaux JWT et rôles. Une seule route du contrôleur Pointage est publique : `GET /api/v1/attendance/entry`, qui redirige vers `/attendance-entry`.

La borne appelle `POST /api/v1/auth/attendance-entry/login`, route publique du module Auth. `AuthService` recherche les comptes actifs de rôle `EMPLOYEE`, compare le PIN aux hashes scrypt ou à l'ancien champ en clair, migre une valeur historique vers un hash si nécessaire et émet un JWT à durée dédiée. La valeur par défaut de cette durée est 15 minutes.

Le frontend conserve ce JWT dans le cookie de session de borne `konatech-attendance-entry-session`. Les Route Handlers de pointage choisissent ce cookie lorsqu'ils opèrent en mode `attendance-entry`.

Fichiers principaux :

- `apps/backend/src/modules/auth/auth.service.ts`
- `apps/backend/src/modules/auth/auth.controller.ts`
- `apps/backend/src/modules/auth/constants/attendance-entry.constants.ts`
- `apps/frontend/app/api/auth/attendance-entry-session/route.ts`
- `apps/frontend/lib/auth-session.ts`
- `apps/frontend/lib/api-route.ts`

### 2.2 Interaction avec Employee

Chaque pointage appartient à un `Employee`. À l'entrée, le service charge l'employé et son planning, puis refuse un employé absent ou inactif. Les endpoints `me/*` utilisent l'identifiant issu du JWT. Les endpoints administratifs utilisent l'UUID reçu dans le DTO.

La suppression d'un employé entraîne la suppression en cascade de ses pointages selon la relation Prisma.

### 2.3 Interaction avec Schedule

Le planning courant fournit :

- les jours travaillés ;
- l'heure d'entrée ;
- l'heure de sortie ;
- la marge de retard ;
- l'état actif.

À l'entrée, les propriétés du planning actif sont copiées dans l'enregistrement de pointage. À la sortie, les calculs privilégient ce snapshot. Si aucun snapshot n'existe, le planning courant constitue le repli. Les recalculs mensuels et les exports utilisent le même mécanisme de résolution.

### 2.4 Interaction avec Calendar

`AttendanceModule` importe `CalendarModule`. `AttendanceService` utilise `CalendarService` pour :

- déterminer si la date est non ouvrée ;
- exclure les dates non ouvrées du calcul des absences ;
- qualifier un pointage effectué ce jour comme `NON_WORKING_DAY_WORK`.

`AttendanceMonthlyMetricsService` utilise également le calendrier lors de la création des absences manquantes et des recalculs.

### 2.5 Interaction avec Dashboard

Le dashboard ne consomme pas `AttendanceService` par injection. `DashboardService` lit directement Prisma pour produire ses statistiques et activités récentes. Le contrôleur Pointage expose parallèlement `GET /attendance/summary`, qui calcule les effectifs attendus, entrés, sortis, en retard et absents.

Le dashboard frontend affiche aussi le QR de la borne. Sa valeur est l'URL publique `/attendance-entry`, fournie par la page d'administration.

### 2.6 Interaction avec Reports

Les exports mensuels appartiennent à `AttendanceModule`. `MonthlyAttendanceExportService` lit les employés, les pointages, les plannings, le calendrier et les sanctions. Il produit une représentation de rapport transmise à l'exporteur CSV ou PDF.

Le PDF dispose d'un rendu Puppeteer et d'un rendu interne qualifié de legacy. Le contrôleur choisit CSV par défaut et PDF lorsque `format=pdf`.

### 2.7 Diagramme de positionnement

```text
                         +----------------------+
                         |      AuthModule      |
                         | JWT, rôles, PIN borne|
                         +----------+-----------+
                                    |
                                    v
+-----------+     +----------------------------------------+     +-----------+
| Frontend  | --> |            AttendanceModule            | --> | Employee  |
| deux vues |     | Controller / Service / Security / Export|     +-----------+
+-----------+     +-----+-----------+-----------+----------+
                        |           |           |
                        v           v           v
                   +---------+ +----------+ +-----------+
                   |Schedule | | Calendar | | Sanctions |
                   +---------+ +----------+ +-----------+
                        \           |           /
                         \          |          /
                          v         v         v
                         +----------------------+
                         | Prisma / PostgreSQL  |
                         +----------------------+
                                    |
                          +---------+---------+
                          | Dashboard/Reports |
                          +-------------------+
```

Fichiers principaux :

- `apps/backend/src/modules/attendance/attendance.module.ts`
- `apps/backend/src/modules/attendance/attendance-monthly-metrics.service.ts`
- `apps/backend/src/modules/attendance/exports/monthly-attendance-export.service.ts`
- `apps/backend/src/modules/dashboard/dashboard.service.ts`
- `apps/frontend/components/dashboard/attendance-entry-qr-card.tsx`

## 3. Architecture générale

### 3.1 Frontend

Trois pages présentent les données de pointage :

| Page | Public | Rôle |
|---|---:|---|
| `/attendance-entry` | Oui pour l'écran PIN | Borne fixe, identification PIN puis pointage de l'employé identifié |
| `/my-attendance` | Non | Espace personnel d'un compte `EMPLOYEE` |
| `/attendance-history` | Non | Historique administratif, réservé à `ADMIN` |

`/attendance-entry` choisit côté serveur entre `AttendanceEntryPinView` et `FixedAttendanceEntryView` selon le cookie de borne et la validité du JWT. `/my-attendance` charge l'état du jour et l'historique du mois pour la session de compte. Les deux écrans de pointage utilisent `EmployeeAttendanceActions`.

### 3.2 Backend

`AttendanceModule` contient :

- un contrôleur ;
- six services métier ou techniques de pointage ;
- quatre services d'export ;
- six DTO ;
- des utilitaires partagés de date, sortie et snapshot.

Il importe `CalendarModule` et `SanctionsModule`, fournit `AppClockService`, et exporte `AttendanceService`.

### 3.3 API

L'API backend est préfixée par `/api/v1`. Le frontend utilise des Route Handlers `/api/*` comme couche proxy. Ceux-ci lisent le JWT dans le cookie de compte ou de borne, ajoutent l'en-tête Bearer et relaient le JSON.

Les lectures initiales des pages serveur utilisent directement `requestApi` avec le token disponible côté serveur.

### 3.4 Services

`AttendanceService` orchestre les règles de présence. `AttendanceSecurityService` évalue les preuves. `AttendanceSecurityPolicyService` résout la configuration et calcule les distances. `AttendancePhotoStorageService` envoie les selfies à Cloudinary. `AttendanceMonthlyMetricsService` matérialise et recalcule les métriques. `AttendanceEntryService` construit l'URL fixe.

### 3.5 Persistance

Prisma manipule PostgreSQL. `Attendance` contient les instants, résultats calculés, notes, snapshot de planning et métadonnées de vérification. La création ou mise à jour du pointage s'effectue par `create` ou `updateMany`. `updateMany` ajoute des conditions sur l'état courant pour prévenir deux validations concurrentes.

### 3.6 Diagramme général

```text
Navigateur
   |
   +-- /my-attendance -------- cookie compte
   |
   +-- /attendance-entry ----- cookie borne obtenu par PIN
   |
   v
Next.js App Router
   |-- pages serveur : état du jour + historique
   |-- composant client : assistant de pointage
   |-- Route Handlers : proxy JSON authentifié
   v
NestJS /api/v1
   |
   +-- JwtAuthGuard / RolesGuard / ValidationPipe / ThrottlerGuard
   |
   v
AttendanceController
   |
   +--> AttendanceService
   |       +--> CalendarService
   |       +--> AttendanceSecurityService
   |       |       +--> SecurityPolicyService
   |       |       +--> PhotoStorageService --> Cloudinary
   |       +--> PrismaService
   |
   +--> MonthlyAttendanceExportService
   |       +--> Calendar / Sanctions / Prisma
   |
   +--> CSV / PDF exporters
   v
PostgreSQL
```

Fichiers principaux :

- `apps/frontend/app/attendance-entry/page.tsx`
- `apps/frontend/app/my-attendance/page.tsx`
- `apps/frontend/app/attendance-history/page.tsx`
- `apps/frontend/lib/api-route.ts`
- `apps/backend/src/modules/attendance/attendance.module.ts`
- `apps/backend/prisma/schema.prisma`

## 4. Organisation des fichiers

### 4.1 Backend propre au module

```text
apps/backend/src/modules/attendance/
├── dto/
│   ├── attendance-history-query.dto.ts
│   ├── check-in-security.dto.ts
│   ├── check-in.dto.ts
│   ├── check-out.dto.ts
│   ├── monthly-attendance-export-query.dto.ts
│   ├── self-check-in.dto.ts
│   └── self-check-out.dto.ts
├── exports/
│   ├── monthly-attendance-csv-exporter.service.ts
│   ├── monthly-attendance-export.service.ts
│   ├── monthly-attendance-export.types.ts
│   ├── monthly-attendance-pdf-exporter.service.ts
│   └── monthly-attendance-puppeteer-pdf-renderer.service.ts
├── attendance-entry.service.ts
├── attendance-monthly-metrics.service.ts
├── attendance-photo-storage.service.ts
├── attendance-security-policy.service.ts
├── attendance-security.exception.ts
├── attendance-security.service.ts
├── attendance.controller.ts
├── attendance.module.ts
└── attendance.service.ts
```

| Dossier/fichier | Rôle |
|---|---|
| `dto/` | Validation des paramètres de lecture, des entrées/sorties et des preuves de sécurité |
| `exports/` | Construction du rapport mensuel et sérialisation CSV/PDF |
| `attendance.controller.ts` | API REST, permissions, téléchargement et audit |
| `attendance.service.ts` | Moteur principal de présence |
| `attendance-security.service.ts` | Règles serveur GPS/selfie |
| `attendance-security-policy.service.ts` | Lecture de politique et distance Haversine |
| `attendance-photo-storage.service.ts` | Validation et envoi Cloudinary |
| `attendance-monthly-metrics.service.ts` | Absences matérialisées et recalcul mensuel |
| `attendance-entry.service.ts` | URL frontend de la borne |
| `attendance-security.exception.ts` | Type d'exception de sécurité présent dans le module |
| `attendance.module.ts` | Assemblage NestJS |

### 4.2 Utilitaires backend partagés

```text
apps/backend/src/common/
├── prisma/selects.ts
├── security/
│   ├── app-throttler.guard.ts
│   ├── jwt.util.ts
│   └── password.util.ts
├── time/app-clock.service.ts
└── utils/
    ├── attendance-checkout.util.ts
    ├── attendance-date.util.ts
    └── attendance-schedule-snapshot.util.ts
```

### 4.3 Frontend Pointage

```text
apps/frontend/
├── app/
│   ├── api/
│   │   ├── attendance/
│   │   │   ├── exports/monthly/route.ts
│   │   │   └── me/
│   │   │       ├── check-in/route.ts
│   │   │       └── check-out/route.ts
│   │   └── auth/attendance-entry-session/route.ts
│   ├── attendance-entry/
│   │   ├── error.tsx
│   │   ├── loading.tsx
│   │   └── page.tsx
│   ├── attendance-history/page.tsx
│   └── my-attendance/
│       ├── error.tsx
│       ├── loading.tsx
│       └── page.tsx
├── components/
│   ├── attendance/
│   │   ├── attendance-action-flow.ts
│   │   ├── attendance-browser-security.ts
│   │   ├── attendance-display.ts
│   │   ├── attendance-entry-pin-view.tsx
│   │   ├── attendance-entry-session-button.tsx
│   │   ├── attendance-live-clock.tsx
│   │   ├── attendance-selfie-capture.tsx
│   │   ├── employee-attendance-actions.tsx
│   │   └── fixed-attendance-entry-view.tsx
│   ├── attendance-history/
│   │   ├── attendance-detail-panel.tsx
│   │   ├── attendance-history-filters.tsx
│   │   ├── attendance-history-table.tsx
│   │   └── attendance-history-workspace.tsx
│   └── dashboard/attendance-entry-qr-card.tsx
└── lib/
    ├── api-route.ts
    ├── api.ts
    ├── auth-session.ts
    └── auth.ts
```

Fichiers principaux : les arborescences ci-dessus.

## 5. Workflow complet du pointage

### 5.1 Arrivée par QR

Le QR généré dans le dashboard encode uniquement l'URL `/attendance-entry`. Il ne contient ni identité, ni PIN, ni action de pointage, ni jeton de session. Son scan ouvre la borne.

Sans cookie de borne, la page présente un clavier PIN. Après quatre chiffres, le frontend appelle le Route Handler de session, qui appelle l'authentification backend. En cas de succès, un cookie HTTP de borne est créé et la page est rechargée.

### 5.2 Arrivée par compte

Un employé connecté par email et mot de passe accède à `/my-attendance`. La page refuse le rôle `ADMIN`, charge `/attendance/me/today` et `/attendance/me/history`, puis présente la même action de pointage.

### 5.3 Assistant commun

Le workflow visible est :

```text
Action Entrée ou Sortie
        |
        v
Capture du selfie obligatoire
        |
        v
Commentaire facultatif
        |
        v
Tentative de géolocalisation
        |
        v
Écran de vérification
        |
        v
Confirmation utilisateur
        |
        v
POST entrée ou sortie
        |
        +-- refus : maintien sur vérification + message
        |
        +-- succès : écran de résultat
```

L'ordre réel place donc la photo avant le commentaire, puis la collecte GPS lors du passage à la validation. L'utilisateur ne choisit pas librement entre entrée et sortie lorsque l'état du jour ne le permet pas : `canCheckIn` et `canCheckOut` proviennent du backend.

### 5.4 Séquence complète

```text
Employé     Page Next.js     Auth API      Composant       Attendance API   Services       Prisma
   |             |              |              |                 |              |             |
   | scan QR     |              |              |                 |              |             |
   |------------>| écran PIN    |              |                 |              |             |
   | PIN 4 chiffres             |              |                 |              |             |
   |--------------------------->| compare hash |                 |              |             |
   |             |<-------------| JWT 15 min   |                 |              |             |
   |             | cookie borne |              |                 |              |             |
   |             | charge today + history ---->|---------------->|------------->| Prisma      |
   |<------------| action disponible           |                 |              |             |
   | entrée/sortie                              |                 |              |             |
   |------------------------------------------->| selfie          |              |             |
   |------------------------------------------->| commentaire     |              |             |
   |             |              |              | demande GPS     |              |             |
   |<-------------------------------------------| permission nav. |              |             |
   |------------------------------------------->| confirmer       |              |             |
   |             |              |              | POST JSON       |              |             |
   |             |              |              |---------------->| validation   |             |
   |             |              |              |                 |------------->| employé/date|
   |             |              |              |                 |              |------------>|
   |             |              |              |                 |              | sécurité    |
   |             |              |              |                 |              | photo cloud |
   |             |              |              |                 |              | calculs     |
   |             |              |              |                 |              | create/update
   |             |              |              |                 |              |------------>|
   |             |              |              |<----------------| objet complet|             |
   |<-------------------------------------------| succès          |              |             |
```

### 5.5 Enregistrement final

L'entrée crée l'enregistrement du jour ou complète un enregistrement d'absence existant sans entrée/sortie. La sortie met à jour cet enregistrement. Les écritures conditionnelles empêchent qu'une deuxième requête simultanée valide la même action.

Fichiers principaux :

- `apps/frontend/components/attendance/employee-attendance-actions.tsx`
- `apps/frontend/components/attendance/attendance-selfie-capture.tsx`
- `apps/frontend/components/attendance/attendance-entry-pin-view.tsx`
- `apps/backend/src/modules/auth/auth.service.ts`
- `apps/backend/src/modules/attendance/attendance.service.ts`

## 6. Contrôleurs

### 6.1 AttendanceController

`AttendanceController` est l'unique contrôleur propre au module.

| Méthode | Endpoint | Permission | DTO / validation | Dépendance principale |
|---|---|---|---|---|
| GET | `/api/v1/attendance/entry` | Public | Aucune | `AttendanceEntryService` |
| GET | `/api/v1/attendance/summary` | `ADMIN` | Aucune | `AttendanceService` |
| GET | `/api/v1/attendance/history` | `ADMIN` | `AttendanceHistoryQueryDto` | `AttendanceService` |
| GET | `/api/v1/attendance/exports/monthly` | `ADMIN` | `MonthlyAttendanceExportQueryDto` | services d'export |
| GET | `/api/v1/attendance/me/today` | `EMPLOYEE` | Utilisateur JWT | `AttendanceService` |
| GET | `/api/v1/attendance/me/security-policy` | `EMPLOYEE` | Utilisateur JWT | `AttendanceService` |
| GET | `/api/v1/attendance/me/history` | `EMPLOYEE` | `AttendanceHistoryQueryDto` + utilisateur JWT | `AttendanceService` |
| POST | `/api/v1/attendance/check-in` | `ADMIN` | `CheckInDto` | `AttendanceService` + audit |
| POST | `/api/v1/attendance/check-out` | `ADMIN` | `CheckOutDto` | `AttendanceService` + audit |
| POST | `/api/v1/attendance/me/check-in` | `EMPLOYEE` | `SelfCheckInDto` | `AttendanceService` |
| POST | `/api/v1/attendance/me/check-out` | `EMPLOYEE` | `SelfCheckOutDto` | `AttendanceService` |

### 6.2 Validation des DTO

| DTO | Contraintes |
|---|---|
| `AttendanceHistoryQueryDto` | `month` facultatif au format `YYYY-MM` |
| `CheckInDto` | `employeeId` UUID, date ISO facultative, notes chaîne de 200 caractères, sécurité imbriquée |
| `CheckOutDto` | `employeeId` UUID, date ISO facultative, sécurité imbriquée |
| `SelfCheckInDto` | date ISO facultative, notes facultatives de 200 caractères, sécurité imbriquée |
| `SelfCheckOutDto` | mêmes champs que SelfCheckIn |
| `CheckInSecurityProofDto` | lat. -90/90, long. -180/180, précision 0/50000, image data URL ≤ 1 000 000 caractères |
| `MonthlyAttendanceExportQueryDto` | mois 1–12, année 2000–2100, format CSV/PDF, employé UUID facultatif |

Le `ValidationPipe` global supprime les propriétés non déclarées, rejette les propriétés supplémentaires et transforme les types.

### 6.3 AuthController associé à la borne

`POST /api/v1/auth/attendance-entry/login` appartient à `AuthController`. Il est public et reçoit `AttendanceEntryLoginDto`, dont le PIN doit correspondre à exactement quatre chiffres.

### 6.4 Audit du contrôleur

Les entrées et sorties administratives produisent respectivement :

- `attendance.admin_check_in` ;
- `attendance.admin_check_out`.

L'export produit `attendance.monthly_export`. Les actions `me/*` ne déclenchent pas d'appel à `AuditLogService` dans le contrôleur.

Fichiers principaux :

- `apps/backend/src/modules/attendance/attendance.controller.ts`
- `apps/backend/src/modules/attendance/dto/`
- `apps/backend/src/modules/auth/auth.controller.ts`
- `apps/backend/src/main.ts`

## 7. Services

### 7.1 Tableau des services

| Service | Responsabilités | Dépendances |
|---|---|---|
| `AttendanceService` | État du jour, entrée, sortie, calculs, historique, absences | Prisma, sécurité, calendrier |
| `AttendanceSecurityService` | Exigences selfie/GPS, qualification et métadonnées | policy, photo storage |
| `AttendanceSecurityPolicyService` | Configuration de sécurité, rayons, distance | `ConfigService` |
| `AttendancePhotoStorageService` | Validation data URL, signature et upload | `ConfigService`, Cloudinary |
| `AttendanceMonthlyMetricsService` | Absences manquantes et recalculs | Prisma, calendrier |
| `AttendanceEntryService` | URL absolue de borne | `ConfigService` |
| `MonthlyAttendanceExportService` | Modèle de rapport mensuel | Prisma, calendrier, sanctions, clock |
| `MonthlyAttendanceCsvExporterService` | Sérialisation CSV | rapport construit |
| `MonthlyAttendancePdfExporterService` | Sélection et génération PDF | renderer Puppeteer |
| `MonthlyAttendancePuppeteerPdfRendererService` | Document HTML/PDF premium | Puppeteer |

### 7.2 Méthodes d'AttendanceService

| Méthode | Fonction |
|---|---|
| `getTodaySummary` | Synthèse du jour pour l'administration |
| `getMonthlyHistory` | Historique mensuel de tous les employés |
| `getEmployeeMonthlyHistory` | Historique mensuel d'un employé |
| `getEmployeeTodayAttendance` | Employé, état du jour, actions, absences et policy |
| `getCheckInSecurityPolicy` | Expose la policy calculée |
| `checkIn` / `checkOut` | Pointage administratif sans exigences de sécurité forcées |
| `checkInForEmployee` / `checkOutForEmployee` | Pointage personnel avec sécurité forcée |
| `recordCheckIn` / `recordCheckOut` | Implémentation interne des écritures |
| `getMonthlyAbsenceCount` | Compte les jours planifiés non travaillés |

### 7.3 Appels internes

```text
AttendanceService
   |
   +-- getActiveEmployeeWithSchedule --> Prisma.Employee
   +-- recordCheckIn
   |     +-- CalendarService
   |     +-- buildAttendanceScheduleSnapshot
   |     +-- AttendanceSecurityService.evaluateCheckIn
   |     +-- Prisma.Attendance create/updateMany
   |
   +-- recordCheckOut
   |     +-- resolveAttendanceSchedule
   |     +-- CalendarService
   |     +-- checkout utilities
   |     +-- AttendanceSecurityService.evaluateCheckOut
   |     +-- Prisma.Attendance updateMany
   |
   +-- histories/summary/absenceCount --> Prisma + Calendar

AttendanceSecurityService
   +-- AttendanceSecurityPolicyService
   +-- AttendancePhotoStorageService --> Cloudinary
```

### 7.4 Service mensuel

Au démarrage, `AttendanceMonthlyMetricsService` installe un intervalle de 24 heures. L'exécution automatique ne recalcule le mois précédent que lorsque la date UTC est le premier jour du mois. Le timer est libéré par `unref` et supprimé à la destruction du module.

Fichiers principaux :

- `apps/backend/src/modules/attendance/attendance.service.ts`
- `apps/backend/src/modules/attendance/attendance-security.service.ts`
- `apps/backend/src/modules/attendance/attendance-monthly-metrics.service.ts`
- `apps/backend/src/modules/attendance/exports/`

## 8. Moteur métier

### 8.1 Date de pointage

`occurredAt` est converti en `Date`. S'il est absent, l'heure serveur courante est utilisée. Une valeur invalide ou future est refusée. La date métier est le jour UTC obtenu en mettant l'heure à `00:00:00.000Z`.

### 8.2 Validation de l'entrée

Le service :

1. charge l'employé, exige son existence et `isActive=true` ;
2. normalise l'instant et la date ;
3. recherche `Attendance` par `(employeeId, date)` ;
4. refuse une entrée existante ;
5. refuse une entrée après une sortie déjà enregistrée ;
6. calcule le statut, le retard et la sortie planifiée ;
7. construit le snapshot ;
8. calcule le nombre d'absences du mois ;
9. évalue la sécurité ;
10. complète un enregistrement vide existant ou crée le pointage.

Un enregistrement `ABSENT` matérialisé peut ainsi être converti en pointage si ses deux instants sont encore nuls.

### 8.3 Calcul du retard

Le retard est calculé uniquement si :

- la date n'est pas non ouvrée ;
- un planning actif existe ;
- le jour UTC appartient aux `workDays`.

Formule :

```text
retard = heure réelle
       - heure de début du planning
       - marge de retard

minutesLate = max(0, arrondi(retard en minutes))
```

Si `minutesLate > 0`, le statut d'entrée est `LATE`. Sinon il est `INCOMPLETE` jusqu'à la sortie. Hors planning ou sans planning actif, les minutes valent zéro et le statut est `INCOMPLETE`. Un jour non ouvré produit immédiatement `NON_WORKING_DAY_WORK`.

### 8.4 Validation de la sortie

Le service :

1. normalise l'instant et la date ;
2. charge le pointage du jour, son snapshot et le planning courant ;
3. exige une entrée ;
4. refuse une sortie déjà enregistrée ;
5. refuse un instant antérieur à l'entrée ;
6. évalue la sécurité ;
7. résout le planning historique ;
8. détermine le travail hors planning ;
9. calcule sortie anticipée ou heures supplémentaires ;
10. recalcule les absences ;
11. effectue une mise à jour conditionnelle.

### 8.5 Calcul de sortie

Pour un jour planifié :

- sortie avant l'heure planifiée : `earlyExit=true`, minutes d'avance arrondies ;
- sortie exactement à l'heure : aucune sortie anticipée, aucune heure supplémentaire ;
- sortie après l'heure : `lateExit=true`, `overtimeMinutes` arrondies et `overtimeHours` arrondies à deux décimales.

Pour un travail hors planning, toute la durée comprise entre entrée et sortie devient `overtimeMinutes` et `overtimeHours`. `scheduledExitTime` reste nul et `lateExit` reste faux.

### 8.6 Statut final

| Situation | Statut |
|---|---|
| Jour non ouvré avec entrée | `NON_WORKING_DAY_WORK` |
| Jour hors planning après sortie | `PRESENT` |
| Jour planifié, retard > 0 | `LATE` |
| Jour planifié, pas de retard | `PRESENT` |
| Entrée sans sortie, hors cas non ouvré | `INCOMPLETE` ou `LATE` |
| Absence matérialisée | `ABSENT` |

### 8.7 Calcul des absences

Le moteur parcourt chaque date UTC depuis le début du mois jusqu'au lendemain du jour de référence, sans dépasser la fin du mois. Une absence est comptée si :

- le planning est actif ;
- le jour appartient au planning ;
- le jour n'est pas non ouvré ;
- aucun pointage avec entrée n'existe.

La date en cours d'enregistrement est ajoutée aux dates travaillées pour ne pas compter l'entrée courante comme absence.

### 8.8 Concurrence

La contrainte `@@unique([employeeId, date])` protège la création. Les mises à jour utilisent `updateMany` avec des conditions sur `clockInAt` et `clockOutAt`. Si aucune ligne n'est mise à jour, le service retourne un conflit de doublon.

Fichiers principaux :

- `apps/backend/src/modules/attendance/attendance.service.ts`
- `apps/backend/src/common/utils/attendance-date.util.ts`
- `apps/backend/src/common/utils/attendance-checkout.util.ts`
- `apps/backend/prisma/schema.prisma`

## 9. Snapshot

### 9.1 Objectif

Le snapshot conserve les paramètres du planning applicables au pointage afin que les calculs ultérieurs ne dépendent pas exclusivement du planning courant.

### 9.2 Création

À l'entrée, `buildAttendanceScheduleSnapshot` reçoit le planning et l'instant. Si le planning est absent ou inactif, tous les champs sont nuls et le JSON de jours est `JsonNull`. Sinon, les six valeurs métier et `capturedAt` sont copiées.

### 9.3 Stockage

Les colonnes sont :

- `scheduleIdSnapshot` ;
- `scheduleNameSnapshot` ;
- `scheduleStartTimeSnapshot` ;
- `scheduleEndTimeSnapshot` ;
- `scheduleWorkDaysSnapshot` ;
- `scheduleLatenessMarginSnapshot` ;
- `scheduleCapturedAt`.

Elles appartiennent directement à `Attendance`; il n'existe pas de table Snapshot séparée.

### 9.4 Utilisation

`resolveAttendanceSchedule` recherche d'abord la présence d'au moins une propriété de snapshot. Si elle existe, la source est `snapshot`. Sinon, un planning courant actif devient la source `current`. Sans les deux, la source vaut `none`.

La sortie, le recalcul mensuel et les exports utilisent la résolution historique pour les jours travaillés et l'heure de sortie.

### 9.5 Lecture et historique

`attendanceWithEmployeeSelect` expose tous les champs de snapshot. Ils sont donc renvoyés par les endpoints d'historique, d'état du jour et après mutation. L'historique administratif affiche les informations résolues au moyen des données présentes dans l'enregistrement.

Fichiers principaux :

- `apps/backend/src/common/utils/attendance-schedule-snapshot.util.ts`
- `apps/backend/src/modules/attendance/attendance.service.ts`
- `apps/backend/src/common/prisma/selects.ts`
- `apps/backend/prisma/schema.prisma`

## 10. GPS

### 10.1 Collecte

Le navigateur utilise `navigator.geolocation.getCurrentPosition` avec :

- haute précision activée ;
- âge maximal accepté de 60 secondes ;
- délai de 6 secondes.

La collecte est tentée après le selfie et le commentaire. Un échec marque la position indisponible, mais le frontend poursuit vers la validation ; le backend décide ensuite selon la policy.

### 10.2 Policy

La sécurité GPS n'est active que si `ATTENDANCE_SECURITY_ENABLED` est vrai et si les coordonnées de l'entreprise sont toutes deux configurées.

Valeurs par défaut du service :

- rayon de confiance : 100 m ;
- rayon d'avertissement : 300 m ;
- précision maximale : 200 m.

`allowedRadiusMeters` utilise la valeur explicitement configurée, sinon le rayon d'avertissement. La distance est calculée par la formule de Haversine et arrondie au mètre.

### 10.3 Contrôle serveur

Pour un endpoint personnel, lorsque la policy est active :

- l'absence de coordonnées est refusée ;
- une précision absente ou supérieure au maximum est refusée ;
- une distance supérieure au rayon autorisé exige une note non vide.

Une position hors rayon avec commentaire est acceptée et qualifiée `OFFSITE_LOCATION_JUSTIFIED`.

Les endpoints administratifs passent `enforceSecurity=false`; les exigences GPS et selfie ne sont pas imposées, mais les preuves fournies sont toujours évaluées et stockées.

### 10.4 Stockage

Entrée et sortie possèdent chacune :

- latitude ;
- longitude ;
- précision ;
- distance calculée ;
- méthode ;
- niveau ;
- motif.

La méthode vaut `PHOTO` lorsqu'une photo existe, même si une position est également enregistrée. Sans photo, elle vaut `GPS` si une position existe, sinon `NONE`. Le niveau construit actuellement est `OK`.

Fichiers principaux :

- `apps/frontend/components/attendance/attendance-browser-security.ts`
- `apps/frontend/components/attendance/employee-attendance-actions.tsx`
- `apps/backend/src/modules/attendance/attendance-security-policy.service.ts`
- `apps/backend/src/modules/attendance/attendance-security.service.ts`

## 11. Selfie

### 11.1 Capture

`AttendanceSelfieCapture` ouvre la caméra du navigateur, affiche le flux vidéo et capture une image dans un canvas. Le composant permet de fermer la caméra et de reprendre la capture.

Le workflow client exige une valeur `selfieDataUrl` avant de passer à la validation.

### 11.2 Validation backend

Le DTO accepte une data URL JPEG, JPG, PNG ou WebP en Base64, limitée à 1 000 000 caractères. `AttendancePhotoStorageService` répète une validation de forme avant envoi.

Pour tout pointage personnel, la photo est obligatoire, indépendamment de l'état de la policy GPS. Son absence entraîne `Selfie requis pour valider le pointage.`

### 11.3 Stockage

Hors environnement de test, le service envoie la data URL à Cloudinary avec :

- dossier configurable, par défaut `konatech/attendance-verifications` ;
- tags `attendance,verification` ;
- signature SHA-1 des paramètres et du secret ;
- identifiant public comprenant date, employé, type d'action et instant.

La base stocke l'URL sécurisée et l'identifiant public, séparément pour l'entrée et la sortie. Le Base64 original n'est pas stocké dans `Attendance`.

### 11.4 Résilience et sécurité

L'upload possède un délai par défaut de 10 secondes et deux nouvelles tentatives par défaut, espacées selon un délai configurable. Les HTTP 408, 429 et 5xx sont retentés. Un timeout produit 504 et un échec final 502.

Les trois secrets Cloudinary doivent être configurés ensemble. En environnement de test, le service construit une URL Cloudinary fictive et n'appelle pas le réseau.

Fichiers principaux :

- `apps/frontend/components/attendance/attendance-selfie-capture.tsx`
- `apps/backend/src/modules/attendance/dto/check-in-security.dto.ts`
- `apps/backend/src/modules/attendance/attendance-photo-storage.service.ts`
- `apps/backend/src/app.module.ts`

## 12. QR Code

### 12.1 Fonctionnement

Le QR est généré côté navigateur avec la bibliothèque `qrcode`. La valeur encodée est l'URL de la borne fournie au composant du dashboard. Le composant peut générer une affiche PDF téléchargeable.

### 12.2 Validation

Le QR ne fait l'objet d'aucune validation cryptographique dans le backend parce qu'il transporte une URL, pas une preuve de pointage. La sécurité commence à l'identification PIN puis au JWT de borne.

### 12.3 Flux

```text
Dashboard ADMIN
   |
   +-- calcule URL /attendance-entry
   +-- génère QR
   v
Affiche / écran
   |
   +-- scan par l'employé
   v
/attendance-entry
   |
   +-- pas de cookie : PIN
   +-- cookie valide : assistant de pointage
```

Le backend expose aussi `GET /api/v1/attendance/entry`, qui répond par une redirection 302 vers l'URL frontend fixe.

Fichiers principaux :

- `apps/frontend/components/dashboard/attendance-entry-qr-card.tsx`
- `apps/frontend/app/page.tsx`
- `apps/backend/src/modules/attendance/attendance-entry.service.ts`
- `apps/backend/src/modules/attendance/attendance.controller.ts`

## 13. PIN

### 13.1 Validation

Le DTO exige exactement quatre chiffres. Le clavier frontend collecte quatre positions et n'autorise l'envoi qu'une fois les quatre chiffres présents.

### 13.2 Contrôles

`AuthService` ne recherche que :

- les comptes `EMPLOYEE` ;
- les comptes actifs ;
- les comptes possédant un PIN en clair historique ou un hash.

Il parcourt les candidats et vérifie scrypt. Une valeur historique correcte est hachée et remplacée atomiquement par `updateMany`.

### 13.3 Sécurité

Les erreurs n'identifient pas l'employé et retournent `Identifiants invalides.`. Le frontend traduit ce message en `Code PIN invalide.`

Deux limiteurs spécifiques s'appliquent à la route :

- 5 tentatives par 60 secondes ;
- 10 tentatives par 600 secondes.

Le blocage retourne HTTP 429, journalise route, IP, user-agent, limiteur et instant, puis transmet un message générique.

Le JWT de borne utilise le même secret JWT général avec une expiration dédiée, 15 minutes par défaut.

Fichiers principaux :

- `apps/backend/src/modules/auth/dto/attendance-entry-login.dto.ts`
- `apps/backend/src/modules/auth/auth.service.ts`
- `apps/backend/src/common/security/app-throttler.guard.ts`
- `apps/backend/src/app.module.ts`
- `apps/frontend/components/attendance/attendance-entry-pin-view.tsx`

## 14. Commentaires

### 14.1 Création

Le commentaire est saisi après le selfie. L'interface propose quatre suggestions : Retard, Mission externe, Rendez-vous client et Autre. Une suggestion est ajoutée au texte existant avec un séparateur.

### 14.2 Validation

Le composant limite le commentaire à 120 caractères. Les DTO d'entrée et de sortie personnelles acceptent jusqu'à 200 caractères. Le commentaire est facultatif en règle générale et devient obligatoire côté serveur lorsque la policy GPS est active et que la distance dépasse le rayon autorisé.

### 14.3 Stockage

Le texte normalisé est transmis dans `notes` et stocké dans `Attendance.notes`.

À l'entrée, si un enregistrement vide existe, la note reçue remplace la note antérieure ; sans nouvelle note, l'ancienne est conservée. Lors d'une création, l'absence de note stocke `null`. À la sortie, l'absence de note transmet `undefined` et conserve la valeur existante ; une note fournie la remplace.

Fichiers principaux :

- `apps/frontend/components/attendance/employee-attendance-actions.tsx`
- `apps/backend/src/modules/attendance/dto/self-check-in.dto.ts`
- `apps/backend/src/modules/attendance/dto/self-check-out.dto.ts`
- `apps/backend/src/modules/attendance/attendance.service.ts`

## 15. Historique

### 15.1 Récupération

L'historique backend accepte un mois `YYYY-MM`. Sans paramètre, le mois UTC courant est utilisé. La plage va du premier jour inclus au premier jour du mois suivant exclu.

`GET /attendance/history` retourne tous les employés pour `ADMIN`. `GET /attendance/me/history` ajoute l'identifiant du JWT au filtre.

### 15.2 Filtrage

Le backend filtre uniquement par mois et, pour l'historique personnel, par employé. La page administrative charge ensuite tous les enregistrements mensuels et applique côté client les filtres d'employé, département, statut et période d'affichage définis dans les composants d'historique.

### 15.3 Pagination

Aucun paramètre de pagination n'existe dans `AttendanceHistoryQueryDto`. `getAttendanceHistory` n'utilise ni `skip`, ni `take`, ni curseur. L'historique mensuel complet est retourné en un tableau.

### 15.4 Tri

Prisma trie par :

1. `date` décroissante ;
2. `createdAt` décroissante.

L'espace personnel limite uniquement l'affichage récent aux huit premiers éléments avec `history.slice(0, 8)` ; l'ensemble de la réponse reste disponible pour les indicateurs mensuels.

### 15.5 Détail

La projection inclut l'employé, les horaires, le statut, les calculs, les notes, le snapshot et les preuves de sécurité. Le frontend administratif fournit un panneau de détail pour l'enregistrement sélectionné.

Fichiers principaux :

- `apps/backend/src/modules/attendance/attendance.service.ts`
- `apps/backend/src/modules/attendance/dto/attendance-history-query.dto.ts`
- `apps/frontend/app/attendance-history/page.tsx`
- `apps/frontend/components/attendance-history/`
- `apps/frontend/app/my-attendance/page.tsx`

## 16. Sécurité

### 16.1 Guards

| Guard | Portée |
|---|---|
| `JwtAuthGuard` | Global ; ignore uniquement les routes `@Public` |
| `RolesGuard` | Global ; applique `ADMIN` ou `EMPLOYEE` |
| `AppThrottlerGuard` | Global ; limite générale, login et PIN de borne |

### 16.2 Permissions

Les lectures globales, exports et pointages pour un UUID sont réservés à `ADMIN`. Les routes `me/*` sont réservées à `EMPLOYEE`. Un administrateur ne peut pas appeler l'état personnel : ce comportement est couvert par les tests end-to-end.

### 16.3 Validation

Les DTO valident les formats et tailles. Le service répète les invariants temporels et métier que les DTO ne peuvent pas déterminer : employé actif, doublon quotidien, ordre entrée/sortie, instant futur, planning, GPS et selfie.

### 16.4 Contrôles serveur

- l'identité des routes personnelles vient du JWT et non du corps ;
- le selfie est obligatoire pour les routes personnelles ;
- le GPS est conditionnel à la policy ;
- l'hors-zone exige une justification ;
- la précision GPS est contrôlée ;
- l'upload photo est signé ;
- les doublons sont protégés par conditions d'écriture et contrainte unique ;
- la session PIN ne concerne que les employés actifs ;
- le PIN n'est jamais renvoyé dans la réponse de login.

### 16.5 Cookies frontend

Le cookie de borne est distinct du cookie de compte. En cas de réponse backend 401 dans un proxy configuré en mode borne, le cookie de borne est supprimé. La route DELETE de session permet aussi sa suppression explicite.

Fichiers principaux :

- `apps/backend/src/modules/auth/auth.module.ts`
- `apps/backend/src/modules/auth/guards/`
- `apps/backend/src/common/security/app-throttler.guard.ts`
- `apps/backend/src/modules/attendance/attendance-security.service.ts`
- `apps/frontend/lib/api-route.ts`
- `apps/frontend/lib/auth-session.ts`

## 17. Dépendances internes

### 17.1 Dépendances backend

| Dépendance | Usage |
|---|---|
| `PrismaService` | Employés, plannings et pointages |
| `CalendarService` | Jours non ouvrés et exclusions d'absence |
| `SanctionsService` | Calculs intégrés aux exports |
| `ConfigService` | URL, policy GPS, Cloudinary, rendu PDF |
| `AuditLogService` | Actions administratives et exports |
| `AppClockService` | Date de référence des rapports |
| Guards Auth | Authentification et autorisation |
| Utilitaires attendance | Dates, sortie et snapshot |

### 17.2 Dépendances frontend

| Dépendance | Usage |
|---|---|
| `lib/api.ts` | Types et lectures serveur |
| `lib/api-route.ts` | Proxy et sélection de session |
| `lib/auth.ts` | Session de compte |
| `lib/auth-session.ts` | Cookies compte/borne |
| API caméra | Selfie |
| API Geolocation | Position et précision |
| `qrcode` | QR de borne |

### 17.3 Diagramme

```text
AttendanceModule
├── Auth global
│   ├── JwtAuthGuard
│   ├── RolesGuard
│   └── AppThrottlerGuard
├── AttendanceService
│   ├── PrismaService
│   ├── CalendarService
│   └── AttendanceSecurityService
│       ├── AttendanceSecurityPolicyService
│       └── AttendancePhotoStorageService
├── AttendanceMonthlyMetricsService
│   ├── PrismaService
│   └── CalendarService
└── MonthlyAttendanceExportService
    ├── PrismaService
    ├── CalendarService
    ├── SanctionsService
    └── CSV/PDF exporters
```

Fichiers principaux :

- `apps/backend/src/modules/attendance/attendance.module.ts`
- `apps/backend/src/modules/attendance/*.service.ts`
- `apps/backend/src/modules/attendance/exports/`
- `apps/frontend/components/attendance/`

## 18. Diagramme UML

```text
+-----------------------+          +----------------------+
| <<component>>         |          | <<controller>>       |
| Next.js Attendance UI |--------->| AttendanceController |
+-----------------------+   HTTP   +----------+-----------+
                                              |
                       +----------------------+----------------------+
                       |                      |                      |
                       v                      v                      v
             +-------------------+  +-------------------+  +------------------+
             | AttendanceService |  | EntryService      |  | ExportService    |
             +----+----------+---+  +-------------------+  +---+----------+---+
                  |          |                              |          |
                  |          v                              v          v
                  |   +-------------------+            CSVExporter  PDFExporter
                  |   | SecurityService   |                            |
                  |   +----+---------+----+                       PuppeteerRenderer
                  |        |         |
                  |        v         v
                  |   PolicyService PhotoStorageService
                  |                         |
                  |                      Cloudinary
                  v
          +---------------+       +----------------+
          | PrismaService |<------| MonthlyMetrics |
          +---+-------+---+       +--------+-------+
              |       |                    |
              v       v                    v
         Employee  Attendance         CalendarService
              |
              v
           Schedule

Relations principales :
Employee "1" -------- "0..*" Attendance
Employee "0..*" ----- "0..1" Schedule
Attendance ---------- snapshot du Schedule au moment de l'entrée
```

Fichiers principaux :

- `apps/backend/src/modules/attendance/attendance.module.ts`
- `apps/backend/src/modules/attendance/attendance.controller.ts`
- `apps/backend/src/modules/attendance/attendance.service.ts`
- `apps/backend/prisma/schema.prisma`

## 19. Observations techniques

Cette section contient uniquement des constats issus du code.

### 19.1 Deux interfaces de pointage

`/my-attendance` et `/attendance-entry` sont deux interfaces distinctes qui utilisent le même composant d'action. La première dépend de la session de compte. La seconde constitue une borne identifiée par PIN et possède un cookie séparé.

### 19.2 QR sans preuve

Le QR encode une URL fixe. Aucun jeton à usage unique, signature, identité ou action n'est présent dans sa valeur. Le code QR ouvre le parcours PIN.

### 19.3 Type de méthode PHOTO prioritaire

Lorsque selfie et GPS sont tous deux présents, `AttendanceSecurityService` stocke la méthode `PHOTO`. La présence GPS reste visible dans les coordonnées, la distance et le motif, mais la valeur enum ne devient pas une combinaison GPS+PHOTO.

### 19.4 Niveaux de vérification

L'enum Prisma contient `OK`, `WARNING` et `STRICT`. `buildEvaluation` affecte actuellement toujours `OK`. Aucune branche de ce service ne produit `WARNING` ou `STRICT`.

### 19.5 Exception de sécurité dédiée

Le fichier `attendance-security.exception.ts` existe dans l'arborescence. `AttendanceSecurityService` utilise directement `BadRequestException`; aucune importation de cette exception dédiée n'est trouvée dans les services de pointage analysés.

### 19.6 GPS calculé dans deux couches

Une fonction Haversine existe dans `attendance-browser-security.ts` pour l'affichage de validation. Un calcul Haversine séparé existe dans `AttendanceSecurityPolicyService` et constitue la valeur persistée par le backend.

### 19.7 Limites de commentaire différentes

L'interface limite le commentaire à 120 caractères. Les DTO backend acceptent 200 caractères.

### 19.8 SelfCheckOutDto et notes

`SelfCheckOutDto` accepte `notes`, et le composant transmet le commentaire lors d'une sortie. `CheckOutDto`, utilisé par l'endpoint administrateur, ne déclare pas de champ `notes`.

### 19.9 Absence de pagination

Les historiques mensuels n'utilisent aucune pagination backend. La page administrative reçoit et filtre le tableau mensuel complet côté client.

### 19.10 Recalcul mensuel séquentiel

`AttendanceMonthlyMetricsService` parcourt les employés, les dates et les pointages avec des boucles comportant des appels Prisma attendus séquentiellement. Le déclenchement automatique repose sur un timer en mémoire du processus NestJS.

### 19.11 Accès direct de Dashboard

`DashboardService` ne dépend pas d'`AttendanceService`; il interroge directement les modèles Prisma et reproduit ses propres agrégations de pointage pour le dashboard.

### 19.12 Exports dans le module Pointage

La logique de rapport mensuel, les types de rapport et les deux familles de rendu PDF se trouvent dans `modules/attendance/exports`. Aucun module NestJS `ReportsModule` séparé n'est présent dans cette interaction.

### 19.13 Audit des actions personnelles

Le contrôleur journalise les pointages administratifs et les exports. Les endpoints personnels `me/check-in` et `me/check-out` ne déclenchent pas `AuditLogService`. Les preuves et instants restent persistés dans `Attendance`.

### 19.14 Valeur historique du PIN

Le modèle conserve `pinCode` et `pinCodeHash`. L'authentification de borne migre un PIN historique en clair vers scrypt lors de sa première utilisation correcte.

### 19.15 Messages et langue

Les messages métier d'entrée/sortie dans `AttendanceService` sont principalement en anglais. Les messages de sécurité et l'interface sont principalement en français.

### 19.16 Documentation locale

Aucun README propre à `apps/backend/src/modules/attendance/` n'est présent. Les commentaires de source de vérité documentent `AttendanceService` et `AttendanceSecurityService`, mais aucun document Markdown local au module n'est trouvé.

### 19.17 Tests constatés

La suite `apps/backend/test/app.e2e-spec.ts` contient des scénarios portant sur :

- permissions administrateur/employé ;
- état du jour ;
- entrée et sortie ;
- conflits de doublon ;
- GPS et selfie ;
- jours non ouvrés ;
- snapshot de planning ;
- historique ;
- exports.

D'autres suites ciblent notamment les jours non ouvrés, les absences calendrier et le rendu mensuel Puppeteer :

- `apps/backend/test/non-working-day-attendance.e2e-spec.ts` ;
- `apps/backend/test/attendance-calendar-absence.e2e-spec.ts` ;
- `apps/backend/test/monthly-attendance-puppeteer-renderer.e2e-spec.ts`.

