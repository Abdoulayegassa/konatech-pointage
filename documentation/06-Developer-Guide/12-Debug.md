# Debug

| Métadonnée         | Valeur          |
| ------------------ | --------------- |
| Document ID        | DG-012          |
| Titre              | Debug           |
| Version            | 1.0             |
| Statut             | Validé          |
| Classification     | Interne         |
| Référence          | Developer Guide |
| Date de génération | 30 juillet 2026 |

## 1. Présentation

### 1.1 Objectif

Ce chapitre décrit les mécanismes de diagnostic et de débogage réellement présents dans Konatech Pointage. Il couvre les erreurs HTTP, la validation NestJS, les réponses des proxies Next.js, les journaux applicatifs, les états d'erreur frontend, les commandes Prisma, les diagnostics Docker et le mode de développement des deux applications.

Les mécanismes décrits sont ceux que le dépôt implémente ou expose directement. Aucun outil de monitoring, de traçage distribué ou de débogage distant n'est ajouté à cette description.

### 1.2 Périmètre

Le diagnostic observable s'appuie sur :

- les exceptions NestJS levées par les guards et services ;
- le `ValidationPipe` global ;
- les codes et messages transmis par les Route Handlers Next.js ;
- les error boundaries de certaines routes App Router ;
- `Logger` de NestJS pour les événements ciblés ;
- les sorties standard des processus de développement et scripts ;
- les healthchecks backend, frontend et PostgreSQL ;
- les commandes de statut Docker Compose et Prisma ;
- les contrôles de build, de typage, de lint et de test.

## 2. Gestion des erreurs

### 2.1 Exceptions backend

| Mécanisme                                | Code HTTP associé | Cas observés                                                                                 |
| ---------------------------------------- | ----------------: | -------------------------------------------------------------------------------------------- |
| `BadRequestException`                    |               400 | Donnée métier invalide, date ou mois invalide, PIN invalide, preuve de pointage insuffisante |
| Validation DTO                           |               400 | Propriété étrangère, type, format, longueur, UUID, date ou plage numérique invalide          |
| `UnauthorizedException`                  |               401 | En-tête absent ou non Bearer, identifiants invalides, jeton expiré, utilisateur inactif      |
| `ForbiddenException`                     |               403 | Rôle non autorisé                                                                            |
| `NotFoundException`                      |               404 | Employé, planning, pointage, entrée calendrier ou règle de sanction absent                   |
| `ConflictException`                      |               409 | Doublon, code PIN déjà utilisé, pointage déjà enregistré ou conflit Prisma traduit           |
| `HttpException` avec `TOO_MANY_REQUESTS` |               429 | Limitation des tentatives de PIN sur le terminal                                             |
| `InternalServerErrorException`           |               500 | Configuration de stockage photo absente ou renderer PDF indisponible                         |
| `BadGatewayException`                    |               502 | Échec du service Cloudinary                                                                  |
| `GatewayTimeoutException`                |               504 | Délai Cloudinary dépassé                                                                     |

Les services lèvent directement les exceptions du framework. NestJS construit ensuite la réponse HTTP standard avec le statut et le message.

Le fichier `attendance-security.exception.ts` contient trois classes spécialisées dérivées de `BadRequestException`. Le service de sécurité courant lève toutefois directement des `BadRequestException`; aucune référence active à ces classes spécialisées n'est observée dans les autres sources.

### 2.2 Validation globale

Le bootstrap backend installe un `ValidationPipe` avec les options suivantes :

| Option                           | Comportement de diagnostic                                   |
| -------------------------------- | ------------------------------------------------------------ |
| `whitelist: true`                | Délimite les propriétés admises à celles décrites par le DTO |
| `forbidNonWhitelisted: true`     | Transforme une propriété étrangère en erreur de validation   |
| `transform: true`                | Transforme la charge reçue vers le type attendu              |
| `enableImplicitConversion: true` | Applique les conversions compatibles avec les métadonnées    |

Les DTO utilisent `class-validator` pour les types, formats, longueurs, énumérations, UUID et bornes numériques. Les messages de plusieurs erreurs de validation sont retournés sous forme de tableau par NestJS.

