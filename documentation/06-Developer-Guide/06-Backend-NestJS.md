# Developer Guide — Backend (NestJS)

| Métadonnée | Valeur |
|---|---|
| Document ID | DG-006 |
| Titre | Backend (NestJS) |
| Version | 1.0 |
| Statut | Validé |
| Classification | Interne |
| Référence | Developer Guide |
| Projet | Konatech Pointage |

## 1. Présentation

Le backend Konatech Pointage est une API HTTP NestJS située dans `apps/backend/`. Il porte l'authentification, les autorisations, la validation des requêtes, les traitements de présence, la gestion des employés et horaires, le calendrier RH, les sanctions, les agrégats du tableau de bord et les exports mensuels.

Le point d'entrée `apps/backend/src/main.ts` démarre l'application avec `AppModule`. Les routes sont exposées sous le préfixe `/api/v1`. Les contrôleurs reçoivent les requêtes, les services exécutent les traitements, et `PrismaService` centralise l'accès à PostgreSQL.

## 2. Architecture Backend

Le code est réparti entre :

- `src/modules/` pour les domaines applicatifs ;
- `src/common/` pour les services, fonctions et contrôles partagés ;
- `prisma/` pour le schéma, les migrations et le seed ;
- `test/` pour les scénarios e2e ;
- `scripts/` pour les opérations explicites sur les données et l'administrateur initial.

```text
Requête HTTP /api/v1/*
          |
          v
Adaptateur NestJS / Express
          |
          +--> Helmet
          +--> body-parser
          +--> CORS
          |
          v
Gardes globaux
throttling + JWT + rôles
          |
          v
Pipes NestJS
ValidationPipe global + ParseUUIDPipe ciblé
          |
          v
Contrôleur du module
          |
          v
Service(s) injecté(s)
          |
          v
PrismaService -> Prisma Client -> PostgreSQL
```

Les routes marquées `@Public()` ne nécessitent pas d'utilisateur JWT. Les autres passent par `JwtAuthGuard`; les routes portant `@Roles(...)` passent aussi par le contrôle de rôle.

## 3. Organisation des modules

### 3.1 Modules chargés par AppModule

| Module | Emplacement | Responsabilité |
|---|---|---|
| `AppModule` | `apps/backend/src/app.module.ts` | Charge la configuration, le throttling et les modules du backend |
| `AuditLogModule` | `apps/backend/src/common/audit/` | Fournit globalement `AuditLogService` |
| `PrismaModule` | `apps/backend/src/common/prisma/` | Fournit globalement `PrismaService` |
| `AuthModule` | `apps/backend/src/modules/auth/` | Connexion, jetons, utilisateur courant, garde JWT et garde de rôles |
| `HealthModule` | `apps/backend/src/modules/health/` | Expose la route publique de santé |
| `DashboardModule` | `apps/backend/src/modules/dashboard/` | Produit la vue agrégée du tableau de bord |
| `EmployeesModule` | `apps/backend/src/modules/employees/` | Gère les employés, leurs accès et leurs affectations |
| `CalendarModule` | `apps/backend/src/modules/calendar/` | Gère la vue mensuelle et les événements RH |
| `AttendanceModule` | `apps/backend/src/modules/attendance/` | Gère les pointages, historiques, contrôles conditionnels et exports |
| `SanctionsModule` | `apps/backend/src/modules/sanctions/` | Gère les règles et le calcul des sanctions |
| `SchedulesModule` | `apps/backend/src/modules/schedules/` | Gère les horaires et leurs statuts |

`AuditLogModule` et `PrismaModule` portent `@Global()`. Leurs services exportés peuvent être injectés sans réimport du module dans chaque module consommateur.

### 3.2 Relations internes

| Module source | Module importé | Usage observé |
|---|---|---|
| `AttendanceModule` | `CalendarModule` | Calculs liés aux jours de travail et événements de calendrier |
| `AttendanceModule` | `SanctionsModule` | Calculs de sanctions liés aux données de présence |
| `DashboardModule` | `CalendarModule` | Agrégation tenant compte du calendrier |
| `CalendarModule` | `AuditLogModule` | Injection du service d'audit dans le contrôleur |

`AttendanceModule` exporte `AttendanceService`, `AuthModule` exporte `AuthService`, `CalendarModule` exporte `CalendarService` et `SanctionsModule` exporte `SanctionsService`.

## 4. Contrôleurs et services

### 4.1 Organisation par domaine

