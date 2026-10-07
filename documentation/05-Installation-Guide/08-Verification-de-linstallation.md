# Vérification de l'installation

| Métadonnée | Valeur |
| --- | --- |
| Document ID | IG-008 |
| Titre | Vérification de l'installation |
| Version | 1.0 |
| Statut | Validé |
| Classification | Interne |
| Référence | Installation Guide |

## 1. Présentation

### 1.1 Objectif

Ce chapitre décrit les contrôles réellement disponibles pour confirmer
l'installation des dépendances, la construction et le démarrage des
applications, le raccordement frontend/backend, ainsi que l'accès à
PostgreSQL par Prisma.

### 1.2 Portée

Les mécanismes couverts sont :

- les scripts pnpm de formatage, typecheck, lint, build et validation ;
- les tests end-to-end du backend ;
- le test de raccordement frontend/backend ;
- les endpoints et healthchecks ;
- les commandes Docker Compose ;
- les commandes Prisma ;
- les sorties de démarrage et les journaux Compose.

Le document distingue les vérifications statiques, les contrôles nécessitant
une base et les sondes exécutées sur des services démarrés.

Références :
`package.json`,
`README.md`,
`docker-compose.yml`.

## 2. Vérification des dépendances

### 2.1 Installation du workspace

La commande d'installation documentée est :

```bash
pnpm install
```

Le workspace couvre `apps/*` et possède un lockfile unique
`pnpm-lock.yaml`. La réussite de la commande confirme que pnpm a résolu et
installé les dépendances déclarées du monorepo.

Les builds Docker emploient :

```bash
pnpm install --frozen-lockfile
```

Cette forme vérifie que l'installation des images correspond au lockfile
versionné.

Références :
`README.md`,
`pnpm-workspace.yaml`,
`pnpm-lock.yaml`,
`docker/backend.Dockerfile`,
`docker/frontend.Dockerfile`.

### 2.2 Versions déclarées

Le manifeste racine déclare :

| Élément | Contrainte observée |
| --- | --- |
| Node.js | `>=20.9.0 <23` |
| pnpm | `>=10.0.0` |
| Gestionnaire déclaré | `pnpm@10.26.0` |

Le dépôt contient également `.nvmrc`. Aucun script `doctor` ou script
autonome de vérification des outils système n'est défini.

Références :
`package.json`,
`.nvmrc`.

### 2.3 Contrôles statiques

| Commande | Contrôle effectué |
| --- | --- |
| `pnpm format:check` | Vérifie le formatage Prettier sans écrire |
| `pnpm typecheck` | Exécute les typechecks backend puis frontend |
| `pnpm typecheck:backend` | Vérifie TypeScript avec le `tsconfig` backend |
| `pnpm typecheck:frontend` | Vérifie TypeScript côté frontend |
| `pnpm lint` | Exécute ESLint sur le workspace |
| `pnpm build` | Construit le backend puis le frontend |
| `pnpm check` | Enchaîne lint, typecheck et build |

Ces commandes utilisent les exécutables installés dans le dépôt. Leur
réussite constitue un contrôle indirect de la présence des dépendances
requises pour chaque étape.

Référence :
`package.json`.

### 2.4 Génération Prisma

```bash
pnpm prisma:generate
```

Cette commande vérifie la disponibilité du CLI Prisma, le chargement de la
configuration, la lecture de `schema.prisma` et la génération de Prisma
Client.

Références :
`package.json`,
`apps/backend/prisma.config.ts`,
`apps/backend/prisma/schema.prisma`.

### 2.5 Chaînes de validation

| Commande | Enchaînement réel |
| --- | --- |
| `pnpm validate:backend` | Prisma generate, typecheck backend, tests backend, build backend |
| `pnpm validate:frontend` | Typecheck frontend, build frontend, test proxy |
| `pnpm validate` | Formatage, Prisma generate, typechecks, lint, tests backend, build frontend, build backend, test proxy |

La validation complète ne se limite pas aux dépendances : elle exige aussi
les configurations nécessaires, PostgreSQL pour les suites qui préparent la
base et des ports locaux disponibles pour le test proxy.

