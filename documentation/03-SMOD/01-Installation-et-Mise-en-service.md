# Installation et Mise en service

| Métadonnée | Valeur |
|---|---|
| Document ID | SMOD-INSTALL-001 |
| Titre | Installation et Mise en service |
| Version | 1.0 |
| Statut | Validé |
| Classification | Interne |
| Référence | SMOD |
| Date de génération | 30 juillet 2026 |

## 1 Présentation

### 1.1 Objectif du document

Ce document décrit l'installation et la mise en service de Konatech Pointage à partir des seuls éléments présents dans le dépôt. Il couvre le poste local, les conteneurs Docker, PostgreSQL, Prisma, le démarrage des applications, les contrôles de disponibilité et les éléments de production versionnés.

### 1.2 Public concerné

Le document s'adresse aux développeurs, exploitants et responsables techniques chargés d'installer, d'exécuter ou de vérifier Konatech Pointage.

### 1.3 Pré-requis

L'installation décrite dans le dépôt requiert :

- un clone Git du dépôt ;
- Node.js dans la plage déclarée par le projet ;
- pnpm 10 ou version ultérieure ;
- Docker Desktop ou Docker Engine avec Docker Compose pour la base locale ;
- un accès en lecture et écriture au répertoire du projet ;
- les fichiers d'environnement locaux dérivés des exemples versionnés.

Sources : `README.md`, `package.json`, `.nvmrc`, `docker-compose.yml`.

## 2 Architecture de la solution

### 2.1 Frontend

Le frontend est l'application `apps/frontend`. Il utilise Next.js avec l'App Router, TypeScript et Tailwind CSS. Il s'exécute en développement avec `next dev`, se construit avec `next build` et démarre en mode construit avec `next start`.

Le frontend expose des route handlers sous `app/api`. Ces routes appellent le backend à l'aide de `API_BASE_URL` ou de `NEXT_PUBLIC_API_BASE_URL`. Le point de contrôle frontend `/api/health` relaie le point de santé du backend.

Sources : `apps/frontend/package.json`, `apps/frontend/app/`, `apps/frontend/lib/api.ts`, `apps/frontend/app/api/health/route.ts`.

### 2.2 Backend

Le backend est l'application `apps/backend`. Il utilise NestJS 11, TypeScript, des modules fonctionnels et Prisma. L'API applique le préfixe global `/api/v1`, une validation globale des DTO, CORS, Helmet, une limite de corps HTTP et des limites de débit.

Le démarrage local surveillé utilise `nest start --watch`. Après compilation, le démarrage utilise `node dist/main.js`.

Sources : `apps/backend/package.json`, `apps/backend/src/app.module.ts`, `apps/backend/src/main.ts`.

### 2.3 Base PostgreSQL

Prisma déclare PostgreSQL comme fournisseur de données. En local, `docker-compose.yml` fournit un service `postgres` fondé sur l'image `postgres:16-alpine`, avec un volume nommé `postgres-data`, un port hôte configurable et un healthcheck `pg_isready`.

Sources : `apps/backend/prisma/schema.prisma`, `docker-compose.yml`.

### 2.4 Prisma

Prisma fournit le client d'accès à PostgreSQL, le schéma, les migrations et le seed. La datasource reçoit sa chaîne de connexion par `DATABASE_URL`. Les migrations sont versionnées dans `apps/backend/prisma/migrations`.

Sources : `apps/backend/prisma.config.ts`, `apps/backend/prisma/schema.prisma`, `apps/backend/prisma/migrations/`, `apps/backend/prisma/seed.ts`.

### 2.5 Docker

Le dépôt contient :

- `docker-compose.yml`, avec PostgreSQL actif par défaut ;
- un profil Compose `app` pour le backend et le frontend ;
- `docker/backend.Dockerfile`, qui génère Prisma Client, compile NestJS, installe Chromium puis applique les migrations au démarrage ;
- `docker/frontend.Dockerfile`, qui construit et démarre Next.js.

Le script `pnpm db:up` démarre le service PostgreSQL par défaut. La pile conteneurisée complète exige explicitement le profil Compose `app`.

