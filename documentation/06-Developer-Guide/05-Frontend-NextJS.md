# Developer Guide — Frontend (Next.js)

| Métadonnée | Valeur |
|---|---|
| Document ID | DG-005 |
| Titre | Frontend (Next.js) |
| Version | 1.0 |
| Statut | Validé |
| Classification | Interne |
| Référence | Developer Guide |
| Projet | Konatech Pointage |

## 1. Présentation

Le frontend Konatech Pointage est une application Next.js utilisant App Router, React et TypeScript. Il fournit les pages d'authentification, le tableau de bord administrateur, le parcours de pointage employé, les écrans de gestion et les routes serveur qui communiquent avec l'API NestJS.

Le code se trouve dans `apps/frontend/`. Les pages sont rendues sous `app/`, les composants sont regroupés par domaine sous `components/`, et les fonctions partagées résident dans `lib/`. L'application utilise Tailwind CSS pour les styles et des ressources statiques sous `public/`.

## 2. Architecture Frontend

Le frontend combine des composants serveur et des composants clients :

- les fichiers `page.tsx` chargent les données et effectuent les redirections côté serveur ;
- les composants portant `'use client'` gèrent les formulaires, sélections, retours d'action, interactions avec le navigateur et mises à jour locales ;
- les Route Handlers sous `app/api/` transmettent les appels du navigateur à NestJS ;
- les fonctions de `lib/api.ts` effectuent les appels backend des pages serveur ;
- les fonctions de `lib/auth.ts` et `lib/auth-session.ts` gèrent la lecture et les options des cookies de session.

```text
Navigateur
    |
    +---------------------+
    |                     |
    v                     v
Pages Next.js        Composants clients
serveur              React
    |                     |
    | requestApi          | fetch("/api/...")
    |                     v
    |                Route Handlers
    |                app/api/*
    |                     |
    +----------+----------+
               |
               | fetchServerApi
               v
       API NestJS /api/v1
```

Les pages et le layout racine déclarent `dynamic = 'force-dynamic'` lorsqu'ils chargent des données ou une session. `fetchServerApi` utilise `cache: 'no-store'` par défaut.

## 3. Organisation des dossiers

| Dossier | Rôle | Emplacement |
|---|---|---|
| Application | Pages, layout, états de chargement, erreurs et routes serveur | `apps/frontend/app/` |
| Route Handlers | Relais HTTP vers le backend et gestion des sessions | `apps/frontend/app/api/` |
| Composants | Composants React regroupés par domaine | `apps/frontend/components/` |
| Administration | Navigation et état vide administrateur | `apps/frontend/components/admin/` |
| Pointage | PIN, session dédiée, horloge, actions, GPS et capture photo | `apps/frontend/components/attendance/` |
| Historique | Filtres, tableau, espace de travail et panneau de détail | `apps/frontend/components/attendance-history/` |
| Authentification | Formulaires de connexion et déconnexion | `apps/frontend/components/auth/` |
| Calendrier | Grille, cellules, légende, sélection et panneau de jour | `apps/frontend/components/calendar/` |
| Tableau de bord | Indicateurs, activités, alertes, QR Code, exports et actions rapides | `apps/frontend/components/dashboard/` |
| Employés | Gestionnaire et fonctions associées | `apps/frontend/components/employees/` |
| Mise en page | Conteneurs de page partagés | `apps/frontend/components/layout/` |
| Sanctions | Règles et sélection du mois | `apps/frontend/components/sanctions/` |
| Horaires | Gestionnaire et fonctions associées | `apps/frontend/components/schedules/` |
| Interface générique | Badge, bouton, carte et squelette | `apps/frontend/components/ui/` |
| Bibliothèque | API, sessions, authentification, erreurs, redirections et styles utilitaires | `apps/frontend/lib/` |
| Ressources publiques | Logos, favicon et icônes | `apps/frontend/public/` |
| Types complémentaires | Déclaration TypeScript du package QRCode | `apps/frontend/types/` |

