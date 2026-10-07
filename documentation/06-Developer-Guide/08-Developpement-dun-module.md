# Développement d'un module

| Métadonnée | Valeur |
| --- | --- |
| Document ID | DG-008 |
| Titre | Développement d'un module |
| Version | 1.0 |
| Statut | Validé |
| Classification | Interne |
| Référence | Developer Guide |
| Date de génération | 30 juillet 2026 |

## 1. Présentation

### 1.1 Objectif

Ce chapitre décrit l'organisation effectivement utilisée par Konatech Pointage pour implémenter une fonctionnalité couvrant la base de données, le backend NestJS et le frontend Next.js. Il s'appuie sur les modules présents dans le dépôt, notamment les employés, les plannings, le calendrier, les pointages, l'authentification, le tableau de bord et les sanctions.

Il ne constitue pas une procédure générique de création de module. Il restitue les structures, les dépendances et les séquences que le code actuel permet d'observer.

### 1.2 Philosophie modulaire observée

Le projet sépare les responsabilités suivant plusieurs frontières :

- les modèles persistants et leurs relations sont centralisés dans le schéma Prisma ;
- les migrations SQL historisent les évolutions de la base PostgreSQL ;
- chaque domaine backend est regroupé dans un répertoire NestJS sous `apps/backend/src/modules` ;
- les contrôleurs portent les routes HTTP, les rôles, les paramètres et l'appel aux services ;
- les services contiennent les accès Prisma et la logique métier ;
- les DTO décrivent et valident les entrées des routes qui reçoivent des données ;
- les pages Next.js sont organisées par route dans `apps/frontend/app` ;
- les composants sont regroupés par domaine dans `apps/frontend/components` ;
- les appels serveur et les types frontend sont centralisés dans `apps/frontend/lib/api.ts` ;
- les mutations exécutées dans le navigateur passent par des Route Handlers Next.js sous `apps/frontend/app/api` ;
- les éléments d'interface réutilisables sont placés dans `apps/frontend/components/ui`.

Cette organisation n'est pas uniforme au sens où chaque domaine posséderait tous les types de fichiers. Un module simple, tel que `health`, ne comporte qu'un module et un contrôleur. Les domaines comportant des entrées structurées ajoutent des DTO. Les domaines plus étendus, tels que `attendance`, ajoutent des services spécialisés, des utilitaires et un sous-répertoire d'export.

## 2. Organisation générale

### 2.1 Structure réellement observée

| Couche | Emplacement | Éléments observés | Rôle |
| --- | --- | --- | --- |
| Base de données | `apps/backend/prisma` | `schema.prisma`, migrations, `seed.ts` | Modèles, relations, contraintes et historique SQL |
| Accès aux données | `apps/backend/src/common/prisma` | `PrismaModule`, `PrismaService`, sélections partagées | Client Prisma global et cycle de connexion |
| Domaine backend | `apps/backend/src/modules/<domaine>` | Module, contrôleur, service, DTO et fichiers spécialisés selon le domaine | API et logique métier |
| Assemblage backend | `apps/backend/src/app.module.ts` | Imports des modules applicatifs et configuration globale | Composition de l'application NestJS |
| Route frontend | `apps/frontend/app/<route>` | `page.tsx`, parfois `loading.tsx` et `error.tsx` | Chargement serveur et rendu de la route |
| Composants frontend | `apps/frontend/components/<domaine>` | Gestionnaire, formulaire, tableau, panneau, aides | Présentation et interactions du domaine |
| API frontend | `apps/frontend/app/api/<domaine>` | Route Handlers `route.ts` | Proxy authentifié vers le backend |
| Contrats frontend | `apps/frontend/lib/api.ts` | Types, charges utiles et fonctions d'appel | Contrats utilisés par pages et composants |
| Utilitaires frontend | `apps/frontend/lib` | Authentification, proxy, erreurs, redirections | Comportements transverses |
| Tests backend | `apps/backend/test` | Suites Jest end-to-end | Validation HTTP et intégrée de parcours présents |
| Validation proxy | `scripts/validate-proxy.mjs` | Contrôles des Route Handlers | Vérification dédiée de la frontière proxy |

### 2.2 Diagramme des composants

