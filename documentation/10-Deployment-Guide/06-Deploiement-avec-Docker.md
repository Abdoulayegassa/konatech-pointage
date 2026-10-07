# 1. Présentation

Docker est utilisé dans le dépôt pour exécuter PostgreSQL et pour construire puis lancer les applications backend et frontend. L'orchestration est déclarée dans `docker-compose.yml`, avec un profil `app` pour les services applicatifs.

# 2. Architecture Docker

Les conteneurs définis par Compose sont organisés comme suit :

```text
docker compose
├── postgres   (PostgreSQL 16, volume postgres-data)
├── backend    (profil app, API NestJS et Prisma)
└── frontend   (profil app, application Next.js)
```

Le service `backend` dépend de l'état sain de `postgres`. Le service `frontend` dépend de l'état sain de `backend`. Les trois services utilisent la politique de redémarrage `unless-stopped` (`docker-compose.yml`).

# 3. Images utilisées

| Image | Utilisation |
|---|---|
| `postgres:16-alpine` | Image du service PostgreSQL défini dans Compose. |
| `node:22-bookworm-slim` | Image de base des étapes de construction et d'exécution des Dockerfiles backend et frontend. |

Les Dockerfiles installent leurs dépendances avec pnpm. Le Dockerfile backend installe également Chromium dans l'étape runtime (`docker/backend.Dockerfile`).

# 4. Services

| Service | Conteneur | Rôle |
|---|---|---|
| `postgres` | `konatech-postgres` | Base PostgreSQL, port interne 5432 et volume `postgres-data`. |
| `backend` | Conteneur Compose généré pour le service `backend` | API NestJS, Prisma Client et migrations au démarrage, port interne 4000. |
| `frontend` | Conteneur Compose généré pour le service `frontend` | Application Next.js en mode production, port interne 3000. |

Les services `backend` et `frontend` appartiennent au profil Compose `app`. Le port hôte PostgreSQL est configurable par `POSTGRES_PORT` et vaut 5433 par défaut ; les ports hôtes backend et frontend sont configurables par `BACKEND_PORT` et `FRONTEND_PORT` (`docker-compose.yml`).

# 5. Commandes de déploiement

La procédure de démarrage de la pile conteneurisée documentée dans `README.md` est :

```bash
cp .env.production.example .env.production
docker compose --env-file .env.production --profile app up -d --build
```

Les commandes Compose de contrôle et de consultation des journaux sont :

```bash
docker compose --env-file .env.production ps
docker compose --env-file .env.production logs -f backend frontend postgres
```

Le script `pnpm db:up` utilise également Docker Compose, mais il démarre PostgreSQL pour l'environnement local (`package.json`, `docker-compose.yml`).

# 6. Vérification

Les healthchecks déclarés dans Compose vérifient `pg_isready` pour PostgreSQL, `http://127.0.0.1:4000/api/v1/health` pour le backend et `http://127.0.0.1:3000/api/health` pour le frontend. L'état des conteneurs est consultable avec :

```bash
docker compose --env-file .env.production ps
```

Les journaux des trois services sont consultables avec la commande `docker compose ... logs` documentée ci-dessus. Le backend applique les migrations Prisma avant `node dist/main.js` ; le frontend lance `next start` dans son conteneur (`docker/backend.Dockerfile`, `docker/frontend.Dockerfile`).

# 7. Références

| Élément documenté | Fichier source |
|---|---|
| Services, profils, ports, dépendances, volume et healthchecks | `docker-compose.yml` |
| Image et construction du backend | `docker/backend.Dockerfile` |
| Image et construction du frontend | `docker/frontend.Dockerfile` |
| Commandes Compose de production et vérification | `README.md` |
| Script de démarrage local PostgreSQL | `package.json` |

---

Document ID : DG-006  
Titre : Déploiement avec Docker  
Version : 1.0  
Statut : Validé  
Classification : Interne  
Référence : Deployment Guide  
Projet : Konatech Pointage
