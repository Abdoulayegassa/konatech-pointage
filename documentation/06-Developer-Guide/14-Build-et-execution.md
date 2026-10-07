# Developer Guide — Build et exécution

| Métadonnée | Valeur |
|---|---|
| Document ID | DG-014 |
| Titre | Build et exécution |
| Version | 1.0 |
| Statut | Validé |
| Classification | Interne |
| Référence | Developer Guide |
| Projet | Konatech Pointage |

## 1. Présentation

Konatech Pointage est construit comme un workspace pnpm composé d'une application backend NestJS et d'une application frontend Next.js. PostgreSQL est démarré localement par Docker Compose. Prisma Client est généré depuis le package backend et les migrations préparent le schéma de données.

Le dépôt définit trois parcours d'exécution : le développement local simultané ou séparé, l'exécution directe des builds produits par chaque package, et l'exécution conteneurisée du profil Compose `app`. Les commandes, étapes et dépendances décrites ci-dessous proviennent des manifestes, scripts, Dockerfiles, configurations et instructions actives du dépôt.

## 2. Architecture d'exécution

### 2.1 Cycle local

```text
Code source du monorepo
          |
          v
pnpm install
          |
          +--> dépendances racine
          +--> apps/backend
          +--> apps/frontend
          |
          v
PostgreSQL par pnpm db:up
          |
          v
Prisma generate + migration + seed éventuel
          |
          +-------------------------------+
          |                               |
          v                               v
NestJS start --watch                Next.js dev
          |                               |
          +---------------+---------------+
                          v
                 Applications locales
```

### 2.2 Cycle de build et d'exécution conteneurisé

```text
Code + package.json + pnpm-lock.yaml
                 |
                 v
pnpm install --frozen-lockfile
          /                         \
         v                           v
Prisma generate                 Next.js build
         |                           |
         v                           v
NestJS build                    image frontend
         |
         v
image backend avec Chromium
         |
         v
PostgreSQL sain
         |
         v
prisma migrate deploy
         |
         v
node dist/main.js sain
         |
         v
next start
```

Le frontend conteneurisé dépend de la santé du backend; le backend dépend de la santé de PostgreSQL. Ces relations sont déclarées dans `docker-compose.yml`.

## 3. Installation des dépendances

| Contexte | Commande réellement utilisée | Portée | Source |
|---|---|---|---|
| Installation locale | `pnpm install` | Racine et packages `apps/*` du workspace | `README.md`, `pnpm-workspace.yaml` |
| Image backend | `pnpm install --frozen-lockfile` | Workspace copié dans l'étape de build | `docker/backend.Dockerfile` |
| Image frontend | `pnpm install --frozen-lockfile` | Workspace copié dans l'étape de build | `docker/frontend.Dockerfile` |

Le manifeste racine déclare pnpm comme gestionnaire et contraint les versions de Node.js et pnpm. `pnpm-workspace.yaml` inclut `apps/*`, liste les dépendances autorisées à exécuter leur étape de build et contient les substitutions de dépendances transitives du dépôt.

Les deux Dockerfiles copient d'abord les manifestes et le verrou, exécutent l'installation figée, puis copient le reste du dépôt. `.dockerignore` exclut notamment Git, les dépendances locales, les builds précédents, les journaux et les fichiers d'environnement actifs du contexte Docker.

## 4. Compilation

### 4.1 Backend NestJS

La commande racine est :

```bash
pnpm build:backend
```

Elle exécute le binaire Nest CLI du package backend avec `build`. La commande équivalente définie dans le package est :

```bash
pnpm --dir apps/backend build
```