```text
┌────────────────────────────────────────────────────────────┐
│ Frontend Next.js                                           │
│                                                            │
│ app/<route>/page.tsx                                       │
│       │                                                    │
│       ├──> components/<domaine>                            │
│       │         ├── formulaires et états locaux            │
│       │         └── fetch('/api/<domaine>')                │
│       │                                                    │
│       └──> lib/api.ts                                      │
│                                                            │
│ app/api/<domaine>/route.ts ──> lib/api-route.ts            │
└──────────────────────────────┬─────────────────────────────┘
                               │ HTTP
                               v
┌────────────────────────────────────────────────────────────┐
│ Backend NestJS                                             │
│                                                            │
│ <domaine>.module.ts                                        │
│       └──> <domaine>.controller.ts                         │
│                 ├── DTO + validation globale               │
│                 └──> <domaine>.service.ts                  │
└──────────────────────────────┬─────────────────────────────┘
                               │ injection
                               v
┌────────────────────────────────────────────────────────────┐
│ PrismaService ──> Prisma Client ──> PostgreSQL              │
│ schema.prisma + migrations                                 │
└────────────────────────────────────────────────────────────┘
```

### 2.3 Variantes présentes

| Variante | Exemple | Particularité |
| --- | --- | --- |
| Module minimal | `health` | Aucun service ni DTO ; le contrôleur retourne directement l'état statique du service et un horodatage |
| Module CRUD | `employees`, `schedules`, `calendar` | Module, contrôleur, service et DTO de création/mise à jour |
| Module de lecture agrégée | `dashboard` | Contrôleur, service et types de sortie, sans DTO de mutation |
| Module transversal | `auth` | Constantes, décorateurs, guards, interfaces et DTO en plus du triplet principal |
| Module métier étendu | `attendance` | Plusieurs services, DTO, exceptions, traitement mensuel et exporteurs |
| Module partagé entre domaines | `calendar`, `sanctions`, `attendance`, `auth` | Leur module exporte un service consommé ailleurs lorsque nécessaire |

## 3. Structure Backend

### 3.1 Éléments des modules

| Élément | Présence observée | Convention et exemples |
| --- | --- | --- |
| Module NestJS | Présent dans tous les domaines backend | Fichier `<domaine>.module.ts` déclarant les contrôleurs, fournisseurs, imports et exports |
| Contrôleur | Présent dans tous les modules actuels | Fichier `<domaine>.controller.ts`, décorateur `@Controller`, méthodes associées aux verbes HTTP |
| Service principal | Présent sauf dans `health` | Classe injectable `<Domaine>Service`, appelée par le contrôleur |
| DTO | Présents pour les routes à paramètres structurés | Sous-répertoire `dto`, classes utilisant `class-validator` et parfois `class-transformer` |
| Types métier | Présents dans certains domaines | Fichiers `calendar.types.ts`, `dashboard.types.ts`, `sanction-engine.types.ts` et types d'export |
| Services spécialisés | Présents dans les domaines complexes | Sécurité, stockage photo, métriques mensuelles et exporteurs de `attendance` |
| Accès Prisma | Présent dans les services qui manipulent les données | Injection de `PrismaService`, module global fourni par `PrismaModule` |
| Contrôle d'accès | Présent sur les contrôleurs ou méthodes protégées | `@Roles`, `@Public`, `@CurrentUser`, guards globaux JWT et rôles |
| Audit | Présent sur plusieurs mutations administratives | Injection d'`AuditLogService` dans les contrôleurs concernés |
| Tests | Présents au niveau end-to-end backend | Répertoire `apps/backend/test`, sans fichier de test colocalisé dans chaque module |

### 3.2 Déclaration d'un module

Les classes annotées par `@Module` déclarent les éléments dont NestJS assure l'instanciation :

- `controllers` référence le ou les contrôleurs du domaine ;
- `providers` référence le service principal et les services spécialisés ;
- `imports` référence les modules dont les fournisseurs exportés sont consommés ;
- `exports` rend un service disponible pour d'autres modules lorsque le code en a besoin.

Les modules `EmployeesModule` et `SchedulesModule` déclarent chacun un contrôleur et un service. `CalendarModule` importe `AuditLogModule` et exporte `CalendarService`. `AttendanceModule` importe `CalendarModule` et `SanctionsModule`, déclare ses services de pointage et d'export, puis exporte `AttendanceService`.

