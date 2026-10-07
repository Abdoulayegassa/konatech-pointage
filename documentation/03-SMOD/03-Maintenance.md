# Maintenance

| Métadonnée | Valeur |
|---|---|
| Document ID | SMOD-MAIN-001 |
| Titre | Maintenance |
| Version | 1.0 |
| Statut | Validé |
| Classification | Interne |
| Référence | SMOD |
| Date de génération | 30 juillet 2026 |

## 1. Présentation

### 1.1 Objectif

Ce document décrit les opérations de maintenance réellement supportées par le dépôt Konatech Pointage : correction du code, reconstruction, réinstallation des dépendances, évolution des modules, gestion des migrations Prisma et contrôles après intervention.

### 1.2 Périmètre

Le périmètre couvre :

- l'application frontend Next.js ;
- l'API backend NestJS ;
- Prisma et les migrations versionnées ;
- PostgreSQL local sous Docker Compose ;
- les images Docker du frontend et du backend ;
- les fichiers de configuration, scripts et contrôles de qualité ;
- les procédures manuelles de sauvegarde et de restauration PostgreSQL documentées.

Les procédures non présentes dans le dépôt sont signalées explicitement.

### 1.3 Public concerné

Le document s'adresse aux développeurs, mainteneurs, responsables techniques, ingénieurs DevOps et SRE intervenant sur le code, les dépendances, le schéma de données ou les artefacts d'exécution.

Sources : `README.md`, `docs/ARCHITECTURE.md`, `package.json`, `TESTING_CHECKLIST.md`.

## 2. Architecture de maintenance

### 2.1 Frontend

Le frontend se trouve dans `apps/frontend`. Il utilise Next.js avec l'App Router, TypeScript et Tailwind CSS.

Les zones maintenues sont :

- les pages, layouts et états d'erreur ou de chargement dans `apps/frontend/app` ;
- les route handlers de proxy dans `apps/frontend/app/api` ;
- les composants réutilisables dans `apps/frontend/components` ;
- les fonctions d'accès API et de session dans `apps/frontend/lib` ;
- la configuration Next.js, TypeScript, Tailwind et PostCSS.

La construction est assurée par `pnpm build:frontend` et la vérification des types par `pnpm typecheck:frontend`.

Sources : `apps/frontend/package.json`, `apps/frontend/app/`, `apps/frontend/components/`, `apps/frontend/lib/`.

### 2.2 Backend

Le backend se trouve dans `apps/backend`. Il suit une architecture NestJS modulaire. Les modules présents couvrent l'authentification, les présences, le calendrier, le tableau de bord, les employés, les sanctions, les plannings et la santé.

Chaque domaine utilise les structures observées suivantes selon ses besoins :

- module NestJS ;
- contrôleur ;
- service ;
- DTO ;
- types ou constantes propres au domaine.

`AppModule` enregistre les modules et centralise la validation des variables d'environnement. `main.ts` configure le préfixe API, CORS, la validation globale, Helmet et les limites de corps.

Sources : `apps/backend/src/app.module.ts`, `apps/backend/src/main.ts`, `apps/backend/src/modules/`.

### 2.3 Prisma

La maintenance Prisma concerne :

- `apps/backend/prisma/schema.prisma` pour le modèle ;
- `apps/backend/prisma/migrations/` pour les migrations SQL versionnées ;
- `apps/backend/prisma/seed.ts` pour les données de démonstration ;
- `apps/backend/prisma.config.ts` pour les chemins, le seed et la datasource ;
- `apps/backend/src/common/prisma/` pour l'intégration applicative.

Prisma utilise PostgreSQL et reçoit sa connexion par `DATABASE_URL`.

### 2.4 PostgreSQL

PostgreSQL 16 Alpine est défini dans `docker-compose.yml`. Les données locales sont conservées dans le volume nommé `postgres-data`. Le dépôt documente des commandes manuelles `pg_dump`, `psql` et `pg_restore` pour les sauvegardes et restaurations de la base Compose de production.

Sources : `docker-compose.yml`, `README.md`.

### 2.5 Docker

La maintenance des images repose sur :

- `docker/backend.Dockerfile` ;
- `docker/frontend.Dockerfile` ;
- `docker-compose.yml` ;
- `.dockerignore` ;
- `.env.production.example`.

Le backend génère Prisma Client et compile NestJS pendant le build. Son image d'exécution installe Chromium. Le frontend compile Next.js pendant son build. Le profil Compose `app` regroupe les deux applications.