Sources : `docker-compose.yml`, `docker/backend.Dockerfile`, `docker/frontend.Dockerfile`, `package.json`, `README.md`.

### 2.6 Render

Render est cité dans `README.md` pour l'exécution des migrations et la création du premier administrateur depuis un shell Render. Aucun fichier `render.yaml`, Blueprint Render, commande de build Render versionnée ou définition de service Render n'est présent.

Sources : `README.md`, `documentation/02-SAR/15-Deploiement.md`.

### 2.7 Neon

Neon est cité dans `README.md` comme cible PostgreSQL accessible au moyen de `DATABASE_URL`, notamment depuis PowerShell. Prisma ne contient aucun paramétrage propre à Neon et le dépôt ne contient aucune configuration Neon.

Sources : `README.md`, `apps/backend/prisma.config.ts`, `apps/backend/prisma/schema.prisma`, `documentation/02-SAR/15-Deploiement.md`.

### 2.8 Diagramme d'architecture

```text
Navigateur
    |
    v
+-------------------------------+
| Frontend Next.js              |
| Port local/conteneur : 3000   |
| Route proxy : /api/health     |
+---------------+---------------+
                |
                | API_BASE_URL ou
                | NEXT_PUBLIC_API_BASE_URL
                v
+-------------------------------+
| Backend NestJS                |
| Port local/conteneur : 4000   |
| Préfixe : /api/v1             |
+---------------+---------------+
                |
                | Prisma Client
                | DATABASE_URL
                v
+-------------------------------+
| PostgreSQL                    |
| Docker local ou service       |
| PostgreSQL externe            |
+-------------------------------+

Docker Compose
    |-- postgres (par défaut)
    |-- backend  (profil app)
    `-- frontend (profil app)

Render : mention documentaire, configuration absente
Neon  : cible DATABASE_URL mentionnée, configuration absente
```

## 3 Prérequis techniques

### 3.1 Outils et versions observées dans le dépôt

| Élément | Version ou contrainte observée | Source |
|---|---|---|
| Node.js | `22.11.0` dans `.nvmrc` ; `>=20.9.0 <23` dans les engines ; images Docker Node 22 | `.nvmrc`, `package.json`, `docker/backend.Dockerfile`, `docker/frontend.Dockerfile` |
| pnpm | `10.26.0` comme gestionnaire déclaré ; contrainte `>=10.0.0` | `package.json` |
| Docker | Version de l'outil non épinglée | `README.md` |
| Docker Compose | Version de l'outil non épinglée ; syntaxe Compose utilisée | `README.md`, `docker-compose.yml` |
| PostgreSQL | Image `postgres:16-alpine` pour l'exécution locale | `docker-compose.yml` |
| Git | Requis pour le clonage et cité dans la checklist ; version non épinglée | `README.md`, `docs/RELEASE_CHECKLIST.md` |
| Next.js | Dépendance `^15.5.18` | `apps/frontend/package.json` |
| NestJS | Dépendances principales `^11.0.0` | `apps/backend/package.json` |
| Prisma | Client et CLI `^6.0.0` | `apps/backend/package.json` |

### 3.2 Variables d'environnement

Les modèles disponibles sont :

- `apps/backend/.env.example` pour le backend local ;
- `apps/frontend/.env.example` pour le frontend local ;
- `.env.production.example` pour Compose en production ;
- `apps/backend/.env.test` pour les tests backend.

Le backend charge, dans cet ordre, `.env.<NODE_ENV>.local`, `.env.<NODE_ENV>`, `.env.local`, puis `.env`. Les fichiers inexistants sont ignorés par le chargeur.

Sources : `apps/backend/src/app.module.ts`, fichiers d'environnement précités.

## 4 Installation locale

### 4.1 Cloner et ouvrir le dépôt

Le dépôt courant résulte d'un clone Git. Aucune URL de dépôt n'est inscrite dans les fichiers analysés ; la commande complète de clonage n'est donc pas documentée dans le dépôt.

Après clonage, les commandes suivantes s'exécutent depuis la racine du monorepo :

```bash
cd konatech-pointage
```

Le nom du répertoire local est celui observé dans le contexte du dépôt ; Git n'impose pas ce nom.

### 4.2 Installer les dépendances

```bash
nvm use
pnpm install
```

`nvm use` s'appuie sur `.nvmrc`. `pnpm install` installe les dépendances du workspace défini par `pnpm-workspace.yaml`.

Sous PowerShell, `README.md` indique d'utiliser `pnpm.cmd` si le shim `pnpm` est bloqué.

### 4.3 Créer les fichiers d'environnement

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

Les valeurs doivent rester cohérentes avec les ports et URL réellement utilisés. Les valeurs elles-mêmes ne sont pas reproduites dans ce document.

### 4.4 Démarrer PostgreSQL avec Docker

```bash
pnpm db:up
pnpm db:status
```

`pnpm db:up` exécute `docker compose up -d`. Comme les applications sont placées sous le profil `app`, cette commande démarre PostgreSQL seul. Le conteneur utilise le volume `postgres-data`.

### 4.5 Préparer Prisma et la base

```bash
pnpm prisma:generate
pnpm prisma:status
pnpm prisma:migrate
pnpm prisma:seed
```

Ces commandes génèrent Prisma Client, affichent l'état des migrations, appliquent les migrations en mode développement et chargent les données du seed.

### 4.6 Lancer les applications

```bash
pnpm dev
```

Le script racine `scripts/dev.mjs` démarre simultanément :

- NestJS en mode surveillé ;
- Next.js en mode développement.

Les démarrages séparés existent également :

```bash
pnpm dev:backend
pnpm dev:frontend
```

### 4.7 Accès local documenté

| Service | Adresse documentée |
|---|---|
| Frontend | `http://localhost:3000` |
| API backend | `http://localhost:4000/api/v1` |
| Santé backend | `http://localhost:4000/api/v1/health` |
| Santé via frontend | `http://localhost:3000/api/health` |

