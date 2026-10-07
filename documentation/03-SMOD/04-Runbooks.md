# Runbooks opérationnels

| Métadonnée | Valeur |
|---|---|
| Document ID | SMOD-RUNBOOK-001 |
| Titre | Runbooks opérationnels |
| Version | 1.0 |
| Statut | Validé |
| Classification | Interne |
| Référence | SMOD |
| Date de génération | 30 juillet 2026 |

## 1. Présentation

### 1.1 Objectif

Ce document rassemble les procédures opérationnelles exécutables avec le dépôt actuel de Konatech Pointage. Il décrit le démarrage, l'arrêt, le contrôle d'état, le diagnostic et les récupérations couvertes par les scripts, les endpoints et la configuration versionnés.

### 1.2 Périmètre

Les runbooks couvrent :

- le frontend Next.js ;
- le backend NestJS et son API ;
- Prisma et les migrations ;
- PostgreSQL sous Docker Compose ;
- l'exécution locale avec pnpm ;
- l'exécution conteneurisée avec le profil Compose `app` ;
- les journaux et healthchecks présents ;
- les procédures manuelles de sauvegarde et restauration PostgreSQL documentées.

Les procédures cloud non matérialisées dans le dépôt ne font pas partie des commandes exécutables de ce document.

### 1.3 Public concerné

Le document s'adresse aux exploitants, ingénieurs DevOps, SRE, développeurs et responsables techniques intervenant lors d'un démarrage, d'une indisponibilité ou d'une opération de récupération.

Sources : `README.md`, `package.json`, `docker-compose.yml`, `docs/RELEASE_CHECKLIST.md`.

## 2. Architecture opérationnelle

### 2.1 Frontend

Le frontend est une application Next.js située dans `apps/frontend`. Il s'exécute avec `next dev` en développement et `next start` après construction. Le conteneur écoute sur le port 3000.

Le frontend utilise `API_BASE_URL` côté serveur lorsqu'elle est définie, sinon `NEXT_PUBLIC_API_BASE_URL`, pour joindre l'API. Son endpoint `/api/health` relaie le healthcheck backend.

Sources : `apps/frontend/package.json`, `apps/frontend/lib/api.ts`, `apps/frontend/app/api/health/route.ts`, `docker/frontend.Dockerfile`.

### 2.2 Backend

Le backend est une application NestJS située dans `apps/backend`. Il expose l'API sous `/api/v1`, écoute sur le port 4000 dans la configuration locale et Compose, et fournit `/api/v1/health`.

Le backend valide sa configuration au démarrage. Il dépend de Prisma et de PostgreSQL. Dans son conteneur, les migrations de déploiement sont appliquées avant le lancement de `dist/main.js`.

Sources : `apps/backend/src/main.ts`, `apps/backend/src/app.module.ts`, `docker/backend.Dockerfile`.

### 2.3 PostgreSQL

Compose définit un service `postgres` fondé sur `postgres:16-alpine`. Il utilise un volume nommé `postgres-data` et un healthcheck `pg_isready`. Le port interne 5432 est publié sur un port hôte configurable.

Source : `docker-compose.yml`.

### 2.4 Prisma

Prisma fournit :

- le schéma PostgreSQL ;
- le client d'accès aux données ;
- les migrations versionnées ;
- le seed de démonstration ;
- les commandes de génération, d'état et de migration.

La connexion est entièrement fournie par `DATABASE_URL`.

Sources : `apps/backend/prisma.config.ts`, `apps/backend/prisma/schema.prisma`, `apps/backend/prisma/`, `package.json`.

### 2.5 Docker

Compose contient :

| Service | Profil | Dépendance de démarrage | Redémarrage |
|---|---|---|---|
| `postgres` | défaut | aucune | `unless-stopped` |
| `backend` | `app` | PostgreSQL sain | `unless-stopped` |
| `frontend` | `app` | backend sain | `unless-stopped` |

`pnpm db:up` démarre uniquement les services du profil par défaut, donc PostgreSQL. La pile applicative complète nécessite le profil `app`.

### 2.6 Cloud

Les éléments cloud constatés sont :

