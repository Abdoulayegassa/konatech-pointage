# Tests

| Métadonnée         | Valeur          |
| ------------------ | --------------- |
| Document ID        | DG-010          |
| Titre              | Tests           |
| Version            | 1.0             |
| Statut             | Validé          |
| Classification     | Interne         |
| Référence          | Developer Guide |
| Date de génération | 30 juillet 2026 |

## 1. Présentation

### 1.1 Objectif

Ce chapitre décrit les mécanismes de test réellement présents dans le dépôt Konatech Pointage. Il couvre les suites Jest du backend, les tests HTTP avec Supertest, les intégrations avec PostgreSQL et Prisma, les tests isolés de services, ainsi que le script Node de validation de la connexion entre le frontend et le backend.

Il inventorie également les mécanismes absents lorsque cette absence délimite la stratégie observable : aucun test de composant frontend, aucun outil de test navigateur et aucun rapport de couverture versionné ne sont présents.

### 1.2 Stratégie observée

Le dépôt utilise deux chemins d'exécution :

1. une commande Jest backend qui sélectionne tous les fichiers `*.e2e-spec.ts` ;
2. un script Node autonome qui démarre le backend et le frontend afin de vérifier le proxy et le câblage des URL publiques.

La collection Jest contient plusieurs niveaux de test malgré son suffixe commun :

- des parcours HTTP sur une application NestJS complète ;
- des tests d'intégration appelant des services NestJS avec une base PostgreSQL réelle ;
- des tests de services instanciés directement avec des dépendances simulées ;
- des tests de configuration et de stockage externe avec `fetch` simulé ;
- des tests de génération HTML/PDF instanciant directement les exporteurs.

Les sept suites Jest contiennent 107 cas déclarés avec `it`.

## 2. Architecture des tests

### 2.1 Outils utilisés

| Outil             | Utilisation réellement observée                                              |
| ----------------- | ---------------------------------------------------------------------------- |
| Jest 29           | Exécution, organisation, assertions, spies et mocks                          |
| `ts-jest`         | Transformation des fichiers TypeScript pendant l'exécution Jest              |
| `@nestjs/testing` | Construction d'`AppModule` dans un module de test NestJS                     |
| Supertest         | Appels HTTP directs à `app.getHttpServer()`                                  |
| Prisma Client     | Préparation, lecture et vérification de la base de test                      |
| Prisma CLI        | Application des migrations avec `migrate deploy` avant certaines suites      |
| PostgreSQL        | Base réelle utilisée par les suites intégrées                                |
| Seed Prisma       | Création du jeu initial commun après recréation de la base                   |
| API Jest de mocks | `jest.fn`, `jest.spyOn`, valeurs résolues ou rejetées simulées               |
| Node.js           | Exécution de `scripts/validate-proxy.mjs`                                    |
| `fetch` natif     | Vérification des healthchecks, de la redirection et simulation de Cloudinary |

### 2.2 Types de tests présents

| Type observable                    | Présence                                            | Forme réelle                                                                              |
| ---------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Tests unitaires isolés             | Présents au sein de fichiers suffixés `e2e-spec.ts` | `SanctionsService` avec Prisma simulé ; services de rendu construits directement          |
| Tests d'intégration de services    | Présents                                            | Application NestJS et PostgreSQL réels, services récupérés avec `app.get()`               |
| Tests HTTP end-to-end backend      | Présents                                            | Application complète, routes `/api/v1`, authentification et assertions Supertest          |
| Tests de configuration             | Présents                                            | Validation Joi, résolution des fichiers d'environnement et comportement du stockage photo |
| Test de connexion frontend/backend | Présent                                             | Script Node démarrant les deux applications et vérifiant le proxy santé                   |
| Tests unitaires frontend           | Absents                                             | Aucun fichier de test dans `apps/frontend`                                                |
| Tests de composants frontend       | Absents                                             | Aucune bibliothèque ni suite de rendu de composants                                       |
| Tests end-to-end navigateur        | Absents                                             | Playwright, Cypress et outils équivalents ne sont pas configurés                          |
| Tests visuels                      | Absents                                             | Aucun mécanisme de comparaison d'images ou de snapshots visuels                           |

### 2.3 Diagramme d'architecture

