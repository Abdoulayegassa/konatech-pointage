# Configuration des environnements

| Métadonnée | Valeur |
|---|---|
| Document ID | OG-004 |
| Titre | Configuration des environnements |
| Version | 1.0 |
| Statut | Validé |
| Classification | Interne |
| Référence | Operations Guide |
| Projet | Konatech Pointage |

# 1. Présentation

Ce chapitre décrit les environnements et variables effectivement reconnus par Konatech Pointage. Il couvre les fichiers `.env*` présents, le chargement NestJS, la résolution des URL dans Next.js, la datasource Prisma, la préparation des tests et les substitutions Docker Compose.

Aucune valeur provenant d’un fichier local n’est reproduite. Les secrets, clés, mots de passe, identifiants et chaînes de connexion sont référencés uniquement par le nom de leur variable.

# 2. Environnements disponibles

Le schéma de validation du backend autorise `development`, `test` et `production` pour `NODE_ENV`. Aucun environnement de staging n’est défini dans le code ou les configurations exécutables.

| Environnement | Usage | Fichiers associés | Source |
|---|---|---|---|
| Développement | Exécution locale de NestJS et Next.js, PostgreSQL Compose et migrations de développement | `apps/backend/.env`, `apps/backend/.env.example`, `apps/frontend/.env.local`, `apps/frontend/.env.example` | `apps/backend/src/app.module.ts`, `apps/frontend/lib/api.ts`, `README.md`, `package.json` |
| Test | Exécution des suites backend et du contrôle temporaire frontend/backend | `apps/backend/.env.test`; variante facultative reconnue `apps/backend/.env.test.local` mais absente de l’espace de travail | `apps/backend/test/test-environment.ts`, `apps/backend/test/jest-e2e.json`, `scripts/validate-proxy.mjs` |
| Production | Build et exécution des services Docker Compose avec `NODE_ENV=production` | `.env.production.example`; fichier cible `.env.production` documenté mais absent de l’espace de travail | `.env.production.example`, `docker-compose.yml`, `docker/backend.Dockerfile`, `docker/frontend.Dockerfile`, `README.md` |

## 2.1 Fichiers présents

| Fichier présent | Suivi par Git | Fonction observable |
|---|---|---|
| `.env.production.example` | Oui | Modèle de variables fourni pour la pile Compose de production |
| `apps/backend/.env.example` | Oui | Modèle de configuration locale du backend |
| `apps/frontend/.env.example` | Oui | Modèle de configuration locale du frontend |
| `apps/backend/.env` | Non | Configuration locale actuellement présente pour le backend |
| `apps/backend/.env.test` | Non | Configuration locale actuellement présente pour les tests backend |
| `apps/frontend/.env.local` | Non | Configuration locale actuellement présente pour le frontend |

Les règles de `.gitignore` excluent les variantes locales et propres aux environnements. `.dockerignore` exclut également les fichiers locaux backend, frontend et racine de la construction des images.

# 3. Variables d’environnement

## 3.1 Variables générales, HTTP et authentification

