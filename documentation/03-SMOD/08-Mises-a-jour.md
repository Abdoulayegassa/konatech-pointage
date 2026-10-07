# Mises à jour

| Métadonnée | Valeur |
|---|---|
| Document ID | SMOD-UPDATE-001 |
| Titre | Mises à jour |
| Version | 1.0 |
| Statut | Validé |
| Classification | Interne |
| Référence | SMOD |
| Date de génération | 30 juillet 2026 |

## 1. Présentation

### 1.1 Objectif

Ce document décrit les mécanismes réellement présents pour mettre à jour Konatech Pointage : prise en compte du code versionné, installation des dépendances, évolution Prisma, migration PostgreSQL, validation, build et déploiement Docker Compose.

### 1.2 Périmètre

Le périmètre couvre :

- le monorepo pnpm ;
- le backend NestJS ;
- le frontend Next.js ;
- Prisma et PostgreSQL ;
- les migrations et le seed ;
- les builds locaux ;
- les images Docker ;
- le cycle de déploiement Compose ;
- les contrôles après mise à jour ;
- la traçabilité documentaire des changements.

Les mécanismes de mise à jour ou de déploiement absents sont signalés explicitement.

### 1.3 Public concerné

Ce document s'adresse aux responsables de release, développeurs, ingénieurs DevOps, SRE et responsables techniques chargés de préparer, appliquer ou vérifier une mise à jour.

Sources : `README.md`, `package.json`, `docs/RELEASE_CHECKLIST.md`, `CHANGELOG_DEV.md`.

## 2. Cycle de mise à jour

### 2.1 Code source

Le projet est un dépôt Git. La checklist de release demande :

- d'exécuter `git status --short` ;
- de vérifier qu'aucun fichier critique de production n'est non suivi ;
- de vérifier que les migrations sont présentes et ordonnées ;
- de vérifier que les fichiers frontend, backend et documentaires concernés sont suivis.

Le dépôt ne documente aucune commande officielle `git pull`, `git fetch`, `git clone`, `git checkout` ou `git switch` pour récupérer une mise à jour. Aucune URL de récupération n'est donnée dans `README.md`.

Source : `docs/RELEASE_CHECKLIST.md`.

### 2.2 Dépendances

Après disponibilité du code dans l'arbre de travail, l'installation documentée est :

```bash
pnpm install
```

Le monorepo utilise :

- `package.json` à la racine ;
- `apps/backend/package.json` ;
- `apps/frontend/package.json` ;
- `pnpm-workspace.yaml` ;
- `pnpm-lock.yaml`.

Les Dockerfiles utilisent :

```bash
pnpm install --frozen-lockfile
```

Le lockfile doit donc correspondre aux manifests pour que le build Docker aboutisse.

### 2.3 Prisma

Le cycle disponible comprend :

```bash
pnpm prisma:generate
pnpm prisma:status
```

La génération construit Prisma Client depuis `schema.prisma`. Le statut inspecte les migrations en utilisant `DATABASE_URL`.

### 2.4 Base PostgreSQL

En développement :

```bash
pnpm prisma:migrate
```

En déploiement :

```bash
pnpm prisma:migrate:deploy
```

La checklist de release demande d'exécuter ou de vérifier la migration de déploiement. Le conteneur backend l'exécute automatiquement avant de lancer l'API.

### 2.5 Build

Le build complet est :

```bash
pnpm build
```

Il construit le backend puis le frontend.

Les builds ciblés sont :

```bash
pnpm build:backend
pnpm build:frontend
```

### 2.6 Validation

La validation complète est :

```bash
pnpm validate
```

Elle enchaîne :

1. le contrôle Prettier ;
2. la génération Prisma ;
3. les typechecks ;
4. ESLint ;
5. les tests backend ;
6. le build frontend ;
7. le build backend ;
8. le test du proxy frontend/backend.

### 2.7 Déploiement

