# Configuration des variables d'environnement

| Métadonnée | Valeur |
| --- | --- |
| Document ID | IG-004 |
| Titre | Configuration des variables d'environnement |
| Version | 1.0 |
| Statut | Validé |
| Classification | Interne |
| Référence | Installation Guide |

## 1. Présentation

### 1.1 Objectif

Ce chapitre recense et classe les variables d'environnement réellement
présentes ou référencées dans Konatech Pointage. Il décrit :

- les fichiers d'environnement observés ;
- les variables du backend et du frontend ;
- la connexion Prisma ;
- les substitutions Docker Compose ;
- les variables des scripts d'administration et de test ;
- les validations réalisées par le code.

Aucune valeur provenant des fichiers locaux n'est reproduite.

### 1.2 Rôle des variables d'environnement

Les variables séparent le code des paramètres propres à un environnement.
Elles servent notamment à définir :

- les URL publiques et internes ;
- la connexion PostgreSQL ;
- le secret et la durée des JWT ;
- les ports ;
- les limites HTTP ;
- la politique GPS ;
- le stockage Cloudinary des preuves photo ;
- le moteur de rendu PDF ;
- les paramètres Docker Compose ;
- l'administrateur initial ;
- la base de test.

### 1.3 Portée

L'inventaire a été établi à partir :

- des fichiers `.env.example` ;
- de `.env.production.example` ;
- des noms présents dans les fichiers locaux, sans lecture de leurs valeurs ;
- de `ConfigModule` et `ConfigService` ;
- des accès `process.env` ;
- de Prisma ;
- des Dockerfiles et de Docker Compose ;
- des scripts ;
- des tests ;
- du README.

Aucun pipeline CI/CD n'est présent sous `.github/workflows`. Il n'existe donc
aucune variable propre à un pipeline versionné à documenter.

## 2. Organisation des fichiers

### 2.1 Fichiers suivis

| Fichier | Statut Git observé | Rôle |
| --- | --- | --- |
| `.env.production.example` | Suivi | Exemple pour Docker Compose et le mode production |
| `apps/backend/.env.example` | Suivi | Exemple de configuration locale backend |
| `apps/frontend/.env.example` | Suivi | Exemple de configuration locale frontend |

Références :
`.gitignore`,
`README.md`.

### 2.2 Fichiers locaux présents

| Fichier | Suivi par Git | Rôle observé |
| --- | --- | --- |
| `apps/backend/.env` | Non | Configuration locale backend |
| `apps/frontend/.env.local` | Non | Configuration locale frontend |
| `apps/backend/.env.test` | Non | Valeurs locales du backend pour les tests |

Ces fichiers existent dans l'espace de travail, mais sont exclus par les
règles Git. Le document ne reproduit aucune de leurs valeurs.

Référence :
`.gitignore`.

### 2.3 Variantes reconnues par le backend

Le backend construit explicitement l'ordre de recherche suivant :

| Priorité | Variante |
| --- | --- |
| 1 | `.env.<NODE_ENV>.local` |
| 2 | `.env.<NODE_ENV>` |
| 3 | `.env.local` |
| 4 | `.env` |

Les chemins sont résolus à partir de la racine du backend. Les entrées liées à
`NODE_ENV` ne sont ajoutées que lorsque cette variable est définie au moment
de construire la liste.

Référence :
`apps/backend/src/app.module.ts`.

### 2.4 Variantes présentes et absentes

Les variantes suivantes sont présentes dans l'espace de travail :

```text
.env.production.example
apps/backend/.env
apps/backend/.env.example
apps/backend/.env.test
apps/frontend/.env.example
apps/frontend/.env.local
```

Les fichiers suivants ne sont pas présents :

- `.env` à la racine ;
- `.env.production` à la racine ;
- `apps/backend/.env.local` ;
- `apps/backend/.env.test.local` ;
- `apps/backend/.env.production` ;
- `apps/frontend/.env.production`.

Leur absence n'empêche pas leur reconnaissance par les outils lorsqu'une
variante correspondante est créée hors du dépôt.

### 2.5 Procédure de copie documentée

Le README décrit la création locale suivante :

```bash
cp apps/backend/.env.example apps/backend/.env
cp apps/frontend/.env.example apps/frontend/.env.local
```

Il fournit aussi l'équivalent PowerShell avec `Copy-Item`.

Pour le mode Docker de production, le README demande de partir de
`.env.production.example` pour créer `.env.production`. Ce fichier cible est
ignoré par Git.

Références :
`README.md`,
`.gitignore`.

## 3. Variables du Backend

### 3.1 Variables générales et d'authentification