Tous les modules applicatifs sont importés explicitement par `AppModule`. Aucun mécanisme de découverte automatique des répertoires de modules n'est présent.

### 3.3 Contrôleurs

Les contrôleurs observés :

- associent les méthodes aux routes avec `@Get`, `@Post`, `@Patch` ou `@Delete` ;
- injectent un service du domaine par constructeur ;
- transmettent les données validées au service ;
- utilisent `ParseUUIDPipe` pour plusieurs identifiants de route ;
- appliquent `@Roles(AccessRole.ADMIN)` au niveau du contrôleur ou de certaines méthodes ;
- utilisent `@CurrentUser` lorsque l'identité de l'utilisateur est nécessaire ;
- journalisent certaines mutations administratives avec `AuditLogService`.

Le préfixe global `/api/v1` est appliqué dans `apps/backend/src/main.ts`. Les contrôleurs ne répètent donc pas ce préfixe.

### 3.4 Services et accès Prisma

Les services portent les lectures, écritures et règles métier. Les services `EmployeesService`, `SchedulesService`, `CalendarService`, `AttendanceService`, `DashboardService`, `AuthService` et `SanctionsService` injectent directement `PrismaService`.

`PrismaModule` est annoté `@Global`, fournit `PrismaService` et l'exporte. Les modules métier n'importent donc pas individuellement ce module. `PrismaService` étend `PrismaClient` et appelle `$disconnect()` lors de la destruction du module.

Les méthodes de service utilisent les opérations Prisma réellement observées :

- `findMany`, `findUnique`, `findFirst` et `count` pour les lectures ;
- `create`, `update`, `updateMany` et `delete` pour les mutations ;
- `aggregate` et `groupBy` pour les statistiques ;
- `$transaction` pour certaines opérations composées ;
- les erreurs Prisma connues lorsque le domaine doit traduire un conflit de base en exception HTTP.

La logique métier demeure dans les services. Par exemple, le contrôleur des employés délègue la création, la mise à jour, le statut, le rôle, le département et l'affectation du planning à `EmployeesService`.

### 3.5 DTO et validation

Les DTO sont des classes TypeScript. Les décorateurs observés comprennent notamment :

- `@IsString`, `@IsEmail`, `@IsBoolean`, `@IsEnum` et `@IsUUID` ;
- `@IsOptional` et `@ValidateIf` pour les variantes de création et de modification ;
- `@Min`, `@Max`, `@MinLength` et `@MaxLength` ;
- `@Matches` et `@IsNotIn` pour des règles de format et des valeurs interdites ;
- `@Transform` pour normaliser certaines chaînes vides en `null`.

Le bootstrap installe un `ValidationPipe` global avec les options observées suivantes :

| Option | Effet |
| --- | --- |
| `whitelist: true` | Ne conserve que les propriétés décrites par le DTO |
| `forbidNonWhitelisted: true` | Refuse les propriétés supplémentaires |
| `transform: true` | Transforme la charge reçue vers la classe ou le type attendu |
| `enableImplicitConversion: true` | Autorise la conversion implicite compatible avec les métadonnées |

Les DTO de modification contiennent généralement des propriétés optionnelles. Ils sont distincts des DTO de création ; aucune dépendance à un générateur automatique de DTO n'est observée.

### 3.6 Tests backend

Les tests présents sont des suites Jest end-to-end configurées par `apps/backend/test/jest-e2e.json`. Les fichiers observés couvrent :

| Fichier | Périmètre apparent |
| --- | --- |
| `app.e2e-spec.ts` | Parcours API applicatifs principaux |
| `attendance-calendar-absence.e2e-spec.ts` | Interactions pointage, calendrier et absence |
| `calendar.e2e-spec.ts` | Module calendrier |
| `environment-validation.e2e-spec.ts` | Validation de la configuration |
| `monthly-attendance-puppeteer-renderer.e2e-spec.ts` | Rendu PDF mensuel |
| `non-working-day-attendance.e2e-spec.ts` | Pointage un jour non ouvré |
| `sanctions.e2e-spec.ts` | Règles et calculs de sanctions |

Le dépôt ne contient pas un fichier de test propre à chaque contrôleur ou service. La couverture visible est organisée par scénarios end-to-end et n'est pas uniforme entre les modules.

## 4. Structure Frontend

### 4.1 Éléments observés

