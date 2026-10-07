# Dépendances externes

| Métadonnée | Valeur |
|---|---|
| Document ID | API-017 |
| Titre | Dépendances externes |
| Version | 1.0 |
| Statut | Validé |
| Classification | Interne |
| Référence | API Reference |
| Projet | Konatech Pointage |

# 1. Présentation

Ce chapitre présente les dépendances réellement utilisées par l'API de Konatech Pointage : services réseau, moteur de données, composants d'exécution et bibliothèques déclarées dans le package backend.

L'API dépend de PostgreSQL pour la persistance et de Prisma Client pour l'accès aux données. Elle intègre conditionnellement Cloudinary afin de stocker les photos de vérification des pointages employés. La génération PDF peut lancer Chromium localement par Puppeteer. Aucun autre appel HTTP sortant n'est présent dans le code applicatif du backend.

# 2. Vue d'ensemble

| Dépendance | Type | Utilisation |
|---|---|---|
| PostgreSQL | Service de base de données | Persistance des employés, plannings, pointages, entrées calendrier et règles de sanction |
| Prisma Client | Bibliothèque et moteur d'accès aux données | Requêtes typées vers PostgreSQL et cycle de connexion |
| Prisma CLI | Outil de build et d'exploitation | Génération du client, migrations et seed |
| Cloudinary | API HTTPS externe conditionnelle | Stockage des photos de vérification des entrées et sorties employé |
| Chromium | Exécutable local | Rendu HTML vers PDF pour les exports mensuels premium |
| Puppeteer | Bibliothèque de pilotage de navigateur | Lancement de Chromium et génération des PDF |
| Frontend Konatech Pointage | Application associée configurée | Origine CORS autorisée et destination de la redirection de pointage |
| NestJS et Express | Framework HTTP et adaptateur | Bootstrap, contrôleurs, injection, guards, pipes et serveur HTTP |
| Bibliothèques de validation et de sécurité | Bibliothèques embarquées | Validation des données, de la configuration, des en-têtes et limitation du débit |

# 3. Base de données

## 3.1 PostgreSQL

Le datasource de `apps/backend/prisma/schema.prisma` déclare `provider = "postgresql"` et lit sa chaîne de connexion dans `DATABASE_URL`. La configuration NestJS exige cette variable au démarrage.

Les modèles persistés sont `Employee`, `Schedule`, `Attendance`, `CalendarEntry` et `SanctionRule`. Le schéma contient les relations, contraintes uniques et index utilisés par Prisma.

`docker-compose.yml` fournit un service local fondé sur l'image `postgres:16-alpine`. Le backend Docker dépend de son healthcheck `pg_isready` et construit `DATABASE_URL` vers l'hôte Docker `postgres` sur le port interne 5432. Le volume nommé `postgres-data` conserve les données du conteneur local.

Le dépôt ne configure qu'un datasource Prisma et un service PostgreSQL. Aucun autre moteur SQL, base NoSQL, réplique ou pooler externe n'est présent dans les configurations exécutables.

## 3.2 Prisma

`@prisma/client` est une dépendance d'exécution déclarée en `^6.0.0`. `PrismaService` étend `PrismaClient`, est exporté par un module global et ferme la connexion avec `$disconnect()` lors de la destruction du module.

Le package `prisma`, déclaré en dépendance de développement `^6.0.0`, intervient dans les scripts suivants : génération du client, migration de développement, déploiement des migrations et seed. Le Dockerfile backend génère Prisma Client durant le build et exécute `migrate deploy` avant le démarrage du serveur compilé.

Les cibles binaires du générateur sont `native` et `debian-openssl-3.0.x`, conformément aux environnements locaux et à l'image Debian du backend.

# 4. Bibliothèques principales

Les versions ci-dessous sont les plages déclarées directement dans `apps/backend/package.json`.