Les règles qui nécessitent une lecture de la base ou un calcul métier restent dans les services. La validation DTO et la validation métier constituent donc deux niveaux distincts.

### 2.3 Guards

`JwtAuthGuard` produit des erreurs explicites pour :

- l'absence d'en-tête `Authorization` ;
- un en-tête n'utilisant pas le schéma Bearer ;
- un jeton invalide ou expiré ;
- un utilisateur devenu inactif.

`RolesGuard` lève `ForbiddenException` lorsque l'utilisateur authentifié ne possède pas le rôle requis.

`AppThrottlerGuard` conserve les en-têtes de limitation et utilise un message spécifique pour les throttlers du PIN. Une tentative bloquée déclenche une réponse 429.

### 2.4 Erreurs Prisma

Les services utilisent Prisma Client directement. Certains chemins traduisent les erreurs connues :

- les collisions d'unicité, notamment le pointage employé/date ou le PIN, deviennent des conflits HTTP ;
- une ressource Prisma absente est vérifiée avant mutation et devient une réponse 404 ;
- les mises à jour conditionnelles du pointage utilisent le nombre de lignes modifiées pour détecter un conflit concurrent.

`PrismaService` ne configure pas de journal des requêtes et n'installe pas de middleware d'erreur global. Une erreur non traduite suit donc le traitement d'exception standard de NestJS.

### 2.5 Réponses des proxies Next.js

`apps/frontend/lib/api-route.ts` centralise le traitement des erreurs entre le navigateur et le backend :

| Situation                                    | Réponse du proxy                                               |
| -------------------------------------------- | -------------------------------------------------------------- |
| Cookie de session absent                     | JSON `{ error: "Session expiree." }`, statut 401               |
| Backend répond en erreur JSON                | Statut backend conservé et champ `message` converti en `error` |
| Tableau de messages backend                  | Messages joints par une virgule                                |
| Métadonnée `security` présente               | Métadonnée conservée dans la réponse proxy                     |
| Base URL invalide ou absente                 | Statut 500 avec le message de configuration                    |
| Backend injoignable ou échec non lié à l'URL | Statut 502 avec le message de repli de la route                |
| Réponse fichier en erreur                    | Texte ou JSON backend converti en erreur avec le même statut   |
| Réponse 401 du terminal                      | Suppression du cookie de session courte                        |

`ApiRequestError` conserve le message et le statut HTTP pour les appels serveur effectués par `lib/api.ts`.

### 2.6 Gestion côté composants

Les composants clients vérifient `response.ok`, lisent le JSON d'erreur et stockent un retour local. `getClientErrorMessage` extrait le champ `error` produit par les Route Handlers ou utilise un message de repli.

Les formulaires des employés, plannings, calendrier, sanctions, connexion et pointage possèdent des états d'erreur ou de feedback. Ces erreurs restent proches de l'action qui les a produites.

### 2.7 Interception

Aucun `ExceptionFilter`, fournisseur `APP_FILTER`, `NestInterceptor`, fournisseur `APP_INTERCEPTOR`, `@UseFilters` ou `@UseInterceptors` n'est présent dans les sources analysées.

La gestion transversale backend repose sur le traitement standard de NestJS, les guards globaux et le `ValidationPipe`. La couche frontend ajoute sa propre normalisation dans les proxies.

## 3. Journaux et diagnostics

### 3.1 NestJS Logger

| Source                          | Niveau observé | Information journalisée                                                                                          |
| ------------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------- |
| Bootstrap                       | `log`          | État de la politique de sécurité hors production, configuration de localisation, Cloudinary, port et préfixe API |
| `AuditLogService`               | `warn`         | Événement JSON `admin_audit`, date, acteur, action, ressource et métadonnées                                     |
| `AppThrottlerGuard`             | `warn`         | Route, IP, user-agent, nom du throttler et horodatage d'un blocage PIN                                           |
| `AttendancePhotoStorageService` | `warn`         | Nouvelle tentative Cloudinary sous forme JSON                                                                    |
| `AttendancePhotoStorageService` | `error`        | Échec final Cloudinary sous forme JSON                                                                           |
| Export PDF mensuel              | `log`          | Début, fin, renderer, type de rapport, durée, taille et nom de fichier                                           |
| Export PDF mensuel              | `warn`         | Activation du renderer historique ou repli explicite                                                             |
| Export PDF mensuel              | `error`        | Échec Puppeteer, stack et indisponibilité sans repli                                                             |

