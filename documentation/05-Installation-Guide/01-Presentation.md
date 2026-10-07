# Présentation

| Métadonnée | Valeur |
| --- | --- |
| Document ID | IG-001 |
| Titre | Présentation |
| Version | 1.0 |
| Statut | Validé |
| Classification | Interne |
| Référence | Installation Guide |
| Date de génération | 30 juillet 2026 |

## 1. Présentation

### 1.1 Objectif du guide

L'Installation Guide décrit le cadre technique nécessaire pour installer et
lancer Konatech Pointage à partir du dépôt. Il présente :

- les composants du monorepo ;
- les technologies et versions observées ;
- les étapes générales de préparation ;
- la base PostgreSQL locale ;
- la génération du client Prisma ;
- l'application des migrations ;
- l'initialisation des données ;
- le démarrage du frontend et du backend.

Ce premier chapitre fournit la vue d'ensemble. Les commandes citées sont
uniquement celles définies dans les manifests et la documentation racine du
dépôt.

Références :
`README.md`,
`package.json`,
`pnpm-workspace.yaml`.

### 1.2 Public visé

Le guide s'adresse aux personnes qui interviennent sur l'installation
technique du projet :

- développeurs frontend et backend ;
- ingénieurs DevOps ;
- responsables de l'intégration ;
- exploitants chargés de préparer un environnement local ou conteneurisé.

Le dépôt ne contient pas de parcours d'installation destiné aux utilisateurs
fonctionnels finaux.

### 1.3 Contexte du projet

Konatech Pointage est une application web de gestion de présence. Le dépôt
contient une interface administrateur et employé, une API, un modèle de données
PostgreSQL et les moyens de lancer la base ou l'ensemble de la plateforme avec
Docker Compose.

Les modules applicatifs observés couvrent notamment :

- l'authentification ;
- les employés ;
- les plannings ;
- les pointages ;
- le calendrier RH ;
- les sanctions ;
- le dashboard ;
- les exports mensuels.

Références :
`apps/frontend/app`,
`apps/backend/src/modules`,
`apps/backend/prisma/schema.prisma`.

### 1.4 Architecture générale

```text
+---------------------------+
| Navigateur                |
+-------------+-------------+
              |
              v
+---------------------------+
| Frontend Next.js          |
| App Router - port 3000    |
+-------------+-------------+
              |
              | HTTP / API proxy
              v
+---------------------------+
| Backend NestJS            |
| /api/v1 - port 4000       |
+-------------+-------------+
              |
              | Prisma Client
              v
+---------------------------+
| PostgreSQL 16             |
| conteneur local           |
+---------------------------+
```

Le frontend possède des routes serveur Next.js sous `app/api`. Elles
transmettent les appels concernés vers l'API NestJS. Le backend utilise Prisma
pour accéder à PostgreSQL.

Références :
`apps/frontend/app/api`,
`apps/frontend/lib/api-route.ts`,
`apps/backend/src/main.ts`,
`apps/backend/src/common/prisma/prisma.service.ts`,
`docker-compose.yml`.

### 1.5 Composants logiciels

| Composant | Rôle | Emplacement |
| --- | --- | --- |
| Frontend | Interface web administrateur, employé et terminal de pointage | `apps/frontend` |
| Backend | API REST, authentification et logique métier | `apps/backend` |
| Prisma | Schéma, migrations, seed et client de données | `apps/backend/prisma` |
| PostgreSQL | Persistance relationnelle | Service `postgres` de `docker-compose.yml` |
| Docker | Images du frontend et du backend | `docker` |
| Docker Compose | Base locale et profil applicatif complet | `docker-compose.yml` |
| Scripts racine | Développement, validation, base et Prisma | `package.json`, `scripts` |
| Documentation | Documents d'architecture, d'exploitation et guides | `docs`, `documentation` |

## 2. Périmètre

### 2.1 Frontend

Le périmètre frontend comprend :

- l'application Next.js sous `apps/frontend/app` ;
- les composants fonctionnels et d'interface sous
  `apps/frontend/components` ;
