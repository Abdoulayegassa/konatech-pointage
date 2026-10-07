# Tests et qualité

| Métadonnée         | Valeur            |
| ------------------ | ----------------- |
| Document ID        | SAR-QA-001        |
| Titre              | Tests & Qualité   |
| Version            | 1.0               |
| Statut             | Validé            |
| Classification     | Interne           |
| Référence SAPDD    | Assurance Qualité |
| Date de génération | 29 juillet 2026   |

## 1. Présentation

### 1.1 Objet

Ce document décrit les mécanismes de test et de validation de la qualité présents dans le monorepo Konatech Pointage. Il couvre les suites Jest du backend, la validation d'intégration entre le frontend et le backend, les contrôles statiques TypeScript et ESLint, la vérification du format avec Prettier, les compilations NestJS et Next.js ainsi que leur orchestration par les scripts pnpm.

L'implémentation actuelle poursuit les objectifs vérifiables suivants :

- contrôler les routes HTTP principales de l'API NestJS ;
- vérifier des services métier du pointage, du calendrier RH, des sanctions et des exports ;
- exécuter des scénarios avec une base PostgreSQL de test recréée et migrée ;
- vérifier l'isolation de l'environnement de test ;
- contrôler le câblage du proxy Next.js vers l'API ;
- appliquer les règles statiques ESLint et TypeScript à l'ensemble du workspace ;
- vérifier le format des fichiers avec Prettier ;
- compiler séparément puis conjointement le frontend et le backend ;
- regrouper ces contrôles dans des commandes de validation locales.

Le dépôt ne contient pas de mesure de couverture activée, de seuil de couverture, de suite de tests de composants frontend, de test d'interface piloté par navigateur, de test de charge, de test de sécurité automatisé dédié ni de pipeline CI déclaré dans `.github/workflows`.

### 1.2 Périmètre

Le périmètre documenté comprend :

| Périmètre                    | Implémentation observée                                                            |
| ---------------------------- | ---------------------------------------------------------------------------------- |
| Backend NestJS               | Jest, `@nestjs/testing`, Supertest, tests directs de services                      |
| Persistance                  | PostgreSQL de test, Prisma Client, migrations Prisma, seed                         |
| Frontend Next.js             | compilation TypeScript/Next.js et validation du proxy ; aucune suite de composants |
| Intégration frontend–backend | script Node.js démarrant les deux applications sur des ports temporaires           |
| Qualité statique             | ESLint, TypeScript strict et Prettier                                              |
| Orchestration                | scripts pnpm à la racine et dans les applications                                  |
| Documentation opératoire     | README et checklist de release                                                     |

### 1.3 Sources principales

Implémentation principale :

- `package.json`
- `apps/backend/package.json`
- `apps/frontend/package.json`
- `apps/backend/test/jest-e2e.json`
- `apps/backend/test/*.e2e-spec.ts`
- `apps/backend/test/test-database.ts`
- `apps/backend/test/test-environment.ts`
- `scripts/validate-proxy.mjs`
- `eslint.config.mjs`
- `apps/backend/tsconfig.json`
- `apps/frontend/tsconfig.json`
- `README.md`
- `docs/RELEASE_CHECKLIST.md`

## 2. Architecture des tests

### 2.1 Vue d'ensemble

Les contrôles sont organisés autour de deux mécanismes exécutables :

1. Jest charge les fichiers `*.e2e-spec.ts` du backend au moyen de `ts-jest`.
2. Un script Node.js autonome démarre le backend et le frontend et valide leur communication par HTTP.

Les contrôles statiques et les builds entourent ces mécanismes dans les commandes `check`, `validate`, `validate:backend` et `validate:frontend`.

```text
                         Monorepo pnpm
                              |
              +---------------+----------------+
              |                                |
      Contrôles statiques                 Tests exécutables
              |                                |
     +--------+--------+              +--------+---------+
     |        |        |              |                  |
  Prettier  ESLint  TypeScript       Jest          validate-proxy.mjs
                                      |                  |
                     +----------------+------+      +----+----+
                     |                       |      |         |
               Services et mocks       NestJS HTTP  Next.js  NestJS
                     |                       |          \       /
                     +-----------+-----------+           HTTP
                                 |
                         Prisma / PostgreSQL
```

### 2.2 Typologie réellement présente

| Type                         | État     | Mise en œuvre réelle                                                                                    |
| ---------------------------- | -------- | ------------------------------------------------------------------------------------------------------- |
| Tests unitaires              | Présents | Méthodes de services instanciées avec dépendances simulées, notamment sanctions et rendu PDF            |
| Tests d'intégration          | Présents | Services NestJS, Prisma, migrations, seed et PostgreSQL réel ; intégration calendrier–pointage–rapports |
| Tests end-to-end API         | Présents | Application NestJS initialisée en mémoire et appelée par Supertest                                      |
| Validation frontend–backend  | Présente | Processus Next.js et NestJS réels démarrés sur des ports temporaires, appels HTTP via `fetch`           |
| Tests de composants frontend | Absents  | Aucun fichier de test React/Next.js et aucune dépendance de bibliothèque de test frontend               |
| Tests E2E navigateur         | Absents  | Playwright, Cypress, Webdriver et outils équivalents non trouvés                                        |
| Tests visuels                | Absents  | Aucun outil ni baseline de comparaison visuelle trouvé                                                  |
| Tests de performance/charge  | Absents  | Aucun scénario ou outil de charge trouvé                                                                |
| Tests de sécurité dédiés     | Absents  | Aucun scanner ou framework de test de sécurité autonome trouvé                                          |
| Tests de contrat             | Absents  | Aucun schéma ou outil de contract testing trouvé                                                        |
| Tests de mutation            | Absents  | Aucun outil de mutation testing trouvé                                                                  |

### 2.3 Classification par comportement

Tous les fichiers Jest portent le suffixe `e2e-spec.ts` en raison de la configuration `testRegex`. Ce suffixe ne correspond pas systématiquement au niveau réel du test.

