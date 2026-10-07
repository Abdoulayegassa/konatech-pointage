# Developer Guide — Base de données (Prisma)

| Métadonnée | Valeur |
|---|---|
| Document ID | DG-007 |
| Titre | Base de données (Prisma) |
| Version | 1.0 |
| Statut | Validé |
| Classification | Interne |
| Référence | Developer Guide |
| Projet | Konatech Pointage |

## 1. Présentation

La couche de données de Konatech Pointage utilise PostgreSQL et Prisma. Le schéma Prisma définit les modèles, énumérations, relations, contraintes et index. Prisma Client fournit l'API d'accès aux données utilisée par les services NestJS.

Les fichiers se trouvent dans `apps/backend/prisma/` et dans `apps/backend/src/common/prisma/`. Le dépôt contient le schéma actif, vingt migrations SQL, un seed TypeScript, la configuration Prisma et un service NestJS global.

## 2. Architecture de la couche données

Les contrôleurs backend délèguent les traitements aux services. Les services qui manipulent des données injectent `PrismaService`. Cette classe étend `PrismaClient`, généré depuis `schema.prisma`. Le client utilise `DATABASE_URL` pour atteindre PostgreSQL.

```text
Contrôleur NestJS
        |
        v
Service du domaine
        |
        | injection
        v
PrismaService
extends PrismaClient
        |
        | requêtes générées
        v
PostgreSQL
        |
        v
Tables Employee, Schedule, Attendance,
CalendarEntry et SanctionRule
```

`PrismaModule` est global, fournit `PrismaService` et l'exporte. Les sélections communes de données publiques sont regroupées dans `apps/backend/src/common/prisma/selects.ts`.

## 3. Configuration Prisma

### 3.1 Datasource

La datasource active est déclarée dans `apps/backend/prisma/schema.prisma` :

| Élément | Valeur observée |
|---|---|
| Nom | `db` |
| Fournisseur | `postgresql` |
| URL | Variable `DATABASE_URL` |

`apps/backend/prisma.config.ts` lit également `DATABASE_URL` au moyen de `env()` et associe cette valeur à la datasource des commandes Prisma.

### 3.2 Générateur

| Élément | Valeur observée |
|---|---|
| Nom | `client` |
| Provider | `prisma-client-js` |
| Cibles binaires | `native`, `debian-openssl-3.0.x` |

Le package `@prisma/client` est déclaré en version `^6.0.0` dans `apps/backend/package.json`. Le CLI `prisma` utilise la même plage de version.

### 3.3 Organisation

```text
apps/backend/
├── prisma.config.ts
├── prisma/
│   ├── schema.prisma
│   ├── seed.ts
│   └── migrations/
│       └── <horodatage>_<nom>/migration.sql
└── src/common/prisma/
    ├── prisma.module.ts
    ├── prisma.service.ts
    └── selects.ts
```

### 3.4 Prisma Client

`PrismaService` étend directement `PrismaClient` et implémente `OnModuleDestroy`. Sa méthode de destruction appelle `$disconnect()`. Aucune méthode `onModuleInit()` ni appel explicite à `$connect()` n'est défini dans cette classe.

Les scripts de génération présents sont `prisma:generate` dans les manifestes racine et backend. Le Dockerfile backend génère également le client avant le build NestJS.

## 4. Modèles de données

| Modèle | Description | Relations |
|---|---|---|
| `Employee` | Identité, authentification, rôle d'accès, département, statut actif et affectation d'horaire | Horaire facultatif, plusieurs présences, plusieurs événements de calendrier |
| `Schedule` | Nom, heures de début et fin, marge de retard, état actif et jours de travail JSON | Plusieurs employés peuvent référencer le même horaire |
| `Attendance` | Journée de présence, entrée, sortie, statut, retards, absences, heures, instantané d'horaire et preuves conditionnelles | Appartient obligatoirement à un employé |
| `CalendarEntry` | Événement RH daté, typé, décrit et activable | Peut appartenir à un employé ou rester sans employé |
| `SanctionRule` | Règle de sanction paramétrée par type, seuils, tolérance, montant, période et priorité | Aucune relation Prisma déclarée |

### 4.1 Identifiants et unicité

Tous les modèles utilisent un champ `id` de type `String`, clé primaire, avec une valeur UUID par défaut.

