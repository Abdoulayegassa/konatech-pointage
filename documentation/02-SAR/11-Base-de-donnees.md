# Base de données

| Métadonnée | Valeur |
|---|---|
| Document ID | SAR-DB-001 |
| Titre | Base de données |
| Version | 1.0 |
| Statut | Validé |
| Classification | Interne |
| Référence SAPDD | Architecture des données |
| Date de génération | 29 juillet 2026 |

## 1. Présentation

### 1.1 Objectif

La base de données de Konatech Pointage persiste les employés, leurs plannings, leurs pointages, le calendrier RH et les règles configurables de sanction. Elle constitue la source de données transactionnelle des modules NestJS.

### 1.2 Technologie

Le moteur déclaré est PostgreSQL. Prisma ORM fournit le schéma, les migrations, le client TypeScript et l'accès aux données. Les dépendances `prisma` et `@prisma/client` sont déclarées en version compatible `^6.0.0`.

### 1.3 Responsabilités

Les responsabilités constatées sont :

- persister l'identité et l'accès des employés ;
- représenter les horaires et jours de travail ;
- conserver un pointage journalier unique par employé ;
- conserver les données de vérification, de sortie et de contexte historique du planning ;
- représenter les événements du calendrier RH ;
- stocker les règles de sanction ;
- assurer les relations et comportements de suppression ;
- fournir des index aux requêtes métier ;
- gérer l'évolution du schéma par migrations SQL.

### 1.4 Périmètre

Le schéma contient cinq modèles :

1. `Employee` ;
2. `Schedule` ;
3. `Attendance` ;
4. `CalendarEntry` ;
5. `SanctionRule`.

Les concepts Département, Rapport, AuditLog, Permission, Notification et Sanction appliquée ne disposent pas de modèle propre dans le schéma actuel. Lorsqu'ils apparaissent fonctionnellement, ils sont représentés autrement : texte sur Employee, calcul à la demande ou journalisation applicative.

Implémentation principale :

- `apps/backend/prisma/schema.prisma`
- `apps/backend/prisma/migrations/`
- `apps/backend/src/common/prisma/`

## 2. Architecture générale

### 2.1 Prisma

`schema.prisma` centralise le datasource, le générateur, sept enums et cinq modèles. `prisma.config.ts` référence explicitement ce schéma, le répertoire des migrations, la commande de seed et `DATABASE_URL`.

### 2.2 PostgreSQL

Le datasource utilise `provider = "postgresql"`. Les migrations matérialisent les modèles en tables PostgreSQL, les enums Prisma en types enum PostgreSQL, `Json` en `JSONB`, `DateTime` en `TIMESTAMP(3)`, `Float` en `DOUBLE PRECISION` et `String` en `TEXT`.

### 2.3 Organisation des modèles

Le schéma est monofichier. Il ne comporte pas de découpage par domaine ni de schémas PostgreSQL nommés. Les relations relient Employee à Schedule, Attendance et CalendarEntry. SanctionRule est indépendant au niveau relationnel.

### 2.4 Migrations

Vingt répertoires horodatés contiennent chacun un `migration.sql`. L'historique commence par Employee, Schedule et Attendance, puis ajoute successivement authentification, sécurité de pointage, résultats de sortie, PIN, identifiant salarié, snapshots, calendrier et sanctions.

### 2.5 Client Prisma

Le générateur `prisma-client-js` produit `@prisma/client`. Les cibles binaires sont `native` et `debian-openssl-3.0.x`.

### 2.6 Intégration NestJS

`PrismaService` étend `PrismaClient` et se déconnecte dans `onModuleDestroy()`. `PrismaModule` est global et exporte ce service ; les modules métier l'injectent directement dans leurs services.

```text
schema.prisma + prisma.config.ts
             |
             +---- prisma generate ----> @prisma/client
             |
             +---- prisma migrate -----> PostgreSQL
                                             ^
                                             |
NestJS modules -> Services -> PrismaService --+
                           (PrismaClient)
```

Fichiers concernés :

- `apps/backend/prisma.config.ts`
- `apps/backend/prisma/schema.prisma`
- `apps/backend/src/common/prisma/prisma.module.ts`
- `apps/backend/src/common/prisma/prisma.service.ts`
- `apps/backend/src/app.module.ts`

## 3. Organisation des fichiers

### 3.1 Arborescence

