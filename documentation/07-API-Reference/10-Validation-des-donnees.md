# API Reference — Validation des données

| Métadonnée | Valeur |
|---|---|
| Document ID | API-010 |
| Titre | Validation des données |
| Version | 1.0 |
| Statut | Validé |
| Classification | Interne |
| Référence | API Reference |
| Projet | Konatech Pointage |

## 1. Présentation

La validation des données de l'API Konatech Pointage repose sur un `ValidationPipe` NestJS global, des classes DTO décorées avec `class-validator`, des transformations `class-transformer`, le pipe intégré `ParseUUIDPipe` et des contrôles métier complémentaires dans les services.

Le dépôt contient 24 classes DTO réparties entre Auth, Attendance, Calendar, Employees, Sanctions et Schedules. Aucun DTO n'est déclaré pour Health ou Dashboard. Aucun pipe personnalisé n'est présent sous `apps/backend/src/`.

## 2. Vue d'ensemble

| Élément | Description |
|---|---|
| `ValidationPipe` global | Valide tous les arguments de contrôleur typés par un DTO |
| `class-validator` | Fournit 21 décorateurs de validation réellement importés dans les DTO |
| `class-transformer` | Convertit les preuves numériques imbriquées et certaines chaînes vides |
| `PartialType` | Dérive le DTO de modification Planning depuis le DTO de création |
| `ParseUUIDPipe` | Valide plusieurs identifiants de chemin avant l'appel du contrôleur |
| Services | Complètent les DTO par les validations qui nécessitent l'état persistant ou plusieurs champs |

## 3. Validation globale

`apps/backend/src/main.ts` enregistre le pipe suivant pour toute l'application :

| Option | Valeur configurée | Comportement |
|---|---|---|
| `whitelist` | `true` | Les propriétés sans décorateur de validation ne sont pas conservées |
| `forbidNonWhitelisted` | `true` | Une propriété entrante non déclarée par le DTO provoque une erreur 400 au lieu d'être seulement supprimée |
| `transform` | `true` | Les valeurs entrantes sont transformées vers les types des paramètres et DTO |
| `transformOptions.enableImplicitConversion` | `true` | La conversion implicite selon les types TypeScript est activée, notamment pour les nombres des Query Parameters |

Aucune option `skipMissingProperties`, `stopAtFirstError`, `disableErrorMessages`, `exceptionFactory`, `groups` ou `validationError` n'est définie dans le bootstrap.

`body-parser` est configuré avant le pipe pour les corps JSON et URL-encoded. La limite provient de `JSON_BODY_LIMIT`; ce middleware prépare le corps mais ne remplace pas la validation des DTO.

### 3.1 Paramètres UUID

`ParseUUIDPipe` est appliqué aux paramètres suivants :

| Contrôleur | Paramètres concernés |
|---|---|
| `EmployeesController` | `id` du détail et des cinq routes PATCH |
| `SchedulesController` | `id` du détail et des deux routes PATCH |
| `CalendarController` | `id` des routes PATCH et DELETE d'événement |
| `SanctionsController` | `id` de la route PATCH d'une règle |

Le paramètre `attendanceId` de `GET /sanctions/attendance/:attendanceId` n'utilise ni `ParseUUIDPipe` ni DTO. Il est transmis au service comme chaîne.

## 4. DTO

### 4.1 Authentification

| DTO | Contrôleur et rôle | Principales validations observées |
|---|---|---|
| `LoginDto` | `AuthController`, body de `POST /auth/login` | `email` avec `IsEmail`; `password` chaîne de 8 caractères au minimum |
| `AttendanceEntryLoginDto` | `AuthController`, body de `POST /auth/attendance-entry/login` | `pinCode` chaîne correspondant exactement à quatre chiffres |

### 4.2 Pointage et export

