# Build et déploiement

| Métadonnée         | Valeur               |
| ------------------ | -------------------- |
| Document ID        | DG-011               |
| Titre              | Build et déploiement |
| Version            | 1.0                  |
| Statut             | Validé               |
| Classification     | Interne              |
| Référence          | Developer Guide      |
| Date de génération | 30 juillet 2026      |

## 1. Présentation

### 1.1 Objectif

Ce chapitre décrit les mécanismes de construction, de démarrage et de déploiement réellement présents dans le dépôt Konatech Pointage. Il couvre les scripts pnpm, la compilation NestJS, le build Next.js, Prisma Client, les migrations PostgreSQL et l'orchestration Docker Compose.

La procédure de déploiement implémentée dans le dépôt repose sur les deux Dockerfiles et sur `docker-compose.yml`. Aucun pipeline CI/CD versionné ni manifeste propre à une plateforme cloud n'est présent.

### 1.2 Processus couvert

Le processus observable comprend :

- l'installation verrouillée des dépendances du workspace ;
- la génération de Prisma Client ;
- la compilation du backend vers `dist` ;
- la construction de l'application Next.js ;
- la construction d'images Docker multi-étapes ;
- l'application des migrations Prisma au démarrage du conteneur backend ;
- le démarrage ordonné de PostgreSQL, du backend et du frontend ;
- les healthchecks Docker des trois services.

Le seed Prisma existe sous forme de commande explicite. Il ne fait pas partie du démarrage automatique des conteneurs.

## 2. Architecture de déploiement

### 2.1 Composants

| Composant       | Implémentation présente                             | Rôle au déploiement                                                 |
| --------------- | --------------------------------------------------- | ------------------------------------------------------------------- |
| Frontend        | Next.js dans `apps/frontend`                        | Rend l'interface et expose les Route Handlers proxy                 |
| Backend         | NestJS dans `apps/backend`                          | Expose l'API `/api/v1` et exécute la logique métier                 |
| PostgreSQL      | Image `postgres:16-alpine`                          | Persiste les données                                                |
| Prisma          | Prisma Client, schéma et migrations dans le backend | Accès aux données et évolution du schéma                            |
| Docker backend  | `docker/backend.Dockerfile`                         | Génère Prisma, compile NestJS et fournit Chromium au runtime        |
| Docker frontend | `docker/frontend.Dockerfile`                        | Construit puis démarre Next.js                                      |
| Docker Compose  | `docker-compose.yml`                                | Construit et relie les trois services                               |
| Volume Docker   | `postgres-data`                                     | Conserve les données PostgreSQL entre les recréations de conteneurs |

### 2.2 Dépendances de démarrage

Le fichier Compose définit l'ordre suivant :

1. PostgreSQL démarre et son healthcheck `pg_isready` doit réussir ;
2. le backend, placé dans le profil `app`, attend PostgreSQL sain ;
3. le backend applique les migrations et démarre NestJS ;
4. le healthcheck backend appelle `/api/v1/health` ;
5. le frontend, également placé dans le profil `app`, attend le backend sain ;
6. le healthcheck frontend appelle `/api/health`, route qui transmet la vérification au backend.

Sans activation du profil `app`, le service PostgreSQL est le seul service démarré par les commandes Compose ordinaires du dépôt.

### 2.3 Diagramme de déploiement

```text
                     Docker Compose
                           |
              profile app | activé
                           v
┌───────────────────────────────────────────────────────┐
│ PostgreSQL 16                                         │
│ port conteneur 5432                                   │
│ volume postgres-data                                  │
│ healthcheck pg_isready                                │
└───────────────────────┬───────────────────────────────┘
                        │ service sain
                        v
┌───────────────────────────────────────────────────────┐
│ Backend NestJS                                        │
│ prisma migrate deploy                                 │
│ puis node dist/main.js                                │
│ port conteneur 4000                                   │
│ healthcheck /api/v1/health                            │
└───────────────────────┬───────────────────────────────┘
                        │ service sain / API HTTP
                        v
┌───────────────────────────────────────────────────────┐
│ Frontend Next.js                                      │
│ next start -H 0.0.0.0 -p 3000                        │
│ port conteneur 3000                                   │
│ healthcheck /api/health                               │
└───────────────────────────────────────────────────────┘
```

