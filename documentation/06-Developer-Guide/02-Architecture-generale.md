# Developer Guide — Architecture générale

| Métadonnée | Valeur |
|---|---|
| Document ID | DG-002 |
| Titre | Architecture générale |
| Version | 1.0 |
| Statut | Validé |
| Classification | Interne |
| Référence | Developer Guide |
| Projet | Konatech Pointage |

## 1. Présentation

Ce chapitre décrit l'architecture générale effectivement implémentée dans le dépôt Konatech Pointage. Il présente les composants applicatifs, leurs responsabilités, leurs relations à l'exécution et l'organisation logique du code.

Le projet est un monorepo pnpm composé de deux applications : un frontend Next.js et un backend NestJS. Le backend utilise Prisma Client pour accéder à PostgreSQL. Les configurations racine coordonnent le développement, les builds, les tests et l'exécution avec Docker Compose.

## 2. Vue d'ensemble

Le navigateur communique avec l'application Next.js. Les pages App Router utilisent des composants React et des fonctions serveur. Les Route Handlers situés sous `apps/frontend/app/api/` appellent l'API NestJS au moyen de `fetchServerApi`.

NestJS expose ses contrôleurs sous le préfixe global `/api/v1`. Les contrôleurs délèguent les traitements aux services de leurs modules. Les services nécessitant une persistance injectent `PrismaService`, qui étend `PrismaClient` et utilise la source PostgreSQL déclarée dans le schéma Prisma.

```text
Utilisateur
    |
    | HTTPS ou HTTP
    v
Navigateur
    |
    v
Frontend Next.js
├── Pages App Router
├── Composants React
└── Route Handlers /api/*
            |
            | requêtes HTTP
            v
Backend NestJS /api/v1
├── Gardes et validation
├── Contrôleurs
└── Services
            |
            | injection / appels Prisma Client
            v
PrismaService
            |
            | DATABASE_URL
            v
PostgreSQL
```

Dans `docker-compose.yml`, ces unités correspondent aux services `frontend`, `backend` et `postgres`. Les deux applications peuvent aussi être lancées directement par les scripts pnpm.

## 3. Organisation des composants

| Composant | Emplacement | Rôle |
|---|---|---|
| Workspace pnpm | `pnpm-workspace.yaml` | Regroupe les paquets sous `apps/*` |
| Scripts racine | `package.json` | Coordonnent développement, builds, contrôles, tests, Prisma et Compose |
| Application frontend | `apps/frontend/` | Fournit les pages, composants React, sessions web et routes serveur |
| Pages App Router | `apps/frontend/app/` | Définissent les routes d'interface et leurs états de chargement ou d'erreur |
| Route Handlers frontend | `apps/frontend/app/api/` | Reçoivent les requêtes web côté serveur et les transmettent au backend |
| Composants frontend | `apps/frontend/components/` | Implémentent les interfaces par domaine fonctionnel |
| Bibliothèque frontend | `apps/frontend/lib/` | Regroupe accès API, sessions, erreurs, redirections et fonctions communes |
| Middleware frontend | `apps/frontend/middleware.ts` | Contrôle la présence de la session sur les routes configurées |
| Application backend | `apps/backend/src/` | Implémente l'API NestJS et les traitements métier |
| Module racine backend | `apps/backend/src/app.module.ts` | Charge la configuration, les gardes et les modules applicatifs |
| Bootstrap backend | `apps/backend/src/main.ts` | Configure et démarre le serveur HTTP |
| Modules backend | `apps/backend/src/modules/` | Organisent contrôleurs, services et DTO par domaine |
| Éléments communs backend | `apps/backend/src/common/` | Fournissent Prisma, sécurité, audit, temps, validations et utilitaires |
| Couche Prisma | `apps/backend/src/common/prisma/` | Expose `PrismaService` aux modules NestJS |
| Schéma de données | `apps/backend/prisma/schema.prisma` | Définit les modèles, énumérations, relations et la source PostgreSQL |
| Migrations | `apps/backend/prisma/migrations/` | Versionnent les modifications SQL du schéma |
| Seed | `apps/backend/prisma/seed.ts` | Charge explicitement les données définies par le script |
| PostgreSQL Compose | `docker-compose.yml` | Fournit le service de base de données et son volume nommé |
| Images applicatives | `docker/backend.Dockerfile`, `docker/frontend.Dockerfile` | Construisent et exécutent les deux applications |
| Scripts utilitaires | `scripts/` | Démarrent les applications, valident leur liaison et nettoient les artefacts Windows |
| Documentation | `documentation/`, `docs/` | Contient les guides et documents techniques du dépôt |

