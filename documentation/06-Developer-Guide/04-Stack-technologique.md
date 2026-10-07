# Developer Guide — Stack technologique

| Métadonnée | Valeur |
|---|---|
| Document ID | DG-004 |
| Titre | Stack technologique |
| Version | 1.0 |
| Statut | Validé |
| Classification | Interne |
| Référence | Developer Guide |
| Projet | Konatech Pointage |

## 1. Présentation

Ce chapitre recense les technologies effectivement déclarées et utilisées dans le dépôt Konatech Pointage. Il distingue la stack frontend, la stack backend, la couche de données et les outils de développement.

Les versions précédées de `^` correspondent aux plages déclarées dans les fichiers `package.json`. Les versions d'images correspondent aux références inscrites dans les Dockerfiles ou dans `docker-compose.yml`. `pnpm-lock.yaml` conserve les résolutions installables du workspace.

## 2. Vue d'ensemble de la stack

Le projet s'exécute sur Node.js et regroupe deux applications TypeScript dans un workspace pnpm. Next.js et React composent le frontend. NestJS fournit l'API HTTP. Prisma Client relie le backend à PostgreSQL. Docker et Docker Compose fournissent les images et l'assemblage conteneurisé présents dans le dépôt.

```text
                    Workspace pnpm
                         |
              TypeScript + Node.js
                         |
             +-----------+-----------+
             |                       |
             v                       v
      Next.js 15                 NestJS 11
      React 19                   API HTTP
      Tailwind CSS 3             Validation + JWT
             |                       |
             | requêtes HTTP         v
             +----------------> Prisma 6
                                     |
                                     v
                              PostgreSQL 16

      ESLint + Prettier + Jest + Docker
       outils communs de contrôle et d'exécution
```

Les relations du diagramme sont matérialisées par les Route Handlers frontend, les contrôleurs et services backend, `PrismaService`, le schéma Prisma et la configuration Compose.

## 3. Technologies du Frontend

| Technologie | Version observée | Utilisation |
|---|---:|---|
| Next.js | `^15.5.18` | App Router, pages, layouts, Route Handlers, middleware et build frontend |
| React | `^19.0.0` | Composants et rendu de l'interface |
| React DOM | `^19.0.0` | Intégration du rendu React dans l'application Next.js |
| TypeScript | `^5.8.2` | Pages, composants, bibliothèque, types et configurations |
| Tailwind CSS | `^3.4.17` | Classes utilitaires et thème de l'interface |
| PostCSS | `^8.5.10` | Traitement CSS configuré pour Tailwind CSS |
| Autoprefixer | `^10.4.20` | Plugin PostCSS de préfixage CSS |
| QRCode | `^1.5.4` | Génération du QR Code affiché dans le tableau de bord |
| class-variance-authority | `^0.7.1` | Variantes de styles des composants d'interface |
| clsx | `^2.1.1` | Composition conditionnelle de noms de classes |
| tailwind-merge | `^2.5.5` | Fusion de classes Tailwind dans l'utilitaire `cn` |
| `@types/node` | `^22.13.5` | Types Node.js utilisés par TypeScript |
| `@types/react` | `^19.0.10` | Types React |
| `@types/react-dom` | `^19.0.4` | Types React DOM |

Les dépendances et versions de ce tableau proviennent de `apps/frontend/package.json`. Leur utilisation est visible dans `apps/frontend/app/`, `apps/frontend/components/`, `apps/frontend/lib/`, `tailwind.config.ts` et `postcss.config.js`.

### Configuration frontend

| Élément | Technologie associée | Source |
|---|---|---|
| App Router | Next.js | `apps/frontend/app/` |
| Mode strict React | React et Next.js | `apps/frontend/next.config.ts` |
| Alias `@/*` | TypeScript | `apps/frontend/tsconfig.json` |
| Thème et chemins de contenu | Tailwind CSS | `apps/frontend/tailwind.config.ts` |
| Chaîne CSS | PostCSS, Tailwind CSS et Autoprefixer | `apps/frontend/postcss.config.js` |
| Déclarations QRCode | TypeScript | `apps/frontend/types/qrcode.d.ts` |

## 4. Technologies du Backend