Le déploiement exécutable documenté est Docker Compose :

```bash
docker compose --env-file .env.production --profile app up -d --build
```

Cette commande reconstruit les images et démarre la pile. Le backend attend PostgreSQL, applique les migrations puis démarre NestJS. Le frontend attend que le backend soit sain.

Render est cité dans le dépôt, mais aucun manifeste ni cycle de déploiement Render n'est défini.

### 2.8 Vérification

État des conteneurs :

```bash
docker compose --env-file .env.production ps
```

Journaux :

```bash
docker compose --env-file .env.production logs -f backend frontend postgres
```

Endpoints :

```bash
curl http://localhost:4000/api/v1/health
curl http://localhost:3000/api/health
```

### 2.9 Traçabilité des changements

`CHANGELOG_DEV.md` définit des rubriques pour :

- les ajouts ;
- les changements ;
- les corrections ;
- les validations ;
- les notes.

`TESTING_CHECKLIST.md` demande que le résultat final de validation y soit enregistré. Aucun script ne met automatiquement ce fichier à jour.

### 2.10 Diagramme du cycle

```text
+------------------------+
| Code source versionné  |
| contrôle Git manuel    |
+-----------+------------+
            |
            v
+------------------------+
| Dépendances pnpm       |
| pnpm install           |
+-----------+------------+
            |
            v
+------------------------+
| Prisma                 |
| generate + status      |
+-----------+------------+
            |
            v
+------------------------+
| PostgreSQL             |
| migrate dev/deploy     |
+-----------+------------+
            |
            v
+------------------------+
| Validation et builds   |
| validate / build       |
+-----------+------------+
            |
            v
+------------------------+
| Déploiement Compose    |
| up -d --build          |
+-----------+------------+
            |
            v
+------------------------+
| Healthchecks et logs   |
+------------------------+
```

## 3. Mise à jour du Backend

### 3.1 Récupération du code

Le backend versionné se trouve dans `apps/backend`. Les sources de vérité fonctionnelles sont décrites dans `docs/ARCHITECTURE.md` et `docs/MODULE_REGISTRY.md`.

La checklist impose de contrôler le suivi Git des modules, tests et migrations concernés :

```bash
git status --short
```

Aucune procédure de téléchargement, synchronisation d'une branche ou sélection d'une version n'est définie.

### 3.2 Installation des dépendances

Depuis la racine :

```bash
pnpm install
```

Le workspace installe les dépendances du backend déclarées dans `apps/backend/package.json`.

Dans l'image Docker :

```bash
pnpm install --frozen-lockfile
```

### 3.3 Génération Prisma

```bash
pnpm prisma:generate
```

Le backend Docker exécute également Prisma generate pendant son build.

Sources : `package.json`, `docker/backend.Dockerfile`.

### 3.4 Build backend

Depuis la racine :

```bash
pnpm build:backend
```

Depuis le package backend :

```bash
pnpm --dir apps/backend build
```

Nest CLI compile le code dans `dist`. `nest-cli.json` active la suppression du répertoire de sortie avant compilation.

### 3.5 Tests et contrôles backend

```bash
pnpm typecheck:backend
pnpm test:backend
pnpm validate:backend
```

`validate:backend` exécute la génération Prisma, le typecheck, les tests et le build backend.

Les tests utilisent une base dédiée qu'ils recréent, migrent et alimentent avec le seed.

Sources : `package.json`, `apps/backend/test/test-database.ts`.

### 3.6 Migrations backend

Contrôle :

```bash
pnpm prisma:status
```

Développement :

```bash
pnpm prisma:migrate
```

Déploiement :

```bash
pnpm prisma:migrate:deploy
```

Le schéma et les migrations se trouvent sous `apps/backend/prisma`.

### 3.7 Redémarrage local

Backend compilé :

```bash
pnpm --dir apps/backend start
```

Backend en développement :