| Élément | Organisation réellement présente | Exemples |
| --- | --- | --- |
| Pages | App Router sous `apps/frontend/app/<route>/page.tsx` | `employees`, `schedules`, `calendar`, `attendance-entry`, `attendance-history` |
| États de route | Fichiers `loading.tsx` et `error.tsx` sur certaines routes | Employés, plannings, calendrier et pointage |
| Composants métier | Répertoires par domaine sous `components` | `employees`, `schedules`, `calendar`, `attendance`, `sanctions` |
| Composants réutilisables | `components/ui`, `components/layout`, `components/admin` | Boutons, cartes, badges, squelette, enveloppe de page et navigation |
| Aides de domaine | Fichiers `.helpers.ts` ou `.ts` proches des composants | Gestionnaires employés et plannings, affichage et flux de pointage |
| Contrats API | Types et fonctions dans `lib/api.ts` | Charges utiles, réponses et fonctions de lecture serveur |
| Proxies API | Route Handlers dans `app/api` | Employés, plannings, calendrier, sanctions, authentification et pointage |
| Formulaires | Implémentés dans des composants clients | Gestionnaires employés/plannings, espace calendrier, règles de sanctions |
| État | Hooks React directement dans les composants clients | `useState`, `useMemo`, `useEffect`, `useRef`, `useTransition` |
| Hooks métier dédiés | Aucun répertoire ni fichier de hook métier observé | Les hooks React sont utilisés directement dans les composants |
| Tests frontend | Aucun fichier `*.test.*` ou `*.spec.*` observé | Le contrôle spécifique disponible est le script de validation des proxies |

### 4.2 Pages App Router

Les pages administratives `employees`, `schedules` et `calendar` présentent un schéma répété :

1. la page est un composant serveur asynchrone ;
2. elle appelle `requireCurrentUser()` ;
3. elle redirige les utilisateurs non administrateurs vers `/my-attendance` ;
4. elle récupère le jeton de session avec `getSessionToken()` ;
5. elle charge les données initiales par une fonction de `lib/api.ts` ;
6. elle compose `PageShell`, la navigation, les composants UI et un composant métier ;
7. elle transmet les données initiales au composant client.

Plusieurs pages déclarent `dynamic = 'force-dynamic'`. Certaines utilisent `searchParams` pour sélectionner un mois ou un onglet.

Ce schéma n'est pas universel. La page de connexion, le terminal de pointage et le tableau de bord ont des parcours adaptés à leur rôle.

### 4.3 Composants clients et formulaires

Les composants interactifs portent la directive `'use client'`. Les gestionnaires des employés et des plannings conservent localement :

- la collection affichée ;
- le mode création ou modification ;
- l'identifiant en cours d'édition ;
- les valeurs du formulaire ;
- le retour de succès ou d'erreur ;
- l'état de soumission ;
- l'action en cours sur une ligne ;
- les critères de recherche et de filtrage.

Les valeurs dérivées et les listes filtrées utilisent `useMemo`. Les effets liés au navigateur ou au cycle d'un panneau utilisent `useEffect`. Les formulaires interceptent `FormEvent`, construisent une charge JSON, puis appellent une route locale `/api/...`.

La validation frontend observée complète la validation backend pour certains champs, mais le contrat définitif reste vérifié par les DTO du backend. Les messages d'erreur des réponses sont normalisés avec `getClientErrorMessage`.

### 4.4 Appels API

Deux chemins d'appel coexistent :

| Contexte | Chemin observé |
| --- | --- |
| Chargement dans un composant serveur | Page → fonction de `lib/api.ts` → `fetchServerApi` → backend |
| Mutation depuis un composant client | Composant → `/api/<domaine>` → Route Handler → fonction de `lib/api-route.ts` → backend |
| Authentification | Formulaire → Route Handler d'authentification → backend → écriture du cookie |
| Pointage employé | Composant → proxy de pointage → sélection de la session courte → backend |

Les Route Handlers utilisent des fonctions partagées telles que `proxyApiRequest`, `proxyApiJsonBodyRequest`, `proxyApiIdRequest` et `proxyApiIdJsonBodyRequest`. Les identifiants dynamiques sont validés et encodés par cette frontière commune avant la construction du chemin backend.