| Suite                                               |     Cas | Niveau technique observé                                        |
| --------------------------------------------------- | ------: | --------------------------------------------------------------- |
| `app.e2e-spec.ts`                                   |      70 | E2E API et intégration avec PostgreSQL                          |
| `calendar.e2e-spec.ts`                              |       1 | E2E API et intégration avec PostgreSQL                          |
| `attendance-calendar-absence.e2e-spec.ts`           |       2 | Intégration de services avec PostgreSQL                         |
| `non-working-day-attendance.e2e-spec.ts`            |       5 | Intégration de services avec PostgreSQL                         |
| `environment-validation.e2e-spec.ts`                |       6 | Tests directs de configuration et de service, avec mocks HTTP   |
| `monthly-attendance-puppeteer-renderer.e2e-spec.ts` |       5 | Tests directs du service de rendu PDF avec dépendances simulées |
| `sanctions.e2e-spec.ts`                             |      18 | Tests du service de sanctions avec Prisma simulé en mémoire     |
| **Total Jest**                                      | **107** | Ensemble sélectionné par la configuration E2E                   |

### 2.4 Flux Jest avec base de données

```text
pnpm test:backend
        |
        v
Jest --runInBand
        |
        v
test-setup.ts
        |
        v
applyTestEnvironment()
        |
        v
prepareTestDatabase() selon la suite
        |
        +--> suppression/recréation de la base de test
        +--> prisma migrate deploy
        +--> seedDatabase(...)
        |
        v
Création du module NestJS
        |
        v
Appels HTTP Supertest ou appels directs de services
        |
        v
Assertions Jest
```

Fichiers concernés :

- `apps/backend/test/jest-e2e.json`
- `apps/backend/test/test-setup.ts`
- `apps/backend/test/test-environment.ts`
- `apps/backend/test/test-database.ts`
- `apps/backend/prisma/seed.ts`
- `apps/backend/test/app.e2e-spec.ts`
- `apps/backend/test/calendar.e2e-spec.ts`
- `apps/backend/test/attendance-calendar-absence.e2e-spec.ts`
- `apps/backend/test/non-working-day-attendance.e2e-spec.ts`

## 3. Organisation des fichiers

### 3.1 Arborescence

```text
konatech-pointage/
├── apps/
│   ├── backend/
│   │   ├── prisma/
│   │   │   ├── migrations/
│   │   │   ├── schema.prisma
│   │   │   └── seed.ts
│   │   ├── test/
│   │   │   ├── app.e2e-spec.ts
│   │   │   ├── attendance-calendar-absence.e2e-spec.ts
│   │   │   ├── calendar.e2e-spec.ts
│   │   │   ├── environment-validation.e2e-spec.ts
│   │   │   ├── jest-e2e.json
│   │   │   ├── monthly-attendance-puppeteer-renderer.e2e-spec.ts
│   │   │   ├── non-working-day-attendance.e2e-spec.ts
│   │   │   ├── sanctions.e2e-spec.ts
│   │   │   ├── test-database.ts
│   │   │   ├── test-environment.ts
│   │   │   └── test-setup.ts
│   │   ├── package.json
│   │   ├── tsconfig.build.json
│   │   └── tsconfig.json
│   └── frontend/
│       ├── next.config.ts
│       ├── package.json
│       └── tsconfig.json
├── docs/
│   └── RELEASE_CHECKLIST.md
├── scripts/
│   ├── clean-windows.ps1
│   ├── dev.mjs
│   └── validate-proxy.mjs
├── eslint.config.mjs
├── package.json
├── pnpm-lock.yaml
├── pnpm-workspace.yaml
└── README.md
```

### 3.2 Rôle des fichiers de test

| Fichier                                                               | Rôle                                                                                                                                |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `apps/backend/test/app.e2e-spec.ts`                                   | Suite API principale : santé, authentification, autorisation, employés, plannings, pointage, historique, exports et tableau de bord |
| `apps/backend/test/calendar.e2e-spec.ts`                              | Cycle HTTP de création, lecture, modification, classification et suppression des jours du calendrier RH                             |
| `apps/backend/test/attendance-calendar-absence.e2e-spec.ts`           | Interaction entre calendrier RH, génération des absences, métriques mensuelles et export                                            |
| `apps/backend/test/non-working-day-attendance.e2e-spec.ts`            | Traitement du travail durant week-ends et jours fériés et exposition dans le rapport mensuel                                        |
| `apps/backend/test/environment-validation.e2e-spec.ts`                | Validation de configuration, résolution des fichiers d'environnement et comportement Cloudinary                                     |
| `apps/backend/test/monthly-attendance-puppeteer-renderer.e2e-spec.ts` | Structure et pagination du PDF premium et absence de repli silencieux                                                               |
| `apps/backend/test/sanctions.e2e-spec.ts`                             | Règles de sanction, seuils, tolérance, priorité, activation et validations                                                          |
| `apps/backend/test/jest-e2e.json`                                     | Sélection, transformation et environnement d'exécution Jest                                                                         |
| `apps/backend/test/test-environment.ts`                               | Chargement de l'environnement de test et sélection de la base dédiée                                                                |
| `apps/backend/test/test-database.ts`                                  | Recréation de la base, application des migrations et exécution du seed                                                              |
| `apps/backend/test/test-setup.ts`                                     | Initialisation globale de l'environnement avant le chargement des suites                                                            |

### 3.3 Scripts de validation

| Fichier                      | Rôle qualité                                                                                               |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `scripts/validate-proxy.mjs` | Démarre NestJS et Next.js, contrôle les healthchecks, le proxy et la redirection vers la borne de pointage |
| `scripts/dev.mjs`            | Démarrage coordonné du développement ; ce n'est pas une suite de tests                                     |
| `scripts/clean-windows.ps1`  | Nettoyage d'artefacts et processus locaux ; ce n'est pas une suite de tests                                |
| `package.json`               | Point central d'orchestration des contrôles                                                                |
| `docs/RELEASE_CHECKLIST.md`  | Checklist manuelle de release incluant commandes et vérifications fonctionnelles                           |

