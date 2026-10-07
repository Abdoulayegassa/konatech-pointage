# Migrations et Seed

| Métadonnée | Valeur |
| --- | --- |
| Document ID | IG-006 |
| Titre | Migrations et Seed |
| Version | 1.0 |
| Statut | Validé |
| Classification | Interne |
| Référence | Installation Guide |

## 1. Présentation

### 1.1 Objectif des migrations

Les migrations Prisma versionnent les transformations SQL appliquées à la
base PostgreSQL de Konatech Pointage. Elles créent le schéma initial, puis
font évoluer les tables, les types, les contraintes, les index et certaines
données existantes.

Le dépôt contient vingt migrations SQL sous
`apps/backend/prisma/migrations`.

Références :
`apps/backend/prisma.config.ts`,
`apps/backend/prisma/migrations`.

### 1.2 Objectif du seed

Le seed charge un jeu de démonstration utilisé par l'installation locale et
la préparation de plusieurs suites end-to-end. Il crée ou actualise des
plannings, des employés, des pointages et les règles de sanction par défaut.

Références :
`apps/backend/prisma/seed.ts`,
`apps/backend/test/test-database.ts`.

### 1.3 Rôle dans le cycle d'installation

Après la configuration de `DATABASE_URL`, le cycle documenté génère Prisma
Client, examine et applique les migrations, puis exécute le seed. Le backend
utilise ensuite le client généré pour accéder au schéma PostgreSQL obtenu.

Références :
`README.md`,
`package.json`,
`apps/backend/prisma/schema.prisma`.

## 2. Organisation des migrations

### 2.1 Emplacement

La configuration Prisma déclare :

| Élément | Chemin observé |
| --- | --- |
| Schéma | `prisma/schema.prisma` |
| Répertoire des migrations | `prisma/migrations` |
| Seed | `prisma/seed.ts` |

Ces chemins sont relatifs à `apps/backend`, où se trouve
`prisma.config.ts`.

Référence :
`apps/backend/prisma.config.ts`.

### 2.2 Structure des dossiers

Chaque migration possède la structure suivante :

```text
apps/backend/prisma/migrations/
└── <horodatage>_<description>/
    └── migration.sql
```

Les vingt répertoires observés contiennent chacun un unique
`migration.sql`. Aucun `migration_lock.toml` n'est présent dans le répertoire
des migrations.

### 2.3 Convention de nommage

Les noms suivent la convention observable :

```text
YYYYMMDDHHMMSS_description_en_snake_case
```

La partie numérique comporte quatorze chiffres. La description en anglais
résume l'évolution. Les horodatages présents vont du `20260416140000` au
`20260626190000`.

Référence :
`apps/backend/prisma/migrations`.

### 2.4 Historique

| Ordre | Migration | Contenu SQL observé |
| ---: | --- | --- |
| 1 | `20260416140000_init` | Création du type initial de statut, des tables `Schedule`, `Employee` et `Attendance`, des index et des clés étrangères |
| 2 | `20260416163000_add_auth_to_employee` | Création de `AccessRole`, ajout du rôle d'accès et de `passwordHash`, alimentation puis passage du hash en non-null |
| 3 | `20260416190000_refine_attendance_status_flow` | Remplacement du type de statut, conversion des anciennes valeurs et nouveau statut par défaut |
| 4 | `20260416203000_enhance_schedule_management` | Ajout de la marge de retard et de l'état actif aux plannings |
| 5 | `20260420120000_smart_attendance_security` | Création des méthodes de vérification et ajout des données GPS/photo d'entrée |
| 6 | `20260420170000_attendance_verification_levels` | Création des niveaux de vérification et ajout du niveau d'entrée |
| 7 | `20260420190000_attendance_photo_cloudinary_metadata` | Ajout de l'identifiant public Cloudinary de la photo d'entrée |
| 8 | `20260421100000_checkout_smart_security` | Ajout des données GPS/photo, méthode, niveau et index de sortie |
| 9 | `20260423100000_attendance_exit_outcomes` | Ajout de l'heure de sortie planifiée, des heures supplémentaires et de la sortie tardive |
| 10 | `20260423110000_attendance_absence_count_indexes` | Ajout du compteur d'absences et des index associés |
| 11 | `20260424120000_checkout_outcome_clarity` | Ajout des champs de sortie anticipée et de minutes supplémentaires, puis alimentation de données existantes |
| 12 | `20260427120000_add_employee_pin_code` | Ajout du PIN employé et de son index unique |
| 13 | `20260429110000_make_employee_code_optional` | Passage du code employé en champ nullable |
| 14 | `20260506120000_add_employee_identifier` | Ajout, calcul, passage en non-null et index unique de l'identifiant employé |
| 15 | `20260506153000_add_employee_pin_code_hash` | Ajout du hash de PIN |
| 16 | `20260507110000_add_attendance_outside_schedule_work` | Ajout du marqueur de travail hors planning |
| 17 | `20260507123000_add_attendance_schedule_snapshots` | Ajout des champs d'instantané du planning au pointage |
| 18 | `20260623143000_add_hr_calendar_entries` | Création du type et de la table du calendrier RH, des index et de la relation employé |
| 19 | `20260623162000_add_non_working_day_work_status` | Ajout du statut de travail un jour non ouvré |
| 20 | `20260626190000_add_configurable_sanction_rules` | Création des types et de la table de règles de sanction, des index et insertion de deux règles initiales |

