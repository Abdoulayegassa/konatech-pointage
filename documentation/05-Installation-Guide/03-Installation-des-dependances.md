# Installation des dépendances

| Métadonnée | Valeur |
| --- | --- |
| Document ID | IG-003 |
| Titre | Installation des dépendances |
| Version | 1.0 |
| Statut | Validé |
| Classification | Interne |
| Référence | Installation Guide |

## 1. Présentation

### 1.1 Objectif

Ce chapitre décrit la procédure réellement utilisée pour installer les
dépendances de Konatech Pointage. La procédure part de la racine du dépôt et
utilise le workspace pnpm pour installer en une seule opération :

- les outils de développement communs ;
- les dépendances du frontend Next.js ;
- les dépendances du backend NestJS ;
- Prisma CLI et Prisma Client ;
- les outils de build et de test.

La commande d'installation documentée dans le dépôt est `pnpm install`.

Références :
`README.md`,
`package.json`,
`pnpm-workspace.yaml`.

### 1.2 Rôle des dépendances

Les dépendances fournissent les éléments exécutables et les bibliothèques qui
ne sont pas copiés directement dans le dépôt :

| Domaine | Rôle des dépendances |
| --- | --- |
| Racine | Lint, formatage, configuration ESLint et chargement d'environnement |
| Frontend | Next.js, React, Tailwind CSS, QR Code et utilitaires de styles |
| Backend | NestJS, Prisma, validation, sécurité HTTP, PDF et accès PostgreSQL |
| Tests | Jest, Supertest, ts-jest et types associés |
| Build | TypeScript, Nest CLI, Next.js CLI, PostCSS et Autoprefixer |

Les dépendances résolues sont consignées dans un lockfile unique.

### 1.3 Portée

Le périmètre couvre :

- le gestionnaire pnpm ;
- la résolution du workspace ;
- le lockfile ;
- l'installation locale ;
- l'installation pendant les builds Docker ;
- les scripts qui utilisent les dépendances installées ;
- les contrôles disponibles après installation.

Il ne couvre pas la configuration des variables d'environnement, l'application
des migrations ni le démarrage de PostgreSQL, sauf lorsqu'une de ces opérations
est une dépendance d'un contrôle cité.

## 2. Gestionnaire de paquets

### 2.1 Gestionnaires et fichiers observés

| Élément | Présence | Utilisation observée |
| --- | --- | --- |
| pnpm | Oui | Gestionnaire officiel du workspace |
| npm | Aucun usage comme gestionnaire du projet | Aucun `package-lock.json` ni script d'installation npm |
| Workspace pnpm | Oui | Inclut les sous-répertoires d'`apps` |
| Lockfile pnpm | Oui | Verrouillage de la résolution |
| Lockfile npm | Non | Aucun `package-lock.json` ou `npm-shrinkwrap.json` |
| Lockfile Yarn | Non | Aucun `yarn.lock` |
| Lockfile Bun | Non | Aucun lockfile Bun |
| Corepack | Oui dans Docker | Active pnpm dans les images Node.js |

Les fichiers `package.json` utilisent le format de manifest npm, mais
l'orchestration et l'installation du dépôt sont définies avec pnpm.

Références :
`package.json`,
`pnpm-workspace.yaml`,
`pnpm-lock.yaml`,
`docker/backend.Dockerfile`,
`docker/frontend.Dockerfile`.

### 2.2 Version de pnpm

Le manifest racine déclare :

```text
packageManager = pnpm@10.26.0
engines.pnpm  = >=10.0.0
```

La version Node.js acceptée par le même manifest est `>=20.9.0 <23`.

Référence :
`package.json`.

### 2.3 Workspace

Le fichier de workspace contient le motif :

```yaml
packages:
  - apps/*
```

Les importeurs enregistrés dans le lockfile sont :

- la racine `.` ;
- `apps/backend` ;
- `apps/frontend`.