| Technologie | Version observée | Utilisation |
|---|---:|---|
| NestJS Common | `^11.0.0` | Décorateurs, modules, contrôleurs, services, exceptions et validation globale |
| NestJS Core | `^11.0.0` | Création de l'application et injection de dépendances |
| NestJS Platform Express | `^11.0.0` | Adaptateur HTTP Express |
| NestJS Config | `^4.0.0` | Chargement global et accès aux variables d'environnement |
| NestJS Throttler | `^6.5.0` | Limitation des requêtes globale et ciblée |
| NestJS Mapped Types | `^2.1.0` | Construction de DTO à partir de types existants |
| Prisma Client | `^6.0.0` | Requêtes relationnelles depuis les services |
| class-validator | `^0.14.1` | Contraintes déclarées dans les DTO |
| class-transformer | `^0.5.1` | Transformation des entrées par `ValidationPipe` |
| Joi | `^17.13.3` | Validation de la configuration au démarrage |
| Helmet | `^8.1.0` | En-têtes HTTP de sécurité |
| body-parser | `^2.2.2` | Limites et traitement des corps JSON et URL-encoded |
| RxJS | `^7.8.1` | Dépendance réactive de NestJS |
| reflect-metadata | `^0.2.2` | Métadonnées utilisées par les décorateurs et l'injection |
| dotenv | `^17.4.1` | Chargement d'environnement par la configuration Prisma |
| Puppeteer | `^24.43.1` | Rendu PDF Chromium pour les exports mensuels |
| TypeScript | `^5.8.2` | Code backend, scripts, tests et configurations |
| NestJS CLI | `^11.0.0` | Développement et build NestJS |
| Jest | `^29.7.0` | Exécution des tests e2e |
| Supertest | `^7.0.0` | Requêtes HTTP dans les tests e2e |
| ts-jest | `^29.2.5` | Transformation TypeScript pour Jest |
| ts-node | `^10.9.2` | Exécution TypeScript du seed et des scripts backend |
| tsconfig-paths | `^4.2.0` | Résolution de chemins TypeScript dans l'environnement backend |

Les versions sont issues de `apps/backend/package.json`. NestJS est démarré dans `apps/backend/src/main.ts`. La composition des modules se trouve dans `apps/backend/src/app.module.ts`.

### Configuration backend

| Élément | Technologie associée | Source |
|---|---|---|
| Bootstrap et serveur HTTP | NestJS et Platform Express | `apps/backend/src/main.ts` |
| Modules et injection | NestJS | `apps/backend/src/app.module.ts`, `apps/backend/src/modules/` |
| Validation HTTP | NestJS, class-validator et class-transformer | `apps/backend/src/main.ts`, répertoires `dto/` |
| Validation d'environnement | NestJS Config et Joi | `apps/backend/src/app.module.ts` |
| Limitation de requêtes | NestJS Throttler | `apps/backend/src/common/security/app-throttler.guard.ts` |
| Export PDF | Puppeteer et Chromium | `apps/backend/src/modules/attendance/exports/monthly-attendance-puppeteer-pdf-renderer.service.ts`, `docker/backend.Dockerfile` |
| Build | NestJS CLI et TypeScript | `apps/backend/nest-cli.json`, `apps/backend/tsconfig.build.json` |

## 5. Technologies de la couche données

| Technologie ou mécanisme | Version observée | Fonction | Source |
|---|---:|---|---|
| PostgreSQL | Image `postgres:16-alpine` | Moteur relationnel du service Compose | `docker-compose.yml` |
| Prisma CLI | `^6.0.0` | Génération du client et gestion des migrations | `apps/backend/package.json`, `package.json` |
| Prisma Client | `^6.0.0` | Accès aux modèles depuis NestJS | `apps/backend/package.json`, `apps/backend/src/common/prisma/prisma.service.ts` |
| Schéma Prisma | Syntaxe Prisma 6 déclarée | Modèles, énumérations, relations et datasource PostgreSQL | `apps/backend/prisma/schema.prisma` |
| Prisma Migrate | CLI Prisma `^6.0.0` | Migrations de développement, statut et déploiement | `package.json`, `apps/backend/prisma/migrations/` |
| Prisma Generate | CLI Prisma `^6.0.0` | Génération de Prisma Client | `package.json`, `docker/backend.Dockerfile` |
| Seed Prisma | ts-node `^10.9.2` | Exécution du fichier TypeScript de seed | `apps/backend/prisma.config.ts`, `apps/backend/prisma/seed.ts` |

Le générateur du schéma utilise `prisma-client-js` avec les cibles binaires `native` et `debian-openssl-3.0.x`. La datasource `db` utilise le fournisseur `postgresql` et la variable `DATABASE_URL`.

`PrismaModule` est global dans NestJS. Il fournit `PrismaService`, classe qui étend `PrismaClient` et appelle `$disconnect()` lors de la destruction du module.

