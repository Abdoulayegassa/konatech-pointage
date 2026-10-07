# Architecture API REST

| Métadonnée | Valeur |
|---|---|
| Document ID | SAR-API-001 |
| Titre | Architecture API REST |
| Version | 1.0 |
| Statut | Validé |
| Classification | Interne |
| Référence SAPDD | API Backend |
| Date de génération | 29 juillet 2026 |

## 1. Présentation

### 1.1 Objectif

L'API REST de Konatech Pointage expose les opérations d'authentification, de gestion des employés et plannings, de pointage, de calendrier RH, de sanctions, de dashboard et d'export. Elle constitue la couche d'accès serveur entre le frontend Next.js et PostgreSQL.

### 1.2 Architecture générale

L'implémentation suit l'architecture modulaire NestJS :

- les modules assemblent les dépendances ;
- les contrôleurs définissent les routes HTTP ;
- les DTO portent la validation des entrées ;
- les services contiennent la logique métier ;
- PrismaService assure l'accès aux données ;
- des guards globaux assurent débit, authentification et rôles.

### 1.3 Responsabilités

L'API :

- authentifie les sessions standard et de borne ;
- contrôle les rôles `ADMIN` et `EMPLOYEE` ;
- valide et transforme les entrées ;
- orchestre les services métier ;
- lit et écrit les données Prisma ;
- sérialise les valeurs retournées ;
- génère les exports CSV et PDF ;
- traduit certaines erreurs métier et Prisma en exceptions HTTP ;
- expose un endpoint de santé public.

### 1.4 Périmètre

Huit contrôleurs et 38 handlers HTTP sont présents. Aucun contrôleur générique, passerelle GraphQL, WebSocket ou API RPC n'est trouvé.

Implémentation principale :

- `apps/backend/src/main.ts`
- `apps/backend/src/app.module.ts`
- `apps/backend/src/modules/**/*.controller.ts`
- `apps/backend/src/modules/**/*.service.ts`

## 2. Architecture globale

### 2.1 NestJS

L'application est créée par `NestFactory.create(AppModule)`. Le body parser automatique est désactivé puis remplacé par des middlewares `body-parser` configurés. Le bootstrap active Helmet, CORS, un préfixe global et un pipe global.

### 2.2 Modules

`AppModule` importe :

- `AuditLogModule` ;
- `PrismaModule` ;
- `AuthModule` ;
- `HealthModule` ;
- `DashboardModule` ;
- `EmployeesModule` ;
- `CalendarModule` ;
- `AttendanceModule` ;
- `SanctionsModule` ;
- `SchedulesModule`.

### 2.3 Controllers

Chaque domaine HTTP possède un contrôleur. Les contrôleurs injectent un ou plusieurs services et, pour plusieurs commandes administratives, `AuditLogService`.

### 2.4 Services

La logique métier réside dans les services. Attendance comporte plusieurs services spécialisés : sécurité, stockage photo, métriques mensuelles, point d'entrée et exports.

### 2.5 Prisma

`PrismaModule` est global. `PrismaService` étend `PrismaClient` et est injecté directement dans les services métier. Aucune couche Repository séparée n'est présente.

### 2.6 Auth

`AuthModule` expose AuthService et enregistre globalement `JwtAuthGuard` et `RolesGuard`. Les routes publiques sont explicitement décorées avec `@Public()`.

### 2.7 Middlewares

Le bootstrap applique :

- `helmet()` ;
- `bodyParser.json()` avec `JSON_BODY_LIMIT` ;
- `bodyParser.urlencoded()` avec la même limite ;
- CORS limité à `FRONTEND_URL`, avec credentials.

La valeur `TRUST_PROXY_HOPS` configure Express `trust proxy` lorsqu'elle est positive.

```text
Client HTTP / Frontend Next.js
              |
              v
  Helmet + Body Parser + CORS
              |
              v
       AppThrottlerGuard
              |
              v
         JwtAuthGuard
              |
              v
          RolesGuard
              |
              v
       ValidationPipe
              |
              v
         Controller
              |
              v
           Service
              |
              v
       PrismaService
              |
              v
         PostgreSQL
```

Fichiers concernés :

- `apps/backend/src/main.ts`
- `apps/backend/src/app.module.ts`
- `apps/backend/src/modules/auth/auth.module.ts`
- `apps/backend/src/common/prisma/prisma.module.ts`

