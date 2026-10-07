# Sauvegarde et restauration

| Métadonnée | Valeur |
|---|---|
| Document ID | OG-007 |
| Titre | Sauvegarde et restauration |
| Version | 1.0 |
| Statut | Validé |
| Classification | Interne |
| Référence | Operations Guide |
| Projet | Konatech Pointage |

# 1. Présentation

Ce chapitre décrit les mécanismes de sauvegarde, de restauration et de reconstitution réellement présents dans le dépôt Konatech Pointage. Le périmètre couvre PostgreSQL sous Docker Compose, les deux commandes `pg_dump` documentées, les commandes de restauration correspondantes, le volume de données, les migrations Prisma, le seed et les scripts de transformation de données.

Les procédures PostgreSQL présentes sont des commandes manuelles publiées dans `README.md`. Aucun script pnpm, shell, PowerShell ou TypeScript du dépôt ne les orchestre. Aucune valeur de mot de passe ou de chaîne de connexion n’est reproduite.

# 2. Données persistantes

| Élément | Support | Emplacement | Source |
|---|---|---|---|
| Employés et accès applicatifs | Tables PostgreSQL du modèle `Employee` | Base désignée par `POSTGRES_DB` ou `DATABASE_URL` | `apps/backend/prisma/schema.prisma`, `docker-compose.yml` |
| Plannings | Table PostgreSQL du modèle `Schedule` | Même base PostgreSQL | `apps/backend/prisma/schema.prisma` |
| Pointages, états, horaires et preuves référencées | Table PostgreSQL du modèle `Attendance` | Même base PostgreSQL | `apps/backend/prisma/schema.prisma` |
| Calendrier RH | Table PostgreSQL du modèle `CalendarEntry` | Même base PostgreSQL | `apps/backend/prisma/schema.prisma` |
| Règles de sanction | Table PostgreSQL du modèle `SanctionRule` | Même base PostgreSQL | `apps/backend/prisma/schema.prisma` |
| Fichiers physiques PostgreSQL | Volume Docker nommé | `postgres-data` monté sur `/var/lib/postgresql/data` | `docker-compose.yml` |
| Photos de vérification conditionnelles | Stockage distant appelé par le backend | Emplacement distant identifié par les métadonnées retournées au backend | `apps/backend/src/modules/attendance/attendance-photo-storage.service.ts` |
| Références des photos | Colonnes URL et identifiant public du modèle `Attendance` | PostgreSQL | `apps/backend/prisma/schema.prisma`, `apps/backend/src/modules/attendance/attendance-security.service.ts` |
| Schéma reproductible | Fichier Prisma et SQL versionné | `apps/backend/prisma/schema.prisma`, `apps/backend/prisma/migrations` | `apps/backend/prisma.config.ts` |
| Données de démonstration reproductibles | Code TypeScript versionné | `apps/backend/prisma/seed.ts` | `apps/backend/prisma.config.ts`, `apps/backend/prisma/seed.ts` |

Le volume `postgres-data` conserve les fichiers PostgreSQL lorsque les conteneurs sont arrêtés par `pnpm db:down`, car ce script exécute `docker compose down` sans option de suppression du volume. Cette persistance du volume ne crée pas un fichier de sauvegarde.

Les exports mensuels CSV et PDF sont des rapports produits à la demande et renvoyés au client. Ils ne couvrent pas l’ensemble des tables et aucun mécanisme du dépôt ne les réimporte dans PostgreSQL.

# 3. Mécanismes de sauvegarde présents

## 3.1 Sauvegarde SQL

`README.md` publie la commande suivante :

```bash
docker compose --env-file .env.production exec -T postgres sh -lc 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > backup.sql
```

Le fonctionnement observable est :

1. Docker Compose exécute `pg_dump` dans le service `postgres` ;
2. `pg_dump` utilise `POSTGRES_USER` et `POSTGRES_DB` dans le conteneur ;
3. la sortie SQL est redirigée par le shell hôte vers `backup.sql`.