Les scripts racine disponibles sont :

```text
prisma:generate
prisma:status
prisma:migrate
prisma:migrate:deploy
prisma:seed
```

## 6. Outils de développement

| Outil | Version observée | Utilisation | Source |
|---|---:|---|---|
| Node.js | `22.11.0` dans `.nvmrc`; plage `>=20.9.0 <23` | Runtime des applications et scripts | `.nvmrc`, `package.json` |
| Image Node.js | `node:22-bookworm-slim` | Base des images backend et frontend | `docker/backend.Dockerfile`, `docker/frontend.Dockerfile` |
| pnpm | `10.26.0`; moteur `>=10.0.0` | Installation, workspace et scripts | `package.json`, `pnpm-workspace.yaml` |
| ESLint | `^10.4.0` | Analyse statique du workspace | `package.json`, `eslint.config.mjs` |
| `@eslint/js` | `^10.0.1` | Règles JavaScript recommandées | `package.json`, `eslint.config.mjs` |
| typescript-eslint | `^8.59.0` | Analyse des fichiers TypeScript | `package.json`, `eslint.config.mjs` |
| ESLint plugin Next.js | `^16.2.4` | Règles Next.js et Core Web Vitals | `package.json`, `eslint.config.mjs` |
| eslint-config-prettier | `^10.1.8` | Désactivation des règles ESLint incompatibles avec Prettier | `package.json`, `eslint.config.mjs` |
| Prettier | `^3.8.3` | Écriture et contrôle du format | `package.json`, `.prettierrc.json` |
| TypeScript | `^5.8.2` dans les applications | Vérification des types et compilation | `apps/frontend/package.json`, `apps/backend/package.json` |
| Docker | Version non fixée dans le dépôt | Construction des images applicatives | `docker/` |
| Docker Compose | Version non fixée dans le dépôt | Exécution de PostgreSQL ou de la pile `app` | `docker-compose.yml`, `package.json` |
| PowerShell | Version non fixée dans le dépôt | Exécution du nettoyage Windows | `scripts/clean-windows.ps1`, `package.json` |
| Node.js Child Process | API intégrée à Node.js | Démarrage conjoint et validation du proxy | `scripts/dev.mjs`, `scripts/validate-proxy.mjs` |

### Scripts de qualité et de build

| Catégorie | Scripts réellement définis | Technologie appelée |
|---|---|---|
| Formatage | `format`, `format:check` | Prettier |
| Lint | `lint`, `lint:fix` | ESLint |
| Types | `typecheck`, `typecheck:backend`, `typecheck:frontend` | TypeScript |
| Build | `build`, `build:backend`, `build:frontend` | NestJS CLI et Next.js |
| Tests | `test`, `test:backend`, `test:proxy` | Jest, Supertest, Node.js, NestJS et Next.js |
| Validation | `check`, `validate`, `validate:backend`, `validate:frontend` | Chaînes des outils précédents |
| Développement | `dev`, `dev:backend`, `dev:frontend` | Node.js, NestJS CLI et Next.js |
| Données | `prisma:generate`, `prisma:status`, `prisma:migrate`, `prisma:migrate:deploy`, `prisma:seed` | Prisma CLI |
| Conteneurs | `db:up`, `db:status`, `db:down` | Docker Compose |
| Nettoyage Windows | `clean:windows`, `clean:windows:dev`, `clean:windows:prisma` | PowerShell |

## 7. Relations entre les technologies

```text
pnpm workspace
├── package frontend
│   ├── TypeScript
│   ├── Next.js
│   │   ├── React + React DOM
│   │   ├── App Router
│   │   └── Route Handlers
│   ├── Tailwind CSS
│   │   └── PostCSS + Autoprefixer
│   └── clsx + tailwind-merge + class-variance-authority
│
└── package backend
    ├── TypeScript
    ├── NestJS
    │   ├── Platform Express
    │   ├── Config + Joi
    │   ├── ValidationPipe
    │   │   └── class-validator + class-transformer
    │   └── Throttler
    ├── Prisma Client
    │   └── PostgreSQL
    └── Jest + Supertest

Docker Compose
├── postgres:16-alpine
├── backend: node:22-bookworm-slim + Chromium
└── frontend: node:22-bookworm-slim
```

À l'exécution, les Route Handlers Next.js appellent l'API NestJS par HTTP. Les services NestJS utilisent Prisma Client. Prisma Client établit la connexion PostgreSQL. Dans l'image backend, Chromium est installé pour le renderer Puppeteer.

## 8. Traçabilité