### 2.4 Ports et réseau

| Service    | Port interne | Port hôte configurable | Valeur par défaut observée |
| ---------- | -----------: | ---------------------- | -------------------------: |
| PostgreSQL |         5432 | `POSTGRES_PORT`        |                       5433 |
| Backend    |         4000 | `BACKEND_PORT`         |                       4000 |
| Frontend   |         3000 | `FRONTEND_PORT`        |                       3000 |

Compose utilise son réseau par défaut. Le backend joint PostgreSQL avec le nom de service `postgres`. Le frontend reçoit une URL d'API explicite ; aucune configuration de proxy inverse Nginx ou Traefik n'est fournie dans le dépôt.

## 3. Configuration du projet

### 3.1 Fichiers utilisés

| Fichier                             | Fonction réellement observée                                                                        |
| ----------------------------------- | --------------------------------------------------------------------------------------------------- |
| `package.json`                      | Versions requises de Node/pnpm et scripts du workspace                                              |
| `pnpm-workspace.yaml`               | Déclare `apps/*`, les dépendances autorisées à construire et les surcharges de versions transitives |
| `pnpm-lock.yaml`                    | Verrouille les versions installées                                                                  |
| `apps/backend/package.json`         | Scripts et dépendances propres à NestJS/Prisma                                                      |
| `apps/frontend/package.json`        | Scripts et dépendances propres à Next.js                                                            |
| `apps/backend/tsconfig.json`        | Compilation TypeScript backend en CommonJS vers `dist`                                              |
| `apps/backend/tsconfig.build.json`  | Exclut tests, distribution et fichiers de spécification du build                                    |
| `apps/frontend/tsconfig.json`       | Typage strict Next.js, résolution bundler et absence d'émission TypeScript directe                  |
| `apps/backend/nest-cli.json`        | Définit `src` comme racine et supprime `dist` avant compilation                                     |
| `apps/frontend/next.config.ts`      | Active React Strict Mode et ignore ESLint pendant `next build`                                      |
| `apps/backend/prisma.config.ts`     | Localise le schéma, les migrations, le seed et lit `DATABASE_URL`                                   |
| `apps/backend/prisma/schema.prisma` | Déclare PostgreSQL, Prisma Client, modèles et relations                                             |
| `apps/backend/prisma/migrations`    | Contient les migrations SQL appliquées par Prisma                                                   |
| `docker/backend.Dockerfile`         | Image de build et runtime du backend                                                                |
| `docker/frontend.Dockerfile`        | Image de build et runtime du frontend                                                               |
| `docker-compose.yml`                | Services, dépendances, variables, ports, volume et healthchecks                                     |
| `.dockerignore`                     | Exclut dépendances, builds, caches, logs et fichiers d'environnement du contexte copié              |
| `.env.production.example`           | Inventorie la configuration Compose de production                                                   |
| `apps/backend/.env.example`         | Inventorie la configuration backend locale                                                          |
| `apps/frontend/.env.example`        | Inventorie les URL frontend locales                                                                 |

### 3.2 Workspace et versions d'exécution

Le manifeste racine déclare :

| Élément           | Valeur                  |
| ----------------- | ----------------------- |
| Gestionnaire      | `pnpm@10.26.0`          |
| Node.js           | `>=20.9.0 <23`          |
| pnpm minimal      | `>=10.0.0`              |
| Workspaces        | `apps/*`                |
| Image Node Docker | `node:22-bookworm-slim` |
| Image PostgreSQL  | `postgres:16-alpine`    |

`pnpm-workspace.yaml` autorise explicitement les scripts de construction de NestJS, Prisma, Puppeteer et Sharp. Il contient aussi des surcharges de dépendances transitives.

### 3.3 Configuration backend