### Modules backend chargés

`AppModule` importe les modules suivants :

| Module | Rôle observé | Source |
|---|---|---|
| `AuditLogModule` | Service de journalisation des actions métier | `apps/backend/src/common/audit/` |
| `PrismaModule` | Mise à disposition globale de `PrismaService` | `apps/backend/src/common/prisma/` |
| `AuthModule` | Connexion, identité courante et gardes JWT/rôles | `apps/backend/src/modules/auth/` |
| `HealthModule` | Route publique de santé | `apps/backend/src/modules/health/` |
| `DashboardModule` | Agrégats du tableau de bord | `apps/backend/src/modules/dashboard/` |
| `EmployeesModule` | Gestion des employés | `apps/backend/src/modules/employees/` |
| `CalendarModule` | Calendrier mensuel et événements RH | `apps/backend/src/modules/calendar/` |
| `AttendanceModule` | Pointage, historique, sécurité et exports | `apps/backend/src/modules/attendance/` |
| `SanctionsModule` | Règles et calculs de sanctions | `apps/backend/src/modules/sanctions/` |
| `SchedulesModule` | Gestion des horaires | `apps/backend/src/modules/schedules/` |

## 4. Flux entre les composants

### 4.1 Requête applicative

```text
Page ou composant React
          |
          | requête vers /api/*
          v
Route Handler Next.js
          |
          | lecture éventuelle du cookie de session
          | fetchServerApi("/...")
          v
Contrôleur NestJS sous /api/v1
          |
          | DTO + gardes + délégation
          v
Service du module
          |
          | méthode Prisma Client
          v
PrismaService
          |
          | connexion définie par DATABASE_URL
          v
PostgreSQL
```

Les Route Handlers d'authentification créent ou suppriment les cookies de session. Les Route Handlers métier utilisent les fonctions communes de `apps/frontend/lib/api-route.ts` pour transmettre le jeton au backend, traiter les erreurs et renvoyer une réponse Next.js.

### 4.2 Configuration

```text
Fichiers .env* / variables du processus / Compose
                 |
        +--------+--------+
        |                 |
        v                 v
Next.js              ConfigModule NestJS
        |                 |
        |                 +--> validation Joi
        |                 +--> port, CORS, JWT, limites HTTP
        |                 +--> paramètres du pointage
        |                 |
        v                 v
API_BASE_URL         DATABASE_URL
NEXT_PUBLIC_*             |
        |                 v
        +--> API HTTP   Prisma
```

Le backend construit sa liste de fichiers d'environnement à partir de `NODE_ENV`, puis charge `.env.local` et `.env`. `ConfigModule` rend la configuration globale et applique un schéma Joi. Prisma lit `DATABASE_URL` dans `apps/backend/prisma.config.ts` et dans `schema.prisma`.

Le frontend résout l'origine serveur depuis `API_BASE_URL`, puis depuis les variables publiques prévues par `apps/frontend/lib/api.ts`. Les variables publiques sont également fournies comme arguments de build à l'image frontend.

### 4.3 Démarrage Compose

```text
postgres
   |
   | healthcheck pg_isready
   v
backend
   |
   | GET /api/v1/health
   v
frontend
   |
   | GET /api/health
   v
pile déclarée saine par service
```

Le profil `app` active le backend et le frontend. Le backend applique les migrations Prisma existantes avant `node dist/main.js`. Le frontend est construit avec Next.js puis démarré avec `next start`.

## 5. Organisation logique

### 5.1 Frontend

Le frontend est organisé en quatre couches observables :

