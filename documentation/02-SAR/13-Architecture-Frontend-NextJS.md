# Architecture Frontend Next.js

| Métadonnée | Valeur |
|---|---|
| Document ID | SAR-FE-001 |
| Titre | Architecture Frontend Next.js |
| Version | 1.0 |
| Statut | Validé |
| Classification | Interne |
| Référence SAPDD | Frontend |
| Date de génération | 29 juillet 2026 |

## 1. Présentation

### 1.1 Objectif

Le frontend de Konatech Pointage fournit les interfaces administrateur, employé et borne de pointage. Il rend les pages, gère les interactions navigateur, contrôle les sessions côté serveur et transmet les opérations au backend NestJS.

### 1.2 Responsabilités

Le frontend :

- affiche le dashboard et les espaces RH ;
- expose l'interface personnelle de l'employé ;
- expose la borne de pointage par PIN ;
- orchestre les flux GPS et selfie dans le navigateur ;
- gère les formulaires d'administration ;
- charge les données côté serveur ;
- proxyfie les mutations et téléchargements vers l'API ;
- conserve les JWT dans des cookies HTTP-only ;
- applique des redirections selon la session et le rôle ;
- fournit les états de chargement et plusieurs limites d'erreur ;
- applique le système visuel responsive Tailwind.

### 1.3 Périmètre

Le projet contient dix pages applicatives, dix-huit fichiers route handler sous `app/api`, un layout racine, des composants métier organisés par domaine, quatre primitives UI et une couche `lib`.

Aucun dossier `hooks`, `services`, `providers`, `context`, `styles` ou `utils` à la racine du frontend n'est présent. Les fonctions comparables à des services et utilitaires se trouvent dans `lib`, les styles globaux dans `app/globals.css` et les hooks React sont utilisés directement dans les composants.

Implémentation principale :

- `apps/frontend/app/`
- `apps/frontend/components/`
- `apps/frontend/lib/`
- `apps/frontend/middleware.ts`

## 2. Architecture générale

### 2.1 Next.js

Le package déclare Next.js `^15.5.18`. La configuration active `reactStrictMode` et ignore les erreurs ESLint pendant le build. Le projet utilise l'App Router.

### 2.2 React

React et React DOM sont déclarés en `^19.0.0`. Les composants sont Server Components par défaut. Les composants interactifs portent explicitement la directive `'use client'`.

### 2.3 TypeScript

TypeScript `^5.8.2` est configuré en mode strict, sans émission, avec résolution `bundler`, JSX préservé et alias `@/*` vers la racine du frontend.

### 2.4 App Router

`app/` contient :

- les segments de pages ;
- le layout racine ;
- les fichiers `loading.tsx` et `error.tsx` ;
- les route handlers sous `app/api` ;
- la feuille globale.

### 2.5 Organisation générale

Les pages serveur effectuent les contrôles de session et les lectures initiales. Elles transmettent les données à des composants clients lorsque l'écran doit gérer formulaires, filtres ou mutations. Les composants clients appellent les routes `/api/*` du même frontend, qui proxyfient le backend.

```text
Navigateur
   |
   v
App Router
   |
   +---- Server Page ---- lib/auth + lib/api ---- API NestJS
   |          |
   |          v
   |     données initiales
   |          |
   v          v
Client Components ---- fetch /api/* ---- Route Handlers Next.js
                                             |
                                             v
                                      API REST NestJS
                                             |
                                             v
                                        PostgreSQL
```

Fichiers concernés :

- `apps/frontend/package.json`
- `apps/frontend/next.config.ts`
- `apps/frontend/tsconfig.json`
- `apps/frontend/app/layout.tsx`
- `apps/frontend/lib/api.ts`

## 3. Organisation des fichiers

### 3.1 Arborescence