| Domaine | Contrôleur | Services principaux | DTO présents |
|---|---|---|---|
| Authentification | `AuthController` | `AuthService` | `LoginDto`, `AttendanceEntryLoginDto` |
| Santé | `HealthController` | Aucun service propre | Aucun DTO |
| Tableau de bord | `DashboardController` | `DashboardService` | Aucun DTO |
| Employés | `EmployeesController` | `EmployeesService`, `AuditLogService` | Création, mise à jour, statut, rôle, département et horaire |
| Horaires | `SchedulesController` | `SchedulesService`, `AuditLogService` | Création, mise à jour et statut |
| Calendrier | `CalendarController` | `CalendarService`, `AuditLogService` | Mois, création et mise à jour d'événement |
| Pointage | `AttendanceController` | `AttendanceService`, `AttendanceEntryService`, services d'export, `AuditLogService` | Historique, pointage, sortie, sécurité et export |
| Sanctions | `SanctionsController` | `SanctionsService` | Mois et mise à jour des règles |

Les contrôleurs sont déclarés par `@Controller(...)` et injectent leurs dépendances dans leur constructeur. Ils portent les décorateurs HTTP `@Get`, `@Post`, `@Patch` ou `@Delete`, ainsi que les métadonnées d'accès lorsqu'elles s'appliquent.

### 4.2 Services du module Attendance

`AttendanceModule` regroupe plusieurs services réellement déclarés :

| Service | Fonction observée |
|---|---|
| `AttendanceEntryService` | Construit l'URL fixe de l'entrée de pointage à partir de la configuration |
| `AttendanceService` | Exécute les traitements d'entrée, sortie, historique et situation du jour |
| `AttendanceSecurityPolicyService` | Résout la politique conditionnelle de localisation et photo |
| `AttendanceSecurityService` | Évalue les données de sécurité et utilise le stockage photo |
| `AttendancePhotoStorageService` | Envoie les photos de vérification à Cloudinary lorsqu'il est configuré |
| `AttendanceMonthlyMetricsService` | Recalcule les métriques mensuelles et gère son intervalle de cycle de vie |
| `MonthlyAttendanceExportService` | Construit les données de rapport mensuel |
| `MonthlyAttendanceCsvExporterService` | Produit le contenu CSV |
| `MonthlyAttendancePdfExporterService` | Produit le contenu PDF |
| `MonthlyAttendancePuppeteerPdfRendererService` | Effectue le rendu PDF avec Puppeteer |
| `AppClockService` | Fournit l'heure utilisée par les traitements du module |

`AttendanceMonthlyMetricsService` implémente `OnModuleInit` et `OnModuleDestroy`. Il crée un intervalle quotidien, ne lance le recalcul du mois précédent que le premier jour UTC, puis supprime l'intervalle à la destruction.

### 4.3 DTO et validation

Les DTO sont des classes TypeScript décorées avec `class-validator` et, pour certaines conversions, `class-transformer`. Les contraintes observées incluent :

- formats d'e-mail, UUID, date ISO, mois `YYYY-MM` et heure `HH:mm` ;
- longueurs minimales ou maximales ;
- types booléen, entier, nombre, chaîne et tableau ;
- bornes de latitude, longitude, précision et année ;
- valeurs d'énumération et listes autorisées ;
- validation imbriquée des preuves de sécurité du pointage ;
- transformation des chaînes vides vers `null` pour certains champs.

`UpdateScheduleDto` utilise `PartialType(CreateScheduleDto)` fourni par `@nestjs/mapped-types`.

Le `ValidationPipe` global est configuré avec :

```text
whitelist: true
forbidNonWhitelisted: true
transform: true
enableImplicitConversion: true
```

Des paramètres UUID utilisent également le pipe NestJS intégré `ParseUUIDPipe` dans les contrôleurs employés, horaires et calendrier.

### 4.4 Injection de dépendances

NestJS instancie les providers déclarés dans les fichiers `*.module.ts`. L'injection par constructeur relie notamment :

- les contrôleurs à leurs services de domaine ;
- `JwtAuthGuard` à `Reflector` et `AuthService` ;
- les services de données à `PrismaService` ;
- les services nécessitant la configuration à `ConfigService` ;
- `AttendanceService` aux services de sécurité et de calendrier ;
- `DashboardService` et `AttendanceMonthlyMetricsService` à `CalendarService`.

## 5. Sécurité Backend

### 5.1 Gardes

