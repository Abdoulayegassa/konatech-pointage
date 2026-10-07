# Guide d'exploitation — Procédures de contrôle

| Métadonnée | Valeur |
|---|---|
| Document ID | OG-010 |
| Titre | Procédures de contrôle |
| Version | 1.0 |
| Statut | Validé |
| Classification | Interne |
| Référence | Operations Guide |
| Projet | Konatech Pointage |

## 1. Présentation

Ce chapitre décrit les contrôles exécutables à partir du dépôt Konatech Pointage. Il couvre les services, PostgreSQL et Prisma, les builds, les tests, la validation du code, la configuration du backend, l'authentification et les réponses HTTP.

Les contrôles recensés correspondent à des scripts pnpm, des routes HTTP, des healthchecks Docker Compose ou des tests présents dans le dépôt. Leur exécution est explicite, à l'exception des healthchecks lancés par Docker Compose pour les services configurés.

## 2. Contrôles disponibles

| Contrôle | Composant | Moyen utilisé |
|---|---|---|
| État du service PostgreSQL local | PostgreSQL | `pnpm db:status`, qui exécute `docker compose ps` |
| Disponibilité native de PostgreSQL sous Compose | PostgreSQL | Healthcheck `pg_isready` |
| État des migrations | Prisma et PostgreSQL | `pnpm prisma:status` |
| Génération de Prisma Client | Backend et Prisma | `pnpm prisma:generate` |
| Disponibilité HTTP du backend | Backend | `GET /api/v1/health` |
| Disponibilité du frontend et accès au backend | Frontend et backend | `GET /api/health` |
| État des conteneurs de la pile | PostgreSQL, backend et frontend | `docker compose --env-file .env.production ps` |
| Sorties des conteneurs | PostgreSQL, backend et frontend | `docker compose --env-file .env.production logs -f backend frontend postgres` |
| Connexion frontend/backend | Frontend et backend | `pnpm test:proxy` |
| Fonctionnement des API métier | Backend et PostgreSQL de test | `pnpm test:backend` |
| Authentification et protection JWT | Backend | Cas e2e de connexion, session et accès protégé |
| Validation des entrées HTTP | Backend | `ValidationPipe` global et cas e2e |
| Validation de la configuration | Backend | Schéma Joi au chargement et tests d'environnement |
| Vérification TypeScript | Backend et frontend | `pnpm typecheck` |
| Analyse ESLint | Monorepo | `pnpm lint` |
| Contrôle Prettier | Monorepo | `pnpm format:check` |
| Construction | Backend et frontend | `pnpm build` |
| Contrôle global | Monorepo et applications | `pnpm check` ou `pnpm validate` |

## 3. Vérification des services

### 3.1 Backend

Le backend expose une route publique de santé :

```text
GET /api/v1/health
```

Le préfixe `/api/v1` est défini dans `apps/backend/src/main.ts`. Le contrôleur `apps/backend/src/modules/health/health.controller.ts` renvoie une réponse JSON comportant `status`, `service` et `timestamp`. Le test e2e vérifie un statut HTTP 200 ainsi que les valeurs `status: "ok"` et `service: "konatech-attendance-api"`.

Le healthcheck du service backend dans `docker-compose.yml` appelle cette même route sur le port interne `4000` et considère le service sain lorsque la réponse HTTP est positive.

### 3.2 Frontend

Le frontend expose :

```text
GET /api/health
```

La route `apps/frontend/app/api/health/route.ts` appelle le backend sur `/health` par l'intermédiaire de `fetchServerApi`. Elle transmet le statut et le contenu du backend en cas de succès. En cas d'échec de connexion ou de réponse non positive, elle produit une réponse d'erreur HTTP.

Le healthcheck frontend de Compose appelle cette route sur le port interne `3000`. Il intervient après le healthcheck backend dans la chaîne de dépendances de `docker-compose.yml`.

### 3.3 PostgreSQL

Le service PostgreSQL de Compose emploie :

```text
pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"
```

Ce contrôle utilise les variables injectées dans le conteneur sans exposer leur valeur dans ce document. Le backend déclaré par Compose attend l'état sain de PostgreSQL avant de démarrer.