1. `apps/frontend/app/` définit les pages, layouts, Route Handlers et états de rendu.
2. `apps/frontend/components/` regroupe les composants par domaine : administration, pointage, historique, authentification, calendrier, tableau de bord, employés, sanctions et horaires.
3. `apps/frontend/lib/` contient les types d'échange, la résolution des URL, les appels HTTP, les cookies de session, les redirections et la normalisation des erreurs.
4. `apps/frontend/middleware.ts` filtre les chemins déclarés dans son `matcher`.

Les pages serveur peuvent appeler les fonctions de la bibliothèque frontend. Les interactions du navigateur avec le backend passent par les Route Handlers présents sous `/api`.

### 5.2 Backend

Le backend suit l'organisation NestJS suivante :

```text
AppModule
   |
   +--> modules/<domaine>/*.module.ts
            |
            +--> contrôleur
            |      |
            |      +--> routes HTTP + DTO + décorateurs
            |
            +--> service
                   |
                   +--> règles métier + PrismaService
```

Les DTO se trouvent dans les répertoires `dto/` des modules concernés. Le `ValidationPipe` global transforme les valeurs, retire les propriétés non déclarées et rejette les propriétés interdites.

`AuthModule` enregistre `JwtAuthGuard` et `RolesGuard` comme gardes globaux. `AppModule` enregistre `AppThrottlerGuard`. Les décorateurs `Public`, `Roles` et `CurrentUser` portent les métadonnées utilisées par ces mécanismes.

### 5.3 Accès aux données

`PrismaModule` est annoté `@Global()`, fournit `PrismaService` et l'exporte. `PrismaService` étend `PrismaClient` et ferme le client dans `onModuleDestroy`.

Les services `AuthService`, `EmployeesService`, `SchedulesService`, `CalendarService`, `AttendanceService`, `AttendanceMonthlyMetricsService`, `MonthlyAttendanceExportService`, `DashboardService` et `SanctionsService` injectent directement `PrismaService`.

Le schéma Prisma contient cinq modèles : `Employee`, `Schedule`, `Attendance`, `CalendarEntry` et `SanctionRule`.

### 5.4 Dépendances internes entre modules

Les modules NestJS expriment aussi des relations internes :

- `AttendanceModule` importe `CalendarModule` et `SanctionsModule` ;
- `DashboardModule` importe `CalendarModule` ;
- `CalendarModule` importe `AuditLogModule` ;
- les services de données utilisent le `PrismaModule` global sans import local répété.

Ces relations sont déclarées dans les fichiers `*.module.ts` correspondants.

## 6. Technologies utilisées

| Technologie | Utilisation | Emplacement |
|---|---|---|
| TypeScript | Code des applications, tests, scripts et configurations | `apps/`, `scripts/` |
| Node.js | Exécution de Next.js, NestJS et des scripts | `package.json`, `docker/` |
| pnpm | Workspace, installation et orchestration des scripts | `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml` |
| Next.js 15 | Pages App Router, rendu serveur et Route Handlers | `apps/frontend/` |
| React 19 | Composants et interfaces frontend | `apps/frontend/components/`, `apps/frontend/app/` |
| Tailwind CSS 3 | Styles de l'interface | `apps/frontend/tailwind.config.ts`, `apps/frontend/app/globals.css` |
| NestJS 11 | Modules, injection, contrôleurs, gardes et serveur HTTP | `apps/backend/src/` |
| Express | Adaptateur HTTP NestJS et configuration du proxy | `apps/backend/src/main.ts` |
| Helmet | En-têtes de sécurité HTTP | `apps/backend/src/main.ts` |
| class-validator et class-transformer | Validation et transformation des DTO | `apps/backend/src/main.ts`, `apps/backend/src/modules/` |
| Joi | Validation des variables backend | `apps/backend/src/app.module.ts` |
| JWT | Jetons de session et authentification de l'API | `apps/backend/src/modules/auth/`, `apps/backend/src/common/security/jwt.util.ts` |
| Prisma 6 | Client de données, schéma, migrations et seed | `apps/backend/prisma/`, `apps/backend/src/common/prisma/` |
| PostgreSQL 16 | Persistance relationnelle dans la configuration Compose | `docker-compose.yml`, `apps/backend/prisma/schema.prisma` |
| Jest et Supertest | Tests e2e de l'API | `apps/backend/test/` |
| Docker | Images de production des applications | `docker/backend.Dockerfile`, `docker/frontend.Dockerfile` |
| Docker Compose | Orchestration locale des trois services | `docker-compose.yml` |
| Puppeteer | Moteur disponible pour le rendu PDF des exports | `apps/backend/src/modules/attendance/exports/` |

