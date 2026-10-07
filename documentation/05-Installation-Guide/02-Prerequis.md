# Prérequis

| Métadonnée | Valeur |
| --- | --- |
| Document ID | IG-002 |
| Titre | Prérequis |
| Version | 1.0 |
| Statut | Validé |
| Classification | Interne |
| Référence | Installation Guide |
| Date de génération | 30 juillet 2026 |

## 1. Présentation

### 1.1 Objectif des prérequis

Ce chapitre recense les conditions identifiables dans le dépôt avant
l'installation de Konatech Pointage. Il distingue :

- les outils à installer sur le poste ;
- les outils fournis comme dépendances du workspace ;
- les services exécutés par Docker Compose ;
- les accès et paramètres nécessaires ;
- les composants optionnels activés par configuration.

Aucune exigence non déclarée dans les manifests, scripts, Dockerfiles,
exemples d'environnement ou documents suivis n'est ajoutée.

### 1.2 Environnement ciblé

Le parcours local principal utilise :

- une copie Git du monorepo ;
- Node.js et pnpm sur le poste ;
- Docker avec Docker Compose pour PostgreSQL ;
- le frontend et le backend lancés comme processus Node.js par `pnpm dev`.

Un second mode présent utilise Docker Compose avec le profil `app` pour
construire et démarrer PostgreSQL, le backend et le frontend.

```text
+----------------------------+
| Poste de développement     |
| Git + Node.js + pnpm       |
+--------------+-------------+
               |
               +-------------------------+
               |                         |
               v                         v
+----------------------------+  +----------------------------+
| Processus locaux           |  | Docker Compose             |
| Next.js + NestJS           |  | profil app                 |
+--------------+-------------+  +-------------+--------------+
               |                              |
               +---------------+--------------+
                               |
                               v
                 +----------------------------+
                 | PostgreSQL                 |
                 | Docker ou service externe  |
                 +----------------------------+
```

Références :
`README.md`,
`package.json`,
`scripts/dev.mjs`,
`docker-compose.yml`.

## 2. Configuration matérielle

### 2.1 Processeur

Le dépôt ne définit :

- aucun nombre minimal de cœurs ;
- aucune fréquence minimale ;
- aucun modèle de processeur ;
- aucune architecture CPU obligatoire.

Les Dockerfiles utilisent `node:22-bookworm-slim`, mais ne fixent aucune
plateforme avec une directive telle que `--platform`. Le schéma Prisma déclare
les cibles binaires `native` et `debian-openssl-3.0.x` sans préciser
d'architecture CPU.

Références :
`docker/backend.Dockerfile`,
`docker/frontend.Dockerfile`,
`apps/backend/prisma/schema.prisma`.

### 2.2 Mémoire

Aucune capacité minimale ou recommandée de mémoire vive n'est indiquée dans le
dépôt.

Les composants exécutables comprennent simultanément PostgreSQL, Next.js,
NestJS et, lors d'un export PDF, Chromium par Puppeteer. Aucun fichier Compose
ne définit de limite ou de réservation mémoire pour ces services.

Références :
`docker-compose.yml`,
`docker/backend.Dockerfile`,
`apps/backend/src/modules/attendance/exports/monthly-attendance-puppeteer-pdf-renderer.service.ts`.

### 2.3 Espace disque

Aucune taille minimale de disque n'est déclarée.

L'installation crée ou utilise néanmoins les emplacements suivants :

| Élément | Stockage observé |
| --- | --- |
| Dépendances | Répertoires `node_modules` gérés par pnpm |
| Build frontend | `apps/frontend/.next` |
| Build backend | `apps/backend/dist` |
| PostgreSQL | Volume Docker nommé `postgres-data` |
| Images Docker | Images construites depuis les deux Dockerfiles |
| Chromium | Installé dans l'image backend d'exécution |

Le dépôt ne chiffre pas l'espace requis pour ces éléments ni la croissance du
volume PostgreSQL.

Références :
`.gitignore`,
`scripts/clean-windows.ps1`,
`docker-compose.yml`,
`docker/backend.Dockerfile`.

### 2.4 Architecture

Aucune matrice d'architectures `amd64`, `arm64` ou autre n'est définie. Aucun
build multi-architecture explicite n'est présent.