| Modèle | Contraintes uniques observées |
|---|---|
| `Employee` | `employeeCode`, `employeeIdentifier`, `pinCode`, `email` |
| `Schedule` | `name` |
| `Attendance` | Combinaison `employeeId` et `date` |
| `CalendarEntry` | Aucune contrainte unique supplémentaire |
| `SanctionRule` | Aucune contrainte unique supplémentaire |

`employeeCode` et `pinCode` sont facultatifs malgré leur contrainte unique. `employeeIdentifier` et `email` sont obligatoires.

### 4.2 Index

| Modèle | Index déclarés dans le schéma |
|---|---|
| `Attendance` | `date`, `checkInDistanceMeters`, `checkInVerificationLevel`, `checkOutDistanceMeters`, `checkOutVerificationLevel`, `earlyExit`, `lateExit`, `overtimeHours`, `absenceCount` |
| `CalendarEntry` | `date`, `type`, `employeeId` |
| `SanctionRule` | combinaison `type, active`; `priority` |
| `Employee` | Index uniques correspondant aux champs uniques |
| `Schedule` | Index unique correspondant à `name` |

### 4.3 Énumérations

| Énumération | Valeurs observées |
|---|---|
| `AttendanceStatus` | `PRESENT`, `LATE`, `INCOMPLETE`, `ABSENT`, `NON_WORKING_DAY_WORK` |
| `AccessRole` | `ADMIN`, `EMPLOYEE` |
| `AttendanceVerificationMethod` | `NONE`, `GPS`, `PHOTO` |
| `AttendanceVerificationLevel` | `OK`, `WARNING`, `STRICT` |
| `CalendarEntryType` | `PUBLIC_HOLIDAY`, `COMPANY_HOLIDAY`, `LEAVE`, `EXTERNAL_MISSION` |
| `SanctionRuleType` | `MINOR_LATENESS`, `MAJOR_LATENESS`, `EARLY_DEPARTURE`, `UNJUSTIFIED_ABSENCE`, `JUSTIFIED_ABSENCE`, `LEAVE`, `EXTERNAL_MISSION` |
| `SanctionPeriod` | `MONTHLY` |

## 5. Relations entre les modèles

### 5.1 Relations un-à-plusieurs

| Parent | Enfant | Clé étrangère | Caractère | Suppression du parent |
|---|---|---|---|---|
| `Schedule` | `Employee` | `Employee.scheduleId` | Facultative côté employé | `SET NULL` |
| `Employee` | `Attendance` | `Attendance.employeeId` | Obligatoire côté présence | `CASCADE` |
| `Employee` | `CalendarEntry` | `CalendarEntry.employeeId` | Facultative côté événement | `SET NULL` |

Les migrations SQL déclarent `ON UPDATE CASCADE` pour ces trois clés étrangères.

```text
Schedule (1)
    |
    | scheduleId facultatif
    v
Employee (0..n)
    |
    +-------------------------+
    |                         |
    | employeeId obligatoire  | employeeId facultatif
    v                         v
Attendance (0..n)       CalendarEntry (0..n)

SanctionRule
    `-- aucune relation Prisma déclarée