## 3.2 Sauvegarde au format personnalisé PostgreSQL

La seconde commande documentée est :

```bash
docker compose --env-file .env.production exec -T postgres sh -lc 'pg_dump -Fc -U "$POSTGRES_USER" "$POSTGRES_DB"' > backup.dump
```

L’option `-Fc` demande le format personnalisé de PostgreSQL. Le shell hôte écrit la sortie dans `backup.dump`.

## 3.3 Portée observable

Les deux commandes ciblent la base identifiée par `POSTGRES_DB`. Elles extraient les objets et données PostgreSQL de cette base, dont les tables correspondant aux modèles Prisma.

Elles ne copient pas les fichiers de photo conservés hors PostgreSQL. Les colonnes de référence aux photos appartiennent en revanche aux données de la table `Attendance` et sont incluses dans la sauvegarde de cette table.

Les commandes se trouvent uniquement dans `README.md`. Aucun script `backup` ou `db:backup` n’est défini dans `package.json` ou `apps/backend/package.json`.

# 4. Mécanismes de restauration présents

## 4.1 Restauration d’un fichier SQL

La commande documentée est :

```bash
cat backup.sql | docker compose --env-file .env.production exec -T postgres sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

Le shell hôte lit `backup.sql` et transmet son contenu à `psql` dans le conteneur PostgreSQL. La cible est la base désignée par `POSTGRES_DB`. La commande ne comporte pas d’option de nettoyage préalable.

## 4.2 Restauration du format personnalisé

La commande documentée est :

```bash
cat backup.dump | docker compose --env-file .env.production exec -T postgres sh -lc 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists'
```

`pg_restore` lit le flux au format personnalisé. `--clean` demande de supprimer les objets avant leur recréation et `--if-exists` applique la suppression lorsque l’objet existe. La base cible provient de `POSTGRES_DB`.

## 4.3 Mécanismes distincts d’une restauration

Les éléments suivants existent, mais n’importent pas une sauvegarde PostgreSQL :

| Mécanisme | Effet réel | Source |
|---|---|---|
| `pnpm prisma:generate` | Reconstruit Prisma Client depuis le schéma | `package.json` |
| `pnpm prisma:migrate:deploy` | Applique les migrations versionnées | `package.json`, `docker/backend.Dockerfile` |
| `pnpm prisma:seed` | Charge les données de démonstration codées | `package.json`, `apps/backend/prisma/seed.ts` |
| `pins:backfill` | Transforme les PIN historiques ciblés en hash | `apps/backend/package.json`, `apps/backend/scripts/backfill-employee-pin-code-hashes.ts` |
| `snapshots:backfill` | Complète les instantanés de planning ciblés | `apps/backend/package.json`, `apps/backend/scripts/backfill-attendance-schedule-snapshots.ts` |
| Préparation des tests | Supprime et recrée uniquement la base de test, puis applique migrations et seed | `apps/backend/test/test-database.ts` |

Aucun script `restore` ou `db:restore` n’est défini dans les manifestes. Les deux restaurations PostgreSQL sont des commandes documentées dans `README.md`.

# 5. Données recréables

| Élément recréable | Source versionnée | Mécanisme | Résultat |
|---|---|---|---|
| Prisma Client | `apps/backend/prisma/schema.prisma` | `pnpm prisma:generate` | Client JavaScript/TypeScript généré |
| Structure de la base | `apps/backend/prisma/migrations` | `pnpm prisma:migrate:deploy` | Application des vingt migrations SQL présentes |
| Structure en développement | Schéma et migrations Prisma | `pnpm prisma:migrate` | Flux `prisma migrate dev` sur la datasource configurée |
| Données de démonstration | `apps/backend/prisma/seed.ts` | `pnpm prisma:seed` | Plannings, employés, pointages relatifs et règles de sanction gérés par le seed |
| Premier administrateur | `apps/backend/scripts/create-initial-admin.ts` | `pnpm --dir apps/backend run admin:create` | Création conditionnelle du compte indiqué par les variables du script |
| Hash des PIN historiques | `apps/backend/scripts/backfill-employee-pin-code-hashes.ts` | `pnpm --dir apps/backend run pins:backfill` | Mise à jour des employés historiques ciblés |
| Instantanés de planning | `apps/backend/scripts/backfill-attendance-schedule-snapshots.ts` | `pnpm --dir apps/backend run snapshots:backfill` | Complétion des pointages ciblés |

Les migrations recréent la structure, pas les données métier créées pendant l’exploitation. Le seed recrée uniquement les données codées dans `apps/backend/prisma/seed.ts`. Les backfills modifient des enregistrements déjà présents et ne reconstituent pas les enregistrements absents.

Les fichiers de photo externes ne sont pas recréés par Prisma. Une restauration PostgreSQL peut rétablir leurs URL et identifiants publics sans recréer les fichiers correspondants.

# 6. Commandes disponibles

## 6.1 Sauvegarde

Format SQL :

```bash
docker compose --env-file .env.production exec -T postgres sh -lc 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > backup.sql
```

Format personnalisé :

```bash
docker compose --env-file .env.production exec -T postgres sh -lc 'pg_dump -Fc -U "$POSTGRES_USER" "$POSTGRES_DB"' > backup.dump
```

## 6.2 Restauration

Fichier SQL :

```bash
cat backup.sql | docker compose --env-file .env.production exec -T postgres sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

