# Developer Guide — Bonnes pratiques de développement

| Métadonnée | Valeur |
|---|---|
| Document ID | DG-015 |
| Titre | Bonnes pratiques de développement |
| Version | 1.0 |
| Statut | Validé |
| Classification | Interne |
| Référence | Developer Guide |
| Projet | Konatech Pointage |

## 1. Présentation

Ce chapitre décrit les pratiques effectivement visibles dans le code et les configurations de Konatech Pointage. Elles portent sur la séparation des applications et des responsabilités, l'organisation par domaines fonctionnels, le typage TypeScript, la validation des entrées, la centralisation de l'accès Prisma, la composition de l'interface et les contrôles automatisés du dépôt.

Les constats sont tirés des implémentations actives. Ils ne constituent ni une liste de pratiques envisagées ni une extension des conventions appliquées dans le projet.

## 2. Organisation du code

### 2.1 Découpage du monorepo

| Zone | Organisation observée | Responsabilité |
|---|---|---|
| Racine | Manifestes, scripts transverses, configurations qualité, Docker et documentation | Orchestration du workspace et règles partagées |
| `apps/backend/` | Application NestJS, Prisma, scripts et tests e2e | API, logique métier et persistance |
| `apps/frontend/` | Application Next.js, composants, fonctions API et styles | Rendu, navigation et interactions utilisateur |
| `documentation/` | Guides classés par famille | Description versionnée du projet |
| `docker/` | Un Dockerfile par application | Construction séparée des images backend et frontend |
| `scripts/` | Scripts Node.js et PowerShell | Développement simultané, validation du proxy et nettoyage Windows |

`pnpm-workspace.yaml` déclare `apps/*` comme packages. Les applications possèdent leurs propres dépendances et scripts, tandis que les contrôles communs restent définis dans le `package.json` racine.

### 2.2 Séparation des couches

```text
Frontend Next.js
  |
  +--> app/              pages, layouts, états loading/error et Route Handlers
  +--> components/       interface réutilisable et composants par domaine
  +--> lib/              API, sessions, erreurs, redirections et utilitaires
  |
  v
Backend NestJS
  |
  +--> modules/          domaines applicatifs
  |      +--> controller route et entrée HTTP
  |      +--> dto/       contrat et validation
  |      +--> service    traitement métier
  +--> common/           Prisma, sécurité, audit, temps et utilitaires
  |
  v
Prisma Client -> PostgreSQL
```

| Pratique observée | Manifestation dans le dépôt |
|---|---|
| Organisation par domaine | Dossiers backend `auth`, `employees`, `schedules`, `calendar`, `attendance`, `sanctions`, `dashboard` et familles frontend correspondantes |
| Séparation HTTP/métier | Contrôleurs NestJS pour les routes; services injectés pour les traitements |
| Contrats d'entrée dédiés | Répertoires `dto/` propres aux modules qui reçoivent des données |
| Préoccupations transverses isolées | `common/prisma`, `common/security`, `common/audit`, `common/time`, `common/utils`, `common/validation` |
| Interface regroupée par usage | `components/ui`, puis composants fonctionnels par domaine |
| Accès HTTP frontend partagé | Types et lectures dans `lib/api.ts`; relais authentifiés dans `lib/api-route.ts` |
| Persistance versionnée | Schéma Prisma, migrations SQL et seed sous `apps/backend/prisma/` |

## 3. Conventions Backend

### 3.1 Modules NestJS par domaine

Chaque domaine backend possède un fichier `*.module.ts` qui déclare ses contrôleurs et fournisseurs. Les dépendances entre domaines sont exprimées par les imports de modules, comme `CalendarModule` et `SanctionsModule` dans le module de pointage. `AppModule` assemble les modules techniques et métier.

Les classes utilisent les décorateurs NestJS : `@Module`, `@Controller`, `@Injectable`, `@Get`, `@Post`, `@Patch`, `@Delete`, `@Body`, `@Query` et `@Param` selon les routes réellement présentes.

### 3.2 Contrôleurs et services

Les contrôleurs assurent le raccord HTTP :

