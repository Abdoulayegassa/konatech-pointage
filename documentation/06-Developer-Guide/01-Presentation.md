# Présentation

| Métadonnée | Valeur |
| --- | --- |
| Document ID | DG-001 |
| Titre | Présentation |
| Version | 1.0 |
| Statut | Validé |
| Classification | Interne |
| Référence | Developer Guide |

## 1. Présentation

### 1.1 Objectif du guide

Le Developer Guide présente l'organisation technique observable de Konatech
Pointage et fournit aux intervenants du code une entrée structurée vers le
monorepo, ses applications, ses composants, ses configurations et sa
documentation.

Ce premier chapitre décrit le contexte général. Il ne remplace ni le guide
d'installation, ni les documents d'architecture détaillés, ni les procédures
d'exploitation déjà présentes.

### 1.2 Public cible

Le contenu s'adresse aux profils qui interviennent directement sur le dépôt :

- développeurs frontend Next.js ;
- développeurs backend NestJS ;
- développeurs full stack ;
- mainteneurs du schéma Prisma et de PostgreSQL ;
- responsables techniques utilisant les scripts de build, test et validation ;
- rédacteurs techniques maintenant les documents versionnés.

Cette liste correspond aux composants et aux activités matérialisés par le
code, les configurations et les scripts du projet.

### 1.3 Portée

Le guide couvre, dans les limites du dépôt actuel :

- le workspace pnpm ;
- l'application frontend ;
- l'API backend ;
- le modèle et les migrations Prisma ;
- PostgreSQL ;
- les scripts locaux et de validation ;
- Docker et Docker Compose ;
- les tests backend et le contrôle de raccordement ;
- les ensembles documentaires versionnés.

Références :
`README.md`,
`package.json`,
`pnpm-workspace.yaml`.

## 2. Vue d'ensemble du projet

### 2.1 Objectif du logiciel

Konatech Pointage est une application de pointage et de suivi RH. Les
capacités présentes dans le dépôt couvrent notamment :

- l'authentification ;
- le pointage d'entrée et de sortie ;
- l'historique des pointages ;
- le suivi des retards, absences, sorties anticipées et heures
  supplémentaires ;
- les employés et leurs rôles d'accès ;
- les plannings ;
- le calendrier RH ;
- les règles de sanction ;
- le tableau de bord ;
- les exports CSV et PDF ;
- le parcours de pointage par QR code et PIN ;
- la sécurité de pointage par géolocalisation ;
- la consultation des preuves photo historiques déjà enregistrées.

Références :
`README.md`,
`apps/backend/src/modules`,
`apps/frontend/app`.

### 2.2 Architecture générale

Le dépôt contient deux applications :

- un frontend Next.js qui rend les pages et expose des routes serveur sous
  `app/api` ;
- un backend NestJS qui expose l'API préfixée par `/api/v1`.

Le backend utilise Prisma Client pour accéder à PostgreSQL. Docker Compose
déclare PostgreSQL et, sous le profil `app`, les deux applications. Le
frontend appelle le backend depuis ses routes serveur et ses accès API
centralisés.

Références :
`apps/frontend/app`,
`apps/frontend/lib/api.ts`,
`apps/backend/src/main.ts`,
`apps/backend/src/common/prisma`,
`docker-compose.yml`.

### 2.3 Schéma simplifié

```text
+---------------------------+
| Navigateur                |
| pages admin / employé     |
+-------------+-------------+
              |
              v
+---------------------------+
| Frontend Next.js          |
| App Router + app/api      |
+-------------+-------------+
              |
              v
+---------------------------+
| Backend NestJS            |
| API /api/v1 + modules     |
+-------------+-------------+
              |
              v
+---------------------------+
| Prisma Client             |
| schéma + migrations       |
+-------------+-------------+
              |
              v
+---------------------------+
| PostgreSQL                |
| données de pointage/RH    |
+---------------------------+

Backend ---- appel conditionnel ----> Cloudinary
Backend ---- rendu PDF -------------> Chromium/Puppeteer
```