Source : `README.md`.

### 4.8 Exécution de la pile Docker complète

Les services frontend et backend sont sous le profil `app`. La syntaxe d'activation du profil est :

```bash
docker compose --profile app up -d
```

Au démarrage du conteneur backend, `prisma migrate deploy` s'exécute avant `node dist/main.js`. Le seed ne fait pas partie de cette commande de démarrage.

Sources : `README.md`, `docker-compose.yml`, `docker/backend.Dockerfile`.

## 5 Structure des environnements

### 5.1 Développement

Le mode par défaut du backend est `development`. Il utilise les fichiers locaux `apps/backend/.env` et `apps/frontend/.env.local`. PostgreSQL local est fourni par Compose, tandis que `pnpm dev` exécute les deux applications sur l'hôte.

Sources : `apps/backend/src/app.module.ts`, `README.md`, `scripts/dev.mjs`.

### 5.2 Staging

Le staging est cité dans `docs/RELEASE_CHECKLIST.md`, qui demande un déploiement en staging avant la production. Aucun fichier `.env.staging`, service, domaine, commande de déploiement ou configuration d'infrastructure propre au staging n'est présent.

### 5.3 Production

Le dépôt fournit `.env.production.example`, deux Dockerfiles orientés production et le profil Compose `app`. Le backend valide des contraintes supplémentaires lorsque `NODE_ENV` vaut `production`, notamment sur le secret JWT et l'URL frontend.

Le dépôt ne contient aucune preuve d'un environnement de production actuellement déployé, aucun domaine actif et aucun manifeste d'hébergeur.

Sources : `.env.production.example`, `docker-compose.yml`, `docker/backend.Dockerfile`, `docker/frontend.Dockerfile`, `apps/backend/src/app.module.ts`, `documentation/02-SAR/15-Deploiement.md`.

## 6 Variables d'environnement

Aucune valeur n'est affichée dans les tableaux suivants.

### 6.1 Exécution des applications