Chaque ligne de ce tableau correspond au contenu du `migration.sql` du
répertoire nommé.

### 2.5 Transformations de données incluses

Cinq migrations contiennent explicitement des transformations ou insertions
de données, en plus des changements de structure :

| Migration | Transformation observée |
| --- | --- |
| `20260416163000_add_auth_to_employee` | Initialise `passwordHash` avant d'imposer la contrainte non-null |
| `20260416190000_refine_attendance_status_flow` | Convertit chaque ancien statut vers le nouveau type selon le statut, la sortie et le retard |
| `20260424120000_checkout_outcome_clarity` | Calcule `overtimeMinutes` à partir de `overtimeHours` et initialise les champs de sortie anticipée |
| `20260506120000_add_employee_identifier` | Construit les identifiants employés par année et rang avant d'imposer unicité et non-null |
| `20260626190000_add_configurable_sanction_rules` | Insère les deux règles de sanction initiales |

Références :
les fichiers `migration.sql` des migrations citées.

## 3. Scripts disponibles

### 3.1 Scripts Prisma à la racine

| Script | Commande exécutée | Rôle observable |
| --- | --- | --- |
| `pnpm prisma:generate` | `prisma generate` via le CLI local du backend | Générer Prisma Client |
| `pnpm prisma:status` | `prisma migrate status` | Comparer l'historique local avec la base |
| `pnpm prisma:migrate` | `prisma migrate dev` | Appliquer et gérer les migrations en développement |
| `pnpm prisma:migrate:deploy` | `prisma migrate deploy` | Appliquer uniquement les migrations existantes |
| `pnpm prisma:seed` | `prisma db seed` | Exécuter le seed configuré |

Référence :
`package.json`.

### 3.2 Scripts du backend

| Script | Commande exécutée | Rôle observable |
| --- | --- | --- |
| `prisma:generate` | `prisma generate` | Génération depuis `apps/backend` |
| `prisma:migrate` | `prisma migrate dev` | Migration de développement depuis le backend |
| `prisma:migrate:deploy` | `prisma migrate deploy` | Déploiement des migrations depuis le backend |
| `prisma:seed` | `prisma db seed` | Chargement du jeu initial |
| `pins:backfill` | Script TypeScript de reprise des PIN | Remplacer les anciens PIN stockés par leur hash |
| `snapshots:backfill` | Script TypeScript de reprise des instantanés | Compléter les instantanés de planning manquants |

Références :
`apps/backend/package.json`,
`apps/backend/scripts/backfill-employee-pin-code-hashes.ts`,
`apps/backend/scripts/backfill-attendance-schedule-snapshots.ts`.

### 3.3 Scripts de validation liés

| Script | Étapes liées à Prisma et à la base |
| --- | --- |
| `pnpm validate` | Génération Prisma, contrôles du workspace et tests backend |
| `pnpm validate:backend` | Génération Prisma, typecheck, tests et build backend |
| `pnpm test:backend` | Suites e2e ; certaines préparent une base, déploient les migrations et exécutent le seed |
| `pnpm clean:windows:prisma` | Nettoyage Windows puis régénération de Prisma Client |

Références :
`package.json`,
`scripts/clean-windows.ps1`,
`apps/backend/test/test-database.ts`.

### 3.4 Commandes absentes

Les scripts demandés suivants ne sont définis ni dans le manifeste racine ni
dans celui du backend :

| Mécanisme Prisma | Script versionné |
| --- | --- |
| `migrate reset` | Absent |
| `db push` | Absent |
| `db pull` | Absent |
| `prisma validate` | Absent |
| Prisma Studio | Absent |

Le dépôt ne fournit donc aucune procédure projet encapsulant ces commandes.