```text
apps/backend/
├── prisma.config.ts
├── package.json
├── prisma/
│   ├── schema.prisma
│   ├── seed.ts
│   └── migrations/
│       ├── 20260416140000_init/migration.sql
│       ├── 20260416163000_add_auth_to_employee/migration.sql
│       ├── 20260416190000_refine_attendance_status_flow/migration.sql
│       ├── 20260416203000_enhance_schedule_management/migration.sql
│       ├── 20260420120000_smart_attendance_security/migration.sql
│       ├── 20260420170000_attendance_verification_levels/migration.sql
│       ├── 20260420190000_attendance_photo_cloudinary_metadata/migration.sql
│       ├── 20260421100000_checkout_smart_security/migration.sql
│       ├── 20260423100000_attendance_exit_outcomes/migration.sql
│       ├── 20260423110000_attendance_absence_count_indexes/migration.sql
│       ├── 20260424120000_checkout_outcome_clarity/migration.sql
│       ├── 20260427120000_add_employee_pin_code/migration.sql
│       ├── 20260429110000_make_employee_code_optional/migration.sql
│       ├── 20260506120000_add_employee_identifier/migration.sql
│       ├── 20260506153000_add_employee_pin_code_hash/migration.sql
│       ├── 20260507110000_add_attendance_outside_schedule_work/migration.sql
│       ├── 20260507123000_add_attendance_schedule_snapshots/migration.sql
│       ├── 20260623143000_add_hr_calendar_entries/migration.sql
│       ├── 20260623162000_add_non_working_day_work_status/migration.sql
│       └── 20260626190000_add_configurable_sanction_rules/migration.sql
├── scripts/
│   ├── backfill-attendance-schedule-snapshots.ts
│   ├── backfill-employee-pin-code-hashes.ts
│   └── create-initial-admin.ts
└── src/
    └── common/
        └── prisma/
            ├── prisma.module.ts
            ├── prisma.service.ts
            └── selects.ts
```

### 3.2 Rôle des fichiers

| Fichier | Rôle |
|---|---|
| `prisma.config.ts` | Chemins Prisma, datasource et commande seed |
| `schema.prisma` | Définition déclarative actuelle |
| `migrations/*/migration.sql` | Évolution SQL ordonnée |
| `seed.ts` | Jeu de données reproductible par upserts |
| `backfill-attendance-schedule-snapshots.ts` | Remplissage des snapshots de planning manquants |
| `backfill-employee-pin-code-hashes.ts` | Migration applicative des PIN en clair vers les hash |
| `create-initial-admin.ts` | Création contrôlée d'un administrateur initial |
| `prisma.module.ts` | Exposition globale du client |
| `prisma.service.ts` | Cycle de vie NestJS du client |
| `selects.ts` | Projections Prisma partagées et types associés |
| `package.json` | Scripts generate, migrate, deploy, seed et backfills |

### 3.3 Seed

Le seed existe. Il crée ou met à jour les règles de sanction par défaut, deux plannings, plusieurs employés et des pointages de démonstration. Il utilise des hash de mot de passe et de PIN et construit les snapshots de planning des pointages.

## 4. Configuration Prisma

### 4.1 Datasource

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

`prisma.config.ts` lit également `DATABASE_URL` au moyen de `env()`.

### 4.2 Générateur

```prisma
generator client {
  provider      = "prisma-client-js"
  binaryTargets = ["native", "debian-openssl-3.0.x"]
}
```

### 4.3 Options de configuration

| Option | Valeur |
|---|---|
| Schéma | `prisma/schema.prisma` |
| Répertoire migrations | `prisma/migrations` |
| Seed | `node --require ts-node/register/transpile-only prisma/seed.ts` |
| Datasource URL | `DATABASE_URL` |
| Provider client | `prisma-client-js` |
| Binary targets | `native`, `debian-openssl-3.0.x` |

### 4.4 Commandes déclarées

| Script | Commande logique |
|---|---|
| `prisma:generate` | `prisma generate` |
| `prisma:migrate` | `prisma migrate dev` |
| `prisma:migrate:deploy` | `prisma migrate deploy` |
| `prisma:seed` | `prisma db seed` |
| `admin:create` | script administrateur initial |
| `pins:backfill` | script de hash des PIN |
| `snapshots:backfill` | script de snapshots |

Fichiers concernés :

- `apps/backend/prisma.config.ts`
- `apps/backend/prisma/schema.prisma`
- `apps/backend/package.json`

## 5. Modèles de données

### 5.1 Vue récapitulative

| Modèle | Objectif | Nombre de champs scalaires | Relations |
|---|---|---:|---|
| `Employee` | Identité, accès et affectation | 16 | Schedule, Attendance, CalendarEntry |
| `Schedule` | Horaire et jours de travail | 9 | Employee |
| `Attendance` | Pointage journalier et preuves | 43 | Employee |
| `CalendarEntry` | Événement du calendrier RH | 9 | Employee |
| `SanctionRule` | Règle configurable de sanction | 17 | Aucune |

Les champs relationnels virtuels Prisma ne correspondent pas à des colonnes supplémentaires.

### 5.2 Employee

#### Objectif et responsabilités

`Employee` représente simultanément le salarié, son compte authentifiable, son rôle d'accès, son affectation organisationnelle et son planning courant.

