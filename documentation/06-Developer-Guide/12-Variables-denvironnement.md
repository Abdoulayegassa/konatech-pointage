# Developer Guide — Variables d'environnement

| Métadonnée | Valeur |
|---|---|
| Document ID | DG-012 |
| Titre | Variables d'environnement |
| Version | 1.0 |
| Statut | Validé |
| Classification | Interne |
| Référence | Developer Guide |
| Projet | Konatech Pointage |

## 1. Présentation

Les variables d'environnement configurent le démarrage du backend NestJS, les adresses utilisées par Next.js, la connexion Prisma à PostgreSQL, les jetons JWT, la sécurité du pointage, les exports PDF, le stockage des photos, les tests et les conteneurs Docker Compose.

Ce chapitre présente uniquement les noms et usages observés. Aucune valeur de secret, de connexion, d'identifiant ou de clé n'est reproduite. La colonne « Obligatoire » reflète la validation ou le comportement du code : « oui » signifie qu'aucun démarrage ou traitement concerné n'est possible sans la variable, « conditionnel » dépend de l'activation du mécanisme indiqué et « non » correspond à une valeur facultative ou dotée d'un défaut.

## 2. Organisation des environnements

| Environnement identifiable | Fichiers associés | Mécanisme observé |
|---|---|---|
| Développement | `apps/backend/.env`, `apps/backend/.env.example`, `apps/frontend/.env.local`, `apps/frontend/.env.example` | Le backend charge ses fichiers `.env*`; Next.js charge ses variables locales et fournit des valeurs de développement dans `api.ts` lorsque les URL ne sont pas configurées. |
| Test | `apps/backend/.env.test`, `apps/backend/test/test-environment.ts` | Le programme de test fixe `NODE_ENV`, charge `.env.test.local` puis `.env.test`, et sélectionne l'URL de test avant l'initialisation. |
| Production | `.env.production.example`, `docker-compose.yml`, `docker/backend.Dockerfile`, `docker/frontend.Dockerfile` | Docker Compose transmet les variables aux services PostgreSQL, backend et frontend; les URL publiques Next.js sont aussi fournies comme arguments de build. |

Le backend sait construire les chemins `.env.<NODE_ENV>.local`, `.env.<NODE_ENV>`, `.env.local` et `.env`, dans cet ordre. Le dépôt contient un fichier `.env.test`, mais aucun fichier `.env.development`, `.env.production` ou configuration de staging active.

### 2.1 Variables d'orchestration Docker Compose

| Variable | Utilisation | Obligatoire | Fichier concerné |
|---|---|---|---|
| `POSTGRES_DB` | Nom de la base du conteneur PostgreSQL et composante de l'URL transmise au backend | Non, valeur de repli Compose | `docker-compose.yml` |
| `POSTGRES_USER` | Utilisateur PostgreSQL, contrôle de santé et URL du backend | Non, valeur de repli Compose | `docker-compose.yml` |
| `POSTGRES_PASSWORD` | Mot de passe PostgreSQL et composante de l'URL du backend | Non, valeur de repli Compose | `docker-compose.yml` |
| `POSTGRES_PORT` | Port PostgreSQL exposé sur l'hôte | Non, valeur de repli Compose | `docker-compose.yml` |
| `BACKEND_PORT` | Port du backend exposé sur l'hôte | Non, valeur de repli Compose | `docker-compose.yml` |
| `FRONTEND_PORT` | Port du frontend exposé sur l'hôte | Non, valeur de repli Compose | `docker-compose.yml` |

Les variables applicatives transmises par Compose sont détaillées dans les sections suivantes. `NODE_ENV` et les ports internes y sont définis directement par la configuration Compose; leurs valeurs ne sont pas reproduites ici.

## 3. Variables Backend

### 3.1 Exécution HTTP et accès applicatif

