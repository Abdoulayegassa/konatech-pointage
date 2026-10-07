# Bonnes pratiques

| Métadonnée | Valeur |
| --- | --- |
| Document ID | IG-010 |
| Titre | Bonnes pratiques |
| Version | 1.0 |
| Statut | Validé |
| Classification | Interne |
| Référence | Installation Guide |

## 1. Présentation

### 1.1 Objectif

Ce chapitre consigne les pratiques d'installation, de configuration, de
données, de démarrage et de maintenance déjà matérialisées dans Konatech
Pointage. Il décrit des conventions observables dans l'arborescence, les
configurations, les scripts et la documentation.

### 1.2 Portée

Le périmètre couvre :

- l'organisation du monorepo ;
- la séparation du frontend et du backend ;
- la gestion pnpm des dépendances ;
- les fichiers d'environnement et leur validation ;
- Prisma et PostgreSQL ;
- les modes de lancement et Docker Compose ;
- les contrôles statiques, les tests et les procédures de maintenance ;
- la documentation technique versionnée.

Ce chapitre ne définit pas de règle de développement supplémentaire.

## 2. Organisation du dépôt

### 2.1 Structure observée

| Zone | Contenu et convention observés | Références |
| --- | --- | --- |
| Racine | Orchestration du workspace, scripts communs et configurations transverses | `package.json`, `pnpm-workspace.yaml`, `eslint.config.mjs` |
| `apps/backend` | API NestJS, Prisma, scripts de données et tests e2e | `apps/backend/package.json`, `apps/backend/src`, `apps/backend/prisma`, `apps/backend/test` |
| `apps/frontend` | Application Next.js, routes App Router, composants et bibliothèques clientes/serveur | `apps/frontend/package.json`, `apps/frontend/app`, `apps/frontend/components`, `apps/frontend/lib` |
| `docker` | Dockerfiles de production distincts pour les deux applications | `docker/backend.Dockerfile`, `docker/frontend.Dockerfile` |
| `scripts` | Coordination locale, test proxy et nettoyage Windows | `scripts/dev.mjs`, `scripts/validate-proxy.mjs`, `scripts/clean-windows.ps1` |
| `docs` | Architecture, état, registre de modules et checklist de release | `docs/ARCHITECTURE.md`, `docs/PROJECT_STATE.md`, `docs/MODULE_REGISTRY.md`, `docs/RELEASE_CHECKLIST.md` |
| `documentation` | Documentation structurée par référentiel et guide | `documentation/02-SAR`, `documentation/03-SMOD`, `documentation/04-UAG`, `documentation/05-Installation-Guide` |

### 2.2 Monorepo pnpm

Le workspace inclut `apps/*`. La racine :

- est privée ;
- déclare le gestionnaire `pnpm@10.26.0` ;
- impose une plage Node.js et une version minimale de pnpm ;
- utilise un lockfile unique ;
- centralise les scripts qui appellent chaque application avec `pnpm --dir` ;
- déclare les dépendances autorisées à exécuter leurs scripts de build ;
- fixe plusieurs versions transitives par `overrides`.

Références :
`package.json`,
`pnpm-workspace.yaml`,
`pnpm-lock.yaml`.

### 2.3 Séparation frontend/backend

Le backend et le frontend possèdent chacun :

- leur propre manifeste ;
- leur configuration TypeScript ;
- leurs commandes `dev`, `build`, `start` et `typecheck` adaptées à leur
  framework ;
- leur répertoire source ;
- leur Dockerfile.

La racine fournit les scripts ciblés `dev:backend`, `dev:frontend`,
`build:backend`, `build:frontend`, `typecheck:backend` et
`typecheck:frontend`.

Références :
`package.json`,
`apps/backend/package.json`,
`apps/frontend/package.json`.

### 2.4 Organisation backend

Le backend sépare :

| Zone | Rôle observable |
| --- | --- |
| `src/modules` | Modules fonctionnels NestJS |
| `src/common/prisma` | Module, service et sélections Prisma partagés |
| `src/common/security` | Garde de limitation, utilitaires JWT et mots de passe |
| `src/common/validation` | Validation partagée du PIN |
| `src/common/utils` | Calculs de dates, sorties et instantanés de planning |
| `prisma` | Schéma, configuration, migrations et seed |
| `scripts` | Création initiale et reprises de données |
| `test` | Configuration et suites end-to-end |