La seule contrainte de plateforme technique inscrite dans Prisma concerne les
binaires natifs et Debian OpenSSL 3.0. La compatibilité d'une architecture CPU
particulière n'est pas certifiée par un fichier du dépôt.

Référence :
`apps/backend/prisma/schema.prisma`.

## 3. Systèmes d'exploitation compatibles

### 3.1 Systèmes documentés

| Environnement | Éléments observés | Portée |
| --- | --- | --- |
| Windows | Commandes PowerShell, variante `pnpm.cmd`, script de nettoyage | Développement local explicitement documenté |
| Windows avec WSL2 Ubuntu | Environnement relevé dans l'audit du dépôt | Validation du dépôt observée |
| Linux Debian | Images `node:22-bookworm-slim`, Chromium installé par `apt-get` | Exécution des conteneurs frontend et backend |
| Linux avec Docker Engine | Docker Engine avec Compose cité comme prérequis | Base locale et mode conteneurisé |

Références :
`README.md`,
`scripts/clean-windows.ps1`,
`docs/governance/repository-baseline-audit.md`,
`docker/backend.Dockerfile`,
`docker/frontend.Dockerfile`.

### 3.2 Windows

Le dépôt contient trois scripts spécifiques :

```text
pnpm clean:windows
pnpm clean:windows:dev
pnpm clean:windows:prisma
```

Ils appellent PowerShell pour supprimer les builds locaux, arrêter
éventuellement les processus écoutant sur les ports de développement et
régénérer éventuellement Prisma.

Le README documente `pnpm.cmd` lorsque PowerShell bloque le shim `pnpm.ps1`.
Docker Desktop doit être démarré avant les contrôles qui dépendent de la base.

Références :
`package.json`,
`scripts/clean-windows.ps1`,
`README.md`.

### 3.3 Linux et conteneurs

Les images applicatives sont fondées sur Debian Bookworm Slim. Le backend
installe Chromium, les certificats et des polices au moyen d'`apt-get`.
PostgreSQL utilise l'image Alpine officielle.

Ces éléments documentent l'environnement interne des conteneurs. Aucune
distribution Linux minimale de l'hôte n'est imposée.

Références :
`docker/backend.Dockerfile`,
`docker/frontend.Dockerfile`,
`docker-compose.yml`.

### 3.4 Systèmes non documentés

macOS n'est pas mentionné comme environnement validé dans le README, les
scripts ou les documents d'audit consultés. Aucun script spécifique à macOS
n'est présent.

Aucune version minimale de Windows, Ubuntu, Debian ou d'un noyau Linux n'est
déclarée.

## 4. Logiciels nécessaires

### 4.1 Git

Git est nécessaire pour réaliser l'étape de clonage du dépôt. Le dépôt est
lui-même versionné et contient des règles `.gitignore`.

Aucune version minimale de Git et aucune URL distante canonique ne sont
déclarées dans les fichiers suivis. La commande complète de clonage dépend donc
de l'accès au dépôt fourni en dehors de celui-ci.

Référence :
`.gitignore`.

### 4.2 Node.js

Node.js exécute :

- les scripts racine ;
- Next.js ;
- NestJS ;
- Prisma CLI ;
- les tests ;
- les utilitaires TypeScript exécutés avec `ts-node`.

Le manifest accepte Node.js `>=20.9.0 <23`. Le fichier `.nvmrc` sélectionne
`22.11.0`. Les Dockerfiles utilisent la famille majeure Node.js 22.

Références :
`package.json`,
`.nvmrc`,
`docker/backend.Dockerfile`,
`docker/frontend.Dockerfile`.

### 4.3 pnpm

pnpm est le gestionnaire du workspace et l'interface de toutes les commandes
d'installation, de base, de génération, de build, de test et de démarrage.

Le manifest déclare :

- `packageManager: pnpm@10.26.0` ;
- un moteur pnpm `>=10.0.0`.

Les Dockerfiles activent Corepack avant l'installation. Le parcours local du
README suppose que pnpm est disponible sur le poste. Aucun script npm
équivalent n'est défini.

Références :
`package.json`,
`pnpm-workspace.yaml`,
`docker/backend.Dockerfile`,
`docker/frontend.Dockerfile`.

### 4.4 Docker et Docker Compose

Docker Desktop ou Docker Engine avec Compose est le prérequis documenté pour
la base locale.

Docker Compose fournit :