- Cloudinary, appelé conditionnellement par le backend pour le stockage de photos de vérification ;
- Render, cité uniquement comme environnement possible d'exécution de commandes ;
- Neon, cité uniquement comme cible possible de `DATABASE_URL`.

Aucun manifeste Render, aucune configuration Neon et aucun runbook cloud dédié ne sont présents.

Sources : service de stockage photo backend, `README.md`, `documentation/02-SAR/15-Deploiement.md`.

### 2.7 Diagramme opérationnel

```text
                         Utilisateur
                              |
                              v
                    +-------------------+
                    | Frontend Next.js  |
                    | :3000             |
                    | /api/health       |
                    +---------+---------+
                              |
                              | API_BASE_URL ou
                              | NEXT_PUBLIC_API_BASE_URL
                              v
                    +-------------------+
                    | Backend NestJS    |
                    | :4000 /api/v1     |
                    | /health           |
                    +---------+---------+
                              |
                              | Prisma Client
                              | DATABASE_URL
                              v
                    +-------------------+
                    | PostgreSQL 16     |
                    | postgres-data     |
                    +-------------------+

Séquence Compose :
postgres --healthy--> backend --healthy--> frontend

Backend ---- HTTPS conditionnel ----> Cloudinary
Render / Neon : mentions documentaires, sans manifeste
```

## 3. Procédure de démarrage

### 3.1 Runbook de démarrage local initial

#### Étape 1 — Vérifier l'environnement

Les versions déclarées sont :

- Node.js `22.11.0` dans `.nvmrc` et plage `>=20.9.0 <23` dans `package.json` ;
- pnpm `10.26.0` comme gestionnaire déclaré ;
- Docker avec Compose ;
- PostgreSQL fourni par Compose.

Sélection de la version Node.js :

```bash
nvm use
```

#### Étape 2 — Installer les dépendances

```bash
pnpm install
```

Le workspace inclut `apps/*` et utilise `pnpm-lock.yaml`.

#### Étape 3 — Créer les fichiers d'environnement locaux

Sous Bash :

```bash
cp apps/backend/.env.example apps/backend/.env
cp apps/frontend/.env.example apps/frontend/.env.local
```

Sous PowerShell :

```powershell
Copy-Item apps/backend/.env.example apps/backend/.env
Copy-Item apps/frontend/.env.example apps/frontend/.env.local
```

Le backend exige notamment une connexion PostgreSQL, une origine frontend et un secret JWT valides. Le frontend exige des URL cohérentes avec les origines locales.

#### Étape 4 — Démarrer PostgreSQL

```bash
pnpm db:up
pnpm db:status
```

Le premier script exécute `docker compose up -d`. Le second exécute `docker compose ps`.

#### Étape 5 — Préparer Prisma

```bash
pnpm prisma:generate
pnpm prisma:status
pnpm prisma:migrate
```

Le seed est une opération distincte pour les données de démonstration :

```bash
pnpm prisma:seed
```

#### Étape 6 — Démarrer backend et frontend

```bash
pnpm dev
```

`scripts/dev.mjs` démarre NestJS en surveillance et Next.js en développement. Les deux processus héritent de l'environnement du processus parent et partagent le terminal.

#### Étape 7 — Vérifier le démarrage

```bash
curl http://localhost:4000/api/v1/health
curl http://localhost:3000/api/health
```

L'application est accessible à `http://localhost:3000`.

Sources : `README.md`, `scripts/dev.mjs`, `package.json`.

### 3.2 Runbook de démarrage local ciblé

Backend seul :

```bash
pnpm dev:backend
```

Frontend seul :

```bash
pnpm dev:frontend
```

Ces commandes n'orchestrent pas le démarrage de PostgreSQL. Le frontend seul ne rend pas l'API disponible.

### 3.3 Runbook de démarrage Docker Compose complet

#### Étape 1 — Créer l'environnement de production Compose

```bash
cp .env.production.example .env.production
```

Les secrets, identifiants PostgreSQL et URL de services doivent être renseignés dans ce fichier. Le fichier réel est exclu de Git.

#### Étape 2 — Construire et démarrer

```bash
docker compose --env-file .env.production --profile app up -d --build
```

#### Étape 3 — Observer la séquence