## 3. Organisation des fichiers

### 3.1 Arborescence API

```text
apps/backend/src/
├── main.ts
├── app.module.ts
├── common/
│   ├── audit/
│   │   ├── audit-log.module.ts
│   │   └── audit-log.service.ts
│   ├── prisma/
│   │   ├── prisma.module.ts
│   │   ├── prisma.service.ts
│   │   └── selects.ts
│   ├── security/
│   │   ├── app-throttler.guard.ts
│   │   ├── jwt.util.ts
│   │   └── password.util.ts
│   ├── time/
│   │   └── app-clock.service.ts
│   ├── utils/
│   │   ├── attendance-checkout.util.ts
│   │   ├── attendance-date.util.ts
│   │   └── attendance-schedule-snapshot.util.ts
│   └── validation/
│       └── pin-code.validation.ts
└── modules/
    ├── auth/
    │   ├── constants/
    │   ├── decorators/
    │   ├── dto/
    │   ├── guards/
    │   ├── interfaces/
    │   ├── auth.controller.ts
    │   ├── auth.module.ts
    │   └── auth.service.ts
    ├── health/
    │   ├── health.controller.ts
    │   └── health.module.ts
    ├── dashboard/
    │   ├── dashboard.controller.ts
    │   ├── dashboard.module.ts
    │   ├── dashboard.service.ts
    │   └── types.ts
    ├── employees/
    │   ├── dto/
    │   ├── employees.controller.ts
    │   ├── employees.module.ts
    │   └── employees.service.ts
    ├── schedules/
    │   ├── dto/
    │   ├── schedules.controller.ts
    │   ├── schedules.module.ts
    │   └── schedules.service.ts
    ├── attendance/
    │   ├── dto/
    │   ├── exports/
    │   ├── attendance.controller.ts
    │   ├── attendance.module.ts
    │   └── *.service.ts
    ├── calendar/
    │   ├── dto/
    │   ├── calendar.controller.ts
    │   ├── calendar.module.ts
    │   └── calendar.service.ts
    └── sanctions/
        ├── dto/
        ├── sanctions.controller.ts
        ├── sanctions.module.ts
        └── sanctions.service.ts
```

### 3.2 Rôle des dossiers

| Dossier | Rôle |
|---|---|
| `common/audit` | Journalisation structurée des commandes administratives |
| `common/prisma` | Client, module global et projections |
| `common/security` | JWT, mots de passe/PIN et limitation de débit |
| `common/time` | Horloge injectable |
| `common/utils` | Calculs partagés du domaine Attendance |
| `common/validation` | Règles partagées de PIN |
| `modules/*/dto` | Contrats d'entrée HTTP |
| `modules/*/*.controller.ts` | Adaptateurs HTTP |
| `modules/*/*.service.ts` | Logique métier |
| `attendance/exports` | Assemblage et rendu des exports |

## 4. Convention des routes

### 4.1 Préfixe global et versionnement

`app.setGlobalPrefix('api/v1')` préfixe toutes les routes. La version est intégrée dans le chemin ; aucun mécanisme `enableVersioning()` de NestJS n'est utilisé.

### 4.2 Conventions constatées

| Élément | Convention |
|---|---|
| Préfixe | `/api/v1` |
| Ressources | noms pluriels ou noms de domaine en minuscules |
| Identifiants | paramètres `:id` ou `:attendanceId` |
| Utilisateur courant | segment `/me` |
| Actions d'état | sous-routes `/status`, `/role`, `/department`, `/schedule` |
| Filtres temporels | query `month` |
| Création | POST |
| Lecture | GET |
| Modification partielle | PATCH |
| Suppression | DELETE |

### 4.3 Ressources racines

| Contrôleur | Base complète |
|---|---|
| Auth | `/api/v1/auth` |
| Health | `/api/v1/health` |
| Dashboard | `/api/v1/dashboard` |
| Employees | `/api/v1/employees` |
| Schedules | `/api/v1/schedules` |
| Attendance | `/api/v1/attendance` |
| Calendar | `/api/v1/calendar` |
| Sanctions | `/api/v1/sanctions` |

### 4.4 Particularités REST

