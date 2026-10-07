# Plan de reprise d'activité

| Métadonnée | Valeur |
|---|---|
| Document ID | SMOD-DRP-001 |
| Titre | Plan de reprise d'activité |
| Version | 1.0 |
| Statut | Validé |
| Classification | Interne |
| Référence | SMOD |
| Date de génération | 30 juillet 2026 |

## 1. Présentation

### 1.1 Objectif

Ce document décrit les capacités de reprise réellement présentes dans le dépôt Konatech Pointage. Il identifie les composants reconstructibles, les scénarios partiellement couverts, les commandes disponibles et les limites du dispositif versionné.

Le statut « Validé » concerne la conformité documentaire à l'état du dépôt. Le dépôt ne contient aucune preuve d'exercice complet de reprise d'une plateforme de production.

### 1.2 Périmètre

Le périmètre comprend :

- le code frontend Next.js ;
- le code backend NestJS ;
- Prisma Client, le schéma et les migrations ;
- PostgreSQL sous Docker Compose ;
- les sauvegardes et restaurations PostgreSQL documentées ;
- les fichiers de configuration d'exemple ;
- les dépendances pnpm et Docker ;
- la reconstruction et le démarrage de la pile ;
- les vérifications après reprise.

### 1.3 Public concerné

Le document s'adresse aux SRE, ingénieurs DevOps, architectes cloud, administrateurs PostgreSQL, développeurs et responsables techniques chargés de reconstruire ou de remettre en service la plateforme.

Sources : `README.md`, `package.json`, `docker-compose.yml`, Dockerfiles, `documentation/02-SAR/15-Deploiement.md`.

## 2. Architecture concernée

### 2.1 Frontend

Le frontend se trouve dans `apps/frontend`. Il utilise Next.js, TypeScript et l'App Router. Il peut être :

- installé par le workspace pnpm ;
- construit avec `pnpm build:frontend` ;
- démarré après build avec le script `start` du package frontend ;
- reconstruit dans une image Docker à partir de `docker/frontend.Dockerfile`.

Le frontend dépend des URL publiques de l'application et de l'API. Son endpoint `/api/health` appelle le backend.

Sources : `apps/frontend/package.json`, `apps/frontend/lib/api.ts`, `docker/frontend.Dockerfile`.

### 2.2 Backend

Le backend se trouve dans `apps/backend`. Il utilise NestJS, TypeScript et Prisma. Il peut être :

- installé par le workspace pnpm ;
- construit avec `pnpm build:backend` ;
- démarré depuis `dist/main.js` ;
- reconstruit dans une image Docker à partir de `docker/backend.Dockerfile`.

Le backend dépend de PostgreSQL, de Prisma Client et de variables d'environnement valides.

### 2.3 PostgreSQL

Le service PostgreSQL Compose utilise `postgres:16-alpine`, un port hôte configurable et le volume nommé `postgres-data`.

Les mécanismes de reprise de données documentés sont :

- restauration d'un fichier SQL avec `psql` ;
- restauration d'un fichier au format personnalisé avec `pg_restore`.

Ces procédures nécessitent qu'un fichier de sauvegarde correspondant soit disponible.

Sources : `docker-compose.yml`, `README.md`.

### 2.4 Prisma

Prisma fournit :

- `schema.prisma` ;
- vingt migrations SQL versionnées ;
- le client généré ;
- le seed de démonstration ;
- les commandes de génération, état et migration.

Les migrations peuvent reconstruire le schéma. Le seed peut recréer uniquement les données de démonstration codées. Ni l'un ni l'autre ne reconstitue les données métier perdues.

### 2.5 Docker

Compose définit :

| Service | Profil | Dépendance |
|---|---|---|
| `postgres` | défaut | aucune |
| `backend` | `app` | PostgreSQL sain |
| `frontend` | `app` | backend sain |

Les services utilisent `restart: unless-stopped`. Les images applicatives sont construites depuis les sources et le lockfile.

### 2.6 Hébergement

L'hébergement exécutable défini dans le dépôt est une pile Docker Compose orientée hôte unique.