1. PostgreSQL démarre et exécute `pg_isready`.
2. Le backend démarre après l'état sain de PostgreSQL.
3. Le backend applique `prisma migrate deploy`.
4. NestJS démarre et expose `/api/v1/health`.
5. Le frontend démarre après l'état sain du backend.
6. Le healthcheck frontend appelle `/api/health`.

#### Étape 4 — Vérifier les conteneurs

```bash
docker compose --env-file .env.production ps
```

#### Étape 5 — Afficher les journaux

```bash
docker compose --env-file .env.production logs -f backend frontend postgres
```

Le seed n'est pas exécuté par ce cycle.

Sources : `README.md`, `docker-compose.yml`, Dockerfiles.

## 4. Procédure d'arrêt

### 4.1 Arrêt des applications locales

Le processus `pnpm dev` intercepte `SIGINT` et `SIGTERM`. L'arrêt depuis le terminal transmet le signal aux processus backend et frontend.

Lorsque l'un des deux processus se termine sans arrêt déjà engagé, le script demande également l'arrêt de l'autre processus.

Source : `scripts/dev.mjs`.

### 4.2 Arrêt de PostgreSQL local

```bash
pnpm db:down
```

Cette commande exécute `docker compose down`. Elle ne contient pas d'option de suppression du volume `postgres-data`.

Sources : `package.json`, `docker-compose.yml`.

### 4.3 Arrêt de la pile Compose complète

```bash
docker compose --env-file .env.production --profile app down
```

Cette commande arrête les services Compose. Aucun script pnpm spécifique à l'arrêt du profil `app` n'est défini.

### 4.4 Arrêt ciblé sous Windows

Le script suivant arrête les processus qui écoutent sur les ports de développement et de validation prévus, puis nettoie les artefacts :

```powershell
pnpm clean:windows:dev
```

Il utilise `Stop-Process -Force` pour les processus détectés. Il ne constitue pas un arrêt multi-plateforme.

Source : `scripts/clean-windows.ps1`.

## 5. Vérification de l'état de la plateforme

### 5.1 API backend

Commande :

```bash
curl http://localhost:4000/api/v1/health
```

La réponse émise contient :

- un état `ok` ;
- l'identifiant `konatech-attendance-api` ;
- un horodatage ISO.

L'endpoint est public.

Source : `apps/backend/src/modules/health/health.controller.ts`.

### 5.2 Frontend

Contrôle du proxy :

```bash
curl http://localhost:3000/api/health
```

La route appelle le backend sur `/health` et relaie son statut. Une réponse réussie confirme que le serveur Next.js peut joindre l'API.

Contrôle visuel :

```text
http://localhost:3000
```

Sources : `apps/frontend/app/api/health/route.ts`, `apps/frontend/lib/api.ts`.

### 5.3 Base PostgreSQL

État Compose :

```bash
pnpm db:status
```

ou :

```bash
docker compose ps
```

Le healthcheck du conteneur utilise :

```text
pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"
```

Source : `docker-compose.yml`.

### 5.4 Prisma

```bash
pnpm prisma:status
```

La commande utilise `DATABASE_URL` pour joindre PostgreSQL et afficher l'état des migrations.

### 5.5 Pile Docker complète

```bash
docker compose --env-file .env.production ps
```

Les healthchecks attendus sont :

| Service | Intervalle | Délai | Essais | Période initiale |
|---|---:|---:|---:|---:|
| PostgreSQL | 10 s | 5 s | 5 | 10 s |
| Backend | 20 s | 5 s | 5 | 30 s |
| Frontend | 20 s | 5 s | 5 | 30 s |

### 5.6 Vérification intégrée frontend/backend

```bash
pnpm test:proxy
```

Le script :

1. réserve des ports locaux disponibles ;
2. démarre le backend ;
3. attend son healthcheck ;
4. démarre le frontend ;
5. attend le healthcheck du proxy ;
6. vérifie la réponse de santé attendue ;
7. vérifie la redirection publique de la borne de pointage ;
8. arrête les processus gérés.

En cas d'échec, il affiche jusqu'aux 80 dernières lignes capturées par processus.

Source : `scripts/validate-proxy.mjs`.

### 5.7 Portée des healthchecks