| Variable | Utilisation | Obligatoire | Fichier concerné |
|---|---|---|---|
| `NODE_ENV` | Sélection des fichiers `.env*`, validation renforcée de production, journal de démarrage et comportements de test | Non, défaut Joi | `apps/backend/src/app.module.ts`, `apps/backend/src/main.ts` |
| `PORT` | Port d'écoute NestJS | Non, défaut Joi | `apps/backend/src/app.module.ts`, `apps/backend/src/main.ts` |
| `FRONTEND_URL` | Origine CORS et construction de l'URL fixe `/attendance-entry` | Oui | `apps/backend/src/app.module.ts`, `apps/backend/src/main.ts`, `apps/backend/src/modules/attendance/attendance-entry.service.ts` |
| `JSON_BODY_LIMIT` | Limite des corps JSON et URL-encoded, notamment pour les photos encodées | Non, défaut Joi | `apps/backend/src/app.module.ts`, `apps/backend/src/main.ts` |
| `TRUST_PROXY_HOPS` | Nombre de sauts de proxy reconnus par Express | Non, défaut Joi | `apps/backend/src/app.module.ts`, `apps/backend/src/main.ts` |
| `RATE_LIMIT_TTL_MS` | Fenêtre de la limitation globale de requêtes | Non, défaut Joi | `apps/backend/src/app.module.ts` |
| `RATE_LIMIT_MAX` | Nombre maximal de requêtes dans la fenêtre globale | Non, défaut Joi | `apps/backend/src/app.module.ts` |
| `LOGIN_RATE_LIMIT_TTL_MS` | Fenêtre de limitation de la connexion e-mail/mot de passe | Non, défaut Joi | `apps/backend/src/app.module.ts` |
| `LOGIN_RATE_LIMIT_MAX` | Nombre maximal de connexions dans la fenêtre dédiée | Non, défaut Joi | `apps/backend/src/app.module.ts` |

Les deux limites de connexion PIN utilisent des valeurs déclarées dans le code de `AppModule`; aucune variable d'environnement ne les configure.

### 3.2 Sécurité du pointage

| Variable | Utilisation | Obligatoire | Fichier concerné |
|---|---|---|---|
| `ATTENDANCE_SECURITY_ENABLED` | Active l'évaluation de la localisation pour les pointages personnels | Non, défaut désactivé | `apps/backend/src/app.module.ts`, `apps/backend/src/modules/attendance/attendance-security-policy.service.ts` |
| `COMPANY_LATITUDE` | Latitude du site utilisée pour calculer la distance | Conditionnel, avec la longitude lorsque la sécurité est activée | Mêmes fichiers |
| `COMPANY_LONGITUDE` | Longitude du site utilisée pour calculer la distance | Conditionnel, avec la latitude lorsque la sécurité est activée | Mêmes fichiers |
| `ATTENDANCE_TRUSTED_RADIUS_METERS` | Rayon interne de confiance de la politique de pointage | Non | Mêmes fichiers |
| `ATTENDANCE_WARNING_RADIUS_METERS` | Rayon au-delà duquel le pointage est qualifié hors zone selon la politique active | Non | Mêmes fichiers |
| `ATTENDANCE_ALLOWED_RADIUS_METERS` | Ancien nom encore lu comme repli du rayon d'avertissement | Non | Mêmes fichiers |
| `ATTENDANCE_MAX_ACCURACY_METERS` | Précision GPS maximale acceptée lorsque configurée | Non | Mêmes fichiers |

La validation exige que latitude et longitude soient fournies ensemble. Lorsque la sécurité est activée, elles sont toutes deux requises. Le rayon d'avertissement ne peut pas être inférieur au rayon de confiance.

### 3.3 Stockage des photos de vérification

| Variable | Utilisation | Obligatoire | Fichier concerné |
|---|---|---|---|
| `CLOUDINARY_CLOUD_NAME` | Identifiant du compte utilisé pour l'URL d'envoi | Conditionnel | `apps/backend/src/app.module.ts`, `apps/backend/src/modules/attendance/attendance-photo-storage.service.ts` |
| `CLOUDINARY_API_KEY` | Clé d'API utilisée dans la requête signée | Conditionnel | Mêmes fichiers |
| `CLOUDINARY_API_SECRET` | Secret utilisé pour signer la requête | Conditionnel | Mêmes fichiers |
| `CLOUDINARY_ATTENDANCE_FOLDER` | Dossier distant des photos de vérification | Non, défaut applicatif | Mêmes fichiers |
| `CLOUDINARY_UPLOAD_TIMEOUT_MS` | Délai maximal d'une tentative d'envoi | Non, défaut Joi et service | Mêmes fichiers |
| `CLOUDINARY_UPLOAD_MAX_RETRIES` | Nombre de nouvelles tentatives après échec | Non, défaut Joi et service | Mêmes fichiers |
| `CLOUDINARY_UPLOAD_RETRY_DELAY_MS` | Délai progressif entre les tentatives | Non, défaut Joi et service | Mêmes fichiers |

Les trois variables d'identification Cloudinary sont validées comme un ensemble : une configuration partielle arrête la validation. En leur absence complète, le service ne dispose pas de stockage distant configuré.

### 3.4 Export PDF