| Garde | Portée | Comportement |
|---|---|---|
| `AppThrottlerGuard` | Global via `APP_GUARD` dans `AppModule` | Applique les limites configurées et les limites propres à la connexion PIN |
| `JwtAuthGuard` | Global via `APP_GUARD` dans `AuthModule` | Ignore les routes publiques, exige Bearer et résout l'utilisateur |
| `RolesGuard` | Global via `APP_GUARD` dans `AuthModule` | Compare `accessRole` avec les rôles inscrits par `@Roles` |

Le throttling général utilise `RATE_LIMIT_TTL_MS` et `RATE_LIMIT_MAX`. La connexion administrateur utilise les paramètres nommés `LOGIN_RATE_LIMIT_TTL_MS` et `LOGIN_RATE_LIMIT_MAX`. Deux limites codées sont appliquées à la route de connexion PIN : 5 requêtes sur 60 secondes et 10 requêtes sur 600 secondes.

### 5.2 JWT et secrets

`apps/backend/src/common/security/jwt.util.ts` implémente :

- la signature JWT avec HMAC-SHA256 ;
- l'encodage Base64 URL ;
- les champs `sub`, `email`, `iat` et `exp` ;
- la durée issue de `JWT_EXPIRES_IN` ;
- la vérification de signature avec `timingSafeEqual` ;
- le rejet des jetons mal formés, expirés ou dont la charge utile est invalide.

`AuthService` utilise `JWT_SECRET` pour signer et vérifier les jetons. Le projet n'utilise pas de stratégie Passport ni de package Passport déclaré.

Les mots de passe et PIN sont traités dans `apps/backend/src/common/security/password.util.ts` avec `scrypt`, un sel aléatoire et une comparaison à temps constant.

### 5.3 Décorateurs

| Décorateur | Fonction | Source |
|---|---|---|
| `@Public()` | Inscrit la métadonnée qui contourne l'exigence JWT | `apps/backend/src/modules/auth/decorators/public.decorator.ts` |
| `@Roles(...)` | Inscrit les rôles autorisés | `apps/backend/src/modules/auth/decorators/roles.decorator.ts` |
| `@CurrentUser()` | Lit l'utilisateur ajouté à la requête par `JwtAuthGuard` | `apps/backend/src/modules/auth/decorators/current-user.decorator.ts` |

Les routes publiques observées sont la santé, les deux routes de connexion et la redirection de l'entrée de pointage.

### 5.4 Middlewares et validation HTTP

Le bootstrap désactive le body parser automatique de NestJS, puis installe avec `app.use()` :

- `helmet()` ;
- `bodyParser.json()` avec la limite `JSON_BODY_LIMIT` ;
- `bodyParser.urlencoded()` avec la même limite.

CORS accepte l'origine `FRONTEND_URL` et active les credentials. Lorsque `TRUST_PROXY_HOPS` est supérieur à zéro, le bootstrap configure `trust proxy` sur l'instance Express.

Le dépôt ne contient pas de classe middleware NestJS, de filtre d'exception personnalisé, d'intercepteur personnalisé, de pipe personnalisé ou de stratégie d'authentification. Les exceptions utilisent les classes NestJS et leur traitement standard. Les pipes présents sont `ValidationPipe` et `ParseUUIDPipe`, tous deux fournis par NestJS.

## 6. Configuration

### 6.1 Fichiers

| Fichier | Rôle |
|---|---|
| `apps/backend/package.json` | Dépendances et scripts backend |
| `apps/backend/tsconfig.json` | Compilation et vérification TypeScript |
| `apps/backend/tsconfig.build.json` | Exclusions propres au build |
| `apps/backend/nest-cli.json` | Répertoire source et nettoyage de `dist` au build |
| `apps/backend/prisma.config.ts` | Schéma, migrations, seed et datasource Prisma |
| `apps/backend/.env.example` | Noms de variables backend d'exemple |
| `apps/backend/.env.test` | Configuration chargée pour les tests |
| `apps/backend/.env` | Configuration locale présente |
| `apps/backend/src/app.module.ts` | Chargement des environnements et validation Joi |
| `apps/backend/src/main.ts` | Configuration du serveur HTTP |

Aucune valeur des fichiers d'environnement n'est reproduite ici.

### 6.2 Chargement de l'environnement

`buildEnvFilePaths()` construit l'ordre suivant :

```text
.env.<NODE_ENV>.local
.env.<NODE_ENV>
.env.local
.env
```

Les deux premiers chemins ne sont ajoutés que lorsque `NODE_ENV` est défini. `ConfigModule.forRoot()` est global et utilise ce tableau.