Render est cité pour l'utilisation d'un shell et Neon comme cible possible de `DATABASE_URL`. Le dépôt ne contient :

- aucun manifeste Render ;
- aucune définition de service Render ;
- aucune configuration Neon ;
- aucun identifiant de projet cloud ;
- aucune infrastructure as code ;
- aucune procédure de bascule d'hébergement.

Sources : `README.md`, `documentation/02-SAR/15-Deploiement.md`.

### 2.7 Dépendances

La reconstruction dépend de :

| Dépendance | Trace dans le dépôt |
|---|---|
| Node.js | `.nvmrc`, engines et images Docker Node 22 |
| pnpm | version du gestionnaire dans `package.json` |
| Packages JavaScript | trois `package.json` et `pnpm-lock.yaml` |
| Docker | Dockerfiles et `docker-compose.yml` |
| PostgreSQL | image `postgres:16-alpine` |
| Prisma | package backend, schéma, config et migrations |
| Chromium | installation dans l'image backend |

Les paquets et images ne sont pas vendus dans le dépôt. Leur installation ou construction dépend de leur disponibilité auprès des sources utilisées par pnpm, Docker et le gestionnaire Debian pendant les builds.

### 2.8 Configuration

Les fichiers de référence versionnés sont :

- `apps/backend/.env.example` ;
- `apps/frontend/.env.example` ;
- `.env.production.example`.

Les fichiers réels `.env`, `.env.local` et `.env.production` sont exclus de Git et du contexte Docker selon les motifs configurés.

Les exemples permettent de retrouver les noms et la structure des variables. Ils ne conservent pas les secrets ni les valeurs propres à une plateforme déployée.

Sources : fichiers d'environnement d'exemple, `.gitignore`, `.dockerignore`.

### 2.9 Diagramme de l'architecture concernée

```text
                         Code source
                              |
                +-------------+-------------+
                |                           |
                v                           v
       +------------------+        +------------------+
       | Frontend Next.js |        | Backend NestJS   |
       | build / start    |        | build / start    |
       +--------+---------+        +---------+--------+
                |                            |
                | API                        | Prisma
                +-------------+--------------+
                              |
                              v
                    +-------------------+
                    | Prisma Client     |
                    | schéma/migrations |
                    +---------+---------+
                              |
                              v
                    +-------------------+
                    | PostgreSQL 16     |
                    | postgres-data     |
                    +-------------------+

Reprise des données si sauvegarde disponible :
backup.sql  ----psql------> PostgreSQL
backup.dump ----pg_restore> PostgreSQL

Orchestration :
PostgreSQL sain -> Backend sain -> Frontend
```

## 3. Scénarios de reprise

### 3.1 Synthèse de couverture

| Scénario | Couverture présente | Limite principale |
|---|---|---|
| Perte du frontend | Reconstruction depuis les sources ou l'image reconstruite | Configuration réelle et infrastructure d'exposition non restaurées |
| Perte du backend | Reconstruction, Prisma generate, migration et démarrage | Secrets et hébergement réel non restaurés |
| Perte du conteneur PostgreSQL, volume conservé | Redémarrage Compose avec le volume nommé | Aucun contrôle d'intégrité spécifique |
| Perte du volume ou de la base, sauvegarde disponible | Restauration SQL ou format personnalisé | Procédure manuelle, absence de catalogue |
| Perte de la base sans sauvegarde | Schéma et données de démonstration reconstructibles | Données métier non récupérables par les mécanismes présents |
| Perte de configuration locale | Structure récupérable depuis les exemples | Secrets et valeurs de production absents |
| Perte de `node_modules` | Réinstallation avec pnpm | Dépendance à la disponibilité des packages |
| Perte des images Docker | Reconstruction depuis Dockerfiles | Dépendance aux registres et paquets système |
| Perte de Cloudinary | Aucun scénario de reprise | Aucun export ou restauration des images |
| Perte de l'hébergement Render/Neon | Aucun scénario propre au fournisseur | Aucun manifeste ni configuration cloud |

### 3.2 Perte du frontend

#### Mécanismes disponibles

Depuis un arbre de code disponible :

```bash
pnpm install
pnpm build:frontend
pnpm --dir apps/frontend start
```

