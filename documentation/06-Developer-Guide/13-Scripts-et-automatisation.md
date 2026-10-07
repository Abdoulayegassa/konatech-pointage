# Developer Guide — Scripts et automatisation

| Métadonnée | Valeur |
|---|---|
| Document ID | DG-013 |
| Titre | Scripts et automatisation |
| Version | 1.0 |
| Statut | Validé |
| Classification | Interne |
| Référence | Developer Guide |
| Projet | Konatech Pointage |

## 1. Présentation

Les scripts de Konatech Pointage couvrent le développement simultané du frontend et du backend, les compilations, le contrôle TypeScript, le lint, le formatage, les tests backend et de connexion frontend/backend, l'exécution Prisma, la gestion locale de PostgreSQL, les traitements ponctuels de données et le nettoyage sous Windows.

Le gestionnaire déclaré est pnpm. Le workspace regroupe les packages sous `apps/*`. Les scripts racine orchestrent les deux applications ou relaient une commande dans le répertoire concerné; les manifestes frontend et backend fournissent aussi des commandes exécutables directement depuis chaque application.

## 2. Organisation des scripts

| Emplacement | Type | Description |
|---|---|---|
| `package.json` | Scripts pnpm racine | Orchestration du monorepo, qualité, tests, Prisma, Docker et nettoyage Windows |
| `apps/backend/package.json` | Scripts pnpm backend | Développement NestJS, build, démarrage, typecheck, tests, administration et Prisma |
| `apps/frontend/package.json` | Scripts pnpm frontend | Développement, build, démarrage et typecheck Next.js |
| `scripts/dev.mjs` | Script Node.js | Démarre NestJS en surveillance et Next.js en développement, puis propage leur arrêt |
| `scripts/validate-proxy.mjs` | Script Node.js de validation | Démarre les deux applications sur des ports disponibles et valide la santé, le proxy et la redirection de pointage |
| `scripts/clean-windows.ps1` | Script PowerShell | Supprime les sorties de build et fichiers TypeScript incrémentaux, avec options d'arrêt des serveurs et de régénération Prisma |
| `apps/backend/scripts/` | Scripts TypeScript d'administration | Création d'un administrateur et reprises de données PIN ou instantanés d'horaire |
| `apps/backend/prisma.config.ts` | Configuration Prisma | Déclare le schéma, le dossier de migrations et la commande de seed |
| `apps/backend/prisma/seed.ts` | Seed Prisma | Insère ou actualise les données initiales définies dans le fichier |
| `apps/backend/prisma/migrations/` | Migrations SQL Prisma | Historique versionné des transformations du schéma PostgreSQL |
| `docker-compose.yml` | Orchestration de conteneurs | PostgreSQL et profil applicatif backend/frontend avec dépendances et contrôles de santé |
| `docker/backend.Dockerfile` | Build et démarrage backend | Installation, génération Prisma, build NestJS, migration de déploiement puis démarrage |
| `docker/frontend.Dockerfile` | Build et démarrage frontend | Installation, build Next.js et démarrage du serveur de production |
| `pnpm-workspace.yaml` | Configuration du workspace | Inclut `apps/*`, définit les dépendances dont le build est autorisé et des substitutions transitives |

## 3. Scripts PNPM

### 3.1 Scripts racine

