# Structure du Backend

| Métadonnée | Valeur |
| --- | --- |
| Document ID | DG-004 |
| Titre | Structure du Backend |
| Version | 1.0 |
| Statut | Validé |
| Classification | Interne |
| Référence | Developer Guide |
| Date de génération | 30 juillet 2026 |

# 1. Présentation

## 1.1 Objectif

Ce chapitre décrit l'organisation du backend de Konatech Pointage telle qu'elle est implémentée dans `apps/backend`. Il couvre la structure NestJS, le démarrage de l'application, les modules, les contrôleurs, les services, les objets de transfert de données, les guards, les décorateurs, la validation, Prisma et la configuration.

La description porte exclusivement sur les mécanismes présents dans le dépôt à la date de génération.

## 1.2 Rôle du backend

Le backend expose l'API HTTP de la plateforme. Il assure les responsabilités observées suivantes :

- authentification par adresse électronique et mot de passe ;
- authentification courte du terminal de pointage par code PIN ;
- émission et validation des jetons JWT ;
- contrôle des rôles `ADMIN` et `EMPLOYEE` ;
- gestion des employés et de leur affectation à un planning ;
- gestion des plannings ;
- enregistrement des entrées et sorties ;
- calcul des retards, absences, départs anticipés et heures supplémentaires ;
- application conditionnelle des contrôles de sécurité de pointage ;
- gestion du calendrier RH ;
- calcul et configuration des sanctions ;
- agrégation des indicateurs du tableau de bord ;
- génération d'exports mensuels CSV et PDF ;
- accès aux données PostgreSQL par Prisma ;
- exposition d'un endpoint de santé.

Le backend est une application NestJS 11 écrite en TypeScript. Il utilise Prisma 6 et PostgreSQL.

**Fichiers de référence :**

- `apps/backend/package.json`
- `apps/backend/src/main.ts`
- `apps/backend/src/app.module.ts`
- `apps/backend/prisma/schema.prisma`

# 2. Architecture générale

## 2.1 Structure NestJS

Le code applicatif est organisé autour de :

- `main.ts`, point d'entrée et bootstrap HTTP ;
- `AppModule`, module racine ;
- huit modules fonctionnels sous `src/modules` ;
- deux modules globaux communs sous `src/common` ;
- des contrôleurs responsables de l'interface HTTP ;
- des services contenant les traitements métier et l'accès aux données ;
- des DTO validant les corps et paramètres de requête ;
- des guards globaux pour le débit, l'authentification et les rôles ;
- des décorateurs personnalisés pour les routes publiques, les rôles et l'utilisateur courant ;
- `PrismaService`, client d'accès à PostgreSQL.

## 2.2 Bootstrap

La fonction `bootstrap()` réalise les opérations suivantes :

1. création de l'application à partir de `AppModule` avec le body parser NestJS désactivé ;
2. récupération de `ConfigService` ;
3. configuration éventuelle de `trust proxy` ;
4. activation de `helmet` ;
5. installation de `bodyParser.json` et `bodyParser.urlencoded` avec la limite configurée ;
6. définition du préfixe global `/api/v1` ;
7. activation de CORS pour l'origine `FRONTEND_URL` avec les credentials ;
8. installation du `ValidationPipe` global ;
9. écoute sur le port configuré ;
10. journalisation de la politique de sécurité en dehors de la production ;
11. journalisation du port et du préfixe de l'API.

Le `ValidationPipe` applique :

- `whitelist: true` ;
- `forbidNonWhitelisted: true` ;
- `transform: true` ;
- la conversion implicite des types.

## 2.3 Module racine

`AppModule` importe :

| Catégorie | Modules |
| --- | --- |
| Configuration | `ConfigModule` |
| Limitation de débit | `ThrottlerModule` |
| Infrastructure commune | `AuditLogModule`, `PrismaModule` |
| Fonctionnel | `AuthModule`, `HealthModule`, `DashboardModule`, `EmployeesModule`, `CalendarModule`, `AttendanceModule`, `SanctionsModule`, `SchedulesModule` |

`ConfigModule` et les deux modules communs sont globaux. `AppThrottlerGuard` est enregistré comme `APP_GUARD` au niveau du module racine.

`AuthModule` enregistre également `JwtAuthGuard` et `RolesGuard` comme guards globaux.

## 2.4 Configuration technique

Les dépendances structurantes observées sont :

| Dépendance | Rôle dans le backend |
| --- | --- |
| `@nestjs/common`, `@nestjs/core`, `@nestjs/platform-express` | Framework HTTP et injection de dépendances |
| `@nestjs/config` | Chargement et accès à la configuration |
| `@nestjs/throttler` | Limitation globale du débit |
| `@nestjs/mapped-types` | Construction du DTO de mise à jour des plannings |
| `@prisma/client` | Client typé d'accès à PostgreSQL |
| `class-validator`, `class-transformer` | Validation et transformation des DTO |
| `joi` | Validation des variables d'environnement au démarrage |
| `helmet` | En-têtes de sécurité HTTP |
| `body-parser` | Analyse des corps JSON et URL-encodés avec une limite configurable |
| `puppeteer` | Rendu PDF des exports mensuels |
| `rxjs`, `reflect-metadata` | Dépendances d'exécution NestJS |

## 2.5 Diagramme d'architecture

```text
Client HTTP
    |
    v
NestJS / Express
    |
    +--> Helmet
    +--> Body Parser
    +--> CORS
    +--> Préfixe /api/v1
    |
    v
Guards globaux
    |
    +--> AppThrottlerGuard
    +--> JwtAuthGuard
    +--> RolesGuard
    |
    v
Contrôleurs des modules
    |
    v
Services métier
    |
    +--> Services communs
    +--> AuditLogService
    +--> PrismaService
              |
              v
          PostgreSQL
```