Le healthcheck backend confirme la disponibilité HTTP du processus NestJS. Son contrôleur n'exécute pas de requête PostgreSQL.

Le healthcheck frontend dépend du backend. Le healthcheck PostgreSQL est séparé et propre au conteneur.

## 6. Procédures de diagnostic

### 6.1 Runbook — Un conteneur n'est pas sain

#### Étape 1 — Afficher l'état

```bash
docker compose --env-file .env.production ps
```

#### Étape 2 — Consulter les journaux

Tous les services :

```bash
docker compose --env-file .env.production logs -f backend frontend postgres
```

Service ciblé :

```bash
docker compose --env-file .env.production logs backend
docker compose --env-file .env.production logs frontend
docker compose --env-file .env.production logs postgres
```

#### Étape 3 — Contrôler la dépendance amont

```text
frontend en échec
    |
    v
contrôler backend /api/v1/health
    |
    v
contrôler PostgreSQL et prisma:status
```

Cette séquence reflète les dépendances Compose.

### 6.2 Runbook — L'API backend ne répond pas

#### Étape 1 — Appeler le healthcheck

```bash
curl http://localhost:4000/api/v1/health
```

#### Étape 2 — Vérifier le processus ou conteneur

```bash
docker compose --env-file .env.production ps
docker compose --env-file .env.production logs backend
```

En développement, les erreurs de NestJS apparaissent dans le terminal de `pnpm dev` ou `pnpm dev:backend`.

#### Étape 3 — Vérifier Prisma

```bash
pnpm prisma:status
```

#### Étape 4 — Exécuter les contrôles backend

```bash
pnpm validate:backend
```

Cette commande génère Prisma Client, vérifie les types, exécute les tests backend et construit le backend.

### 6.3 Runbook — Le frontend ne joint pas le backend

#### Étape 1 — Comparer les deux healthchecks

```bash
curl http://localhost:4000/api/v1/health
curl http://localhost:3000/api/health
```

Un backend sain avec un proxy frontend en échec localise le défaut dans la connexion du serveur Next.js vers l'API ou dans sa configuration d'URL.

#### Étape 2 — Exécuter le contrôle automatique

```bash
pnpm test:proxy
```

Le script vérifie aussi la cohérence entre `FRONTEND_URL` et `NEXT_PUBLIC_APP_URL`.

#### Étape 3 — Contrôler les variables concernées

Les noms utilisés par le code sont :

- `FRONTEND_URL` ;
- `NEXT_PUBLIC_APP_URL` ;
- `NEXT_PUBLIC_API_BASE_URL` ;
- `API_BASE_URL`.

Les valeurs ne sont pas affichées dans ce document.

Sources : `scripts/validate-proxy.mjs`, `apps/frontend/lib/api.ts`, fichiers d'environnement d'exemple.

### 6.4 Runbook — PostgreSQL ou Prisma est indisponible

#### Étape 1 — Vérifier PostgreSQL

```bash
docker compose ps
docker compose logs postgres
```

#### Étape 2 — Vérifier la connexion Prisma

```bash
pnpm prisma:status
```

#### Étape 3 — Vérifier les migrations

En développement :

```bash
pnpm prisma:migrate
```

En déploiement :

```bash
pnpm prisma:migrate:deploy
```

Ces commandes modifient la base en appliquant des migrations ; `prisma:status` est le contrôle en lecture avant leur exécution.

### 6.5 Runbook — Une validation applicative échoue

Contrôle consolidé :

```bash
pnpm validate
```

Contrôles ciblés :

```bash
pnpm format:check
pnpm prisma:generate
pnpm typecheck
pnpm lint
pnpm test:backend
pnpm build:frontend
pnpm build:backend
pnpm test:proxy
```

`TESTING_CHECKLIST.md` et `docs/RELEASE_CHECKLIST.md` contiennent également des contrôles fonctionnels manuels.

### 6.6 Runbook — Diagnostic PDF

La checklist de release demande de contrôler :

- le mode `ATTENDANCE_PDF_RENDERER` ;
- l'interdiction ou l'autorisation explicite du repli historique ;
- le chemin du binaire Chromium ou Chrome ;
- les journaux backend relatifs au moteur et aux replis ;
- la génération d'un export mensuel.