## 7. Traçabilité

| Élément architectural | Fichier ou répertoire source | Preuve observée |
|---|---|---|
| Structure du monorepo | `pnpm-workspace.yaml` | Workspace limité à `apps/*` |
| Orchestration racine | `package.json` | Scripts appelant séparément les deux applications |
| Architecture frontend | `apps/frontend/app/`, `apps/frontend/components/`, `apps/frontend/lib/` | Pages, composants, Route Handlers et bibliothèque partagée |
| Routes protégées frontend | `apps/frontend/middleware.ts` | Matcher et contrôle du cookie de session |
| Configuration Next.js | `apps/frontend/next.config.ts` | Configuration active du framework |
| Résolution de l'API | `apps/frontend/lib/api.ts` | Lecture des variables et appels serveur |
| Relais HTTP frontend | `apps/frontend/lib/api-route.ts` | Transmission des requêtes et réponses |
| Cookies d'authentification | `apps/frontend/lib/auth-session.ts` | Noms, création et suppression des sessions |
| Bootstrap NestJS | `apps/backend/src/main.ts` | Serveur, préfixe, CORS, sécurité et validation |
| Composition NestJS | `apps/backend/src/app.module.ts` | Imports des modules et garde de limitation |
| Modules métier | `apps/backend/src/modules/` | Contrôleurs, services et DTO |
| Gardes d'authentification | `apps/backend/src/modules/auth/auth.module.ts` | Enregistrement global des gardes |
| Accès aux données | `apps/backend/src/common/prisma/prisma.module.ts`, `apps/backend/src/common/prisma/prisma.service.ts` | Module global et extension de Prisma Client |
| Modèle de données | `apps/backend/prisma/schema.prisma` | Modèles, relations, énumérations et PostgreSQL |
| Cycle Prisma | `apps/backend/prisma.config.ts` | Chemins du schéma, des migrations et du seed |
| Migrations | `apps/backend/prisma/migrations/` | Scripts SQL versionnés |
| Services Docker | `docker-compose.yml` | Services, ports, variables, healthchecks et dépendances |
| Build backend | `docker/backend.Dockerfile` | Installation, génération Prisma, build et démarrage |
| Build frontend | `docker/frontend.Dockerfile` | Installation, variables de build, build et démarrage |
| Développement conjoint | `scripts/dev.mjs` | Deux processus applicatifs et propagation des signaux |
| Validation de liaison | `scripts/validate-proxy.mjs` | Appels de santé et redirection vers `/attendance-entry` |
| Description racine | `README.md` | Scripts et organisation générale publiés |
| Présentation technique | `documentation/06-Developer-Guide/01-Presentation-technique-du-projet.md` | Inventaire technique initial du Developer Guide |

## 8. Observations

- Le monorepo contient deux paquets applicatifs et un fichier de verrouillage commun.
- Les applications frontend et backend sont construites et exécutées comme deux processus distincts.
- Le navigateur n'accède pas directement à PostgreSQL.
- Les Route Handlers Next.js constituent la couche serveur du frontend pour les échanges API implémentés.
- Le backend expose un préfixe HTTP unique `/api/v1`.
- Les couches contrôleur et service sont séparées dans chaque module NestJS disposant d'une API.
- Prisma constitue l'unique couche d'accès relationnel déclarée dans le backend.
- `PrismaModule` rend `PrismaService` disponible globalement.
- Les modèles Prisma et les modules NestJS ne suivent pas une correspondance un-à-un : plusieurs modules utilisent les mêmes modèles.
- La configuration backend est centralisée dans `ConfigModule` et validée avant le démarrage.
- Compose encode un ordre de disponibilité PostgreSQL, backend, puis frontend.
- Les scripts racine orchestrent directement pnpm et Node.js ; aucun orchestrateur de build supplémentaire n'est configuré.
