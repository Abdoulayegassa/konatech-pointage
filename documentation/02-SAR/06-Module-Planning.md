# Module Planning

| Métadonnée | Valeur |
|---|---|
| Document ID | SAR-SCH-001 |
| Titre | Module Planning |
| Version | 1.0 |
| Statut | Validé |
| Classification | Interne |
| Référence SAPDD | Module Planning |
| Date de génération | 29 juillet 2026 |

## 1. Présentation du module

### 1.1 Objectif

Le module Planning gère le catalogue des horaires de travail utilisés par Konatech Pointage. Un planning définit un nom, une heure de début, une heure de fin, une marge de retard, un état actif ou inactif et une liste de jours travaillés.

Le module fournit une interface d'administration et une API REST permettant de consulter, créer, modifier, activer et désactiver les plannings. Les affectations aux employés sont exposées dans les réponses, mais leur écriture relève du module Employés.

### 1.2 Responsabilités

Les responsabilités constatées sont :

- lecture de tous les plannings ;
- lecture d'un planning par UUID ;
- création d'un planning ;
- modification partielle ;
- activation et désactivation ;
- validation des plages horaires et des jours travaillés ;
- contrôle de l'unicité du nom ;
- inclusion des employés affectés dans les réponses ;
- journalisation des mutations administratives ;
- présentation, recherche et filtrage dans l'interface Next.js.

### 1.3 Périmètre fonctionnel

| Capacité | État dans le code |
|---|---|
| Consultation de la liste | Implémentée |
| Consultation d'un planning | Implémentée |
| Création | Implémentée |
| Modification | Implémentée |
| Activation/désactivation | Implémentée |
| Suppression | Non trouvée dans le code |
| Affectation directe depuis l'écran Planning | Non trouvée dans le code |
| Affectation via le module Employés | Implémentée |
| Pauses | Non trouvées dans le modèle, les DTO et le service |
| Horaires traversant minuit | Refusés par la règle de plage sur une même journée |
| Plages multiples par jour | Non trouvées dans le code |

Le module Planning est complètement opérationnel pour son périmètre de catalogue et de statut. Il ne contient pas d'opération de suppression ni de gestion interne des affectations.

Implémentation principale :

- `apps/backend/src/modules/schedules/schedules.module.ts`
- `apps/backend/src/modules/schedules/schedules.controller.ts`
- `apps/backend/src/modules/schedules/schedules.service.ts`
- `apps/frontend/app/schedules/page.tsx`
- `apps/frontend/components/schedules/admin-schedules-manager.tsx`

## 2. Position dans l'architecture

### 2.1 Interaction avec Auth

`SchedulesController` porte `@Roles(AccessRole.ADMIN)` au niveau de la classe. Les guards globaux `JwtAuthGuard` et `RolesGuard` imposent donc un JWT valide et le rôle d'accès `ADMIN` sur tous ses endpoints.

Le contrôleur utilise `@CurrentUser()` sur les mutations pour transmettre l'administrateur à `AuditLogService`.

La page `/schedules` appelle `requireCurrentUser()`, redirige les non-administrateurs vers `/my-attendance` et exige un jeton de session avant de charger les données.

### 2.2 Interaction avec Employee

La relation est de type un planning vers plusieurs employés, et un employé vers zéro ou un planning. `scheduleWithEmployeesSelect` inclut les employés affectés dans chaque réponse du module.

L'affectation n'est pas effectuée par `SchedulesService`. `EmployeesService` vérifie directement l'existence du planning, puis connecte ou déconnecte la relation Prisma. Les DTO de création et de modification d'employé acceptent également `scheduleId`.

### 2.3 Interaction avec Attendance

Le module Pointage charge le planning de l'employé et consomme :

- `id` ;
- `name` ;
- `startTime` ;
- `endTime` ;
- `latenessMarginMinutes` ;
- `isActive` ;
- `workDays`.

Il utilise ces valeurs pour déterminer si l'employé est attendu, calculer le retard, déterminer l'heure de sortie planifiée, calculer les absences et créer un snapshot historique.

### 2.4 Interaction avec Calendar

`SchedulesModule` n'importe pas `CalendarModule` et `SchedulesService` n'appelle pas `CalendarService`.