| Élément | Configuration observée | Source |
|---|---|---|
| Racine source | `src` | `apps/backend/nest-cli.json` |
| Sortie | `apps/backend/dist` | `apps/backend/tsconfig.json` |
| Module | CommonJS | `apps/backend/tsconfig.json` |
| Cible JavaScript | ES2022 | `apps/backend/tsconfig.json` |
| Décorateurs | Métadonnées et décorateurs TypeScript activés | `apps/backend/tsconfig.json` |
| Build | Tests, `dist` et fichiers `*.spec.ts` exclus | `apps/backend/tsconfig.build.json` |
| Nettoyage | Le répertoire de sortie est supprimé par Nest CLI avant compilation | `apps/backend/nest-cli.json` |
| Point d'exécution | `dist/main.js` | `apps/backend/package.json`, `docker/backend.Dockerfile` |

Le typecheck backend est une commande distincte qui n'émet aucun fichier :

```bash
pnpm typecheck:backend
```

### 4.2 Frontend Next.js

La commande racine est :

```bash
pnpm build:frontend
```

Elle appelle `next build` dans le package frontend. La commande locale du package est également disponible :

```bash
pnpm --dir apps/frontend build
```

| Élément | Configuration observée | Source |
|---|---|---|
| Framework de build | Next.js | `apps/frontend/package.json` |
| Sources | App Router et fichiers TypeScript/TSX du package | `apps/frontend/app/`, `apps/frontend/tsconfig.json` |
| Sortie | `.next` | Next.js, `.dockerignore`, `scripts/clean-windows.ps1` |
| Cible TypeScript | ES2020 avec résolution `bundler` | `apps/frontend/tsconfig.json` |
| Émission TypeScript | Désactivée dans `tsconfig`; Next.js produit son propre build | `apps/frontend/tsconfig.json` |
| Mode React | `reactStrictMode` activé | `apps/frontend/next.config.ts` |
| ESLint pendant le build | Ignoré par la configuration Next.js | `apps/frontend/next.config.ts` |

Le contrôle TypeScript frontend est séparé :

```bash
pnpm typecheck:frontend
```

### 4.3 Prisma

La génération de Prisma Client est exposée par :

```bash
pnpm prisma:generate
```

`apps/backend/prisma.config.ts` désigne `prisma/schema.prisma`, le répertoire `prisma/migrations` et la commande de seed. Le Dockerfile backend exécute `prisma generate` avant `pnpm --dir apps/backend build`.

Le script racine `build` n'appelle que les deux builds applicatifs :

```bash
pnpm build
```

Son ordre est backend puis frontend. La génération Prisma apparaît séparément dans `validate`, `validate:backend` et le Dockerfile backend.

### 4.4 Contrôles associés au build

| Commande | Enchaînement défini |
|---|---|
| `pnpm check` | Lint, typecheck des deux applications, build backend puis frontend |
| `pnpm validate:backend` | Prisma Generate, typecheck backend, tests backend, build backend |
| `pnpm validate:frontend` | Typecheck frontend, build frontend, test du proxy |
| `pnpm validate` | Format check, Prisma Generate, typecheck, lint, tests backend, build frontend, build backend, test du proxy |

## 5. Exécution en développement

### 5.1 Préparation locale définie dans le README

Les commandes présentes pour préparer l'environnement local sont :

```bash
pnpm install
pnpm db:up
pnpm prisma:generate
pnpm prisma:status
pnpm prisma:migrate
pnpm prisma:seed
```

`pnpm db:up` exécute `docker compose up -d`. Comme les applications appartiennent au profil `app`, cette commande démarre le service PostgreSQL par défaut. `prisma:migrate` utilise `migrate dev`; `prisma:seed` exécute le fichier déclaré dans Prisma Config.

### 5.2 Démarrage simultané

```bash
pnpm dev
```

`scripts/dev.mjs` démarre :

- le backend avec Nest CLI `start --watch` depuis `apps/backend` ;
- le frontend avec Next CLI `dev` depuis `apps/frontend`.

Le script transmet l'environnement et les flux standard du processus parent. `SIGINT` et `SIGTERM` sont propagés aux deux enfants. La sortie imprévue d'une application déclenche l'arrêt de l'autre.

