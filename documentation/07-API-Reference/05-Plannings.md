# API Reference — Plannings

| Métadonnée | Valeur |
|---|---|
| Document ID | API-005 |
| Titre | Plannings |
| Version | 1.0 |
| Statut | Validé |
| Classification | Interne |
| Référence | API Reference |
| Projet | Konatech Pointage |

## 1. Présentation

La ressource Planning correspond au modèle Prisma `Schedule` et au module NestJS `SchedulesModule`. Elle représente un horaire nommé comprenant une heure de début, une heure de fin, une marge de retard, un état actif et une liste de jours travaillés.

L'API expose la collection sous `/api/v1/schedules`. `SchedulesController` reçoit les requêtes administratives et délègue les lectures, créations et modifications à `SchedulesService`, qui utilise `PrismaService` pour accéder à PostgreSQL. Les réponses incluent les employés actuellement affectés au planning.

## 2. Vue d'ensemble

| Ressource | Description |
|---|---|
| Collection Plannings | Liste de tous les horaires, accompagnés de leurs employés affectés |
| Planning | Horaire identifié par un UUID et un nom unique |
| Fenêtre horaire | Couple `startTime` et `endTime` exprimé au format `HH:mm` |
| Marge de retard | Nombre entier de minutes entre 0 et 180 |
| Jours travaillés | Tableau non vide de jours uniques de la semaine |
| État | Indicateur booléen `isActive` |
| Employés affectés | Relation un-à-plusieurs depuis `Schedule` vers `Employee` |

## 3. Endpoints

Le préfixe global `/api/v1` est configuré dans `main.ts`. Le segment `schedules` est déclaré par `SchedulesController`.

| Méthode | Route | Description | Authentification |
|---|---|---|---|
| GET | `/api/v1/schedules` | Lister les plannings | Jeton Bearer, rôle `ADMIN` |
| GET | `/api/v1/schedules/:id` | Lire un planning | Jeton Bearer, rôle `ADMIN` |
| POST | `/api/v1/schedules` | Créer un planning | Jeton Bearer, rôle `ADMIN` |
| PATCH | `/api/v1/schedules/:id` | Modifier un planning | Jeton Bearer, rôle `ADMIN` |
| PATCH | `/api/v1/schedules/:id/status` | Activer ou désactiver un planning | Jeton Bearer, rôle `ADMIN` |

## 4. Description détaillée

### 4.1 GET `/api/v1/schedules`

| Élément | Valeur observée |
|---|---|
| Query Parameters | Aucun |
| Path Parameters | Aucun |
| Body | Aucun |
| DTO | Aucun |
| Traitement | Lecture Prisma de tous les plannings avec leurs employés |
| Ordre | `createdAt` décroissant, puis `name` croissant |

### 4.2 GET `/api/v1/schedules/:id`

| Élément | Valeur observée |
|---|---|
| Query Parameters | Aucun |
| Path Parameter `id` | UUID validé par `ParseUUIDPipe` |
| Body | Aucun |
| DTO | Aucun |
| Traitement | Recherche unique Prisma avec les employés affectés |

### 4.3 POST `/api/v1/schedules`

Le corps est validé par `CreateScheduleDto`.

| Champ | Présence | Validation observée |
|---|---|---|
| `name` | Obligatoire | Chaîne de 80 caractères au maximum |
| `startTime` | Obligatoire | Chaîne au format horaire 24 heures `HH:mm` |
| `endTime` | Obligatoire | Chaîne au format horaire 24 heures `HH:mm` |
| `latenessMarginMinutes` | Facultatif | Entier compris entre 0 et 180; valeur de service par défaut `0` |
| `isActive` | Facultatif | Booléen; valeur de service par défaut `true` |
| `workDays` | Obligatoire | Tableau non vide, sans doublon, composé de jours autorisés |

Les valeurs autorisées dans `workDays` sont `MONDAY`, `TUESDAY`, `WEDNESDAY`, `THURSDAY`, `FRIDAY`, `SATURDAY` et `SUNDAY`.

Après la validation du DTO, le service convertit les deux heures en minutes. `endTime` doit être strictement postérieure à `startTime` pour la même journée. Le planning est ensuite créé avec Prisma et retourné avec un tableau `employees`.

### 4.4 PATCH `/api/v1/schedules/:id`