L'interaction est indirecte dans le moteur Pointage : un jour appartenant au planning est exclu des jours attendus et des absences lorsqu'il est qualifié de jour non ouvré par le calendrier.

### 2.5 Interaction avec Dashboard

`DashboardService` lit directement les employés avec leur planning. Il retient comme attendus les employés actifs dont le planning est actif et dont les `workDays` contiennent le jour de référence, sauf jour non ouvré.

Il calcule aussi les indicateurs de travail hors planning et d'heures supplémentaires à partir des pointages persistés.

### 2.6 Interaction avec Reports

Les exports mensuels chargent le planning courant de chaque employé et les snapshots de planning présents dans les pointages. Ils produisent notamment :

- le planning affecté ;
- les jours travaillés ;
- les jours de présence planifiée ;
- le travail hors planning ;
- les heures supplémentaires planifiées et hors planning.

Si plusieurs snapshots différents existent dans le mois, le rapport produit une qualification de planning variable sur le mois.

### 2.7 Diagramme de positionnement

```text
                        +----------------------+
                        |      AuthModule      |
                        | JWT + rôle ADMIN     |
                        +----------+-----------+
                                   |
                                   v
+----------------+     +------------------------+     +----------------+
| Next.js        | --> |    SchedulesModule     | --> | Prisma Schedule|
| /schedules     |     | Controller + Service   |     +-------+--------+
+----------------+     +------------------------+             |
                                                                  relation
                              +-----------------------------------+----+
                              |                                        |
                              v                                        v
                       +-------------+                          +-------------+
                       | Employee    |                          | Attendance  |
                       | affectation |                          | consommation|
                       +------+------+                          +------+------+
                              |                                        |
                              +------------+---------------------------+
                                           |
                                +----------+----------+
                                | Calendar indirect   |
                                | Dashboard / Reports |
                                +---------------------+
```

Implémentation principale :

- `apps/backend/src/modules/auth/auth.module.ts`
- `apps/backend/src/modules/employees/employees.service.ts`
- `apps/backend/src/modules/attendance/attendance.service.ts`
- `apps/backend/src/modules/dashboard/dashboard.service.ts`
- `apps/backend/src/modules/attendance/exports/monthly-attendance-export.service.ts`

## 3. Architecture générale

### 3.1 Frontend

La route App Router `/schedules` est une page serveur dynamique. Elle :

1. vérifie l'utilisateur et son rôle ;
2. récupère le jeton de session ;
3. appelle `getSchedulesData(token)` ;
4. calcule le nombre total d'affectations ;
5. transmet les données à `AdminSchedulesManager`.

`AdminSchedulesManager` est un composant client. Il maintient la liste locale, le mode création ou modification, le formulaire, les filtres, les messages et l'état des actions de ligne.

La route possède des composants dédiés de chargement et d'erreur.

### 3.2 Backend

`SchedulesModule` déclare un contrôleur et un service. Il ne déclare aucun import et n'exporte pas son service. `PrismaModule` et `AuditLogModule` sont globaux dans l'application.

### 3.3 API

Le backend expose cinq endpoints sous `/api/v1/schedules`. Le frontend possède cinq méthodes proxy correspondantes sous `/api/schedules`.

Les Route Handlers utilisent les fonctions partagées de `lib/api-route.ts`, qui lisent le jeton de session et transmettent la requête au backend.

### 3.4 Services

`SchedulesService` contient les lectures, écritures et validations métier. Sa seule dépendance injectée est `PrismaService`.

L'audit est déclenché dans le contrôleur, après une mutation réussie.

### 3.5 Persistance

Prisma mappe `Schedule` vers PostgreSQL. Les `workDays` sont stockés dans une colonne JSON. Les employés sont reliés par `Employee.scheduleId`. Le modèle ne contient ni table de pause ni table de segment horaire.

### 3.6 Diagramme général

```text
Navigateur ADMIN
      |
      v
Next.js /schedules
      |
      +-- chargement serveur --> GET backend /schedules
      |
      +-- AdminSchedulesManager
              |
              +-- GET/POST/PATCH /api/schedules/*
                              |
                              v
                    Route Handlers Next.js
                              |
                              v
                    SchedulesController
                              |
                     +--------+---------+
                     |                  |
                     v                  v
             SchedulesService     AuditLogService
                     |
                     v
               PrismaService
                     |
                     v
               PostgreSQL
```