Aucun répertoire `packages` et aucun package interne partagé ne sont présents.
Le champ `workspaces` n'est pas utilisé dans le manifest racine : la
déclaration du workspace est portée par `pnpm-workspace.yaml`.

Références :
`pnpm-workspace.yaml`,
`pnpm-lock.yaml`,
`package.json`.

### 2.4 Lockfile

Le dépôt contient `pnpm-lock.yaml` avec :

- `lockfileVersion: 9.0` ;
- l'installation automatique des peer dependencies activée ;
- la liste des importeurs ;
- les versions résolues ;
- les intégrités des packages ;
- les overrides du workspace.

Les Dockerfiles imposent `--frozen-lockfile`. L'installation conteneurisée
échoue donc si le lockfile ne correspond pas aux manifests.

Références :
`pnpm-lock.yaml`,
`docker/backend.Dockerfile`,
`docker/frontend.Dockerfile`.

### 2.5 Dépendances autorisées à exécuter un build

Le workspace déclare les dépendances suivantes dans
`onlyBuiltDependencies` :

| Dépendance |
| --- |
| `@nestjs/core` |
| `@prisma/client` |
| `@prisma/engines` |
| `prisma` |
| `puppeteer` |
| `sharp` |

`sharp` est présent dans la résolution transitive du frontend même s'il n'est
pas une dépendance directe de son manifest.

Références :
`pnpm-workspace.yaml`,
`pnpm-lock.yaml`.

### 2.6 Overrides

Le workspace fixe des versions transitoires pour :

- `fast-uri` sous `ajv` ;
- `qs` sous `body-parser`, `express` et `superagent` ;
- `brace-expansion` sous `minimatch` ;
- `postcss` sous Next.js ;
- `ws` sous `puppeteer-core`.

Ces overrides apparaissent dans `pnpm-workspace.yaml` et sont reproduits dans
le lockfile.

Références :
`pnpm-workspace.yaml`,
`pnpm-lock.yaml`.

## 3. Installation des dépendances

### 3.1 Position de départ

La commande doit être exécutée depuis la racine du dépôt, là où se trouvent :

```text
package.json
pnpm-workspace.yaml
pnpm-lock.yaml
apps/backend/package.json
apps/frontend/package.json
```

Le dépôt ne contient pas d'URL Git canonique. L'étape de récupération du code
précède donc cette procédure, mais sa commande complète dépend de l'origine
fournie en dehors des fichiers suivis.

### 3.2 Vérification du runtime

Les commandes de vérification compatibles avec les contraintes déclarées
sont :

```bash
node --version
pnpm --version
```

Le résultat attendu par les manifests est :

- Node.js dans la plage `>=20.9.0 <23` ;
- pnpm en version `>=10.0.0`.

Le fichier `.nvmrc` permet de sélectionner la version locale déclarée :

```bash
nvm use
```

Références :
`package.json`,
`.nvmrc`,
`README.md`.

### 3.3 Installation du workspace

La procédure locale documentée est :

```bash
pnpm install
```

Cette commande résout et installe les trois importeurs du workspace à partir
des manifests et du lockfile. Elle installe les dépendances de développement,
car le parcours local construit, vérifie et teste le projet.

Il n'existe aucun script `install`, `postinstall`, `prepare` ou
`preinstall` personnalisé dans les trois manifests. `pnpm install` est la
commande native du gestionnaire, pas un script du projet.

Références :
`README.md`,
`package.json`,
`apps/backend/package.json`,
`apps/frontend/package.json`.

### 3.4 Installation sous Windows

Le README documente la variante suivante lorsque PowerShell bloque le shim
`pnpm.ps1` :

```powershell
pnpm.cmd install
```

Cette variante exécute la même installation du workspace. Aucun installateur
Windows distinct n'est fourni.

Références :
`README.md`,
`scripts/clean-windows.ps1`.

### 3.5 Installation Docker

Les deux Dockerfiles suivent le même début de procédure :

1. utiliser `node:22-bookworm-slim` ;
2. définir `PNPM_HOME` ;
3. activer Corepack ;
4. copier les manifests racine et applicatifs ;
5. installer le workspace avec le lockfile figé ;
6. copier le reste du dépôt ;
7. construire l'application ciblée.

