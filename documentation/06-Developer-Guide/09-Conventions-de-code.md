# Conventions de code

| Métadonnée         | Valeur              |
| ------------------ | ------------------- |
| Document ID        | DG-009              |
| Titre              | Conventions de code |
| Version            | 1.0                 |
| Statut             | Validé              |
| Classification     | Interne             |
| Référence          | Developer Guide     |
| Date de génération | 30 juillet 2026     |

## 1. Présentation

### 1.1 Objectif

Ce chapitre décrit les conventions de code effectivement visibles dans le dépôt Konatech Pointage. Il couvre l'organisation des fichiers, les formes récurrentes du backend NestJS, du frontend Next.js, du schéma Prisma, du code TypeScript, des configurations et des tests.

Les éléments présentés sont des constats tirés des sources et des fichiers de configuration. Ils ne définissent pas de règles supplémentaires.

### 1.2 Importance observable des conventions

Les conventions présentes assurent plusieurs fonctions dans le projet :

- séparer le frontend, le backend, les scripts et la documentation ;
- regrouper le code applicatif par domaine fonctionnel ;
- rendre les rôles NestJS identifiables par les suffixes de fichiers ;
- distinguer les pages serveur, les composants clients et les routes proxy ;
- appliquer un format commun avec Prettier ;
- appliquer des contrôles statiques communs avec ESLint et TypeScript ;
- traduire les contrats HTTP en DTO backend et en types frontend ;
- isoler les migrations générées ou historiques des outils de formatage.

Le dépôt contient également des exceptions explicites aux motifs dominants. Tous les modules backend ne possèdent pas un service ou des DTO, toutes les routes frontend ne possèdent pas de fichiers `loading.tsx` et `error.tsx`, et aucun dossier de hooks métier n'est présent.

## 2. Organisation des fichiers

### 2.1 Arborescence

| Emplacement                | Convention observée                           | Contenu                                                                                     |
| -------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `apps/backend`             | Application backend autonome du workspace     | NestJS, Prisma, scripts backend et tests end-to-end                                         |
| `apps/backend/src/modules` | Regroupement par domaine fonctionnel          | Authentification, employés, plannings, pointages, calendrier, sanctions, dashboard et santé |
| `apps/backend/src/common`  | Regroupement des mécanismes transverses       | Prisma, audit, sécurité, temps, validation et utilitaires                                   |
| `apps/backend/prisma`      | Regroupement des artefacts de persistance     | Schéma, migrations et seed                                                                  |
| `apps/backend/test`        | Regroupement des tests d'intégration HTTP     | Suites `*.e2e-spec.ts` et aides d'environnement                                             |
| `apps/frontend/app`        | Arborescence de routes Next.js App Router     | Pages, layouts, états de chargement, erreurs et Route Handlers                              |
| `apps/frontend/app/api`    | API interne au frontend                       | Proxies vers le backend et gestion des cookies                                              |
| `apps/frontend/components` | Composants regroupés par domaine ou rôle      | Administration, pointage, calendrier, dashboard, employés, plannings, sanctions et UI       |
| `apps/frontend/lib`        | Fonctions et contrats transverses             | API, authentification, session, erreurs, redirections et classes CSS                        |
| `scripts`                  | Automatisation à l'échelle du dépôt           | Démarrage, validation proxy et nettoyage Windows                                            |
| `documentation`            | Documents regroupés par ensemble documentaire | Chapitres Markdown numérotés                                                                |

### 2.2 Nommage des dossiers

Les noms de dossiers applicatifs sont en minuscules. Les domaines sont généralement au pluriel lorsqu'ils représentent une collection ou une ressource, par exemple `employees`, `schedules`, `sanctions` et `components`. Les domaines non comptables ou techniques utilisent leur nom fonctionnel, par exemple `auth`, `attendance`, `health`, `calendar` et `common`.

Dans l'App Router :

- chaque segment d'URL possède son dossier ;
- les segments statiques utilisent des minuscules et des tirets, comme `attendance-entry` et `attendance-history` ;
- les segments dynamiques utilisent les crochets Next.js, comme `[id]` et `[attendanceId]` ;
- les Route Handlers sont nommés `route.ts`.

