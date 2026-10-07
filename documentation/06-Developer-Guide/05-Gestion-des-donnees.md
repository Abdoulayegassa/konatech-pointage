# Gestion des données

| Métadonnée | Valeur |
| --- | --- |
| Document ID | DG-005 |
| Titre | Gestion des données |
| Version | 1.0 |
| Statut | Validé |
| Classification | Interne |
| Référence | Developer Guide |
| Date de génération | 30 juillet 2026 |

# 1. Présentation

## 1.1 Objectif

Ce chapitre décrit la gestion des données de Konatech Pointage telle qu'elle est implémentée dans le dépôt. Il présente PostgreSQL, Prisma, le schéma, les modèles, les relations, les migrations, le seed, le client Prisma et les accès réalisés par les services du backend.

La description est limitée aux fichiers et mécanismes présents à la date de génération.

## 1.2 Rôle de la couche données

La couche données assure la persistance des éléments suivants :

- comptes et informations des employés ;
- plannings et jours travaillés ;
- pointages, résultats horaires et preuves de vérification ;
- entrées du calendrier RH ;
- règles configurables de sanction.

Le backend ne contient pas de classes d'entité séparées ni de repositories personnalisés. Les modèles persistés sont définis dans `prisma/schema.prisma`, et les services NestJS utilisent `PrismaService` pour interroger le client généré.

Les cinq modèles réellement présents sont :

- `Employee` ;
- `Schedule` ;
- `Attendance` ;
- `CalendarEntry` ;
- `SanctionRule`.

**Fichiers de référence :**

- `apps/backend/prisma/schema.prisma`
- `apps/backend/src/common/prisma/prisma.service.ts`
- `apps/backend/src/common/prisma/prisma.module.ts`
- `apps/backend/src/modules`

# 2. Architecture de persistance

## 2.1 PostgreSQL

Le datasource Prisma utilise le provider `postgresql`. Son URL provient exclusivement de `DATABASE_URL`.

Le dépôt contient un service PostgreSQL local dans `docker-compose.yml` :

| Élément | Configuration observée |
| --- | --- |
| Image | `postgres:16-alpine` |
| Service | `postgres` |
| Conteneur | `konatech-postgres` |
| Port interne | `5432` |
| Port hôte par défaut | `5433` |
| Persistance locale | Volume nommé `postgres-data` |
| Vérification | `pg_isready` |
| Politique de redémarrage | `unless-stopped` |

Le service backend Docker dépend de l'état sain du service PostgreSQL et reçoit une variable `DATABASE_URL`.

## 2.2 Prisma ORM

Prisma fournit :

- la description déclarative du schéma ;
- les types et delegates du client ;
- la création et l'application des migrations ;
- l'exécution du seed ;
- les opérations typées depuis les services NestJS.

Le projet utilise `@prisma/client` et l'outil `prisma` en version déclarée `^6.0.0`.

## 2.3 Prisma Client

Le generator est configuré ainsi :

| Propriété | Valeur |
| --- | --- |
| Provider | `prisma-client-js` |
| Cibles binaires | `native`, `debian-openssl-3.0.x` |

`PrismaService` :

- est décoré avec `@Injectable()` ;
- étend directement `PrismaClient` ;
- est fourni et exporté par le module global `PrismaModule` ;
- appelle `$disconnect()` lors de la destruction du module.

Il ne déclare pas de méthode `onModuleInit()` et n'appelle pas explicitement `$connect()` au démarrage.

## 2.4 Migrations

Le chemin des migrations est `prisma/migrations`. Vingt dossiers horodatés contenant chacun un fichier `migration.sql` sont présents.

Les scripts de migration utilisent :

- `prisma migrate dev` pour le développement ;
- `prisma migrate deploy` pour appliquer les migrations existantes ;
- `prisma migrate status` au niveau racine pour consulter l'état.

## 2.5 Seed

Le seed est défini dans `prisma.config.ts` par la commande :

```text
node --require ts-node/register/transpile-only prisma/seed.ts
```

Il est exécuté par `prisma db seed` au moyen des scripts `prisma:seed` du backend et de la racine du monorepo.

## 2.6 Diagramme de persistance

```text
Backend NestJS
      |
      v
PrismaModule global
      |
      v
PrismaService
extends PrismaClient
      |
      +---------------------+
      |                     |
      v                     v
schema.prisma         prisma/migrations
      |                     |
      +----------+----------+
                 |
                 v
            PostgreSQL
                 |
                 v
      Volume Docker postgres-data
      pour l'instance locale Docker
```

**Fichiers de référence :**

- `apps/backend/prisma/schema.prisma`
- `apps/backend/prisma.config.ts`
- `apps/backend/package.json`
- `package.json`
- `docker-compose.yml`
- `apps/backend/src/common/prisma/prisma.module.ts`
- `apps/backend/src/common/prisma/prisma.service.ts`

