# 1. Présentation

Les variables d'environnement configurent le backend NestJS, le frontend Next.js, Prisma et l'orchestration Docker Compose. Le dépôt fournit des fichiers d'exemple séparés pour le backend, le frontend et la pile de production. Les valeurs ne sont pas reproduites dans ce document.

# 2. Organisation

| Fichier | Périmètre |
|---|---|
| `apps/backend/.env.example` | Variables du backend en développement local. |
| `apps/backend/.env.test` | Variables utilisées par l'environnement de test backend. |
| `apps/frontend/.env.example` | Variables du frontend en développement local. |
| `.env.production.example` | Variables injectées par Docker Compose pour la pile de production. |
| `apps/backend/.env`, `apps/frontend/.env.local` | Fichiers locaux présents dans le dépôt de travail ; leurs valeurs ne sont pas documentées. |

# 3. Variables utilisées

Le tableau recense les noms présents dans les fichiers d'exemple ou utilisés par la configuration. La colonne « Obligatoire » reprend uniquement les exigences explicites de la validation backend ou de la configuration Compose ; les autres variables sont indiquées comme conditionnelles ou non précisées.

| Variable | Utilisation | Obligatoire |
|---|---|---|
| `NODE_ENV` | Sélection de l'environnement d'exécution backend/frontend et contrôles de production. | Selon l'environnement |
| `PORT` | Port d'écoute du backend. | Non indiqué |
| `FRONTEND_URL` | Origine frontend utilisée par le backend, notamment CORS. | Oui côté backend |
| `JWT_SECRET` | Secret de signature des jetons JWT. | Oui côté backend |
| `JWT_EXPIRES_IN` | Durée d'expiration JWT. | Non indiqué |
| `DATABASE_URL` | URL de connexion Prisma/PostgreSQL. | Oui côté backend |
| `JSON_BODY_LIMIT` | Limite des corps JSON. | Oui côté backend (valeur par défaut configurée) |
| `RATE_LIMIT_TTL_MS`, `RATE_LIMIT_MAX` | Fenêtre et limite du contrôle de débit général. | Valeurs par défaut configurées |
| `LOGIN_RATE_LIMIT_TTL_MS`, `LOGIN_RATE_LIMIT_MAX` | Fenêtre et limite des connexions. | Valeurs par défaut configurées |
| `TRUST_PROXY_HOPS` | Nombre de relais proxy approuvés. | Valeur par défaut configurée |
| `ATTENDANCE_SECURITY_ENABLED` | Active ou désactive la politique de sécurité du pointage. | Valeur par défaut configurée |
| `COMPANY_LATITUDE`, `COMPANY_LONGITUDE` | Coordonnées utilisées lorsque la sécurité géographique est active. | Conditionnel |
| `ATTENDANCE_ALLOWED_RADIUS_METERS` | Rayon géographique autorisé. | Optionnel |
| `ATTENDANCE_TRUSTED_RADIUS_METERS`, `ATTENDANCE_WARNING_RADIUS_METERS`, `ATTENDANCE_MAX_ACCURACY_METERS` | Paramètres de contrôle géographique du pointage. | Optionnel |
| `ATTENDANCE_PDF_RENDERER` | Sélection du moteur de génération PDF mensuel. | Valeur par défaut configurée |
| `ATTENDANCE_PDF_EXECUTABLE_PATH` | Chemin de l'exécutable Chromium pour le rendu PDF. | Conditionnel au moteur utilisé |
| `ATTENDANCE_PDF_ALLOW_LEGACY_FALLBACK` | Autorise le repli vers le moteur PDF legacy. | Valeur par défaut configurée |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Paramètres du stockage photo Cloudinary lorsqu'il est utilisé. | Conditionnel et requis ensemble dans ce cas |
| `CLOUDINARY_ATTENDANCE_FOLDER` | Dossier Cloudinary des éléments de pointage. | Optionnel |
| `CLOUDINARY_UPLOAD_TIMEOUT_MS`, `CLOUDINARY_UPLOAD_MAX_RETRIES`, `CLOUDINARY_UPLOAD_RETRY_DELAY_MS` | Paramètres des tentatives d'envoi Cloudinary. | Valeurs par défaut configurées |
| `COOKIE_SECURE` | Variable présente dans l'environnement backend local. | Non indiqué |
| `NEXT_PUBLIC_APP_URL` | Origine publique du frontend et des liens de pointage. | Utilisée par le frontend |
| `NEXT_PUBLIC_API_BASE_URL` | URL publique de base de l'API utilisée par le frontend. | Utilisée par le frontend |
| `API_BASE_URL` | Surcharge serveur de l'URL API pour les route handlers et le SSR Next.js. | Optionnel |
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | Nom, utilisateur et mot de passe du service PostgreSQL Compose. | Variables Compose avec valeurs par défaut |
| `POSTGRES_PORT` | Port hôte exposé par PostgreSQL Compose. | Valeur par défaut configurée |
| `BACKEND_PORT`, `FRONTEND_PORT` | Ports hôtes exposés par les services backend et frontend Compose. | Valeurs par défaut configurées |