| Nom | Rôle | Caractère observable | Composant | Références |
| --- | --- | --- | --- | --- |
| `NODE_ENV` | Sélection de l'environnement, fichiers chargés et comportements production/test | Optionnelle, valeur par défaut `development` dans Joi | Bootstrap, configuration, photos | `apps/backend/src/app.module.ts`, `apps/backend/src/main.ts`, `apps/backend/src/modules/attendance/attendance-photo-storage.service.ts` |
| `PORT` | Port d'écoute NestJS | Optionnelle, valeur par défaut dans Joi | Bootstrap backend | `apps/backend/src/app.module.ts`, `apps/backend/src/main.ts` |
| `FRONTEND_URL` | Origine CORS et URL du point d'entrée public | Obligatoire | Backend HTTP, pointage | `apps/backend/src/app.module.ts`, `apps/backend/src/main.ts`, `apps/backend/src/modules/attendance/attendance-entry.service.ts` |
| `JWT_SECRET` | Signature et vérification des JWT | Obligatoire, chaîne d'au moins 32 caractères | Authentification | `apps/backend/src/app.module.ts`, `apps/backend/src/modules/auth/auth.service.ts` |
| `JWT_EXPIRES_IN` | Durée du JWT principal | Optionnelle, valeur par défaut dans Joi | Authentification principale | `apps/backend/src/app.module.ts`, `apps/backend/src/modules/auth/auth.service.ts` |
| `ATTENDANCE_ENTRY_JWT_EXPIRES_IN` | Durée du JWT court du terminal | Optionnelle, valeur de repli dans le code | Authentification PIN | `apps/backend/src/modules/auth/auth.service.ts`, `apps/backend/src/modules/auth/constants/attendance-entry.constants.ts` |
| `DATABASE_URL` | Connexion PostgreSQL utilisée par Prisma | Obligatoire | Backend et Prisma | `apps/backend/src/app.module.ts`, `apps/backend/prisma.config.ts`, `apps/backend/prisma/schema.prisma` |

`ATTENDANCE_ENTRY_JWT_EXPIRES_IN` est réellement lue, mais n'apparaît dans
aucun fichier d'exemple et n'est pas déclarée dans le schéma Joi.

### 3.2 Variables HTTP et proxy

| Nom | Rôle | Caractère observable | Composant | Références |
| --- | --- | --- | --- | --- |
| `JSON_BODY_LIMIT` | Taille maximale des corps JSON et URL-encodés | Optionnelle, valeur par défaut dans Joi | Bootstrap HTTP | `apps/backend/src/app.module.ts`, `apps/backend/src/main.ts` |
| `RATE_LIMIT_TTL_MS` | Fenêtre du limiteur global | Optionnelle, entier positif avec valeur par défaut | Throttler | `apps/backend/src/app.module.ts` |
| `RATE_LIMIT_MAX` | Nombre maximal de requêtes dans la fenêtre globale | Optionnelle, entier positif avec valeur par défaut | Throttler | `apps/backend/src/app.module.ts` |
| `LOGIN_RATE_LIMIT_TTL_MS` | Fenêtre du limiteur de connexion principale | Optionnelle, entier positif avec valeur par défaut | Throttler de `/auth/login` | `apps/backend/src/app.module.ts` |
| `LOGIN_RATE_LIMIT_MAX` | Limite de connexion principale | Optionnelle, entier positif avec valeur par défaut | Throttler de `/auth/login` | `apps/backend/src/app.module.ts` |
| `TRUST_PROXY_HOPS` | Nombre de sauts de proxy approuvés par Express | Optionnelle, entier supérieur ou égal à zéro avec valeur par défaut | Bootstrap Express | `apps/backend/src/app.module.ts`, `apps/backend/src/main.ts` |

Les limites du PIN court et long sont codées directement dans `AppModule`.
Aucune variable d'environnement distincte ne permet de les modifier.

### 3.3 Variables de sécurité du pointage

| Nom | Rôle | Caractère observable | Composant | Références |
| --- | --- | --- | --- | --- |
| `ATTENDANCE_SECURITY_ENABLED` | Active la politique GPS lorsque les coordonnées sont aussi présentes | Optionnelle, booléen avec valeur par défaut | Politique de sécurité | `apps/backend/src/app.module.ts`, `apps/backend/src/modules/attendance/attendance-security-policy.service.ts` |
| `COMPANY_LATITUDE` | Latitude du site | Conditionnelle ; exigée avec la longitude lorsque la sécurité est active | Calcul de distance | mêmes fichiers |
| `COMPANY_LONGITUDE` | Longitude du site | Conditionnelle ; exigée avec la latitude lorsque la sécurité est active | Calcul de distance | mêmes fichiers |
| `ATTENDANCE_TRUSTED_RADIUS_METERS` | Rayon de confiance | Optionnelle, nombre positif ; repli dans le service | Politique GPS | mêmes fichiers |
| `ATTENDANCE_WARNING_RADIUS_METERS` | Rayon d'avertissement et base du rayon autorisé | Optionnelle, nombre positif ; repli dans le service | Politique GPS | mêmes fichiers |
| `ATTENDANCE_ALLOWED_RADIUS_METERS` | Rayon maximal autorisé explicite | Optionnelle, nombre positif | Validation hors zone | mêmes fichiers |
| `ATTENDANCE_MAX_ACCURACY_METERS` | Précision GPS maximale acceptée | Optionnelle, nombre positif ; repli dans le service | Validation GPS | mêmes fichiers |

Les coordonnées doivent être configurées ensemble. Lorsque la sécurité est
active, elles deviennent obligatoires. Le rayon d'avertissement ne peut pas
être inférieur au rayon de confiance.

### 3.4 Variables Cloudinary