| Nom | Utilisation | Composant concerné |
|---|---|---|
| `NODE_ENV` | Sélectionne le mode `development`, `test` ou `production` et les fichiers d'environnement backend | Backend, frontend, Docker |
| `PORT` | Définit le port d'écoute de l'application | Backend et frontend dans Compose |
| `FRONTEND_URL` | Définit l'origine CORS backend et l'origine frontend autorisée | Backend |
| `NEXT_PUBLIC_APP_URL` | Définit l'origine publique utilisée pour les liens de pointage et QR | Frontend |
| `NEXT_PUBLIC_API_BASE_URL` | Définit l'URL publique de base de l'API | Frontend |
| `API_BASE_URL` | Remplace côté serveur l'URL de base utilisée par SSR et les route handlers | Frontend |
| `DATABASE_URL` | Fournit la chaîne de connexion PostgreSQL à Prisma | Backend, Prisma, scripts |
| `JWT_SECRET` | Signe et vérifie les jetons JWT | Backend |
| `JWT_EXPIRES_IN` | Définit la durée des jetons de session standard | Backend |
| `ATTENDANCE_ENTRY_JWT_EXPIRES_IN` | Définit la durée des jetons de session de la borne de pointage | Backend |
| `JSON_BODY_LIMIT` | Fixe la taille maximale des corps JSON et URL-encoded | Backend |
| `TRUST_PROXY_HOPS` | Configure le nombre de sauts proxy approuvés par Express | Backend |
| `RATE_LIMIT_TTL_MS` | Définit la fenêtre de limitation globale | Backend |
| `RATE_LIMIT_MAX` | Définit le nombre maximal de requêtes dans la fenêtre globale | Backend |
| `LOGIN_RATE_LIMIT_TTL_MS` | Définit la fenêtre de limitation de la connexion | Backend |
| `LOGIN_RATE_LIMIT_MAX` | Définit le nombre maximal de connexions dans la fenêtre | Backend |

Sources : `apps/backend/src/app.module.ts`, `apps/backend/src/main.ts`, `apps/backend/src/modules/auth/auth.service.ts`, `apps/frontend/lib/api.ts`, `apps/frontend/components/dashboard/attendance-entry-qr-card.tsx`, `docker-compose.yml`.

### 6.2 Sécurité conditionnelle du pointage

| Nom | Utilisation | Composant concerné |
|---|---|---|
| `ATTENDANCE_SECURITY_ENABLED` | Active ou désactive la politique de sécurité de présence | Backend |
| `COMPANY_LATITUDE` | Définit la latitude du site lorsque la sécurité est active | Backend |
| `COMPANY_LONGITUDE` | Définit la longitude du site lorsque la sécurité est active | Backend |
| `ATTENDANCE_TRUSTED_RADIUS_METERS` | Définit le rayon de confiance GPS | Backend |
| `ATTENDANCE_WARNING_RADIUS_METERS` | Définit le rayon d'avertissement GPS | Backend |
| `ATTENDANCE_ALLOWED_RADIUS_METERS` | Fournit un rayon autorisé historique ou explicite | Backend |
| `ATTENDANCE_MAX_ACCURACY_METERS` | Définit la précision GPS maximale acceptée | Backend |

Les coordonnées sont requises ensemble lorsque la sécurité est activée. Les contrôles GPS et photo restent conditionnels à la politique ; le flux de pointage n'active pas ces étapes pour tous les utilisateurs par défaut.

Sources : `apps/backend/src/app.module.ts`, `apps/backend/src/modules/attendance/attendance-security-policy.service.ts`, `apps/backend/.env.example`, `.env.production.example`.

### 6.3 Stockage photo Cloudinary

| Nom | Utilisation | Composant concerné |
|---|---|---|
| `CLOUDINARY_CLOUD_NAME` | Identifie le compte Cloudinary | Backend |
| `CLOUDINARY_API_KEY` | Authentifie les appels Cloudinary | Backend |
| `CLOUDINARY_API_SECRET` | Signe les appels Cloudinary | Backend |
| `CLOUDINARY_ATTENDANCE_FOLDER` | Définit le dossier de stockage des preuves | Backend |
| `CLOUDINARY_UPLOAD_TIMEOUT_MS` | Définit le délai maximal d'un téléversement | Backend |
| `CLOUDINARY_UPLOAD_MAX_RETRIES` | Définit le nombre de nouvelles tentatives | Backend |
| `CLOUDINARY_UPLOAD_RETRY_DELAY_MS` | Définit l'attente entre les tentatives | Backend |