Les modifications utilisent PATCH. Calendar expose une suppression physique. Attendance utilise des routes verbales `check-in` et `check-out`. Les exports sont une sous-ressource `exports/monthly`.

## 5. Contrôleurs

### 5.1 Vue récapitulative

| Contrôleur | Responsabilité | Dépendances |
|---|---|---|
| `AuthController` | Connexion et utilisateur courant | AuthService |
| `HealthController` | Santé du service | Aucune |
| `DashboardController` | Synthèse administrative | DashboardService |
| `EmployeesController` | Gestion des employés | EmployeesService, AuditLogService |
| `SchedulesController` | Gestion des plannings | SchedulesService, AuditLogService |
| `AttendanceController` | Pointages, historique, exports | Six services |
| `CalendarController` | Calendrier RH | CalendarService, AuditLogService |
| `SanctionsController` | Règles et calculs de sanctions | SanctionsService |

### 5.2 AuthController

| HTTP | Route | Accès | Service |
|---|---|---|---|
| POST | `/auth/login` | Public | `login()` |
| POST | `/auth/attendance-entry/login` | Public | `loginForAttendanceEntry()` |
| GET | `/auth/me` | Authentifié | Aucun appel ; retourne `@CurrentUser()` |

### 5.3 HealthController

| HTTP | Route | Accès | Réponse |
|---|---|---|---|
| GET | `/health` | Public | status, service, timestamp ISO |

### 5.4 DashboardController

| HTTP | Route | Accès | Service |
|---|---|---|---|
| GET | `/dashboard/overview` | ADMIN | `DashboardService.getOverview()` |

### 5.5 EmployeesController

| HTTP | Route | Entrée | Service |
|---|---|---|---|
| GET | `/employees` | Aucune | `findAll()` |
| GET | `/employees/:id` | UUID pipe | `findOne()` |
| POST | `/employees` | CreateEmployeeDto | `create()` |
| PATCH | `/employees/:id` | UUID, UpdateEmployeeDto | `update()` |
| PATCH | `/employees/:id/status` | UpdateEmployeeStatusDto | `updateStatus()` |
| PATCH | `/employees/:id/role` | AssignEmployeeRoleDto | `assignRole()` |
| PATCH | `/employees/:id/department` | AssignEmployeeDepartmentDto | `assignDepartment()` |
| PATCH | `/employees/:id/schedule` | AssignEmployeeScheduleDto | `assignSchedule()` |

Toutes ces routes exigent ADMIN. Les commandes sont consignées par AuditLogService.

### 5.6 SchedulesController

| HTTP | Route | Entrée | Service |
|---|---|---|---|
| GET | `/schedules` | Aucune | `findAll()` |
| GET | `/schedules/:id` | UUID pipe | `findOne()` |
| POST | `/schedules` | CreateScheduleDto | `create()` |
| PATCH | `/schedules/:id` | UUID, UpdateScheduleDto | `update()` |
| PATCH | `/schedules/:id/status` | UpdateScheduleStatusDto | `updateStatus()` |

Toutes ces routes exigent ADMIN. Les trois commandes sont auditées.

### 5.7 AttendanceController

| HTTP | Route | Accès | Entrée / service |
|---|---|---|---|
| GET | `/attendance/entry` | Public | AttendanceEntryService, redirection 302 |
| GET | `/attendance/summary` | ADMIN | `getTodaySummary()` |
| GET | `/attendance/history` | ADMIN | AttendanceHistoryQueryDto |
| GET | `/attendance/exports/monthly` | ADMIN | MonthlyAttendanceExportQueryDto, exporteurs |
| GET | `/attendance/me/today` | EMPLOYEE | utilisateur courant |
| GET | `/attendance/me/security-policy` | EMPLOYEE | politique de sécurité |
| GET | `/attendance/me/history` | EMPLOYEE | mois et utilisateur courant |
| POST | `/attendance/check-in` | ADMIN | CheckInDto |
| POST | `/attendance/check-out` | ADMIN | CheckOutDto |
| POST | `/attendance/me/check-in` | EMPLOYEE | SelfCheckInDto |
| POST | `/attendance/me/check-out` | EMPLOYEE | SelfCheckOutDto |

Le contrôleur injecte AttendanceEntryService, AttendanceService, trois services d'export et AuditLogService.

### 5.8 CalendarController