| Nom | Rôle | Caractère observable | Composant | Références |
| --- | --- | --- | --- | --- |
| `CLOUDINARY_CLOUD_NAME` | Nom du compte Cloudinary | Facultative au démarrage ; requise lors d'un upload réel | Stockage photo | `apps/backend/src/app.module.ts`, `apps/backend/src/modules/attendance/attendance-photo-storage.service.ts` |
| `CLOUDINARY_API_KEY` | Clé API Cloudinary | Même condition | Stockage photo | mêmes fichiers |
| `CLOUDINARY_API_SECRET` | Secret de signature Cloudinary | Même condition | Stockage photo | mêmes fichiers |
| `CLOUDINARY_ATTENDANCE_FOLDER` | Dossier cible des preuves | Optionnelle, valeur de repli | Stockage photo | mêmes fichiers |
| `CLOUDINARY_UPLOAD_TIMEOUT_MS` | Délai maximal d'un upload | Optionnelle, entier positif avec valeur de repli | Stockage photo | mêmes fichiers |
| `CLOUDINARY_UPLOAD_MAX_RETRIES` | Nombre de nouvelles tentatives | Optionnelle, entier supérieur ou égal à zéro | Stockage photo | mêmes fichiers |
| `CLOUDINARY_UPLOAD_RETRY_DELAY_MS` | Délai de base entre tentatives | Optionnelle, entier positif | Stockage photo | mêmes fichiers |

Si l'une des trois variables d'identification Cloudinary est fournie au
démarrage, les trois doivent l'être. En environnement `test`, le service de
photo ne contacte pas Cloudinary.

### 3.5 Variables du rendu PDF

| Nom | Rôle | Caractère observable | Composant | Références |
| --- | --- | --- | --- | --- |
| `ATTENDANCE_PDF_RENDERER` | Sélectionne le moteur premium/Puppeteer ou historique | Optionnelle, valeurs validées et valeur par défaut | Export PDF | `apps/backend/src/app.module.ts`, `apps/backend/src/modules/attendance/exports/monthly-attendance-pdf-exporter.service.ts` |
| `ATTENDANCE_PDF_EXECUTABLE_PATH` | Chemin vers Chromium ou Chrome | Optionnelle si Puppeteer découvre un binaire ; fixée dans Docker | Rendu Puppeteer | `apps/backend/src/app.module.ts`, `apps/backend/src/modules/attendance/exports/monthly-attendance-puppeteer-pdf-renderer.service.ts`, `docker/backend.Dockerfile` |
| `ATTENDANCE_PDF_ALLOW_LEGACY_FALLBACK` | Autorise le moteur historique après échec Puppeteer | Optionnelle, booléen avec valeur par défaut | Coordination PDF | `apps/backend/src/app.module.ts`, `apps/backend/src/modules/attendance/exports/monthly-attendance-pdf-exporter.service.ts` |

### 3.6 Variables du premier administrateur

| Nom | Rôle | Caractère observable | Composant | Références |
| --- | --- | --- | --- | --- |
| `ADMIN_EMAIL` | Courriel du premier administrateur | Obligatoire pour `admin:create` | Script bootstrap | `apps/backend/scripts/create-initial-admin.ts`, `README.md` |
| `ADMIN_PASSWORD` | Mot de passe initial | Obligatoire pour `admin:create` | Script bootstrap | mêmes fichiers |
| `ADMIN_FIRST_NAME` | Prénom initial | Optionnelle, valeur de repli dans le script | Script bootstrap | mêmes fichiers |
| `ADMIN_LAST_NAME` | Nom initial | Optionnelle, valeur de repli dans le script | Script bootstrap | mêmes fichiers |
| `ADMIN_JOB_TITLE` | Fonction métier initiale | Optionnelle, valeur de repli dans le script | Script bootstrap | mêmes fichiers |
| `ADMIN_DEPARTMENT` | Département initial | Optionnelle, valeur de repli dans le script | Script bootstrap | mêmes fichiers |

Ces variables sont documentées dans le README, mais aucune n'apparaît dans les
trois fichiers `.env.example`.

### 3.7 Variables de test backend

| Nom | Rôle | Caractère observable | Composant | Références |
| --- | --- | --- | --- | --- |
| `TEST_DATABASE_URL` | Surcharge de la base dédiée aux tests | Optionnelle, repli vers `DATABASE_URL`, puis URL de test interne | Préparation e2e | `apps/backend/test/test-environment.ts` |
| `DATABASE_URL` | URL effective transmise à Prisma pendant les tests | Requise après résolution des replis | Tests et migrations | `apps/backend/test/test-environment.ts`, `apps/backend/test/test-database.ts` |
| `NODE_ENV` | Forcée à `test` par la préparation | Définie par le script | Tests | `apps/backend/test/test-environment.ts` |
| `PORT` | Port backend de test | Valeur ajoutée si absente | Tests | `apps/backend/test/test-environment.ts` |
| `FRONTEND_URL` | Origine frontend de test | Valeur ajoutée si absente | Tests | `apps/backend/test/test-environment.ts` |
| `HOME` | Répertoire utilisé par le sous-processus Prisma | Défini par le script | Migration de test | `apps/backend/test/test-database.ts` |
| `USERPROFILE` | Équivalent Windows pour le sous-processus | Défini par le script | Migration de test | `apps/backend/test/test-database.ts` |
| `TEMP` | Répertoire temporaire du sous-processus | Défini par le script | Migration de test | `apps/backend/test/test-database.ts` |
| `TMP` | Répertoire temporaire du sous-processus | Défini par le script | Migration de test | `apps/backend/test/test-database.ts` |

