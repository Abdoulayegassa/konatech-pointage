# Bonnes pratiques d'exploitation

| Métadonnée | Valeur |
| --- | --- |
| Document ID | SMOD-BEST-001 |
| Titre | Bonnes pratiques d'exploitation |
| Version | 1.0 |
| Statut | Validé |
| Classification | Interne |
| Référence | SMOD |
| Date de génération | 30 juillet 2026 |

## 1. Présentation

### 1.1 Objectif

Ce document décrit les pratiques d'exploitation déductibles des mécanismes
présents dans le dépôt Konatech Pointage. Il recense l'organisation du projet,
la gestion de la configuration et des dépendances, les vérifications
exécutables, ainsi que les scripts utiles aux opérations.

Le document restitue l'état observable du dépôt. Il ne définit pas de pratique
qui ne soit matérialisée par un fichier, un script, une configuration ou du
code source.

### 1.2 Périmètre

Le périmètre couvre :

- le monorepo pnpm ;
- l'application frontend Next.js ;
- l'API backend NestJS ;
- l'accès aux données par Prisma ;
- la base PostgreSQL lancée par Docker Compose ;
- les images Docker du frontend et du backend ;
- les fichiers d'exemple de configuration ;
- les commandes de construction, de contrôle, de test et d'exploitation
  déclarées dans les manifestes du projet.

Le périmètre ne couvre pas les pratiques propres à une plateforme
d'hébergement externe, car aucun manifeste Render, Neon ou autre manifeste
d'infrastructure cloud n'est présent dans le dépôt.

### 1.3 Public concerné

Ce document s'adresse aux personnes qui exploitent ou vérifient la plateforme :

- équipe DevOps et SRE ;
- mainteneurs du frontend et du backend ;
- administrateurs de la base PostgreSQL ;
- responsables des mises en service et des contrôles applicatifs.

### 1.4 Références principales

| Sujet | Fichiers de référence |
| --- | --- |
| Présentation et commandes | `README.md` |
| Scripts du monorepo | `package.json` |
| Scripts backend | `apps/backend/package.json` |
| Scripts frontend | `apps/frontend/package.json` |
| Espaces de travail pnpm | `pnpm-workspace.yaml` |
| Versions résolues | `pnpm-lock.yaml` |
| Version Node.js | `.nvmrc` |
| Orchestration locale et conteneurisée | `docker-compose.yml` |
| Construction des images | `docker/backend.Dockerfile`, `docker/frontend.Dockerfile` |

## 2. Organisation de l'exploitation

### 2.1 Structure du projet

Le dépôt est organisé en monorepo. Le fichier `pnpm-workspace.yaml` inclut les
paquets placés sous `apps/*`. Les deux applications déclarées sont :

| Composant | Emplacement | Rôle observable |
| --- | --- | --- |
| Frontend | `apps/frontend` | Application web Next.js, routes App Router et routes serveur |
| Backend | `apps/backend` | API NestJS, logique applicative, accès Prisma et tests e2e |
| Schéma de données | `apps/backend/prisma` | Schéma Prisma, migrations SQL et seed |
| Scripts communs | `scripts` | Démarrage conjoint, validation du proxy et nettoyage Windows |
| Conteneurisation | `docker`, `docker-compose.yml` | Construction et orchestration des services |
| Documentation d'entrée | `README.md` | Prérequis, configuration et commandes |

Le manifeste racine centralise les commandes communes et délègue leur exécution
aux applications avec `pnpm --dir`.

### 2.2 Séparation Frontend / Backend

Le frontend et le backend possèdent chacun :

- leur propre `package.json` ;
- leur configuration TypeScript ;
- leurs commandes `dev` et `build` ;
- leur Dockerfile ;
- leur fichier d'exemple de variables d'environnement.

Le frontend possède une commande `start` pour servir un build Next.js. Le
backend possède une commande `start` pour exécuter `dist/main.js`.

Le script racine `scripts/dev.mjs` démarre les deux applications comme deux
processus distincts. Il transmet l'environnement courant aux processus, affiche
leurs sorties dans le terminal et propage les signaux d'arrêt.

Références : `apps/frontend/package.json`, `apps/backend/package.json`,
`scripts/dev.mjs`, `docker/frontend.Dockerfile`,
`docker/backend.Dockerfile`.

### 2.3 Gestion des données