- déclaration des routes et méthodes ;
- extraction des paramètres, DTO et utilisateur courant ;
- déclaration des rôles avec `@Roles` ;
- délégation au service injecté ;
- journalisation des actions administratives après certaines mutations ;
- définition des en-têtes de téléchargement pour les exports.

Les services portent les traitements observés : règles de pointage, calculs de présence, gestion des employés et horaires, calendrier, sanctions, agrégats du tableau de bord et construction des exports. L'injection de dépendances passe par les constructeurs et les fournisseurs NestJS.

### 3.3 DTO et validation

Les classes DTO sont nommées selon l'action : `CreateEmployeeDto`, `UpdateScheduleDto`, `AttendanceHistoryQueryDto`, `SelfCheckInDto` ou `UpdateSanctionRuleDto`. Elles utilisent `class-validator` pour les types, formats, longueurs, bornes, tableaux et énumérations. `class-transformer` traite les valeurs numériques, les objets imbriqués et certaines chaînes vides.

`main.ts` applique un `ValidationPipe` global avec liste blanche, refus des propriétés non déclarées, transformation et conversion implicite. Les identifiants de routes concernés utilisent `ParseUUIDPipe`. Les règles qui nécessitent une lecture en base ou une comparaison entre champs restent dans les services.

### 3.4 Accès Prisma

| Pratique | Implémentation observée |
|---|---|
| Client injecté | `PrismaService` étend `PrismaClient` et est fourni par un module global |
| Sélections publiques | `common/prisma/selects.ts` définit les champs employés, horaires et présences retournés |
| Typage des sélections | Objets vérifiés avec `satisfies Prisma.*Select` |
| Relations explicites | `connect`, sélections imbriquées et identifiants de relation dans les services |
| Atomicité ciblée | Transaction utilisée pour l'identifiant et la création d'un employé |
| Conflits traduits | Certaines erreurs Prisma connues deviennent des exceptions HTTP propres au domaine |
| Cycle du schéma | `schema.prisma`, migrations horodatées, Prisma Generate et seed configuré |

Les réponses employé sont projetées sans mot de passe ni empreinte de PIN. `pinConfigured` est calculé à partir des champs internes avant la réponse publique.

### 3.5 Exceptions et sécurité

Les services lèvent les exceptions HTTP NestJS correspondant aux états observés : entrée invalide, ressource absente, conflit, absence d'authentification, rôle interdit ou erreur technique. Les gardes JWT, rôles et limitation de débit sont séparés sous les zones Auth et Common Security.

Les mots de passe et PIN utilisent les utilitaires de `common/security/password.util.ts`. Les contrôleurs protégés obtiennent l'identité par `@CurrentUser`; les routes publiques sont marquées par `@Public`.

### 3.6 Utilitaires et services spécialisés

Le module Attendance divise ses traitements en services spécialisés pour l'entrée fixe, les métriques mensuelles, la politique de sécurité, l'évaluation GPS/photo, le stockage photo et les exports CSV/PDF. Les fonctions temporelles et d'instantané d'horaire partagées sont placées sous `common/utils` et `common/time`.

## 4. Conventions Frontend

### 4.1 App Router

Les routes utilisent les conventions de fichiers Next.js :

| Fichier | Usage observé |
|---|---|
| `app/layout.tsx` | Layout racine et styles globaux |
| `app/**/page.tsx` | Pages de tableau de bord, connexion et domaines fonctionnels |
| `app/**/loading.tsx` | États de chargement de plusieurs segments |
| `app/**/error.tsx` | Limites d'erreur avec nouvelle tentative et rechargement |
| `app/api/**/route.ts` | Route Handlers GET, POST, PATCH ou DELETE vers le backend |

Les pages de gestion observées sont des composants serveur asynchrones. Elles obtiennent l'utilisateur et le jeton, effectuent les redirections d'accès puis chargent les données avant de transmettre des valeurs initiales aux composants interactifs.

### 4.2 Composants serveur et clients

Les composants interactifs déclarent `'use client'` et utilisent les hooks React directement, notamment `useState`, `useMemo`, `useEffect`, `useRef` et `useTransition` selon les besoins. Les pages serveur ne portent pas cette directive.