`TEST_DATABASE_URL` est utilisée sans être présente dans un fichier d'exemple.
Les quatre variables système de répertoire sont construites par le test ; elles
ne sont pas demandées à l'opérateur dans les exemples.

## 4. Variables du Frontend

### 4.1 Variables applicatives

| Nom | Rôle | Caractère observable | Composant | Références |
| --- | --- | --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | Origine publique du frontend et URL des liens/QR | Obligatoire en production ; sans repli explicite pour l'URL publique | API frontend et QR | `apps/frontend/lib/api.ts`, `apps/frontend/.env.example` |
| `NEXT_PUBLIC_API_BASE_URL` | Origine publique de l'API terminée par `/api/v1` | Obligatoire en production ; repli local en développement | Client et serveur frontend | `apps/frontend/lib/api.ts`, `apps/frontend/.env.example` |
| `API_BASE_URL` | Surcharge serveur de l'URL backend | Optionnelle ; utilise l'URL publique lorsqu'elle est absente | SSR et routes proxy | `apps/frontend/lib/api.ts`, `apps/frontend/.env.example` |
| `NODE_ENV` | Distingue production et développement | Fourni par Next.js ou fixé par Docker/scripts | Validation d'URL, cookies, page de connexion | `apps/frontend/lib/api.ts`, `apps/frontend/lib/auth-session.ts`, `apps/frontend/app/login/page.tsx` |

Les trois URL applicatives sont passées à l'image frontend comme arguments de
build, puis comme variables d'environnement.

### 4.2 Validation des URL frontend

En production, le code exige :

- `NEXT_PUBLIC_API_BASE_URL` ;
- `NEXT_PUBLIC_APP_URL` ;
- HTTPS ;
- une adresse différente de localhost et des réseaux privés ;
- aucune URL de tunnel temporaire ;
- le suffixe `/api/v1` pour les URL d'API.

`API_BASE_URL`, lorsqu'elle est définie, reçoit les mêmes contrôles d'URL
d'API.

Référence :
`apps/frontend/lib/api.ts`.

### 4.3 Variable interne du test proxy

| Nom | Rôle | Caractère observable | Composant | Référence |
| --- | --- | --- | --- | --- |
| `NEXT_TELEMETRY_DISABLED` | Désactive la télémétrie Next.js pendant le contrôle proxy | Fixée par le script, absente des exemples | Frontend temporaire | `scripts/validate-proxy.mjs` |

Le même script fixe temporairement `NODE_ENV`, `PORT`, `FRONTEND_URL`,
`API_BASE_URL`, `NEXT_PUBLIC_APP_URL` et `NEXT_PUBLIC_API_BASE_URL` pour les
processus qu'il démarre.

### 4.4 Cookies

Les noms `konatech_session` et
`konatech_attendance_entry_session` sont des constantes de code, pas des
variables d'environnement.

Le fichier local `apps/backend/.env` contient un nom `COOKIE_SECURE`, mais
aucune référence à `process.env.COOKIE_SECURE` ou à `ConfigService` pour ce nom
n'existe dans le code. La sécurité du cookie dépend exclusivement de
`NODE_ENV === 'production'`.

Références :
`apps/frontend/lib/auth-session.ts`,
`apps/backend/.env`.

## 5. Variables liées à Prisma

### 5.1 Connexion principale

Prisma utilise une seule variable de connexion :

| Nom | Rôle | Caractère observable | Références |
| --- | --- | --- | --- |
| `DATABASE_URL` | URL PostgreSQL du datasource `db` | Obligatoire pour la configuration backend et les opérations Prisma | `apps/backend/prisma/schema.prisma`, `apps/backend/prisma.config.ts`, `apps/backend/src/app.module.ts` |

Le provider du datasource est `postgresql`.

### 5.2 Utilisation par les commandes

`DATABASE_URL` est consommée lors de :

- `prisma generate`, par la configuration Prisma ;
- `prisma migrate status` ;
- `prisma migrate dev` ;
- `prisma migrate deploy` ;
- `prisma db seed` ;
- l'exécution de Prisma Client.

Le Dockerfile backend fournit une valeur d'argument de build à
`DATABASE_URL` pour permettre `prisma generate`, puis le conteneur d'exécution
reçoit l'URL construite par Docker Compose.

Références :
`package.json`,
`apps/backend/prisma.config.ts`,
`docker/backend.Dockerfile`,
`docker-compose.yml`.

### 5.3 Base de test

Les tests résolvent l'URL dans cet ordre :

1. `TEST_DATABASE_URL` ;
2. `DATABASE_URL` ;
3. URL de test interne codée dans le script.

La valeur retenue est ensuite assignée à `DATABASE_URL` pour Prisma.

Référence :
`apps/backend/test/test-environment.ts`.

## 6. Variables Docker

### 6.1 Variables PostgreSQL et ports

| Nom | Rôle Docker Compose | Valeur de repli observable | Service |
| --- | --- | --- | --- |
| `POSTGRES_DB` | Nom de la base et construction de `DATABASE_URL` | Oui | PostgreSQL, backend |
| `POSTGRES_USER` | Utilisateur de la base et construction de l'URL | Oui | PostgreSQL, backend |
| `POSTGRES_PASSWORD` | Mot de passe de la base et construction de l'URL | Oui | PostgreSQL, backend |
| `POSTGRES_PORT` | Port hôte redirigé vers 5432 | Oui | PostgreSQL |
| `BACKEND_PORT` | Port hôte redirigé vers 4000 | Oui | Backend |
| `FRONTEND_PORT` | Port hôte redirigé vers 3000 | Oui | Frontend |