| Élément | Valeur observée |
|---|---|
| Query Parameters | Aucun |
| Path Parameter `id` | UUID validé par `ParseUUIDPipe` |
| DTO | `UpdateScheduleDto`, dérivé de `CreateScheduleDto` avec tous les champs facultatifs |
| Body | Sous-ensemble de `name`, `startTime`, `endTime`, `latenessMarginMinutes`, `isActive` et `workDays` |

Chaque champ fourni conserve les validations de `CreateScheduleDto`. Le service charge d'abord le planning existant, combine les heures reçues avec les heures enregistrées, puis contrôle la fenêtre horaire résultante avant la mise à jour Prisma.

### 4.5 PATCH `/api/v1/schedules/:id/status`

| Élément | Valeur observée |
|---|---|
| Query Parameters | Aucun |
| Path Parameter `id` | UUID validé par `ParseUUIDPipe` |
| DTO | `UpdateScheduleStatusDto` |
| Body | `isActive`, booléen obligatoire |
| Traitement | Vérification de l'existence puis mise à jour de `isActive` |

## 5. Réponses

### 5.1 Structure d'un planning

`scheduleWithEmployeesSelect` définit la structure retournée par les cinq endpoints.

| Champ | Type observé | Origine |
|---|---|---|
| `id` | UUID sous forme de chaîne | Modèle `Schedule` |
| `name` | Chaîne | Modèle `Schedule` |
| `startTime` | Chaîne | Modèle `Schedule` |
| `endTime` | Chaîne | Modèle `Schedule` |
| `latenessMarginMinutes` | Nombre entier | Modèle `Schedule` |
| `isActive` | Booléen | Modèle `Schedule` |
| `workDays` | Valeur JSON, utilisée comme tableau de jours | Modèle `Schedule` et DTO |
| `createdAt` | Date sérialisée | Modèle `Schedule` |
| `updatedAt` | Date sérialisée | Modèle `Schedule` |
| `employees` | Tableau d'employés publics | Relation sélectionnée par Prisma |

Chaque élément de `employees` contient `id`, `employeeIdentifier`, `firstName`, `lastName`, `email`, `role`, `accessRole`, `department`, `isActive`, `scheduleId`, `createdAt` et `updatedAt`. Les secrets d'authentification et de pointage ne sont pas sélectionnés.

La route de collection retourne un tableau de ces objets. Les quatre autres routes retournent un objet Planning.

### 5.2 Codes HTTP observés

| Situation | Code | Source du comportement |
|---|---:|---|
| Lecture ou modification réussie | 200 | Handlers GET et PATCH |
| Création réussie | 201 | Handler POST NestJS |
| Corps invalide, UUID invalide ou fenêtre horaire incorrecte | 400 | `ValidationPipe`, `ParseUUIDPipe` et `SchedulesService` |
| Autorisation absente ou jeton non accepté | 401 | `JwtAuthGuard` et service Auth |
| Compte sans rôle `ADMIN` | 403 | `RolesGuard` |
| Planning introuvable | 404 | `SchedulesService` |
| Nom de planning déjà utilisé | 409 | Erreur Prisma `P2002` traduite par `SchedulesService` |
| Limite globale de requêtes atteinte | 429 | `AppThrottlerGuard` |

Les tests end-to-end vérifient directement les réponses 200, 201, 400 et 403 sur les routes Plannings.

## 6. Contrôle d'accès

`JwtAuthGuard` et `RolesGuard` sont enregistrés comme gardes globaux dans `AuthModule`. Le décorateur `@Roles(AccessRole.ADMIN)` est appliqué à `SchedulesController`; aucune de ses routes n'est publique.

```text
En-tête Authorization avec schéma Bearer
          |
          v
JwtAuthGuard
          |
          v
Compte actif chargé par AuthService
          |
          v
RolesGuard vérifie accessRole = ADMIN
          |
          v
Endpoint Schedules autorisé
```

Le décorateur `@CurrentUser()` fournit l'administrateur authentifié aux trois mutations. Après réussite du service, le contrôleur journalise les actions `schedule.create`, `schedule.update` et `schedule.status.update` avec `AuditLogService`.

## 7. Flux de traitement

### 7.1 Lecture