Format personnalisé :

```bash
cat backup.dump | docker compose --env-file .env.production exec -T postgres sh -lc 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists'
```

## 6.3 Base et Prisma

```bash
pnpm db:up
pnpm db:status
pnpm db:down
pnpm prisma:generate
pnpm prisma:status
pnpm prisma:migrate
pnpm prisma:migrate:deploy
pnpm prisma:seed
```

## 6.4 Scripts de données

```bash
pnpm --dir apps/backend run admin:create
pnpm --dir apps/backend run pins:backfill
pnpm --dir apps/backend run snapshots:backfill
```

Les variables sensibles utilisées par ces commandes sont mentionnées uniquement par leur nom : `POSTGRES_USER`, `POSTGRES_DB`, `POSTGRES_PASSWORD`, `DATABASE_URL`, `ADMIN_EMAIL` et `ADMIN_PASSWORD`.

# 7. Flux de reconstitution

## 7.1 À partir d’une sauvegarde PostgreSQL

```text
Service PostgreSQL disponible
            |
            v
`backup.sql` ou `backup.dump`
            |
            +--> `psql` pour le format SQL
            |
            +--> `pg_restore` pour le format personnalisé
            |
            v
Base PostgreSQL restaurée
            |
            v
`pnpm prisma:status`
            |
            v
`pnpm prisma:migrate:deploy`
            |
            v
`pnpm prisma:generate`
            |
            v
Backend utilisant la base configurée
```

Les commandes Prisma après l’import contrôlent ou mettent à niveau la structure versionnée et régénèrent le client. Elles ne remplacent pas l’import des données.

## 7.2 Sans sauvegarde de données d’exploitation

```text
PostgreSQL disponible avec une base vide
            |
            v
`pnpm prisma:migrate:deploy`
            |
            v
Structure issue des migrations
            |
            v
`pnpm prisma:seed`
            |
            v
Données de démonstration codées
```

Ce second flux reconstitue le schéma et le jeu de démonstration. Il ne reconstitue pas les données produites pendant l’exploitation.

# 8. Traçabilité