Références :
`docker-compose.yml`,
`.env.production.example`.

### 6.2 Variables du service backend

| Nom | Origine dans Compose | Transmission |
| --- | --- | --- |
| `NODE_ENV` | Fixée par Compose | Environnement du conteneur |
| `PORT` | Fixée par Compose | Environnement du conteneur |
| `FRONTEND_URL` | Substitution externe sans repli | Environnement du conteneur |
| `JWT_SECRET` | Substitution externe sans repli | Environnement du conteneur |
| `JWT_EXPIRES_IN` | Substitution externe avec repli | Environnement du conteneur |
| `DATABASE_URL` | Construite depuis les variables PostgreSQL | Environnement du conteneur |
| `JSON_BODY_LIMIT` | Substitution avec repli | Environnement du conteneur |
| `RATE_LIMIT_TTL_MS` | Substitution avec repli | Environnement du conteneur |
| `RATE_LIMIT_MAX` | Substitution avec repli | Environnement du conteneur |
| `LOGIN_RATE_LIMIT_TTL_MS` | Substitution avec repli | Environnement du conteneur |
| `LOGIN_RATE_LIMIT_MAX` | Substitution avec repli | Environnement du conteneur |
| `TRUST_PROXY_HOPS` | Substitution avec repli | Environnement du conteneur |
| `ATTENDANCE_SECURITY_ENABLED` | Substitution avec repli | Environnement du conteneur |
| `COMPANY_LATITUDE` | Substitution vide possible | Environnement du conteneur |
| `COMPANY_LONGITUDE` | Substitution vide possible | Environnement du conteneur |
| `ATTENDANCE_TRUSTED_RADIUS_METERS` | Substitution avec repli | Environnement du conteneur |
| `ATTENDANCE_WARNING_RADIUS_METERS` | Substitution avec repli | Environnement du conteneur |
| `ATTENDANCE_ALLOWED_RADIUS_METERS` | Substitution vide possible | Environnement du conteneur |
| `ATTENDANCE_PDF_RENDERER` | Substitution avec repli | Environnement du conteneur |
| `ATTENDANCE_PDF_EXECUTABLE_PATH` | Fixée dans Compose | Environnement du conteneur |
| `ATTENDANCE_PDF_ALLOW_LEGACY_FALLBACK` | Substitution avec repli | Environnement du conteneur |
| `CLOUDINARY_CLOUD_NAME` | Substitution vide possible | Environnement du conteneur |
| `CLOUDINARY_API_KEY` | Substitution vide possible | Environnement du conteneur |
| `CLOUDINARY_API_SECRET` | Substitution vide possible | Environnement du conteneur |
| `CLOUDINARY_ATTENDANCE_FOLDER` | Substitution avec repli | Environnement du conteneur |
| `CLOUDINARY_UPLOAD_TIMEOUT_MS` | Substitution avec repli | Environnement du conteneur |
| `CLOUDINARY_UPLOAD_MAX_RETRIES` | Substitution avec repli | Environnement du conteneur |
| `CLOUDINARY_UPLOAD_RETRY_DELAY_MS` | Substitution avec repli | Environnement du conteneur |

Référence :
`docker-compose.yml`.

### 6.3 Variables du service frontend

| Nom | Build ARG | Environnement d'exécution | Source Compose |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | Oui | Oui | Substitution externe |
| `NEXT_PUBLIC_API_BASE_URL` | Oui | Oui | Substitution externe |
| `API_BASE_URL` | Oui | Oui | Substitution externe |
| `NODE_ENV` | Fixée dans le Dockerfile | Fixée par Compose et Dockerfile | Valeur fixe |
| `PORT` | Non | Oui | Valeur fixe dans Compose |

Les variables préfixées `NEXT_PUBLIC_` sont nécessaires pendant le build
Next.js, ce qui explique leur présence comme arguments de build.

Références :
`docker-compose.yml`,
`docker/frontend.Dockerfile`.

### 6.4 Variables internes des Dockerfiles

| Nom | Rôle | Dockerfiles |
| --- | --- | --- |
| `PNPM_HOME` | Répertoire pnpm dans l'image | Backend et frontend |
| `PATH` | Ajoute `PNPM_HOME` aux exécutables | Backend et frontend |
| `DATABASE_URL` | Argument et environnement temporaires du build Prisma | Backend |
| `ATTENDANCE_PDF_EXECUTABLE_PATH` | Chemin Chromium dans l'image finale | Backend |
| `NODE_ENV` | Mode de build et d'exécution | Backend et frontend |
| `NEXT_PUBLIC_APP_URL` | Argument de build public | Frontend |
| `NEXT_PUBLIC_API_BASE_URL` | Argument de build public | Frontend |
| `API_BASE_URL` | Argument de build serveur | Frontend |

Références :
`docker/backend.Dockerfile`,
`docker/frontend.Dockerfile`.

### 6.5 Écarts entre l'exemple et Compose

`ATTENDANCE_MAX_ACCURACY_METERS` est :

- présente dans `.env.production.example` ;
- validée et utilisée par le backend ;
- absente de la section `environment` du service backend dans
  `docker-compose.yml`.

