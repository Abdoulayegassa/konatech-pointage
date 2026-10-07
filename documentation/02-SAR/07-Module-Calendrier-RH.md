# Module Calendrier RH

| Métadonnée | Valeur |
|---|---|
| Document ID | SAR-CAL-001 |
| Titre | Module Calendrier RH |
| Version | 1.0 |
| Statut | Validé |
| Classification | Interne |
| Référence SAPDD | Module Calendrier RH |
| Date de génération | 29 juillet 2026 |

## 1. Présentation du module

### 1.1 Objectif

Le module Calendrier RH centralise la classification des journées civiles utilisée par Konatech Pointage. Il construit une vue mensuelle, distingue jours travaillés, week-ends et jours fériés, et fournit au moteur de pointage la liste des dates non ouvrées à exclure des absences et des effectifs attendus.

L'interface d'administration permet actuellement de gérer deux types d'événements globaux :

- jour férié public ;
- jour férié d'entreprise.

### 1.2 Responsabilités

Les responsabilités constatées sont :

- génération de toutes les journées d'un mois UTC ;
- classification des jours ouvrés et week-ends ;
- lecture des événements calendaires du mois ;
- création, modification et suppression des jours fériés ;
- calcul d'une synthèse mensuelle ;
- calcul de l'ensemble des dates non ouvrées ;
- détermination unitaire d'un jour non ouvré ;
- exposition des événements et des informations d'employé associées ;
- exclusion des jours non ouvrés dans les calculs de présence et d'absence ;
- journalisation des mutations administratives.

### 1.3 Périmètre fonctionnel réel

| Fonctionnalité | État constaté |
|---|---|
| Vue mensuelle | Implémentée |
| Vue hebdomadaire du mois sélectionné | Implémentée |
| Navigation mensuelle | Implémentée |
| Week-ends automatiques | Implémentée |
| Jours fériés publics | CRUD implémenté |
| Jours fériés entreprise | CRUD implémenté |
| Suppression d'un événement | Implémentée |
| Activation/désactivation | Non exposée par l'API ou l'interface |
| Congés employés | Types de données et lecture présents ; création/gestion non exposée |
| Missions externes | Types de données et lecture présents ; création/gestion non exposée |
| Workflow d'approbation | Non trouvé dans le code du module |
| Périodes multi-jours | Non trouvées ; chaque entrée porte une seule date |
| Vue annuelle unique | Non trouvée ; navigation par mois uniquement |

Le frontend affiche explicitement les congés, missions, validation RH, approbation et historique des événements dans une zone « Fonctionnalités à venir ». Aucun formulaire ni endpoint actuel ne met en œuvre ces workflows.

Implémentation principale :

- `apps/backend/src/modules/calendar/calendar.service.ts`
- `apps/backend/src/modules/calendar/calendar.controller.ts`
- `apps/frontend/app/calendar/page.tsx`
- `apps/frontend/components/calendar/calendar-workspace.tsx`
- `apps/backend/prisma/schema.prisma`

## 2. Position dans l'architecture

### 2.1 Interaction avec Auth

`CalendarController` porte `@Roles(AccessRole.ADMIN)` au niveau de la classe. Les guards globaux JWT et rôles protègent donc les cinq endpoints.

La page `/calendar` appelle `requireCurrentUser()`, redirige les utilisateurs non administrateurs vers `/my-attendance` et exige un jeton de session.

Les mutations reçoivent l'administrateur via `@CurrentUser()` et transmettent cet acteur à `AuditLogService`.

### 2.2 Interaction avec Employee

Le modèle `CalendarEntry` possède une relation facultative vers `Employee`. La projection du service inclut :

- identifiant employé ;
- identifiant métier ;
- prénom et nom assemblés ;
- département.

Les DTO actuels ne déclarent pas `employeeId`. Les créations réalisées par l'API Calendrier sont donc globales et stockent une relation nulle. Les types `LEAVE` et `EXTERNAL_MISSION`, susceptibles d'utiliser la relation, ne sont pas acceptés par les DTO de création ou modification.

### 2.3 Interaction avec Planning

`CalendarModule` n'importe pas `SchedulesModule` et ne lit pas les plannings.

L'interaction se produit chez les consommateurs : une date compte comme absence ou journée attendue seulement si elle appartient aux jours du planning et n'appartient pas aux dates non ouvrées du calendrier.

### 2.4 Interaction avec Attendance

`AttendanceModule` importe `CalendarModule`. `AttendanceService` utilise :

- `isNonWorkingDay(date)` pendant l'entrée, la sortie, l'état du jour et la synthèse ;
- `getNonWorkingDateKeys(start, end)` pour les absences mensuelles.

