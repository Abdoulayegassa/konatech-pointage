# Déploiement

| Métadonnée | Valeur |
|---|---|
| Document ID | SAR-DEP-001 |
| Titre | Déploiement |
| Version | 1.0 |
| Statut | Validé |
| Classification | Interne |
| Référence SAPDD | Déploiement |
| Date de génération | 29 juillet 2026 |

## 1. Présentation

### 1.1 Objectif du déploiement

Les éléments de déploiement de Konatech Pointage permettent :

- de construire séparément le frontend Next.js et le backend NestJS ;
- d'exécuter PostgreSQL localement avec Docker Compose ;
- d'exécuter la pile complète dans des conteneurs avec le profil Compose `app` ;
- de générer Prisma Client au build backend ;
- d'appliquer les migrations Prisma avant le démarrage de l'API conteneurisée ;
- d'inclure Chromium dans l'image backend pour les rapports PDF ;
- de contrôler la disponibilité du backend et du proxy frontend ;
- de configurer les environnements par variables.

### 1.2 Périmètre constaté

Le dépôt contient :

- deux Dockerfiles multi-stage ;
- un `docker-compose.yml` ;
- un exemple d'environnement de production ;
- des exemples d'environnement par application ;
- des scripts pnpm de build, migration et démarrage ;
- une checklist de release ;
- un endpoint de santé backend et un proxy de santé frontend.

Il ne contient aucun manifeste Render, configuration Neon spécifique, définition DNS, infrastructure as code ni workflow CI/CD.

Implémentation principale :

- `docker/backend.Dockerfile`
- `docker/frontend.Dockerfile`
- `docker-compose.yml`
- `.env.production.example`
- `package.json`
- `README.md`

## 2. Architecture de production

### 2.1 Frontend

Le frontend est une application Next.js démarrée par `next start`, liée à `0.0.0.0` sur le port conteneur 3000. Son image utilise Node.js 22 sur Debian Bookworm slim.

Les URL publiques Next.js sont fournies comme arguments de build et comme variables d'exécution. `API_BASE_URL` est utilisé pour les appels serveur et les route handlers.

### 2.2 Backend

Le backend NestJS est compilé en JavaScript dans `dist`. Le conteneur exécute `prisma migrate deploy`, puis `node dist/main.js`. Il expose le port 4000.

L'image runtime installe Chromium, les certificats CA et deux paquets de polices. `ATTENDANCE_PDF_EXECUTABLE_PATH` pointe vers le binaire Chromium installé.

### 2.3 Base de données

Compose fournit PostgreSQL 16 Alpine avec un volume nommé `postgres-data`. Le backend Compose construit DATABASE_URL vers le service interne `postgres` sur le port 5432.

Le code Prisma accepte toute URL PostgreSQL fournie par DATABASE_URL. Le README décrit aussi l'emploi d'une chaîne PostgreSQL Render/Neon pour les migrations et la création du premier administrateur, mais aucun fournisseur n'est codé dans Prisma.

### 2.4 Cloud

Le dépôt ne définit pas une architecture cloud déployée. Render et Neon apparaissent uniquement dans les instructions textuelles du README. Aucun fichier `render.yaml`, Blueprint Render, configuration Neon, Terraform, Pulumi, CloudFormation ou manifeste Kubernetes n'est présent.

Cloudinary constitue le seul service cloud externe directement intégré dans le code ; il stocke les photos de vérification lorsque les variables correspondantes sont configurées et que ce flux est utilisé.

```text
                     Internet
                         |
                         v
               +-------------------+
               | Frontend Next.js  |
               | Port logique 3000 |
               +---------+---------+
                         |
                         | API_BASE_URL /
                         | NEXT_PUBLIC_API_BASE_URL
                         v
               +-------------------+
               | Backend NestJS    |
               | /api/v1, port 4000|
               +---------+---------+
                         |
                         | Prisma / DATABASE_URL
                         v
               +-------------------+
               | PostgreSQL        |
               | Compose ou service|
               | PostgreSQL externe|
               +-------------------+

Backend ---- HTTPS conditionnel ----> Cloudinary
              (photos)
```

### 2.5 État traçable