`AuditLogService` écrit dans le logger NestJS nommé `AdminAudit`. Aucun stockage d'audit en base ou dans un fichier n'est implémenté par ce service.

### 3.2 Console

Le code applicatif frontend analysé ne contient pas d'appel explicite à `console.log`, `console.warn` ou `console.error`. Les messages visibles sont rendus dans les composants.

Les appels explicites à la console se trouvent dans :

- le seed Prisma ;
- le script de création de l'administrateur ;
- les scripts de backfill des PIN et instantanés de planning ;
- le validateur de proxy.

Ces scripts annoncent leur résultat ou écrivent l'erreur finale sur la sortie d'erreur.

### 3.3 Sorties de développement

`scripts/dev.mjs` démarre NestJS et Next.js avec `stdio: 'inherit'`. Les sorties standard et d'erreur des deux processus sont donc transmises au terminal qui a lancé `pnpm dev`.

Le script ne préfixe pas lui-même chaque ligne et ne l'écrit pas dans un fichier. Les formats affichés sont ceux de NestJS, Next.js et de leurs dépendances.

### 3.4 Diagnostic proxy

`scripts/validate-proxy.mjs` possède son propre tampon de journaux :

- il capture `stdout` et `stderr` du backend et du frontend ;
- chaque ligne reçoit un préfixe correspondant au processus ;
- seules les 80 dernières lignes par processus sont conservées ;
- en cas d'échec, les tampons non vides sont joints au message final ;
- en cas de succès, le script affiche la cohérence des URL publiques et la connexion du proxy santé.

Ce mécanisme est limité à l'exécution de `pnpm test:proxy`; il ne constitue pas un système de journalisation permanent.

### 3.5 Docker

Le README contient les commandes de diagnostic Docker Compose suivantes :

| Commande                                                                      | Diagnostic disponible                              |
| ----------------------------------------------------------------------------- | -------------------------------------------------- |
| `pnpm db:status`                                                              | État des services de la composition courante       |
| `docker compose --env-file .env.production ps`                                | État et santé des conteneurs de production Compose |
| `docker compose --env-file .env.production logs -f backend frontend postgres` | Flux des sorties des trois services                |

`docker-compose.yml` définit :

- un healthcheck PostgreSQL avec `pg_isready` ;
- un healthcheck backend sur `/api/v1/health` ;
- un healthcheck frontend sur `/api/health`.

Les fichiers Docker ne configurent pas de driver de logs personnalisé, de rotation ou d'export externe.

### 3.6 Healthchecks

L'endpoint backend `/api/v1/health` retourne :

- `status: "ok"` ;
- le nom du service ;
- un horodatage.

Le proxy frontend `/api/health` appelle l'endpoint backend. Une erreur de configuration retourne 500 ; un backend injoignable retourne 502.

Le contrôleur backend de santé ne vérifie pas Prisma ni PostgreSQL. Un statut backend sain confirme la disponibilité du processus NestJS, pas la connexion effective à la base.

### 3.7 Prisma

Les mécanismes Prisma utilisables pour le diagnostic sont :

| Commande                     | Comportement                                          |
| ---------------------------- | ----------------------------------------------------- |
| `pnpm prisma:generate`       | Vérifie que le schéma permet la génération du client  |
| `pnpm prisma:status`         | Exécute `prisma migrate status` sans modifier la base |
| `pnpm prisma:migrate`        | Exécute le flux de migration de développement         |
| `pnpm prisma:migrate:deploy` | Applique les migrations existantes                    |
| `pnpm prisma:seed`           | Exécute le jeu initial configuré                      |

Aucun script `prisma studio` n'est défini. Aucune option Prisma `log` et aucun abonnement `$on` aux événements de requête ne sont présents dans `PrismaService`.

### 3.8 Diagnostics statiques et tests