```text
apps/frontend/
├── app/
│   ├── api/
│   │   ├── attendance/
│   │   │   ├── exports/monthly/route.ts
│   │   │   └── me/
│   │   │       ├── check-in/route.ts
│   │   │       └── check-out/route.ts
│   │   ├── auth/
│   │   │   ├── attendance-entry-session/route.ts
│   │   │   ├── login/route.ts
│   │   │   └── logout/route.ts
│   │   ├── calendar/
│   │   │   ├── holidays/[id]/route.ts
│   │   │   ├── holidays/route.ts
│   │   │   └── month/route.ts
│   │   ├── employees/
│   │   │   ├── [id]/status/route.ts
│   │   │   ├── [id]/route.ts
│   │   │   └── route.ts
│   │   ├── health/route.ts
│   │   ├── sanctions/
│   │   │   ├── attendance/[attendanceId]/route.ts
│   │   │   └── rules/[id]/route.ts
│   │   └── schedules/
│   │       ├── [id]/status/route.ts
│   │       ├── [id]/route.ts
│   │       └── route.ts
│   ├── attendance-entry/
│   │   ├── error.tsx
│   │   ├── loading.tsx
│   │   └── page.tsx
│   ├── attendance-history/page.tsx
│   ├── calendar/
│   │   ├── error.tsx
│   │   ├── loading.tsx
│   │   └── page.tsx
│   ├── employees/
│   │   ├── error.tsx
│   │   ├── loading.tsx
│   │   └── page.tsx
│   ├── exports/page.tsx
│   ├── login/page.tsx
│   ├── my-attendance/
│   │   ├── error.tsx
│   │   ├── loading.tsx
│   │   └── page.tsx
│   ├── sanctions/
│   │   ├── loading.tsx
│   │   └── page.tsx
│   ├── schedules/
│   │   ├── error.tsx
│   │   ├── loading.tsx
│   │   └── page.tsx
│   ├── error.tsx
│   ├── globals.css
│   ├── layout.tsx
│   ├── loading.tsx
│   └── page.tsx
├── components/
│   ├── admin/
│   ├── attendance/
│   ├── attendance-history/
│   ├── auth/
│   ├── calendar/
│   ├── dashboard/
│   ├── employees/
│   ├── layout/
│   ├── sanctions/
│   ├── schedules/
│   └── ui/
├── lib/
│   ├── api-route.ts
│   ├── api.ts
│   ├── auth-session.ts
│   ├── auth.ts
│   ├── client-error.ts
│   ├── redirect.ts
│   └── utils.ts
├── public/
├── types/
│   └── qrcode.d.ts
├── middleware.ts
├── next.config.ts
├── postcss.config.js
├── tailwind.config.ts
└── tsconfig.json
```

### 3.2 `app/`

Ce dossier porte les routes App Router, le layout, les limites de chargement et d'erreur, la feuille globale et les endpoints frontend.

### 3.3 `components/`

Les sous-dossiers regroupent les composants par domaine :

| Dossier | Responsabilité |
|---|---|
| `admin` | Navigation et état vide |
| `attendance` | Pointage employé et borne |
| `attendance-history` | Filtres, tableau et détail |
| `auth` | Connexion et déconnexion |
| `calendar` | Calendrier mensuel et éditeur |
| `dashboard` | KPI, alertes, activités, actions et export |
| `employees` | Gestion interactive des employés |
| `layout` | Conteneurs de page |
| `sanctions` | Sélecteur et règles |
| `schedules` | Gestion interactive des plannings |
| `ui` | Badge, Button, Card et Skeleton |

### 3.4 `hooks/`

Non trouvé dans le code.

### 3.5 `services/`

Non trouvé comme dossier. `lib/api.ts` et `lib/api-route.ts` remplissent les fonctions d'accès HTTP et de proxy.

### 3.6 `lib/`

`lib` contient les types API, clients HTTP, helpers de session, authentification, redirection, erreurs client et fusion de classes Tailwind.

### 3.7 `providers/` et `context/`

Non trouvés dans le code. Aucun provider React ou Context API applicatif n'est monté dans le layout.

### 3.8 `styles/`

Non trouvé comme dossier. `app/globals.css` contient les styles globaux. Tailwind est configuré par `tailwind.config.ts` et PostCSS.

### 3.9 `utils/`

Non trouvé comme dossier. `lib/utils.ts` exporte `cn()`. Des helpers métier locaux existent dans plusieurs fichiers composants et dans les fichiers `*.helpers.ts`.

### 3.10 `public/` et `types/`

`public` contient favicon, icônes et logos Konatech. `types/qrcode.d.ts` fournit la déclaration TypeScript du paquet QR code.

## 4. Pages

### 4.1 Inventaire exhaustif