- PostgreSQL ;
- un volume persistant ;
- le healthcheck `pg_isready` ;
- le backend et le frontend sous le profil `app` ;
- les dépendances de démarrage entre services ;
- les healthchecks applicatifs.

Aucune version minimale de Docker ou du plugin Compose n'est déclarée.

Références :
`README.md`,
`docker-compose.yml`.

### 4.5 PostgreSQL

PostgreSQL est requis par le backend. Deux formes sont compatibles avec les
fichiers présents :

| Forme | Preuve dans le dépôt |
| --- | --- |
| PostgreSQL local conteneurisé | Service `postgres:16-alpine` |
| PostgreSQL accessible par URL | Prisma et backend lisent `DATABASE_URL` |

Une installation native de PostgreSQL sur l'hôte n'est pas exigée lorsque le
service Docker Compose est utilisé. Aucun client `psql` n'est requis par le
cycle standard d'installation, même si le README l'emploie dans des procédures
distinctes de sauvegarde et restauration.

Références :
`docker-compose.yml`,
`apps/backend/prisma/schema.prisma`,
`apps/backend/.env.example`,
`README.md`.

### 4.6 Prisma

Prisma CLI et `@prisma/client` sont des dépendances du backend. Les scripts
racine appellent directement les binaires installés sous
`apps/backend/node_modules`.

Il n'existe aucune exigence d'installation globale de Prisma. Le client doit
être généré après l'installation des packages et chaque fois que le schéma le
nécessite.

Références :
`apps/backend/package.json`,
`package.json`,
`apps/backend/prisma.config.ts`.

### 4.7 Nest CLI, Next.js CLI et TypeScript

Nest CLI, Next.js et TypeScript sont installés dans les dépendances du
workspace. Les scripts les invoquent via leur chemin local sous
`node_modules`.

Aucune installation globale de `nest`, `next` ou `tsc` n'est requise par les
scripts.

Références :
`package.json`,
`apps/backend/package.json`,
`apps/frontend/package.json`.

### 4.8 Chromium ou Chrome

Le rendu PDF mensuel premium utilise Puppeteer et un navigateur Chromium ou
Chrome :

- l'image backend installe Chromium et configure son chemin ;
- en exécution locale, Puppeteer doit trouver un navigateur ou
  `ATTENDANCE_PDF_EXECUTABLE_PATH` doit désigner le binaire ;
- sans navigateur et sans repli historique autorisé, l'export PDF échoue.

Chromium n'est pas nécessaire au démarrage de base du frontend ou de l'API. Il
est requis par la fonctionnalité d'export PDF premium.

Références :
`README.md`,
`docker/backend.Dockerfile`,
`apps/backend/src/modules/attendance/exports/monthly-attendance-pdf-exporter.service.ts`.

### 4.9 PowerShell

PowerShell est utilisé uniquement par les scripts `clean:windows*` et par les
exemples Windows du README. Il n'est pas requis sur Linux pour installer,
construire ou lancer le projet.

Références :
`scripts/clean-windows.ps1`,
`package.json`,
`README.md`.

## 5. Versions minimales

### 5.1 Tableau des versions

| Logiciel ou technologie | Minimum ou version observée | Nature de la contrainte | Source |
| --- | --- | --- | --- |
| Node.js | `>=20.9.0 <23` | Moteur du workspace | `package.json` |
| Node.js local recommandé | `22.11.0` | Version `.nvmrc` | `.nvmrc` |
| Node.js Docker | `22-bookworm-slim` | Image de base | Dockerfiles |
| pnpm | `>=10.0.0` | Moteur du workspace | `package.json` |
| pnpm déclaré | `10.26.0` | `packageManager` | `package.json` |
| PostgreSQL | `16-alpine` | Image Compose | `docker-compose.yml` |
| Prisma CLI | `6.19.3` | Version verrouillée | `pnpm-lock.yaml` |
| Prisma Client | `6.19.3` | Version verrouillée | `pnpm-lock.yaml` |
| Next.js | `15.5.18` | Version verrouillée | `pnpm-lock.yaml` |
| NestJS Core | `11.1.19` | Version verrouillée | `pnpm-lock.yaml` |
| TypeScript | `5.9.3` | Version verrouillée | `pnpm-lock.yaml` |
| React | `19.2.5` | Version verrouillée | `pnpm-lock.yaml` |
| Tailwind CSS | `3.4.19` | Version verrouillée | `pnpm-lock.yaml` |
| Puppeteer | `24.43.1` | Version verrouillée | `pnpm-lock.yaml` |
| Docker | Non définie | Outil exigé, minimum absent | `README.md` |
| Docker Compose | Non définie | Outil exigé, minimum absent | `README.md` |
| Git | Non définie | Nécessaire au clonage, minimum absent | Dépôt Git |
| Chromium/Chrome | Non définie | Dépendance PDF conditionnelle | `README.md` |
| PowerShell | Non définie | Scripts Windows uniquement | `scripts/clean-windows.ps1` |