### 2.6 Configuration

Les configurations maintenues comprennent :

| Domaine | Fichiers |
|---|---|
| Workspace et dépendances | `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml` |
| Node.js | `.nvmrc`, section `engines` du `package.json` |
| Backend | `apps/backend/package.json`, `nest-cli.json`, `tsconfig.json`, `tsconfig.build.json` |
| Frontend | `apps/frontend/package.json`, `next.config.ts`, `tsconfig.json`, `tailwind.config.ts`, `postcss.config.js` |
| Qualité | `eslint.config.mjs`, `.prettierrc.json`, `.prettierignore` |
| Environnements | `apps/backend/.env.example`, `apps/frontend/.env.example`, `.env.production.example` |
| Docker | `docker-compose.yml`, `.dockerignore`, `docker/*.Dockerfile` |

### 2.7 Diagramme d'architecture

```text
                      Maintenance
                           |
            +--------------+--------------+
            |                             |
            v                             v
+----------------------+      +----------------------+
| Frontend Next.js     |      | Backend NestJS       |
| app / components     |      | modules / DTO / API  |
+----------+-----------+      +-----------+----------+
           |                              |
           | configuration                | PrismaService
           v                              v
+----------------------+      +----------------------+
| Build frontend       |      | Prisma schema        |
| image Docker         |      | migrations / seed    |
+----------------------+      +-----------+----------+
                                           |
                                           v
                               +----------------------+
                               | PostgreSQL           |
                               | volume postgres-data |
                               +----------------------+

Configuration transversale :
package.json + pnpm-lock.yaml + fichiers .env d'exemple + Compose
```

## 3. Maintenance corrective

### 3.1 Correction de bugs

Le dépôt ne définit pas un script ou workflow nommé pour la correction de bugs. Les corrections sont effectuées dans les sources concernées puis vérifiées avec les scripts de qualité et de test.

Les frontières de responsabilité documentées dans `docs/ARCHITECTURE.md` sont :

| Domaine | Source de vérité |
|---|---|
| Calcul des présences | `apps/backend/src/modules/attendance/attendance.service.ts` |
| Sécurité GPS et photo | services de sécurité et de stockage du module `attendance` |
| Calendrier | `apps/backend/src/modules/calendar/calendar.service.ts` |
| Sanctions | `apps/backend/src/modules/sanctions/` |
| Métriques du tableau de bord | `apps/backend/src/modules/dashboard/dashboard.service.ts` |
| Données des exports mensuels | `monthly-attendance-export.service.ts` |
| Rendu PDF premium | `monthly-attendance-puppeteer-pdf-renderer.service.ts` |
| Export CSV | `monthly-attendance-csv-exporter.service.ts` |

Après une correction, les contrôles disponibles sont :

```bash
pnpm typecheck
pnpm lint
pnpm test:backend
pnpm build
pnpm test:proxy
```

La commande consolidée est :

```bash
pnpm validate
```

Sources : `docs/ARCHITECTURE.md`, `docs/MODULE_REGISTRY.md`, `package.json`.

### 3.2 Redémarrage

En développement, `pnpm dev` gère simultanément le backend et le frontend. Son arrêt par `SIGINT` ou `SIGTERM` arrête les deux processus ; la relance s'effectue avec la même commande :

```bash
pnpm dev
```

Pour la pile Docker complète :

```bash
docker compose --profile app restart
```

Les services Compose déclarent aussi `restart: unless-stopped`.

Aucun script pnpm nommé `restart` n'est défini.

Sources : `scripts/dev.mjs`, `docker-compose.yml`, `package.json`.

### 3.3 Reconstruction

Reconstruction complète :

```bash
pnpm build
```

Reconstructions ciblées :

```bash
pnpm build:backend
pnpm build:frontend
```

Reconstruction des images et démarrage avec l'environnement de production Compose :

```bash
docker compose --env-file .env.production --profile app up -d --build
```

Le build backend supprime son ancien répertoire de sortie par la configuration Nest CLI. Le build frontend produit le répertoire `.next`.

Sources : `package.json`, `apps/backend/nest-cli.json`, `README.md`, Dockerfiles.

### 3.4 Nettoyage des artefacts Windows

Les scripts présents sont :

```powershell
pnpm clean:windows
pnpm clean:windows:dev
pnpm clean:windows:prisma
```