```

### 5.2 Relations absentes

Le schéma ne déclare aucune relation un-à-un ni plusieurs-à-plusieurs. Il ne contient aucune table de jointure explicite. Les champs d'instantané d'horaire du modèle `Attendance` sont des valeurs simples et ne constituent pas une relation vers `Schedule`.

## 6. Migrations

### 6.1 Organisation et commandes

Chaque migration se trouve dans un sous-répertoire horodaté de `apps/backend/prisma/migrations/` et contient un fichier `migration.sql`. Le dépôt en contient vingt.

Les scripts racine disponibles sont :

```bash
pnpm prisma:status
pnpm prisma:migrate
pnpm prisma:migrate:deploy
pnpm prisma:generate
```

`prisma:migrate` exécute `prisma migrate dev`. `prisma:migrate:deploy` exécute `prisma migrate deploy`. L'image backend utilise cette seconde commande avant de démarrer NestJS.

### 6.2 Historique présent

| Migration | Modification observée |
|---|---|
| `20260416140000_init` | Création de `Schedule`, `Employee`, `Attendance`, du statut initial, des clés et premiers index |
| `20260416163000_add_auth_to_employee` | Ajout de `AccessRole` et `passwordHash` |
| `20260416190000_refine_attendance_status_flow` | Conversion des valeurs de `AttendanceStatus` vers le flux actuel de base |
| `20260416203000_enhance_schedule_management` | Ajout de la marge de retard et de l'état actif des horaires |
| `20260420120000_smart_attendance_security` | Ajout des données GPS/photo d'entrée et de la méthode de vérification |
| `20260420170000_attendance_verification_levels` | Ajout du niveau de vérification d'entrée |
| `20260420190000_attendance_photo_cloudinary_metadata` | Ajout de l'identifiant public de photo d'entrée |
| `20260421100000_checkout_smart_security` | Ajout des données de sécurité de sortie et de leurs index |
| `20260423100000_attendance_exit_outcomes` | Ajout de l'heure de sortie prévue, des heures supplémentaires et de la sortie tardive |
| `20260423110000_attendance_absence_count_indexes` | Ajout du compteur d'absences et des index associés aux agrégats |
| `20260424120000_checkout_outcome_clarity` | Ajout du départ anticipé, de ses minutes et des minutes supplémentaires |
| `20260427120000_add_employee_pin_code` | Ajout du PIN et de son index unique |
| `20260429110000_make_employee_code_optional` | Passage de `employeeCode` en champ facultatif |
| `20260506120000_add_employee_identifier` | Création, remplissage et unicité de `employeeIdentifier` |
| `20260506153000_add_employee_pin_code_hash` | Ajout de `pinCodeHash` |
| `20260507110000_add_attendance_outside_schedule_work` | Ajout de l'indicateur de travail hors horaire |
| `20260507123000_add_attendance_schedule_snapshots` | Ajout des champs d'instantané d'horaire |
| `20260623143000_add_hr_calendar_entries` | Création de `CalendarEntry`, de son énumération, de ses index et de sa relation employé |
| `20260623162000_add_non_working_day_work_status` | Ajout du statut `NON_WORKING_DAY_WORK` |
| `20260626190000_add_configurable_sanction_rules` | Création de `SanctionRule`, de ses énumérations, index et deux règles initiales |

Les migrations sont la preuve historique de l'évolution du schéma. `schema.prisma` représente sa définition actuelle.

## 7. Accès aux données

### 7.1 Services utilisant PrismaService

| Service | Modèles ou opérations observés |
|---|---|
| `AuthService` | Recherche et mise à jour d'employés pour les connexions et jetons |
| `EmployeesService` | Lecture, création, mise à jour et transactions sur les employés et horaires |
| `SchedulesService` | Lecture, création et mise à jour des horaires |
| `CalendarService` | Lecture, création, mise à jour et suppression des événements |
| `AttendanceService` | Lecture, création et mise à jour des employés et présences |
| `AttendanceMonthlyMetricsService` | Lecture d'employés et recalcul des présences mensuelles |
| `MonthlyAttendanceExportService` | Lecture des employés et présences pour les rapports |
| `DashboardService` | Comptages, agrégations, groupements et lectures d'employés ou présences |
| `SanctionsService` | Lecture et mise à jour des règles; lecture des présences |

Les scripts backend et le seed instancient aussi `PrismaClient` directement hors du conteneur d'injection NestJS.

### 7.2 Sélections partagées

`apps/backend/src/common/prisma/selects.ts` définit :

- `scheduleSelect` ;
- `publicEmployeeSelect` ;
- `employeeWithScheduleSelect` ;
- `scheduleWithEmployeesSelect` ;
- `attendanceWithEmployeeSelect` ;
- le type `PublicEmployee` dérivé de Prisma.

La sélection publique d'employé exclut les champs de mot de passe et de PIN. Les services réutilisent ces objets pour structurer les données retournées.

### 7.3 Flux d'accès

```text
Route HTTP
    |
    v
Contrôleur NestJS
    |
    v
Service métier
    |
    | injection par constructeur
    v
PrismaService global
    |
    | findUnique / findMany / create / update
    | updateMany / count / aggregate / groupBy / transaction
    v
Prisma Client généré
    |
    | DATABASE_URL
    v
PostgreSQL
    |
    v
Résultat typé ou erreur Prisma
    |
    v