### 2.3 Nommage des fichiers

| Catégorie             | Forme observée                                              | Exemples                                                      |
| --------------------- | ----------------------------------------------------------- | ------------------------------------------------------------- |
| Module NestJS         | `<domaine>.module.ts`                                       | `employees.module.ts`, `attendance.module.ts`                 |
| Contrôleur NestJS     | `<domaine>.controller.ts`                                   | `calendar.controller.ts`                                      |
| Service NestJS        | `<responsabilité>.service.ts`                               | `schedules.service.ts`, `attendance-photo-storage.service.ts` |
| DTO                   | Nom d'action en minuscules avec tirets et suffixe `.dto.ts` | `create-employee.dto.ts`, `monthly-sanctions-query.dto.ts`    |
| Guard                 | Nom de fonction et suffixe `.guard.ts`                      | `jwt-auth.guard.ts`, `roles.guard.ts`                         |
| Décorateur            | Nom de fonction et suffixe `.decorator.ts`                  | `current-user.decorator.ts`, `public.decorator.ts`            |
| Interface backend     | Nom fonctionnel et suffixe `.interface.ts`                  | `authenticated-user.interface.ts`                             |
| Types backend         | Nom de domaine et suffixe `.types.ts`                       | `dashboard.types.ts`, `calendar.types.ts`                     |
| Utilitaire backend    | Nom fonctionnel et suffixe `.util.ts`                       | `attendance-date.util.ts`                                     |
| Validation partagée   | Nom fonctionnel et suffixe `.validation.ts`                 | `pin-code.validation.ts`                                      |
| Page Next.js          | Nom réservé `page.tsx`                                      | `app/employees/page.tsx`                                      |
| État de route Next.js | Noms réservés `loading.tsx` et `error.tsx`                  | Routes calendrier et plannings                                |
| Composant React       | Minuscules et tirets, extension `.tsx`                      | `admin-employees-manager.tsx`, `page-shell.tsx`               |
| Aide frontend         | Nom du domaine et suffixe `.helpers.ts`                     | `employee-manager.helpers.ts`                                 |
| Bibliothèque frontend | Nom court en minuscules et tirets                           | `api-route.ts`, `client-error.ts`                             |
| Test backend          | Sujet suivi de `.e2e-spec.ts`                               | `calendar.e2e-spec.ts`                                        |
| Migration             | Dossier horodaté et descriptif, fichier `migration.sql`     | `20260623143000_add_hr_calendar_entries/migration.sql`        |

### 2.4 Regroupement logique

Le backend place les fichiers propres à un domaine dans le même répertoire. Les sous-répertoires `dto`, `constants`, `decorators`, `guards`, `interfaces` et `exports` apparaissent lorsque le volume ou le rôle du code le justifie.

Le frontend regroupe les composants métier par fonctionnalité. Les composants génériques sont séparés dans `components/ui`, ceux de structure dans `components/layout` et ceux communs à l'administration dans `components/admin`.

Les fichiers d'aide propres aux gestionnaires des employés et des plannings restent à côté des composants correspondants. Les contrats de toutes les ressources HTTP frontend sont, eux, regroupés dans `lib/api.ts`.

## 3. Conventions Backend

### 3.1 Tableau des conventions