```text
Client
  |
  v
JwtAuthGuard -> RolesGuard (ADMIN)
  |
  v
SchedulesController
  |
  v
SchedulesService
  |
  v
PrismaService
  |
  v
PostgreSQL
  |
  v
Planning avec employés publics -> réponse JSON
```

### 7.2 Mutation

```text
Client
  |
  v
JwtAuthGuard -> RolesGuard (ADMIN)
  |
  v
ValidationPipe -> ParseUUIDPipe et/ou DTO
  |
  v
SchedulesController
  |
  v
SchedulesService
  |
  +--> contrôle de la fenêtre horaire
  |
  v
PrismaService -> PostgreSQL
  |
  v
AuditLogService -> réponse JSON 200 ou 201
```

Le contrôle de fenêtre intervient pour la création et la modification générale. La modification de statut vérifie l'existence du planning puis met à jour uniquement `isActive`.

## 8. Traçabilité

| Endpoint ou mécanisme | Fichier ou répertoire source | Preuve observée |
|---|---|---|
| Préfixe et validation globale | `apps/backend/src/main.ts` | `/api/v1`, `ValidationPipe` et transformation |
| Cinq endpoints Plannings | `apps/backend/src/modules/schedules/schedules.controller.ts` | Méthodes, chemins, UUID, DTO, rôle et audit |
| Composition du module | `apps/backend/src/modules/schedules/schedules.module.ts` | Contrôleur et fournisseur du service |
| Liste et détail | `apps/backend/src/modules/schedules/schedules.service.ts` | Requêtes Prisma, ordre et réponse 404 |
| Création | `apps/backend/src/modules/schedules/schedules.service.ts`, `apps/backend/src/modules/schedules/dto/create-schedule.dto.ts` | Valeurs par défaut, validations et fenêtre horaire |
| Modification générale | `apps/backend/src/modules/schedules/schedules.service.ts`, `apps/backend/src/modules/schedules/dto/update-schedule.dto.ts` | `PartialType`, fusion des heures et mise à jour |
| Modification de statut | `apps/backend/src/modules/schedules/schedules.service.ts`, `apps/backend/src/modules/schedules/dto/update-schedule-status.dto.ts` | Booléen obligatoire et mise à jour ciblée |
| Réponse Planning | `apps/backend/src/common/prisma/selects.ts` | `scheduleWithEmployeesSelect` et projection publique des employés |
| Persistance et relation | `apps/backend/prisma/schema.prisma` | Modèle `Schedule`, unicité du nom et relation `Employee[]` |
| Authentification | `apps/backend/src/modules/auth/guards/jwt-auth.guard.ts`, `apps/backend/src/modules/auth/auth.service.ts` | Bearer et chargement du compte actif |
| Autorisation | `apps/backend/src/modules/auth/guards/roles.guard.ts`, `apps/backend/src/modules/auth/decorators/roles.decorator.ts` | Contrôle de `accessRole` |
| Audit | `apps/backend/src/common/audit/audit-log.service.ts`, contrôleur Schedules | Trois événements après mutation |
| Limitation globale | `apps/backend/src/app.module.ts`, `apps/backend/src/common/security/app-throttler.guard.ts` | Configuration et garde global |
| Contrats testés | `apps/backend/test/app.e2e-spec.ts` | Accès ADMIN, refus EMPLOYEE, fenêtre, création, lecture et modifications |
| Documentation recoupée | `documentation/07-API-Reference/01-Presentation-de-lAPI.md`, `documentation/06-Developer-Guide/09-Modules-metier.md` | Recensement du module et contexte fonctionnel |

## 9. Observations

- Le module actif est nommé `SchedulesModule` et la ressource HTTP utilise le segment `/schedules`.
- Le contrôleur expose cinq endpoints et aucune route DELETE.
- Les cinq endpoints exigent le rôle d'accès `ADMIN`.
- La collection n'utilise ni pagination, ni filtre, ni Query Parameter.
- Les heures sont stockées comme chaînes et comparées après conversion en minutes.
- La règle de fenêtre exclut une heure de fin égale ou antérieure à l'heure de début; elle ne représente pas une plage traversant minuit.
- Le nom du planning est unique dans le schéma Prisma.
- `workDays` est persisté dans un champ JSON et validé comme tableau non vide de jours uniques.
- Les réponses incluent les employés affectés selon la projection publique.
- Les trois mutations produisent un événement d'audit après le traitement réussi du service.