| Élément documenté | Fichier ou répertoire source | Preuve observée |
|---|---|---|
| Données PostgreSQL | `apps/backend/prisma/schema.prisma` | Cinq modèles persistants et leurs relations |
| Volume PostgreSQL | `docker-compose.yml` | Montage de `postgres-data` vers le répertoire de données |
| Arrêt sans suppression explicite du volume | `package.json` | `db:down` exécute `docker compose down` |
| Sauvegarde SQL | `README.md` | Commande `pg_dump` avec redirection vers `backup.sql` |
| Sauvegarde au format personnalisé | `README.md` | Commande `pg_dump -Fc` avec redirection vers `backup.dump` |
| Restauration SQL | `README.md` | Flux de `backup.sql` vers `psql` |
| Restauration du format personnalisé | `README.md` | Flux de `backup.dump` vers `pg_restore --clean --if-exists` |
| Variables PostgreSQL | `docker-compose.yml`, `.env.production.example` | Noms des variables de base, utilisateur et mot de passe |
| Schéma reproductible | `apps/backend/prisma/schema.prisma` | Datasource PostgreSQL et générateur Prisma |
| Migrations | `apps/backend/prisma/migrations`, `apps/backend/prisma.config.ts` | Vingt migrations SQL et chemin configuré |
| Seed | `apps/backend/prisma/seed.ts`, `apps/backend/prisma.config.ts` | Données codées, upserts et commande de seed |
| Scripts Prisma | `package.json`, `apps/backend/package.json` | Génération, état, migrations et seed |
| Scripts de données | `apps/backend/scripts`, `apps/backend/package.json` | Administrateur initial et deux backfills |
| Base de test | `apps/backend/test/test-environment.ts`, `apps/backend/test/test-database.ts` | Recréation limitée à la base de test, migrations et seed |
| Photos externes | `apps/backend/src/modules/attendance/attendance-photo-storage.service.ts`, `apps/backend/src/modules/attendance/attendance-security.service.ts` | Envoi conditionnel et persistance des références |
| Exports mensuels | `apps/backend/src/modules/attendance/attendance.controller.ts`, `apps/backend/src/modules/attendance/exports` | Rapports CSV/PDF sans mécanisme d’import en base |
| Exclusions du dépôt | `.gitignore` | Exclusion des fichiers SQL hors migrations et de répertoires de sauvegarde |
| Documentation opérationnelle liée | `documentation/03-SMOD/05-Sauvegarde-et-Restauration.md`, `documentation/07-Operations-Guide/03-Demarrage-et-arret-des-services.md`, `documentation/07-Operations-Guide/04-Configuration-des-environnements.md`, `documentation/07-Operations-Guide/06-Exploitation-de-PostgreSQL-et-Prisma.md` | Inventaire antérieur des mêmes mécanismes et de leur contexte |

# 9. Observations

- PostgreSQL conserve ses fichiers dans le volume nommé `postgres-data`.
- Le volume assure une persistance locale entre les cycles ordinaires de conteneur, sans produire un artefact exporté.
- Deux formats de sauvegarde manuelle sont documentés : SQL et format personnalisé PostgreSQL.
- Deux commandes de restauration correspondantes sont documentées avec `psql` et `pg_restore`.
- Les commandes de sauvegarde et de restauration ciblent le service Compose `postgres`.
- Aucun script de sauvegarde ou de restauration n’est défini dans les manifestes ou les répertoires de scripts.
- Les migrations permettent de reconstituer la structure versionnée de la base.
- Le seed permet de recréer uniquement les données de démonstration codées.
- Les backfills transforment des données existantes et ne constituent pas des sauvegardes.
- La préparation des tests recrée uniquement la base réservée aux tests.
- La restauration SQL simple ne contient pas de nettoyage préalable dans la commande publiée.
- La restauration du format personnalisé utilise les options de nettoyage présentes dans la commande publiée.
- Les rapports mensuels CSV et PDF ne sont pas des sauvegardes PostgreSQL.
- Les sauvegardes PostgreSQL incluent les références de photos stockées dans `Attendance`, mais pas les fichiers externes correspondants.
- Aucune commande versionnée ne restaure les fichiers de photo externes.