```text
                         pnpm test
                              |
                              v
                    pnpm test:backend
                              |
                              v
                 Jest + test/jest-e2e.json
                              |
         ┌────────────────────┼────────────────────┐
         │                    │                    │
         v                    v                    v
  Tests HTTP           Intégrations          Tests isolés
  Supertest            de services           de services
         │                    │                    │
         v                    v                    v
 Application NestJS    AppModule NestJS       Mocks Jest
         │                    │              ou objets directs
         └──────────┬─────────┘
                    v
              Prisma Client
                    |
                    v
          PostgreSQL de test recréé
          + migrations + seed

                    pnpm test:proxy
                              |
                              v
                 scripts/validate-proxy.mjs
                              |
               ┌──────────────┴──────────────┐
               v                             v
        Backend NestJS                 Frontend Next.js
               └──────────────┬──────────────┘
                              v
                    Healthcheck et proxy
```

### 2.4 Configuration Jest

`apps/backend/test/jest-e2e.json` définit la seule configuration Jest présente :

| Paramètre              | Valeur observée                                      |
| ---------------------- | ---------------------------------------------------- |
| `rootDir`              | Racine de `apps/backend`                             |
| `testRegex`            | `.*\\.e2e-spec\\.ts$`                                |
| Transformation         | `ts-jest` pour les fichiers JavaScript et TypeScript |
| Environnement          | `node`                                               |
| Extensions             | `js`, `json`, `ts`                                   |
| Fichier de préparation | `test/test-setup.ts`                                 |

La commande ajoute `--runInBand`. Les suites sont donc exécutées séquentiellement dans un seul processus de travail Jest.

### 2.5 Mocks et doubles

Les doubles observés sont ciblés :

- `SanctionsService` reçoit un objet Prisma construit avec `jest.fn()` ;
- les résultats `findMany`, `findUnique` et `update` sont fournis avec `mockResolvedValue` ;
- `global.fetch` est surveillé pour simuler un échec Cloudinary, une reprise et un délai dépassé ;
- `AppClockService.now` est surveillé dans le scénario de calcul des absences ;
- un objet possédant une méthode `render` remplace le renderer Puppeteer dans un test de repli PDF ;
- certaines méthodes privées du renderer sont atteintes par une assertion de type afin de vérifier le document produit et le découpage des lignes.

Aucun répertoire général de fixtures ou de mocks partagés n'est présent. Les données simulées propres à une suite sont déclarées dans le fichier concerné.

## 3. Organisation des fichiers

### 3.1 Répertoire de tests backend

| Fichier                                                               | Nature observée                                                          |     Nombre de cas |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------ | ----------------: |
| `apps/backend/test/app.e2e-spec.ts`                                   | Parcours API principal, contrôles d'accès, pointage, exports et agrégats |                70 |
| `apps/backend/test/attendance-calendar-absence.e2e-spec.ts`           | Intégration calendrier, calcul mensuel et absences                       |                 2 |
| `apps/backend/test/calendar.e2e-spec.ts`                              | Parcours HTTP CRUD du calendrier                                         |                 1 |
| `apps/backend/test/environment-validation.e2e-spec.ts`                | Configuration et stockage photo Cloudinary simulé                        |                 6 |
| `apps/backend/test/monthly-attendance-puppeteer-renderer.e2e-spec.ts` | Génération du document mensuel et comportement du renderer               |                 5 |
| `apps/backend/test/non-working-day-attendance.e2e-spec.ts`            | Pointage, export et sanctions des jours non ouvrés                       |                 5 |
| `apps/backend/test/sanctions.e2e-spec.ts`                             | Règles de sanctions avec Prisma simulé                                   |                18 |
| `apps/backend/test/test-environment.ts`                               | Chargement et normalisation de l'environnement de test                   | Sans cas autonome |
| `apps/backend/test/test-database.ts`                                  | Recréation PostgreSQL, migrations et seed                                | Sans cas autonome |
| `apps/backend/test/test-setup.ts`                                     | Application de l'environnement avant les suites                          | Sans cas autonome |
| `apps/backend/test/jest-e2e.json`                                     | Configuration Jest                                                       |     Configuration |

### 3.2 Validation du proxy

| Fichier                                                           | Rôle                                                                                                               |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `scripts/validate-proxy.mjs`                                      | Réserve deux ports, démarre NestJS et Next.js, attend les healthchecks, contrôle le proxy et termine les processus |
| `apps/frontend/app/api/health/route.ts`                           | Route frontend vérifiée par le script                                                                              |
| `apps/backend/src/modules/health/health.controller.ts`            | Endpoint backend servant de référence                                                                              |
| `apps/backend/src/modules/attendance/attendance-entry.service.ts` | Construction de la redirection publique contrôlée                                                                  |

