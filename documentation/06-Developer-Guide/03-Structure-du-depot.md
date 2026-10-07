# Developer Guide — Structure du dépôt

| Métadonnée | Valeur |
|---|---|
| Document ID | DG-003 |
| Titre | Structure du dépôt |
| Version | 1.0 |
| Statut | Validé |
| Classification | Interne |
| Référence | Developer Guide |
| Projet | Konatech Pointage |

## 1. Présentation

Ce chapitre décrit l'organisation physique et logique du dépôt Konatech Pointage. Il localise les applications, la couche Prisma, les scripts, les ressources statiques, les configurations et les ensembles documentaires réellement présents.

Le dépôt est un workspace pnpm dont les paquets applicatifs se trouvent sous `apps/*`. La racine porte les scripts transverses et les configurations communes. Le frontend et le backend conservent chacun leur manifeste et leurs configurations propres.

## 2. Vue d'ensemble

L'arborescence principale observée est la suivante :

```text
konatech-pointage/
├── .agents/
├── .codex/
├── apps/
│   ├── backend/
│   └── frontend/
├── docker/
├── docs/
│   └── governance/
├── documentation/
│   ├── 02-SAR/
│   ├── 03-SMOD/
│   ├── 04-UAG/
│   ├── 05-Installation-Guide/
│   ├── 06-Developer-Guide/
│   └── 07-Operations-Guide/
├── scripts/
├── docker-compose.yml
├── eslint.config.mjs
├── package.json
├── pnpm-lock.yaml
└── pnpm-workspace.yaml
```

`apps/backend/` contient l'API NestJS, Prisma, les scripts de données et les tests e2e. `apps/frontend/` contient l'application Next.js App Router. Les Dockerfiles sont séparés dans `docker/`, tandis que `docker-compose.yml` décrit les services PostgreSQL, backend et frontend.

## 3. Répertoires principaux

| Répertoire | Emplacement | Rôle |
|---|---|---|
| Applications | `apps/` | Contient les deux paquets déclarés par le workspace |
| Backend | `apps/backend/` | API NestJS, Prisma, tests et scripts de données |
| Sources backend | `apps/backend/src/` | Bootstrap, module racine, éléments communs et modules fonctionnels |
| Éléments communs backend | `apps/backend/src/common/` | Audit, Prisma, sécurité, temps, utilitaires et validation |
| Modules backend | `apps/backend/src/modules/` | Authentification, santé, tableau de bord, employés, calendrier, pointage, sanctions et horaires |
| Prisma | `apps/backend/prisma/` | Schéma, migrations et seed |
| Scripts backend | `apps/backend/scripts/` | Création d'administrateur et traitements de reprise de données |
| Tests backend | `apps/backend/test/` | Spécifications e2e et gestion de la base de test |
| Frontend | `apps/frontend/` | Application Next.js, configuration et ressources |
| Routes frontend | `apps/frontend/app/` | Pages App Router, layouts, erreurs, chargements et Route Handlers |
| Composants frontend | `apps/frontend/components/` | Composants React regroupés par domaine |
| Bibliothèque frontend | `apps/frontend/lib/` | Accès API, sessions, erreurs, redirections et utilitaires |
| Ressources publiques | `apps/frontend/public/` | Logos, icônes et favicon |
| Types frontend | `apps/frontend/types/` | Déclarations TypeScript complémentaires |
| Images Docker | `docker/` | Dockerfiles du backend et du frontend |
| Scripts racine | `scripts/` | Démarrage conjoint, validation du proxy et nettoyage Windows |
| Documentation structurée | `documentation/` | Documents d'architecture, exploitation, utilisation, installation et développement |
| Documents transverses | `docs/` | Architecture synthétique, état, registre, publication, audit et référence PDF |
| Gouvernance documentaire | `docs/governance/` | Audit de référence du dépôt |
| Métadonnées d'agents | `.agents/` | Répertoire présent sans fichier lors de l'analyse |
| Métadonnées Codex | `.codex/` | Répertoire présent sans fichier lors de l'analyse |

## 4. Organisation des fichiers

### 4.1 Fichiers à la racine

