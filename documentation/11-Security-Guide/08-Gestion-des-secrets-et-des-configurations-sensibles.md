# 1. Présentation

Les secrets et configurations sensibles de Konatech Pointage sont fournis par des variables d'environnement consommées par NestJS, Next.js et Docker Compose. Le dépôt contient des fichiers d'exemple, mais les fichiers d'environnement effectifs sont exclus du suivi Git.

# 2. Configurations sensibles

| Élément | Utilisation | Mode de configuration |
|---|---|---|
| `JWT_SECRET` | Signature et vérification des JWT | Variable backend validée par Joi et injectée par l'environnement. |
| `DATABASE_URL` | Connexion Prisma à PostgreSQL | Variable backend ou URL construite par Compose. |
| `POSTGRES_PASSWORD` | Authentification du service PostgreSQL | Variable du fichier Compose de production. |
| `POSTGRES_DB`, `POSTGRES_USER` | Identité de la base et du compte PostgreSQL | Variables du fichier Compose de production. |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Accès conditionnel au stockage photo Cloudinary | Variables backend optionnelles, exigées ensemble lorsqu'elles sont utilisées. |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Création initiale d'un compte administrateur | Variables lues par le script `admin:create`, hors fichiers `.env.example` inspectés. |
| `FRONTEND_URL`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_API_BASE_URL`, `API_BASE_URL` | Origines et URL de communication frontend/API | Variables locales ou fichier `.env.production` injecté dans Compose. |
| `ATTENDANCE_PDF_EXECUTABLE_PATH` | Chemin du moteur Chromium pour les exports PDF | Variable backend ou valeur du runtime Docker. |

# 3. Variables d'environnement

L'organisation réellement présente est la suivante :

- `apps/backend/.env.example` décrit la configuration backend locale ;
- `apps/backend/.env.test` décrit l'environnement de test backend ;
- `apps/frontend/.env.example` décrit les URL frontend locales ;
- `.env.production.example` décrit les variables de la pile Docker Compose de production ;
- `apps/backend/src/app.module.ts` charge les fichiers `.env` selon `NODE_ENV`, puis valide les variables avec Joi ;
- `docker-compose.yml` injecte les variables PostgreSQL, backend et frontend dans les services correspondants ;
- les Dockerfiles transmettent les URL frontend/API nécessaires au build et au runtime Next.js.

Le README indique de créer les fichiers locaux à partir des exemples et de créer `.env.production` à partir de `.env.production.example`. Les valeurs ne sont pas reproduites dans ce document.

# 4. Protection des secrets

Les mécanismes effectivement présents sont :

- les motifs `.env`, `.env.local`, `.env.test`, `.env.production` et leurs variantes sont exclus par `.gitignore` ;
- `JWT_SECRET` est validé comme chaîne d'au moins 32 caractères ;
- en production, la configuration refuse un secret JWT identifié comme local ou de test ;
- `FRONTEND_URL` et les URL frontend/API sont validées selon l'environnement, avec HTTPS exigé en production par le code frontend ;
- les identifiants Cloudinary sont validés ensemble lorsqu'un seul est configuré ;
- les valeurs sont lues via `ConfigService` ou `process.env` et ne font pas partie des objets publics d'authentification.

Le dépôt ne contient aucun coffre-fort de secrets, gestionnaire externe, mécanisme de rotation automatique ou procédure de renouvellement des secrets.

# 5. Vérification

La validation de configuration backend est exécutée au démarrage de NestJS. Les contrôles disponibles dans le dépôt sont :

```bash
pnpm prisma:status
pnpm test:proxy
pnpm validate
docker compose --env-file .env.production ps
```

Les erreurs de configuration d'URL sont également détectées par les route handlers frontend, qui distinguent une configuration invalide d'une indisponibilité backend. Le README documente la vérification des variables d'URL et de la cohérence entre `FRONTEND_URL` et `NEXT_PUBLIC_APP_URL` sans afficher de secret.

# 6. Références

| Élément documenté | Fichiers analysés |
|---|---|
| Exemples de variables locales et production | `apps/backend/.env.example`, `apps/backend/.env.test`, `apps/frontend/.env.example`, `.env.production.example` |
| Chargement et validation backend | `apps/backend/src/app.module.ts`, `apps/backend/src/main.ts` |
| Validation des URL frontend/API | `apps/frontend/lib/api.ts`, `apps/frontend/lib/api-route.ts` |
| Injection Docker Compose | `docker-compose.yml`, `docker/backend.Dockerfile`, `docker/frontend.Dockerfile` |
| Création initiale de l'administrateur | `apps/backend/scripts/create-initial-admin.ts`, `apps/backend/package.json` |
| Exclusion des fichiers sensibles | `.gitignore` |
| Procédures et contrôles documentés | `README.md`, `package.json` |

---

Document ID : SG-008  
Titre : Gestion des secrets et des configurations sensibles  
Version : 1.0  
Statut : Validé  
Classification : Interne  
Référence : Security Guide  
Projet : Konatech Pointage