**Fichiers de référence :**

- `apps/backend/src/main.ts`
- `apps/backend/src/app.module.ts`
- `apps/backend/src/modules/auth/auth.module.ts`
- `apps/backend/src/common/audit/audit-log.module.ts`
- `apps/backend/src/common/prisma/prisma.module.ts`
- `apps/backend/nest-cli.json`
- `apps/backend/tsconfig.json`

# 3. Organisation des dossiers

## 3.1 Répertoires du backend

| Dossier | Rôle observé | Contenu principal |
| --- | --- | --- |
| `apps/backend/src` | Code source de l'application | Bootstrap, module racine, code commun et modules fonctionnels |
| `apps/backend/src/common` | Mécanismes transverses | Audit, Prisma, sécurité, temps, utilitaires métier et validation du PIN |
| `apps/backend/src/common/audit` | Journalisation d'audit | Module global et service de journalisation des actions administrateur |
| `apps/backend/src/common/prisma` | Accès aux données | Module global, `PrismaService` et sélections Prisma partagées |
| `apps/backend/src/common/security` | Sécurité technique | Guard de limitation de débit, utilitaires JWT et mots de passe |
| `apps/backend/src/common/time` | Horloge applicative | `AppClockService` |
| `apps/backend/src/common/utils` | Calculs partagés | Dates de pointage, résultat de sortie et instantanés de planning |
| `apps/backend/src/common/validation` | Validation métier partagée | Règles du code PIN |
| `apps/backend/src/modules` | Modules fonctionnels | Authentification, santé, tableau de bord, employés, calendrier, pointage, sanctions et plannings |
| `apps/backend/src/modules/attendance/dto` | Contrats du pointage | DTO de sécurité, entrée, sortie, historique et export |
| `apps/backend/src/modules/attendance/exports` | Production de rapports | Orchestration, types, export CSV, export PDF et rendu Puppeteer |
| `apps/backend/src/modules/auth/constants` | Métadonnées d'authentification | Clés de décorateurs, durées et limites du terminal PIN |
| `apps/backend/src/modules/auth/decorators` | Décorateurs personnalisés | `CurrentUser`, `Public` et `Roles` |
| `apps/backend/src/modules/auth/dto` | Contrats d'authentification | Connexion standard et connexion PIN |
| `apps/backend/src/modules/auth/guards` | Protection des routes | Validation JWT et contrôle des rôles |
| `apps/backend/src/modules/auth/interfaces` | Type d'utilisateur authentifié | Interface `AuthenticatedUser` |
| `apps/backend/src/modules/calendar/dto` | Contrats du calendrier | Mois, création et mise à jour d'une entrée |
| `apps/backend/src/modules/employees/dto` | Contrats des employés | Création, mise à jour, statut, rôle, département et planning |
| `apps/backend/src/modules/sanctions/dto` | Contrats des sanctions | Filtrage mensuel et mise à jour d'une règle |
| `apps/backend/src/modules/schedules/dto` | Contrats des plannings | Création, mise à jour et statut |
| `apps/backend/prisma` | Persistance Prisma | Schéma, seed et migrations |
| `apps/backend/prisma/migrations` | Historique de structure | Dossiers de migrations SQL horodatés |
| `apps/backend/scripts` | Opérations ponctuelles | Création de l'administrateur initial et scripts de régularisation |
| `apps/backend/test` | Tests d'intégration et E2E | Scénarios HTTP, environnement de test et base de test |

## 3.2 Fichiers racine du backend

| Fichier | Rôle observé |
| --- | --- |
| `apps/backend/package.json` | Dépendances et scripts |
| `apps/backend/nest-cli.json` | Répertoire source et nettoyage de `dist` au build |
| `apps/backend/tsconfig.json` | Compilation TypeScript stricte vers CommonJS et ES2022 |
| `apps/backend/tsconfig.build.json` | Configuration TypeScript du build |
| `apps/backend/prisma.config.ts` | Schéma, migrations, seed et URL de datasource Prisma |
| `apps/backend/.env.example` | Liste d'exemple des variables principales |
| `apps/backend/.env` | Configuration d'environnement présente dans l'arborescence |
| `apps/backend/.env.test` | Configuration de l'environnement de test |

# 4. Modules fonctionnels

## 4.1 Vue d'ensemble

| Module | Responsabilité | Contrôleur | Services déclarés | DTO | Modèles Prisma associés |
| --- | --- | --- | --- | --- | --- |
| `AuthModule` | Connexion standard, connexion PIN, émission et validation JWT, utilisateur courant | `AuthController` | `AuthService` | `LoginDto`, `AttendanceEntryLoginDto` | `Employee` |
| `HealthModule` | État élémentaire du service | `HealthController` | Aucun service déclaré | Aucun | Aucun |
| `DashboardModule` | Agrégation des indicateurs et activités du tableau de bord | `DashboardController` | `DashboardService` | Aucun | `Employee`, `Attendance` ; utilise aussi `CalendarService` |
| `EmployeesModule` | Consultation, création et modification des employés, statut, rôle, département et planning | `EmployeesController` | `EmployeesService` | Six DTO dédiés | `Employee`, `Schedule` |
| `CalendarModule` | Vue mensuelle, jours non travaillés et gestion des entrées du calendrier RH | `CalendarController` | `CalendarService` | `CalendarMonthQueryDto`, `CreateCalendarEntryDto`, `UpdateCalendarEntryDto` | `CalendarEntry`, relation avec `Employee` |
| `AttendanceModule` | Pointages, historiques, synthèses, sécurité, métriques mensuelles et exports | `AttendanceController` | Onze services de pointage, temps et export | Huit classes DTO dédiées | `Attendance`, `Employee` ; dépend de `CalendarModule` et `SanctionsModule` |
| `SanctionsModule` | Règles, calculs mensuels et sanction d'un pointage | `SanctionsController` | `SanctionsService` | `MonthlySanctionsQueryDto`, `UpdateSanctionRuleDto` | `SanctionRule`, `Attendance` |
| `SchedulesModule` | Consultation, création, modification et activation des plannings | `SchedulesController` | `SchedulesService` | `CreateScheduleDto`, `UpdateScheduleDto`, `UpdateScheduleStatusDto` | `Schedule`, avec employés sélectionnés |