- les clients et utilitaires sous `apps/frontend/lib` ;
- les ressources statiques sous `apps/frontend/public` ;
- la configuration TypeScript, Next.js, Tailwind CSS et PostCSS ;
- les variables d'environnement frontend.

Le frontend utilise l'App Router. Aucun répertoire `pages` de l'ancien routeur
Next.js n'est présent.

Références :
`apps/frontend/package.json`,
`apps/frontend/next.config.ts`,
`apps/frontend/tailwind.config.ts`,
`apps/frontend/postcss.config.js`,
`apps/frontend/.env.example`.

### 2.2 Backend

Le périmètre backend comprend :

- l'application NestJS sous `apps/backend/src` ;
- les modules métier sous `apps/backend/src/modules` ;
- les services transversaux sous `apps/backend/src/common` ;
- les DTO et validations ;
- les tests sous `apps/backend/test` ;
- les scripts d'administration et de reprise de données sous
  `apps/backend/scripts`.

Le backend publie l'API avec le préfixe global `/api/v1`.

Références :
`apps/backend/package.json`,
`apps/backend/src/main.ts`,
`apps/backend/src/app.module.ts`.

### 2.3 Base de données

La base réellement utilisée est PostgreSQL. Prisma déclare le provider
`postgresql` et lit la connexion dans `DATABASE_URL`.

Le dépôt contient :

- le schéma Prisma ;
- des migrations versionnées ;
- un seed TypeScript ;
- une configuration Prisma ;
- un service PostgreSQL 16 Alpine dans Docker Compose ;
- un volume nommé `postgres-data`.

Références :
`apps/backend/prisma/schema.prisma`,
`apps/backend/prisma/migrations`,
`apps/backend/prisma/seed.ts`,
`apps/backend/prisma.config.ts`,
`docker-compose.yml`.

### 2.4 Dépendances

Les dépendances sont gérées au niveau du workspace par pnpm. Le dépôt contient
un verrou `pnpm-lock.yaml` et les trois manifests suivants :

- le manifest racine ;
- le manifest frontend ;
- le manifest backend.

Le workspace référence uniquement les sous-répertoires d'`apps`. Aucun package
interne partagé sous un répertoire `packages` n'est déclaré.

Références :
`package.json`,
`apps/frontend/package.json`,
`apps/backend/package.json`,
`pnpm-lock.yaml`,
`pnpm-workspace.yaml`.

### 2.5 Outils de développement

Les outils directement observés sont :

| Outil | Usage |
| --- | --- |
| Node.js | Exécution des applications et scripts |
| pnpm | Installation et orchestration du workspace |
| Docker | Exécution conteneurisée |
| Docker Compose | PostgreSQL local ou plateforme avec profil `app` |
| Prisma CLI | Client, migrations, statut et seed |
| Nest CLI | Développement et build backend |
| Next.js CLI | Développement, build et démarrage frontend |
| TypeScript | Vérification statique et compilation |
| ESLint | Analyse du code |
| Prettier | Formatage |
| Jest et Supertest | Tests end-to-end backend |

Git est nécessaire au cycle de clonage, mais aucune version minimale de Git
n'est déclarée dans le dépôt.

## 3. Vue générale de l'installation

### 3.1 Cycle complet

```text
+---------------------------+
| Pré-requis               |
| Node, pnpm, Docker       |
+-------------+-------------+
              |
              v
+---------------------------+
| Clonage                   |
| dépôt Git                 |
+-------------+-------------+
              |
              v
+---------------------------+
| Installation              |
| pnpm install              |
+-------------+-------------+
              |
              v
+---------------------------+
| Configuration             |
| fichiers .env locaux      |
+-------------+-------------+
              |
              v
+---------------------------+
| Migration                 |
| Prisma                    |
+-------------+-------------+
              |
              v
+---------------------------+
| Seed                      |
| données initiales         |
+-------------+-------------+
              |
              v
+---------------------------+
| Lancement                 |
| frontend + backend        |
+---------------------------+
```

### 3.2 Pré-requis

Les pré-requis déclarés dans le dépôt sont :

- Node.js compatible avec `>=20.9.0 <23` ;
- pnpm `>=10.0.0` ;
- Docker Desktop ou Docker Engine avec Compose pour la base locale ;
- Git pour récupérer le dépôt.