Les répertoires `hooks/`, `providers/`, `services/`, `store/` et `stores/` ne sont pas présents sous `apps/frontend/`.

## 4. Routing

### 4.1 App Router et layout

Le routage repose sur l'arborescence `apps/frontend/app/`. Un seul layout est présent :

| Élément | Route ou portée | Source |
|---|---|---|
| Layout racine | Toutes les pages | `apps/frontend/app/layout.tsx` |
| Styles globaux | Toutes les pages | `apps/frontend/app/globals.css` |
| Chargement racine | Segment racine | `apps/frontend/app/loading.tsx` |
| Erreur racine | Segment racine | `apps/frontend/app/error.tsx` |

Le layout définit la langue `fr`, les métadonnées du projet et les icônes. Aucun groupe de routes utilisant un dossier parenthésé n'est présent.

### 4.2 Pages

> **Mise à jour du périmètre SaaS :** `/` redirige selon le rôle; le dashboard d'organisation est `/dashboard` et agrège les données de l'organisation. Les routes `/site/[siteId]/...` fournissent des contextes opérationnels distincts par site. Voir `PROJECT_PLAN.md` et `docs/ARCHITECTURE.md` pour les frontières actuelles et l'autorisation indépendante du `siteId`.

| Route | Fichier | Comportement observé |
|---|---|---|
| `/` | `apps/frontend/app/page.tsx` | Redirection vers l'espace adapté au rôle authentifié |
| `/dashboard` | `apps/frontend/app/dashboard/page.tsx` | Dashboard d'organisation agrégé, réservé à l'ADMIN entreprise |
| `/site/[siteId]/dashboard` | `apps/frontend/app/site/[siteId]/dashboard/page.tsx` | Dashboard opérationnel d'un site autorisé |
| `/login` | `apps/frontend/app/login/page.tsx` | Formulaire de connexion et redirection d'une session déjà active |
| `/attendance-entry` | `apps/frontend/app/attendance-entry/page.tsx` | Identification par PIN puis affichage du terminal de pointage avec session dédiée |
| `/my-attendance` | `apps/frontend/app/my-attendance/page.tsx` | Présence personnelle de l'EMPLOYEE; redirection d'un administrateur vers `/dashboard` |
| `/attendance-history` | `apps/frontend/app/attendance-history/page.tsx` | Historique RH réservé au rôle `ADMIN` |
| `/employees` | `apps/frontend/app/employees/page.tsx` | Gestion des employés réservée au rôle `ADMIN` |
| `/schedules` | `apps/frontend/app/schedules/page.tsx` | Gestion des horaires réservée au rôle `ADMIN` |
| `/calendar` | `apps/frontend/app/calendar/page.tsx` | Calendrier RH réservé au rôle `ADMIN` |
| `/sanctions` | `apps/frontend/app/sanctions/page.tsx` | Sanctions mensuelles et règles, réservées au rôle `ADMIN` |
| `/exports` | `apps/frontend/app/exports/page.tsx` | Export mensuel réservé au rôle `ADMIN` |

Des fichiers `loading.tsx` sont présents pour `attendance-entry`, `calendar`, `employees`, `my-attendance`, `sanctions` et `schedules`. Des fichiers `error.tsx` sont présents pour `attendance-entry`, `calendar`, `employees`, `my-attendance` et `schedules`, en complément de l'erreur racine.

### 4.3 Navigation et protection

`apps/frontend/components/admin/admin-nav.tsx` utilise `next/link` pour relier le tableau de bord, l'historique, les exports, les employés, les horaires, le calendrier et les sanctions.

La protection s'effectue à deux niveaux :

1. `apps/frontend/middleware.ts` recherche le cookie de session sur `/`, `/my-attendance`, `/employees` et `/schedules`, puis redirige vers `/login` lorsqu'il est absent.
2. Les pages serveur appellent `requireCurrentUser()` et contrôlent `accessRole`. Les pages administrateur redirigent un utilisateur non administrateur vers `/my-attendance`. La page personnelle redirige un administrateur vers `/`.