| Variable | Utilisation | Obligatoire | Fichier concerné |
|---|---|---|---|
| `ATTENDANCE_PDF_RENDERER` | Sélection du renderer PDF actif parmi les modes validés | Non, défaut Joi | `apps/backend/src/app.module.ts`, `apps/backend/src/modules/attendance/exports/monthly-attendance-pdf-exporter.service.ts` |
| `ATTENDANCE_PDF_EXECUTABLE_PATH` | Chemin explicite de l'exécutable Chromium utilisé par Puppeteer | Non | `apps/backend/src/app.module.ts`, `apps/backend/src/modules/attendance/exports/monthly-attendance-puppeteer-pdf-renderer.service.ts` |
| `ATTENDANCE_PDF_ALLOW_LEGACY_FALLBACK` | Autorise le renderer historique si Puppeteer échoue | Non, défaut désactivé | `apps/backend/src/app.module.ts`, `apps/backend/src/modules/attendance/exports/monthly-attendance-pdf-exporter.service.ts` |

### 3.5 Initialisation administrative et tests

| Variable | Utilisation | Obligatoire | Fichier concerné |
|---|---|---|---|
| `ADMIN_EMAIL` | E-mail du compte créé par le script d'administrateur initial | Oui pour ce script | `apps/backend/scripts/create-initial-admin.ts` |
| `ADMIN_PASSWORD` | Mot de passe du compte créé par le script | Oui pour ce script | `apps/backend/scripts/create-initial-admin.ts` |
| `ADMIN_FIRST_NAME` | Prénom du compte initial | Non, défaut dans le script | `apps/backend/scripts/create-initial-admin.ts` |
| `ADMIN_LAST_NAME` | Nom du compte initial | Non, défaut dans le script | `apps/backend/scripts/create-initial-admin.ts` |
| `ADMIN_JOB_TITLE` | Fonction texte du compte initial | Non, défaut dans le script | `apps/backend/scripts/create-initial-admin.ts` |
| `ADMIN_DEPARTMENT` | Département du compte initial | Non, défaut dans le script | `apps/backend/scripts/create-initial-admin.ts` |
| `TEST_DATABASE_URL` | URL prioritaire employée pour construire `DATABASE_URL` pendant les tests | Non, repli de test présent dans le code | `apps/backend/test/test-environment.ts` |

Les variables `ADMIN_EMAIL` et `ADMIN_PASSWORD` sont utilisées par un script distinct; elles ne font pas partie du schéma Joi de démarrage de l'API.

## 4. Variables Frontend

| Variable | Utilisation | Obligatoire | Fichier concerné |
|---|---|---|---|
| `API_BASE_URL` | URL privée utilisée par les rendus serveur et Route Handlers pour joindre le backend | Non, repli vers l'URL publique | `apps/frontend/lib/api.ts`, `apps/frontend/.env.example`, `docker-compose.yml` |
| `NEXT_PUBLIC_API_BASE_URL` | URL publique de base de l'API; sert aussi de repli aux appels serveur | Oui en production | `apps/frontend/lib/api.ts`, `apps/frontend/.env.example`, `docker-compose.yml` |
| `NEXT_PUBLIC_APP_URL` | URL publique de l'application utilisée pour construire l'URL du QR Code | Oui en production lorsque cette URL est résolue | `apps/frontend/lib/api.ts`, composants du tableau de bord, `docker-compose.yml` |
| `NODE_ENV` | Applique les contrôles d'URL de production et l'attribut `secure` des cookies de session | Fourni par Next.js et défini par Compose | `apps/frontend/lib/api.ts`, `apps/frontend/lib/auth-session.ts`, `docker-compose.yml` |
| `PORT` | Port d'écoute du serveur Next.js en conteneur | Défini par Compose | `docker-compose.yml` |

Les variables préfixées `NEXT_PUBLIC_` sont disponibles au code client. Docker Compose les passe comme arguments de build du frontend et comme variables de son conteneur. `API_BASE_URL` reste utilisée côté serveur.

La validation de `apps/frontend/lib/api.ts` impose en production une URL absolue, HTTPS, hors localhost, hors tunnel temporaire et hors adresse IP privée. Les URL d'API doivent se terminer par `/api/v1`.

## 5. Variables Prisma