| Champ | Type Prisma | Null | Défaut / attribut | Responsabilité |
|---|---|:---:|---|---|
| `id` | String | Non | `@id @default(uuid())` | Clé primaire |
| `employeeCode` | String | Oui | `@unique` | Ancien code salarié facultatif |
| `employeeIdentifier` | String | Non | `@unique` | Identifiant salarié actuel |
| `pinCode` | String | Oui | `@unique` | PIN historique en clair |
| `pinCodeHash` | String | Oui | Aucun | Hash du PIN |
| `firstName` | String | Non | Aucun | Prénom |
| `lastName` | String | Non | Aucun | Nom |
| `email` | String | Non | `@unique` | Identifiant de connexion |
| `role` | String | Non | Aucun | Intitulé métier libre |
| `accessRole` | AccessRole | Non | `EMPLOYEE` | Rôle RBAC |
| `passwordHash` | String | Non | Aucun | Hash du mot de passe |
| `department` | String | Oui | Aucun | Département sous forme textuelle |
| `isActive` | Boolean | Non | `true` | Activation du compte |
| `scheduleId` | String | Oui | Aucun | Clé étrangère vers Schedule |
| `createdAt` | DateTime | Non | `now()` | Création |
| `updatedAt` | DateTime | Non | `@updatedAt` | Dernière modification |

Relations :

- `schedule: Schedule?` via `scheduleId`, suppression `SetNull` ;
- `attendances: Attendance[]` ;
- `calendarEntries: CalendarEntry[]`.

### 5.3 Schedule

#### Objectif et responsabilités

`Schedule` définit un horaire réutilisable et les jours de semaine travaillés.

| Champ | Type Prisma | Null | Défaut / attribut | Responsabilité |
|---|---|:---:|---|---|
| `id` | String | Non | `@id @default(uuid())` | Clé primaire |
| `name` | String | Non | `@unique` | Nom du planning |
| `startTime` | String | Non | Aucun | Heure de début textuelle |
| `endTime` | String | Non | Aucun | Heure de fin textuelle |
| `latenessMarginMinutes` | Int | Non | `0` | Marge de retard |
| `isActive` | Boolean | Non | `true` | Activation |
| `workDays` | Json | Non | Aucun | Liste de jours travaillés |
| `createdAt` | DateTime | Non | `now()` | Création |
| `updatedAt` | DateTime | Non | `@updatedAt` | Dernière modification |

Relation :

- `employees: Employee[]`, relation inverse de `Employee.schedule`.

### 5.4 Attendance

#### Objectif et responsabilités

`Attendance` représente l'état journalier de présence d'un employé. Il contient les heures, résultats calculés, informations de sécurité d'entrée et de sortie, et un snapshot du planning applicable.

| Champ | Type Prisma | Null | Défaut / attribut | Responsabilité |
|---|---|:---:|---|---|
| `id` | String | Non | `@id @default(uuid())` | Clé primaire |
| `employeeId` | String | Non | FK | Employé |
| `date` | DateTime | Non | Aucun | Jour normalisé du pointage |
| `clockInAt` | DateTime | Oui | Aucun | Heure d'entrée |
| `clockOutAt` | DateTime | Oui | Aucun | Heure de sortie |
| `outsideScheduleWork` | Boolean | Non | `false` | Travail hors planning |
| `scheduledExitTime` | DateTime | Oui | Aucun | Fin planifiée résolue |
| `earlyExit` | Boolean | Non | `false` | Sortie anticipée |
| `earlyExitMinutes` | Int | Non | `0` | Minutes anticipées |
| `overtimeHours` | Float | Non | `0` | Heures supplémentaires décimales |
| `overtimeMinutes` | Int | Non | `0` | Minutes supplémentaires |
| `lateExit` | Boolean | Non | `false` | Sortie tardive |
| `absenceCount` | Int | Non | `0` | Compteur d'absence stocké |
| `status` | AttendanceStatus | Non | `INCOMPLETE` | Statut de présence |
| `minutesLate` | Int | Non | `0` | Minutes de retard |
| `notes` | String | Oui | Aucun | Commentaire |
| `scheduleIdSnapshot` | String | Oui | Aucun | ID historique du planning, sans FK |
| `scheduleNameSnapshot` | String | Oui | Aucun | Nom historique |
| `scheduleStartTimeSnapshot` | String | Oui | Aucun | Début historique |
| `scheduleEndTimeSnapshot` | String | Oui | Aucun | Fin historique |
| `scheduleWorkDaysSnapshot` | Json | Oui | Aucun | Jours historiques |
| `scheduleLatenessMarginSnapshot` | Int | Oui | Aucun | Marge historique |
| `scheduleCapturedAt` | DateTime | Oui | Aucun | Instant de capture |
| `checkInLatitude` | Float | Oui | Aucun | Latitude d'entrée |
| `checkInLongitude` | Float | Oui | Aucun | Longitude d'entrée |
| `checkInAccuracyMeters` | Float | Oui | Aucun | Précision GPS d'entrée |
| `checkInDistanceMeters` | Int | Oui | Index | Distance d'entrée |
| `checkInVerificationMethod` | AttendanceVerificationMethod | Non | `NONE` | Méthode d'entrée |
| `checkInVerificationLevel` | AttendanceVerificationLevel | Non | `OK` | Niveau d'entrée |
| `checkInVerificationReason` | String | Oui | Aucun | Motif d'entrée |
| `checkInVerificationPhoto` | String | Oui | Aucun | URL de photo d'entrée |
| `checkInVerificationPhotoPublicId` | String | Oui | Aucun | ID stockage photo entrée |
| `checkOutLatitude` | Float | Oui | Aucun | Latitude de sortie |
| `checkOutLongitude` | Float | Oui | Aucun | Longitude de sortie |
| `checkOutAccuracyMeters` | Float | Oui | Aucun | Précision GPS de sortie |
| `checkOutDistanceMeters` | Int | Oui | Index | Distance de sortie |
| `checkOutVerificationMethod` | AttendanceVerificationMethod | Non | `NONE` | Méthode de sortie |
| `checkOutVerificationLevel` | AttendanceVerificationLevel | Non | `OK` | Niveau de sortie |
| `checkOutVerificationReason` | String | Oui | Aucun | Motif de sortie |
| `checkOutVerificationPhoto` | String | Oui | Aucun | URL de photo de sortie |
| `checkOutVerificationPhotoPublicId` | String | Oui | Aucun | ID stockage photo sortie |
| `createdAt` | DateTime | Non | `now()` | Création |
| `updatedAt` | DateTime | Non | `@updatedAt` | Dernière modification |