### 3.4 Fixtures et mocks

Aucun dossier nommé `fixtures`, `mocks`, `__fixtures__` ou `__mocks__` n'est présent.

Les données de test sont fournies par trois mécanismes :

- `seedDatabase()` initialise la base recréée avec une date de référence fixe ;
- les suites créent directement des employés, plannings, pointages et entrées de calendrier avec Prisma ;
- les suites de sanctions, d'environnement et de rendu PDF déclarent leurs mocks directement dans les fichiers de test avec `jest.fn()`, `jest.spyOn()` ou des objets simulés.

Fichiers concernés :

- `apps/backend/prisma/seed.ts`
- `apps/backend/test/test-database.ts`
- `apps/backend/test/sanctions.e2e-spec.ts`
- `apps/backend/test/environment-validation.e2e-spec.ts`
- `apps/backend/test/monthly-attendance-puppeteer-renderer.e2e-spec.ts`

## 4. Tests unitaires

### 4.1 Framework et environnement

Jest 29 est le framework d'assertion et d'exécution. `ts-jest` transforme TypeScript. L'environnement Jest est `node`. Les types Jest sont fournis par `@types/jest`.

La commande commune impose une exécution séquentielle avec `--runInBand`. La configuration ne définit ni collecte de couverture, ni seuil, ni reporter personnalisé.

Fichiers concernés :

- `apps/backend/package.json`
- `apps/backend/test/jest-e2e.json`
- `package.json`

### 4.2 Service de sanctions

`sanctions.e2e-spec.ts` instancie `SanctionsService` avec un objet Prisma simulé. Les méthodes `findMany`, `findUnique` et `update` des accès aux sanctions et pointages sont des fonctions Jest. Aucun serveur NestJS ni PostgreSQL n'intervient dans cette suite.

Les 18 cas contrôlent :

- la disponibilité des règles V1 codées en repli ;
- la reproduction du comportement mensuel V1 par les règles par défaut en base simulée ;
- le repli vers les règles V1 lorsque la liste issue de la base est vide ;
- la tolérance de la première occurrence d'un retard mineur ;
- l'application du montant prévu à la seconde occurrence d'un retard mineur ;
- l'application du montant prévu pour un retard majeur ;
- le comptage des occurrences selon une plage configurée ;
- l'effet d'un seuil majeur modifié ;
- l'exclusion d'une règle inactive ;
- les totaux de l'endpoint mensuel ;
- la stabilité de la forme de réponse d'un pointage ;
- la modification du montant, de la tolérance, des seuils, de l'état actif et de la priorité ;
- le rejet des plages actives qui se chevauchent ;
- le rejet de seuils invalides.

Implémentation principale :

- `apps/backend/test/sanctions.e2e-spec.ts`
- `apps/backend/src/modules/sanctions/sanctions.service.ts`

### 4.3 Rendu PDF mensuel

`monthly-attendance-puppeteer-renderer.e2e-spec.ts` teste directement `MonthlyAttendancePuppeteerPdfRendererService`. La suite vérifie le HTML et les décisions de pagination sans exécuter une navigation utilisateur frontend.

Les cinq cas couvrent :

- la table détaillée d'un employé sans données GPS ni marqueurs de remplacement ;
- la lisibilité visuelle des scores très faibles sans modification du score ;
- le maintien sur une page de détail pour un rapport comportant 21 lignes ;
- le rééquilibrage des groupes afin d'éviter une dernière page contenant une seule ligne ;
- l'absence de repli silencieux vers le moteur PDF historique lorsque le mode premium échoue.

Implémentation principale :

- `apps/backend/test/monthly-attendance-puppeteer-renderer.e2e-spec.ts`
- `apps/backend/src/modules/attendance/exports/monthly-attendance-puppeteer-pdf-renderer.service.ts`

### 4.4 Configuration et stockage photo

`environment-validation.e2e-spec.ts` mélange des tests directs de fonctions, la compilation d'`AppModule` et des appels directs à `AttendancePhotoStorageService`.

Les six cas vérifient :

- le rejet de rayons de sécurité incohérents ;
- la résolution des fichiers `.env` depuis la racine backend ;
- le démarrage de la sécurité de pointage sans identifiants Cloudinary ;
- l'exigence des identifiants Cloudinary au moment du stockage photo ;
- les nouvelles tentatives après des erreurs transitoires de téléversement ;
- la conversion d'une absence de réponse Cloudinary en erreur de timeout explicite.

Les appels réseau Cloudinary sont simulés par `jest.spyOn(global, 'fetch')`.

Implémentation principale :

- `apps/backend/test/environment-validation.e2e-spec.ts`
- `apps/backend/src/app.module.ts`
- `apps/backend/src/modules/attendance/attendance-photo-storage.service.ts`

### 4.5 Tests unitaires absents

Aucun fichier ciblé par une configuration Jest distincte pour les suffixes usuels `*.spec.ts` ou `*.test.ts` n'est présent. Les tests directs de services sont intégrés à la configuration et au nommage E2E.

Le frontend ne contient aucun test unitaire de page, composant, hook, provider, service ou utilitaire. React Testing Library, Vitest et Jest DOM ne figurent pas dans les dépendances observées.

### 4.6 Couverture observée

La couverture ne peut pas être exprimée en pourcentage à partir du dépôt :

- `collectCoverage` n'est pas configuré ;
- aucun script n'ajoute `--coverage` ;
- aucun seuil de lignes, branches, fonctions ou instructions n'est déclaré ;
- aucun rapport de couverture versionné n'est présent.

La couverture fonctionnelle observable est donc décrite par les scénarios présents, et non par une métrique instrumentée.

## 5. Tests d'intégration