| Script                | Signal fourni                                               |
| --------------------- | ----------------------------------------------------------- |
| `pnpm typecheck`      | Erreurs TypeScript frontend et backend                      |
| `pnpm lint`           | Erreurs ESLint du workspace                                 |
| `pnpm format:check`   | Écarts de format Prettier                                   |
| `pnpm build:backend`  | Erreurs de compilation NestJS                               |
| `pnpm build:frontend` | Erreurs de build Next.js                                    |
| `pnpm test:backend`   | Résultats des suites Jest                                   |
| `pnpm test:proxy`     | Câblage des URL, démarrage des applications et healthchecks |
| `pnpm check`          | Lint, typage et builds                                      |
| `pnpm validate`       | Format, Prisma, typage, lint, tests, builds et proxy        |

## 4. Débogage des couches

### 4.1 Flux de diagnostic

```text
Interface navigateur
        |
        | message local ou error.tsx
        v
Route Handler Next.js /api
        |
        | statut conservé / erreur 500 ou 502
        v
API NestJS /api/v1
        |
        | guard → ValidationPipe → controller → service
        | exceptions HTTP + Logger
        v
Prisma Client
        |
        | erreurs traduites dans certains services
        v
PostgreSQL

Contrôles transverses :
  /api/health ──> /api/v1/health
  docker compose ps / logs
  prisma migrate status
  typecheck / lint / build / tests
```

### 4.2 Frontend

Les mécanismes frontend observés sont :

- erreurs locales des formulaires et actions ;
- `ApiRequestError` pour les chargements serveur ;
- redirection vers `/login` en l'absence de session ;
- redirection selon le rôle pour les routes protégées ;
- fichiers `error.tsx` qui reçoivent `error` et `reset` ;
- boutons « Réessayer » et rechargement explicite de la route ;
- fichiers `loading.tsx` sur certaines routes pour matérialiser l'attente ;
- healthcheck proxy `/api/health`.

Des error boundaries existent pour la racine, le terminal de pointage, le calendrier, les employés, la page personnelle de pointage et les plannings. Ils affichent `error.message`. Toutes les routes ne possèdent pas un fichier `error.tsx`; la page sanctions traite notamment son erreur de chargement dans la page.

### 4.3 Backend

Le diagnostic backend s'appuie sur :

- les logs standard de démarrage NestJS ;
- les deux logs explicites du bootstrap ;
- les exceptions HTTP levées au point de détection ;
- les réponses détaillées de validation ;
- les logs ciblés d'audit, throttling, stockage photo et export PDF ;
- l'endpoint de santé ;
- le mode `start --watch` en développement ;
- les sources maps activées dans le tsconfig.

Le dépôt ne contient ni configuration `launch.json`, ni script Node `--inspect`, ni intégration à un debugger externe.

### 4.4 Base de données

Le diagnostic de la couche données repose sur :

- `docker compose ps` pour l'état du conteneur PostgreSQL ;
- le healthcheck `pg_isready` ;
- `prisma migrate status` pour l'état des migrations ;
- les erreurs remontées par Prisma lors du build, des migrations, du seed ou de l'exécution ;
- les suites intégrées qui recréent une base de test dédiée ;
- les lectures Prisma effectuées dans les tests pour confirmer l'état stocké.

Le healthcheck applicatif ne sonde pas la base. Aucun endpoint distinct de santé Prisma/PostgreSQL n'est présent.

### 4.5 API

L'API expose ses erreurs sous les statuts NestJS. Le préfixe global est `/api/v1`. Les causes peuvent être isolées par :

- l'appel direct du healthcheck backend ;
- l'appel du healthcheck via le proxy frontend ;
- la comparaison du statut backend transmis par le proxy ;
- les suites Supertest qui exercent les routes et autorisations ;
- `test:proxy`, qui distingue l'échec de démarrage backend, frontend, proxy ou redirection.

Le dépôt ne contient pas de documentation OpenAPI/Swagger générée, d'interface de requêtes API ou de collection Postman.

## 5. Configuration de développement

### 5.1 Modes de démarrage

| Commande                       | Mode observé                          |
| ------------------------------ | ------------------------------------- |
| `pnpm dev`                     | Lance backend et frontend ensemble    |
| `pnpm dev:backend`             | NestJS avec `start --watch`           |
| `pnpm dev:frontend`            | Next.js avec `dev`                    |
| `pnpm --dir apps/backend dev`  | Équivalent backend depuis le package  |
| `pnpm --dir apps/frontend dev` | Équivalent frontend depuis le package |

