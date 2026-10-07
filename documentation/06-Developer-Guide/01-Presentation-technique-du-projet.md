# Developer Guide — Présentation technique du projet

| Métadonnée | Valeur |
|---|---|
| Document ID | DG-001 |
| Titre | Présentation technique du projet |
| Version | 1.0 |
| Statut | Validé |
| Classification | Interne |
| Référence | Developer Guide |
| Projet | Konatech Pointage |

## 1. Présentation

Konatech Pointage est une application web de gestion des présences structurée en monorepo pnpm. Le dépôt contient un frontend Next.js, une API NestJS et une couche de persistance Prisma reliée à PostgreSQL.

L'implémentation couvre l'authentification, les employés, les horaires, les pointages, le calendrier RH, le tableau de bord, les sanctions et les exports mensuels de présence. Le parcours de pointage dédié utilise la route frontend `/attendance-entry`, une session d'entrée distincte et les traitements du module backend `attendance`.

Les applications possèdent des scripts communs de développement, construction, contrôle TypeScript, lint, tests et validation. PostgreSQL seul ou la pile complète peuvent également être exécutés à partir de `docker-compose.yml`.

## 2. Objectif technique

Le dépôt met en œuvre les objectifs techniques suivants, directement observables dans le code :

- fournir une interface web rendue avec Next.js App Router ;
- exposer une API HTTP NestJS sous le préfixe `/api/v1` ;
- isoler les traitements backend dans des modules, contrôleurs et services ;
- valider les entrées de l'API au moyen de DTO et d'un `ValidationPipe` global ;
- authentifier les utilisateurs avec des jetons JWT et appliquer des contrôles de rôle ;
- centraliser l'accès à PostgreSQL avec `PrismaService` et Prisma Client ;
- versionner le schéma de données par des migrations Prisma ;
- relayer les appels du navigateur vers le backend par des Route Handlers Next.js ;
- exécuter des tests e2e backend et un contrôle de connexion frontend/backend ;
- permettre la construction et l'exécution conteneurisées du frontend, du backend et de PostgreSQL.

Ces objectifs correspondent aux mécanismes présents dans `apps/frontend`, `apps/backend`, les scripts racine et les fichiers Docker.

## 3. Vue d'ensemble

Le navigateur accède aux pages Next.js et aux routes `/api/*` du frontend. Les Route Handlers utilisent les fonctions de `apps/frontend/lib/api.ts` pour appeler l'API NestJS. Le backend traite les requêtes dans ses contrôleurs et services, puis accède aux données par `PrismaService`. Prisma Client utilise la connexion PostgreSQL fournie par `DATABASE_URL`.

```text
Navigateur
    |
    | HTTP
    v
Frontend Next.js
Pages App Router + Route Handlers
    |
    | HTTP vers /api/v1
    v
Backend NestJS
Contrôleurs -> Services
    |
    | appels Prisma Client
    v
PrismaService
    |
    | connexion DATABASE_URL
    v
PostgreSQL
```

Dans la configuration Compose avec le profil `app`, PostgreSQL, le backend et le frontend sont trois services distincts. Le frontend attend que le backend soit sain ; le backend attend que PostgreSQL soit sain.

## 4. Organisation générale

| Zone | Contenu observé | Responsabilité technique | Références |
|---|---|---|---|
| Frontend | Application Next.js App Router | Pages, composants React, sessions par cookies, routes serveur et appels vers l'API | `apps/frontend/app/`, `apps/frontend/components/`, `apps/frontend/lib/`, `apps/frontend/middleware.ts` |
| Backend | Application NestJS modulaire | API HTTP, authentification, validation, règles métier et orchestration des données | `apps/backend/src/main.ts`, `apps/backend/src/app.module.ts`, `apps/backend/src/modules/` |
| Base de données | PostgreSQL et modèles Prisma | Persistance des employés, horaires, présences, événements de calendrier et règles de sanction | `apps/backend/prisma/schema.prisma`, `apps/backend/prisma/migrations/` |
| Configuration | Variables d'environnement et configurations des outils | Configuration NestJS, Next.js, Prisma, TypeScript, pnpm et conteneurs | `apps/backend/src/app.module.ts`, `apps/frontend/next.config.ts`, `apps/backend/prisma.config.ts`, `pnpm-workspace.yaml`, `docker-compose.yml` |
| Documentation | Guides et documents techniques | Architecture, installation, développement, exploitation et utilisation | `documentation/`, `docs/`, `README.md` |