Les commandes d'installation présentes sont :

```dockerfile
RUN corepack enable
RUN pnpm install --frozen-lockfile
```

L'installation est répétée indépendamment dans l'image backend et l'image
frontend. Aucun cache pnpm BuildKit explicite n'est déclaré.

Références :
`docker/backend.Dockerfile`,
`docker/frontend.Dockerfile`.

### 3.6 Génération Prisma après installation

Le README place la génération du client Prisma après l'installation :

```bash
pnpm prisma:generate
```

Le script appelle le Prisma CLI local du backend. Le Dockerfile backend exécute
également la génération avant le build NestJS.

La génération Prisma n'est pas déclenchée automatiquement par un
`postinstall`. Elle constitue une étape explicite.

Références :
`README.md`,
`package.json`,
`docker/backend.Dockerfile`,
`apps/backend/prisma.config.ts`.

### 3.7 Installation des applications séparées

Le dépôt ne documente pas deux installations locales séparées. La commande
racine installe `apps/frontend` et `apps/backend` par le workspace.

Les scripts ciblés utilisent ensuite les dépendances installées avec :

```text
pnpm --dir apps/backend ...
pnpm --dir apps/frontend ...
```

Ces préfixes changent le répertoire d'exécution ; ils ne constituent pas une
seconde procédure d'installation.

Référence :
`package.json`.

## 4. Organisation des dépendances

### 4.1 Vue d'ensemble

| Niveau | Manifest | Dépendances d'exécution | Dépendances de développement |
| --- | --- | --- | --- |
| Racine | `package.json` | Aucune | ESLint, Prettier, dotenv et configuration TypeScript ESLint |
| Frontend | `apps/frontend/package.json` | Next.js, React, QR Code et utilitaires CSS | TypeScript, types React/Node, Tailwind, PostCSS et Autoprefixer |
| Backend | `apps/backend/package.json` | NestJS, Prisma Client, validation, sécurité, configuration, RxJS et Puppeteer | Nest CLI, Prisma CLI, TypeScript, Jest, Supertest et ts-node |
| Packages partagés | Aucun | Aucun package interne | Aucun package interne |

### 4.2 Dépendances racine

La racine ne déclare aucune clé `dependencies`. Ses `devDependencies` sont :

| Package | Rôle observé |
| --- | --- |
| `@eslint/js` | Configuration ESLint JavaScript |
| `@next/eslint-plugin-next` | Règles Next.js |
| `dotenv` | Chargement d'environnement dans les scripts |
| `eslint` | Analyse statique |
| `eslint-config-prettier` | Compatibilité ESLint/Prettier |
| `globals` | Globals de configuration ESLint |
| `prettier` | Formatage |
| `typescript-eslint` | Analyse TypeScript par ESLint |

Références :
`package.json`,
`eslint.config.mjs`.

### 4.3 Dépendances frontend

| Type | Packages déclarés |
| --- | --- |
| Exécution | `class-variance-authority`, `clsx`, `next`, `qrcode`, `react`, `react-dom`, `tailwind-merge` |
| Développement | `@types/node`, `@types/react`, `@types/react-dom`, `autoprefixer`, `postcss`, `tailwindcss`, `typescript` |

Le frontend ne déclare ni client Prisma, ni pilote PostgreSQL, ni dépendance
NestJS. Il communique avec le backend par HTTP.

Références :
`apps/frontend/package.json`,
`apps/frontend/lib/api.ts`,
`apps/frontend/lib/api-route.ts`.

### 4.4 Dépendances backend