Les composants sont regroupés par domaine : `attendance`, `attendance-history`, `auth`, `calendar`, `dashboard`, `employees`, `sanctions` et `schedules`. Les primitives visuelles réutilisées sont isolées sous `components/ui`; les structures partagées se trouvent sous `components/admin` et `components/layout`.

Aucun répertoire `hooks/` et aucun store d'état autonome ne sont présents. Les états d'interface sont locaux aux composants clients et les données initiales proviennent des pages serveur.

### 4.3 Appels API et sessions

| Zone | Pratique observée |
|---|---|
| `lib/api.ts` | Types des charges utiles et réponses, résolution des URL, appels serveur et `ApiRequestError` |
| `lib/api-route.ts` | Ajout du Bearer depuis les cookies, proxy JSON/fichier et propagation des statuts |
| `lib/auth.ts` | Lecture de l'utilisateur courant et exigences de session côté serveur |
| `lib/auth-session.ts` | Noms, sélection, options et suppression des cookies de session |
| `app/api/` | Adaptateurs courts entre les actions du navigateur et les endpoints NestJS |

Le frontend conserve deux cookies HTTP-only distincts pour la session générale et le terminal de pointage. Les composants n'accèdent pas directement au jeton; les Route Handlers le convertissent en en-tête `Authorization`.

### 4.4 Formulaires et retours utilisateur

Les formulaires interactifs utilisent des états typés, construisent une charge utile explicite, empêchent les soumissions concurrentes et traitent `response.ok`. Les erreurs retournées par les Route Handlers sont affichées dans le composant avec un message propre à l'action. Les gestionnaires employés, horaires et calendrier partagent `getClientErrorMessage`.

La validation côté client couvre notamment le PIN, les champs employés et horaires, le mois et l'année d'export, ainsi que la disponibilité de la caméra. Les mêmes requêtes passent ensuite par les DTO et validations backend.

### 4.5 Styles et composants UI

Tailwind analyse `app`, `components` et `lib`. Le thème étend les couleurs par variables CSS, des rayons et une ombre partagée. `globals.css` définit les variables et styles globaux. PostCSS charge Tailwind et Autoprefixer.

Les composants UI tels que `Button`, `Badge` et `Card` encapsulent des structures et classes partagées. `Button` et `Badge` utilisent `class-variance-authority` pour les variantes; `cn` combine les classes avec `clsx` et `tailwind-merge`.

## 5. Qualité du code

### 5.1 Typage TypeScript

Les deux applications utilisent `strict: true`. Le backend cible ES2022 et compile vers CommonJS; le frontend cible ES2020, utilise la résolution `bundler` et n'émet pas directement de JavaScript via TypeScript. Les scripts `typecheck:backend`, `typecheck:frontend` et `typecheck` exécutent des contrôles sans émission.

Les pratiques de typage visibles incluent les unions littérales, les types de charges utiles, `Partial`, `Extract`, les gardes de types, les génériques de formulaire et `satisfies` pour Prisma et Tailwind.

### 5.2 ESLint

`eslint.config.mjs` applique les configurations JavaScript et TypeScript recommandées à l'ensemble du dépôt. Les fichiers frontend reçoivent aussi les règles Next.js recommandées et Core Web Vitals. Les variables ou arguments préfixés par `_` sont ignorés par la règle des valeurs inutilisées.

Les sorties générées, dépendances, couverture, verrou pnpm, migrations SQL et `next-env.d.ts` sont exclus. `eslint-config-prettier` termine la configuration afin de désactiver les règles de style qui entrent en conflit avec Prettier.

### 5.3 Formatage

`.prettierrc.json` définit les guillemets simples, les virgules finales, une largeur de 80 caractères et les points-virgules. Les scripts racine disponibles sont `format` pour l'écriture et `format:check` pour le contrôle.

### 5.4 Tests et validation

| Mécanisme | Portée observée | Source |
|---|---|---|
| Jest e2e | Routes, authentification, pointage, calendrier, sanctions, environnement et PDF Puppeteer | `apps/backend/test/*.e2e-spec.ts` |
| Base de test | Recréation, migrations de déploiement et seed avant les scénarios concernés | `apps/backend/test/test-database.ts` |
| Environnement de test | Chargement dédié et isolation de l'URL de base | `apps/backend/test/test-environment.ts` |
| Test proxy | Santé backend, proxy frontend et redirection du pointage sur ports temporaires | `scripts/validate-proxy.mjs` |
| Validation complète | Format, Prisma Generate, types, lint, tests backend, builds et proxy | Script `validate` du `package.json` racine |