Les modèles associés ci-dessus correspondent aux accès directs observés dans les services et aux relations du schéma Prisma. Aucun fichier d'entité NestJS distinct n'est présent.

## 4.2 Authentification

### Responsabilités

`AuthService` :

- recherche les employés par adresse électronique pour la connexion standard ;
- vérifie l'état actif du compte ;
- vérifie le mot de passe haché ;
- recherche un employé actif de rôle `EMPLOYEE` pour la connexion PIN ;
- vérifie ou migre le secret PIN historique ;
- signe les jetons JWT ;
- valide les jetons et recharge l'utilisateur courant.

### Routes

| Méthode | Route après préfixe | Accès |
| --- | --- | --- |
| `POST` | `/api/v1/auth/login` | Publique |
| `POST` | `/api/v1/auth/attendance-entry/login` | Publique, avec throttling PIN dédié |
| `GET` | `/api/v1/auth/me` | JWT requis |

### DTO

| DTO | Validation principale |
| --- | --- |
| `LoginDto` | Adresse électronique valide et mot de passe d'au moins huit caractères |
| `AttendanceEntryLoginDto` | Chaîne de quatre chiffres |

## 4.3 Santé

`HealthController` expose publiquement `GET /api/v1/health`. La réponse contient :

- `status: "ok"` ;
- le nom de service `konatech-attendance-api` ;
- un horodatage ISO.

Le contrôleur n'interroge pas Prisma et le module ne déclare aucun service.

## 4.4 Tableau de bord

`DashboardService` agrège les données `Employee` et `Attendance`. Il utilise également `CalendarService` pour tenir compte des jours non travaillés.

Le module expose une seule route protégée par le rôle `ADMIN` :

| Méthode | Route | Service |
| --- | --- | --- |
| `GET` | `/api/v1/dashboard/overview` | `DashboardService.getOverview()` |

Le module ne possède pas de DTO. Ses types de réponse sont définis dans `dashboard.types.ts`.

## 4.5 Employés

`EmployeesService` contient les opérations de consultation et de mutation des employés. Il :

- utilise des sélections Prisma partagées ;
- hache les mots de passe et codes PIN ;
- vérifie l'unicité et la validité du PIN ;
- génère l'identifiant employé ;
- vérifie l'existence des plannings affectés ;
- transforme la réponse pour ne pas retourner les secrets hachés.

Toutes les routes du contrôleur exigent le rôle `ADMIN`.

| Méthode | Route | Opération |
| --- | --- | --- |
| `GET` | `/api/v1/employees` | Liste |
| `GET` | `/api/v1/employees/:id` | Détail par UUID |
| `POST` | `/api/v1/employees` | Création |
| `PATCH` | `/api/v1/employees/:id` | Mise à jour |
| `PATCH` | `/api/v1/employees/:id/status` | Activation ou désactivation |
| `PATCH` | `/api/v1/employees/:id/role` | Affectation du rôle métier textuel |
| `PATCH` | `/api/v1/employees/:id/department` | Affectation du département |
| `PATCH` | `/api/v1/employees/:id/schedule` | Affectation ou retrait du planning |

| DTO | Rôle |
| --- | --- |
| `CreateEmployeeDto` | Création et validation des données du compte |
| `UpdateEmployeeDto` | Mise à jour partielle des données |
| `UpdateEmployeeStatusDto` | Statut booléen |
| `AssignEmployeeRoleDto` | Champ métier `role` |
| `AssignEmployeeDepartmentDto` | Département nullable |
| `AssignEmployeeScheduleDto` | UUID de planning nullable |

## 4.6 Calendrier

`CalendarService` :

- construit une vue mensuelle ;
- distingue les jours ouvrés, week-ends et jours fériés ;
- retourne les entrées du mois ;
- détermine si une date est non travaillée ;
- crée, modifie et désactive logiquement une entrée ;
- vérifie les doublons actifs.

Toutes les routes du contrôleur exigent le rôle `ADMIN`.

| Méthode | Route | DTO |
| --- | --- | --- |
| `GET` | `/api/v1/calendar/month` | `CalendarMonthQueryDto` |
| `GET` | `/api/v1/calendar/holidays` | `CalendarMonthQueryDto` |
| `POST` | `/api/v1/calendar/holidays` | `CreateCalendarEntryDto` |
| `PATCH` | `/api/v1/calendar/holidays/:id` | UUID et `UpdateCalendarEntryDto` |
| `DELETE` | `/api/v1/calendar/holidays/:id` | UUID |

Les types de présentation du calendrier sont regroupés dans `calendar.types.ts`.

## 4.7 Pointage

`AttendanceModule` est composé des services suivants :