Les modules fonctionnels suivent la composition NestJS observable :
`*.module.ts`, `*.controller.ts`, `*.service.ts` et, lorsqu'ils reçoivent des
entrées, des répertoires `dto`.

Références :
`apps/backend/src/app.module.ts`,
`apps/backend/src/modules`,
`apps/backend/src/common`.

### 2.5 Organisation frontend

Le frontend utilise l'App Router sous `apps/frontend/app`. Les zones
observées sont :

| Zone | Rôle observable |
| --- | --- |
| `app` | Pages, layouts et segments de routes |
| `app/api` | Routes serveur qui relaient les appels backend |
| `components/ui` | Composants d'interface génériques |
| `components/<domaine>` | Composants regroupés par fonctionnalité |
| `lib` | API, session et utilitaires transverses |
| `types` | Déclarations de types complémentaires |
| `public` | Ressources statiques |

Le chemin TypeScript `@/*` pointe vers la racine de l'application frontend.

Références :
`apps/frontend/tsconfig.json`,
`apps/frontend/app`,
`apps/frontend/components`,
`apps/frontend/lib`.

### 2.6 Documentation et scripts

Le README centralise le Quick Start, les variables, les commandes, les tests,
Docker Compose, la validation, Prisma et le dépannage. Les documents
d'architecture et de release sont séparés sous `docs`. Le présent guide est
découpé en chapitres numérotés sous
`documentation/05-Installation-Guide`.

Les commandes communes sont exposées dans `package.json` plutôt que répétées
comme commandes longues dans chaque procédure.

Références :
`README.md`,
`docs`,
`documentation/05-Installation-Guide`,
`package.json`.

### 2.7 Conventions de fichiers

| Configuration | Convention appliquée |
| --- | --- |
| `.editorconfig` | UTF-8, LF, indentation de deux espaces, nouvelle ligne finale |
| `.prettierrc.json` | Guillemets simples, virgules finales, largeur 80, points-virgules |
| `eslint.config.mjs` | Règles JavaScript/TypeScript, règles Next.js et exclusions des artefacts |
| `.gitignore` | Exclusion des dépendances, builds, caches, logs, environnements et sauvegardes |
| `.dockerignore` | Exclusion des éléments non nécessaires aux contextes de build |

Les migrations SQL constituent une exception explicite à l'exclusion générale
des fichiers `*.sql` dans `.gitignore`.

## 3. Gestion de la configuration

### 3.1 Fichiers d'exemple et fichiers locaux

La pratique observée sépare les exemples suivis des configurations locales :

| Usage | Exemple versionné | Cible locale ou de production |
| --- | --- | --- |
| Backend local | `apps/backend/.env.example` | `apps/backend/.env` |
| Frontend local | `apps/frontend/.env.example` | `apps/frontend/.env.local` |
| Docker Compose production | `.env.production.example` | `.env.production` |

Les cibles sont ignorées par Git. Le README fournit les commandes de copie et
ne demande pas de modifier les exemples suivis comme fichiers d'exécution.

Références :
`README.md`,
`.gitignore`.

### 3.2 Chargement backend

Le backend construit cet ordre :

1. `.env.<NODE_ENV>.local` ;
2. `.env.<NODE_ENV>` ;
3. `.env.local` ;
4. `.env`.

`ConfigModule` est global. Un schéma Joi :

- déclare les valeurs obligatoires ;
- fournit les valeurs par défaut observées ;
- transforme les nombres et booléens ;
- borne les paramètres numériques ;
- contrôle la cohérence GPS ;
- exige ensemble les trois identifiants Cloudinary lorsqu'un est fourni ;
- applique des règles supplémentaires aux URL et au secret en production.

Référence :
`apps/backend/src/app.module.ts`.

### 3.3 Configuration frontend

Le frontend distingue :

- `NEXT_PUBLIC_APP_URL`, publique ;
- `NEXT_PUBLIC_API_BASE_URL`, publique ;
- `API_BASE_URL`, utilisée par les appels serveur ;
- `NODE_ENV`, fourni par l'environnement d'exécution.