| Fichier | Fonction observée |
|---|---|
| `package.json` | Métadonnées Node.js, versions d'outils, scripts transverses et dépendances de développement |
| `pnpm-workspace.yaml` | Déclaration de `apps/*`, dépendances autorisées à construire et surcharges de versions |
| `pnpm-lock.yaml` | Résolutions verrouillées du workspace |
| `docker-compose.yml` | Services PostgreSQL, backend et frontend, volumes, ports et healthchecks |
| `eslint.config.mjs` | Configuration ESLint commune |
| `.prettierrc.json` | Configuration Prettier |
| `.prettierignore` | Fichiers exclus du formatage Prettier |
| `.editorconfig` | Paramètres d'édition communs |
| `.gitignore` | Fichiers et répertoires exclus de Git |
| `.dockerignore` | Fichiers exclus du contexte de build Docker |
| `.nvmrc` | Version majeure Node.js sélectionnée pour NVM |
| `.env.production.example` | Noms de variables d'exemple pour l'exécution de production |
| `README.md` | Présentation, installation, commandes et informations d'exécution |
| `AGENTS.md` | Instructions de travail associées au dépôt |
| `PROJECT_SPEC.md` | Spécification du projet présente à la racine |
| `PROJECT_PLAN.md` | Plan du projet présent à la racine |
| `CURRENT_STATUS.md` | État du projet consigné dans le dépôt |
| `CHANGELOG_DEV.md` | Historique de développement |
| `TESTING_CHECKLIST.md` | Liste de contrôles de test présente dans le dépôt |

### 4.2 Configuration backend

| Fichier | Fonction observée |
|---|---|
| `apps/backend/package.json` | Scripts et dépendances du backend |
| `apps/backend/nest-cli.json` | Configuration du build NestJS |
| `apps/backend/tsconfig.json` | Configuration TypeScript du backend |
| `apps/backend/tsconfig.build.json` | Exclusions TypeScript propres au build |
| `apps/backend/prisma.config.ts` | Chemins du schéma, des migrations et du seed, et lecture de `DATABASE_URL` |
| `apps/backend/.env.example` | Variables backend d'exemple |
| `apps/backend/.env.test` | Configuration d'environnement utilisée par les tests |
| `apps/backend/.env` | Fichier d'environnement backend présent localement |

### 4.3 Configuration frontend

| Fichier | Fonction observée |
|---|---|
| `apps/frontend/package.json` | Scripts et dépendances du frontend |
| `apps/frontend/next.config.ts` | Configuration Next.js |
| `apps/frontend/tsconfig.json` | Configuration TypeScript et alias `@/*` |
| `apps/frontend/tailwind.config.ts` | Sources analysées et thème Tailwind CSS |
| `apps/frontend/postcss.config.js` | Plugins PostCSS |
| `apps/frontend/next-env.d.ts` | Déclarations TypeScript générées pour Next.js |
| `apps/frontend/.env.example` | Variables frontend d'exemple |
| `apps/frontend/.env.local` | Fichier d'environnement frontend présent localement |

Aucune valeur issue des fichiers d'environnement locaux n'est reproduite dans ce document.

### 4.4 Configuration des conteneurs

| Fichier | Fonction observée |
|---|---|
| `docker/backend.Dockerfile` | Image multi-étapes du backend, génération Prisma, build et commande d'exécution |
| `docker/frontend.Dockerfile` | Image multi-étapes du frontend, variables de build et commande Next.js |
| `docker-compose.yml` | Assemblage des services, réseau Compose implicite, volume PostgreSQL et vérifications de santé |

Le dépôt ne contient pas de fichier `turbo.json`. Les scripts de la racine appellent directement pnpm, Node.js, NestJS, Next.js, Jest, Prisma et Docker Compose.

## 5. Répartition des responsabilités

### 5.1 Frontend

`apps/frontend/` porte l'interface web et sa couche serveur Next.js. Le répertoire `app/` associe la structure des dossiers aux routes. Son sous-répertoire `api/` contient les Route Handlers qui transmettent les requêtes vers NestJS. Les composants d'interface sont placés dans `components/` et les fonctions partagées dans `lib/`.

### 5.2 Backend

`apps/backend/src/main.ts` démarre NestJS. `apps/backend/src/app.module.ts` compose les modules et la configuration globale. Les traitements sont répartis entre `src/modules/` pour les domaines applicatifs et `src/common/` pour les services et fonctions partagés.