| Élément     | Convention réellement utilisée                                                                                   | Fichiers représentatifs                                         |
| ----------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Modules     | Classe PascalCase annotée `@Module`, tableaux `imports`, `controllers`, `providers` et `exports` selon le besoin | Tous les fichiers `*.module.ts`                                 |
| Controllers | Classe PascalCase annotée `@Controller`, méthodes camelCase associées aux verbes HTTP                            | `employees.controller.ts`, `attendance.controller.ts`           |
| Services    | Classe PascalCase annotée `@Injectable`, logique métier et accès aux données                                     | `employees.service.ts`, `calendar.service.ts`                   |
| DTO         | Classe PascalCase avec suffixe `Dto`, propriétés validées par décorateurs                                        | Répertoires `modules/*/dto`                                     |
| Guards      | Classe PascalCase avec suffixe `Guard`, implémentation de `CanActivate`                                          | `jwt-auth.guard.ts`, `roles.guard.ts`, `app-throttler.guard.ts` |
| Decorators  | Fonction exportée PascalCase construite avec les aides NestJS                                                    | `CurrentUser`, `Public`, `Roles`                                |
| Prisma      | Service global étendant `PrismaClient`, injecté par constructeur                                                 | `prisma.module.ts`, `prisma.service.ts`                         |
| Exceptions  | Exceptions HTTP NestJS levées depuis les services ou classes spécialisées                                        | Services de domaine, `attendance-security.exception.ts`         |
| Audit       | Mutation administrative suivie après réussite dans certains contrôleurs                                          | Contrôleurs employés, calendrier et pointages                   |

### 3.2 Modules

Les modules utilisent une classe exportée dont le nom correspond au domaine, par exemple `EmployeesModule` ou `CalendarModule`. Ils déclarent explicitement leurs contrôleurs et fournisseurs.

Les services sont exportés seulement lorsqu'un autre module les consomme dans le code actuel. `CalendarModule`, `SanctionsModule`, `AttendanceModule` et `AuthModule` exportent respectivement leur service principal. `EmployeesModule` et `SchedulesModule` n'exportent pas leur service.

`AppModule` importe explicitement les modules applicatifs. `PrismaModule` est annoté `@Global`, tandis que les guards JWT et rôles sont déclarés avec le jeton `APP_GUARD` dans `AuthModule`.

### 3.3 Controllers

Les contrôleurs observés suivent les formes suivantes :

- injection des services par un constructeur avec propriétés `private readonly` ;
- décorateurs HTTP NestJS pour chaque méthode ;
- extraction par `@Body`, `@Param` et `@Query` ;
- utilisation de `ParseUUIDPipe` sur plusieurs identifiants ;
- application des rôles avec `@Roles(AccessRole.ADMIN)` ou `EMPLOYEE` ;
- récupération de l'identité avec `@CurrentUser` ;
- retour direct de la promesse ou du résultat du service ;
- méthode `async` lorsque le contrôleur doit attendre le résultat avant une action complémentaire, telle que l'écriture d'un audit.

Le décorateur de rôle peut être placé sur toute la classe ou sur une méthode. Les routes publiques utilisent `@Public`.

### 3.4 Services

Les services contiennent les règles de domaine et les opérations Prisma. Ils utilisent :

- l'injection par constructeur ;
- des méthodes publiques pour les opérations appelées par les contrôleurs ou d'autres services ;
- des méthodes privées pour la normalisation, la recherche préalable et les calculs internes ;
- `Promise` et `async/await` pour les opérations asynchrones ;
- `Promise.all` lorsque plusieurs lectures indépendantes sont exécutées ensemble ;
- les exceptions NestJS `BadRequestException`, `ConflictException`, `NotFoundException`, `UnauthorizedException` ou `ForbiddenException` selon les domaines ;
- les transactions Prisma pour certaines mutations composées.

La logique d'accès à PostgreSQL se trouve dans les services et non dans les contrôleurs, sauf le module `health`, qui ne consulte pas la base et retourne directement un état statique.

### 3.5 DTO et validation

Les DTO utilisent `class-validator` et, lorsque nécessaire, `class-transformer`. Les conventions observées sont :

- propriétés requises déclarées avec l'opérateur d'assignation définitive `!` ;
- propriétés optionnelles marquées `?` et décorées avec `@IsOptional` ;
- validations de type avant les contraintes de contenu ;
- énumérations Prisma vérifiées avec `@IsEnum` ;
- UUID vérifiés avec `@IsUUID` ;
- bornes de chaîne ou de nombre exprimées par décorateurs ;
- transformation des chaînes vides en `null` dans certains DTO de modification ;
- constantes de validation partagées extraites dans `common/validation`.