| HTTP | Route | Entrée | Service |
|---|---|---|---|
| GET | `/calendar/month` | CalendarMonthQueryDto | `getMonthOverview()` |
| GET | `/calendar/holidays` | CalendarMonthQueryDto | `findMonthEntries()` |
| POST | `/calendar/holidays` | CreateCalendarEntryDto | `create()` |
| PATCH | `/calendar/holidays/:id` | UUID, UpdateCalendarEntryDto | `update()` |
| DELETE | `/calendar/holidays/:id` | UUID | `remove()` |

Toutes ces routes exigent ADMIN. Les commandes sont auditées.

### 5.9 SanctionsController

| HTTP | Route | Entrée | Service |
|---|---|---|---|
| GET | `/sanctions/rules` | Aucune | `getRules()` |
| PATCH | `/sanctions/rules/:id` | UUID, UpdateSanctionRuleDto | `updateRule()` |
| GET | `/sanctions/monthly` | MonthlySanctionsQueryDto | `getMonthlySanctions()` |
| GET | `/sanctions/attendance/:attendanceId` | chaîne non pipée | `getAttendanceSanction()` |

Toutes ces routes exigent ADMIN.

Fichiers concernés :

- les huit fichiers `apps/backend/src/modules/*/*.controller.ts`

## 6. DTO

### 6.1 Vue exhaustive

Le dépôt contient 23 fichiers DTO. `CheckInSecurityProofDto` et `CheckInSecurityDto` sont deux classes dans le même fichier, et `UpdateScheduleDto` dérive d'un autre DTO.

### 6.2 DTO Auth

| DTO | Champs et validation | Usage |
|---|---|---|
| `LoginDto` | email `@IsEmail`; password String, longueur min 8 | Login standard |
| `AttendanceEntryLoginDto` | pinCode String, exactement quatre chiffres | Login borne |

### 6.3 DTO Attendance

| DTO | Champs et validation | Usage |
|---|---|---|
| `AttendanceHistoryQueryDto` | month facultatif, regex `YYYY-MM` | Historiques admin et employé |
| `CheckInSecurityProofDto` | latitude -90..90, longitude -180..180, précision 0..50000, data URL image max 1 000 000 | Preuve imbriquée |
| `CheckInSecurityDto` | security facultatif, `ValidateNested`, `Type` | Base sécurité |
| `CheckInDto` | employeeId UUID, occurredAt date ISO facultative, notes max 200, sécurité héritée | Entrée admin |
| `CheckOutDto` | employeeId UUID, occurredAt date ISO, sécurité héritée | Sortie admin |
| `SelfCheckInDto` | occurredAt date ISO, notes max 200, sécurité héritée | Entrée employé |
| `SelfCheckOutDto` | occurredAt date ISO, notes max 200, sécurité héritée | Sortie employé |
| `MonthlyAttendanceExportQueryDto` | month 1..12, year 2000..2100, format csv/pdf, employeeId UUID | Export |

La transformation de `verificationPhotoDataUrl` convertit une chaîne vide en `undefined`. Les coordonnées et la précision utilisent `@Type(() => Number)`.

### 6.4 DTO Calendar

| DTO | Champs et validation | Usage |
|---|---|---|
| `CalendarMonthQueryDto` | month facultatif, String, `YYYY-MM` | Deux lectures mensuelles |
| `CreateCalendarEntryDto` | name max 120, date ISO, description max 500, type parmi deux valeurs | Création |
| `UpdateCalendarEntryDto` | mêmes champs facultatifs | Modification |

Les types acceptés par les DTO de commande sont `PUBLIC_HOLIDAY` et `COMPANY_HOLIDAY`.

### 6.5 DTO Employees

| DTO | Champs et validation | Usage |
|---|---|---|
| `CreateEmployeeDto` | PIN réglementé, noms max 80, email, rôle max 80, AccessRole enum, password 8..128, département max 80, booléen, schedule UUID | Création |
| `UpdateEmployeeDto` | version facultative des champs de création ; valeurs vides transformées en null pour PIN, département, planning | Modification |
| `UpdateEmployeeStatusDto` | `isActive` booléen | Statut |
| `AssignEmployeeRoleDto` | rôle String max 80 | Intitulé métier |
| `AssignEmployeeDepartmentDto` | chaîne vide vers null, String max 80 | Département |
| `AssignEmployeeScheduleDto` | chaîne vide vers null, UUID si non null | Planning |