Référence :
`package.json`.

### 2.6 Mécanismes absents

Le dépôt ne définit aucun script nommé :

- `doctor` ;
- `install:check` ;
- `dependency:check` ;
- `audit` ;
- `verify:dependencies`.

Il n'existe donc pas de commande projet unique qui contrôle seulement les
binaires et versions système sans lancer d'autres étapes.

## 3. Vérification du Backend

### 3.1 Tableau des contrôles

| Contrôle | Commande ou cible | Résultat observable | Références |
| --- | --- | --- | --- |
| Démarrage développement | `pnpm dev:backend` | NestJS démarre en watch ou affiche l'erreur de démarrage | `package.json`, `apps/backend/src/main.ts` |
| Build | `pnpm build:backend` | Produit l'artefact NestJS ou termine en erreur | `package.json`, `apps/backend/package.json` |
| TypeScript | `pnpm typecheck:backend` | Vérifie le projet sans émission | mêmes manifests |
| Tests | `pnpm test:backend` | Exécute les fichiers `*.e2e-spec.ts` avec Jest | `package.json`, `apps/backend/test/jest-e2e.json` |
| Santé API | `GET /api/v1/health` | Retourne le payload de santé public | `apps/backend/src/main.ts`, `apps/backend/src/modules/health/health.controller.ts` |
| Santé Docker | Healthcheck du service `backend` | Effectue un `fetch` local sur l'endpoint de santé | `docker-compose.yml` |
| Raccordement | `pnpm test:proxy` | Démarre le backend et valide son payload | `scripts/validate-proxy.mjs` |
| Journaux | Terminal ou logs Compose | Sorties NestJS, bootstrap et erreurs | `apps/backend/src/main.ts`, `README.md` |

### 3.2 Démarrage

```bash
pnpm dev:backend
```

Au démarrage, `ConfigModule` charge et valide l'environnement. Une
configuration invalide empêche la création complète de l'application. Après
l'écoute du port, le bootstrap journalise le port et le préfixe `/api/v1`.
Hors production, il journalise aussi l'état synthétique de la politique de
sécurité du pointage.

Références :
`apps/backend/src/app.module.ts`,
`apps/backend/src/main.ts`.

### 3.3 Endpoint de santé

L'endpoint est public :

```text
GET /api/v1/health
```

Il retourne :

- `status` avec la valeur `ok` ;
- `service` avec l'identifiant de l'API ;
- `timestamp` au format ISO produit à chaque appel.

Le test proxy exige `status: "ok"` et le nom de service attendu.

Références :
`apps/backend/src/modules/health/health.controller.ts`,
`scripts/validate-proxy.mjs`.

### 3.4 API

Le préfixe global du backend est `/api/v1`. Le README documente :

- l'API locale à `http://localhost:4000/api/v1` ;
- la santé locale à `http://localhost:4000/api/v1/health`.

Les suites backend vérifient de nombreux endpoints applicatifs, leurs
validations, l'authentification et les règles métier.

Références :
`apps/backend/src/main.ts`,
`README.md`,
`apps/backend/test/app.e2e-spec.ts`.

### 3.5 Tests backend

```bash
pnpm test:backend
```

Jest recherche les fichiers `*.e2e-spec.ts` sous le backend. Le fichier de
setup applique l'environnement de test. Les suites qui appellent
`prepareTestDatabase` :

1. recréent la base de test résolue ;
2. appliquent `prisma migrate deploy` ;
3. exécutent le seed avec une date fixe ;
4. lancent leurs contrôles.

Références :
`apps/backend/test/jest-e2e.json`,
`apps/backend/test/test-setup.ts`,
`apps/backend/test/test-environment.ts`,
`apps/backend/test/test-database.ts`.

### 3.6 Logs backend

En exécution locale, les sorties NestJS et `Logger.log` sont visibles dans le
terminal du processus. Avec le lanceur racine, `scripts/dev.mjs` hérite des
sorties standard.

Pour Compose, le README fournit :