Les fichiers prouvent une capacité de build et d'orchestration. Aucun déploiement Render, aucune base Neon active, aucun domaine public et aucun environnement de production en cours d'exécution ne sont représentés dans le dépôt.

## 3. Organisation des fichiers

### 3.1 Arborescence de déploiement

```text
.
├── .dockerignore
├── .env.production.example
├── .nvmrc
├── docker-compose.yml
├── package.json
├── pnpm-lock.yaml
├── pnpm-workspace.yaml
├── README.md
├── docs/
│   └── RELEASE_CHECKLIST.md
├── docker/
│   ├── backend.Dockerfile
│   └── frontend.Dockerfile
├── scripts/
│   ├── clean-windows.ps1
│   ├── dev.mjs
│   └── validate-proxy.mjs
└── apps/
    ├── backend/
    │   ├── .env.example
    │   ├── package.json
    │   ├── prisma.config.ts
    │   ├── prisma/
    │   │   ├── schema.prisma
    │   │   └── migrations/
    │   ├── scripts/
    │   │   ├── create-initial-admin.ts
    │   │   ├── backfill-employee-pin-code-hashes.ts
    │   │   └── backfill-attendance-schedule-snapshots.ts
    │   └── src/
    │       ├── app.module.ts
    │       └── main.ts
    └── frontend/
        ├── .env.example
        ├── package.json
        ├── next.config.ts
        ├── app/api/health/route.ts
        └── lib/api.ts
```

### 3.2 Dockerfiles

`backend.Dockerfile` construit Prisma Client et NestJS, puis installe les dépendances système du PDF dans l'étape runtime.

`frontend.Dockerfile` injecte les trois URL comme arguments et variables pendant le build Next.js, puis démarre l'application dans l'étape runtime.

### 3.3 Docker Compose

Compose définit trois services :

- `postgres`, actif par défaut ;
- `backend`, sous profil `app` ;
- `frontend`, sous profil `app`.

### 3.4 Render

Aucun fichier Render n'est présent. Le README fournit des commandes décrites comme exécutables dans un shell Render, mais ne définit ni service, ni build command, ni start command Render dans un manifeste.

### 3.5 Scripts

| Script | Rôle |
|---|---|
| `scripts/dev.mjs` | Démarre backend et frontend en développement |
| `scripts/validate-proxy.mjs` | Démarre les deux applications sur ports temporaires et vérifie health/redirection |
| `clean-windows.ps1` | Nettoyage d'artefacts et processus selon les options |
| `create-initial-admin.ts` | Crée le premier administrateur |
| scripts de backfill | Migrent PIN et snapshots applicatifs |

### 3.6 Configuration

| Fichier | Rôle |
|---|---|
| `.env.production.example` | Modèle Compose de production |
| `apps/backend/.env.example` | Modèle backend local |
| `apps/frontend/.env.example` | Modèle frontend local |
| `prisma.config.ts` | Schéma, migrations, seed et datasource |
| `next.config.ts` | Configuration de build Next.js |
| `app.module.ts` | Validation des variables backend |
| `.dockerignore` | Exclusion des secrets et artefacts du contexte Docker |

## 4. Variables d'environnement

Les tableaux suivants donnent uniquement les noms et rôles. Aucune valeur de secret ou de connexion n'est reproduite.

### 4.1 Infrastructure Compose

| Variable | Rôle |
|---|---|
| `POSTGRES_DB` | Nom de la base Compose |
| `POSTGRES_USER` | Utilisateur PostgreSQL Compose |
| `POSTGRES_PASSWORD` | Mot de passe PostgreSQL Compose |
| `POSTGRES_PORT` | Port PostgreSQL publié sur l'hôte |
| `BACKEND_PORT` | Port backend publié sur l'hôte |
| `FRONTEND_PORT` | Port frontend publié sur l'hôte |

### 4.2 Backend obligatoire ou principal

