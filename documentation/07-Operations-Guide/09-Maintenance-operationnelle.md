# Guide d'exploitation — Maintenance opérationnelle

| Métadonnée     | Valeur                     |
| -------------- | -------------------------- |
| Document ID    | OG-009                     |
| Titre          | Maintenance opérationnelle |
| Version        | 1.0                        |
| Statut         | Validé                     |
| Classification | Interne                    |
| Référence      | Operations Guide           |
| Projet         | Konatech Pointage          |

## 1. Présentation

Ce chapitre recense les opérations de maintenance exécutables à partir des commandes, scripts et configurations présents dans le dépôt Konatech Pointage. Il couvre les dépendances du monorepo, les contrôles du code, Prisma et PostgreSQL, la construction et l'exécution des applications, les conteneurs ainsi que les vérifications disponibles après une intervention.

Les commandes décrites sont déclenchées explicitement. Le chapitre ne décrit ni calendrier d'exécution ni organisation humaine, ces éléments n'étant pas définis dans les fichiers exécutables analysés.

## 2. Opérations de maintenance disponibles

| Opération                                         | Composant concerné              | Mécanisme observé                                                      |
| ------------------------------------------------- | ------------------------------- | ---------------------------------------------------------------------- |
| Installer les dépendances                         | Monorepo                        | Installation pnpm depuis les manifestes et le fichier de verrouillage  |
| Contrôler le formatage                            | Ensemble du dépôt               | Scripts `format` et `format:check`                                     |
| Contrôler le code                                 | Backend et frontend             | Scripts de lint, vérification TypeScript, tests et builds              |
| Générer Prisma Client                             | Backend                         | Script `prisma:generate`                                               |
| Examiner l'état des migrations                    | PostgreSQL et Prisma            | Script racine `prisma:status`                                          |
| Créer et appliquer une migration de développement | PostgreSQL et Prisma            | Script `prisma:migrate`                                                |
| Appliquer les migrations existantes               | PostgreSQL et Prisma            | Script `prisma:migrate:deploy`                                         |
| Exécuter le seed                                  | PostgreSQL et Prisma            | Script `prisma:seed`                                                   |
| Créer le compte administrateur initial            | Backend et PostgreSQL           | Script backend `admin:create`                                          |
| Compléter les empreintes de PIN existantes        | Backend et PostgreSQL           | Script backend `pins:backfill`                                         |
| Compléter les instantanés d'horaires de présence  | Backend et PostgreSQL           | Script backend `snapshots:backfill`                                    |
| Nettoyer les artefacts locaux sous Windows        | Backend et frontend             | Scripts `clean:windows`, `clean:windows:dev` et `clean:windows:prisma` |
| Construire les applications                       | Backend et frontend             | Scripts `build`, `build:backend` et `build:frontend`                   |
| Démarrer ou arrêter PostgreSQL avec Compose       | PostgreSQL                      | Scripts `db:up` et `db:down`                                           |
| Construire et démarrer la pile conteneurisée      | PostgreSQL, backend et frontend | Commande Compose publiée dans `README.md`                              |
| Examiner les services et leurs sorties            | Conteneurs                      | `db:status`, `docker compose ... ps` et `docker compose ... logs`      |
| Vérifier les services HTTP                        | Backend et frontend             | Routes de santé et script `test:proxy`                                 |

## 3. Gestion des dépendances

Le fichier `pnpm-workspace.yaml` déclare les applications `apps/*` dans un même espace de travail. Les dépendances sont définies dans les trois fichiers `package.json`; leurs versions résolues sont consignées dans `pnpm-lock.yaml`. La racine fixe pnpm à la version `10.26.0` et déclare Node.js `>=20.9.0 <23`.

Installation documentée à la racine :

```bash
pnpm install
```

Les images Docker emploient l'installation verrouillée suivante pendant leur construction :

```bash
pnpm install --frozen-lockfile
```

| Mécanisme                           | Portée                              | Source                                                    |
| ----------------------------------- | ----------------------------------- | --------------------------------------------------------- |
| Espace de travail `apps/*`          | Backend et frontend                 | `pnpm-workspace.yaml`                                     |
| Manifeste racine                    | Outils et scripts transverses       | `package.json`                                            |
| Manifeste backend                   | Dépendances NestJS, Prisma et tests | `apps/backend/package.json`                               |
| Manifeste frontend                  | Dépendances Next.js et interface    | `apps/frontend/package.json`                              |
| Verrouillage des résolutions        | Ensemble du monorepo                | `pnpm-lock.yaml`                                          |
| Installation verrouillée des images | Étapes de construction Docker       | `docker/backend.Dockerfile`, `docker/frontend.Dockerfile` |