`AttendanceMonthlyMetricsService` utilise le même ensemble pour ne pas créer de ligne d'absence pendant les dates non ouvrées.

### 2.5 Interaction avec Dashboard

`DashboardModule` importe `CalendarModule`. Le dashboard exclut les dates non ouvrées :

- des employés attendus aujourd'hui ;
- du calcul agrégé des absences.

`DashboardService` ne redéfinit pas la règle de classification ; il appelle `CalendarService`.

### 2.6 Interaction avec Reports

`MonthlyAttendanceExportService` appelle `getNonWorkingDateKeys` pour calculer la couverture du planning, les jours travaillés et les absences. Les week-ends et jours fériés actifs sont donc exclus des jours ouvrés du rapport.

Le travail réellement enregistré pendant une date non ouvrée reste présent dans les rapports et est qualifié de travail jour non ouvré.

### 2.7 Diagramme de positionnement

```text
                         +------------------+
                         |    AuthModule    |
                         | JWT + rôle ADMIN |
                         +---------+--------+
                                   |
                                   v
+----------------+     +--------------------------+     +------------------+
| Next.js        | --> |      CalendarModule      | --> | CalendarEntry    |
| /calendar      |     | Controller + Service     |     | Prisma/PostgreSQL|
+----------------+     +------------+-------------+     +--------+---------+
                                  |                            |
                                  | export CalendarService     | relation
                                  v                            v
                 +----------------+----------------+       Employee
                 |                |                |
                 v                v                v
           Attendance        Dashboard         Reports
                 \                |                /
                  \               |               /
                   +--------------+--------------+
                                  |
                              Planning
                    (croisement jours planifiés /
                         dates non ouvrées)
```

Implémentation principale :

- `apps/backend/src/modules/calendar/calendar.module.ts`
- `apps/backend/src/modules/attendance/attendance.module.ts`
- `apps/backend/src/modules/dashboard/dashboard.module.ts`
- `apps/backend/src/modules/attendance/exports/monthly-attendance-export.service.ts`
- `apps/backend/prisma/schema.prisma`

## 3. Architecture générale

### 3.1 Frontend

La route `/calendar` est une page serveur dynamique. Elle lit le paramètre `month`, le normalise au format `YYYY-MM` ou utilise le mois UTC courant, puis appelle `getCalendarMonthData`.

Le composant client `CalendarWorkspace` gère :

- les événements du mois dans un état local ;
- les modes mensuel et hebdomadaire ;
- le tiroir de création ou modification ;
- le détail d'une journée ;
- la suppression avec confirmation ;
- la synthèse recalculée côté client ;
- les cinq prochains jours fériés du mois qui ne sont pas antérieurs au jour courant.

### 3.2 Backend

`CalendarModule` déclare :

- `CalendarController` ;
- `CalendarService`.

Il importe `AuditLogModule` et exporte `CalendarService` pour Attendance et Dashboard.

### 3.3 API

Le backend expose cinq endpoints sous `/api/v1/calendar`. Le frontend possède les Route Handlers correspondants sous `/api/calendar`.

Le chargement initial de la page serveur appelle directement le backend avec le token. Les mutations client passent par les Route Handlers.

### 3.4 Services

`CalendarService` est l'unique service propre au module. Il construit la vue mensuelle, gère les entrées et fournit les dates non ouvrées aux autres modules.

Sa seule dépendance injectée est `PrismaService`.

### 3.5 Persistance

Le modèle `CalendarEntry` stocke une entrée par date. Il n'existe pas de contrainte unique Prisma sur `(date, type)` ; le service applique cette unicité avant création ou modification.

Le modèle porte un booléen `isActive`, mais les DTO actuels ne permettent pas de le changer.

### 3.6 Diagramme général

```text
Navigateur ADMIN
       |
       v
Next.js /calendar?month=YYYY-MM
       |
       +-- page serveur --> getCalendarMonthData
       |
       +-- CalendarWorkspace
              |
              +-- affichage mois/semaine
              +-- formulaire férié
              +-- détail journée
              +-- mutations /api/calendar/*
                              |
                              v
                    Route Handlers Next.js
                              |
                              v
                    CalendarController
                       |             |
                       v             v
                CalendarService  AuditLogService
                       |
                       v
                 PrismaService
                       |
                       v
              CalendarEntry/PostgreSQL
```

Implémentation principale :

- `apps/frontend/app/calendar/page.tsx`
- `apps/frontend/components/calendar/`
- `apps/frontend/app/api/calendar/`
- `apps/backend/src/modules/calendar/`