Le code centralise la normalisation et la validation des URL dans
`apps/frontend/lib/api.ts`. En production, les URL publiques requises sont
validées, tout comme HTTPS, les hôtes interdits et le suffixe `/api/v1` des
URL d'API.

Référence :
`apps/frontend/lib/api.ts`.

### 3.4 Configuration Prisma

`prisma.config.ts` centralise :

- le chemin du schéma ;
- le chemin des migrations ;
- la commande de seed ;
- la lecture de `DATABASE_URL`.

Le datasource de `schema.prisma` lit la même variable et fixe le provider
`postgresql`.

Références :
`apps/backend/prisma.config.ts`,
`apps/backend/prisma/schema.prisma`.

### 3.5 Gestion des dépendances

Les pratiques observées sont :

| Pratique | Matérialisation |
| --- | --- |
| Gestionnaire unique | Champ `packageManager` racine |
| Workspace explicite | `pnpm-workspace.yaml` |
| Verrouillage | `pnpm-lock.yaml` |
| Installation Docker reproductible | `pnpm install --frozen-lockfile` |
| Versions d'exécution | `engines` et `.nvmrc` |
| Dépendances séparées | Manifeste racine et manifests des applications |
| Corrections transitives | Bloc `overrides` du workspace |

Références :
`package.json`,
`pnpm-workspace.yaml`,
`pnpm-lock.yaml`,
`.nvmrc`,
`docker/backend.Dockerfile`,
`docker/frontend.Dockerfile`.

### 3.6 Artefacts et secrets exclus

`.gitignore` exclut notamment :

- `node_modules` et le store pnpm ;
- `.next`, `dist`, `build` et la couverture ;
- les logs ;
- les variantes locales des fichiers d'environnement ;
- les sauvegardes et dumps ;
- la base Prisma locale SQLite, même si le schéma actif utilise PostgreSQL.

Les migrations SQL Prisma restent suivies par une règle de réinclusion.

Référence :
`.gitignore`.

## 4. Gestion de la base de données

### 4.1 Schéma centralisé

Le modèle de données courant est défini dans un unique
`apps/backend/prisma/schema.prisma`. Il contient le generator, le datasource,
les énumérations, les cinq modèles, les relations, les contraintes et les
index.

Référence :
`apps/backend/prisma/schema.prisma`.

### 4.2 Migrations versionnées

Les évolutions sont stockées sous forme de répertoires horodatés, chacun avec
un `migration.sql`. Vingt migrations sont présentes. Leur nom associe un
horodatage à une description en snake case.

Les commandes distinguent :

| Contexte | Script |
| --- | --- |
| Développement | `pnpm prisma:migrate` |
| Déploiement d'un historique existant | `pnpm prisma:migrate:deploy` |
| Inspection sans modification | `pnpm prisma:status` |

Références :
`apps/backend/prisma/migrations`,
`package.json`,
`apps/backend/package.json`.

### 4.3 Génération explicite

Prisma Client est généré par :

```bash
pnpm prisma:generate
```

La génération est aussi incluse dans `validate`, `validate:backend`, le build
Docker backend et le nettoyage Windows avec l'option Prisma. Aucun
`postinstall` ne la déclenche automatiquement.

Références :
`package.json`,
`docker/backend.Dockerfile`,
`scripts/clean-windows.ps1`.

### 4.4 Seed réutilisable

Le seed :

- exporte une fonction `seedDatabase` utilisable par les tests ;
- fournit une exécution autonome avec Prisma Client ;
- utilise des `upsert` pour les plannings, employés et pointages ;
- recherche puis met à jour ou crée les règles de sanction ;
- ferme Prisma Client en fin d'exécution ;
- retourne et journalise un bilan.

Références :
`apps/backend/prisma/seed.ts`,
`apps/backend/prisma.config.ts`.

### 4.5 Base de test distincte

Les tests chargent `.env.test.local`, puis `.env.test`, et résolvent une URL
de test. Les suites qui appellent `prepareTestDatabase` recréent la base cible,
appliquent `migrate deploy` et exécutent le seed avec une date fixe.

Le README précise que la base de test ne doit pas être la base de
développement.

