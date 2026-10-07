# Sauvegarde et Restauration

| Métadonnée | Valeur |
|---|---|
| Document ID | SMOD-BACKUP-001 |
| Titre | Sauvegarde et Restauration |
| Version | 1.0 |
| Statut | Validé |
| Classification | Interne |
| Référence | SMOD |
| Date de génération | 30 juillet 2026 |

## 1. Présentation

### 1.1 Objectif

Ce document décrit les mécanismes de sauvegarde et de restauration réellement présents dans le dépôt Konatech Pointage. Il couvre PostgreSQL sous Docker Compose, Prisma, les migrations, le seed, les exports métier et les contrôles disponibles après une restauration.

### 1.2 Périmètre

Le périmètre comprend :

- la base PostgreSQL fournie par Docker Compose ;
- les données manipulées par Prisma ;
- le volume Docker de persistance ;
- les sauvegardes PostgreSQL manuelles documentées ;
- les restaurations SQL et au format personnalisé documentées ;
- les migrations et le seed ;
- les exports mensuels CSV et PDF ;
- les données photo stockées conditionnellement dans Cloudinary ;
- les vérifications backend et frontend.

Les mécanismes qui ne sont pas représentés dans le dépôt sont signalés explicitement.

### 1.3 Public concerné

Le document s'adresse aux exploitants, administrateurs de base de données, ingénieurs DevOps, SRE, développeurs backend et responsables techniques chargés de préserver ou de rétablir les données de la plateforme.

Sources : `README.md`, `docker-compose.yml`, `apps/backend/prisma/`, `package.json`.

## 2. Architecture des données

### 2.1 PostgreSQL

Prisma déclare PostgreSQL comme datasource. En exécution locale et dans la pile Compose complète, le service `postgres` utilise l'image `postgres:16-alpine`.

Le service reçoit :

- le nom de la base par `POSTGRES_DB` ;
- l'utilisateur par `POSTGRES_USER` ;
- le mot de passe par `POSTGRES_PASSWORD` ;
- le port hôte par `POSTGRES_PORT`.

Le port interne est 5432. La disponibilité du conteneur est contrôlée par `pg_isready`.

Sources : `apps/backend/prisma/schema.prisma`, `docker-compose.yml`.

### 2.2 Données Prisma

Le schéma contient cinq modèles persistés :

| Modèle | Données principales |
|---|---|
| `Employee` | Identité, accès, rôle, département, planning et informations d'authentification |
| `Schedule` | Horaires, marge de retard, jours travaillés et état |
| `Attendance` | Pointages, statuts, retards, sorties, heures supplémentaires, snapshots et preuves de vérification |
| `CalendarEntry` | Jours fériés, congés, missions et événements du calendrier RH |
| `SanctionRule` | Règles, seuils, tolérances, montants et motifs de sanction |

Prisma reçoit la chaîne de connexion par `DATABASE_URL`. Le backend utilise `PrismaService`, qui étend `PrismaClient` et ferme la connexion lors de la destruction du module.

Sources : `apps/backend/prisma/schema.prisma`, `apps/backend/src/common/prisma/prisma.service.ts`.

### 2.3 Seed

Le seed se trouve dans `apps/backend/prisma/seed.ts`. `prisma.config.ts` l'associe à la commande Prisma `db seed`.

Le seed crée ou met à jour :

- les règles de sanction par défaut ;
- deux plannings ;
- des employés de démonstration ;
- des présences de démonstration.

Il utilise principalement des opérations `upsert`. Il ne constitue pas une sauvegarde et ne restitue pas les données réelles d'une base exploitée.

Sources : `apps/backend/prisma.config.ts`, `apps/backend/prisma/seed.ts`.

### 2.4 Migrations

Les migrations SQL sont versionnées dans `apps/backend/prisma/migrations`. Vingt répertoires de migration horodatés sont présents, de l'initialisation du schéma jusqu'aux règles de sanction configurables.

Les commandes présentes permettent :

- de générer Prisma Client ;
- d'afficher l'état des migrations ;
- d'appliquer des migrations de développement ;
- d'appliquer les migrations versionnées en déploiement.

Les migrations décrivent l'évolution du schéma. Elles ne contiennent pas une copie des données métier.

### 2.5 Docker

Le service PostgreSQL monte le volume nommé :