| DTO | Contrôleur et rôle | Principales validations observées |
|---|---|---|
| `AttendanceHistoryQueryDto` | `AttendanceController`, query des deux historiques | `month` facultatif conforme à `YYYY-MM` |
| `CheckInSecurityProofDto` | Objet imbriqué partagé par les quatre DTO de pointage | Latitude -90 à 90, longitude -180 à 180, précision 0 à 50 000, photo Data URL image et longueur maximale 1 000 000 |
| `CheckInSecurityDto` | Classe de base des quatre DTO de pointage | `security` facultatif, validation imbriquée et conversion vers `CheckInSecurityProofDto` |
| `CheckInDto` | Body de `POST /attendance/check-in` | `employeeId` UUID; date ISO facultative; notes chaîne de 200 caractères au maximum; sécurité héritée |
| `CheckOutDto` | Body de `POST /attendance/check-out` | `employeeId` UUID; date ISO facultative; sécurité héritée |
| `SelfCheckInDto` | Body de `POST /attendance/me/check-in` | Date ISO facultative; notes chaîne de 200 caractères au maximum; sécurité héritée |
| `SelfCheckOutDto` | Body de `POST /attendance/me/check-out` | Date ISO facultative; notes chaîne de 200 caractères au maximum; sécurité héritée |
| `MonthlyAttendanceExportQueryDto` | Query de `GET /attendance/exports/monthly` | Mois entier 1 à 12, année entière 2000 à 2100, format facultatif `csv` ou `pdf`, `employeeId` UUID facultatif |

Le caractère facultatif de `security` dans les DTO est distinct des exigences appliquées ensuite par `AttendanceSecurityService` aux pointages personnels.

### 4.3 Calendrier

| DTO | Contrôleur et rôle | Principales validations observées |
|---|---|---|
| `CalendarMonthQueryDto` | Query de `GET /calendar/month` et `/calendar/holidays` | `month` facultatif, chaîne conforme à `YYYY-MM` |
| `CreateCalendarEntryDto` | Body de `POST /calendar/holidays` | Nom chaîne de 120 caractères au maximum, date ISO, description facultative de 500 caractères au maximum, type `PUBLIC_HOLIDAY` ou `COMPANY_HOLIDAY` |
| `UpdateCalendarEntryDto` | Body de `PATCH /calendar/holidays/:id` | Les quatre champs de création sont facultatifs et conservent leurs validations |

### 4.4 Employés

| DTO | Contrôleur et rôle | Principales validations observées |
|---|---|---|
| `CreateEmployeeDto` | Body de `POST /employees` | PIN facultatif de quatre chiffres hors liste interdite; prénoms, nom et fonction limités à 80; email; rôle d'accès enum; mot de passe 8 à 128; département 80; booléen actif; horaire UUID |
| `UpdateEmployeeDto` | Body de `PATCH /employees/:id` | Tous les champs facultatifs; validations de création correspondantes; PIN, département et horaire acceptent `null` selon leurs conditions |
| `UpdateEmployeeStatusDto` | Body de `PATCH /employees/:id/status` | `isActive` booléen obligatoire |
| `AssignEmployeeRoleDto` | Body de `PATCH /employees/:id/role` | `role` chaîne obligatoire de 80 caractères au maximum |
| `AssignEmployeeDepartmentDto` | Body de `PATCH /employees/:id/department` | `department` facultatif, chaîne de 80 caractères au maximum ou `null` |
| `AssignEmployeeScheduleDto` | Body de `PATCH /employees/:id/schedule` | `scheduleId` facultatif, UUID ou `null` |

Les PIN `0000`, `1111`, `1234`, `4321` et `9999` sont refusés dans `CreateEmployeeDto` et `UpdateEmployeeDto`. Le format exigé est une chaîne de quatre chiffres.

### 4.5 Sanctions

| DTO | Contrôleur et rôle | Principales validations observées |
|---|---|---|
| `MonthlySanctionsQueryDto` | Query de `GET /sanctions/monthly` | `month` facultatif au format `YYYY-MM`; `employeeId` facultatif validé comme chaîne, sans `IsUUID` |
| `UpdateSanctionRuleDto` | Body de `PATCH /sanctions/rules/:id` | Champs tous facultatifs; booléen actif; chaînes nom et description; bornes, tolérance, montant et priorité entiers avec minimum 0 |

Les relations entre bornes, les valeurs actuelles et les chevauchements de plages sont contrôlés ensuite par `SanctionsService`.

### 4.6 Plannings

| DTO | Contrôleur et rôle | Principales validations observées |
|---|---|---|
| `CreateScheduleDto` | Body de `POST /schedules` | Nom chaîne de 80 caractères au maximum; heures `HH:mm`; marge entière 0 à 180; état booléen; tableau non vide de jours uniques et autorisés |
| `UpdateScheduleDto` | Body de `PATCH /schedules/:id` | `PartialType(CreateScheduleDto)` rend tous les champs facultatifs en conservant leurs validations |
| `UpdateScheduleStatusDto` | Body de `PATCH /schedules/:id/status` | `isActive` booléen obligatoire |