| Variable | Utilisation | Composants concernés | Source |
|---|---|---|---|
| `NODE_ENV` | Sélectionner l’environnement, les fichiers backend propres à l’environnement et plusieurs comportements production/test | Backend, frontend, tests, Docker | `apps/backend/src/app.module.ts`, `apps/backend/src/main.ts`, `apps/frontend/lib/api.ts`, `apps/frontend/lib/auth-session.ts`, `docker-compose.yml` |
| `PORT` | Définir le port d’écoute NestJS ou Next.js selon le processus | Backend, frontend Docker | `apps/backend/src/app.module.ts`, `apps/backend/src/main.ts`, `docker-compose.yml` |
| `FRONTEND_URL` | Définir l’origine CORS backend et l’URL de redirection vers le pointage | Backend | `apps/backend/src/main.ts`, `apps/backend/src/modules/attendance/attendance-entry.service.ts`, `docker-compose.yml` |
| `JWT_SECRET` | Signer et vérifier les jetons JWT | Backend | `apps/backend/src/app.module.ts`, `apps/backend/src/modules/auth/auth.service.ts`, `docker-compose.yml` |
| `JWT_EXPIRES_IN` | Définir la durée du jeton principal | Backend | `apps/backend/src/app.module.ts`, `apps/backend/src/modules/auth/auth.service.ts`, `docker-compose.yml` |
| `ATTENDANCE_ENTRY_JWT_EXPIRES_IN` | Définir la durée du jeton dédié au pointage par PIN | Backend | `apps/backend/src/modules/auth/auth.service.ts`, `apps/backend/src/modules/auth/constants/attendance-entry.constants.ts` |
| `JSON_BODY_LIMIT` | Limiter les corps JSON et URL-encodés | Backend | `apps/backend/src/app.module.ts`, `apps/backend/src/main.ts`, `docker-compose.yml` |
| `RATE_LIMIT_TTL_MS` | Définir la fenêtre du limiteur global | Backend | `apps/backend/src/app.module.ts`, `docker-compose.yml` |
| `RATE_LIMIT_MAX` | Définir le nombre maximal de requêtes du limiteur global | Backend | `apps/backend/src/app.module.ts`, `docker-compose.yml` |
| `LOGIN_RATE_LIMIT_TTL_MS` | Définir la fenêtre du limiteur de connexion | Backend | `apps/backend/src/app.module.ts`, `docker-compose.yml` |
| `LOGIN_RATE_LIMIT_MAX` | Définir la limite de tentatives de connexion | Backend | `apps/backend/src/app.module.ts`, `docker-compose.yml` |
| `TRUST_PROXY_HOPS` | Configurer le nombre de sauts de proxy approuvés par Express | Backend | `apps/backend/src/app.module.ts`, `apps/backend/src/main.ts`, `docker-compose.yml` |

## 3.2 Variables frontend

| Variable | Utilisation | Composants concernés | Source |
|---|---|---|---|
| `NEXT_PUBLIC_APP_URL` | Fournir l’origine publique du frontend et construire l’URL du QR de pointage | Frontend, build Docker | `apps/frontend/lib/api.ts`, `apps/frontend/app/page.tsx`, `docker-compose.yml`, `docker/frontend.Dockerfile` |
| `NEXT_PUBLIC_API_BASE_URL` | Fournir la base publique de l’API terminée par `/api/v1` | Frontend, build Docker | `apps/frontend/lib/api.ts`, `docker-compose.yml`, `docker/frontend.Dockerfile` |
| `API_BASE_URL` | Surcharger côté serveur l’URL utilisée par les route handlers et les chargements serveur | Frontend, build Docker | `apps/frontend/lib/api.ts`, `docker-compose.yml`, `docker/frontend.Dockerfile` |
| `NEXT_TELEMETRY_DISABLED` | Désactiver la télémétrie Next.js pendant le test de raccordement | Processus frontend temporaire | `scripts/validate-proxy.mjs` |

## 3.3 Variables PostgreSQL et Prisma