| Service | Responsabilité observée |
| --- | --- |
| `AttendanceEntryService` | Construction de l'URL fixe du terminal frontend |
| `AppClockService` | Accès à l'heure applicative |
| `AttendanceService` | Moteur principal d'entrée, sortie, historique et synthèse |
| `AttendanceMonthlyMetricsService` | Recalcul mensuel et création des absences manquantes |
| `AttendanceSecurityPolicyService` | Résolution de la politique GPS et des rayons |
| `AttendanceSecurityService` | Évaluation du GPS, de la précision et de la photo |
| `AttendancePhotoStorageService` | Validation et téléversement des photos vers Cloudinary |
| `MonthlyAttendanceExportService` | Construction du rapport mensuel |
| `MonthlyAttendanceCsvExporterService` | Production CSV |
| `MonthlyAttendancePdfExporterService` | Sélection et production du PDF |
| `MonthlyAttendancePuppeteerPdfRendererService` | Rendu PDF par navigateur |

Le module importe `CalendarModule` et `SanctionsModule`. Il exporte `AttendanceService`.

### Routes publiques et administrateur

| Méthode | Route | Accès |
| --- | --- | --- |
| `GET` | `/api/v1/attendance/entry` | Publique, redirection HTTP 302 vers le terminal frontend |
| `GET` | `/api/v1/attendance/summary` | `ADMIN` |
| `GET` | `/api/v1/attendance/history` | `ADMIN` |
| `GET` | `/api/v1/attendance/exports/monthly` | `ADMIN` |
| `POST` | `/api/v1/attendance/check-in` | `ADMIN` |
| `POST` | `/api/v1/attendance/check-out` | `ADMIN` |

### Routes employé

| Méthode | Route | Accès |
| --- | --- | --- |
| `GET` | `/api/v1/attendance/me/today` | `EMPLOYEE` |
| `GET` | `/api/v1/attendance/me/security-policy` | `EMPLOYEE` |
| `GET` | `/api/v1/attendance/me/history` | `EMPLOYEE` |
| `POST` | `/api/v1/attendance/me/check-in` | `EMPLOYEE` |
| `POST` | `/api/v1/attendance/me/check-out` | `EMPLOYEE` |

### DTO

| DTO | Rôle |
| --- | --- |
| `AttendanceHistoryQueryDto` | Mois optionnel au format `YYYY-MM` |
| `CheckInSecurityProofDto` | Latitude, longitude, précision et photo encodée |
| `CheckInSecurityDto` | Objet de preuve de sécurité imbriqué |
| `CheckInDto` | Entrée administrateur avec employé, date, notes et preuve optionnelle |
| `CheckOutDto` | Sortie administrateur avec employé, date et preuve optionnelle |
| `SelfCheckInDto` | Entrée de l'utilisateur courant |
| `SelfCheckOutDto` | Sortie de l'utilisateur courant |
| `MonthlyAttendanceExportQueryDto` | Mois, année, format et employé optionnel |

## 4.8 Sanctions

`SanctionsService` :

- charge les règles stockées ;
- utilise la configuration statique `SANCTION_RULES` si aucune règle n'est enregistrée ;
- valide et met à jour une règle ;
- calcule la sanction d'un pointage ;
- calcule les sanctions mensuelles ;
- contrôle le chevauchement des plages de retard actives.

Toutes les routes exigent le rôle `ADMIN`.

| Méthode | Route | DTO |
| --- | --- | --- |
| `GET` | `/api/v1/sanctions/rules` | Aucun |
| `PATCH` | `/api/v1/sanctions/rules/:id` | UUID et `UpdateSanctionRuleDto` |
| `GET` | `/api/v1/sanctions/monthly` | `MonthlySanctionsQueryDto` |
| `GET` | `/api/v1/sanctions/attendance/:attendanceId` | Identifiant de pointage |

Les types du moteur sont définis dans `sanction-engine.types.ts`.

## 4.9 Plannings

`SchedulesService` :

- liste et charge les plannings avec leurs employés ;
- valide que l'heure de fin est postérieure à l'heure de début ;
- crée et modifie les plannings ;
- active ou désactive un planning ;
- refuse la désactivation d'un planning encore affecté ;
- transforme certaines erreurs Prisma en exceptions HTTP.

Toutes les routes exigent le rôle `ADMIN`.

| Méthode | Route | DTO |
| --- | --- | --- |
| `GET` | `/api/v1/schedules` | Aucun |
| `GET` | `/api/v1/schedules/:id` | UUID |
| `POST` | `/api/v1/schedules` | `CreateScheduleDto` |
| `PATCH` | `/api/v1/schedules/:id` | UUID et `UpdateScheduleDto` |
| `PATCH` | `/api/v1/schedules/:id/status` | UUID et `UpdateScheduleStatusDto` |

`UpdateScheduleDto` est construit avec `PartialType(CreateScheduleDto)`.

## 4.10 Modules communs

| Module | Portée | Fonction |
| --- | --- | --- |
| `PrismaModule` | Globale | Fournit et exporte `PrismaService` |
| `AuditLogModule` | Globale | Fournit et exporte `AuditLogService` |

`AuditLogService` écrit avec le logger NestJS des événements JSON de type `admin_audit`. Il est utilisé par les contrôleurs de pointage, employés, calendrier et plannings lors des mutations administrateur et des exports.

# 5. Flux d'une requête

## 5.1 Chaîne globale

Le parcours observé dépend du caractère public ou protégé de la route :

1. la requête entre dans la couche HTTP NestJS/Express ;
2. `AppThrottlerGuard` applique les limites configurées ;
3. `JwtAuthGuard` laisse passer une route marquée `@Public()` ou valide le header Bearer ;
4. `RolesGuard` vérifie les métadonnées produites par `@Roles()` ;
5. le routing NestJS sélectionne le contrôleur et la méthode ;
6. les pipes, dont le `ValidationPipe` global et les éventuels `ParseUUIDPipe`, valident et transforment les entrées ;
7. le contrôleur transmet les données validées au service ;
8. le service applique les règles métier ;
9. le service utilise directement `PrismaService` ou appelle un autre service ;
10. Prisma exécute les opérations sur PostgreSQL ;
11. le résultat ou l'exception remonte à la couche HTTP.