Le `ValidationPipe` global active la liste blanche, refuse les propriétés étrangères, transforme les valeurs et autorise la conversion implicite.

### 3.6 Prisma

| Élément Prisma        | Convention observée                                                                                   |
| --------------------- | ----------------------------------------------------------------------------------------------------- |
| Modèles               | Noms singuliers en PascalCase : `Employee`, `Schedule`, `Attendance`, `CalendarEntry`, `SanctionRule` |
| Champs                | Noms camelCase                                                                                        |
| Énumérations          | Noms PascalCase                                                                                       |
| Valeurs d'énumération | Majuscules avec underscores, par exemple `NON_WORKING_DAY_WORK`                                       |
| Identifiants          | Chaînes UUID générées par défaut                                                                      |
| Dates techniques      | `createdAt` avec `now()` et `updatedAt` avec `@updatedAt`                                             |
| Relations             | Champs de relation et clés étrangères déclarés ensemble                                               |
| Suppression           | Comportement explicite sur certaines relations avec `Cascade` ou `SetNull`                            |
| Index                 | Déclarations `@@index` sur les champs utilisés pour des recherches et agrégations                     |
| Unicité               | `@unique` sur plusieurs identifiants et contrainte composée sur employé/date pour le pointage         |
| Client                | Générateur `prisma-client-js` avec cibles binaires déclarées                                          |
| Source                | Provider `postgresql` et URL lue depuis `DATABASE_URL`                                                |

Les migrations ne sont pas formatées par Prettier et sont ignorées par ESLint. Le seed est un fichier TypeScript distinct.

## 4. Conventions Frontend

### 4.1 Tableau des conventions

| Élément            | Convention réellement observée                                                                     | Fichiers représentatifs                                       |
| ------------------ | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Pages              | Fonction exportée par défaut, souvent asynchrone pour les données serveur                          | `app/employees/page.tsx`, `app/schedules/page.tsx`            |
| Layout             | Fonction exportée par défaut et métadonnées Next.js                                                | `app/layout.tsx`                                              |
| Route Handlers     | Fonctions nommées selon le verbe HTTP en majuscules                                                | Fichiers `app/api/**/route.ts`                                |
| Composants         | Fonction nommée exportée en PascalCase                                                             | Fichiers sous `components`                                    |
| Composants clients | Directive `'use client'` en première ligne                                                         | Formulaires et gestionnaires interactifs                      |
| Props              | Alias `type` local avec suffixe `Props`                                                            | `PageShellProps`, `LoginFormProps`                            |
| Hooks              | Hooks React appelés directement dans les composants                                                | `useState`, `useEffect`, `useMemo`, `useRef`, `useTransition` |
| Services           | Aucun répertoire `services` ; appels et contrats regroupés dans `lib/api.ts` et `lib/api-route.ts` | Bibliothèque frontend                                         |
| Types              | Alias `type` exportés pour les réponses et charges utiles                                          | `lib/api.ts`                                                  |
| Interfaces         | Aucun usage dominant d'`interface` dans le frontend analysé                                        | Les formes d'objet utilisent principalement `type`            |
| UI                 | Composants réutilisables dans `components/ui` et fusion de classes par `cn`                        | `button.tsx`, `card.tsx`, `badge.tsx`, `lib/utils.ts`         |

### 4.2 Pages et composants

Les pages App Router emploient l'export par défaut requis par Next.js. Les composants réutilisables emploient des exports nommés. Les pages serveur :

- chargent l'utilisateur et les données ;
- utilisent `redirect` pour les contrôles d'accès ;
- passent les données initiales aux composants clients ;
- déclarent parfois `dynamic = 'force-dynamic'`.

Les composants clients gèrent les événements navigateur, les formulaires et l'état local. Les gestionnaires de domaine utilisent une combinaison de `useState` pour l'état mutable et de `useMemo` pour les listes ou statistiques dérivées.

### 4.3 Hooks