Reconstruction Docker :

```bash
docker compose --env-file .env.production --profile app up -d --build
```

Vérification :

```bash
curl http://localhost:3000/api/health
```

#### Couverture

Les sources, le manifest, le lockfile, le Dockerfile et les scripts de build sont versionnés.

#### Éléments non couverts

- récupération des secrets et URL réels si les fichiers de configuration sont perdus ;
- restauration DNS ;
- restauration d'un reverse proxy ;
- déploiement Render ;
- restauration d'un certificat TLS ;
- bascule vers une autre instance.

### 3.3 Perte du backend

#### Mécanismes disponibles

```bash
pnpm install
pnpm prisma:generate
pnpm build:backend
pnpm --dir apps/backend start
```

Reconstruction Docker :

```bash
docker compose --env-file .env.production --profile app up -d --build
```

Le conteneur applique `prisma migrate deploy` avant de démarrer l'API.

Vérification :

```bash
curl http://localhost:4000/api/v1/health
```

#### Couverture

Les sources, dépendances, migrations, Dockerfile et commande de démarrage sont versionnés.

#### Éléments non couverts

- récupération d'un secret JWT perdu ;
- récupération de la configuration Cloudinary perdue ;
- reconstruction d'une infrastructure cloud absente ;
- restauration de journaux historiques ;
- rollback automatique vers une version antérieure.

### 3.4 Perte du conteneur PostgreSQL avec volume conservé

Le volume nommé est séparé du conteneur. La commande disponible pour démarrer PostgreSQL est :

```bash
pnpm db:up
```

État :

```bash
pnpm db:status
```

Compose remonte `postgres-data` dans `/var/lib/postgresql/data`.

Le dépôt ne contient pas de procédure de vérification d'intégrité du volume ni de réparation des fichiers PostgreSQL.

### 3.5 Perte de la base ou du volume avec sauvegarde SQL

La restauration documentée est :