# 3. Organisation des fichiers

## 3.1 Fichiers de persistance

| Répertoire ou fichier | Rôle observé | Contenu |
| --- | --- | --- |
| `apps/backend/prisma/schema.prisma` | Schéma de référence | Generator, datasource, sept énumérations, cinq modèles, relations, contraintes et index |
| `apps/backend/prisma.config.ts` | Configuration Prisma CLI | Chemins du schéma, des migrations et du seed ; datasource |
| `apps/backend/prisma/migrations` | Historique de schéma | Vingt migrations SQL horodatées |
| `apps/backend/prisma/seed.ts` | Jeu de données initial | Plannings, employés, pointages relatifs à la date et règles de sanction |
| `apps/backend/src/common/prisma/prisma.module.ts` | Injection NestJS | Module global fournissant le client |
| `apps/backend/src/common/prisma/prisma.service.ts` | Client applicatif | Extension de `PrismaClient` et déconnexion |
| `apps/backend/src/common/prisma/selects.ts` | Projections partagées | Sélections de planning, employé et pointage |
| `apps/backend/scripts/create-initial-admin.ts` | Initialisation ciblée | Création transactionnelle d'un administrateur initial |
| `apps/backend/scripts/backfill-employee-pin-code-hashes.ts` | Synchronisation de données | Conversion des anciens PIN vers les hash |
| `apps/backend/scripts/backfill-attendance-schedule-snapshots.ts` | Synchronisation de données | Remplissage des instantanés de planning des pointages |
| `apps/backend/test/test-database.ts` | Préparation des tests | Application des migrations et appel direct à `seedDatabase()` |
| `docker-compose.yml` | PostgreSQL local | Service, volume, port et healthcheck |
| `apps/backend/package.json` | Scripts du backend | Generate, migrations et seed |
| `package.json` | Scripts du monorepo | Démarrage PostgreSQL, état Prisma, migrations, génération et seed |

## 3.2 Sélections Prisma partagées

`common/prisma/selects.ts` définit :

| Sélection | Modèle | Usage |
| --- | --- | --- |
| `scheduleSelect` | `Schedule` | Champs publics et de configuration d'un planning |
| `publicEmployeeSelect` | `Employee` | Informations retournables sans `passwordHash`, `pinCode` ni `pinCodeHash` |
| `employeeWithScheduleSelect` | `Employee` | Employé avec planning projeté |
| `scheduleWithEmployeesSelect` | `Schedule` | Planning avec employés projetés |
| `attendanceWithEmployeeSelect` | `Attendance` | Détail de pointage avec employé public |

Le type `PublicEmployee` est dérivé de `publicEmployeeSelect` avec `Prisma.EmployeeGetPayload`.

## 3.3 Répartition des accès

| Service ou script | Modèles directement utilisés |
| --- | --- |
| `AuthService` | `Employee` |
| `EmployeesService` | `Employee`, `Schedule` |
| `SchedulesService` | `Schedule`, avec relation `employees` dans la sélection |
| `AttendanceService` | `Attendance`, `Employee` |
| `AttendanceMonthlyMetricsService` | `Attendance`, `Employee` |
| `MonthlyAttendanceExportService` | `Employee`, avec pointages sélectionnés |
| `DashboardService` | `Attendance`, `Employee` |
| `CalendarService` | `CalendarEntry` |
| `SanctionsService` | `SanctionRule`, `Attendance` |
| `prisma/seed.ts` | `Schedule`, `Employee`, `Attendance`, `SanctionRule` |
| `create-initial-admin.ts` | `Employee` dans une transaction |
| Script de hash PIN | `Employee` |
| Script d'instantanés | `Attendance` |

# 4. Modèles de données

## 4.1 Vue d'ensemble

| Modèle | Rôle | Relations | Utilisation principale |
| --- | --- | --- | --- |
| `Employee` | Compte, identité et rattachements d'un utilisateur | Planning optionnel, plusieurs pointages, plusieurs entrées calendrier | Authentification, administration, pointage, exports et tableau de bord |
| `Schedule` | Horaires et jours de travail | Plusieurs employés | Affectation des employés, calcul des retards et résultats de sortie |
| `Attendance` | Enregistrement journalier du pointage | Appartient à un employé | Entrée, sortie, historique, métriques, sanctions et exports |
| `CalendarEntry` | Événement du calendrier RH | Employé optionnel | Jours fériés, congés, missions et calcul des jours non travaillés |
| `SanctionRule` | Paramétrage persistant d'une règle disciplinaire | Aucune relation Prisma déclarée | Calcul et administration des sanctions |

## 4.2 Modèle `Employee`

### Rôle