Les versions verrouillées décrivent l'état de `pnpm-lock.yaml`. Les plages des
manifests restent les contraintes utilisées lors d'une résolution des
dépendances.

### 5.2 Versions Node.js exclues

Le moteur refuse les versions inférieures à `20.9.0` et les versions à partir
de 23. Le README précise que Node.js 24 est volontairement hors de la plage
prise en charge.

Le même README présente Node.js 20.9+ et 22.11+ comme les branches LTS
attendues, tandis que `.nvmrc` fournit directement Node.js 22.11.0.

Références :
`package.json`,
`.nvmrc`,
`README.md`.

### 5.3 Versions non spécifiées

Le dépôt ne fournit aucune contrainte de version pour :

- Git ;
- Docker Desktop ;
- Docker Engine ;
- Docker Compose ;
- PowerShell ;
- Chrome ou Chromium installé hors de l'image Docker ;
- un client PostgreSQL installé sur l'hôte.

## 6. Accès nécessaires

### 6.1 Accès au dépôt Git

La récupération initiale nécessite l'accès au dépôt Git et à sa branche
cible. Aucune URL, organisation distante, méthode d'authentification ou branche
obligatoire n'est déclarée dans les fichiers suivis.

### 6.2 Accès aux dépendances

`pnpm install` doit pouvoir obtenir les packages référencés par le lockfile
lorsqu'ils ne sont pas déjà disponibles dans le magasin local. Les Dockerfiles
doivent également disposer des images de base et, pour le backend, des paquets
Debian utilisés pour Chromium.

Le dépôt ne définit ni registre npm privé, ni miroir Docker, ni jeton de
registre.

Références :
`pnpm-lock.yaml`,
`docker/backend.Dockerfile`,
`docker/frontend.Dockerfile`.

### 6.3 Variables d'environnement

Le backend doit pouvoir lire au minimum les valeurs rendues obligatoires par
sa validation :

| Variable | Utilisation |
| --- | --- |
| `FRONTEND_URL` | Origine CORS et URL publique frontend |
| `JWT_SECRET` | Signature des JWT |
| `DATABASE_URL` | Connexion PostgreSQL Prisma |

Le frontend utilise :

| Variable | Utilisation |
| --- | --- |
| `NEXT_PUBLIC_APP_URL` | Origine publique et liens de pointage |
| `NEXT_PUBLIC_API_BASE_URL` | URL publique de l'API |
| `API_BASE_URL` | Surcharge serveur facultative pour SSR et routes proxy |

Le dépôt fournit des exemples sans que leurs valeurs soient reproduites dans
ce document.

Références :
`apps/backend/src/app.module.ts`,
`apps/backend/.env.example`,
`apps/frontend/.env.example`.

### 6.4 Accès PostgreSQL

Le backend, Prisma CLI, les migrations et le seed nécessitent une
`DATABASE_URL` valide vers une base PostgreSQL accessible.

Pour le scénario local fourni :

- Docker doit pouvoir démarrer le service `postgres` ;
- le port hôte configuré doit être disponible ;
- le volume `postgres-data` doit pouvoir être créé ;
- les identifiants Compose doivent correspondre à l'URL backend.

Pour une base externe, le dépôt n'impose aucun fournisseur. Neon est mentionné
dans le README comme exemple de chaîne PostgreSQL, sans configuration
spécifique au fournisseur.

Références :
`docker-compose.yml`,
`apps/backend/prisma.config.ts`,
`README.md`.

### 6.5 Ports locaux

Les ports par défaut observés sont :

| Port hôte | Service |
| --- | --- |
| `3000` | Frontend |
| `4000` | Backend |
| `5433` | PostgreSQL Compose, redirigé vers 5432 dans le conteneur |

