Document ID : DG-004  
Titre : Déploiement de la base de données  
Version : 1.0  
Statut : Validé  
Classification : Interne  
Référence : Deployment Guide  
Projet : Konatech Pointage

# 1. Présentation

La base de données PostgreSQL stocke les comptes employés, plannings, pointages, entrées de calendrier et règles de sanctions. Prisma fournit le schéma, le client généré et l’exécution des migrations.

# 2. Technologie utilisée

Le schéma Prisma déclare le provider `postgresql`. L’exécution locale et Compose utilise l’image `postgres:16-alpine`, avec un volume nommé `postgres-data` pour la persistance.

# 3. Configuration

La connexion Prisma est lue depuis `DATABASE_URL`. Dans Compose, le backend reçoit une URL construite avec `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` et le nom de service `postgres`. Le service PostgreSQL reçoit les variables `POSTGRES_DB`, `POSTGRES_USER` et `POSTGRES_PASSWORD`; son port interne est 5432 et le port hôte est défini par `POSTGRES_PORT`.

Le fichier `apps/backend/prisma.config.ts` fixe le schéma `prisma/schema.prisma`, le chemin `prisma/migrations` et la commande de seed.

# 4. Migrations

Le dossier `apps/backend/prisma/migrations` contient les migrations versionnées du schéma. Les commandes disponibles sont :

```bash
pnpm prisma:generate
pnpm prisma:status
pnpm prisma:migrate
pnpm prisma:migrate:deploy
```

`prisma:migrate` est utilisé pour les migrations de développement. `prisma:migrate:deploy` applique les migrations existantes sans en créer de nouvelles. Le Dockerfile backend exécute cette dernière commande au démarrage du conteneur avant de lancer l’API.

# 5. Initialisation des données

Le seed est défini par `apps/backend/prisma/seed.ts` et exécuté avec :

```bash
pnpm prisma:seed
```

Le script initialise ou met à jour des règles de sanctions, des plannings, des comptes employés et des données de pointage de démonstration. Il utilise le `PrismaClient` et la connexion fournie par `DATABASE_URL`.

# 6. Vérification

Les vérifications disponibles sont :

```bash
pnpm db:status
pnpm prisma:status
pnpm prisma:generate
```

`pnpm db:status` expose l’état des services Docker Compose. `pnpm prisma:status` indique l’état des migrations sans modifier la base. La génération Prisma vérifie que le client correspondant au schéma est disponible.

Dans Compose, PostgreSQL possède un healthcheck `pg_isready`. Le backend dépend de cet état sain et expose ensuite `/api/v1/health` pour la vérification de l’application connectée à la base.

# 7. Références

| Élément documenté | Fichier source |
|---|---|
| Provider, modèles et index Prisma | `apps/backend/prisma/schema.prisma` |
| Configuration du schéma, migrations et seed | `apps/backend/prisma.config.ts` |
| Migrations versionnées | `apps/backend/prisma/migrations/` |
| Initialisation des données | `apps/backend/prisma/seed.ts` |
| Scripts Prisma et état Docker | `package.json`, `apps/backend/package.json` |
| PostgreSQL, volume, healthcheck et URL Compose | `docker-compose.yml` |
| Migration au démarrage backend | `docker/backend.Dockerfile` |
| Variables de connexion | `apps/backend/.env.example`, `.env.production.example` |
| Vérification de santé API | `apps/backend/src/modules/health/health.controller.ts`, `README.md` |