`Employee` centralise l'identité, les secrets d'authentification, le statut, le rôle d'accès et le rattachement organisationnel.

### Propriétés principales

| Groupe | Propriétés observées |
| --- | --- |
| Identité primaire | `id` UUID |
| Identifiants métier | `employeeCode` optionnel et unique, `employeeIdentifier` unique |
| Pointage PIN | `pinCode` optionnel et unique, `pinCodeHash` optionnel |
| Identité personnelle | `firstName`, `lastName`, `email` unique |
| Autorisation | `role` textuel, `accessRole` de type `AccessRole` |
| Authentification | `passwordHash` |
| Organisation | `department` optionnel, `scheduleId` optionnel |
| État | `isActive`, valeur par défaut `true` |
| Audit temporel | `createdAt`, `updatedAt` |

`accessRole` vaut `EMPLOYEE` par défaut. Les valeurs d'énumération disponibles sont `ADMIN` et `EMPLOYEE`.

### Relations

| Relation | Cardinalité | Comportement de suppression |
| --- | --- | --- |
| `Employee.schedule` vers `Schedule` | Plusieurs employés vers zéro ou un planning | `SetNull` si le planning référencé est supprimé |
| `Employee.attendances` vers `Attendance` | Un vers plusieurs | Les pointages appartiennent à l'employé |
| `Employee.calendarEntries` vers `CalendarEntry` | Un vers plusieurs | Les entrées peuvent cibler un employé |

### Utilisation

Le modèle est utilisé par :

- `AuthService` pour la connexion standard, la connexion PIN et la validation JWT ;
- `EmployeesService` pour les opérations d'administration ;
- `AttendanceService` pour vérifier le compte actif et charger le planning ;
- `DashboardService` pour les effectifs et agrégations ;
- le service d'export mensuel ;
- le seed et le script de création initiale.

## 4.3 Modèle `Schedule`

### Rôle

`Schedule` représente un planning réutilisable et affectable à plusieurs employés.

### Propriétés principales

| Propriété | Type ou contrainte observée |
| --- | --- |
| `id` | UUID, clé primaire |
| `name` | Chaîne unique |
| `startTime` | Chaîne d'heure |
| `endTime` | Chaîne d'heure |
| `latenessMarginMinutes` | Entier, défaut `0` |
| `isActive` | Booléen, défaut `true` |
| `workDays` | JSON |
| `createdAt` | Date de création |
| `updatedAt` | Mise à jour automatique |

### Relations et utilisation

`Schedule.employees` est une relation un-à-plusieurs inverse de `Employee.schedule`.

Le planning est utilisé pour :

- déterminer les jours programmés ;
- calculer le retard ;
- calculer les résultats de sortie ;
- générer l'instantané enregistré dans un pointage ;
- alimenter les métriques et exports ;
- présenter les affectations dans l'administration.

Les horaires restent des chaînes dans le schéma. Les DTO imposent le format `HH:mm`, et `SchedulesService` vérifie que la fin est postérieure au début.

## 4.4 Modèle `Attendance`

### Rôle

`Attendance` enregistre l'état journalier d'un employé et conserve les données nécessaires au suivi des entrées, sorties, absences, horaires et vérifications.

### Identité et unicité

| Propriété ou contrainte | Description |
| --- | --- |
| `id` | UUID, clé primaire |
| `employeeId` | Clé étrangère obligatoire |
| `date` | Date normalisée du pointage |
| `@@unique([employeeId, date])` | Un seul enregistrement par employé et par date |
| `@@index([date])` | Index de recherche chronologique |

La relation vers `Employee` utilise `onDelete: Cascade`.

### Horaires et statut

| Propriété | Rôle |
| --- | --- |
| `clockInAt`, `clockOutAt` | Horodatages optionnels d'entrée et de sortie |
| `status` | Statut de type `AttendanceStatus`, défaut `INCOMPLETE` |
| `minutesLate` | Nombre de minutes de retard |
| `notes` | Commentaire optionnel |
| `outsideScheduleWork` | Travail observé hors planning |
| `scheduledExitTime` | Heure de sortie prévue résolue |
| `earlyExit`, `earlyExitMinutes` | Départ anticipé et durée |
| `overtimeHours`, `overtimeMinutes` | Heures supplémentaires |
| `lateExit` | Sortie tardive |
| `absenceCount` | Compteur d'absences |

Les statuts disponibles sont :

- `PRESENT` ;
- `LATE` ;
- `INCOMPLETE` ;
- `ABSENT` ;
- `NON_WORKING_DAY_WORK`.

### Instantané du planning

Les propriétés suivantes figent le contexte du planning au moment du pointage :