Relation :

- `employee: Employee` via `employeeId`, suppression `Cascade`.

Contrainte composite :

- `@@unique([employeeId, date])`.

### 5.5 CalendarEntry

#### Objectif et responsabilités

`CalendarEntry` représente une date RH typée, globale ou liée à un employé.

| Champ | Type Prisma | Null | Défaut / attribut | Responsabilité |
|---|---|:---:|---|---|
| `id` | String | Non | `@id @default(uuid())` | Clé primaire |
| `name` | String | Non | Aucun | Nom |
| `description` | String | Oui | Aucun | Description |
| `date` | DateTime | Non | Index | Date |
| `type` | CalendarEntryType | Non | Index | Type d'événement |
| `employeeId` | String | Oui | FK, index | Employé facultatif |
| `isActive` | Boolean | Non | `true` | Activation |
| `createdAt` | DateTime | Non | `now()` | Création |
| `updatedAt` | DateTime | Non | `@updatedAt` | Dernière modification |

Relation :

- `employee: Employee?` via `employeeId`, suppression `SetNull`.

### 5.6 SanctionRule

#### Objectif et responsabilités

`SanctionRule` stocke une règle paramétrable, ses seuils de retard, sa tolérance mensuelle, son montant et ses libellés de résultat.

| Champ | Type Prisma | Null | Défaut / attribut | Responsabilité |
|---|---|:---:|---|---|
| `id` | String | Non | `@id @default(uuid())` | Clé primaire |
| `type` | SanctionRuleType | Non | Index composite | Type |
| `name` | String | Non | Aucun | Nom |
| `description` | String | Oui | Aucun | Description |
| `active` | Boolean | Non | `true`, index composite | Activation |
| `latenessMinMinutes` | Int | Oui | Aucun | Seuil minimal |
| `latenessMinInclusive` | Boolean | Non | `true` | Inclusion du minimum |
| `latenessMaxMinutes` | Int | Oui | Aucun | Seuil maximal |
| `latenessMaxInclusive` | Boolean | Non | `false` | Inclusion du maximum |
| `monthlyTolerance` | Int | Non | `0` | Tolérance mensuelle |
| `amountFcfa` | Int | Non | `0` | Montant FCFA |
| `period` | SanctionPeriod | Non | `MONTHLY` | Période |
| `priority` | Int | Non | `100`, index | Ordre de priorité |
| `appliedReason` | String | Non | Aucun | Motif si appliquée |
| `toleratedReason` | String | Oui | Aucun | Motif si tolérée |
| `createdAt` | DateTime | Non | `now()` | Création |
| `updatedAt` | DateTime | Non | `@updatedAt` | Dernière modification |

Aucune relation Prisma n'est déclarée sur ce modèle.

## 6. Relations

### 6.1 Tableau des relations

| Parent | Enfant | Cardinalité | FK | Null | Suppression | Mise à jour |
|---|---|---|---|:---:|---|---|
| Schedule | Employee | 1 vers 0..n | `Employee.scheduleId` | Oui | `SET NULL` | `CASCADE` |
| Employee | Attendance | 1 vers 0..n | `Attendance.employeeId` | Non | `CASCADE` | `CASCADE` |
| Employee | CalendarEntry | 1 vers 0..n | `CalendarEntry.employeeId` | Oui | `SET NULL` | `CASCADE` |

### 6.2 One-to-One

Aucune relation un-à-un n'est déclarée.

### 6.3 One-to-Many

Les trois relations sont un-à-plusieurs. Chaque Employee possède au plus un Schedule courant, tandis qu'un Schedule peut être affecté à plusieurs Employee.

### 6.4 Many-to-Many

Aucune table de jointure et aucune relation plusieurs-à-plusieurs ne sont présentes.

