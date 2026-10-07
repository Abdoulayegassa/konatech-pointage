# Architecture d’exécution

| Métadonnée | Valeur |
|---|---|
| Document ID | OG-002 |
| Titre | Architecture d’exécution |
| Version | 1.0 |
| Statut | Validé |
| Classification | Interne |
| Référence | Operations Guide |
| Projet | Konatech Pointage |

# 1. Présentation

## 1.1 Finalité

Ce chapitre décrit l’architecture active lorsque Konatech Pointage est démarré : processus, conteneurs, ports, échanges HTTP, accès aux données, dépendances de démarrage et services externes appelés par le code. Les éléments décrits sont rattachés aux sources exécutables et aux configurations du dépôt.

## 1.2 Architecture d’exécution dans le projet

L’architecture d’exécution correspond aux composants qui deviennent des processus ou des services actifs et aux échanges qu’ils réalisent. Dans ce dépôt, elle comprend un serveur Next.js, une application NestJS, Prisma Client dans le processus backend et PostgreSQL. Docker Compose peut exécuter PostgreSQL seul ou les trois services déclarés grâce au profil `app`.

Cloudinary est appelé par le backend lorsqu’une preuve photo est effectivement fournie hors environnement de test. Puppeteer et Chromium sont utilisés dans le processus backend pour le rendu PDF configuré ; ils ne sont pas déclarés comme services réseau distincts.

## 1.3 Périmètre observé

Le périmètre couvre le workspace pnpm, les deux applications de `apps`, leurs points d’entrée, les route handlers Next.js, l’API NestJS sous `/api/v1`, Prisma, PostgreSQL, les Dockerfiles, Docker Compose, les scripts racine, les environnements reconnus et les contrôles de santé.

## 1.4 Structure du code et composants actifs

Les répertoires `apps/frontend/app`, `apps/backend/src/modules` et `apps/backend/prisma` organisent le code, mais ne constituent pas chacun un service autonome. À l’exécution :

- les pages, composants et route handlers frontend s’exécutent dans le navigateur ou le serveur Next.js selon leur nature ;
- les contrôleurs, gardes et services NestJS s’exécutent dans un seul processus backend ;
- `PrismaService` fournit Prisma Client dans ce processus ;
- PostgreSQL est le service de données séparé ;
- le service Cloudinary n’est contacté que par le chemin conditionnel d’envoi de photo.

# 2. Vue d’ensemble de l’architecture d’exécution

