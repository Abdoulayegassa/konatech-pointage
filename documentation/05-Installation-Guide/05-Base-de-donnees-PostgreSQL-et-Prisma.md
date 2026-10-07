# Base de données PostgreSQL et Prisma

| Métadonnée | Valeur |
| --- | --- |
| Document ID | IG-005 |
| Titre | Base de données PostgreSQL et Prisma |
| Version | 1.0 |
| Statut | Validé |
| Classification | Interne |
| Référence | Installation Guide |

## 1. Présentation

### 1.1 Objectif

Ce chapitre décrit la configuration de la base de données réellement présente
dans Konatech Pointage : le service PostgreSQL, le schéma Prisma, les
migrations versionnées, la génération du client, le seed et les mécanismes de
vérification.

### 1.2 Rôle de PostgreSQL

PostgreSQL est le moteur persistant du backend. Il conserve les employés, les
plannings, les pointages, les entrées du calendrier RH et les règles de
sanction. Le backend y accède par Prisma Client.

Références :
`apps/backend/prisma/schema.prisma`,
`docker-compose.yml`.

### 1.3 Rôle de Prisma

Prisma fournit dans le projet :

- la description déclarative du schéma ;
- l'historique SQL des migrations ;
- la génération du client TypeScript ;
- l'accès aux données depuis NestJS ;
- l'exécution du seed ;
- les commandes d'état et de déploiement des migrations.

Références :
`apps/backend/prisma/schema.prisma`,
`apps/backend/prisma.config.ts`,
`apps/backend/src/common/prisma/prisma.service.ts`,
`package.json`.

## 2. Architecture de la base

### 2.1 Composants

| Élément | Configuration observée | Emplacement |
| --- | --- | --- |
| Moteur | PostgreSQL | `apps/backend/prisma/schema.prisma` |
| Image locale | `postgres:16-alpine` | `docker-compose.yml` |
| ORM et client | Prisma | `apps/backend/package.json` |
| Schéma | Fichier Prisma unique | `apps/backend/prisma/schema.prisma` |
| Configuration Prisma | Datasource, schéma, migrations et seed | `apps/backend/prisma.config.ts` |
| Migrations | Répertoires horodatés contenant `migration.sql` | `apps/backend/prisma/migrations` |
| Seed | Script TypeScript | `apps/backend/prisma/seed.ts` |
| Intégration NestJS | Module global et service étendant `PrismaClient` | `apps/backend/src/common/prisma` |

### 2.2 Flux d'accès

```text
+---------------------------+
| Backend NestJS            |
+-------------+-------------+
              |
              v
+---------------------------+
| PrismaService             |
| Prisma Client généré      |
+-------------+-------------+
              |
              v
+---------------------------+
| Schéma et migrations      |
| Prisma                    |
+-------------+-------------+
              |
              v
+---------------------------+
| PostgreSQL                |
| service local ou URL      |
+---------------------------+
```

### 2.3 Emplacements

Le schéma et la configuration Prisma sont placés sous `apps/backend`. La
configuration indique explicitement :

- `prisma/schema.prisma` comme schéma ;
- `prisma/migrations` comme répertoire de migrations ;
- `node --require ts-node/register/transpile-only prisma/seed.ts` comme
  commande de seed.

Ces chemins sont interprétés depuis l'application backend.

Référence :
`apps/backend/prisma.config.ts`.

### 2.4 Génération du client

Le générateur `client` utilise `prisma-client-js`. Les cibles binaires
déclarées sont :

- `native` ;
- `debian-openssl-3.0.x`.

Le client est généré explicitement par les scripts pnpm et pendant la
construction de l'image Docker backend.

Références :
`apps/backend/prisma/schema.prisma`,
`package.json`,
`docker/backend.Dockerfile`.

## 3. Configuration PostgreSQL

### 3.1 Connexion et variables

