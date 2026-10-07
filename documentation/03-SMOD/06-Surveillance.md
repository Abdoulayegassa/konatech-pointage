# Surveillance et Monitoring

| Métadonnée | Valeur |
|---|---|
| Document ID | SMOD-MONITOR-001 |
| Titre | Surveillance et Monitoring |
| Version | 1.0 |
| Statut | Validé |
| Classification | Interne |
| Référence | SMOD |
| Date de génération | 30 juillet 2026 |

## 1. Présentation

### 1.1 Objectif

Ce document décrit les mécanismes de surveillance réellement présents dans Konatech Pointage : healthchecks, endpoints de santé, états Docker, contrôle Prisma, journaux applicatifs et scripts de validation.

### 1.2 Périmètre

Le périmètre couvre :

- le frontend Next.js ;
- le backend NestJS et son API ;
- PostgreSQL ;
- Prisma ;
- les services Docker Compose ;
- Cloudinary, Render et Neon dans la limite des intégrations observées ;
- les journaux et commandes de contrôle ;
- les mécanismes de monitoring absents du dépôt.

Les métriques métier affichées dans le tableau de bord de l'application sont distinguées des métriques techniques de supervision.

### 1.3 Public concerné

Le document s'adresse aux exploitants, ingénieurs DevOps, SRE, développeurs et responsables techniques chargés d'observer la disponibilité et le comportement de la plateforme.

Sources : `README.md`, `docker-compose.yml`, `package.json`, `documentation/02-SAR/15-Deploiement.md`.

## 2. Architecture de supervision

### 2.1 Frontend

Le frontend Next.js est surveillable par :

- l'accès à l'application sur son port publié ;
- la route `GET /api/health` ;
- le healthcheck Docker qui appelle cette route ;
- les sorties standard et d'erreur du processus Next.js ;
- le script `test:proxy`.

La route de santé frontend ne produit pas son propre état autonome. Elle appelle le backend sur `/health` et relaie la réponse. Son succès confirme que le serveur Next.js est actif et peut joindre l'API.

Sources : `apps/frontend/app/api/health/route.ts`, `apps/frontend/lib/api.ts`, `docker-compose.yml`, `scripts/validate-proxy.mjs`.

### 2.2 Backend

Le backend NestJS est surveillable par :

- `GET /api/v1/health` ;
- le healthcheck Docker correspondant ;
- les journaux NestJS ;
- les tests backend ;
- les scripts de build, typecheck et validation.

Le démarrage journalise le port et le préfixe API. Hors production, il journalise également l'état de la politique de sécurité de présence et indique si les coordonnées et Cloudinary sont configurés.

Sources : `apps/backend/src/main.ts`, contrôleur de santé backend, `docker-compose.yml`.

### 2.3 PostgreSQL

PostgreSQL est surveillable par :

- le healthcheck Compose fondé sur `pg_isready` ;
- l'état du conteneur affiché par Docker Compose ;
- les journaux du conteneur ;
- la commande `prisma:status`, qui tente d'utiliser la datasource configurée.

Le service utilise l'image `postgres:16-alpine` et le conteneur nommé `konatech-postgres`.

Source : `docker-compose.yml`.

### 2.4 Prisma

Prisma ne constitue pas un service autonome. Il s'exécute dans le backend et dans les commandes CLI.

Les contrôles présents sont :

- `prisma migrate status` par `pnpm prisma:status` ;
- `prisma generate` ;
- les migrations appliquées dans les tests ;
- les tests backend qui accèdent à une base dédiée.

`PrismaService` ne publie aucun endpoint de métriques, de santé ou d'état propre.

Sources : `package.json`, `apps/backend/src/common/prisma/prisma.service.ts`, `apps/backend/test/test-database.ts`.

### 2.5 Docker

Compose apporte :

- les états de conteneurs ;
- les états `healthy` ou `unhealthy` issus des healthchecks ;
- les dépendances conditionnées par la santé ;
- l'accès aux sorties des conteneurs ;
- une politique `restart: unless-stopped`.