Le schéma `apps/backend/prisma/schema.prisma` déclare PostgreSQL comme source de
données et lit sa chaîne de connexion dans `DATABASE_URL`.

La gestion des données est matérialisée par :

- le schéma Prisma ;
- les migrations SQL versionnées dans
  `apps/backend/prisma/migrations` ;
- le seed dans `apps/backend/prisma/seed.ts` ;
- le service Prisma NestJS dans
  `apps/backend/src/common/prisma/prisma.service.ts` ;
- le volume Docker nommé `postgres-data`.

Le service Prisma ferme la connexion avec `$disconnect()` lors de la
destruction du module. Les tests backend préparent une base dédiée, appliquent
les migrations avec `migrate deploy`, exécutent le seed puis ferment leurs
connexions Prisma.

Références : `apps/backend/prisma/schema.prisma`,
`apps/backend/prisma/migrations`, `apps/backend/prisma/seed.ts`,
`apps/backend/src/common/prisma/prisma.service.ts`,
`apps/backend/test/test-database.ts`, `docker-compose.yml`.

### 2.4 Centralisation des scripts

Les opérations transverses sont exposées par le `package.json` racine :

- démarrage du développement ;
- construction globale ou par composant ;
- vérification TypeScript ;
- lint et formatage ;
- validations agrégées ;
- tests backend et test du proxy ;
- gestion de PostgreSQL avec Docker Compose ;
- génération du client et gestion des migrations Prisma.

Les scripts propres à une application restent dans son manifeste. Le backend
déclare notamment les scripts d'administration et de reprise de données
applicatives ; le frontend déclare son démarrage de production.

Références : `package.json`, `apps/backend/package.json`,
`apps/frontend/package.json`.

### 2.5 Organisation de la configuration

Les exemples de configuration locale sont séparés par composant :

- `apps/backend/.env.example` pour le backend ;
- `apps/frontend/.env.example` pour le frontend.

La configuration Docker de production est illustrée dans
`.env.production.example`. Les fichiers d'environnement effectifs sont exclus
du contexte Docker par `.dockerignore`. Plusieurs variantes de fichiers
d'environnement sont également exclues du suivi Git par `.gitignore`.

Le backend charge les fichiers selon l'environnement dans cet ordre :

1. `.env.<NODE_ENV>.local` ;
2. `.env.<NODE_ENV>` ;
3. `.env.local` ;
4. `.env`.

Les fichiers absents sont ignorés par le chargeur de configuration NestJS.

Références : `apps/backend/src/app.module.ts`, `.gitignore`,
`.dockerignore`, `apps/backend/.env.example`,
`apps/frontend/.env.example`, `.env.production.example`.

## 3. Gestion des configurations

### 3.1 Variables d'environnement du backend

Le backend utilise `ConfigModule.forRoot` avec un schéma Joi. Les variables
requises au démarrage sont :

| Variable | Usage observable | Contrôle |
| --- | --- | --- |
| `FRONTEND_URL` | Origine CORS et redirection vers le frontend | URI requise |
| `JWT_SECRET` | Secret d'authentification | Chaîne d'au moins 32 caractères |
| `DATABASE_URL` | Connexion PostgreSQL de Prisma | URI requise |

Le schéma définit aussi les variables de port, durée JWT, taille des requêtes,
limitation de débit, proxy, sécurité de pointage, coordonnées, rayons,
Cloudinary et rendu PDF. Des valeurs par défaut existent dans le schéma pour
une partie de ces variables.

Les relations suivantes sont validées par le code :

- latitude et longitude sont configurées ensemble ;
- les coordonnées sont requises lorsque la sécurité de pointage est activée ;
- le rayon d'avertissement ne peut pas être inférieur au rayon de confiance ;
- les trois identifiants Cloudinary sont configurés ensemble lorsqu'un de ces
  identifiants est renseigné ;
- en production, le secret JWT ne peut pas conserver une valeur identifiée
  comme locale ou de test ;
- en production, `FRONTEND_URL` doit utiliser HTTPS et ne peut pas viser
  localhost, une adresse privée ou un domaine de tunnel temporaire.

Référence : `apps/backend/src/app.module.ts`.

### 3.2 Variables d'environnement du frontend

Le frontend exploite trois URL :

| Variable | Usage observable |
| --- | --- |
| `NEXT_PUBLIC_APP_URL` | Origine publique du frontend et liens publics |
| `NEXT_PUBLIC_API_BASE_URL` | URL publique de base de l'API |
| `API_BASE_URL` | URL serveur de l'API pour les route handlers et le rendu serveur |