Le build backend utilise Nest CLI. `tsconfig.json` :

- cible ES2022 ;
- produit des modules CommonJS ;
- active les décorateurs et leurs métadonnées ;
- produit les déclarations et les sources maps ;
- retire les commentaires ;
- écrit dans `dist` ;
- active le mode strict.

`nest-cli.json` définit `src` comme racine et active `deleteOutDir`, ce qui supprime la sortie précédente avant une nouvelle compilation.

Au démarrage, `AppModule` charge la configuration avec `ConfigModule`. Le backend valide les variables avec Joi. En production, des contrôles supplémentaires portent notamment sur le secret JWT et l'URL frontend.

### 3.4 Configuration frontend

Le frontend est construit par `next build`. TypeScript est utilisé en mode strict et `noEmit`, car Next.js produit lui-même les artefacts.

`next.config.ts` contient deux options :

- `reactStrictMode: true` ;
- `eslint.ignoreDuringBuilds: true`.

Le lint n'est donc pas exécuté par `next build`. Il demeure une commande racine distincte et une étape de `validate`.

Les variables `NEXT_PUBLIC_APP_URL` et `NEXT_PUBLIC_API_BASE_URL` sont fournies au build de l'image frontend par `ARG`, puis transformées en variables d'environnement durant le build. `API_BASE_URL` suit le même mécanisme mais reste destinée au code exécuté côté serveur.

### 3.5 Configuration Prisma

`prisma.config.ts` :

- charge les variables avec `dotenv/config` ;
- référence `prisma/schema.prisma` ;
- référence `prisma/migrations` ;
- définit le seed TypeScript lancé avec `ts-node/register/transpile-only` ;
- lit l'URL de source depuis `DATABASE_URL`.

Le générateur du schéma produit `prisma-client-js` pour les cibles `native` et `debian-openssl-3.0.x`. Cette seconde cible correspond à l'environnement Linux de l'image.

### 3.6 Dockerfiles

Les deux Dockerfiles utilisent les étapes `base`, `build` et `runtime`.

| Étape                  | Backend                                            | Frontend                            |
| ---------------------- | -------------------------------------------------- | ----------------------------------- |
| Base                   | Node 22 slim, Corepack, `PNPM_HOME`, `/app`        | Même base                           |
| Manifeste              | Copie racine et manifestes des deux applications   | Même copie                          |
| Installation           | `pnpm install --frozen-lockfile`                   | `pnpm install --frozen-lockfile`    |
| Sources                | Copie du dépôt après installation                  | Même copie                          |
| Pré-build              | `prisma generate` avec une URL de build par défaut | Injection des trois URL via `ARG`   |
| Build                  | `pnpm --dir apps/backend build`                    | `pnpm --dir apps/frontend build`    |
| Runtime complémentaire | Chromium, certificats et polices                   | Aucun paquet système supplémentaire |
| Copie runtime          | Copie de `/app` depuis l'étape de build            | Même stratégie                      |
| Démarrage              | Migration puis `node dist/main.js`                 | `next start` sur `0.0.0.0:3000`     |

Les images conservent le workspace copié depuis l'étape de build. Aucun stage de réduction aux seules dépendances de production n'est défini.

## 4. Processus de build

### 4.1 Installation

Le dépôt utilise pnpm au niveau du workspace. Les Dockerfiles installent les dépendances avec :

```text
pnpm install --frozen-lockfile
```

Le lockfile est copié avant les sources. Les manifestes racine, backend et frontend sont également copiés avant l'installation, ce qui constitue la couche de résolution des dépendances.

### 4.2 Build local du workspace

Le script racine `build` enchaîne :

1. `build:backend` ;
2. `build:frontend`.

`build:backend` exécute directement le binaire Nest CLI installé dans `apps/backend`. `build:frontend` exécute directement le binaire Next.js installé dans `apps/frontend`.

Le script racine de build n'exécute ni `prisma:generate` ni une migration. La chaîne `validate` exécute explicitement `prisma:generate` avant le typage, les tests et les builds.