### 3.3 Fichiers de données et d'environnement utilisés

| Fichier                             | Utilisation par les tests                                      |
| ----------------------------------- | -------------------------------------------------------------- |
| `apps/backend/.env.test`            | Valeurs d'environnement de test suivies dans le dépôt          |
| `apps/backend/.env.test.local`      | Variante chargée en priorité lorsqu'elle existe localement     |
| `apps/backend/prisma/schema.prisma` | Schéma fourni à `prisma migrate deploy`                        |
| `apps/backend/prisma/migrations`    | Migrations appliquées sur la base recréée                      |
| `apps/backend/prisma/seed.ts`       | Fonction `seedDatabase` appelée avec une date fixe             |
| `compose.yaml`                      | Service PostgreSQL accessible par défaut sur le port hôte 5433 |

### 3.4 Éléments absents

Aucun des éléments suivants n'est présent dans le périmètre analysé :

- fichier Jest propre au frontend ;
- fichier de test sous `apps/frontend` ;
- configuration Vitest ;
- configuration Playwright ;
- configuration Cypress ;
- répertoire de snapshots Jest ;
- fichier de résultat JUnit ;
- rapport HTML de tests ;
- fichier `lcov.info` ;
- script de génération de couverture.

Le dossier `coverage` est ignoré par Git et ESLint, mais aucune commande de couverture n'est définie.

## 4. Exécution des tests

### 4.1 Scripts disponibles

| Commande                       | Définition réelle                                                | Portée                                                       |
| ------------------------------ | ---------------------------------------------------------------- | ------------------------------------------------------------ |
| `pnpm test`                    | Alias de `pnpm test:backend`                                     | Toutes les suites Jest sélectionnées                         |
| `pnpm test:backend`            | Jest, `--runInBand`, configuration `test/jest-e2e.json`          | Tests backend et tests isolés placés dans le même répertoire |
| `pnpm --dir apps/backend test` | Même invocation Jest depuis le package backend                   | Même portée                                                  |
| `pnpm test:proxy`              | `node ./scripts/validate-proxy.mjs`                              | Connectivité frontend/backend                                |
| `pnpm validate:backend`        | Generate Prisma, typecheck, tests backend et build backend       | Chaîne backend incluant Jest                                 |
| `pnpm validate:frontend`       | Typecheck frontend, build frontend et test proxy                 | Chaîne frontend sans test de composant                       |
| `pnpm validate`                | Format, Prisma, types, lint, tests backend, builds et test proxy | Validation globale incluant les deux mécanismes              |

Le script `check` exécute lint, typecheck et build, mais il n'appelle pas les tests.

### 4.2 Environnement Jest

`test/test-setup.ts` appelle `applyTestEnvironment()` avant le chargement des suites. Cette fonction :

1. force `NODE_ENV` à `test` ;
2. charge `.env.test.local`, puis `.env.test` sans écraser les variables déjà définies ;
3. attribue les valeurs par défaut du port et de l'URL frontend ;
4. choisit `TEST_DATABASE_URL`, puis `DATABASE_URL`, puis l'URL PostgreSQL de test par défaut ;
5. affecte l'URL retenue à `DATABASE_URL`.

L'URL par défaut cible la base `konatech_attendance_test`, PostgreSQL local, port 5433 et schéma `public`.

### 4.3 Préparation de la base

Les suites intégrées appellent `prepareTestDatabase()` dans `beforeAll`. La fonction :

1. extrait le nom de base depuis l'URL ;
2. se connecte à la base administrative `postgres` ;
3. termine les connexions actives à la base de test ;
4. supprime la base de test si elle existe ;
5. recrée cette base ;
6. exécute `prisma migrate deploy` avec le schéma du backend ;
7. ouvre un client Prisma sur la base recréée ;
8. exécute `seedDatabase` avec la date fixe `2026-04-20T00:00:00.000Z` ;
9. ferme le client de seed.

Cette préparation est destructive pour la base désignée par l'URL de test. L'exécution séquentielle configurée par `--runInBand` correspond au partage de cette infrastructure entre les suites.

### 4.4 Initialisation NestJS

Les suites HTTP et d'intégration construisent généralement :

- un module de test important `AppModule` ;
- une application NestJS avec `createNestApplication()` ;
- le préfixe global `/api/v1` ;
- un `ValidationPipe` reproduisant les options de l'application ;
- un client Prisma destiné aux préparations et vérifications.

L'application est initialisée avec `app.init()` sans écouter un port réseau. Supertest appelle directement le serveur HTTP exposé par l'adaptateur NestJS.