## 4. Organisation des fichiers

### 4.1 Backend

```text
apps/backend/src/modules/calendar/
├── dto/
│   ├── calendar-month-query.dto.ts
│   ├── create-calendar-entry.dto.ts
│   └── update-calendar-entry.dto.ts
├── calendar.controller.ts
├── calendar.module.ts
├── calendar.service.ts
└── calendar.types.ts
```

| Fichier | Rôle |
|---|---|
| `calendar.module.ts` | Assemblage et export du service |
| `calendar.controller.ts` | API, permissions et audit |
| `calendar.service.ts` | Moteur du calendrier RH |
| `calendar.types.ts` | Contrats de vue mensuelle et classifications |
| `calendar-month-query.dto.ts` | Validation du mois |
| `create-calendar-entry.dto.ts` | Création d'un jour férié |
| `update-calendar-entry.dto.ts` | Modification partielle d'un jour férié |

### 4.2 Frontend

```text
apps/frontend/
├── app/
│   ├── api/calendar/
│   │   ├── holidays/
│   │   │   ├── [id]/route.ts
│   │   │   └── route.ts
│   │   └── month/route.ts
│   └── calendar/
│       ├── error.tsx
│       ├── loading.tsx
│       └── page.tsx
└── components/calendar/
    ├── calendar-day-badge.tsx
    ├── calendar-day-cell.tsx
    ├── calendar-day-drawer.tsx
    ├── calendar-legend.tsx
    ├── calendar-month-selector.tsx
    └── calendar-workspace.tsx
```

| Fichier | Rôle |
|---|---|
| `page.tsx` | Protection, sélection du mois et chargement |
| `loading.tsx` | État de chargement |
| `error.tsx` | Limite d'erreur |
| `calendar-workspace.tsx` | Vue, synthèse et CRUD client |
| `calendar-day-cell.tsx` | Représentation mensuelle/hebdomadaire |
| `calendar-day-badge.tsx` | Métadonnées et badges des six classifications |
| `calendar-day-drawer.tsx` | Détail d'une journée |
| `calendar-legend.tsx` | Légende des quatre classifications actives |
| `calendar-month-selector.tsx` | Navigation avec champ de mois |
| `app/api/calendar/*` | Proxy des cinq opérations backend |

### 4.3 Fichiers transverses

```text
apps/backend/
├── prisma/schema.prisma
└── src/
    ├── common/utils/attendance-date.util.ts
    ├── modules/attendance/
    └── modules/dashboard/

apps/frontend/lib/
├── api-route.ts
├── api.ts
└── auth.ts
```

Implémentation principale : toutes les arborescences de cette section.

## 5. Modèle métier

### 5.1 CalendarEntry

| Champ | Type | Responsabilité |
|---|---|---|
| `id` | UUID | Identifiant technique |
| `name` | chaîne | Libellé de l'événement |
| `description` | chaîne facultative | Description RH |
| `date` | DateTime | Journée normalisée en UTC |
| `type` | enum | Nature de l'événement |
| `employeeId` | UUID facultatif | Relation éventuelle à un employé |
| `employee` | relation facultative | Employé concerné |
| `isActive` | booléen | Inclusion dans la vue active et les exclusions |
| `createdAt` | DateTime | Création |
| `updatedAt` | DateTime | Dernière modification |

Des index existent sur `date`, `type` et `employeeId`.

### 5.2 Types persistants

L'enum Prisma contient :

- `PUBLIC_HOLIDAY` ;
- `COMPANY_HOLIDAY` ;
- `LEAVE` ;
- `EXTERNAL_MISSION`.

Les DTO et le formulaire n'acceptent que les deux premiers.

### 5.3 Types de journée calculés

Le service ajoute deux classifications non persistées :

- `WORKING_DAY` ;
- `WEEKEND`.

Chaque journée de la réponse contient :

- date ;
- libellé du jour ;
- clé du lundi de la semaine ;
- type résolu ;
- libellé ;
- description ;
- indicateur `isNonWorkingDay` ;
- événements associés.

### 5.4 Relation Employee

La suppression d'un employé positionne `employeeId` à `null` par `onDelete: SetNull`. La suppression d'une entrée calendrier ne modifie pas l'employé.

La projection calcule `employeeName` depuis prénom et nom, et expose l'identifiant métier et le département.

### 5.5 Résumé mensuel

Le résumé contient quatre compteurs :

- jours travaillés ;
- week-ends ;
- jours fériés publics ;
- jours fériés entreprise.

Les jours classés Congé ou Mission externe n'ont pas de compteur dédié dans `CalendarSummary`.

Implémentation principale :