Une valeur définie uniquement dans le fichier Compose externe pour ce nom
n'est donc pas transmise au conteneur par la configuration actuelle.

`ATTENDANCE_ENTRY_JWT_EXPIRES_IN` est utilisée par le backend mais n'apparaît
ni dans `.env.production.example`, ni dans `docker-compose.yml`.

Références :
`.env.production.example`,
`docker-compose.yml`,
`apps/backend/src/app.module.ts`,
`apps/backend/src/modules/auth/auth.service.ts`.

## 7. Procédure de configuration

### 7.1 Cycle

```text
+----------------------------+
| Configuration              |
| copie des exemples         |
| et saisie des valeurs      |
+--------------+-------------+
               |
               v
+----------------------------+
| Chargement                 |
| ConfigModule / Next.js /   |
| Docker Compose             |
+--------------+-------------+
               |
               v
+----------------------------+
| Validation                 |
| Joi backend et contrôles   |
| d'URL frontend             |
+--------------+-------------+
               |
               v
+----------------------------+
| Utilisation                |
| NestJS, Next.js, Prisma,   |
| PostgreSQL et services     |
+----------------------------+
```

### 7.2 Configuration locale

La procédure documentée est :

1. copier l'exemple backend vers `apps/backend/.env` ;
2. copier l'exemple frontend vers `apps/frontend/.env.local` ;
3. fournir les valeurs nécessaires sans modifier les noms ;
4. démarrer PostgreSQL ;
5. exécuter les commandes Prisma ;
6. démarrer les applications.

Les fichiers locaux sont ignorés par Git.

Références :
`README.md`,
`.gitignore`.

### 7.3 Chargement backend

`ConfigModule.forRoot` :

- charge les fichiers selon `NODE_ENV` ;
- rend la configuration globale ;
- applique un schéma Joi ;
- transforme les valeurs numériques et booléennes validées ;
- exécute la validation de cohérence de sécurité.

Le code lit ensuite les variables au moyen de `ConfigService` ou, pour
certains services, directement par `process.env`.

Référence :
`apps/backend/src/app.module.ts`.

### 7.4 Chargement frontend

Next.js charge la configuration locale. Le code distingue :

- les variables publiques `NEXT_PUBLIC_*` ;
- `API_BASE_URL`, destinée au serveur ;
- `NODE_ENV`, fourni par l'environnement d'exécution.

Les Dockerfiles injectent les URL dès le build et les conservent dans
l'environnement d'exécution.

Références :
`apps/frontend/lib/api.ts`,
`docker/frontend.Dockerfile`.

### 7.5 Chargement Docker Compose

Le scénario documenté crée `.env.production` depuis l'exemple, puis utilise
Docker Compose avec ce fichier. Compose :

- substitue les paramètres PostgreSQL et les ports ;
- construit `DATABASE_URL` pour le réseau interne ;
- transmet les variables backend ;
- transmet les URL frontend comme arguments de build et variables runtime.

Le dépôt ne contient pas de bloc `env_file` dans `docker-compose.yml`.

Références :
`README.md`,
`docker-compose.yml`,
`.env.production.example`.

### 7.6 Validation

Le backend refuse le démarrage lorsque :

- une variable obligatoire est absente ;
- le secret JWT est trop court ;
- un nombre ou booléen est invalide ;
- une seule coordonnée est fournie ;
- la sécurité est active sans les deux coordonnées ;
- le rayon d'avertissement est inférieur au rayon de confiance ;
- seule une partie des identifiants Cloudinary est fournie ;
- la configuration d'URL de production viole les règles codées.

Le frontend lance une erreur en production lorsqu'une URL obligatoire manque
ou ne satisfait pas ses contrôles.

Références :
`apps/backend/src/app.module.ts`,
`apps/frontend/lib/api.ts`.

## 8. Vérification

### 8.1 Validation au démarrage du backend

Le démarrage NestJS est le mécanisme principal de validation du schéma Joi :

```bash
pnpm dev:backend
```

Une configuration invalide arrête la création de l'application avant
l'écoute du port.

Références :
`package.json`,
`apps/backend/src/app.module.ts`,
`apps/backend/src/main.ts`.

### 8.2 Vérification Prisma

```bash
pnpm prisma:generate
pnpm prisma:status
```

La génération vérifie la lecture de la configuration et du schéma. Le statut
vérifie en plus l'accès à la base désignée par `DATABASE_URL`.

Références :
`package.json`,
`apps/backend/prisma.config.ts`.

### 8.3 Vérification Docker

```bash
pnpm db:status
```

Cette commande affiche l'état Compose. PostgreSQL possède un healthcheck
`pg_isready`. Avec le profil applicatif, le backend et le frontend possèdent
leurs propres healthchecks.

Références :
`package.json`,
`docker-compose.yml`.

### 8.4 Vérification du raccordement frontend/backend

```bash
pnpm test:proxy
```

Le script démarre les deux applications avec des ports temporaires et des
variables construites. Il vérifie :

- le healthcheck backend ;
- le healthcheck via le proxy frontend ;
- la redirection du point d'entrée ;
- l'égalité entre `FRONTEND_URL` et `NEXT_PUBLIC_APP_URL`.

Référence :
`scripts/validate-proxy.mjs`.

### 8.5 Vérification des URL en production

