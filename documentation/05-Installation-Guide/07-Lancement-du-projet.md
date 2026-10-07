# Lancement du projet

| Métadonnée | Valeur |
| --- | --- |
| Document ID | IG-007 |
| Titre | Lancement du projet |
| Version | 1.0 |
| Statut | Validé |
| Classification | Interne |
| Référence | Installation Guide |

## 1. Présentation

### 1.1 Objectif

Ce chapitre décrit les commandes et séquences réellement disponibles pour
démarrer Konatech Pointage en développement, exécuter les artefacts construits
et lancer la pile Docker Compose.

### 1.2 Portée

Le périmètre couvre :

- le lanceur de développement du monorepo ;
- le lancement séparé des applications ;
- la construction et le démarrage des applications en mode production ;
- PostgreSQL avec Docker Compose ;
- la pile applicative du profil Compose `app` ;
- les contrôles de disponibilité et de raccordement.

### 1.3 Applications concernées

| Composant | Technologie | Emplacement |
| --- | --- | --- |
| Frontend | Next.js | `apps/frontend` |
| Backend | NestJS | `apps/backend` |
| Base | PostgreSQL | Service `postgres` de `docker-compose.yml` |
| Accès aux données | Prisma Client | `apps/backend/prisma`, `apps/backend/src/common/prisma` |

Références :
`README.md`,
`package.json`,
`docker-compose.yml`.

## 2. Modes de lancement

### 2.1 Modes disponibles

| Mode | Commande ou mécanisme | Composants démarrés | Particularité |
| --- | --- | --- | --- |
| Développement complet | `pnpm dev` | Frontend et backend | Deux processus enfants, NestJS en watch et Next.js en mode dev |
| Développement frontend | `pnpm dev:frontend` | Frontend | Next.js `dev` |
| Développement backend | `pnpm dev:backend` | Backend | NestJS `start --watch` |
| PostgreSQL local | `pnpm db:up` | PostgreSQL | Service Compose par défaut uniquement |
| Production backend hors Docker | Build, puis `pnpm --dir apps/backend start` | Backend | Exécute `node dist/main.js` |
| Production frontend hors Docker | Build, puis `pnpm --dir apps/frontend start` | Frontend | Exécute Next.js `start` |
| Production Docker Compose | `docker compose --env-file .env.production --profile app up -d --build` | PostgreSQL, backend, frontend | Build des images, dépendances de santé et migrations au démarrage |
| Contrôle temporaire du raccordement | `pnpm test:proxy` | Backend et frontend temporaires | Ports locaux disponibles, healthchecks et arrêt automatique |

Références :
`package.json`,
`apps/backend/package.json`,
`apps/frontend/package.json`,
`scripts/dev.mjs`,
`scripts/validate-proxy.mjs`,
`README.md`.

### 2.2 Développement

Le script racine `dev` appelle `scripts/dev.mjs`. Ce lanceur :

- démarre directement le CLI NestJS avec `start --watch` depuis
  `apps/backend` ;
- démarre directement le CLI Next.js avec `dev` depuis `apps/frontend` ;
- partage l'environnement du processus parent ;
- transmet les sorties des deux applications au terminal ;
- arrête l'autre processus lorsqu'un enfant se termine ;
- transmet `SIGINT` et `SIGTERM` aux enfants.

Référence :
`scripts/dev.mjs`.

### 2.3 Production hors Docker

Les manifests des applications exposent chacun un script `start` :

```bash
pnpm --dir apps/backend start
pnpm --dir apps/frontend start
```

Le backend attend un répertoire `dist` produit par son build. Le frontend
attend les artefacts `.next` produits par `next build`. Aucun script racine
`start` ne lance les deux artefacts ensemble.

Références :
`apps/backend/package.json`,
`apps/frontend/package.json`.

### 2.4 Docker

Le dépôt contient deux Dockerfiles multi-étapes et un fichier Compose. Le
profil `app` ajoute le backend et le frontend au service PostgreSQL par
défaut.