Le schéma Joi valide les variables du processus, notamment :

- `NODE_ENV`, `PORT`, `FRONTEND_URL`, `DATABASE_URL` ;
- `JWT_SECRET`, `JWT_EXPIRES_IN` ;
- les tailles et limites de requêtes ;
- les paramètres conditionnels de sécurité du pointage ;
- les paramètres de rendu PDF ;
- les paramètres Cloudinary.

`validateSecurityConfig()` contrôle les combinaisons latitude/longitude, les rayons, la complétude des identifiants Cloudinary et plusieurs contraintes propres à la production.

### 6.3 Build et exécution

Le manifeste backend expose les scripts `dev`, `build`, `start`, `typecheck`, `test`, les scripts Prisma et trois scripts de données. Nest CLI compile depuis `src` et supprime `dist` avant le build. Le script `start` exécute `node dist/main.js`.

Le Dockerfile backend génère Prisma Client, construit NestJS, installe Chromium dans l'image d'exécution, applique `prisma migrate deploy`, puis démarre `dist/main.js`.

## 7. Cycle d'une requête

Le cycle observable d'une requête protégée contenant un DTO est le suivant :

```text
Client HTTP
    |
    v
Express / NestJS
    |
    +--> Helmet et body-parser
    +--> résolution de route sous /api/v1
    |
    v
Gardes globaux
    |
    +--> AppThrottlerGuard
    +--> JwtAuthGuard
    |       `--> AuthService --> PrismaService --> PostgreSQL
    +--> RolesGuard
    |
    v
Pipes
    |
    +--> ParseUUIDPipe, lorsqu'il est déclaré sur un paramètre
    `--> ValidationPipe sur DTO
    |
    v
Méthode du contrôleur
    |
    +--> CurrentUser, Body, Query ou Param
    |
    v
Service du domaine
    |
    +--> autres services injectés, selon le traitement
    `--> PrismaService
             |
             v
        Prisma Client
             |
             v
        PostgreSQL
             |
             v
Valeur retournée ou exception NestJS
             |
             v