### 5.3 Démarrage séparé

```bash
pnpm dev:backend
pnpm dev:frontend
```

Ces scripts exécutent les mêmes modes de développement que l'orchestrateur, mais un seul composant à la fois. Aucun de ces scripts ne démarre PostgreSQL, ne génère Prisma Client, n'applique les migrations ou n'exécute le seed.

### 5.4 Validation de l'exécution locale

```bash
pnpm test:proxy
```

`scripts/validate-proxy.mjs` choisit des ports disponibles, démarre NestJS et Next.js en développement, attend la santé backend et le proxy de santé frontend, puis vérifie la redirection publique du pointage. Les deux processus sont arrêtés après le contrôle, y compris dans le chemin d'erreur.

## 6. Build de production

### 6.1 Build direct par pnpm

```bash
pnpm build
```

Cette commande produit `apps/backend/dist` puis le build `.next` du frontend. Les scripts de démarrage de chaque package exécutent ces sorties :

```bash
pnpm --dir apps/backend start
pnpm --dir apps/frontend start
```

Le backend lance `node dist/main.js`. Le frontend lance `next start`. Aucun script `start` global n'est défini à la racine.

### 6.2 Image backend

Le Dockerfile backend comporte une étape de base, une étape de build et une étape d'exécution :

1. activation de Corepack et configuration du chemin pnpm ;
2. copie des manifestes et installation par verrou ;
3. copie du dépôt ;
4. définition d'une URL de datasource de build ;
5. génération de Prisma Client ;
6. build NestJS ;
7. installation de Chromium, certificats et polices dans l'image d'exécution ;
8. copie du workspace construit ;
9. au démarrage, `prisma migrate deploy` puis `node dist/main.js`.

La seconde commande du `CMD` n'est exécutée que si la migration termine avec succès, car les deux commandes sont reliées par `&&`.

### 6.3 Image frontend

Le Dockerfile frontend :

1. active Corepack ;
2. reçoit `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_API_BASE_URL` et `API_BASE_URL` comme arguments ;
3. installe le workspace avec le verrou ;
4. copie le dépôt ;
5. exécute le build frontend en mode production ;
6. copie le workspace construit dans l'étape d'exécution ;
7. lance Next.js avec une adresse et un port explicitement définis dans le `CMD`.

### 6.4 Build et démarrage Compose documentés

Le README définit la commande de production Compose suivante :

```bash
docker compose --env-file .env.production --profile app up -d --build
```

Cette commande construit les deux images et démarre le profil `app` avec PostgreSQL. Le fichier `.env.production.example` fournit la liste des variables attendues, sans constituer lui-même le fichier actif référencé par la commande.

L'état des conteneurs est contrôlé par la commande documentée :

```bash
docker compose --env-file .env.production ps
```

## 7. Services démarrés

| Mode | Service ou processus | Démarrage | Dépendance observée | Contrôle disponible |
|---|---|---|---|---|
| Local, `pnpm db:up` | PostgreSQL | Docker Compose, service par défaut | Volume `postgres-data` | `pg_isready` et `pnpm db:status` |
| Local, `pnpm dev` | Backend NestJS | Nest CLI avec surveillance | Variables backend, Prisma Client et PostgreSQL pour les opérations de données | `GET /api/v1/health` |
| Local, `pnpm dev` | Frontend Next.js | Next CLI en développement | URL backend pour les appels API | `GET /api/health` |
| Direct après build | Backend compilé | `node dist/main.js` via script `start` | Configuration backend et base pour les routes de données | Endpoint de santé backend |
| Direct après build | Frontend compilé | `next start` via script `start` | Build `.next` et variables d'URL | Proxy de santé frontend |
| Compose, profil `app` | PostgreSQL | Image `postgres:16-alpine` | Variables PostgreSQL et volume nommé | `pg_isready` |
| Compose, profil `app` | Backend | Image construite par `docker/backend.Dockerfile` | Attend PostgreSQL sain; applique les migrations avant NestJS | Requête HTTP locale au conteneur |
| Compose, profil `app` | Frontend | Image construite par `docker/frontend.Dockerfile` | Attend le backend sain | Requête HTTP vers `/api/health` |