```text
postgres-data:/var/lib/postgresql/data
```

Ce volume conserve les fichiers PostgreSQL lorsque le conteneur est recréé ou arrêté sans suppression du volume. `pnpm db:down` exécute `docker compose down` sans option de suppression des volumes.

Le `README.md` indique explicitement que le volume Docker ne doit pas être considéré seul comme une stratégie de sauvegarde.

Sources : `docker-compose.yml`, `package.json`, `README.md`.

### 2.6 Cloud

Cloudinary est le seul stockage cloud directement intégré dans le code. Lorsque le flux photo est utilisé et configuré, le backend y téléverse une image et conserve dans PostgreSQL :

- l'URL sécurisée de la photo ;
- l'identifiant public Cloudinary.

Le contenu binaire reste chez Cloudinary. Aucune procédure de sauvegarde, d'export ou de restauration Cloudinary n'est présente.

Render et Neon sont cités dans `README.md` comme environnement d'exécution et cible possible de `DATABASE_URL`. Aucun manifeste Render, identifiant de projet Neon, procédure de snapshot, sauvegarde gérée, restauration à un instant donné ou commande propre à ces fournisseurs n'est versionné.

Sources : `apps/backend/src/modules/attendance/attendance-photo-storage.service.ts`, `apps/backend/prisma/schema.prisma`, `README.md`, `documentation/02-SAR/15-Deploiement.md`.

### 2.7 Diagramme de l'architecture des données

```text
                    +----------------------+
                    | Frontend Next.js     |
                    +----------+-----------+
                               |
                               | API /api/v1
                               v
                    +----------------------+
                    | Backend NestJS       |
                    +----------+-----------+
                               |
                               | Prisma Client
                               | DATABASE_URL
                               v
                    +----------------------+
                    | PostgreSQL 16        |
                    | modèles Prisma       |
                    +----------+-----------+
                               |
                               | fichiers de données
                               v
                    +----------------------+
                    | Volume postgres-data |
                    +----------------------+

Sauvegarde manuelle :
PostgreSQL --pg_dump--> backup.sql ou backup.dump

Restauration manuelle :
backup.sql  --psql------> PostgreSQL
backup.dump --pg_restore-> PostgreSQL

Flux photo conditionnel :
Backend --> Cloudinary
PostgreSQL conserve l'URL et l'identifiant public
```

## 3. Sauvegarde des données

### 3.1 Conditions représentées dans la procédure

Les commandes documentées ciblent le service `postgres` de Docker Compose et chargent `.env.production`.

Elles supposent :

- une pile Compose contenant le service `postgres` ;
- un fichier `.env.production` ;
- un conteneur PostgreSQL accessible ;
- des variables `POSTGRES_USER` et `POSTGRES_DB` disponibles dans le conteneur ;
- un shell capable de rediriger la sortie vers un fichier local.

Source : `README.md`.

### 3.2 Sauvegarde PostgreSQL au format SQL

La procédure documentée est :

```bash
docker compose --env-file .env.production exec -T postgres sh -lc 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > backup.sql
```

Comportement observable :

1. Docker Compose exécute une commande dans le service `postgres`.
2. `pg_dump` lit la base désignée par `POSTGRES_DB` avec `POSTGRES_USER`.
3. La sortie SQL est redirigée par le shell hôte dans `backup.sql`.

Le dépôt ne fixe pas le répertoire de destination au-delà du nom relatif utilisé dans la commande.

### 3.3 Sauvegarde PostgreSQL au format personnalisé

La procédure documentée est :

```bash
docker compose --env-file .env.production exec -T postgres sh -lc 'pg_dump -Fc -U "$POSTGRES_USER" "$POSTGRES_DB"' > backup.dump
```

L'option `-Fc` produit le format personnalisé de PostgreSQL. La sortie est redirigée vers `backup.dump`.

### 3.4 Portée des sauvegardes PostgreSQL

Les commandes `pg_dump` ciblent la base PostgreSQL désignée. Elles couvrent les tables et données gérées dans cette base, dont les modèles Prisma.

Elles ne sauvegardent pas :

- les fichiers du dépôt ;
- les fichiers d'environnement ;
- les images Docker ;
- les journaux ;
- le contenu binaire stocké dans Cloudinary ;
- la configuration Render ;
- une configuration Neon spécifique.