### Frontend

Le frontend utilise le répertoire `app/` pour les pages et les Route Handlers. Les pages présentes couvrent notamment l'accueil, la connexion, l'entrée de pointage, la présence personnelle, l'historique, les employés, les horaires, le calendrier, les sanctions et les exports. Les composants sont répartis par domaine dans `apps/frontend/components/`.

### Backend

`AppModule` charge les modules `AuditLogModule`, `PrismaModule`, `AuthModule`, `HealthModule`, `DashboardModule`, `EmployeesModule`, `CalendarModule`, `AttendanceModule`, `SanctionsModule` et `SchedulesModule`. Le point d'entrée `apps/backend/src/main.ts` configure le préfixe API, CORS, Helmet, la taille des corps HTTP et la validation globale.

### Base de données

Le schéma Prisma déclare les modèles `Employee`, `Schedule`, `Attendance`, `CalendarEntry` et `SanctionRule`. Le fournisseur de données est PostgreSQL et la connexion est lue depuis `DATABASE_URL`. Le dépôt contient le seed et les migrations SQL versionnées.

### Configuration

Le backend charge les fichiers d'environnement selon `NODE_ENV`, puis `.env.local` et `.env`. Un schéma Joi valide la configuration au démarrage. Le frontend lit ses origines publiques et serveur dans sa couche d'accès API. Compose injecte les variables nécessaires aux trois services.

### Documentation

Le répertoire `documentation/` est organisé en ensembles consacrés à l'architecture, à l'exploitation, à l'utilisation, à l'installation et au développement. Le répertoire `docs/` contient notamment l'architecture synthétique, l'état du projet, le registre des modules et la liste de contrôle de publication.

## 5. Architecture générale

### 5.1 Relations à l'exécution

```text
                         pnpm workspace
                               |
                 +-------------+-------------+
                 |                           |
                 v                           v
        apps/frontend                  apps/backend
        Next.js / React                NestJS
                 |                           |
                 | Route Handlers            | modules métier
                 +---------- HTTP ---------->|
                                             |
                                             v
                                      PrismaModule
                                      PrismaService
                                             |
                                             v
                                        PostgreSQL
```

Le frontend et le backend restent deux paquets séparés. Le script racine `dev` démarre leurs serveurs dans deux processus enfants. Le script racine `build` construit le backend puis le frontend.

### 5.2 Structure backend

Les requêtes reçues sous `/api/v1` sont routées vers les contrôleurs NestJS. Les contrôleurs délèguent les traitements aux services de leur module. Les services qui utilisent les données injectent `PrismaService`, exporté globalement par `PrismaModule`.

Les gardes globaux configurés par les modules d'authentification et par `AppModule` appliquent l'authentification JWT, les rôles et la limitation de requêtes. Les routes marquées `@Public()` contournent le contrôle JWT, notamment la santé et les points de connexion.

### 5.3 Structure frontend

Les pages App Router assemblent les composants de domaine. Les Route Handlers de `apps/frontend/app/api/` assurent la partie serveur des échanges avec NestJS. Les fonctions de `apps/frontend/lib/` regroupent la résolution de l'URL backend, les sessions d'authentification, les réponses d'erreur et les redirections.

`apps/frontend/middleware.ts` protège l'accueil ainsi que les chemins `/my-attendance`, `/employees` et `/schedules` par la présence du cookie de session configuré.

### 5.4 Persistance