```bash
pnpm dev:backend
```

Aucun script backend nommé `restart` n'est présent. Le redémarrage local consiste à arrêter le processus puis à exécuter de nouveau la commande de démarrage.

### 3.8 Redémarrage Docker

```bash
docker compose --env-file .env.production --profile app restart backend
```

Cette commande redémarre l'image existante. Elle ne reconstruit pas une modification de code.

La reconstruction et remise en service documentées sont :

```bash
docker compose --env-file .env.production --profile app up -d --build
```

### 3.9 Démarrage du conteneur mis à jour

La commande du conteneur backend exécute :

```text
prisma migrate deploy
        puis
node dist/main.js
```

Un échec de migration empêche le lancement de l'API dans ce cycle.

## 4. Mise à jour du Frontend

### 4.1 Installation

Depuis la racine :

```bash
pnpm install
```

Les dépendances frontend sont déclarées dans `apps/frontend/package.json`.

Le build Docker utilise le lockfile avec `--frozen-lockfile`.

### 4.2 Variables de build

Le Dockerfile frontend reçoit comme arguments :

- `NEXT_PUBLIC_APP_URL` ;
- `NEXT_PUBLIC_API_BASE_URL` ;
- `API_BASE_URL`.

Il les place dans l'environnement de build Next.js. Compose les fournit également à l'exécution.

Sources : `docker/frontend.Dockerfile`, `docker-compose.yml`.

### 4.3 Typecheck

```bash
pnpm typecheck:frontend
```

### 4.4 Build frontend

Depuis la racine :

```bash
pnpm build:frontend
```

Depuis le package frontend :

```bash
pnpm --dir apps/frontend build
```

Le build exécute `next build`.

`next.config.ts` désactive le lint intégré au build Next.js. Le lint du dépôt reste exécuté séparément par `pnpm lint` et dans `pnpm validate`.

### 4.5 Contrôle frontend

```bash
pnpm validate:frontend
```

Cette commande exécute le typecheck, le build frontend et le test du proxy.

### 4.6 Redémarrage local

Frontend construit :

```bash
pnpm --dir apps/frontend start
```

Frontend en développement :

```bash
pnpm dev:frontend
```

Aucun script frontend nommé `restart` n'est présent.

### 4.7 Redémarrage Docker

Redémarrage de l'image existante :

```bash
docker compose --env-file .env.production --profile app restart frontend
```

Reconstruction et remise en service :

```bash
docker compose --env-file .env.production --profile app up -d --build
```

Le frontend dépend de l'état sain du backend.

## 5. Mise à jour de la base

### 5.1 Source du schéma

Le schéma se trouve dans :

```text
apps/backend/prisma/schema.prisma
```

Les migrations SQL sont versionnées dans :

```text
apps/backend/prisma/migrations/
```

Vingt migrations horodatées sont présentes.

### 5.2 Prisma generate

```bash
pnpm prisma:generate
```

Cette commande génère le client. Elle ne modifie pas les données.

### 5.3 Prisma migrate status

```bash
pnpm prisma:status
```

La commande inspecte la datasource et l'état des migrations sans appliquer de nouvelle migration.

### 5.4 Prisma migrate en développement

```bash
pnpm prisma:migrate
```

Le script exécute `prisma migrate dev`.

### 5.5 Prisma migrate en déploiement

```bash
pnpm prisma:migrate:deploy
```

Le script exécute `prisma migrate deploy`. Il applique les migrations existantes sans en créer.

Le conteneur backend exécute cette opération à chaque démarrage avant l'API.

### 5.6 Sauvegarde avant changement de schéma

`README.md` indique l'exécution de sauvegardes avant les changements de schéma et documente :

```bash
docker compose --env-file .env.production exec -T postgres sh -lc 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > backup.sql
```

Il documente aussi le format personnalisé :