### 5.1 Intégration calendrier RH et absences

`attendance-calendar-absence.e2e-spec.ts` initialise l'application NestJS, utilise un client Prisma réel et appelle directement les services de pointage, de métriques mensuelles et d'export.

Les scénarios vérifient :

- l'absence de génération d'absence pendant un week-end, un jour férié public ou un jour férié d'entreprise ;
- la génération d'une absence pendant un jour ouvré attendu ;
- l'exclusion des jours non travaillés des décomptes d'absence du rapport mensuel.

La suite crée des plannings, employés et entrées de calendrier dédiés. Elle contrôle aussi le temps applicatif par espionnage de `AppClockService`.

Fichiers concernés :

- `apps/backend/test/attendance-calendar-absence.e2e-spec.ts`
- `apps/backend/src/modules/attendance/attendance.service.ts`
- `apps/backend/src/modules/attendance/attendance-monthly-metrics.service.ts`
- `apps/backend/src/modules/attendance/exports/monthly-attendance-export.service.ts`
- `apps/backend/src/modules/calendar/calendar.service.ts`
- `apps/backend/src/common/time/app-clock.service.ts`

### 5.2 Intégration des pointages pendant les jours non travaillés

`non-working-day-attendance.e2e-spec.ts` utilise NestJS et PostgreSQL pour contrôler :

- un pointage de week-end traité comme travail hors jour ouvré, sans retard ni sanction ;
- un pointage de jour férié public dont toute la durée travaillée devient heure supplémentaire ;
- le même traitement pour un jour férié d'entreprise ;
- la conservation du calcul de retard et de départ anticipé pendant un jour ouvré ;
- l'exposition du travail hors jour ouvré dans les totaux d'heures supplémentaires du rapport mensuel.

Fichiers concernés :

- `apps/backend/test/non-working-day-attendance.e2e-spec.ts`
- `apps/backend/src/modules/attendance/attendance.service.ts`
- `apps/backend/src/modules/attendance/attendance-calculation.service.ts`
- `apps/backend/src/modules/calendar/calendar.service.ts`
- `apps/backend/src/modules/attendance/exports/monthly-attendance-export.service.ts`

### 5.3 Intégration avec PostgreSQL

`prepareTestDatabase()` réalise les opérations suivantes :

1. applique l'environnement de test ;
2. extrait le nom de base depuis l'URL ;
3. ouvre une connexion administrative sur la base `postgres` ;
4. termine les connexions actives vers la base cible ;
5. supprime puis recrée la base cible ;
6. exécute `prisma migrate deploy` avec le schéma du backend ;
7. exécute `seedDatabase()` avec la date de référence `2026-04-20`.

Le helper réécrit `HOME`, `USERPROFILE`, `TEMP` et `TMP` pour l'invocation Prisma CLI et utilise le dossier `.tmp` du dépôt comme espace temporaire.

L'opération est destructive pour la base désignée par `TEST_DATABASE_URL` ou, à défaut, par la valeur sélectionnée dans `test-environment.ts`. Le README contient un avertissement explicite interdisant de pointer les fichiers d'environnement de test vers la base de développement.

Fichiers concernés :

- `apps/backend/test/test-database.ts`
- `apps/backend/test/test-environment.ts`
- `apps/backend/prisma/schema.prisma`
- `apps/backend/prisma/migrations/`
- `apps/backend/prisma/seed.ts`
- `README.md`

### 5.4 Intégration proxy frontend–backend

`validate-proxy.mjs` constitue un test d'intégration autonome hors Jest. Il :

1. réserve deux ports localhost disponibles ;
2. démarre le backend NestJS en mode développement ;
3. attend la réponse du healthcheck backend ;
4. démarre Next.js en mode développement ;
5. attend les healthchecks backend et frontend ;
6. vérifie la redirection backend de `/api/v1/attendance/entry` vers la page frontend `/attendance-entry` ;
7. vérifie la structure de la réponse santé obtenue directement et via le proxy frontend ;
8. termine les deux processus, y compris en cas d'erreur.

Le script conserve au maximum 80 lignes récentes par processus pour enrichir l'erreur. Sous Windows, il termine l'arbre de processus avec `taskkill`. Sur les autres plateformes, il utilise `SIGTERM`, puis `SIGKILL` après trois secondes si nécessaire.

Fichiers concernés :

- `scripts/validate-proxy.mjs`
- `apps/frontend/app/api/health/route.ts`
- `apps/frontend/lib/backend-proxy.ts`
- `apps/backend/src/app.controller.ts`
- `apps/backend/src/modules/attendance/attendance.controller.ts`

## 6. Tests End-to-End

### 6.1 Organisation et exécution

La configuration Jest sélectionne exclusivement les fichiers correspondant à `.*\\.e2e-spec\\.ts$` sous la racine backend. Elle charge `test-setup.ts`, transforme TypeScript avec `ts-jest` et utilise Node.js comme environnement.

La commande d'exécution est :

```text
pnpm test
  -> pnpm test:backend
     -> Jest --runInBand --config ./test/jest-e2e.json
```

Le serveur HTTP n'écoute pas sur un port externe pour les suites Supertest. NestJS est initialisé par `createNestApplication()` et Supertest cible `app.getHttpServer()`.

Fichiers concernés :

- `package.json`
- `apps/backend/package.json`
- `apps/backend/test/jest-e2e.json`

### 6.2 Initialisation de l'application testée

Les suites HTTP créent `AppModule` via `Test.createTestingModule()`, installent le préfixe global `api/v1` et reproduisent le `ValidationPipe` avec :

- suppression des propriétés non déclarées par `whitelist` ;
- rejet des propriétés supplémentaires par `forbidNonWhitelisted` ;
- transformation des entrées ;
- conversion implicite activée.

Les instances Prisma et NestJS sont fermées dans `afterAll`.

Fichiers concernés :