| Variable | Utilisation | Composants concernés | Source |
|---|---|---|---|
| `DATABASE_URL` | Fournir la chaîne de connexion PostgreSQL à Prisma et au backend | Prisma, backend, tests, scripts d’administration | `apps/backend/prisma.config.ts`, `apps/backend/prisma/schema.prisma`, `apps/backend/src/app.module.ts`, `apps/backend/test/test-environment.ts` |
| `TEST_DATABASE_URL` | Surcharger la base réservée aux tests backend | Tests backend | `apps/backend/test/test-environment.ts` |
| `POSTGRES_DB` | Définir la base créée/utilisée par le conteneur PostgreSQL et construire `DATABASE_URL` dans Compose | PostgreSQL, backend Compose | `docker-compose.yml`, `.env.production.example` |
| `POSTGRES_USER` | Définir l’utilisateur PostgreSQL et le healthcheck | PostgreSQL, backend Compose | `docker-compose.yml`, `.env.production.example` |
| `POSTGRES_PASSWORD` | Fournir le mot de passe PostgreSQL | PostgreSQL, backend Compose | `docker-compose.yml`, `.env.production.example` |
| `POSTGRES_PORT` | Définir le port PostgreSQL publié sur l’hôte | PostgreSQL Compose | `docker-compose.yml`, `.env.production.example` |
| `BACKEND_PORT` | Définir le port backend publié sur l’hôte | Backend Compose | `docker-compose.yml`, `.env.production.example` |
| `FRONTEND_PORT` | Définir le port frontend publié sur l’hôte | Frontend Compose | `docker-compose.yml`, `.env.production.example` |

## 3.4 Variables de sécurité du pointage

| Variable | Utilisation | Composants concernés | Source |
|---|---|---|---|
| `ATTENDANCE_SECURITY_ENABLED` | Activer la politique de localisation lorsque les coordonnées du site sont configurées | Backend | `apps/backend/src/app.module.ts`, `apps/backend/src/modules/attendance/attendance-security-policy.service.ts`, `docker-compose.yml` |
| `COMPANY_LATITUDE` | Définir la latitude du site utilisée pour le calcul de distance | Backend | `apps/backend/src/app.module.ts`, `apps/backend/src/modules/attendance/attendance-security-policy.service.ts`, `docker-compose.yml` |
| `COMPANY_LONGITUDE` | Définir la longitude du site utilisée pour le calcul de distance | Backend | `apps/backend/src/app.module.ts`, `apps/backend/src/modules/attendance/attendance-security-policy.service.ts`, `docker-compose.yml` |
| `ATTENDANCE_TRUSTED_RADIUS_METERS` | Définir le rayon de confiance | Backend | `apps/backend/src/app.module.ts`, `apps/backend/src/modules/attendance/attendance-security-policy.service.ts`, `docker-compose.yml` |
| `ATTENDANCE_WARNING_RADIUS_METERS` | Définir le rayon d’avertissement et participer au rayon autorisé effectif | Backend | `apps/backend/src/app.module.ts`, `apps/backend/src/modules/attendance/attendance-security-policy.service.ts`, `docker-compose.yml` |
| `ATTENDANCE_ALLOWED_RADIUS_METERS` | Définir explicitement le rayon maximal autorisé | Backend | `apps/backend/src/app.module.ts`, `apps/backend/src/modules/attendance/attendance-security-policy.service.ts`, `docker-compose.yml` |
| `ATTENDANCE_MAX_ACCURACY_METERS` | Définir la précision GPS maximale acceptée | Backend | `apps/backend/src/app.module.ts`, `apps/backend/src/modules/attendance/attendance-security-policy.service.ts`, `.env.production.example` |

## 3.5 Variables Cloudinary et PDF