- `scheduleIdSnapshot` ;
- `scheduleNameSnapshot` ;
- `scheduleStartTimeSnapshot` ;
- `scheduleEndTimeSnapshot` ;
- `scheduleWorkDaysSnapshot` ;
- `scheduleLatenessMarginSnapshot` ;
- `scheduleCapturedAt`.

Ces champs ne constituent pas une relation Prisma vers `Schedule`.

### Vérification d'entrée

| Groupe | Propriétés |
| --- | --- |
| Position | `checkInLatitude`, `checkInLongitude`, `checkInAccuracyMeters`, `checkInDistanceMeters` |
| Décision | `checkInVerificationMethod`, `checkInVerificationLevel`, `checkInVerificationReason` |
| Photo | `checkInVerificationPhoto`, `checkInVerificationPhotoPublicId` |

### Vérification de sortie

| Groupe | Propriétés |
| --- | --- |
| Position | `checkOutLatitude`, `checkOutLongitude`, `checkOutAccuracyMeters`, `checkOutDistanceMeters` |
| Décision | `checkOutVerificationMethod`, `checkOutVerificationLevel`, `checkOutVerificationReason` |
| Photo | `checkOutVerificationPhoto`, `checkOutVerificationPhotoPublicId` |

Les méthodes de vérification sont `NONE`, `GPS` et `PHOTO`. Les niveaux sont `OK`, `WARNING` et `STRICT`.

### Index

Le modèle contient des index sur :

- la date ;
- la distance et le niveau de vérification d'entrée ;
- la distance et le niveau de vérification de sortie ;
- le départ anticipé ;
- la sortie tardive ;
- les heures supplémentaires ;
- le compteur d'absences.

### Utilisation

Le modèle est utilisé par :

- le moteur de pointage ;
- le recalcul mensuel ;
- le tableau de bord ;
- les exports ;
- le moteur de sanctions ;
- le seed ;
- le script de régularisation des instantanés.

## 4.5 Modèle `CalendarEntry`

### Rôle

`CalendarEntry` représente une entrée datée du calendrier RH.

### Propriétés

| Propriété | Description |
| --- | --- |
| `id` | UUID, clé primaire |
| `name` | Libellé |
| `description` | Description optionnelle |
| `date` | Date de l'entrée |
| `type` | Type `CalendarEntryType` |
| `employeeId` | Employé optionnel |
| `isActive` | État, défaut `true` |
| `createdAt`, `updatedAt` | Horodatages |

Les types disponibles sont :

- `PUBLIC_HOLIDAY` ;
- `COMPANY_HOLIDAY` ;
- `LEAVE` ;
- `EXTERNAL_MISSION`.

### Relations et index

La relation vers `Employee` est optionnelle et utilise `onDelete: SetNull`.

Des index existent sur :

- `date` ;
- `type` ;
- `employeeId`.

### Utilisation

`CalendarService` utilise le modèle pour :

- construire le calendrier mensuel ;
- identifier les jours non travaillés ;
- lister, créer, mettre à jour et supprimer les entrées ;
- détecter les doublons actifs.

Le calendrier intervient ensuite dans les calculs de pointage, d'absence et du tableau de bord par l'intermédiaire de `CalendarService`.

## 4.6 Modèle `SanctionRule`

### Rôle

`SanctionRule` conserve une règle configurable utilisée par le moteur de sanctions.

### Propriétés

| Groupe | Propriétés |
| --- | --- |
| Identité | `id`, `type`, `name`, `description` |
| État | `active` |
| Plage de retard | `latenessMinMinutes`, `latenessMinInclusive`, `latenessMaxMinutes`, `latenessMaxInclusive` |
| Application | `monthlyTolerance`, `amountFcfa`, `period`, `priority` |
| Messages | `appliedReason`, `toleratedReason` |
| Horodatage | `createdAt`, `updatedAt` |

Les types disponibles sont :

- `MINOR_LATENESS` ;
- `MAJOR_LATENESS` ;
- `EARLY_DEPARTURE` ;
- `UNJUSTIFIED_ABSENCE` ;
- `JUSTIFIED_ABSENCE` ;
- `LEAVE` ;
- `EXTERNAL_MISSION`.

La seule période définie est `MONTHLY`.

### Index et utilisation

Le modèle possède :

- un index composite sur `type` et `active` ;
- un index sur `priority`.

Aucune relation Prisma n'est déclarée depuis `SanctionRule`. `SanctionsService` associe les règles aux pointages par logique applicative lors du calcul.

## 4.7 Relations globales

```text
Schedule
   1
   |
   | planning optionnel
   |
   * Employee
      |
      +-----------------------+
      |                       |
      | 1                   1 |
      |                       |
      * Attendance             * CalendarEntry
        suppression en          employé optionnel,
        cascade avec Employee   SetNull avec Employee

SanctionRule
   |
   +--> aucune relation Prisma déclarée
        association calculée par SanctionsService
```