### 6.5 Diagramme

```text
+------------+       1       0..n +------------+
| Schedule   |<-------------------| Employee   |
+------------+ scheduleId nullable+-----+------+
                                       |
                        +--------------+--------------+
                        | 1                           | 1
                        |                             |
                        v 0..n                        v 0..n
                 +-------------+              +---------------+
                 | Attendance  |              | CalendarEntry |
                 +-------------+              +---------------+
                 employeeId NOT NULL          employeeId nullable
                 ON DELETE CASCADE             ON DELETE SET NULL

+--------------+
| SanctionRule |  aucune relation déclarée
+--------------+
```

### 6.6 Snapshots sans relation

`Attendance.scheduleIdSnapshot` contient un identifiant historique textuel, mais n'est pas une clé étrangère. Les autres champs `schedule*Snapshot` copient les attributs du planning au moment du pointage.

## 7. Énumérations

| Enum | Rôle | Valeurs | Utilisation |
|---|---|---|---|
| `AttendanceStatus` | État du pointage | `PRESENT`, `LATE`, `INCOMPLETE`, `ABSENT`, `NON_WORKING_DAY_WORK` | `Attendance.status` |
| `AccessRole` | Rôle d'accès | `ADMIN`, `EMPLOYEE` | `Employee.accessRole` |
| `AttendanceVerificationMethod` | Preuve du pointage | `NONE`, `GPS`, `PHOTO` | Entrée et sortie |
| `AttendanceVerificationLevel` | Niveau de vérification | `OK`, `WARNING`, `STRICT` | Entrée et sortie |
| `CalendarEntryType` | Type de date RH | `PUBLIC_HOLIDAY`, `COMPANY_HOLIDAY`, `LEAVE`, `EXTERNAL_MISSION` | `CalendarEntry.type` |
| `SanctionRuleType` | Famille de règle | `MINOR_LATENESS`, `MAJOR_LATENESS`, `EARLY_DEPARTURE`, `UNJUSTIFIED_ABSENCE`, `JUSTIFIED_ABSENCE`, `LEAVE`, `EXTERNAL_MISSION` | `SanctionRule.type` |
| `SanctionPeriod` | Période d'évaluation | `MONTHLY` | `SanctionRule.period` |

### 7.1 Évolution de AttendanceStatus

La migration initiale utilisait `ON_TIME`, `LATE`, `ABSENT`, `CHECKED_OUT`. Une migration a remplacé ces valeurs par `PRESENT`, `LATE`, `INCOMPLETE`, `ABSENT`, avec conversion des données. `NON_WORKING_DAY_WORK` a été ajouté ultérieurement.

## 8. Contraintes

### 8.1 Clés primaires

Les cinq modèles ont une clé primaire simple `id: String` avec `uuid()` comme valeur par défaut.

### 8.2 Contraintes uniques

| Modèle | Champs | Nature |
|---|---|---|
| Schedule | `name` | Unique simple |
| Employee | `employeeCode` | Unique simple, nullable |
| Employee | `employeeIdentifier` | Unique simple |
| Employee | `pinCode` | Unique simple, nullable |
| Employee | `email` | Unique simple |
| Attendance | `employeeId`, `date` | Unique composite |

### 8.3 Clés étrangères

| Table | Colonne | Référence | Suppression |
|---|---|---|---|
| Employee | `scheduleId` | Schedule.id | SET NULL |
| Attendance | `employeeId` | Employee.id | CASCADE |
| CalendarEntry | `employeeId` | Employee.id | SET NULL |

### 8.4 Index non uniques

| Modèle | Index |
|---|---|
| Attendance | `date` |
| Attendance | `checkInDistanceMeters` |
| Attendance | `checkInVerificationLevel` |
| Attendance | `checkOutDistanceMeters` |
| Attendance | `checkOutVerificationLevel` |
| Attendance | `earlyExit` |
| Attendance | `lateExit` |
| Attendance | `overtimeHours` |
| Attendance | `absenceCount` |
| CalendarEntry | `date` |
| CalendarEntry | `type` |
| CalendarEntry | `employeeId` |
| SanctionRule | `type, active` |
| SanctionRule | `priority` |

### 8.5 Valeurs par défaut

| Modèle | Champ | Défaut |
|---|---|---|
| Employee | `id` | UUID |
| Employee | `accessRole` | `EMPLOYEE` |
| Employee | `isActive` | `true` |
| Employee | `createdAt` | instant courant |
| Schedule | `id` | UUID |
| Schedule | `latenessMarginMinutes` | `0` |
| Schedule | `isActive` | `true` |
| Schedule | `createdAt` | instant courant |
| Attendance | `id` | UUID |
| Attendance | `outsideScheduleWork` | `false` |
| Attendance | résultats numériques | `0` |
| Attendance | `earlyExit`, `lateExit` | `false` |
| Attendance | `status` | `INCOMPLETE` |
| Attendance | méthodes de vérification | `NONE` |
| Attendance | niveaux de vérification | `OK` |
| Attendance | `createdAt` | instant courant |
| CalendarEntry | `id` | UUID |
| CalendarEntry | `isActive` | `true` |
| CalendarEntry | `createdAt` | instant courant |
| SanctionRule | `id` | UUID |
| SanctionRule | `active` | `true` |
| SanctionRule | inclusivité minimale | `true` |
| SanctionRule | inclusivité maximale | `false` |
| SanctionRule | tolérance et montant | `0` |
| SanctionRule | `period` | `MONTHLY` |
| SanctionRule | `priority` | `100` |
| SanctionRule | `createdAt` | instant courant |