Cloudinary est utilisé par le service de stockage photo pour les chemins de
preuves concernés. Chromium est installé dans l'image backend pour le rendu
PDF Puppeteer. Ils ne constituent pas des applications du workspace.

Références :
`apps/backend/src/modules/attendance/attendance-photo-storage.service.ts`,
`apps/backend/src/modules/attendance/exports`,
`docker/backend.Dockerfile`.

### 2.4 Technologies utilisées

| Domaine | Technologie réellement déclarée | Sources |
| --- | --- | --- |
| Runtime | Node.js | `package.json`, `.nvmrc`, Dockerfiles |
| Workspace | pnpm | `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml` |
| Langage | TypeScript | manifests et `tsconfig.json` des applications |
| Frontend | Next.js 15, React 19, App Router | `apps/frontend/package.json`, `apps/frontend/app` |
| Styles | Tailwind CSS 3, PostCSS, Autoprefixer | `apps/frontend/package.json`, `apps/frontend/tailwind.config.ts`, `apps/frontend/postcss.config.js` |
| Backend | NestJS 11, plateforme Express | `apps/backend/package.json` |
| Validation backend | Joi, `class-validator`, `class-transformer`, `ValidationPipe` | `apps/backend/package.json`, `apps/backend/src/app.module.ts`, `apps/backend/src/main.ts` |
| Accès aux données | Prisma 6 et Prisma Client | `apps/backend/package.json`, `apps/backend/prisma` |
| Base | PostgreSQL | `apps/backend/prisma/schema.prisma`, `docker-compose.yml` |
| Tests | Jest, ts-jest, Supertest | `apps/backend/package.json`, `apps/backend/test` |
| Qualité | ESLint, Prettier, TypeScript | `eslint.config.mjs`, `.prettierrc.json`, `package.json` |
| Conteneurs | Docker et Docker Compose | `docker`, `docker-compose.yml` |
| PDF | Puppeteer et Chromium dans l'image backend | `apps/backend/package.json`, `docker/backend.Dockerfile` |
| QR code | Package `qrcode` | `apps/frontend/package.json` |

### 2.5 Organisation globale

Le workspace ne contient pas de package partagé sous un répertoire
`packages`. `pnpm-workspace.yaml` inclut uniquement `apps/*`. Les outils
transverses sont configurés à la racine, tandis que les dépendances et scripts
propres à chaque application restent dans leur manifeste.

Le code d'exécution est séparé de :

- la configuration Docker ;
- l'historique de migrations ;
- les scripts d'administration et de reprise ;
- les tests ;
- la documentation.

Références :
`pnpm-workspace.yaml`,
`package.json`,
`apps/backend/package.json`,
`apps/frontend/package.json`.

## 3. Organisation de la documentation

### 3.1 Ensembles documentaires

| Ensemble | Contenu réellement présent | Rôle observable |
| --- | --- | --- |
| `README.md` | Stack, structure, installation, environnement, commandes, tests, Docker, validation et dépannage | Point d'entrée opérationnel du dépôt |
| `PROJECT_SPEC.md` | Modules produit, architecture technique, livraison initiale et sécurité | Spécification et périmètre produit |
| `PROJECT_PLAN.md` | Vision, utilisateurs, fonctionnalités, stack, principes et phases | Plan de projet |
| `CURRENT_STATUS.md` | Éléments implémentés, validés, problèmes et phase suivante | État courant synthétique |
| `CHANGELOG_DEV.md` | Entrées de changement et gabarit d'entrée | Historique de développement |
| `TESTING_CHECKLIST.md` | Commandes, contrôles backend/frontend, connexion et tests manuels | Checklist de test |
| `docs/ARCHITECTURE.md` | Structure et sources de vérité par domaine, flux et rendu PDF | Architecture technique ciblée |
| `docs/MODULE_REGISTRY.md` | Registre des modules | Inventaire technique des modules |
| `docs/PROJECT_STATE.md` | Baseline, stack, modules, données, API, tests et déploiement | État vérifié détaillé |
| `docs/RELEASE_CHECKLIST.md` | Packaging, Prisma, validation, PDF, smoke checks et déploiement | Checklist de release |
| `docs/governance` | Audit de baseline du dépôt | Documentation de gouvernance |
| `documentation/02-SAR` | Chapitres présents sur les modules, données, API, frontend, sécurité, déploiement et qualité | Software Architecture Reference |
| `documentation/03-SMOD` | Installation, exploitation, maintenance, runbooks, sauvegarde, surveillance, incidents, mises à jour et reprise | Software Maintenance & Operations Document |
| `documentation/04-UAG` | Présentation et parcours d'administration | User Administration Guide |
| `documentation/05-Installation-Guide` | Présentation, prérequis, dépendances, configuration, données, lancement, vérification et dépannage | Installation Guide |
| `documentation/06-Developer-Guide` | Developer Guide initié par ce chapitre | Documentation destinée aux développeurs |