### 4.3 Build de l'image backend

L'image backend suit l'ordre réel suivant :

1. active Corepack ;
2. installe le workspace avec le lockfile figé ;
3. copie les sources ;
4. fournit une `DATABASE_URL` de build, avec une valeur PostgreSQL locale par défaut ;
5. génère Prisma Client ;
6. compile NestJS ;
7. installe Chromium, les certificats et les polices dans le runtime ;
8. copie le workspace construit ;
9. expose le port 4000.

La génération de Prisma Client n'établit pas une connexion nécessaire à la base configurée pour le runtime. La variable de build permet au chargement de configuration Prisma de disposer d'une URL.

### 4.4 Build de l'image frontend

L'image frontend suit l'ordre réel suivant :

1. reçoit `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_API_BASE_URL` et `API_BASE_URL` comme arguments ;
2. les expose pendant le build avec `NODE_ENV=production` ;
3. installe le workspace avec le lockfile figé ;
4. copie les sources ;
5. exécute le build Next.js ;
6. copie le workspace construit dans le runtime ;
7. expose le port 3000 ;
8. démarre Next.js en mode production.

Les valeurs `NEXT_PUBLIC_*` sont donc incorporées lors du build frontend. Compose les fournit aussi au conteneur en tant que variables de runtime.

### 4.5 Migration et démarrage

Le backend Docker exécute une commande shell unique :

```text
prisma migrate deploy
        |
        v
node dist/main.js
```

Le démarrage NestJS n'a lieu que si la commande de migration se termine avec succès, car les deux commandes sont reliées par `&&`.

Le frontend n'exécute aucune migration. Il démarre après le healthcheck backend grâce à `depends_on`.

### 4.6 Diagramme du processus

```text
Manifestes + pnpm-lock.yaml
             |
             v
pnpm install --frozen-lockfile
             |
             +----------------------------+
             |                            |
             v                            v
   prisma generate                Arguments d'URL
             |                    frontend
             v                            |
      nest build                         v
             |                    next build
             v                            |
      Image backend                Image frontend
             |                            |
             +-------------+--------------+
                           |
                           v
                 Docker Compose profile app
                           |
                           v
                    PostgreSQL sain
                           |
                           v
                 prisma migrate deploy
                           |
                           v
                    Backend NestJS sain
                           |
                           v
                     Frontend Next.js
```

### 4.7 Commande de déploiement documentée

La procédure Docker Compose présente dans le README utilise :

```text
docker compose --env-file .env.production --profile app up -d --build
```

Elle suppose la création préalable de `.env.production` à partir de `.env.production.example`. L'état est contrôlé avec `docker compose --env-file .env.production ps` et les journaux avec `docker compose --env-file .env.production logs -f backend frontend postgres`.

## 5. Scripts disponibles

### 5.1 Scripts racine