| Groupe | Packages déclarés |
| --- | --- |
| NestJS | `@nestjs/common`, `@nestjs/config`, `@nestjs/core`, `@nestjs/mapped-types`, `@nestjs/platform-express`, `@nestjs/throttler` |
| Données | `@prisma/client` |
| Validation et configuration | `class-transformer`, `class-validator`, `dotenv`, `joi` |
| HTTP et sécurité | `body-parser`, `helmet` |
| PDF | `puppeteer` |
| Runtime | `reflect-metadata`, `rxjs` |
| Build et types | `@nestjs/cli`, `@types/body-parser`, `@types/node`, `typescript`, `ts-node`, `tsconfig-paths` |
| Tests | `@nestjs/testing`, `@types/jest`, `@types/supertest`, `jest`, `supertest`, `ts-jest` |
| Prisma CLI | `prisma` |

Le backend ne déclare pas de pilote PostgreSQL direct. L'accès à la base passe
par Prisma Client.

Références :
`apps/backend/package.json`,
`apps/backend/src/common/prisma/prisma.service.ts`.

### 4.5 Packages partagés

Aucun package partagé n'existe entre les deux applications. Le workspace
inclut seulement les répertoires sous `apps`, et chacun possède ses propres
sources et dépendances.

Il n'existe pas :

- de répertoire `packages` ;
- de package de types partagé ;
- de bibliothèque UI publiée comme package interne ;
- de package Prisma distinct.

Référence :
`pnpm-workspace.yaml`.

## 5. Scripts disponibles

### 5.1 Installation

| Commande | Type | Rôle |
| --- | --- | --- |
| `pnpm install` | Commande pnpm documentée | Installer tout le workspace |
| `pnpm.cmd install` | Variante Windows documentée | Installer le même workspace lorsque le shim PowerShell est bloqué |
| `pnpm install --frozen-lockfile` | Commande des Dockerfiles | Installer sans modifier le lockfile |
| `corepack enable` | Commande des Dockerfiles | Rendre pnpm disponible dans l'image Node.js |

Aucun script nommé `install` n'est déclaré dans `package.json`.

### 5.2 Scripts racine de développement et build

| Script | Rôle réel |
| --- | --- |
| `pnpm dev` | Démarrer backend et frontend simultanément |
| `pnpm dev:backend` | Démarrer NestJS en mode watch |
| `pnpm dev:frontend` | Démarrer Next.js en développement |
| `pnpm build` | Construire backend puis frontend |
| `pnpm build:backend` | Compiler le backend avec Nest CLI |
| `pnpm build:frontend` | Construire le frontend avec Next.js |
| `pnpm typecheck` | Vérifier les types des deux applications |
| `pnpm typecheck:backend` | Vérifier les types backend |
| `pnpm typecheck:frontend` | Vérifier les types frontend |

Références :
`package.json`,
`scripts/dev.mjs`.

### 5.3 Scripts racine de qualité et tests

| Script | Rôle réel |
| --- | --- |
| `pnpm lint` | Exécuter ESLint sur le dépôt |
| `pnpm lint:fix` | Exécuter ESLint avec corrections |
| `pnpm format` | Formater avec Prettier |
| `pnpm format:check` | Vérifier le format sans modifier les fichiers |
| `pnpm check` | Enchaîner lint, typecheck et build |
| `pnpm validate` | Format, Prisma, types, lint, tests, builds et proxy |
| `pnpm validate:backend` | Prisma, types, tests et build backend |
| `pnpm validate:frontend` | Types, build frontend et test du proxy |
| `pnpm test` | Alias des tests backend |
| `pnpm test:backend` | Exécuter les tests end-to-end Jest |
| `pnpm test:proxy` | Démarrer les applications sur des ports temporaires et vérifier le proxy |

`lint:fix` et `format` écrivent dans le dépôt. Les autres contrôles listés
n'ont pas pour objet de modifier les sources, à l'exception des artefacts de
génération et de build produits par leurs sous-commandes.

Références :
`package.json`,
`scripts/validate-proxy.mjs`,
`apps/backend/test/jest-e2e.json`.

### 5.4 Scripts Docker et PostgreSQL

| Script | Rôle réel |
| --- | --- |
| `pnpm db:up` | Exécuter `docker compose up -d` |
| `pnpm db:down` | Exécuter `docker compose down` |
| `pnpm db:status` | Exécuter `docker compose ps` |