Aucun dossier `apps/frontend/hooks` et aucun fichier de hook personnalisé nommé `use-*.ts` ou `use-*.tsx` n'est présent. Les hooks standards de React sont importés depuis `react` et employés directement dans les composants clients :

- `useState` pour les formulaires, filtres, retours et actions en cours ;
- `useMemo` pour les valeurs dérivées ;
- `useEffect` pour la caméra, l'horloge, les panneaux et les effets navigateur ;
- `useRef` pour les éléments vidéo, canvas et autres références DOM ;
- `useTransition` dans le formulaire de connexion.

`useCallback` n'apparaît pas dans les usages recensés.

### 4.4 Appels API et services frontend

Le frontend ne possède pas de classes de service métier. La responsabilité équivalente est répartie entre :

- `lib/api.ts`, qui déclare les types, construit les URL et expose les fonctions de lecture serveur ;
- `lib/api-route.ts`, qui contient les fonctions génériques de proxy ;
- les Route Handlers, qui associent un verbe et un chemin local au backend ;
- les composants clients, qui utilisent `fetch` vers les routes locales pour les mutations.

Les fonctions d'accès aux données commencent généralement par `get`, `request`, `fetch`, `build`, `resolve` ou `normalize`, conformément à leur opération visible.

### 4.5 Composants UI et styles

Les composants UI :

- acceptent une propriété `className` ;
- combinent les classes avec `cn`, construit sur `clsx` et `tailwind-merge` ;
- exposent des variantes typées lorsque le composant en possède ;
- utilisent Tailwind CSS directement dans les chaînes `className` ;
- utilisent des exports nommés.

Les composants de domaine réutilisent `Badge`, `Button`, `Card`, `CardContent`, `CardHeader`, `CardTitle` et `Skeleton`. Les fichiers CSS globaux sont centralisés dans `app/globals.css`.

### 4.6 Imports

Le frontend utilise l'alias `@/*`, configuré vers la racine de `apps/frontend`. Les imports entre répertoires utilisent fréquemment `@/components` et `@/lib`. Les imports relatifs restent présents pour les aides colocalisées, par exemple `./employee-manager.helpers`.

Le backend utilise des imports relatifs pour ses fichiers internes. Les dépendances de framework et les types Prisma sont importés par leur nom de package.

## 5. Conventions TypeScript

### 5.1 Typage

Les deux applications activent `strict`. Le frontend active également `noEmit`, `isolatedModules` et la résolution `bundler`. Le backend produit des déclarations, des sources maps et cible ES2022.

Les pratiques observées comprennent :

- types explicites pour les propriétés, paramètres et retours lorsque l'inférence ne suffit pas ;
- types unions littéraux pour des états fermés côté frontend ;
- types génériques pour les fonctions de requête, les réponses et certaines aides ;
- `unknown` pour des charges ou erreurs qui doivent être affinées ;
- gardes de type par prédicat `value is Type` ;
- assertions ciblées après vérification ou désérialisation ;
- `Awaited<ReturnType<...>>` pour dériver certains types de résultat ;
- `Record`, `Partial`, `Pick` et intersections pour composer des formes ;
- valeurs nullables exprimées explicitement avec `| null`.

ESLint désactive la règle `no-explicit-any`. Des usages de `any` sont donc permis par la configuration, sans constituer le type dominant des contrats applicatifs.

### 5.2 Types et interfaces

Le frontend utilise principalement des alias `type`, y compris pour les propriétés de composants et les structures d'API. Le backend combine :

- classes pour les DTO et services ;
- interfaces pour certains contrats d'authentification ;
- alias `type` pour les résultats métier, états et structures internes ;
- types générés de Prisma pour les modèles, énumérations et entrées de requête.

Les propriétés de composants sont généralement déclarées juste avant le composant qui les consomme. Les types partagés entre plusieurs pages sont regroupés dans `lib/api.ts`.

### 5.3 Énumérations et constantes

Les énumérations persistantes sont déclarées dans Prisma puis importées depuis `@prisma/client` côté backend. Le frontend représente plusieurs de ces ensembles par unions de chaînes équivalentes.