```bash
cat backup.sql | docker compose --env-file .env.production exec -T postgres sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

La commande ne comporte pas d'étape explicite de suppression, création ou nettoyage préalable de la base.

Après restauration, le contrôle disponible est :

```bash
pnpm prisma:status
```

### 3.6 Perte de la base ou du volume avec sauvegarde personnalisée

La restauration documentée est :

```bash
cat backup.dump | docker compose --env-file .env.production exec -T postgres sh -lc 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists'
```

Cette commande demande le nettoyage des objets existants lorsqu'ils existent.

### 3.7 Perte de la base sans sauvegarde

Les mécanismes disponibles permettent de reconstruire le schéma :

```bash
pnpm prisma:migrate:deploy
```

Ils permettent également de charger le seed :

```bash
pnpm prisma:seed
```

Le seed contient des plannings, employés, règles et présences de démonstration. Il ne récupère pas :

- les employés réels créés après déploiement ;
- les pointages réels ;
- les événements RH réels ;
- les règles modifiées en exploitation ;
- les références photo réelles ;
- les autres données métier perdues.

Il n'existe donc aucune procédure de récupération des données métier sans sauvegarde disponible.

### 3.8 Perte de configuration

#### Mécanismes disponibles

Recréation de la structure locale :

```bash
cp apps/backend/.env.example apps/backend/.env
cp apps/frontend/.env.example apps/frontend/.env.local
```

Recréation de la structure Compose :

```bash
cp .env.production.example .env.production
```

#### Couverture

Les noms, formats généraux et certaines valeurs par défaut sont documentés.

#### Éléments non couverts

Les exemples ne restaurent pas :

- le secret JWT réel ;
- le mot de passe PostgreSQL réel ;
- les URL publiques réelles ;
- les coordonnées réelles du site ;
- les identifiants Cloudinary ;
- les variables du premier administrateur ;
- les éventuels secrets configurés dans un hébergeur.

Aucun gestionnaire de secrets, Docker Secrets, coffre de secrets ou sauvegarde des fichiers d'environnement n'est configuré.

### 3.9 Perte des dépendances pnpm

Reconstruction :

```bash
pnpm install
```

Le lockfile versionné fixe la résolution. Les builds Docker utilisent :

```bash
pnpm install --frozen-lockfile
```

Aucun registre miroir, cache de reprise ou archive de packages n'est défini dans le dépôt.

### 3.10 Perte des images Docker

Reconstruction :

```bash
docker compose --env-file .env.production --profile app up -d --build
```

Les images applicatives sont reconstruites depuis :

- `docker/backend.Dockerfile` ;
- `docker/frontend.Dockerfile`.

La base utilise `postgres:16-alpine`.

La reconstruction exige l'accès aux images de base, aux packages pnpm et aux packages Debian installés dans l'image backend.

### 3.11 Perte des fichiers Cloudinary

PostgreSQL conserve l'URL et l'identifiant public des photos de vérification. Les fichiers binaires sont téléversés dans Cloudinary.

Aucun mécanisme ne sauvegarde ou ne restaure le contenu Cloudinary. Une restauration PostgreSQL peut remettre les références, mais ne garantit pas l'existence des fichiers distants.

Source : `apps/backend/src/modules/attendance/attendance-photo-storage.service.ts`, schéma Prisma.

### 3.12 Perte de l'hébergement

La pile Docker Compose peut être reconstruite sur un hôte disposant des dépendances requises et de la configuration réelle :

```bash
docker compose --env-file .env.production --profile app up -d --build
```

Le dépôt ne décrit pas :

- la préparation d'un nouvel hôte ;
- la restauration réseau ;
- le DNS ;
- TLS ;
- le reverse proxy ;
- le stockage externe ;
- la bascule ;
- la reprise Render ;
- la reprise Neon.

## 4. Procédures de reconstruction

### 4.1 Préconditions traçables

La reconstruction documentée suppose :

- un arbre de code disponible ;
- Node.js dans la plage déclarée ;
- pnpm ;
- Docker avec Compose pour la pile conteneurisée ;
- les valeurs de configuration réelles ;
- une base accessible ou une sauvegarde restaurable ;
- un accès aux sources externes de packages et d'images.

### 4.2 Récupération du code

Le dépôt est géré par Git et la checklist utilise `git status --short`.

Aucune commande officielle de clonage, récupération, sélection de branche, sélection de tag ou restauration du dépôt n'est documentée. Le PRA ne contient donc pas de commande versionnée permettant de récupérer le code après sa perte totale.

### 4.3 Installation des dépendances

```bash
nvm use
pnpm install
```

`.nvmrc` contient `22.11.0`. Le package racine déclare Node.js `>=20.9.0 <23` et pnpm `>=10.0.0`.

### 4.4 Création des configurations

Local :

```bash
cp apps/backend/.env.example apps/backend/.env
cp apps/frontend/.env.example apps/frontend/.env.local
```

Compose :

```bash
cp .env.production.example .env.production
```

Ces copies recréent la structure, pas les valeurs secrètes perdues.

### 4.5 Démarrage de PostgreSQL

Local :

```bash
pnpm db:up
pnpm db:status
```

Pile complète :

```bash
docker compose --env-file .env.production --profile app up -d --build
```

Dans la pile complète, PostgreSQL démarre avant les applications.

### 4.6 Restauration des données

Si une sauvegarde SQL existe :

```bash
cat backup.sql | docker compose --env-file .env.production exec -T postgres sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

Si une sauvegarde au format personnalisé existe :

```bash
cat backup.dump | docker compose --env-file .env.production exec -T postgres sh -lc 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists'
```

Le dépôt ne contient aucun mécanisme de découverte automatique d'une sauvegarde.

### 4.7 Génération Prisma

```bash
pnpm prisma:generate
```

Le build de l'image backend exécute aussi cette génération.

### 4.8 État des migrations

```bash
pnpm prisma:status
```

Cette commande utilise `DATABASE_URL`.

### 4.9 Migrations

Développement :

```bash
pnpm prisma:migrate
```

Reprise ou déploiement à partir des migrations versionnées :

```bash
pnpm prisma:migrate:deploy
```

Le conteneur backend exécute cette seconde commande avant l'API.

### 4.10 Seed

```bash
pnpm prisma:seed
```