### 3.2 Particularités de l'ensemble `docs`

`docs` contient également :

- `docs/audit-parties-1-a-4-17.md`, un document d'audit ;
- `docs/hr-report-reference.pdf`, une référence PDF ;
- `docs/governance/repository-baseline-audit.md`, l'audit de baseline.

Ces fichiers sont distincts des guides numérotés sous `documentation`.

### 3.3 Numérotation observée

Les ensembles `03-SMOD`, `04-UAG` et `05-Installation-Guide` possèdent dix
chapitres numérotés. L'ensemble `02-SAR` contient dans l'espace de travail les
chapitres numérotés de `04` à `16` ; aucun fichier `01`, `02` ou `03` n'y est
présent.

Le Developer Guide commence avec
`documentation/06-Developer-Guide/01-Presentation.md`.

Référence :
arborescence de `documentation`.

## 4. Organisation du dépôt

### 4.1 Répertoires principaux

| Répertoire | Contenu observé |
| --- | --- |
| `apps` | Applications du workspace |
| `apps/backend` | API NestJS, Prisma, scripts et tests |
| `apps/frontend` | Application Next.js, composants, bibliothèques et ressources publiques |
| `docker` | Dockerfiles backend et frontend |
| `scripts` | Développement conjoint, validation du proxy et nettoyage Windows |
| `docs` | Architecture, état, gouvernance, release et références |
| `documentation` | Référentiels SAR, SMOD, UAG, Installation Guide et Developer Guide |

### 4.2 Backend

| Chemin | Responsabilité observable |
| --- | --- |
| `apps/backend/src/main.ts` | Bootstrap NestJS, sécurité HTTP, CORS, validation globale et écoute |
| `apps/backend/src/app.module.ts` | Composition des modules et validation de configuration |
| `apps/backend/src/modules` | Modules fonctionnels |
| `apps/backend/src/common` | Audit, Prisma, sécurité, horloge, utilitaires et validations partagés |
| `apps/backend/prisma` | Configuration, schéma, migrations et seed |
| `apps/backend/scripts` | Création initiale et reprises de données |
| `apps/backend/test` | Configuration et suites end-to-end |

Les modules observés dans `AppModule` sont :

- audit ;
- Prisma ;
- authentification ;
- santé ;
- dashboard ;
- employés ;
- calendrier ;
- pointages ;
- sanctions ;
- plannings.

Référence :
`apps/backend/src/app.module.ts`.

### 4.3 Frontend

| Chemin | Responsabilité observable |
| --- | --- |
| `apps/frontend/app` | Pages et layouts App Router |
| `apps/frontend/app/api` | Routes serveur intermédiaires vers le backend |
| `apps/frontend/components` | Composants UI et composants par domaine |
| `apps/frontend/lib` | API, session et utilitaires |
| `apps/frontend/types` | Types complémentaires |
| `apps/frontend/public` | Fichiers statiques |

Les segments de page de premier niveau présents sont :