Les pages `/attendance-history`, `/calendar`, `/sanctions` et `/exports` ne figurent pas dans le `matcher` du middleware ; elles appliquent leur contrôle dans leur fonction de page serveur.

`/attendance-entry` utilise le cookie distinct `konatech_attendance_entry_session`. En l'absence de ce cookie ou lorsque la session ne correspond pas à un employé, la page affiche `AttendanceEntryPinView`.

## 5. Composants

| Famille | Composants observés | Fonction |
|---|---|---|
| Administration | `AdminNav`, `AdminEmptyState` | Navigation des écrans administrateur et rendu sans données |
| Authentification | `LoginForm`, `LogoutForm` | Création et suppression de la session principale |
| Terminal de pointage | `AttendanceEntryPinView`, `FixedAttendanceEntryView`, `AttendanceEntrySessionButton` | Identification PIN, terminal et fin de session dédiée |
| Actions de présence | `EmployeeAttendanceActions`, `AttendanceSelfieCapture` | Entrée, sortie et données de sécurité conditionnelles |
| Affichage de présence | `AttendanceLiveClock` et fonctions de `attendance-display.ts` | Heure active et formatage des données de présence |
| Historique | `AttendanceHistoryWorkspace`, `AttendanceHistoryFilters`, `AttendanceHistoryTable`, `AttendanceDetailPanel` | Filtrage, affichage et détail des présences |
| Tableau de bord | `MetricCard`, `DailyAlertsCard`, `DashboardAnalyticsSection`, `RecentActivityList` | Indicateurs et données synthétiques |
| Accès au pointage | `AttendanceEntryQrCard`, `QuickActionsSection`, `ConnectionPanel` | QR Code, raccourcis et information de connexion |
| Export | `MonthlyAttendanceExportCard` | Paramètres et téléchargement de l'export mensuel |
| Employés | `AdminEmployeesManager` | Création, modification, statut, recherche et filtres |
| Horaires | `AdminSchedulesManager` | Création, modification, statut, recherche et filtres |
| Calendrier | `CalendarWorkspace`, `CalendarDayCell`, `CalendarDayDrawer`, `CalendarLegend`, `CalendarMonthSelector`, `CalendarDayBadge` | Consultation et gestion du calendrier |
| Sanctions | `SanctionRulesPanel`, `SanctionsMonthSelector` | Modification des règles et navigation mensuelle |
| Mise en page | `PageShell`, `PageHero` | Structure partagée des pages administrateur |
| Interface | `Badge`, `Button`, `Card`, `Skeleton` | Primitives visuelles réutilisées |

Les fonctions propres aux formulaires employés et horaires se trouvent respectivement dans `employee-manager.helpers.ts` et `schedule-manager.helpers.ts`. Les fonctions de séquence et de sécurité du pointage se trouvent dans `attendance-action-flow.ts` et `attendance-browser-security.ts`.

## 6. Gestion de l'état

### 6.1 État local React

Les composants clients utilisent les hooks React directement dans leurs fichiers :

| Mécanisme | Usage observé | Sources représentatives |
|---|---|---|
| `useState` | Formulaires, filtres, sélection, retours d'action et états de chargement | `components/employees/admin-employees-manager.tsx`, `components/calendar/calendar-workspace.tsx`, `components/attendance/employee-attendance-actions.tsx` |
| `useEffect` | Horloge, caméra, QR Code, chargements clients et réactions aux propriétés | `components/attendance/attendance-live-clock.tsx`, `components/attendance/attendance-selfie-capture.tsx`, `components/dashboard/attendance-entry-qr-card.tsx` |
| `useMemo` | Listes filtrées, jours de calendrier et calculs d'affichage | `components/attendance-history/attendance-history-workspace.tsx`, `components/schedules/admin-schedules-manager.tsx`, `components/calendar/calendar-workspace.tsx` |
| `useRef` | Canvas QR Code, vidéo et flux média | `components/dashboard/attendance-entry-qr-card.tsx`, `components/attendance/attendance-selfie-capture.tsx` |
| `useTransition` ou `startTransition` | Navigation après connexion et renouvellement d'affichage du terminal | `components/auth/login-form.tsx`, `components/attendance/attendance-entry-pin-view.tsx` |
| `useRouter` | `push`, `replace` et `refresh` après une action | Composants d'authentification, pointage, calendrier et sanctions |