Les trois identifiants Cloudinary doivent être fournis ensemble lorsqu'un seul d'entre eux est configuré.

Sources : `apps/backend/src/app.module.ts`, `apps/backend/src/modules/attendance/attendance-photo-storage.service.ts`.

### 6.4 Export PDF

| Nom | Utilisation | Composant concerné |
|---|---|---|
| `ATTENDANCE_PDF_RENDERER` | Sélectionne le moteur PDF `premium`, `puppeteer` ou `legacy` | Backend |
| `ATTENDANCE_PDF_EXECUTABLE_PATH` | Indique le chemin du binaire Chromium ou Chrome | Backend, Docker |
| `ATTENDANCE_PDF_ALLOW_LEGACY_FALLBACK` | Autorise ou interdit le repli vers le moteur historique | Backend |

Sources : `apps/backend/src/app.module.ts`, `apps/backend/src/modules/attendance/exports/monthly-attendance-pdf-exporter.service.ts`, `apps/backend/src/modules/attendance/exports/monthly-attendance-puppeteer-pdf-renderer.service.ts`, `docker/backend.Dockerfile`.

### 6.5 PostgreSQL et ports Compose

| Nom | Utilisation | Composant concerné |
|---|---|---|
| `POSTGRES_DB` | Définit le nom de la base du conteneur | PostgreSQL, backend Compose |
| `POSTGRES_USER` | Définit l'utilisateur PostgreSQL | PostgreSQL, backend Compose |
| `POSTGRES_PASSWORD` | Définit le mot de passe PostgreSQL | PostgreSQL, backend Compose |
| `POSTGRES_PORT` | Définit le port PostgreSQL publié sur l'hôte | Docker Compose |
| `BACKEND_PORT` | Définit le port backend publié sur l'hôte | Docker Compose |
| `FRONTEND_PORT` | Définit le port frontend publié sur l'hôte | Docker Compose |

Source : `docker-compose.yml`.

### 6.6 Initialisation du premier administrateur

| Nom | Utilisation | Composant concerné |
|---|---|---|
| `ADMIN_EMAIL` | Définit l'adresse du premier administrateur | Script backend `admin:create` |
| `ADMIN_PASSWORD` | Définit son mot de passe initial | Script backend `admin:create` |
| `ADMIN_FIRST_NAME` | Définit son prénom ; optionnel | Script backend `admin:create` |
| `ADMIN_LAST_NAME` | Définit son nom ; optionnel | Script backend `admin:create` |
| `ADMIN_JOB_TITLE` | Définit son intitulé de poste ; optionnel | Script backend `admin:create` |
| `ADMIN_DEPARTMENT` | Définit son département ; optionnel | Script backend `admin:create` |

Source : `apps/backend/scripts/create-initial-admin.ts`.

### 6.7 Tests

| Nom | Utilisation | Composant concerné |
|---|---|---|
| `TEST_DATABASE_URL` | Remplace la chaîne de la base dédiée aux tests | Tests backend |

Les tests positionnent aussi les variables d'exécution du backend dans leur environnement isolé.

Sources : `apps/backend/test/test-environment.ts`, `apps/backend/.env.test`.

## 7 Initialisation de la base

### 7.1 Génération de Prisma Client

Depuis la racine :

```bash
pnpm prisma:generate
```

Depuis le backend :

```bash
pnpm --dir apps/backend run prisma:generate
```

### 7.2 État des migrations

```bash
pnpm prisma:status
```

Ce script existe uniquement au niveau racine.

### 7.3 Migration en développement

```bash
pnpm prisma:migrate
```

Cette commande exécute `prisma migrate dev` dans `apps/backend`.

### 7.4 Migration en déploiement

```bash
pnpm prisma:migrate:deploy
```

Cette commande exécute `prisma migrate deploy`. Le conteneur backend l'exécute automatiquement avant le démarrage de l'API.

### 7.5 Seed

```bash
pnpm prisma:seed
```

`prisma.config.ts` associe le seed à `apps/backend/prisma/seed.ts`. Le seed crée ou met à jour des règles de sanction, des plannings, des employés et des données de présence de démonstration. Il contient des identifiants de démonstration dans le code ; ceux-ci ne sont pas reproduits ici.