Le code de résolution des URL :

- accepte les valeurs de développement prévues par le code ;
- exige les URL nécessaires en production ;
- exige HTTPS en production ;
- refuse localhost, les adresses privées et les tunnels temporaires en
  production ;
- exige que les URL d'API se terminent par `/api/v1`.

Lorsque `API_BASE_URL` n'est pas renseignée, le code serveur utilise la valeur
résolue de `NEXT_PUBLIC_API_BASE_URL`.

Références : `apps/frontend/lib/api.ts`,
`apps/frontend/.env.example`, `.env.production.example`.

### 3.3 Configuration Prisma

Prisma est configuré par :

- `apps/backend/prisma/schema.prisma` pour le modèle et la source PostgreSQL ;
- `DATABASE_URL` pour la connexion ;
- `apps/backend/prisma/migrations` pour l'historique SQL ;
- `apps/backend/prisma/seed.ts` pour les données initiales ;
- les scripts `prisma:*` des manifestes racine et backend.

Le client Prisma est généré pendant la construction de l'image backend avant
la compilation NestJS. Au démarrage du conteneur backend, `prisma migrate
deploy` est exécuté avant `node dist/main.js`.

Références : `apps/backend/prisma/schema.prisma`,
`apps/backend/package.json`, `package.json`,
`docker/backend.Dockerfile`.

### 3.4 Configuration Docker

Docker Compose déclare trois services :

| Service | Configuration observable |
| --- | --- |
| `postgres` | PostgreSQL 16 Alpine, volume persistant, port configurable, healthcheck `pg_isready` |
| `backend` | Image construite localement, profil `app`, dépendance à PostgreSQL sain, healthcheck API |
| `frontend` | Image construite localement, profil `app`, dépendance au backend sain, healthcheck proxy |

`pnpm db:up` exécute `docker compose up -d` sans activer le profil `app` :
seul PostgreSQL est alors lancé. Le démarrage des trois services par Compose
utilise le profil `app`, tel que documenté dans `README.md`.

Les dépendances de santé définissent l'ordre de disponibilité :

```text
PostgreSQL sain
      |
      v
Backend sain
      |
      v
Frontend
```

Références : `docker-compose.yml`, `package.json`, `README.md`.

### 3.5 Configuration du build

Le build racine exécute séquentiellement :

1. le build backend NestJS ;
2. le build frontend Next.js.

Le Dockerfile backend installe les dépendances avec
`pnpm install --frozen-lockfile`, génère le client Prisma puis construit le
backend. Le Dockerfile frontend effectue également une installation figée puis
construit Next.js avec les URL publiques fournies comme arguments de build.

La configuration Next.js active le mode strict React et ignore ESLint pendant
le build. Le lint reste une commande indépendante à la racine et fait partie
des scripts `check` et `validate`.

Références : `package.json`, `docker/backend.Dockerfile`,
`docker/frontend.Dockerfile`, `apps/frontend/next.config.ts`.

## 4. Gestion des dépendances

### 4.1 Gestionnaire de paquets

Le dépôt déclare `pnpm@10.26.0` dans le champ `packageManager` du manifeste
racine. Le moteur accepté est `pnpm >=10.0.0`.

Le workspace regroupe les paquets sous `apps/*`. Le fichier
`pnpm-workspace.yaml` déclare également :

- les dépendances autorisées à exécuter leurs étapes de construction ;
- des substitutions de versions pour plusieurs dépendances transitives.

Références : `package.json`, `pnpm-workspace.yaml`.

### 4.2 Verrouillage

Le fichier `pnpm-lock.yaml` est présent à la racine. Les deux Dockerfiles le
copient avant l'installation et exécutent `pnpm install --frozen-lockfile`.
La résolution des dépendances des images repose donc sur le verrouillage
versionné.

Le script d'installation locale documenté est `pnpm install`, sans option
`--frozen-lockfile`.

Références : `pnpm-lock.yaml`, `docker/backend.Dockerfile`,
`docker/frontend.Dockerfile`, `README.md`.

### 4.3 Node.js

Le manifeste racine accepte Node.js `>=20.9.0 <23`. Le fichier `.nvmrc` fixe
`22.11.0` pour l'environnement local utilisant nvm. Les deux Dockerfiles
utilisent l'image `node:22-bookworm-slim` et activent Corepack.