| Variable | Usage observé | Composant | Références |
| --- | --- | --- | --- |
| `DATABASE_URL` | URL PostgreSQL du datasource Prisma | Prisma et backend | `apps/backend/prisma/schema.prisma`, `apps/backend/prisma.config.ts`, `apps/backend/src/app.module.ts` |
| `TEST_DATABASE_URL` | Surcharge de l'URL pour les tests backend | Préparation e2e | `apps/backend/test/test-environment.ts` |
| `POSTGRES_DB` | Nom de la base du conteneur et composant de `DATABASE_URL` | Docker Compose | `docker-compose.yml`, `.env.production.example` |
| `POSTGRES_USER` | Utilisateur PostgreSQL et composant de `DATABASE_URL` | Docker Compose | mêmes fichiers |
| `POSTGRES_PASSWORD` | Mot de passe PostgreSQL et composant de `DATABASE_URL` | Docker Compose | mêmes fichiers |
| `POSTGRES_PORT` | Port publié sur l'hôte | Docker Compose | mêmes fichiers |

`DATABASE_URL` est obligatoire dans le schéma de validation du backend. Prisma
la lit à la fois dans son datasource et dans `prisma.config.ts`.

### 3.2 Ports et réseau Docker

| Élément | Valeur observée |
| --- | --- |
| Port PostgreSQL dans le conteneur | `5432` |
| Port hôte par défaut dans Compose | `5433` |
| Nom du service Compose | `postgres` |
| Nom du conteneur | `konatech-postgres` |
| Hôte utilisé par le backend conteneurisé | `postgres` |
| Schéma indiqué dans l'URL Compose | `public` |

La publication du port est définie par
`${POSTGRES_PORT:-5433}:5432`. Le backend conteneurisé reçoit une
`DATABASE_URL` construite par Compose à partir des trois variables
PostgreSQL.

Référence :
`docker-compose.yml`.

### 3.3 Persistance Docker

Le service PostgreSQL monte le volume nommé `postgres-data` sur
`/var/lib/postgresql/data`. La commande `docker compose down`, appelée par
`pnpm db:down`, ne contient pas l'option de suppression des volumes.

Références :
`docker-compose.yml`,
`package.json`.

### 3.4 Santé du service

PostgreSQL possède un healthcheck Docker fondé sur `pg_isready`, avec
l'utilisateur et la base du conteneur. Le backend du profil `app` dépend de
l'état sain de PostgreSQL avant son démarrage.

Référence :
`docker-compose.yml`.

### 3.5 Démarrage local

Le script racine suivant démarre le service Compose par défaut :

```bash
pnpm db:up
```

Le service par défaut est PostgreSQL. Le backend et le frontend sont placés
derrière le profil Compose `app`.

Références :
`package.json`,
`docker-compose.yml`,
`README.md`.

### 3.6 Configuration hors Docker local

Le README identifie également une connexion PostgreSQL gérée par une
`DATABASE_URL`, notamment pour Render/Neon. Aucun fichier de configuration
PostgreSQL propre à Neon ou Render n'est versionné dans le dépôt : la liaison
observable est l'URL fournie au backend.

Référence :
`README.md`.

## 4. Schéma Prisma

### 4.1 Datasource

Le datasource se nomme `db`, utilise le provider `postgresql` et lit
`DATABASE_URL`.

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

Référence :
`apps/backend/prisma/schema.prisma`.

### 4.2 Generator

Le générateur se nomme `client`. Il produit Prisma Client JavaScript avec les
cibles binaires adaptées à l'environnement local et à l'image Debian du
backend.

Référence :
`apps/backend/prisma/schema.prisma`.

### 4.3 Modèles

Le schéma courant contient exactement cinq modèles :

| Modèle Prisma | Rôle observable | Identifiants et contraintes principales |
| --- | --- | --- |
| `Employee` | Compte, identité professionnelle, rôle, état et planning d'un employé | UUID ; courriel et identifiant employé uniques ; code employé et PIN historique uniques lorsqu'ils existent |
| `Schedule` | Horaires, marge de retard, jours travaillés et état d'un planning | UUID ; nom unique ; jours stockés en JSON |
| `Attendance` | Pointage journalier, horaires, résultat de sortie, état, instantané du planning et preuves de vérification | UUID ; couple employé/date unique ; index métier et de vérification |
| `CalendarEntry` | Jour férié, congé ou mission, global ou rattaché à un employé | UUID ; index sur date, type et employé |
| `SanctionRule` | Paramètres d'une règle de sanction | UUID ; index sur type/état et sur priorité |

Référence :
`apps/backend/prisma/schema.prisma`.

### 4.4 Énumérations