- `apps/backend/prisma/schema.prisma`
- `apps/backend/src/modules/calendar/calendar.types.ts`
- `apps/backend/src/modules/calendar/calendar.service.ts`
- `apps/frontend/lib/api.ts`

## 6. Contrôleurs

### 6.1 CalendarController

| Méthode | Endpoint complet | Validation | Permission | Service |
|---|---|---|---|---|
| GET | `/api/v1/calendar/month` | `CalendarMonthQueryDto` | `ADMIN` | `getMonthOverview` |
| GET | `/api/v1/calendar/holidays` | `CalendarMonthQueryDto` | `ADMIN` | `findMonthEntries` |
| POST | `/api/v1/calendar/holidays` | `CreateCalendarEntryDto` | `ADMIN` | `create` |
| PATCH | `/api/v1/calendar/holidays/:id` | UUID + `UpdateCalendarEntryDto` | `ADMIN` | `update` |
| DELETE | `/api/v1/calendar/holidays/:id` | UUID | `ADMIN` | `remove` |

### 6.2 DTO

| DTO | Contraintes |
|---|---|
| `CalendarMonthQueryDto` | mois facultatif, chaîne `YYYY-MM` |
| `CreateCalendarEntryDto` | nom chaîne ≤ 120, date ISO, description ≤ 500, type public/entreprise |
| `UpdateCalendarEntryDto` | mêmes champs rendus facultatifs |

Ni `employeeId` ni `isActive` ne sont déclarés dans les DTO.

### 6.3 Permissions

Le rôle `ADMIN` est défini au niveau de la classe et couvre toutes les méthodes. Aucun endpoint du contrôleur n'est public ou accessible à `EMPLOYEE`.

### 6.4 Dépendances

Le contrôleur injecte :

- `CalendarService` ;
- `AuditLogService`.

Les méthodes de lecture n'appellent pas l'audit.

### 6.5 Audit

| Action | Métadonnées |
|---|---|
| `calendar.entry.create` | nom, date, type |
| `calendar.entry.update` | noms des champs reçus |
| `calendar.entry.delete` | nom et type supprimés |

Implémentation principale :

- `apps/backend/src/modules/calendar/calendar.controller.ts`
- `apps/backend/src/modules/calendar/dto/`
- `apps/backend/src/main.ts`

## 7. Services

### 7.1 CalendarService

| Méthode | Responsabilité |
|---|---|
| `getMonthOverview` | Construit la réponse complète du mois |
| `findMonthEntries` | Retourne toutes les entrées persistées du mois |
| `getNonWorkingDateKeys` | Produit un ensemble de timestamps non ouvrés |
| `isNonWorkingDay` | Vérifie une journée unique |
| `create` | Normalise, contrôle le doublon et crée |
| `update` | Combine état existant et charge utile, puis modifie |
| `remove` | Vérifie puis supprime physiquement |
| `resolveDayType` | Applique la priorité des classifications |
| `resolveMonthWindow` | Valide et calcule les bornes du mois |
| `ensureNoDuplicateEntry` | Interdit un même couple date/type |

### 7.2 Construction mensuelle

Le service :

1. résout les bornes UTC du mois ;
2. charge les entrées, triées par date puis création ;
3. retire les entrées inactives de la vue d'ensemble ;
4. normalise les entrées ;
5. les groupe par date ;
6. parcourt chaque jour civil du mois ;
7. résout le type, le libellé et la description ;
8. incrémente la synthèse ;
9. retourne les jours et entrées actifs.

### 7.3 Dates non ouvrées

`getNonWorkingDateKeys` ne charge que les entrées actives de type :

- `PUBLIC_HOLIDAY` ;
- `COMPANY_HOLIDAY`.

Il parcourt ensuite chaque date de la plage et ajoute :

- chaque samedi ;
- chaque dimanche ;
- chaque jour férié public ;
- chaque jour férié entreprise.

Le résultat est un `Set<number>` contenant les timestamps UTC de minuit.

### 7.4 CRUD

La création force `isActive=true`, supprime les espaces autour du nom et transforme une description vide en `null`.

La modification conserve les champs absents, normalise les champs reçus et vérifie le couple final date/type.

La suppression appelle `prisma.calendarEntry.delete`; il s'agit d'une suppression physique.

### 7.5 Diagramme du service