Sans profil explicite, `db:up` démarre uniquement PostgreSQL. Le backend et le
frontend sont associés au profil Compose `app`.

Références :
`package.json`,
`docker-compose.yml`.

### 5.5 Scripts Prisma racine

| Script | Commande Prisma exécutée | Rôle |
| --- | --- | --- |
| `pnpm prisma:generate` | `prisma generate` | Générer Prisma Client |
| `pnpm prisma:status` | `prisma migrate status` | Afficher l'état des migrations |
| `pnpm prisma:migrate` | `prisma migrate dev` | Créer ou appliquer une migration de développement |
| `pnpm prisma:migrate:deploy` | `prisma migrate deploy` | Appliquer les migrations versionnées |
| `pnpm prisma:seed` | `prisma db seed` | Exécuter le seed configuré |

Tous ces scripts utilisent le Prisma CLI installé dans le backend.

Références :
`package.json`,
`apps/backend/prisma.config.ts`.

### 5.6 Scripts de nettoyage Windows

| Script | Rôle réel |
| --- | --- |
| `pnpm clean:windows` | Supprimer les builds et fichiers TypeScript incrémentaux |
| `pnpm clean:windows:dev` | Ajouter l'arrêt des serveurs sur les ports connus |
| `pnpm clean:windows:prisma` | Ajouter la régénération du client Prisma |

Ces scripts nécessitent PowerShell. Le mode Prisma vérifie d'abord que le CLI
local existe et demande d'exécuter `pnpm install` s'il est absent.

Références :
`package.json`,
`scripts/clean-windows.ps1`.

### 5.7 Scripts propres au frontend

| Commande | Rôle |
| --- | --- |
| `pnpm --dir apps/frontend dev` | Démarrer Next.js en développement |
| `pnpm --dir apps/frontend build` | Construire Next.js |
| `pnpm --dir apps/frontend start` | Servir un build Next.js |
| `pnpm --dir apps/frontend typecheck` | Vérifier les types frontend |

Le frontend ne déclare aucun script `lint` ou `test` dans son propre manifest.
Le lint frontend passe par le script racine.

Référence :
`apps/frontend/package.json`.

### 5.8 Scripts propres au backend

| Commande | Rôle |
| --- | --- |
| `pnpm --dir apps/backend dev` | Démarrer NestJS en mode watch |
| `pnpm --dir apps/backend build` | Construire NestJS |
| `pnpm --dir apps/backend start` | Exécuter `dist/main.js` |
| `pnpm --dir apps/backend typecheck` | Vérifier les types backend |
| `pnpm --dir apps/backend test` | Exécuter les tests end-to-end |
| `pnpm --dir apps/backend admin:create` | Créer l'administrateur initial si son courriel n'existe pas |
| `pnpm --dir apps/backend pins:backfill` | Hacher les anciens PIN |
| `pnpm --dir apps/backend snapshots:backfill` | Compléter les instantanés de planning |
| `pnpm --dir apps/backend prisma:generate` | Générer Prisma Client |
| `pnpm --dir apps/backend prisma:migrate` | Exécuter `migrate dev` |
| `pnpm --dir apps/backend prisma:migrate:deploy` | Exécuter `migrate deploy` |
| `pnpm --dir apps/backend prisma:seed` | Exécuter le seed |

Référence :
`apps/backend/package.json`.

## 6. Vérification de l'installation

### 6.1 Génération Prisma

La première vérification documentée après l'installation est :

```bash
pnpm prisma:generate
```

Elle confirme que les packages `prisma` et `@prisma/client` sont accessibles,
que la configuration Prisma est lisible et que le client peut être généré
depuis le schéma.

Références :
`README.md`,
`package.json`,
`apps/backend/prisma.config.ts`.

### 6.2 Vérification TypeScript

```bash
pnpm typecheck
```