| Script | Objectif | Emplacement | Dépendances ou commandes invoquées |
|---|---|---|---|
| `dev` | Démarrer simultanément le backend et le frontend en développement | `package.json` | `node ./scripts/dev.mjs`, Nest CLI, Next CLI |
| `build` | Compiler les deux applications | `package.json` | `build:backend`, puis `build:frontend` |
| `build:backend` | Compiler NestJS | `package.json` | Package backend et Nest CLI |
| `build:frontend` | Compiler Next.js | `package.json` | Package frontend et Next CLI |
| `typecheck` | Contrôler les types des deux applications | `package.json` | `typecheck:backend`, puis `typecheck:frontend` |
| `typecheck:backend` | Exécuter TypeScript sans émission sur le backend | `package.json` | TypeScript et `apps/backend/tsconfig.json` |
| `typecheck:frontend` | Exécuter TypeScript sans émission sur le frontend | `package.json` | TypeScript dans le package frontend |
| `lint` | Analyser le dépôt avec ESLint | `package.json` | Configuration ESLint racine |
| `lint:fix` | Analyser et corriger automatiquement les règles ESLint corrigeables | `package.json` | ESLint avec `--fix` |
| `format` | Formater les fichiers reconnus | `package.json` | Prettier avec `--write` |
| `format:check` | Vérifier le formatage sans écriture | `package.json` | Prettier avec `--check` |
| `check` | Enchaîner lint, typecheck et build | `package.json` | `lint`, `typecheck`, `build` |
| `validate` | Exécuter la chaîne de validation complète | `package.json` | Format, Prisma Generate, types, lint, tests backend, builds et test proxy |
| `validate:backend` | Valider la couche backend | `package.json` | Prisma Generate, typecheck backend, tests backend, build backend |
| `validate:frontend` | Valider la couche frontend et sa connexion proxy | `package.json` | Typecheck frontend, build frontend, test proxy |
| `test` | Exécuter la cible de test du projet | `package.json` | `test:backend` |
| `test:backend` | Exécuter les tests Jest e2e séquentiellement | `package.json` | Jest et `apps/backend/test/jest-e2e.json` |
| `test:proxy` | Vérifier la connexion frontend/backend et la redirection publique | `package.json` | `node ./scripts/validate-proxy.mjs` |
| `db:up` | Démarrer le service Compose par défaut | `package.json` | `docker compose up -d` |
| `db:down` | Arrêter et retirer les services Compose du projet | `package.json` | `docker compose down` |
| `db:status` | Afficher l'état des services Compose | `package.json` | `docker compose ps` |
| `prisma:generate` | Générer Prisma Client | `package.json` | Prisma CLI du backend |
| `prisma:status` | Afficher l'état des migrations | `package.json` | `prisma migrate status` |
| `prisma:migrate` | Créer ou appliquer une migration de développement | `package.json` | `prisma migrate dev` |
| `prisma:migrate:deploy` | Appliquer les migrations existantes en mode déploiement | `package.json` | `prisma migrate deploy` |
| `prisma:seed` | Exécuter le seed déclaré par Prisma Config | `package.json` | `prisma db seed` et `apps/backend/prisma/seed.ts` |
| `dev:backend` | Démarrer uniquement NestJS en surveillance | `package.json` | Nest CLI dans `apps/backend` |
| `dev:frontend` | Démarrer uniquement Next.js en développement | `package.json` | Next CLI dans `apps/frontend` |
| `clean:windows` | Nettoyer les sorties générées sous Windows | `package.json` | `scripts/clean-windows.ps1` |
| `clean:windows:dev` | Nettoyer et arrêter les processus écoutant sur les ports de développement listés | `package.json` | Même script avec `-KillDevServers` |
| `clean:windows:prisma` | Nettoyer puis régénérer Prisma Client | `package.json` | Même script avec `-RegeneratePrisma` |

Le manifeste racine contient 31 entrées dans son objet `scripts`. Les commandes combinées utilisent `&&`; l'étape suivante ne s'exécute que si la précédente termine sans erreur.

### 3.2 Scripts backend