| Bibliothèque | Version déclarée | Utilisation observée | Fichiers de preuve |
|---|---|---|---|
| `@nestjs/common` | `^11.0.0` | Décorateurs, exceptions, logger, validation et cycle de vie | `apps/backend/src/main.ts`, modules sous `apps/backend/src` |
| `@nestjs/core` | `^11.0.0` | Création de l'application et guards globaux | `apps/backend/src/main.ts`, `apps/backend/src/app.module.ts` |
| `@nestjs/platform-express` | `^11.0.0` | Adaptateur HTTP Express de l'application NestJS | `apps/backend/package.json`, `apps/backend/src/main.ts` |
| `@nestjs/config` | `^4.0.0` | Chargement et lecture des variables d'environnement | `apps/backend/src/app.module.ts`, services utilisant `ConfigService` |
| `@nestjs/mapped-types` | `^2.1.0` | Construction de DTO de mise à jour partielle | `apps/backend/src/modules/schedules/dto/update-schedule.dto.ts` |
| `@nestjs/throttler` | `^6.5.0` | Limiteurs général, connexion et PIN | `apps/backend/src/app.module.ts`, `apps/backend/src/common/security/app-throttler.guard.ts` |
| `@prisma/client` | `^6.0.0` | Client PostgreSQL typé, types et énumérations | `apps/backend/src/common/prisma/prisma.service.ts`, services métier |
| `body-parser` | `^2.2.2` | Corps JSON et URL-encoded avec limite configurable | `apps/backend/src/main.ts` |
| `class-validator` | `^0.14.1` | Décorateurs de validation des DTO | DTO sous `apps/backend/src/modules` |
| `class-transformer` | `^0.5.1` | Conversion numérique, valeurs nulles et DTO imbriqués | DTO sous `apps/backend/src/modules` |
| `joi` | `^17.13.3` | Schéma de validation de la configuration backend | `apps/backend/src/app.module.ts` |
| `helmet` | `^8.1.0` | Middleware d'en-têtes HTTP de sécurité | `apps/backend/src/main.ts` |
| `puppeteer` | `^24.43.1` | Lancement du navigateur et production PDF | `apps/backend/src/modules/attendance/exports/monthly-attendance-puppeteer-pdf-renderer.service.ts` |
| `dotenv` | `^17.4.1` | Chargement de l'environnement dans les scripts administratifs et de backfill | `apps/backend/scripts/create-initial-admin.ts`, `apps/backend/scripts/backfill-employee-pin-code-hashes.ts` |
| `reflect-metadata` | `^0.2.2` | Dépendance runtime déclarée pour l'écosystème de décorateurs NestJS | `apps/backend/package.json` |
| `rxjs` | `^7.8.1` | Dépendance runtime déclarée avec NestJS | `apps/backend/package.json` |

Les outils de développement déclarés comprennent Nest CLI, Prisma CLI, TypeScript, Jest, Supertest, ts-jest, ts-node, tsconfig-paths et les paquets de types. Ils sont utilisés par les scripts de build, typecheck, test, administration, migration et seed ; ils ne constituent pas des services réseau appelés par l'API en exécution.

# 5. Services externes

## 5.1 Cloudinary

Cloudinary est l'unique API tierce appelée par le code backend. `AttendancePhotoStorageService` construit une requête `POST` multipart vers le domaine `api.cloudinary.com`. Le chemin commence par `/v1_1/`, insère la valeur de `CLOUDINARY_CLOUD_NAME`, puis se termine par `/image/upload`.

Le formulaire contient la Data URL de la photo, la clé API, le dossier, l'identifiant public, les tags, l'horodatage et une signature calculée côté backend. La réponse attendue fournit `secure_url` et `public_id`, enregistrés ensuite avec le pointage.

L'intégration utilise les variables suivantes, sans que leurs valeurs sensibles soient exposées dans ce document :

| Variable | Fonction |
|---|---|
| `CLOUDINARY_CLOUD_NAME` | Identifie le cloud et compose l'URL de téléversement |
| `CLOUDINARY_API_KEY` | Identifiant transmis dans le formulaire signé |
| `CLOUDINARY_API_SECRET` | Secret utilisé pour calculer la signature, non transmis comme champ du formulaire |
| `CLOUDINARY_ATTENDANCE_FOLDER` | Dossier cible |
| `CLOUDINARY_UPLOAD_TIMEOUT_MS` | Délai maximal d'une tentative |
| `CLOUDINARY_UPLOAD_MAX_RETRIES` | Nombre maximal de reprises après la première tentative |
| `CLOUDINARY_UPLOAD_RETRY_DELAY_MS` | Base du délai progressif entre les tentatives |

Les trois variables d'identification Cloudinary doivent être fournies ensemble. L'appel externe intervient pour les routes de pointage employé qui imposent une photo. En environnement `test`, le service ne contacte pas Cloudinary et construit une réponse déterministe de test.

## 5.2 Frontend associé

`FRONTEND_URL` est obligatoire. Le backend l'utilise comme origine CORS unique et comme base de l'URL retournée par `/api/v1/attendance/entry`, avec le chemin `/attendance-entry`.

Ce mécanisme produit une redirection destinée au client. Aucun `fetch` backend n'est effectué vers `FRONTEND_URL` ; le frontend est donc une application associée et non une API tierce consommée par le serveur.

## 5.3 Chromium local

Le renderer PDF lance Chromium en mode headless par Puppeteer. `ATTENDANCE_PDF_EXECUTABLE_PATH` peut fournir le chemin de l'exécutable. Le Dockerfile installe Chromium et fixe ce chemin à `/usr/bin/chromium` dans l'image backend.