```text
CalendarController
        |
        v
CalendarService
   |
   +-- getMonthOverview
   |      +-- resolveMonthWindow
   |      +-- Prisma.CalendarEntry
   |      +-- mapEntry / resolveDayType / summary
   |
   +-- getNonWorkingDateKeys
   |      +-- événements actifs public/entreprise
   |      +-- calcul samedi/dimanche
   |
   +-- create/update/remove
          +-- parseCalendarDate
          +-- ensureNoDuplicateEntry
          +-- Prisma create/update/delete

Consommateurs exportés :
AttendanceService / AttendanceMonthlyMetricsService /
DashboardService / MonthlyAttendanceExportService
```

Implémentation principale :

- `apps/backend/src/modules/calendar/calendar.service.ts`
- `apps/backend/src/modules/calendar/calendar.types.ts`
- `apps/backend/src/modules/calendar/calendar.module.ts`

## 8. Gestion du calendrier RH

### 8.1 Jours fériés publics

Un administrateur peut créer, modifier et supprimer une date `PUBLIC_HOLIDAY`. Elle est affichée en rouge, comptée dans `publicHolidays` et exclue des jours ouvrés.

### 8.2 Jours fériés entreprise

Le même workflow existe pour `COMPANY_HOLIDAY`. La classification visuelle est bleue et le compteur utilisé est `companyHolidays`.

### 8.3 Week-ends

Les samedis et dimanches sont générés automatiquement. Aucun enregistrement Prisma n'est nécessaire. Ils sont affichés et exclus des calculs de présence.

### 8.4 Jours travaillés

Une date sans événement prioritaire qui n'est ni samedi ni dimanche est classée `WORKING_DAY`. Le calendrier ne croise pas cette classification d'affichage avec un planning individuel.

### 8.5 Congés et missions

Le service sait lire et classer `LEAVE` et `EXTERNAL_MISSION`. Les composants possèdent des badges correspondants. Cependant :

- le formulaire ne propose pas ces types ;
- les DTO les refusent ;
- aucun `employeeId` n'est accepté ;
- la légende principale ne les inclut pas ;
- la page les présente comme workflows réservés à une étape ultérieure.

Ils ne constituent donc pas une fonctionnalité de gestion exposée.

### 8.6 Exceptions et événements

Chaque `CalendarEntry` correspond à une seule date et un seul type. Plusieurs types peuvent coexister à la même date. Un second événement du même type à la même date est interdit par le service.

### 8.7 Vues

La vue mensuelle groupe les jours par semaine et affiche sept colonnes. La vue hebdomadaire affiche les mêmes jours du mois sous forme de groupes de semaines. Elle ne charge pas une plage distincte.

### 8.8 Activation/désactivation

`isActive` existe en base et la vue d'ensemble filtre les valeurs inactives. Aucun endpoint, DTO, contrôle d'interface ou méthode de service dédié ne permet de modifier ce champ.

### 8.9 Prochains événements

Le frontend prend les jours fériés public/entreprise du mois chargé, les trie, filtre ceux qui ne sont pas antérieurs à la date UTC courante et affiche les cinq premiers.

Implémentation principale :

- `apps/frontend/components/calendar/calendar-workspace.tsx`
- `apps/frontend/components/calendar/calendar-day-badge.tsx`
- `apps/frontend/components/calendar/calendar-day-cell.tsx`
- `apps/backend/src/modules/calendar/calendar.service.ts`

## 9. Règles métier

### 9.1 Fenêtre mensuelle

Le mois suit `YYYY-MM`. Sans valeur, le mois UTC courant est utilisé. La plage commence au premier jour inclus et se termine au premier jour du mois suivant exclu.

### 9.2 Normalisation des dates

Une date ISO est convertie en `Date`, puis normalisée à :

```text
00:00:00.000 UTC
```

Toute logique de comparaison utilise cette journée UTC.

### 9.3 Priorité de classification

Lorsque plusieurs événements existent sur une date, la priorité est :

```text
PUBLIC_HOLIDAY
    >
COMPANY_HOLIDAY
    >
LEAVE
    >
EXTERNAL_MISSION
    >
WEEKEND
    >
WORKING_DAY
```

Le libellé et la description utilisent néanmoins la première entrée du tableau trié par date puis date de création, pas nécessairement l'entrée qui a déterminé le type prioritaire.

### 9.4 Unicité applicative

Un seul événement d'un type donné peut exister pour une date donnée. Le contrôle s'effectue par `findFirst` avant écriture et exclut l'entrée courante pendant une modification.

La base possède des index simples, mais aucune contrainte composite unique sur date/type.

### 9.5 Calcul des jours ouvrés

Pour la synthèse mensuelle, tout jour autre que `WORKING_DAY` n'incrémente pas `workingDays`. Seuls les quatre types Working, Weekend, Public Holiday et Company Holiday possèdent un compteur.

### 9.6 Exclusion métier