| Script | Objectif | Emplacement | Dépendances ou commandes invoquées |
|---|---|---|---|
| `dev` | Démarrer NestJS en mode surveillance | `apps/backend/package.json` | Nest CLI `start --watch` |
| `build` | Compiler le backend | `apps/backend/package.json` | Nest CLI `build` |
| `start` | Exécuter le backend compilé | `apps/backend/package.json` | `node dist/main.js` |
| `typecheck` | Vérifier les types sans produire de fichiers | `apps/backend/package.json` | TypeScript et `tsconfig.json` |
| `test` | Exécuter la suite Jest e2e en série | `apps/backend/package.json` | Jest et `test/jest-e2e.json` |
| `admin:create` | Créer le compte administrateur initial s'il n'existe pas | `apps/backend/package.json` | ts-node, `scripts/create-initial-admin.ts`, variables `ADMIN_*` et Prisma |
| `pins:backfill` | Remplacer les PIN historiques des employés par leur empreinte | `apps/backend/package.json` | ts-node, `scripts/backfill-employee-pin-code-hashes.ts`, Prisma |
| `snapshots:backfill` | Compléter les instantanés d'horaire absents sur les présences | `apps/backend/package.json` | ts-node, `scripts/backfill-attendance-schedule-snapshots.ts`, Prisma |
| `prisma:generate` | Générer Prisma Client | `apps/backend/package.json` | Prisma CLI |
| `prisma:migrate` | Exécuter les migrations de développement | `apps/backend/package.json` | Prisma CLI `migrate dev` |
| `prisma:migrate:deploy` | Appliquer les migrations versionnées | `apps/backend/package.json` | Prisma CLI `migrate deploy` |
| `prisma:seed` | Exécuter le seed Prisma | `apps/backend/package.json` | Prisma CLI `db seed` |

### 3.3 Scripts frontend

| Script | Objectif | Emplacement | Dépendances ou commandes invoquées |
|---|---|---|---|
| `dev` | Démarrer le serveur Next.js de développement | `apps/frontend/package.json` | Next CLI `dev` |
| `build` | Produire le build Next.js | `apps/frontend/package.json` | Next CLI `build` |
| `start` | Démarrer le serveur Next.js compilé | `apps/frontend/package.json` | Next CLI `start` |
| `typecheck` | Vérifier les types sans émission | `apps/frontend/package.json` | TypeScript |

## 4. Scripts de développement

### 4.1 Démarrage

Le démarrage simultané est défini par le script racine :

```bash
pnpm dev
```

`scripts/dev.mjs` lance directement le binaire Nest avec `start --watch` depuis `apps/backend`, puis le binaire Next avec `dev` depuis `apps/frontend`. Les variables du processus parent et les sorties standard sont transmises aux deux enfants. Un arrêt `SIGINT` ou `SIGTERM`, ou la sortie non sollicitée d'un enfant, déclenche l'arrêt des deux processus.

Les démarrages séparés disponibles sont :

```bash
pnpm dev:backend
pnpm dev:frontend
```

### 4.2 Build, types, lint et formatage

```bash
pnpm build
pnpm build:backend
pnpm build:frontend
pnpm typecheck
pnpm typecheck:backend
pnpm typecheck:frontend
pnpm lint
pnpm lint:fix
pnpm format
pnpm format:check
```

`build` et `typecheck` parcourent le backend avant le frontend. Le lint et le formatage sont définis uniquement au niveau racine.

### 4.3 Tests et validations composées

```bash
pnpm test
pnpm test:backend
pnpm test:proxy
pnpm check
pnpm validate
pnpm validate:backend
pnpm validate:frontend
```

`test` relaie `test:backend`. La suite backend utilise Jest avec `--runInBand` et la configuration e2e. `test:proxy` réserve deux ports locaux disponibles, démarre les applications, attend les endpoints de santé, vérifie le proxy frontend vers le backend et contrôle la redirection de `/attendance/entry` vers `/attendance-entry`. Il arrête ensuite les processus dans un bloc `finally`.

### 4.4 Base de données et Prisma

```bash
pnpm db:up
pnpm db:down
pnpm db:status
pnpm prisma:generate
pnpm prisma:status
pnpm prisma:migrate
pnpm prisma:migrate:deploy
pnpm prisma:seed
```

`db:up` démarre le service sans profil explicite; dans `docker-compose.yml`, PostgreSQL est le service hors profil. Les services backend et frontend appartiennent au profil `app`.

Prisma Config associe `prisma:seed` à la commande Node qui charge `ts-node/register/transpile-only` puis exécute `prisma/seed.ts`. Les migrations sont stockées dans `apps/backend/prisma/migrations/`.

### 4.5 Administration et reprises de données

Ces scripts sont définis dans le package backend et s'exécutent depuis ce répertoire :

```bash
pnpm --dir apps/backend admin:create
pnpm --dir apps/backend pins:backfill
pnpm --dir apps/backend snapshots:backfill
```