- racine/dashboard ;
- connexion ;
- pointage public ;
- historique des pointages ;
- mon pointage ;
- employés ;
- plannings ;
- calendrier ;
- sanctions ;
- exports.

Références :
`apps/frontend/app`,
`apps/frontend/app/layout.tsx`.

### 4.4 Données

| Chemin | Contenu observable |
| --- | --- |
| `apps/backend/prisma/schema.prisma` | Generator, datasource PostgreSQL, énumérations et cinq modèles |
| `apps/backend/prisma.config.ts` | Chemins Prisma, datasource et commande de seed |
| `apps/backend/prisma/migrations` | Vingt migrations SQL horodatées |
| `apps/backend/prisma/seed.ts` | Jeu de données initial réutilisable |

Références :
les fichiers et le répertoire du tableau.

### 4.5 Infrastructure et outils

| Élément | Rôle observable |
| --- | --- |
| `docker-compose.yml` | PostgreSQL et profil applicatif backend/frontend |
| `docker/backend.Dockerfile` | Build NestJS, génération Prisma, Chromium et démarrage après migrations |
| `docker/frontend.Dockerfile` | Build et démarrage Next.js |
| `scripts/dev.mjs` | Lancement conjoint des applications en développement |
| `scripts/validate-proxy.mjs` | Contrôle temporaire du raccordement frontend/backend |
| `scripts/clean-windows.ps1` | Nettoyage ciblé des artefacts et processus Windows |
| `eslint.config.mjs` | Lint commun et règles Next.js |
| `.prettierrc.json` | Formatage |
| `.editorconfig` | Encodage, fins de lignes et indentation |

## 5. Principes généraux

### 5.1 Modularité backend

Le backend utilise les modules NestJS comme unités fonctionnelles. Chaque
domaine possède les fichiers correspondant à ses besoins parmi :

- module ;
- contrôleur ;
- service ;
- DTO ;
- types, constantes, décorateurs ou guards propres au domaine.

`AppModule` assemble ces modules. `PrismaModule` et `AuditLogModule` sont des
composants communs séparés des modules métier.

Références :
`apps/backend/src/app.module.ts`,
`apps/backend/src/modules`,
`apps/backend/src/common`.

### 5.2 Séparation des responsabilités backend

Les responsabilités observées sont distribuées entre :

| Responsabilité | Emplacement |
| --- | --- |
| Bootstrap HTTP | `apps/backend/src/main.ts` |
| Composition et configuration | `apps/backend/src/app.module.ts` |
| Entrées HTTP | Fichiers `*.controller.ts` |
| Traitements de domaine | Fichiers `*.service.ts` |
| Contrats d'entrée | Répertoires `dto` |
| Accès Prisma partagé | `apps/backend/src/common/prisma` |
| Règles partagées | `apps/backend/src/common` |
| Modèle persistant | `apps/backend/prisma/schema.prisma` |

Le bootstrap installe une `ValidationPipe` globale avec whitelist,
interdiction des champs non déclarés et transformation des entrées.

Référence :
`apps/backend/src/main.ts`.

### 5.3 Organisation frontend

Le frontend sépare :

- les pages et layouts dans `app` ;
- les routes serveur dans `app/api` ;
- les composants par domaine ;
- les composants génériques dans `components/ui` ;
- les accès API et la session dans `lib`.

Les routes `app/api` utilisent les fonctions de `lib` pour appeler le backend.
Le chemin TypeScript `@/*` permet les imports depuis la racine frontend.

Références :
`apps/frontend/app`,
`apps/frontend/components`,
`apps/frontend/lib`,
`apps/frontend/tsconfig.json`.

### 5.4 Séparation des applications

Le frontend et le backend ont leurs propres :

- dépendances ;
- scripts ;
- configurations TypeScript ;
- builds ;
- images Docker.

La racine fournit l'orchestration sans fusionner leur code source. Le seul
périmètre déclaré par le workspace est `apps/*`.

Références :
`package.json`,
`pnpm-workspace.yaml`,
manifests des deux applications.