Les scripts de validation proxy utilisent des ports temporaires distincts. Le
script Windows connaît également les variantes 3001, 3100, 4001 et 4100 pour
le nettoyage de processus, mais elles ne constituent pas les ports par défaut
de l'application.

Références :
`docker-compose.yml`,
`scripts/validate-proxy.mjs`,
`scripts/clean-windows.ps1`.

### 6.6 Accès optionnels

| Accès | Condition |
| --- | --- |
| Cloudinary | Traitement des preuves photo lorsque les variables Cloudinary sont configurées |
| Chromium ou Chrome local | Export PDF premium hors image backend Docker |
| Render | Shell mentionné pour les commandes de déploiement manuel |
| Neon | Base PostgreSQL externe mentionnée |
| Base de test | Exécution complète des tests end-to-end backend |

Cloudinary doit recevoir ses trois paramètres d'identification ensemble. Aucun
manifeste Render ni configuration Neon n'est présent.

Références :
`apps/backend/src/app.module.ts`,
`apps/backend/.env.example`,
`README.md`,
`apps/backend/.env.test`.

### 6.7 Premier administrateur de production

Le script `admin:create` nécessite :

- `DATABASE_URL` ;
- `ADMIN_EMAIL` ;
- `ADMIN_PASSWORD`.

Les prénom, nom, fonction et département de l'administrateur sont
facultatifs. Ce script est documenté pour une base de production vide et
n'est pas une étape du seed local standard.

Références :
`README.md`,
`apps/backend/package.json`,
`apps/backend/scripts/create-initial-admin.ts`.

## 7. Vérifications préalables

### 7.1 Présence et versions des outils

Les vérifications compatibles avec les contraintes du dépôt sont :

```bash
git --version
node --version
pnpm --version
docker --version
docker compose version
```

Les résultats Node.js et pnpm doivent se situer dans les plages déclarées par
`package.json`. Le dépôt ne fournit pas de seuil de comparaison pour Git,
Docker ou Compose.

Sous un environnement utilisant nvm, `.nvmrc` permet la sélection par :

```bash
nvm use
```

Références :
`package.json`,
`.nvmrc`,
`README.md`.

### 7.2 Cohérence du workspace

Les fichiers nécessaires à l'installation des dépendances sont :

- `package.json` ;
- `pnpm-workspace.yaml` ;
- `pnpm-lock.yaml` ;
- `apps/backend/package.json` ;
- `apps/frontend/package.json`.

L'installation Docker utilise `--frozen-lockfile`. Le lockfile doit donc
correspondre aux manifests pour que cette étape aboutisse.

Références :
`docker/backend.Dockerfile`,
`docker/frontend.Dockerfile`.

### 7.3 Accès à Docker et PostgreSQL

Après le démarrage de la base, la commande prévue pour consulter son état est :

```bash
pnpm db:status
```

Elle exécute `docker compose ps`. Le service PostgreSQL possède un healthcheck
`pg_isready`.

Références :
`package.json`,
`docker-compose.yml`.

### 7.4 Accès Prisma

Les contrôles définis sont :

```bash
pnpm prisma:generate
pnpm prisma:status
```

La génération vérifie que Prisma peut lire son schéma et produire le client.
Le statut nécessite en plus l'accès à la base indiquée par `DATABASE_URL`.

Références :
`package.json`,
`apps/backend/prisma.config.ts`.

### 7.5 Configuration locale

Le cycle local attend :

- `apps/backend/.env`, obtenu à partir de l'exemple backend ;
- `apps/frontend/.env.local`, obtenu à partir de l'exemple frontend ;
- des URL frontend cohérentes entre les deux applications ;
- une URL d'API terminée par `/api/v1` ;
- une connexion PostgreSQL correspondant au port réellement exposé.

Le script `pnpm test:proxy` vérifie le raccordement frontend/backend, le
healthcheck via le proxy et la cohérence de l'URL publique de pointage.

Références :
`README.md`,
`apps/backend/.env.example`,
`apps/frontend/.env.example`,
`scripts/validate-proxy.mjs`.

### 7.6 Chaîne de validation disponible

Une fois les dépendances et la base prêtes, le dépôt fournit :

```bash
pnpm validate
```

Cette commande enchaîne le contrôle Prettier, la génération Prisma, le
typecheck, ESLint, les tests backend, les builds et le test du proxy.