La configuration Jest recherche les fichiers `*.e2e-spec.ts`, utilise `ts-jest`, charge `test-setup.ts` et s'exécute dans l'environnement Node. Aucun fichier de test frontend unitaire ou de composant n'est présent dans le package frontend.

## 6. Conventions de nommage

| Élément | Convention observée | Exemples réels |
|---|---|---|
| Fichiers backend | kebab-case avec suffixe NestJS | `employees.controller.ts`, `attendance-security.service.ts`, `calendar.module.ts` |
| DTO | Fichier kebab-case et classe PascalCase terminée par `Dto` | `create-employee.dto.ts`, `CreateEmployeeDto` |
| Services | Classe PascalCase terminée par `Service` | `AttendanceService`, `PrismaService` |
| Contrôleurs | Classe PascalCase terminée par `Controller` | `AuthController`, `SchedulesController` |
| Modules | Classe PascalCase terminée par `Module` | `AttendanceModule`, `CalendarModule` |
| Exceptions dédiées | Classe PascalCase terminée par `Exception` | `AttendanceSecurityLocationRequiredException` |
| Types backend | Fichiers `*.types.ts` ou interfaces sous `interfaces/` | `dashboard.types.ts`, `authenticated-user.interface.ts` |
| Composants React | Fichier kebab-case et fonction PascalCase | `admin-nav.tsx`, `AdminNav` |
| Pages App Router | Fichiers conventionnels minuscules | `page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`, `route.ts` |
| Routes dynamiques | Segment entre crochets | `[id]`, `[attendanceId]` |
| Fonctions et variables | camelCase | `getDashboardData`, `initialEmployees`, `buildApiUrl` |
| Constantes | UPPER_SNAKE_CASE pour les constantes globales | `SESSION_COOKIE_NAME`, `ATTENDANCE_ENTRY_LOGIN_PATH` |
| Types et props frontend | PascalCase, suffixe `Props` pour les propriétés | `EmployeeRecord`, `AdminEmployeesManagerProps` |
| Modèles Prisma | PascalCase singulier | `Employee`, `Schedule`, `Attendance`, `CalendarEntry`, `SanctionRule` |
| Champs Prisma et JSON | camelCase | `employeeIdentifier`, `clockInAt`, `scheduleId` |
| Variables d'environnement | UPPER_SNAKE_CASE | `DATABASE_URL`, `JWT_SECRET`, `NEXT_PUBLIC_API_BASE_URL` |
| Actions d'audit | Chaînes domaine.action en minuscules | `employee.create`, `schedule.status.update` |

Les identifiants techniques sont majoritairement en anglais. Les textes affichés dans l'interface sont principalement en français; plusieurs messages internes du backend restent en anglais.

## 7. Cycle de développement

Le cycle automatisé le plus complet est porté par `pnpm validate`. Son ordre réel est conservé dans le diagramme :

```text
Développement local
pnpm dev ou scripts ciblés
          |
          v
Contrôle du format
pnpm format:check
          |
          v
Génération Prisma Client
pnpm prisma:generate
          |
          v
Typecheck backend + frontend
          |
          v
ESLint du workspace
          |
          v
Tests e2e backend
          |
          v
Build frontend
          |
          v
Build backend
          |
          v
Test du proxy et de la redirection
          |
          v
Résultat de validation
```

| Phase | Mécanisme réel | Résultat observable |
|---|---|---|
| Développement | `pnpm dev`, `dev:backend` ou `dev:frontend` | Serveurs avec surveillance |
| Format | `pnpm format` ou contrôle par `format:check` | Fichiers formatés ou statut de conformité |
| Typage | `pnpm typecheck` | Diagnostic TypeScript sans émission |
| Lint | `pnpm lint` ou `lint:fix` | Diagnostic ESLint ou corrections prises en charge |
| Tests backend | `pnpm test:backend` | Résultat Jest e2e sur base de test préparée |
| Build | `pnpm build`, ou cibles séparées | `dist` backend et `.next` frontend |
| Connexion | `pnpm test:proxy` | Santé, proxy et redirection vérifiés |
| Exécution locale | `pnpm db:up` puis `pnpm dev` dans le flux documenté | PostgreSQL, NestJS et Next.js actifs |
| Exécution conteneurisée | Profil Compose `app` documenté dans le README | PostgreSQL, backend et frontend ordonnés par santé |