L'image backend installe Chromium et fixe son chemin. Le code journalise les sélections, avertissements et erreurs du moteur PDF.

Sources : `docs/RELEASE_CHECKLIST.md`, `docker/backend.Dockerfile`, services d'export PDF.

### 6.7 Journaux disponibles

Le backend produit des journaux NestJS pour le démarrage, l'audit administrateur, les limitations de débit, Cloudinary et le moteur PDF. Les scripts backend utilisent les sorties console.

Aucun fichier de logs, agrégateur, système de tracing ou monitoring centralisé n'est configuré. Les journaux restent sur les sorties des processus et des conteneurs.

## 7. Procédures de récupération

### 7.1 Redémarrage

Pile Compose :

```bash
docker compose --env-file .env.production --profile app restart
```

Les trois services ont aussi la politique `restart: unless-stopped`.

En développement, arrêter `pnpm dev` puis relancer :

```bash
pnpm dev
```

Aucun script pnpm nommé `restart` n'est présent.

### 7.2 Reconstruction

Applications locales :

```bash
pnpm build
```

Applications ciblées :

```bash
pnpm build:backend
pnpm build:frontend
```

Images Docker et pile complète :

```bash
docker compose --env-file .env.production --profile app up -d --build
```

### 7.3 Réinstallation des dépendances

Installation du workspace :

```bash
pnpm install
```

Les Dockerfiles exécutent :

```bash
pnpm install --frozen-lockfile
```

Aucun script `reinstall` ni procédure versionnée de suppression de `node_modules` n'est présent.

### 7.4 Régénération de Prisma Client

```bash
pnpm prisma:generate
```

Sous Windows, un nettoyage suivi d'une régénération existe :

```powershell
pnpm clean:windows:prisma
```

### 7.5 Application des migrations

Développement :

```bash
pnpm prisma:migrate
```

Déploiement :

```bash
pnpm prisma:migrate:deploy
```

Le conteneur backend exécute automatiquement `migrate deploy` avant son serveur.

### 7.6 Réinitialisation de la base

Aucun script `db:reset`, `prisma:reset` ou appel à `prisma migrate reset` n'est présent. Aucune procédure générale de réinitialisation de la base de développement ou de production n'est documentée.

Le dispositif de tests recrée uniquement la base dédiée aux tests, applique `migrate deploy` et exécute le seed. Ce mécanisme n'est pas exposé comme runbook de récupération d'une base applicative.

Sources : `apps/backend/test/test-database.ts`, `package.json`.

### 7.7 Restauration PostgreSQL depuis une sauvegarde SQL

La commande documentée est :