Implémentation principale :

- `apps/frontend/app/schedules/page.tsx`
- `apps/frontend/components/schedules/admin-schedules-manager.tsx`
- `apps/frontend/app/api/schedules/`
- `apps/backend/src/modules/schedules/`
- `apps/backend/prisma/schema.prisma`

## 4. Organisation des fichiers

### 4.1 Arborescence backend

```text
apps/backend/src/modules/schedules/
├── dto/
│   ├── create-schedule.dto.ts
│   ├── update-schedule-status.dto.ts
│   └── update-schedule.dto.ts
├── schedules.controller.ts
├── schedules.module.ts
└── schedules.service.ts
```

| Fichier | Rôle |
|---|---|
| `schedules.module.ts` | Déclare `SchedulesController` et `SchedulesService` |
| `schedules.controller.ts` | Déclare les routes, permissions et traces d'audit |
| `schedules.service.ts` | Exécute les requêtes Prisma et les règles de plage horaire |
| `dto/create-schedule.dto.ts` | Valide la création |
| `dto/update-schedule.dto.ts` | Rend facultatifs les champs de création avec `PartialType` |
| `dto/update-schedule-status.dto.ts` | Valide le booléen de statut |

### 4.2 Arborescence frontend

```text
apps/frontend/
├── app/
│   ├── api/schedules/
│   │   ├── [id]/
│   │   │   ├── status/route.ts
│   │   │   └── route.ts
│   │   └── route.ts
│   └── schedules/
│       ├── error.tsx
│       ├── loading.tsx
│       └── page.tsx
└── components/schedules/
    ├── admin-schedules-manager.tsx
    └── schedule-manager.helpers.ts
```

| Fichier | Rôle |
|---|---|
| `app/schedules/page.tsx` | Protection, chargement et composition de la page |
| `app/schedules/loading.tsx` | Squelette de chargement |
| `app/schedules/error.tsx` | Limite d'erreur et actions de nouvelle tentative |
| `admin-schedules-manager.tsx` | Catalogue, filtres, formulaire et mutations client |
| `schedule-manager.helpers.ts` | Types de formulaire, jours, tri et métadonnées visuelles |
| `app/api/schedules/route.ts` | Proxy GET collection et POST |
| `app/api/schedules/[id]/route.ts` | Proxy GET détail et PATCH |
| `app/api/schedules/[id]/status/route.ts` | Proxy PATCH statut |

### 4.3 Fichiers transverses

```text
apps/backend/
├── prisma/schema.prisma
└── src/common/
    ├── prisma/selects.ts
    └── utils/
        ├── attendance-date.util.ts
        └── attendance-schedule-snapshot.util.ts

apps/frontend/lib/
├── api-route.ts
├── api.ts
└── auth.ts
```

Implémentation principale : toutes les arborescences de cette section.

## 5. Modèle métier

### 5.1 Entité Schedule

| Champ | Type | Responsabilité |
|---|---|---|
| `id` | UUID | Identifiant technique |
| `name` | chaîne unique | Nom du planning |
| `startTime` | chaîne | Heure de début `HH:mm` |
| `endTime` | chaîne | Heure de fin `HH:mm` |
| `latenessMarginMinutes` | entier | Tolérance retranchée au calcul du retard |
| `isActive` | booléen | Rend le planning applicable ou non aux calculs |
| `workDays` | JSON | Tableau des jours UTC planifiés |
| `employees` | relation | Employés actuellement affectés |
| `createdAt` | DateTime | Date de création |
| `updatedAt` | DateTime | Date de dernière modification |

### 5.2 Jours travaillés

Les valeurs acceptées sont :

- `MONDAY` ;
- `TUESDAY` ;
- `WEDNESDAY` ;
- `THURSDAY` ;
- `FRIDAY` ;
- `SATURDAY` ;
- `SUNDAY`.

Le DTO exige au moins une valeur, interdit les doublons et rejette toute valeur extérieure à cette liste.

### 5.3 Affectation

La clé étrangère se trouve sur `Employee.scheduleId`. La relation est facultative. Un employé ne peut donc avoir qu'un seul planning courant, tandis qu'un planning peut regrouper plusieurs employés.

La règle Prisma `onDelete: SetNull` est déclarée sur la relation. Le module n'expose toutefois aucune suppression de planning.

