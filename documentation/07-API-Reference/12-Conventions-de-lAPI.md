# Conventions de l'API

| Métadonnée | Valeur |
|---|---|
| Document ID | API-012 |
| Titre | Conventions de l'API |
| Version | 1.0 |
| Statut | Validé |
| Classification | Interne |
| Référence | API Reference |
| Projet | Konatech Pointage |

# 1. Présentation

Ce chapitre décrit les conventions effectivement appliquées par l'API NestJS de Konatech Pointage. Elles sont établies à partir du bootstrap, des contrôleurs, des DTO et des services présents dans `apps/backend/src`.

L'API expose des routes HTTP sous un préfixe commun, reçoit des corps JSON, des paramètres de chemin et des paramètres de requête, puis transmet les traitements aux services applicatifs. Les réponses ne sont pas placées dans une enveloppe JSON générique : leur structure dépend du contrôleur et du service concernés.

# 2. Versionnement

Le bootstrap applique le préfixe global statique `api/v1` au moyen de `app.setGlobalPrefix('api/v1')`. Une route déclarée par un contrôleur est donc exposée sous `/api/v1`, suivi du chemin du contrôleur et de celui de la méthode.

Exemple de composition réellement présente :

```text
Préfixe global : /api/v1
Contrôleur     : /employees
Méthode        : /:id/status
Route obtenue  : /api/v1/employees/:id/status
```

Le dépôt ne configure pas le mécanisme de versionnement dynamique de NestJS et n'emploie pas de décorateur de version sur les contrôleurs. La chaîne `v1` fait partie du préfixe global unique configuré dans `apps/backend/src/main.ts`.

| Élément | Valeur observée | Source |
|---|---|---|
| Préfixe commun | `/api/v1` | `apps/backend/src/main.ts` |
| Version exposée | `v1`, intégrée au préfixe statique | `apps/backend/src/main.ts` |
| Chemin final | Préfixe global + chemin du contrôleur + chemin de la méthode | `apps/backend/src/main.ts`, contrôleurs sous `apps/backend/src/modules` |
| Versionnement par décorateur | Aucun décorateur de version présent | `apps/backend/src` |

# 3. Conventions de nommage

## 3.1 Routes et ressources

Les chemins sont écrits en minuscules. Les ressources de collection utilisent des noms pluriels, notamment `employees`, `schedules` et `sanctions`. Les domaines `auth`, `attendance`, `calendar`, `dashboard` et `health` utilisent leur nom fonctionnel.

Les segments composés emploient des traits d'union : `attendance-entry`, `check-in`, `check-out` et `security-policy`. Le segment `me` désigne les opérations appliquées à l'utilisateur authentifié dans les contrôleurs d'authentification et de pointage.

| Convention observée | Exemples réels | Source |
|---|---|---|
| Ressources de collection au pluriel | `/employees`, `/schedules`, `/sanctions` | `apps/backend/src/modules/employees/employees.controller.ts`, `apps/backend/src/modules/schedules/schedules.controller.ts`, `apps/backend/src/modules/sanctions/sanctions.controller.ts` |
| Domaines fonctionnels en minuscules | `/auth`, `/attendance`, `/calendar`, `/dashboard`, `/health` | Contrôleurs correspondants sous `apps/backend/src/modules` |
| Segments composés en kebab-case | `/attendance-entry/login`, `/check-in`, `/check-out`, `/security-policy` | `apps/backend/src/modules/auth/auth.controller.ts`, `apps/backend/src/modules/attendance/attendance.controller.ts` |
| Ressource courante | `/auth/me`, `/attendance/me/today`, `/attendance/me/history` | `apps/backend/src/modules/auth/auth.controller.ts`, `apps/backend/src/modules/attendance/attendance.controller.ts` |
| Identifiant générique | `:id` | Contrôleurs `employees`, `schedules`, `calendar` et `sanctions` |
| Identifiant qualifié | `:attendanceId` | `apps/backend/src/modules/sanctions/sanctions.controller.ts` |

## 3.2 Code, DTO et champs échangés

Les classes DTO sont nommées en PascalCase avec le suffixe `Dto`, par exemple `LoginDto`, `CreateEmployeeDto` et `MonthlyAttendanceExportQueryDto`. Leurs fichiers sont nommés en kebab-case avec le suffixe `.dto.ts`.