Les modules métier disposant de traitements regroupent leur contrôleur, leur service et leur fichier de module. `HealthModule` contient uniquement son contrôleur et son fichier de module. Les contraintes d'entrée propres aux API se trouvent dans les sous-répertoires `dto/` réellement présents.

### 5.3 Prisma

`apps/backend/prisma/schema.prisma` est la définition du modèle relationnel. `apps/backend/prisma/migrations/` contient les migrations SQL versionnées et `apps/backend/prisma/seed.ts` le chargement explicite de données. La couche d'exécution se trouve dans `apps/backend/src/common/prisma/`.

### 5.4 Configuration

La racine contient les réglages partagés du workspace, du lint, du formatage et des conteneurs. Chaque application conserve son manifeste TypeScript et ses réglages de framework. Les fichiers d'environnement sont séparés entre racine, backend et frontend selon les fichiers réellement présents.

### 5.5 Documentation

`documentation/` est réparti en six ensembles présents : SAR, SMOD, UAG, Installation Guide, Developer Guide et Operations Guide. `docs/` contient des documents transverses qui ne suivent pas cette numérotation.

## 6. Organisation des ressources

### 6.1 Ressources frontend

```text
apps/frontend/
├── app/
│   ├── api/
│   ├── attendance-entry/
│   ├── attendance-history/
│   ├── calendar/
│   ├── employees/
│   ├── exports/
│   ├── login/
│   ├── my-attendance/
│   ├── sanctions/
│   └── schedules/
├── components/
│   ├── admin/
│   ├── attendance/
│   ├── attendance-history/
│   ├── auth/
│   ├── calendar/
│   ├── dashboard/
│   ├── employees/
│   ├── layout/
│   ├── sanctions/
│   ├── schedules/
│   └── ui/
├── lib/
├── public/
└── types/
```

Les ressources statiques présentes dans `public/` sont des logos et icônes aux formats PNG, SVG et ICO. `types/qrcode.d.ts` complète les déclarations TypeScript utilisées pour le package QR Code.

### 6.2 Ressources backend

```text
apps/backend/src/
├── common/
│   ├── audit/
│   ├── prisma/
│   ├── security/
│   ├── time/
│   ├── utils/
│   └── validation/
├── modules/
│   ├── attendance/
│   │   ├── dto/
│   │   └── exports/
│   ├── auth/
│   │   ├── constants/
│   │   ├── decorators/
│   │   ├── dto/
│   │   ├── guards/
│   │   └── interfaces/
│   ├── calendar/
│   │   └── dto/
│   ├── dashboard/
│   ├── employees/
│   │   └── dto/
│   ├── health/
│   ├── sanctions/
│   │   └── dto/
│   └── schedules/
│       └── dto/
├── app.module.ts
└── main.ts
```

Les services d'export CSV et PDF sont regroupés dans `apps/backend/src/modules/attendance/exports/`. Les gardes, décorateurs et interfaces d'authentification sont placés dans les sous-répertoires correspondants de `auth/`.

### 6.3 Scripts

| Script | Emplacement | Fonction implémentée |
|---|---|---|
| Développement conjoint | `scripts/dev.mjs` | Démarre le backend et le frontend et relaie les signaux d'arrêt |
| Validation du proxy | `scripts/validate-proxy.mjs` | Démarre les applications sur des ports temporaires et vérifie leur liaison |
| Nettoyage Windows | `scripts/clean-windows.ps1` | Supprime les artefacts ciblés et traite ses options explicites |
| Création d'administrateur | `apps/backend/scripts/create-initial-admin.ts` | Crée le compte initial selon la configuration fournie |
| Reprise des empreintes PIN | `apps/backend/scripts/backfill-employee-pin-code-hashes.ts` | Complète les empreintes manquantes |
| Reprise des instantanés d'horaires | `apps/backend/scripts/backfill-attendance-schedule-snapshots.ts` | Complète les instantanés des présences existantes |

### 6.4 Schéma et migrations

Le schéma Prisma contient les modèles `Employee`, `Schedule`, `Attendance`, `CalendarEntry` et `SanctionRule`. Le répertoire `apps/backend/prisma/migrations/` contient vingt sous-répertoires de migration observés lors de l'analyse.

## 7. Diagramme de l'organisation