| Script | Lecture | Écriture | Fin d'exécution |
|---|---|---|---|
| `admin:create` | Recherche par e-mail et identifiants annuels existants | Création transactionnelle d'un `Employee` administrateur si absent | Ferme Prisma; code d'erreur en cas d'échec |
| `pins:backfill` | Employés de rôle `EMPLOYEE` avec PIN historique et sans empreinte | Hachage du PIN puis suppression de sa valeur historique | Ferme Prisma; renseigne `process.exitCode` en cas d'échec |
| `snapshots:backfill` | Présences sans nom d'horaire instantané et horaire courant de l'employé | Mise à jour des champs instantanés lorsque l'horaire actif existe | Ferme Prisma; quitte avec le code 1 en cas d'échec |

### 4.6 Nettoyage Windows

```powershell
pnpm clean:windows
pnpm clean:windows:dev
pnpm clean:windows:prisma
```

Le script supprime `apps/backend/dist`, `apps/frontend/.next` et les fichiers `*.tsbuildinfo` hors `node_modules`. L'option de développement arrête les processus en écoute sur la liste de ports codée dans le script. L'option Prisma vérifie la présence du CLI puis exécute `prisma generate` depuis le backend.

## 5. Automatisations

### 5.1 Chaîne de validation locale

```text
pnpm validate
      |
      v
Prettier --check
      |
      v
Prisma generate
      |
      v
Typecheck backend + frontend
      |
      v
ESLint
      |
      v
Tests e2e backend
      |
      v
Build frontend
      |
      v
Build backend
      |
      v
Validation du proxy et de la redirection
```

Cette chaîne est définie dans `package.json`. Elle est locale au dépôt; aucun workflow GitHub Actions n'est présent sous `.github/workflows/`.

### 5.2 Automatisation Docker

```text
docker compose --profile app up
             |
             v
PostgreSQL démarré et contrôlé par pg_isready
             |
             v
Backend : migrate deploy -> dist/main.js -> healthcheck
             |
             v
Frontend : next start -> /api/health
```

Le profil `app` est déclaré dans `docker-compose.yml`. Le backend dépend de la santé PostgreSQL et le frontend dépend de la santé backend. Le `CMD` de l'image backend applique les migrations versionnées avant de démarrer le fichier compilé. Cette commande Compose complète n'est pas un script pnpm; elle correspond directement au profil présent dans le fichier.

### 5.3 Build des images

Le Dockerfile backend installe les dépendances avec le verrou pnpm, génère Prisma Client, compile NestJS et installe Chromium dans l'image d'exécution. Le Dockerfile frontend installe les mêmes dépendances verrouillées, reçoit les URL comme arguments de build, compile Next.js puis démarre le serveur produit.

### 5.4 Automatisations absentes du dépôt

Aucun des éléments suivants n'est présent dans l'arborescence analysée :

- workflow sous `.github/workflows/` ;
- `Makefile` ;
- `turbo.json` ;
- répertoire `tools/` ;
- script d'export autonome dans les manifestes pnpm.

Les exports CSV et PDF sont des traitements HTTP du module Attendance; aucun script de ligne de commande ne leur est associé.

## 6. Organisation du cycle d'exécution

```text
Développeur
    |
    v
Commande pnpm
    |
    +--> script racine -----------------------------+
    |        |                                      |
    |        +--> package backend -> Nest/Prisma/Jest
    |        +--> package frontend -> Next/TypeScript
    |        +--> scripts/*.mjs -> processus enfants
    |        +--> Docker Compose -> services locaux
    |        +--> PowerShell -> nettoyage Windows
    |
    +--> script backend -> administration ou reprise Prisma
    |
    v
Sortie de build, serveur, rapport de contrôle ou données mises à jour
    |
    v
Code de sortie de la commande
```