Cette commande appelle le compilateur TypeScript local dans chaque application
avec `--noEmit`. Une absence de TypeScript ou de types requis empêche cette
vérification d'aboutir.

Références :
`package.json`,
`apps/backend/tsconfig.json`,
`apps/frontend/tsconfig.json`.

### 6.3 Vérification ESLint et Prettier

```bash
pnpm lint
pnpm format:check
```

Ces commandes vérifient que les exécutables et plugins racine sont installés
et que les fichiers respectent les configurations suivies.

Références :
`package.json`,
`eslint.config.mjs`,
`.prettierrc.json`.

### 6.4 Vérification par les builds

```bash
pnpm build
```

Le build utilise successivement Nest CLI et Next.js CLI. Il vérifie donc
l'installation des dépendances de compilation et des dépendances importées
par les deux applications.

Le build backend dépend également d'un client Prisma généré. Le cycle complet
du README place `prisma:generate` avant les builds.

Références :
`package.json`,
`README.md`.

### 6.5 Vérification complète

```bash
pnpm validate
```

La validation complète exécute :

1. `format:check` ;
2. `prisma:generate` ;
3. `typecheck` ;
4. `lint` ;
5. `test:backend` ;
6. `build:frontend` ;
7. `build:backend` ;
8. `test:proxy`.

Cette commande vérifie davantage que l'installation des packages. Elle exige
aussi les fichiers d'environnement, PostgreSQL de test et la disponibilité des
ports temporaires utilisés par le test du proxy.

Références :
`package.json`,
`README.md`,
`scripts/validate-proxy.mjs`.

### 6.6 Vérification ciblée

Le dépôt fournit deux chaînes plus limitées :

```bash
pnpm validate:backend
pnpm validate:frontend
```

La première exige Prisma et les tests backend. La seconde exige le build
frontend et le raccordement temporaire au backend par le test du proxy.

Référence :
`package.json`.

### 6.7 Vérification de la base et des migrations

Lorsque Docker et PostgreSQL sont prêts :

```bash
pnpm db:status
pnpm prisma:status
```

Ces commandes vérifient respectivement l'état Compose et l'accès de Prisma à
la base. Elles ne sont pas nécessaires pour confirmer la seule création des
`node_modules`, mais elles font partie du cycle d'installation complet.

Références :
`package.json`,
`README.md`,
`docker-compose.yml`.

### 6.8 Absence de commande dédiée

Le dépôt ne possède aucun script nommé :

- `doctor` ;
- `dependencies:check` ;
- `install:check` ;
- `bootstrap`.

Les vérifications disponibles sont donc la génération Prisma, le typecheck, le
lint, les builds, les tests et les chaînes `check` ou `validate`.

## 7. Diagramme

```text
+---------------------------+
| Clone                     |
| copie locale du dépôt     |
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
| Résolution des dépendances|
| manifests + lockfile      |
+-------------+-------------+
              |
              v
+---------------------------+
| Workspace pnpm            |
| . + apps/backend          |
|   + apps/frontend         |
+-------------+-------------+
              |
              v
+---------------------------+
| Applications prêtes       |
| Prisma generate puis      |
| contrôles/builds          |
+---------------------------+
```

Le diagramme représente le flux local documenté. L'installation Docker ajoute
Corepack et impose le lockfile figé, mais résout le même workspace.

## 8. Traçabilité

### 8.1 Commandes d'installation

| Commande | Fichiers concernés |
| --- | --- |
| `pnpm install` | `README.md`, `package.json`, `pnpm-workspace.yaml` |
| `pnpm.cmd install` | `README.md` |
| `corepack enable` | `docker/backend.Dockerfile`, `docker/frontend.Dockerfile` |
| `pnpm install --frozen-lockfile` | `docker/backend.Dockerfile`, `docker/frontend.Dockerfile` |
| `pnpm prisma:generate` | `package.json`, `apps/backend/prisma.config.ts` |

### 8.2 Gestion du workspace

