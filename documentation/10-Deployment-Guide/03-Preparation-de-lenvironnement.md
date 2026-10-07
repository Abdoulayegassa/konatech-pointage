Document ID : DG-003  
Titre : Préparation de l'environnement  
Version : 1.0  
Statut : Validé  
Classification : Interne  
Référence : Deployment Guide  
Projet : Konatech Pointage

# 1. Présentation

La préparation de l’environnement consiste à installer le workspace, créer les fichiers d’environnement, rendre PostgreSQL disponible et préparer le client Prisma avant le démarrage ou la construction de la pile.

# 2. Récupération du projet

Le dépôt ne définit pas de commande de clonage ou de téléchargement. Les étapes documentées commencent avec un répertoire contenant le monorepo et ses fichiers `package.json`, `pnpm-workspace.yaml`, le répertoire `apps`, le répertoire `docker` et `docker-compose.yml`.

# 3. Installation des dépendances

La commande racine documentée installe les dépendances des deux applications du workspace :

```bash
pnpm install
```

Le workspace est défini par `pnpm-workspace.yaml` avec les packages `apps/*`.

# 4. Configuration des variables d'environnement

Pour le développement local, le README documente la création de :

```bash
cp apps/backend/.env.example apps/backend/.env
cp apps/frontend/.env.example apps/frontend/.env.local
```

Les fichiers concernés définissent notamment `DATABASE_URL`, `FRONTEND_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_API_BASE_URL` et `API_BASE_URL`, ainsi que les variables de limites, sécurité du pointage, photos historiques et rendu PDF.

Pour Compose de production, le modèle est copié par :

```bash
cp .env.production.example .env.production
```

Le fichier `.env.production` est ensuite consommé par les commandes Compose documentées; ses valeurs sensibles ne sont pas reproduites dans ce chapitre.

# 5. Préparation de la base de données

Le PostgreSQL local est démarré par le script racine :

```bash
pnpm db:up
```

La préparation Prisma locale documentée est :

```bash
pnpm prisma:generate
pnpm prisma:status
pnpm prisma:migrate
pnpm prisma:seed
```

Pour un environnement de déploiement, le dépôt utilise les migrations existantes sans création de migration :

```bash
pnpm prisma:migrate:deploy
```

Dans l’image backend, `prisma migrate deploy` est exécuté au démarrage avant `node dist/main.js`.

# 6. Vérification de l'environnement

Les vérifications disponibles sont :

```bash
pnpm db:status
pnpm prisma:status
pnpm typecheck
pnpm lint
pnpm test:backend
pnpm test:proxy
```

`pnpm db:status` expose l’état Docker Compose. `pnpm prisma:status` inspecte l’état des migrations sans le modifier. `pnpm test:proxy` démarre temporairement le backend et le frontend, puis vérifie la liaison entre `/api/health` et `/api/v1/health`. Le README documente aussi le contrôle Compose de la pile de production :

```bash
docker compose --env-file .env.production ps
```

# 7. Références

| Élément documenté | Fichier source |
|---|---|
| Séquence locale de préparation | `README.md` |
| Scripts d’installation, base et Prisma | `package.json` |
| Workspace | `pnpm-workspace.yaml` |
| Variables backend locales | `apps/backend/.env.example` |
| Variables frontend locales | `apps/frontend/.env.example` |
| Variables Compose | `.env.production.example`, `docker-compose.yml` |
| Migrations et génération Prisma | `apps/backend/prisma/schema.prisma`, `apps/backend/prisma.config.ts`, `docker/backend.Dockerfile` |
| Démarrage local des applications | `scripts/dev.mjs` |
| Contrôle du proxy frontend/backend | `scripts/validate-proxy.mjs` |