| Route | Page | Rôle | Accès | Composants principaux |
|---|---|---|---|---|
| `/` | Dashboard | Synthèse administrative | ADMIN | AdminNav, LogoutForm, MetricCard, DailyAlertsCard, QuickActionsSection, RecentActivityList, DashboardAnalyticsSection |
| `/login` | Connexion | Authentification standard | Public ; redirige une session valide | LoginForm, Image, Badge, Card |
| `/my-attendance` | Mon pointage | Consultation et pointage personnel | EMPLOYEE | LogoutForm, AttendanceLiveClock, EmployeeAttendanceActions, composants UI |
| `/attendance-entry` | Borne | Identification PIN et pointage sur borne | Public avant PIN ; session borne EMPLOYEE après PIN | AttendanceEntryPinView ou FixedAttendanceEntryView |
| `/attendance-history` | Historique RH | Consultation globale et filtres | ADMIN | AdminNav, LogoutForm, AttendanceHistoryWorkspace |
| `/employees` | Employés | CRUD partiel, statut, accès, affectation | ADMIN | AdminNav, LogoutForm, AdminEmployeesManager |
| `/schedules` | Plannings | Création, modification et statut | ADMIN | AdminNav, LogoutForm, AdminSchedulesManager |
| `/calendar` | Calendrier RH | Lecture et édition des jours fériés | ADMIN | AdminNav, LogoutForm, CalendarMonthSelector, CalendarWorkspace |
| `/sanctions` | Sanctions RH | Synthèse mensuelle et règles | ADMIN | AdminNav, LogoutForm, MetricCard, SanctionsMonthSelector, SanctionRulesPanel |
| `/exports` | Rapports | Export PDF mensuel | ADMIN | AdminNav, LogoutForm, MonthlyAttendanceExportCard |

### 4.2 Layout

Toutes les pages héritent du seul `RootLayout`. Les pages administratives partagent visuellement `PageShell` et `AdminNav`, mais aucun layout de segment administratif n'est déclaré.

### 4.3 Dashboard `/`

Server Component dynamique. Il exige ADMIN, charge le dashboard et construit l'URL de borne. Les composants de visualisation reçoivent les données en propriétés.

Fichier : `apps/frontend/app/page.tsx`.

### 4.4 Login `/login`

Server Component dynamique. Il lit l'utilisateur courant et redirige une session valide vers la route dérivée du rôle. `LoginForm` gère la soumission côté client.

Fichier : `apps/frontend/app/login/page.tsx`.

### 4.5 Mon pointage `/my-attendance`

Server Component dynamique. Il exige une session, redirige ADMIN vers `/`, charge en parallèle le pointage du jour et l'historique du mois, puis rend l'action de pointage client.

Fichier : `apps/frontend/app/my-attendance/page.tsx`.

### 4.6 Borne `/attendance-entry`

La page lit uniquement le cookie de borne. Sans cookie, elle affiche la saisie PIN. Avec un cookie, elle charge utilisateur et pointages en parallèle, vérifie le rôle EMPLOYEE et rend FixedAttendanceEntryView. Une session invalide revient à la saisie PIN avec effacement côté client.

Fichier : `apps/frontend/app/attendance-entry/page.tsx`.

### 4.7 Historique `/attendance-history`

Charge les pointages du mois courant et les employés. La page dérive la liste des départements, puis délègue filtres et détail à AttendanceHistoryWorkspace.

### 4.8 Employés et Plannings

Ces pages chargent les données initiales côté serveur et les passent aux managers clients. Elles affichent également des compteurs calculés côté serveur.

### 4.9 Calendrier et Sanctions

Ces pages lisent `searchParams` pour le mois. Sanctions accepte aussi `tab`. Calendar capture localement l'échec du chargement initial et affiche une carte d'erreur au sein de la page.

### 4.10 Exports

La page ne charge pas directement le rapport. MonthlyAttendanceExportCard charge les employés côté client puis déclenche un téléchargement PDF.

## 5. Layouts

### 5.1 RootLayout

Le seul fichier `layout.tsx` est `app/layout.tsx`. Il :

- importe `globals.css` ;
- déclare les métadonnées globales ;
- configure les icônes ;
- fixe `lang="fr"` ;
- rend directement `{children}` dans `<body>` ;
- déclare `dynamic = 'force-dynamic'`.

### 5.2 Métadonnées