| Variable | Utilisation | Obligatoire | Fichier concerné |
|---|---|---|---|
| `DATABASE_URL` | Chaîne de connexion PostgreSQL du datasource Prisma et de Prisma Config | Oui | `apps/backend/prisma/schema.prisma`, `apps/backend/prisma.config.ts`, `apps/backend/src/app.module.ts` |
| `TEST_DATABASE_URL` | Source prioritaire de `DATABASE_URL` dans l'environnement de test | Non | `apps/backend/test/test-environment.ts` |
| `POSTGRES_DB` | Compose la base ciblée par l'URL injectée dans le backend conteneurisé | Non, défaut Compose | `docker-compose.yml` |
| `POSTGRES_USER` | Compose l'utilisateur de l'URL injectée | Non, défaut Compose | `docker-compose.yml` |
| `POSTGRES_PASSWORD` | Compose le mot de passe de l'URL injectée | Non, défaut Compose | `docker-compose.yml` |

Prisma utilise uniquement `DATABASE_URL` comme variable de datasource. Les trois variables `POSTGRES_*` sont consommées par Docker Compose pour construire l'environnement PostgreSQL et l'URL remise au backend; elles ne sont pas lues par `schema.prisma`.

## 6. Variables liées à l'authentification

| Variable | Utilisation | Obligatoire | Fichier concerné |
|---|---|---|---|
| `JWT_SECRET` | Signature et vérification des JWT | Oui; longueur minimale validée | `apps/backend/src/app.module.ts`, `apps/backend/src/modules/auth/auth.service.ts` |
| `JWT_EXPIRES_IN` | Durée des jetons de session générale | Non, défaut Joi et service | `apps/backend/src/app.module.ts`, `apps/backend/src/modules/auth/auth.service.ts`, `apps/backend/src/common/security/jwt.util.ts` |
| `ATTENDANCE_ENTRY_JWT_EXPIRES_IN` | Durée du JWT propre au terminal de pointage | Non, durée de repli dans le code | `apps/backend/src/modules/auth/auth.service.ts`, `apps/backend/src/modules/auth/constants/attendance-entry.constants.ts` |
| `LOGIN_RATE_LIMIT_TTL_MS` | Fenêtre de limitation de la route de connexion générale | Non | `apps/backend/src/app.module.ts` |
| `LOGIN_RATE_LIMIT_MAX` | Nombre de tentatives de connexion générale dans la fenêtre | Non | `apps/backend/src/app.module.ts` |
| `NODE_ENV` | Rejet de secrets JWT portant des marqueurs locaux ou de test en production; cookies frontend sécurisés en production | Non, fourni ou doté d'un défaut selon le composant | `apps/backend/src/app.module.ts`, `apps/frontend/lib/auth-session.ts` |

`ATTENDANCE_ENTRY_JWT_EXPIRES_IN` est lu par `AuthService`, mais n'est pas déclaré dans les fichiers d'exemple actuellement présents ni dans le schéma Joi. Son absence déclenche la durée de repli définie dans le code.

## 7. Chargement de la configuration

```text
NODE_ENV
   |
   v
Backend ConfigModule
   |
   +--> .env.<NODE_ENV>.local
   +--> .env.<NODE_ENV>
   +--> .env.local
   +--> .env
   |
   v
Schéma Joi + validation croisée
   |
   v
ConfigService / process.env
   |
   +--> bootstrap NestJS
   +--> Auth et limitations
   +--> sécurité du pointage et stockage photo
   +--> export PDF

Fichiers Next.js / environnement du processus
   |
   v
process.env dans api.ts et auth-session.ts
   |
   +--> URL backend serveur
   +--> URL API publique
   +--> URL publique de l'application
   +--> cookies sécurisés en production

DATABASE_URL
   |
   +--> prisma.config.ts
   +--> schema.prisma
   v
Prisma Client -> PostgreSQL
```

### 7.1 Backend NestJS

`ConfigModule.forRoot` est global. Il reçoit les chemins produits par `buildEnvFilePaths`, puis applique un schéma Joi et la fonction `validateSecurityConfig`. Cette dernière contrôle les dépendances entre coordonnées, rayons, variables Cloudinary, secret JWT et URL frontend de production. Les services utilisent ensuite `ConfigService` ou, pour les renderers PDF et certains branchements de test, `process.env`.

### 7.2 Frontend Next.js

Le frontend lit ses variables avec `process.env` dans `apps/frontend/lib/api.ts` et `apps/frontend/lib/auth-session.ts`. `getServerApiBaseUrl` donne priorité à `API_BASE_URL`; en son absence, il utilise `NEXT_PUBLIC_API_BASE_URL`. Des valeurs de repli locales sont codées uniquement hors production.

### 7.3 Tests