Tous les champs `updatedAt` portent `@updatedAt`.

### 8.6 Composite Keys

Aucune clé primaire composite n'est présente. La seule contrainte unique composite est Attendance `[employeeId, date]`.

## 9. Intégrité des données

### 9.1 Cascades

La suppression d'un Employee supprime ses Attendance par cascade. La mise à jour de sa clé référencée est configurée en cascade au niveau SQL.

### 9.2 SetNull

La suppression d'un Schedule conserve les Employee et place leur `scheduleId` à `NULL`. La suppression d'un Employee lié à un CalendarEntry conserve l'entrée et place `employeeId` à `NULL`.

### 9.3 Unicité journalière

La contrainte `[employeeId, date]` garantit au niveau PostgreSQL un enregistrement Attendance par employé et date exacte.

### 9.4 Validation applicative

Prisma garantit les types et nullabilités du schéma. Les DTO NestJS ajoutent les validations de format avant les écritures. Les services vérifient notamment :

- l'existence d'un planning avant affectation ;
- l'existence des entités avant mise à jour ;
- les conflits Prisma `P2002` et `P2003` ;
- les règles de PIN ;
- les doublons de calendrier recherchés par service.

### 9.5 Écritures concurrentes de pointage

AttendanceService utilise `updateMany()` avec conditions d'état pour certaines transitions d'entrée et de sortie, puis vérifie `count`. La contrainte unique journalière protège également la création concurrente d'un second enregistrement pour la même date.

### 9.6 Suppressions exposées

CalendarService utilise `calendarEntry.delete()`. Aucun delete Employee, Schedule, Attendance ou SanctionRule n'est trouvé dans les services métier audités.

Fichiers concernés :

- `apps/backend/prisma/schema.prisma`
- `apps/backend/src/modules/attendance/attendance.service.ts`
- `apps/backend/src/modules/calendar/calendar.service.ts`
- `apps/backend/src/modules/employees/employees.service.ts`

## 10. Migrations

### 10.1 Organisation et convention

Chaque migration occupe un répertoire nommé par horodatage sur 14 chiffres suivi d'un libellé snake_case. Le fichier exécuté est toujours `migration.sql`.

### 10.2 Historique complet

| Migration | Effet constaté |
|---|---|
| `20260416140000_init` | Tables Schedule, Employee, Attendance ; enum et relations initiales |
| `20260416163000_add_auth_to_employee` | AccessRole, passwordHash et accessRole |
| `20260416190000_refine_attendance_status_flow` | Remplacement et migration des statuts |
| `20260416203000_enhance_schedule_management` | Marge de retard et activation du planning |
| `20260420120000_smart_attendance_security` | GPS/photo d'entrée et méthode de vérification |
| `20260420170000_attendance_verification_levels` | Niveau de vérification d'entrée |
| `20260420190000_attendance_photo_cloudinary_metadata` | ID public de photo d'entrée |
| `20260421100000_checkout_smart_security` | Données de sécurité de sortie |
| `20260423100000_attendance_exit_outcomes` | Fin planifiée, heures supplémentaires, sortie tardive |
| `20260423110000_attendance_absence_count_indexes` | Compteur d'absence et index |
| `20260424120000_checkout_outcome_clarity` | Sortie anticipée et minutes |
| `20260427120000_add_employee_pin_code` | PIN unique nullable |
| `20260429110000_make_employee_code_optional` | employeeCode nullable |
| `20260506120000_add_employee_identifier` | Identifiant salarié, backfill SQL, contrainte unique |
| `20260506153000_add_employee_pin_code_hash` | Colonne de hash PIN |
| `20260507110000_add_attendance_outside_schedule_work` | Marqueur hors planning |
| `20260507123000_add_attendance_schedule_snapshots` | Sept champs de snapshot |
| `20260623143000_add_hr_calendar_entries` | Enum, table, index et FK calendrier |
| `20260623162000_add_non_working_day_work_status` | Nouveau statut de travail non ouvré |
| `20260626190000_add_configurable_sanction_rules` | Enums, table, index et deux règles initiales |

### 10.3 Transformations de données intégrées

Trois migrations contiennent des opérations de données :

- conversion des anciens statuts Attendance ;
- initialisation de `overtimeMinutes`, `earlyExit` et `earlyExitMinutes` ;
- génération des `employeeIdentifier` existants.

La migration SanctionRule insère aussi deux règles V1.