| Variable | Utilisation | Composants concernés | Source |
|---|---|---|---|
| `CLOUDINARY_CLOUD_NAME` | Identifier le compte cible lors d’un envoi de photo | Backend | `apps/backend/src/app.module.ts`, `apps/backend/src/modules/attendance/attendance-photo-storage.service.ts`, `docker-compose.yml` |
| `CLOUDINARY_API_KEY` | Authentifier la requête d’envoi de photo | Backend | `apps/backend/src/app.module.ts`, `apps/backend/src/modules/attendance/attendance-photo-storage.service.ts`, `docker-compose.yml` |
| `CLOUDINARY_API_SECRET` | Signer la requête d’envoi de photo | Backend | `apps/backend/src/app.module.ts`, `apps/backend/src/modules/attendance/attendance-photo-storage.service.ts`, `docker-compose.yml` |
| `CLOUDINARY_ATTENDANCE_FOLDER` | Définir le dossier distant des preuves | Backend | `apps/backend/src/app.module.ts`, `apps/backend/src/modules/attendance/attendance-photo-storage.service.ts`, `docker-compose.yml` |
| `CLOUDINARY_UPLOAD_TIMEOUT_MS` | Définir le délai d’attente d’un envoi | Backend | `apps/backend/src/app.module.ts`, `apps/backend/src/modules/attendance/attendance-photo-storage.service.ts`, `docker-compose.yml` |
| `CLOUDINARY_UPLOAD_MAX_RETRIES` | Définir le nombre de nouvelles tentatives | Backend | `apps/backend/src/app.module.ts`, `apps/backend/src/modules/attendance/attendance-photo-storage.service.ts`, `docker-compose.yml` |
| `CLOUDINARY_UPLOAD_RETRY_DELAY_MS` | Définir le délai de base entre les tentatives | Backend | `apps/backend/src/app.module.ts`, `apps/backend/src/modules/attendance/attendance-photo-storage.service.ts`, `docker-compose.yml` |
| `ATTENDANCE_PDF_RENDERER` | Sélectionner le moteur de génération PDF | Backend | `apps/backend/src/app.module.ts`, `apps/backend/src/modules/attendance/exports/monthly-attendance-pdf-exporter.service.ts`, `docker-compose.yml` |
| `ATTENDANCE_PDF_EXECUTABLE_PATH` | Fournir le chemin du navigateur au renderer Puppeteer | Backend | `apps/backend/src/app.module.ts`, `apps/backend/src/modules/attendance/exports/monthly-attendance-puppeteer-pdf-renderer.service.ts`, `docker/backend.Dockerfile`, `docker-compose.yml` |
| `ATTENDANCE_PDF_ALLOW_LEGACY_FALLBACK` | Autoriser le renderer historique après un échec Puppeteer | Backend | `apps/backend/src/app.module.ts`, `apps/backend/src/modules/attendance/exports/monthly-attendance-pdf-exporter.service.ts`, `docker-compose.yml` |

## 3.6 Variables du script d’administrateur initial

| Variable | Utilisation | Composants concernés | Source |
|---|---|---|---|
| `ADMIN_EMAIL` | Identifier le compte administrateur à créer | Script `admin:create` | `apps/backend/scripts/create-initial-admin.ts`, `README.md` |
| `ADMIN_PASSWORD` | Fournir le mot de passe initial | Script `admin:create` | `apps/backend/scripts/create-initial-admin.ts`, `README.md` |
| `ADMIN_FIRST_NAME` | Fournir le prénom initial facultatif | Script `admin:create` | `apps/backend/scripts/create-initial-admin.ts`, `README.md` |
| `ADMIN_LAST_NAME` | Fournir le nom initial facultatif | Script `admin:create` | `apps/backend/scripts/create-initial-admin.ts`, `README.md` |
| `ADMIN_JOB_TITLE` | Fournir la fonction initiale facultative | Script `admin:create` | `apps/backend/scripts/create-initial-admin.ts`, `README.md` |
| `ADMIN_DEPARTMENT` | Fournir le département initial facultatif | Script `admin:create` | `apps/backend/scripts/create-initial-admin.ts`, `README.md` |

## 3.7 Variables techniques créées par les tests

| Variable | Utilisation | Composants concernés | Source |
|---|---|---|---|
| `HOME` | Fournir un répertoire au sous-processus Prisma de migration | Tests backend | `apps/backend/test/test-database.ts` |
| `USERPROFILE` | Fournir l’équivalent Windows au sous-processus Prisma | Tests backend | `apps/backend/test/test-database.ts` |
| `TEMP` | Fournir le répertoire temporaire au sous-processus Prisma | Tests backend | `apps/backend/test/test-database.ts` |
| `TMP` | Fournir le répertoire temporaire au sous-processus Prisma | Tests backend | `apps/backend/test/test-database.ts` |