### 6.2 État serveur et URL

Les pages `calendar` et `sanctions` lisent `searchParams` pour le mois sélectionné. La page `sanctions` y lit également l'onglet actif. Les sélecteurs correspondants modifient l'URL avec `router.replace`.

Les sessions sont conservées dans deux cookies HTTP-only :

- `konatech_session` pour la session applicative ;
- `konatech_attendance_entry_session` pour le terminal de pointage.

Les options sont construites par `buildSessionCookieOptions()` avec `sameSite: 'lax'`, `path: '/'` et le drapeau `secure` en production.

### 6.3 Cache et mécanismes absents

`fetchServerApi()` définit `cache: 'no-store'` lorsqu'aucune autre option n'est fournie. Le proxy de fichiers ajoute également `Cache-Control: no-store`. Plusieurs appels clients de consultation précisent la même option.

Aucun Context React, provider applicatif, store global ou bibliothèque de gestion d'état n'est implémenté dans le frontend. Aucun hook personnalisé placé dans un dossier `hooks/` n'est présent.

## 7. Communication avec le Backend

### 7.1 Appels des pages serveur

`apps/frontend/lib/api.ts` :

- définit les types des données échangées ;
- résout l'URL publique ou serveur de l'API ;
- construit les URL sous `/api/v1` ;
- ajoute le jeton Bearer lorsqu'il est fourni ;
- transforme les réponses non positives en `ApiRequestError` ;
- expose les fonctions de lecture du tableau de bord, de l'utilisateur, des présences, des employés, des horaires, du calendrier et des sanctions.

`API_BASE_URL` est prioritaire pour les appels serveur lorsqu'elle est définie. Sinon, le code utilise `NEXT_PUBLIC_API_BASE_URL`. En développement, la valeur de repli codée est `http://localhost:4000/api/v1`. En production, la fonction de résolution contrôle la présence, le protocole et la forme de l'URL.

### 7.2 Appels des composants clients

Les composants clients appellent les routes locales `/api/*` avec `fetch`. Ces routes utilisent les fonctions de `apps/frontend/lib/api-route.ts` :

| Fonction | Traitement |
|---|---|
| `proxyApiRequest` | Requête autorisée sans corps JSON |
| `proxyApiJsonBodyRequest` | Lecture et transmission d'un corps JSON |
| `proxyApiIdRequest` | Validation d'un identifiant de route puis transmission |
| `proxyApiIdJsonBodyRequest` | Identifiant de route et corps JSON |
| `proxyApiFileRequest` | Transmission d'une réponse fichier et de ses en-têtes |
| `createBackendFailureResponse` | Réponse JSON en cas d'indisponibilité ou d'erreur de configuration |

Le proxy lit le cookie correspondant au mode de session, place le jeton dans l'en-tête `Authorization: Bearer`, transmet le statut backend et normalise les messages d'erreur.

### 7.3 Route Handlers présents

| Domaine | Routes frontend | Cibles backend observées |
|---|---|---|
| Santé | `GET /api/health` | `GET /api/v1/health` |
| Authentification | `POST /api/auth/login` | `POST /api/v1/auth/login` |
| Session de pointage | `POST`, `DELETE /api/auth/attendance-entry-session` | Connexion sur `/api/v1/auth/attendance-entry/login`; suppression locale du cookie |
| Déconnexion | `POST /api/auth/logout` | Suppression locale de la session et redirection |
| Employés | `GET`, `POST /api/employees`; `GET`, `PATCH /api/employees/[id]`; `PATCH /api/employees/[id]/status` | Routes correspondantes sous `/api/v1/employees` |
| Horaires | `GET`, `POST /api/schedules`; `GET`, `PATCH /api/schedules/[id]`; `PATCH /api/schedules/[id]/status` | Routes correspondantes sous `/api/v1/schedules` |
| Calendrier | `GET /api/calendar/month`; `GET`, `POST /api/calendar/holidays`; `PATCH`, `DELETE /api/calendar/holidays/[id]` | Routes correspondantes sous `/api/v1/calendar` |
| Pointage personnel | `POST /api/attendance/me/check-in`, `POST /api/attendance/me/check-out` | Routes correspondantes sous `/api/v1/attendance/me` |
| Export | `GET /api/attendance/exports/monthly` | `GET /api/v1/attendance/exports/monthly` |
| Sanctions | `GET /api/sanctions/attendance/[attendanceId]`, `PATCH /api/sanctions/rules/[id]` | Routes correspondantes sous `/api/v1/sanctions` |