### 5.4 Planning courant et planning historique

Le planning courant est la relation `Employee.schedule`. Le modèle `Attendance` stocke séparément un snapshot du planning au moment du pointage :

- identifiant ;
- nom ;
- heures ;
- jours ;
- marge ;
- instant de capture.

Le snapshot n'est pas une relation Prisma vers `Schedule`. Il reste donc indépendant des modifications ultérieures du planning.

### 5.5 Concepts absents

Les concepts suivants ne sont pas trouvés dans le modèle ou les DTO du module :

- pause ;
- durée de pause ;
- plusieurs créneaux dans une journée ;
- date de début ou de fin d'affectation ;
- rotation ;
- récurrence autre que les jours de semaine ;
- fuseau horaire propre au planning.

Implémentation principale :

- `apps/backend/prisma/schema.prisma`
- `apps/backend/src/modules/schedules/dto/create-schedule.dto.ts`
- `apps/backend/src/common/prisma/selects.ts`
- `apps/backend/src/common/utils/attendance-schedule-snapshot.util.ts`

## 6. Contrôleurs

### 6.1 SchedulesController

`SchedulesController` est l'unique contrôleur du module. Le préfixe global `/api/v1` s'ajoute à `@Controller('schedules')`.

| Méthode | Endpoint complet | Validation | Permission | Service |
|---|---|---|---|---|
| GET | `/api/v1/schedules` | Aucune charge utile | `ADMIN` | `findAll()` |
| GET | `/api/v1/schedules/:id` | `ParseUUIDPipe` | `ADMIN` | `findOne(id)` |
| POST | `/api/v1/schedules` | `CreateScheduleDto` | `ADMIN` | `create(dto)` |
| PATCH | `/api/v1/schedules/:id` | UUID + `UpdateScheduleDto` | `ADMIN` | `update(id, dto)` |
| PATCH | `/api/v1/schedules/:id/status` | UUID + `UpdateScheduleStatusDto` | `ADMIN` | `updateStatus(id, dto)` |

### 6.2 Dépendances

Le contrôleur injecte :

- `SchedulesService` ;
- `AuditLogService`.

Les lectures ne sont pas auditées. Les mutations appellent l'audit après le retour réussi du service.

### 6.3 Traces d'audit

| Action | Métadonnées |
|---|---|
| `schedule.create` | nom, début, fin, jours, état reçu |
| `schedule.update` | liste des propriétés reçues |
| `schedule.status.update` | nouvel état |

### 6.4 Validation globale

Le `ValidationPipe` global applique :

- liste blanche des propriétés ;
- rejet des propriétés non déclarées ;
- transformation des valeurs ;
- conversion implicite.

Implémentation principale :

- `apps/backend/src/modules/schedules/schedules.controller.ts`
- `apps/backend/src/modules/schedules/dto/`
- `apps/backend/src/main.ts`
- `apps/backend/src/common/audit/audit-log.service.ts`

## 7. Services

### 7.1 SchedulesService

`SchedulesService` est l'unique service propre au module.

| Méthode | Responsabilité |
|---|---|
| `findAll()` | Retourne tous les plannings avec leurs employés |
| `findOne(id)` | Retourne un planning ou lève une erreur 404 |
| `create(dto)` | Valide la plage, applique les valeurs par défaut et crée |
| `update(id, dto)` | Charge l'existant, résout la plage finale, valide et modifie |
| `updateStatus(id, dto)` | Vérifie l'existence et modifie `isActive` |
| `ensureScheduleExists(id)` | Charge l'identifiant et les deux heures ou lève une 404 |
| `assertValidScheduleWindow(start, end)` | Exige une fin strictement postérieure |
| `toMinutes(time)` | Convertit `HH:mm` en minutes depuis minuit |
| `handlePersistenceError(error)` | Traduit `P2002` en conflit de nom |

### 7.2 Lecture

`findAll` trie :

1. par `createdAt` décroissant ;
2. par `name` croissant.

La projection `scheduleWithEmployeesSelect` inclut tous les champs du planning et les champs publics de chaque employé.

### 7.3 Création

Le service :

1. contrôle la fenêtre horaire ;
2. affecte une marge de zéro si elle est absente ;
3. affecte `isActive=true` si absent ;
4. écrit le tableau `workDays` ;
5. retourne le planning avec `employees`.