Les tests backend utilisent une base de test dédiée et ne réutilisent pas la
base de développement selon le README et la configuration de test.

Références :
`package.json`,
`README.md`,
`apps/backend/test/jest-e2e.json`.

## 8. Traçabilité

| Prérequis ou contrôle | Fichiers concernés |
| --- | --- |
| Pré-requis déclarés | `README.md` |
| Contraintes Node.js et pnpm | `package.json` |
| Version Node.js locale | `.nvmrc` |
| Workspace et dépendances compilées | `pnpm-workspace.yaml` |
| Versions résolues | `pnpm-lock.yaml` |
| Dépendances frontend | `apps/frontend/package.json` |
| Dépendances backend | `apps/backend/package.json` |
| PostgreSQL local | `docker-compose.yml` |
| Image backend et Chromium | `docker/backend.Dockerfile` |
| Image frontend | `docker/frontend.Dockerfile` |
| Cibles binaires Prisma | `apps/backend/prisma/schema.prisma` |
| Configuration Prisma | `apps/backend/prisma.config.ts` |
| Variables backend | `apps/backend/.env.example` |
| Variables frontend | `apps/frontend/.env.example` |
| Variables du mode Docker | `.env.production.example` |
| Validation des variables backend | `apps/backend/src/app.module.ts` |
| Démarrage local conjoint | `scripts/dev.mjs` |
| Contrôle du proxy | `scripts/validate-proxy.mjs` |
| Support PowerShell | `scripts/clean-windows.ps1` |
| Environnement WSL2 observé | `docs/governance/repository-baseline-audit.md` |
| Configuration des tests | `apps/backend/test/jest-e2e.json` |
| Premier administrateur | `apps/backend/scripts/create-initial-admin.ts` |
| Ignore des secrets et builds | `.gitignore`, `.dockerignore` |

## 9. Observations

### 9.1 Contraintes observées

- Node.js doit rester dans la plage `>=20.9.0 <23` ;
- pnpm doit être en version 10 ou ultérieure ;
- le workspace est conçu pour pnpm, pas pour npm ;
- PostgreSQL est le seul moteur de base déclaré ;
- Prisma dépend de `DATABASE_URL` pour les opérations sur la base ;
- les services applicatifs Compose ne démarrent qu'avec le profil `app` ;
- `pnpm db:up` démarre uniquement PostgreSQL ;
- le port PostgreSQL local par défaut est 5433 côté hôte ;
- l'export PDF premium dépend d'un navigateur Chromium ou Chrome ;
- le test backend complet dépend d'une base PostgreSQL de test accessible ;
- les scripts de nettoyage Windows dépendent de PowerShell.

### 9.2 Dépendances optionnelles ou conditionnelles

- Cloudinary est conditionnel aux fonctions de preuve photo configurées ;
- Chromium local est conditionnel à l'export PDF premium hors conteneur
  backend ;
- `API_BASE_URL` est une surcharge serveur facultative du frontend ;
- les coordonnées de l'entreprise deviennent obligatoires lorsque la sécurité
  de pointage est activée ;
- le client `psql` concerne les procédures de sauvegarde et restauration du
  README, pas le cycle standard d'installation ;
- Render et Neon sont des cibles citées, sans outillage spécifique dans le
  dépôt ;
- PowerShell est propre au parcours Windows.

### 9.3 Limitations existantes

- aucune configuration matérielle minimale n'est publiée ;
- aucune architecture CPU n'est explicitement qualifiée ;
- aucune version minimale de système d'exploitation n'est publiée ;
- macOS n'est pas documenté comme environnement validé ;
- aucune version minimale de Git, Docker ou Compose n'est imposée ;
- aucune URL Git canonique n'est enregistrée ;
- aucun registre privé ni mécanisme d'authentification de registre n'est
  configuré ;
- aucun manifeste Render ni configuration Neon n'est présent ;
- aucun script unique ne vérifie et installe tous les prérequis système ;
- aucun gestionnaire de versions Docker ou PostgreSQL n'est fourni en dehors
  des images déclarées ;
- aucune estimation d'espace disque ou de mémoire n'est fournie.

Références :
`README.md`,
`package.json`,
`docker-compose.yml`,
`docker/backend.Dockerfile`,
`pnpm-workspace.yaml`.