```bash
docker compose --env-file .env.production exec -T postgres sh -lc 'pg_dump -Fc -U "$POSTGRES_USER" "$POSTGRES_DB"' > backup.dump
```

Ces commandes sont manuelles. Aucun script de sauvegarde n'est défini.

### 5.7 Seed

```bash
pnpm prisma:seed
```

Le seed charge des données de démonstration par des opérations principalement idempotentes. Il est distinct d'une migration et ne fait pas partie du démarrage du conteneur.

Le cycle de mise à jour de production ne documente pas l'exécution systématique du seed.

### 5.8 Premier administrateur

Pour une base vide :

```bash
pnpm --dir apps/backend run admin:create
```

Ce script crée un administrateur lorsque l'adresse configurée n'existe pas. Il ne fait pas partie de chaque mise à jour.

### 5.9 Backfills

Deux scripts sont disponibles pour des évolutions de données déjà implémentées :

```bash
pnpm --dir apps/backend run pins:backfill
pnpm --dir apps/backend run snapshots:backfill
```

Leur exécution n'est pas intégrée automatiquement à `migrate deploy`.

### 5.10 Reset

Aucun script `db:reset`, `prisma:reset` ni appel à `prisma migrate reset` n'est présent.

Les tests backend recréent uniquement leur base dédiée. Ce mécanisme n'est pas une procédure de mise à jour d'une base applicative.

### 5.11 Rollback

Aucune migration descendante ni procédure de rollback du schéma n'est présente.

Le réglage de repli du moteur PDF ne constitue pas un rollback de base ou de version.

## 6. Vérifications après mise à jour

### 6.1 État Docker

```bash
docker compose --env-file .env.production ps
```

Les services possèdent des healthchecks et utilisent `restart: unless-stopped`.

### 6.2 Base PostgreSQL

Le healthcheck Compose utilise `pg_isready`.

Journaux :

```bash
docker compose --env-file .env.production logs postgres
```

### 6.3 Prisma

```bash
pnpm prisma:status
pnpm prisma:generate
```

La première commande contrôle la connexion et les migrations. La seconde régénère le client.

### 6.4 API backend

```bash
curl http://localhost:4000/api/v1/health
```

La réponse contient l'état `ok`, l'identifiant de service et un horodatage.

Le contrôleur de santé ne vérifie pas directement PostgreSQL.

### 6.5 Frontend

```bash
curl http://localhost:3000/api/health
```

La route frontend appelle le backend et relaie son état.

L'interface est accessible à :

```text
http://localhost:3000
```

### 6.6 Tests

```bash
pnpm test:backend
pnpm test:proxy
```

Les tests backend utilisent une base dédiée. Le test de proxy démarre temporairement les deux applications et vérifie les healthchecks, les URL et la redirection de la borne.

### 6.7 Builds

```bash
pnpm build:backend
pnpm build:frontend
```

ou :

```bash
pnpm build
```

### 6.8 Validation complète

```bash
pnpm validate
```

### 6.9 Journaux

```bash
docker compose --env-file .env.production logs -f backend frontend postgres
```

La checklist de release demande également de contrôler les journaux du moteur PDF et les avertissements de repli.

### 6.10 Smoke checks

`docs/RELEASE_CHECKLIST.md` décrit des contrôles manuels pour :

- le tableau de bord ;
- l'historique RH ;
- les sanctions ;
- le calendrier ;
- les exports ;
- les employés ;
- les plannings ;
- la borne de pointage ;
- l'espace personnel.

Ces contrôles ne sont pas automatisés.

## 7. Scripts disponibles