# 5. Cycle d'accès aux données

## 5.1 Flux principal

Les contrôleurs n'accèdent pas directement à Prisma. Le flux observé est :

1. le contrôleur reçoit une requête déjà passée par les guards et la validation ;
2. il appelle le service du module ;
3. le service applique les règles métier ;
4. le service utilise le `PrismaService` injecté ;
5. Prisma construit et exécute la requête PostgreSQL ;
6. le service transforme ou agrège le résultat ;
7. le contrôleur retourne la valeur à NestJS.

## 5.2 Diagramme

```text
Controller
    |
    | DTO et paramètres validés
    v
Service métier
    |
    | règles et contrôles
    v
PrismaService global
    |
    | delegate typé du modèle
    v
Prisma Client
    |
    | requête SQL générée
    v
PostgreSQL
    |
    | lignes et agrégats
    v
Prisma Client
    |
    v
Service : projection / calcul
    |
    v
Controller : retour HTTP
```

## 5.3 Opérations Prisma observées

| Type d'opération | Utilisation observée |
| --- | --- |
| `findUnique`, `findUniqueOrThrow` | Chargement par identifiant ou clé unique |
| `findFirst` | Recherche d'une règle ou d'un doublon |
| `findMany` | Listes, historiques, calculs et vérifications |
| `count` | Indicateurs du tableau de bord |
| `aggregate` | Sommes et métriques |
| `groupBy` | Classements agrégés du tableau de bord |
| `create`, `createMany` | Création métier, absences et données de test |
| `update`, `updateMany` | Modifications, transitions de pointage et régularisations |
| `delete` | Suppression d'une entrée calendrier |
| `upsert` | Seed réexécutable des plannings, employés et pointages |
| `$transaction` | Création d'employé et création initiale d'administrateur |

Aucun appel `$queryRaw` ou `$executeRaw` n'est présent dans les fichiers TypeScript analysés. Le SQL direct est limité aux fichiers de migration.

## 5.4 Projections

Les services limitent les champs retournés par des objets `select`. Les projections partagées évitent notamment d'exposer :

- `passwordHash` ;
- `pinCode` ;
- `pinCodeHash`.

`EmployeesService` utilise une projection interne comprenant les champs PIN pour ses contrôles, puis transforme les réponses.

## 5.5 Transactions et concurrence

Deux transactions Prisma explicites sont présentes :

| Emplacement | Usage |
| --- | --- |
| `EmployeesService.create()` | Création de l'employé avec les contrôles et données associés |
| `scripts/create-initial-admin.ts` | Création atomique de l'administrateur initial et calcul de son identifiant |

Le moteur de pointage utilise aussi des mises à jour conditionnelles par `updateMany` pour appliquer certaines transitions seulement si l'état attendu est encore présent.

## 5.6 Gestion des erreurs de données

Les services traduisent certaines situations en exceptions NestJS :

- ressource absente vers `NotFoundException` ;
- unicité ou état incompatible vers `ConflictException` ;
- donnée métier incohérente vers `BadRequestException`.

Les contraintes uniques de PostgreSQL et Prisma complètent ces contrôles :

- nom de planning ;
- code employé lorsqu'il existe ;
- identifiant employé ;
- PIN historique lorsqu'il existe ;
- adresse électronique ;
- couple employé-date du pointage.

**Fichiers de référence :**

- tous les contrôleurs sous `apps/backend/src/modules`
- tous les services sous `apps/backend/src/modules`
- `apps/backend/src/common/prisma/prisma.service.ts`
- `apps/backend/src/common/prisma/selects.ts`
- `apps/backend/prisma/schema.prisma`

# 6. Gestion des migrations

## 6.1 Organisation

Les migrations sont placées dans des dossiers dont le nom suit la convention :

```text
YYYYMMDDHHMMSS_description
```

Chaque dossier observé contient un fichier `migration.sql`.

Aucun fichier `migration_lock.toml` n'est présent dans le répertoire analysé.

## 6.2 Historique