Le profil `app` n'est pas activé par `pnpm db:up`. L'orchestration complète utilise la commande Compose avec `--profile app` documentée dans le README.

## 8. Traçabilité

| Étape documentée | Fichier ou répertoire source | Preuve observée |
|---|---|---|
| Gestionnaire et versions | `package.json`, `pnpm-lock.yaml` | Gestionnaire déclaré, contraintes de moteurs et verrou |
| Workspace | `pnpm-workspace.yaml` | Inclusion de `apps/*` et configuration pnpm |
| Installation locale | `README.md` | Commande `pnpm install` et prérequis |
| Scripts de build | `package.json`, `apps/backend/package.json`, `apps/frontend/package.json` | Commandes racine et commandes propres aux packages |
| Orchestration de développement | `scripts/dev.mjs` | Processus NestJS/Next.js et propagation des signaux |
| Contrôle de connexion | `scripts/validate-proxy.mjs` | Démarrage temporaire, santé, proxy et redirection |
| Compilation backend | `apps/backend/nest-cli.json`, `apps/backend/tsconfig.json`, `apps/backend/tsconfig.build.json` | Source, sortie, cible et exclusions |
| Build frontend | `apps/frontend/next.config.ts`, `apps/frontend/tsconfig.json` | Options Next.js et TypeScript |
| Génération Prisma | `apps/backend/prisma.config.ts`, `apps/backend/prisma/schema.prisma`, scripts pnpm | Schéma et commande Generate |
| Migrations | `apps/backend/prisma/migrations/`, `docker/backend.Dockerfile` | Historique SQL et `migrate deploy` au démarrage |
| Seed | `apps/backend/prisma.config.ts`, `apps/backend/prisma/seed.ts` | Commande et données d'initialisation |
| Contexte Docker | `.dockerignore` | Exclusions du contexte de build |
| Image backend | `docker/backend.Dockerfile` | Installation, génération, build, runtime et commande |
| Image frontend | `docker/frontend.Dockerfile` | Arguments, installation, build et commande |
| Services Compose | `docker-compose.yml` | Profil, ports, dépendances et contrôles de santé |
| Configuration de production | `.env.production.example`, `README.md` | Variables attendues et commande Compose documentée |
| Documentation liée | `documentation/06-Developer-Guide/11-Build-et-deploiement.md`, `documentation/06-Developer-Guide/12-Variables-denvironnement.md`, `documentation/06-Developer-Guide/13-Scripts-et-automatisation.md` | Détails recoupés avec les fichiers exécutables |

## 9. Observations

- Le workspace utilise pnpm sans configuration Turbo ni Makefile.
- Le build racine compile le backend avant le frontend.
- Prisma Generate est séparé du script `build` racine.
- Les scripts `validate` et `validate:backend` exécutent Prisma Generate avant le build backend.
- Le backend produit du JavaScript CommonJS dans `apps/backend/dist`.
- Le frontend produit son build avec Next.js dans `apps/frontend/.next`.
- Le lint est ignoré pendant `next build` et reste disponible par le script ESLint racine.
- `pnpm dev` démarre les deux applications, mais pas PostgreSQL ni les commandes Prisma.
- `pnpm db:up` démarre PostgreSQL sans activer le profil applicatif Compose.
- L'image backend génère Prisma Client pendant le build et applique les migrations au démarrage.
- L'image frontend reçoit les URL publiques et serveur pendant son build.
- Compose ordonne PostgreSQL, backend et frontend par conditions de santé.
- Aucun workflow GitHub Actions n'est présent dans le dépôt analysé.