La commande de production documentée est :

```bash
docker compose --env-file .env.production --profile app up -d --build
```

Références :
`docker/backend.Dockerfile`,
`docker/frontend.Dockerfile`,
`docker-compose.yml`,
`README.md`.

### 2.5 Mode de contrôle temporaire

`pnpm test:proxy` n'est pas un mode d'exploitation persistant. Le script
réserve deux ports locaux, lance d'abord NestJS sans watch, attend sa santé,
lance Next.js en développement, vérifie le proxy et la redirection, puis
arrête les deux processus.

Référence :
`scripts/validate-proxy.mjs`.

## 3. Scripts de démarrage

### 3.1 Scripts racine

| Script | Commande déclarée | Rôle |
| --- | --- | --- |
| `pnpm dev` | `node ./scripts/dev.mjs` | Démarrer frontend et backend ensemble |
| `pnpm dev:backend` | CLI NestJS `start --watch` | Démarrer seulement le backend en watch |
| `pnpm dev:frontend` | CLI Next.js `dev` | Démarrer seulement le frontend en développement |
| `pnpm build` | `build:backend`, puis `build:frontend` | Construire les deux applications |
| `pnpm build:backend` | CLI NestJS `build` | Produire `apps/backend/dist` |
| `pnpm build:frontend` | CLI Next.js `build` | Produire les artefacts Next.js |
| `pnpm db:up` | `docker compose up -d` | Démarrer le service Compose par défaut |
| `pnpm db:down` | `docker compose down` | Arrêter les services Compose |
| `pnpm db:status` | `docker compose ps` | Afficher l'état Compose |
| `pnpm test:proxy` | `node ./scripts/validate-proxy.mjs` | Lancer et tester temporairement les applications |

Référence :
`package.json`.

### 3.2 Scripts backend

| Script | Commande déclarée | Mode |
| --- | --- | --- |
| `dev` | NestJS `start --watch` | Développement |
| `build` | NestJS `build` | Construction |
| `start` | `node dist/main.js` | Exécution de l'artefact compilé |

Le manifeste backend ne déclare pas de scripts nommés `start:dev` ou
`start:prod`. Leurs fonctions sont couvertes par `dev` et `start`.

Référence :
`apps/backend/package.json`.

### 3.3 Scripts frontend

| Script | Commande déclarée | Mode |
| --- | --- | --- |
| `dev` | Next.js `dev` | Développement |
| `build` | Next.js `build` | Construction |
| `start` | Next.js `start` | Exécution de l'artefact construit |

Le manifeste frontend ne déclare pas de script `preview`, `start:dev` ou
`start:prod`.

Référence :
`apps/frontend/package.json`.

### 3.4 Scripts absents à la racine

Le manifeste racine ne contient pas :

- `start` ;
- `start:dev` ;
- `start:prod` ;
- `preview` ;
- `serve`.

Aucune commande unique hors Docker n'est donc déclarée pour exécuter ensemble
les deux builds de production.

Référence :
`package.json`.

## 4. Procédure de lancement

### 4.1 Cycle général

```text
+-----------------------------+
| Configuration               |
| fichiers d'environnement    |
+---------------+-------------+
                |
                v
+-----------------------------+
| Installation                |
| pnpm install                |
+---------------+-------------+
                |
                v
+-----------------------------+
| Build                       |
| explicite en production     |
| implicite en développement  |
+---------------+-------------+
                |
                v
+-----------------------------+
| Lancement                   |
| pnpm dev ou Compose         |
+---------------+-------------+
                |
                v
+-----------------------------+
| Application opérationnelle  |
| frontend, API et base       |
+-----------------------------+
```

### 4.2 Procédure locale documentée

Depuis la racine du dépôt, le README décrit :

```bash
pnpm install
cp apps/backend/.env.example apps/backend/.env
cp apps/frontend/.env.example apps/frontend/.env.local
pnpm db:up
pnpm prisma:generate
pnpm prisma:status
pnpm prisma:migrate
pnpm prisma:seed
pnpm dev
```

