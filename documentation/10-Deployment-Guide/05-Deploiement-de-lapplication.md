# 1. Présentation

Le déploiement de l'application Konatech Pointage repose sur les scripts PNPM du dépôt et sur les fichiers Docker Compose fournis. Le dépôt décrit un frontend Next.js, un backend NestJS avec Prisma et un service PostgreSQL.

# 2. Construction de l'application

L'installation des dépendances et la construction séparée des deux applications sont définies dans le `package.json` racine :

```bash
pnpm install
pnpm prisma:generate
pnpm build:backend
pnpm build:frontend
```

Le script `pnpm build` enchaîne les constructions backend et frontend. L'image backend génère également Prisma puis compile NestJS, tandis que l'image frontend construit l'application Next.js (`docker/backend.Dockerfile`, `docker/frontend.Dockerfile`).

# 3. Démarrage des services

En environnement local, les commandes documentées sont :

```bash
pnpm db:up
pnpm prisma:migrate
pnpm prisma:seed
pnpm dev
```

Le script `pnpm dev` lance le backend NestJS en mode watch et le frontend Next.js en mode développement (`scripts/dev.mjs`).

Pour le démarrage conteneurisé décrit dans le dépôt :

```bash
docker compose --env-file .env.production --profile app up -d --build
```

Le conteneur backend applique `prisma migrate deploy` avant de lancer `node dist/main.js`. Le conteneur frontend démarre avec `next start -H 0.0.0.0 -p 3000` (`docker/backend.Dockerfile`, `docker/frontend.Dockerfile`).

# 4. Vérification du déploiement

Les commandes et points de contrôle présents dans le dépôt sont :

```bash
pnpm db:status
pnpm prisma:status
pnpm test:proxy
docker compose --env-file .env.production ps
docker compose --env-file .env.production logs -f backend frontend postgres
```

Les points de santé déclarés sont `http://localhost:4000/api/v1/health` pour le backend et `http://localhost:3000/api/health` pour le frontend. Les healthchecks Docker utilisent ces routes pour le backend et le frontend, ainsi que `pg_isready` pour PostgreSQL (`docker-compose.yml`).

# 5. Structure des services

| Service | Rôle | Mode de lancement |
|---|---|---|
| `postgres` | Base de données PostgreSQL | Service `docker compose` ou `pnpm db:up` |
| `backend` | API NestJS et application des migrations Prisma | Profil Compose `app`, ou `pnpm dev` en local |
| `frontend` | Application web Next.js | Profil Compose `app`, ou `pnpm dev` en local |

# 6. Références

| Élément documenté | Fichiers analysés |
|---|---|
| Scripts de construction et de développement | `package.json`, `apps/backend/package.json`, `apps/frontend/package.json`, `scripts/dev.mjs` |
| Organisation du workspace | `pnpm-workspace.yaml` |
| Services, ports et healthchecks Compose | `docker-compose.yml` |
| Construction et démarrage backend | `docker/backend.Dockerfile` |
| Construction et démarrage frontend | `docker/frontend.Dockerfile` |
| Procédures locales et conteneurisées | `README.md` |
| Routes de santé | `apps/backend/src/modules/health/health.controller.ts`, `apps/frontend/app/api/health/route.ts` |
| Vérification du proxy | `scripts/validate-proxy.mjs` |

---

Document ID : DG-005  
Titre : Déploiement de l'application  
Version : 1.0  
Statut : Validé  
Classification : Interne  
Référence : Deployment Guide  
Projet : Konatech Pointage