```text
+-------------------+
| Navigateur client |
+---------+---------+
          |
          | HTTP(S) : pages, actions et routes `/api/*`
          v
+-----------------------------+
| Serveur Next.js             |
| `apps/frontend`             |
| pages + route handlers      |
+-------------+---------------+
              |
              | HTTP(S), JSON ou fichier
              | `API_BASE_URL` / `NEXT_PUBLIC_API_BASE_URL`
              v
+-----------------------------+
| API NestJS                  |
| `apps/backend`              |
| préfixe `/api/v1`           |
+-------------+---------------+
              |
              | appels Prisma Client
              v
+-----------------------------+
| `PrismaService`             |
| dans le processus backend   |
+-------------+---------------+
              |
              | protocole PostgreSQL via `DATABASE_URL`
              v
+-----------------------------+
| PostgreSQL 16               |
| service Compose `postgres`  |
+-----------------------------+

Chemin conditionnel de preuve photo :

API NestJS
    |
    | HTTPS multipart signé, si une photo est fournie hors test
    v
API Cloudinary

Services Docker Compose sous le profil `app` :

`postgres` -- santé requise --> `backend` -- santé requise --> `frontend`
```

| Source | Destination | Protocole ou mécanisme | Finalité | Fichiers de preuve |
|---|---|---|---|---|
| Navigateur | Frontend Next.js | HTTP(S) | Charger les pages, soumettre le PIN, les formulaires et les actions de pointage | `apps/frontend/app`, `apps/frontend/components/attendance/attendance-entry-pin-view.tsx`, `apps/frontend/components/attendance/employee-attendance-actions.tsx` |
| Route handlers Next.js | API NestJS | HTTP(S), corps JSON et en-tête Bearer | Authentification, opérations métier, consultations, santé et export | `apps/frontend/lib/api.ts`, `apps/frontend/lib/api-route.ts`, `apps/frontend/app/api` |
| Contrôleurs NestJS | Services NestJS | Injection de dépendances et appels de méthodes | Appliquer les traitements d’authentification, de pointage, de dashboard et d’administration | `apps/backend/src/modules` |
| Services NestJS | `PrismaService` | Appels Prisma Client | Lire et modifier les données métier | `apps/backend/src/modules`, `apps/backend/src/common/prisma/prisma.service.ts` |
| Prisma Client | PostgreSQL | Connexion définie par `DATABASE_URL` | Persistance relationnelle | `apps/backend/prisma/schema.prisma`, `apps/backend/prisma.config.ts` |
| `AttendancePhotoStorageService` | API Cloudinary | HTTPS, formulaire multipart signé | Stocker une photo de vérification lorsqu’elle est fournie | `apps/backend/src/modules/attendance/attendance-photo-storage.service.ts` |
| Docker Compose | Conteneurs `postgres`, `backend`, `frontend` | Construction, réseau Compose, healthchecks et dépendances | Orchestrer les composants conteneurisés | `docker-compose.yml`, `docker/backend.Dockerfile`, `docker/frontend.Dockerfile` |

# 3. Frontend en exécution

## 3.1 Point d’entrée et rendu

Le frontend utilise l’App Router. `apps/frontend/app/layout.tsx` définit le layout racine, les métadonnées et `dynamic = 'force-dynamic'`. Les pages sont des composants serveur sauf lorsqu’un fichier porte la directive `'use client'`. Les interactions de PIN, de pointage et d’administration utilisent des composants client, tandis que les pages serveur chargent les données par les fonctions de `apps/frontend/lib/api.ts`.

Le serveur de développement est `next dev`. Le serveur de production est `next start`; l’image Docker le lance sur `0.0.0.0:3000`.

## 3.2 Parcours de pointage

Le dashboard administrateur génère un QR code dont la valeur cible `/attendance-entry`. Le backend expose aussi `/api/v1/attendance/entry`, qui redirige vers cette même page à partir de `FRONTEND_URL`.

```text
QR Code
    |
    v
`/attendance-entry`
    |
    v
Saisie du PIN
    |
    v
Session de pointage
    |
    v
Attendance Entry
```

Après validation du PIN, le route handler `/api/auth/attendance-entry-session` place le jeton dans le cookie HTTP-only `konatech_attendance_entry_session`. Les actions d’entrée et de sortie passent respectivement par `/api/attendance/me/check-in` et `/api/attendance/me/check-out`.

## 3.3 Éléments d’exécution

| Élément | Fonction | Configuration ou valeur observée | Source |
|---|---|---|---|
| Layout racine | Envelopper toutes les pages et déclarer les métadonnées | App Router, langue `fr`, rendu forcé dynamique | `apps/frontend/app/layout.tsx` |
| Serveur de développement | Servir l’application pendant le développement | `next dev`, port Next.js par défaut `3000` | `apps/frontend/package.json`, `package.json` |
| Serveur construit | Servir le build frontend | `next start`; Docker fixe l’hôte `0.0.0.0` et le port `3000` | `apps/frontend/package.json`, `docker/frontend.Dockerfile` |
| Base d’URL API | Construire les URL backend côté serveur | Priorité à `API_BASE_URL`, puis `NEXT_PUBLIC_API_BASE_URL`; repli de développement vers `http://localhost:4000/api/v1` | `apps/frontend/lib/api.ts`, `apps/frontend/.env.example` |
| URL publique frontend | Construire l’URL du QR | `NEXT_PUBLIC_APP_URL`; route relative `/attendance-entry` si elle est absente hors production | `apps/frontend/app/page.tsx`, `apps/frontend/lib/api.ts` |
| Proxy métier | Transmettre JSON, autorisation et fichiers | Route handlers de `apps/frontend/app/api` et fonctions de `apps/frontend/lib/api-route.ts` | `apps/frontend/app/api`, `apps/frontend/lib/api-route.ts` |
| Authentification générale | Recevoir un jeton backend et créer une session web | Cookie HTTP-only `konatech_session`, `SameSite=Lax`, `Secure` en production | `apps/frontend/app/api/auth/login/route.ts`, `apps/frontend/lib/auth-session.ts` |
| Authentification de pointage | Authentifier un employé par PIN avec une session distincte | Cookie HTTP-only `konatech_attendance_entry_session` | `apps/frontend/app/api/auth/attendance-entry-session/route.ts`, `apps/frontend/lib/auth-session.ts` |
| Protection de routes | Rediriger vers `/login` si la session générale manque | Middleware actif pour `/`, `/my-attendance`, `/employees` et `/schedules` | `apps/frontend/middleware.ts` |
| Pointage principal | Afficher le pavé PIN ou l’écran fixe de pointage | Route `/attendance-entry` et session dédiée | `apps/frontend/app/attendance-entry/page.tsx`, `apps/frontend/components/attendance/attendance-entry-pin-view.tsx` |
| Routes administratives principales | Afficher dashboard, employés, plannings, historique, calendrier, sanctions et exports | `/`, `/employees`, `/schedules`, `/attendance-history`, `/calendar`, `/sanctions`, `/exports` | `apps/frontend/app` |
| Route de santé | Relayer la santé du backend | GET `/api/health` vers `/api/v1/health` | `apps/frontend/app/api/health/route.ts` |

Aucun manifeste web, service worker ou module PWA n’est présent dans le frontend.

# 4. Backend en exécution

## 4.1 Bootstrap NestJS

`apps/backend/src/main.ts` crée l’application depuis `AppModule` avec le body parser NestJS désactivé. Il configure ensuite :

- la confiance du proxy Express lorsque `TRUST_PROXY_HOPS` est supérieur à zéro ;
- le middleware `helmet` ;
- les parseurs JSON et URL-encoded avec la limite `JSON_BODY_LIMIT` ;
- le préfixe global `api/v1` ;
- CORS avec l’origine `FRONTEND_URL` et les credentials activés ;
- un `ValidationPipe` global avec liste blanche, rejet des champs non déclarés, transformation et conversion implicite ;
- l’écoute sur le port fourni par `PORT`.

Le dépôt ne configure pas de filtre d’exception global ni d’intercepteur global. Les gardes globaux actifs sont `AppThrottlerGuard`, `JwtAuthGuard` et `RolesGuard`.

## 4.2 Modules chargés

`AppModule` charge `AuditLogModule`, `PrismaModule`, `AuthModule`, `HealthModule`, `DashboardModule`, `EmployeesModule`, `CalendarModule`, `AttendanceModule`, `SanctionsModule` et `SchedulesModule`.

L’endpoint public de santé est GET `/api/v1/health`. Il renvoie l’état du service et un horodatage sans interroger explicitement PostgreSQL.

## 4.3 Traitement d’une requête métier

```text
Client Next.js
      |
      | HTTP + Bearer
      v
AppThrottlerGuard
      |
      v
JwtAuthGuard
      |
      v
RolesGuard
      |
      v
ValidationPipe + DTO
      |
      v
Contrôleur NestJS
      |
      v
Service métier
      |
      v
`PrismaService`
      |
      v
PostgreSQL
```

Les routes marquées `@Public()` ignorent l’authentification JWT. Les décorateurs `@Roles()` limitent les routes concernées aux rôles `ADMIN` ou `EMPLOYEE`.

`PrismaService` implémente `OnModuleDestroy` et appelle `$disconnect()` lorsque le module est détruit. Le bootstrap n’appelle pas `enableShutdownHooks()` et ne définit pas de gestionnaire de signaux NestJS.

# 5. Couche d’accès aux données

| Élément | Rôle à l’exécution | Dépendance | Source |
|---|---|---|---|
| Prisma Client | Fournir les opérations typées sur les modèles | Client généré depuis le schéma | `apps/backend/prisma/schema.prisma`, `apps/backend/package.json` |
| `PrismaService` | Rendre Prisma Client injectable globalement et fermer le client à la destruction du module | `@prisma/client` | `apps/backend/src/common/prisma/prisma.service.ts`, `apps/backend/src/common/prisma/prisma.module.ts` |
| Schéma Prisma | Définir PostgreSQL, les enums, modèles, relations et index | `DATABASE_URL` | `apps/backend/prisma/schema.prisma` |
| Configuration Prisma | Localiser schéma, migrations et seed | `DATABASE_URL`, Prisma CLI | `apps/backend/prisma.config.ts` |
| Migrations | Versionner et appliquer les modifications SQL | PostgreSQL accessible | `apps/backend/prisma/migrations` |
| Seed | Charger les données prévues par le script | Prisma Client et PostgreSQL | `apps/backend/prisma/seed.ts`, `apps/backend/prisma.config.ts` |
| Migration de développement | Appliquer ou créer les migrations en mode développement | `pnpm prisma:migrate` | `package.json` |
| Migration de déploiement | Appliquer les migrations existantes sans en créer | `pnpm prisma:migrate:deploy`; automatique au démarrage du conteneur backend | `package.json`, `docker/backend.Dockerfile` |
| Création du premier administrateur | Créer un compte administrateur de manière idempotente selon l’adresse fournie | Variables `ADMIN_EMAIL`, `ADMIN_PASSWORD` et `DATABASE_URL` | `apps/backend/scripts/create-initial-admin.ts`, `apps/backend/package.json` |
| Backfill des PIN | Convertir les PIN historiques vers leur forme hachée | Prisma et base accessible | `apps/backend/scripts/backfill-employee-pin-code-hashes.ts`, `apps/backend/package.json` |
| Backfill des instantanés de planning | Compléter les instantanés associés aux pointages | Prisma et base accessible | `apps/backend/scripts/backfill-attendance-schedule-snapshots.ts`, `apps/backend/package.json` |

La chaîne de connexion provient de `DATABASE_URL`. Aucun fichier actif ne définit un pooler ou une seconde connexion directe.

# 6. Base de données PostgreSQL

Le provider Prisma est `postgresql`. En local, `pnpm db:up` exécute `docker compose up -d` et démarre le service `postgres`, car les services applicatifs appartiennent au profil `app`.

Le conteneur utilise `postgres:16-alpine`. PostgreSQL écoute sur `5432` dans le conteneur. Compose publie par défaut ce port sur `5433` côté hôte au moyen de `POSTGRES_PORT`. Les données sont conservées dans le volume nommé `postgres-data`, monté sur `/var/lib/postgresql/data`.

Les fichiers d’exemple fournissent les noms `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_PORT` et `DATABASE_URL`. Les valeurs sensibles ne sont pas reproduites dans ce chapitre.

Le backend reçoit `DATABASE_URL`. Dans Compose, cette chaîne cible le nom de service `postgres` et son port interne `5432`. Le healthcheck PostgreSQL appelle `pg_isready` avec l’utilisateur et la base déclarés. Le backend Compose ne démarre qu’après l’état sain du service `postgres`.

# 7. Réseau, ports et adresses

| Composant | Port interne | Port exposé | Adresse ou variable | Environnement | Source |
|---|---:|---:|---|---|---|
| Frontend Next.js local | 3000 par défaut | 3000 | `NEXT_PUBLIC_APP_URL`; exemple local `http://localhost:3000` | Développement | `apps/frontend/package.json`, `apps/frontend/.env.example`, `README.md` |
| Frontend Compose | 3000 | `FRONTEND_PORT`, valeur par défaut `3000` | `NEXT_PUBLIC_APP_URL` | Production conteneurisée | `docker-compose.yml`, `docker/frontend.Dockerfile`, `.env.production.example` |
| Backend NestJS local | `PORT`, valeur par défaut `4000` | 4000 dans l’exemple local | Base API locale de repli `http://localhost:4000/api/v1` | Développement | `apps/backend/src/app.module.ts`, `apps/backend/src/main.ts`, `apps/frontend/lib/api.ts` |
| Backend Compose | 4000 | `BACKEND_PORT`, valeur par défaut `4000` | `FRONTEND_URL` pour CORS et redirection ; URLs API fournies par `API_BASE_URL` et `NEXT_PUBLIC_API_BASE_URL` | Production conteneurisée | `docker-compose.yml`, `docker/backend.Dockerfile`, `.env.production.example` |
| PostgreSQL Compose | 5432 | `POSTGRES_PORT`, valeur par défaut `5433` | Hôte Compose `postgres` dans `DATABASE_URL` du backend | Développement et production conteneurisée | `docker-compose.yml`, `.env.production.example` |
| PostgreSQL de test | 5432 dans le conteneur local | 5433 dans la configuration fournie | `TEST_DATABASE_URL` ou `DATABASE_URL` | Test | `apps/backend/.env.test`, `apps/backend/test/test-environment.ts` |
| Backend du test proxy | Port temporaire attribué par le système | Même port sur `127.0.0.1` | `FRONTEND_URL` et base API construites par le script | Test de raccordement | `scripts/validate-proxy.mjs` |
| Frontend du test proxy | Port temporaire attribué par le système | Même port sur `127.0.0.1` | `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_API_BASE_URL`, `API_BASE_URL` | Test de raccordement | `scripts/validate-proxy.mjs` |
| API Cloudinary | Non défini dans le dépôt | Non défini dans le dépôt | URL HTTPS construite à partir de `CLOUDINARY_CLOUD_NAME` | Exécution hors test lorsqu’une photo est envoyée | `apps/backend/src/modules/attendance/attendance-photo-storage.service.ts` |

Le préfixe API `/api/v1` est imposé par NestJS. Les fonctions frontend exigent que `API_BASE_URL` et `NEXT_PUBLIC_API_BASE_URL` se terminent par `/api/v1`. En production, ces URL et `NEXT_PUBLIC_APP_URL` sont exigées en HTTPS et ne peuvent pas désigner localhost, une adresse privée ou un tunnel temporaire.

# 8. Modes d’exécution

| Mode | Composants démarrés | Commande réelle | Dépendances | Fichiers de configuration |
|---|---|---|---|---|
| Développement local conjoint | Backend NestJS en surveillance et frontend Next.js en développement | `pnpm dev` | Dépendances installées, variables backend/frontend et PostgreSQL pour les fonctions persistantes | `package.json`, `scripts/dev.mjs`, `apps/backend/.env.example`, `apps/frontend/.env.example` |
| Développement backend | Backend NestJS seul en surveillance | `pnpm dev:backend` | Variables backend, Prisma Client et PostgreSQL | `package.json`, `apps/backend/src/app.module.ts` |
| Développement frontend | Frontend Next.js seul | `pnpm dev:frontend` | Variables frontend ; backend pour les appels API | `package.json`, `apps/frontend/lib/api.ts` |
| PostgreSQL local | Service Compose `postgres` | `pnpm db:up` | Docker Compose | `package.json`, `docker-compose.yml` |
| Tests backend | Suites Jest e2e et base de test recréée par les suites qui appellent sa préparation | `pnpm test:backend` | PostgreSQL local, variables de test, Prisma | `package.json`, `apps/backend/test/jest-e2e.json`, `apps/backend/test/test-database.ts` |
| Test de raccordement | Backend et frontend sur ports temporaires | `pnpm test:proxy` | Variables backend valides et applications installées | `package.json`, `scripts/validate-proxy.mjs` |
| Build global | Compilation séquentielle backend puis frontend | `pnpm build` | Dépendances installées et configuration nécessaire aux builds | `package.json` |
| Backend construit | Processus Node.js depuis `dist` | `pnpm --dir apps/backend start` | Build backend, variables, Prisma et PostgreSQL | `apps/backend/package.json` |
| Frontend construit | Serveur Next.js depuis le build | `pnpm --dir apps/frontend start` | Build frontend et URL backend | `apps/frontend/package.json` |
| Pile Docker applicative | PostgreSQL, backend et frontend | `docker compose --env-file .env.production --profile app up -d --build` | Docker, variables de production et contexte du dépôt | `README.md`, `docker-compose.yml`, `.env.production.example` |
| Validation globale | Processus temporaires de build et de test ; proxy backend/frontend pendant son contrôle | `pnpm validate` | Dépendances, PostgreSQL pour les tests backend et variables nécessaires | `package.json`, `scripts/validate-proxy.mjs` |

# 9. Dépendances de démarrage

## 9.1 Pile Compose

```text
Service PostgreSQL sain (`pg_isready`)
                  |
                  v
Backend : `prisma migrate deploy`
                  |
                  v
Backend NestJS sain (`/api/v1/health`)
                  |
                  v
Frontend Next.js
                  |
                  v
Proxy frontend (`/api/health`) relié à l’API
```

## 9.2 Dépendances et indisponibilités

| Composant | Dépend de | Conséquence observable de l’indisponibilité | Source |
|---|---|---|---|
| Backend Compose | PostgreSQL déclaré sain | Compose retarde le démarrage du backend tant que le healthcheck PostgreSQL ne réussit pas | `docker-compose.yml` |
| Démarrage du conteneur backend | Migration Prisma réussie | La chaîne `&&` empêche `node dist/main.js` de démarrer si `migrate deploy` échoue | `docker/backend.Dockerfile` |
| Services métier persistants | Prisma et PostgreSQL | Les appels Prisma utilisés par les services ne peuvent pas terminer leurs opérations de données | `apps/backend/src/modules`, `apps/backend/src/common/prisma/prisma.service.ts` |
| Frontend Compose | Backend déclaré sain | Compose retarde le démarrage du frontend tant que le healthcheck backend ne réussit pas | `docker-compose.yml` |
| Route handlers frontend | URL backend valide et API accessible | Une erreur de configuration produit une réponse 500 ; un échec de connexion produit une réponse 502 dans le proxy commun | `apps/frontend/lib/api.ts`, `apps/frontend/lib/api-route.ts` |
| Santé frontend | Endpoint backend `/health` | `/api/health` renvoie une erreur si l’appel backend échoue ou retourne un statut non réussi | `apps/frontend/app/api/health/route.ts` |
| Envoi d’une photo de vérification hors test | Configuration Cloudinary complète et API joignable | Le service lève une erreur explicite de configuration, de passerelle ou de délai ; le pointage concerné ne reçoit pas de preuve stockée | `apps/backend/src/modules/attendance/attendance-photo-storage.service.ts`, `apps/backend/src/modules/attendance/attendance-security.service.ts` |
| Rendu PDF premium dans l’image backend | Chromium | L’image installe Chromium et configure `ATTENDANCE_PDF_EXECUTABLE_PATH` pour le renderer Puppeteer | `docker/backend.Dockerfile`, `apps/backend/src/modules/attendance/exports/monthly-attendance-puppeteer-pdf-renderer.service.ts` |

# 10. Flux d’exécution principaux

## 10.1 Pointage employé

```text
QR Code
    |
    v
`/attendance-entry`
    |
    v
PIN
    |
    v
POST `/api/auth/attendance-entry-session`
    |
    v
POST `/api/v1/auth/attendance-entry/login`
    |
    v
Cookie de session de pointage
    |
    v
POST `/api/attendance/me/check-in` ou `/check-out`
    |
    v
POST `/api/v1/attendance/me/check-in` ou `/check-out`
    |
    v
`AttendanceService`
    |
    +--> évaluation conditionnelle GPS/photo
    |
    v
`PrismaService`
    |
    v
PostgreSQL
```

La sécurité de pointage est évaluée par le backend. La géolocalisation devient active selon `ATTENDANCE_SECURITY_ENABLED` et la présence des coordonnées de l’entreprise. Une photo fournie est envoyée à Cloudinary hors environnement de test.

## 10.2 Tableau des flux

| Flux | Route frontend ou point d’entrée | Endpoint backend | Contrôleurs et services principaux |
|---|---|---|---|
| Authentification générale | `/login` puis POST `/api/auth/login` | POST `/api/v1/auth/login`, GET `/api/v1/auth/me` | `AuthController`, `AuthService`, `PrismaService` |
| Chargement du dashboard | `/` | GET `/api/v1/dashboard/overview` | `DashboardController`, `DashboardService`, `PrismaService` |
| Accès au pointage par QR | QR vers `/attendance-entry` ou GET `/api/v1/attendance/entry` avec redirection | GET `/api/v1/attendance/entry` | `AttendanceController`, `AttendanceEntryService` |
| Identification par PIN | POST `/api/auth/attendance-entry-session` | POST `/api/v1/auth/attendance-entry/login` | `AuthController`, `AuthService`, `PrismaService` |
| Pointage d’entrée employé | POST `/api/attendance/me/check-in` | POST `/api/v1/attendance/me/check-in` | `AttendanceController`, `AttendanceService`, `AttendanceSecurityService`, `PrismaService` |
| Pointage de sortie employé | POST `/api/attendance/me/check-out` | POST `/api/v1/attendance/me/check-out` | `AttendanceController`, `AttendanceService`, `AttendanceSecurityService`, `PrismaService` |
| Consultation d’historique | `/attendance-history` pour l’administration | GET `/api/v1/attendance/history` | `AttendanceController`, `AttendanceService`, `PrismaService` |
| Consultation employés | `/employees` et route handlers `/api/employees` | GET `/api/v1/employees` et GET `/api/v1/schedules` | `EmployeesController`, `EmployeesService`, `SchedulesController`, `SchedulesService` |
| Consultation plannings | `/schedules` et route handlers `/api/schedules` | GET `/api/v1/schedules` | `SchedulesController`, `SchedulesService`, `PrismaService` |
| Consultation calendrier | `/calendar` et route handler `/api/calendar/month` | GET `/api/v1/calendar/month` | `CalendarController`, `CalendarService`, `PrismaService` |
| Consultation sanctions | `/sanctions` | GET `/api/v1/sanctions/monthly`, GET `/api/v1/sanctions/rules` | `SanctionsController`, `SanctionsService`, `PrismaService` |
| Export mensuel | `/exports` puis GET `/api/attendance/exports/monthly` | GET `/api/v1/attendance/exports/monthly` | `AttendanceController`, `MonthlyAttendanceExportService`, exporteurs CSV/PDF |
| Santé | GET `/api/health` | GET `/api/v1/health` | Route handler Next.js, `HealthController` |

# 11. Limites de l’architecture démontrable

- Aucun fichier actif ne démontre un reverse proxy intégré.
- Aucun manifeste de Kubernetes, service systemd ou infrastructure as code n’est présent.
- Aucun pipeline CI/CD n’est configuré dans le dépôt.
- Aucun service Redis, MinIO ou serveur de fichiers local n’est configuré.
- Aucun mécanisme de supervision externe, collecte de métriques ou alerte n’est défini.
- Les journaux utilisent les sorties des processus ; aucun collecteur ou stockage centralisé de journaux n’est configuré.
- Cloudinary est intégré par appel HTTPS conditionnel dans le code, mais aucun service Cloudinary local ni ressource déclarative n’est présent.
- Le healthcheck backend confirme la réponse HTTP de NestJS sans effectuer de requête directe vers PostgreSQL.
- Aucun environnement de staging n’est défini par les configurations actives.
- Les fournisseurs d’hébergement mentionnés dans certains documents ne sont pas matérialisés par un fichier de déploiement actif.
- Aucun comportement PWA n’est configuré.

# 12. Traçabilité

| Élément architectural | Fichier ou répertoire source | Preuve observée |
|---|---|---|
| Monorepo pnpm | `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml` | Workspace `apps/*`, scripts racine et lockfile unique |
| Frontend Next.js | `apps/frontend/package.json`, `apps/frontend/app`, `apps/frontend/next.config.ts` | Dépendances Next.js/React, App Router et configuration Next.js |
| Point d’entrée frontend | `apps/frontend/app/layout.tsx` | Layout racine, métadonnées et rendu dynamique |
| Serveurs frontend | `apps/frontend/package.json`, `docker/frontend.Dockerfile` | Scripts `dev`, `build`, `start` et commande Docker `next start` |
| Routes frontend | `apps/frontend/app` | Pages dashboard, pointage, administration et route handlers |
| Session frontend | `apps/frontend/lib/auth-session.ts`, `apps/frontend/app/api/auth` | Deux cookies HTTP-only et création des sessions depuis les réponses backend |
| URL de l’API | `apps/frontend/lib/api.ts`, `apps/frontend/.env.example` | Résolution de `API_BASE_URL`, `NEXT_PUBLIC_API_BASE_URL` et repli local |
| Backend NestJS | `apps/backend/package.json`, `apps/backend/src/main.ts` | Bootstrap NestJS, port, middlewares, CORS, préfixe et pipe global |
| Modules backend | `apps/backend/src/app.module.ts` | Liste des modules importés et configuration globale |
| Sécurité API | `apps/backend/src/modules/auth/auth.module.ts`, `apps/backend/src/modules/auth/guards` | Gardes JWT et rôles enregistrés globalement |
| Limitation de débit | `apps/backend/src/app.module.ts`, `apps/backend/src/common/security/app-throttler.guard.ts` | Throttlers et garde global |
| API HTTP | `apps/backend/src/modules/*/*.controller.ts` | Contrôleurs et décorateurs de routes |
| Préfixe API | `apps/backend/src/main.ts` | `setGlobalPrefix('api/v1')` |
| CORS | `apps/backend/src/main.ts` | Origine obtenue depuis `FRONTEND_URL`, credentials actifs |
| Variables backend | `apps/backend/src/app.module.ts`, `apps/backend/.env.example`, `.env.production.example` | Chargement des fichiers et validation Joi |
| Prisma | `apps/backend/prisma.config.ts`, `apps/backend/prisma/schema.prisma` | Configuration, provider PostgreSQL et URL de datasource |
| Service Prisma | `apps/backend/src/common/prisma/prisma.module.ts`, `apps/backend/src/common/prisma/prisma.service.ts` | Module global, client injectable et déconnexion |
| Migrations et seed | `apps/backend/prisma/migrations`, `apps/backend/prisma/seed.ts` | SQL versionné et chargement de données |
| PostgreSQL | `docker-compose.yml` | Image PostgreSQL 16, port, volume et `pg_isready` |
| Docker applicatif | `docker/backend.Dockerfile`, `docker/frontend.Dockerfile` | Construction et commandes de démarrage des applications |
| Orchestration Compose | `docker-compose.yml` | Trois services, profil `app`, dépendances de santé et ports |
| Ports | `docker-compose.yml`, `apps/backend/src/app.module.ts`, `scripts/validate-proxy.mjs` | Ports applicatifs, mappages et ports temporaires de test |
| Santé backend | `apps/backend/src/modules/health/health.controller.ts` | Route publique GET `health` |
| Santé frontend | `apps/frontend/app/api/health/route.ts` | Proxy vers la santé backend |
| QR de pointage | `apps/frontend/components/dashboard/attendance-entry-qr-card.tsx`, `apps/frontend/app/page.tsx` | Génération QR avec l’URL `/attendance-entry` |
| PIN et session de pointage | `apps/frontend/components/attendance/attendance-entry-pin-view.tsx`, `apps/frontend/app/api/auth/attendance-entry-session/route.ts` | Saisie de quatre chiffres, appel d’authentification et cookie dédié |
| Redirection backend de pointage | `apps/backend/src/modules/attendance/attendance.controller.ts`, `apps/backend/src/modules/attendance/attendance-entry.service.ts` | GET public `attendance/entry` vers `FRONTEND_URL/attendance-entry` |
| Actions de pointage | `apps/frontend/app/api/attendance/me`, `apps/backend/src/modules/attendance/attendance.controller.ts`, `apps/backend/src/modules/attendance/attendance.service.ts` | Proxies frontend et endpoints employé d’entrée/sortie |
| Stockage photo conditionnel | `apps/backend/src/modules/attendance/attendance-security.service.ts`, `apps/backend/src/modules/attendance/attendance-photo-storage.service.ts` | Appel d’upload uniquement lorsqu’une photo est fournie |
| Exports | `apps/frontend/app/api/attendance/exports/monthly/route.ts`, `apps/backend/src/modules/attendance/exports` | Proxy de fichier et exporteurs CSV/PDF |
| Modes d’exécution | `package.json`, `scripts/dev.mjs`, `scripts/validate-proxy.mjs` | Scripts de développement, build, test et validation |

# 13. Observations

- Le frontend et le backend sont construits et exécutés séparément tout en appartenant au même workspace pnpm.
- Les route handlers Next.js forment la façade HTTP utilisée par les interactions navigateur qui modifient l’état ou téléchargent un export.
- Les lectures de pages serveur peuvent appeler directement l’API backend au moyen de `fetchServerApi`.
- L’authentification générale et l’authentification de pointage utilisent deux cookies distincts.
- Le parcours principal de pointage part du QR et aboutit à `/attendance-entry`, où le PIN ouvre une session limitée au pointage.
- Les gardes globaux centralisent l’authentification JWT, l’autorisation par rôle et la limitation de débit dans le backend.
- Prisma est l’unique couche d’accès à PostgreSQL observée dans les services applicatifs.
- Le mode Compose impose une chaîne de disponibilité PostgreSQL, backend, puis frontend.
- Le développement local coordonne deux processus sans gérer PostgreSQL ; celui-ci est démarré séparément par Compose.
- Les ports applicatifs conteneurisés sont fixes en interne et configurables côté hôte.
- La visibilité opérationnelle fournie par les configurations actives repose sur trois healthchecks Compose, les endpoints HTTP et les sorties de journaux.
- La documentation historique peut citer des plateformes d’hébergement, tandis que les configurations exécutables présentes définissent uniquement Docker Compose et les deux Dockerfiles applicatifs.