| Script                  | Commande ou enchaînement défini                     | Fonction                                                      |
| ----------------------- | --------------------------------------------------- | ------------------------------------------------------------- |
| `dev`                   | `node ./scripts/dev.mjs`                            | Démarre backend et frontend en développement                  |
| `build`                 | `build:backend` puis `build:frontend`               | Construit les deux applications                               |
| `build:backend`         | Nest CLI `build` dans le backend                    | Compile NestJS                                                |
| `build:frontend`        | Next.js `build` dans le frontend                    | Construit Next.js                                             |
| `typecheck`             | Contrôles backend puis frontend                     | Vérifie TypeScript                                            |
| `typecheck:backend`     | `tsc --noEmit` avec le tsconfig backend             | Vérifie le backend                                            |
| `typecheck:frontend`    | `tsc --noEmit` dans le frontend                     | Vérifie le frontend                                           |
| `lint`                  | `eslint .`                                          | Analyse le workspace                                          |
| `lint:fix`              | `eslint . --fix`                                    | Analyse et applique les corrections ESLint                    |
| `format`                | `prettier . --write`                                | Formate les fichiers pris en charge                           |
| `format:check`          | `prettier . --check`                                | Contrôle le formatage                                         |
| `check`                 | Lint, typecheck, build                              | Contrôle sans lancer les tests                                |
| `validate`              | Format, Prisma, types, lint, tests, builds et proxy | Validation locale complète                                    |
| `validate:backend`      | Prisma, types, tests et build backend               | Validation backend                                            |
| `validate:frontend`     | Types, build et proxy frontend                      | Validation frontend                                           |
| `test`                  | Alias de `test:backend`                             | Lance Jest backend                                            |
| `test:backend`          | Jest en série avec sa configuration e2e             | Lance les suites backend                                      |
| `test:proxy`            | `scripts/validate-proxy.mjs`                        | Vérifie la connexion frontend/backend                         |
| `db:up`                 | `docker compose up -d`                              | Démarre le service PostgreSQL par défaut                      |
| `db:down`               | `docker compose down`                               | Arrête la composition                                         |
| `db:status`             | `docker compose ps`                                 | Affiche l'état Compose                                        |
| `prisma:generate`       | Prisma `generate`                                   | Génère Prisma Client                                          |
| `prisma:status`         | Prisma `migrate status`                             | Lit l'état des migrations                                     |
| `prisma:migrate`        | Prisma `migrate dev`                                | Applique ou crée les migrations de développement selon Prisma |
| `prisma:migrate:deploy` | Prisma `migrate deploy`                             | Applique les migrations existantes                            |
| `prisma:seed`           | Prisma `db seed`                                    | Exécute le seed configuré                                     |
| `dev:backend`           | NestJS `start --watch`                              | Démarre uniquement le backend en surveillance                 |
| `dev:frontend`          | Next.js `dev`                                       | Démarre uniquement le frontend                                |
| `clean:windows`         | Script PowerShell                                   | Nettoie les artefacts Windows visés                           |
| `clean:windows:dev`     | Même script avec `-KillDevServers`                  | Ajoute l'arrêt des serveurs de développement                  |
| `clean:windows:prisma`  | Même script avec `-RegeneratePrisma`                | Ajoute la régénération Prisma                                 |

### 5.2 Scripts du backend

| Script                  | Fonction                                                   |
| ----------------------- | ---------------------------------------------------------- |
| `dev`                   | NestJS en surveillance                                     |
| `build`                 | Compilation NestJS                                         |
| `start`                 | Exécution de `dist/main.js`                                |
| `typecheck`             | Contrôle TypeScript                                        |
| `test`                  | Suites Jest backend en série                               |
| `admin:create`          | Création de l'administrateur initial par script TypeScript |
| `pins:backfill`         | Backfill des hachages de PIN                               |
| `snapshots:backfill`    | Backfill des instantanés de planning                       |
| `prisma:generate`       | Génération du client                                       |
| `prisma:migrate`        | Migration de développement                                 |
| `prisma:migrate:deploy` | Application des migrations existantes                      |
| `prisma:seed`           | Exécution du seed                                          |

### 5.3 Scripts du frontend

| Script      | Fonction                           |
| ----------- | ---------------------------------- |
| `dev`       | Démarrage Next.js en développement |
| `build`     | Build Next.js                      |
| `start`     | Démarrage Next.js en production    |
| `typecheck` | Contrôle TypeScript sans émission  |

Le package frontend ne définit pas de script `lint` ni de script de test propre. Ces contrôles sont orchestrés, lorsqu'ils existent, depuis la racine.

## 6. Gestion des environnements

### 6.1 Développement

Le développement local utilise les mécanismes suivants :

- `pnpm db:up` démarre PostgreSQL seul ;
- `pnpm dev` lance simultanément NestJS avec `--watch` et Next.js avec `dev` ;
- `scripts/dev.mjs` propage l'environnement courant aux deux processus ;
- lorsqu'un processus se termine, le script arrête l'autre ;
- le backend charge les variantes `.env` depuis son propre répertoire ;
- le frontend dispose de son exemple et peut lire `.env.local`.

Le script de développement ne génère pas Prisma Client, n'applique pas de migration et n'exécute pas le seed. Ces opérations possèdent leurs scripts distincts.