## 8. Organisation du code

| Type de ressource | Organisation observée | Emplacement |
|---|---|---|
| Pages | Un dossier de segment avec `page.tsx` | `apps/frontend/app/` |
| Layout | Layout racine unique | `apps/frontend/app/layout.tsx` |
| États de rendu | Fichiers `loading.tsx` et `error.tsx` racine ou par segment | `apps/frontend/app/` |
| Routes serveur | Un `route.ts` par route API | `apps/frontend/app/api/` |
| Composants serveur | Composants sans directive `'use client'` | `apps/frontend/app/`, `apps/frontend/components/` |
| Composants clients | Fichiers portant `'use client'` | `apps/frontend/components/`, fichiers `error.tsx` |
| Accès backend | Types, URL et fonctions HTTP | `apps/frontend/lib/api.ts` |
| Relais backend | Fonctions de proxy JSON, identifiants et fichiers | `apps/frontend/lib/api-route.ts` |
| Authentification | Lecture de session et utilisateur courant | `apps/frontend/lib/auth.ts` |
| Cookies | Noms, sélection, options et suppression | `apps/frontend/lib/auth-session.ts` |
| Redirections | Validation des chemins internes et destination par rôle | `apps/frontend/lib/redirect.ts` |
| Erreurs client | Extraction des messages de réponse | `apps/frontend/lib/client-error.ts` |
| Classes CSS | Fusion `clsx` et `tailwind-merge` | `apps/frontend/lib/utils.ts` |
| Styles globaux | Variables CSS, base Tailwind et classes globales | `apps/frontend/app/globals.css` |
| Configuration des styles | Thème et chemins analysés | `apps/frontend/tailwind.config.ts`, `apps/frontend/postcss.config.js` |
| Assets | Logos et icônes | `apps/frontend/public/` |

L'alias TypeScript `@/*` pointe sur la racine de `apps/frontend/`. Il est utilisé dans les imports des pages, composants et Route Handlers.

## 9. Diagramme global

