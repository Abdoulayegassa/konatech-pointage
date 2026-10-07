# 1. Présentation

Le dépôt décrit un déploiement de production de Konatech Pointage basé sur Docker Compose. La procédure couvre la préparation d'un fichier d'environnement, la construction de la pile complète, puis le contrôle de l'état des conteneurs et de leurs journaux.

# 2. Architecture de production

L'architecture de production documentée comprend les services Compose suivants :

```text
Client
  |
  v
frontend Next.js :3000
  |
  v
backend NestJS :4000
  |
  v
postgres PostgreSQL :5432
  |
  v
volume postgres-data
```

Les services `backend` et `frontend` sont activés par le profil Compose `app`. Le backend attend un PostgreSQL sain et le frontend attend un backend sain. Aucun manifeste cloud, pipeline CI/CD ou configuration déclarative de fournisseur cloud n'est présent dans le dépôt (`README.md`).

# 3. Préparation

La préparation de production documentée consiste à créer le fichier d'environnement à partir de son exemple :

```bash
cp .env.production.example .env.production
```

Le README identifie notamment les variables de production suivantes dans ce fichier : `POSTGRES_PASSWORD`, `JWT_SECRET`, `FRONTEND_URL`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_API_BASE_URL` et, lorsqu'il est utilisé, `API_BASE_URL`. Les valeurs ne sont pas reproduites ici.

Le fichier Compose transmet également les paramètres PostgreSQL, les ports hôtes, les URL frontend/API et les paramètres d'exécution aux services (`.env.production.example`, `docker-compose.yml`).

# 4. Déploiement

La commande de construction et de démarrage de la pile complète est :

```bash
docker compose --env-file .env.production --profile app up -d --build
```

Lors de ce démarrage, les Dockerfiles construisent les applications avec Node.js et pnpm. Le conteneur backend génère Prisma pendant le build puis exécute `prisma migrate deploy` avant `node dist/main.js`. Le conteneur frontend construit Next.js puis lance `next start` (`docker/backend.Dockerfile`, `docker/frontend.Dockerfile`).

# 5. Vérification après déploiement

L'état des services est consultable avec :

```bash
docker compose --env-file .env.production ps
```

Les journaux sont consultables avec :

```bash
docker compose --env-file .env.production logs -f backend frontend postgres
```

Les healthchecks Compose vérifient `pg_isready` pour PostgreSQL, `http://127.0.0.1:4000/api/v1/health` pour le backend et `http://127.0.0.1:3000/api/health` pour le frontend (`docker-compose.yml`). Le README indique aussi que l'origine publique du frontend doit être cohérente entre `FRONTEND_URL` et `NEXT_PUBLIC_APP_URL`, et que `NEXT_PUBLIC_API_BASE_URL` doit être accessible par les navigateurs.

# 6. Références

| Élément documenté | Fichiers analysés |
|---|---|
| Procédure de production et contrôles | `README.md` |
| Services, profil `app`, dépendances et healthchecks | `docker-compose.yml` |
| Construction et démarrage backend | `docker/backend.Dockerfile` |
| Construction et démarrage frontend | `docker/frontend.Dockerfile` |
| Variables de production | `.env.production.example` |
| Architecture de déploiement déjà décrite | `documentation/10-Deployment-Guide/01-Presentation.md`, `documentation/10-Deployment-Guide/06-Deploiement-avec-Docker.md` |

---

Document ID : DG-008  
Titre : Déploiement en production  
Version : 1.0  
Statut : Validé  
Classification : Interne  
Référence : Deployment Guide  
Projet : Konatech Pointage