Ces quatre variables sont construites par le code de test et ne proviennent pas des fichiers d’exemple.

# 4. Configuration du frontend

## 4.1 Résolution des URL

`apps/frontend/lib/api.ts` centralise les URL :

- `getApiBaseUrl()` lit `NEXT_PUBLIC_API_BASE_URL` ;
- `getServerApiBaseUrl()` utilise `API_BASE_URL` lorsqu’elle est renseignée, sinon la base publique ;
- `getPublicAppUrl()` lit `NEXT_PUBLIC_APP_URL` ;
- les bases d’API doivent se terminer par `/api/v1`.

Hors production, le code possède un repli local pour la base de l’API. En production, les trois URL configurées sont contrôlées : protocole HTTPS, absence d’adresse localhost, d’adresse privée et de nom de tunnel temporaire.

## 4.2 Paramètres publics et serveur

| Paramètre | Portée d’exécution | Usage | Source |
|---|---|---|---|
| `NEXT_PUBLIC_APP_URL` | Public, disponible au build Next.js | URL du frontend et du QR | `apps/frontend/lib/api.ts`, `apps/frontend/app/page.tsx` |
| `NEXT_PUBLIC_API_BASE_URL` | Public, disponible au build Next.js | Base publique de l’API | `apps/frontend/lib/api.ts` |
| `API_BASE_URL` | Serveur Next.js | Base prioritaire des appels serveur | `apps/frontend/lib/api.ts` |
| `NODE_ENV` | Processus Next.js | Contrôles production, cookies sécurisés et affichage conditionnel des comptes de démonstration | `apps/frontend/lib/api.ts`, `apps/frontend/lib/auth-session.ts`, `apps/frontend/app/login/page.tsx` |

`apps/frontend/next.config.ts` active `reactStrictMode` et ignore ESLint pendant le build. Il ne déclare pas de variable supplémentaire.

## 4.3 Sources de configuration selon le mode

En local, le fichier présent est `apps/frontend/.env.local`. Dans Docker, les trois URL sont des arguments du stage de build puis des variables du conteneur. Le test proxy les construit à partir de ports temporaires et les transmet au processus Next.js.

# 5. Configuration du backend

## 5.1 Chargement et validation

`ConfigModule.forRoot()` est global. Il charge les fichiers à partir de la racine `apps/backend` et valide la configuration avec Joi. Le schéma couvre le port, CORS, JWT, PostgreSQL, limites HTTP, proxy, politique de pointage, Cloudinary et rendu PDF.

| Domaine | Variables actives | Comportement observé | Source |
|---|---|---|---|
| Port | `PORT` | Lu au bootstrap avant `app.listen()` | `apps/backend/src/main.ts`, `apps/backend/src/app.module.ts` |
| JWT | `JWT_SECRET`, `JWT_EXPIRES_IN`, `ATTENDANCE_ENTRY_JWT_EXPIRES_IN` | Signature, vérification et durées des jetons | `apps/backend/src/modules/auth/auth.service.ts` |
| Prisma | `DATABASE_URL` | Connexion de la datasource PostgreSQL | `apps/backend/prisma.config.ts`, `apps/backend/prisma/schema.prisma` |
| CORS | `FRONTEND_URL` | Origine unique passée à `enableCors`, avec credentials actifs | `apps/backend/src/main.ts` |
| Corps HTTP | `JSON_BODY_LIMIT` | Limite des parseurs JSON et URL-encodés | `apps/backend/src/main.ts` |
| Proxy | `TRUST_PROXY_HOPS` | Active `trust proxy` lorsque le nombre est supérieur à zéro | `apps/backend/src/main.ts` |
| Débit | `RATE_LIMIT_TTL_MS`, `RATE_LIMIT_MAX`, `LOGIN_RATE_LIMIT_TTL_MS`, `LOGIN_RATE_LIMIT_MAX` | Paramètre les limiteurs globaux et de connexion | `apps/backend/src/app.module.ts` |