```text
apps/frontend/
|
+-- app/                         App Router
|   +-- layout.tsx               layout racine
|   +-- globals.css              styles globaux
|   +-- */page.tsx               pages serveur
|   +-- */loading.tsx            états de chargement
|   +-- */error.tsx              frontières d'erreur clientes
|   `-- api/*/route.ts           Route Handlers
|
+-- components/
|   +-- admin/
|   +-- attendance/
|   +-- attendance-history/
|   +-- auth/
|   +-- calendar/
|   +-- dashboard/
|   +-- employees/
|   +-- layout/
|   +-- sanctions/
|   +-- schedules/
|   `-- ui/
|
+-- lib/
|   +-- api.ts                   appels backend et types
|   +-- api-route.ts             proxy des Route Handlers
|   +-- auth.ts                  utilisateur serveur
|   +-- auth-session.ts          cookies
|   +-- redirect.ts              destinations internes
|   +-- client-error.ts          erreurs du navigateur
|   `-- utils.ts                 classes CSS
|
+-- middleware.ts                filtre de routes
+-- public/                      images et icônes
+-- types/                       déclarations complémentaires
+-- next.config.ts
+-- tailwind.config.ts
+-- postcss.config.js
`-- tsconfig.json
```

## 10. Traçabilité

| Élément documenté | Fichier ou répertoire source | Preuve observée |
|---|---|---|
| Dépendances frontend | `apps/frontend/package.json` | Next.js, React, Tailwind CSS et bibliothèques utilisées |
| App Router | `apps/frontend/app/` | Pages, layout, Route Handlers, chargements et erreurs |
| Layout et métadonnées | `apps/frontend/app/layout.tsx` | Layout racine, langue, titre et icônes |
| Routes d'interface | Fichiers `page.tsx` sous `apps/frontend/app/` | Dix routes de page présentes |
| Navigation administrateur | `apps/frontend/components/admin/admin-nav.tsx` | Liens et sections affichés |
| Middleware | `apps/frontend/middleware.ts` | Chemins filtrés et redirection |
| Contrôle serveur | `apps/frontend/lib/auth.ts` | Lecture du cookie et `requireCurrentUser` |
| Redirection par rôle | `apps/frontend/lib/redirect.ts`, fichiers `page.tsx` | Destinations et contrôles `accessRole` |
| Session principale et dédiée | `apps/frontend/lib/auth-session.ts` | Deux noms de cookie et sélection par mode |
| Composants | `apps/frontend/components/` | Onze familles de dossiers réellement présentes |
| État React | Fichiers portant `'use client'` sous `apps/frontend/components/` | Hooks locaux et navigation cliente |
| État URL | `apps/frontend/app/calendar/page.tsx`, `apps/frontend/app/sanctions/page.tsx` | Lecture de `searchParams` |
| Cache HTTP | `apps/frontend/lib/api.ts`, `apps/frontend/lib/api-route.ts` | `no-store` par défaut et sur les fichiers |
| API serveur | `apps/frontend/lib/api.ts` | Types, résolutions d'URL et fonctions de requête |
| Proxy frontend | `apps/frontend/lib/api-route.ts` | Jeton Bearer, corps, identifiants, fichiers et erreurs |
| Route Handlers | `apps/frontend/app/api/` | Méthodes GET, POST, PATCH et DELETE présentes |
| Styles | `apps/frontend/app/globals.css`, `apps/frontend/tailwind.config.ts`, `apps/frontend/postcss.config.js` | CSS global, thème Tailwind et plugins PostCSS |
| Assets | `apps/frontend/public/` | Logos, icônes et favicon |
| Alias TypeScript | `apps/frontend/tsconfig.json` | Mappage `@/*` vers `./*` |
| Configuration Next.js | `apps/frontend/next.config.ts` | Mode strict React et comportement ESLint du build |
| Test de liaison | `scripts/validate-proxy.mjs` | Santé du proxy et redirection `/attendance-entry` |
| Architecture générale | `documentation/06-Developer-Guide/02-Architecture-generale.md` | Position du frontend dans le système |
| Structure du dépôt | `documentation/06-Developer-Guide/03-Structure-du-depot.md` | Organisation physique du package frontend |

## 11. Observations

- Le frontend utilise App Router et ne contient aucun répertoire `pages/`.
- Un seul layout, situé à la racine de `app/`, est présent.
- Aucun groupe de routes parenthésé n'est présent.
- Les pages qui chargent une session ou des données sont des fonctions asynchrones rendues côté serveur.
- Les interactions complexes sont conservées dans des composants clients à état local.
- Aucun Context React, provider applicatif ou store global n'est implémenté.
- Aucun dossier `hooks/` n'est présent ; les hooks React sont importés directement dans les composants.
- Aucun dossier `services/` n'est présent ; l'accès HTTP partagé se trouve dans `lib/api.ts` et `lib/api-route.ts`.
- Les appels backend effectués par la bibliothèque serveur utilisent `no-store` par défaut.
- Les composants clients appellent les Route Handlers locaux plutôt que l'origine backend directement.
- Les sessions principale et de pointage utilisent deux cookies distincts.
- Le middleware ne couvre qu'une partie des pages protégées ; les autres contrôles présents sont exécutés dans les pages serveur.
- Le frontend ne contient pas de provider de cache applicatif.