Les URL et identifiants Cloudinary stockés dans les lignes `Attendance` font partie des données PostgreSQL, mais pas les fichiers distants eux-mêmes.

### 3.5 Prescriptions déjà documentées dans le dépôt

Le `README.md` indique que les sauvegardes sont à exécuter avant :

- les changements de schéma ;
- la maintenance de l'hôte ;
- les corrections manuelles de données.

Il indique également :

- de stocker les sauvegardes hors de l'hôte Docker ;
- de tester la restauration sur une base qui n'est pas la production ;
- de ne pas utiliser le volume Docker comme seule sauvegarde.

Ces prescriptions sont textuelles. Aucun script ne les automatise ni ne les contrôle.

### 3.6 Scripts de sauvegarde

Aucun script `backup`, `db:backup` ou équivalent n'est défini dans les `package.json`. Aucun fichier shell, PowerShell ou TypeScript n'automatise `pg_dump`.

Les deux commandes de sauvegarde sont uniquement documentées dans `README.md`.

### 3.7 Données Prisma

Prisma ne fournit dans le dépôt aucun script d'export complet des données. Les commandes `prisma:generate`, `prisma:status`, `prisma:migrate`, `prisma:migrate:deploy` et `prisma:seed` concernent le client, le schéma ou les données de démonstration.

La sauvegarde des données gérées par Prisma repose donc sur les commandes PostgreSQL documentées.

### 3.8 Exports mensuels

L'API expose :

```text
GET /api/v1/attendance/exports/monthly
```

Elle peut produire :

- un fichier CSV mensuel ;
- un fichier PDF mensuel.

Ces exports sont des rapports RH construits par le backend à partir des présences, du calendrier, des sanctions et des métriques calculées. Ils ne représentent pas une sauvegarde complète de la base et ne permettent pas une restauration PostgreSQL.

Sources : `apps/backend/src/modules/attendance/attendance.controller.ts`, services sous `apps/backend/src/modules/attendance/exports/`, route proxy frontend correspondante.

### 3.9 Seed et migrations

Le seed et les migrations sont des ressources versionnées :

- les migrations peuvent reconstruire la structure du schéma ;
- le seed peut recréer les données de démonstration codées ;
- aucun des deux ne restitue les données réelles créées par les utilisateurs après le déploiement.

## 4. Restauration

### 4.1 Restauration d'une sauvegarde SQL

La procédure documentée est :