Pour Attendance, Dashboard et Reports, les dates non ouvrées sont uniquement :

- samedi ;
- dimanche ;
- jour férié public actif ;
- jour férié entreprise actif.

Les types `LEAVE` et `EXTERNAL_MISSION` ne sont pas chargés dans `getNonWorkingDateKeys`.

### 9.7 Validation textuelle

Le nom est limité à 120 caractères et la description à 500. Le service supprime les espaces périphériques. Aucun minimum de longueur autre que la validation de type chaîne n'est déclaré.

### 9.8 Suppression

La suppression exige l'existence de l'UUID et retourne l'objet supprimé. Une valeur absente produit `Calendar entry not found.`

Implémentation principale :

- `apps/backend/src/modules/calendar/calendar.service.ts`
- `apps/backend/src/modules/calendar/dto/`
- `apps/backend/src/common/utils/attendance-date.util.ts`

## 10. Interactions avec les autres modules

### 10.1 Planning

Le planning détermine si un employé est normalement attendu un jour donné. Le calendrier fournit une exclusion globale. Les services consommateurs appliquent les deux conditions séparément.

### 10.2 Attendance

À l'entrée :

- un jour non ouvré produit zéro retard ;
- le statut devient `NON_WORKING_DAY_WORK` ;
- l'heure de sortie planifiée devient nulle.

À la sortie :

- `outsideScheduleWork=true` ;
- la durée complète entre entrée et sortie devient heures supplémentaires ;
- le statut reste `NON_WORKING_DAY_WORK`.

Aucune ligne `ABSENT` n'est créée pendant une date non ouvrée.

### 10.3 Reports

Le rapport mensuel exclut les dates non ouvrées de `workingDays` et `absenceCount`. Un pointage présent à cette date reste inclus comme travail hors planning et dans les heures supplémentaires.

### 10.4 Dashboard

La synthèse quotidienne fixe les employés attendus à zéro lorsque la date est non ouvrée. Le calcul mensuel agrégé ignore aussi ces dates pour les absences.

### 10.5 Diagramme de séquence

```text
Admin        CalendarController   CalendarService      Prisma
  |                   |                  |                |
  | crée férié        |                  |                |
  |------------------>| create           |                |
  |                   |----------------->| normalise date |
  |                   |                  | contrôle doublon
  |                   |                  |--------------->|
  |                   |                  | create         |
  |                   |                  |--------------->|
  |<------------------|<-----------------| entrée active  |
  |                   |                  |                |
  |                   |                  |                |
Attendance/Dashboard/Reports             |                |
  | getNonWorkingDateKeys                |                |
  |------------------------------------->| query fériés   |
  |                                      |--------------->|
  |                                      | + week-ends    |
  |<-------------------------------------| Set timestamps |
  |                                      |                |
  | croise Schedule.workDays avec Set    |                |
  | exclut date des attendus/absences    |                |
  | conserve le travail réellement saisi |                |
```

Implémentation principale :

- `apps/backend/src/modules/attendance/attendance.service.ts`
- `apps/backend/src/modules/attendance/attendance-monthly-metrics.service.ts`
- `apps/backend/src/modules/attendance/exports/monthly-attendance-export.service.ts`
- `apps/backend/src/modules/dashboard/dashboard.service.ts`
- `apps/backend/test/attendance-calendar-absence.e2e-spec.ts`
- `apps/backend/test/non-working-day-attendance.e2e-spec.ts`

## 11. Sécurité

### 11.1 Guards

`JwtAuthGuard` et `RolesGuard` sont enregistrés comme `APP_GUARD`. `CalendarController` exige `ADMIN` pour toute la classe.

### 11.2 Permissions

| Opération | Permission |
|---|---|
| Lecture du mois | `ADMIN` |
| Lecture des événements | `ADMIN` |
| Création | `ADMIN` |
| Modification | `ADMIN` |
| Suppression | `ADMIN` |

Les modules internes consomment directement `CalendarService`; ces appels ne passent pas par le contrôleur HTTP.

### 11.3 Contrôle frontend

La page exécute `requireCurrentUser()` puis contrôle `accessRole`. Le middleware Next.js actuel ne liste pas `/calendar` dans ses chemins protégés ; la protection de cette page est assurée par le composant serveur et par le backend.

### 11.4 Validation

- mois contrôlé par expression régulière ;
- date contrôlée comme chaîne ISO ;
- UUID contrôlé par `ParseUUIDPipe` ;
- type limité aux deux jours fériés exposés ;
- propriétés supplémentaires rejetées par le pipe global ;
- doublon date/type contrôlé dans le service.

### 11.5 Audit