## 8. Traçabilité

| Pratique | Fichiers ou répertoires analysés | Preuve observée |
|---|---|---|
| Monorepo | `package.json`, `pnpm-workspace.yaml`, `apps/backend/package.json`, `apps/frontend/package.json` | Workspace, scripts et dépendances séparées |
| Organisation backend | `apps/backend/src/app.module.ts`, `apps/backend/src/modules/`, `apps/backend/src/common/` | Modules par domaine et services transverses |
| Contrôleurs et services | Contrôleurs et services sous `apps/backend/src/modules/` | Routage, délégation, logique et injection |
| DTO et validation | `apps/backend/src/main.ts`, `apps/backend/src/modules/*/dto/` | Pipe global et décorateurs de validation |
| Sécurité | `apps/backend/src/modules/auth/`, `apps/backend/src/common/security/` | Gardes, décorateurs, JWT, hachage et limitation |
| Prisma | `apps/backend/src/common/prisma/`, `apps/backend/prisma/schema.prisma`, `apps/backend/prisma/migrations/` | Client, sélections, modèles et migrations |
| App Router | `apps/frontend/app/` | Pages, layout, états et Route Handlers |
| Composants | `apps/frontend/components/` | Regroupement par domaine et primitives UI |
| Appels frontend | `apps/frontend/lib/api.ts`, `apps/frontend/lib/api-route.ts`, `apps/frontend/lib/auth.ts`, `apps/frontend/lib/auth-session.ts` | Types, appels, proxy et sessions |
| Styles | `apps/frontend/app/globals.css`, `apps/frontend/tailwind.config.ts`, `apps/frontend/postcss.config.js`, composants UI | Variables CSS, thème et utilitaires Tailwind |
| TypeScript | `apps/backend/tsconfig.json`, `apps/backend/tsconfig.build.json`, `apps/frontend/tsconfig.json` | Mode strict, cibles et construction |
| Lint | `eslint.config.mjs` | Règles générales, TypeScript, Next.js et exclusions |
| Formatage | `.prettierrc.json`, scripts racine | Style et commandes de contrôle |
| Tests | `apps/backend/test/`, `scripts/validate-proxy.mjs` | E2E backend, base isolée et connexion frontend/backend |
| Build et Docker | `scripts/dev.mjs`, `docker-compose.yml`, `docker/backend.Dockerfile`, `docker/frontend.Dockerfile` | Exécution locale et conteneurisée |
| Documentation | `README.md`, `documentation/06-Developer-Guide/` | Commandes et descriptions recoupées avec le code |

## 9. Observations

- Le dépôt sépare les applications frontend et backend dans deux packages pnpm.
- Le backend est organisé par domaines et complète ce découpage par une zone technique commune.
- Les contrôleurs reçoivent les données HTTP et les services portent les traitements métier principaux.
- La validation des entrées combine DTO déclaratifs, pipe global et contrôles de service.
- Prisma est injecté par un service global et plusieurs projections publiques sont centralisées.
- Les pages serveur chargent les données initiales; les composants clients gèrent les interactions et états locaux.
- Les Route Handlers évitent l'accès direct des composants aux jetons de session.
- Les composants visuels partagés sont regroupés sous `components/ui`.
- Les deux applications utilisent TypeScript en mode strict.
- ESLint, Prettier, les typechecks et les builds sont pilotés depuis la racine.
- La couverture automatisée présente repose sur les tests e2e backend et le contrôle du proxy frontend/backend.
- Aucun test unitaire frontend, store d'état global ou répertoire de hooks partagé n'est présent.
- La chaîne `validate` se termine par un test qui démarre temporairement les deux applications.
- Les migrations, images Docker, sorties de build et dépendances sont exclues des contrôles ou contextes appropriés par les configurations dédiées.