Les manifestes ne définissent pas de script dédié à la mise à jour des dépendances. Une modification des dépendances est matérialisée par les manifestes concernés et par `pnpm-lock.yaml`.

Les contrôles transverses disponibles sont :

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm check
pnpm validate
```

Le script `check` enchaîne lint, vérification TypeScript et construction. Le script `validate` ajoute le contrôle du formatage, la génération de Prisma Client, les tests backend et le test du proxy frontend/backend.

## 4. Maintenance de la base de données

### 4.1 Commandes Prisma

Les commandes suivantes sont exposées par le `package.json` racine :

```bash
pnpm prisma:generate
pnpm prisma:status
pnpm prisma:migrate
pnpm prisma:migrate:deploy
pnpm prisma:seed
```

| Commande                     | Effet défini par le script      | Éléments utilisés                    |
| ---------------------------- | ------------------------------- | ------------------------------------ |
| `pnpm prisma:generate`       | Génère Prisma Client            | `apps/backend/prisma/schema.prisma`  |
| `pnpm prisma:status`         | Exécute `prisma migrate status` | Schéma, migrations et `DATABASE_URL` |
| `pnpm prisma:migrate`        | Exécute `prisma migrate dev`    | `apps/backend/prisma/migrations/`    |
| `pnpm prisma:migrate:deploy` | Exécute `prisma migrate deploy` | Migrations déjà présentes            |
| `pnpm prisma:seed`           | Exécute `prisma db seed`        | `apps/backend/prisma/seed.ts`        |

Le dépôt contient le schéma Prisma et le répertoire des migrations versionnées. La configuration Prisma du backend associe la commande de seed au fichier `prisma/seed.ts`. Aucun script de réinitialisation de la base n'est défini dans les manifestes.

### 4.2 Scripts de données

Ces opérations sont exposées uniquement par le manifeste backend :

```bash
pnpm --dir apps/backend admin:create
pnpm --dir apps/backend pins:backfill
pnpm --dir apps/backend snapshots:backfill
```

| Script               | Traitement                                                                      | Source                                                           |
| -------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `admin:create`       | Création du compte administrateur initial à partir de variables d'environnement | `apps/backend/scripts/create-initial-admin.ts`                   |
| `pins:backfill`      | Calcul des empreintes de PIN manquantes pour les employés existants             | `apps/backend/scripts/backfill-employee-pin-code-hashes.ts`      |
| `snapshots:backfill` | Complément des instantanés d'horaires associés aux présences                    | `apps/backend/scripts/backfill-attendance-schedule-snapshots.ts` |

Ces scripts utilisent Prisma et nécessitent une configuration de connexion fournie par `DATABASE_URL`. Le seed et les trois scripts de données sont des commandes distinctes : ils ne font pas partie du script racine `dev`, du script racine `build` ni du démarrage applicatif local.

## 5. Maintenance des services

### 5.1 Développement local

Le démarrage simultané du backend en mode watch et du frontend en mode développement utilise :

```bash
pnpm dev
```

Les composants peuvent également être démarrés séparément :

```bash
pnpm dev:backend
pnpm dev:frontend
```

Le programme `scripts/dev.mjs` transmet `SIGINT` ou `SIGTERM` aux deux processus enfants. Si l'un des processus se termine, il demande aussi l'arrêt de l'autre.

### 5.2 Construction et exécution des artefacts

```bash
pnpm build
pnpm build:backend
pnpm build:frontend
pnpm --dir apps/backend start
pnpm --dir apps/frontend start
```

Le script racine `build` construit d'abord le backend puis le frontend. Le démarrage backend exécute `node dist/main.js`; le démarrage frontend exécute `next start`.

### 5.3 Services Docker Compose

Les commandes racine suivantes gèrent le service PostgreSQL déclaré sans profil :

```bash
pnpm db:up
pnpm db:status
pnpm db:down
```

Le fichier `docker-compose.yml` place la migration, le backend et le frontend dans le profil `app`. La construction et le démarrage de la pile complète publiés dans le dépôt sont :

```bash
docker compose --env-file .env.production --profile app build backend-migrate backend frontend
docker compose --env-file .env.production --profile app run --rm --no-deps backend-migrate
docker compose --env-file .env.production --profile app up -d --no-build backend frontend
```

Les contrôles publiés associés sont :

```bash
docker compose --env-file .env.production ps
docker compose --env-file .env.production logs -f backend frontend postgres
```

L'image de migration contient Prisma CLI, `prisma.config.ts` et les migrations,
mais n'expose aucun port et s'arrête après `prisma migrate deploy`. L'image
backend génère Prisma Client pendant la construction puis exécute uniquement
`node dist/main.js`; elle ne contient pas les migrations ni Prisma CLI.
L'image frontend construit Next.js puis l'exécute avec `next start`.

Le service `backend` dépend aussi de la fin réussie de `backend-migrate`.
Une migration en erreur retourne un code non nul et le backend ne doit pas être
promu. Une restauration de l'application ne constitue pas automatiquement une
restauration de la base : les migrations Prisma sont généralement en avant et
nécessitent une stratégie de compatibilité ou une migration inverse planifiée.

`pnpm db:down` correspond à `docker compose down`. Le volume nommé `postgres-data` déclaré par Compose n'est pas supprimé par cette commande.

### 5.4 Nettoyage local sous Windows

```bash
pnpm clean:windows
pnpm clean:windows:dev
pnpm clean:windows:prisma
```

Le script PowerShell supprime `apps/backend/dist`, `apps/frontend/.next` et les fichiers `*.tsbuildinfo` situés hors de `node_modules`. La variante `clean:windows:dev` arrête aussi les processus en écoute sur les ports de développement listés dans le script. La variante `clean:windows:prisma` régénère Prisma Client après le nettoyage.

## 6. Vérifications après maintenance

| Point vérifié              | Méthode disponible                                                            | Résultat contrôlé                                                             | Source                                                 |
| -------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------ |
| Formatage                  | `pnpm format:check`                                                           | Conformité Prettier des fichiers inspectés                                    | `package.json`                                         |
| Analyse statique           | `pnpm lint`                                                                   | Règles ESLint sur le dépôt                                                    | `package.json`, `eslint.config.mjs`                    |
| Types                      | `pnpm typecheck`                                                              | Compilation TypeScript sans émission                                          | `package.json`                                         |
| Construction globale       | `pnpm build`                                                                  | Artefacts backend puis frontend                                               | `package.json`                                         |
| Validation globale         | `pnpm validate`                                                               | Formatage, Prisma, types, lint, tests et builds                               | `package.json`                                         |
| Backend uniquement         | `pnpm validate:backend`                                                       | Prisma Client, types, tests backend et build                                  | `package.json`                                         |
| Frontend uniquement        | `pnpm validate:frontend`                                                      | Types, build frontend et test du proxy                                        | `package.json`                                         |
| État des migrations        | `pnpm prisma:status`                                                          | État Prisma Migrate sur la base configurée                                    | `package.json`                                         |
| État Compose               | `pnpm db:status`                                                              | État des services Compose actifs                                              | `package.json`                                         |
| Santé backend              | Requête `GET /api/v1/health`                                                  | Réponse HTTP du contrôleur de santé backend                                   | `apps/backend/src/modules/health/health.controller.ts` |
| Santé frontend             | Requête `GET /api/health`                                                     | Réponse frontend et vérification de l'API backend par la route                | `apps/frontend/src/app/api/health/route.ts`            |
| Connexion frontend/backend | `pnpm test:proxy`                                                             | Santé backend, proxy de santé frontend et redirection du parcours de pointage | `scripts/validate-proxy.mjs`                           |
| Tests backend              | `pnpm test:backend`                                                           | Suite Jest e2e configurée                                                     | `apps/backend/test/jest-e2e.json`                      |
| Santé des conteneurs       | `docker compose --env-file .env.production ps`                                | État et santé exposés par Compose                                             | `README.md`, `docker-compose.yml`                      |
| Sorties des conteneurs     | `docker compose --env-file .env.production logs -f backend frontend postgres` | Sorties standard des trois services                                           | `README.md`                                            |

Le contrôleur de santé backend renvoie l'état du processus HTTP ; il n'interroge pas PostgreSQL. La route de santé frontend effectue, elle, une requête vers l'endpoint de santé du backend.

## 7. Diagramme des opérations

Le flux suivant représente les étapes disponibles. Les branches Prisma ou nettoyage ne sont empruntées que lorsque l'opération concernée les utilise.

```text
Manifestes + pnpm-lock.yaml + configuration d'environnement
                         |
                         v
                    pnpm install
                         |
             +-----------+-----------+
             |                       |
             v                       v
    Opération sur le schéma     Nettoyage Windows
             |                       |
             v                       v
    Génération Prisma Client    Suppression des artefacts
             |
             v
    Statut / migration / seed
             |
             +-----------+-----------+
                         |
                         v
                  Build ou rebuild
                         |
                         v
                 Démarrage explicite
                         |
                         v
          Santé / état / tests / validation