- `apps/backend/test/app.e2e-spec.ts`
- `apps/backend/test/calendar.e2e-spec.ts`
- `apps/backend/test/attendance-calendar-absence.e2e-spec.ts`
- `apps/backend/test/non-working-day-attendance.e2e-spec.ts`
- `apps/backend/src/main.ts`

### 6.3 Scénarios API principaux

La suite `app.e2e-spec.ts` contient 70 cas.

| Domaine                   | Scénarios observés                                                                                              |
| ------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Santé                     | Réponse de `/api/v1/health`                                                                                     |
| Authentification générale | Connexion, utilisateur courant et validation de configuration de production                                     |
| Borne de pointage         | Connexion par PIN, jeton court, migration d'un PIN historique, erreur générique et limitation des tentatives    |
| Session frontend          | Priorité de la session de borne et absence de repli vers la session applicative normale                         |
| Autorisation              | Refus sans authentification, refus du rôle employé, accès administrateur                                        |
| Employés                  | Liste, création, unicité et robustesse du PIN, lecture, modification, activation, rôle, département et planning |
| Plannings                 | Liste, validation de fenêtre, création, lecture, modification et état actif                                     |
| Pointage personnel        | Résumé du jour, politique de sécurité, entrée, sortie et historique                                             |
| Règles temporelles        | Date future, doublons, retard, départ anticipé, sortie exacte, heures supplémentaires et jour hors planning     |
| GPS                       | Données disponibles, absence, précision, rayons et commentaire hors zone                                        |
| Selfie                    | Preuve obligatoire à l'entrée et à la sortie lorsque la sécurité le demande                                     |
| Snapshot planning         | Stockage, stabilité après modification du planning et repli des pointages historiques                           |
| Exports                   | Autorisation, validation de période, recalcul en lecture seule, CSV, PDF général et PDF employé                 |
| Dashboard                 | Taux de présence hors jours non travaillés et travail hors planning                                             |

Implémentation principale :

- `apps/backend/test/app.e2e-spec.ts`
- `apps/backend/src/app.module.ts`
- `apps/backend/src/modules/auth/`
- `apps/backend/src/modules/employees/`
- `apps/backend/src/modules/schedules/`
- `apps/backend/src/modules/attendance/`
- `apps/backend/src/modules/dashboard/`

### 6.4 Scénario E2E du calendrier

`calendar.e2e-spec.ts` rassemble le cycle fonctionnel dans un cas séquentiel :

- authentification administrateur ;
- création d'un jour férié public ;
- création d'un jour férié d'entreprise ;
- modification du jour public ;
- lecture d'un mois et de ses statistiques ;
- classification des jours fériés et du week-end ;
- lecture de la liste ;
- suppression ;
- contrôle de l'absence de l'élément supprimé.

Implémentation principale :

- `apps/backend/test/calendar.e2e-spec.ts`
- `apps/backend/src/modules/calendar/calendar.controller.ts`
- `apps/backend/src/modules/calendar/calendar.service.ts`

### 6.5 Dépendances d'exécution

| Dépendance      | Utilisation                                                              |
| --------------- | ------------------------------------------------------------------------ |
| PostgreSQL      | Base dédiée recréée par les suites qui appellent `prepareTestDatabase()` |
| Prisma Client   | Préparation des données et assertions de persistance                     |
| Prisma CLI      | Déploiement des migrations avant les scénarios                           |
| Seed Prisma     | État initial reproductible                                               |
| NestJS Testing  | Construction d'`AppModule`                                               |
| Supertest       | Appels HTTP sur le serveur NestJS en mémoire                             |
| Jest            | Orchestration, assertions, mocks et espions                              |
| `ts-jest`       | Transformation TypeScript                                                |
| Node.js `fetch` | Simulation contrôlée de Cloudinary et validation du proxy                |
| Next.js         | Serveur réel lancé par `validate-proxy.mjs`                              |

### 6.6 Tests E2E absents

Le dépôt ne contient pas :

- de parcours navigateur automatisé ;
- de test d'interaction DOM ;
- de test de responsive design ;
- de test d'accessibilité automatisé ;
- de capture ou comparaison visuelle ;
- de scénario mobile automatisé ;
- de test d'installation PWA ou de service worker.

## 7. Validation de la qualité

### 7.1 ESLint

La configuration ESLint plate est centralisée dans `eslint.config.mjs`. Elle applique :

- les règles recommandées JavaScript ;
- les règles recommandées TypeScript ESLint ;
- les règles recommandées et Core Web Vitals de Next.js au frontend ;
- l'erreur sur les variables inutilisées, sauf préfixe `_` ;
- la désactivation de `no-explicit-any` ;
- la désactivation de `no-undef`, les globals étant déclarés ;
- la désactivation de `no-html-link-for-pages` et `no-img-element` pour le frontend ;
- la compatibilité Prettier par `eslint-config-prettier`.

Les dossiers générés, couvertures, migrations, dépendances et artefacts de build sont exclus.

Commandes :

| Commande        | Comportement                               |
| --------------- | ------------------------------------------ |
| `pnpm lint`     | Exécute ESLint sur le workspace            |
| `pnpm lint:fix` | Exécute ESLint avec correction automatique |

Fichiers concernés :

- `eslint.config.mjs`
- `package.json`

### 7.2 Prettier

Prettier 3 est déclaré à la racine. Aucun fichier de configuration Prettier spécifique n'est présent ; les valeurs par défaut et la détection native de Prettier s'appliquent.

| Commande            | Comportement                         |
| ------------------- | ------------------------------------ |
| `pnpm format`       | Écrit le format calculé par Prettier |
| `pnpm format:check` | Vérifie le format sans écrire        |

`format:check` est la première étape de `pnpm validate`.

Fichiers concernés :

- `package.json`
- `eslint.config.mjs`

### 7.3 TypeScript

Le backend et le frontend activent `strict`.

Le contrôle racine exécute les deux compilateurs sans émission et sans cache incrémental :