Les guards `JwtAuthGuard` et `RolesGuard` sont globaux. Ils ne sont donc pas ajoutés individuellement avec `@UseGuards()` sur les contrôleurs.

## 5.2 Exemple d'une mutation administrateur

Pour une modification d'employé :

1. `PATCH /api/v1/employees/:id` reçoit la requête ;
2. le throttling global s'applique ;
3. le JWT est extrait du header `Authorization` ;
4. l'utilisateur courant est chargé par `AuthService` ;
5. `RolesGuard` exige `ADMIN`, car le contrôleur porte `@Roles(AccessRole.ADMIN)` ;
6. `ParseUUIDPipe` valide `:id` ;
7. `ValidationPipe` transforme et valide `UpdateEmployeeDto` ;
8. `EmployeesController` appelle `EmployeesService.update()` ;
9. le service vérifie l'employé, le planning éventuel, le PIN et les contraintes métier ;
10. `PrismaService` met à jour `Employee` ;
11. le contrôleur écrit l'événement d'audit ;
12. NestJS sérialise la réponse.

## 5.3 Exemple d'une route publique

Pour `GET /api/v1/health`, `@Public()` permet à `JwtAuthGuard` de laisser passer la requête sans jeton. Le contrôleur construit directement la réponse sans service et sans accès à Prisma.

## 5.4 Diagramme adapté

```text
Client
  |
  v
Middlewares Express
Helmet + Body Parser + CORS
  |
  v
AppThrottlerGuard
  |
  v
JwtAuthGuard
  |  \
  |   +--> @Public : passage sans JWT
  v
RolesGuard
  |
  v
Controller
  |
  +--> @Param + ParseUUIDPipe
  +--> @Body / @Query + ValidationPipe global
  +--> @CurrentUser
  |
  v
Service métier
  |
  +--> autre service métier ou commun
  +--> AuditLogService depuis certains contrôleurs
  |
  v
PrismaService
  |
  v
PostgreSQL
```

## 5.5 Décorateurs personnalisés

| Décorateur | Fonction observée |
| --- | --- |
| `@Public()` | Place la métadonnée permettant d'ignorer l'authentification JWT |
| `@Roles(...roles)` | Place la liste des rôles acceptés |
| `@CurrentUser()` | Lit l'utilisateur ajouté à la requête par `JwtAuthGuard` |

**Fichiers de référence :**

- `apps/backend/src/main.ts`
- `apps/backend/src/modules/auth/guards/jwt-auth.guard.ts`
- `apps/backend/src/modules/auth/guards/roles.guard.ts`
- `apps/backend/src/common/security/app-throttler.guard.ts`
- `apps/backend/src/modules/auth/decorators`
- `apps/backend/src/modules/employees/employees.controller.ts`
- `apps/backend/src/modules/employees/employees.service.ts`
- `apps/backend/src/common/prisma/prisma.service.ts`

# 6. Gestion des erreurs

## 6.1 Validation des requêtes

La validation globale rejette :

- les propriétés non déclarées dans les DTO ;
- les types ou formats invalides ;
- les UUID invalides sur les paramètres utilisant `ParseUUIDPipe` ;
- les dates, mois, heures, adresses électroniques et codes PIN ne respectant pas les décorateurs déclarés.

Les DTO utilisent notamment :

- `IsString` ;
- `IsEmail` ;
- `IsUUID` ;
- `IsDateString` ;
- `IsBoolean` ;
- `IsInt` et `IsNumber` ;
- `IsEnum` et `IsIn` ;
- `Matches` ;
- `Min`, `Max`, `MinLength` et `MaxLength` ;
- `IsOptional`, `ValidateIf` et `ValidateNested` ;
- `Transform` et `Type`.

Les échecs de validation sont traités par le mécanisme standard de NestJS.

## 6.2 Exceptions HTTP observées

| Exception | Code HTTP associé | Cas observés |
| --- | --- | --- |
| `BadRequestException` | 400 | Données métier invalides, dates futures, format de mois, fenêtre de planning, GPS, photo ou règle de sanction |
| `UnauthorizedException` | 401 | Header absent ou mal formé, identifiants invalides, jeton invalide ou expiré, compte inactif |
| `ForbiddenException` | 403 | Rôle insuffisant |
| `NotFoundException` | 404 | Employé, planning, pointage, entrée calendrier ou règle de sanction introuvable |
| `ConflictException` | 409 | Pointage incohérent, doublon, PIN utilisé, planning affecté ou entrée calendrier en conflit |
| `HttpException` avec `TOO_MANY_REQUESTS` | 429 | Limite du terminal PIN atteinte |
| `InternalServerErrorException` | 500 | Échec interne de rendu ou stockage |
| `BadGatewayException` | 502 | Échec du service de stockage photo |
| `GatewayTimeoutException` | 504 | Expiration du téléversement photo |

Trois exceptions spécialisées du pointage étendent `BadRequestException` :

- `AttendanceSecurityLocationRequiredException` ;
- `AttendanceSecurityOutsideZoneException` ;
- `AttendanceSecurityAccuracyTooLowException`.

## 6.3 Erreurs de persistance

Les services encapsulent certaines erreurs Prisma :

- `EmployeesService` transforme notamment les conflits d'unicité du compte ou du PIN ;
- `SchedulesService` transforme les conflits liés au nom et aux affectations ;
- `CalendarService` contrôle les doublons et l'existence des entrées ;
- les services vérifient explicitement les ressources avant plusieurs mutations.