Références :
`package.json`,
`apps/backend/package.json`.

## 4. Procédure d'exécution

### 4.1 Flux

```text
+----------------------------+
| Configuration              |
| DATABASE_URL               |
+--------------+-------------+
               |
               v
+----------------------------+
| Generate                   |
| pnpm prisma:generate       |
+--------------+-------------+
               |
               v
+----------------------------+
| Migration                  |
| status puis migrate        |
+--------------+-------------+
               |
               v
+----------------------------+
| Seed                       |
| pnpm prisma:seed           |
+--------------+-------------+
               |
               v
+----------------------------+
| Validation                 |
| status / backend / tests   |
+----------------------------+
```

### 4.2 Configuration

Prisma lit `DATABASE_URL` dans `prisma.config.ts` et dans le datasource
`db`. Pour l'installation locale documentée, PostgreSQL est démarré avec :

```bash
pnpm db:up
```

Références :
`apps/backend/prisma.config.ts`,
`apps/backend/prisma/schema.prisma`,
`package.json`.

### 4.3 Génération

La commande documentée avant migration est :

```bash
pnpm prisma:generate
```

Elle utilise le schéma situé dans `apps/backend/prisma/schema.prisma`.

### 4.4 Migration locale

Le README donne les commandes suivantes :

```bash
pnpm prisma:status
pnpm prisma:migrate
```

La première ne modifie pas la base. La seconde exécute `migrate dev`.

Références :
`README.md`,
`package.json`.

### 4.5 Seed local

Après les migrations :

```bash
pnpm prisma:seed
```

Le CLI Prisma utilise la commande de seed déclarée dans
`apps/backend/prisma.config.ts`.

### 4.6 Déploiement

La commande exposée pour appliquer un historique déjà versionné est :

```bash
pnpm prisma:migrate:deploy
```

Le Dockerfile backend exécute également `prisma migrate deploy` avant
`node dist/main.js`. Dans Docker Compose, le backend attend auparavant que
PostgreSQL soit sain.

Références :
`package.json`,
`docker/backend.Dockerfile`,
`docker-compose.yml`.

### 4.7 Préparation des tests

Les suites qui appellent `prepareTestDatabase` suivent un cycle distinct :

```text
Résolution de l'URL de test
             |
             v
Suppression et recréation de la base cible
             |
             v
prisma migrate deploy
             |
             v
seedDatabase avec date fixe
             |
             v
Exécution des contrôles e2e
```

Le script résout l'URL dans cet ordre : `TEST_DATABASE_URL`,
`DATABASE_URL`, puis l'URL de test interne. Il se connecte à la base
administrative `postgres` pour recréer la base cible.

Références :
`apps/backend/test/test-environment.ts`,
`apps/backend/test/test-database.ts`,
les suites `*.e2e-spec.ts` qui importent `prepareTestDatabase`.

## 5. Jeu de données initial

### 5.1 Fichier et exécution

Le seed existe dans `apps/backend/prisma/seed.ts`. Il exporte
`seedDatabase`, puis crée un `PrismaClient` pour son exécution autonome. La
connexion Prisma est fermée en cas d'échec comme à la fin du traitement.

La configuration exécute ce TypeScript avec Node.js et
`ts-node/register/transpile-only`.

Références :
`apps/backend/prisma/seed.ts`,
`apps/backend/prisma.config.ts`.

### 5.2 Données créées ou actualisées

| Entité | Quantité ou comportement observé | Méthode |
| --- | --- | --- |
| `Schedule` | Deux plannings nommés | `upsert` par nom |
| `Employee` | Cinq employés de démonstration | `upsert` par courriel |
| `Attendance` | Pointages du jour de référence et de jours planifiés précédents | `upsert` par couple employé/date |
| `SanctionRule` | Deux règles par défaut | Recherche par type/priorité, puis `update` ou `create` |
| `CalendarEntry` | Aucune donnée créée par le seed | Aucun appel Prisma pour ce modèle |

Référence :
`apps/backend/prisma/seed.ts`.

### 5.3 Plannings initiaux

Le seed crée ou met à jour :

| Nom | Horaire | Marge | Jours |
| --- | --- | ---: | --- |
| `Office Day Shift` | `08:00` à `17:00` | 5 minutes | `STANDARD_WORK_WEEK` |
| `Operations Rotation` | `09:00` à `18:00` | 10 minutes | `FULL_WORK_WEEK` |

Les constantes de jours proviennent de
`apps/backend/src/common/utils/attendance-date.util.ts`.

Référence :
`apps/backend/prisma/seed.ts`.