La validation de PIN réutilise `EMPLOYEE_PIN_CODE_PATTERN`, `DISALLOWED_EMPLOYEE_PIN_CODES` et `INVALID_EMPLOYEE_PIN_MESSAGE`.

### 6.6 DTO Schedules

| DTO | Champs et validation | Usage |
|---|---|---|
| `CreateScheduleDto` | nom max 80, heures `HH:mm`, marge 0..180, actif booléen, tableau non vide et unique de jours autorisés | Création |
| `UpdateScheduleDto` | `PartialType(CreateScheduleDto)` | Modification partielle |
| `UpdateScheduleStatusDto` | `isActive` booléen | Statut |

Les jours acceptés vont de `MONDAY` à `SUNDAY`.

### 6.7 DTO Sanctions

| DTO | Champs et validation | Usage |
|---|---|---|
| `MonthlySanctionsQueryDto` | month facultatif `YYYY-MM`, employeeId facultatif String | Synthèse mensuelle |
| `UpdateSanctionRuleDto` | actif booléen ; nom/description String ; seuils, tolérance, montant et priorité entiers min 0 | Modification règle |

`MonthlySanctionsQueryDto.employeeId` n'utilise pas `@IsUUID()`. Le paramètre `attendanceId` du contrôleur n'utilise pas ParseUUIDPipe.

Fichiers concernés :

- `apps/backend/src/modules/*/dto/*.dto.ts`
- `apps/backend/src/common/validation/pin-code.validation.ts`

## 7. Validation

### 7.1 ValidationPipe global

Le bootstrap configure :

```text
whitelist: true
forbidNonWhitelisted: true
transform: true
enableImplicitConversion: true
```

Les propriétés inconnues provoquent donc une erreur au lieu d'être uniquement retirées. Les paramètres de query peuvent être convertis implicitement vers les types attendus.

### 7.2 class-validator

Les DTO utilisent notamment :

- `IsString`, `IsEmail`, `IsBoolean`, `IsInt`, `IsNumber` ;
- `IsUUID`, `IsDateString`, `IsEnum`, `IsIn` ;
- `IsOptional`, `ValidateIf`, `ValidateNested` ;
- `Min`, `Max`, `MinLength`, `MaxLength` ;
- `Matches`, `IsNotIn` ;
- `IsArray`, `ArrayMinSize`, `ArrayUnique`.

### 7.3 class-transformer

`@Type()` convertit les nombres et instancie le DTO imbriqué de sécurité. `@Transform()` normalise les chaînes vides en `null` ou `undefined`.

### 7.4 Pipes de paramètres

`ParseUUIDPipe` est appliqué aux identifiants Employee, Schedule, CalendarEntry et SanctionRule. Il n'est pas appliqué à `SanctionsController.getAttendanceSanction()`.

### 7.5 Validation personnalisée

La validation du PIN centralise :

- le motif autorisé ;
- la liste de codes interdits ;
- le message d'erreur.

Les services ajoutent des validations métier : chronologie des pointages, horaires de planning, chevauchement des règles, doublons calendrier, existence des relations et sécurité GPS/photo.

## 8. Gestion des requêtes

### 8.1 Cycle

1. le client adresse une route sous `/api/v1` ;
2. les middlewares HTTP traitent sécurité, corps et CORS ;
3. les guards appliquent débit, JWT et rôle ;
4. NestJS résout les paramètres, query et body ;
5. ValidationPipe transforme et valide le DTO ;
6. le contrôleur appelle le service ;
7. le service applique les règles métier ;
8. PrismaService dialogue avec PostgreSQL ;
9. la valeur ou l'exception remonte ;
10. NestJS sérialise la réponse.

```text
Client
  |
  v
Middlewares Express
  |
  v
Guards globaux
  |
  v
Controller paramètres @Body/@Query/@Param
  |
  v
ValidationPipe -> DTO transformé
  |
  v
Service métier
  |
  v
PrismaService
  |
  v
PostgreSQL
  |
  v
Objet Prisma / résultat métier
  |
  v
Sérialisation NestJS -> Réponse HTTP
```

### 8.2 Commandes auditées