Les jours autorisés sont `MONDAY`, `TUESDAY`, `WEDNESDAY`, `THURSDAY`, `FRIDAY`, `SATURDAY` et `SUNDAY`. La comparaison entre heure de début et heure de fin est effectuée dans `SchedulesService`, pas dans le DTO.

## 5. Décorateurs de validation

| Décorateur | Utilisation réellement observée |
|---|---|
| `IsString` | Textes, mots de passe, PIN, mois, notes, département et identifiant Sanctions |
| `IsEmail` | Email du login et des DTO Employé |
| `IsEnum` | `AccessRole` dans les DTO Employé |
| `IsBoolean` | États actifs des employés, plannings et règles |
| `IsInt` | Mois, année, marge de retard et valeurs numériques de sanction |
| `IsNumber` | Latitude, longitude et précision GPS |
| `IsUUID` | Identifiants employé ou horaire dans les DTO et filtre d'export |
| `IsDateString` | Dates de pointage et d'événement calendrier |
| `IsArray` | Tableau `workDays` |
| `IsIn` | Types de calendrier, formats d'export et chaque valeur de `workDays` |
| `IsNotIn` | PIN faibles explicitement interdits |
| `IsOptional` | Champs pouvant être omis; utilisé aussi avec certains champs nullables |
| `Matches` | Mois `YYYY-MM`, PIN à quatre chiffres, heures `HH:mm` et Data URL image |
| `MinLength` | Mots de passe d'au moins 8 caractères |
| `MaxLength` | Mots de passe, identités, textes, notes et photo Data URL |
| `Min` | Bornes numériques minimales des exports, coordonnées, précision, planning et sanctions |
| `Max` | Bornes numériques maximales des exports, coordonnées, précision et marge de retard |
| `ArrayMinSize` | Au moins un jour dans `workDays` |
| `ArrayUnique` | Absence de doublon dans `workDays` |
| `ValidateIf` | Ignore les validations de type ou UUID lorsque les champs Employé nullables valent `null` |
| `ValidateNested` | Validation de l'objet `security` imbriqué |

## 6. Transformations

### 6.1 `Type()`

| Cible | Transformation observée |
|---|---|
| `latitude` | `@Type(() => Number)` avant `IsNumber`, `Min` et `Max` |
| `longitude` | `@Type(() => Number)` avant `IsNumber`, `Min` et `Max` |
| `accuracyMeters` | `@Type(() => Number)` avant `IsNumber`, `Min` et `Max` |
| `security` | `@Type(() => CheckInSecurityProofDto)` pour instancier et valider l'objet imbriqué |

### 6.2 `Transform()`

| DTO et champ | Transformation exacte |
|---|---|
| `CheckInSecurityProofDto.verificationPhotoDataUrl` | Chaîne composée uniquement d'espaces ou vide transformée en `undefined` |
| `UpdateEmployeeDto.pinCode` | Chaîne exactement vide transformée en `null` |
| `UpdateEmployeeDto.department` | Chaîne exactement vide transformée en `null` |
| `UpdateEmployeeDto.scheduleId` | Chaîne exactement vide transformée en `null` |
| `AssignEmployeeDepartmentDto.department` | Chaîne exactement vide transformée en `null` |
| `AssignEmployeeScheduleDto.scheduleId` | Chaîne exactement vide transformée en `null` |

Les transformations Employé ne suppriment pas les espaces d'une chaîne non vide. Le service normalise séparément le PIN avec `trim()` avant ses contrôles métier.

### 6.3 Transformation implicite et `PartialType`

La transformation implicite globale convertit les Query Parameters `month` et `year` de l'export mensuel vers des nombres avant `IsInt`. `PartialType` de `@nestjs/mapped-types` copie les métadonnées de validation de `CreateScheduleDto` et rend les propriétés facultatives dans `UpdateScheduleDto`.

Aucun décorateur `Transform` n'est présent dans les DTO Calendar, Auth, Sanctions ou Schedules.

## 7. Flux de validation