| Énumération | Valeurs réellement déclarées |
| --- | --- |
| `AttendanceStatus` | `PRESENT`, `LATE`, `INCOMPLETE`, `ABSENT`, `NON_WORKING_DAY_WORK` |
| `AccessRole` | `ADMIN`, `EMPLOYEE` |
| `AttendanceVerificationMethod` | `NONE`, `GPS`, `PHOTO` |
| `AttendanceVerificationLevel` | `OK`, `WARNING`, `STRICT` |
| `CalendarEntryType` | `PUBLIC_HOLIDAY`, `COMPANY_HOLIDAY`, `LEAVE`, `EXTERNAL_MISSION` |
| `SanctionRuleType` | `MINOR_LATENESS`, `MAJOR_LATENESS`, `EARLY_DEPARTURE`, `UNJUSTIFIED_ABSENCE`, `JUSTIFIED_ABSENCE`, `LEAVE`, `EXTERNAL_MISSION` |
| `SanctionPeriod` | `MONTHLY` |

Référence :
`apps/backend/prisma/schema.prisma`.

### 4.5 Relations

| Source | Cible | Cardinalité observable | Comportement de suppression |
| --- | --- | --- | --- |
| `Employee.schedule` | `Schedule` | Plusieurs employés vers un planning facultatif | `SetNull` |
| `Attendance.employee` | `Employee` | Plusieurs pointages vers un employé obligatoire | `Cascade` |
| `CalendarEntry.employee` | `Employee` | Plusieurs entrées vers un employé facultatif | `SetNull` |

`SanctionRule` ne possède aucune relation Prisma dans le schéma courant.
`Attendance` conserve des champs d'instantané du planning, mais ne déclare pas
de relation vers `Schedule`.

Référence :
`apps/backend/prisma/schema.prisma`.

### 4.6 Contraintes et index

Les contraintes principales observées sont :

- unicité de `Employee.employeeCode`, lorsqu'il est renseigné ;
- unicité de `Employee.employeeIdentifier` ;
- unicité de `Employee.pinCode`, lorsqu'il est renseigné ;
- unicité de `Employee.email` ;
- unicité de `Schedule.name` ;
- unicité composite de `Attendance.employeeId` et `Attendance.date`.

Des index sont définis sur la date et plusieurs résultats de pointage, sur les
champs de recherche de `CalendarEntry`, ainsi que sur le type, l'état et la
priorité de `SanctionRule`.

Référence :
`apps/backend/prisma/schema.prisma`.

## 5. Migrations

### 5.1 Emplacement et organisation

Les migrations sont stockées dans
`apps/backend/prisma/migrations`. Chaque migration possède un répertoire
horodaté et un fichier `migration.sql`. Aucun fichier
`migration_lock.toml` n'est présent dans ce répertoire.

La configuration Prisma pointe explicitement vers ce chemin.

Référence :
`apps/backend/prisma.config.ts`.

### 5.2 Historique versionné

Vingt migrations sont présentes :

| Migration | Opération principale observée |
| --- | --- |
| `20260416140000_init` | Création initiale de `Schedule`, `Employee`, `Attendance`, du statut de pointage, des contraintes et relations |
| `20260416163000_add_auth_to_employee` | Ajout du rôle d'accès et du hash de mot de passe |
| `20260416190000_refine_attendance_status_flow` | Remplacement des valeurs initiales de `AttendanceStatus` |
| `20260416203000_enhance_schedule_management` | Ajout de la marge de retard et de l'état du planning |
| `20260420120000_smart_attendance_security` | Ajout des données GPS/photo d'entrée et de la méthode de vérification |
| `20260420170000_attendance_verification_levels` | Ajout du niveau et du motif de vérification d'entrée |
| `20260420190000_attendance_photo_cloudinary_metadata` | Ajout de l'identifiant public Cloudinary de la photo d'entrée |
| `20260421100000_checkout_smart_security` | Ajout des données et index de vérification de sortie |
| `20260423100000_attendance_exit_outcomes` | Ajout de l'heure de sortie prévue, des heures supplémentaires et de la sortie tardive |
| `20260423110000_attendance_absence_count_indexes` | Ajout du compteur d'absences et d'index |
| `20260424120000_checkout_outcome_clarity` | Ajout de la sortie anticipée et des minutes associées |
| `20260427120000_add_employee_pin_code` | Ajout du PIN employé et de son index unique |
| `20260429110000_make_employee_code_optional` | Passage du code employé en champ facultatif |
| `20260506120000_add_employee_identifier` | Ajout, alimentation puis contrainte de l'identifiant employé |
| `20260506153000_add_employee_pin_code_hash` | Ajout du hash de PIN |
| `20260507110000_add_attendance_outside_schedule_work` | Ajout de l'indicateur de travail hors planning |
| `20260507123000_add_attendance_schedule_snapshots` | Ajout des champs d'instantané du planning |
| `20260623143000_add_hr_calendar_entries` | Création de `CalendarEntry`, de son type, de ses index et de sa relation |
| `20260623162000_add_non_working_day_work_status` | Ajout du statut de travail un jour non ouvré |
| `20260626190000_add_configurable_sanction_rules` | Création des types, de `SanctionRule`, de ses index et insertion des règles initiales |