Les contrôleurs Employees, Schedules, Calendar et certaines commandes Attendance appellent AuditLogService après réussite du service. Cette journalisation ne transforme pas la réponse.

### 8.3 Fichiers

- `apps/backend/src/main.ts`
- `apps/backend/src/modules/**/*.controller.ts`
- `apps/backend/src/modules/**/*.service.ts`
- `apps/backend/src/common/prisma/prisma.service.ts`

## 9. Réponses HTTP

### 9.1 Codes de succès

| Situation | Code observé ou défaut NestJS |
|---|---|
| GET | 200 |
| PATCH | 200 |
| DELETE Calendar | 200 avec l'entrée supprimée |
| POST | 201 par défaut NestJS |
| `GET /attendance/entry` | 302 |
| Export | 200 avec contenu fichier |

Aucun décorateur `@HttpCode()` personnalisé n'est présent dans les contrôleurs.

### 9.2 Format

Les réponses ordinaires sont des objets ou tableaux sérialisés en JSON par NestJS. Les dates Prisma sont sérialisées en chaînes ISO JSON.

### 9.3 Auth

La connexion retourne :

- `accessToken` ;
- `tokenType: Bearer` ;
- `expiresIn` ;
- `user` sans hash de mot de passe ni secrets PIN.

### 9.4 Health

Health retourne un objet JSON avec `status`, `service` et `timestamp`.

### 9.5 Export

L'export définit `Content-Type`, `Content-Disposition` et `Cache-Control: no-store`. Un PDF Buffer est enveloppé dans `StreamableFile`; le CSV est une chaîne UTF-8.

### 9.6 Redirection

`AttendanceController.getFixedEntryPoint()` utilise `@Redirect(undefined, 302)` et retourne un objet contenant l'URL calculée.

### 9.7 Sérialisation

Aucun serializer interceptor personnalisé n'est présent. La réduction des champs sensibles repose sur les projections Prisma et la déstructuration explicite dans AuthService et EmployeesService.

## 10. Gestion des erreurs

### 10.1 Exception Filters

Aucun filtre d'exception personnalisé n'est trouvé. Le gestionnaire d'exceptions standard de NestJS produit les réponses.

### 10.2 Exceptions utilisées

| Exception | Statut | Cas constatés |
|---|---:|---|
| `BadRequestException` | 400 | dates, horaires, PIN, sécurité, règles métier |
| `UnauthorizedException` | 401 | credentials, bearer et JWT |
| `ForbiddenException` | 403 | rôle insuffisant |
| `NotFoundException` | 404 | employé, planning, pointage, calendrier, règle |
| `ConflictException` | 409 | doublons, état incompatible, concurrence |
| `HttpException` | 429 | limitation PIN |
| `InternalServerErrorException` | 500 | configuration/rendu interne |
| `BadGatewayException` | 502 | stockage photo externe |
| `GatewayTimeoutException` | 504 | expiration du stockage photo |

### 10.3 Erreurs Prisma

EmployeesService et SchedulesService traduisent `P2002` en ConflictException. EmployeesService traduit `P2003` en NotFoundException. CalendarService possède aussi une branche `P2002`. Attendance détecte `P2002` dans la gestion de concurrence journalière.

Les autres erreurs Prisma non reconnues sont relancées.

### 10.4 Erreurs de validation

ValidationPipe produit les réponses 400 pour DTO invalides, propriétés non autorisées et échecs de ParseUUIDPipe. Plusieurs validateurs définissent un message métier explicite ; les autres utilisent le message de class-validator.

### 10.5 Erreurs métier

Les services lèvent directement des exceptions NestJS. Attendance possède aussi des classes d'exception de sécurité spécialisées dans `attendance-security.exception.ts`, utilisées pour représenter certains refus du flux de pointage.

Fichiers concernés :

- services sous `apps/backend/src/modules/`
- `apps/backend/src/modules/attendance/attendance-security.exception.ts`
- `apps/backend/src/common/security/app-throttler.guard.ts`

## 11. Middleware / Guards / Pipes / Interceptors

### 11.1 Tableau récapitulatif