### 5.4 Employés initiaux

Le seed prépare :

- deux comptes avec `AccessRole.ADMIN` ;
- trois comptes avec `AccessRole.EMPLOYEE` ;
- quatre employés affectés à l'un des deux plannings ;
- un employé sans planning ;
- des identifiants employés construits au format utilisé par la fonction du
  seed ;
- des hash de mots de passe ;
- deux hash de PIN, ainsi que des cas historiques servant au flux de reprise.

Les valeurs sensibles et les identifiants de connexion ne sont pas reproduits
dans ce guide.

Référence :
`apps/backend/prisma/seed.ts`.

### 5.5 Pointages initiaux

Les pointages sont construits à partir de la date passée à `seedDatabase` :

- des entrées peuvent être ajoutées pour le jour de référence selon le
  planning ;
- des entrées sont ajoutées pour des jours planifiés précédents ;
- les statuts utilisés comprennent `PRESENT`, `LATE` et, selon le jour,
  `ABSENT` ;
- les heures prévues, résultats de sortie, compteurs et instantanés de
  planning sont calculés par les utilitaires métier ;
- la quantité finale dépend de la date de référence et des jours de travail.

Références :
`apps/backend/prisma/seed.ts`,
`apps/backend/src/common/utils/attendance-date.util.ts`,
`apps/backend/src/common/utils/attendance-checkout.util.ts`,
`apps/backend/src/common/utils/attendance-schedule-snapshot.util.ts`.

### 5.6 Règles de sanction initiales

Deux règles actives sont assurées par le seed :

| Type | Priorité | Comportement structurel |
| --- | ---: | --- |
| `MINOR_LATENESS` | 10 | Plage bornée et tolérance mensuelle |
| `MAJOR_LATENESS` | 20 | Seuil minimal et absence de tolérance |

La dernière migration crée également ces deux enregistrements SQL. Le seed les
recherche par type et priorité, puis les met à jour ou les crée.

Références :
`apps/backend/prisma/seed.ts`,
`apps/backend/prisma/migrations/20260626190000_add_configurable_sanction_rules/migration.sql`.

### 5.7 Réexécution

Le seed emploie des `upsert` pour les plannings, les employés et les
pointages. Pour les règles, il cherche un enregistrement existant avant de
l'actualiser ou de le créer. Il ne supprime pas globalement les données avant
son exécution.

Référence :
`apps/backend/prisma/seed.ts`.

## 6. Vérification

### 6.1 Migrations appliquées

```bash
pnpm prisma:status
```

Le script exécute `prisma migrate status`. Il compare les migrations du
répertoire configuré avec la base pointée par `DATABASE_URL`.

Références :
`package.json`,
`apps/backend/prisma.config.ts`.

### 6.2 Client Prisma généré

```bash
pnpm prisma:generate
```

Une erreur de configuration ou de schéma fait échouer la génération. Les
chaînes `validate` et `validate:backend` incluent également cette étape.

Référence :
`package.json`.

### 6.3 Exécution du seed

```bash
pnpm prisma:seed
```

En cas de succès, le script affiche un bilan avec le nombre d'employés, de
plannings et de pointages traités. En cas d'échec, il affiche une erreur,
ferme Prisma Client et termine avec un code d'échec.

Référence :
`apps/backend/prisma/seed.ts`.

### 6.4 Présence des données de seed

Le dépôt ne contient pas de script autonome nommé pour compter ou valider
exclusivement les données du seed. Les contrôles disponibles sont :

| Contrôle | Observation |
| --- | --- |
| Sortie de `pnpm prisma:seed` | Confirme le nombre d'entités traité par l'exécution |
| `pnpm test:backend` | Les suites préparées par `prepareTestDatabase` utilisent le seed et interrogent ses données |
| API backend | Les tests e2e vérifient notamment la connexion, les employés et les plannings issus du jeu initial |

Références :
`apps/backend/prisma/seed.ts`,
`apps/backend/test/test-database.ts`,
`apps/backend/test/app.e2e-spec.ts`.

### 6.5 Validation backend

```bash
pnpm validate:backend
```

Cette commande génère Prisma Client, vérifie les types, exécute les tests
backend puis construit NestJS. Les suites e2e nécessitant la base appellent
leur mécanisme de préparation.

Références :
`package.json`,
`apps/backend/test/test-database.ts`.

### 6.6 Vérification Docker

```bash
pnpm db:status
```

Cette commande affiche l'état Compose. PostgreSQL possède un healthcheck
`pg_isready`. Ce contrôle confirme l'état du service, mais ne confirme pas à
lui seul que toutes les migrations ou données du seed sont présentes.