Références :
les fichiers `migration.sql` sous
`apps/backend/prisma/migrations`.

### 5.3 Scripts de migration

| Script racine | Commande Prisma exécutée | Usage observable |
| --- | --- | --- |
| `pnpm prisma:status` | `prisma migrate status` | Lire l'état des migrations |
| `pnpm prisma:migrate` | `prisma migrate dev` | Appliquer les migrations en développement et gérer l'évolution locale |
| `pnpm prisma:migrate:deploy` | `prisma migrate deploy` | Appliquer les migrations existantes sans en créer |

Le manifeste backend expose également `prisma:migrate` et
`prisma:migrate:deploy` avec les mêmes commandes.

Références :
`package.json`,
`apps/backend/package.json`.

### 5.4 Procédure locale observée

Le README décrit l'ordre suivant :

```bash
pnpm db:up
pnpm prisma:generate
pnpm prisma:status
pnpm prisma:migrate
pnpm prisma:seed
```

Cette séquence démarre PostgreSQL, génère le client, inspecte puis applique les
migrations de développement et charge les données de démonstration.

Référence :
`README.md`.

### 5.5 Déploiement conteneurisé

Au démarrage du conteneur backend, la commande d'entrée exécute :

```text
prisma migrate deploy
        |
        v
node dist/main.js
```

Le backend ne démarre donc qu'après la tentative d'application des migrations
existantes. Compose attend auparavant que le healthcheck PostgreSQL réussisse.

Références :
`docker/backend.Dockerfile`,
`docker-compose.yml`.

### 5.6 Seed

Le script racine disponible est :

```bash
pnpm prisma:seed
```

Il appelle `prisma db seed`, lequel utilise la commande déclarée dans
`prisma.config.ts`.

Le seed courant réalise des `upsert` pour deux plannings, cinq employés et des
pointages construits relativement à une date de référence. Il crée ou met à
jour les deux règles de sanction par défaut. Il ne crée aucune
`CalendarEntry`.

Le seed emploie la contrainte composite employé/date pour les pointages. Le
nombre de pointages dépend de la date de référence et des jours planifiés.

Références :
`apps/backend/prisma/seed.ts`,
`apps/backend/prisma.config.ts`,
`package.json`.

### 5.7 Scripts de reprise de données

Deux scripts backend explicitement déclarés modifient des données existantes :

| Script | Comportement |
| --- | --- |
| `pnpm --dir apps/backend run pins:backfill` | Transforme les anciens PIN en hash pour les employés concernés, puis efface le PIN en clair |
| `pnpm --dir apps/backend run snapshots:backfill` | Complète l'instantané de planning des pointages qui n'en possèdent pas, lorsqu'un planning actif est disponible |

Ces opérations ne sont pas des migrations SQL Prisma ; ce sont des scripts
TypeScript utilisant Prisma Client.

Références :
`apps/backend/package.json`,
`apps/backend/scripts/backfill-employee-pin-code-hashes.ts`,
`apps/backend/scripts/backfill-attendance-schedule-snapshots.ts`.

### 5.8 Base de test

La préparation e2e :

1. résout `TEST_DATABASE_URL`, puis `DATABASE_URL`, puis l'URL de test codée ;
2. se connecte à la base administrative `postgres` ;
3. termine les connexions à la base cible ;
4. supprime puis recrée uniquement la base de test résolue ;
5. exécute `prisma migrate deploy` ;
6. exécute le seed avec une date de référence fixe.