`ATTENDANCE_ENTRY_JWT_EXPIRES_IN` est lue par `AuthService`, mais n’est pas déclarée dans les fichiers d’exemple présents ni dans le schéma Joi. Les valeurs de repli sont portées par le code.

## 5.2 Contraintes de configuration

Le validateur backend établit les contraintes suivantes :

- `FRONTEND_URL`, `JWT_SECRET` et `DATABASE_URL` sont obligatoires ;
- les coordonnées du site sont configurées ensemble ;
- l’activation de la sécurité du pointage exige les deux coordonnées ;
- le rayon d’avertissement ne peut pas être inférieur au rayon de confiance ;
- les trois identifiants Cloudinary sont absents ensemble ou présents ensemble ;
- en production, le secret JWT ne peut pas correspondre aux motifs locaux ou de test ;
- en production, `FRONTEND_URL` doit être en HTTPS et ne peut pas cibler localhost, une adresse privée ou un tunnel temporaire.

# 6. Configuration de la base de données

Prisma utilise uniquement `DATABASE_URL` pour sa datasource PostgreSQL. Aucun pooler ni seconde URL de connexion n’est configuré.

| Élément | Configuration | Script disponible | Source |
|---|---|---|---|
| Génération du client | Schéma `apps/backend/prisma/schema.prisma` | `pnpm prisma:generate` | `package.json`, `apps/backend/prisma.config.ts` |
| État des migrations | Base ciblée par `DATABASE_URL` | `pnpm prisma:status` | `package.json` |
| Migration de développement | Répertoire `apps/backend/prisma/migrations` | `pnpm prisma:migrate` | `package.json`, `apps/backend/prisma.config.ts` |
| Migration de déploiement | Migrations existantes | `pnpm prisma:migrate:deploy` | `package.json`, `docker/backend.Dockerfile` |
| Seed | Script `apps/backend/prisma/seed.ts` | `pnpm prisma:seed` | `package.json`, `apps/backend/prisma.config.ts` |
| Base de test | `TEST_DATABASE_URL`, puis `DATABASE_URL` après résolution | `pnpm test:backend` | `apps/backend/test/test-environment.ts`, `apps/backend/test/test-database.ts` |

Dans Compose, `DATABASE_URL` du backend est assemblée avec `POSTGRES_USER`, `POSTGRES_PASSWORD` et `POSTGRES_DB`, en ciblant le service `postgres`.

# 7. Configuration Docker

## 7.1 Images

`docker/backend.Dockerfile` et `docker/frontend.Dockerfile` utilisent des builds multi-stage Node.js. Les fichiers locaux d’environnement sont exclus par `.dockerignore`.

Le Dockerfile backend :

- installe les dépendances avec le lockfile ;
- génère Prisma Client ;
- construit NestJS ;
- installe Chromium dans l’image d’exécution ;
- fixe `NODE_ENV` et `ATTENDANCE_PDF_EXECUTABLE_PATH` ;
- applique les migrations avant le démarrage de `dist/main.js`.

Le Dockerfile frontend reçoit les trois URL Next.js comme arguments de build, construit l’application, puis la démarre sur son port interne déclaré.

## 7.2 Compose

| Service | Variables injectées | Port | Volume et dépendance | Source |
|---|---|---|---|---|
| `postgres` | `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | Interne PostgreSQL, publication par `POSTGRES_PORT` | Volume nommé `postgres-data`; healthcheck `pg_isready` | `docker-compose.yml` |
| `backend` | `NODE_ENV`, `PORT`, URL frontend, JWT, datasource, limites HTTP, proxy, sécurité, PDF et Cloudinary | Interne backend, publication par `BACKEND_PORT` | Attend `postgres` sain | `docker-compose.yml` |
| `frontend` | `NODE_ENV`, `PORT`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_API_BASE_URL`, `API_BASE_URL` | Interne frontend, publication par `FRONTEND_PORT` | Attend `backend` sain | `docker-compose.yml` |