Les trois mutations sont journalisées après succès. La lecture du calendrier et la consultation de la liste ne sont pas auditées.

Implémentation principale :

- `apps/backend/src/modules/calendar/calendar.controller.ts`
- `apps/backend/src/modules/auth/auth.module.ts`
- `apps/backend/src/modules/auth/guards/`
- `apps/frontend/app/calendar/page.tsx`
- `apps/frontend/middleware.ts`

## 12. Dépendances internes

### 12.1 Dépendances du module

| Dépendance | Usage |
|---|---|
| `PrismaService` | Persistance CalendarEntry |
| `AuditLogModule` | Fourniture explicite de l'audit |
| Auth global | JWT, rôle, utilisateur courant |
| `attendance-date.util.ts` | Normalisation et fenêtre mensuelle |
| `class-validator` | DTO |

### 12.2 Consommateurs du service

| Consommateur | Usage |
|---|---|
| `AttendanceService` | jour courant, absences |
| `AttendanceMonthlyMetricsService` | création/recalcul des absences |
| `DashboardService` | attendus et absences |
| `MonthlyAttendanceExportService` | jours ouvrés des rapports |

### 12.3 Diagramme

```text
CalendarModule
├── Auth global
├── AuditLogModule
├── PrismaService
└── CalendarService (exporté)
    ├── normalizeAttendanceDate
    ├── getAttendanceMonthRange
    ├── AttendanceModule
    │   ├── AttendanceService
    │   ├── MonthlyMetricsService
    │   └── MonthlyExportService
    └── DashboardModule
        └── DashboardService

Schedule.workDays --------+
                         +--> jours attendus effectifs
Calendar non-working ----+
```

Implémentation principale :

- `apps/backend/src/modules/calendar/calendar.module.ts`
- `apps/backend/src/modules/calendar/calendar.service.ts`
- `apps/backend/src/modules/attendance/attendance.module.ts`
- `apps/backend/src/modules/dashboard/dashboard.module.ts`

## 13. Traçabilité du code

| Fonctionnalité | Implémentation principale |
|---|---|
| Vue mensuelle backend | `calendar.service.ts#getMonthOverview` |
| Classification des jours | `calendar.service.ts#resolveDayType` |
| Dates non ouvrées | `calendar.service.ts#getNonWorkingDateKeys` |
| Vérification unitaire | `calendar.service.ts#isNonWorkingDay` |
| CRUD jours fériés | `calendar.controller.ts`, `calendar.service.ts` |
| Validation des charges utiles | `dto/create-calendar-entry.dto.ts`, `dto/update-calendar-entry.dto.ts` |
| Modèle persistant | `apps/backend/prisma/schema.prisma` |
| Page d'administration | `apps/frontend/app/calendar/page.tsx` |
| Vues mois/semaine | `apps/frontend/components/calendar/calendar-workspace.tsx` |
| Cellules et détail | `calendar-day-cell.tsx`, `calendar-day-drawer.tsx` |
| Proxies frontend | `apps/frontend/app/api/calendar/` |
| Exclusion Attendance | `apps/backend/src/modules/attendance/attendance.service.ts` |
| Absences matérialisées | `attendance-monthly-metrics.service.ts` |
| Exclusion Dashboard | `apps/backend/src/modules/dashboard/dashboard.service.ts` |
| Exclusion Reports | `monthly-attendance-export.service.ts` |

### 13.1 Gestion des jours fériés

Implémentation principale :

- `apps/backend/src/modules/calendar/calendar.controller.ts`
- `apps/backend/src/modules/calendar/calendar.service.ts`
- `apps/frontend/components/calendar/calendar-workspace.tsx`
- `apps/frontend/app/api/calendar/holidays/route.ts`
- `apps/frontend/app/api/calendar/holidays/[id]/route.ts`

### 13.2 Moteur de calendrier

Implémentation principale :

- `apps/backend/src/modules/calendar/calendar.service.ts`
- `apps/backend/src/modules/calendar/calendar.types.ts`
- `apps/backend/src/common/utils/attendance-date.util.ts`

### 13.3 Intégration présence et rapports

Implémentation principale :

- `apps/backend/src/modules/attendance/attendance.service.ts`
- `apps/backend/src/modules/attendance/attendance-monthly-metrics.service.ts`
- `apps/backend/src/modules/attendance/exports/monthly-attendance-export.service.ts`
- `apps/backend/src/modules/dashboard/dashboard.service.ts`

### 13.4 Tests

Implémentation principale :

- `apps/backend/test/calendar.e2e-spec.ts`
- `apps/backend/test/attendance-calendar-absence.e2e-spec.ts`
- `apps/backend/test/non-working-day-attendance.e2e-spec.ts`