### 4.5 Environnement du test proxy

`validate-proxy.mjs` :

1. réserve dynamiquement un port frontend et un port backend sur `127.0.0.1` ;
2. démarre le backend avec Nest CLI ;
3. attend le healthcheck backend ;
4. démarre Next.js en développement ;
5. configure `FRONTEND_URL`, `API_BASE_URL`, `NEXT_PUBLIC_APP_URL` et `NEXT_PUBLIC_API_BASE_URL` avec ces ports ;
6. attend le healthcheck frontend ;
7. vérifie les charges de santé backend et proxy ;
8. vérifie la redirection de `/api/v1/attendance/entry` vers le frontend ;
9. termine les processus enfants.

Le script conserve en mémoire les dernières lignes de sortie de chaque processus afin de les inclure lorsqu'une erreur survient.

### 4.6 Rapports

Jest utilise son affichage standard. Aucun reporter supplémentaire n'est configuré. Aucun artefact de résultat ou de couverture n'est écrit explicitement par les scripts du dépôt.

## 5. Structure d'un test

### 5.1 Préparation

Les suites utilisent `describe` pour regrouper le sujet. La préparation varie selon le niveau :

| Niveau                  | Préparation observée                                                                    |
| ----------------------- | --------------------------------------------------------------------------------------- |
| HTTP end-to-end         | Base recréée, `AppModule` compilé, application NestJS initialisée, client Prisma ouvert |
| Intégration de services | Même application complète, puis services récupérés par `app.get()`                      |
| Service isolé           | Service construit directement avec mocks ou doubles locaux                              |
| Configuration           | Sauvegarde des variables d'environnement dans `beforeEach`                              |
| Renderer                | Constructeur direct et fonctions locales de génération des données                      |

Plusieurs suites intégrées portent le délai Jest à 30 secondes avec `jest.setTimeout(30000)`.

### 5.2 Exécution

Les tests HTTP utilisent une chaîne Supertest :

1. sélection de la méthode et de la route ;
2. ajout éventuel de l'en-tête `Authorization` ;
3. envoi éventuel d'un corps JSON ;
4. attente du statut HTTP.

Les tests d'intégration appellent aussi directement les services obtenus depuis l'application et interrogent Prisma avant ou après l'action. Les tests isolés appellent directement la méthode publique ou, dans les tests de rendu, une méthode interne atteinte par assertion de type.

### 5.3 Assertions

Les formes d'assertion observées comprennent :

- égalité stricte avec `toBe` ou structurée avec `toEqual` ;
- correspondance partielle avec `expect.objectContaining` ;
- présence dans une liste avec `expect.arrayContaining` ;
- type dynamique avec `expect.any` ;
- contenu de texte avec `toContain` et `not.toContain` ;
- exceptions synchrones avec `toThrow` ;
- promesses résolues ou rejetées avec `resolves` et `rejects` ;
- nombre d'appels d'un mock avec `toHaveBeenCalledTimes` ;
- statuts HTTP attendus avec `.expect(code)`.

Les scénarios de persistance lisent la base après l'appel afin d'assertionner les champs réellement stockés. Certains scénarios comparent aussi l'état avant et après un export pour vérifier son caractère non mutatif.

### 5.4 Nettoyage

Les suites intégrées ferment le client Prisma et l'application NestJS dans `afterAll`. La suite de configuration :

- appelle `jest.restoreAllMocks()` dans `afterEach` ;
- restaure ou supprime chaque variable d'environnement modifiée.

Le test du renderer restaure explicitement les variables liées au moteur PDF dans un bloc `finally`. Le spy de l'horloge est restauré après le scénario correspondant.

Le script de proxy termine les processus backend et frontend. Sous Windows, il utilise `taskkill`; sur les autres plateformes, il envoie `SIGTERM`, puis `SIGKILL` après délai si nécessaire.

### 5.5 Réutilisation interne

Les suites définissent des aides locales pour :

- ouvrir une session administrateur ou employé ;
- construire les preuves de pointage ;
- créer les données attendues ;
- sauvegarder et restaurer une configuration ;
- détecter l'exposition de secrets de PIN ;
- construire un rapport mensuel ou des lignes quotidiennes ;
- créer un service avec un Prisma simulé.

Les aides partagées entre suites sont limitées à `prepareTestDatabase`, `applyTestEnvironment` et au fichier de préparation Jest.

## 6. Couverture fonctionnelle

### 6.1 Modules et mécanismes couverts