Sous PowerShell, le README fournit les commandes `Copy-Item` correspondantes
et emploie `pnpm.cmd`.

Référence :
`README.md`.

### 4.3 Ordre réel en développement

`pnpm db:up` démarre PostgreSQL avant les commandes Prisma. `pnpm dev`
démarre ensuite frontend et backend en parallèle ; le lanceur n'attend pas
l'état de PostgreSQL et n'exécute ni migration ni seed.

```text
PostgreSQL
    |
    +--> Prisma generate / migrate / seed
    |
    +--> pnpm dev
            |
            +--> Backend NestJS --watch
            |
            +--> Frontend Next.js dev
```

Références :
`package.json`,
`scripts/dev.mjs`,
`README.md`.

### 4.4 Build et lancement hors Docker

Le build complet est :

```bash
pnpm build
```

Il construit d'abord le backend, puis le frontend. Les scripts d'exécution
disponibles sont ensuite :

```bash
pnpm --dir apps/backend start
pnpm --dir apps/frontend start
```

Ces deux commandes sont indépendantes. Le dépôt ne contient pas de lanceur de
production hors Docker qui les orchestre.

Références :
`package.json`,
`apps/backend/package.json`,
`apps/frontend/package.json`.

### 4.5 Lancement Docker de production

Le README décrit :

```bash
cp .env.production.example .env.production
docker compose --env-file .env.production --profile app up -d --build
```

La séquence résultante est :

```text
postgres --healthy--> backend --healthy--> frontend
                         |
                         +--> prisma migrate deploy
                         |
                         +--> node dist/main.js
```

Le frontend démarre avec `next start` sur `0.0.0.0:3000`. Le backend écoute le
port `4000` fixé par Compose.

Références :
`README.md`,
`docker-compose.yml`,
`docker/backend.Dockerfile`,
`docker/frontend.Dockerfile`.

## 5. Démarrage des composants

### 5.1 Frontend

En développement :

```bash
pnpm dev:frontend
```

Le script exécute Next.js en mode `dev`. La procédure locale documente
l'application à `http://localhost:3000`.

Pour un artefact construit :

```bash
pnpm build:frontend
pnpm --dir apps/frontend start
```

Dans l'image Docker, `next start` reçoit explicitement l'hôte `0.0.0.0` et le
port `3000`.

Références :
`package.json`,
`apps/frontend/package.json`,
`docker/frontend.Dockerfile`,
`README.md`.

### 5.2 Backend

En développement :

```bash
pnpm dev:backend
```

NestJS démarre avec la surveillance des sources. Le backend charge ses
fichiers d'environnement, valide leur contenu, installe le préfixe global
`/api/v1`, puis écoute `PORT`.

Pour un artefact construit :

```bash
pnpm build:backend
pnpm --dir apps/backend start
```

Dans Docker, la migration `deploy` précède le lancement de `dist/main.js`.

Références :
`package.json`,
`apps/backend/package.json`,
`apps/backend/src/app.module.ts`,
`apps/backend/src/main.ts`,
`docker/backend.Dockerfile`.

### 5.3 Base PostgreSQL

```bash
pnpm db:up
```

Cette commande exécute `docker compose up -d`. Comme `backend` et `frontend`
sont associés au profil `app`, le démarrage sans profil lance PostgreSQL
uniquement.

Le service :

- utilise l'image `postgres:16-alpine` ;
- publie par défaut le port hôte `5433` vers le port conteneur `5432` ;
- conserve les données dans le volume `postgres-data` ;
- vérifie sa disponibilité avec `pg_isready`.

Références :
`package.json`,
`docker-compose.yml`.

### 5.4 Prisma

Prisma n'est pas un service autonome. Avant le lancement local, les commandes
documentées sont :