| Technologie documentée | Fichier ou répertoire source | Preuve observée |
|---|---|---|
| Versions racine | `package.json` | pnpm, moteurs Node.js et outils transverses |
| Résolutions | `pnpm-lock.yaml` | Versions résolues du workspace |
| Workspace pnpm | `pnpm-workspace.yaml` | Paquets et configuration pnpm |
| Stack frontend | `apps/frontend/package.json` | Dépendances et versions déclarées |
| Next.js | `apps/frontend/app/`, `apps/frontend/next.config.ts` | App Router et configuration |
| React | `apps/frontend/app/`, `apps/frontend/components/` | Pages et composants |
| Tailwind CSS | `apps/frontend/tailwind.config.ts`, `apps/frontend/app/globals.css` | Thème, sources et styles |
| PostCSS et Autoprefixer | `apps/frontend/postcss.config.js` | Plugins activés |
| QRCode | `apps/frontend/components/dashboard/attendance-entry-qr-card.tsx` | Import et génération de QR Code |
| Utilitaires CSS | `apps/frontend/lib/utils.ts`, `apps/frontend/components/ui/` | Usage de `clsx`, `tailwind-merge` et variantes |
| Stack backend | `apps/backend/package.json` | Dépendances et versions déclarées |
| NestJS | `apps/backend/src/main.ts`, `apps/backend/src/app.module.ts` | Bootstrap, modules et injection |
| Configuration et Joi | `apps/backend/src/app.module.ts` | `ConfigModule` et schéma de validation |
| Validation DTO | `apps/backend/src/main.ts`, `apps/backend/src/modules/` | Pipe global et décorateurs |
| Throttling | `apps/backend/src/common/security/app-throttler.guard.ts` | Garde de limitation |
| Helmet et body-parser | `apps/backend/src/main.ts` | Middlewares activés |
| Puppeteer | `apps/backend/src/modules/attendance/exports/monthly-attendance-puppeteer-pdf-renderer.service.ts` | Renderer PDF |
| Jest et Supertest | `apps/backend/test/`, `apps/backend/test/jest-e2e.json` | Tests HTTP e2e |
| Prisma | `apps/backend/prisma.config.ts`, `apps/backend/prisma/schema.prisma` | CLI, client, datasource et générateur |
| PrismaService | `apps/backend/src/common/prisma/prisma.service.ts` | Extension de `PrismaClient` |
| Migrations | `apps/backend/prisma/migrations/` | Migrations SQL versionnées |
| Seed | `apps/backend/prisma/seed.ts` | Script d'initialisation des données |
| PostgreSQL | `docker-compose.yml` | Image `postgres:16-alpine` |
| Images Node.js | `docker/backend.Dockerfile`, `docker/frontend.Dockerfile` | Base `node:22-bookworm-slim` |
| Chromium | `docker/backend.Dockerfile` | Package installé dans l'image backend |
| ESLint | `eslint.config.mjs` | Plugins, configurations et règles actives |
| Prettier | `.prettierrc.json`, `.prettierignore` | Options et exclusions |
| Scripts utilitaires | `scripts/dev.mjs`, `scripts/validate-proxy.mjs`, `scripts/clean-windows.ps1` | Node.js et PowerShell |
| Description technique | `README.md` | Stack et commandes publiées |
| Architecture | `documentation/06-Developer-Guide/02-Architecture-generale.md` | Relations entre les composants |

## 9. Observations

- Les applications frontend et backend utilisent toutes deux TypeScript `^5.8.2`.
- Node.js `22.11.0` est inscrit dans `.nvmrc`, tandis que le moteur du manifeste accepte les versions `>=20.9.0 <23`.
- Les deux Dockerfiles utilisent la même image de base Node.js 22.
- Les bibliothèques frontend et backend sont déclarées dans deux manifestes distincts.
- Les outils ESLint et Prettier sont déclarés uniquement dans le manifeste racine.
- Le plugin ESLint Next.js déclaré à la racine est en version `^16.2.4`, alors que l'application dépend de Next.js `^15.5.18`.
- La configuration Next.js ignore ESLint pendant son build ; le script racine `lint` reste une commande séparée.
- Prisma CLI et Prisma Client utilisent la même plage majeure `^6.0.0`.
- PostgreSQL est fixé à la variante d'image `16-alpine` dans Compose.
- Docker, Docker Compose et PowerShell sont appelés par les fichiers du dépôt sans version déclarée.
- Aucun package de monorepo autre que `apps/backend` et `apps/frontend` n'est déclaré.