| Variable | Rôle |
|---|---|
| `NODE_ENV` | Mode development, test ou production |
| `PORT` | Port d'écoute NestJS |
| `FRONTEND_URL` | Origine CORS et URL de redirection borne |
| `JWT_SECRET` | Signature HMAC des JWT |
| `JWT_EXPIRES_IN` | Durée de session standard |
| `ATTENDANCE_ENTRY_JWT_EXPIRES_IN` | Durée de session borne |
| `DATABASE_URL` | Connexion PostgreSQL Prisma |
| `JSON_BODY_LIMIT` | Limite des corps JSON et urlencoded |
| `TRUST_PROXY_HOPS` | Nombre de proxies Express approuvés |

`ATTENDANCE_ENTRY_JWT_EXPIRES_IN` est lu par AuthService et possède un défaut dans le code, mais n'apparaît pas dans les fichiers `.env.example` ni dans le schéma Joi.

### 4.3 Limitation de débit

| Variable | Rôle |
|---|---|
| `RATE_LIMIT_TTL_MS` | Fenêtre générale |
| `RATE_LIMIT_MAX` | Limite générale |
| `LOGIN_RATE_LIMIT_TTL_MS` | Fenêtre du login standard |
| `LOGIN_RATE_LIMIT_MAX` | Limite du login standard |

Les deux limites PIN ont des valeurs codées dans AppModule et ne disposent pas de variables propres.

### 4.4 Sécurité Attendance

| Variable | Rôle |
|---|---|
| `ATTENDANCE_SECURITY_ENABLED` | Active la politique GPS conditionnelle |
| `COMPANY_LATITUDE` | Latitude de référence |
| `COMPANY_LONGITUDE` | Longitude de référence |
| `ATTENDANCE_TRUSTED_RADIUS_METERS` | Rayon de confiance |
| `ATTENDANCE_WARNING_RADIUS_METERS` | Rayon d'avertissement |
| `ATTENDANCE_ALLOWED_RADIUS_METERS` | Rayon autorisé explicite |
| `ATTENDANCE_MAX_ACCURACY_METERS` | Précision GPS maximale |

### 4.5 Cloudinary

| Variable | Rôle |
|---|---|
| `CLOUDINARY_CLOUD_NAME` | Identifiant du cloud |
| `CLOUDINARY_API_KEY` | Clé API |
| `CLOUDINARY_API_SECRET` | Secret de signature |
| `CLOUDINARY_ATTENDANCE_FOLDER` | Dossier des preuves |
| `CLOUDINARY_UPLOAD_TIMEOUT_MS` | Timeout d'upload |
| `CLOUDINARY_UPLOAD_MAX_RETRIES` | Nombre de nouvelles tentatives |
| `CLOUDINARY_UPLOAD_RETRY_DELAY_MS` | Délai entre tentatives |

### 4.6 Rendu PDF

| Variable | Rôle |
|---|---|
| `ATTENDANCE_PDF_RENDERER` | Sélection premium/puppeteer/legacy |
| `ATTENDANCE_PDF_EXECUTABLE_PATH` | Chemin Chromium/Chrome |
| `ATTENDANCE_PDF_ALLOW_LEGACY_FALLBACK` | Autorise le repli historique |

### 4.7 Frontend

| Variable | Visibilité | Rôle |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | Publique | Origine de l'application et QR |
| `NEXT_PUBLIC_API_BASE_URL` | Publique | Base publique `/api/v1` |
| `API_BASE_URL` | Serveur | Base backend pour SSR et proxies |
| `NODE_ENV` | Runtime/build | Mode Next.js |
| `PORT` | Runtime conteneur | Port du serveur Next.js |

### 4.8 Bootstrap administrateur

| Variable | Rôle |
|---|---|
| `ADMIN_EMAIL` | Email initial obligatoire |
| `ADMIN_PASSWORD` | Mot de passe initial obligatoire |
| `ADMIN_FIRST_NAME` | Prénom facultatif |
| `ADMIN_LAST_NAME` | Nom facultatif |
| `ADMIN_JOB_TITLE` | Intitulé facultatif |
| `ADMIN_DEPARTMENT` | Département facultatif |

### 4.9 Tests et scripts

`TEST_DATABASE_URL` est utilisé par l'environnement de test. `NEXT_TELEMETRY_DISABLED` est injecté par `validate-proxy.mjs` lors de son démarrage temporaire du frontend.

Fichiers concernés :