Le titre est « Konatech Pointage » et la description identifie une plateforme de pointage et suivi RH. Les icônes SVG, ICO, PNG et Apple Touch sont référencées depuis `public`.

### 5.3 Layouts de segment

Aucun autre layout n'est présent. La structure récurrente des pages admin est une composition de composants, pas un layout App Router imbriqué.

### 5.4 PageShell

`PageShell` fournit le conteneur responsive, les arrière-plans décoratifs et l'espacement. `PageHero` est exporté du même fichier mais aucune utilisation externe n'est trouvée.

Fichiers concernés :

- `apps/frontend/app/layout.tsx`
- `apps/frontend/components/layout/page-shell.tsx`
- `apps/frontend/app/globals.css`

## 6. Composants

### 6.1 Composants d'administration

| Composant | Rôle et interactions |
|---|---|
| `AdminNav` | Navigation groupée vers les sept espaces administratifs |
| `AdminEmptyState` | Présentation réutilisable des collections vides |
| `PageShell` | Conteneur de page commun |
| `LogoutForm` | POST vers logout et fin des deux sessions |

### 6.2 Dashboard

| Composant | Responsabilité |
|---|---|
| `MetricCard` | Carte KPI avec tonalités |
| `DailyAlertsCard` | Dérive jusqu'à cinq alertes de l'activité récente |
| `RecentActivityList` | Formate et présente les activités |
| `DashboardAnalyticsSection` | KPI mensuels et trois classements |
| `QuickActionsSection` | Liens Employés, Plannings, Exports et panneau QR |
| `AttendanceEntryQrCard` | Génère QR, affiche et produit un poster/PDF navigateur |
| `MonthlyAttendanceExportCard` | Filtres et téléchargement du rapport |

`ConnectionPanel` et `ModuleCard` sont exportés mais aucune importation externe n'est trouvée.

### 6.3 Pointage

| Composant | Responsabilité |
|---|---|
| `AttendanceEntryPinView` | Clavier PIN et ouverture de session borne |
| `FixedAttendanceEntryView` | Interface de borne après identification |
| `AttendanceEntrySessionButton` | Fermeture de la session de borne |
| `EmployeeAttendanceActions` | Orchestration entrée/sortie, commentaire, sécurité et résultat |
| `AttendanceSelfieCapture` | Démarrage caméra et capture image |
| `AttendanceLiveClock` | Horloge client actualisée |

Les fichiers non JSX `attendance-action-flow.ts`, `attendance-browser-security.ts` et `attendance-display.ts` portent respectivement les étapes, GPS/distance et fonctions d'affichage/calcul.

### 6.4 Historique

| Composant | Responsabilité |
|---|---|
| `AttendanceHistoryWorkspace` | État des filtres, sélection et coordination |
| `AttendanceHistoryFilters` | Formulaire de filtres |
| `AttendanceHistoryTable` | Filtrage, tableau et choix d'une ligne |
| `AttendanceDetailPanel` | Détail, preuves et sanction du pointage |

### 6.5 Calendrier

| Composant | Responsabilité |
|---|---|
| `CalendarWorkspace` | État des entrées, CRUD, calendrier et synthèse |
| `CalendarMonthSelector` | Navigation mensuelle par query |
| `CalendarDayCell` | Cellule du mois |
| `CalendarDayDrawer` | Formulaire latéral d'ajout/modification |
| `CalendarDayBadge` | Libellé typé |
| `CalendarLegend` | Légende |

### 6.6 Employés et plannings

`AdminEmployeesManager` et `AdminSchedulesManager` concentrent formulaire, recherche, filtres, mutations, listes et état local. Les fichiers `employee-manager.helpers.ts` et `schedule-manager.helpers.ts` contiennent valeurs initiales, libellés et transformations.

### 6.7 Sanctions

`SanctionsMonthSelector` navigue entre mois avec le router. `SanctionRulesPanel` gère l'édition client des règles et rafraîchit la route après succès.

### 6.8 Primitives UI

| Composant | Rôle |
|---|---|
| `Badge` | Variantes de statut |
| `Button` | Bouton et `buttonVariants` |
| `Card`, `CardHeader`, `CardTitle`, `CardContent` | Structure de carte |
| `Skeleton` | États de chargement |