Références : `package.json`, `.nvmrc`,
`docker/backend.Dockerfile`, `docker/frontend.Dockerfile`.

### 4.4 Prisma

Le backend déclare `@prisma/client` comme dépendance et `prisma` comme
dépendance de développement, toutes deux dans la gamme majeure 6. Le
verrouillage exact est porté par `pnpm-lock.yaml`.

La génération du client est incluse dans :

- `pnpm prisma:generate` ;
- `pnpm validate` ;
- `pnpm validate:backend` ;
- la phase de build de l'image backend.

Références : `apps/backend/package.json`, `package.json`,
`pnpm-lock.yaml`, `docker/backend.Dockerfile`.

### 4.5 Scripts liés aux dépendances

| Commande | Effet déclaré |
| --- | --- |
| `pnpm install` | Installe les dépendances du workspace |
| `pnpm prisma:generate` | Génère le client Prisma |
| `pnpm build` | Construit backend puis frontend |
| `pnpm validate` | Exécute la chaîne complète de validation |
| `pnpm clean:windows:prisma` | Nettoie les artefacts Windows puis régénère Prisma |

Le dépôt ne contient pas de script dédié à la mise à jour automatique des
dépendances, ni de configuration observable pour un robot de mise à jour.

Références : `package.json`, `scripts/clean-windows.ps1`.

## 5. Vérifications courantes

### 5.1 Build

| Périmètre | Commande | Contrôle effectué |
| --- | --- | --- |
| Plateforme | `pnpm build` | Build NestJS puis build Next.js |
| Backend | `pnpm build:backend` | Compilation NestJS |
| Frontend | `pnpm build:frontend` | Construction Next.js |

Les scripts `check` et `validate` intègrent aussi des builds. Le build frontend
n'exécute pas ESLint directement en raison de
`eslint.ignoreDuringBuilds: true`.

Références : `package.json`, `apps/frontend/next.config.ts`.

### 5.2 Tests

`pnpm test` est un alias de `pnpm test:backend`. Les tests backend sont exécutés
par Jest avec la configuration `apps/backend/test/jest-e2e.json`.

Le dispositif de test backend :

- fixe `NODE_ENV=test` ;
- charge `.env.test.local`, puis `.env.test` lorsqu'ils existent ;
- cible par défaut la base `konatech_attendance_test` ;
- recrée la base de test ;
- applique les migrations avec `migrate deploy` ;
- exécute le seed ;
- utilise Prisma pour les contrôles e2e.

`pnpm test:proxy` démarre le backend et le frontend sur des ports temporaires,
attend leurs endpoints de santé, vérifie la charge utile de santé et contrôle
la redirection d'entrée de pointage.

Le dépôt ne déclare pas de script de test unitaire frontend.

Références : `package.json`, `apps/backend/test/jest-e2e.json`,
`apps/backend/test/test-environment.ts`,
`apps/backend/test/test-database.ts`, `scripts/validate-proxy.mjs`.

### 5.3 Lint, formatage et typage

| Commande | Vérification observable |
| --- | --- |
| `pnpm lint` | Analyse ESLint du workspace |
| `pnpm format:check` | Vérification Prettier sans écriture |
| `pnpm typecheck` | Vérification TypeScript des deux applications |
| `pnpm check` | Lint, typecheck et build |
| `pnpm validate` | Format, Prisma, types, lint, tests et builds |

`pnpm lint:fix` et `pnpm format` modifient les fichiers. Les autres commandes
du tableau sont déclarées comme contrôles sans correction automatique.

Référence : `package.json`.

### 5.4 Healthchecks

Le backend expose publiquement `GET /api/v1/health`. La réponse contient :

- `status` avec la valeur `ok` ;
- `service` avec l'identifiant `konatech-attendance-api` ;
- un horodatage ISO.

Le frontend expose `GET /api/health`. Cette route appelle le healthcheck
backend et retransmet sa charge utile ou une erreur structurée.

Docker Compose teste :

- PostgreSQL avec `pg_isready` ;
- le backend avec une requête vers `http://127.0.0.1:4000/api/v1/health` ;
- le frontend avec une requête vers
  `http://127.0.0.1:3000/api/health`.

Le healthcheck backend confirme la disponibilité du processus API, mais son
contrôleur n'effectue pas de requête Prisma ou PostgreSQL. La santé de la base
est contrôlée séparément par le healthcheck du service PostgreSQL.