Références :
`apps/backend/test/test-environment.ts`,
`apps/backend/test/test-database.ts`,
`README.md`.

### 4.6 Reprises de données séparées

Deux scripts de maintenance sont distincts des migrations SQL :

| Script | Données traitées |
| --- | --- |
| `pins:backfill` | Hash des anciens PIN employés |
| `snapshots:backfill` | Instantanés de planning manquants dans les pointages |

Références :
`apps/backend/package.json`,
`apps/backend/scripts/backfill-employee-pin-code-hashes.ts`,
`apps/backend/scripts/backfill-attendance-schedule-snapshots.ts`.

### 4.7 PostgreSQL sous Compose

Le service PostgreSQL :

- utilise une image versionnée ;
- conserve les données dans un volume nommé ;
- dispose d'un healthcheck `pg_isready` ;
- fournit l'URL interne du backend à partir des variables Compose.

Le backend dépend de l'état sain de PostgreSQL et exécute
`prisma migrate deploy` avant NestJS dans son image.

Références :
`docker-compose.yml`,
`docker/backend.Dockerfile`.

## 5. Gestion du démarrage

### 5.1 Installation

Le Quick Start sépare explicitement :

1. `pnpm install` ;
2. la copie des fichiers d'environnement ;
3. `pnpm db:up` ;
4. les commandes Prisma ;
5. `pnpm dev`.

Le dépôt ne contient pas de script unique qui fusionne l'installation, la
configuration, les migrations, le seed et le démarrage.

Référence :
`README.md`.

### 5.2 Builds ciblés et complet

| Script | Portée |
| --- | --- |
| `pnpm build:backend` | NestJS |
| `pnpm build:frontend` | Next.js |
| `pnpm build` | Backend, puis frontend |
| `pnpm check` | Lint, typecheck, puis build complet |

Les applications exposent également leur propre script `build`.

Références :
`package.json`,
`apps/backend/package.json`,
`apps/frontend/package.json`.

### 5.3 Développement

`pnpm dev` appelle `scripts/dev.mjs`. Le script :

- lance NestJS en watch ;
- lance Next.js en développement ;
- utilise les répertoires de travail propres à chaque application ;
- transmet les sorties au terminal ;
- propage l'arrêt aux processus enfants.

Les scripts `dev:backend` et `dev:frontend` permettent le lancement séparé.

Références :
`package.json`,
`scripts/dev.mjs`.

### 5.4 Production hors Docker

Chaque application possède un script `start` :

- le backend exécute `node dist/main.js` ;
- le frontend exécute `next start`.

La racine ne possède pas de script `start` commun. L'orchestration de
production versionnée est Docker Compose.

Références :
`apps/backend/package.json`,
`apps/frontend/package.json`,
`docker-compose.yml`.

### 5.5 Orchestration Docker

Compose sépare :

- PostgreSQL, service par défaut pour le développement local ;
- le backend et le frontend, placés dans le profil `app`.

L'ordre appliqué est :

```text
PostgreSQL sain
       |
       v
Backend sain après migrations
       |
       v
Frontend sain via le proxy API
```

Chaque service possède un healthcheck et la pile utilise
`restart: unless-stopped`.

Référence :
`docker-compose.yml`.

### 5.6 Vérifications de démarrage

Les contrôles exposés sont :

| Contrôle | Mécanisme |
| --- | --- |
| État des conteneurs | `pnpm db:status` ou `docker compose ... ps` |
| Santé backend | `GET /api/v1/health` |
| Santé via frontend | `GET /api/health` |
| État des migrations | `pnpm prisma:status` |
| Raccordement temporaire | `pnpm test:proxy` |
| Validation complète | `pnpm validate` |
| Journaux Compose | `docker compose ... logs -f` |

Références :
`package.json`,
`apps/backend/src/modules/health/health.controller.ts`,
`apps/frontend/app/api/health/route.ts`,
`scripts/validate-proxy.mjs`,
`README.md`.

## 6. Maintenance

### 6.1 Scripts de qualité