```bash
docker compose --env-file .env.production logs -f backend frontend postgres
```

Références :
`apps/backend/src/main.ts`,
`scripts/dev.mjs`,
`README.md`.

## 4. Vérification du Frontend

### 4.1 Démarrage

```bash
pnpm dev:frontend
```

Le script exécute Next.js en développement. La procédure locale documente
l'interface à `http://localhost:3000`.

Références :
`package.json`,
`apps/frontend/package.json`,
`README.md`.

### 4.2 Build

```bash
pnpm build:frontend
```

La réussite de `next build` vérifie la compilation de l'application et les
contrôles intégrés à ce build. Le fichier `next.config.ts` désactive
explicitement le lint pendant le build ; `pnpm lint` reste une étape distincte
de `pnpm validate`.

Références :
`package.json`,
`apps/frontend/next.config.ts`,
`README.md`.

### 4.3 Typecheck

```bash
pnpm typecheck:frontend
```

Cette commande exécute TypeScript avec `--noEmit`. Le manifeste frontend
expose aussi son propre script `typecheck`.

Références :
`package.json`,
`apps/frontend/package.json`.

### 4.4 Accessibilité et santé proxy

La route frontend disponible est :

```text
GET /api/health
```

Elle appelle `/health` sur l'API serveur configurée, lit la réponse JSON et
retransmet le payload et le statut lorsque le backend répond correctement.
Elle permet donc de vérifier simultanément :

- le serveur Next.js ;
- la résolution de l'URL backend par le frontend ;
- l'accès HTTP au backend ;
- l'endpoint de santé NestJS.

Références :
`apps/frontend/app/api/health/route.ts`,
`apps/frontend/lib/api.ts`.

### 4.5 Erreurs observables

Lorsque l'appel serveur au backend échoue, la route utilise
`createBackendFailureResponse` avec le message de repli
« Impossible de joindre le backend. ». Lorsque le backend répond avec un
statut non réussi, la route retransmet ce statut et un message lu dans la
réponse, ou le message de repli.

Références :
`apps/frontend/app/api/health/route.ts`,
`apps/frontend/lib/api-route.ts`.

### 4.6 Test automatisé du frontend connecté

```bash
pnpm test:proxy
```

Le script :

1. réserve des ports locaux disponibles ;
2. lance le backend ;
3. attend sa santé ;
4. lance le frontend ;
5. attend `/api/health` ;
6. vérifie le payload des deux chemins ;
7. vérifie la redirection du point d'entrée public ;
8. arrête les processus temporaires.

En cas d'échec, il assemble les dernières sorties capturées des processus dans
le message d'erreur.

Référence :
`scripts/validate-proxy.mjs`.

### 4.7 Tests frontend absents

Le manifeste frontend ne contient aucun script `test`. Aucun framework de
test frontend n'est exécuté directement par un script de cette application.
Le contrôle automatisé exposé pour son raccordement est `test:proxy`.

Références :
`apps/frontend/package.json`,
`package.json`.

## 5. Vérification de PostgreSQL

### 5.1 État Docker

```bash
pnpm db:status
```

Ce script exécute `docker compose ps`. Le service PostgreSQL possède un
healthcheck `pg_isready` utilisant l'utilisateur et la base du conteneur.

Références :
`package.json`,
`docker-compose.yml`.

### 5.2 Connexion Prisma

```bash
pnpm prisma:status
```

`prisma migrate status` utilise `DATABASE_URL`, lit le répertoire de
migrations configuré et compare cet historique avec la base accessible. Cette
commande vérifie donc la connexion nécessaire au CLI et l'état des migrations.

Références :
`package.json`,
`apps/backend/prisma.config.ts`.

### 5.3 Génération Prisma

```bash
pnpm prisma:generate
```

La commande vérifie la configuration et le schéma, puis génère Prisma Client.
Elle ne prouve pas à elle seule qu'une base PostgreSQL en cours d'exécution est
joignable.

Références :
`package.json`,
`apps/backend/prisma.config.ts`,
`apps/backend/prisma/schema.prisma`.