Les primitives suivent une organisation de type shadcn/ui, mais aucune dépendance de package shadcn n'est déclarée à l'exécution.

## 7. Gestion de l'état

### 7.1 État global

| Technologie | État |
|---|---|
| Context API applicatif | Non trouvé |
| Zustand | Non trouvé |
| Redux | Non trouvé |
| React Query / TanStack Query | Non trouvé |
| SWR | Non trouvé |

### 7.2 État local

Les composants clients utilisent `useState` pour :

- formulaires et messages ;
- chargement et soumission ;
- recherche et filtres ;
- sélections ;
- ouverture de drawer ;
- capture selfie ;
- états QR ;
- listes mutées localement.

### 7.3 État dérivé

`useMemo` est utilisé dans les managers, l'historique, CalendarWorkspace et SanctionRulesPanel pour filtrer, grouper et calculer des synthèses.

### 7.4 Effets

`useEffect` sert notamment à :

- actualiser l'horloge ;
- gérer la caméra ;
- charger des employés pour l'export ;
- générer le QR ;
- nettoyer une session borne ;
- synchroniser les données et états de drawer.

### 7.5 Transitions

`LoginForm` utilise `useTransition`. Les autres formulaires utilisent principalement un booléen de soumission.

### 7.6 Hooks personnalisés

Aucun fichier ou fonction de hook personnalisé n'est trouvé. Les hooks de React et `useRouter` sont appelés directement.

## 8. Communication avec l'API

### 8.1 Client serveur

`lib/api.ts` centralise :

- les types de contrats frontend ;
- la résolution des URL ;
- `fetchServerApi()` ;
- `requestApi<T>()` ;
- les fonctions de chargement par écran.

### 8.2 URL de l'API

| Variable | Usage |
|---|---|
| `API_BASE_URL` | URL serveur privilégiée |
| `NEXT_PUBLIC_API_BASE_URL` | URL publique et repli serveur |
| `NEXT_PUBLIC_APP_URL` | URL publique de l'application |

En développement, l'API utilise `http://localhost:4000/api/v1` comme repli. En production, les URL requises sont validées ; les URL temporaires de tunnel et adresses réseau privées sont refusées, et l'URL API doit se terminer par `/api/v1`.

### 8.3 Requêtes serveur

`requestApi<T>()` ajoute le bearer token, définit JSON si nécessaire, lève `ApiRequestError` pour une réponse non réussie et désérialise le JSON.

Les pages utilisent des fonctions spécialisées telles que :

- `getDashboardData()` ;
- `getEmployeeAttendanceData()` ;
- `getAttendanceHistoryData()` ;
- `getEmployeesData()` ;
- `getSchedulesData()` ;
- `getMonthlySanctionsData()` ;
- `getSanctionRulesData()` ;
- `getCalendarMonthData()`.

### 8.4 Route handlers proxy

Les composants clients n'accèdent pas directement au backend pour leurs commandes. `app/api` expose des proxies pour :

- sessions Auth ;
- entrée/sortie personnelle ;
- employés ;
- plannings ;
- calendrier ;
- sanctions ;
- export mensuel ;
- santé.

### 8.5 Tokens

`api-route.ts` lit les cookies côté serveur et construit `Authorization`. Deux modes existent :

- `default` avec `konatech_session` ;
- `attendance-entry` avec `konatech_attendance_entry_session`.

### 8.6 Erreurs

`ApiRequestError` conserve message et statut pour les lectures serveur. Les proxies transforment les erreurs backend en `{error}` et conservent le statut. Les métadonnées `security` sont conservées sur les erreurs de pointage. `getClientErrorMessage()` extrait un message présentable dans les composants.

Les erreurs de connexion au backend produisent 502, sauf une erreur de configuration d'URL qui produit 500.

### 8.7 Fichiers

- `apps/frontend/lib/api.ts`
- `apps/frontend/lib/api-route.ts`
- `apps/frontend/lib/client-error.ts`
- `apps/frontend/app/api/`

## 9. Navigation

### 9.1 App Router

La navigation utilise :

- `<Link>` pour les liens déclaratifs ;
- `redirect()` dans les Server Components ;
- `useRouter().push()` et `refresh()` dans les composants clients ;
- `window.location.assign()` dans plusieurs limites d'erreur ;
- des paramètres de recherche pour mois et onglets.