Les constantes exportées servant de configuration ou de contrat utilisent des noms en majuscules avec underscores, par exemple les noms de cookies, chemins d'authentification et valeurs de throttling. Les constantes locales de présentation utilisent aussi des noms camelCase, par exemple les tables de variantes ou de libellés.

### 5.4 Fonctions, classes et variables

| Élément                             | Convention observée                                                 |
| ----------------------------------- | ------------------------------------------------------------------- |
| Classes                             | PascalCase                                                          |
| Fonctions et méthodes               | camelCase                                                           |
| Composants React                    | PascalCase                                                          |
| Variables et propriétés             | camelCase                                                           |
| Constantes contractuelles exportées | UPPER_SNAKE_CASE                                                    |
| Booléens                            | Préfixes fréquents `is`, `has`, `can` ou `should`                   |
| Gestionnaires d'événements          | Préfixes `handle`, `start`, `toggle`, `reset` ou nom de l'action    |
| Fonctions de lecture                | Préfixe fréquent `get`, `find` ou `load`                            |
| Fonctions de transformation         | Préfixe fréquent `format`, `normalize`, `build`, `map` ou `resolve` |

### 5.5 Imports et exports

Les imports sont placés au début des fichiers. Prettier assure leur mise en forme mais aucune configuration de tri automatique des imports n'est présente.

Les exports nommés dominent pour les composants, fonctions, types, constantes, classes backend et Route Handlers. Les pages et layouts Next.js utilisent l'export par défaut attendu par le framework.

Les imports de types emploient parfois le mot-clé `type`, soit dans un import dédié, soit au sein d'un import groupé. Cette forme est présente mais n'est pas appliquée uniformément à tous les symboles utilisés uniquement comme types.

## 6. Configuration

### 6.1 ESLint

Le dépôt utilise une configuration flat dans `eslint.config.mjs`.

| Configuration           | Valeur observée                                           |
| ----------------------- | --------------------------------------------------------- |
| Base JavaScript         | `@eslint/js` recommended                                  |
| TypeScript              | `typescript-eslint` recommended                           |
| Next.js                 | Règles recommended et core-web-vitals sur `apps/frontend` |
| Compatibilité Prettier  | `eslint-config-prettier` appliqué en fin de configuration |
| Variables non utilisées | Erreur, sauf noms commençant par `_`                      |
| `no-undef`              | Désactivé dans la configuration commune                   |
| `no-explicit-any`       | Désactivé                                                 |
| Liens HTML Next.js      | `no-html-link-for-pages` désactivé                        |
| Élément image           | `no-img-element` désactivé                                |
| Déclarations `.d.ts`    | Contrôle des variables inutilisées désactivé              |

Les chemins ignorés comprennent `node_modules`, `.next`, `dist`, `coverage`, le store pnpm, le lockfile, les migrations Prisma et `next-env.d.ts`.

### 6.2 Prettier

Prettier est présent avec une configuration racine :

| Option          | Valeur |
| --------------- | ------ |
| `singleQuote`   | `true` |
| `trailingComma` | `all`  |
| `printWidth`    | `80`   |
| `semi`          | `true` |

`.prettierignore` exclut notamment les dépendances, sorties de build, couverture, lockfile, migrations Prisma et répertoires générés Next.js/backend.

Les scripts `format` et `format:check` exécutent respectivement l'écriture et le contrôle Prettier.

### 6.3 TypeScript

| Application    | Conventions configurées                                                                                               |
| -------------- | --------------------------------------------------------------------------------------------------------------------- |
| Backend        | CommonJS, cible ES2022, décorateurs et métadonnées activés, mode strict, sortie dans `dist`, compilation incrémentale |
| Frontend       | Modules ESNext, cible ES2020, résolution bundler, JSX préservé, mode strict, aucun emit, plugin Next.js               |
| Alias frontend | `@/*` correspond à `./*` depuis `apps/frontend`                                                                       |
| Build backend  | Exclut `test`, `dist` et les fichiers `*.spec.ts`                                                                     |