Les builds et démarrages en `NODE_ENV=production` exercent les contrôles d'URL
du frontend et du backend. Les règles observées portent sur HTTPS, localhost,
les réseaux privés, les tunnels temporaires et le suffixe de l'API.

Les tests d'environnement backend couvrent aussi plusieurs erreurs de
configuration.

Références :
`apps/frontend/lib/api.ts`,
`apps/backend/src/app.module.ts`,
`apps/backend/test/environment-validation.e2e-spec.ts`,
`apps/backend/test/app.e2e-spec.ts`.

### 8.6 Validation complète

```bash
pnpm validate
```

Cette chaîne génère Prisma, vérifie les types, lint, tests, builds et proxy.
Elle dépend d'une configuration de test fonctionnelle et d'une base
PostgreSQL accessible.

Références :
`package.json`,
`README.md`.

### 8.7 Absence d'affichage sécurisé

Le dépôt ne fournit aucun script qui affiche uniquement la liste des variables
chargées en masquant systématiquement leurs valeurs. Les vérifications
disponibles reposent sur la validation au démarrage et sur les commandes de
connectivité.

## 9. Traçabilité

### 9.1 Fichiers et chargeurs

| Élément | Fichiers concernés |
| --- | --- |
| Exemple backend | `apps/backend/.env.example` |
| Exemple frontend | `apps/frontend/.env.example` |
| Exemple Docker | `.env.production.example` |
| Ordre de chargement et validation backend | `apps/backend/src/app.module.ts` |
| Utilisation au bootstrap | `apps/backend/src/main.ts` |
| Résolution des URL frontend | `apps/frontend/lib/api.ts` |
| Cookies selon l'environnement | `apps/frontend/lib/auth-session.ts` |
| Configuration Prisma | `apps/backend/prisma.config.ts`, `apps/backend/prisma/schema.prisma` |
| Substitutions Compose | `docker-compose.yml` |
| Variables de build backend | `docker/backend.Dockerfile` |
| Variables de build frontend | `docker/frontend.Dockerfile` |

### 9.2 Variables backend

| Groupe | Variables | Fichiers d'utilisation |
| --- | --- | --- |
| Runtime | `NODE_ENV`, `PORT`, `FRONTEND_URL` | `apps/backend/src/app.module.ts`, `apps/backend/src/main.ts` |
| Authentification | `JWT_SECRET`, `JWT_EXPIRES_IN`, `ATTENDANCE_ENTRY_JWT_EXPIRES_IN` | `apps/backend/src/modules/auth/auth.service.ts` |
| Données | `DATABASE_URL` | `apps/backend/prisma.config.ts`, `apps/backend/prisma/schema.prisma` |
| HTTP | `JSON_BODY_LIMIT`, `TRUST_PROXY_HOPS` | `apps/backend/src/main.ts` |
| Débit | `RATE_LIMIT_TTL_MS`, `RATE_LIMIT_MAX`, `LOGIN_RATE_LIMIT_TTL_MS`, `LOGIN_RATE_LIMIT_MAX` | `apps/backend/src/app.module.ts` |
| GPS | `ATTENDANCE_SECURITY_ENABLED`, `COMPANY_LATITUDE`, `COMPANY_LONGITUDE`, `ATTENDANCE_TRUSTED_RADIUS_METERS`, `ATTENDANCE_WARNING_RADIUS_METERS`, `ATTENDANCE_ALLOWED_RADIUS_METERS`, `ATTENDANCE_MAX_ACCURACY_METERS` | `apps/backend/src/modules/attendance/attendance-security-policy.service.ts` |
| Cloudinary | `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `CLOUDINARY_ATTENDANCE_FOLDER`, `CLOUDINARY_UPLOAD_TIMEOUT_MS`, `CLOUDINARY_UPLOAD_MAX_RETRIES`, `CLOUDINARY_UPLOAD_RETRY_DELAY_MS` | `apps/backend/src/modules/attendance/attendance-photo-storage.service.ts` |
| PDF | `ATTENDANCE_PDF_RENDERER`, `ATTENDANCE_PDF_EXECUTABLE_PATH`, `ATTENDANCE_PDF_ALLOW_LEGACY_FALLBACK` | services d'export sous `apps/backend/src/modules/attendance/exports` |

### 9.3 Variables frontend et scripts

| Groupe | Variables | Fichiers d'utilisation |
| --- | --- | --- |
| Frontend | `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_API_BASE_URL`, `API_BASE_URL`, `NODE_ENV` | `apps/frontend/lib/api.ts` |
| Cookies | `NODE_ENV` | `apps/frontend/lib/auth-session.ts` |
| Bootstrap admin | `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_FIRST_NAME`, `ADMIN_LAST_NAME`, `ADMIN_JOB_TITLE`, `ADMIN_DEPARTMENT` | `apps/backend/scripts/create-initial-admin.ts` |
| Tests backend | `TEST_DATABASE_URL`, `DATABASE_URL`, `NODE_ENV`, `PORT`, `FRONTEND_URL`, `HOME`, `USERPROFILE`, `TEMP`, `TMP` | `apps/backend/test/test-environment.ts`, `apps/backend/test/test-database.ts` |
| Test proxy | `NODE_ENV`, `PORT`, `FRONTEND_URL`, `NEXT_TELEMETRY_DISABLED`, `API_BASE_URL`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_API_BASE_URL` | `scripts/validate-proxy.mjs` |
| Docker interne | `PNPM_HOME`, `PATH` | `docker/backend.Dockerfile`, `docker/frontend.Dockerfile` |