| Migration | Évolution observable |
| --- | --- |
| `20260416140000_init` | Création initiale de `Schedule`, `Employee`, `Attendance`, du statut de pointage, des clés, relations et premiers index |
| `20260416163000_add_auth_to_employee` | Ajout du rôle d'accès et du champ de mot de passe à l'employé, avec valeur transitoire pour les lignes existantes |
| `20260416190000_refine_attendance_status_flow` | Remplacement de l'énumération initiale par les statuts `PRESENT`, `LATE`, `INCOMPLETE`, `ABSENT` |
| `20260416203000_enhance_schedule_management` | Ajout des propriétés de marge, état et jours travaillés au planning |
| `20260420120000_smart_attendance_security` | Ajout de la méthode de vérification et des données GPS/photo d'entrée |
| `20260420170000_attendance_verification_levels` | Ajout du niveau de vérification d'entrée |
| `20260420190000_attendance_photo_cloudinary_metadata` | Ajout du public ID de la photo d'entrée |
| `20260421100000_checkout_smart_security` | Ajout des données de vérification de sortie et de leurs index |
| `20260423100000_attendance_exit_outcomes` | Ajout de la sortie prévue, des heures supplémentaires et de la sortie tardive |
| `20260423110000_attendance_absence_count_indexes` | Ajout du compteur d'absences et d'index de métriques |
| `20260424120000_checkout_outcome_clarity` | Ajout du départ anticipé, reprise des données et index |
| `20260427120000_add_employee_pin_code` | Ajout du code PIN unique |
| `20260429110000_make_employee_code_optional` | Passage du code employé à l'état optionnel |
| `20260506120000_add_employee_identifier` | Ajout, reprise et contrainte unique de l'identifiant employé |
| `20260506153000_add_employee_pin_code_hash` | Ajout du hash de code PIN |
| `20260507110000_add_attendance_outside_schedule_work` | Ajout de l'indicateur de travail hors planning |
| `20260507123000_add_attendance_schedule_snapshots` | Ajout des champs d'instantané du planning |
| `20260623143000_add_hr_calendar_entries` | Création de `CalendarEntry`, de ses types, index et relation employé |
| `20260623162000_add_non_working_day_work_status` | Ajout du statut `NON_WORKING_DAY_WORK` |
| `20260626190000_add_configurable_sanction_rules` | Création de `SanctionRule`, de ses énumérations, index et règles initiales SQL |

## 6.3 Création en développement

Le script réellement déclaré est :

```text
pnpm prisma:migrate
```

À la racine, il exécute Prisma dans `apps/backend` avec `migrate dev`. Le backend déclare aussi son propre script `prisma:migrate` avec la même sous-commande Prisma.

Le dépôt ne contient pas de script distinct fixant automatiquement un nom de migration.

## 6.4 Application

Deux contextes d'application sont présents :

| Contexte | Script ou mécanisme |
| --- | --- |
| Développement | `prisma migrate dev` |
| Migrations existantes | `prisma migrate deploy` |
| Préparation de la base de test | Exécution de `migrate deploy` par `test/test-database.ts` |

Le bootstrap NestJS n'applique pas les migrations.

## 6.5 Vérification et synchronisation

Les commandes de synchronisation présentes sont :

| Script | Fonction |
| --- | --- |
| `prisma:generate` | Régénération du client depuis le schéma |
| `prisma:status` | Consultation de l'état des migrations, disponible à la racine |
| `prisma:migrate` | Création et application en développement |
| `prisma:migrate:deploy` | Application des migrations existantes |
| `pins:backfill` | Reprise des PIN historiques vers `pinCodeHash` |
| `snapshots:backfill` | Reprise des instantanés de planning |

Aucun script `prisma db push`, `prisma migrate reset` ou `prisma db pull` n'est déclaré dans les `package.json` analysés.

## 6.6 Données transformées pendant les migrations

Plusieurs migrations contiennent des opérations de reprise SQL :

- initialisation du rôle d'accès et du mot de passe haché lors de l'ajout de l'authentification ;
- conversion de l'ancienne énumération de statut ;
- génération des identifiants employés existants ;
- clarification des résultats de sortie ;
- insertion initiale de règles de sanction.

Ces transformations font partie des fichiers SQL versionnés.

**Fichiers de référence :**

- `apps/backend/prisma/migrations`
- `apps/backend/prisma.config.ts`
- `apps/backend/package.json`
- `package.json`
- `apps/backend/test/test-database.ts`
- `apps/backend/scripts/backfill-employee-pin-code-hashes.ts`
- `apps/backend/scripts/backfill-attendance-schedule-snapshots.ts`

# 7. Gestion des seeds

## 7.1 Déclaration

`prisma.config.ts` associe Prisma à `prisma/seed.ts`. Le script backend `prisma:seed` et le script racine du même nom exécutent `prisma db seed`.

`seed.ts` exporte la fonction :

```text
seedDatabase(prisma, referenceDate?)
```

La date de référence vaut la date courante si elle n'est pas fournie. La préparation des tests lui transmet une date fixe.

## 7.2 Données créées ou mises à jour

| Modèle | Données structurelles observées |
| --- | --- |
| `SanctionRule` | Deux règles par défaut de retard |
| `Schedule` | Deux plannings actifs avec horaires, marges et ensembles de jours différents |
| `Employee` | Cinq comptes : deux `ADMIN` et trois `EMPLOYEE` |
| `Attendance` | Pointages de démonstration pour la date de référence et des jours planifiés antérieurs |
| `CalendarEntry` | Aucune donnée créée par le seed |