Les scripts racine `typecheck:backend` et `typecheck:frontend` exécutent TypeScript sans émission et sans cache incrémental pour le contrôle.

### 6.4 Variables d'environnement

Le backend charge les fichiers dans l'ordre déclaré par `buildEnvFilePaths` :

1. `.env.<NODE_ENV>.local` ;
2. `.env.<NODE_ENV>` ;
3. `.env.local` ;
4. `.env`.

`ConfigModule.forRoot` est global et utilise un schéma Joi. Les variables sont lues par `ConfigService`, fréquemment avec `getOrThrow` lorsqu'elles sont requises à l'exécution.

Le frontend lit les variables via `process.env` dans ses fonctions de configuration. Les variables exposées au navigateur portent le préfixe `NEXT_PUBLIC_`. Les exemples sont répartis entre :

- `apps/backend/.env.example` ;
- `apps/frontend/.env.example` ;
- `.env.production.example`.

Les fichiers `.env` et `.env.local` présents sont des fichiers d'environnement effectifs ; leurs valeurs ne sont pas reproduites dans ce document.

### 6.5 Tests

Jest est configuré pour reconnaître les fichiers `*.e2e-spec.ts`, utiliser `ts-jest`, exécuter dans l'environnement Node et charger `test/test-setup.ts`.

Les suites observées suivent les conventions suivantes :

- bloc `describe` nommé d'après le contrôleur ou le scénario ;
- cas déclarés avec `it` ;
- préparation de la base avant l'application de test ;
- création d'un module NestJS à partir d'`AppModule` ;
- application du préfixe `/api/v1` et du même `ValidationPipe` ;
- appels HTTP avec `supertest` ;
- attentes sur les codes HTTP et les corps JSON ;
- fermeture de Prisma et de l'application dans `afterAll`.

Le frontend ne contient pas de fichiers `*.test.ts`, `*.test.tsx`, `*.spec.ts` ou `*.spec.tsx`. Le script `test:proxy` exécute `scripts/validate-proxy.mjs`, qui démarre des processus backend/frontend, vérifie les réponses et gère leur arrêt.

## 7. Traçabilité

### 7.1 Organisation des fichiers

| Convention             | Fichiers ou répertoires analysés                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------------- |
| Monorepo et workspaces | `package.json`, `pnpm-workspace.yaml`, `apps/backend/package.json`, `apps/frontend/package.json`  |
| Arborescence backend   | `apps/backend/src/modules`, `apps/backend/src/common`, `apps/backend/prisma`, `apps/backend/test` |
| Arborescence frontend  | `apps/frontend/app`, `apps/frontend/components`, `apps/frontend/lib`                              |
| Scripts                | `scripts/dev.mjs`, `scripts/validate-proxy.mjs`, `scripts/clean-windows.ps1`                      |

### 7.2 Backend et Prisma

| Convention                    | Fichiers analysés                                                                              |
| ----------------------------- | ---------------------------------------------------------------------------------------------- |
| Modules et assemblage         | `apps/backend/src/app.module.ts`, fichiers `modules/*/*.module.ts`                             |
| Controllers et routes         | Fichiers `modules/*/*.controller.ts`, `apps/backend/src/main.ts`                               |
| Services et Prisma            | Fichiers `modules/**/*.service.ts`, `common/prisma/*`                                          |
| DTO                           | Fichiers `modules/*/dto/*.dto.ts`                                                              |
| Guards et décorateurs         | `modules/auth/guards/*`, `modules/auth/decorators/*`, `common/security/app-throttler.guard.ts` |
| Interfaces et types           | Fichiers `*.interface.ts`, `*.types.ts`, configuration et constantes de domaine                |
| Modèles et conventions Prisma | `apps/backend/prisma/schema.prisma`, migrations et `seed.ts`                                   |

### 7.3 Frontend