Le fichier `.nvmrc` fixe la version locale recommandée à `22.11.0`.

Références :
`package.json`,
`.nvmrc`,
`README.md`.

### 3.3 Clonage

Le cycle suppose une copie locale du dépôt Git. Aucune URL de clonage
canonique ni commande `git clone` complète n'est déclarée dans les fichiers
suivis ; le guide ne peut donc pas fixer une origine distante à partir du
dépôt seul.

Une fois le dépôt récupéré, les commandes racine s'exécutent depuis le
répertoire contenant `package.json` et `pnpm-workspace.yaml`.

### 3.4 Installation des dépendances

La commande documentée est :

```bash
pnpm install
```

Les Dockerfiles utilisent :

```bash
pnpm install --frozen-lockfile
```

Le gestionnaire déclaré est `pnpm@10.26.0`. Aucun script d'installation basé
sur npm n'est défini. npm n'est donc pas le gestionnaire de workspace
documenté par le projet.

Références :
`package.json`,
`pnpm-lock.yaml`,
`docker/backend.Dockerfile`,
`docker/frontend.Dockerfile`.

### 3.5 Configuration

Le démarrage local documenté copie :

```bash
cp apps/backend/.env.example apps/backend/.env
cp apps/frontend/.env.example apps/frontend/.env.local
```

Le backend charge `DATABASE_URL`, l'origine frontend, le secret JWT et les
autres paramètres validés par `AppModule`. Le frontend charge les URL
publique et backend depuis son fichier local.

Le dépôt fournit également `.env.production.example` pour le scénario Docker
de production. Les fichiers locaux contenant des valeurs d'environnement ne
constituent pas des valeurs à reproduire dans ce guide.

Références :
`apps/backend/.env.example`,
`apps/frontend/.env.example`,
`.env.production.example`,
`apps/backend/src/app.module.ts`.

### 3.6 Base, migration et seed

Le cycle documenté est :

```bash
pnpm db:up
pnpm prisma:generate
pnpm prisma:status
pnpm prisma:migrate
pnpm prisma:seed
```

`db:up` démarre uniquement PostgreSQL, car les services applicatifs sont
placés derrière le profil Compose `app`.

`prisma:migrate` utilise `prisma migrate dev`. Le script
`prisma:migrate:deploy` existe séparément pour appliquer les migrations déjà
versionnées sans en créer. Le seed exécuté par Prisma est
`apps/backend/prisma/seed.ts`.

Références :
`package.json`,
`docker-compose.yml`,
`apps/backend/prisma.config.ts`.

### 3.7 Lancement

La commande racine :

```bash
pnpm dev
```

démarre simultanément NestJS en mode watch et Next.js en mode développement.
Le script arrête l'autre processus si l'un des deux se termine.

Les commandes séparées sont :

```bash
pnpm dev:backend
pnpm dev:frontend
```

Les adresses locales documentées sont :

| Service | Adresse |
| --- | --- |
| Frontend | `http://localhost:3000` |
| API backend | `http://localhost:4000/api/v1` |
| Santé backend | `http://localhost:4000/api/v1/health` |
| Santé via frontend | `http://localhost:3000/api/health` |

Références :
`scripts/dev.mjs`,
`package.json`,
`README.md`.

## 4. Technologies utilisées

### 4.1 Technologies et versions observées

| Technologie | Version ou contrainte observée | Source |
| --- | --- | --- |
| Node.js | `>=20.9.0 <23`, `.nvmrc` à `22.11.0` | `package.json`, `.nvmrc` |
| pnpm | `10.26.0`, moteur `>=10.0.0` | `package.json` |
| Next.js | `15.5.18` résolu | `pnpm-lock.yaml` |
| React | `19.2.5` résolu | `pnpm-lock.yaml` |
| NestJS | `11.1.19` résolu pour le cœur | `pnpm-lock.yaml` |
| Prisma CLI et Client | `6.19.3` résolu | `pnpm-lock.yaml` |
| PostgreSQL | Image `postgres:16-alpine` | `docker-compose.yml` |
| TypeScript | `5.9.3` résolu | `pnpm-lock.yaml` |
| Tailwind CSS | `3.4.19` résolu | `pnpm-lock.yaml` |
| Docker | Présent, version minimale non déclarée | `docker` |
| Docker Compose | Fichier Compose présent, version minimale non déclarée | `docker-compose.yml` |
| Jest | `29.7.0` résolu | `pnpm-lock.yaml` |
| Puppeteer | `24.43.1` résolu | `pnpm-lock.yaml` |
| ESLint | `10.4.0` résolu | `pnpm-lock.yaml` |
| Prettier | `3.8.3` résolu | `pnpm-lock.yaml` |