Les messages métier sont portés par les exceptions NestJS.

## 6.4 Limitation de débit

`AppThrottlerGuard` étend `ThrottlerGuard`. Il :

- applique une limite globale ;
- applique une limite distincte à la connexion standard ;
- applique deux fenêtres, courte et longue, à la connexion PIN ;
- ajoute les en-têtes de limite et de réinitialisation ;
- ajoute `Retry-After` lorsqu'une limite est dépassée ;
- journalise les blocages du terminal PIN avec la route, l'adresse suivie, le user-agent et l'horodatage.

## 6.5 Filtres

Aucune classe `ExceptionFilter`, aucun décorateur `@Catch()` et aucun filtre d'exception personnalisé ne sont présents dans `apps/backend/src`. Les exceptions sont donc sérialisées par la gestion HTTP standard de NestJS.

## 6.6 Journalisation

Les mécanismes observés sont :

- `Logger.log` au bootstrap ;
- `Logger.warn` pour les événements d'audit administrateur ;
- `Logger.warn` lors du blocage de la connexion PIN par throttling ;
- journalisation dans le service de stockage photo.

Aucun middleware de journalisation HTTP personnalisé n'est présent.

**Fichiers de référence :**

- `apps/backend/src/main.ts`
- `apps/backend/src/common/security/app-throttler.guard.ts`
- `apps/backend/src/common/audit/audit-log.service.ts`
- `apps/backend/src/modules/attendance/attendance-security.exception.ts`
- `apps/backend/src/modules/attendance/attendance-photo-storage.service.ts`
- `apps/backend/src/modules/attendance/attendance.service.ts`
- `apps/backend/src/modules/auth/auth.service.ts`
- `apps/backend/src/modules/employees/employees.service.ts`
- `apps/backend/src/modules/schedules/schedules.service.ts`
- `apps/backend/src/modules/calendar/calendar.service.ts`
- `apps/backend/src/modules/sanctions/sanctions.service.ts`

# 7. Configuration

## 7.1 Chargement des variables

`ConfigModule.forRoot()` est global et recherche les fichiers dans l'ordre suivant :

1. `.env.<NODE_ENV>.local`, lorsque `NODE_ENV` existe ;
2. `.env.<NODE_ENV>` ;
3. `.env.local` ;
4. `.env`.

Les chemins sont résolus depuis la racine du backend.

Les variantes effectivement présentes sont :

| Fichier | Présence observée |
| --- | --- |
| `apps/backend/.env` | Présent |
| `apps/backend/.env.example` | Présent |
| `apps/backend/.env.test` | Présent |
| `apps/backend/.env.local` | Absent de l'arborescence analysée |
| `apps/backend/.env.development` | Absent de l'arborescence analysée |
| `apps/backend/.env.production` | Absent de l'arborescence analysée |

## 7.2 Variables validées par AppModule

| Variable | Utilisation observée | Validation ou valeur par défaut |
| --- | --- | --- |
| `NODE_ENV` | Sélection d'environnement et contrôles production | `development`, `test` ou `production`; défaut `development` |
| `PORT` | Port HTTP | Nombre, défaut `4000` |
| `FRONTEND_URL` | CORS et URL du terminal | URI obligatoire |
| `JWT_SECRET` | Signature JWT | Chaîne d'au moins 32 caractères, obligatoire |
| `JWT_EXPIRES_IN` | Durée de session standard | Défaut `1d` |
| `DATABASE_URL` | Connexion Prisma à PostgreSQL | URI obligatoire |
| `JSON_BODY_LIMIT` | Limite des corps HTTP | Format `b`, `kb` ou `mb`; défaut `10mb` |
| `RATE_LIMIT_TTL_MS` | Fenêtre globale | Entier positif, défaut `60000` |
| `RATE_LIMIT_MAX` | Requêtes globales | Entier positif, défaut `300` |
| `LOGIN_RATE_LIMIT_TTL_MS` | Fenêtre de connexion | Entier positif, défaut `60000` |
| `LOGIN_RATE_LIMIT_MAX` | Tentatives de connexion | Entier positif, défaut `20` |
| `TRUST_PROXY_HOPS` | Nombre de proxies approuvés | Entier supérieur ou égal à zéro, défaut `0` |
| `ATTENDANCE_SECURITY_ENABLED` | Activation de la sécurité de pointage | Booléen, défaut `false` |
| `COMPANY_LATITUDE` | Latitude du site | Nombre entre -90 et 90 |
| `COMPANY_LONGITUDE` | Longitude du site | Nombre entre -180 et 180 |
| `ATTENDANCE_TRUSTED_RADIUS_METERS` | Rayon de confiance | Nombre positif optionnel |
| `ATTENDANCE_WARNING_RADIUS_METERS` | Rayon d'avertissement | Nombre positif optionnel |
| `ATTENDANCE_ALLOWED_RADIUS_METERS` | Rayon compatible historique | Nombre positif optionnel |
| `ATTENDANCE_MAX_ACCURACY_METERS` | Précision GPS maximale | Nombre positif optionnel |
| `CLOUDINARY_CLOUD_NAME` | Compte de stockage photo | Chaîne optionnelle |
| `CLOUDINARY_API_KEY` | Clé de stockage photo | Chaîne optionnelle |
| `CLOUDINARY_API_SECRET` | Secret de stockage photo | Chaîne optionnelle |
| `CLOUDINARY_ATTENDANCE_FOLDER` | Dossier distant | Défaut `konatech/attendance-verifications` |
| `CLOUDINARY_UPLOAD_TIMEOUT_MS` | Délai du téléversement | Entier positif, défaut `10000` |
| `CLOUDINARY_UPLOAD_MAX_RETRIES` | Nombre de nouvelles tentatives | Entier positif ou nul, défaut `2` |
| `CLOUDINARY_UPLOAD_RETRY_DELAY_MS` | Délai entre tentatives | Entier positif, défaut `300` |
| `ATTENDANCE_PDF_RENDERER` | Moteur d'export PDF | `premium`, `puppeteer` ou `legacy`; défaut `premium` |
| `ATTENDANCE_PDF_EXECUTABLE_PATH` | Exécutable du navigateur | Chaîne optionnelle |
| `ATTENDANCE_PDF_ALLOW_LEGACY_FALLBACK` | Repli du rendu PDF | Booléen, défaut `false` |