Les composants clients ne reçoivent pas directement le secret JWT applicatif. Le proxy lit le cookie côté serveur et transmet le jeton au backend.

### 4.5 Types frontend

`apps/frontend/lib/api.ts` déclare manuellement les types consommés par l'interface, parmi lesquels :

- `AuthenticatedUser` et `EmployeeRecord` ;
- `Schedule` et `ScheduleRecord` ;
- les charges `CreateEmployeePayload`, `UpdateEmployeePayload`, `CreateSchedulePayload` et `UpdateSchedulePayload` ;
- les enregistrements de pointage et les métriques du tableau de bord ;
- les types du calendrier, des sanctions et de la sécurité de pointage.

Aucun package partagé de types entre le frontend et le backend n'est présent dans le workspace. Les types frontend et les DTO backend sont donc maintenus dans leurs applications respectives.

## 5. Cycle de développement d'un module

### 5.1 Séquence observable

L'historique des migrations, le schéma Prisma, les modules NestJS, les Route Handlers et les composants montrent la chaîne suivante pour les fonctionnalités qui traversent toutes les couches :

```text
Base de données PostgreSQL
          ^
          │ migrations SQL
          │
schema.prisma
          |
          v
Génération Prisma Client
          |
          v
Service métier NestJS
          |
          v
Controller + DTO + routes /api/v1
          |
          v
Route Handler Next.js /api
          |
          v
Page serveur + composant client
          |
          v
Tests backend end-to-end
et validation des proxies
```

### 5.2 Étapes matérialisées dans le dépôt

| Étape | Artefact observable | Exemple |
| --- | --- | --- |
| Base de données | Migration SQL datée | Ajout du calendrier RH ou des règles de sanctions |
| Schéma | Modèle, énumération, relation ou index Prisma | `CalendarEntry`, `SanctionRule`, relations avec `Employee` |
| Client Prisma | Script `prisma:generate` | Génération depuis `apps/backend/prisma/schema.prisma` |
| Backend | Module, service, contrôleur et DTO | `calendar`, `employees`, `schedules` |
| API | Routes sous le préfixe `/api/v1` | Contrôleurs NestJS |
| Contrat frontend | Types et fonctions de `lib/api.ts` | Types calendrier, employés, plannings et sanctions |
| Proxy frontend | Route Handler sous `app/api` | Proxies CRUD des employés, plannings et jours fériés |
| Interface | Page App Router et composants du domaine | `calendar/page.tsx` et `calendar-workspace.tsx` |
| Vérification | Tests e2e et script proxy lorsque le domaine est couvert | Tests calendrier/sanctions et `validate-proxy.mjs` |

Les tests ne constituent pas une étape matérialisée pour chaque module. Aucun test frontend unitaire n'est présent. Le cycle observé se termine donc par les contrôles disponibles selon le périmètre concerné, et non par une suite dédiée systématiquement à chaque nouveau domaine.

### 5.3 Scripts associés au cycle

| Script racine | Action réellement définie |
| --- | --- |
| `prisma:generate` | Génère Prisma Client depuis l'application backend |
| `prisma:migrate` | Exécute `prisma migrate dev` |
| `prisma:migrate:deploy` | Applique les migrations existantes avec `migrate deploy` |
| `typecheck` | Vérifie successivement les types backend et frontend |
| `lint` | Exécute ESLint sur le dépôt |
| `test:backend` | Exécute les suites Jest end-to-end du backend |
| `test:proxy` | Exécute `scripts/validate-proxy.mjs` |
| `build:backend` | Compile l'application NestJS |
| `build:frontend` | Construit l'application Next.js |
| `validate` | Enchaîne format, génération Prisma, typage, lint, tests backend, builds et validation proxy |

## 6. Dépendances entre couches

### 6.1 Frontend vers backend

Le frontend dépend des contrats HTTP du backend, mais ne l'importe pas comme package TypeScript :

- `lib/api.ts` construit les appels serveur et décrit les réponses attendues ;
- les Route Handlers de `app/api` délèguent à `lib/api-route.ts` ;
- `fetchServerApi` utilise l'URL backend configurée ;
- les cookies d'authentification sont lus côté serveur ;
- les pages et composants consomment les types définis localement dans l'application frontend.

La communication est exclusivement HTTP dans le code applicatif observé. Aucun import de fichiers source NestJS depuis le frontend n'est présent.

