# Performances et optimisations

| Métadonnée | Valeur |
|---|---|
| Document ID | API-013 |
| Titre | Performances et optimisations |
| Version | 1.0 |
| Statut | Validé |
| Classification | Interne |
| Référence | API Reference |
| Projet | Konatech Pointage |

# 1. Présentation

Ce chapitre recense les mécanismes du dépôt qui influencent directement le volume de données interrogé, le nombre d'opérations exécutées, la concurrence des lectures et les limites appliquées aux requêtes HTTP.

L'API s'appuie sur NestJS, Prisma Client et PostgreSQL. Les mécanismes observés comprennent des index et contraintes dans le schéma, des projections Prisma explicites, des agrégations exécutées par la base, des lectures indépendantes lancées en parallèle, une transaction ciblée et des limites fixes sur certains résultats du Dashboard. Le dépôt ne contient pas de mesure chiffrée de temps de réponse ou de débit.

# 2. Vue d'ensemble

| Mécanisme | Présence | Description |
|---|---|---|
| Index PostgreSQL déclarés par Prisma | Présent | Index simples et composés sur les modèles `Attendance`, `CalendarEntry` et `SanctionRule` |
| Contraintes uniques | Présent | Identifiants métier, courriels, noms de planning et couple employé/date de pointage |
| Projection de colonnes | Présent | Utilisation régulière de `select` dans les services Prisma |
| Agrégations en base | Présent | `count`, `aggregate` et `groupBy` dans le Dashboard |
| Requêtes parallèles | Présent | Groupes de lectures indépendantes exécutés avec `Promise.all` |
| Transaction Prisma | Présent | Transaction interactive lors de la création d'un employé |
| Limitation fixe de résultats | Présent | Activité récente et classements du Dashboard limités à cinq éléments |
| Filtres temporels | Présent | Intervalles de dates et filtres mensuels appliqués aux pointages, sanctions, calendrier et exports |
| Limitation du débit HTTP | Présent | `ThrottlerModule` et guard global configurés pour les requêtes générales et les connexions |
| Pagination pilotée par le client | Absent | Aucun DTO de pagination et aucune route ne reçoit page, limite, offset ou curseur |
| Cache applicatif ou HTTP partagé | Absent | Aucun module de cache NestJS ni intercepteur de cache |
| Redis | Absent | Aucun service Docker, module ou paquet Redis |
| Compression HTTP explicite | Absente | Aucun middleware ou paquet de compression configuré par le backend |
| Lazy loading Prisma | Absent | Les relations sont sélectionnées explicitement dans les requêtes |
| Pooler PostgreSQL dédié | Absent | La datasource Prisma utilise uniquement `DATABASE_URL` |
| Réplique PostgreSQL | Absente | Un seul service PostgreSQL est défini dans Docker Compose |
| Journalisation des requêtes Prisma | Absente | `PrismaClient` est instancié sans option de journalisation des requêtes |

# 3. Base de données

## 3.1 Index et contraintes

Le schéma `apps/backend/prisma/schema.prisma` déclare les index suivants, matérialisés dans les migrations SQL :

| Modèle | Type | Champs |
|---|---|---|
| `Attendance` | Contrainte unique composée | `employeeId`, `date` |
| `Attendance` | Index simples | `date`, `checkInDistanceMeters`, `checkInVerificationLevel`, `checkOutDistanceMeters`, `checkOutVerificationLevel`, `earlyExit`, `lateExit`, `overtimeHours`, `absenceCount` |
| `CalendarEntry` | Index simples | `date`, `type`, `employeeId` |
| `SanctionRule` | Index composé | `type`, `active` |
| `SanctionRule` | Index simple | `priority` |

Des contraintes uniques existent aussi sur `Employee.employeeCode`, `Employee.employeeIdentifier`, `Employee.pinCode`, `Employee.email` et `Schedule.name`. Les clés primaires UUID et les contraintes de relation sont définies dans le même schéma.

## 3.2 Formes de requêtes Prisma

Les services emploient des projections `select` afin de préciser les colonnes et relations retournées. Les sélections communes `scheduleSelect`, `publicEmployeeSelect`, `employeeWithScheduleSelect`, `scheduleWithEmployeesSelect` et `attendanceWithEmployeeSelect` sont centralisées dans `apps/backend/src/common/prisma/selects.ts`.

Les relations ne sont pas chargées implicitement. Lorsqu'un service a besoin d'un planning ou d'un employé associé, il le déclare par un `select` imbriqué. Les listes emploient des clauses `where` et `orderBy` Prisma propres à leur cas d'usage.

Les recherches unitaires utilisent `findUnique` sur les identifiants et contraintes uniques. Le pointage du jour s'appuie sur la contrainte composée `employeeId` et `date`. Les recherches de listes utilisent `findMany` avec des intervalles de dates pour les vues mensuelles.

