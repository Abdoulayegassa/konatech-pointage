# Démarrage et arrêt des services

| Métadonnée | Valeur |
|---|---|
| Document ID | OG-003 |
| Titre | Démarrage et arrêt des services |
| Version | 1.0 |
| Statut | Validé |
| Classification | Interne |
| Référence | Operations Guide |
| Projet | Konatech Pointage |

# 1. Présentation

Ce chapitre décrit les séquences de démarrage, d’arrêt et de vérification réellement fournies par le dépôt Konatech Pointage. Il couvre l’exécution locale avec pnpm, PostgreSQL avec Docker Compose, les applications construites, la pile Compose sous le profil `app` et les commandes Prisma disponibles.

Les commandes sont exécutées depuis la racine du dépôt, sauf lorsqu’un chemin de travail différent est indiqué. Le seed est une opération explicite et distincte : aucun script de démarrage local ne l’exécute automatiquement.

# 2. Dépendances préalables

| Dépendance | Rôle dans le démarrage | Version ou configuration observée | Source |
|---|---|---|---|
| Node.js | Exécuter pnpm, les scripts Node.js, Next.js, NestJS et Prisma | `>=20.9.0 <23` dans le manifeste ; `.nvmrc` contient `22.11.0` ; images Docker fondées sur Node.js 22 | `package.json`, `.nvmrc`, `docker/backend.Dockerfile`, `docker/frontend.Dockerfile` |
| pnpm | Installer et exécuter le workspace | `pnpm@10.26.0`, version minimale `10.0.0` | `package.json` |
| PostgreSQL | Fournir la base relationnelle utilisée par Prisma et le backend | PostgreSQL 16 dans Compose | `docker-compose.yml`, `apps/backend/prisma/schema.prisma` |
| Docker Compose | Démarrer PostgreSQL localement et la pile conteneurisée | Services `postgres`, `backend` et `frontend`; profil `app` pour les applications | `docker-compose.yml`, `package.json` |
| Prisma CLI et Prisma Client | Générer le client, contrôler et appliquer les migrations, exécuter le seed | Dépendances du backend en version majeure 6 | `apps/backend/package.json`, `apps/backend/prisma.config.ts` |
| Variables d’environnement backend | Fournir port, origine frontend, secret JWT, connexion PostgreSQL et paramètres applicatifs | Fichier local chargé depuis `apps/backend`; validation Joi au bootstrap | `apps/backend/.env.example`, `apps/backend/src/app.module.ts` |
| Variables d’environnement frontend | Fournir l’URL publique et les URL de l’API | `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_API_BASE_URL`, `API_BASE_URL` | `apps/frontend/.env.example`, `apps/frontend/lib/api.ts` |
| Chromium | Exécuter le rendu PDF Puppeteer dans l’image backend | Installé dans l’image et exposé par `ATTENDANCE_PDF_EXECUTABLE_PATH` | `docker/backend.Dockerfile` |

Docker n’est requis par la séquence locale fournie que pour le PostgreSQL géré par `docker-compose.yml`. Le backend dépend dans tous les modes d’une base PostgreSQL accessible par `DATABASE_URL`.

# 3. Séquence complète de démarrage

## 3.1 Développement local

La séquence locale décrite par `README.md` et matérialisée par les scripts est la suivante :

```text
Sélection du runtime Node.js
            |
            v
Installation du workspace
            |
            v
Création des fichiers d’environnement locaux
            |
            v
Démarrage de PostgreSQL
            |
            v
Génération de Prisma Client
            |
            v
Contrôle et application des migrations
            |
            v
Seed explicite des données
            |
            v
Démarrage conjoint backend + frontend
            |
            v
Contrôles HTTP, Prisma et tests
```

Les commandes de la séquence locale sont :

```bash
nvm use
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

`nvm use` est documenté dans `README.md` et s’appuie sur `.nvmrc`. Les deux commandes `cp` sont les commandes Unix documentées pour créer les fichiers locaux à partir des fichiers d’exemple.

## 3.2 Pile construite avec Docker Compose

La pile conteneurisée utilise la commande publiée dans `README.md` :

```bash
docker compose --env-file .env.production --profile app up -d --build
```

Compose démarre PostgreSQL et attend son healthcheck. Le conteneur backend exécute ensuite `prisma migrate deploy`, démarre `node dist/main.js` et doit devenir sain. Le frontend est alors démarré avec `next start`.

```text
Build des images
       |
       v