Compose ne déclare pas de réseau nommé. Les services utilisent le réseau par défaut créé par Compose et le backend désigne PostgreSQL par le nom de service `postgres`.

Le volume `postgres-data` est déclaré au niveau racine de `docker-compose.yml`. Aucun autre volume n’est configuré.

`ATTENDANCE_MAX_ACCURACY_METERS` figure dans `.env.production.example`, mais n’est pas transmise dans la liste `environment` du service backend Compose. `ATTENDANCE_ENTRY_JWT_EXPIRES_IN` n’est pas transmise par Compose et ne figure pas dans le modèle de production.

# 8. Chargement des configurations

## 8.1 Backend local

```text
Variables déjà présentes dans le processus
                  |
                  v
Lecture de `NODE_ENV`
                  |
                  v
`apps/backend/.env.<NODE_ENV>.local`
                  |
                  v
`apps/backend/.env.<NODE_ENV>`
                  |
                  v
`apps/backend/.env.local`
                  |
                  v
`apps/backend/.env`
                  |
                  v
Validation Joi + validation de sécurité
                  |
                  v
`ConfigService`
                  |
                  +--> bootstrap NestJS
                  +--> authentification
                  +--> Prisma via `DATABASE_URL`
                  +--> sécurité du pointage
                  +--> Cloudinary et PDF
```

Les chemins propres à `NODE_ENV` ne sont ajoutés que si la variable est définie lorsque `buildEnvFilePaths()` est évaluée. Les chemins sont résolus depuis `apps/backend`, indépendamment du répertoire courant du processus.

## 8.2 Tests backend

```text
`applyTestEnvironment()`
          |
          +--> force `NODE_ENV` à `test`
          |
          +--> charge `apps/backend/.env.test.local` si présent
          |
          +--> charge `apps/backend/.env.test`
          |
          +--> résout `TEST_DATABASE_URL` / `DATABASE_URL`
          |
          v
Préparation PostgreSQL + migrations + seed
          |
          v
Suites Jest e2e
```

Le chargeur de test ne remplace pas une variable déjà présente dans le processus.

## 8.3 Frontend et Docker

```text
Développement frontend
`apps/frontend/.env.local`
          |
          v
Processus Next.js
          |
          v
`apps/frontend/lib/api.ts`

Docker Compose
fichier transmis par `--env-file`
          |
          v
substitutions de `docker-compose.yml`
          |
          +--> arguments du build frontend
          +--> environnement du frontend
          +--> environnement du backend
          +--> environnement PostgreSQL
```

# 9. Traçabilité