| Point d'entrée | Exécution réelle | Résultat observable |
|---|---|---|
| Script pnpm simple | Un binaire Node, Next, Nest, TypeScript, Jest, ESLint, Prettier, Prisma ou Docker | Sortie du programme et code de fin |
| Script pnpm composé | Suite de scripts reliés par `&&` | Arrêt au premier code non nul |
| `dev.mjs` | Deux processus enfants avec sorties héritées | Serveurs de développement et arrêt coordonné |
| `validate-proxy.mjs` | Serveurs temporaires, requêtes HTTP et nettoyage | Validation ou erreur avec les journaux récents |
| Script de données | Prisma Client et opérations séquentielles ou transactionnelles | Compteurs ou compte créé, puis déconnexion Prisma |
| Dockerfile backend | Migration de déploiement avant le serveur compilé | Conteneur backend démarré seulement après la commande Prisma |

## 7. Traçabilité

| Élément | Fichier ou répertoire source | Preuve observée |
|---|---|---|
| Workspace et gestionnaire | `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml` | Version pnpm, packages `apps/*`, verrou et dépendances construites |
| Scripts racine | `package.json` | 31 scripts d'orchestration et de contrôle |
| Scripts backend | `apps/backend/package.json` | 12 scripts NestJS, Jest, Prisma et données |
| Scripts frontend | `apps/frontend/package.json` | 4 scripts Next.js et TypeScript |
| Développement simultané | `scripts/dev.mjs` | Création et arrêt coordonné des deux processus |
| Test de connexion | `scripts/validate-proxy.mjs` | Ports temporaires, santé, proxy et redirection |
| Nettoyage Windows | `scripts/clean-windows.ps1` | Suppression ciblée, arrêt optionnel et Prisma optionnel |
| Administrateur initial | `apps/backend/scripts/create-initial-admin.ts` | Validation des variables, transaction et création conditionnelle |
| Migration des PIN | `apps/backend/scripts/backfill-employee-pin-code-hashes.ts` | Sélection, hachage, mise à jour et déconnexion |
| Instantanés d'horaire | `apps/backend/scripts/backfill-attendance-schedule-snapshots.ts` | Sélection des présences incomplètes et mise à jour |
| Seed | `apps/backend/prisma.config.ts`, `apps/backend/prisma/seed.ts` | Commande et contenu d'initialisation |
| Migrations | `apps/backend/prisma/migrations/` | Fichiers SQL versionnés utilisés par Prisma Migrate |
| Compose | `docker-compose.yml` | Services, profil, dépendances et contrôles de santé |
| Image backend | `docker/backend.Dockerfile` | Installation, génération, build, migration et démarrage |
| Image frontend | `docker/frontend.Dockerfile` | Installation, arguments, build et démarrage |
| Configuration des tests | `apps/backend/test/jest-e2e.json`, `apps/backend/test/test-environment.ts` | Suite Jest et préparation de l'environnement de test |
| Documentation liée | `documentation/06-Developer-Guide/04-Stack-technologique.md`, `documentation/06-Developer-Guide/10-Flux-de-donnees.md`, `documentation/06-Developer-Guide/12-Variables-denvironnement.md` | Outils, flux contrôlés et configuration des commandes |

## 8. Observations

- Les scripts racine pilotent les packages par `pnpm --dir` au lieu d'un orchestrateur Turbo.
- Le développement simultané est géré par un script Node propre au dépôt.
- La suite `validate` concentre les contrôles de format, génération Prisma, types, lint, tests, builds et connexion proxy.
- Les tests automatisés définis par pnpm concernent le backend e2e et le câblage frontend/backend.
- Aucun script `lint` ou `test` séparé n'est défini dans le manifeste frontend.
- Prisma Migrate, Prisma Generate et Prisma Seed sont exposés au niveau racine et backend.
- Trois scripts backend modifient directement les données par Prisma Client.
- Le démarrage de l'image backend applique les migrations avant NestJS.
- Docker Compose dispose de contrôles de santé PostgreSQL, backend et frontend.
- Le profil Compose `app` n'est pas utilisé par les scripts `db:up`, `db:down` et `db:status`.
- Le nettoyage automatisé fourni est spécifique à PowerShell et Windows.
- Aucun pipeline GitHub Actions, Makefile ou configuration Turbo n'est présent.