```bash
cat backup.sql | docker compose --env-file .env.production exec -T postgres sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

Cette procédure suppose qu'un fichier `backup.sql` issu de la commande `pg_dump` documentée soit disponible.

### 7.8 Restauration PostgreSQL depuis une sauvegarde personnalisée

La commande documentée est :

```bash
cat backup.dump | docker compose --env-file .env.production exec -T postgres sh -lc 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists'
```

Cette procédure suppose qu'un fichier `backup.dump` produit avec `pg_dump -Fc` soit disponible.

### 7.9 Création des sauvegardes documentées

Format SQL :

```bash
docker compose --env-file .env.production exec -T postgres sh -lc 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > backup.sql
```

Format personnalisé :

```bash
docker compose --env-file .env.production exec -T postgres sh -lc 'pg_dump -Fc -U "$POSTGRES_USER" "$POSTGRES_DB"' > backup.dump
```

Ces opérations sont manuelles. Aucun script pnpm, planification ou service de sauvegarde n'est présent.

Source : `README.md`.

### 7.10 Seed et premier administrateur

Seed de démonstration :

```bash
pnpm prisma:seed
```

Création idempotente d'un premier administrateur :

```bash
pnpm --dir apps/backend run admin:create
```

Le second script exige `DATABASE_URL`, `ADMIN_EMAIL` et `ADMIN_PASSWORD`. Il ignore la création si l'adresse existe déjà. Ces deux procédures ont des finalités distinctes.

Source : `apps/backend/prisma/seed.ts`, `apps/backend/scripts/create-initial-admin.ts`, `README.md`.

### 7.11 Rollback

Aucun rollback applicatif global, rollback Docker, rollback de migration ou migration descendante n'est défini.

Le mode `ATTENDANCE_PDF_RENDERER=legacy` constitue uniquement un basculement explicite du moteur PDF. Il ne restaure ni la base ni une version applicative.

## 8. Commandes opérationnelles

| Commande ou script | Effet observé |
|---|---|
| `nvm use` | Sélectionner la version Node.js de `.nvmrc` |
| `pnpm install` | Installer les dépendances du workspace |
| `pnpm dev` | Démarrer frontend et backend ensemble |
| `pnpm dev:backend` | Démarrer le backend seul en surveillance |
| `pnpm dev:frontend` | Démarrer le frontend seul |
| `pnpm build` | Construire les deux applications |
| `pnpm build:backend` | Construire le backend |
| `pnpm build:frontend` | Construire le frontend |
| `pnpm db:up` | Démarrer PostgreSQL avec Compose |
| `pnpm db:down` | Arrêter les services Compose du profil par défaut |
| `pnpm db:status` | Afficher l'état Compose |
| `pnpm prisma:generate` | Générer Prisma Client |
| `pnpm prisma:status` | Afficher l'état des migrations |
| `pnpm prisma:migrate` | Exécuter `prisma migrate dev` |
| `pnpm prisma:migrate:deploy` | Exécuter `prisma migrate deploy` |
| `pnpm prisma:seed` | Exécuter le seed de démonstration |
| `pnpm test:backend` | Exécuter les tests end-to-end backend |
| `pnpm test:proxy` | Vérifier le backend, le proxy frontend et les URL |
| `pnpm check` | Exécuter lint, typecheck et build |
| `pnpm validate` | Exécuter la validation complète |
| `pnpm validate:backend` | Valider le backend |
| `pnpm validate:frontend` | Valider le frontend et le proxy |
| `pnpm clean:windows` | Nettoyer les artefacts de build sous Windows |
| `pnpm clean:windows:dev` | Nettoyer et arrêter les processus sur les ports ciblés |
| `pnpm clean:windows:prisma` | Nettoyer et régénérer Prisma sous Windows |
| `pnpm --dir apps/backend run admin:create` | Créer le premier administrateur s'il n'existe pas |
| `pnpm --dir apps/backend run pins:backfill` | Exécuter le backfill des hash PIN |
| `pnpm --dir apps/backend run snapshots:backfill` | Exécuter le backfill des snapshots |
| `docker compose --profile app up -d` | Démarrer la pile conteneurisée complète |
| `docker compose --profile app restart` | Redémarrer les services du profil applicatif |
| `docker compose --profile app down` | Arrêter la pile conteneurisée |
| `docker compose ps` | Afficher l'état des conteneurs |
| `docker compose logs` | Afficher les sorties des conteneurs |

Aucun script `doctor`, `monitor`, `restart`, `reset`, `rollback`, `backup` ou `restore` n'est défini dans les `package.json`. Les opérations Docker et PostgreSQL correspondantes sont des commandes manuelles lorsqu'elles sont documentées.

## 9. Dépendances

```text
+----------------+
| Utilisateur    |
+-------+--------+
        |
        v
+----------------+
| Frontend       |
| Next.js        |
+-------+--------+
        |
        v
+----------------+
| Backend        |
| NestJS / API   |
+-------+--------+
        |
        v
+----------------+
| Prisma Client  |
+-------+--------+
        |
        v
+----------------+
| PostgreSQL     |
+----------------+
```

Chaîne de santé Compose :

```text
PostgreSQL sain
       |
       v
Backend sain
       |
       v