PostgreSQL démarré et sain
       |
       v
Migration Prisma de déploiement
       |
       v
Backend démarré et sain
       |
       v
Frontend démarré et sain
```

# 4. Installation des dépendances

Le workspace est défini par `pnpm-workspace.yaml` avec le motif `apps/*`. L’installation racine couvre donc les paquets frontend et backend :

```bash
pnpm install
```

Les Dockerfiles utilisent l’installation verrouillée suivante pendant la construction :

```bash
pnpm install --frozen-lockfile
```

La version Node.js du dépôt peut être sélectionnée avec la commande documentée :

```bash
nvm use
```

Le dépôt possède un lockfile unique, `pnpm-lock.yaml`. Les Dockerfiles copient les trois manifestes du workspace avant l’installation, puis copient le reste du dépôt.

# 5. Préparation de la base

## 5.1 Démarrage et état de PostgreSQL local

```bash
pnpm db:up
pnpm db:status
```

`pnpm db:up` exécute `docker compose up -d`. Comme le backend et le frontend sont placés sous le profil `app`, cette commande démarre le service `postgres` seul dans la configuration par défaut.

## 5.2 Génération et migrations Prisma

Les commandes Prisma disponibles à la racine sont :

```bash
pnpm prisma:generate
pnpm prisma:status
pnpm prisma:migrate
pnpm prisma:migrate:deploy
```

| Commande | Effet défini par le script | Contexte observable | Source |
|---|---|---|---|
| `pnpm prisma:generate` | Exécuter `prisma generate` dans `apps/backend` | Après installation et lors de la préparation du client | `package.json` |
| `pnpm prisma:status` | Exécuter `prisma migrate status` | Lire l’état des migrations de la base ciblée | `package.json` |
| `pnpm prisma:migrate` | Exécuter `prisma migrate dev` | Préparation de la base de développement | `package.json`, `README.md` |
| `pnpm prisma:migrate:deploy` | Exécuter `prisma migrate deploy` | Application des migrations existantes dans un flux construit | `package.json`, `docker/backend.Dockerfile` |

Dans le conteneur backend, la migration de déploiement précède obligatoirement le processus applicatif :

```text
prisma migrate deploy
          |
          | succès
          v
node dist/main.js
```

## 5.3 Seed

Le seed est déclaré dans `apps/backend/prisma.config.ts` et lancé par :

```bash
pnpm prisma:seed
```

Cette commande exécute `prisma db seed`. Elle est incluse dans la séquence locale du `README.md`, mais pas dans `pnpm dev`, `pnpm build`, le démarrage backend construit ni la commande du conteneur backend.

# 6. Démarrage du backend

## 6.1 Développement

Le backend seul est démarré en surveillance avec :

```bash
pnpm dev:backend
```

Le script racine exécute le CLI NestJS avec `start --watch` dans `apps/backend`. Le backend lit sa configuration, initialise `AppModule`, configure le préfixe `/api/v1` et écoute sur `PORT`, dont la valeur par défaut validée est `4000`.

Le backend peut aussi être démarré avec le frontend par :

```bash
pnpm dev
```

## 6.2 Build

Le build du backend seul est :

```bash
pnpm build:backend
```

Le script exécute `nest build` dans `apps/backend`. Le build global commence par ce build :

```bash
pnpm build
```

## 6.3 Exécution construite

Après le build, le script backend démarre `node dist/main.js` :

```bash
pnpm --dir apps/backend start
```

Dans Docker, la commande d’image applique d’abord les migrations, puis exécute directement `node dist/main.js`. Le service Compose définit `NODE_ENV=production` et `PORT=4000`.

# 7. Démarrage du frontend

## 7.1 Développement

Le frontend seul est démarré avec :

```bash
pnpm dev:frontend
```

Ce script exécute `next dev` dans `apps/frontend`. La configuration locale fournie utilise le frontend sur le port `3000` et l’API backend sous `/api/v1`.

Le frontend est également inclus dans :

```bash
pnpm dev
```

## 7.2 Build

Le build du frontend seul est :

```bash
pnpm build:frontend
```

Le build global compile le backend puis le frontend :

```bash
pnpm build
```

## 7.3 Exécution construite

Après le build Next.js :

```bash
pnpm --dir apps/frontend start
```

Le script exécute `next start`. Dans l’image Docker, Next.js est explicitement lancé sur `0.0.0.0:3000`.

# 8. Arrêt des services

## 8.1 Démarrage conjoint local

`pnpm dev` utilise `scripts/dev.mjs`. Le processus coordinateur intercepte `SIGINT` et `SIGTERM` et transmet le signal aux processus backend et frontend. Il arrête également l’autre processus si l’un des deux se termine.

L’arrêt manuel observable du démarrage conjoint consiste à interrompre le processus `pnpm dev` depuis son terminal. Le signal reçu est alors propagé par le script :

```text
SIGINT ou SIGTERM
        |
        v
`scripts/dev.mjs`
        |
        +----> processus backend
        |
        +----> processus frontend
```

## 8.2 PostgreSQL et services Compose

La commande d’arrêt définie à la racine est :

```bash
pnpm db:down
```

Elle exécute `docker compose down`. Compose arrête et supprime les conteneurs et le réseau du projet concerné. Le volume nommé `postgres-data` n’est pas supprimé par cette commande.

## 8.3 Nettoyage Windows avec arrêt des serveurs

Le dépôt fournit un script Windows qui recherche et arrête de force les processus en écoute sur les ports de développement déclarés, puis nettoie les sorties de build :

```powershell
pnpm clean:windows:dev
```

Cette commande exécute `scripts/clean-windows.ps1` avec `-KillDevServers`. Les ports inspectés par le script sont `3000`, `3001`, `3100`, `4000`, `4001` et `4100`.

## 8.4 Processus de test proxy

`pnpm test:proxy` gère ses propres processus temporaires. Son bloc de finalisation arrête le backend et le frontend à la fin du contrôle. Sous Windows, il utilise `taskkill`; sur les autres systèmes, il envoie `SIGTERM`, puis `SIGKILL` après le délai codé si le processus reste actif.

Aucun script `stop` n’est défini dans `apps/backend/package.json` ou `apps/frontend/package.json`. Aucun service systemd, PM2 ou Kubernetes n’est configuré dans le dépôt.

# 9. Vérification du bon fonctionnement

| Point de contrôle | Commande ou accès disponible | Résultat contrôlé | Source |
|---|---|---|---|
| État Compose | `pnpm db:status` | Affiche les services et leur état Compose | `package.json` |
| Santé PostgreSQL | Healthcheck `pg_isready` | État sain du service `postgres` | `docker-compose.yml` |
| Santé backend locale | `http://localhost:4000/api/v1/health` | Réponse JSON avec `status: ok`, identifiant du service et horodatage | `README.md`, `apps/backend/src/modules/health/health.controller.ts` |
| Santé backend Compose | Healthcheck HTTP interne | Réponse réussie de `/api/v1/health` sur le port `4000` | `docker-compose.yml` |
| Santé via frontend | `http://localhost:3000/api/health` | Capacité du serveur Next.js à joindre l’endpoint backend | `README.md`, `apps/frontend/app/api/health/route.ts` |
| Frontend | `http://localhost:3000` | Réponse de l’application Next.js | `README.md`, `apps/frontend/package.json` |
| API | `http://localhost:4000/api/v1` | Base des routes exposées par NestJS | `README.md`, `apps/backend/src/main.ts` |
| État Prisma | `pnpm prisma:status` | État des migrations pour `DATABASE_URL` | `package.json`, `apps/backend/prisma.config.ts` |
| Tests backend | `pnpm test:backend` | Exécution des suites Jest e2e | `package.json`, `apps/backend/test/jest-e2e.json` |
| Raccordement frontend/backend | `pnpm test:proxy` | Santé backend, proxy frontend et redirection vers `/attendance-entry` | `package.json`, `scripts/validate-proxy.mjs` |
| Validation globale | `pnpm validate` | Format, Prisma Client, typage, lint, tests, builds et proxy | `package.json` |
| Santé des conteneurs applicatifs | `docker compose --env-file .env.production ps` | État des trois services de la pile | `README.md`, `docker-compose.yml` |
| Journaux Compose | `docker compose --env-file .env.production logs -f backend frontend postgres` | Sorties des trois conteneurs | `README.md` |

L’endpoint backend ne réalise pas de requête Prisma. La route frontend `/api/health` vérifie la communication vers le backend, mais pas directement la base.

# 10. Traçabilité

| Procédure ou élément | Fichier ou répertoire source | Preuve observée |
|---|---|---|
| Versions Node.js et pnpm | `package.json`, `.nvmrc` | Plage `engines`, gestionnaire pnpm et version Node.js locale |
| Installation du workspace | `README.md`, `pnpm-workspace.yaml`, `pnpm-lock.yaml` | Commande `pnpm install`, paquets `apps/*` et résolution verrouillée |
| Configuration locale | `README.md`, `apps/backend/.env.example`, `apps/frontend/.env.example` | Commandes de copie et noms des variables |
| Démarrage PostgreSQL | `package.json`, `docker-compose.yml` | `db:up` exécute Compose ; service `postgres` actif sans profil |
| État et arrêt Compose | `package.json` | `db:status` et `db:down` correspondent à `compose ps` et `compose down` |
| Génération Prisma | `package.json`, `apps/backend/prisma.config.ts` | Script `prisma:generate` et chemin du schéma |
| État et migrations Prisma | `package.json`, `apps/backend/prisma/migrations` | Scripts `migrate status`, `migrate dev` et `migrate deploy` |
| Seed | `package.json`, `apps/backend/prisma.config.ts`, `apps/backend/prisma/seed.ts` | Script `prisma:seed` et commande de seed déclarée |
| Démarrage conjoint | `package.json`, `scripts/dev.mjs` | Création des processus NestJS et Next.js |
| Arrêt conjoint | `scripts/dev.mjs` | Gestion de `SIGINT`, `SIGTERM` et fin de l’un des enfants |
| Build backend | `package.json`, `apps/backend/package.json` | Scripts racine et applicatif fondés sur `nest build` |
| Exécution backend construite | `apps/backend/package.json`, `docker/backend.Dockerfile` | `node dist/main.js`; migration préalable dans l’image |
| Build frontend | `package.json`, `apps/frontend/package.json` | Scripts racine et applicatif fondés sur `next build` |
| Exécution frontend construite | `apps/frontend/package.json`, `docker/frontend.Dockerfile` | `next start`; hôte et port explicites dans l’image |
| Pile Compose | `README.md`, `docker-compose.yml` | Commande avec profil `app`, dépendances de santé et trois services |
| Arrêt Windows | `package.json`, `scripts/clean-windows.ps1` | Option `KillDevServers` et ports inspectés |
| Santé backend | `apps/backend/src/modules/health/health.controller.ts`, `docker-compose.yml` | Endpoint public et healthcheck backend |
| Santé frontend | `apps/frontend/app/api/health/route.ts`, `docker-compose.yml` | Proxy de santé et healthcheck frontend |
| Test de raccordement | `scripts/validate-proxy.mjs` | Démarrage, contrôles puis arrêt des processus temporaires |
| Documentation opérationnelle antérieure | `documentation/07-Operations-Guide/01-Presentation-de-lexploitation.md`, `documentation/07-Operations-Guide/02-Architecture-dexecution.md` | Composants, environnements, architecture et dépendances déjà établis |

# 11. Observations

- Le dépôt distingue le démarrage de PostgreSQL, le démarrage conjoint des applications et l’exécution de la pile Compose.
- `pnpm db:up` ne démarre pas les conteneurs frontend et backend placés sous le profil `app`.
- `pnpm dev` démarre le backend en surveillance et le frontend en mode développement sans préparer la base ni exécuter le seed.
- Le build global compile le backend avant le frontend.
- Le démarrage backend construit n’exécute pas de migration par son script `start`; cette migration préalable est intégrée spécifiquement à la commande de l’image backend.
- Le seed est disponible pour les flux locaux et de test, mais n’est pas intégré au démarrage du conteneur backend.
- La pile Compose séquence PostgreSQL, backend et frontend au moyen des healthchecks.
- `scripts/dev.mjs` fournit une coordination d’arrêt pour le démarrage conjoint local.
- Les scripts applicatifs ne contiennent aucun script `stop`.
- `pnpm db:down` conserve le volume nommé de PostgreSQL.
- Le test proxy crée et arrête ses propres processus frontend et backend.
- La visibilité au démarrage repose sur les sorties des processus, les états Compose, les deux routes HTTP de santé et l’état des migrations Prisma.