### 7.4 Modification

`UpdateScheduleDto` est partiel. Le service récupère les heures existantes et combine chaque heure reçue avec sa valeur actuelle avant de valider la plage finale. Les autres propriétés sont transmises à Prisma.

### 7.5 Erreurs de persistance

Une erreur Prisma `P2002` est traduite en HTTP 409 avec le message indiquant qu'un planning du même nom existe. Les autres erreurs sont propagées.

### 7.6 Diagramme du service

```text
SchedulesController
        |
        v
SchedulesService
   |
   +-- findAll/findOne ------> scheduleWithEmployeesSelect
   |
   +-- create/update
   |      |
   |      +-- assertValidScheduleWindow
   |      +-- Prisma Schedule
   |      +-- traduction P2002
   |
   +-- updateStatus
          |
          +-- ensureScheduleExists
          +-- Prisma Schedule

SchedulesController
        |
        +--------------------> AuditLogService
```

Implémentation principale :

- `apps/backend/src/modules/schedules/schedules.service.ts`
- `apps/backend/src/common/prisma/selects.ts`
- `apps/backend/src/modules/schedules/schedules.controller.ts`

## 8. Gestion des plannings

### 8.1 Création

L'écran initialise un nouveau planning avec :

- nom vide ;
- début `08:00` ;
- fin `17:00` ;
- marge de zéro ;
- état actif ;
- lundi à vendredi.

Ces valeurs sont des valeurs initiales du frontend. Le backend ne fournit pas les heures ou les jours par défaut : ils restent obligatoires dans `CreateScheduleDto`.

Après succès, le nouveau planning est ajouté en tête de l'état local.

### 8.2 Modification

Le bouton Modifier appelle d'abord `GET /api/schedules/:id`, puis remplit le formulaire. L'envoi appelle `PATCH /api/schedules/:id`. Le composant remplace ensuite l'objet correspondant dans son état.

Le formulaire de modification envoie actuellement l'ensemble des champs du formulaire, même si le DTO backend autorise une modification partielle.

### 8.3 Suppression

Aucun endpoint `DELETE`, aucune méthode `delete/remove`, aucun bouton de suppression et aucun Route Handler de suppression ne sont présents. La suppression n'est pas implémentée dans le module.

### 8.4 Consultation

L'écran présente :

- total des plannings ;
- actifs et inactifs ;
- utilisés et non utilisés ;
- nombre total d'affectations ;
- moyenne arrondie d'affectations par planning ;
- plage horaire ;
- marge de retard ;
- jours ;
- nombre et aperçu des employés.

La recherche locale porte sur le nom, les heures, la marge, les employés et les libellés de jours. Les filtres locaux portent sur le statut, l'utilisation et un jour.

### 8.5 Affectation

L'écran Planning affiche les affectations mais ne les modifie pas. L'écran Employés charge les plannings et envoie `scheduleId` lors de la création ou modification d'un employé.

Le backend Employés dispose aussi de `PATCH /api/v1/employees/:id/schedule`. Une valeur UUID connecte le planning ; `null` déconnecte la relation. L'existence est vérifiée avant connexion.

### 8.6 Activation et désactivation

Le bouton de statut appelle le proxy `/api/schedules/:id/status`. Après succès, l'objet local est remplacé. Si le planning est en cours d'édition, le formulaire est remappé depuis la réponse.

La désactivation ne déconnecte pas les employés : la relation reste présente et la réponse continue d'inclure les employés.

### 8.7 Contrôles client et serveur

Le frontend contrôle :

- nom non vide ;
- marge entière entre 0 et 180 ;
- au moins un jour ;
- fin strictement postérieure au début.

Le backend contrôle les mêmes contraintes structurelles par DTO et répète la règle de plage dans le service.

Implémentation principale :

- `apps/frontend/components/schedules/admin-schedules-manager.tsx`
- `apps/frontend/components/schedules/schedule-manager.helpers.ts`
- `apps/backend/src/modules/schedules/schedules.service.ts`
- `apps/backend/src/modules/employees/employees.service.ts`

## 9. Règles métier

### 9.1 Format horaire

`startTime` et `endTime` doivent correspondre à `HH:mm` sur 24 heures :

```text
00:00 à 23:59
```

Le format est validé par expression régulière.

### 9.2 Fenêtre sur une journée