Le seed est une source de données de démonstration. Il ne doit pas être confondu avec une restauration de données métier.

### 4.11 Premier administrateur

Pour une base vide :

```bash
pnpm --dir apps/backend run admin:create
```

Le script exige les variables d'administration et crée un compte uniquement si l'adresse n'existe pas.

### 4.12 Backfills

```bash
pnpm --dir apps/backend run pins:backfill
pnpm --dir apps/backend run snapshots:backfill
```

Ces scripts complètent uniquement les données ciblées par leur implémentation. Leur exécution n'est pas intégrée automatiquement aux migrations.

### 4.13 Build local

```bash
pnpm build
```

Builds séparés :

```bash
pnpm build:backend
pnpm build:frontend
```

### 4.14 Démarrage local

Développement conjoint :

```bash
pnpm dev
```

Applications compilées :

```bash
pnpm --dir apps/backend start
pnpm --dir apps/frontend start
```

Le dépôt ne fournit aucun gestionnaire de processus pour coordonner les deux commandes compilées hors Docker.

### 4.15 Build et démarrage Docker

```bash
docker compose --env-file .env.production --profile app up -d --build
```

Séquence observée :

```text
PostgreSQL
    |
    | pg_isready
    v
Backend
    |
    | migrate deploy puis /api/v1/health
    v
Frontend
    |
    | /api/health
    v
Plateforme démarrée
```

### 4.16 État et journaux

```bash
docker compose --env-file .env.production ps
docker compose --env-file .env.production logs -f backend frontend postgres
```

## 5. Vérifications après reprise

### 5.1 Frontend

```bash
curl http://localhost:3000/api/health
```

Accès manuel :

```text
http://localhost:3000
```

La route de santé frontend relaie le backend.

### 5.2 Backend

```bash
curl http://localhost:4000/api/v1/health
```

La réponse attendue contient l'état `ok`, l'identifiant `konatech-attendance-api` et un horodatage.

Le contrôleur ne vérifie pas directement la base.

### 5.3 API

La base locale de l'API est :

```text
http://localhost:4000/api/v1
```

Le healthcheck est public. Les autres contrôleurs couvrent les domaines métier et peuvent demander une authentification.

### 5.4 Base PostgreSQL

```bash
docker compose --env-file .env.production ps
docker compose --env-file .env.production logs postgres
```

Le contrôle de santé PostgreSQL repose sur `pg_isready`.

### 5.5 Prisma

```bash
pnpm prisma:status
pnpm prisma:generate
```

La première commande contrôle la connexion et les migrations. La seconde contrôle la génération du client.

### 5.6 Tests backend

```bash
pnpm test:backend
```

Les tests recréent leur base dédiée, appliquent les migrations et chargent le seed. Ils ne valident pas le contenu de la base reprise.

### 5.7 Test frontend/backend

```bash
pnpm test:proxy
```

Le script vérifie :

- le healthcheck backend ;
- le healthcheck à travers le frontend ;
- la cohérence des URL ;
- la redirection de la borne.

Il utilise une base de test et des ports temporaires.

### 5.8 Builds

```bash
pnpm build:backend
pnpm build:frontend
```

ou :

```bash
pnpm build
```

### 5.9 Validation complète

```bash
pnpm validate
```

Cette commande exécute les contrôles de format, Prisma, types, lint, tests, builds et proxy.

### 5.10 Healthchecks Docker

| Service | Contrôle |
|---|---|
| PostgreSQL | `pg_isready` |
| Backend | requête HTTP vers `/api/v1/health` |
| Frontend | requête HTTP vers `/api/health` |

### 5.11 Contrôles fonctionnels

`TESTING_CHECKLIST.md` et `docs/RELEASE_CHECKLIST.md` décrivent des vérifications manuelles pour :

- l'authentification ;
- les employés et plannings ;
- les pointages ;
- l'historique et le tableau de bord ;
- le calendrier et les sanctions ;
- les exports ;
- les parcours frontend.

Ces contrôles ne vérifient pas automatiquement l'exhaustivité des données restaurées.

### 5.12 Premier accès après reprise d'une base vide

Le script disponible est :