`PrismaService` étend `PrismaClient`. Il est fourni par `PrismaModule`, qui est déclaré global. Le schéma, les migrations et le seed se trouvent dans `apps/backend/prisma/`. La configuration `apps/backend/prisma.config.ts` associe Prisma à ce schéma, au répertoire de migrations, au seed et à `DATABASE_URL`.

## 6. Technologies principales

| Technologie | Rôle | Emplacement |
|---|---|---|
| TypeScript | Langage du frontend, du backend, des scripts et de la configuration | `apps/frontend/`, `apps/backend/`, `scripts/` |
| pnpm 10 | Gestion des dépendances et scripts du monorepo | `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml` |
| Node.js | Environnement d'exécution des applications et scripts | `package.json`, `docker/backend.Dockerfile`, `docker/frontend.Dockerfile` |
| Next.js 15 | Framework frontend avec App Router et Route Handlers | `apps/frontend/package.json`, `apps/frontend/app/` |
| React 19 | Construction des interfaces du frontend | `apps/frontend/package.json`, `apps/frontend/components/` |
| Tailwind CSS 3 | Styles utilitaires du frontend | `apps/frontend/package.json`, `apps/frontend/tailwind.config.ts`, `apps/frontend/app/globals.css` |
| NestJS 11 | Framework de l'API backend | `apps/backend/package.json`, `apps/backend/src/` |
| Prisma 6 | Modélisation, migrations et accès aux données | `apps/backend/package.json`, `apps/backend/prisma/`, `apps/backend/src/common/prisma/` |
| PostgreSQL 16 Alpine | Moteur relationnel de la configuration Compose | `docker-compose.yml` |
| Joi | Validation de la configuration backend | `apps/backend/package.json`, `apps/backend/src/app.module.ts` |
| class-validator | Validation des DTO backend | `apps/backend/package.json`, `apps/backend/src/modules/` |
| Jest et Supertest | Tests e2e de l'API | `apps/backend/package.json`, `apps/backend/test/` |
| ESLint | Analyse statique du monorepo | `package.json`, `eslint.config.mjs` |
| Prettier | Formatage et contrôle du format | `package.json`, `.prettierrc.json` |
| Docker et Docker Compose | Construction et exécution des trois services configurés | `docker/`, `docker-compose.yml` |
| Puppeteer | Rendu PDF disponible pour les exports mensuels | `apps/backend/package.json`, `apps/backend/src/modules/attendance/exports/` |

## 7. Organisation du dépôt

```text
konatech-pointage/
├── apps/
│   ├── backend/
│   │   ├── prisma/
│   │   │   ├── migrations/
│   │   │   ├── schema.prisma
│   │   │   └── seed.ts
│   │   ├── scripts/
│   │   ├── src/
│   │   │   ├── common/
│   │   │   └── modules/
│   │   └── test/
│   └── frontend/
│       ├── app/
│       │   └── api/
│       ├── components/
│       ├── lib/
│       ├── public/
│       └── types/
├── docker/
├── docs/
├── documentation/
├── scripts/
├── docker-compose.yml
├── package.json
├── pnpm-lock.yaml
└── pnpm-workspace.yaml
```

| Chemin | Contenu principal |
|---|---|
| `apps/backend/src/common/` | Prisma, sécurité, audit, temps, validations et utilitaires partagés |
| `apps/backend/src/modules/` | Modules fonctionnels NestJS |
| `apps/backend/prisma/` | Schéma, migrations et seed |
| `apps/backend/scripts/` | Création initiale d'administrateur et traitements de reprise de données |
| `apps/backend/test/` | Tests e2e et préparation de la base de test |
| `apps/frontend/app/` | Pages, layouts, états d'erreur et Route Handlers |
| `apps/frontend/components/` | Composants React regroupés par domaine |
| `apps/frontend/lib/` | API, sessions, redirections, erreurs et fonctions communes |
| `apps/frontend/public/` | Images et icônes statiques |
| `docker/` | Dockerfiles du backend et du frontend |
| `scripts/` | Orchestration du développement, validation du proxy et nettoyage Windows |
| `documentation/` | Documentation structurée du projet |
| `docs/` | Documents techniques transverses |