### 9.2 Navigation administrateur

`AdminNav` organise les liens en quatre groupes :

- Pilotage : dashboard ;
- Pointages : historique, exports ;
- Équipe : employés, plannings ;
- Règles RH : calendrier, sanctions.

### 9.3 Redirections par rôle

Après login :

- ADMIN reçoit `/` ;
- EMPLOYEE reçoit `/my-attendance`.

Les pages admin redirigent un non-admin vers `/my-attendance`. `/my-attendance` redirige ADMIN vers `/`.

### 9.4 Middleware

Le middleware contrôle la présence du cookie standard sur :

- `/` ;
- `/my-attendance` ;
- `/employees` ;
- `/schedules`.

Il ne décode pas le token et ne contrôle pas le rôle. Les pages serveur valident ensuite la session par `/auth/me`.

### 9.5 Routes protégées hors matcher

`/attendance-history`, `/calendar`, `/sanctions` et `/exports` ne figurent pas dans le matcher. Elles appellent toutefois `requireCurrentUser()` et contrôlent ADMIN dans leur page serveur.

### 9.6 Borne

La route `/attendance-entry` n'est pas protégée par le middleware standard. Elle possède son propre cookie et son propre flux d'identification.

Fichiers concernés :

- `apps/frontend/components/admin/admin-nav.tsx`
- `apps/frontend/lib/redirect.ts`
- `apps/frontend/middleware.ts`
- pages sous `apps/frontend/app/`

## 10. Authentification Frontend

### 10.1 Login

`LoginForm` envoie email, password et cible facultative à `/api/auth/login`. Le route handler appelle le backend, efface une éventuelle session de borne, écrit le cookie standard et retourne la destination.

### 10.2 Stockage

Les cookies sont :

- HTTP-only ;
- `sameSite: lax` ;
- `secure` en production ;
- accessibles sur `/` ;
- associés à une durée dérivée de `expiresIn`.

### 10.3 Session de borne

Le PIN est envoyé à `/api/auth/attendance-entry-session`. Le JWT résultant est stocké dans le cookie de borne. DELETE sur la même route efface ce cookie.

### 10.4 Logout

POST `/api/auth/logout` efface les deux cookies et redirige vers `/login`.

### 10.5 Utilisateur courant

`getCurrentUser()` lit le cookie standard et appelle `/auth/me`. Toute erreur retourne `null`. `requireCurrentUser()` redirige vers `/login` lorsque la valeur est nulle.

### 10.6 Refresh

Aucun refresh token, endpoint de renouvellement ou rotation de token n'est trouvé. La session expire avec le JWT/cookie et l'utilisateur se reconnecte.

### 10.7 Guards frontend

Aucun composant Guard ou HOC n'est présent. La protection repose sur :

- middleware de présence de cookie ;
- helpers serveur ;
- comparaisons de rôle dans les pages ;
- autorisation effective du backend.

### 10.8 Fichiers

- `apps/frontend/components/auth/login-form.tsx`
- `apps/frontend/components/auth/logout-form.tsx`
- `apps/frontend/lib/auth-session.ts`
- `apps/frontend/lib/auth.ts`
- `apps/frontend/app/api/auth/`

## 11. Performance

### 11.1 Server Components

Les dix pages sont des Server Components par défaut. Les lectures initiales et contrôles de session s'effectuent sur le serveur. Les pages transmettent des objets sérialisables aux composants clients.

### 11.2 Client Components

Les composants interactifs sont ciblés par `'use client'`. Les composants purement présentatifs restent serveur-compatibles.

### 11.3 Chargement parallèle

`Promise.all` est utilisé pour :

- utilisateur et pointages de borne ;
- pointage du jour et historique employé ;
- historique admin et employés ;
- employés et plannings.

### 11.4 Cache

Le layout et les dix pages déclarent explicitement `force-dynamic`; les appels de `fetchServerApi()` utilisent `no-store` par défaut. Les proxies de fichiers définissent `Cache-Control: no-store`.

Aucun `revalidate`, `unstable_cache` ou cache applicatif n'est trouvé.

### 11.5 Loading UI et streaming

Sept fichiers `loading.tsx` sont présents :

- racine/dashboard ;
- attendance-entry ;
- calendar ;
- employees ;
- my-attendance ;
- sanctions ;
- schedules.