Les valeurs de mots de passe et de codes PIN présentes dans le seed ne sont pas reproduites dans ce document.

## 7.3 Ordre du seed

Le déroulement réellement implémenté est :

1. hachage des mots de passe ;
2. hachage de certains codes PIN ;
3. création ou mise à jour des règles de sanction ;
4. création ou mise à jour des deux plannings ;
5. construction de cinq identifiants employés ;
6. création ou mise à jour des cinq employés ;
7. résolution des dates de pointage à partir de la date de référence ;
8. calcul de l'heure de sortie prévue ;
9. calcul des départs anticipés et heures supplémentaires ;
10. calcul du compteur d'absences ;
11. construction des instantanés de planning ;
12. création ou mise à jour des pointages ;
13. retour des nombres d'employés, de plannings et de pointages traités.

## 7.4 Réexécution

Les mécanismes suivants rendent le traitement réexécutable sur ses clés :

- les plannings utilisent `upsert` par nom ;
- les employés utilisent `upsert` par adresse électronique ;
- les pointages utilisent `upsert` par le couple unique `employeeId_date` ;
- les règles recherchent le couple type-priorité, puis utilisent `update` ou `create`.

Le nombre de pointages produits dépend de la date de référence et du fait qu'elle appartienne ou non au planning standard. Le code ne retourne donc pas un nombre constant de pointages.

## 7.5 Calculs partagés

Le seed réutilise des fonctions applicatives :

- normalisation des dates ;
- recherche du jour planifié précédent ;
- vérification d'un jour travaillé ;
- positionnement d'une heure sur une date ;
- calcul du résultat de sortie ;
- construction de l'instantané de planning ;
- hachage des mots de passe et des PIN.

## 7.6 Connexion et fin d'exécution

Le fichier crée une instance directe de `PrismaClient`. Lorsqu'il est exécuté comme programme :

- il appelle `seedDatabase()` ;
- il journalise le résultat ;
- il journalise l'erreur et termine avec un code non nul en cas d'échec ;
- il appelle `$disconnect()` dans le traitement d'erreur et dans `finally`.

## 7.7 Seed des tests

`test/test-database.ts` :

1. vérifie l'URL de base de test ;
2. prépare la base ;
3. applique `prisma migrate deploy` avec le schéma du backend ;
4. instancie `PrismaClient` ;
5. appelle `seedDatabase()` avec une date fixe ;
6. ferme le client.

Cette procédure appartient à l'environnement de tests E2E.

## 7.8 Scripts de données complémentaires

### Création initiale d'un administrateur

`scripts/create-initial-admin.ts` :

- charge les variables d'environnement ;
- exige l'adresse électronique et le mot de passe ;
- vérifie l'existence du compte ;
- hache le mot de passe ;
- exécute la création dans une transaction ;
- génère un identifiant employé ;
- accepte des valeurs optionnelles pour le prénom, le nom, la fonction et le département ;
- ferme le client Prisma.

### Régularisation des PIN

`scripts/backfill-employee-pin-code-hashes.ts` :

- charge les employés concernés ;
- hache les PIN historiques ;
- met à jour `pinCodeHash` ;
- efface la valeur historique lorsque le traitement la remplace ;
- ferme le client Prisma.

### Régularisation des instantanés

`scripts/backfill-attendance-schedule-snapshots.ts` :

- charge les pointages avec leur employé et leur planning ;
- ignore les lignes sans planning exploitable ;
- construit l'instantané ;
- met à jour les pointages ;
- compte les lignes mises à jour et ignorées ;
- ferme le client Prisma.

**Fichiers de référence :**

- `apps/backend/prisma/seed.ts`
- `apps/backend/prisma.config.ts`
- `apps/backend/src/common/security/password.util.ts`
- `apps/backend/src/common/utils/attendance-date.util.ts`
- `apps/backend/src/common/utils/attendance-checkout.util.ts`
- `apps/backend/src/common/utils/attendance-schedule-snapshot.util.ts`
- `apps/backend/test/test-database.ts`
- `apps/backend/scripts/create-initial-admin.ts`
- `apps/backend/scripts/backfill-employee-pin-code-hashes.ts`
- `apps/backend/scripts/backfill-attendance-schedule-snapshots.ts`

# 8. Traçabilité