`applyTestEnvironment` fixe le mode test, charge d'abord `.env.test.local` s'il existe puis `.env.test`, et choisit `TEST_DATABASE_URL`, `DATABASE_URL` ou son URL de test interne dans cet ordre. L'URL retenue est assignée à `DATABASE_URL` avant l'utilisation de l'application et de Prisma.

### 7.4 Docker Compose

`.env.production.example` recense les noms attendus pour le lancement Compose. Compose construit l'environnement PostgreSQL, transmet les variables validées au backend et fournit les trois URL frontend au build puis au conteneur Next.js. Le fichier d'exemple ne constitue pas un environnement actif tant qu'il n'est pas matérialisé par la configuration du processus Compose.

## 8. Traçabilité

| Groupe de variables | Fichiers analysés | Preuve observée |
|---|---|---|
| Chargement backend | `apps/backend/src/app.module.ts` | Ordre des fichiers, schéma Joi et validation croisée |
| Bootstrap backend | `apps/backend/src/main.ts` | Port, CORS, taille de corps, proxy et mode d'exécution |
| Base de données | `apps/backend/prisma/schema.prisma`, `apps/backend/prisma.config.ts` | Lecture de `DATABASE_URL` |
| Authentification | `apps/backend/src/modules/auth/auth.service.ts`, `apps/backend/src/common/security/jwt.util.ts`, `apps/backend/src/modules/auth/constants/attendance-entry.constants.ts` | Secret et durées JWT |
| Limitation de débit | `apps/backend/src/app.module.ts`, `apps/backend/src/common/security/app-throttler.guard.ts` | Fenêtres et maximums configurables pour le trafic global et le login |
| Sécurité de présence | `apps/backend/src/modules/attendance/attendance-security-policy.service.ts`, `apps/backend/src/modules/attendance/attendance-security.service.ts` | Activation, coordonnées, rayons et précision |
| Stockage photo | `apps/backend/src/modules/attendance/attendance-photo-storage.service.ts` | Identifiants Cloudinary, dossier, délais et tentatives |
| Export PDF | `apps/backend/src/modules/attendance/exports/monthly-attendance-pdf-exporter.service.ts`, `apps/backend/src/modules/attendance/exports/monthly-attendance-puppeteer-pdf-renderer.service.ts` | Mode, exécutable et repli |
| Création administrateur | `apps/backend/scripts/create-initial-admin.ts` | Identité et mot de passe du compte initial |
| Configuration frontend | `apps/frontend/lib/api.ts`, `apps/frontend/lib/auth-session.ts` | Résolution des URL et attribut des cookies |
| Tests | `apps/backend/test/test-environment.ts`, `apps/backend/.env.test` | Ordre de chargement et URL de base de test |
| Exemples locaux | `apps/backend/.env.example`, `apps/frontend/.env.example` | Noms de variables proposés par composant |
| Production Compose | `.env.production.example`, `docker-compose.yml`, `docker/backend.Dockerfile`, `docker/frontend.Dockerfile` | Variables de services, ports, build et exécution |
| Documentation liée | `documentation/06-Developer-Guide/04-Stack-technologique.md`, `documentation/06-Developer-Guide/08-Authentification-et-autorisation.md`, `documentation/06-Developer-Guide/10-Flux-de-donnees.md` | Contexte technique recoupé avec les configurations actives |

## 9. Observations

- Le backend centralise la majorité de sa configuration dans `ConfigModule` avec validation Joi au démarrage.
- `FRONTEND_URL`, `JWT_SECRET` et `DATABASE_URL` sont les trois variables explicitement requises par le schéma backend.
- Les coordonnées deviennent obligatoires lorsque la sécurité de localisation est activée.
- Les trois identifiants Cloudinary sont facultatifs comme ensemble et invalides lorsqu'ils sont partiellement renseignés.
- Le frontend distingue l'URL serveur `API_BASE_URL` de l'URL publique `NEXT_PUBLIC_API_BASE_URL`.
- Les URL frontend sont validées plus strictement lorsque `NODE_ENV` vaut `production`.
- Prisma lit `DATABASE_URL`; les variables `POSTGRES_*` appartiennent à la composition Docker.
- Les tests peuvent substituer la connexion avec `TEST_DATABASE_URL` avant le chargement applicatif.
- Le script de création d'administrateur possède ses propres variables, hors du schéma Joi de l'API.
- `ATTENDANCE_ENTRY_JWT_EXPIRES_IN` est utilisée dans le code mais absente des fichiers d'exemple présents.
- Aucun environnement de staging n'est défini dans les fichiers analysés.