| Script ou commande | Rôle dans une mise à jour |
|---|---|
| `git status --short` | Contrôler l'état des fichiers avant release |
| `pnpm install` | Installer les dépendances du workspace |
| `pnpm build` | Construire backend puis frontend |
| `pnpm build:backend` | Construire le backend |
| `pnpm build:frontend` | Construire le frontend |
| `pnpm typecheck` | Vérifier les types des deux applications |
| `pnpm typecheck:backend` | Vérifier les types backend |
| `pnpm typecheck:frontend` | Vérifier les types frontend |
| `pnpm lint` | Exécuter ESLint |
| `pnpm format:check` | Contrôler le format Prettier |
| `pnpm check` | Exécuter lint, typecheck et build |
| `pnpm validate` | Exécuter la validation complète |
| `pnpm validate:backend` | Valider Prisma et le backend |
| `pnpm validate:frontend` | Valider le frontend et le proxy |
| `pnpm test:backend` | Exécuter les tests end-to-end backend |
| `pnpm test:proxy` | Vérifier la connexion frontend/backend |
| `pnpm db:up` | Démarrer PostgreSQL local |
| `pnpm db:status` | Afficher l'état Compose |
| `pnpm db:down` | Arrêter Compose |
| `pnpm prisma:generate` | Générer Prisma Client |
| `pnpm prisma:status` | Contrôler l'état des migrations |
| `pnpm prisma:migrate` | Exécuter les migrations de développement |
| `pnpm prisma:migrate:deploy` | Appliquer les migrations versionnées |
| `pnpm prisma:seed` | Charger les données de démonstration |
| `pnpm dev` | Démarrer les deux applications après modification |
| `pnpm dev:backend` | Démarrer le backend en développement |
| `pnpm dev:frontend` | Démarrer le frontend en développement |
| `pnpm --dir apps/backend start` | Démarrer le backend compilé |
| `pnpm --dir apps/frontend start` | Démarrer le frontend construit |
| `pnpm --dir apps/backend run admin:create` | Créer le premier administrateur |
| `pnpm --dir apps/backend run pins:backfill` | Exécuter le backfill PIN |
| `pnpm --dir apps/backend run snapshots:backfill` | Exécuter le backfill des snapshots |
| `docker compose --profile app up -d --build` | Reconstruire et démarrer la pile |
| `docker compose --profile app restart` | Redémarrer les images existantes |
| `docker compose ps` | Vérifier l'état de la pile |
| `docker compose logs` | Consulter les journaux |

Aucun script `update`, `upgrade`, `release`, `publish`, `deploy`, `redeploy`, `rollback`, `reset` ou `version` n'est défini dans les `package.json`.

## 8. Dépendances

```text
+----------------------+
| Code                 |
| sources versionnées  |
+----------+-----------+
           |
           v
+----------------------+
| Backend NestJS       |
| build / API          |
+----------+-----------+
           |
           v
+----------------------+
| Prisma               |
| client / migrations  |
+----------+-----------+
           |
           v
+----------------------+
| PostgreSQL           |
| schéma / données     |
+----------+-----------+
           |
           v
+----------------------+
| Frontend Next.js     |
| interface / proxy    |
+----------------------+
```

L'ordre de build racine est :

```text
Backend -> Frontend
```

L'ordre de démarrage Compose est :

```text
PostgreSQL sain -> Backend sain -> Frontend
```

## 9. Traçabilité