## 3.3 Agrégations et limitation des résultats

Le service Dashboard utilise les opérations Prisma `count`, `aggregate` et `groupBy`. Les totaux et sommes sont ainsi demandés à PostgreSQL plutôt que reconstruits uniquement à partir de collections complètes en mémoire.

Les ensembles indépendants nécessaires à la vue d'ensemble sont regroupés dans deux appels `Promise.all`. L'activité récente utilise `take: 5`. Les classements de retards, d'heures supplémentaires et de départs anticipés utilisent chacun un `groupBy`, un ordre décroissant sur leur agrégat et `take: 5`.

Cette limite de cinq éléments est interne au service Dashboard. Elle ne constitue pas une pagination exposée au client.

## 3.4 Transaction

`EmployeesService.create()` utilise une transaction interactive `prisma.$transaction()`. La génération de `employeeIdentifier` et la création de l'employé s'exécutent avec le même client transactionnel. Le service peut répéter cette opération jusqu'à trois tentatives lorsqu'il identifie un conflit sur cet identifiant.

Aucune autre transaction Prisma n'est présente dans les services applicatifs analysés.

## 3.5 SQL et connexion

Le code applicatif n'utilise pas `$queryRaw` ni `$executeRaw`. Les requêtes SQL d'exploitation sont produites par Prisma Client à partir des méthodes de requête. Les migrations contiennent le SQL de création et d'évolution des tables, contraintes et index.

La datasource PostgreSQL lit uniquement `DATABASE_URL`. Aucun paramètre de pool, seconde URL directe ou composant de pooler n'est configuré dans le dépôt. `PrismaService` étend `PrismaClient` sans configuration de journalisation des requêtes et ferme le client avec `$disconnect()` lors de la destruction du module.

# 4. API

## 4.1 Filtres et périmètres

Les historiques, exports, sanctions et données du calendrier bornent les recherches avec des intervalles de dates. Les DTO permettent de choisir un mois pour les historiques, le calendrier et les sanctions mensuelles. L'export reçoit un mois, une année et, facultativement, un employé.

Les collections d'employés et de plannings ne déclarent ni filtre HTTP ni pagination. Les historiques de pointage renvoient le périmètre mensuel complet demandé. L'export mensuel charge les employés et leurs pointages du mois avant de générer le fichier.

## 4.2 Traitements concurrents

`AttendanceService.getSummary()` exécute en parallèle la lecture des pointages du jour et celle des employés actifs. `AttendanceMonthlyMetricsService` exécute en parallèle la lecture des pointages d'un employé et celle des jours non travaillés. `DashboardService` parallélise plusieurs lectures, comptages et agrégations indépendants.

Le recalcul mensuel des métriques parcourt toutefois les employés avec une boucle séquentielle. La génération d'export assemble le rapport en mémoire avant la production CSV ou PDF.

## 4.3 Limitation du débit

`ThrottlerModule` configure un limiteur général à partir de `RATE_LIMIT_TTL_MS` et `RATE_LIMIT_MAX`, ainsi qu'un limiteur de connexion à partir de `LOGIN_RATE_LIMIT_TTL_MS` et `LOGIN_RATE_LIMIT_MAX`. Deux limites supplémentaires protègent la connexion PIN du parcours de pointage. `AppThrottlerGuard` est enregistré comme guard global.

Ce mécanisme borne le nombre de requêtes admises dans une fenêtre temporelle. Il ne stocke pas les réponses et ne remplace pas une pagination de données.

## 4.4 Cache et réponses

Aucun `CacheModule`, `CacheInterceptor` ou stockage de résultats calculés n'est présent dans le backend. Chaque appel Dashboard et chaque export reconstruit son résultat depuis les données accessibles au moment de la requête.

L'endpoint d'export mensuel définit explicitement `Cache-Control: no-store`. Aucun middleware de compression HTTP n'est installé ou activé dans `main.ts`.

# 5. Infrastructure

## 5.1 Docker et PostgreSQL

`docker-compose.yml` définit un unique conteneur `postgres:16-alpine`. Aucun service Redis, proxy de cache, pooler ou réplique PostgreSQL n'y est déclaré.

Le backend dépend de l'état sain de PostgreSQL. Son Dockerfile utilise des étapes `base`, `build` et `runtime`, génère Prisma Client et compile NestJS durant l'étape de build, puis exécute les migrations avant `node dist/main.js`. Le conteneur de production expose un seul processus backend sur le port 4000.

Ces fichiers ne définissent ni paramètres PostgreSQL de mémoire ou de parallélisme, ni limites CPU ou mémoire des conteneurs, ni mécanisme d'autoscaling.

## 5.2 Prisma et stockage