L'état des services Compose lancés depuis la configuration par défaut est accessible avec :

```bash
pnpm db:status
```

### 3.4 API et pile Docker

Le script `scripts/validate-proxy.mjs` démarre le backend et le frontend sur des ports temporaires. Il contrôle :

- la réponse du backend sur `/api/v1/health` ;
- la réponse du frontend sur `/api/health` ;
- le passage de la route frontend vers le backend ;
- l'égalité des origines publiques injectées pour ce test ;
- la redirection de l'API `/api/v1/attendance/entry` vers `/attendance-entry`.

Il est exécuté par :

```bash
pnpm test:proxy
```

Pour la pile construite avec le profil `app`, les commandes publiées sont :

```bash
docker compose --env-file .env.production ps
docker compose --env-file .env.production logs -f backend frontend postgres
```

La première expose l'état des conteneurs et de leurs healthchecks. La seconde affiche leurs sorties standard.

## 4. Vérification des données

| Élément contrôlé | Moyen disponible | Portée observable | Source |
|---|---|---|---|
| État des migrations | `pnpm prisma:status` | Comparaison de l'historique Prisma avec la base désignée par `DATABASE_URL` | `package.json` |
| Génération du client | `pnpm prisma:generate` | Génération de Prisma Client depuis le schéma | `package.json`, `apps/backend/prisma/schema.prisma` |
| Connexion PostgreSQL sous Compose | Healthcheck `pg_isready` | Acceptation des connexions par l'instance configurée | `docker-compose.yml` |
| Accès Prisma pendant les tests | `pnpm test:backend` | Exécution des scénarios e2e contre la base de test préparée par le runner | `apps/backend/test/jest-e2e.json`, `apps/backend/test/test-database.ts` |
| Contraintes et comportements métier | `pnpm test:backend` | Assertions e2e sur les API, les validations et les données retournées | `apps/backend/test/` |
| Application des migrations existantes | `pnpm prisma:migrate:deploy` | Exécution de `prisma migrate deploy` sur la base configurée | `package.json` |
| Chargement du jeu de données | `pnpm prisma:seed` | Exécution explicite du fichier de seed | `apps/backend/package.json`, `apps/backend/prisma/seed.ts` |

Le schéma `apps/backend/prisma/schema.prisma`, les migrations de `apps/backend/prisma/migrations/` et le fichier `apps/backend/prisma/seed.ts` constituent trois mécanismes distincts. `prisma:status` est la commande dédiée au contrôle des migrations. `prisma:generate`, `prisma:migrate:deploy` et `prisma:seed` effectuent respectivement une génération, une modification du schéma de base et un chargement de données.

Le healthcheck HTTP du backend ne réalise pas de requête Prisma. Sous Compose, la disponibilité de PostgreSQL est contrôlée séparément par `pg_isready`.

## 5. Vérification de l'application

### 5.1 Authentification

Le module d'authentification expose notamment `POST /api/v1/auth/login`, `POST /api/v1/auth/attendance-entry/login` et `GET /api/v1/auth/me`. Le `JwtAuthGuard` global laisse passer les routes marquées publiques et exige un en-tête `Authorization` utilisant le schéma Bearer pour les autres routes.

La suite e2e de `apps/backend/test/app.e2e-spec.ts` contrôle notamment :

- la connexion administrateur et la présence d'un jeton ;
- l'absence d'exposition des secrets PIN dans la réponse ;
- la séparation entre session applicative et session du parcours de pointage ;
- les réponses aux accès sans authentification ou avec un jeton non valable ;
- l'accès aux routes selon le rôle authentifié.

Ces contrôles sont lancés par `pnpm test:backend`.

### 5.2 Validation et erreurs HTTP

Le bootstrap NestJS installe un `ValidationPipe` global avec suppression des propriétés non déclarées, rejet des propriétés interdites et transformation des valeurs. Les DTO et leurs décorateurs de validation définissent les contraintes des entrées HTTP.