| Information | Fichiers concernés |
| --- | --- |
| Gestionnaire et moteurs | `package.json` |
| Packages membres | `pnpm-workspace.yaml` |
| Résolution exacte | `pnpm-lock.yaml` |
| Dépendances racine | `package.json` |
| Dépendances frontend | `apps/frontend/package.json` |
| Dépendances backend | `apps/backend/package.json` |
| Dépendances autorisées à construire | `pnpm-workspace.yaml` |
| Overrides transitifs | `pnpm-workspace.yaml`, `pnpm-lock.yaml` |

### 8.3 Scripts et contrôles

| Domaine | Fichiers concernés |
| --- | --- |
| Développement conjoint | `package.json`, `scripts/dev.mjs` |
| Build, types, lint et format | `package.json` |
| Tests backend | `package.json`, `apps/backend/test/jest-e2e.json` |
| Test du proxy | `package.json`, `scripts/validate-proxy.mjs` |
| Scripts backend | `apps/backend/package.json` |
| Scripts frontend | `apps/frontend/package.json` |
| Scripts Windows | `package.json`, `scripts/clean-windows.ps1` |
| Configuration ESLint | `eslint.config.mjs` |
| Configuration Prettier | `.prettierrc.json`, `.prettierignore` |
| Configuration TypeScript | `apps/backend/tsconfig.json`, `apps/frontend/tsconfig.json` |
| Configuration Prisma | `apps/backend/prisma.config.ts` |

## 9. Observations

### 9.1 Dépendances optionnelles observées

- `API_BASE_URL` est une configuration serveur facultative du frontend, pas
  une dépendance de package ;
- les paramètres Cloudinary sont conditionnels au stockage des preuves photo ;
- Chromium ou Chrome est nécessaire au rendu PDF premium, mais pas à
  l'installation de base ni au démarrage des autres routes ;
- PowerShell est nécessaire uniquement aux scripts de nettoyage Windows ;
- les outils de test sont des `devDependencies` et ne sont pas appelés par les
  scripts `start` des applications ;
- `ATTENDANCE_PDF_ALLOW_LEGACY_FALLBACK` peut autoriser le moteur PDF
  historique, sans supprimer la dépendance Puppeteer du manifest.

Références :
`apps/backend/package.json`,
`apps/backend/.env.example`,
`apps/frontend/.env.example`,
`docker/backend.Dockerfile`.

### 9.2 Contraintes

- le workspace exige Node.js `>=20.9.0 <23` ;
- pnpm doit être en version 10 ou ultérieure ;
- la version déclarée du gestionnaire est `10.26.0` ;
- le lockfile est unique pour la racine et les deux applications ;
- les builds Docker utilisent obligatoirement le lockfile figé ;
- Prisma Client doit être généré explicitement ;
- le backend dépend d'une base PostgreSQL pour les migrations et les tests
  end-to-end ;
- `pnpm validate` ne constitue pas un contrôle hors ligne des seuls packages :
  il démarre et teste des composants applicatifs ;
- les scripts utilisent les binaires locaux sous `node_modules`.

### 9.3 Particularités du monorepo

- la racine centralise les scripts transversaux ;
- les packages membres sont uniquement `apps/backend` et `apps/frontend` ;
- aucun package partagé n'est présent ;
- la racine ne possède aucune dépendance d'exécution ;
- les applications ne répètent pas la version de pnpm ni les contraintes
  Node.js dans leurs propres manifests ;
- le frontend n'a pas de script `lint` propre ;
- le frontend n'a aucun script de test propre ;
- le backend contient les outils Prisma et les tests ;
- aucune étape `postinstall` ne génère Prisma automatiquement ;
- aucun script personnalisé `install` n'est défini ;
- aucun lockfile npm, Yarn ou Bun n'est présent ;
- aucun registre privé n'est configuré ;
- aucun cache Docker pnpm explicite n'est configuré.

Références :
`package.json`,
`pnpm-workspace.yaml`,
`apps/backend/package.json`,
`apps/frontend/package.json`,
`docker/backend.Dockerfile`,
`docker/frontend.Dockerfile`.