La chaîne de dépendances est :

```text
PostgreSQL sain -> démarrage backend
Backend sain    -> démarrage frontend
```

### 2.6 Services Cloud

#### Cloudinary

Le backend journalise les nouvelles tentatives et les échecs de téléversement Cloudinary. Les journaux contiennent notamment l'événement, l'identifiant public, le numéro de tentative, le statut HTTP, l'indication de timeout et le message d'échec.

Aucun healthcheck Cloudinary, métrique, tableau de bord ou alerte n'est configuré dans le dépôt.

Source : `apps/backend/src/modules/attendance/attendance-photo-storage.service.ts`.

#### Render

Render est cité dans `README.md` comme environnement possible d'exécution de commandes. Aucun manifeste Render, healthcheck de plateforme, configuration de logs, métrique ou alerte Render n'est versionné.

#### Neon

Neon est cité comme cible PostgreSQL possible par `DATABASE_URL`. Aucun outil, projet, branche, métrique, alerte ou contrôle Neon propre au fournisseur n'est configuré.

Sources : `README.md`, `documentation/02-SAR/15-Deploiement.md`.

### 2.7 Diagramme de supervision

```text
                         Opérateur
                             |
          +------------------+------------------+
          |                  |                  |
          v                  v                  v
   docker compose ps    docker compose logs   pnpm scripts
          |                  |                  |
          +------------------+------------------+
                             |
                             v
                   +--------------------+
                   | Frontend Next.js   |
                   | GET /api/health    |
                   +---------+----------+
                             |
                             | relaie /health
                             v
                   +--------------------+
                   | Backend NestJS     |
                   | /api/v1/health     |
                   +---------+----------+
                             |
                             | Prisma / DATABASE_URL
                             v
                   +--------------------+
                   | PostgreSQL         |
                   | pg_isready         |
                   +--------------------+

Cloudinary : erreurs et nouvelles tentatives dans les logs backend
Render / Neon : aucune supervision configurée dans le dépôt
```

## 3. Health Checks

### 3.1 Endpoint de santé backend

Endpoint local documenté :

```text
GET http://localhost:4000/api/v1/health
```

La réponse contient :

| Champ | Contenu |
|---|---|
| `status` | `ok` |
| `service` | `konatech-attendance-api` |
| `timestamp` | Horodatage ISO produit à chaque appel |

Le contrôleur est marqué public. Il ne demande pas d'authentification.

Source : `apps/backend/src/modules/health/health.controller.ts`.

### 3.2 Portée du healthcheck backend

Le contrôleur construit une réponse statique à partir du processus actif et de l'heure courante. Il n'exécute pas de requête Prisma, PostgreSQL, Cloudinary ou Chromium.

Une réponse réussie confirme donc :

- que le processus NestJS répond ;
- que le routage `/api/v1/health` fonctionne.

Elle ne confirme pas directement :

- la connexion PostgreSQL ;
- l'état des migrations ;
- la disponibilité Cloudinary ;
- la génération PDF ;
- les parcours métier authentifiés.

### 3.3 Endpoint de santé frontend

Endpoint local documenté :

```text
GET http://localhost:3000/api/health
```

La route :

1. appelle l'API backend sur `/health` ;
2. lit sa réponse JSON ;
3. relaie la réponse et son statut si elle réussit ;
4. renvoie une erreur si l'appel échoue ou si le backend répond en erreur.

Sources : `apps/frontend/app/api/health/route.ts`, `apps/frontend/lib/api.ts`.

### 3.4 Portée du healthcheck frontend

Une réponse réussie confirme :

- que le serveur Next.js répond ;
- que son route handler s'exécute ;
- que le serveur frontend peut joindre le backend ;
- que le backend renvoie son état attendu.

Le contrôle dépend de `API_BASE_URL` ou de `NEXT_PUBLIC_API_BASE_URL` selon la résolution implémentée.

### 3.5 Healthcheck PostgreSQL

Commande exécutée dans le conteneur :

```text
pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"
```

Paramètres :