### 9.4 Variables Docker externes

| Groupe | Variables | Fichier |
| --- | --- | --- |
| PostgreSQL | `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_PORT` | `docker-compose.yml` |
| Ports | `BACKEND_PORT`, `FRONTEND_PORT` | `docker-compose.yml` |
| Backend | variables applicatives listées en section 6.2 | `docker-compose.yml` |
| Frontend | `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_API_BASE_URL`, `API_BASE_URL` | `docker-compose.yml` |

## 10. Observations

### 10.1 Variables utilisées sans fichier d'exemple

| Variable | Utilisation | Observation |
| --- | --- | --- |
| `ATTENDANCE_ENTRY_JWT_EXPIRES_IN` | Durée de session du terminal | Absente des exemples et de Compose ; valeur de repli codée |
| `TEST_DATABASE_URL` | Surcharge de la base e2e | Absente des exemples ; repli vers `DATABASE_URL` |
| `ADMIN_EMAIL` | Bootstrap du premier administrateur | Documentée dans le README, absente des fichiers d'exemple |
| `ADMIN_PASSWORD` | Bootstrap du premier administrateur | Documentée dans le README, absente des fichiers d'exemple |
| `ADMIN_FIRST_NAME` | Bootstrap facultatif | Documentée dans le README, absente des fichiers d'exemple |
| `ADMIN_LAST_NAME` | Bootstrap facultatif | Documentée dans le README, absente des fichiers d'exemple |
| `ADMIN_JOB_TITLE` | Bootstrap facultatif | Documentée dans le README, absente des fichiers d'exemple |
| `ADMIN_DEPARTMENT` | Bootstrap facultatif | Documentée dans le README, absente des fichiers d'exemple |
| `NEXT_TELEMETRY_DISABLED` | Processus Next.js du test proxy | Fixée uniquement dans le script |
| `HOME`, `USERPROFILE`, `TEMP`, `TMP` | Sous-processus Prisma de test | Fixées uniquement dans le script |
| `PNPM_HOME`, `PATH` | Images applicatives | Fixées dans les Dockerfiles |

### 10.2 Variable présente mais non utilisée

`COOKIE_SECURE` est présente dans le fichier local non suivi
`apps/backend/.env`. Aucune utilisation de ce nom n'existe dans le code, les
scripts, Docker Compose ou les exemples.

Le frontend active l'attribut `Secure` des cookies à partir de `NODE_ENV`, pas
à partir de `COOKIE_SECURE`.

Références :
`apps/backend/.env`,
`apps/frontend/lib/auth-session.ts`.

### 10.3 Particularités

- trois variables sont strictement obligatoires dans le schéma backend :
  `FRONTEND_URL`, `JWT_SECRET` et `DATABASE_URL` ;
- les URL frontend deviennent obligatoires en production ;
- les variables `NEXT_PUBLIC_*` sont exposées au bundle navigateur par
  convention Next.js ;
- `API_BASE_URL` reste réservée aux usages serveur du frontend ;
- `DATABASE_URL` est construite par Compose à partir des variables
  PostgreSQL ;
- `NODE_ENV` est fixé à `production` dans les images applicatives ;
- `NODE_ENV` est forcé à `test` par la préparation e2e ;
- la configuration de sécurité GPS combine activation et présence des
  coordonnées ;
- les trois identifiants Cloudinary sont validés comme un groupe ;
- les variables d'administrateur initial ne servent qu'au script
  `admin:create`.

### 10.4 Limitations

- aucun gestionnaire de secrets n'est configuré dans le dépôt ;
- aucun manifeste Render ne déclare les variables cloud ;
- aucune configuration Neon spécifique n'est présente ;
- aucun pipeline CI/CD versionné ne définit de secrets ou variables ;
- `ATTENDANCE_MAX_ACCURACY_METERS` n'est pas transmise par le service backend
  de Docker Compose malgré sa présence dans l'exemple de production ;
- `ATTENDANCE_ENTRY_JWT_EXPIRES_IN` n'est ni validée par Joi, ni documentée
  dans un exemple, ni transmise par Compose ;
- les variables du bootstrap administrateur ne figurent dans aucun exemple ;
- aucun script ne compare automatiquement l'ensemble des variables utilisées
  à celles des fichiers d'exemple ;
- aucun affichage masqué de la configuration effective n'est fourni ;
- les fichiers locaux `.env` présents sont ignorés et leur distribution n'est
  pas gérée par le dépôt.

Références :
`apps/backend/src/app.module.ts`,
`docker-compose.yml`,
`.env.production.example`,
`README.md`.

### 10.5 Variables absentes

Les mécanismes suivants ne possèdent pas de variables dédiées :

- nom des cookies de session ;
- durée et limite des deux fenêtres de throttling du PIN ;
- préfixe global `/api/v1` ;
- hôte d'écoute du backend ;
- chemin du point d'entrée `/attendance-entry` ;
- sélection d'un fournisseur PostgreSQL ;
- activation d'un cache applicatif ;
- configuration d'un serveur SMTP ;
- stockage S3 ;
- observabilité externe.

Ces valeurs ou mécanismes sont codés, absents ou non configurables par
l'environnement dans le dépôt actuel.