```text
pnpm typecheck
  |
  +--> typecheck:backend
  |      tsc --noEmit --incremental false -p tsconfig.json
  |
  +--> typecheck:frontend
         tsc --noEmit --incremental false
```

Le `tsconfig.json` backend inclut `src/**/*.ts` et `test/**/*.ts`. Le contrôle de types backend couvre donc aussi les fichiers de test. Son `tsconfig.build.json` exclut le dossier `test` et les fichiers `*.spec.ts` du build de production.

Le `tsconfig.json` frontend inclut les fichiers TypeScript/TSX, `next-env.d.ts` et les types générés sous `.next/types`.

Fichiers concernés :

- `package.json`
- `apps/backend/tsconfig.json`
- `apps/backend/tsconfig.build.json`
- `apps/frontend/tsconfig.json`

### 7.4 Compilation

| Commande              | Outil    | Périmètre                   |
| --------------------- | -------- | --------------------------- |
| `pnpm build:backend`  | Nest CLI | Compilation de l'API NestJS |
| `pnpm build:frontend` | Next CLI | Build de production Next.js |
| `pnpm build`          | pnpm     | Backend, puis frontend      |

Le build Next.js n'est pas utilisé comme contrôle ESLint. Cette séparation est explicitement décrite dans le README, et `pnpm validate` exécute `pnpm lint` indépendamment.

Fichiers concernés :

- `package.json`
- `apps/backend/nest-cli.json`
- `apps/frontend/next.config.ts`
- `README.md`

### 7.5 Scripts composés

| Script              | Séquence réellement exécutée                                                                                                 |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `check`             | lint → typecheck backend et frontend → build backend et frontend                                                             |
| `validate:backend`  | Prisma generate → typecheck backend → tests backend → build backend                                                          |
| `validate:frontend` | typecheck frontend → build frontend → validation proxy                                                                       |
| `validate`          | format check → Prisma generate → typecheck global → lint → tests backend → build frontend → build backend → validation proxy |
| `test`              | alias de `test:backend`                                                                                                      |

La séquence `validate` est locale et définie dans `package.json`. Aucun workflow CI versionné ne l'appelle automatiquement dans le dépôt.

### 7.6 Prisma

`pnpm prisma:generate` fait partie de `validate` et `validate:backend`. Les suites d'intégration appliquent les migrations à une base recréée avant d'exécuter le seed.

La checklist de release demande également :

- la vérification de la présence et de l'ordre des migrations ;
- l'exécution de `prisma generate` ;
- le contrôle du statut des migrations ;
- l'exécution des migrations de déploiement.

Fichiers concernés :

- `package.json`
- `apps/backend/test/test-database.ts`
- `docs/RELEASE_CHECKLIST.md`

### 7.7 Vérifications manuelles

`docs/RELEASE_CHECKLIST.md` décrit des contrôles humains en complément des commandes :

- état du dépôt et présence des fichiers attendus ;
- migrations et génération Prisma ;
- commandes lint, typecheck, tests et build ;
- vérification d'un PDF premium généré ;
- contrôle d'un PDF général et d'un PDF employé ;
- contrôle de la sortie CSV ;
- contrôle du pointage intelligent ;
- contrôle des variables et prérequis de déploiement.

Ces éléments sont des procédures documentées, pas des assertions automatisées.

### 7.8 Outillage absent

Les mécanismes suivants ne sont pas trouvés :

- SonarQube ou SonarCloud ;
- analyse de dépendances automatisée versionnée ;
- scanner SAST ou DAST configuré ;
- outil de mesure de complexité ;
- rapport JUnit configuré ;
- publication de couverture ;
- hook Git versionné de type Husky ou Lefthook ;
- pipeline CI/CD dans `.github/workflows`.

## 8. Pipeline de validation

### 8.1 Flux principal

Le flux exécutable le plus complet est `pnpm validate`.

```text
Développeur
    |
    v
pnpm validate
    |
    v
Prettier --check
    |
    v
Prisma Client generate
    |
    v
TypeScript backend + frontend
    |
    v
ESLint workspace
    |
    v
Jest backend (107 cas, séquentiels)
    |
    v
Build Next.js
    |
    v
Build NestJS
    |
    v
Validation proxy Next.js -> NestJS
    |
    v
Succès ou code de sortie non nul
```

La séquence diffère de la représentation simplifiée « lint → compilation → tests » : dans l'implémentation, le format et Prisma précèdent le typage, les tests backend précèdent les builds et la validation proxy termine le processus.

### 8.2 Échec et arrêt

Les scripts composés utilisent `&&`. Une commande qui retourne un code non nul interrompt la chaîne.

Jest s'exécute avec `--runInBand`, donc les fichiers ne sont pas parallélisés par workers. Les suites qui recréent la même base de test ne s'exécutent pas simultanément dans cette commande.

`validate-proxy.mjs` affecte `process.exitCode = 1` en cas d'échec. Son bloc `finally` tente de terminer les processus backend et frontend démarrés.

### 8.3 Flux ciblés

```text
validate:backend
    |
    +--> Prisma generate
    +--> TypeScript backend
    +--> Jest backend
    +--> Build NestJS

validate:frontend
    |
    +--> TypeScript frontend
    +--> Build Next.js
    +--> Démarrage NestJS + Next.js
    +--> Validation HTTP du proxy
```

Sources :

- `package.json`
- `scripts/validate-proxy.mjs`
- `README.md`

## 9. Dépendances

### 9.1 Chaîne d'interaction

```text
Tests Jest
    |
    +--> fonctions et services métier
    |
    +--> AppModule NestJS
             |
             +--> Controllers API <--- Supertest
             |
             +--> Services
                     |
                     v
                Prisma Client
                     |
                     v
             PostgreSQL de test

Validation proxy
    |
    +--> processus Next.js
    |         |
    |         v
    |    route proxy /api/health
    |         |
    +---------+--> processus NestJS
                       |
                       v
                  API /api/v1/health
```