| Paramètre | Valeur |
|---|---:|
| Intervalle | 10 secondes |
| Timeout | 5 secondes |
| Nombre d'essais | 5 |
| Période initiale | 10 secondes |

Source : `docker-compose.yml`.

### 3.6 Healthcheck Docker backend

Le conteneur exécute une requête HTTP Node.js vers :

```text
http://127.0.0.1:4000/api/v1/health
```

Le processus de contrôle réussit lorsque la réponse HTTP est considérée comme réussie.

| Paramètre | Valeur |
|---|---:|
| Intervalle | 20 secondes |
| Timeout | 5 secondes |
| Nombre d'essais | 5 |
| Période initiale | 30 secondes |

### 3.7 Healthcheck Docker frontend

Le conteneur exécute une requête HTTP Node.js vers :

```text
http://127.0.0.1:3000/api/health
```

| Paramètre | Valeur |
|---|---:|
| Intervalle | 20 secondes |
| Timeout | 5 secondes |
| Nombre d'essais | 5 |
| Période initiale | 30 secondes |

### 3.8 Dépendances fondées sur la santé

Compose attend :

1. que PostgreSQL soit sain avant de démarrer le backend ;
2. que le backend soit sain avant de démarrer le frontend.

Les services backend et frontend appartiennent au profil `app`.

### 3.9 Vérification manuelle des endpoints

```bash
curl http://localhost:4000/api/v1/health
curl http://localhost:3000/api/health
```

Ces adresses sont documentées dans `README.md`.

### 3.10 Script associé

```bash
pnpm test:proxy
```

Le script :

- choisit deux ports locaux disponibles ;
- démarre le backend ;
- attend jusqu'à 45 secondes son healthcheck ;
- démarre le frontend ;
- attend jusqu'à 60 secondes le proxy de santé ;
- valide les champs `status` et `service` ;
- vérifie la redirection de la borne de pointage ;
- arrête les processus.

En cas d'échec, il inclut les journaux récents capturés.

Source : `scripts/validate-proxy.mjs`.

## 4. Journaux (Logs)

### 4.1 Production des journaux backend

Le backend utilise le logger NestJS. Les événements explicitement produits sont :

| Source | Événements observés |
|---|---|
| Bootstrap | État de la sécurité hors production et démarrage de l'API |
| Audit administrateur | Mutations administratives sérialisées en JSON |
| Limitation de débit | Blocage de la borne, route, IP, user-agent, limiteur et horodatage |
| Export PDF | Démarrage, fin, moteur utilisé, durée, taille, repli et erreurs |
| Cloudinary | Nouvelle tentative, timeout et échec de téléversement |

Les scripts de création d'administrateur et de backfill écrivent aussi leurs résultats ou erreurs avec la console Node.js.

Sources : `apps/backend/src/main.ts`, `apps/backend/src/common/audit/audit-log.service.ts`, `apps/backend/src/common/security/app-throttler.guard.ts`, services photo et PDF, `apps/backend/scripts/`.

### 4.2 Production des journaux frontend

Le frontend s'exécute avec les sorties standard et d'erreur de Next.js. Aucun service de logger applicatif propre au frontend n'est défini.

`scripts/dev.mjs` utilise `stdio: inherit` : les sorties frontend et backend sont directement visibles dans le terminal qui exécute `pnpm dev`.

### 4.3 Niveaux observés

| Niveau ou flux | Utilisation observée |
|---|---|
| `log` | Démarrage, étapes et résultats normaux, moteur PDF |
| `warn` | Audit administrateur, limite de débit, nouvelle tentative et repli |
| `error` | Échecs Cloudinary, PDF ou scripts |
| sortie standard | Messages normaux des scripts |
| sortie d'erreur | Messages d'échec des scripts et processus |

Aucun niveau de log configurable par variable d'environnement n'est présent. Aucun usage applicatif explicite des niveaux `debug` ou `verbose` n'a été observé.

### 4.4 Emplacement des journaux

Aucun fichier ni répertoire de journaux n'est créé par la configuration applicative. Les journaux sont envoyés aux sorties standard et d'erreur.