```bash
pnpm prisma:generate
pnpm prisma:status
pnpm prisma:migrate
pnpm prisma:seed
```

Dans le conteneur backend, seule l'application des migrations existantes est
automatique au démarrage ; le seed ne l'est pas.

Références :
`README.md`,
`package.json`,
`docker/backend.Dockerfile`.

### 5.5 Services complémentaires

Cloudinary est appelé conditionnellement par le backend pour le stockage des
preuves photo. Il ne possède pas de service Compose ni de commande de
démarrage dans le dépôt.

Chromium est installé dans l'image backend pour le rendu PDF. Ce binaire n'est
pas un service séparé.

Render est mentionné pour l'exécution manuelle de commandes dans un shell et
Neon comme source possible de `DATABASE_URL`. Aucun manifeste de démarrage
Render ou configuration Neon n'est présent.

Références :
`apps/backend/src/modules/attendance/attendance-photo-storage.service.ts`,
`docker/backend.Dockerfile`,
`README.md`.

## 6. Vérification

### 6.1 État Docker

Pour PostgreSQL local :

```bash
pnpm db:status
```

Pour la pile de production documentée :

```bash
docker compose --env-file .env.production ps
```

Compose expose un healthcheck pour chacun des trois services.

Références :
`package.json`,
`docker-compose.yml`,
`README.md`.

### 6.2 Backend et API

Le backend expose publiquement :

```text
GET /api/v1/health
```

La réponse attendue contient `status: "ok"`, le nom du service et un
horodatage. Le README documente l'URL locale
`http://localhost:4000/api/v1/health`.

Références :
`apps/backend/src/main.ts`,
`apps/backend/src/modules/health/health.controller.ts`,
`README.md`.

### 6.3 Frontend

Le frontend est accessible localement à l'URL documentée
`http://localhost:3000`. Sa route :

```text
GET /api/health
```

appelle le healthcheck backend par le mécanisme serveur du frontend. Une
réponse saine vérifie donc le démarrage du frontend et l'accès HTTP au
backend.

Références :
`apps/frontend/app/api/health/route.ts`,
`apps/frontend/lib/api.ts`,
`README.md`.

### 6.4 Base PostgreSQL et migrations

Les mécanismes disponibles sont :

```bash
pnpm db:status
pnpm prisma:status
```

Le premier montre l'état Compose et le healthcheck PostgreSQL. Le second
compare les migrations à la base indiquée par `DATABASE_URL`.

Références :
`package.json`,
`docker-compose.yml`,
`apps/backend/prisma.config.ts`.

### 6.5 Raccordement frontend/backend

```bash
pnpm test:proxy
```

Le script vérifie :

- le démarrage du backend ;
- le payload de santé du backend ;
- le démarrage du frontend ;
- le même payload via `/api/health` ;
- la redirection du point d'entrée public ;
- la cohérence entre `FRONTEND_URL` et `NEXT_PUBLIC_APP_URL`.

Il arrête ensuite les processus temporaires.

Référence :
`scripts/validate-proxy.mjs`.

### 6.6 Journaux Docker

La commande documentée est :

```bash
docker compose --env-file .env.production logs -f backend frontend postgres
```

Elle affiche les sorties des trois conteneurs du scénario Compose.

Référence :
`README.md`.

### 6.7 Validation complète

```bash
pnpm validate
```

La chaîne vérifie le formatage, génère Prisma Client, exécute les contrôles
TypeScript et ESLint, les tests backend, les deux builds et le test proxy.
Elle ne constitue pas une commande de démarrage persistante.

Référence :
`package.json`.

## 7. Traçabilité

### 7.1 Commandes de développement

| Commande | Définition | Exécution |
| --- | --- | --- |
| `pnpm dev` | `package.json` | `scripts/dev.mjs` |
| `pnpm dev:backend` | `package.json` | CLI NestJS installé dans `apps/backend` |
| `pnpm dev:frontend` | `package.json` | CLI Next.js installé dans `apps/frontend` |
| `pnpm --dir apps/backend dev` | `apps/backend/package.json` | NestJS `start --watch` |
| `pnpm --dir apps/frontend dev` | `apps/frontend/package.json` | Next.js `dev` |