Cette procédure destructive est limitée à l'URL de base obtenue par la
configuration de test.

Références :
`apps/backend/test/test-environment.ts`,
`apps/backend/test/test-database.ts`.

## 6. Génération du client Prisma

### 6.1 Scripts disponibles

| Contexte | Commande | Définition |
| --- | --- | --- |
| Racine | `pnpm prisma:generate` | `package.json` |
| Backend | `pnpm --dir apps/backend run prisma:generate` | `apps/backend/package.json` |
| Validation générale | `pnpm validate` | `package.json` |
| Validation backend | `pnpm validate:backend` | `package.json` |
| Nettoyage Windows avec régénération | `pnpm clean:windows:prisma` | `package.json`, `scripts/clean-windows.ps1` |

Les deux commandes de validation exécutent la génération avant les contrôles
TypeScript et backend correspondants.

### 6.2 Génération pendant le build Docker

L'image backend :

1. installe les dépendances avec le lockfile figé ;
2. copie le dépôt ;
3. définit une `DATABASE_URL` de build ;
4. exécute directement le CLI Prisma avec `generate` ;
5. construit le backend NestJS.

La valeur de build sert à satisfaire la configuration Prisma pendant la
génération. La connexion d'exécution est fournie séparément par Compose.

Référence :
`docker/backend.Dockerfile`.

### 6.3 Absence de génération automatique à l'installation

Les manifests ne définissent pas de script `postinstall` générant le client.
La génération est donc une commande explicite, une étape de validation ou une
étape du build Docker.

Références :
`package.json`,
`apps/backend/package.json`.

## 7. Vérification

### 7.1 Connexion PostgreSQL

```bash
pnpm db:status
```

Cette commande affiche l'état des services Docker Compose. Le healthcheck
PostgreSQL appelle `pg_isready`.

Références :
`package.json`,
`docker-compose.yml`.

### 7.2 État des migrations

```bash
pnpm prisma:status
```

`prisma migrate status` utilise `DATABASE_URL`, lit le répertoire de
migrations et compare son état avec la base accessible.

Références :
`package.json`,
`apps/backend/prisma.config.ts`.

### 7.3 Génération et cohérence du schéma

```bash
pnpm prisma:generate
```

La génération charge `prisma.config.ts`, lit `schema.prisma` et produit Prisma
Client. Une configuration ou un schéma non accepté par Prisma fait échouer la
commande.

Références :
`package.json`,
`apps/backend/prisma.config.ts`,
`apps/backend/prisma/schema.prisma`.

### 7.4 Validation backend

```bash
pnpm validate:backend
```

Cette chaîne exécute la génération Prisma, le typecheck backend, les tests
backend et le build backend.

Référence :
`package.json`.

### 7.5 Tests end-to-end

```bash
pnpm test:backend
```

Les suites e2e qui appellent `prepareTestDatabase` reconstruisent leur base,
appliquent les migrations et exécutent le seed avant leurs contrôles. Elles
vérifient ainsi l'utilisation de PostgreSQL et du client Prisma dans le
contexte de test.

Références :
`apps/backend/test/test-database.ts`,
`apps/backend/test/test-environment.ts`,
`apps/backend/test/app.e2e-spec.ts`,
`apps/backend/test/calendar.e2e-spec.ts`,
`package.json`.

### 7.6 Connexion applicative

`PrismaService` étend `PrismaClient` et ferme la connexion lors de la
destruction du module NestJS. `PrismaModule` est global et exporte ce service
aux modules applicatifs.

Références :
`apps/backend/src/common/prisma/prisma.service.ts`,
`apps/backend/src/common/prisma/prisma.module.ts`.

### 7.7 Mécanismes absents

Aucun script racine ne fournit :

- `prisma validate` ;
- `prisma db pull` ;
- `prisma db push` ;
- `prisma migrate reset` ;
- Prisma Studio.

Ces commandes ne font donc pas partie des procédures versionnées du projet.

## 8. Traçabilité

### 8.1 Configuration

| Information | Fichiers concernés |
| --- | --- |
| Provider, generator, modèles, relations et index | `apps/backend/prisma/schema.prisma` |
| Chemins Prisma, datasource et commande de seed | `apps/backend/prisma.config.ts` |
| Validation de `DATABASE_URL` | `apps/backend/src/app.module.ts` |
| Exemple backend de `DATABASE_URL` | `apps/backend/.env.example` |
| Variables PostgreSQL de production | `.env.production.example` |
| Service, port, volume et healthcheck PostgreSQL | `docker-compose.yml` |
| Génération et migration au sein de l'image | `docker/backend.Dockerfile` |