En local, ils apparaissent dans le terminal du processus.

Dans Docker, ils restent associés aux sorties des conteneurs. Aucun pilote de logs spécifique n'est déclaré dans Compose.

### 4.5 Consultation locale

Applications conjointes :

```bash
pnpm dev
```

Backend seul :

```bash
pnpm dev:backend
```

Frontend seul :

```bash
pnpm dev:frontend
```

### 4.6 Consultation Docker Compose

Pile de production Compose :

```bash
docker compose --env-file .env.production logs -f backend frontend postgres
```

Services ciblés :

```bash
docker compose --env-file .env.production logs backend
docker compose --env-file .env.production logs frontend
docker compose --env-file .env.production logs postgres
```

La première commande est documentée dans `README.md`.

### 4.7 Journaux temporaires du test de proxy

`scripts/validate-proxy.mjs` capture `stdout` et `stderr` des deux processus, préfixe chaque ligne par le nom du service et conserve au maximum 80 lignes par processus.

Le buffer est affiché lorsqu'une validation échoue. Il n'est pas écrit dans un fichier et disparaît avec le processus.

### 4.8 Audit applicatif

`AuditLogService` journalise les actions administratives au niveau `warn` sous forme JSON. Les champs incluent :

- l'événement ;
- l'heure ;
- l'acteur ;
- son adresse électronique et son rôle ;
- l'action ;
- la ressource ;
- l'identifiant de ressource ;
- les métadonnées.

Ces événements sont des journaux applicatifs. Aucun stockage dans une table d'audit ni transfert vers un service externe n'est implémenté.

### 4.9 Rétention et centralisation

Aucune politique de rotation, durée de conservation, taille maximale, archivage ou centralisation n'est définie.

Aucun agrégateur de logs n'est configuré.

## 5. Vérification des services

### 5.1 Frontend

Contrôle de l'interface :

```text
http://localhost:3000
```

Contrôle du route handler et de la connexion backend :

```bash
curl http://localhost:3000/api/health
```

Contrôle automatisé :

```bash
pnpm validate:frontend
```

Cette commande exécute le typecheck frontend, le build frontend et le test du proxy.

### 5.2 Backend

Contrôle HTTP :

```bash
curl http://localhost:4000/api/v1/health
```

Contrôle automatisé :

```bash
pnpm validate:backend
```

Cette commande exécute la génération Prisma, le typecheck backend, les tests backend et le build backend.

### 5.3 API

La base locale documentée est :

```text
http://localhost:4000/api/v1
```

Le seul endpoint dédié à la santé est `/health`. Les autres contrôleurs couvrent les opérations métier et peuvent nécessiter une authentification ou un rôle.

`docs/RELEASE_CHECKLIST.md` et `TESTING_CHECKLIST.md` fournissent des smoke checks fonctionnels manuels. Ces checklists ne produisent pas une supervision continue.

### 5.4 Base PostgreSQL

État local :

```bash
pnpm db:status
```

État de la pile complète :

```bash
docker compose --env-file .env.production ps
```

Journaux :

```bash
docker compose --env-file .env.production logs postgres
```

### 5.5 Prisma

```bash
pnpm prisma:status
```

Cette commande exécute `prisma migrate status`. Elle vérifie l'accès à la datasource configurée et affiche l'état des migrations.

Génération du client :

```bash
pnpm prisma:generate
```

Cette seconde commande vérifie la capacité à générer le client à partir du schéma, mais ne contrôle pas la disponibilité continue de PostgreSQL.

### 5.6 Docker Compose

```bash
docker compose ps
docker compose --profile app ps
```

`pnpm db:status` est un alias de `docker compose ps`.

Les états de santé sont fournis uniquement lorsque les conteneurs correspondants ont été créés et démarrés.

### 5.7 Connexion frontend/backend

```bash
pnpm test:proxy
```

Le test confirme :

- l'état backend attendu ;
- l'état attendu à travers le frontend ;
- la résolution des URL publiques ;
- la redirection de la borne.