```text
Requête client
      |
      v
Gardes globaux
      |
      v
Résolution des arguments du contrôleur
      |
      +--> Paramètre de chemin -> ParseUUIDPipe lorsqu'il est déclaré
      |
      +--> Body ou Query -> ValidationPipe global
                              |
                              v
                    transformation vers le DTO
                              |
                              v
                    décorateurs class-validator
                              |
                 +------------+------------+
                 |                         |
                 v                         v
          erreur HTTP 400           Controller
                                           |
                                           v
                              Service et validations métier
```

Les gardes globaux sont évalués avant l'exécution des pipes du handler. Une validation échouée empêche l'appel du contrôleur et du service.

## 8. Traçabilité

| Mécanisme | Fichier ou répertoire source | Preuve observée |
|---|---|---|
| Pipe global | `apps/backend/src/main.ts` | Quatre options actives de `ValidationPipe` |
| Dépendances | `apps/backend/package.json` | `class-validator`, `class-transformer` et `@nestjs/mapped-types` |
| Auth DTO | `apps/backend/src/modules/auth/dto/`, `apps/backend/src/modules/auth/auth.controller.ts` | Deux DTO de body et leurs routes |
| Attendance DTO | `apps/backend/src/modules/attendance/dto/`, `apps/backend/src/modules/attendance/attendance.controller.ts` | Historique, export et quatre pointages |
| Calendar DTO | `apps/backend/src/modules/calendar/dto/`, `apps/backend/src/modules/calendar/calendar.controller.ts` | Mois, création et modification |
| Employees DTO | `apps/backend/src/modules/employees/dto/`, `apps/backend/src/modules/employees/employees.controller.ts` | Six DTO de création et modification |
| Sanctions DTO | `apps/backend/src/modules/sanctions/dto/`, `apps/backend/src/modules/sanctions/sanctions.controller.ts` | Query mensuelle et règle |
| Schedules DTO | `apps/backend/src/modules/schedules/dto/`, `apps/backend/src/modules/schedules/schedules.controller.ts` | Création, modification partielle et statut |
| PIN partagé | `apps/backend/src/common/validation/pin-code.validation.ts` | Expression régulière, liste interdite et message |
| Contrôles métier Employés | `apps/backend/src/modules/employees/employees.service.ts` | PIN, unicité et existence de l'horaire |
| Contrôles métier Plannings | `apps/backend/src/modules/schedules/schedules.service.ts` | Ordre des heures et unicité du nom |
| Contrôles métier Pointage | `apps/backend/src/modules/attendance/attendance.service.ts`, `apps/backend/src/modules/attendance/attendance-security.service.ts` | Chronologie, état et sécurité |
| Contrôles métier Calendrier | `apps/backend/src/modules/calendar/calendar.service.ts` | Dates, mois, existence et doublons |
| Contrôles métier Sanctions | `apps/backend/src/modules/sanctions/sanctions.service.ts` | Bornes, valeurs et chevauchements |
| Tests de validation | `apps/backend/test/app.e2e-spec.ts`, `apps/backend/test/calendar.e2e-spec.ts`, `apps/backend/test/sanctions.e2e-spec.ts` | Corps et queries valides ou rejetés |
| Documentation recoupée | `documentation/07-API-Reference/03-Gestion-des-utilisateurs.md`, `documentation/07-API-Reference/05-Plannings.md`, `documentation/07-API-Reference/06-Pointage.md`, `documentation/07-API-Reference/09-Gestion-des-erreurs.md` | Contrats comparés aux sources actives |

## 9. Observations

- Le dépôt contient 24 classes DTO et aucun pipe personnalisé.
- Les DTO portent directement ou héritent de métadonnées `class-validator`; seules les familles Attendance et Employees utilisent directement `class-transformer`.
- La validation globale rejette les propriétés non déclarées.
- Les Query Parameters numériques de l'export reposent sur la conversion implicite globale.
- `UpdateScheduleDto` est le seul DTO dérivé avec `PartialType`.
- `MonthlySanctionsQueryDto.employeeId` est une chaîne facultative sans validation UUID.
- Le paramètre de chemin `attendanceId` du contrôleur Sanctions n'utilise pas `ParseUUIDPipe`.
- Les validations dépendant de la base ou de plusieurs champs sont exécutées dans les services après validation des DTO.