NestJS recompile en mode surveillance. Next.js fournit son serveur de développement et son mécanisme de rechargement propre au framework.

`scripts/dev.mjs` arrête l'autre processus lorsque l'un des deux se termine. Il relaie `SIGINT` et `SIGTERM` aux processus enfants.

### 5.2 Variables d'environnement

Le backend charge les fichiers dans l'ordre suivant :

1. `.env.<NODE_ENV>.local` ;
2. `.env.<NODE_ENV>` ;
3. `.env.local` ;
4. `.env`.

Le schéma Joi exécuté au démarrage fournit des erreurs immédiates pour une variable obligatoire absente, un type invalide ou une combinaison incohérente. Hors production, le bootstrap affiche l'état de la sécurité de pointage, de la localisation et de Cloudinary sans afficher les secrets.

Le frontend fournit des valeurs de repli locales pour certaines URL. En production, les fonctions de résolution lèvent une erreur pour une URL obligatoire absente, locale, non HTTPS, temporaire ou privée.

### 5.3 Environnements présents

| Environnement | Fichiers ou mécanismes                                                  |
| ------------- | ----------------------------------------------------------------------- |
| Développement | `.env`, `.env.local`, commandes `dev`, valeurs de repli locales         |
| Test          | `.env.test`, `.env.test.local` optionnel et préparateur de test         |
| Production    | Variables injectées, `.env.production.example`, validations spécifiques |

Les fichiers exemples inventorient les noms de variables. Les valeurs opérationnelles des fichiers d'environnement ne sont pas nécessaires au diagnostic documentaire et ne sont pas reproduites.

### 5.4 Prisma Studio

Prisma Studio n'est référencé ni par un script de package, ni par la documentation d'exécution analysée. Le mécanisme n'est donc pas disponible sous forme de commande projet.

### 5.5 Configuration absente

Le dépôt ne contient pas :

- de fichier VS Code `launch.json` ;
- de script `--inspect` ou `--inspect-brk` ;
- de filtre d'exception personnalisé ;
- d'intercepteur de journalisation ;
- de log Prisma des requêtes ;
- de configuration persistante des logs ;
- de Sentry, OpenTelemetry, Prometheus, Datadog ou New Relic ;
- de profilage CPU ou mémoire automatisé ;
- de source maps configurées pour un service externe.

## 6. Traçabilité

### 6.1 Erreurs backend

| Mécanisme                        | Fichiers analysés                                                                           |
| -------------------------------- | ------------------------------------------------------------------------------------------- |
| Validation globale               | `apps/backend/src/main.ts`                                                                  |
| Validation de configuration      | `apps/backend/src/app.module.ts`                                                            |
| Authentification et autorisation | `modules/auth/auth.service.ts`, `guards/jwt-auth.guard.ts`, `guards/roles.guard.ts`         |
| Pointage                         | `modules/attendance/attendance.service.ts`, `attendance-security.service.ts`, DTO du module |
| Stockage photo                   | `modules/attendance/attendance-photo-storage.service.ts`                                    |
| Employés                         | `modules/employees/employees.service.ts`, DTO employés                                      |
| Plannings                        | `modules/schedules/schedules.service.ts`, DTO plannings                                     |
| Calendrier                       | `modules/calendar/calendar.service.ts`, DTO calendrier                                      |
| Sanctions                        | `modules/sanctions/sanctions.service.ts`, DTO sanctions                                     |
| PDF                              | `modules/attendance/exports/monthly-attendance-pdf-exporter.service.ts`                     |

### 6.2 Frontend

| Mécanisme                  | Fichiers analysés                                                                   |
| -------------------------- | ----------------------------------------------------------------------------------- |
| Normalisation proxy        | `apps/frontend/lib/api-route.ts`                                                    |
| Erreurs des appels serveur | `apps/frontend/lib/api.ts`                                                          |
| Message client             | `apps/frontend/lib/client-error.ts`                                                 |
| Error boundaries           | `apps/frontend/app/error.tsx`, fichiers `app/*/error.tsx` présents                  |
| États de chargement        | Fichiers `app/loading.tsx` et `app/*/loading.tsx` présents                          |
| Feedback des formulaires   | Composants employés, plannings, calendrier, sanctions, authentification et pointage |
| Proxy santé                | `apps/frontend/app/api/health/route.ts`                                             |