Il utilise des ports temporaires et une base de test. Ce n'est pas une sonde continue sur une plateforme déployée.

### 5.8 Services Cloud

Cloudinary est observable uniquement à travers les journaux d'échec ou de nouvelle tentative produits lors d'un téléversement.

Render et Neon n'ont aucun contrôle dédié dans le dépôt. `prisma:status` peut utiliser toute `DATABASE_URL` PostgreSQL configurée, mais cette commande n'est pas une intégration de monitoring Neon.

## 6. Scripts de contrôle

| Script ou commande | Composant vérifié | Contrôle effectué |
|---|---|---|
| `pnpm db:status` | Docker/PostgreSQL | Affiche l'état Compose |
| `docker compose ps` | Docker | Affiche l'état et la santé des conteneurs |
| `docker compose logs` | Docker/services | Affiche les sorties des conteneurs |
| `pnpm prisma:status` | Prisma/PostgreSQL | Vérifie la datasource et l'état des migrations |
| `pnpm prisma:generate` | Prisma | Génère le client depuis le schéma |
| `pnpm test:backend` | Backend/base de test | Exécute les tests end-to-end |
| `pnpm test:proxy` | Frontend/backend | Vérifie les deux healthchecks et la connexion |
| `pnpm typecheck` | Frontend/backend | Vérifie les types |
| `pnpm lint` | Code source | Exécute ESLint |
| `pnpm build` | Frontend/backend | Vérifie la construction des deux applications |
| `pnpm check` | Code et builds | Enchaîne lint, typecheck et build |
| `pnpm validate:backend` | Backend/Prisma | Génère, vérifie, teste et construit le backend |
| `pnpm validate:frontend` | Frontend/proxy | Vérifie, construit et teste la connexion |
| `pnpm validate` | Plateforme | Exécute la chaîne complète de validation |
| `curl .../api/v1/health` | Backend | Appelle l'endpoint de santé |
| `curl .../api/health` | Frontend/backend | Appelle le proxy de santé |

Aucun script `monitor`, `metrics`, `alerts`, `traces`, `uptime`, `doctor` ou `observe` n'est défini dans les `package.json`.

## 7. Dépendances

```text
+----------------------+
| Surveillance         |
| commandes / scripts  |
+----------+-----------+
           |
           v
+----------------------+
| Frontend Next.js     |
| /api/health          |
+----------+-----------+
           |
           v
+----------------------+
| Backend NestJS       |
| /api/v1/health       |
+----------+-----------+
           |
           v
+----------------------+
| Prisma               |
| migrate status       |
+----------+-----------+
           |
           v
+----------------------+
| PostgreSQL           |
| pg_isready           |
+----------------------+
```

Correspondance des contrôles :

```text
docker compose ps
    |
    +--> PostgreSQL : pg_isready
    |
    +--> Backend    : requête HTTP /api/v1/health
    |
    `--> Frontend   : requête HTTP /api/health