Références :
`apps/backend/src/modules/health/health.controller.ts`,
`apps/frontend/app/api/health/route.ts`, `docker-compose.yml`,
`scripts/validate-proxy.mjs`.

### 5.5 Base de données et Prisma

| Commande | Nature du contrôle ou de l'opération |
| --- | --- |
| `pnpm db:status` | Affiche l'état des services Docker Compose |
| `pnpm prisma:status` | Inspecte l'état des migrations |
| `pnpm prisma:generate` | Vérifie la génération du client depuis le schéma |
| `pnpm prisma:migrate` | Crée ou applique les migrations en développement |
| `pnpm prisma:migrate:deploy` | Applique les migrations existantes |
| `pnpm prisma:seed` | Exécute le seed déclaré par Prisma |

`prisma:status` est la commande explicitement déclarée pour inspecter les
migrations sans modifier la base. Aucun script racine de contrôle SQL autonome
n'est déclaré.

Références : `package.json`, `apps/backend/package.json`.

### 5.6 API et connexion frontend/backend

Les contrôles exécutables observés sont :

- interrogation directe de `GET /api/v1/health` ;
- interrogation de `GET /api/health` via le frontend ;
- `pnpm test:proxy` pour vérifier le proxy frontend/backend, les deux
  healthchecks et la cohérence de la redirection d'entrée ;
- `pnpm test:backend` pour les parcours e2e couverts par les fichiers de test.

Le script de proxy compare la réponse à `status: ok` et au nom de service
attendu. Il conserve jusqu'à 80 lignes récentes par processus pour les afficher
en cas d'échec.

Références : `scripts/validate-proxy.mjs`,
`apps/backend/test`, `apps/frontend/app/api/health/route.ts`.

## 6. Scripts d'exploitation

Les scripts suivants existent dans les manifestes et sont directement liés au
démarrage, à l'état, aux contrôles ou aux opérations de données.

| Commande | Périmètre | Fonction déclarée | Fichier |
| --- | --- | --- | --- |
| `pnpm dev` | Global | Démarre frontend et backend en développement | `package.json`, `scripts/dev.mjs` |
| `pnpm dev:backend` | Backend | Démarre NestJS en mode watch | `package.json` |
| `pnpm dev:frontend` | Frontend | Démarre Next.js en développement | `package.json` |
| `pnpm build` | Global | Construit les deux applications | `package.json` |
| `pnpm build:backend` | Backend | Construit NestJS | `package.json` |
| `pnpm build:frontend` | Frontend | Construit Next.js | `package.json` |
| `pnpm typecheck` | Global | Vérifie les types des deux applications | `package.json` |
| `pnpm lint` | Global | Exécute ESLint | `package.json` |
| `pnpm format:check` | Global | Contrôle le format Prettier | `package.json` |
| `pnpm check` | Global | Exécute lint, typecheck et build | `package.json` |
| `pnpm validate` | Global | Exécute la validation complète | `package.json` |
| `pnpm validate:backend` | Backend | Génère Prisma, vérifie, teste et construit le backend | `package.json` |
| `pnpm validate:frontend` | Frontend | Vérifie et construit le frontend puis teste le proxy | `package.json` |
| `pnpm test` | Backend | Lance les tests e2e backend | `package.json` |
| `pnpm test:backend` | Backend | Lance explicitement les tests e2e backend | `package.json` |
| `pnpm test:proxy` | Intégration | Vérifie le raccordement frontend/backend | `package.json`, `scripts/validate-proxy.mjs` |
| `pnpm db:up` | PostgreSQL | Lance les services Compose sans profil, donc PostgreSQL | `package.json`, `docker-compose.yml` |
| `pnpm db:down` | PostgreSQL | Arrête les services Compose | `package.json` |
| `pnpm db:status` | Docker | Affiche l'état Compose | `package.json` |
| `pnpm prisma:generate` | Prisma | Génère le client Prisma | `package.json` |
| `pnpm prisma:status` | Prisma | Affiche l'état des migrations | `package.json` |
| `pnpm prisma:migrate` | Prisma | Exécute `migrate dev` | `package.json` |
| `pnpm prisma:migrate:deploy` | Prisma | Déploie les migrations existantes | `package.json` |
| `pnpm prisma:seed` | Prisma | Exécute le seed | `package.json` |
| `pnpm --dir apps/backend start` | Backend | Exécute le build `dist/main.js` | `apps/backend/package.json` |
| `pnpm --dir apps/frontend start` | Frontend | Sert le build Next.js | `apps/frontend/package.json` |
| `pnpm --dir apps/backend admin:create` | Données | Crée l'administrateur initial selon les variables requises | `apps/backend/package.json`, `apps/backend/scripts/create-initial-admin.ts` |
| `pnpm --dir apps/backend pins:backfill` | Données | Complète les empreintes de codes PIN | `apps/backend/package.json`, `apps/backend/scripts/backfill-employee-pin-code-hashes.ts` |
| `pnpm --dir apps/backend snapshots:backfill` | Données | Complète les instantanés d'horaires de présence | `apps/backend/package.json`, `apps/backend/scripts/backfill-attendance-schedule-snapshots.ts` |