Prisma Client constitue l'unique couche d'accès SQL de l'application en exécution. Le dépôt ne configure pas de cache de requêtes Prisma, de lecture sur réplique, de connexion distincte pour les migrations ou de pooler externe.

Les exports CSV et PDF sont renvoyés dans la réponse HTTP. Aucun service de stockage d'exports ni cache de fichiers générés n'est configuré.

# 6. Flux général

```text
Client HTTP
    |
    v
Guard de limitation du débit
    |
    v
Controller NestJS
    |
    v
Service applicatif
    |
    +--> filtres et projections `select`
    +--> Promise.all pour certaines lectures indépendantes
    +--> agrégations et limites fixes pour le Dashboard
    |
    v
Prisma Client
    |
    v
PostgreSQL
    +--> contraintes et index déclarés dans le schéma
    |
    v
Résultat Prisma
    |
    v
Réponse HTTP directe ou export généré
```

Ce flux varie selon l'endpoint : le contrôle de santé ne consulte pas Prisma, tandis que les exports ajoutent une phase de génération CSV ou PDF après la constitution du rapport.

# 7. Traçabilité

| Élément documenté | Fichier ou répertoire source | Preuve observée |
|---|---|---|
| Index et contraintes | `apps/backend/prisma/schema.prisma` | Directives `@unique`, `@@unique` et `@@index` |
| SQL des index | `apps/backend/prisma/migrations` | Instructions `CREATE INDEX` et `CREATE UNIQUE INDEX` dans les migrations |
| Client Prisma | `apps/backend/src/common/prisma/prisma.service.ts` | Extension de `PrismaClient` et déconnexion au cycle de vie |
| Projections communes | `apps/backend/src/common/prisma/selects.ts` | Objets `select` typés pour planning, employé et pointage |
| Requêtes de pointage | `apps/backend/src/modules/attendance/attendance.service.ts` | Filtres de date, projections, tris et lectures parallèles |
| Métriques mensuelles | `apps/backend/src/modules/attendance/attendance-monthly-metrics.service.ts` | Sélections ciblées, lectures parallèles et parcours séquentiel des employés |
| Requêtes Dashboard | `apps/backend/src/modules/dashboard/dashboard.service.ts` | `Promise.all`, `count`, `aggregate`, `groupBy` et `take: 5` |
| Transaction de création | `apps/backend/src/modules/employees/employees.service.ts` | Transaction interactive et reprise limitée en cas de conflit d'identifiant |
| Requêtes calendrier | `apps/backend/src/modules/calendar/calendar.service.ts` | Filtres temporels, tris et projections |
| Requêtes sanctions | `apps/backend/src/modules/sanctions/sanctions.service.ts` | Filtres mensuels, agrégations applicatives, tris et projections |
| Export mensuel | `apps/backend/src/modules/attendance/exports/monthly-attendance-export.service.ts` | Chargement mensuel avec projections et ordre déterminé |
| Absence de cache sur l'export | `apps/backend/src/modules/attendance/attendance.controller.ts` | En-tête `Cache-Control: no-store` |
| Limitation du débit | `apps/backend/src/app.module.ts` | Configuration de `ThrottlerModule` et enregistrement du guard global |
| Traitement du throttling | `apps/backend/src/common/security/app-throttler.guard.ts` | Comptage, en-têtes de limite et réponse de blocage |
| Dépendances backend | `apps/backend/package.json` | Prisma et throttler présents ; aucun paquet Redis, cache ou compression |
| Service PostgreSQL | `docker-compose.yml` | Conteneur PostgreSQL unique, dépendance de santé et absence de Redis ou pooler |
| Image backend | `docker/backend.Dockerfile` | Build multi-étapes, génération Prisma, compilation et commande d'exécution |
| Configuration HTTP | `apps/backend/src/main.ts` | Aucun middleware de cache ou de compression configuré |

# 8. Observations

- Les index explicites se concentrent sur les dates, les données de vérification du pointage, les résultats de sortie et les règles de sanction.
- Les services sélectionnent explicitement leurs champs et relations Prisma ; aucun lazy loading applicatif n'est présent.
- Le Dashboard concentre les usages de comptage, d'agrégation, de regroupement, de lectures parallèles et de limitation fixe des résultats.
- La transaction applicative observée concerne la génération d'identifiant et la création d'un employé.
- Les routes de collection ne proposent pas de pagination générique ; plusieurs traitements mensuels chargent l'intégralité du périmètre demandé.
- Le backend limite le débit des requêtes, mais ne conserve pas de réponse en cache.
- Aucun Redis, cache partagé, middleware de compression, pooler PostgreSQL, réplique ou configuration d'autoscaling n'est présent dans les fichiers exécutables analysés.
- Le dépôt ne contient ni instrumentation de temps de réponse, ni benchmark, ni seuil de performance déclaré pour l'API.