Le document HTML du rapport est construit en mémoire, chargé dans une page locale, puis converti en PDF. Ce flux ne dépend pas d'un service distant de génération de documents.

## 5.4 Services absents

Aucun appel ou client n'est configuré pour Redis, un service de messagerie, une passerelle SMS, une authentification OAuth externe, une file de messages, un moteur de recherche, un service de métriques ou un stockage de fichiers autre que Cloudinary.

Les seules occurrences de `fetch` dans le code applicatif du backend concernent le téléversement Cloudinary. Le healthcheck Docker emploie également `fetch`, mais uniquement vers l'endpoint local du conteneur backend.

# 6. Flux des dépendances

```text
API NestJS
|
|-- PrismaService / @prisma/client
|       |
|       +-- connexion DATABASE_URL
|               |
|               +-- PostgreSQL
|
|-- AttendancePhotoStorageService
|       |
|       +-- HTTPS POST multipart
|               |
|               +-- API Cloudinary
|
|-- MonthlyAttendancePuppeteerPdfRendererService
|       |
|       +-- Puppeteer
|               |
|               +-- processus Chromium local
|
|-- AttendanceEntryService
        |
        +-- construit une URL FRONTEND_URL/attendance-entry
                |
                +-- redirection exécutée par le client
```

PostgreSQL est nécessaire aux opérations métier qui lisent ou modifient les données. Cloudinary n'est sollicité que par le stockage d'une preuve photo. Chromium n'est lancé que lors d'un export PDF utilisant le renderer Puppeteer.

# 7. Traçabilité

| Dépendance ou intégration | Fichier ou répertoire source | Preuve observée |
|---|---|---|
| Dépendances runtime et outils | `apps/backend/package.json` | Paquets et plages de versions déclarés |
| Résolution du workspace | `pnpm-lock.yaml` | Résolutions des dépendances installables |
| Packages du monorepo | `pnpm-workspace.yaml` | Inclusion de `apps/*` et dépendances autorisées au build |
| Datasource PostgreSQL | `apps/backend/prisma/schema.prisma` | Provider `postgresql` et variable `DATABASE_URL` |
| Client Prisma | `apps/backend/src/common/prisma/prisma.service.ts` | Extension de `PrismaClient` et déconnexion |
| Module Prisma | `apps/backend/src/common/prisma/prisma.module.ts` | Fournisseur global de `PrismaService` |
| Scripts Prisma | `apps/backend/package.json` | Génération, migrations et seed |
| PostgreSQL local | `docker-compose.yml` | Image `postgres:16-alpine`, port, volume et healthcheck |
| Construction backend | `docker/backend.Dockerfile` | Node.js, pnpm, génération Prisma, Chromium et exécution des migrations |
| Validation des dépendances configurées | `apps/backend/src/app.module.ts` | Validation de `DATABASE_URL`, `FRONTEND_URL`, Cloudinary et renderer PDF |
| Appel Cloudinary | `apps/backend/src/modules/attendance/attendance-photo-storage.service.ts` | URL d'upload, formulaire, signature, timeout et reprises |
| Rendu PDF | `apps/backend/src/modules/attendance/exports/monthly-attendance-puppeteer-pdf-renderer.service.ts` | Lancement de Puppeteer et création du PDF |
| Coordination des renderers | `apps/backend/src/modules/attendance/exports/monthly-attendance-pdf-exporter.service.ts` | Sélection Puppeteer ou renderer historique |
| Redirection frontend | `apps/backend/src/modules/attendance/attendance-entry.service.ts` | Construction de l'URL depuis `FRONTEND_URL` |
| CORS frontend | `apps/backend/src/main.ts` | Origine CORS issue de `FRONTEND_URL` |
| Configuration d'exemple | `apps/backend/.env.example` | Noms des variables PostgreSQL, Cloudinary, frontend et Chromium |

# 8. Observations

- PostgreSQL est l'unique base de données configurée et Prisma constitue l'unique couche d'accès aux données du backend.
- Cloudinary est la seule API tierce appelée par le code applicatif en exécution.
- Le stockage Cloudinary est conditionnel aux pointages employés avec preuve photo et à la présence de sa configuration.
- Puppeteer pilote un exécutable Chromium local ; aucun service externe de rendu PDF n'est intégré.
- `FRONTEND_URL` configure le CORS et une redirection client, sans appel HTTP serveur vers le frontend.
- Les bibliothèques backend sont gérées dans le workspace pnpm et verrouillées par `pnpm-lock.yaml`.
- Aucun Redis, broker de messages, fournisseur d'e-mail ou SMS, OAuth externe, moteur de recherche ou plateforme d'observabilité n'est configuré dans l'API.