### 7.6 Reset

Aucun script `prisma:reset`, `db:reset` ou commande de reset n'est défini dans les `package.json`. Aucune procédure de réinitialisation de la base n'est documentée.

### 7.7 Scripts de données complémentaires

| Commande | Fonction observée |
|---|---|
| `pnpm --dir apps/backend run admin:create` | Crée de manière idempotente un premier administrateur si son adresse n'existe pas |
| `pnpm --dir apps/backend run pins:backfill` | Renseigne les hash de codes PIN pour les données concernées |
| `pnpm --dir apps/backend run snapshots:backfill` | Renseigne les snapshots de planning des présences |

Sources : `apps/backend/package.json`, `apps/backend/scripts/`.

## 8 Vérification de l'installation

### 8.1 Backend

Vérifier le point public :

```bash
curl http://localhost:4000/api/v1/health
```

Le contrôleur renvoie un objet JSON contenant l'état `ok`, le nom de service et un horodatage. Le healthcheck Docker considère comme valide une réponse HTTP réussie.

Sources : `apps/backend/src/modules/health/health.controller.ts`, `docker-compose.yml`.

### 8.2 Frontend

Ouvrir :

```text
http://localhost:3000
```

Puis vérifier le proxy de santé :

```bash
curl http://localhost:3000/api/health
```

La route frontend appelle le backend sur `/health` et relaie sa réponse. En cas d'échec backend, elle renvoie une réponse d'erreur.

Sources : `apps/frontend/app/api/health/route.ts`, `apps/frontend/lib/api.ts`.

### 8.3 Connexion Prisma

```bash
pnpm prisma:status
```

Cette commande utilise `DATABASE_URL` et vérifie l'accès au datasource ainsi que l'état des migrations. Le service `PrismaService` connecte Prisma lors de l'initialisation du module backend.

Sources : `package.json`, `apps/backend/src/common/prisma/prisma.service.ts`.

### 8.4 Endpoints observables

| Contrôle | Endpoint |
|---|---|
| Racine de l'API | `http://localhost:4000/api/v1` |
| Healthcheck backend public | `http://localhost:4000/api/v1/health` |
| Healthcheck via le proxy frontend | `http://localhost:3000/api/health` |

Les autres contrôleurs couvrent l'authentification, les présences, le tableau de bord, les employés, les plannings, le calendrier et les sanctions. Leur bon fonctionnement dépend des droits et des données ; ils ne constituent pas les healthchecks Docker.

### 8.5 Validation automatisée de la connexion frontend/backend

```bash
pnpm test:proxy
```

Le script `scripts/validate-proxy.mjs` démarre le backend et le frontend sur des ports de test, prépare la base de test et vérifie notamment le healthcheck et les redirections du proxy.

Pour exécuter la validation globale :

```bash
pnpm validate
```

Sources : `package.json`, `scripts/validate-proxy.mjs`.

## 9 Scripts disponibles

### 9.1 Scripts racine