## 8. Traçabilité

| Élément documenté | Fichier ou répertoire source | Preuve observée |
|---|---|---|
| Nature du projet | `README.md` | Présentation du monorepo et des applications |
| Espace de travail | `pnpm-workspace.yaml` | Déclaration de `apps/*` |
| Scripts transverses | `package.json` | Développement, builds, tests, Prisma et Compose |
| Dépendances backend | `apps/backend/package.json` | NestJS, Prisma, validation, sécurité et tests |
| Dépendances frontend | `apps/frontend/package.json` | Next.js, React et Tailwind CSS |
| Bootstrap de l'API | `apps/backend/src/main.ts` | Création NestJS, préfixe, CORS et validation |
| Composition backend | `apps/backend/src/app.module.ts` | Modules chargés et configuration globale |
| Modules fonctionnels | `apps/backend/src/modules/` | Contrôleurs et services par domaine |
| Accès aux données | `apps/backend/src/common/prisma/prisma.service.ts` | Extension de Prisma Client |
| Module Prisma | `apps/backend/src/common/prisma/prisma.module.ts` | Fourniture globale de `PrismaService` |
| Modèle relationnel | `apps/backend/prisma/schema.prisma` | PostgreSQL, modèles et relations |
| Historique de données | `apps/backend/prisma/migrations/` | Migrations SQL versionnées |
| Configuration Prisma | `apps/backend/prisma.config.ts` | Schéma, migrations, seed et URL de connexion |
| Pages frontend | `apps/frontend/app/` | Routes App Router réellement présentes |
| API frontend | `apps/frontend/app/api/` | Route Handlers vers le backend |
| Accès API | `apps/frontend/lib/api.ts` | Résolution d'URL et fonctions HTTP |
| Sessions frontend | `apps/frontend/lib/auth-session.ts` | Cookies de session et jetons |
| Protection de routes | `apps/frontend/middleware.ts` | Chemins filtrés et redirection vers `/login` |
| Configuration Next.js | `apps/frontend/next.config.ts` | Mode strict React et comportement du build |
| Développement conjoint | `scripts/dev.mjs` | Démarrage des deux applications |
| Test de connexion | `scripts/validate-proxy.mjs` | Santé frontend/backend et redirection de pointage |
| Tests backend | `apps/backend/test/` | Scénarios e2e et base de test |
| Services conteneurisés | `docker-compose.yml` | PostgreSQL, backend, frontend et dépendances de santé |
| Images applicatives | `docker/backend.Dockerfile`, `docker/frontend.Dockerfile` | Builds et commandes d'exécution |
| Documentation technique | `documentation/`, `docs/` | Guides et documents présents |

## 9. Observations

- Le dépôt est un workspace pnpm contenant deux applications sous `apps/`.
- Aucun fichier `turbo.json` n'est présent ; les scripts racine orchestrent directement les deux applications avec pnpm et Node.js.
- Le frontend et le backend possèdent des manifestes, configurations TypeScript et cycles de build distincts.
- Le frontend utilise App Router et contient à la fois des pages et des Route Handlers serveur.
- Le backend regroupe les fonctions métier dans des modules NestJS séparés.
- Les contrôleurs backend délèguent les traitements aux services de leurs modules.
- L'accès relationnel est centralisé par le module Prisma commun.
- PostgreSQL est l'unique fournisseur déclaré dans le schéma Prisma.
- Les migrations et le seed sont conservés avec le code backend.
- La configuration Compose sépare PostgreSQL, le backend et le frontend.
- Les scripts racine couvrent le développement conjoint, les builds, les contrôles et les opérations Prisma.
- La connexion frontend/backend fait l'objet d'un script de validation distinct des tests e2e backend.