Les propriétés des DTO, des objets de réponse et des modèles manipulés par les services sont écrites en camelCase, par exemple `employeeId`, `accessToken`, `tokenType`, `expiresIn`, `pinCode` et `scheduleId`. Les valeurs d'énumération observées dans les DTO et le schéma Prisma utilisent des identifiants en majuscules, tels que `ADMIN`, `EMPLOYEE`, `ACTIVE` et `INACTIVE`.

# 4. Formats des requêtes

## 4.1 Corps JSON

Les méthodes `POST` et `PATCH` qui reçoivent des données utilisent `@Body()` avec un DTO. Le bootstrap désactive le body parser implicite de NestJS, puis installe explicitement `bodyParser.json()` et `bodyParser.urlencoded()`, tous deux limités par la variable `JSON_BODY_LIMIT`.

Les données de connexion, de création, de mise à jour et de pointage sont donc reçues comme objets structurés et validées par leur DTO. Les données de sécurité de pointage, dont la photo lorsqu'elle est fournie, restent intégrées au corps JSON ; aucun contrôleur n'expose de réception multipart.

## 4.2 Paramètres de requête

Les paramètres de requête réellement déclarés sont regroupés dans quatre DTO.

| Routes concernées | Paramètres | Format ou validation observée | DTO | Source |
|---|---|---|---|---|
| `/api/v1/attendance/history`, `/api/v1/attendance/me/history` | `month`, facultatif | Chaîne au format `YYYY-MM` | `AttendanceHistoryQueryDto` | `apps/backend/src/modules/attendance/dto/attendance-history-query.dto.ts` |
| `/api/v1/attendance/exports/monthly` | `month`, `year`, `format`, `employeeId` | Mois entier de 1 à 12 ; année entière de 2000 à 2100 ; format facultatif `csv` ou `pdf` ; identifiant employé UUID facultatif | `MonthlyAttendanceExportQueryDto` | `apps/backend/src/modules/attendance/dto/monthly-attendance-export-query.dto.ts` |
| `/api/v1/calendar/month`, `/api/v1/calendar/holidays` | `month`, facultatif | Chaîne au format `YYYY-MM` | `CalendarMonthQueryDto` | `apps/backend/src/modules/calendar/dto/calendar-month-query.dto.ts` |
| `/api/v1/sanctions/monthly` | `month`, `employeeId`, facultatifs | `month` au format `YYYY-MM` ; `employeeId` validé comme chaîne | `MonthlySanctionsQueryDto` | `apps/backend/src/modules/sanctions/dto/monthly-sanctions-query.dto.ts` |

La transformation implicite activée globalement permet notamment de convertir les paramètres `month` et `year` de l'export vers les nombres attendus par leur DTO.

## 4.3 Paramètres de chemin

Les contrôleurs `employees`, `schedules` et `calendar` appliquent `ParseUUIDPipe` à leurs paramètres `:id`. La mise à jour d'une règle de sanction applique également ce pipe à `:id`. La route `/api/v1/sanctions/attendance/:attendanceId` reçoit pour sa part `attendanceId` directement comme chaîne.

## 4.4 Validation commune

Le `ValidationPipe` global applique les options suivantes :

| Option | Valeur | Effet observé dans la configuration |
|---|---:|---|
| `whitelist` | `true` | Conserve les propriétés déclarées par les DTO |
| `forbidNonWhitelisted` | `true` | Rejette les propriétés non déclarées |
| `transform` | `true` | Transforme les données reçues vers les types attendus |
| `enableImplicitConversion` | `true` | Active la conversion implicite lors de la transformation |

Source : `apps/backend/src/main.ts`.

# 5. Formats des réponses

## 5.1 Réponses JSON

La majorité des contrôleurs retourne directement le résultat de son service. Selon l'opération, le corps JSON est donc un objet métier ou un tableau, sans enveloppe commune de type `data` ou `meta` ajoutée par un intercepteur global.