| Configuration | Fichier ou répertoire source | Preuve observée |
|---|---|---|
| Environnements acceptés | `apps/backend/src/app.module.ts` | `NODE_ENV` limité à développement, test et production |
| Ordre des fichiers backend | `apps/backend/src/app.module.ts` | Construction ordonnée de quatre variantes depuis la racine backend |
| Fichiers suivis | `.env.production.example`, `apps/backend/.env.example`, `apps/frontend/.env.example` | Modèles versionnés observés par Git |
| Fichiers locaux présents | `apps/backend/.env`, `apps/backend/.env.test`, `apps/frontend/.env.local` | Fichiers existants et exclus par `.gitignore` |
| Exclusion des images | `.dockerignore` | Fichiers `.env` locaux exclus du contexte copié |
| Validation backend | `apps/backend/src/app.module.ts` | Schéma Joi et validation croisée de sécurité |
| Port et CORS | `apps/backend/src/main.ts` | Lecture de `PORT`, `FRONTEND_URL` et `TRUST_PROXY_HOPS` |
| JWT | `apps/backend/src/modules/auth/auth.service.ts` | Lecture du secret et des deux durées |
| Sécurité GPS | `apps/backend/src/modules/attendance/attendance-security-policy.service.ts` | Lecture dynamique des coordonnées, rayons et précision |
| Cloudinary | `apps/backend/src/modules/attendance/attendance-photo-storage.service.ts` | Lecture des identifiants, dossier, délais et tentatives |
| PDF | `apps/backend/src/modules/attendance/exports` | Lecture du renderer, du binaire et du mode de repli |
| Variables frontend | `apps/frontend/lib/api.ts` | Résolution et validation des trois URL |
| Cookie frontend | `apps/frontend/lib/auth-session.ts` | `NODE_ENV` détermine l’attribut `Secure` |
| Prisma | `apps/backend/prisma.config.ts`, `apps/backend/prisma/schema.prisma` | Datasource PostgreSQL fondée sur `DATABASE_URL` |
| Test backend | `apps/backend/test/test-environment.ts`, `apps/backend/test/test-database.ts` | Chargement des fichiers test, résolution de la base et environnement du sous-processus |
| Test proxy | `scripts/validate-proxy.mjs` | Variables construites pour les processus temporaires |
| Administrateur initial | `apps/backend/scripts/create-initial-admin.ts` | Lecture des six variables propres au script |
| Substitution Compose | `docker-compose.yml`, `.env.production.example` | Variables des services, ports, healthchecks et volume |
| Build backend | `docker/backend.Dockerfile` | Environnement de build et d’exécution du backend |
| Build frontend | `docker/frontend.Dockerfile` | Arguments puis variables Next.js |
| Scripts disponibles | `package.json`, `apps/backend/package.json`, `apps/frontend/package.json` | Commandes de développement, build, test, Prisma et démarrage |
| Documentation liée | `README.md`, `documentation/05-Installation-Guide/04-Configuration-des-variables-denvironnement.md`, `documentation/07-Operations-Guide/01-Presentation-de-lexploitation.md`, `documentation/07-Operations-Guide/02-Architecture-dexecution.md`, `documentation/07-Operations-Guide/03-Demarrage-et-arret-des-services.md` | Configuration et contexte opérationnel déjà documentés |

# 10. Observations

- Les environnements explicitement reconnus sont le développement, le test et la production.
- Les seuls fichiers d’exemple d’environnement suivis sont les deux modèles applicatifs et le modèle Compose de production.
- Les fichiers locaux présents sont exclus de Git et des images Docker.
- Le backend possède un ordre explicite de chargement des variantes `.env`; le chargeur de test ajoute une lecture dédiée avant l’initialisation des suites.
- Les URL frontend sont centralisées et validées dans `apps/frontend/lib/api.ts`.
- `DATABASE_URL` est l’unique chaîne de connexion consommée par Prisma.
- Compose construit la chaîne backend à partir des variables PostgreSQL et du nom de service `postgres`.
- Les variables publiques Next.js sont injectées au build de l’image frontend et de nouveau dans son environnement d’exécution.
- La configuration Cloudinary est conditionnelle, mais ses trois identifiants sont validés comme un ensemble lorsqu’un élément est renseigné.
- `ATTENDANCE_ENTRY_JWT_EXPIRES_IN` est consommée par le backend sans apparaître dans les modèles présents.
- `ATTENDANCE_MAX_ACCURACY_METERS` est fournie par le modèle de production sans être transmise au service backend par Compose.
- Une variable nommée dans le fichier backend local n’est référencée par aucun code, script ou fichier d’exemple actif et n’appartient donc pas à l’inventaire des variables utilisées.
- Aucun fichier `.env.production`, `.env.development`, `.env.development.local` ou `.env.test.local` n’est présent dans l’espace de travail.
- Aucun environnement de staging ni configuration de plateforme cloud n’est présent dans les fichiers exécutables.