Ils fournissent des skeletons utilisés par les limites de chargement App Router. Aucun composant `<Suspense>` explicite n'est présent ; le streaming découle des conventions `loading.tsx`.

### 11.6 Error boundaries

Six fichiers `error.tsx` clients sont présents : racine, attendance-entry, calendar, employees, my-attendance et schedules. Ils exposent `reset()` et un rechargement. Sanctions, exports et attendance-history n'ont pas de fichier d'erreur de segment propre.

### 11.7 Lazy loading

Aucun `React.lazy()` ni `next/dynamic()` n'est trouvé. Le découpage de bundles découle des segments App Router et des frontières client.

### 11.8 Optimisations React

`useMemo` réduit certains recalculs de filtres et calendriers. `next/image` est utilisé sur la page de connexion. Le QR et le PDF poster sont générés côté navigateur à la demande.

### 11.9 Configuration build

`reactStrictMode` est actif. `eslint.ignoreDuringBuilds` est vrai. Aucun paramètre Next.js personnalisé d'images, bundle analyzer ou compression n'est déclaré.

## 12. Dépendances internes

### 12.1 Flux général

```text
Utilisateur
    |
    v
Page App Router (Server Component)
    |
    +---- lib/auth ---- cookie + /auth/me
    |
    +---- lib/api ----- lectures API REST
    |
    v
Composant métier
    |
    +---- hooks React locaux
    |
    +---- fetch('/api/...') pour commandes
                   |
                   v
          Route Handler Next.js
                   |
                   v
             API REST NestJS
```

### 12.2 Dépendances de composants

| Couche | Dépend de |
|---|---|
| Pages | auth, api, navigation, composants métier |
| Composants métier | primitives UI, helpers, route handlers |
| Route handlers | api-route, api, auth-session |
| lib/api-route | cookies, fetchServerApi, NextResponse |
| lib/api | variables d'environnement et fetch |
| UI | class-variance-authority, clsx, tailwind-merge |

### 12.3 Dépendances externes

| Package | Usage |
|---|---|
| Next.js | App Router, serveur, navigation, image |
| React / React DOM | composants et hooks |
| Tailwind CSS | styles |
| class-variance-authority | variantes UI |
| clsx / tailwind-merge | fusion de classes |
| qrcode | génération QR |

### 12.4 Hook et Service dans le flux demandé

Il n'existe ni couche de hooks personnalisés ni dossier services. Le flux réel est :

```text
Page -> Component -> hooks React intégrés -> lib ou route handler -> API REST
```

## 13. Traçabilité du code

| Élément | Fichiers principaux |
|---|---|
| Configuration Next | `apps/frontend/next.config.ts` |
| Configuration TypeScript | `apps/frontend/tsconfig.json` |
| Styles | `apps/frontend/app/globals.css`, `tailwind.config.ts`, `postcss.config.js` |
| Layout | `apps/frontend/app/layout.tsx` |
| Pages | `apps/frontend/app/**/page.tsx` |
| Loading | `apps/frontend/app/**/loading.tsx` |
| Error boundaries | `apps/frontend/app/**/error.tsx` |
| Middleware | `apps/frontend/middleware.ts` |
| Contrats et lectures API | `apps/frontend/lib/api.ts` |
| Proxies API | `apps/frontend/lib/api-route.ts`, `apps/frontend/app/api/**/route.ts` |
| Cookies | `apps/frontend/lib/auth-session.ts` |
| Session utilisateur | `apps/frontend/lib/auth.ts` |
| Redirections | `apps/frontend/lib/redirect.ts` |
| Erreurs client | `apps/frontend/lib/client-error.ts` |
| Navigation admin | `apps/frontend/components/admin/admin-nav.tsx` |
| Dashboard | `apps/frontend/components/dashboard/` |
| Pointage | `apps/frontend/components/attendance/` |
| Historique | `apps/frontend/components/attendance-history/` |
| Employés | `apps/frontend/components/employees/` |
| Plannings | `apps/frontend/components/schedules/` |
| Calendrier | `apps/frontend/components/calendar/` |
| Sanctions | `apps/frontend/components/sanctions/` |
| UI | `apps/frontend/components/ui/` |

### 13.1 Pages