### 8.2 Exécution

| Procédure | Fichiers concernés |
| --- | --- |
| Démarrage et état PostgreSQL | `package.json`, `docker-compose.yml` |
| Génération Prisma | `package.json`, `apps/backend/package.json` |
| Migration de développement | mêmes manifests |
| Déploiement des migrations | mêmes manifests, `docker/backend.Dockerfile` |
| Seed | `apps/backend/prisma/seed.ts`, `apps/backend/prisma.config.ts` |
| Préparation de la base e2e | `apps/backend/test/test-database.ts`, `apps/backend/test/test-environment.ts`, suites `*.e2e-spec.ts` qui appellent `prepareTestDatabase` |
| Reprise des hash de PIN | `apps/backend/scripts/backfill-employee-pin-code-hashes.ts` |
| Reprise des instantanés de planning | `apps/backend/scripts/backfill-attendance-schedule-snapshots.ts` |

### 8.3 Historique

| Élément | Fichier ou répertoire |
| --- | --- |
| Migration initiale | `apps/backend/prisma/migrations/20260416140000_init/migration.sql` |
| Migrations d'authentification employé | `apps/backend/prisma/migrations/20260416163000_add_auth_to_employee`, `apps/backend/prisma/migrations/20260427120000_add_employee_pin_code`, `apps/backend/prisma/migrations/20260506153000_add_employee_pin_code_hash` |
| Migrations de sécurité du pointage | `apps/backend/prisma/migrations/20260420120000_smart_attendance_security` à `apps/backend/prisma/migrations/20260421100000_checkout_smart_security` |
| Migration du calendrier RH | `apps/backend/prisma/migrations/20260623143000_add_hr_calendar_entries/migration.sql` |
| Migration des règles de sanction | `apps/backend/prisma/migrations/20260626190000_add_configurable_sanction_rules/migration.sql` |

## 9. Observations

### 9.1 Particularités

- Le schéma Prisma est centralisé dans un seul fichier.
- Le provider PostgreSQL est déclaré dans le schéma et dans l'URL de
  connexion.
- Les migrations contiennent le SQL effectivement versionné, y compris des
  transformations de données et l'insertion initiale de règles de sanction.
- Le seed est réexécutable pour ses modèles principaux grâce à des `upsert` ou
  à une recherche préalable.
- Le seed dépend de la date de référence pour certains pointages.
- Les instantanés de planning dans `Attendance` sont des champs de données,
  non une relation Prisma.
- Le service Prisma NestJS ne définit pas explicitement `onModuleInit` ni un
  appel `$connect` ; la connexion suit le comportement de Prisma Client lors
  de la première opération.
- La fermeture explicite `$disconnect` est présente à la destruction du
  module et dans les scripts autonomes.

### 9.2 Dépendances

- PostgreSQL doit être accessible pour les migrations, le seed et les tests
  backend.
- `DATABASE_URL` doit être disponible pour la configuration Prisma.
- Prisma CLI et Prisma Client sont des dépendances du backend.
- Le seed dépend de plusieurs utilitaires métier du backend.
- Le build Docker génère Prisma Client avant de compiler NestJS.
- La base de test suppose un compte autorisé à terminer les connexions,
  supprimer et créer la base cible.

### 9.3 Limitations observées

- Aucun script versionné ne réinitialise la base de développement.
- Aucun script versionné ne lance Prisma Studio.
- Aucun script `prisma validate` distinct n'est exposé.
- Aucun fichier de configuration PostgreSQL serveur, tel que
  `postgresql.conf` ou `pg_hba.conf`, n'est présent.
- Aucune extension PostgreSQL n'est déclarée par les migrations.
- Aucun mécanisme applicatif de réplication PostgreSQL n'est présent.
- La sauvegarde et la restauration sont documentées dans le README au moyen
  de `pg_dump`, `psql` et `pg_restore`, mais ne sont pas encapsulées dans des
  scripts du manifeste.
- Le volume Docker est local et nommé ; sa suppression n'est pas incluse dans
  `pnpm db:down`.