### 6.2 Backend vers Prisma

Les services backend injectent `PrismaService`, qui étend le client généré. Les types et énumérations générés par `@prisma/client` sont aussi importés par :

- les contrôleurs pour les rôles ;
- les DTO pour les validations d'énumération ;
- les services pour les filtres, statuts et types de charges Prisma ;
- les types métier lorsque leur forme reprend une énumération persistante.

Le module Prisma global rend le service disponible sans import répété dans chaque module métier.

### 6.3 Prisma vers PostgreSQL

Le `datasource` Prisma utilise le provider `postgresql` et lit `DATABASE_URL`. Le schéma déclare les modèles `Employee`, `Schedule`, `Attendance`, `CalendarEntry` et `SanctionRule`, ainsi que leurs énumérations, relations, contraintes uniques et index.

Les migrations sous `apps/backend/prisma/migrations` contiennent le SQL appliqué à PostgreSQL. Prisma Client traduit les opérations des services en requêtes vers cette base.

### 6.4 Dépendances backend internes

| Module consommateur | Module importé | Dépendance observée |
| --- | --- | --- |
| `DashboardModule` | `CalendarModule` | Utilisation du calendrier dans les agrégats |
| `AttendanceModule` | `CalendarModule` | Classification des jours et calcul des absences |
| `AttendanceModule` | `SanctionsModule` | Service de sanctions disponible pour l'orchestration d'export |
| `CalendarModule` | `AuditLogModule` | Journalisation des mutations administratives |
| Tous les modules métier utilisant la base | `PrismaModule` global | Injection de `PrismaService` |
| Routes protégées | `AuthModule` importé par `AppModule` | Guards JWT et rôles déclarés comme guards applicatifs |

## 7. Traçabilité

### 7.1 Organisation et assemblage

| Information | Fichiers analysés |
| --- | --- |
| Composition globale NestJS | `apps/backend/src/app.module.ts`, `apps/backend/src/main.ts` |
| Modules métier | Fichiers `*.module.ts` sous `apps/backend/src/modules` |
| Accès global à Prisma | `apps/backend/src/common/prisma/prisma.module.ts`, `prisma.service.ts`, `selects.ts` |
| Contrôle d'accès | `apps/backend/src/modules/auth/auth.module.ts`, `decorators/*`, `guards/*` |
| Audit | `apps/backend/src/common/audit/audit-log.module.ts`, `audit-log.service.ts` |

### 7.2 Exemples backend

| Domaine | Fichiers analysés |
| --- | --- |
| Employés | `apps/backend/src/modules/employees/employees.module.ts`, `employees.controller.ts`, `employees.service.ts`, `dto/*` |
| Plannings | `apps/backend/src/modules/schedules/schedules.module.ts`, `schedules.controller.ts`, `schedules.service.ts`, `dto/*` |
| Calendrier | `apps/backend/src/modules/calendar/calendar.module.ts`, `calendar.controller.ts`, `calendar.service.ts`, `calendar.types.ts`, `dto/*` |
| Pointages | `apps/backend/src/modules/attendance/attendance.module.ts`, contrôleur, services, DTO, exporteurs et utilitaires associés |
| Sanctions | `apps/backend/src/modules/sanctions/sanctions.module.ts`, contrôleur, service, configuration, types et DTO |
| Authentification | `apps/backend/src/modules/auth/auth.module.ts`, contrôleur, service, constantes, DTO, guards, décorateurs et interfaces |
| Tableau de bord | `apps/backend/src/modules/dashboard/dashboard.module.ts`, contrôleur, service et types |
| Santé | `apps/backend/src/modules/health/health.module.ts`, `health.controller.ts` |

### 7.3 Exemples frontend

| Sujet | Fichiers analysés |
| --- | --- |
| Pages App Router | Fichiers `page.tsx`, `loading.tsx` et `error.tsx` sous `apps/frontend/app` |
| Gestion employés | `apps/frontend/app/employees/page.tsx`, `components/employees/*`, `app/api/employees/**/route.ts` |
| Gestion plannings | `apps/frontend/app/schedules/page.tsx`, `components/schedules/*`, `app/api/schedules/**/route.ts` |
| Gestion calendrier | `apps/frontend/app/calendar/page.tsx`, `components/calendar/*`, `app/api/calendar/**/route.ts` |
| Pointage | `apps/frontend/app/attendance-entry/*`, `app/my-attendance/*`, `components/attendance/*`, proxies de pointage |
| Sanctions | `apps/frontend/app/sanctions/*`, `components/sanctions/*`, proxies de sanctions |
| Contrats et proxy | `apps/frontend/lib/api.ts`, `api-route.ts`, `auth.ts`, `auth-session.ts`, `client-error.ts` |
| Composants partagés | `apps/frontend/components/ui/*`, `layout/*`, `admin/*` |