- `apps/backend/src/app.module.ts`
- `apps/backend/src/main.ts`
- `apps/frontend/lib/api.ts`
- `docker-compose.yml`
- exemples `.env`
- `apps/backend/scripts/create-initial-admin.ts`

## 5. Configuration Docker

### 5.1 Images de base

Les deux Dockerfiles utilisent `node:22-bookworm-slim`. Corepack est activé et `PNPM_HOME` vaut `/pnpm`.

PostgreSQL utilise `postgres:16-alpine`.

### 5.2 Build backend

Étapes constatées :

1. copie des manifestes workspace ;
2. `pnpm install --frozen-lockfile` ;
3. copie du dépôt ;
4. définition d'une DATABASE_URL de build ;
5. `prisma generate` ;
6. build NestJS ;
7. copie complète de `/app` vers le runtime.

### 5.3 Runtime backend

Le runtime installe :

- Chromium ;
- certificats CA ;
- polices DejaVu Core ;
- polices Liberation.

La commande exécute les migrations avant l'API :

```text
prisma migrate deploy --schema prisma/schema.prisma
                   puis
node dist/main.js
```

### 5.4 Build frontend

Le build reçoit `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_API_BASE_URL` et `API_BASE_URL` comme arguments, les place dans l'environnement de build, installe le workspace complet puis exécute `next build`.

### 5.5 Runtime frontend

L'étape runtime copie `/app` depuis le build et démarre Next.js sur `0.0.0.0:3000`.

### 5.6 Ports

| Service | Port conteneur | Publication |
|---|---:|---|
| PostgreSQL | 5432 | Configurable, valeur de repli Compose |
| Backend | 4000 | Configurable |
| Frontend | 3000 | Configurable |

### 5.7 Volumes

Seul PostgreSQL utilise le volume nommé `postgres-data`, monté sur `/var/lib/postgresql/data`. Aucun volume n'est monté sur backend ou frontend.

### 5.8 Réseaux

Aucun réseau nommé n'est déclaré. Compose crée et utilise son réseau par défaut ; le backend adresse la base par le nom de service `postgres`.

### 5.9 Profiles et dépendances

Backend et frontend appartiennent au profil `app`. Sans ce profil, le service par défaut est PostgreSQL.

La séquence Compose utilise :

- backend dépend de PostgreSQL sain ;
- frontend dépend du backend sain.

### 5.10 Healthchecks

| Service | Contrôle |
|---|---|
| PostgreSQL | `pg_isready` |
| Backend | GET local `/api/v1/health` avec Node fetch |
| Frontend | GET local `/api/health` avec Node fetch |

Le proxy frontend relaie la santé backend ; il n'exprime pas une santé indépendante du backend.

### 5.11 Dockerignore

`.dockerignore` exclut Git, node_modules, builds, couverture, logs, fichiers d'environnement réels et caches.

Fichiers concernés :

- `docker/backend.Dockerfile`
- `docker/frontend.Dockerfile`
- `docker-compose.yml`
- `.dockerignore`

## 6. Déploiement Cloud

### 6.1 Render

Le README décrit :

- l'usage d'un shell Render ;
- l'exécution de `prisma:migrate:deploy` ;
- l'exécution du script `admin:create`.

Aucun manifeste Render ni configuration déclarative d'un Web Service n'est présent. Les commandes de build, démarrage, healthcheck et variables ne sont donc pas définies pour Render dans un fichier de plateforme.

### 6.2 Neon

Le README cite une URL PostgreSQL Render/Neon pour DATABASE_URL et un exemple d'exécution locale des migrations contre Neon. Aucun identifiant de projet Neon, branche, pooler, CLI Neon ou fichier de configuration Neon n'est présent.

Prisma utilise une seule DATABASE_URL ; aucune `directUrl` séparée n'est définie dans le datasource.

### 6.3 PostgreSQL

Deux configurations sont traçables :

- PostgreSQL Compose 16 Alpine ;
- PostgreSQL externe via DATABASE_URL.

Le code n'impose pas un hébergeur PostgreSQL particulier.

### 6.4 Cloudinary