| Section | Sujet vérifié | Fichiers principaux |
| --- | --- | --- |
| 1 | Périmètre de la couche données | `apps/backend/prisma/schema.prisma`, services sous `apps/backend/src/modules` |
| 2 | PostgreSQL local | `docker-compose.yml` |
| 2 | Prisma et datasource | `apps/backend/prisma/schema.prisma`, `apps/backend/prisma.config.ts`, `apps/backend/package.json` |
| 2 | Client Prisma | `apps/backend/src/common/prisma/prisma.module.ts`, `prisma.service.ts` |
| 2 | Migrations et seed | `apps/backend/prisma/migrations`, `apps/backend/prisma/seed.ts` |
| 3 | Organisation des fichiers | `apps/backend/prisma`, `apps/backend/src/common/prisma`, `apps/backend/scripts`, `apps/backend/test/test-database.ts` |
| 3 | Projections | `apps/backend/src/common/prisma/selects.ts` |
| 3 | Répartition des accès | Tous les services sous `apps/backend/src/modules`, scripts et seed |
| 4 | Modèles | `apps/backend/prisma/schema.prisma` |
| 4 | Employé | `schema.prisma`, `AuthService`, `EmployeesService` |
| 4 | Planning | `schema.prisma`, `SchedulesService`, utilitaires d'instantané |
| 4 | Pointage | `schema.prisma`, `AttendanceService`, `AttendanceMonthlyMetricsService` |
| 4 | Calendrier | `schema.prisma`, `CalendarService` |
| 4 | Sanctions | `schema.prisma`, `SanctionsService`, `sanction-rules.config.ts` |
| 5 | Flux d'accès | Contrôleurs et services sous `apps/backend/src/modules` |
| 5 | Transactions | `EmployeesService`, `scripts/create-initial-admin.ts` |
| 5 | Contraintes | `schema.prisma`, services d'employés, plannings, calendrier et pointage |
| 6 | Historique des migrations | Les vingt fichiers `apps/backend/prisma/migrations/*/migration.sql` |
| 6 | Commandes Prisma | `apps/backend/package.json`, `package.json` |
| 6 | Base de test | `apps/backend/test/test-database.ts`, `test/test-environment.ts` |
| 7 | Contenu et ordre du seed | `apps/backend/prisma/seed.ts` |
| 7 | Scripts complémentaires | Les trois fichiers sous `apps/backend/scripts` |

# 9. Observations

## 9.1 Modélisation

- Le schéma contient cinq modèles et sept énumérations.
- Toutes les clés primaires de modèles sont des chaînes UUID générées par Prisma.
- Tous les modèles possèdent `createdAt` et `updatedAt`.
- Les horaires du planning sont stockés comme chaînes ; les jours travaillés sont stockés en JSON.
- Un pointage est unique par employé et par date.
- Les données du planning sont dupliquées dans le pointage sous forme d'instantané, sans relation Prisma supplémentaire.
- `SanctionRule` n'a aucune relation déclarée avec `Attendance`.

## 9.2 Relations

- La suppression d'un planning place `Employee.scheduleId` à `NULL` au niveau de la relation.
- La suppression d'un employé entraîne la suppression en cascade de ses pointages.
- La suppression d'un employé conserve ses entrées calendrier en plaçant leur référence à `NULL`.
- Le service de calendrier supprime les entrées avec `prisma.calendarEntry.delete()`.
- Aucun soft delete générique n'est présent ; les champs `isActive` ou `active` sont propres aux modèles concernés.

## 9.3 Organisation des données

- Le schéma, les migrations et le seed sont regroupés dans `apps/backend/prisma`.
- Les projections partagées sont regroupées dans `common/prisma/selects.ts`.
- Les services métier accèdent directement aux delegates de `PrismaService`.
- Aucun repository intermédiaire, mapper de persistance générique ou couche DAO n'est présent.
- Les scripts de reprise utilisent des instances directes de `PrismaClient`.

## 9.4 Utilisation de Prisma

- `PrismaModule` est global.
- Le client est généré par un script explicite.
- La connexion utilise uniquement `DATABASE_URL`.
- Le bootstrap HTTP n'exécute ni migration ni seed.
- Les migrations sont des fichiers SQL versionnés.
- Le seed utilise majoritairement `upsert`, mais ne crée aucune entrée calendrier.
- Aucun appel Prisma de SQL brut n'est présent dans les fichiers TypeScript analysés.
- Aucun script `db push`, `migrate reset` ou `db pull` n'est déclaré.

## 9.5 Particularités historiques

- Le schéma conserve à la fois `employeeCode`, devenu optionnel, et `employeeIdentifier`, obligatoire et unique.
- Le schéma conserve `pinCode` optionnel avec `pinCodeHash`; le service d'authentification et le script de régularisation prennent en charge la migration des valeurs historiques.
- `ATTENDANCE_ALLOWED_RADIUS_METERS` reste pris en charge comme variable compatible avec la configuration des rayons.
- Les migrations contiennent des reprises de données en plus des changements de structure.
- La migration des règles de sanction insère les règles initiales au niveau SQL, tandis que le seed assure aussi leur présence par type et priorité.