Le script PowerShell peut :

- supprimer `apps/backend/dist` ;
- supprimer `apps/frontend/.next` ;
- supprimer les fichiers `*.tsbuildinfo` hors `node_modules` ;
- arrêter les processus qui écoutent sur les ports de développement et de validation lorsque l'option correspondante est utilisée ;
- régénérer Prisma Client lorsque l'option correspondante est utilisée.

Il n'existe pas de script de nettoyage équivalent pour Bash.

Source : `scripts/clean-windows.ps1`.

### 3.5 Réinstallation

L'installation documentée des dépendances est :

```bash
pnpm install
```

Les Dockerfiles utilisent :

```bash
pnpm install --frozen-lockfile
```

Cette commande s'appuie sur le lockfile versionné. Aucun script dédié nommé `reinstall` n'est défini et aucune procédure de suppression automatique de `node_modules` n'est fournie.

Sources : `README.md`, `docker/backend.Dockerfile`, `docker/frontend.Dockerfile`, `pnpm-lock.yaml`.

### 3.6 Sauvegarde avant intervention sur les données

Le `README.md` documente une sauvegarde SQL simple :

```bash
docker compose --env-file .env.production exec -T postgres sh -lc 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > backup.sql
```

Il documente également une sauvegarde au format personnalisé :

```bash
docker compose --env-file .env.production exec -T postgres sh -lc 'pg_dump -Fc -U "$POSTGRES_USER" "$POSTGRES_DB"' > backup.dump
```

Ces commandes sont des procédures manuelles ; aucun script pnpm de sauvegarde n'est défini.

### 3.7 Restauration documentée

Restauration SQL simple :