L'upload photo Cloudinary est implémenté directement dans AttendancePhotoStorageService. Les trois credentials sont optionnels collectivement, mais doivent être configurés ensemble s'ils sont utilisés.

### 6.5 DNS

Aucun enregistrement DNS, domaine concret, configuration de zone ou automatisation de certificat n'est présent. Les origines sont fournies par variables.

### 6.6 TLS et reverse proxy

Aucun Nginx, Traefik, Caddy ou load balancer n'est défini. NestJS ne configure pas TLS. La validation backend exige une origine frontend HTTPS en production et les cookies deviennent Secure.

### 6.7 Stockage et sauvegarde

Aucun script de sauvegarde/restauration PostgreSQL, politique de rétention ou stockage d'archive n'est présent.

## 7. Pipeline de démarrage

### 7.1 Pile Docker Compose

```text
docker compose --profile app up
              |
              v
PostgreSQL démarre
              |
              v
pg_isready devient sain
              |
              v
Backend reçoit la configuration
              |
              v
Prisma migrate deploy
              |
              v
NestJS démarre /api/v1
              |
              v
Health backend devient sain
              |
              v
Next.js démarre
              |
              v
Proxy /api/health confirme le backend
              |
              v
Frontend disponible
```

### 7.2 Bootstrap backend

Au démarrage de l'application :

1. ConfigModule charge et valide l'environnement ;
2. NestJS initialise AppModule ;
3. Helmet, body parsers, préfixe API, CORS et ValidationPipe sont installés ;
4. PrismaService est disponible globalement ;
5. le serveur écoute PORT ;
6. en environnement non production, un résumé de politique Attendance est journalisé.

### 7.3 Connexion Prisma

PrismaClient utilise DATABASE_URL. Le conteneur a déjà appliqué les migrations avant `node dist/main.js`. PrismaService se déconnecte lors de la destruction du module.

### 7.4 Frontend

Next.js résout les bases API à partir des variables. L'endpoint `/api/health` appelle le health backend.

### 7.5 Premier administrateur

La création du premier administrateur est une commande séparée. Elle n'est pas exécutée automatiquement par Dockerfile ou Compose.

Fichiers concernés :

- `docker-compose.yml`
- `docker/backend.Dockerfile`
- `apps/backend/src/main.ts`
- `apps/backend/src/common/prisma/prisma.service.ts`
- `apps/frontend/app/api/health/route.ts`

## 8. Build

### 8.1 Workspace

Le workspace utilise pnpm `10.26.0`. Les moteurs exigent Node `>=20.9.0 <23` et pnpm `>=10.0.0`.

### 8.2 Scripts racine

| Script | Fonction |
|---|---|
| `build` | Build backend puis frontend |
| `build:backend` | Compilation NestJS |
| `build:frontend` | Build Next.js |
| `typecheck` | TypeScript des deux applications |
| `lint` | ESLint workspace |
| `format:check` | Vérification Prettier |
| `check` | lint, typecheck et build |
| `validate` | format, Prisma, types, lint, tests et builds |
| `validate:backend` | Prisma, types, tests, build backend |
| `validate:frontend` | types, build frontend, validation proxy |

### 8.3 Compilation backend

Nest CLI compile le TypeScript selon `tsconfig.build.json`. Prisma Client doit être généré séparément dans le script de validation ou dans le Dockerfile.

### 8.4 Compilation frontend

`next build` compile l'App Router. `next.config.ts` active strict mode React et configure ESLint pour ne pas bloquer le build.

### 8.5 Production

Les scripts `start` sont :

- backend : `node dist/main.js` ;
- frontend : `next start`.

Le Dockerfile backend ajoute l'étape de migration avant le start.

### 8.6 Génération Prisma

Elle est explicite dans :

- `pnpm prisma:generate` ;
- le Dockerfile backend ;
- `validate` et `validate:backend`.

### 8.7 Seed et backfills

Le seed, la création admin et les backfills sont disponibles comme commandes, mais aucun d'eux n'est automatiquement exécuté au démarrage des conteneurs.

### 8.8 CI/CD

Aucun fichier GitHub Actions, GitLab CI, CircleCI, Jenkinsfile ou pipeline de plateforme n'est présent. Les scripts de validation sont locaux.