```bash
pnpm --dir apps/backend run admin:create
```

Son succès crée un administrateur si l'adresse configurée n'existe pas.

## 6. Scripts disponibles

| Script ou commande | Usage de reconstruction |
|---|---|
| `nvm use` | Sélectionner la version Node.js indiquée |
| `pnpm install` | Reconstruire les dépendances du workspace |
| `pnpm db:up` | Démarrer PostgreSQL |
| `pnpm db:status` | Afficher l'état Compose |
| `pnpm db:down` | Arrêter Compose sans suppression explicite du volume |
| `pnpm prisma:generate` | Générer Prisma Client |
| `pnpm prisma:status` | Contrôler la datasource et les migrations |
| `pnpm prisma:migrate` | Appliquer les migrations de développement |
| `pnpm prisma:migrate:deploy` | Appliquer les migrations versionnées |
| `pnpm prisma:seed` | Charger le seed de démonstration |
| `pnpm build` | Construire les deux applications |
| `pnpm build:backend` | Construire le backend |
| `pnpm build:frontend` | Construire le frontend |
| `pnpm dev` | Démarrer les deux applications en développement |
| `pnpm dev:backend` | Démarrer le backend en développement |
| `pnpm dev:frontend` | Démarrer le frontend en développement |
| `pnpm --dir apps/backend start` | Démarrer le backend compilé |
| `pnpm --dir apps/frontend start` | Démarrer le frontend construit |
| `pnpm test:backend` | Exécuter les tests end-to-end backend |
| `pnpm test:proxy` | Vérifier la connexion frontend/backend |
| `pnpm validate:backend` | Valider et construire le backend |
| `pnpm validate:frontend` | Valider et construire le frontend |
| `pnpm validate` | Exécuter la validation complète |
| `pnpm --dir apps/backend run admin:create` | Créer le premier administrateur |
| `pnpm --dir apps/backend run pins:backfill` | Compléter les hash PIN |
| `pnpm --dir apps/backend run snapshots:backfill` | Compléter les snapshots |
| `docker compose --profile app up -d --build` | Construire et démarrer la pile complète |
| `docker compose ps` | Afficher l'état et la santé |
| `docker compose logs` | Consulter les journaux |
| `psql` via Compose | Restaurer une sauvegarde SQL |
| `pg_restore` via Compose | Restaurer une sauvegarde au format personnalisé |

Aucun script `recover`, `disaster`, `failover`, `restore`, `backup`, `reset`, `rollback`, `redeploy` ou `drill` n'est défini dans les `package.json`.

## 7. Dépendances

```text
+----------------------+
| Code source          |
| dépôt disponible     |
+----------+-----------+
           |
           v
+----------------------+
| Backend NestJS       |
| build / dist         |
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
| build / interface    |
+----------------------+
```

Chaîne de reconstruction Docker :

```text
Sources + lockfile + configuration
                 |
                 v
       images backend/frontend
                 |
                 v
       PostgreSQL + volume/sauvegarde
                 |
                 v
          migrations Prisma
                 |
                 v
       backend sain -> frontend sain
```

## 8. Traçabilité