Les plages déclarées dans les manifests utilisent généralement `^`. Le tableau
retient la version effectivement verrouillée lorsque le lockfile la fournit.

### 4.2 Dépendances frontend observées

| Dépendance | Usage observable |
| --- | --- |
| `next` | Framework web et App Router |
| `react`, `react-dom` | Rendu des composants |
| `tailwindcss` | Styles utilitaires |
| `class-variance-authority` | Variantes de composants |
| `clsx`, `tailwind-merge` | Composition des classes |
| `qrcode` | Génération du QR Code de pointage |
| `postcss`, `autoprefixer` | Traitement CSS |

Le dépôt contient des composants réutilisables sous
`apps/frontend/components/ui`. Aucun fichier `components.json` de configuration
shadcn/ui n'est présent ; aucune dépendance au CLI shadcn n'est déclarée.

Références :
`apps/frontend/package.json`,
`apps/frontend/components/ui`,
`apps/frontend/tailwind.config.ts`.

### 4.3 Dépendances backend observées

| Dépendance | Usage observable |
| --- | --- |
| `@nestjs/*` | API modulaire et plateforme Express |
| `@prisma/client`, `prisma` | Accès PostgreSQL et migrations |
| `class-validator`, `class-transformer` | Validation des DTO |
| `@nestjs/config`, `joi`, `dotenv` | Chargement et validation de configuration |
| `@nestjs/throttler` | Limitation de débit |
| `helmet` | En-têtes HTTP de sécurité |
| `body-parser` | Traitement des corps HTTP |
| `puppeteer` | Rendu des rapports PDF |
| `rxjs`, `reflect-metadata` | Infrastructure NestJS |
| `jest`, `supertest`, `ts-jest` | Tests end-to-end |

Référence :
`apps/backend/package.json`.

## 5. Organisation du dépôt

### 5.1 Arborescence principale

```text
.
|-- apps/
|   |-- backend/
|   |   |-- prisma/
|   |   |-- scripts/
|   |   |-- src/
|   |   `-- test/
|   `-- frontend/
|       |-- app/
|       |-- components/
|       |-- lib/
|       |-- public/
|       `-- types/
|-- docker/
|-- docs/
|-- documentation/
|-- scripts/
|-- docker-compose.yml
|-- package.json
|-- pnpm-lock.yaml
`-- pnpm-workspace.yaml
```

### 5.2 Applications

`apps/backend` et `apps/frontend` sont les deux seuls packages inclus par
`pnpm-workspace.yaml`.

Le backend suit une organisation NestJS :

- `src/modules` pour les domaines ;
- `src/common` pour Prisma, sécurité, audit, temps, validation et utilitaires ;
- `prisma` pour le modèle et les migrations ;
- `test` pour les tests end-to-end.

Le frontend suit l'App Router :

- `app` pour les pages et routes API ;
- `components` pour les composants métier et UI ;
- `lib` pour l'accès API, l'authentification et les utilitaires ;
- `public` pour les ressources statiques.

### 5.3 Packages

Aucun répertoire `packages` n'existe. Aucun package partagé distinct n'est
déclaré. Le partage de code reste interne à chaque application.

Référence :
`pnpm-workspace.yaml`.

### 5.4 Configuration

Les principaux fichiers de configuration observés sont :