### 5.5 Données versionnées

Le schéma courant est centralisé dans `schema.prisma`. Les évolutions sont
conservées sous forme de migrations SQL horodatées. Le seed est déclaré dans
la configuration Prisma et réutilisé par la préparation de la base de test.

Les commandes de développement et de déploiement des migrations sont
distinctes.

Références :
`apps/backend/prisma/schema.prisma`,
`apps/backend/prisma/migrations`,
`apps/backend/prisma.config.ts`,
`apps/backend/test/test-database.ts`,
`package.json`.

### 5.6 Configuration externalisée et validée

Les fichiers locaux sont dérivés de trois exemples suivis :

- `apps/backend/.env.example` ;
- `apps/frontend/.env.example` ;
- `.env.production.example`.

Les variantes réelles sont ignorées par Git. NestJS valide la configuration
avec Joi. Le frontend centralise et valide ses URL d'application et d'API.

Références :
`.gitignore`,
`README.md`,
`apps/backend/src/app.module.ts`,
`apps/frontend/lib/api.ts`.

### 5.7 Scripts centralisés

Le manifeste racine expose des commandes globales et ciblées pour :

- le développement ;
- les builds ;
- les typechecks ;
- le lint et le formatage ;
- les tests ;
- la validation ;
- Docker Compose ;
- Prisma ;
- le nettoyage Windows.

Les commandes ciblées délèguent aux applications ou appellent leurs
exécutables locaux.

Référence :
`package.json`.

### 5.8 Validation

La chaîne `pnpm validate` combine :

1. le contrôle du formatage ;
2. la génération Prisma ;
3. les typechecks ;
4. le lint ;
5. les tests backend ;
6. les builds frontend et backend ;
7. le test de raccordement proxy.

Jest cible les fichiers `*.e2e-spec.ts`. `test:proxy` démarre les deux
applications sur des ports temporaires et contrôle les endpoints de santé et
la redirection publique.

Références :
`package.json`,
`apps/backend/test/jest-e2e.json`,
`scripts/validate-proxy.mjs`.

### 5.9 Documentation versionnée

La documentation est conservée avec le code. Les ensembles généraux
(`README`, spécification, plan, état et checklists), techniques (`docs`) et
structurés (`documentation`) sont séparés par usage.

Le registre de modules et le document d'architecture identifient les sources
de vérité techniques par domaine. Les guides numérotés séparent architecture,
opérations, administration, installation et développement.

Références :
`docs/ARCHITECTURE.md`,
`docs/MODULE_REGISTRY.md`,
arborescence de `documentation`.

## 6. Traçabilité

### 6.1 Présentation et vue d'ensemble

| Information | Fichiers analysés |
| --- | --- |
| Finalité et périmètre fonctionnel | `README.md`, `PROJECT_SPEC.md`, `PROJECT_PLAN.md` |
| Stack | `README.md`, les trois `package.json`, `pnpm-workspace.yaml` |
| Architecture applicative | `apps/backend/src/app.module.ts`, `apps/backend/src/main.ts`, `apps/frontend/app`, `apps/frontend/lib/api.ts` |
| Données | `apps/backend/prisma/schema.prisma`, `apps/backend/prisma.config.ts` |
| Exécution conteneurisée | `docker-compose.yml`, Dockerfiles |

### 6.2 Documentation

| Ensemble | Fichiers analysés |
| --- | --- |
| Projet | `PROJECT_SPEC.md`, `PROJECT_PLAN.md`, `CURRENT_STATUS.md`, `CHANGELOG_DEV.md` |
| Tests | `TESTING_CHECKLIST.md` |
| Architecture et modules | `docs/ARCHITECTURE.md`, `docs/MODULE_REGISTRY.md` |
| État, release et gouvernance | `docs/PROJECT_STATE.md`, `docs/RELEASE_CHECKLIST.md`, `docs/governance/repository-baseline-audit.md` |
| Guides structurés | fichiers sous `documentation/02-SAR` à `documentation/06-Developer-Guide` |

