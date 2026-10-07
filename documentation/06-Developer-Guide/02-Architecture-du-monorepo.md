# Architecture du monorepo

| Métadonnée | Valeur |
| --- | --- |
| Document ID | DG-002 |
| Titre | Architecture du monorepo |
| Version | 1.0 |
| Statut | Validé |
| Classification | Interne |
| Référence | Developer Guide |

## 1. Présentation

### 1.1 Objectif

Ce chapitre décrit l'architecture réelle du monorepo Konatech Pointage :
workspaces pnpm, applications, dépendances, scripts racine, configurations et
flux entre les composants.

### 1.2 Rôle du monorepo

Le dépôt regroupe dans un même workspace :

- le frontend Next.js ;
- le backend NestJS ;
- le schéma, les migrations et le seed Prisma ;
- l'orchestration Docker ;
- les scripts communs ;
- les configurations de qualité ;
- les tests ;
- la documentation.

La racine fournit l'installation unique, le lockfile et les commandes qui
coordonnent ou ciblent les deux applications. Chaque application conserve son
propre manifeste et ses dépendances.

Références :
`README.md`,
`package.json`,
`pnpm-workspace.yaml`,
`pnpm-lock.yaml`.

## 2. Vue d'ensemble

### 2.1 Organisation générale

Le monorepo est privé. Sa racine se nomme `konatech-attendance` dans
`package.json`. `pnpm-workspace.yaml` inclut uniquement le motif `apps/*`.

L'arborescence applicative est :