## 9. Gestion des secrets

### 9.1 Sources

Les secrets sont attendus dans l'environnement du processus ou dans les fichiers `.env` chargés par ConfigModule. Les fichiers réels `.env`, `.env.production` et variantes sont exclus du contexte Docker et de Git par les fichiers d'exclusion.

### 9.2 JWT

JWT_SECRET est obligatoire, validé à au moins 32 caractères et contrôlé contre plusieurs marqueurs de valeur locale en production.

### 9.3 Prisma et base

DATABASE_URL contient la connexion PostgreSQL utilisée par Prisma. Dans Compose, elle est assemblée depuis les variables POSTGRES et le nom de service interne. Pour un fournisseur externe, elle est fournie directement.

### 9.4 Frontend

API_BASE_URL est serveur uniquement. Les variables préfixées `NEXT_PUBLIC_` sont intégrées au client et ne sont pas des emplacements de secret.

### 9.5 Cloudinary

CLOUDINARY_API_SECRET reste une variable backend. Le frontend envoie la preuve au backend ; la signature d'upload est construite côté serveur.

### 9.6 Build Docker

Le frontend reçoit ses URL comme build args. Le backend reçoit une DATABASE_URL de build destinée à Prisma generate ; le Dockerfile déclare une valeur de build par défaut.

### 9.7 Gestionnaire de secrets

Aucune intégration Vault, AWS Secrets Manager, Google Secret Manager, Render Secret Files, Docker Secrets ou Kubernetes Secrets n'est définie.

### 9.8 Valeurs

Les valeurs concrètes des fichiers d'environnement réels ne font pas partie de cette documentation. Les fichiers exemple identifient les noms attendus et des emplacements à remplacer.

Fichiers concernés :

- `.gitignore`
- `.dockerignore`
- exemples `.env`
- `apps/backend/src/app.module.ts`
- `apps/frontend/lib/api.ts`
- `docker-compose.yml`

## 10. Dépendances

### 10.1 Flux runtime

```text
Utilisateur
    |
    v
Frontend Next.js
    |
    | HTTPS/HTTP selon l'infrastructure externe
    v
Backend NestJS /api/v1
    |
    v
PrismaService
    |
    v
Prisma Client
    |
    v
PostgreSQL
```

### 10.2 Dépendances de démarrage

```text
PostgreSQL healthy
       |
       v
Prisma migrations
       |
       v
Backend healthy
       |
       v
Frontend proxy healthy
```

### 10.3 Dépendances de build

| Cible | Dépendances |
|---|---|
| Backend | Node 22, pnpm, packages workspace, Prisma generate, Nest build |
| Frontend | Node 22, pnpm, packages workspace, URL build args, Next build |
| PDF | Chromium et polices dans le runtime backend |
| Base locale | Docker Compose et image PostgreSQL |

## 11. Traçabilité

| Élément | Fichiers |
|---|---|
| Image backend | `docker/backend.Dockerfile` |
| Image frontend | `docker/frontend.Dockerfile` |
| Orchestration | `docker-compose.yml` |
| Exclusions build | `.dockerignore` |
| Variables production | `.env.production.example` |
| Variables backend | `apps/backend/.env.example` |
| Variables frontend | `apps/frontend/.env.example` |
| Scripts workspace | `package.json` |
| Versions verrouillées | `pnpm-lock.yaml`, `pnpm-workspace.yaml` |
| Config Prisma | `apps/backend/prisma.config.ts`, `prisma/schema.prisma` |
| Migrations | `apps/backend/prisma/migrations/` |
| Validation environnement | `apps/backend/src/app.module.ts` |
| Démarrage NestJS | `apps/backend/src/main.ts` |
| Résolution URL frontend | `apps/frontend/lib/api.ts` |
| Health backend | `apps/backend/src/modules/health/health.controller.ts` |
| Health frontend | `apps/frontend/app/api/health/route.ts` |
| Développement joint | `scripts/dev.mjs` |
| Test du câblage | `scripts/validate-proxy.mjs` |
| Bootstrap admin | `apps/backend/scripts/create-initial-admin.ts` |
| Instructions | `README.md` |
| Contrôles release | `docs/RELEASE_CHECKLIST.md` |

