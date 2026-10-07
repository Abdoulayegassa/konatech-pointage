# 1. Présentation

Les opérations de mise à jour décrites par le dépôt reposent sur l'installation des dépendances, la génération du client Prisma, la construction des applications et le redémarrage de la pile Docker Compose. Aucune procédure séparée de mise à jour applicative ou de pipeline CI/CD n'est définie.

# 2. Mise à jour du code

Après mise à disposition du code dans le répertoire du projet, la reconstruction et le redémarrage de la pile de production sont réalisés avec la commande Compose documentée :

```bash
docker compose --env-file .env.production --profile app up -d --build
```

L'option `--build` reconstruit les images backend et frontend à partir de `docker/backend.Dockerfile` et `docker/frontend.Dockerfile`. Le backend est recompilé par le Dockerfile NestJS et le frontend par le Dockerfile Next.js.

# 3. Mise à jour des dépendances

Les commandes d'installation réellement présentes sont :

```bash
pnpm install
```

Les Dockerfiles utilisent l'installation reproductible du workspace :

```bash
pnpm install --frozen-lockfile
```

Le dépôt ne définit pas de script racine dédié nommé `update` ou `upgrade`. Les versions installées sont celles déclarées par les fichiers `package.json` et `pnpm-lock.yaml`.

# 4. Mise à jour de la base de données

Les commandes Prisma disponibles pour les migrations sont :

```bash
pnpm prisma:generate
pnpm prisma:status
pnpm prisma:migrate
pnpm prisma:migrate:deploy
```

`prisma:migrate` correspond aux migrations de développement. `prisma:migrate:deploy` applique les migrations existantes. Dans la pile Docker, le conteneur backend exécute `prisma migrate deploy` au démarrage avant `node dist/main.js` (`docker/backend.Dockerfile`).

# 5. Redémarrage des services

La commande Compose de reconstruction et de relance des services backend, frontend et PostgreSQL est :

```bash
docker compose --env-file .env.production --profile app up -d --build
```

Pour l'environnement local, le dépôt fournit `pnpm db:down` pour arrêter Compose, `pnpm db:up` pour démarrer PostgreSQL et `pnpm dev` pour lancer le backend et le frontend en développement (`package.json`, `scripts/dev.mjs`).

# 6. Vérification après mise à jour

Les contrôles présents dans le dépôt sont :

```bash
pnpm prisma:status
pnpm typecheck
pnpm lint
pnpm test:backend
pnpm test:proxy
docker compose --env-file .env.production ps
docker compose --env-file .env.production logs -f backend frontend postgres
```

Les healthchecks Compose vérifient PostgreSQL avec `pg_isready`, le backend avec `/api/v1/health` et le frontend avec `/api/health` (`docker-compose.yml`). Le script `pnpm test:proxy` vérifie la liaison du proxy frontend vers l'API backend (`scripts/validate-proxy.mjs`).

# 7. Références

| Élément documenté | Fichiers analysés |
|---|---|
| Scripts d'installation, validation et Prisma | `package.json`, `apps/backend/package.json`, `pnpm-lock.yaml` |
| Installation et reconstruction backend | `docker/backend.Dockerfile` |
| Installation et reconstruction frontend | `docker/frontend.Dockerfile` |
| Migrations au démarrage et services Compose | `docker-compose.yml`, `docker/backend.Dockerfile` |
| Démarrage local backend/frontend | `scripts/dev.mjs` |
| Procédure de production et contrôles | `README.md` |
| Vérification du proxy | `scripts/validate-proxy.mjs` |

---

Document ID : DG-009  
Titre : Mise à jour de l'application  
Version : 1.0  
Statut : Validé  
Classification : Interne  
Référence : Deployment Guide  
Projet : Konatech Pointage