### 7.2 Build et production

| Commande ou mécanisme | Fichiers concernés |
| --- | --- |
| `pnpm build` | `package.json` |
| `pnpm build:backend` | `package.json`, `apps/backend/package.json` |
| `pnpm build:frontend` | `package.json`, `apps/frontend/package.json` |
| `pnpm --dir apps/backend start` | `apps/backend/package.json`, `apps/backend/src/main.ts` |
| `pnpm --dir apps/frontend start` | `apps/frontend/package.json` |
| Démarrage de l'image backend | `docker/backend.Dockerfile` |
| Démarrage de l'image frontend | `docker/frontend.Dockerfile` |
| Orchestration des trois services | `docker-compose.yml` |

### 7.3 Infrastructure et données

| Commande | Fichiers concernés |
| --- | --- |
| `pnpm db:up` | `package.json`, `docker-compose.yml` |
| `pnpm db:status` | mêmes fichiers |
| `pnpm db:down` | mêmes fichiers |
| Commandes Prisma préalables | `package.json`, `apps/backend/prisma.config.ts` |
| Migration au démarrage du backend Docker | `docker/backend.Dockerfile` |

### 7.4 Vérifications

| Contrôle | Fichiers concernés |
| --- | --- |
| Santé backend | `apps/backend/src/modules/health/health.controller.ts` |
| Préfixe et port backend | `apps/backend/src/main.ts` |
| Proxy de santé frontend | `apps/frontend/app/api/health/route.ts`, `apps/frontend/lib/api.ts` |
| Healthchecks Compose | `docker-compose.yml` |
| Test de raccordement | `scripts/validate-proxy.mjs`, `package.json` |
| Procédures et URL locales | `README.md` |

## 8. Observations

### 8.1 Dépendances

- Les dépendances pnpm doivent être installées avant les scripts Node.js.
- Prisma Client doit être généré avant le build et l'utilisation du backend.
- Le backend nécessite une `DATABASE_URL` PostgreSQL accessible.
- Le lancement local complet suppose que PostgreSQL et les migrations ont été
  préparés séparément.
- Le frontend dépend de l'URL de l'API pour les appels directs et serveur.
- La pile Compose construit les images et dépend de l'accès aux images et
  packages nécessaires.
- Le rendu PDF dans le conteneur backend dépend du Chromium installé par le
  Dockerfile.

### 8.2 Particularités

- `pnpm dev` lance les applications en parallèle, mais pas PostgreSQL.
- `pnpm db:up` lance PostgreSQL, mais pas les applications du profil `app`.
- Le lanceur de développement ne construit pas les applications.
- Le lanceur de développement n'applique pas les migrations et n'exécute pas
  le seed.
- La pile Compose impose l'ordre PostgreSQL sain, backend sain, puis frontend.
- Le backend Docker applique les migrations avant chaque lancement.
- Le frontend Docker reçoit ses URL publiques pendant le build et au runtime.
- `test:proxy` choisit des ports disponibles et nettoie ses processus.

### 8.3 Limitations observées

- Aucun script racine `start` ou `start:prod` n'est présent.
- Aucun lanceur de production hors Docker ne gère les deux applications.
- Aucun gestionnaire de processus tel que PM2 n'est configuré.
- Aucun script `preview` n'est présent.
- Aucun fichier `Procfile`, manifeste Render, configuration Vercel ou
  manifeste Kubernetes n'est présent.
- Aucun reverse proxy n'est défini dans le dépôt.
- Aucun script de redémarrage applicatif hors Docker n'est exposé.
- Le healthcheck backend retourne l'état du service, mais ne réalise pas de
  requête Prisma ou PostgreSQL.
- Le seed n'est pas exécuté automatiquement au démarrage Docker.