| Convention                  | Fichiers analysés                                                                            |
| --------------------------- | -------------------------------------------------------------------------------------------- |
| Pages et états de route     | Fichiers sous `apps/frontend/app`, hors `app/api`                                            |
| Route Handlers              | Fichiers `apps/frontend/app/api/**/route.ts`                                                 |
| Composants métier           | Répertoires sous `apps/frontend/components`                                                  |
| UI partagée                 | `apps/frontend/components/ui/*`, `components/layout/*`, `components/admin/*`                 |
| Hooks React                 | Composants clients contenant `useState`, `useEffect`, `useMemo`, `useRef` ou `useTransition` |
| Types et appels API         | `apps/frontend/lib/api.ts`, `api-route.ts`                                                   |
| Authentification et erreurs | `apps/frontend/lib/auth.ts`, `auth-session.ts`, `client-error.ts`, `redirect.ts`             |
| Styles                      | `apps/frontend/app/globals.css`, `apps/frontend/lib/utils.ts`, `postcss.config.js`           |

### 7.4 Configuration et tests

| Convention        | Fichiers analysés                                                                    |
| ----------------- | ------------------------------------------------------------------------------------ |
| ESLint            | `eslint.config.mjs`                                                                  |
| Prettier          | `.prettierrc.json`, `.prettierignore`, scripts du `package.json`                     |
| TypeScript        | `apps/backend/tsconfig.json`, `tsconfig.build.json`, `apps/frontend/tsconfig.json`   |
| Next.js et NestJS | `apps/frontend/next.config.ts`, `apps/backend/nest-cli.json`                         |
| Environnement     | `apps/backend/src/app.module.ts`, fichiers `.env.example`, `.env.production.example` |
| Tests backend     | `apps/backend/test/jest-e2e.json`, fichiers `*.e2e-spec.ts`, aides de test           |
| Validation proxy  | `scripts/validate-proxy.mjs`                                                         |

## 8. Observations

### 8.1 Cohérence

- Les suffixes NestJS rendent le rôle des fichiers backend explicite.
- Les noms de classes, méthodes et fichiers suivent globalement les mêmes formes dans tous les domaines.
- Le frontend utilise systématiquement les noms réservés de l'App Router pour les pages, layouts, états et Route Handlers.
- TypeScript strict, ESLint et Prettier s'appliquent depuis des configurations communes au monorepo.
- Les contrats backend et frontend sont typés, mais ils sont déclarés séparément.

### 8.2 Modularité

- Les modules backend correspondent aux domaines fonctionnels et sont composés explicitement.
- Les services spécialisés restent dans leur domaine lorsque leur usage y est limité.
- Les mécanismes transverses résident sous `common` côté backend et `lib` côté frontend.
- Les services exportés par un module correspondent à des dépendances intermodules observables.
- Le frontend ne possède pas de package partagé ni de couche de services sous forme de classes.

### 8.3 Lisibilité

- Les noms de fonctions décrivent généralement l'opération : recherche, chargement, normalisation, formatage, construction ou résolution.
- Les booléens utilisent fréquemment des préfixes sémantiques.
- Les types de propriétés, de charges et de réponses sont nommés à proximité de leur usage ou centralisés dans `lib/api.ts`.
- Les composants clients complexes extraient certaines transformations dans des fichiers d'aide, mais plusieurs composants conservent aussi des fonctions locales.
- Les chaînes d'interface sont principalement en français ; le code, les identifiants techniques et plusieurs messages backend sont en anglais.

### 8.4 Organisation

- Aucun dossier de hooks personnalisés n'est présent ; les hooks React sont locaux aux composants.
- Aucun dossier frontend nommé `services` n'est présent ; `lib/api.ts` et les Route Handlers assurent cette responsabilité.
- Aucun test frontend unitaire ou de composant n'est présent.
- Les tests backend sont centralisés et orientés end-to-end, sans test colocalisé par service.
- Les migrations Prisma sont historisées mais exclues du lint et du formatage.
- Les pages ne possèdent pas toutes un couple `loading.tsx` et `error.tsx`.
- L'usage d'imports de types explicites est présent sans être uniforme.
- Les types HTTP ne sont pas générés ni partagés automatiquement entre NestJS et Next.js.