| Domaine | Scripts réellement présents |
| --- | --- |
| Formatage | `format`, `format:check` |
| Lint | `lint`, `lint:fix` |
| Types | `typecheck`, `typecheck:backend`, `typecheck:frontend` |
| Build | `build`, `build:backend`, `build:frontend` |
| Tests | `test`, `test:backend`, `test:proxy` |
| Validation | `check`, `validate`, `validate:backend`, `validate:frontend` |

Référence :
`package.json`.

### 6.2 Chaîne de validation

`pnpm validate` enchaîne :

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

Le lint Next.js intégré au build est désactivé. Le contrôle ESLint reste une
étape explicite de la validation racine.

Références :
`package.json`,
`apps/frontend/next.config.ts`,
`README.md`.

### 6.3 Tests backend

Jest recherche les fichiers `*.e2e-spec.ts`. Le setup applique
l'environnement de test. Les suites couvrent notamment l'application, le
calendrier, les absences, les jours non ouvrés, les sanctions, la validation
d'environnement et le rendu PDF Puppeteer.

Références :
`apps/backend/test/jest-e2e.json`,
`apps/backend/test`.

### 6.4 Test de raccordement

`test:proxy` :

- choisit des ports locaux disponibles ;
- démarre le backend et le frontend ;
- attend leurs endpoints ;
- vérifie le payload de santé direct et proxifié ;
- contrôle la redirection du point d'entrée ;
- vérifie l'alignement des URL publiques ;
- arrête les processus en fin de test ;
- restitue les sorties récentes en cas d'échec.

Référence :
`scripts/validate-proxy.mjs`.

### 6.5 Nettoyage Windows

Le script PowerShell limite son action aux artefacts du dépôt et aux ports de
développement connus. Ses variantes peuvent :

- supprimer `dist`, `.next` et les fichiers `*.tsbuildinfo` ;
- arrêter les serveurs locaux identifiés ;
- régénérer Prisma Client.

Il ne supprime ni les sources, ni les migrations, ni la base.

Références :
`scripts/clean-windows.ps1`,
`package.json`,
`README.md`.

### 6.6 Documentation de maintenance

Les sources documentaires observées comprennent :

| Document | Rôle observable |
| --- | --- |
| `README.md` | Installation, exploitation locale, commandes et dépannage |
| `TESTING_CHECKLIST.md` | Contrôles de test |
| `docs/RELEASE_CHECKLIST.md` | Contrôles de release |
| `docs/ARCHITECTURE.md` | Architecture du dépôt |
| `docs/MODULE_REGISTRY.md` | Registre des modules |
| `docs/PROJECT_STATE.md` | État du projet |
| `documentation/03-SMOD` | Maintenance et exploitation |
| `documentation/05-Installation-Guide` | Installation structurée |

### 6.7 Artefacts générés

Les artefacts `dist`, `.next`, `coverage`, `*.tsbuildinfo` et les logs sont
ignorés par Git. ESLint ignore également les dépendances, les builds, la
couverture, le lockfile et les migrations SQL générées/versionnées.

Références :
`.gitignore`,
`eslint.config.mjs`.

## 7. Traçabilité

### 7.1 Organisation

| Pratique | Fichiers concernés |
| --- | --- |
| Monorepo et applications | `pnpm-workspace.yaml`, `package.json`, `apps/backend/package.json`, `apps/frontend/package.json` |
| Architecture backend modulaire | `apps/backend/src/app.module.ts`, `apps/backend/src/modules` |
| App Router et routes serveur frontend | `apps/frontend/app`, `apps/frontend/app/api` |
| Composants frontend par domaine | `apps/frontend/components` |
| Utilitaires et services partagés backend | `apps/backend/src/common` |
| Scripts transverses | `scripts`, `package.json` |
| Documentation structurée | `README.md`, `docs`, `documentation` |

### 7.2 Configuration et dépendances

| Pratique | Fichiers concernés |
| --- | --- |
| Exemples d'environnement | `apps/backend/.env.example`, `apps/frontend/.env.example`, `.env.production.example` |
| Exclusion des environnements réels | `.gitignore` |
| Validation backend | `apps/backend/src/app.module.ts` |
| Validation frontend | `apps/frontend/lib/api.ts` |
| Verrouillage pnpm | `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` |
| Version Node.js | `package.json`, `.nvmrc` |
| Formatage et lint | `.editorconfig`, `.prettierrc.json`, `eslint.config.mjs` |