Les deux heures sont converties en minutes depuis minuit. La règle est :

```text
endTime > startTime
```

L'égalité et une fin antérieure sont refusées. Un planning traversant minuit n'est donc pas accepté.

### 9.3 Marge de retard

La marge doit être un entier compris entre 0 et 180 minutes incluses. Sa valeur par défaut backend est zéro.

Le moteur Pointage calcule :

```text
instant réel - début planifié - marge
```

Le résultat négatif devient zéro.

### 9.4 Jours travaillés

Au moins un jour est obligatoire. Les doublons sont interdits. Les jours sont interprétés avec `Date.getUTCDay()`.

Le frontend trie les jours du lundi au dimanche avant l'envoi et lors du remplissage du formulaire. Le backend ne retrie pas le tableau reçu.

### 9.5 Nom

Le nom est une chaîne de 80 caractères maximum. Le modèle Prisma impose son unicité. Le DTO n'applique pas de transformation de suppression des espaces ; le frontend envoie `name.trim()`.

### 9.6 État actif

Un planning actif participe aux calculs de présence. Un planning inactif est traité comme non applicable par :

- l'état de pointage du jour ;
- le calcul du retard ;
- le calcul des absences ;
- les employés attendus du dashboard ;
- la création d'absences mensuelles.

### 9.7 Pauses

Aucune propriété de pause, aucune règle de durée de pause et aucun calcul correspondant ne sont trouvés.

### 9.8 Dates non ouvrées

Les jours du planning ne suffisent pas à rendre une date attendue. Le calendrier peut qualifier la date de non ouvrée. Cette exclusion est appliquée dans les services Pointage, métriques mensuelles et Dashboard.

Implémentation principale :

- `apps/backend/src/modules/schedules/dto/create-schedule.dto.ts`
- `apps/backend/src/modules/schedules/schedules.service.ts`
- `apps/backend/src/common/utils/attendance-date.util.ts`
- `apps/backend/src/modules/attendance/attendance.service.ts`

## 10. Interactions avec le module Pointage

### 10.1 Chargement

À l'entrée, `AttendanceService.getActiveEmployeeWithSchedule` charge l'employé et son planning avec `scheduleSelect`.

L'absence de planning ne bloque pas l'entrée. Elle produit un statut initial `INCOMPLETE`, zéro minute de retard, aucune heure de sortie planifiée et aucun snapshot renseigné.

### 10.2 Détermination du jour attendu

Un employé est attendu si :

- son planning existe ;
- le planning est actif ;
- la date n'est pas non ouvrée ;
- le jour UTC appartient à `workDays`.

### 10.3 Calcul d'entrée

Pour une date planifiée, `startTime` et `latenessMarginMinutes` déterminent `minutesLate`. Pour une date hors planning, le retard vaut zéro.

### 10.4 Calcul de sortie

`endTime` détermine `scheduledExitTime`. Une sortie antérieure calcule `earlyExitMinutes`. Une sortie postérieure calcule `overtimeMinutes` et `overtimeHours`.

Pour un jour hors planning ou non ouvré, la durée complète entre entrée et sortie est traitée comme heures supplémentaires hors planning.

### 10.5 Snapshot

À l'entrée, un planning actif est copié dans les champs snapshot d'`Attendance`. À la sortie, le snapshot est prioritaire sur le planning courant. Une modification du planning après l'entrée n'altère donc pas la base de calcul de ce pointage.

### 10.6 Absences

Le service parcourt les dates planifiées du mois jusqu'au jour de référence. Chaque date sans entrée et non exclue par Calendar augmente le compteur d'absences.

`AttendanceMonthlyMetricsService` crée également les lignes `ABSENT` manquantes pour les jours planifiés et non ouvrés exclus.

### 10.7 Diagramme de séquence