## 14. Observations techniques

Cette section contient uniquement des constats issus du code.

### 14.1 Types persistants partiellement exposés

L'enum Prisma et les types de réponse incluent `LEAVE` et `EXTERNAL_MISSION`. Les DTO, le formulaire et les types de charge utile frontend les excluent. L'interface les affiche dans sa feuille de route.

### 14.2 Relation employé non alimentée par l'API

`CalendarEntry.employeeId` et la projection employé sont implémentés. Aucun DTO Calendrier n'accepte `employeeId`; les créations HTTP du module n'alimentent pas cette relation.

### 14.3 isActive sans commande

`isActive` est stocké, lu et utilisé comme filtre. La création le force à `true`. Aucune méthode ne le positionne à `false` et aucun endpoint de statut n'existe.

### 14.4 Différence entre vue et exclusion métier

`getMonthOverview` peut classifier une entrée `LEAVE` ou `EXTERNAL_MISSION` comme `isNonWorkingDay=true`. `getNonWorkingDateKeys`, utilisé par Attendance, Dashboard et Reports, ne charge pas ces types. Il exclut uniquement week-ends et jours fériés public/entreprise.

### 14.5 Duplication frontend du moteur visuel

`CalendarWorkspace` contient ses propres fonctions `getDayType`, `getDayLabel`, `rebuildCalendarDays` et `buildSummary`. Elles recalculent localement la vue après une mutation à partir des données initiales.

### 14.6 Priorité et premier événement

Le type de journée suit une priorité explicite. Le libellé et la description prennent le premier événement du tableau. Si plusieurs types coexistent, l'événement qui fournit le libellé peut différer de celui qui détermine le type.

### 14.7 Unicité non contrainte en base

Le service empêche un doublon date/type par lecture préalable. Le schéma Prisma ne déclare pas de `@@unique([date, type])`.

### 14.8 Lecture holidays non filtrée sur isActive

`findMonthEntries` retourne toutes les entrées du mois, actives ou inactives. `getMonthOverview` retire les entrées inactives avant construction de la vue.

### 14.9 Audit visuel sans horodatages

`CalendarDayDrawer` tente d'afficher `createdAt` et `updatedAt` au moyen d'un cast optionnel. `CalendarEntryRecord`, `calendarEntrySelect` et les réponses ne contiennent pas ces deux propriétés ; l'interface affiche donc « Non disponible » pour ces valeurs.

### 14.10 Middleware frontend

`apps/frontend/middleware.ts` protège explicitement `/`, `/my-attendance`, `/employees` et `/schedules`, mais pas `/calendar`. La page `/calendar` possède néanmoins ses propres contrôles serveur.

### 14.11 Suppression physique

La suppression retire définitivement la ligne Prisma. Aucun état archivé ou corbeille n'est implémenté.

### 14.12 Absence de pagination

Les lectures mensuelles chargent toutes les entrées de la période. Aucun `skip`, `take` ou curseur n'est utilisé.

### 14.13 Vue hebdomadaire

Le mode hebdomadaire ne sélectionne pas une semaine isolée. Il affiche successivement toutes les semaines du mois chargé.

### 14.14 Sélecteur de mois

Le composant frontend borne visuellement le mois entre janvier 2000 et décembre 2099. Le DTO backend vérifie uniquement la forme `YYYY-MM`; `getAttendanceMonthRange` reçoit les nombres résultants.

### 14.15 Messages multilingues

Les exceptions métier backend sont en anglais. Les libellés, confirmations et messages de l'interface sont en français.

### 14.16 Documentation locale

Aucun README ni fichier Markdown propre au module n'est présent dans `apps/backend/src/modules/calendar/` ou `apps/frontend/components/calendar/`.

### 14.17 Tests constatés

Les suites vérifient :

- création, lecture, modification, classification et suppression des deux jours fériés ;
- classification automatique du week-end ;
- absence d'effectifs attendus et d'absences les dates non ouvrées ;
- absence de génération de lignes `ABSENT` ;
- exclusion des jours non ouvrés dans le rapport ;
- qualification d'un pointage réalisé un jour non ouvré ;
- comptabilisation de la durée travaillée comme heures supplémentaires ;
- non-application d'une sanction sur ces dates.

Implémentation principale :

- `apps/backend/src/modules/calendar/`
- `apps/frontend/components/calendar/`
- `apps/backend/test/calendar.e2e-spec.ts`
- `apps/backend/test/attendance-calendar-absence.e2e-spec.ts`
- `apps/backend/test/non-working-day-attendance.e2e-spec.ts`