### 11.1 Render et Neon

Les références sont situées dans `README.md`. Aucun fichier de plateforme correspondant n'est présent.

## 12. Observations techniques

Cette section consigne uniquement les constats issus du dépôt.

### 12.1 Absence de manifeste Render

Aucun `render.yaml` ou Blueprint n'est présent. Le dépôt ne matérialise pas les services Render décrits textuellement.

### 12.2 Absence de configuration Neon

Neon est cité comme fournisseur possible de DATABASE_URL. Aucun fichier ou outil Neon n'est configuré.

### 12.3 Absence de DNS

Aucun domaine ou enregistrement DNS n'est défini. Les origines sont entièrement externes au dépôt et injectées par variables.

### 12.4 Absence de CI/CD

Aucun workflow automatisé de build, test, migration ou déploiement n'est présent.

### 12.5 Compose et profil

`pnpm db:up` exécute `docker compose up -d` sans profil et démarre donc PostgreSQL seulement. Le backend et le frontend nécessitent l'activation du profil `app`.

### 12.6 Copie runtime

Les deux images runtime copient la totalité de `/app` depuis l'étape build. Aucun `pnpm prune`, export standalone Next.js ou copie sélective des seuls artefacts de production n'est présent.

### 12.7 Dépendances de développement

Le `pnpm install` du build installe le workspace selon le lockfile avant la copie complète vers le runtime. Aucune étape ne retire explicitement les devDependencies.

### 12.8 Migration au démarrage

Chaque démarrage de conteneur backend exécute `prisma migrate deploy` avant NestJS. Compose attend la santé de PostgreSQL, mais aucun verrou de déploiement spécifique n'est défini dans les fichiers.

### 12.9 Seed non automatique

Le seed et la création du premier administrateur sont des actions manuelles.

### 12.10 Health frontend couplé

Le healthcheck frontend appelle `/api/health`, qui proxyfie le backend. La santé frontend Compose dépend donc de la capacité du frontend à joindre et relayer le backend.

### 12.11 Base Compose exposée

Le service PostgreSQL publie son port sur l'hôte en plus de son accès réseau Compose.

### 12.12 Réseau implicite

Aucun réseau, alias ou règle d'isolement personnalisée n'est défini.

### 12.13 Persistance unique

Seul PostgreSQL possède un volume. Les applications ne persistent aucun fichier local.

### 12.14 Chromium

Chromium est installé uniquement dans l'image backend. La génération PDF premium dépend de ce binaire et de `ATTENDANCE_PDF_EXECUTABLE_PATH`.

### 12.15 Variables non alignées entre exemples et code

`ATTENDANCE_ENTRY_JWT_EXPIRES_IN` est utilisé mais absent des exemples. `ATTENDANCE_MAX_ACCURACY_METERS` figure dans `.env.production.example` et le code, mais n'est pas transmis explicitement au backend dans `docker-compose.yml`. `ATTENDANCE_PDF_EXECUTABLE_PATH` est fixé directement dans Compose et l'image backend.

### 12.16 Cloudinary conditionnel

Compose transmet des valeurs Cloudinary éventuellement vides. La validation backend exige l'ensemble complet dès qu'une des trois clés est renseignée.

### 12.17 TLS externe

Les conteneurs n'incluent aucun terminateur TLS. Le mécanisme d'exposition HTTPS relève d'une infrastructure absente du dépôt.

### 12.18 Sauvegarde et restauration

Aucun script, calendrier ou procédure exécutable de sauvegarde/restauration n'est présent. Les documents de statut et plan mentionnent ce périmètre comme non matérialisé.

### 12.19 Observabilité

Les healthchecks et logs applicatifs existent. Aucun export de métriques, tracing distribué, agrégateur de logs ou alerte d'infrastructure n'est configuré.

### 12.20 Autoscaling et haute disponibilité

Aucune configuration de réplication, autoscaling, rolling deployment ou haute disponibilité n'est présente.

### 12.21 Documentation de déploiement

Le README et la checklist décrivent des commandes et contrôles manuels. Aucun runbook cloud spécifique, plan de rollback de base ou procédure DNS n'est présent.