```text
Employé        AttendanceController    AttendanceService     Calendar      Prisma
   |                    |                      |                  |             |
   | POST check-in      |                      |                  |             |
   |------------------->|                      |                  |             |
   |                    | recordCheckIn        |                  |             |
   |                    |--------------------->| charge Employee+Schedule       |
   |                    |                      |------------------------------->|
   |                    |                      |<-------------------------------|
   |                    |                      | jour non ouvré?  |             |
   |                    |                      |----------------->|             |
   |                    |                      |<-----------------|             |
   |                    |                      | workDays/start/marge            |
   |                    |                      | calcule retard/statut            |
   |                    |                      | construit snapshot               |
   |                    |                      | create/update Attendance         |
   |                    |                      |------------------------------->|
   |                    |<---------------------| objet pointage                  |
   |<-------------------|                      |                  |             |
   |                    |                      |                  |             |
   | POST check-out     |                      |                  |             |
   |------------------->|--------------------->| charge snapshot + planning      |
   |                    |                      | résout snapshot prioritaire      |
   |                    |                      | endTime / workDays               |
   |                    |                      | calcule sortie/heures supp.       |
   |                    |                      | update Attendance                |
   |                    |                      |------------------------------->|
   |<-------------------|<---------------------|                  |             |
```

Implémentation principale :

- `apps/backend/src/modules/attendance/attendance.service.ts`
- `apps/backend/src/modules/attendance/attendance-monthly-metrics.service.ts`
- `apps/backend/src/common/utils/attendance-schedule-snapshot.util.ts`
- `apps/backend/src/common/utils/attendance-checkout.util.ts`
- `apps/backend/src/common/utils/attendance-date.util.ts`

## 11. Sécurité

### 11.1 Guards

`JwtAuthGuard` et `RolesGuard` sont enregistrés comme guards globaux dans `AuthModule`. Aucun endpoint Planning n'est public.

### 11.2 Permissions

Tous les endpoints exigent `AccessRole.ADMIN`. Le test end-to-end vérifie qu'un compte `EMPLOYEE` reçoit HTTP 403 sur `GET /api/v1/schedules`.

### 11.3 Contrôle frontend

Le middleware protège `/schedules` par présence du cookie de session. La page effectue ensuite un contrôle serveur du rôle et du jeton.

Ces contrôles d'interface s'ajoutent à l'autorisation backend.

### 11.4 Validation

Les corps sont contrôlés par les DTO et le `ValidationPipe` global. Les UUID de route sont contrôlés par `ParseUUIDPipe`.

Le service effectue les validations dépendant de l'état :

- existence du planning ;
- plage finale après combinaison de valeurs existantes et reçues ;
- collision unique du nom.

### 11.5 Audit

Chaque création, modification générale et modification de statut réussie est journalisée avec l'acteur authentifié. `AuditLogService` utilise le logger NestJS ; il ne persiste pas une table d'audit.

Implémentation principale :

- `apps/backend/src/modules/schedules/schedules.controller.ts`
- `apps/backend/src/modules/auth/auth.module.ts`
- `apps/backend/src/modules/auth/guards/jwt-auth.guard.ts`
- `apps/backend/src/modules/auth/guards/roles.guard.ts`
- `apps/frontend/middleware.ts`
- `apps/frontend/app/schedules/page.tsx`
- `apps/backend/test/app.e2e-spec.ts`

## 12. Dépendances internes

### 12.1 Dépendances directes du module

| Dépendance | Usage |
|---|---|
| `PrismaService` | Lecture et écriture des plannings |
| `scheduleWithEmployeesSelect` | Projection des plannings et affectations |
| `AuditLogService` | Journalisation des mutations |
| Auth global | JWT, rôle et utilisateur courant |
| DTO NestJS | Validation des commandes |

### 12.2 Consommateurs internes

| Consommateur | Données consommées |
|---|---|
| `EmployeesService` | existence du planning et relation |
| `AttendanceService` | heures, marge, jours, statut |
| `AttendanceMonthlyMetricsService` | jours, sortie, statut et snapshot |
| `DashboardService` | jours et statut actif |
| `MonthlyAttendanceExportService` | planning courant et snapshots |
| Frontend Employés | liste des options d'affectation |
| Frontend Planning | catalogue et employés inclus |

### 12.3 Diagramme

```text
                    SchedulesModule
                    /      |      \
                   /       |       \
              Auth       Prisma     Audit
                           |
                        Schedule
                           |
                 +---------+----------+
                 |                    |
              Employee            Attendance
                 |                    |
         EmployeesService    +--------+---------+
                             |        |         |
                         Pointage  Dashboard  Reports
                             |
                          Calendar
                         (exclusion)
```

Implémentation principale :