```bash
cat backup.sql | docker compose --env-file .env.production exec -T postgres sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

Comportement observable :

1. le shell hôte lit `backup.sql` ;
2. le flux est transmis à `psql` dans le conteneur ;
3. `psql` exécute le SQL contre la base désignée par `POSTGRES_DB`.

La commande ne contient pas d'étape préalable de création, suppression ou vidage de la base.

### 4.2 Restauration d'une sauvegarde au format personnalisé

La procédure documentée est :

```bash
cat backup.dump | docker compose --env-file .env.production exec -T postgres sh -lc 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists'
```

Comportement observable :

- `pg_restore` lit le flux au format personnalisé ;
- `--clean` demande la suppression des objets avant leur recréation ;
- `--if-exists` conditionne les suppressions à l'existence des objets ;
- la cible est la base désignée par `POSTGRES_DB`.

### 4.3 Réinitialisation de la base

Aucun script `db:reset`, `prisma:reset` ni appel à `prisma migrate reset` n'est présent. Aucune procédure générale de suppression et recréation de la base de développement ou de production n'est documentée.

Le dispositif de tests backend recrée uniquement la base dédiée aux tests :

1. il termine les connexions à cette base ;
2. il supprime puis recrée la base de test ;
3. il applique `prisma migrate deploy` ;
4. il exécute le seed.

Ce mécanisme se trouve dans le code de test et n'est pas exposé comme commande de restauration d'une base applicative.

Source : `apps/backend/test/test-database.ts`.

### 4.4 Application des migrations après restauration

Contrôle préalable :

```bash
pnpm prisma:status
```

Application des migrations versionnées :

```bash
pnpm prisma:migrate:deploy
```

En développement, le script disponible est :

```bash
pnpm prisma:migrate
```

Le conteneur backend exécute automatiquement `prisma migrate deploy` avant de démarrer l'API.

Sources : `package.json`, `apps/backend/package.json`, `docker/backend.Dockerfile`.

### 4.5 Génération de Prisma Client

```bash
pnpm prisma:generate
```

La génération reconstruit le client à partir de `schema.prisma`. Elle ne modifie pas et ne restaure pas les données.

### 4.6 Seed

```bash
pnpm prisma:seed
```

Le seed charge des données de démonstration au moyen d'opérations reproductibles, principalement des `upsert`. Son exécution n'est pas incluse dans le démarrage du conteneur backend.

Le script de premier administrateur est distinct :

```bash
pnpm --dir apps/backend run admin:create
```

Il crée un administrateur uniquement si l'adresse configurée n'existe pas.

### 4.7 Reconstruction des applications

Après une restauration nécessitant la reconstruction des artefacts :

```bash
pnpm build
```

Reconstructions ciblées :

```bash
pnpm build:backend
pnpm build:frontend
```

Reconstruction des images Compose :

```bash
docker compose --env-file .env.production --profile app up -d --build
```

Ces commandes reconstruisent le code ou les images ; elles ne restaurent pas les données PostgreSQL.

### 4.8 Backfills de données

Deux scripts de transformation de données existent :

```bash
pnpm --dir apps/backend run pins:backfill
pnpm --dir apps/backend run snapshots:backfill
```

Le premier complète les hash de codes PIN concernés. Le second complète les snapshots de planning des présences concernées.

Ces scripts ne restaurent pas une sauvegarde et sont distincts des migrations.

### 4.9 Restauration Cloudinary, Render et Neon

Aucune procédure de restauration Cloudinary n'est présente.

Aucune procédure Render ou Neon propre à un fournisseur n'est présente. Les commandes PostgreSQL documentées ciblent le service `postgres` de Compose et non une instance gérée externe.

## 5. Vérification après restauration

### 5.1 Vérifier le service PostgreSQL

```bash
docker compose --env-file .env.production ps
```

Le service PostgreSQL possède un healthcheck `pg_isready`. En local, l'état peut aussi être affiché par :

```bash
pnpm db:status
```

### 5.2 Vérifier la connexion et les migrations Prisma

```bash
pnpm prisma:status
```

Cette commande utilise `DATABASE_URL`. Elle vérifie l'accès au datasource et affiche l'état des migrations.

### 5.3 Régénérer et valider Prisma

```bash
pnpm prisma:generate
pnpm validate:backend
```

`validate:backend` enchaîne la génération Prisma, le typecheck backend, les tests backend et le build backend.

Les tests utilisent leur propre base dédiée ; leur réussite ne compare pas les données restaurées de la base cible.

### 5.4 Vérifier le backend

```bash
curl http://localhost:4000/api/v1/health
```

Le résultat attendu par le code contient :

- `status` égal à `ok` ;
- `service` égal à `konatech-attendance-api` ;
- un horodatage.

Ce healthcheck confirme la disponibilité HTTP du backend. Son contrôleur ne lance pas de requête PostgreSQL.

Source : `apps/backend/src/modules/health/health.controller.ts`.

### 5.5 Vérifier le frontend

```bash
curl http://localhost:3000/api/health
```

La route frontend relaie le healthcheck backend. L'interface est accessible à :

```text
http://localhost:3000
```

Sources : `apps/frontend/app/api/health/route.ts`, `README.md`.

### 5.6 Vérifier la connexion frontend/backend

```bash
pnpm test:proxy
```

Le script démarre les applications sur des ports temporaires et contrôle :

- le healthcheck backend ;
- le healthcheck à travers le proxy frontend ;
- la cohérence des URL publiques ;
- la redirection de la borne de pointage.

Il prépare sa propre base de test ; ce script ne valide pas le contenu métier de la base restaurée.

Source : `scripts/validate-proxy.mjs`.

### 5.7 Contrôles fonctionnels disponibles

`TESTING_CHECKLIST.md` et `docs/RELEASE_CHECKLIST.md` contiennent des contrôles manuels pour :

- l'authentification ;
- les employés et plannings ;
- les pointages ;
- le tableau de bord et l'historique ;
- les sanctions et le calendrier ;
- les exports mensuels.

Ces contrôles permettent d'observer l'application après restauration, mais aucun script ne compare automatiquement la base restaurée à la sauvegarde source.

### 5.8 Validation complète

```bash
pnpm validate
```

Cette commande exécute les contrôles de format, Prisma, types, lint, tests, builds et proxy définis dans le dépôt.

Elle vérifie le code et l'environnement de test, pas l'exhaustivité des données restaurées.

## 6. Scripts disponibles

### 6.1 Scripts liés à PostgreSQL et Prisma

| Script ou commande | Rôle lié aux données |
|---|---|
| `pnpm db:up` | Démarrer PostgreSQL sous Compose |
| `pnpm db:down` | Arrêter Compose sans suppression explicite du volume |
| `pnpm db:status` | Afficher l'état des services Compose |
| `pnpm prisma:generate` | Générer Prisma Client |
| `pnpm prisma:status` | Afficher l'état des migrations |
| `pnpm prisma:migrate` | Exécuter les migrations de développement |
| `pnpm prisma:migrate:deploy` | Appliquer les migrations versionnées |
| `pnpm prisma:seed` | Charger les données de démonstration |
| `pnpm --dir apps/backend run admin:create` | Créer le premier administrateur si son adresse n'existe pas |
| `pnpm --dir apps/backend run pins:backfill` | Compléter les hash PIN concernés |
| `pnpm --dir apps/backend run snapshots:backfill` | Compléter les snapshots de planning concernés |
| `pnpm test:backend` | Recréer et utiliser la base dédiée aux tests avant les suites concernées |

### 6.2 Commandes PostgreSQL documentées

| Commande | Rôle |
|---|---|
| `pg_dump` via Compose | Créer une sauvegarde SQL |
| `pg_dump -Fc` via Compose | Créer une sauvegarde au format personnalisé |
| `psql` via Compose | Restaurer le flux SQL |
| `pg_restore --clean --if-exists` via Compose | Restaurer le format personnalisé |

Ces commandes sont intégrées dans les lignes complètes présentées aux sections 3 et 4.

### 6.3 Scripts de reconstruction et contrôle

| Script | Rôle après restauration |
|---|---|
| `pnpm build` | Construire frontend et backend |
| `pnpm build:backend` | Construire le backend |
| `pnpm build:frontend` | Construire le frontend |
| `pnpm validate:backend` | Valider Prisma, tests et build backend |
| `pnpm test:proxy` | Vérifier la connexion frontend/backend |
| `pnpm validate` | Exécuter la validation complète |

### 6.4 Scripts absents

Aucun script nommé `backup`, `restore`, `db:backup`, `db:restore`, `db:reset`, `prisma:reset`, `snapshot` ou `pitr` n'est défini dans les `package.json`.

## 7. Dépendances

```text
+----------------------+
| Sauvegarde           |
| pg_dump              |
+----------+-----------+
           |
           v