Réponse HTTP
```

Toutes les routes n'empruntent pas chaque branche :

- une route `@Public()` ne demande pas l'authentification JWT ;
- une route sans `@Roles()` ne demande pas de rôle particulier ;
- une route sans DTO n'effectue pas de validation de corps ou de requête par DTO ;
- la route de santé retourne directement son objet sans appeler de service ni Prisma ;
- la redirection publique `/api/v1/attendance/entry` utilise `AttendanceEntryService` et `FRONTEND_URL`, sans accès à la base ;
- une requête authentifiée implique un accès Prisma dans `AuthService` pour résoudre l'utilisateur du jeton.

Les actions administratives sur employés, horaires, calendrier et certains traitements de présence appellent `AuditLogService` après le traitement métier réussi. Ce service écrit un événement JSON avec le logger NestJS.

## 8. Organisation du code

```text
apps/backend/
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   ├── common/
│   │   ├── audit/
│   │   ├── prisma/
│   │   ├── security/
│   │   ├── time/
│   │   ├── utils/
│   │   └── validation/
│   └── modules/
│       ├── attendance/
│       │   ├── dto/
│       │   └── exports/
│       ├── auth/
│       │   ├── constants/
│       │   ├── decorators/
│       │   ├── dto/
│       │   ├── guards/
│       │   └── interfaces/
│       ├── calendar/
│       │   └── dto/
│       ├── dashboard/
│       ├── employees/
│       │   └── dto/
│       ├── health/
│       ├── sanctions/
│       │   └── dto/
│       └── schedules/
│           └── dto/
├── prisma/
├── scripts/
└── test/
```

| Zone | Contenu observé |
|---|---|
| `src/modules/` | Modules, contrôleurs, services, DTO et types fonctionnels |
| `src/common/audit/` | Module et service de journalisation d'actions administratives |
| `src/common/prisma/` | Module, service et sélections Prisma partagées |
| `src/common/security/` | Throttling, JWT et hachage de secrets |
| `src/common/time/` | Service d'horloge |
| `src/common/utils/` | Calculs de dates, sorties et instantanés d'horaires |
| `src/common/validation/` | Constantes de validation du PIN |
| `prisma/` | Schéma, migrations et seed |
| `scripts/` | Création d'administrateur et backfills |
| `test/` | Tests e2e, configuration Jest et base de test |

Aucun répertoire `entities/` n'est présent. Les types persistés et les énumérations sont générés depuis Prisma ; des types de réponse ou de calcul propres aux modules existent dans les fichiers `*.types.ts`.

## 9. Traçabilité

| Élément documenté | Fichier ou répertoire source | Preuve observée |
|---|---|---|
| Dépendances et scripts | `apps/backend/package.json` | NestJS, Prisma, validation, tests et commandes |
| Bootstrap | `apps/backend/src/main.ts` | Express, middlewares, CORS, préfixe et pipe global |
| Composition | `apps/backend/src/app.module.ts` | Configuration, throttlers, modules et garde global |
| Modules fonctionnels | `apps/backend/src/modules/` | Huit modules présents |
| Modules globaux | `apps/backend/src/common/audit/audit-log.module.ts`, `apps/backend/src/common/prisma/prisma.module.ts` | Décorateur `@Global()` et exports |
| Contrôleurs | Fichiers `*.controller.ts` sous `apps/backend/src/modules/` | Routes, DTO, rôles et délégation |
| Services | Fichiers `*.service.ts` sous `apps/backend/src/modules/` | Traitements et dépendances injectées |
| DTO | Répertoires `dto/` sous `apps/backend/src/modules/` | Classes et décorateurs de validation |
| JWT | `apps/backend/src/common/security/jwt.util.ts` | Signature et vérification HS256 |
| Hachage | `apps/backend/src/common/security/password.util.ts` | scrypt, sel et comparaison constante |
| Garde JWT | `apps/backend/src/modules/auth/guards/jwt-auth.guard.ts` | Bearer, route publique et utilisateur courant |
| Garde de rôles | `apps/backend/src/modules/auth/guards/roles.guard.ts` | Comparaison avec `accessRole` |
| Limitation | `apps/backend/src/common/security/app-throttler.guard.ts` | Compteurs, en-têtes et réponse de blocage |
| Décorateurs | `apps/backend/src/modules/auth/decorators/` | `Public`, `Roles` et `CurrentUser` |
| Audit | `apps/backend/src/common/audit/audit-log.service.ts` | Événement JSON par le logger NestJS |
| Prisma | `apps/backend/src/common/prisma/` | Module global et client |
| Modèle de données | `apps/backend/prisma/schema.prisma` | Modèles et datasource PostgreSQL |
| Configuration Prisma | `apps/backend/prisma.config.ts` | Schéma, migrations, seed et URL |
| Métriques mensuelles | `apps/backend/src/modules/attendance/attendance-monthly-metrics.service.ts` | Cycle de vie et intervalle |
| Export | `apps/backend/src/modules/attendance/exports/` | Construction CSV et PDF |
| Tests | `apps/backend/test/` | Scénarios e2e et validation d'environnement |
| Configuration TypeScript | `apps/backend/tsconfig.json`, `apps/backend/tsconfig.build.json` | Compilation et exclusions |
| Configuration Nest CLI | `apps/backend/nest-cli.json` | Source et nettoyage de sortie |
| Image backend | `docker/backend.Dockerfile` | Build, Chromium, migrations et démarrage |
| Architecture générale | `documentation/06-Developer-Guide/02-Architecture-generale.md` | Position du backend dans le système |
| Stack | `documentation/06-Developer-Guide/04-Stack-technologique.md` | Versions et technologies backend |

## 10. Observations

- Le backend possède huit modules fonctionnels sous `src/modules/`.
- Tous les contrôleurs sont regroupés avec leur module fonctionnel ; aucun répertoire global `controllers/` n'est présent.
- Les services de domaine se trouvent avec leurs contrôleurs ; les services transverses se trouvent sous `src/common/`.
- `HealthModule` ne déclare pas de service.
- `PrismaModule` et `AuditLogModule` sont globaux.
- L'authentification JWT est implémentée avec les API cryptographiques Node.js et un garde NestJS personnalisé.
- Aucun package Passport ni stratégie Passport n'est déclaré.
- Trois gardes globaux sont enregistrés par `APP_GUARD`.
- Le backend utilise un pipe global et des pipes intégrés ciblés, sans pipe personnalisé.
- Helmet et body-parser sont configurés dans le bootstrap au moyen de `app.use()`.
- Aucun filtre d'exception ni intercepteur personnalisé n'est présent.
- Les DTO représentent les entrées HTTP ; aucun répertoire `entities/` n'est présent.
- L'accès relationnel des services passe par `PrismaService`.
- Les actions d'audit sont écrites dans les journaux et ne correspondent pas à un modèle Prisma dédié.