- `apps/frontend/app/page.tsx`
- `apps/frontend/app/login/page.tsx`
- `apps/frontend/app/my-attendance/page.tsx`
- `apps/frontend/app/attendance-entry/page.tsx`
- `apps/frontend/app/attendance-history/page.tsx`
- `apps/frontend/app/employees/page.tsx`
- `apps/frontend/app/schedules/page.tsx`
- `apps/frontend/app/calendar/page.tsx`
- `apps/frontend/app/sanctions/page.tsx`
- `apps/frontend/app/exports/page.tsx`

## 14. Observations techniques

Cette section contient uniquement les constats issus du frontend actuel.

### 14.1 Dossiers architecturaux absents

Les dossiers `hooks`, `services`, `providers`, `context`, `styles` et `utils` ne sont pas présents. Les responsabilités correspondantes sont distribuées entre composants, `lib` et `app/globals.css`.

### 14.2 Composants exportés sans usage externe

Les recherches d'importation ne trouvent pas d'usage externe de :

- `ConnectionPanel` ;
- `ModuleCard` ;
- `PageHero`.

Leur seule occurrence est leur déclaration.

### 14.3 Composant d'export classé Dashboard

`MonthlyAttendanceExportCard` réside dans `components/dashboard`, mais il est rendu sur `/exports`.

### 14.4 Layout administratif dupliqué par composition

Les pages administratives répètent la composition PageShell, header, AdminNav et LogoutForm. Aucun layout de segment admin ne mutualise cette structure.

### 14.5 Contrôles de rôle répétés

Chaque page administrative appelle `requireCurrentUser()`, compare `accessRole`, récupère ensuite le token et vérifie sa présence.

### 14.6 Middleware partiel

Le matcher ne contient pas attendance-history, calendar, sanctions et exports, bien que ces pages soient administratives.

### 14.7 Session borne séparée

La borne n'utilise pas le cookie standard et ses mutations déclarent explicitement le mode de session `attendance-entry`.

### 14.8 Absence de refresh token

Aucun renouvellement de session n'est implémenté.

### 14.9 Couche API centralisée et proxies partiels

Les lectures initiales des Server Components appellent directement le backend par `lib/api.ts`. Les mutations client passent par les routes proxy. Les deux modes coexistent.

### 14.10 Types frontend manuels

Les contrats dans `lib/api.ts` sont déclarés manuellement. Aucune génération depuis OpenAPI ou partage de package de types avec le backend n'est présente.

### 14.11 Absence de store global

L'état des écrans est local aux composants. Les rafraîchissements utilisent parfois `router.refresh()` pour resynchroniser les Server Components.

### 14.12 Composants clients volumineux

`AdminEmployeesManager`, `AdminSchedulesManager`, `CalendarWorkspace`, `EmployeeAttendanceActions`, `AttendanceDetailPanel`, `AttendanceEntryQrCard` et `SanctionRulesPanel` regroupent plusieurs responsabilités interactives dans leurs fichiers respectifs.

### 14.13 Traductions locales

La page Sanctions contient des fonctions locales traduisant plusieurs messages backend anglais en français. D'autres libellés sont formulés directement dans les pages et composants.

### 14.14 Cache désactivé

Les lectures API sont `no-store` et le layout est `force-dynamic`. Aucun cache de données frontend n'est présent.

### 14.15 Couverture loading/error non uniforme

Attendance-history et exports n'ont ni loading ni error de segment propres. Sanctions possède loading sans error de segment. Login ne possède aucun des deux.

### 14.16 Pas de lazy loading explicite

Aucun import dynamique ni React.lazy n'est présent.

### 14.17 PWA

Aucun manifest App Router, service worker ou logique de cache offline n'est trouvé dans le frontend audité.

### 14.18 UI

Le projet possède quatre fichiers de primitives UI, et non un catalogue complet de composants shadcn. Les dépendances Radix généralement associées à plusieurs composants shadcn ne sont pas déclarées.

### 14.19 Routes API frontend absentes

Il n'existe pas de proxy Next.js pour Dashboard, historique Attendance ou lectures de sanctions mensuelles : ces lectures sont réalisées côté serveur par `lib/api.ts`.

### 14.20 Documentation locale

Aucun README d'architecture propre à `apps/frontend/` n'est présent. Les conventions sont portées par l'arborescence, les composants et les configurations.