| Domaine | Fichiers |
| --- | --- |
| Workspace | `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml` |
| Node.js | `.nvmrc` |
| TypeScript | `apps/backend/tsconfig.json`, `apps/frontend/tsconfig.json` |
| NestJS | `apps/backend/nest-cli.json` |
| Next.js | `apps/frontend/next.config.ts` |
| Tailwind | `apps/frontend/tailwind.config.ts` |
| PostCSS | `apps/frontend/postcss.config.js` |
| Prisma | `apps/backend/prisma.config.ts` |
| ESLint | `eslint.config.mjs` |
| Prettier | `.prettierrc.json`, `.prettierignore` |
| Docker | `docker-compose.yml`, `docker/backend.Dockerfile`, `docker/frontend.Dockerfile` |
| Environnement | fichiers `.env.example` et `.env.production.example` |

### 5.5 Scripts

Les scripts racine regroupent :

- le développement ;
- les builds frontend et backend ;
- le typecheck ;
- le lint et le formatage ;
- la validation complète ;
- les tests backend et proxy ;
- la gestion Docker Compose ;
- les opérations Prisma ;
- le nettoyage spécifique à Windows.

Le backend ajoute les scripts d'initialisation du premier administrateur et de
backfill des PIN et instantanés de planning.

Références :
`package.json`,
`apps/backend/package.json`,
`scripts/dev.mjs`,
`scripts/validate-proxy.mjs`,
`scripts/clean-windows.ps1`.

### 5.6 Documentation

Deux ensembles sont présents :

- `docs`, qui contient des états, audits, registres et documents techniques ;
- `documentation`, qui contient les séries SAR, SMOD, UAG et le présent
  Installation Guide.

Le dépôt ne contient pas de générateur de site documentaire ni de dépendance
à un framework de documentation.

## 6. Conventions générales

### 6.1 Organisation du workspace

- le dépôt est privé au sens des manifests npm ;
- chaque application possède son propre `package.json` ;
- les commandes transversales sont lancées depuis la racine ;
- les commandes ciblées utilisent `pnpm --dir apps/<application>` ;
- les dépendances sont verrouillées dans un lockfile unique ;
- les dépendances à compiler explicitement sont listées dans
  `onlyBuiltDependencies`.

Références :
`package.json`,
`pnpm-workspace.yaml`,
`pnpm-lock.yaml`.

### 6.2 Nommage

Les conventions observées comprennent :

- noms de fichiers TypeScript en kebab-case dans les modules ;
- suffixes NestJS tels que `.controller.ts`, `.service.ts`, `.module.ts` et
  `.dto.ts` ;
- pages Next.js nommées `page.tsx` dans les segments App Router ;
- routes frontend nommées `route.ts` ;
- migrations Prisma nommées par horodatage et description ;
- variables d'environnement en majuscules avec séparateurs `_`.

Références :
`apps/backend/src/modules`,
`apps/frontend/app`,
`apps/backend/prisma/migrations`.

### 6.3 Scripts et validation

Les scripts racine composent les contrôles plutôt que de dupliquer les
commandes :

- `build` enchaîne backend puis frontend ;
- `typecheck` enchaîne les deux applications ;
- `check` enchaîne lint, typecheck et build ;
- `validate` ajoute formatage, génération Prisma, tests et validation du
  proxy.

Les tests racine correspondent aux tests end-to-end du backend. Aucun script
de test unitaire frontend n'est défini.

Références :
`package.json`,
`apps/frontend/package.json`,
`apps/backend/package.json`.

### 6.4 Configuration des environnements

Le backend recherche, selon `NODE_ENV`, les fichiers dans cet ordre :

1. `.env.<environnement>.local` ;
2. `.env.<environnement>` ;
3. `.env.local` ;
4. `.env`.

Le frontend utilise les conventions Next.js et fournit `.env.example` comme
source locale. Les exemples séparent les URL publiques, l'URL serveur backend,
la connexion PostgreSQL et les paramètres de sécurité.

Références :
`apps/backend/src/app.module.ts`,
`apps/backend/.env.example`,
`apps/frontend/.env.example`.

### 6.5 Docker

Les images applicatives utilisent des builds multi-étapes basés sur
`node:22-bookworm-slim`, activent Corepack et installent les dépendances avec le
lockfile.