Frontend sain
```

## 10. Traçabilité

| Procédure | Fichiers concernés |
|---|---|
| Prérequis et démarrage local | `README.md`, `.nvmrc`, `package.json` |
| Fichiers d'environnement | `apps/backend/.env.example`, `apps/frontend/.env.example`, `.env.production.example` |
| Démarrage conjoint | `scripts/dev.mjs`, `package.json` |
| Arrêt des processus locaux | `scripts/dev.mjs` |
| Nettoyage et arrêt Windows | `scripts/clean-windows.ps1` |
| PostgreSQL local | `docker-compose.yml`, `package.json` |
| Démarrage Docker complet | `README.md`, `docker-compose.yml` |
| Build et commande backend | `docker/backend.Dockerfile`, `apps/backend/package.json` |
| Build et commande frontend | `docker/frontend.Dockerfile`, `apps/frontend/package.json` |
| Healthcheck PostgreSQL | `docker-compose.yml` |
| Healthcheck backend | `apps/backend/src/modules/health/health.controller.ts`, `docker-compose.yml` |
| Healthcheck frontend | `apps/frontend/app/api/health/route.ts`, `docker-compose.yml` |
| Résolution de l'URL API frontend | `apps/frontend/lib/api.ts` |
| Configuration et validation backend | `apps/backend/src/app.module.ts`, `apps/backend/src/main.ts` |
| État et migrations Prisma | `package.json`, `apps/backend/package.json`, `apps/backend/prisma.config.ts` |
| Schéma et migrations | `apps/backend/prisma/schema.prisma`, `apps/backend/prisma/migrations/` |
| Seed | `apps/backend/prisma/seed.ts` |
| Recréation de la base de test | `apps/backend/test/test-database.ts` |
| Validation du proxy | `scripts/validate-proxy.mjs` |
| Tests et contrôles manuels | `TESTING_CHECKLIST.md`, `docs/RELEASE_CHECKLIST.md` |
| Journaux backend | `apps/backend/src/main.ts`, services d'audit, de sécurité, de photo et d'export |
| Sauvegarde et restauration PostgreSQL | `README.md` |
| Premier administrateur | `apps/backend/scripts/create-initial-admin.ts`, `README.md` |
| Backfills | scripts sous `apps/backend/scripts/`, `apps/backend/package.json` |
| Cloudinary | `apps/backend/src/modules/attendance/attendance-photo-storage.service.ts` |
| Render et Neon | `README.md`, `documentation/02-SAR/15-Deploiement.md` |

## 11. Observations techniques

### 11.1 Limitations observées

- Le healthcheck backend ne vérifie pas explicitement PostgreSQL.
- Aucun monitoring centralisé, tracing distribué ou export de métriques d'exploitation n'est configuré.
- Aucun agrégateur, fichier, rotation ou rétention de logs n'est configuré.
- La pile Compose documentée cible une exécution stable sur un hôte unique et ne définit pas de haute disponibilité.
- Aucun manifeste Render, aucune configuration Neon et aucun runbook cloud spécifique ne sont présents.
- Aucun pipeline CI/CD n'est présent.
- Aucun gestionnaire de processus hors Docker n'est configuré.

### 11.2 Procédures absentes

- réinitialisation générale de la base applicative ;
- rollback de schéma ;
- rollback automatisé de version ;
- réponse automatisée aux incidents ;
- politique d'astreinte ;
- procédure d'escalade ;
- classification des incidents ;
- gestion d'un statut public ;
- bascule automatique ;
- reprise multi-réplique ;
- planification automatique des sauvegardes ;
- validation automatisée d'une restauration ;
- runbook DNS ou reverse proxy ;
- script pnpm de redémarrage, logs, sauvegarde ou restauration.

### 11.3 Comportements particuliers

- `pnpm db:up` démarre PostgreSQL seul ; le frontend et le backend exigent le profil Compose `app`.
- Le backend attend un PostgreSQL sain.
- Le frontend attend un backend sain.
- Le conteneur backend applique les migrations avant le serveur NestJS.
- Le seed n'est pas automatique dans le conteneur.
- Les services utilisent `restart: unless-stopped`.
- `pnpm dev` couple le cycle de vie des deux processus applicatifs.
- Le healthcheck frontend relaie celui du backend.
- `pnpm test:proxy` conserve au maximum 80 lignes récentes par processus pour son diagnostic d'échec.
- Les tests recréent uniquement leur base dédiée.
- Le volume PostgreSQL n'est pas supprimé par `pnpm db:down`.
- Cloudinary n'est sollicité que par les flux photo conditionnels.
- Le réglage de repli PDF historique ne constitue pas un rollback de la plateforme.