### 7.3 Base et démarrage

| Pratique | Fichiers concernés |
| --- | --- |
| Schéma et provider PostgreSQL | `apps/backend/prisma/schema.prisma` |
| Chemins et seed Prisma | `apps/backend/prisma.config.ts` |
| Historique SQL | `apps/backend/prisma/migrations` |
| Jeu initial | `apps/backend/prisma/seed.ts` |
| Base e2e isolée | `apps/backend/test/test-environment.ts`, `apps/backend/test/test-database.ts` |
| Démarrage local coordonné | `scripts/dev.mjs` |
| Images applicatives | `docker/backend.Dockerfile`, `docker/frontend.Dockerfile` |
| Ordre et healthchecks | `docker-compose.yml` |

### 7.4 Maintenance et validation

| Pratique | Fichiers concernés |
| --- | --- |
| Scripts de contrôle | `package.json` |
| Tests backend | `apps/backend/test/jest-e2e.json`, fichiers `*.e2e-spec.ts` |
| Contrôle frontend/backend | `scripts/validate-proxy.mjs` |
| Santé backend | `apps/backend/src/modules/health/health.controller.ts` |
| Santé frontend | `apps/frontend/app/api/health/route.ts` |
| Nettoyage Windows | `scripts/clean-windows.ps1` |
| Procédures validées | `README.md`, `TESTING_CHECKLIST.md`, `docs/RELEASE_CHECKLIST.md` |

## 8. Observations

### 8.1 Conventions observées

- Le code et les identifiants techniques sont en anglais.
- Les applications sont privées et gérées dans un workspace unique.
- TypeScript est configuré en mode strict pour le frontend et le backend.
- Le backend est organisé par modules fonctionnels et services communs.
- Le frontend associe App Router, routes serveur, composants de domaine et
  composants UI.
- Les fichiers d'environnement réels sont exclus, tandis que leurs exemples
  sont suivis.
- Les migrations SQL Prisma sont suivies malgré l'exclusion générale des
  fichiers SQL.
- Les scripts racine offrent des variantes globales et ciblées.
- Les vérifications séparent formatage, types, lint, builds, tests et
  raccordement.

### 8.2 Particularités du dépôt

- `pnpm dev` démarre les applications, mais pas PostgreSQL.
- `pnpm db:up` démarre PostgreSQL, mais pas les services du profil `app`.
- Prisma Client est généré explicitement.
- Le backend Docker applique les migrations avant son démarrage.
- Le seed n'est pas exécuté automatiquement par le démarrage Docker.
- Le healthcheck backend ne consulte pas explicitement PostgreSQL.
- La route frontend de santé traverse le raccordement serveur vers le
  backend.
- Le build Next.js ignore le lint intégré ; `pnpm lint` est séparé.
- Les tests frontend autonomes ne sont pas déclarés ; `test:proxy` vérifie le
  raccordement.
- Les commandes de nettoyage propres à Windows sont isolées dans un script
  PowerShell.

### 8.3 Dépendances

- L'installation dépend de Node.js et pnpm dans les plages déclarées.
- Les opérations Prisma et les tests concernés dépendent de PostgreSQL.
- Docker Compose dépend des images PostgreSQL et Node.js utilisées par les
  Dockerfiles.
- Le build Docker dépend du lockfile et emploie son mode figé.
- Le rendu PDF du backend conteneurisé dépend de Chromium installé dans
  l'image.
- Le stockage des preuves historiques dépend conditionnellement de
  Cloudinary.
- La validation complète dépend d'une configuration locale cohérente, de la
  base de test et de ports temporaires disponibles.

### 8.4 Mécanismes non présents

Les conventions du dépôt ne comprennent pas :

- de script racine `start` de production hors Docker ;
- de script `postinstall` pour Prisma ;
- de script `migrate reset` ou `db push` ;
- de tests frontend autonomes ;
- de pipeline CI/CD versionné ;
- de manifeste Render, Kubernetes, Helm ou Terraform ;
- de gestionnaire de processus hors Docker ;
- de centralisation des logs ;
- de healthcheck backend incluant une requête à la base.