### 9.2 Dépendances de test backend

| Paquet             | Responsabilité                                                               |
| ------------------ | ---------------------------------------------------------------------------- |
| `jest`             | Runner, assertions et mocks                                                  |
| `@types/jest`      | Types TypeScript de Jest                                                     |
| `ts-jest`          | Transformation des sources TypeScript                                        |
| `@nestjs/testing`  | Construction du module applicatif de test                                    |
| `supertest`        | Requêtes HTTP sur le serveur NestJS                                          |
| `@types/supertest` | Types TypeScript de Supertest                                                |
| `ts-node`          | Exécution TypeScript utilisée par les scripts backend, pas par Jest lui-même |
| `@prisma/client`   | Accès à la base dans les suites                                              |
| `prisma`           | Application des migrations par le helper                                     |

Fichier concerné :

- `apps/backend/package.json`

### 9.3 Dépendances d'infrastructure

Les tests PostgreSQL nécessitent :

- un serveur PostgreSQL accessible ;
- une base cible que le compte peut supprimer et recréer ;
- la capacité de terminer les connexions à cette base ;
- les migrations Prisma du dépôt ;
- le seed backend.

Le flux documenté dans le README commence par `pnpm db:up`, puis `pnpm test:backend`. Le service PostgreSQL local est défini dans `docker-compose.yml`.

### 9.4 Dépendances frontend

Le frontend ne déclare aucune dépendance de test. Sa qualité est contrôlée par :

- TypeScript ;
- ESLint à la racine ;
- le build Next.js ;
- le script externe `validate-proxy.mjs`.

Fichiers concernés :

- `apps/frontend/package.json`
- `apps/frontend/tsconfig.json`
- `apps/frontend/next.config.ts`
- `eslint.config.mjs`
- `scripts/validate-proxy.mjs`

## 10. Traçabilité

### 10.1 Matrice des contrôles

| Élément contrôlé                  | Tests ou validation            | Fichiers principaux                                                                                        |
| --------------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Healthcheck API                   | E2E HTTP                       | `apps/backend/test/app.e2e-spec.ts`, `apps/backend/src/app.controller.ts`                                  |
| Authentification utilisateur      | E2E HTTP                       | `apps/backend/test/app.e2e-spec.ts`, `apps/backend/src/modules/auth/`                                      |
| Authentification de borne par PIN | E2E HTTP                       | `apps/backend/test/app.e2e-spec.ts`, `apps/backend/src/modules/auth/`                                      |
| RBAC administrateur/employé       | E2E HTTP                       | `apps/backend/test/app.e2e-spec.ts`, `apps/backend/src/common/guards/`                                     |
| Employés                          | E2E HTTP                       | `apps/backend/test/app.e2e-spec.ts`, `apps/backend/src/modules/employees/`                                 |
| Plannings                         | E2E HTTP                       | `apps/backend/test/app.e2e-spec.ts`, `apps/backend/src/modules/schedules/`                                 |
| Pointage entrée/sortie            | E2E HTTP                       | `apps/backend/test/app.e2e-spec.ts`, `apps/backend/src/modules/attendance/`                                |
| GPS et selfie                     | E2E HTTP et tests de service   | `apps/backend/test/app.e2e-spec.ts`, `apps/backend/test/environment-validation.e2e-spec.ts`                |
| Historique personnel              | E2E HTTP                       | `apps/backend/test/app.e2e-spec.ts`                                                                        |
| Snapshot planning                 | E2E HTTP et persistance        | `apps/backend/test/app.e2e-spec.ts`                                                                        |
| Exports CSV/PDF                   | E2E HTTP et tests du renderer  | `apps/backend/test/app.e2e-spec.ts`, `apps/backend/test/monthly-attendance-puppeteer-renderer.e2e-spec.ts` |
| Calendrier RH CRUD                | E2E HTTP                       | `apps/backend/test/calendar.e2e-spec.ts`                                                                   |
| Calendrier et absences            | Intégration services/base      | `apps/backend/test/attendance-calendar-absence.e2e-spec.ts`                                                |
| Jours non travaillés              | Intégration services/base      | `apps/backend/test/non-working-day-attendance.e2e-spec.ts`                                                 |
| Sanctions                         | Tests directs avec mocks       | `apps/backend/test/sanctions.e2e-spec.ts`                                                                  |
| Configuration backend             | Tests directs et module NestJS | `apps/backend/test/environment-validation.e2e-spec.ts`                                                     |
| Proxy frontend–backend            | Script d'intégration HTTP      | `scripts/validate-proxy.mjs`                                                                               |
| Typage backend/frontend           | TypeScript                     | `apps/backend/tsconfig.json`, `apps/frontend/tsconfig.json`                                                |
| Règles statiques                  | ESLint                         | `eslint.config.mjs`                                                                                        |
| Format                            | Prettier                       | `package.json`                                                                                             |
| Build backend                     | Nest CLI                       | `package.json`, `apps/backend/nest-cli.json`                                                               |
| Build frontend                    | Next CLI                       | `package.json`, `apps/frontend/next.config.ts`                                                             |

### 10.2 Traçabilité de l'environnement

| Comportement                                             | Fichier                                                              |
| -------------------------------------------------------- | -------------------------------------------------------------------- |
| Passage forcé de `NODE_ENV` à `test`                     | `apps/backend/test/test-environment.ts`                              |
| Chargement optionnel de `.env.test.local` et `.env.test` | `apps/backend/test/test-environment.ts`                              |
| Priorité de `TEST_DATABASE_URL`                          | `apps/backend/test/test-environment.ts`                              |
| Valeur de repli de la base de test locale                | `apps/backend/test/test-environment.ts`                              |
| Suppression et recréation de la base                     | `apps/backend/test/test-database.ts`                                 |
| Déploiement des migrations                               | `apps/backend/test/test-database.ts`                                 |
| Seed à date fixe                                         | `apps/backend/test/test-database.ts`, `apps/backend/prisma/seed.ts`  |
| Initialisation avant les suites                          | `apps/backend/test/test-setup.ts`, `apps/backend/test/jest-e2e.json` |