Les exceptions d'authentification produites par `JwtAuthGuard` et `AuthService` utilisent `UnauthorizedException`. Le garde de limitation utilise `HttpException` pour les requêtes dépassant les limites configurées. Les tests e2e vérifient des statuts HTTP et des contenus de réponse pour des entrées valides et invalides.

Le chargement du backend passe par le schéma Joi de `apps/backend/src/app.module.ts`. Les variables obligatoires, formats, valeurs numériques et combinaisons de sécurité y sont validés. Les cas propres à cette validation sont exercés dans `apps/backend/test/environment-validation.e2e-spec.ts` et `apps/backend/test/app.e2e-spec.ts`.

### 5.3 Démarrage, build et exécution

| Contrôle | Commande | Résultat directement observable |
|---|---|---|
| Types des deux applications | `pnpm typecheck` | Sortie du compilateur TypeScript sans émission |
| Construction du backend | `pnpm build:backend` | Production de l'artefact NestJS |
| Construction du frontend | `pnpm build:frontend` | Production de l'artefact Next.js |
| Construction ordonnée | `pnpm build` | Build backend puis build frontend |
| Contrôles essentiels | `pnpm check` | Lint, types et builds |
| Validation backend | `pnpm validate:backend` | Prisma Client, types, tests et build backend |
| Validation frontend | `pnpm validate:frontend` | Types, build frontend et connexion par proxy |
| Validation globale | `pnpm validate` | Format, Prisma Client, types, lint, tests et builds |
| Démarrage en développement | `pnpm dev` | Sorties conjointes des serveurs NestJS et Next.js |
| Exécution des artefacts | Scripts `start` des applications | `node dist/main.js` pour NestJS et `next start` pour Next.js |

Au démarrage, NestJS valide la configuration avant l'écoute HTTP. Le bootstrap écrit ensuite le port et le préfixe API dans les sorties du processus. Les erreurs de build, de test, de lint, de types ou de validation sont matérialisées par la sortie et le code de fin de la commande concernée.

## 6. Commandes de contrôle

### 6.1 Contrôles du code et des artefacts

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm build
pnpm check
```

### 6.2 Tests et validations

```bash
pnpm test:backend
pnpm test:proxy
pnpm validate:backend
pnpm validate:frontend
pnpm validate
```

### 6.3 Prisma et PostgreSQL

```bash
pnpm prisma:generate
pnpm prisma:status
pnpm db:status
```

Les commandes suivantes exécutent une opération sur la base ou les données et fournissent leur résultat dans leur sortie :

```bash
pnpm prisma:migrate
pnpm prisma:migrate:deploy
pnpm prisma:seed
```

### 6.4 Conteneurs

```bash
docker compose --env-file .env.production ps
docker compose --env-file .env.production logs -f backend frontend postgres
```

Toutes ces commandes sont définies dans les manifestes ou publiées dans `README.md`.

## 7. Diagramme des contrôles

```text
                         Dépôt
                           |
            +--------------+--------------+
            |              |              |
            v              v              v
     Contrôles code   Contrôles data   Build / tests
     format / lint    Prisma status    backend e2e
     TypeScript       Prisma generate  test proxy
            |              |              |
            +--------------+--------------+
                           |
                           v
                 Services en exécution
                           |
            +--------------+--------------+
            |              |              |
            v              v              v
       pg_isready    /api/v1/health   /api/health
       PostgreSQL        Backend        Frontend
            |              |              |
            +--------------+--------------+
                           |
                           v
                 docker compose ps
                 sorties des services