| Composant ou procédure | Fichiers concernés |
|---|---|
| Architecture du monorepo | `README.md`, `pnpm-workspace.yaml` |
| Versions Node.js et pnpm | `.nvmrc`, `package.json` |
| Dépendances | trois `package.json`, `pnpm-lock.yaml` |
| Frontend reconstructible | `apps/frontend/`, `apps/frontend/package.json` |
| Backend reconstructible | `apps/backend/src/`, `apps/backend/package.json` |
| Build frontend Docker | `docker/frontend.Dockerfile` |
| Build backend Docker | `docker/backend.Dockerfile` |
| Orchestration et volume | `docker-compose.yml` |
| Exclusions des configurations | `.gitignore`, `.dockerignore` |
| Modèle de configuration locale | fichiers `.env.example` des applications |
| Modèle de configuration Compose | `.env.production.example` |
| Schéma Prisma | `apps/backend/prisma/schema.prisma` |
| Configuration Prisma | `apps/backend/prisma.config.ts` |
| Migrations | `apps/backend/prisma/migrations/` |
| Seed | `apps/backend/prisma/seed.ts` |
| Scripts de reconstruction | `package.json`, packages des applications |
| Migration au démarrage | `docker/backend.Dockerfile` |
| Sauvegardes et restaurations | `README.md` |
| Base dédiée aux tests | `apps/backend/test/test-database.ts`, `apps/backend/test/test-environment.ts` |
| Premier administrateur | `apps/backend/scripts/create-initial-admin.ts` |
| Backfills | scripts sous `apps/backend/scripts/` |
| Healthcheck PostgreSQL | `docker-compose.yml` |
| Healthcheck backend | contrôleur santé backend, `docker-compose.yml` |
| Healthcheck frontend | route santé frontend, `docker-compose.yml` |
| Test de connexion | `scripts/validate-proxy.mjs` |
| Contrôles fonctionnels | `TESTING_CHECKLIST.md`, `docs/RELEASE_CHECKLIST.md` |
| Stockage Cloudinary | service de stockage photo backend, schéma Prisma |
| État de l'hébergement | `README.md`, `documentation/02-SAR/15-Deploiement.md` |

## 9. Observations techniques

### 9.1 Mécanismes présents

- sources frontend et backend versionnées ;
- manifests et lockfile pnpm ;
- versions Node.js déclarées ;
- Dockerfiles reproductibles à partir de dépendances externes ;
- pile Docker Compose ;
- volume PostgreSQL nommé ;
- schéma et migrations Prisma versionnés ;
- génération Prisma Client ;
- seed de démonstration ;
- deux commandes documentées de restauration PostgreSQL ;
- builds applicatifs ;
- healthchecks des trois services ;
- tests backend et test du proxy ;
- premier administrateur idempotent ;
- deux backfills ciblés.

### 9.2 Limitations

- La reprise nécessite un arbre de code déjà disponible, faute de commande de récupération officielle.
- La reprise de configuration nécessite les secrets et valeurs réelles, qui ne sont pas versionnés.
- La reprise des données métier nécessite une sauvegarde disponible.
- Le volume Docker ne constitue pas à lui seul une sauvegarde selon `README.md`.
- Les tests utilisent une base distincte et ne valident pas le contenu restauré.
- Le healthcheck backend ne vérifie pas PostgreSQL.
- La pile cible un hôte unique.
- La reconstruction dépend de registres et dépôts de packages externes.
- Les références Cloudinary restaurées ne garantissent pas la présence des fichiers distants.

### 9.3 Procédures absentes

- RTO défini ;
- RPO défini ;
- ordre de priorité métier formalisé ;
- invocation officielle du PRA ;
- rôles et responsables de reprise ;
- arbre d'escalade ;
- liste de contacts ;
- site de secours ;
- hôte de secours préparé ;
- récupération officielle du dépôt ;
- sauvegarde planifiée ;
- catalogue et rétention des sauvegardes ;
- validation automatisée des restaurations ;
- réplication PostgreSQL ;
- restauration à un instant donné ;
- bascule automatique ;
- haute disponibilité ;
- récupération DNS ;
- récupération TLS ;
- récupération du reverse proxy ;
- reprise Cloudinary ;
- reprise Render ;
- reprise Neon ;
- rollback applicatif ;
- rollback de migration ;
- reset général de la base ;
- exercice PRA versionné ;
- compte rendu de test PRA.

### 9.4 Comportements observés

- `pnpm db:down` ne supprime pas explicitement le volume.
- PostgreSQL doit être sain avant le backend.
- Le backend applique les migrations avant son démarrage.
- Le frontend attend un backend sain.
- Les trois services utilisent `restart: unless-stopped`.
- Le seed n'est pas exécuté automatiquement par le conteneur.
- Le build backend génère Prisma Client.
- Les builds Docker installent les packages avec `--frozen-lockfile`.
- La restauration SQL simple ne nettoie pas explicitement la base.
- La restauration personnalisée utilise `--clean --if-exists`.
- Les fichiers de configuration réels sont exclus de Git et du contexte Docker.
- Le script de premier administrateur ne crée pas de doublon pour une adresse existante.