| Script | Commande | Fonction |
|---|---|---|
| `dev` | `pnpm dev` | Démarre backend et frontend en développement |
| `dev:backend` | `pnpm dev:backend` | Démarre NestJS en mode surveillé |
| `dev:frontend` | `pnpm dev:frontend` | Démarre Next.js en développement |
| `build` | `pnpm build` | Construit backend puis frontend |
| `build:backend` | `pnpm build:backend` | Construit NestJS |
| `build:frontend` | `pnpm build:frontend` | Construit Next.js |
| `typecheck` | `pnpm typecheck` | Vérifie les types des deux applications |
| `typecheck:backend` | `pnpm typecheck:backend` | Vérifie les types backend |
| `typecheck:frontend` | `pnpm typecheck:frontend` | Vérifie les types frontend |
| `lint` | `pnpm lint` | Exécute ESLint sur le dépôt |
| `lint:fix` | `pnpm lint:fix` | Exécute ESLint avec correction |
| `format` | `pnpm format` | Formate le dépôt avec Prettier |
| `format:check` | `pnpm format:check` | Contrôle le formatage Prettier |
| `check` | `pnpm check` | Enchaîne lint, typecheck et build |
| `validate` | `pnpm validate` | Exécute les contrôles complets définis par le dépôt |
| `validate:backend` | `pnpm validate:backend` | Génère Prisma, vérifie, teste et construit le backend |
| `validate:frontend` | `pnpm validate:frontend` | Vérifie et construit le frontend, puis teste le proxy |
| `test` | `pnpm test` | Exécute les tests backend |
| `test:backend` | `pnpm test:backend` | Exécute les tests end-to-end Jest backend |
| `test:proxy` | `pnpm test:proxy` | Vérifie l'intégration proxy frontend/backend |
| `db:up` | `pnpm db:up` | Démarre les services Compose sans profil, donc PostgreSQL |
| `db:down` | `pnpm db:down` | Arrête la pile Compose |
| `db:status` | `pnpm db:status` | Affiche l'état des services Compose |
| `prisma:generate` | `pnpm prisma:generate` | Génère Prisma Client |
| `prisma:status` | `pnpm prisma:status` | Affiche l'état des migrations |
| `prisma:migrate` | `pnpm prisma:migrate` | Exécute les migrations de développement |
| `prisma:migrate:deploy` | `pnpm prisma:migrate:deploy` | Applique les migrations de déploiement |
| `prisma:seed` | `pnpm prisma:seed` | Exécute le seed Prisma |
| `clean:windows` | `pnpm clean:windows` | Exécute le nettoyage Windows |
| `clean:windows:dev` | `pnpm clean:windows:dev` | Nettoie en incluant les serveurs de développement Windows |
| `clean:windows:prisma` | `pnpm clean:windows:prisma` | Nettoie et régénère Prisma sous Windows |

### 9.2 Scripts propres aux applications

| Application | Script | Fonction |
|---|---|---|
| Backend | `dev` | Démarre NestJS en surveillance |
| Backend | `build` | Compile NestJS |
| Backend | `start` | Exécute `dist/main.js` |
| Backend | `typecheck` | Vérifie les types |
| Backend | `test` | Exécute les tests end-to-end |
| Backend | `admin:create` | Crée le premier administrateur |
| Backend | `pins:backfill` | Exécute le backfill des hash PIN |
| Backend | `snapshots:backfill` | Exécute le backfill des snapshots de planning |
| Backend | `prisma:generate` | Génère Prisma Client |
| Backend | `prisma:migrate` | Exécute `migrate dev` |
| Backend | `prisma:migrate:deploy` | Exécute `migrate deploy` |
| Backend | `prisma:seed` | Exécute le seed |
| Frontend | `dev` | Démarre Next.js en développement |
| Frontend | `build` | Construit Next.js |
| Frontend | `start` | Démarre Next.js après build |
| Frontend | `typecheck` | Vérifie les types frontend |

Il n'existe aucun script nommé `doctor` dans les trois `package.json`.

Sources : `package.json`, `apps/backend/package.json`, `apps/frontend/package.json`.

## 10 Dépendances

```text
+---------------+
| Développeur   |
+-------+-------+
        |
        v
+---------------+
| Git           |
+-------+-------+
        |
        v
+---------------+
| Frontend      |
| Next.js       |
+-------+-------+
        |
        v
+---------------+
| Backend       |
| NestJS        |
+-------+-------+
        |
        v
+---------------+
| Prisma        |
+-------+-------+
        |
        v
+---------------+
| PostgreSQL    |
+---------------+
```

Le chemin d'exécution effectif peut inclure les route handlers Next.js entre le navigateur et le backend. Prisma reste la couche d'accès du backend à PostgreSQL.

## 11 Traçabilité