| Type | Élément | Portée |
|---|---|---|
| Middleware | Helmet | Globale |
| Middleware | JSON body parser | Globale |
| Middleware | URL-encoded body parser | Globale |
| Configuration HTTP | CORS | Globale |
| Guard | AppThrottlerGuard | Global |
| Guard | JwtAuthGuard | Global |
| Guard | RolesGuard | Global |
| Pipe | ValidationPipe | Global |
| Pipe | ParseUUIDPipe | Paramètres sélectionnés |
| Interceptor | Personnalisé | Non trouvé |
| Filter | Personnalisé | Non trouvé |

### 11.2 AppThrottlerGuard

Étend `ThrottlerGuard`, maintient les en-têtes de limite et personnalise le statut/message des limites de login PIN. Les configurations comprennent une limite générale, une limite login et deux limites PIN.

### 11.3 JwtAuthGuard

Ignore les routes `@Public`, exige un bearer token, valide celui-ci via AuthService et affecte l'employé actif à `request.user`.

### 11.4 RolesGuard

Lit `@Roles` avec Reflector et compare `request.user.accessRole`.

### 11.5 ValidationPipe

Transforme et valide body, query et paramètres décorés par DTO. La whitelist est stricte.

### 11.6 ParseUUIDPipe

Valide plusieurs paramètres d'identifiant directement au niveau des signatures de contrôleur.

### 11.7 Interceptors et middleware NestJS

Aucun interceptor personnalisé et aucune classe middleware NestJS implémentant `NestMiddleware` ne sont trouvés. Les middlewares sont enregistrés directement sur l'application Express dans `main.ts`.

## 12. Documentation API

### 12.1 Swagger et OpenAPI

Swagger/OpenAPI n'est pas configuré. Les éléments suivants ne sont pas trouvés :

- dépendance `@nestjs/swagger` ;
- `SwaggerModule` ;
- `DocumentBuilder` ;
- décorateurs `@Api*` ;
- fichier OpenAPI généré ;
- endpoint Swagger UI.

### 12.2 Documentation automatique

Aucune génération automatique de documentation d'API n'est présente. Les contrats exécutables sont constitués des décorateurs de contrôleur, DTO et types TypeScript.

## 13. Dépendances internes

### 13.1 Chaîne principale

```text
Frontend Next.js / Client HTTP
              |
              v
       Controllers NestJS
              |
              v
         Services métier
       /       |        \
      v        v         v
 Services   AuditLog   Services inter-modules
 communs
              |
              v
        PrismaService
              |
              v
         PostgreSQL
```

### 13.2 Dépendances par module

| Module | Dépendances internes notables |
|---|---|
| Auth | Prisma, Config, sécurité JWT/password |
| Employees | Prisma, audit |
| Schedules | Prisma, audit |
| Attendance | Prisma, CalendarModule, SanctionsModule, audit, stockage photo |
| Calendar | Prisma, audit |
| Dashboard | Prisma, CalendarModule |
| Sanctions | Prisma, horloge |
| Health | Aucune dépendance métier |

### 13.3 Client frontend

Le frontend utilise des fonctions serveur et routes handler proxy. Les proxies récupèrent le token dans un cookie HTTP-only et ajoutent l'en-tête Authorization vers le backend.

### 13.4 Repository

Aucun repository intermédiaire n'est présent. Les services injectent PrismaService.

## 14. Traçabilité du code

| Élément | Fichiers principaux |
|---|---|
| Bootstrap HTTP | `apps/backend/src/main.ts` |
| Assemblage global | `apps/backend/src/app.module.ts` |
| Auth controller/service | `apps/backend/src/modules/auth/` |
| Health | `apps/backend/src/modules/health/` |
| Dashboard | `apps/backend/src/modules/dashboard/` |
| Employees | `apps/backend/src/modules/employees/` |
| Schedules | `apps/backend/src/modules/schedules/` |
| Attendance | `apps/backend/src/modules/attendance/` |
| Calendar | `apps/backend/src/modules/calendar/` |
| Sanctions | `apps/backend/src/modules/sanctions/` |
| Guards Auth | `apps/backend/src/modules/auth/guards/` |
| Décorateurs Auth | `apps/backend/src/modules/auth/decorators/` |
| Limitation | `apps/backend/src/common/security/app-throttler.guard.ts` |
| Validation PIN | `apps/backend/src/common/validation/pin-code.validation.ts` |
| Prisma | `apps/backend/src/common/prisma/` |
| Audit | `apps/backend/src/common/audit/` |
| DTO | `apps/backend/src/modules/*/dto/` |