### 6.3 Organisation du dépôt

| Zone | Fichiers analysés |
| --- | --- |
| Workspace | `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml` |
| Backend | `apps/backend/package.json`, `apps/backend/src`, `apps/backend/prisma`, `apps/backend/test` |
| Frontend | `apps/frontend/package.json`, `apps/frontend/app`, `apps/frontend/components`, `apps/frontend/lib` |
| Infrastructure | `docker-compose.yml`, `docker/backend.Dockerfile`, `docker/frontend.Dockerfile` |
| Scripts | fichiers sous `scripts` |
| Outils | `.editorconfig`, `.prettierrc.json`, `eslint.config.mjs`, fichiers `tsconfig.json` |

### 6.4 Principes généraux

| Principe observé | Sources |
| --- | --- |
| Modularité NestJS | `apps/backend/src/app.module.ts`, `apps/backend/src/modules` |
| Séparation contrôleurs/services/DTO | fichiers sous `apps/backend/src/modules` |
| App Router et routes serveur | `apps/frontend/app`, `apps/frontend/app/api` |
| Composants par domaine | `apps/frontend/components` |
| Configuration validée | `apps/backend/src/app.module.ts`, `apps/frontend/lib/api.ts` |
| Données versionnées | `apps/backend/prisma` |
| Validation globale | `package.json`, `apps/backend/test`, `scripts/validate-proxy.mjs` |
| Documentation avec le code | `README.md`, `docs`, `documentation` |

## 7. Observations

### 7.1 Particularités de l'architecture

- Le workspace contient exactement deux applications déclarées.
- Aucun package interne partagé n'est déclaré.
- Le frontend combine pages App Router et routes serveur qui relaient le
  backend.
- Le backend possède un préfixe API global `/api/v1`.
- `PrismaModule` est global dans NestJS.
- Le datasource Prisma utilise PostgreSQL.
- Le schéma courant contient cinq modèles.
- Docker Compose sépare PostgreSQL des applications placées dans le profil
  `app`.
- Le backend Docker applique les migrations avant de lancer NestJS.
- Le frontend Docker attend un backend sain.

### 7.2 Particularités du code et des outils

- TypeScript est strict dans les deux applications.
- Le backend cible CommonJS et ES2022.
- Le frontend utilise la résolution de modules `bundler` et l'alias `@/*`.
- React Strict Mode est activé.
- Le lint Next.js du build est désactivé ; le lint racine reste un script
  distinct.
- Les migrations SQL sont exclues du lint.
- Les dépendances, builds, caches, logs et environnements locaux sont ignorés
  par Git.
- La racine possède un lockfile pnpm unique.

### 7.3 Particularités des tests

- Le backend possède sept fichiers de suites `*.e2e-spec.ts`.
- Le frontend ne possède pas de script de test autonome.
- Le raccordement frontend/backend est vérifié par `test:proxy`.
- Plusieurs suites backend recréent leur base de test avant leurs contrôles.
- Le rendu PDF Puppeteer possède une suite e2e dédiée.

Références :
`apps/backend/test`,
`apps/frontend/package.json`,
`scripts/validate-proxy.mjs`.

### 7.4 Particularités documentaires

- Les documents racine, `docs` et `documentation` ont des rôles distincts.
- Les guides SMOD, UAG et Installation Guide contiennent chacun dix
  chapitres dans l'espace de travail.
- Le SAR présent commence au chapitre `04`.
- Le Developer Guide est initié par le présent chapitre.
- Aucun générateur ou site de documentation n'est configuré dans le dépôt.

### 7.5 Éléments absents

Le dépôt ne contient pas :

- de pipeline CI/CD versionné sous `.github/workflows` ;
- de manifeste Render ou de configuration Neon spécifique ;
- de package de code partagé ;
- de tests frontend autonomes ;
- de configuration Kubernetes, Helm ou Terraform ;
- de générateur documentaire ;
- de gestionnaire de processus hors Docker.