```

## 8. Traçabilité

| Mécanisme | Fichiers concernés |
|---|---|
| Endpoint santé backend | `apps/backend/src/modules/health/health.controller.ts` |
| Module santé backend | `apps/backend/src/modules/health/health.module.ts` |
| Préfixe API et logs de démarrage | `apps/backend/src/main.ts` |
| Endpoint santé frontend | `apps/frontend/app/api/health/route.ts` |
| Résolution de l'URL backend | `apps/frontend/lib/api.ts` |
| Gestion des erreurs du proxy | `apps/frontend/lib/api-route.ts` |
| Healthchecks Docker | `docker-compose.yml` |
| Dépendances de santé Compose | `docker-compose.yml` |
| Politique de redémarrage | `docker-compose.yml` |
| État Docker | `package.json`, `README.md` |
| Consultation des logs Docker | `README.md` |
| Test de proxy | `scripts/validate-proxy.mjs` |
| Transmission des logs locaux | `scripts/dev.mjs` |
| État des migrations Prisma | `package.json`, `apps/backend/package.json` |
| Service Prisma | `apps/backend/src/common/prisma/prisma.service.ts` |
| Tests de connexion à la base | `apps/backend/test/test-database.ts`, tests end-to-end |
| Audit administrateur | `apps/backend/src/common/audit/audit-log.service.ts` |
| Journaux de limitation de débit | `apps/backend/src/common/security/app-throttler.guard.ts` |
| Journaux Cloudinary | `apps/backend/src/modules/attendance/attendance-photo-storage.service.ts` |
| Journaux PDF | `apps/backend/src/modules/attendance/exports/monthly-attendance-pdf-exporter.service.ts` |
| Scripts de contrôle | `package.json` |
| Smoke checks | `TESTING_CHECKLIST.md`, `docs/RELEASE_CHECKLIST.md` |
| Absence d'observabilité externe | `README.md`, `documentation/02-SAR/15-Deploiement.md` |
| Render et Neon | `README.md`, `documentation/02-SAR/15-Deploiement.md` |

## 9. Observations techniques

### 9.1 Mécanismes présents

- endpoint de santé backend public ;
- endpoint de santé frontend qui relaie le backend ;
- healthcheck PostgreSQL par `pg_isready` ;
- healthchecks Docker frontend et backend ;
- séquencement Compose selon la santé ;
- états de conteneurs Docker ;
- consultation des sorties de conteneurs ;
- journaux NestJS et console ;
- statut des migrations Prisma ;
- validation automatisée de la connexion frontend/backend ;
- checklists fonctionnelles manuelles.

### 9.2 Mécanismes absents

- export de métriques techniques ;
- endpoint Prometheus ;
- serveur Prometheus ;
- tableau de bord Grafana ;
- configuration Sentry ;
- configuration Datadog ;
- instrumentation OpenTelemetry du projet ;
- tracing distribué ;
- corrélation de requêtes par identifiant configuré ;
- agrégateur de logs ;
- alertes d'infrastructure ;
- notifications d'incident ;
- sonde d'uptime externe ;
- objectifs ou indicateurs SLI/SLO versionnés ;
- seuils d'alerte ;
- rétention des logs ;
- supervision Render ;
- supervision Neon ;
- healthcheck Cloudinary ;
- healthcheck Chromium ;
- tableau de bord opérationnel.

La présence d'une dépendance transitive dans `pnpm-lock.yaml` ne constitue pas une instrumentation ou une configuration de monitoring.

### 9.3 Limitations constatées

- Le healthcheck backend ne vérifie aucune dépendance.
- Le healthcheck frontend dépend du healthcheck backend et ne représente pas un état frontend indépendant.
- `prisma:status` est une commande ponctuelle, pas une sonde continue.
- Les logs ne sont ni centralisés ni persistés par une configuration du projet.
- Le projet ne définit ni rotation ni durée de conservation des logs.
- Les tests utilisent une base dédiée et ne surveillent pas une base déployée.
- Les métriques RH du tableau de bord applicatif ne sont pas des métriques d'infrastructure.
- Les états Docker ne couvrent que les services exécutés par Compose.
- Les services Render et Neon ne sont pas matérialisés par des fichiers de plateforme.

### 9.4 Comportements observés

- PostgreSQL doit être sain avant le démarrage du backend.
- Le backend doit être sain avant le démarrage du frontend.
- Les trois services Compose utilisent `restart: unless-stopped`.
- Le proxy frontend renvoie une erreur lorsque le backend est injoignable.
- Le timestamp du healthcheck backend est généré à chaque requête.
- Le test de proxy interroge les endpoints toutes les 500 millisecondes pendant ses fenêtres d'attente.
- Le test de proxy conserve au maximum 80 lignes récentes par processus.
- Les actions administratives sont journalisées en JSON au niveau `warn`.
- Les blocages de la borne par limitation de débit sont journalisés au niveau `warn`.
- Les échecs Cloudinary et PDF sont journalisés au niveau `error`.
- Le détail de configuration de sécurité au démarrage n'est journalisé qu'hors production.