Références :
`package.json`,
`docker-compose.yml`.

## 7. Traçabilité

### 7.1 Commandes

| Commande | Définition | Configuration ou code exécuté |
| --- | --- | --- |
| `pnpm prisma:generate` | `package.json` | `apps/backend/prisma.config.ts`, `apps/backend/prisma/schema.prisma` |
| `pnpm prisma:status` | `package.json` | Répertoire défini dans `apps/backend/prisma.config.ts` |
| `pnpm prisma:migrate` | `package.json` | `prisma migrate dev` |
| `pnpm prisma:migrate:deploy` | `package.json`, `apps/backend/package.json` | `prisma migrate deploy` |
| `pnpm prisma:seed` | mêmes manifests | `apps/backend/prisma.config.ts`, `apps/backend/prisma/seed.ts` |
| `pnpm test:backend` | mêmes manifests | `apps/backend/test/jest-e2e.json`, suites `*.e2e-spec.ts` |
| `pnpm --dir apps/backend run pins:backfill` | `apps/backend/package.json` | `apps/backend/scripts/backfill-employee-pin-code-hashes.ts` |
| `pnpm --dir apps/backend run snapshots:backfill` | `apps/backend/package.json` | `apps/backend/scripts/backfill-attendance-schedule-snapshots.ts` |

### 7.2 Mécanismes

| Mécanisme | Fichiers concernés |
| --- | --- |
| Datasource et modèles courants | `apps/backend/prisma/schema.prisma` |
| Chemins de migration et commande de seed | `apps/backend/prisma.config.ts` |
| Historique SQL complet | `apps/backend/prisma/migrations/*/migration.sql` |
| Jeu initial | `apps/backend/prisma/seed.ts` |
| Migration au démarrage Docker | `docker/backend.Dockerfile` |
| Dépendance du backend envers PostgreSQL sain | `docker-compose.yml` |
| Résolution de l'environnement de test | `apps/backend/test/test-environment.ts` |
| Recréation, migration et seed de test | `apps/backend/test/test-database.ts` |
| Procédure locale documentée | `README.md` |

### 7.3 Données du seed

| Donnée | Source |
| --- | --- |
| Deux plannings | `apps/backend/prisma/seed.ts` |
| Cinq employés | même fichier |
| Pointages dépendants de la date | même fichier |
| Deux règles de sanction | même fichier et migration `20260626190000_add_configurable_sanction_rules` |
| Hash de mots de passe et de PIN | `apps/backend/prisma/seed.ts`, `apps/backend/src/common/security/password.util.ts` |
| Calcul des horaires et instantanés | utilitaires sous `apps/backend/src/common/utils` |

## 8. Observations

### 8.1 Particularités du processus

- L'historique contient vingt migrations SQL ordonnées par horodatage.
- Certaines migrations transforment des données existantes avant de renforcer
  les contraintes.
- La migration des règles de sanction insère des données ; le seed assure
  ensuite ces mêmes règles par recherche puis mise à jour ou création.
- Le seed est un module réutilisable par les tests et un exécutable autonome.
- Les pointages du seed varient avec la date de référence.
- Les tests passent une date fixe au seed.
- Le conteneur backend applique `migrate deploy` à chaque démarrage avant
  NestJS.
- La génération de Prisma Client est explicite ; aucun `postinstall` ne la
  déclenche.
- Les deux backfills sont des opérations Prisma Client distinctes des
  migrations SQL.

### 8.2 Dépendances

- `DATABASE_URL` est nécessaire au CLI Prisma.
- PostgreSQL doit être accessible pour les migrations et le seed.
- Prisma CLI, Prisma Client, Node.js et `ts-node` sont nécessaires aux scripts
  concernés.
- Le seed importe les énumérations du client généré et plusieurs utilitaires
  du backend.
- La préparation e2e suppose des droits PostgreSQL de suppression et de
  création sur la base cible.

### 8.3 Limitations observées

- Aucun script `migrate reset` n'est présent.
- Aucun script `db push` ou `db pull` n'est présent.
- Aucun script Prisma Studio n'est présent.
- Aucun script dédié ne vérifie uniquement le contenu du seed.
- Aucun rollback SQL inverse n'est versionné avec les migrations.
- Aucun script de migration ne déclenche automatiquement les deux backfills.
- `pnpm prisma:seed` ne réinitialise pas la base avant le chargement.
- La procédure destructive de recréation est réservée au mécanisme de test et
  n'est pas exposée comme script de réinitialisation de la base de
  développement.