### 10.4 Fonctionnement déclaré

Le projet expose `prisma migrate dev` pour le développement et `prisma migrate deploy` pour l'application des migrations existantes.

## 11. Transactions

### 11.1 Transactions interactives constatées

Deux usages de `$transaction(async transaction => ...)` sont présents.

| Emplacement | Cas d'utilisation | Opérations atomiques |
|---|---|---|
| `EmployeesService.create()` | Création d'un employé | Lecture de la séquence d'identifiant puis création |
| `create-initial-admin.ts` | Bootstrap administrateur | Lecture de la séquence puis création |

### 11.2 Création Employee

La transaction calcule le prochain `EMP-AAAA-NNN` à partir des identifiants existants et crée l'employé dans la même transaction. Le service réessaie jusqu'à trois fois lorsqu'une contrainte unique sur `employeeIdentifier` produit `P2002`.

### 11.3 Script administrateur

Le script applique le même principe et réessaie au maximum trois fois en cas de conflit d'identifiant.

### 11.4 Autres opérations

Le seed emploie des upserts et `Promise.all`, mais ne les enveloppe pas dans une transaction globale. Les deux scripts de backfill exécutent leurs mises à jour séquentiellement sans transaction globale. Aucun autre `$transaction` n'est trouvé.

## 12. Performances

### 12.1 Index

Les index explicitement déclarés ciblent les recherches temporelles, les métriques de pointage, la vérification, les événements de calendrier et l'ordre des règles de sanction. Les contraintes uniques créent également des index uniques PostgreSQL.

### 12.2 Projections

`common/prisma/selects.ts` définit des projections partagées :

- `scheduleSelect` ;
- `publicEmployeeSelect` ;
- `employeeWithScheduleSelect` ;
- `scheduleWithEmployeesSelect` ;
- `attendanceWithEmployeeSelect`.

Les services utilisent couramment `select` pour limiter les colonnes retournées.

### 12.3 Chargement des relations

Prisma ne fournit pas de lazy loading implicite dans ce code. Les relations sont chargées explicitement par `select` ou `include` imbriqué lorsque nécessaires : employé avec planning, planning avec employés, pointage avec employé.

### 12.4 Agrégations

DashboardService utilise `count`, `aggregate` et `groupBy`, souvent dans des `Promise.all`. Les rapports et historiques utilisent des filtres par plages de dates.

### 12.5 Pagination

Aucun paramètre de pagination n'est présent dans `AttendanceHistoryQueryDto`, qui accepte uniquement le mois. Les listes Employee et Schedule ainsi que les exports mensuels chargent leur périmètre sans pagination de base de données.

### 12.6 Écritures de masse

`updateMany` est utilisé pour des transitions conditionnelles Attendance et pour la migration à la volée d'un PIN historique. `upsert` est utilisé dans le seed pour rendre plusieurs créations reproductibles.

Fichiers concernés :

- `apps/backend/src/common/prisma/selects.ts`
- `apps/backend/src/modules/dashboard/dashboard.service.ts`
- `apps/backend/src/modules/attendance/attendance.service.ts`
- `apps/backend/src/modules/attendance/exports/monthly-attendance-export.service.ts`

## 13. Dépendances

### 13.1 Chaîne de dépendances

```text
Contrôleurs NestJS
        |
        v
Services métier
  | Auth
  | Employees
  | Schedules
  | Attendance
  | Calendar
  | Dashboard
  | Sanctions
        |
        v
PrismaService (global)
        |
        v
@prisma/client
        |
        v
PostgreSQL
```

### 13.2 Modules consommateurs

| Module / service | Modèles principaux |
|---|---|
| AuthService | Employee |
| EmployeesService | Employee, Schedule |
| SchedulesService | Schedule |
| AttendanceService | Attendance, Employee, Schedule |
| AttendanceMonthlyMetricsService | Attendance, Employee |
| MonthlyAttendanceExportService | Employee, Attendance, Schedule |
| CalendarService | CalendarEntry, Employee |
| DashboardService | Employee, Attendance |
| SanctionsService | SanctionRule, Attendance |

### 13.3 Repositories

Aucune couche Repository dédiée n'est présente. Les services métier injectent directement `PrismaService`.

### 13.4 Module global

`PrismaModule` porte `@Global()`. Les modules consommateurs n'ont pas à l'importer individuellement après son enregistrement dans `AppModule`.

## 14. Traçabilité du code