Les commandes `clean:windows`, `clean:windows:dev` et
`clean:windows:prisma` sont présentes pour PowerShell. Elles sont spécifiques
au nettoyage des artefacts et processus locaux Windows.

## 7. Architecture d'exploitation

Le flux demandé se matérialise dans le dépôt comme suit :

```text
+-------------------------------+
| Configuration                 |
| fichiers .env et variables    |
+---------------+---------------+
                |
                v
+-------------------------------+
| Backend NestJS                |
| API préfixée par /api/v1      |
+---------------+---------------+
                |
                v
+-------------------------------+
| Prisma                        |
| schéma, client, migrations    |
+---------------+---------------+
                |
                v
+-------------------------------+
| PostgreSQL                    |
| service et volume Docker      |
+---------------+---------------+
                ^
                |
+---------------+---------------+
| Frontend Next.js              |
| appels API et proxy /api      |
+-------------------------------+
```

Le frontend consomme le backend ; il n'accède pas directement à Prisma ou à
PostgreSQL. Le backend utilise Prisma, qui utilise `DATABASE_URL` pour accéder
à PostgreSQL.

Dans Docker Compose, l'ordre de démarrage contrôlé est PostgreSQL, backend,
puis frontend. Dans le diagramme imposé, le frontend est représenté en dernier
mais sa dépendance d'exécution remonte vers le backend.

Références : `docker-compose.yml`,
`apps/frontend/lib/api.ts`,
`apps/backend/prisma/schema.prisma`,
`apps/backend/src/common/prisma/prisma.service.ts`.

## 8. Traçabilité

| Pratique observable | Élément probant | Fichiers concernés |
| --- | --- | --- |
| Séparation frontend/backend | Deux paquets applicatifs distincts | `pnpm-workspace.yaml`, `apps/frontend/package.json`, `apps/backend/package.json` |
| Centralisation des commandes | Scripts racine délégués avec `pnpm --dir` | `package.json` |
| Démarrage conjoint | Création et arrêt coordonné de deux processus | `scripts/dev.mjs` |
| Configuration par composant | Exemples backend et frontend séparés | `apps/backend/.env.example`, `apps/frontend/.env.example` |
| Exclusion des secrets locaux | Règles d'exclusion des fichiers `.env` | `.gitignore`, `.dockerignore` |
| Validation backend | Schéma Joi et contrôles de cohérence | `apps/backend/src/app.module.ts` |
| Validation des URL frontend | Résolution, HTTPS et suffixe `/api/v1` | `apps/frontend/lib/api.ts` |
| CORS configuré | Origine lue dans `FRONTEND_URL` | `apps/backend/src/main.ts` |
| Validation des requêtes | `ValidationPipe` global avec liste blanche | `apps/backend/src/main.ts` |
| Préfixe API | Préfixe global `/api/v1` | `apps/backend/src/main.ts` |
| Connexion Prisma | Client injectable et déconnexion à la destruction | `apps/backend/src/common/prisma/prisma.service.ts` |
| Modèle PostgreSQL | Provider Prisma et `DATABASE_URL` | `apps/backend/prisma/schema.prisma` |
| Migrations versionnées | Répertoires SQL de migrations | `apps/backend/prisma/migrations` |
| Données initiales | Programme de seed Prisma | `apps/backend/prisma/seed.ts` |
| Verrouillage des dépendances | Lockfile et installation Docker figée | `pnpm-lock.yaml`, `docker/backend.Dockerfile`, `docker/frontend.Dockerfile` |
| Version Node cohérente | Plage du moteur, `.nvmrc`, images Node 22 | `package.json`, `.nvmrc`, `docker/backend.Dockerfile`, `docker/frontend.Dockerfile` |
| Construction séparée | Scripts de build par application | `package.json`, `apps/backend/package.json`, `apps/frontend/package.json` |
| Contrôle de format | Commande Prettier en lecture | `package.json` |
| Contrôle statique | ESLint et TypeScript | `package.json`, `eslint.config.mjs` |
| Tests backend isolés | Base de test distincte et recréée | `apps/backend/test/test-environment.ts`, `apps/backend/test/test-database.ts` |
| Test du raccordement | Démarrage temporaire et contrôles HTTP | `scripts/validate-proxy.mjs` |
| Santé du backend | Contrôleur public dédié | `apps/backend/src/modules/health/health.controller.ts` |
| Santé via le frontend | Route Next.js relayant le backend | `apps/frontend/app/api/health/route.ts` |
| Santé PostgreSQL | `pg_isready` | `docker-compose.yml` |
| Ordonnancement des services | `depends_on` avec état sain | `docker-compose.yml` |
| Persistance PostgreSQL | Volume nommé `postgres-data` | `docker-compose.yml` |
| Migration au démarrage backend | `migrate deploy` avant l'API | `docker/backend.Dockerfile` |
| Initialisation d'un administrateur | Script idempotent documenté | `README.md`, `apps/backend/scripts/create-initial-admin.ts` |