Les scripts de création du compte administrateur utilisent également `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_FIRST_NAME`, `ADMIN_LAST_NAME`, `ADMIN_JOB_TITLE` et `ADMIN_DEPARTMENT` lorsqu'ils sont exécutés (`apps/backend/scripts/create-initial-admin.ts`). Ces variables ne figurent pas dans les fichiers `.env.example` inspectés.

# 4. Variables par application

Le backend charge sa configuration avec `@nestjs/config` et valide notamment `FRONTEND_URL`, `JWT_SECRET`, `DATABASE_URL`, les limites de requêtes et les paramètres de sécurité (`apps/backend/src/app.module.ts`, `apps/backend/src/main.ts`). Le frontend utilise `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_API_BASE_URL` et éventuellement `API_BASE_URL` dans ses route handlers et son code d'accès API (`apps/frontend/lib/api.ts`).

Docker Compose transmet les variables PostgreSQL, backend et frontend aux services correspondants (`docker-compose.yml`). Les Dockerfiles déclarent les arguments et variables nécessaires au build frontend et à l'exécution backend (`docker/backend.Dockerfile`, `docker/frontend.Dockerfile`).

# 5. Vérification

Les mécanismes présents pour vérifier la configuration sont :

```bash
pnpm prisma:status
pnpm db:status
docker compose --env-file .env.production ps
pnpm test:proxy
```

La validation de configuration backend s'exécute au démarrage de NestJS et rejette les valeurs absentes ou invalides selon le schéma Joi (`apps/backend/src/app.module.ts`). Le README documente également la copie de `apps/backend/.env.example` vers `.env` et de `apps/frontend/.env.example` vers `.env.local` pour le développement local.

# 6. Références

| Élément documenté | Fichiers analysés |
|---|---|
| Exemples backend, frontend et production | `apps/backend/.env.example`, `apps/backend/.env.test`, `apps/frontend/.env.example`, `.env.production.example` |
| Validation et chargement backend | `apps/backend/src/app.module.ts`, `apps/backend/src/main.ts` |
| Utilisation des URL côté frontend | `apps/frontend/lib/api.ts`, `apps/frontend/lib/api-route.ts` |
| Variables Docker Compose | `docker-compose.yml` |
| Variables de build et runtime Docker | `docker/backend.Dockerfile`, `docker/frontend.Dockerfile` |
| Création initiale de l'administrateur | `apps/backend/scripts/create-initial-admin.ts` |
| Procédures et commandes de vérification | `README.md`, `package.json`, `scripts/validate-proxy.mjs` |

---

Document ID : DG-007  
Titre : Configuration des variables d'environnement  
Version : 1.0  
Statut : Validé  
Classification : Interne  
Référence : Deployment Guide  
Projet : Konatech Pointage