### 5.4 Migrations

Les commandes exposées sont :

```bash
pnpm prisma:status
pnpm prisma:migrate
pnpm prisma:migrate:deploy
```

`status` inspecte, `migrate` exécute `migrate dev` et
`migrate:deploy` exécute `migrate deploy`.

Références :
`package.json`,
`apps/backend/package.json`.

### 5.5 Seed

```bash
pnpm prisma:seed
```

Le seed journalise à la fin le nombre d'employés, de plannings et de
pointages traités. Une erreur est affichée et le processus termine en échec.

Il n'existe pas de script autonome qui vérifie uniquement la présence complète
des données du seed. Les tests e2e préparés par `prepareTestDatabase`
réutilisent le seed puis interrogent ses données.

Références :
`apps/backend/prisma/seed.ts`,
`apps/backend/test/test-database.ts`,
`apps/backend/test/app.e2e-spec.ts`.

### 5.6 Base de test

La préparation e2e effectue un `$connect` explicite à PostgreSQL, recrée la
base cible, applique les migrations et charge le seed. Une erreur de connexion
produit un message demandant de démarrer PostgreSQL et de vérifier l'URL de
test.

Référence :
`apps/backend/test/test-database.ts`.

## 6. Vérification globale

### 6.1 Flux de confirmation

```text
+-----------------------------+
| Installation                |
| pnpm install                |
+---------------+-------------+
                |
                v
+-----------------------------+
| Backend                     |
| build, tests et santé API   |
+---------------+-------------+
                |
                v
+-----------------------------+
| Frontend                    |
| build et santé proxy        |
+---------------+-------------+
                |
                v
+-----------------------------+
| Base                        |
| pg_isready et Prisma status |
+---------------+-------------+
                |
                v
+-----------------------------+
| Application opérationnelle  |
| test:proxy et accès local   |
+-----------------------------+
```

Le diagramme reprend l'ordre demandé pour le contrôle documentaire. Dans
l'exécution réelle, PostgreSQL doit être disponible avant les tests backend
qui préparent leur base et avant l'accès métier du backend.

### 6.2 Séquence locale documentée

Le README fournit cette séquence :

```bash
pnpm install
pnpm db:up
pnpm prisma:generate
pnpm prisma:status
pnpm prisma:migrate
pnpm prisma:seed
pnpm check
pnpm test:backend
pnpm test:proxy
pnpm dev
```

Elle couvre l'installation, PostgreSQL, Prisma, le build, les tests, le
raccordement et le démarrage des applications.

Référence :
`README.md`.

### 6.3 Validation complète

Avant la validation, PostgreSQL et les fichiers d'environnement nécessaires
doivent être disponibles. La commande exposée est :

```bash
pnpm validate
```

Son ordre réel est :

```text
format:check
    |
    v
prisma:generate
    |
    v
typecheck
    |
    v
lint
    |
    v
test:backend
    |
    v
build:frontend
    |
    v
build:backend
    |
    v
test:proxy
```

Référence :
`package.json`.

### 6.4 Vérification après lancement local

Les cibles documentées sont :

| Composant | Cible |
| --- | --- |
| Frontend | `http://localhost:3000` |
| API backend | `http://localhost:4000/api/v1` |
| Santé backend | `http://localhost:4000/api/v1/health` |
| Santé via frontend | `http://localhost:3000/api/health` |

Référence :
`README.md`.

### 6.5 Vérification de la pile Docker

Après le lancement de la pile avec le profil `app`, le README expose :

```bash
docker compose --env-file .env.production ps
docker compose --env-file .env.production logs -f backend frontend postgres
```

Compose impose l'ordre PostgreSQL sain, backend sain, puis frontend. Les trois
services possèdent un healthcheck.

Références :
`README.md`,
`docker-compose.yml`.

## 7. Traçabilité

### 7.1 Dépendances et qualité statique