| Étape ou mécanisme | Fichiers concernés |
|---|---|
| Contrôle Git avant release | `docs/RELEASE_CHECKLIST.md` |
| Traçabilité des changements | `CHANGELOG_DEV.md`, `TESTING_CHECKLIST.md` |
| Architecture et sources de vérité | `docs/ARCHITECTURE.md`, `docs/MODULE_REGISTRY.md` |
| Workspace et scripts | `package.json`, `pnpm-workspace.yaml` |
| Résolution des dépendances | `pnpm-lock.yaml` |
| Dépendances backend | `apps/backend/package.json` |
| Dépendances frontend | `apps/frontend/package.json` |
| Build backend | `apps/backend/nest-cli.json`, `docker/backend.Dockerfile` |
| Build frontend | `apps/frontend/next.config.ts`, `docker/frontend.Dockerfile` |
| Variables de build frontend | `docker/frontend.Dockerfile`, `docker-compose.yml` |
| Schéma Prisma | `apps/backend/prisma/schema.prisma` |
| Configuration Prisma | `apps/backend/prisma.config.ts` |
| Migrations | `apps/backend/prisma/migrations/` |
| Seed | `apps/backend/prisma/seed.ts` |
| Scripts de migration | `package.json`, `apps/backend/package.json` |
| Migration au démarrage | `docker/backend.Dockerfile` |
| Base de test | `apps/backend/test/test-database.ts` |
| Backfills | `apps/backend/scripts/`, `apps/backend/package.json` |
| Orchestration de mise à jour | `docker-compose.yml`, `README.md` |
| Healthchecks | `docker-compose.yml`, contrôleur santé backend, route santé frontend |
| Test frontend/backend | `scripts/validate-proxy.mjs` |
| Validation globale | `package.json`, `TESTING_CHECKLIST.md` |
| Smoke checks | `docs/RELEASE_CHECKLIST.md` |
| Sauvegarde avant schéma | `README.md` |
| Absence de déploiement Render | `documentation/02-SAR/15-Deploiement.md` |

## 10. Observations techniques

### 10.1 Mécanismes présents

- dépôt Git et contrôle manuel de l'état des fichiers ;
- monorepo pnpm avec lockfile ;
- installation locale des dépendances ;
- installation Docker figée par le lockfile ;
- génération Prisma ;
- état des migrations ;
- migrations de développement et de déploiement ;
- seed de démonstration ;
- builds ciblés et complet ;
- validations ciblées et complète ;
- tests backend et test du proxy ;
- reconstruction et démarrage Docker Compose ;
- healthchecks PostgreSQL, backend et frontend ;
- journal de changements avec rubriques définies ;
- checklist de release.

### 10.2 Limitations

- Le cycle est constitué de commandes manuelles.
- Le dépôt ne prouve pas l'exécution d'une mise à jour sur une plateforme active.
- Le staging est cité dans la checklist sans configuration dédiée.
- Le healthcheck backend ne vérifie pas directement PostgreSQL.
- Les tests backend utilisent une base dédiée.
- Le build Next.js n'exécute pas lui-même ESLint.
- Le seed contient des données de démonstration et ne fait pas partie du démarrage Docker.
- Le redémarrage seul ne reconstruit pas les images.

### 10.3 Procédures absentes

- procédure officielle de récupération du code ;
- sélection officielle d'une branche ou d'un tag ;
- gestion automatisée des versions ;
- création automatisée de tag ;
- génération automatique de changelog ;
- mise à jour automatique des dépendances ;
- configuration Renovate ou Dependabot ;
- pipeline CI/CD ;
- publication de release ;
- approbation de release automatisée ;
- déploiement Render versionné ;
- déploiement Neon spécifique ;
- migration descendante ;
- rollback applicatif automatisé ;
- reset de base ;
- stratégie de déploiement progressif ;
- blue/green deployment ;
- canary deployment ;
- rolling deployment ;
- procédure DNS.

### 10.4 Comportements observés

- `pnpm build` construit le backend avant le frontend.
- `pnpm validate` construit le frontend avant le backend après les contrôles et tests.
- Les Dockerfiles installent les dépendances avec `--frozen-lockfile`.
- Le build backend génère Prisma Client.
- Le backend conteneurisé applique `migrate deploy` avant de démarrer.
- Un échec de migration empêche le démarrage de l'API dans ce cycle.
- Le frontend conteneurisé démarre uniquement après un backend sain.
- Les URL publiques frontend sont injectées au build et à l'exécution.
- Les trois services Compose utilisent `restart: unless-stopped`.
- Le seed n'est pas automatique.
- Les backfills ne sont pas automatiques.
- `CHANGELOG_DEV.md` n'est pas alimenté par un script.