```

## 8. Traçabilité

| Mécanisme documenté                   | Fichier ou répertoire source                                                   | Preuve observée                                                              |
| ------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| Monorepo pnpm                         | `pnpm-workspace.yaml`                                                          | Déclaration des paquets `apps/*` et paramètres pnpm                          |
| Versions des outils et scripts racine | `package.json`                                                                 | `packageManager`, `engines` et scripts de maintenance                        |
| Résolutions des dépendances           | `pnpm-lock.yaml`                                                               | Fichier de verrouillage commun                                               |
| Scripts backend                       | `apps/backend/package.json`                                                    | Build, start, test, Prisma et scripts de données                             |
| Scripts frontend                      | `apps/frontend/package.json`                                                   | Développement, build, start et typecheck                                     |
| Orchestration du développement        | `scripts/dev.mjs`                                                              | Lancement conjoint et propagation des signaux                                |
| Validation du proxy                   | `scripts/validate-proxy.mjs`                                                   | Contrôles HTTP du backend et du frontend                                     |
| Nettoyage Windows                     | `scripts/clean-windows.ps1`                                                    | Artefacts supprimés, ports contrôlés et option Prisma                        |
| Modèle de données                     | `apps/backend/prisma/schema.prisma`                                            | Source du client et fournisseur PostgreSQL                                   |
| Historique du schéma                  | `apps/backend/prisma/migrations/`                                              | Migrations SQL versionnées                                                   |
| Initialisation des données            | `apps/backend/prisma/seed.ts`                                                  | Implémentation du seed                                                       |
| Création d'administrateur             | `apps/backend/scripts/create-initial-admin.ts`                                 | Script explicite utilisant Prisma                                            |
| Complément des PIN                    | `apps/backend/scripts/backfill-employee-pin-code-hashes.ts`                    | Traitement des empreintes manquantes                                         |
| Complément des instantanés            | `apps/backend/scripts/backfill-attendance-schedule-snapshots.ts`               | Traitement des présences existantes                                          |
| Services Compose                      | `docker-compose.yml`                                                           | PostgreSQL, profils applicatifs, dépendances, volume et healthchecks         |
| Image backend                         | `docker/backend.Dockerfile`                                                    | Installation verrouillée, génération Prisma, build et migration au démarrage |
| Image frontend                        | `docker/frontend.Dockerfile`                                                   | Installation verrouillée, build Next.js et démarrage                         |
| Santé backend                         | `apps/backend/src/modules/health/health.controller.ts`                         | Endpoint `GET /api/v1/health` via le préfixe global                          |
| Préfixe HTTP backend                  | `apps/backend/src/main.ts`                                                     | Préfixe global `api/v1`                                                      |
| Santé frontend                        | `apps/frontend/src/app/api/health/route.ts`                                    | Route `GET /api/health` et appel du backend                                  |
| Tests backend                         | `apps/backend/test/jest-e2e.json`                                              | Configuration de la suite Jest e2e                                           |
| Commandes d'exploitation publiées     | `README.md`                                                                    | Installation, démarrage, build et commandes Compose                          |
| Démarrage et arrêt                    | `documentation/07-Operations-Guide/03-Demarrage-et-arret-des-services.md`      | Inventaire détaillé des séquences existantes                                 |
| Configuration                         | `documentation/07-Operations-Guide/04-Configuration-des-environnements.md`     | Variables et fichiers de configuration identifiés                            |
| Journaux et contrôles                 | `documentation/07-Operations-Guide/05-Journaux-et-supervision.md`              | Moyens de vérification et de diagnostic                                      |
| Données                               | `documentation/07-Operations-Guide/06-Exploitation-de-PostgreSQL-et-Prisma.md` | Fonctionnement PostgreSQL et Prisma                                          |
| Incidents                             | `documentation/07-Operations-Guide/08-Gestion-des-incidents.md`                | Symptômes et mécanismes de rétablissement observables                        |

## 9. Observations

- Les opérations sont exposées sous forme de scripts pnpm, de scripts TypeScript ou PowerShell et de commandes Compose publiées.
- Le monorepo utilise un fichier de verrouillage commun aux applications backend et frontend.
- Le build racine exécute le backend avant le frontend ; il n'exécute ni migration ni seed.
- La validation globale génère Prisma Client avant les contrôles TypeScript, les tests et les builds.
- Le démarrage de l'image backend applique les migrations déjà versionnées avant de lancer NestJS ; il n'exécute pas le seed.
- Le seed, la création d'administrateur et les deux backfills sont des opérations distinctes et explicites.
- Aucun script de réinitialisation PostgreSQL ou Prisma n'est déclaré dans les fichiers `package.json`.
- L'arrêt Compose exposé par `db:down` conserve le volume nommé PostgreSQL.
- Le nettoyage d'artefacts fourni par le dépôt est implémenté en PowerShell et vise le contexte Windows.
- Les healthchecks Compose ordonnent PostgreSQL, le backend puis le frontend dans le profil `app`.
- La santé backend indique la disponibilité HTTP du processus sans tester directement la base de données.