```

Les trois contrôles de disponibilité du niveau inférieur correspondent aux healthchecks définis dans `docker-compose.yml`. La route frontend relaie le contrôle de santé du backend.

## 8. Traçabilité

| Mécanisme documenté | Fichier ou répertoire source | Preuve observée |
|---|---|---|
| Scripts de contrôle racine | `package.json` | Scripts de format, lint, types, builds, tests, validations, Prisma et Compose |
| Scripts backend | `apps/backend/package.json` | Build, start, typecheck, test et commandes Prisma |
| Scripts frontend | `apps/frontend/package.json` | Dev, build, start et typecheck |
| Commandes publiées | `README.md` | Catalogue des scripts, routes de santé et commandes Compose |
| Healthchecks des services | `docker-compose.yml` | `pg_isready`, appels HTTP et dépendances par état sain |
| Bootstrap backend | `apps/backend/src/main.ts` | Préfixe global, validation, écoute et journal de démarrage |
| Validation de configuration | `apps/backend/src/app.module.ts` | Chargement global et schéma Joi |
| Santé backend | `apps/backend/src/modules/health/health.controller.ts` | Route publique et contenu de la réponse |
| Santé frontend | `apps/frontend/app/api/health/route.ts` | Appel serveur du backend et transformation des erreurs |
| Client d'API frontend | `apps/frontend/lib/api.ts` | Résolution de l'origine et requêtes vers le backend |
| Validation du proxy | `scripts/validate-proxy.mjs` | Démarrage temporaire, contrôles de santé et redirection |
| Configuration Jest e2e | `apps/backend/test/jest-e2e.json` | Sélection et exécution des spécifications e2e |
| Préparation de la base de test | `apps/backend/test/test-database.ts` | Connexion et préparation PostgreSQL réservées aux tests |
| Scénarios API et authentification | `apps/backend/test/app.e2e-spec.ts` | Assertions de santé, connexion, autorisation, validation et API |
| Validation d'environnement | `apps/backend/test/environment-validation.e2e-spec.ts` | Cas valides et invalides de configuration |
| Autres scénarios métier | `apps/backend/test/` | Spécifications e2e des fonctions métier |
| Contrôleur d'authentification | `apps/backend/src/modules/auth/auth.controller.ts` | Routes de connexion et d'identité |
| Protection JWT | `apps/backend/src/modules/auth/guards/jwt-auth.guard.ts` | Contrôle Bearer et résolution de l'utilisateur |
| Service d'authentification | `apps/backend/src/modules/auth/auth.service.ts` | Vérification des identifiants et jetons |
| Validation des requêtes | `apps/backend/src/main.ts` | `ValidationPipe` global |
| Limitation des requêtes | `apps/backend/src/common/security/app-throttler.guard.ts` | Réponse HTTP lors du dépassement des limites |
| Schéma Prisma | `apps/backend/prisma/schema.prisma` | Source Prisma Client et fournisseur PostgreSQL |
| Migrations Prisma | `apps/backend/prisma/migrations/` | Historique SQL versionné |
| Seed | `apps/backend/prisma/seed.ts` | Chargement explicite des données |
| Journalisation et disponibilité | `documentation/07-Operations-Guide/05-Journaux-et-supervision.md` | Inventaire détaillé des sorties et contrôles |
| Exploitation des données | `documentation/07-Operations-Guide/06-Exploitation-de-PostgreSQL-et-Prisma.md` | Commandes et vérifications Prisma/PostgreSQL |
| Gestion des incidents | `documentation/07-Operations-Guide/08-Gestion-des-incidents.md` | Erreurs observables et vérification du rétablissement |
| Maintenance | `documentation/07-Operations-Guide/09-Maintenance-operationnelle.md` | Opérations et contrôles après intervention |

## 9. Observations

- Les contrôles du dépôt sont répartis entre scripts pnpm, tests Jest, routes HTTP, validation de configuration et healthchecks Compose.
- `pnpm validate` constitue l'enchaînement de contrôle le plus étendu défini dans le manifeste racine.
- Les validations backend et frontend peuvent être exécutées séparément.
- `pnpm test:proxy` contrôle la liaison frontend/backend et la redirection du parcours `/attendance-entry`.
- La suite backend exerce l'authentification, les autorisations, la validation des requêtes et les fonctions métier avec une base de test dédiée.
- Le statut des migrations est contrôlé séparément de la génération de Prisma Client.
- Le seed charge des données ; il ne constitue pas un contrôle de disponibilité.
- Le healthcheck backend vérifie le processus HTTP sans interroger Prisma.
- Le healthcheck PostgreSQL et le healthcheck backend sont deux contrôles distincts dans Compose.
- La route de santé frontend dépend d'une réponse du backend et rend donc observable leur liaison.
- Les fichiers analysés ne définissent ni SLA, ni SLO, ni KPI.