| Étape ou information | Fichiers concernés |
|---|---|
| Prérequis et démarrage rapide | `README.md`, `.nvmrc`, `package.json` |
| Workspace pnpm | `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `package.json` |
| Démarrage simultané local | `scripts/dev.mjs`, `package.json` |
| Configuration backend locale | `apps/backend/.env.example`, `apps/backend/src/app.module.ts` |
| Configuration frontend locale | `apps/frontend/.env.example`, `apps/frontend/lib/api.ts` |
| Configuration de production | `.env.production.example`, `docker-compose.yml` |
| PostgreSQL local | `docker-compose.yml` |
| Schéma et datasource | `apps/backend/prisma/schema.prisma`, `apps/backend/prisma.config.ts` |
| Historique des migrations | `apps/backend/prisma/migrations/` |
| Seed | `apps/backend/prisma/seed.ts`, `apps/backend/prisma.config.ts` |
| Scripts de migration | `package.json`, `apps/backend/package.json` |
| Premier administrateur | `apps/backend/scripts/create-initial-admin.ts`, `README.md` |
| Backfills | `apps/backend/scripts/backfill-employee-pin-code-hashes.ts`, `apps/backend/scripts/backfill-attendance-schedule-snapshots.ts` |
| Compilation et démarrage backend Docker | `docker/backend.Dockerfile` |
| Compilation et démarrage frontend Docker | `docker/frontend.Dockerfile` |
| API, CORS et validation globale | `apps/backend/src/main.ts`, `apps/backend/src/app.module.ts` |
| Connexion Prisma au démarrage | `apps/backend/src/common/prisma/prisma.service.ts` |
| Healthcheck backend | `apps/backend/src/modules/health/health.controller.ts`, `docker-compose.yml` |
| Healthcheck frontend | `apps/frontend/app/api/health/route.ts`, `docker-compose.yml` |
| Test de connexion frontend/backend | `scripts/validate-proxy.mjs`, `package.json` |
| Tests backend et base de test | `apps/backend/test/`, `apps/backend/.env.test` |
| Checklist de mise en production | `docs/RELEASE_CHECKLIST.md` |
| État de Render et Neon | `README.md`, `documentation/02-SAR/15-Deploiement.md` |

## 12 Observations techniques

### 12.1 Limitations constatées

- Aucun manifeste Render ni définition de service Render n'est versionné.
- Aucune configuration Neon spécifique n'est versionnée.
- Aucun workflow CI/CD, manifeste Kubernetes ou infrastructure as code n'est présent.
- Aucun environnement de staging exécutable n'est défini ; le staging apparaît uniquement dans la checklist de release.
- Aucune URL de clone Git n'est documentée.
- Aucun script de reset de base n'est défini.
- Aucun script `doctor` n'est défini.
- Le healthcheck backend confirme la disponibilité HTTP du service, mais son contrôleur n'interroge pas PostgreSQL.

### 12.2 Particularités constatées

- `pnpm db:up` démarre PostgreSQL seul, car le frontend et le backend appartiennent au profil Compose `app`.
- Le conteneur backend applique `prisma migrate deploy` avant chaque démarrage de l'API.
- Le seed n'est pas exécuté automatiquement par le conteneur backend.
- Le backend charge plusieurs variantes de fichiers d'environnement selon `NODE_ENV`.
- La validation de production refuse notamment un secret JWT local ou de test et une URL frontend locale, non HTTPS, privée ou fondée sur certains tunnels temporaires.
- L'image backend installe Chromium pour le moteur d'export PDF.
- Les URL publiques du frontend sont injectées à la construction de l'image frontend et à son exécution.
- La sécurité GPS et photo du pointage est conditionnelle. `ATTENDANCE_SECURITY_ENABLED` est désactivé par défaut dans la configuration validée et dans les exemples.
- Le seed charge des données de démonstration et n'est pas présenté comme une procédure de création du premier administrateur de production.

### 12.3 Comportements observés

- `pnpm dev` arrête l'autre processus applicatif si l'un des deux processus se termine.
- Le frontend relaie le healthcheck backend par `/api/health`.
- Prisma reçoit exclusivement la connexion PostgreSQL par `DATABASE_URL`.
- Le service PostgreSQL Compose conserve ses données dans le volume nommé `postgres-data`.
- Les migrations de développement et de déploiement utilisent des commandes distinctes.

### 12.4 Éléments absents

- fichier `.env.staging` ou équivalent ;
- fichier `render.yaml` ;
- configuration ou projet Neon versionné ;
- commande officielle de clonage avec URL distante ;
- procédure documentée de restauration de base ;
- procédure documentée de reset de base ;
- script `doctor` ;
- preuve versionnée d'un déploiement actif.