```text
.
├── apps/
│   ├── backend/
│   │   ├── prisma/
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

Références :
arborescence du dépôt,
`README.md`.

### 2.2 Applications

| Application | Emplacement | Runtime et framework | Responsabilité observable |
| --- | --- | --- | --- |
| `backend` | `apps/backend` | Node.js, NestJS 11, plateforme Express | API REST, authentification, règles de pointage, données RH, exports et accès Prisma |
| `frontend` | `apps/frontend` | Node.js, Next.js 15, React 19 | Pages App Router, parcours admin/employé et routes serveur vers l'API |

Les deux manifests déclarent la version `0.1.0` et le caractère privé.

Références :
`apps/backend/package.json`,
`apps/frontend/package.json`.

### 2.3 Packages

Les packages déclarés par le workspace sont exactement :

- `apps/backend`, nommé `backend` ;
- `apps/frontend`, nommé `frontend`.

La racine est également un importer du lockfile pour ses dépendances de
développement et ses scripts, mais le motif de workspace ne contient que
`apps/*`.

Il n'existe aucun répertoire `packages` ni manifeste de bibliothèque interne.
Aucune dépendance `workspace:`, `link:` ou `file:` n'est déclarée dans les
trois manifests.

Références :
`pnpm-workspace.yaml`,
les trois `package.json`,
section `importers` de `pnpm-lock.yaml`.

### 2.4 Bibliothèques partagées

Le dépôt ne contient pas de bibliothèque de code commune publiée comme
workspace. Les éléments partagés sont principalement :

- les configurations racine de lint, formatage et édition ;
- les scripts racine ;
- le lockfile ;
- les fichiers Docker et Compose ;
- la documentation.

Une suite e2e backend importe directement
`apps/frontend/lib/auth-session.ts` par un chemin relatif. Ce partage ponctuel
n'est pas matérialisé par un package commun.

Référence :
`apps/backend/test/app.e2e-spec.ts`.

### 2.5 Répertoires hors workspaces

| Répertoire | Statut par rapport à pnpm | Rôle observable |
| --- | --- | --- |
| `docker` | Hors motif `apps/*` | Dockerfiles des applications |
| `scripts` | Hors motif, exécuté par les scripts racine | Développement conjoint, test proxy, nettoyage Windows |
| `docs` | Hors workspace | Architecture, état, gouvernance et release |
| `documentation` | Hors workspace | Référentiels et guides |
| `.agents` | Hors workspace | Répertoire présent à la racine |
| `.codex` | Hors workspace | Répertoire présent à la racine |

La présence d'un répertoire dans le dépôt ne le transforme pas en package
pnpm : seuls les manifests correspondant à `apps/*` sont les packages du
workspace.

## 3. Organisation des workspaces

### 3.1 Workspaces applicatifs

| Nom | Emplacement | Rôle | Dépendances principales déclarées |
| --- | --- | --- | --- |
| `backend` | `apps/backend` | API NestJS et accès PostgreSQL par Prisma | NestJS, Prisma Client, validation, sécurité HTTP, limitation de débit, Puppeteer, RxJS |
| `frontend` | `apps/frontend` | Interface Next.js admin/employé | Next.js, React, QR code, utilitaires de classes ; Tailwind/PostCSS pour le build |

Références :
`pnpm-workspace.yaml`,
`apps/backend/package.json`,
`apps/frontend/package.json`.

### 3.2 Racine d'orchestration

La racine possède un manifeste privé, mais n'est pas une troisième
application. Elle contient :

| Élément | Contenu observable |
| --- | --- |
| Nom | `konatech-attendance` |
| Gestionnaire | `pnpm@10.26.0` |
| Node.js | `>=20.9.0 <23` |
| pnpm | `>=10.0.0` |
| Dépendances | Dépendances de développement pour ESLint, Prettier et dotenv |
| Scripts | Orchestration, contrôles, Docker, Prisma et maintenance |

Le lockfile contient trois importers : `.`, `apps/backend` et
`apps/frontend`.

Références :
`package.json`,
`pnpm-lock.yaml`.

### 3.3 Backend

Le backend organise son code en :

- `src/modules` pour les domaines NestJS ;
- `src/common` pour Prisma, l'audit, la sécurité, le temps, les utilitaires et
  validations communs au backend ;
- `prisma` pour le schéma, les migrations et le seed ;
- `scripts` pour les opérations d'administration et de reprise ;
- `test` pour les suites end-to-end.

Sa configuration TypeScript :

- utilise CommonJS ;
- cible ES2022 ;
- active le mode strict ;
- produit les artefacts sous `dist` ;
- inclut les sources et tests.

Références :
`apps/backend/tsconfig.json`,
`apps/backend/nest-cli.json`,
arborescence de `apps/backend`.

### 3.4 Frontend

Le frontend organise :

- les pages et layouts dans `app` ;
- les routes serveur dans `app/api` ;
- les composants par domaine et les composants UI dans `components` ;
- les fonctions API et de session dans `lib` ;
- les fichiers statiques dans `public` ;
- les types complémentaires dans `types`.

Sa configuration TypeScript :

- utilise les modules ES et la résolution `bundler` ;
- active le mode strict ;
- ne produit pas directement de fichiers avec TypeScript ;
- utilise le plugin Next.js ;
- expose l'alias `@/*` vers la racine frontend.

Références :
`apps/frontend/tsconfig.json`,
`apps/frontend/next.config.ts`,
arborescence de `apps/frontend`.

### 3.5 Dépendances de build autorisées

Le workspace autorise explicitement les scripts de build de :

| Package |
| --- |
| `@nestjs/core` |
| `@prisma/client` |
| `@prisma/engines` |
| `prisma` |
| `puppeteer` |
| `sharp` |

Cette liste est déclarée sous `onlyBuiltDependencies`.

Référence :
`pnpm-workspace.yaml`.

### 3.6 Overrides

Le workspace fixe des versions transitives pour :

| Sélecteur | Version déclarée |
| --- | --- |
| `ajv>fast-uri` | `3.1.2` |
| `body-parser>qs` | `6.15.2` |
| `express>qs` | `6.15.2` |
| `minimatch>brace-expansion` | `5.0.6` |
| `next>postcss` | `8.5.10` |
| `puppeteer-core>ws` | `8.20.1` |
| `superagent>qs` | `6.15.2` |

Les mêmes overrides apparaissent dans le lockfile.

Références :
`pnpm-workspace.yaml`,
`pnpm-lock.yaml`.

## 4. Flux entre les composants

### 4.1 Flux applicatif

```text
+---------------------------+
| Navigateur                |
+-------------+-------------+
              |
              v
+---------------------------+
| Frontend Next.js          |
| pages + routes app/api    |
+-------------+-------------+
              |
              | HTTP / API configurée
              v
+---------------------------+
| Backend NestJS            |
| préfixe /api/v1           |
+-------------+-------------+
              |
              | PrismaService
              v
+---------------------------+
| Prisma Client             |
| schema.prisma             |
+-------------+-------------+
              |
              | DATABASE_URL
              v
+---------------------------+
| PostgreSQL                |
+---------------------------+
```

Références :
`apps/frontend/lib/api.ts`,
`apps/frontend/lib/api-route.ts`,
`apps/backend/src/main.ts`,
`apps/backend/src/common/prisma/prisma.service.ts`,
`apps/backend/prisma/schema.prisma`.

### 4.2 Frontend vers backend

Les routes sous `apps/frontend/app/api` emploient les fonctions de
`apps/frontend/lib/api-route.ts` ou appellent `fetchServerApi`. Le module
`apps/frontend/lib/api.ts` résout :

- `NEXT_PUBLIC_API_BASE_URL` pour l'origine publique ;
- `API_BASE_URL` comme surcharge serveur ;
- `NEXT_PUBLIC_APP_URL` pour l'origine publique frontend.

Les URL d'API doivent se terminer par `/api/v1`. Le backend installe ce
préfixe global dans son bootstrap.

Références :
`apps/frontend/app/api`,
`apps/frontend/lib/api.ts`,
`apps/frontend/lib/api-route.ts`,
`apps/backend/src/main.ts`.

### 4.3 Backend vers Prisma

`PrismaModule` est global et exporte `PrismaService`. Ce service étend
`PrismaClient`. Les services de domaine qui utilisent les données injectent
ce service, notamment :

- authentification ;
- employés ;
- plannings ;
- calendrier ;
- pointages et métriques ;
- dashboard ;
- sanctions ;
- exports mensuels.

Références :
`apps/backend/src/common/prisma/prisma.module.ts`,
`apps/backend/src/common/prisma/prisma.service.ts`,
services sous `apps/backend/src/modules`.

### 4.4 Prisma vers PostgreSQL

Le datasource `db` de Prisma utilise le provider `postgresql` et
`DATABASE_URL`. `prisma.config.ts` utilise la même variable et définit les
chemins du schéma, des migrations et du seed.

Dans Docker Compose, `DATABASE_URL` du backend est construite avec le service
`postgres`, son port interne et les variables `POSTGRES_*`.

Références :
`apps/backend/prisma/schema.prisma`,
`apps/backend/prisma.config.ts`,
`docker-compose.yml`.

### 4.5 Bibliothèques communes

Il n'existe pas de bibliothèque commune aux deux applications sous forme de
workspace. Les bibliothèques internes sont limitées à chaque application :

| Portée | Bibliothèques internes observées |
| --- | --- |
| Backend | `src/common`, utilitaires et services partagés entre modules NestJS |
| Frontend | `lib`, `components/ui` et composants partagés entre pages |
| Racine | Configurations et scripts, sans module TypeScript consommé comme package |

L'import direct du frontend depuis
`apps/backend/test/app.e2e-spec.ts` constitue l'unique import inter-applications
trouvé par la recherche des chemins backend/frontend.

### 4.6 Configuration

```text
Configuration racine
(.editorconfig, Prettier, ESLint, pnpm)
                |
                +-----------> Frontend
                |
                +-----------> Backend
                                  |
Configuration environnement      |
(.env / .env.local / Compose) ----+
                |
                +-----------> URL frontend/backend
                |
                +-----------> DATABASE_URL / PostgreSQL
```

Les configurations racine s'appliquent au dépôt ou sont appelées par les
scripts racine. Les applications possèdent en plus leurs configurations
TypeScript et framework.

### 4.7 Flux de développement

`pnpm dev` exécute `scripts/dev.mjs`. Le script démarre :

- NestJS avec `start --watch` depuis `apps/backend` ;
- Next.js avec `dev` depuis `apps/frontend`.

Il transmet l'environnement et les sorties. Si un processus se termine, il
arrête l'autre. PostgreSQL n'est pas démarré par ce script.

Références :
`package.json`,
`scripts/dev.mjs`.

### 4.8 Flux de test du raccordement

`pnpm test:proxy` :

1. réserve deux ports locaux ;
2. démarre le backend ;
3. attend l'endpoint `/api/v1/health` ;
4. démarre le frontend ;
5. appelle `/api/health` sur le frontend ;
6. vérifie le payload direct et proxifié ;
7. vérifie la redirection du point d'entrée ;
8. arrête les processus.

Références :
`package.json`,
`scripts/validate-proxy.mjs`.

### 4.9 Flux Docker

Les Dockerfiles copient le manifeste racine, le lockfile, le fichier de
workspace et les deux manifests applicatifs avant
`pnpm install --frozen-lockfile`.

Compose applique l'ordre :

```text
postgres --healthy--> backend --healthy--> frontend
```

Le backend exécute `prisma migrate deploy` avant NestJS. Les images sont
construites séparément, mais leurs contextes de build sont la racine du
monorepo.

Références :
`docker/backend.Dockerfile`,
`docker/frontend.Dockerfile`,
`docker-compose.yml`.

## 5. Scripts globaux

### 5.1 Développement et build

| Script racine | Commande ou chaîne réelle | Rôle |
| --- | --- | --- |
| `dev` | `node ./scripts/dev.mjs` | Démarrer frontend et backend ensemble |
| `dev:backend` | CLI NestJS `start --watch` dans `apps/backend` | Démarrer le backend |
| `dev:frontend` | CLI Next.js `dev` dans `apps/frontend` | Démarrer le frontend |
| `build` | `build:backend`, puis `build:frontend` | Construire les deux applications |
| `build:backend` | CLI NestJS `build` | Construire le backend |
| `build:frontend` | CLI Next.js `build` | Construire le frontend |

### 5.2 Types, lint et formatage

| Script racine | Commande ou chaîne réelle | Rôle |
| --- | --- | --- |
| `typecheck` | `typecheck:backend`, puis `typecheck:frontend` | Vérifier TypeScript |
| `typecheck:backend` | `tsc --noEmit --incremental false -p tsconfig.json` dans le backend | Vérifier les types backend |
| `typecheck:frontend` | `tsc --noEmit --incremental false` dans le frontend | Vérifier les types frontend |
| `lint` | `eslint .` | Vérifier le workspace |
| `lint:fix` | `eslint . --fix` | Appliquer les corrections ESLint disponibles |
| `format` | `prettier . --write` | Formater les fichiers pris en charge |
| `format:check` | `prettier . --check` | Vérifier le formatage |
| `check` | `lint`, `typecheck`, `build` | Contrôle statique et builds |

### 5.3 Tests et validation

| Script racine | Commande ou chaîne réelle | Rôle |
| --- | --- | --- |
| `test` | `test:backend` | Alias des tests backend |
| `test:backend` | Jest e2e du backend en série | Exécuter les suites backend |
| `test:proxy` | `node ./scripts/validate-proxy.mjs` | Vérifier le raccordement des applications |
| `validate:backend` | Prisma generate, typecheck backend, tests backend, build backend | Validation ciblée backend |
| `validate:frontend` | Typecheck frontend, build frontend, test proxy | Validation ciblée frontend |
| `validate` | Format, Prisma, types, lint, tests, deux builds, proxy | Validation globale |

### 5.4 Docker Compose

| Script racine | Commande réelle | Rôle |
| --- | --- | --- |
| `db:up` | `docker compose up -d` | Démarrer les services par défaut, soit PostgreSQL |
| `db:down` | `docker compose down` | Arrêter Compose |
| `db:status` | `docker compose ps` | Afficher l'état Compose |

### 5.5 Prisma

| Script racine | Commande Prisma réelle | Rôle |
| --- | --- | --- |
| `prisma:generate` | `prisma generate` dans le backend | Générer Prisma Client |
| `prisma:status` | `prisma migrate status` | Lire l'état des migrations |
| `prisma:migrate` | `prisma migrate dev` | Migration de développement |
| `prisma:migrate:deploy` | `prisma migrate deploy` | Appliquer l'historique existant |
| `prisma:seed` | `prisma db seed` | Exécuter le seed |

### 5.6 Maintenance Windows

| Script racine | Commande réelle | Rôle |
| --- | --- | --- |
| `clean:windows` | Script PowerShell | Supprimer les artefacts ciblés |
| `clean:windows:dev` | Même script avec `-KillDevServers` | Ajouter l'arrêt des processus sur les ports connus |
| `clean:windows:prisma` | Même script avec `-RegeneratePrisma` | Ajouter la génération Prisma |

Tous les scripts globaux présents dans `package.json` sont répartis dans les
tableaux des sections 5.1 à 5.6.

## 6. Gestion des dépendances

### 6.1 Gestionnaire de packages

Le projet utilise pnpm. La racine déclare :

- `pnpm@10.26.0` comme gestionnaire ;
- pnpm `>=10.0.0` dans `engines` ;
- Node.js `>=20.9.0 <23`.

`.nvmrc` contient la version Node.js locale observée.

Références :
`package.json`,
`.nvmrc`.

### 6.2 Installation

La commande documentée est :

```bash
pnpm install
```

Elle traite les trois importers du lockfile : racine, backend et frontend.
Les Dockerfiles utilisent :

```bash
pnpm install --frozen-lockfile
```

Références :
`README.md`,
`pnpm-lock.yaml`,
Dockerfiles.

### 6.3 Résolution

`pnpm-lock.yaml` est en version de lockfile `9.0`. Il enregistre :

- les dépendances de chaque importer ;
- les versions résolues ;
- les dépendances transitives ;
- les peer dependencies résolues ;
- les overrides du workspace.

Le lockfile enregistre `autoInstallPeers: true` dans ses paramètres. Aucun
registre privé ni fichier `.npmrc` n'est présent dans le dépôt.

Références :
`pnpm-lock.yaml`,
inventaire des fichiers racine.

### 6.4 Répartition

| Portée | Type de dépendances |
| --- | --- |
| Racine | ESLint, plugin Next.js pour ESLint, Prettier, dotenv et support des configurations |
| Backend | NestJS, Prisma, validation, sécurité HTTP, PDF et outils de test |
| Frontend | Next.js, React, QR code, utilitaires CSS, Tailwind et outils TypeScript |

Les dépendances propres à l'exécution sont déclarées dans les manifests des
applications. Les outils transverses de lint et formatage sont déclarés à la
racine.

Références :
les trois `package.json`.

### 6.5 Partage

Aucune dépendance de code interne n'est partagée par un package workspace. Le
partage observable prend quatre formes :

1. résolution commune par pnpm et le lockfile ;
2. configurations racine ;
3. scripts racine qui ciblent les applications ;
4. fichiers du monorepo copiés dans les builds Docker.

L'import inter-applications du test backend vers l'utilitaire frontend reste
un import relatif de source et non une dépendance déclarée.

Référence :
`apps/backend/test/app.e2e-spec.ts`.

### 6.6 Dépendances installées et artefacts

Les répertoires `node_modules`, le store pnpm, les sorties `dist` et `.next`,
la couverture et les caches sont ignorés par Git. Les Dockerfiles reconstruisent
les dépendances à partir des manifests et du lockfile.

Références :
`.gitignore`,
`.dockerignore`,
Dockerfiles.

### 6.7 Configurations partagées

| Configuration racine | Portée observable |
| --- | --- |
| `.editorconfig` | Encodage, fins de ligne et indentation |
| `.prettierrc.json` | Formatage |
| `.prettierignore` | Exclusions Prettier |
| `eslint.config.mjs` | Lint JavaScript/TypeScript et règles Next.js |
| `.gitignore` | Exclusions Git |
| `.dockerignore` | Exclusions des contextes Docker |
| `.nvmrc` | Version Node.js locale |

Le backend et le frontend ajoutent leurs propres `tsconfig.json`. NestJS,
Next.js, Tailwind, PostCSS et Prisma ont leurs fichiers de configuration dans
le workspace concerné.

## 7. Traçabilité

### 7.1 Vue d'ensemble et workspaces

| Information | Fichiers analysés |
| --- | --- |
| Motif du workspace | `pnpm-workspace.yaml` |
| Noms et rôles applicatifs | `README.md`, manifests des applications |
| Importers | `pnpm-lock.yaml` |
| Absence de package partagé | arborescence, `pnpm-workspace.yaml`, manifests |
| Import inter-applications | `apps/backend/test/app.e2e-spec.ts` |

### 7.2 Flux

| Flux | Fichiers analysés |
| --- | --- |
| Frontend vers backend | `apps/frontend/app/api`, `apps/frontend/lib/api.ts`, `apps/frontend/lib/api-route.ts` |
| Backend vers Prisma | `apps/backend/src/common/prisma`, services de domaine |
| Prisma vers PostgreSQL | `apps/backend/prisma/schema.prisma`, `apps/backend/prisma.config.ts` |
| Démarrage local | `scripts/dev.mjs`, `package.json` |
| Test proxy | `scripts/validate-proxy.mjs` |
| Orchestration Docker | `docker-compose.yml`, Dockerfiles |

### 7.3 Scripts

| Groupe | Fichiers analysés |
| --- | --- |
| Scripts globaux | `package.json` |
| Scripts backend | `apps/backend/package.json` |
| Scripts frontend | `apps/frontend/package.json` |
| Implémentation du développement | `scripts/dev.mjs` |
| Implémentation du proxy | `scripts/validate-proxy.mjs` |
| Implémentation du nettoyage | `scripts/clean-windows.ps1` |

### 7.4 Dépendances et configurations

| Information | Fichiers analysés |
| --- | --- |
| Dépendances directes | les trois `package.json` |
| Résolution complète | `pnpm-lock.yaml` |
| Builds autorisés et overrides | `pnpm-workspace.yaml` |
| Installation Docker | `docker/backend.Dockerfile`, `docker/frontend.Dockerfile` |
| Configuration racine | `.editorconfig`, `.prettierrc.json`, `.prettierignore`, `eslint.config.mjs`, `.gitignore`, `.dockerignore`, `.nvmrc` |
| Configuration backend | `apps/backend/tsconfig.json`, `apps/backend/nest-cli.json`, `apps/backend/prisma.config.ts` |
| Configuration frontend | `apps/frontend/tsconfig.json`, `apps/frontend/next.config.ts`, `apps/frontend/tailwind.config.ts`, `apps/frontend/postcss.config.js` |

## 8. Observations

### 8.1 Conventions observées

- Le code applicatif est placé sous `apps`.
- Les deux workspaces sont privés.
- Les noms de packages sont `backend` et `frontend`.
- La racine centralise l'orchestration et les outils de qualité.
- Chaque application possède son manifeste et sa configuration TypeScript.
- Les scripts ciblés utilisent `pnpm --dir`.
- Les CLI sont appelés depuis les `node_modules` locaux.
- Le lockfile est unique.
- Les Dockerfiles installent le workspace complet avant de construire une
  application ciblée.

### 8.2 Particularités

- La racine est un importer du lockfile sans être incluse par le motif
  `apps/*`.
- Aucun protocole `workspace:` n'est utilisé.
- Aucun package partagé n'existe.
- Un test backend importe directement un fichier frontend.
- `src/common` partage du code uniquement à l'intérieur du backend.
- `lib` et `components/ui` partagent du code uniquement à l'intérieur du
  frontend.
- PostgreSQL est un service Compose, pas un package pnpm.
- Prisma appartient au workspace backend, pas à la racine.
- Le frontend ne dépend pas du package backend ; le flux applicatif passe par
  HTTP.

### 8.3 Configurations

- ESLint est commun au dépôt et applique un bloc spécifique au frontend.
- Les migrations Prisma et le lockfile sont exclus du lint.
- Prettier et EditorConfig sont définis à la racine.
- TypeScript est strict dans les deux applications.
- Le backend compile vers CommonJS et `dist`.
- Le frontend utilise les modules ES, la résolution `bundler` et l'alias
  `@/*`.
- React Strict Mode est activé.
- Tailwind analyse `app`, `components` et `lib`.

### 8.4 Éléments absents

Le monorepo ne contient pas :

- de répertoire `packages` ;
- de bibliothèque interne déclarée comme workspace ;
- de dépendance interne `workspace:`, `link:` ou `file:` ;
- de configuration Turborepo ou Nx ;
- de script racine `start` ;
- de fichier `.npmrc` ;
- de registre privé configuré ;
- de package frontend de tests autonome ;
- de pipeline CI/CD versionné.