- `apps/backend/src/modules/schedules/schedules.module.ts`
- `apps/backend/src/modules/employees/employees.service.ts`
- `apps/backend/src/modules/attendance/`
- `apps/backend/src/modules/dashboard/dashboard.service.ts`
- `apps/frontend/lib/api.ts`

## 13. Observations techniques

Cette section contient uniquement des constats issus du dépôt.

### 13.1 Absence de suppression

Le modèle Prisma déclare `onDelete: SetNull`, mais le contrôleur, le service et le frontend ne contiennent aucune opération de suppression.

### 13.2 Affectation située dans EmployeesService

`SchedulesService` ne modifie pas la relation aux employés. Il renvoie les employés affectés. La connexion et la déconnexion sont implémentées directement dans `EmployeesService`, sans injection de `SchedulesService`.

### 13.3 Module sans exports

`SchedulesModule` ne déclare pas `exports: [SchedulesService]`. Les autres modules n'utilisent pas ce service ; ils lisent directement Prisma.

### 13.4 Jours stockés en JSON

`workDays` est une colonne Prisma `Json`. Le DTO impose les valeurs autorisées lors des appels du contrôleur Planning. Les consommateurs partagés vérifient à l'exécution que la valeur est un tableau avant de rechercher le jour.

### 13.5 Règle horaire dupliquée

La conversion `HH:mm` vers les minutes et le contrôle `end > start` existent dans :

- `SchedulesService` côté backend ;
- `schedule-manager.helpers.ts` et `AdminSchedulesManager` côté frontend.

### 13.6 Valeurs initiales uniquement frontend

Le lundi-vendredi et les heures `08:00–17:00` sont les valeurs initiales du formulaire. Le backend exige explicitement `startTime`, `endTime` et `workDays`; il ne leur affecte pas ces valeurs.

### 13.7 Désactivation avec affectations conservées

La désactivation modifie uniquement `isActive`. Elle ne retire aucun `scheduleId` des employés. L'interface continue de compter ces employés comme affectés et le planning reste qualifié d'utilisé.

### 13.8 Snapshot indépendant

Les snapshots des pointages ne possèdent pas de clé étrangère vers `Schedule`. Le champ `scheduleIdSnapshot` est une chaîne. Les mutations du planning n'actualisent pas les snapshots existants.

### 13.9 Absence de page de détail

Le frontend ne contient pas `app/schedules/[id]/page.tsx`. Le détail est récupéré par le composant client et injecté dans le formulaire de la page unique.

### 13.10 Pas de pagination

`findAll` ne comporte ni `skip`, ni `take`, ni curseur. L'interface charge tous les plannings et filtre localement.

### 13.11 Contrats frontend séparés

Les types `Schedule`, `ScheduleRecord`, `CreateSchedulePayload` et `UpdateSchedulePayload` sont déclarés dans `apps/frontend/lib/api.ts`. Ils ne sont pas importés des DTO backend.

### 13.12 Réponses avec employés complets publics

La projection de liste et de détail inclut `publicEmployeeSelect` pour chaque affectation. Le frontend utilise principalement le nom et le nombre d'employés pour la vue Planning.

### 13.13 Nommage du module

Le vocabulaire utilisateur et documentaire est « Planning/Plannings ». Les identifiants de code, le modèle Prisma et les routes utilisent « Schedule/Schedules ».

### 13.14 Messages multilingues

Les messages d'exception du service sont en anglais. Les messages et libellés de l'interface sont en français.

### 13.15 Documentation locale

Aucun README ni fichier Markdown n'est présent dans `apps/backend/src/modules/schedules/` ou `apps/frontend/components/schedules/`.

### 13.16 Tests constatés

`apps/backend/test/app.e2e-spec.ts` couvre :

- refus de la liste pour le rôle employé ;
- liste pour le rôle administrateur ;
- validation d'une fenêtre invalide ;
- création ;
- détail ;
- modification ;
- activation et désactivation ;
- affectation et retrait via le module Employés ;
- conservation et utilisation des snapshots après modification du planning.

Les fichiers propres à `apps/backend/src/modules/schedules/` ne contiennent pas de fichier `*.spec.ts`.

Implémentation principale :

- `apps/backend/src/modules/schedules/`
- `apps/frontend/components/schedules/`
- `apps/backend/src/modules/employees/employees.service.ts`
- `apps/backend/test/app.e2e-spec.ts`