### 14.1 Contrôleurs

- `apps/backend/src/modules/auth/auth.controller.ts`
- `apps/backend/src/modules/health/health.controller.ts`
- `apps/backend/src/modules/dashboard/dashboard.controller.ts`
- `apps/backend/src/modules/employees/employees.controller.ts`
- `apps/backend/src/modules/schedules/schedules.controller.ts`
- `apps/backend/src/modules/attendance/attendance.controller.ts`
- `apps/backend/src/modules/calendar/calendar.controller.ts`
- `apps/backend/src/modules/sanctions/sanctions.controller.ts`

### 14.2 Tests

Les scénarios end-to-end sont principalement dans `apps/backend/test/app.e2e-spec.ts`, complétés par des fichiers dédiés au calendrier, aux jours non ouvrés et au rendu PDF.

## 15. Observations techniques

Cette section consigne uniquement les constats du code.

### 15.1 Versionnement par préfixe

La version `v1` est une partie du préfixe global. L'API n'utilise pas le module de versionnement NestJS.

### 15.2 Absence Swagger

Aucun mécanisme Swagger ou OpenAPI n'est présent.

### 15.3 Absence de filtre et interceptor personnalisés

La gestion des exceptions et la sérialisation utilisent les mécanismes standard de NestJS.

### 15.4 Validation globale stricte

Les propriétés non déclarées par les DTO sont interdites, et pas uniquement supprimées.

### 15.5 Validation UUID non uniforme

La majorité des paramètres d'identifiant utilisent ParseUUIDPipe. `attendanceId` dans SanctionsController et `employeeId` dans MonthlySanctionsQueryDto sont validés comme chaînes seulement.

### 15.6 Deux regex de mois dupliquées

`AttendanceHistoryQueryDto`, `CalendarMonthQueryDto` et `MonthlySanctionsQueryDto` déclarent séparément la même forme `YYYY-MM` et le même message anglais.

### 15.7 Types de calendrier restreints par DTO

L'enum Prisma contient quatre valeurs, tandis que les DTO de création et modification acceptent uniquement `PUBLIC_HOLIDAY` et `COMPANY_HOLIDAY`.

### 15.8 Contrôleur Attendance agrégé

AttendanceController réunit redirection publique, vues admin, vues personnelles, commandes de pointage et export dans un même contrôleur.

### 15.9 Audit non uniforme

Les commandes Employees, Schedules et Calendar et plusieurs actions Attendance appellent AuditLogService. La modification des règles de sanction ne l'appelle pas dans SanctionsController.

### 15.10 Codes de création par défaut

Aucun `@HttpCode` n'est déclaré ; les POST utilisent le comportement 201 de NestJS même pour les deux endpoints de login et les commandes de pointage.

### 15.11 Suppression limitée

Seul CalendarController expose DELETE. Employees et Schedules utilisent un statut d'activation.

### 15.12 Réponses sans enveloppe commune

Les contrôleurs retournent directement objets, tableaux, chaînes ou fichiers. Aucun type d'enveloppe `{data, meta}` global n'est implémenté.

### 15.13 Pagination absente

Aucun DTO de pagination générique n'est présent. Les historiques utilisent un filtre de mois et les listes principales retournent leur périmètre complet.

### 15.14 Couche Repository absente

Les services métier utilisent PrismaService directement.

### 15.15 Middlewares Express directs

Helmet et body-parser sont enregistrés dans `main.ts`, sans classe middleware NestJS.

### 15.16 Deux modes de session frontend

Les routes proxy Next.js distinguent la session standard et la session de borne. Cette distinction n'ajoute pas un type de JWT backend : AuthService signe les deux flux avec le même utilitaire et des durées différentes.

### 15.17 API absentes

Les capacités suivantes ne sont pas trouvées :

- GraphQL ;
- WebSocket ;
- Swagger/OpenAPI ;
- versionnement par header ou media type ;
- pagination générique ;
- tri générique ;
- filtre d'exception personnalisé ;
- interceptor de réponse ;
- cache HTTP applicatif ;
- endpoint de métriques techniques.

### 15.18 Documentation locale

Aucun document d'API généré ou README propre aux routes backend n'est présent. Les contrôleurs, DTO et tests constituent la trace opérationnelle.