```bash
cat backup.sql | docker compose --env-file .env.production exec -T postgres sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

Restauration du format personnalisé :

```bash
cat backup.dump | docker compose --env-file .env.production exec -T postgres sh -lc 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists'
```

Aucun script pnpm de restauration n'est défini.

Source : `README.md`.

## 4. Maintenance évolutive

### 4.1 Ajout ou évolution de modules backend

Les modules existants suivent l'organisation `apps/backend/src/modules/<domaine>`. Un module fonctionnel est enregistré dans `AppModule`. Les contrôleurs exposent les routes, les DTO portent la validation des entrées et les services contiennent la logique métier.

Les mécanismes réellement présents pour accompagner une évolution sont :

- l'enregistrement des modules dans `apps/backend/src/app.module.ts` ;
- la validation globale des DTO dans `apps/backend/src/main.ts` ;
- les tests end-to-end dans `apps/backend/test` ;
- le typecheck, le lint et le build ;
- le registre des responsabilités dans `docs/MODULE_REGISTRY.md`.

Le dépôt ne contient pas de générateur de module encapsulé par un script pnpm. Nest CLI est toutefois une dépendance de développement et sa configuration se trouve dans `apps/backend/nest-cli.json`.

### 4.2 Migrations Prisma

Une évolution du modèle est représentée par :

- une modification de `schema.prisma` ;
- une migration horodatée sous `apps/backend/prisma/migrations` ;
- une régénération de Prisma Client ;
- l'application de la migration avec le script adapté.

Les migrations présentes sont ordonnées par un préfixe numérique horodaté. La checklist de release exige que le schéma et les migrations restent cohérents et que les migrations soient versionnées.

Sources : `apps/backend/prisma/`, `docs/RELEASE_CHECKLIST.md`.

### 4.3 Évolution de l'API

L'API utilise le préfixe global `/api/v1`. Les routes sont définies dans les contrôleurs NestJS et les entrées dans les DTO. La validation globale supprime les propriétés non déclarées et rejette les propriétés supplémentaires.

Les appels frontend passent principalement par les route handlers Next.js, lesquels relaient les requêtes vers le backend.

Aucune génération OpenAPI, aucun fichier Swagger et aucun mécanisme de versionnement autre que le préfixe fixe `/api/v1` ne sont présents.

Sources : `apps/backend/src/main.ts`, contrôleurs backend, `apps/frontend/app/api/`.

### 4.4 Évolution du frontend

Les mécanismes observés sont :

- ajout ou modification de pages dans `apps/frontend/app` ;
- ajout de route handlers dans `apps/frontend/app/api` ;
- évolution de composants dans `apps/frontend/components` ;
- évolution des fonctions partagées dans `apps/frontend/lib` ;
- vérification par typecheck, build et test du proxy.

Les pages utilisent des fichiers `loading.tsx` et `error.tsx` dans plusieurs domaines. Les composants d'interface partagés se trouvent sous `apps/frontend/components/ui`.

Il n'existe aucun script de test unitaire frontend dans `apps/frontend/package.json`.

### 4.5 Traçabilité des évolutions

`CHANGELOG_DEV.md` définit des rubriques pour les ajouts, changements, corrections, validations et notes. `TESTING_CHECKLIST.md` indique que le résultat final de validation doit y être enregistré.

Le fichier contient une trame documentaire et des entrées de suivi ; aucun script ne met le changelog à jour automatiquement.

## 5. Gestion des migrations

### 5.1 Génération de Prisma Client

Depuis la racine :

```bash
pnpm prisma:generate
```

Depuis le backend :

```bash
pnpm --dir apps/backend prisma:generate
```

Le client cible les environnements `native` et `debian-openssl-3.0.x`.

Source : `apps/backend/prisma/schema.prisma`.

### 5.2 État des migrations

```bash
pnpm prisma:status
```

Ce script exécute `prisma migrate status` dans le backend et utilise `DATABASE_URL`.

### 5.3 Migration de développement

```bash
pnpm prisma:migrate
```

Le script exécute `prisma migrate dev`. Il est présent à la racine et dans le package backend.

### 5.4 Migration de déploiement

```bash
pnpm prisma:migrate:deploy
```

Le script exécute `prisma migrate deploy`. L'image backend exécute également cette commande avant chaque démarrage du serveur compilé.

Sources : `package.json`, `apps/backend/package.json`, `docker/backend.Dockerfile`.

### 5.5 Seed

```bash
pnpm prisma:seed
```

`prisma.config.ts` associe cette opération à `prisma/seed.ts`. Le seed crée ou met à jour des plannings, des employés de démonstration, des règles de sanction et des données de présence. Il est distinct du script `admin:create` destiné à créer un premier administrateur.

Le seed n'est pas exécuté automatiquement au démarrage des conteneurs.

### 5.6 Reset

Aucun script `prisma:reset`, `db:reset` ou appel versionné à `prisma migrate reset` n'est présent. Aucune procédure de reset d'une base de développement ou de production n'est documentée.

Les tests backend recréent leur base dédiée dans `test/test-database.ts`, puis exécutent `migrate deploy` et le seed. Ce comportement appartient uniquement au dispositif de test et ne constitue pas une procédure générale de reset.

### 5.7 Backfills

| Script | Rôle |
|---|---|
| `pnpm --dir apps/backend pins:backfill` | Générer les hash de codes PIN pour les enregistrements concernés |
| `pnpm --dir apps/backend snapshots:backfill` | Compléter les snapshots de planning des présences |

Les backfills sont des scripts TypeScript distincts des migrations Prisma.

Sources : `apps/backend/package.json`, `apps/backend/scripts/`.

### 5.8 Rollback

Aucune procédure de rollback du schéma PostgreSQL et aucun script de migration descendante ne sont présents.

Le réglage `ATTENDANCE_PDF_RENDERER=legacy` documenté comme rollback concerne uniquement le moteur de génération PDF ; il ne restaure ni le code, ni la base, ni les migrations.

Sources : `README.md`, `.env.production.example`, services d'export PDF.

## 6. Gestion des dépendances

### 6.1 Node.js

| Source | Contrainte observée |
|---|---|
| `.nvmrc` | `22.11.0` |
| `package.json` | `>=20.9.0 <23` |
| Dockerfiles | image `node:22-bookworm-slim` |

`README.md` documente `nvm use` pour sélectionner la version locale.

### 6.2 pnpm

Le `package.json` racine déclare :

- `pnpm@10.26.0` comme gestionnaire de paquets ;
- `pnpm >=10.0.0` dans les engines.

Le workspace inclut `apps/*`. `pnpm-workspace.yaml` autorise explicitement les dépendances ayant des scripts de build et contient des overrides de dépendances transitives.

### 6.3 Packages

Les dépendances sont réparties entre :

- `package.json` pour les outils transversaux ;
- `apps/backend/package.json` pour NestJS, Prisma, PostgreSQL côté client, sécurité, validation et tests ;
- `apps/frontend/package.json` pour Next.js, React, Tailwind et les composants ;
- `pnpm-lock.yaml` pour la résolution verrouillée.

Installation locale :

```bash
pnpm install
```

Installation pendant les builds Docker :

```bash
pnpm install --frozen-lockfile
```

Aucun script `update`, outil automatisé de mise à jour ou configuration Renovate/Dependabot n'est présent.

### 6.4 Prisma

Le backend déclare `@prisma/client` et `prisma` avec la contrainte `^6.0.0`. Après une modification du schéma ou une réinstallation affectant le client, la commande disponible est :

```bash
pnpm prisma:generate
```

### 6.5 Docker

Les versions d'images observées sont :

| Image | Utilisation |
|---|---|
| `node:22-bookworm-slim` | Build et exécution frontend/backend |
| `postgres:16-alpine` | Base PostgreSQL |

Les Dockerfiles installent les dépendances avec le lockfile. Aucune automatisation de mise à jour des images n'est présente.

### 6.6 Render et Neon

Render et Neon ne sont pas des dépendances déclarées dans les manifests du projet. Ils sont seulement cités dans le `README.md` comme environnement de shell et cible possible de `DATABASE_URL`.

Aucune procédure de mise à jour, aucun manifeste Render et aucune configuration Neon ne sont présents.

## 7. Vérifications après maintenance

### 7.1 Contrôle consolidé

```bash
pnpm validate
```

La commande exécute, dans l'ordre défini :

1. le contrôle Prettier ;
2. la génération Prisma ;
3. les typechecks ;
4. ESLint ;
5. les tests backend ;
6. le build frontend ;
7. le build backend ;
8. le test du proxy frontend/backend.

Source : `package.json`.

### 7.2 Build

| Commande | Périmètre |
|---|---|
| `pnpm build` | Backend et frontend |
| `pnpm build:backend` | Backend uniquement |
| `pnpm build:frontend` | Frontend uniquement |

### 7.3 Lint et format

| Commande | Fonction |
|---|---|
| `pnpm lint` | Vérifier le code avec ESLint |
| `pnpm lint:fix` | Appliquer les corrections ESLint disponibles |
| `pnpm format:check` | Vérifier le format Prettier |
| `pnpm format` | Formater avec Prettier |

Le build Next.js ignore son propre contrôle ESLint selon `next.config.ts`; le lint du dépôt reste une commande distincte.

### 7.4 Vérification des types

| Commande | Périmètre |
|---|---|
| `pnpm typecheck` | Deux applications |
| `pnpm typecheck:backend` | Backend |
| `pnpm typecheck:frontend` | Frontend |

### 7.5 Tests

| Commande | Contrôle |
|---|---|
| `pnpm test` | Tests backend |
| `pnpm test:backend` | Tests end-to-end Jest backend |
| `pnpm test:proxy` | Démarrage temporaire et connexion frontend/backend |

Les tests backend utilisent une base dédiée. Ils la recréent, appliquent les migrations et exécutent le seed avant les suites concernées.

Aucun script de tests unitaires ou end-to-end propre au frontend n'est défini.

### 7.6 Healthchecks

Backend :

```bash
curl http://localhost:4000/api/v1/health
```

Proxy frontend :

```bash
curl http://localhost:3000/api/health
```

Le healthcheck backend confirme la disponibilité HTTP de NestJS mais ne réalise pas de requête explicite vers PostgreSQL. Le healthcheck frontend relaie le backend.

Sources : contrôleur de santé backend, route de santé frontend, `docker-compose.yml`.

### 7.7 API et frontend

Les vérifications manuelles présentes dans `TESTING_CHECKLIST.md` et `docs/RELEASE_CHECKLIST.md` couvrent notamment :

- authentification et autorisations ;
- employés et plannings ;
- pointage et calculs de présence ;
- sécurité GPS/photo conditionnelle ;
- tableau de bord et historique ;
- calendrier et sanctions ;
- exports mensuels ;
- affichage responsive et états d'erreur frontend.

Ces contrôles sont des checklists ; ils ne sont pas tous automatisés.

### 7.8 Prisma et Docker

```bash
pnpm prisma:status
docker compose --profile app ps
docker compose --env-file .env.production logs -f backend frontend postgres
```

La première commande vérifie l'état des migrations. Les deux commandes Docker affichent l'état et les journaux de la pile exécutée.

## 8. Procédures disponibles

| Script ou commande | Portée de maintenance |
|---|---|
| `pnpm install` | Installer ou réinstaller les dépendances du workspace |
| `pnpm dev` | Démarrer les deux applications après modification |
| `pnpm dev:backend` | Démarrer le backend seul |
| `pnpm dev:frontend` | Démarrer le frontend seul |
| `pnpm build` | Reconstruire les deux applications |
| `pnpm build:backend` | Reconstruire le backend |
| `pnpm build:frontend` | Reconstruire le frontend |
| `pnpm typecheck` | Vérifier les types des deux applications |
| `pnpm typecheck:backend` | Vérifier les types backend |
| `pnpm typecheck:frontend` | Vérifier les types frontend |
| `pnpm lint` | Contrôler le code avec ESLint |
| `pnpm lint:fix` | Corriger les problèmes ESLint pris en charge |
| `pnpm format` | Appliquer le formatage Prettier |
| `pnpm format:check` | Contrôler le formatage |
| `pnpm check` | Exécuter lint, typecheck et build |
| `pnpm validate` | Exécuter la validation complète |
| `pnpm validate:backend` | Valider le backend |
| `pnpm validate:frontend` | Valider le frontend et son proxy |
| `pnpm test` | Exécuter les tests backend |
| `pnpm test:backend` | Exécuter les tests end-to-end backend |
| `pnpm test:proxy` | Vérifier l'intégration frontend/backend |
| `pnpm db:up` | Démarrer PostgreSQL local |
| `pnpm db:down` | Arrêter Compose sans suppression explicite du volume |
| `pnpm db:status` | Afficher l'état Compose |
| `pnpm prisma:generate` | Régénérer Prisma Client |
| `pnpm prisma:status` | Contrôler l'état des migrations |
| `pnpm prisma:migrate` | Créer ou appliquer une migration de développement |
| `pnpm prisma:migrate:deploy` | Appliquer les migrations versionnées en déploiement |
| `pnpm prisma:seed` | Charger le seed |
| `pnpm --dir apps/backend admin:create` | Créer le premier administrateur s'il n'existe pas |
| `pnpm --dir apps/backend pins:backfill` | Exécuter le backfill des hash PIN |
| `pnpm --dir apps/backend snapshots:backfill` | Exécuter le backfill des snapshots |
| `pnpm clean:windows` | Supprimer les artefacts de build Windows |
| `pnpm clean:windows:dev` | Nettoyer et arrêter les serveurs sur les ports ciblés |
| `pnpm clean:windows:prisma` | Nettoyer et régénérer Prisma Client sous Windows |
| `docker compose --profile app restart` | Redémarrer la pile conteneurisée |
| `docker compose --env-file .env.production --profile app up -d --build` | Reconstruire et démarrer la pile de production Compose |

Les sauvegardes et restaurations PostgreSQL sont documentées comme commandes manuelles dans `README.md`, pas comme scripts.

## 9. Dépendances

```text
+----------------------+
| Maintenance          |
+----------+-----------+
           |
           v
+----------------------+
| Code source          |
| Frontend + Backend   |
+----------+-----------+
           |
           v
+----------------------+
| Prisma               |
| schéma + migrations  |
+----------+-----------+
           |
           v
+----------------------+
| Base PostgreSQL      |
+----------+-----------+
           |
           v
+----------------------+
| Application          |
| API + interface web  |
+----------------------+
```

Une modification limitée au frontend ne traverse pas nécessairement Prisma ou PostgreSQL. Le diagramme représente la chaîne complète lorsqu'une maintenance touche le modèle de données et le comportement applicatif.

## 10. Traçabilité

| Procédure ou domaine | Fichiers concernés |
|---|---|
| Architecture et sources de vérité | `docs/ARCHITECTURE.md`, `docs/MODULE_REGISTRY.md` |
| Scripts de maintenance | `package.json`, `apps/backend/package.json`, `apps/frontend/package.json` |
| Démarrage et arrêt local | `scripts/dev.mjs` |
| Nettoyage Windows | `scripts/clean-windows.ps1` |
| Reconstruction backend | `apps/backend/nest-cli.json`, `apps/backend/tsconfig.build.json` |
| Reconstruction frontend | `apps/frontend/next.config.ts`, `apps/frontend/tsconfig.json` |
| Construction Docker | `docker/backend.Dockerfile`, `docker/frontend.Dockerfile` |
| Orchestration et redémarrage | `docker-compose.yml` |
| Dépendances et versions | `.nvmrc`, `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml` |
| Configuration qualité | `eslint.config.mjs`, `.prettierrc.json` |
| Configuration backend | `apps/backend/src/app.module.ts`, `apps/backend/src/main.ts` |
| Structure frontend | `apps/frontend/app/`, `apps/frontend/components/`, `apps/frontend/lib/` |
| Schéma Prisma | `apps/backend/prisma/schema.prisma` |
| Configuration Prisma | `apps/backend/prisma.config.ts` |
| Migrations | `apps/backend/prisma/migrations/` |
| Seed | `apps/backend/prisma/seed.ts` |
| Backfills | `apps/backend/scripts/backfill-employee-pin-code-hashes.ts`, `apps/backend/scripts/backfill-attendance-schedule-snapshots.ts` |
| Base et volume PostgreSQL | `docker-compose.yml` |
| Sauvegarde et restauration | `README.md` |
| Tests backend | `apps/backend/test/`, `apps/backend/test/jest-e2e.json` |
| Préparation de la base de test | `apps/backend/test/test-database.ts`, `apps/backend/test/test-environment.ts` |
| Test du proxy | `scripts/validate-proxy.mjs` |
| Healthchecks | contrôleur santé backend, route santé frontend, `docker-compose.yml` |
| Contrôles avant livraison | `TESTING_CHECKLIST.md`, `docs/RELEASE_CHECKLIST.md` |
| Historique des maintenances | `CHANGELOG_DEV.md` |
| Exclusions d'artefacts et secrets | `.gitignore`, `.dockerignore` |
| Mentions Render et Neon | `README.md`, `documentation/02-SAR/15-Deploiement.md` |

## 11. Observations techniques

### 11.1 Limitations constatées

- Aucun pipeline CI/CD n'est présent.
- Aucun script automatisé de mise à jour des dépendances n'est présent.
- Aucune configuration Renovate ou Dependabot n'est présente.
- Aucun test frontend autonome n'est défini dans le package frontend.
- Aucun script de reset Prisma ou PostgreSQL n'est défini.
- Aucun rollback de schéma ou migration descendante n'est défini.
- Aucun script pnpm de sauvegarde ou restauration n'est défini.
- Aucun script de nettoyage Bash n'est présent.
- Aucun manifeste Render ni configuration Neon n'est versionné.
- Aucun environnement de staging exécutable n'est défini.

### 11.2 Comportements observés

- Le build backend efface le répertoire de sortie avant compilation.
- Le script de nettoyage Windows supprime les sorties backend et frontend ainsi que les fichiers `*.tsbuildinfo`.
- Les builds Docker installent les dépendances avec `--frozen-lockfile`.
- Le conteneur backend exécute `prisma migrate deploy` avant de démarrer l'API.
- Le seed n'est pas lancé automatiquement dans le conteneur.
- Les tests backend recréent leur base dédiée, appliquent les migrations puis chargent le seed.
- `pnpm db:down` n'inclut pas l'option de suppression des volumes.
- Les secrets et fichiers d'environnement locaux sont exclus de Git et du contexte Docker.
- Les fichiers SQL de migration Prisma restent inclus dans le contexte Docker malgré l'exclusion générale des fichiers SQL.

### 11.3 Conventions observées

- Les identifiants techniques et le code sont en anglais.
- Les modules backend sont regroupés par domaine dans `src/modules`.
- La logique métier est placée dans les services backend.
- Les entrées API utilisent des DTO et une validation globale.
- Les pages frontend suivent l'App Router.
- Les composants réutilisables sont placés sous `apps/frontend/components`.
- Les migrations utilisent des répertoires au nom horodaté.
- Le lockfile pnpm est versionné.
- Prettier utilise les guillemets simples, les points-virgules, les virgules finales et une largeur de 80 caractères.
- Les modifications significatives peuvent être consignées dans `CHANGELOG_DEV.md` selon les rubriques définies.
- Les fonctions de sécurité GPS et photo restent conditionnelles ; leur autorité demeure dans le backend.

### 11.4 Procédures absentes

- reset général de la base ;
- rollback de migration ;
- rollback automatisé d'une version applicative ;
- mise à jour automatisée des packages ;
- rotation automatisée des secrets ;
- nettoyage multi-plateforme ;
- maintenance planifiée par ordonnanceur ;
- test frontend dédié ;
- création automatisée d'une release ;
- déploiement automatisé Render ;
- maintenance Neon spécifique.