```text
Configuration racine
package.json + pnpm-workspace.yaml + pnpm-lock.yaml
                       |
          +------------+------------+
          |                         |
          v                         v
 apps/frontend/                apps/backend/
          |                         |
   +------+------+          +-------+-------+
   |      |      |          |       |       |
   v      v      v          v       v       v
 app/ components/ lib/     src/  prisma/  test/
   |                         |
   v                  +------+------+
 pages + API           |             |
                  common/         modules/
                       |
                       v
               PrismaService
                       |
                       v
             schema + migrations

Racine complémentaire
├── scripts/          orchestration et contrôles
├── docker/           images applicatives
├── docker-compose.yml services
├── documentation/    guides structurés
└── docs/             documents transverses
```

## 8. Traçabilité

| Élément documenté | Fichier ou répertoire source | Preuve observée |
|---|---|---|
| Entrées racine | Répertoire racine | Fichiers et répertoires listés sur le système de fichiers |
| Workspace | `pnpm-workspace.yaml` | Paquets `apps/*` |
| Scripts et outils | `package.json` | Commandes et versions déclarées |
| Verrouillage | `pnpm-lock.yaml` | Résolutions du workspace |
| Structure backend | `apps/backend/` | Répertoires `src`, `prisma`, `scripts` et `test` |
| Bootstrap backend | `apps/backend/src/main.ts` | Point d'entrée NestJS |
| Modules chargés | `apps/backend/src/app.module.ts` | Imports applicatifs |
| Ressources communes | `apps/backend/src/common/` | Six sous-répertoires spécialisés |
| Modules fonctionnels | `apps/backend/src/modules/` | Huit sous-répertoires de modules |
| Schéma et seed | `apps/backend/prisma/` | Schéma Prisma, seed et migrations |
| Configuration Prisma | `apps/backend/prisma.config.ts` | Chemins actifs et variable de connexion |
| Tests backend | `apps/backend/test/` | Spécifications e2e et utilitaires de test |
| Structure frontend | `apps/frontend/` | Répertoires `app`, `components`, `lib`, `public` et `types` |
| Routes frontend | `apps/frontend/app/` | Pages et Route Handlers présents |
| Composants frontend | `apps/frontend/components/` | Répertoires de composants par domaine |
| Ressources statiques | `apps/frontend/public/` | Images et icônes |
| Déclarations complémentaires | `apps/frontend/types/qrcode.d.ts` | Type associé au package QR Code |
| Configuration frontend | `apps/frontend/next.config.ts`, `apps/frontend/tailwind.config.ts`, `apps/frontend/postcss.config.js`, `apps/frontend/tsconfig.json` | Configurations Next.js, Tailwind, PostCSS et TypeScript |
| Conteneurs | `docker/`, `docker-compose.yml` | Deux Dockerfiles et trois services Compose |
| Scripts transverses | `scripts/` | Trois scripts présents |
| Ensembles documentaires | `documentation/` | Six sous-répertoires documentaires présents |
| Documents transverses | `docs/` | Architecture, état, registre, publication, audit et référence |
| Fichiers d'environnement | `.env.production.example`, `apps/backend/.env`, `apps/backend/.env.example`, `apps/backend/.env.test`, `apps/frontend/.env.example`, `apps/frontend/.env.local` | Fichiers réellement présents, sans reproduction de valeurs |
| Architecture générale | `documentation/06-Developer-Guide/02-Architecture-generale.md` | Relations entre les zones du dépôt |

## 9. Observations

- Le code applicatif est entièrement réparti entre `apps/backend/` et `apps/frontend/`.
- `pnpm-workspace.yaml` ne déclare aucun autre paquet que `apps/*`.
- Aucun `turbo.json` n'est présent dans le dépôt.
- Les configurations partagées restent à la racine et les configurations de framework dans leur application.
- Prisma, les scripts de données et les tests e2e sont rattachés au backend.
- Le frontend sépare les pages, les Route Handlers, les composants, les fonctions partagées et les ressources publiques.
- Le backend sépare les éléments communs des modules fonctionnels.
- Les images applicatives sont placées dans `docker/`, alors que leur assemblage est défini à la racine.
- Les scripts transverses et les scripts de données sont stockés dans deux répertoires distincts.
- Les documents structurés et les documents transverses utilisent deux racines différentes : `documentation/` et `docs/`.
- Les répertoires `.agents/` et `.codex/` sont présents et vides lors de l'analyse.