| Vérification | Fichiers concernés |
| --- | --- |
| Installation pnpm | `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml` |
| Installation Docker figée | `docker/backend.Dockerfile`, `docker/frontend.Dockerfile` |
| Versions Node.js et pnpm | `package.json`, `.nvmrc` |
| Formatage, lint, typecheck et builds | `package.json` |
| Particularité du lint Next.js | `apps/frontend/next.config.ts`, `README.md` |

### 7.2 Backend

| Vérification | Fichiers concernés |
| --- | --- |
| Démarrage et logs de bootstrap | `apps/backend/src/main.ts` |
| Validation de configuration | `apps/backend/src/app.module.ts` |
| Endpoint de santé | `apps/backend/src/modules/health/health.controller.ts`, `apps/backend/src/modules/health/health.module.ts` |
| Tests e2e | `apps/backend/test/jest-e2e.json`, fichiers `*.e2e-spec.ts` |
| Environnement de test | `apps/backend/test/test-setup.ts`, `apps/backend/test/test-environment.ts` |
| Base de test | `apps/backend/test/test-database.ts` |

### 7.3 Frontend

| Vérification | Fichiers concernés |
| --- | --- |
| Scripts dev, build et typecheck | `apps/frontend/package.json`, `package.json` |
| Route de santé proxy | `apps/frontend/app/api/health/route.ts` |
| Résolution de l'API | `apps/frontend/lib/api.ts` |
| Réponse d'échec backend | `apps/frontend/lib/api-route.ts` |
| Test de raccordement | `scripts/validate-proxy.mjs` |

### 7.4 Base et orchestration

| Vérification | Fichiers concernés |
| --- | --- |
| État Compose | `package.json`, `docker-compose.yml` |
| Healthcheck PostgreSQL | `docker-compose.yml` |
| État des migrations | `package.json`, `apps/backend/prisma.config.ts` |
| Génération du client | `package.json`, `apps/backend/prisma/schema.prisma` |
| Seed et bilan | `apps/backend/prisma/seed.ts` |
| Healthchecks applicatifs Docker | `docker-compose.yml` |
| Consultation des logs | `README.md` |

## 8. Observations

### 8.1 Particularités

- `pnpm check` couvre lint, typecheck et builds, mais pas les tests.
- `pnpm validate` ajoute le formatage, Prisma, les tests backend et le test
  proxy.
- Le build Next.js n'exécute pas le lint intégré ; le lint du workspace est
  séparé.
- `test:proxy` démarre des processus temporaires sur des ports disponibles et
  les arrête en fin de contrôle.
- En cas d'échec du test proxy, les dernières sorties capturées sont ajoutées
  au diagnostic.
- Les suites backend utilisent un environnement de test et certaines
  recréent leur base avant exécution.
- Le seed affiche son propre bilan.
- Compose vérifie les services dans leur ordre de dépendance.

### 8.2 Dépendances

- Les contrôles pnpm dépendent de l'installation des packages.
- La génération Prisma dépend de la configuration et du schéma.
- `prisma:status`, les migrations, le seed et certaines suites backend
  dépendent de PostgreSQL.
- Le test proxy dépend des configurations backend/frontend et de ports locaux
  disponibles.
- Le build frontend en production dépend des URL de production validées par
  le code.
- Les healthchecks Compose nécessitent les conteneurs correspondants.

### 8.3 Limites des contrôles

- Le healthcheck backend ne réalise aucune requête Prisma ou PostgreSQL.
- Le healthcheck backend ne vérifie ni Cloudinary ni Chromium.
- La route frontend `/api/health` vérifie le backend, mais pas directement la
  base.
- `db:status` affiche l'état Compose sans inspecter le contenu des tables.
- `prisma:generate` ne confirme pas à lui seul la connectivité PostgreSQL.
- Aucun script dédié ne vérifie exclusivement les données du seed.
- Aucun test frontend autonome n'est déclaré.
- Aucun test de navigateur end-to-end n'est configuré.
- Aucun endpoint de métriques, contrôle d'uptime externe ou système d'alerte
  n'est présent.
- Aucun rapport de couverture n'est produit par les scripts déclarés.
- Les journaux ne sont ni centralisés ni persistés par une configuration du
  dépôt.