| Périmètre                       | Couverture observable                                                                                    | Suites                                    |
| ------------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Santé                           | Réponse de l'endpoint backend et passage par le proxy frontend                                           | `app.e2e-spec.ts`, `validate-proxy.mjs`   |
| Authentification administrateur | Connexion, utilisateur courant et jeton                                                                  | `app.e2e-spec.ts`                         |
| Authentification PIN            | Jeton court, migration d'un PIN historique, erreurs génériques et limitation des tentatives              | `app.e2e-spec.ts`                         |
| Sessions frontend               | Sélection de la session terminal sans repli sur la session normale                                       | `app.e2e-spec.ts`                         |
| Autorisations                   | Accès administrateur/employé sur dashboard, employés, plannings, pointages et exports                    | `app.e2e-spec.ts`                         |
| Dashboard                       | Vue d'ensemble et agrégats de présence, jours non ouvrés et travail hors planning                        | `app.e2e-spec.ts`                         |
| Employés                        | Liste, détail, création, validation PIN, modification, statut, rôle, département et planning             | `app.e2e-spec.ts`                         |
| Plannings                       | Liste, création, validation horaire, détail, modification et statut                                      | `app.e2e-spec.ts`                         |
| Pointage                        | État du jour, entrée, sortie, ordre, doublons, dates, retard, sortie anticipée et heures supplémentaires | `app.e2e-spec.ts`                         |
| Sécurité du pointage            | Selfie, GPS, précision, rayon, commentaire hors zone et métadonnées                                      | `app.e2e-spec.ts`                         |
| Instantané planning             | Stockage, usage après modification et repli historique                                                   | `app.e2e-spec.ts`                         |
| Historique                      | Historique employé et bornes mensuelles UTC                                                              | `app.e2e-spec.ts`                         |
| Calendrier RH                   | CRUD HTTP, classement des journées, week-ends et jours fériés                                            | `calendar.e2e-spec.ts`                    |
| Absences                        | Exclusion des week-ends et jours fériés dans le recalcul et les rapports                                 | `attendance-calendar-absence.e2e-spec.ts` |
| Jours non ouvrés                | Statut, retard, heures supplémentaires, export et absence de sanction                                    | `non-working-day-attendance.e2e-spec.ts`  |
| Sanctions                       | Règles par défaut et en base, seuils, tolérance, montants, statut, priorité et chevauchement             | `sanctions.e2e-spec.ts`                   |
| Exports CSV                     | Autorisation, validation, libellés, contenu et absence de mutation                                       | `app.e2e-spec.ts`                         |
| Exports PDF                     | Réponse HTTP, contenu HTML, pagination, score et indisponibilité du renderer                             | `app.e2e-spec.ts`, suite renderer         |
| Configuration                   | Cohérence des rayons, résolution des fichiers d'environnement et démarrage du module                     | Suite de validation d'environnement       |
| Cloudinary                      | Configuration différée, nouvelle tentative et délai dépassé avec `fetch` simulé                          | Suite de validation d'environnement       |
| Câblage public                  | Cohérence des URL, healthcheck proxy et redirection vers le terminal                                     | `validate-proxy.mjs`                      |

### 6.2 Couverture absente

Les mécanismes suivants ne disposent pas de suite dédiée dans le dépôt :

- rendu et interactions des composants React ;
- navigation réelle dans un navigateur ;
- capture caméra et géolocalisation navigateur ;
- comparaison visuelle des pages ou exports ;
- accessibilité automatisée ;
- charge ou performance ;
- mesure chiffrée de couverture de code ;
- test unitaire colocalisé pour chaque contrôleur ou service ;
- exécution contre les services cloud réels dans les suites analysées.

Cloudinary est testé avec `fetch` simulé. Le renderer HTML est testé directement ; les tests ne lancent pas un navigateur utilisateur pour valider l'interface.

## 7. Traçabilité

### 7.1 Architecture et configuration

| Information                | Fichiers analysés                                                         |
| -------------------------- | ------------------------------------------------------------------------- |
| Scripts de test            | `package.json`, `apps/backend/package.json`, `apps/frontend/package.json` |
| Configuration Jest         | `apps/backend/test/jest-e2e.json`                                         |
| Dépendances de test        | `apps/backend/package.json`, `pnpm-lock.yaml`                             |
| Ignorance de la couverture | `.gitignore`, `eslint.config.mjs`, `.prettierignore`                      |
| Base PostgreSQL            | `compose.yaml`, `apps/backend/.env.test`                                  |