La validation personnalisée impose notamment :

- latitude et longitude ensemble ;
- coordonnées présentes si la sécurité est activée ;
- rayon d'avertissement supérieur ou égal au rayon de confiance ;
- configuration complète des trois variables Cloudinary ;
- remplacement des secrets locaux ou de test en production ;
- URL frontend HTTPS, non locale, non privée et hors tunnel temporaire en production.

## 7.3 Variables utilisées hors schéma Joi

| Variable | Emplacement | Comportement observé |
| --- | --- | --- |
| `ATTENDANCE_ENTRY_JWT_EXPIRES_IN` | `AuthService` | Durée optionnelle du jeton du terminal, avec constante par défaut |
| `ADMIN_EMAIL` | Script de création initiale | Identifiant obligatoire lu par le script |
| `ADMIN_PASSWORD` | Script de création initiale | Mot de passe obligatoire lu par le script |
| `ADMIN_FIRST_NAME` | Script de création initiale | Prénom optionnel |
| `ADMIN_LAST_NAME` | Script de création initiale | Nom optionnel |
| `ADMIN_JOB_TITLE` | Script de création initiale | Fonction optionnelle |
| `ADMIN_DEPARTMENT` | Script de création initiale | Département optionnel |

`ATTENDANCE_ENTRY_JWT_EXPIRES_IN`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_FIRST_NAME`, `ADMIN_LAST_NAME`, `ADMIN_JOB_TITLE` et `ADMIN_DEPARTMENT` ne figurent pas dans le schéma Joi d'`AppModule`. Les variables du script administrateur ne configurent pas le serveur HTTP en fonctionnement.

## 7.4 Configuration Prisma

`prisma.config.ts` définit :

- `prisma/schema.prisma` comme schéma ;
- `prisma/migrations` comme répertoire de migrations ;
- `prisma/seed.ts` comme commande de seed ;
- `DATABASE_URL` comme URL de datasource.

Le schéma Prisma définit :

| Élément | Configuration |
| --- | --- |
| Generator | `prisma-client-js` |
| Cibles binaires | `native`, `debian-openssl-3.0.x` |
| Datasource | PostgreSQL |
| Variable de connexion | `DATABASE_URL` |
| Modèles | `Employee`, `Schedule`, `Attendance`, `CalendarEntry`, `SanctionRule` |

`PrismaService` étend `PrismaClient`. Il ne définit pas de connexion explicite dans `onModuleInit`; il ferme la connexion avec `$disconnect()` dans `onModuleDestroy`.

## 7.5 Initialisation applicative

Les mécanismes d'initialisation observés sont :

- validation de la configuration pendant la construction d'`AppModule` ;
- initialisation des guards globaux par l'injection NestJS ;
- démarrage d'un intervalle quotidien par `AttendanceMonthlyMetricsService.onModuleInit()` ;
- arrêt de cet intervalle dans `onModuleDestroy()` ;
- fermeture de Prisma dans `PrismaService.onModuleDestroy()` ;
- démarrage de l'écoute HTTP dans `main.ts`.

Le seed et les migrations ne sont pas exécutés par `bootstrap()`. Ils disposent de scripts distincts dans `package.json`.

## 7.6 Scripts liés à l'architecture backend

| Script | Commande déclarée | Fonction |
| --- | --- | --- |
| `dev` | NestJS avec `start --watch` | Développement |
| `build` | `nest build` | Compilation vers `dist` |
| `start` | `node dist/main.js` | Exécution compilée |
| `typecheck` | TypeScript sans émission | Vérification des types |
| `test` | Jest E2E en série | Tests |
| `admin:create` | Script TypeScript | Création de l'administrateur initial |
| `pins:backfill` | Script TypeScript | Régularisation des hash de PIN |
| `snapshots:backfill` | Script TypeScript | Régularisation des instantanés de planning |
| `prisma:generate` | Prisma generate | Génération du client |
| `prisma:migrate` | Prisma migrate dev | Migration de développement |
| `prisma:migrate:deploy` | Prisma migrate deploy | Application des migrations |
| `prisma:seed` | Prisma db seed | Chargement du jeu initial |

**Fichiers de référence :**

- `apps/backend/src/app.module.ts`
- `apps/backend/src/main.ts`
- `apps/backend/.env.example`
- `apps/backend/prisma.config.ts`
- `apps/backend/prisma/schema.prisma`
- `apps/backend/prisma/seed.ts`
- `apps/backend/src/common/prisma/prisma.service.ts`
- `apps/backend/src/modules/attendance/attendance-monthly-metrics.service.ts`
- `apps/backend/scripts/create-initial-admin.ts`
- `apps/backend/package.json`

# 8. Traçabilité

| Section | Sujet vérifié | Fichiers principaux |
| --- | --- | --- |
| 1 | Rôle et pile du backend | `apps/backend/package.json`, `apps/backend/src/app.module.ts`, `apps/backend/prisma/schema.prisma` |
| 2 | Bootstrap | `apps/backend/src/main.ts` |
| 2 | Composition NestJS | `apps/backend/src/app.module.ts`, tous les fichiers `*.module.ts` |
| 2 | Dépendances | `apps/backend/package.json` |
| 3 | Structure des répertoires | `apps/backend/src`, `apps/backend/prisma`, `apps/backend/scripts`, `apps/backend/test` |
| 4 | Authentification | `apps/backend/src/modules/auth` |
| 4 | Santé | `apps/backend/src/modules/health` |
| 4 | Tableau de bord | `apps/backend/src/modules/dashboard` |
| 4 | Employés | `apps/backend/src/modules/employees` |
| 4 | Calendrier | `apps/backend/src/modules/calendar` |
| 4 | Pointage et exports | `apps/backend/src/modules/attendance` |
| 4 | Sanctions | `apps/backend/src/modules/sanctions` |
| 4 | Plannings | `apps/backend/src/modules/schedules` |
| 4 | Modèles et relations | `apps/backend/prisma/schema.prisma` |
| 5 | Guards | `apps/backend/src/common/security/app-throttler.guard.ts`, `apps/backend/src/modules/auth/guards` |
| 5 | Décorateurs | `apps/backend/src/modules/auth/decorators` |
| 5 | Validation | `apps/backend/src/main.ts`, tous les fichiers sous `src/modules/*/dto` |
| 5 | Accès PostgreSQL | `apps/backend/src/common/prisma/prisma.module.ts`, `apps/backend/src/common/prisma/prisma.service.ts` |
| 6 | Exceptions | Services sous `apps/backend/src/modules`, guards d'authentification et de throttling |
| 6 | Audit | `apps/backend/src/common/audit/audit-log.service.ts` et contrôleurs administrateur |
| 7 | Variables et validation | `apps/backend/src/app.module.ts`, `apps/backend/.env.example` |
| 7 | Prisma | `apps/backend/prisma.config.ts`, `apps/backend/prisma/schema.prisma` |
| 7 | Initialisation | `apps/backend/src/main.ts`, `apps/backend/src/modules/attendance/attendance-monthly-metrics.service.ts`, `apps/backend/src/common/prisma/prisma.service.ts` |
| 7 | Scripts | `apps/backend/package.json`, `apps/backend/scripts`, `apps/backend/prisma/seed.ts` |

# 9. Observations

## 9.1 Modularité

- Le backend contient huit modules fonctionnels : authentification, santé, tableau de bord, employés, calendrier, pointage, sanctions et plannings.
- `PrismaModule` et `AuditLogModule` sont globaux.
- `AttendanceModule` importe `CalendarModule` et `SanctionsModule`.
- `DashboardModule` importe `CalendarModule`.
- `AttendanceService`, `CalendarService` et `SanctionsService` sont exportés par leurs modules respectifs.
- `HealthModule` ne déclare aucun service et son contrôleur retourne directement la réponse.

## 9.2 Séparation des responsabilités

- Les contrôleurs déclarent les routes, extraient les entrées, appellent les services et consignent certaines actions administrateur.
- Les DTO contiennent les règles de validation des entrées HTTP.
- Les services contiennent les règles métier et les accès Prisma.
- Les sélections Prisma communes sont regroupées dans `common/prisma/selects.ts`.
- Les calculs de dates, sorties et instantanés de planning sont regroupés dans `common/utils`.
- Les règles de pointage, de calendrier, de sanctions et d'agrégation du tableau de bord identifient explicitement leurs services comme sources de vérité dans le code.

## 9.3 Organisation du code

- Chaque module fonctionnel possède un fichier `*.module.ts`; tous sauf `HealthModule` possèdent un service.
- Chaque module exposant une API possède un contrôleur unique.
- Les DTO sont placés dans un sous-répertoire `dto` lorsqu'ils existent.
- Les types de réponse complexes du tableau de bord, du calendrier, des sanctions et des exports sont placés dans des fichiers `*.types.ts`.
- Aucun fichier `*.entity.ts`, aucune classe d'entité TypeORM et aucun repository personnalisé ne sont présents.
- Les cinq modèles persistés sont définis exclusivement dans `prisma/schema.prisma`.

## 9.4 Sécurité et middleware

- `JwtAuthGuard`, `RolesGuard` et `AppThrottlerGuard` sont des guards globaux.
- Les routes publiques sont déclarées avec `@Public()`.
- Les contrôles de rôle utilisent `@Roles()` au niveau du contrôleur ou de la méthode.
- `helmet` et `body-parser` sont montés par `app.use()` dans le bootstrap.
- Aucun fichier implémentant `NestMiddleware` et aucune configuration par `MiddlewareConsumer` ne sont présents.
- La politique CORS accepte une origine unique provenant de `FRONTEND_URL` avec les credentials.

## 9.5 Persistance et initialisation

- Prisma utilise PostgreSQL et cinq modèles.
- Vingt dossiers de migration sont présents.
- `PrismaService` est global et se déconnecte à la destruction du module.
- La connexion Prisma n'est pas ouverte explicitement dans `onModuleInit`.
- Le recalcul mensuel démarre un timer interne lors de l'initialisation du module de pointage.
- Les migrations et le seed restent des commandes séparées du démarrage HTTP.

## 9.6 Gestion des erreurs

- Les services utilisent les exceptions HTTP NestJS pour les erreurs métier.
- Aucun filtre d'exception personnalisé n'est présent.
- Aucun intercepteur global ou local n'est présent dans `apps/backend/src`.
- Les erreurs de validation sont gérées par le `ValidationPipe` global.
- Les erreurs de limitation du terminal PIN reçoivent un message dédié et sont journalisées.
