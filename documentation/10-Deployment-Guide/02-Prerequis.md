Document ID : DG-002  
Titre : Prérequis de déploiement  
Version : 1.0  
Statut : Validé  
Classification : Interne  
Référence : Deployment Guide  
Projet : Konatech Pointage

# 1. Présentation

Les prérequis sont ceux déclarés par le monorepo, ses scripts et sa configuration Docker Compose. Ils couvrent l’exécution locale pnpm et la construction de la pile conteneurisée.

# 2. Configuration matérielle

Aucune configuration minimale de processeur, mémoire ou espace disque n’est déclarée dans le dépôt.

# 3. Logiciels requis

| Logiciel | Version requise | Utilisation |
|---|---|---|
| Node.js | `>=20.9.0 <23`; le README mentionne Node.js 20.9+ ou 22.11+ LTS | Exécution des scripts, build NestJS et build/serveur Next.js. |
| pnpm | `>=10.0.0`; package manager déclaré `pnpm@10.26.0` | Installation du workspace et scripts racine. |
| Docker avec Compose | Docker Desktop ou Docker Engine avec Compose | Exécution de PostgreSQL et de la pile Compose `app`. |
| PostgreSQL | Image Compose `postgres:16-alpine` | Base de données du service `postgres`. |
| Chromium | Installé dans l’image backend Docker | Rendu PDF mensuel via Puppeteer. |

# 4. Dépendances externes

Le déploiement conteneurisé dépend de PostgreSQL et des images Docker définies dans `docker-compose.yml`. Le backend dépend de Prisma Client et de la base configurée par `DATABASE_URL`. Le frontend dépend de l’URL publique de l’API fournie par `NEXT_PUBLIC_API_BASE_URL` et, côté serveur Next.js, par `API_BASE_URL` lorsqu’elle est définie.

Les bibliothèques applicatives sont installées par `pnpm install` depuis `package.json`, `apps/backend/package.json`, `apps/frontend/package.json` et `pnpm-lock.yaml`.

# 5. Variables d'environnement

Les fichiers d’exemple définissent les variables suivantes; leurs valeurs ne sont pas reproduites ici.

| Groupe | Variables définies |
|---|---|
| PostgreSQL et ports Compose | `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_PORT`, `BACKEND_PORT`, `FRONTEND_PORT` |
| URLs et réseau applicatif | `FRONTEND_URL`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_API_BASE_URL`, `API_BASE_URL`, `TRUST_PROXY_HOPS` |
| Authentification | `JWT_SECRET`, `JWT_EXPIRES_IN` |
| Base et limites API | `DATABASE_URL`, `JSON_BODY_LIMIT`, `RATE_LIMIT_TTL_MS`, `RATE_LIMIT_MAX`, `LOGIN_RATE_LIMIT_TTL_MS`, `LOGIN_RATE_LIMIT_MAX` |
| Sécurité du pointage | `ATTENDANCE_SECURITY_ENABLED`, `COMPANY_LATITUDE`, `COMPANY_LONGITUDE`, `ATTENDANCE_TRUSTED_RADIUS_METERS`, `ATTENDANCE_WARNING_RADIUS_METERS`, `ATTENDANCE_MAX_ACCURACY_METERS`, `ATTENDANCE_ALLOWED_RADIUS_METERS` |
| Photos historiques | `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `CLOUDINARY_ATTENDANCE_FOLDER`, `CLOUDINARY_UPLOAD_TIMEOUT_MS`, `CLOUDINARY_UPLOAD_MAX_RETRIES`, `CLOUDINARY_UPLOAD_RETRY_DELAY_MS` |
| PDF mensuel | `ATTENDANCE_PDF_RENDERER`, `ATTENDANCE_PDF_EXECUTABLE_PATH`, `ATTENDANCE_PDF_ALLOW_LEGACY_FALLBACK` |

# 6. Vérification des prérequis

Les commandes de vérification ou de préparation présentes dans le dépôt sont :

```bash
nvm use
pnpm install
pnpm db:status
pnpm prisma:status
docker compose --env-file .env.production ps
```

`pnpm db:status` appelle `docker compose ps`. `pnpm prisma:status` vérifie l’état des migrations Prisma. Le README utilise `docker compose --env-file .env.production ps` pour contrôler les services de l’environnement de production Compose.

# 7. Références

| Élément documenté | Fichier source |
|---|---|
| Versions Node.js, pnpm, Docker et prérequis locaux | `README.md`, `package.json` |
| Versions des dépendances applicatives | `apps/backend/package.json`, `apps/frontend/package.json` |
| Workspace pnpm | `pnpm-workspace.yaml` |
| Services PostgreSQL, backend, frontend et Chromium | `docker-compose.yml`, `docker/backend.Dockerfile`, `docker/frontend.Dockerfile` |
| Variables locales backend | `apps/backend/.env.example` |
| Variables locales frontend | `apps/frontend/.env.example` |
| Variables de production Compose | `.env.production.example` |
| Commandes Prisma et état Docker | `package.json`, `README.md` |