Service -> Contrôleur -> Réponse HTTP
```

## 8. Seed de données

Le seed est configuré dans `apps/backend/prisma.config.ts` et exécuté depuis `apps/backend/prisma/seed.ts` avec ts-node.

Commande racine :

```bash
pnpm prisma:seed
```

Le mécanisme observé :

1. calcule des empreintes de mots de passe et de PIN avec les utilitaires backend ;
2. garantit la présence de deux règles de sanction par recherche puis mise à jour ou création ;
3. applique un `upsert` sur deux horaires identifiés par leur nom ;
4. applique un `upsert` sur cinq employés identifiés par leur e-mail ;
5. calcule des dates de présence à partir de la date de référence ;
6. applique un `upsert` sur les présences avec la clé composée `employeeId_date` ;
7. calcule les résultats de sortie, les absences et les instantanés d'horaire avec les utilitaires partagés.

La fonction `seedDatabase()` accepte un `PrismaClient` et une date de référence facultative. Elle retourne le nombre d'employés, d'horaires et de présences traités. Le point d'entrée crée son propre `PrismaClient` et appelle `$disconnect()` à la fin ou après une erreur.

Le seed ne crée pas de `CalendarEntry`. La migration de création des règles de sanction insère déjà deux règles initiales, et le seed les recherche par type et priorité avant de les mettre à jour ou de les créer.

## 9. Traçabilité

| Élément documenté | Fichier ou répertoire source | Preuve observée |
|---|---|---|
| Datasource et générateur | `apps/backend/prisma/schema.prisma` | PostgreSQL, `DATABASE_URL`, provider client et cibles binaires |
| Modèles | `apps/backend/prisma/schema.prisma` | Cinq blocs `model` |
| Énumérations | `apps/backend/prisma/schema.prisma` | Sept blocs `enum` |
| Relations | `apps/backend/prisma/schema.prisma` | Champs `@relation`, clés étrangères et actions de suppression |
| Contraintes et index | `apps/backend/prisma/schema.prisma` | `@unique`, `@@unique` et `@@index` |
| SQL relationnel | `apps/backend/prisma/migrations/` | Tables, index, clés étrangères et évolutions |
| Configuration CLI | `apps/backend/prisma.config.ts` | Schéma, migrations, seed et datasource |
| Dépendances Prisma | `apps/backend/package.json` | `prisma`, `@prisma/client` et scripts |
| Scripts racine | `package.json` | Génération, statut, migration, déploiement et seed |
| Module Prisma | `apps/backend/src/common/prisma/prisma.module.ts` | Module global, provider et export |
| Service Prisma | `apps/backend/src/common/prisma/prisma.service.ts` | Extension de `PrismaClient` et déconnexion |
| Sélections communes | `apps/backend/src/common/prisma/selects.ts` | Objets `select` typés |
| Usage par les services | `apps/backend/src/modules/` | Injection de `PrismaService` et opérations de données |
| Transactions | `apps/backend/src/modules/employees/employees.service.ts`, `apps/backend/scripts/create-initial-admin.ts` | Appels `$transaction` |
| Métriques de présence | `apps/backend/src/modules/attendance/attendance-monthly-metrics.service.ts` | Création et mise à jour de présences calculées |
| Seed | `apps/backend/prisma/seed.ts` | Upserts, règles, calculs et cycle du client |
| Docker PostgreSQL | `docker-compose.yml` | Image `postgres:16-alpine`, volume et healthcheck |
| Génération en image | `docker/backend.Dockerfile` | `prisma generate` avant le build |
| Migration au démarrage conteneurisé | `docker/backend.Dockerfile` | `prisma migrate deploy` avant NestJS |
| Structure backend | `documentation/06-Developer-Guide/06-Backend-NestJS.md` | Position de Prisma dans l'API |

## 10. Observations

- Le schéma actuel contient cinq modèles et sept énumérations.
- PostgreSQL est l'unique datasource déclarée.
- Prisma Client est l'unique client relationnel déclaré dans le backend.
- Tous les champs de clé primaire déclarent `@default(uuid())` dans le schéma.
- Le schéma comporte trois relations un-à-plusieurs et aucune relation un-à-un ou plusieurs-à-plusieurs.
- La suppression d'un employé supprime ses présences par cascade.
- La suppression d'un employé conserve ses événements de calendrier en annulant leur référence.
- La suppression d'un horaire conserve les employés en annulant leur affectation.
- Une seule présence peut exister par employé et par date selon la contrainte composée.
- `SanctionRule` n'a pas de relation déclarée avec `Attendance` ou `Employee`.
- Les instantanés d'horaire stockés dans `Attendance` ne portent pas de clé étrangère.
- `PrismaService` ferme le client à la destruction du module sans connexion explicite au démarrage.
- Les migrations et le seed sont deux mécanismes distincts, tous deux présents dans le dépôt.
- Le seed utilise des opérations répétables fondées sur des clés uniques ou une recherche type-priorité.