### 7.4 Données, migrations et tests

| Sujet | Fichiers analysés |
| --- | --- |
| Modèles et relations | `apps/backend/prisma/schema.prisma` |
| Historique de base | Répertoires sous `apps/backend/prisma/migrations` |
| Jeu initial | `apps/backend/prisma/seed.ts` |
| Tests backend | `apps/backend/test/*.e2e-spec.ts`, `apps/backend/test/jest-e2e.json` |
| Validation proxy | `scripts/validate-proxy.mjs` |
| Scripts de contrôle | `package.json`, `apps/backend/package.json`, `apps/frontend/package.json` |

## 8. Observations

### 8.1 Réutilisation

- `PrismaService` est partagé globalement entre les modules backend.
- `CalendarService`, `SanctionsService`, `AttendanceService` et `AuthService` sont exportés par leurs modules lorsque d'autres composants doivent les consommer.
- Les sélections Prisma communes sont regroupées dans `common/prisma/selects.ts`.
- Les composants `Button`, `Card`, `Badge` et `Skeleton` constituent la couche UI réutilisée.
- `PageShell`, `AdminNav` et `AdminEmptyState` portent des structures transverses aux écrans administratifs.
- Les fonctions de proxy centralisent la transmission du jeton, la lecture des corps JSON, les identifiants dynamiques et la restitution des erreurs.
- Les gestionnaires des employés et plannings possèdent chacun un fichier d'aides colocalisé pour leurs valeurs de formulaire et métadonnées d'affichage.

### 8.2 Modularité

- Les domaines backend sont séparés par répertoire et assemblés explicitement dans `AppModule`.
- Un module n'exporte son service que lorsqu'un consommateur externe est observable.
- Les services spécialisés du domaine `attendance` restent dans ce domaine, tandis que les utilitaires de date et de sortie réutilisables sont placés dans `common/utils`.
- Les composants frontend sont regroupés par fonctionnalité, mais les contrats API demeurent dans un fichier central `lib/api.ts`.
- Les Route Handlers reproduisent la structure des ressources backend sous l'espace `/api` de Next.js.

### 8.3 Séparation des responsabilités

- Le contrôleur backend adapte HTTP et délègue le traitement au service.
- Les DTO valident les données entrantes ; le `ValidationPipe` global applique leur contrat.
- Les services exécutent les règles métier et les opérations Prisma.
- Le schéma Prisma porte les modèles, relations et contraintes de persistance.
- Les pages serveur contrôlent l'accès et chargent les données initiales.
- Les composants clients gèrent les formulaires, filtres, dialogues, retours utilisateur et mises à jour d'état.
- Les Route Handlers protègent la frontière entre le navigateur et l'API backend.

### 8.4 Organisation des fichiers

- Le nom du domaine est repris dans les fichiers NestJS : `.module.ts`, `.controller.ts` et `.service.ts`.
- Les DTO sont placés dans un sous-répertoire `dto`.
- Les composants frontend utilisent des noms de fichiers en minuscules séparés par des tirets.
- Les composants React exportés utilisent des noms en PascalCase.
- Les routes dynamiques Next.js utilisent des segments entre crochets tels que `[id]` et `[attendanceId]`.
- Les pages peuvent être complétées par des fichiers de chargement et d'erreur, mais ceux-ci ne sont pas présents sur toutes les routes.
- Aucun répertoire `hooks` n'existe dans l'application frontend actuelle ; les hooks React sont appelés directement dans les composants.
- Aucun package interne partagé entre frontend et backend n'est déclaré dans le workspace.
- Les tests backend sont regroupés dans `apps/backend/test` et non à côté des sources.
- Aucun test unitaire ou de composant frontend n'est présent ; `test:proxy` vérifie spécifiquement la couche proxy.