### 10.3 Traçabilité des commandes

| Commande                 | Déclaration                                  |
| ------------------------ | -------------------------------------------- |
| `pnpm lint`              | `package.json`                               |
| `pnpm format:check`      | `package.json`                               |
| `pnpm typecheck`         | `package.json`                               |
| `pnpm build`             | `package.json`                               |
| `pnpm test:backend`      | `package.json`, `apps/backend/package.json`  |
| `pnpm test:proxy`        | `package.json`, `scripts/validate-proxy.mjs` |
| `pnpm validate`          | `package.json`                               |
| `pnpm validate:backend`  | `package.json`                               |
| `pnpm validate:frontend` | `package.json`                               |

### 10.4 Documentation d'exécution

Le README documente :

- la base dédiée `konatech_attendance_test` ;
- les fichiers `.env.test` et `.env.test.local` ;
- l'ordre `pnpm db:up` puis `pnpm test:backend` ;
- la commande backend directe ;
- la validation du proxy ;
- le tableau des commandes de qualité ;
- le flux complet de validation ;
- le diagnostic des échecs du proxy ;
- l'avertissement sur la destruction de la base cible.

La checklist de release complète cette documentation par des contrôles manuels.

Fichiers concernés :

- `README.md`
- `docs/RELEASE_CHECKLIST.md`

## 11. Observations techniques

### 11.1 Nommage des suites

La configuration Jest ne sélectionne que les fichiers `e2e-spec.ts`. Des tests unitaires ou de service avec mocks, notamment sanctions et rendu PDF, utilisent ce même suffixe et la même configuration.

### 11.2 Couverture non instrumentée

Aucune collecte ni aucun seuil de couverture n'est configuré. Aucun pourcentage de couverture fiable n'est donc disponible dans le dépôt.

### 11.3 Couverture backend concentrée

Les 107 cas Jest concernent exclusivement le backend ou des modules frontend importés ponctuellement par la suite backend. La majorité des scénarios HTTP et métier se trouve dans `app.e2e-spec.ts`, qui contient 70 cas et plus de 2 500 lignes.

### 11.4 Tests frontend absents

Aucune suite de tests dédiée aux pages, composants, hooks, services, providers ou routes frontend n'est présente. Aucun framework de test React ni outil E2E navigateur n'est déclaré.

### 11.5 Validation frontend existante

Le frontend est contrôlé par TypeScript, ESLint, le build Next.js et le test de proxy. Ces contrôles ne simulent pas les interactions d'un utilisateur avec le DOM.

### 11.6 Base de test recréée

Les suites qui appellent `prepareTestDatabase()` suppriment et recréent intégralement la base désignée. L'exécution séquentielle par `--runInBand` évite la recréation concurrente par plusieurs workers dans la commande fournie.

### 11.7 Préparation répétée

Chaque suite d'intégration concernée appelle elle-même `prepareTestDatabase()` dans `beforeAll`. La base, les migrations et le seed sont donc réinitialisés au démarrage de chacune de ces suites.

### 11.8 Données de test

Aucun répertoire de fixtures ou de mocks partagé n'est présent. Les données sont réparties entre le seed Prisma, les créations Prisma propres aux suites et les objets simulés déclarés localement.

### 11.9 Dépendance à PostgreSQL

Les suites avec persistance ne disposent pas d'une base en mémoire. Elles requièrent PostgreSQL et les privilèges nécessaires à la terminaison des connexions, à la suppression et à la création de la base cible.

### 11.10 Exécution séquentielle

La commande Jest racine et celle du backend utilisent `--runInBand`. Aucun mode parallèle n'est défini par les scripts existants.

### 11.11 Configuration Jest unique

Une seule configuration Jest est présente. Elle ne sépare pas les tests de services, d'intégration et E2E en projets ou commandes distincts.

### 11.12 Absence de pipeline CI versionné

Aucun fichier sous `.github/workflows` et aucune autre configuration de plateforme CI n'ont été trouvés. Les commandes de validation sont définies pour une exécution locale ou manuelle.

### 11.13 Contrôles de release manuels

Plusieurs validations de PDF, CSV, pointage intelligent et déploiement sont décrites dans `docs/RELEASE_CHECKLIST.md` comme contrôles manuels. Elles ne correspondent pas toutes à des scripts automatisés.

### 11.14 Build et lint séparés

Le build Next.js ne constitue pas le contrôle lint du projet. ESLint est exécuté séparément dans `check` et `validate`, conformément au README et à la configuration Next.js.

### 11.15 Format sans configuration dédiée

Prettier est déclaré et exécuté, mais aucun fichier de configuration Prettier propre au dépôt n'est présent.

### 11.16 Rapports de test absents

Jest utilise son reporting standard. Aucun reporter JUnit, rapport HTML, artefact de résultats ou historique d'exécution n'est configuré.

### 11.17 Tests non fonctionnels absents

Aucun test de charge, endurance, montée en charge, accessibilité, compatibilité navigateur, comparaison visuelle ou sécurité dynamique n'est présent.

### 11.18 Isolation des services externes

Les scénarios Cloudinary de la suite d'environnement simulent `fetch`. Ils ne contactent pas le service Cloudinary réel. Le rendu PDF testé directement ne constitue pas un test complet d'un navigateur utilisateur.

### 11.19 Timeout

Les suites principales utilisant l'application et PostgreSQL fixent un timeout Jest de 30 secondes. La validation proxy utilise 45 secondes pour le backend et jusqu'à 60 secondes pour le healthcheck frontend.

### 11.20 Documentation qualité

Les commandes et précautions de test sont documentées dans le README et la checklist de release. Aucun document distinct de plan de test, matrice d'exigences QA ou rapport de campagne n'est présent dans le dépôt.