### 7.2 Préparation et isolation

| Information                         | Fichiers analysés                                                                    |
| ----------------------------------- | ------------------------------------------------------------------------------------ |
| Chargement d'environnement          | `apps/backend/test/test-environment.ts`                                              |
| Préparation globale                 | `apps/backend/test/test-setup.ts`                                                    |
| Recréation, migrations et seed      | `apps/backend/test/test-database.ts`, `apps/backend/prisma/seed.ts`, `schema.prisma` |
| Bootstrap reproduit dans les suites | `apps/backend/src/main.ts`, suites HTTP                                              |
| Arrêt des applications et clients   | Blocs `afterAll` des suites intégrées                                                |

### 7.3 Suites

| Sujet                       | Fichier                                                               |
| --------------------------- | --------------------------------------------------------------------- |
| API principale              | `apps/backend/test/app.e2e-spec.ts`                                   |
| Calendrier                  | `apps/backend/test/calendar.e2e-spec.ts`                              |
| Absences et calendrier      | `apps/backend/test/attendance-calendar-absence.e2e-spec.ts`           |
| Jours non ouvrés            | `apps/backend/test/non-working-day-attendance.e2e-spec.ts`            |
| Sanctions                   | `apps/backend/test/sanctions.e2e-spec.ts`                             |
| Configuration et Cloudinary | `apps/backend/test/environment-validation.e2e-spec.ts`                |
| Renderer mensuel            | `apps/backend/test/monthly-attendance-puppeteer-renderer.e2e-spec.ts` |
| Proxy frontend/backend      | `scripts/validate-proxy.mjs`                                          |

### 7.4 Code fonctionnel relié aux tests

| Périmètre             | Fichiers de référence                                             |
| --------------------- | ----------------------------------------------------------------- |
| Modules NestJS testés | `apps/backend/src/app.module.ts`, `apps/backend/src/modules/**`   |
| Prisma                | `apps/backend/src/common/prisma/**`, `apps/backend/prisma/**`     |
| Validation globale    | `apps/backend/src/main.ts`                                        |
| Session frontend      | `apps/frontend/lib/auth-session.ts`                               |
| Proxy santé           | `apps/frontend/app/api/health/route.ts`                           |
| URL de pointage       | `apps/backend/src/modules/attendance/attendance-entry.service.ts` |
| Exporteurs            | `apps/backend/src/modules/attendance/exports/**`                  |

## 8. Observations

### 8.1 Organisation

- Toutes les suites Jest portent le suffixe `e2e-spec.ts`, y compris celles qui instancient un service isolé.
- Une seule configuration Jest sélectionne l'ensemble de ces suites.
- Les tests backend sont centralisés dans `apps/backend/test` plutôt que colocalisés avec les sources.
- Le validateur de proxy est un script Node distinct de Jest.
- La commande racine `test` ne lance pas le validateur de proxy ; la commande `validate` lance les deux mécanismes.

### 8.2 Lisibilité

- Les descriptions des cas indiquent généralement la route et le comportement attendu.
- Les scénarios HTTP enchaînent explicitement méthode, authentification, charge et statut attendu.
- Les données fixes utilisent des dates ISO et des identifiants déterministes.
- Les aides locales nomment les opérations répétées, telles que la connexion, la construction d'une preuve ou la création d'un rapport.
- Les assertions de persistance complètent les assertions sur les réponses HTTP dans plusieurs scénarios.

### 8.3 Isolation

- Les suites intégrées recréent la base de test avant leur exécution.
- Les migrations et le seed produisent un état initial déterministe.
- L'exécution Jest en série évite la concurrence entre suites utilisant la même base.
- Les variables d'environnement modifiées par les tests ciblés sont restaurées.
- Les clients Prisma et applications NestJS sont fermés après les suites intégrées.
- Les appels Cloudinary sont simulés ; aucune écriture cloud réelle n'est effectuée dans ces cas.

### 8.4 Réutilisation et limites observées

- La préparation de la base et de l'environnement est partagée entre les suites.
- Les helpers métier restent majoritairement locaux à chaque fichier.
- La suite principale concentre 70 des 107 cas Jest.
- Les niveaux unitaire, intégration et end-to-end ne disposent pas de commandes ni de configurations distinctes.
- Aucun test automatisé frontend de composant ou de parcours utilisateur n'est présent.
- Aucun rapport de couverture ou de résultats n'est produit par les scripts existants.
- Le test proxy valide la connectivité et la redirection, sans exercer les écrans interactifs.