## 9. Observations techniques

### 9.1 Mécanismes présents

- Le dépôt fournit des commandes racine pour les opérations communes.
- Le client Prisma est généré dans les validations backend et dans la
  construction Docker du backend.
- Les migrations SQL sont versionnées avec le code.
- Le conteneur backend applique les migrations existantes avant de démarrer
  l'API.
- PostgreSQL, le backend et le frontend possèdent des healthchecks Docker
  distincts.
- La configuration backend est validée au démarrage.
- Les URL frontend sont contrôlées par le code lors de leur résolution.
- Les tests backend utilisent une base dédiée et la recréent.
- Un contrôle automatisé vérifie le healthcheck backend, le proxy frontend et
  une redirection publique.

### 9.2 Pratiques observées

- La séparation des responsabilités est matérialisée par les répertoires
  frontend, backend, Prisma, scripts et Docker.
- Les dépendances de production Docker sont installées à partir du lockfile
  avec le mode figé.
- Les fichiers d'environnement effectifs ne sont pas intégrés aux images
  Docker.
- Les validations agrégées combinent formatage, génération Prisma, typage,
  lint, tests et builds.
- Les commandes Prisma différencient le développement (`migrate dev`) du
  déploiement de migrations existantes (`migrate deploy`).
- Les services Docker applicatifs ne démarrent qu'après la santé de leur
  dépendance immédiate.

### 9.3 Limitations observées

- Le healthcheck backend ne vérifie pas directement la connexion Prisma ou
  PostgreSQL.
- Le healthcheck frontend vérifie le proxy vers le backend ; il ne contrôle pas
  les pages fonctionnelles de l'interface.
- `pnpm db:up` ne démarre pas le frontend et le backend placés sous le profil
  Compose `app`.
- Le script `pnpm test` couvre le backend ; aucun script de test unitaire
  frontend n'est déclaré.
- ESLint est ignoré pendant le build Next.js et reste un contrôle séparé.
- La base de tests backend est supprimée puis recréée par le dispositif e2e.
- Le seed initialise des données ; il ne constitue pas un mécanisme de
  restauration des données métier.

### 9.4 Mécanismes absents

Le dépôt ne contient pas de mécanisme observable pour :

- une plateforme centralisée de métriques ;
- une collecte centralisée des journaux ;
- une gestion d'alertes ou d'astreinte ;
- un déploiement continu ;
- une infrastructure cloud déclarative ;
- un manifeste Render ou une configuration Neon ;
- une rotation automatisée des secrets ;
- une mise à jour automatique des dépendances ;
- un test unitaire frontend déclaré dans les scripts ;
- un healthcheck backend incluant explicitement une requête à la base ;
- une sauvegarde planifiée de PostgreSQL ;
- une restauration automatisée des données ;
- un mécanisme de bascule ou de haute disponibilité.

Ces absences décrivent uniquement le contenu du dépôt audité.