| Fonctionnalité | Fichiers principaux |
|---|---|
| Schéma courant | `apps/backend/prisma/schema.prisma` |
| Configuration Prisma | `apps/backend/prisma.config.ts` |
| Historique SQL | `apps/backend/prisma/migrations/*/migration.sql` |
| Seed | `apps/backend/prisma/seed.ts` |
| Client NestJS | `apps/backend/src/common/prisma/prisma.service.ts` |
| Exposition globale | `apps/backend/src/common/prisma/prisma.module.ts` |
| Projections | `apps/backend/src/common/prisma/selects.ts` |
| Employés et transaction | `apps/backend/src/modules/employees/employees.service.ts` |
| Plannings | `apps/backend/src/modules/schedules/schedules.service.ts` |
| Pointages | `apps/backend/src/modules/attendance/attendance.service.ts` |
| Métriques mensuelles | `apps/backend/src/modules/attendance/attendance-monthly-metrics.service.ts` |
| Rapports | `apps/backend/src/modules/attendance/exports/monthly-attendance-export.service.ts` |
| Calendrier | `apps/backend/src/modules/calendar/calendar.service.ts` |
| Dashboard | `apps/backend/src/modules/dashboard/dashboard.service.ts` |
| Sanctions | `apps/backend/src/modules/sanctions/sanctions.service.ts` |
| Authentification | `apps/backend/src/modules/auth/auth.service.ts` |
| Backfill PIN | `apps/backend/scripts/backfill-employee-pin-code-hashes.ts` |
| Backfill snapshots | `apps/backend/scripts/backfill-attendance-schedule-snapshots.ts` |
| Bootstrap admin | `apps/backend/scripts/create-initial-admin.ts` |

### 14.1 Scripts et données

Le seed et les scripts utilisent directement `PrismaClient`, tandis que l'application NestJS utilise `PrismaService`.

## 15. Observations techniques

Cette section consigne uniquement les constats du dépôt.

### 15.1 Schéma monofichier

Tous les modèles et enums sont définis dans un unique `schema.prisma`.

### 15.2 Absence de Repository

Les services accèdent directement à PrismaService. Aucun dossier ou type Repository n'est trouvé.

### 15.3 Département dénormalisé

Le département est stocké comme `Employee.department: String?`. Aucun modèle Department n'est présent.

### 15.4 Intitulé et rôle d'accès

`Employee.role` est une chaîne métier, tandis que `Employee.accessRole` est l'enum d'autorisation.

### 15.5 Deux représentations du PIN

`pinCode` nullable et unique coexiste avec `pinCodeHash` nullable et non unique. Le code contient un backfill et une migration à la volée des valeurs historiques.

### 15.6 Code salarié historique

`employeeCode` reste dans le schéma comme champ unique nullable. `employeeIdentifier` est obligatoire et unique. Plusieurs services utilisent le premier comme repli lorsque le second est absent dans leurs types historiques.

### 15.7 Horaires sous forme textuelle

`Schedule.startTime` et `endTime` sont des String. Les migrations PostgreSQL les créent en TEXT.

### 15.8 Jours de travail JSON

`Schedule.workDays` et `Attendance.scheduleWorkDaysSnapshot` utilisent JSON/JSONB. Aucun enum de jour de semaine n'est déclaré dans Prisma.

### 15.9 Snapshots sans clé étrangère

`scheduleIdSnapshot` est une String sans relation vers Schedule. Les snapshots restent donc indépendants du cycle de vie du planning.

### 15.10 Sanctions calculées

SanctionRule est persisté, mais les résultats de sanction ne disposent pas de modèle. `SanctionsService` produit les résultats à partir des règles et des pointages.

### 15.11 Rapports non persistés

Aucun modèle Report ou Export n'est présent. Les rapports sont calculés et générés en mémoire.

### 15.12 Audit non persisté par Prisma

Le code comporte AuditLogService, mais aucun modèle AuditLog n'est déclaré dans ce schéma.

### 15.13 Notifications et permissions

Aucun modèle Notification, Role ou Permission distinct n'est présent.

### 15.14 Valeurs historiques dans les migrations

L'enum AttendanceStatus initial contient des valeurs qui ne figurent plus dans le schéma. La migration de raffinement effectue leur conversion explicite.

### 15.15 Seed et migration de règles

Les deux règles de sanction par défaut sont insérées à la fois dans la migration de création et gérées par le seed au moyen d'une logique d'initialisation.

### 15.16 Backfills hors migrations

Les hash PIN et snapshots Attendance disposent de scripts séparés. Leurs mises à jour ne sont pas contenues dans une transaction globale.

### 15.17 Index numériques et booléens

Attendance comporte des index simples sur plusieurs colonnes booléennes et numériques utilisées par Dashboard, notamment `earlyExit`, `lateExit`, `overtimeHours` et `absenceCount`.

### 15.18 Absence de suppression logique générique

Employee, Schedule, CalendarEntry et SanctionRule disposent de drapeaux d'activation nommés `isActive` ou `active`. Attendance n'en possède pas. CalendarEntry expose aussi une suppression physique dans son service.

### 15.19 Modèles absents

Les modèles suivants ne sont pas trouvés dans le code Prisma :

- Department ;
- Report ou Export ;
- AuditLog ;
- Notification ;
- Permission ou Role distinct ;
- sanction appliquée persistée ;
- Site ou Location métier.

### 15.20 Documentation locale

Aucun README propre au répertoire `apps/backend/prisma/` n'est présent. La documentation exécutable réside dans le schéma, les migrations, le seed et les scripts.