+----------------------+
| PostgreSQL           |
| données persistées   |
+----------+-----------+
           |
           v
+----------------------+
| Prisma               |
| schéma et client     |
+----------+-----------+
           |
           v
+----------------------+
| Backend NestJS       |
| API /api/v1          |
+----------+-----------+
           |
           v
+----------------------+
| Frontend Next.js     |
+----------------------+
```

Sens de restauration et de remise en service :

```text
backup.sql / backup.dump
             |
             v
        PostgreSQL
             |
             v
    état des migrations
             |
             v
       Backend sain
             |
             v
       Frontend sain
```

## 8. Traçabilité

| Procédure ou information | Fichiers concernés |
|---|---|
| Modèle de données | `apps/backend/prisma/schema.prisma` |
| Configuration Prisma | `apps/backend/prisma.config.ts` |
| Migrations | `apps/backend/prisma/migrations/` |
| Seed | `apps/backend/prisma/seed.ts` |
| Intégration Prisma backend | `apps/backend/src/common/prisma/prisma.service.ts` |
| PostgreSQL et volume | `docker-compose.yml` |
| Variables PostgreSQL | `docker-compose.yml`, `.env.production.example` |
| Sauvegarde SQL | `README.md` |
| Sauvegarde au format personnalisé | `README.md` |
| Restauration SQL | `README.md` |
| Restauration au format personnalisé | `README.md` |
| Scripts Prisma | `package.json`, `apps/backend/package.json` |
| Migration au démarrage du conteneur | `docker/backend.Dockerfile` |
| Recréation de la base de test | `apps/backend/test/test-database.ts` |
| Environnement de test | `apps/backend/test/test-environment.ts`, `apps/backend/.env.test` |
| Premier administrateur | `apps/backend/scripts/create-initial-admin.ts` |
| Backfill PIN | `apps/backend/scripts/backfill-employee-pin-code-hashes.ts` |
| Backfill de snapshots | `apps/backend/scripts/backfill-attendance-schedule-snapshots.ts` |
| Export mensuel API | `apps/backend/src/modules/attendance/attendance.controller.ts` |
| Export CSV | `apps/backend/src/modules/attendance/exports/monthly-attendance-csv-exporter.service.ts` |
| Export PDF | services PDF sous `apps/backend/src/modules/attendance/exports/` |
| Proxy d'export frontend | `apps/frontend/app/api/attendance/exports/monthly/route.ts` |
| Stockage photo Cloudinary | `apps/backend/src/modules/attendance/attendance-photo-storage.service.ts` |
| Métadonnées Cloudinary persistées | `apps/backend/prisma/schema.prisma` |
| Healthcheck PostgreSQL | `docker-compose.yml` |
| Healthcheck backend | `apps/backend/src/modules/health/health.controller.ts` |
| Healthcheck frontend | `apps/frontend/app/api/health/route.ts` |
| Validation du proxy | `scripts/validate-proxy.mjs` |
| Checklists après intervention | `TESTING_CHECKLIST.md`, `docs/RELEASE_CHECKLIST.md` |
| État Render et Neon | `README.md`, `documentation/02-SAR/15-Deploiement.md` |

## 9. Observations techniques

### 9.1 Mécanismes présents

- PostgreSQL persiste ses fichiers dans le volume nommé `postgres-data`.
- Deux formats de sauvegarde manuelle sont documentés : SQL et format personnalisé PostgreSQL.
- Deux restaurations correspondantes sont documentées avec `psql` et `pg_restore`.
- Les migrations et le schéma Prisma sont versionnés.
- Le seed de démonstration est exécutable séparément.
- Le conteneur backend applique les migrations de déploiement avant le démarrage de l'API.
- Deux backfills applicatifs sont disponibles.
- Des contrôles de santé PostgreSQL, backend et frontend sont présents.
- Des exports mensuels CSV et PDF sont présents.

### 9.2 Mécanismes absents

- script automatisé de sauvegarde ;
- script automatisé de restauration ;
- planification des sauvegardes ;
- rotation des sauvegardes ;
- durée de rétention définie ;
- chiffrement de sauvegarde configuré ;
- vérification par somme de contrôle ;
- catalogue des sauvegardes ;
- copie automatisée hors hôte ;
- restauration à un instant donné ;
- réplication PostgreSQL ;
- haute disponibilité PostgreSQL ;
- sauvegarde ou restauration Cloudinary ;
- sauvegarde ou restauration propre à Render ;
- sauvegarde ou restauration propre à Neon ;
- reset général de la base ;
- rollback de migration.

### 9.3 Limitations constatées

- Les procédures PostgreSQL documentées ciblent le service Compose `postgres`.
- Le dépôt ne démontre pas leur exécution contre une base PostgreSQL gérée externe.
- Le volume Docker assure la persistance locale mais ne produit pas un artefact de sauvegarde.
- Les exports CSV et PDF ne couvrent qu'un rapport mensuel et ne permettent pas la reconstruction de la base.
- Le seed restaure uniquement les données codées de démonstration.
- Les migrations restaurent la structure du schéma, pas les données métier.
- Le healthcheck backend ne contrôle pas directement PostgreSQL.
- Les tests utilisent une base dédiée et ne valident pas les données de la base restaurée.
- Les références Cloudinary restaurées dans PostgreSQL ne garantissent pas la présence des fichiers distants.

### 9.4 Comportements observés

- `pnpm db:down` ne supprime pas explicitement le volume PostgreSQL.
- La restauration SQL simple ne contient pas d'étape de nettoyage préalable.
- La restauration au format personnalisé utilise `--clean --if-exists`.
- Le fichier de sauvegarde est créé par redirection sur l'hôte.
- Les fichiers `backup/`, `dump/` et `dumps/` sont exclus par `.gitignore`.
- `.dockerignore` exclut les répertoires et fichiers de sauvegarde courants du contexte Docker.
- Le seed utilise principalement des `upsert`.
- La base de test est supprimée et recréée par le dispositif de tests seulement.