### 6.2 Test

Un environnement `test` est présent pour les suites backend :

- `apps/backend/.env.test` est chargé par les aides de test ;
- `.env.test.local` peut le précéder lorsqu'il existe ;
- les tests utilisent une base dédiée ;
- les migrations et le seed sont exécutés par le préparateur de tests.

Cet environnement participe à la validation, mais pas au déploiement Docker Compose de production.

### 6.3 Production Docker Compose

`.env.production.example` regroupe les variables attendues par Compose :

| Groupe            | Variables réellement déclarées                                                    |
| ----------------- | --------------------------------------------------------------------------------- |
| PostgreSQL        | `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_PORT`              |
| Ports             | `BACKEND_PORT`, `FRONTEND_PORT`                                                   |
| URL               | `FRONTEND_URL`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_API_BASE_URL`, `API_BASE_URL` |
| JWT et proxy      | `JWT_SECRET`, `JWT_EXPIRES_IN`, `TRUST_PROXY_HOPS`                                |
| Limites HTTP      | `JSON_BODY_LIMIT`, variables de rate limit et login                               |
| Sécurité pointage | Indicateur, coordonnées, rayons et précision                                      |
| PDF               | Renderer, chemin exécutable et repli                                              |
| Cloudinary        | Identifiants optionnels, dossier, délai et reprises                               |

Le fichier exemple ne contient pas les valeurs opérationnelles. `.dockerignore` exclut les fichiers d'environnement effectifs du contexte Docker.

### 6.4 Chargement backend

Le backend recherche les fichiers dans cet ordre :

1. `.env.<NODE_ENV>.local` ;
2. `.env.<NODE_ENV>` ;
3. `.env.local` ;
4. `.env`.

Dans Compose, les valeurs sont injectées directement dans l'environnement du conteneur. `DATABASE_URL` est construit avec le nom de service PostgreSQL. `NODE_ENV` vaut `production`.

Le schéma Joi définit les valeurs obligatoires, optionnelles et par défaut. Il contrôle aussi des combinaisons de configuration, par exemple les coordonnées de l'entreprise ou l'ensemble des identifiants Cloudinary.

### 6.5 Configuration frontend

Le code frontend résout :

- `API_BASE_URL` comme URL serveur lorsqu'elle est définie ;
- `NEXT_PUBLIC_API_BASE_URL` comme URL publique de l'API ;
- `NEXT_PUBLIC_APP_URL` comme origine publique de l'application.

En production, le code rejette les URL locales, non HTTPS, de tunnel temporaire ou de réseau privé selon la fonction de résolution concernée. Le README précise que l'origine publique frontend doit correspondre entre `FRONTEND_URL` et `NEXT_PUBLIC_APP_URL`.

### 6.6 Mécanismes absents

Le dépôt ne contient :

- aucun workflow sous `.github/workflows` ;
- aucun fichier GitLab CI ;
- aucun Jenkinsfile ;
- aucun manifeste Render ;
- aucun manifeste Vercel ;
- aucun manifeste Railway ;
- aucun script Terraform, Pulumi, Ansible ou Helm observé dans le périmètre de déploiement ;
- aucune définition de registre d'images ou d'étape de publication automatique.

Le README cite une URL PostgreSQL Render/Neon comme exemple de `DATABASE_URL` et une commande manuelle de migration. Aucun composant d'infrastructure Render ou Neon n'est implémenté dans le dépôt.

## 7. Traçabilité

### 7.1 Build et workspace

| Information                           | Fichiers analysés                                                         |
| ------------------------------------- | ------------------------------------------------------------------------- |
| Scripts et versions                   | `package.json`, `apps/backend/package.json`, `apps/frontend/package.json` |
| Workspaces et dépendances construites | `pnpm-workspace.yaml`, `pnpm-lock.yaml`                                   |
| Orchestration du développement        | `scripts/dev.mjs`                                                         |
| Contrôles de validation               | Scripts du `package.json`, `scripts/validate-proxy.mjs`                   |

### 7.2 Compilation

| Information                 | Fichiers analysés                                                                 |
| --------------------------- | --------------------------------------------------------------------------------- |
| NestJS                      | `apps/backend/nest-cli.json`, `apps/backend/tsconfig.json`, `tsconfig.build.json` |
| Next.js                     | `apps/frontend/next.config.ts`, `apps/frontend/tsconfig.json`                     |
| Bootstrap backend           | `apps/backend/src/main.ts`, `apps/backend/src/app.module.ts`                      |
| Résolution des URL frontend | `apps/frontend/lib/api.ts`, `apps/frontend/lib/auth-session.ts`                   |

### 7.3 Prisma et PostgreSQL

| Information          | Fichiers analysés                                 |
| -------------------- | ------------------------------------------------- |
| Configuration Prisma | `apps/backend/prisma.config.ts`                   |
| Schéma               | `apps/backend/prisma/schema.prisma`               |
| Historique           | `apps/backend/prisma/migrations/**/migration.sql` |
| Seed                 | `apps/backend/prisma/seed.ts`                     |
| Service PostgreSQL   | `docker-compose.yml`                              |

### 7.4 Docker et déploiement

| Information                 | Fichiers analysés                                                             |
| --------------------------- | ----------------------------------------------------------------------------- |
| Image backend               | `docker/backend.Dockerfile`                                                   |
| Image frontend              | `docker/frontend.Dockerfile`                                                  |
| Composition et healthchecks | `docker-compose.yml`                                                          |
| Contexte de build           | `.dockerignore`                                                               |
| Variables de production     | `.env.production.example`                                                     |
| Procédure versionnée        | `README.md`, `docs/RELEASE_CHECKLIST.md`                                      |
| Absence de CI/CD            | Inventaire des fichiers racine, `.github`, `.gitlab` et manifestes recherchés |

## 8. Observations

### 8.1 Reproductibilité

- Le gestionnaire et sa version sont fixés dans `packageManager`.
- Les versions résolues sont verrouillées dans `pnpm-lock.yaml`.
- Les Dockerfiles utilisent `pnpm install --frozen-lockfile`.
- Les images de base spécifient Node 22 et PostgreSQL 16 Alpine.
- Prisma Client est généré dans le build backend avant la compilation.
- Les migrations versionnées sont appliquées au démarrage du backend Docker.

### 8.2 Configuration

- Les secrets et URL opérationnels ne sont pas copiés dans les images par `.dockerignore`.
- Les variables publiques Next.js sont fournies au moment du build et répétées au runtime Compose.
- Le backend valide sa configuration avant d'écouter le port.
- La configuration de production Docker installe Chromium et définit son chemin pour les exports PDF.
- Le seed et les scripts de backfill sont des opérations séparées du démarrage automatique.

### 8.3 Séparation frontend/backend

- Chaque application possède son manifeste, son tsconfig et ses scripts.
- Le build racine orchestre le backend avant le frontend.
- Les images Docker sont distinctes, bien qu'elles copient le même workspace installé.
- Le frontend dépend du backend par HTTP.
- Compose impose PostgreSQL sain avant le backend, puis backend sain avant le frontend.
- Les healthchecks backend et frontend utilisent des routes différentes reliées par le proxy.

### 8.4 Build et déploiement

- Le build racine seul n'exécute pas Prisma Generate ; les images backend et la chaîne `validate` le font explicitement.
- Le build racine seul n'applique aucune migration.
- `next build` ignore ESLint conformément à `next.config.ts`; le lint est exécuté séparément par les scripts racine.
- Les deux images runtime copient l'ensemble du workspace de l'étape de build.
- Le profil Compose `app` est nécessaire pour construire et démarrer les applications.
- Le mécanisme de déploiement versionné est manuel et fondé sur Docker Compose.
- Aucun pipeline CI/CD ou déploiement cloud automatisé n'est présent.
- La composition décrit un déploiement sur un hôte unique avec un volume PostgreSQL nommé.