| Catégorie | Structure observée | Source |
|---|---|---|
| Collections | Tableau retourné directement par le service | `apps/backend/src/modules/employees/employees.controller.ts`, `apps/backend/src/modules/schedules/schedules.controller.ts` |
| Ressource ou résultat métier | Objet retourné directement par le service | Contrôleurs sous `apps/backend/src/modules` |
| Connexion | Objet contenant `accessToken`, `tokenType`, `expiresIn` et `user` | `apps/backend/src/modules/auth/auth.service.ts` |
| Utilisateur courant | Objet `AuthenticatedUser` retourné directement | `apps/backend/src/modules/auth/auth.controller.ts` |
| Santé | Objet contenant `status`, `service` et `timestamp` | `apps/backend/src/modules/health/health.controller.ts` |

Les instances JavaScript de `Date` présentes dans les résultats Prisma sont sérialisées en chaînes JSON ISO 8601 par le serveur HTTP NestJS.

## 5.2 Réponses non JSON

| Route | Réponse observée | Source |
|---|---|---|
| `GET /api/v1/attendance/entry` | Redirection HTTP `302` vers la route frontend d'entrée de pointage | `apps/backend/src/modules/attendance/attendance.controller.ts` |
| `GET /api/v1/attendance/exports/monthly` | CSV sous forme de chaîne ou PDF sous forme de `StreamableFile`, avec en-têtes `Content-Type`, `Content-Disposition` et `Cache-Control` | `apps/backend/src/modules/attendance/attendance.controller.ts`, `apps/backend/src/modules/attendance/exports/monthly-attendance-export.service.ts` |

## 5.3 Statuts HTTP

Aucun contrôleur n'emploie `@HttpCode()`. Les méthodes suivent donc les statuts par défaut de NestJS : `201 Created` pour les routes `POST`, `200 OK` pour les routes `GET`, `PATCH` et `DELETE`, à l'exception de la redirection explicitement déclarée en `302` et des réponses d'erreur émises par la validation, les guards ou les services.

Les erreurs reposent sur les exceptions HTTP NestJS et sur le format standard produit par le framework. Aucun filtre global ni intercepteur global ne définit une enveloppe de réponse commune dans le bootstrap.

# 6. Pagination, tri et filtres

## 6.1 Pagination

Aucun DTO ni contrôleur ne déclare de paramètre `page`, `pageSize`, `limit`, `offset`, `cursor`, `skip` ou `take` pour une pagination pilotée par le client. Les endpoints de collection retournent leurs résultats sans métadonnées de pagination.

## 6.2 Tri

Aucun paramètre de tri n'est exposé par les contrôleurs. Les ordres présents sont définis dans les services et ne sont pas sélectionnables par le client.

| Données | Ordre interne observé | Source |
|---|---|---|
| Employés | `createdAt` décroissant, puis `lastName` et `firstName` croissants | `apps/backend/src/modules/employees/employees.service.ts` |
| Plannings | `createdAt` décroissant, puis `name` croissant | `apps/backend/src/modules/schedules/schedules.service.ts` |
| Historique des pointages | `date`, puis `createdAt`, décroissants | `apps/backend/src/modules/attendance/attendance.service.ts` |
| Entrées du calendrier | `date`, puis `createdAt`, croissants | `apps/backend/src/modules/calendar/calendar.service.ts` |
| Règles de sanction | `priority`, puis `createdAt`, croissants | `apps/backend/src/modules/sanctions/sanctions.service.ts` |
| Sanctions mensuelles | `employeeId`, `date` et `createdAt`, croissants | `apps/backend/src/modules/sanctions/sanctions.service.ts` |

## 6.3 Filtres

Les filtres HTTP exposés sont limités aux paramètres recensés dans les DTO de requête : période mensuelle par `month`, année et mois de l'export, format d'export, et sélection facultative par `employeeId`. Les autres critères utilisés par les services sont déterminés par la route, l'utilisateur authentifié ou la logique du service, et non par un mécanisme générique de filtrage.

# 7. Flux général

Le flux commun aux routes métier qui accèdent aux données est le suivant :

```text
Client HTTP
    |
    v
Préfixe statique /api/v1
    |
    v
Guard global / ValidationPipe selon la route et les données
    |
    v
Contrôleur du module
    |
    v
Service applicatif
    |
    v
PrismaService / Prisma Client
    |
    v
PostgreSQL
    |
    v
Résultat du service
    |
    v
Réponse HTTP JSON, fichier ou redirection selon la route
```