### 6.3 Logs et diagnostics

| Mécanisme                  | Fichiers analysés                                                                        |
| -------------------------- | ---------------------------------------------------------------------------------------- |
| Bootstrap                  | `apps/backend/src/main.ts`                                                               |
| Audit                      | `apps/backend/src/common/audit/audit-log.service.ts`                                     |
| Throttling                 | `apps/backend/src/common/security/app-throttler.guard.ts`                                |
| Cloudinary                 | `apps/backend/src/modules/attendance/attendance-photo-storage.service.ts`                |
| PDF                        | `apps/backend/src/modules/attendance/exports/monthly-attendance-pdf-exporter.service.ts` |
| Processus de développement | `scripts/dev.mjs`                                                                        |
| Diagnostic proxy           | `scripts/validate-proxy.mjs`                                                             |
| Scripts CLI                | `apps/backend/scripts/*.ts`, `apps/backend/prisma/seed.ts`                               |

### 6.4 Prisma, Docker et configuration

| Mécanisme                  | Fichiers analysés                                                      |
| -------------------------- | ---------------------------------------------------------------------- |
| Prisma Client              | `apps/backend/src/common/prisma/prisma.service.ts`, `prisma.module.ts` |
| Commandes Prisma           | `package.json`, `apps/backend/package.json`, `prisma.config.ts`        |
| PostgreSQL et healthchecks | `docker-compose.yml`                                                   |
| Images applicatives        | `docker/backend.Dockerfile`, `docker/frontend.Dockerfile`              |
| Procédures de consultation | `README.md`                                                            |
| Modes TypeScript           | `apps/backend/tsconfig.json`, `apps/frontend/tsconfig.json`            |

## 7. Observations

### 7.1 Diagnostic

- Le diagnostic est principalement local, fondé sur les statuts HTTP, la sortie des processus et les commandes CLI.
- Les erreurs métier sont levées à proximité de la règle qui les détecte.
- Les proxies distinguent une erreur de configuration d'une indisponibilité backend.
- Le script proxy réunit temporairement les sorties des deux applications lors d'un échec.
- Les healthchecks distinguent le processus backend et le passage par le frontend, sans tester PostgreSQL au niveau applicatif.

### 7.2 Lisibilité

- Les exceptions contiennent généralement un message décrivant la condition refusée.
- Les logs Cloudinary et d'audit possèdent une structure JSON.
- Les logs PDF incluent le mode de rendu, la durée et la taille produite.
- Les error boundaries nomment la zone fonctionnelle concernée et offrent une nouvelle tentative.
- Les scripts CLI terminent avec un message de résultat ou une erreur explicite.

### 7.3 Isolation des erreurs

- La validation DTO intervient avant le contrôleur.
- Les guards séparent les erreurs d'authentification, de rôle et de throttling.
- Les services traduisent plusieurs contraintes Prisma en erreurs métier.
- Les Route Handlers isolent le navigateur du jeton et des erreurs brutes de connexion.
- Les composants maintiennent leur feedback d'action dans un état local.
- Les erreurs de rendu sont isolées par segment uniquement lorsque le fichier `error.tsx` correspondant existe.

### 7.4 Organisation

- Les mécanismes transverses backend résident dans `common`; les exceptions métier restent dans les modules.
- La normalisation frontend des erreurs est concentrée dans `lib/api-route.ts` et `lib/client-error.ts`.
- Les journaux applicatifs explicites sont limités au bootstrap, à l'audit, au throttling, au stockage photo et au PDF.
- Aucun niveau de log configurable par variable d'environnement n'est implémenté.
- Aucun fichier de log applicatif n'est écrit par le code.
- Prisma Studio, le journal de requêtes Prisma et les outils de monitoring ne sont pas configurés.
- Les sources maps backend sont produites, sans intégration à un collecteur externe.