Le conteneur backend :

- génère Prisma pendant le build ;
- installe Chromium dans l'image d'exécution ;
- applique `prisma migrate deploy` avant le démarrage ;
- expose le port 4000.

Le conteneur frontend construit Next.js avec les URL fournies comme arguments
et expose le port 3000.

Références :
`docker/backend.Dockerfile`,
`docker/frontend.Dockerfile`.

## 7. Traçabilité

| Information | Fichiers concernés |
| --- | --- |
| Présentation du monorepo | `README.md` |
| Moteurs et gestionnaire de packages | `package.json` |
| Version Node locale | `.nvmrc` |
| Définition du workspace | `pnpm-workspace.yaml` |
| Versions résolues | `pnpm-lock.yaml` |
| Frontend et dépendances | `apps/frontend/package.json` |
| Backend et dépendances | `apps/backend/package.json` |
| Architecture frontend | `apps/frontend/app`, `apps/frontend/components`, `apps/frontend/lib` |
| Architecture backend | `apps/backend/src/modules`, `apps/backend/src/common` |
| Préfixe et démarrage backend | `apps/backend/src/main.ts` |
| Schéma PostgreSQL | `apps/backend/prisma/schema.prisma` |
| Configuration Prisma | `apps/backend/prisma.config.ts` |
| Migrations | `apps/backend/prisma/migrations` |
| Seed | `apps/backend/prisma/seed.ts` |
| PostgreSQL et orchestration | `docker-compose.yml` |
| Image backend | `docker/backend.Dockerfile` |
| Image frontend | `docker/frontend.Dockerfile` |
| Environnement backend | `apps/backend/.env.example` |
| Environnement frontend | `apps/frontend/.env.example` |
| Environnement Docker | `.env.production.example` |
| Démarrage simultané local | `scripts/dev.mjs` |
| Validation du proxy | `scripts/validate-proxy.mjs` |
| Documentation technique | `docs` |
| Documentation officielle | `documentation` |

## 8. Observations

### 8.1 Comportements constatés

- `pnpm db:up` démarre PostgreSQL sans les applications ;
- les services backend et frontend de Compose sont associés au profil `app` ;
- `pnpm dev` lance les deux applications comme processus locaux ;
- le backend Docker applique automatiquement les migrations existantes avant
  son démarrage ;
- le développement local applique les migrations par une commande explicite ;
- Prisma utilise exclusivement `DATABASE_URL` ;
- le seed est un script TypeScript ;
- les rapports PDF du backend Docker disposent de Chromium ;
- les healthchecks Docker attendent PostgreSQL, puis le backend, puis le
  frontend.

### 8.2 Limitations observées

- aucune URL Git canonique n'est déclarée pour la commande de clonage ;
- aucune version minimale de Git n'est déclarée ;
- aucune version minimale de Docker ou Docker Compose n'est déclarée ;
- npm n'est pas configuré comme gestionnaire du workspace ;
- aucun répertoire `packages` n'est présent ;
- aucun script racine `start` de production n'est défini ;
- le frontend ne possède aucun script de test unitaire ;
- les applications Docker sont derrière un profil et ne démarrent pas avec la
  commande `pnpm db:up` ;
- la configuration locale exige deux fichiers d'environnement distincts ;
- l'export PDF premium dépend de Chromium.

### 8.3 Composants absents

Le dépôt ne contient pas :

- de manifeste Render tel que `render.yaml` ;
- de configuration Neon spécifique ;
- de service Neon dans Docker Compose ;
- de base MySQL, MariaDB, SQLite ou MongoDB ;
- de package interne partagé ;
- de configuration shadcn/ui `components.json` ;
- de framework de site documentaire ;
- de script d'installation automatisant la totalité du cycle local ;
- de fichier Kubernetes ou Helm ;
- de configuration Terraform ;
- de pipeline CI versionné sous `.github/workflows`.

La documentation racine mentionne Render et Neon pour des opérations manuelles,
mais leur provisionnement n'est pas défini par un fichier d'infrastructure du
dépôt.

Références :
`README.md`,
`docker-compose.yml`,
`pnpm-workspace.yaml`.