Le guard JWT global est contourné uniquement par les routes portant le décorateur `@Public()`. La validation DTO intervient lorsque le contrôleur déclare un corps ou une requête typée. L'endpoint de santé retourne directement son objet et la redirection d'entrée de pointage ne passe pas par Prisma.

# 8. Traçabilité

| Convention documentée | Fichier ou répertoire source | Preuve observée |
|---|---|---|
| Préfixe statique `/api/v1` | `apps/backend/src/main.ts` | Appel à `setGlobalPrefix` |
| Formats de corps acceptés | `apps/backend/src/main.ts` | Configuration explicite des parseurs JSON et URL-encoded |
| Validation globale | `apps/backend/src/main.ts` | `ValidationPipe` global et ses quatre options |
| Regroupement des routes | `apps/backend/src/modules` | Contrôleurs NestJS organisés par module |
| Routes d'authentification et segment `me` | `apps/backend/src/modules/auth/auth.controller.ts` | Chemins `login`, `attendance-entry/login` et `me` |
| Routes de pointage et segments composés | `apps/backend/src/modules/attendance/attendance.controller.ts` | Chemins `check-in`, `check-out`, `security-policy` et export mensuel |
| Ressource employés et identifiants UUID | `apps/backend/src/modules/employees/employees.controller.ts` | Contrôleur `employees` et `ParseUUIDPipe` sur `:id` |
| Ressource plannings et identifiants UUID | `apps/backend/src/modules/schedules/schedules.controller.ts` | Contrôleur `schedules` et `ParseUUIDPipe` sur `:id` |
| Routes calendrier | `apps/backend/src/modules/calendar/calendar.controller.ts` | Paramètre mensuel et ressource `holidays` |
| Routes sanctions | `apps/backend/src/modules/sanctions/sanctions.controller.ts` | Sous-ressources `rules`, `monthly` et `attendance/:attendanceId` |
| Réponse Dashboard | `apps/backend/src/modules/dashboard/dashboard.controller.ts` | Retour direct du service pour `overview` |
| Réponse de santé | `apps/backend/src/modules/health/health.controller.ts` | Objet `status`, `service`, `timestamp` |
| Forme de la réponse de connexion | `apps/backend/src/modules/auth/auth.service.ts` | Objet `accessToken`, `tokenType`, `expiresIn`, `user` |
| Paramètres mensuels d'historique | `apps/backend/src/modules/attendance/dto/attendance-history-query.dto.ts` | Propriété `month` facultative au format `YYYY-MM` |
| Paramètres d'export | `apps/backend/src/modules/attendance/dto/monthly-attendance-export-query.dto.ts` | Mois, année, format et employé validés |
| Paramètres calendrier | `apps/backend/src/modules/calendar/dto/calendar-month-query.dto.ts` | Propriété `month` facultative au format `YYYY-MM` |
| Paramètres sanctions | `apps/backend/src/modules/sanctions/dto/monthly-sanctions-query.dto.ts` | Propriétés facultatives `month` et `employeeId` |
| Accès aux données | `apps/backend/src/prisma/prisma.service.ts` | Service dérivé de `PrismaClient` injecté dans les services métier |
| Modèles et noms de champs | `apps/backend/prisma/schema.prisma` | Modèles Prisma, champs camelCase et énumérations |

# 9. Observations

- L'espace d'URL actif est unique et commence par `/api/v1`.
- Les 38 routes déclarées utilisent `GET`, `POST`, `PATCH` et `DELETE` ; aucun contrôleur ne déclare de route `PUT`.
- Les conventions de chemin combinent ressources plurielles, domaines fonctionnels singuliers et segments composés en kebab-case.
- Les DTO centralisent les champs acceptés et leurs validations ; le pipe global rejette les propriétés supplémentaires.
- Les paramètres de collection exposés concernent des filtres mensuels et l'export ; aucune pagination ni aucun tri sélectionnable par le client n'est déclaré.
- Les réponses JSON suivent les structures propres aux services et aux contrôleurs, sans enveloppe commune globale.
- L'export mensuel et la redirection de pointage constituent les réponses non JSON explicitement configurées.
