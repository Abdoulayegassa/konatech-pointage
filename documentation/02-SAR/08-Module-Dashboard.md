# Module Dashboard

> **Périmètre actuel :** le dashboard organisation (`/dashboard`) agrège les données de l'entreprise à travers ses sites et ne représente pas un site unique. Chaque site dispose d'un contexte opérationnel et d'un dashboard distinct sous `/site/[siteId]/...`. L'URL `siteId` est un contexte de navigation seulement; l'autorisation du site reste vérifiée côté backend. Ce document décrit le module d'agrégation organisationnelle; consulter `PROJECT_PLAN.md` et `docs/ARCHITECTURE.md` pour le contrat complet.

| Métadonnée | Valeur |
|---|---|
| Document ID | SAR-DSH-001 |
| Titre | Module Dashboard |
| Version | 1.0 |
| Statut | Validé |
| Classification | Interne |
| Référence SAPDD | Module Dashboard |
| Date de génération | 29 juillet 2026 |

## 1. Présentation du module

### 1.1 Objectif

Le module Dashboard fournit une synthèse administrative de l'activité de présence. Il agrège les employés actifs, les pointages, les plannings, les dates non ouvrées et les métadonnées de vérification afin de produire une vue opérationnelle du jour et une synthèse du mois courant.

La page d'accueil `/` constitue le dashboard administrateur. Elle consomme un objet `DashboardOverview` produit par un endpoint unique.

### 1.2 Responsabilités

Les responsabilités constatées sont :

- compter les employés actifs ;
- déterminer les employés planifiés et attendus ;
- compter présences, retards, absences et sorties anticipées du jour ;
- agréger les heures supplémentaires ;
- compter le travail pendant les jours non ouvrés ou hors planning ;
- calculer trois taux journaliers ;
- calculer les absences mensuelles à partir des plannings et du calendrier ;
- établir des classements mensuels ;
- exposer les cinq activités de pointage les plus récemment modifiées ;
- agréger des métriques de vérification GPS, photo et niveaux historiques ;
- fournir les données aux cartes, alertes et listes frontend.

### 1.3 Périmètre fonctionnel

| Fonctionnalité | État constaté |
|---|---|
| Synthèse journalière | Implémentée |
| Synthèse mensuelle | Implémentée |
| Activité récente | Implémentée |
| Alertes du jour | Implémentées côté frontend à partir de l'activité récente |
| Top retards | Implémenté |
| Top heures supplémentaires | Implémenté |
| Top départs anticipés | Implémenté |
| Agrégats de sécurité | Implémentés dans l'API |
| Affichage des agrégats de sécurité | Non trouvé sur la page Dashboard actuelle |
| Graphiques statistiques | Non trouvés |
| Choix d'une période | Non trouvé ; jour et mois courants uniquement |
| Actualisation automatique | Non trouvée |
| Cache applicatif du dashboard | Non trouvé |
| Pagination | Non applicable à l'endpoint unique ; activité limitée à cinq |

Le module est implémenté pour une vue instantanée journalière et mensuelle. Il ne fournit pas de série chronologique ou de graphique.

Implémentation principale :

- `apps/backend/src/modules/dashboard/dashboard.service.ts`
- `apps/backend/src/modules/dashboard/dashboard.controller.ts`
- `apps/frontend/app/dashboard/page.tsx`
- `apps/frontend/components/dashboard/`

## 2. Position dans l'architecture

### 2.1 Interaction avec Auth

`DashboardController` exige `AccessRole.ADMIN` au niveau de la classe. Les guards globaux JWT et rôles protègent l'endpoint.

La page `/` appelle `requireCurrentUser()`, redirige tout compte non administrateur vers `/my-attendance`, puis exige le token de session.

### 2.2 Interaction avec Employee

Le service compte les employés actifs et charge les employés actifs possédant un `scheduleId`. Les classements effectuent une seconde lecture ciblée des employés regroupés afin de produire :

- identifiant métier, avec repli sur `employeeCode` ;
- nom complet ;
- département.

### 2.3 Interaction avec Attendance

`Attendance` est la principale source du dashboard. Le service lit ou agrège :

- date, entrée et sortie ;
- statut ;
- retard ;
- sortie anticipée ;
- heures supplémentaires ;
- travail hors planning ;
- absences ;
- notes ;
- preuves de vérification.

`DashboardService` n'injecte pas `AttendanceService`; il interroge Prisma directement.

### 2.4 Interaction avec Planning

Le planning détermine les employés attendus. Un employé est attendu si :

- il est actif ;
- il possède un planning ;
- le planning est actif ;
- le jour de référence appartient à `workDays` ;
- le calendrier ne classe pas la date comme non ouvrée.

### 2.5 Interaction avec Calendar

`DashboardModule` importe `CalendarModule`. `CalendarService` est utilisé pour :

- exclure un jour non ouvré des employés attendus du jour ;
- exclure week-ends et jours fériés du calcul mensuel des absences.

### 2.6 Interaction avec Reports

`DashboardService` ne dépend d'aucun service de rapport. Le frontend expose une action rapide vers `/exports`, où `MonthlyAttendanceExportCard` déclenche l'export PDF du module Pointage.

Le dossier de composants Dashboard contient cette carte d'export, mais elle est rendue sur la page `/exports`, pas sur `/`.

### 2.7 Diagramme de positionnement

```text
                         +------------------+
                         |    AuthModule    |
                         | JWT + rôle ADMIN |
                         +---------+--------+
                                   |
                                   v
+----------------+     +--------------------------+
| Next.js /      | --> |     DashboardModule      |
| Dashboard UI   |     | Controller + Service     |
+-------+--------+     +------------+-------------+
        |                           |
        |                           v
        |                    +-------------+
        |                    | Prisma      |
        |                    +------+------+ 
        |                           |
        |              +------------+------------+
        |              |            |            |
        |              v            v            v
        |          Employee     Attendance     Schedule
        |                           |
        |                           v
        |                    CalendarService
        |
        +--> Actions rapides : Employés / Planning / Reports / QR
```

Implémentation principale :

- `apps/backend/src/modules/dashboard/dashboard.module.ts`
- `apps/backend/src/modules/dashboard/dashboard.service.ts`
- `apps/backend/src/modules/auth/auth.module.ts`
- `apps/frontend/components/dashboard/quick-actions-section.tsx`

## 3. Architecture générale

### 3.1 Frontend

`apps/frontend/app/dashboard/page.tsx` est une page serveur dynamique. Elle :

1. valide l'utilisateur administrateur ;
2. récupère le token ;
3. charge `/dashboard/overview` ;
4. construit l'URL publique de la borne ;
5. transforme cinq valeurs de synthèse en cartes ;
6. compose les alertes, actions, activités et classements.

Les composants interactifs sont limités aux actions rapides, au QR et à l'export utilisé sur une autre page. Les indicateurs du dashboard sont rendus à partir de la réponse serveur.

### 3.2 Backend

`DashboardModule` contient un contrôleur et un service. Il importe `CalendarModule`. Il n'exporte pas `DashboardService`.

Le service est annoté comme source de vérité de l'agrégation Dashboard.

### 3.3 API

Un seul endpoint est exposé :

```text
GET /api/v1/dashboard/overview
```

La page serveur utilise `getDashboardData(token)`, qui appelle directement cet endpoint par `requestApi`. Aucun Route Handler Next.js `/api/dashboard` n'est présent.

### 3.4 Services

`DashboardService` orchestre toutes les requêtes et calcule l'objet final. Il injecte :

- `PrismaService` ;
- `CalendarService`.

### 3.5 Persistance

Le module ne possède aucune table Dashboard. Il lit les modèles :

- `Employee` ;
- `Schedule` à travers Employee ;
- `Attendance` ;
- `CalendarEntry` à travers CalendarService.

Aucune donnée agrégée n'est persistée par le module.

### 3.6 Sources de données

| Source | Données |
|---|---|
| `Employee` | actifs, identité, département, planning |
| `Schedule` | état et jours travaillés |
| `Attendance` | présence, statut, calculs, sécurité et activité |
| `CalendarService` | jour courant non ouvré et dates exclues |
| Configuration frontend | URL publique de la borne |

### 3.7 Diagramme général

```text
Requête GET /
      |
      v
Page serveur Next.js
      |
      +-- Auth : requireCurrentUser + session token
      |
      +-- getDashboardData
                |
                v
       GET /api/v1/dashboard/overview
                |
                v
       DashboardController
                |
                v
       DashboardService
          |           |
          |           +--> CalendarService --> CalendarEntry
          |
          +--> Prisma
                |-- Employee + Schedule
                |-- Attendance counts
                |-- Attendance aggregates
                |-- Attendance groupBy
                |-- Recent Attendance findMany
                v
       DashboardOverview JSON
                |
                v
       Cartes / alertes / listes / classements
```

Implémentation principale :

- `apps/frontend/app/dashboard/page.tsx`
- `apps/frontend/lib/api.ts`
- `apps/backend/src/modules/dashboard/`
- `apps/backend/prisma/schema.prisma`

## 4. Organisation des fichiers

### 4.1 Backend

```text
apps/backend/src/modules/dashboard/
├── dashboard.controller.ts
├── dashboard.module.ts
├── dashboard.service.ts
└── dashboard.types.ts
```

| Fichier | Rôle |
|---|---|
| `dashboard.module.ts` | Assemblage NestJS et import du calendrier |
| `dashboard.controller.ts` | Endpoint administrateur |
| `dashboard.service.ts` | Requêtes, agrégations et mappage |
| `dashboard.types.ts` | Contrats de synthèse, analytics, classements et activité |

### 4.2 Frontend

```text
apps/frontend/
├── app/
│   └── page.tsx
└── components/dashboard/
    ├── attendance-entry-qr-card.tsx
    ├── connection-panel.tsx
    ├── daily-alerts-card.tsx
    ├── dashboard-analytics-section.tsx
    ├── metric-card.tsx
    ├── module-card.tsx
    ├── monthly-attendance-export-card.tsx
    ├── quick-actions-section.tsx
    └── recent-activity-list.tsx
```

| Fichier | Rôle |
|---|---|
| `app/page.tsx` | Page et composition principale |
| `metric-card.tsx` | Carte d'indicateur réutilisable |
| `daily-alerts-card.tsx` | Alertes dérivées de l'activité récente |
| `dashboard-analytics-section.tsx` | KPIs mensuels et trois classements |
| `recent-activity-list.tsx` | Activités récentes transformées |
| `quick-actions-section.tsx` | Liens administratifs et ouverture du QR |
| `attendance-entry-qr-card.tsx` | QR, aperçu canvas et export d'affiche PDF |
| `monthly-attendance-export-card.tsx` | Formulaire PDF rendu sur `/exports` |
| `connection-panel.tsx` | Composant de diagnostic de connexion présent mais non rendu |
| `module-card.tsx` | Carte générique présente mais non rendue |

### 4.3 Fichiers transverses

```text
apps/backend/
├── prisma/schema.prisma
└── src/
    ├── common/utils/attendance-date.util.ts
    └── modules/calendar/

apps/frontend/lib/
├── api.ts
├── auth.ts
└── auth-session.ts
```

Implémentation principale : les arborescences de cette section.

## 5. Modèle métier

### 5.1 DashboardOverview

La réponse racine contient :

| Propriété | Contenu |
|---|---|
| `generatedAt` | instant de génération |
| `date` | date UTC de référence |
| `summary` | synthèse du jour |
| `analytics` | taux, compteurs mensuels, sécurité et classements |
| `recentActivity` | cinq pointages récemment modifiés |

### 5.2 Indicateurs de synthèse

`DashboardSummary` contient :

- `totalEmployees` ;
- `presentToday` ;
- `scheduledPresentToday` ;
- `nonWorkingDayWorkToday` ;
- `lateEmployeesToday` ;
- `absentEmployeesToday` ;
- `earlyExitToday` ;
- `overtimeHoursToday` ;
- `totalAttendanceRecordsToday`.

### 5.3 Analytics

Les analytics couvrent :

- taux de présence, retard et absence ;
- absences du mois ;
- travail hors planning ;
- heures supplémentaires ;
- départs anticipés ;
- compteurs GPS, zone et photo ;
- niveaux historiques sensibles ;
- compteurs de blocage déclarés mais nuls ;
- quatre familles de classements dans le contrat.

### 5.4 Classements

| Classement | Mesures |
|---|---|
| Retards | occurrences, minutes cumulées, moyenne |
| Heures supplémentaires | somme d'heures |
| Départs anticipés | occurrences et minutes cumulées |
| Vérifications historiques sensibles | warning, strict, photo et distance maximale |

Chaque classement est limité aux cinq employés les mieux classés selon son agrégat.

### 5.5 Activité récente

Chaque activité contient l'identité, les horaires, les résultats de présence, les notes et les principales métadonnées de vérification d'entrée et de sortie.

### 5.6 Widgets

Le modèle frontend transforme ces données en :

- cinq cartes journalières ;
- alertes du jour ;
- quatre cartes mensuelles ;
- trois classements visibles ;
- liste d'activité ;
- actions rapides.

Implémentation principale :

- `apps/backend/src/modules/dashboard/dashboard.types.ts`
- `apps/frontend/lib/api.ts`
- `apps/frontend/app/dashboard/page.tsx`

## 6. Contrôleurs

### 6.1 DashboardController

| Méthode | Endpoint | Validation | Permission | Dépendance |
|---|---|---|---|---|
| GET | `/api/v1/dashboard/overview` | Aucun paramètre | `ADMIN` | `DashboardService.getOverview()` |

Le contrôleur n'accepte ni query, ni paramètre de route, ni corps.

### 6.2 Rôle

Il constitue une couche HTTP minimale et retourne directement la promesse du service.

### 6.3 Permission

`@Roles(AccessRole.ADMIN)` est placé sur la classe. L'endpoint exige donc authentification JWT et rôle administrateur.

### 6.4 Dépendances

Le contrôleur injecte uniquement `DashboardService`. Il n'appelle pas `AuditLogService`; la consultation du dashboard n'est pas auditée.

Implémentation principale :

- `apps/backend/src/modules/dashboard/dashboard.controller.ts`
- `apps/backend/src/modules/auth/guards/jwt-auth.guard.ts`
- `apps/backend/src/modules/auth/guards/roles.guard.ts`

## 7. Services

### 7.1 DashboardService

| Méthode | Responsabilité |
|---|---|
| `getOverview` | Orchestration complète |
| `countAbsentEmployees` | Absents parmi les attendus du jour |
| `getDayRange` | Jour UTC semi-ouvert |
| `getMonthRange` | Mois UTC semi-ouvert |
| `buildAnalytics` | Taux, sommes, alias et classements |
| `toRate` | Pourcentage à une décimale |
| `roundHours` | Heures à deux décimales |
| `getTopLateEmployees` | Top 5 retards |
| `countMonthlyAbsences` | Absences du mois jusqu'au jour de référence |
| `getTopOvertimeEmployees` | Top 5 heures supplémentaires |
| `getTopEarlyExitEmployees` | Top 5 départs anticipés |
| `getTopSuspiciousEmployees` | Top 5 niveaux historiques warning/strict |
| `getEmployeeSummaryMap` | Enrichissement identité des groupes |
| `mapRecentActivity` | Sérialisation des cinq activités |
| `resolveEmployeeIdentifierLabel` | Repli identifiant |

### 7.2 Orchestration

`getOverview` exécute deux vagues de requêtes parallèles.

La première vague produit les compteurs journaliers, les employés planifiés, les preuves de sécurité, les activités récentes et le statut calendrier.

Après calcul des identifiants attendus, la seconde vague produit les présences planifiées, classements et agrégats mensuels.

### 7.3 Diagramme du service

```text
DashboardService.getOverview
   |
   +-- bornes jour/mois UTC
   |
   +-- Promise.all #1
   |     |-- Employee count/findMany
   |     |-- Attendance count/aggregate/findMany
   |     +-- CalendarService.isNonWorkingDay
   |
   +-- calcule scheduledEmployeeIds
   |
   +-- Promise.all #2
   |     |-- pointages des attendus
   |     |-- groupBy retards
   |     |-- groupBy sécurité historique
   |     |-- groupBy heures supplémentaires
   |     |-- groupBy sorties anticipées
   |     |-- agrégats mensuels
   |     +-- countMonthlyAbsences
   |
   +-- buildAnalytics
   +-- mapRecentActivity
   v
DashboardOverview
```

Implémentation principale :

- `apps/backend/src/modules/dashboard/dashboard.service.ts`
- `apps/backend/src/modules/dashboard/dashboard.types.ts`

## 8. Gestion des indicateurs

### 8.1 Indicateurs du jour

| Indicateur | Calcul backend | Affiché sur `/` |
|---|---|---:|
| Employés actifs | `employee.count(isActive=true)` | Non |
| Présents totaux | pointages du jour avec entrée | Non directement |
| Présents planifiés | attendus avec entrée non ABSENT | Oui |
| Travail jour non ouvré | statut correspondant avec entrée | Oui |
| Retards | `minutesLate > 0` | Oui |
| Absences | attendus sans entrée ou statut ABSENT | Oui |
| Départs anticipés | `earlyExit=true` | Oui |
| Heures supplémentaires du jour | somme `overtimeHours > 0` | Non |
| Enregistrements du jour | toutes les lignes Attendance | Non |

### 8.2 Taux

```text
taux de présence = présents planifiés / employés attendus
taux de retard   = retards du jour / présents planifiés
taux d'absence   = absents du jour / employés attendus
```

Le pourcentage est arrondi à une décimale. Un dénominateur nul produit zéro. Ces taux sont retournés par l'API mais ne sont pas affichés par les composants actuels de `/`.

### 8.3 Indicateurs mensuels affichés

- retard : somme des minutes du Top 5 disponible, ou occurrences si la somme vaut zéro ;
- absences consolidées ;
- heures supplémentaires cumulées ;
- occurrences de départ anticipé.

Le KPI de retard affiché ne représente pas un agrégat séparé de tous les employés : il additionne les valeurs du classement Top 5 renvoyé.

### 8.4 Travail hors planning

Le service agrège sur le mois :

- nombre de lignes avec `outsideScheduleWork=true` ;
- somme de leurs heures supplémentaires.

Ces données sont retournées mais non affichées sur la page actuelle.

### 8.5 Vérifications

Le contrat expose :

- méthodes GPS d'entrée et sortie ;
- raisons `WITHIN_ALLOWED_RADIUS` ;
- méthodes PHOTO ;
- niveaux WARNING/STRICT ;
- totaux combinés.

Les compteurs de blocage et rejet hors zone sont toujours transmis à `buildAnalytics` avec `null`.

### 8.6 Tendances et graphiques

Aucune tendance temporelle, comparaison avec une période précédente, série de données ou graphique statistique n'est implémenté. Aucun composant de chart n'est rendu.

Implémentation principale :

- `apps/backend/src/modules/dashboard/dashboard.service.ts`
- `apps/frontend/app/dashboard/page.tsx`
- `apps/frontend/components/dashboard/dashboard-analytics-section.tsx`

## 9. Agrégation des données

### 9.1 Périodes

Le jour est `[00:00 UTC, jour suivant)`. Le mois est `[premier jour UTC, premier jour du mois suivant)`.

Le contrôleur ne permet pas de choisir la date. `getOverview` utilise `new Date()` ; le paramètre `referenceDate` sert aux appels internes et aux tests.

### 9.2 Présence quotidienne

`presentToday` compte toutes les entrées, y compris hors planning et jour non ouvré. `scheduledPresentToday` ne compte que les employés attendus.

### 9.3 Absence quotidienne

Le service construit une map des pointages des employés attendus. Un employé est absent si :

- aucune ligne n'existe ;
- le statut vaut `ABSENT` ;
- `clockInAt` est nul.

### 9.4 Absence mensuelle

Le calcul :

1. retient les employés avec planning actif ;
2. borne la période au lendemain du jour de référence, sans dépasser le mois ;
3. charge les dates ayant une entrée ;
4. charge les dates non ouvrées ;
5. parcourt chaque jour et chaque employé ;
6. incrémente si le jour est planifié, ouvré et non travaillé.

### 9.5 Regroupements

Les classements utilisent `prisma.attendance.groupBy` :

- retards groupés par employé ;
- heures supplémentaires groupées par employé ;
- sorties anticipées groupées par employé ;
- sécurité groupée par employé, niveau et méthode.

Une lecture Employee ciblée enrichit ensuite les groupes.

### 9.6 Activité récente

La requête prend cinq lignes, triées par :

1. `updatedAt` décroissant ;
2. `createdAt` décroissant.

Elle n'est pas limitée au jour ou au mois courant.

### 9.7 Filtres de sécurité

Les compteurs journaliers distinguent l'entrée et la sortie. Les classements de sécurité mensuels utilisent uniquement les niveaux d'entrée WARNING et STRICT.

### 9.8 Optimisations constatées

- deux vagues de `Promise.all` ;
- agrégats Prisma `count`, `aggregate` et `groupBy` ;
- projections explicites ;
- relecture Employee limitée aux identifiants issus des Top ;
- retour anticipé du calcul d'absence sans employé éligible ;
- requête de présence quotidienne évitée si aucun employé n'est attendu ;
- limite de cinq sur activités et classements.

Implémentation principale :

- `apps/backend/src/modules/dashboard/dashboard.service.ts`
- `apps/backend/prisma/schema.prisma`

## 10. Widgets et composants

### 10.1 Cartes journalières

`MetricCard` affiche cinq cartes :

- Présents planifiés ;
- Travail jour non ouvré ;
- Retards aujourd'hui ;
- Absences aujourd'hui ;
- Départs anticipés aujourd'hui.

### 10.2 Alertes du jour

`DailyAlertsCard` transforme les activités récentes dont la date correspond au dashboard. Il peut produire :

- absence ;
- retard ;
- départ anticipé ;
- sortie manquante.

Les alertes sont triées par cette priorité et limitées à cinq.

### 10.3 Activité en direct

`RecentActivityList` classe chaque ligne comme entrée, sortie ou absence et affiche un statut :

- à l'heure ;
- retard ;
- départ anticipé ;
- heures supplémentaires ;
- travail jour non ouvré ;
- absence ;
- pointage incomplet.

Le composant retrie les données par heure et applique une limite de dix, alors que le backend n'en fournit que cinq.

### 10.4 Synthèse mensuelle

`DashboardAnalyticsSection` affiche quatre cartes mensuelles et trois classements :

- Top retards ;
- Top heures supplémentaires ;
- Top départs anticipés.

Le classement de sécurité fourni par l'API n'est pas rendu.

### 10.5 Actions rapides

Les actions sont :

- QR Pointage, avec panneau extensible ;
- Exporter un rapport vers `/exports` ;
- Créer un employé vers `/employees` ;
- Créer un planning vers `/schedules`.

### 10.6 QR

`AttendanceEntryQrCard` génère le QR de `/attendance-entry`, affiche une affiche sur canvas et permet un téléchargement PDF. Il utilise la bibliothèque `qrcode`.

### 10.7 Composants présents hors page

- `MonthlyAttendanceExportCard` est rendu sur `/exports` ;
- `MetricCard` est réutilisé sur `/sanctions` ;
- `ConnectionPanel` n'a aucune utilisation trouvée ;
- `ModuleCard` n'a aucune utilisation trouvée.

### 10.8 Graphiques et tableaux

Aucun graphique statistique ou tableau de données n'est présent sur la page. Les classements sont des listes de lignes au sein de cartes.

Implémentation principale :

- `apps/frontend/app/dashboard/page.tsx`
- `apps/frontend/components/dashboard/metric-card.tsx`
- `apps/frontend/components/dashboard/daily-alerts-card.tsx`
- `apps/frontend/components/dashboard/recent-activity-list.tsx`
- `apps/frontend/components/dashboard/dashboard-analytics-section.tsx`
- `apps/frontend/components/dashboard/quick-actions-section.tsx`

## 11. Interactions avec les autres modules

### 11.1 Attendance

Le Dashboard lit directement les pointages. Il ne recalcule pas les résultats individuels de retard, sortie ou heures supplémentaires ; il agrège les champs persistés par Attendance.

### 11.2 Employee

Employee fournit la population active, l'identité des activités et les libellés des classements.

### 11.3 Planning

Planning détermine les attendus et les jours susceptibles de devenir des absences.

### 11.4 Calendar

Calendar retire week-ends et jours fériés de ces jours attendus.

### 11.5 Reports

Le Dashboard fournit un lien de navigation. La génération du rapport passe par `/exports` et l'endpoint du module Attendance ; elle ne passe pas par `DashboardService`.

### 11.6 Diagramme de séquence

```text
Admin       Next.js page      DashboardController   DashboardService   Prisma/Calendar
  |              |                    |                    |                 |
  | GET /        |                    |                    |                 |
  |------------->| contrôle ADMIN     |                    |                 |
  |              | GET overview       |                    |                 |
  |              |------------------->| getOverview        |                 |
  |              |                    |------------------->| bornes UTC      |
  |              |                    |                    | requêtes #1     |
  |              |                    |                    |---------------->|
  |              |                    |                    |<----------------|
  |              |                    |                    | Calendar date   |
  |              |                    |                    |---------------->|
  |              |                    |                    | attendus        |
  |              |                    |                    | requêtes #2     |
  |              |                    |                    |---------------->|
  |              |                    |                    |<----------------|
  |              |                    |                    | taux/top/mapping|
  |              |                    |<-------------------| overview        |
  |              |<-------------------|                    |                 |
  |              | rend widgets       |                    |                 |
  |<-------------|                    |                    |                 |
  | clic Export  |                    |                    |                 |
  |------------->| /exports           | module Reports/Attendance, hors Dashboard
```

Implémentation principale :

- `apps/backend/src/modules/dashboard/dashboard.service.ts`
- `apps/backend/src/modules/calendar/calendar.service.ts`
- `apps/frontend/app/dashboard/page.tsx`
- `apps/frontend/components/dashboard/quick-actions-section.tsx`
- `apps/frontend/app/exports/page.tsx`

## 12. Sécurité

### 12.1 Guards

`JwtAuthGuard` et `RolesGuard` sont enregistrés comme guards globaux. L'endpoint n'est pas public.

### 12.2 Permissions

Seul `ADMIN` peut appeler `/dashboard/overview`. Les tests vérifient :

- HTTP 401 sans authentification ;
- HTTP 403 pour `EMPLOYEE` ;
- HTTP 200 pour `ADMIN`.

### 12.3 Validation

L'endpoint ne reçoit aucune entrée à valider. Les valeurs de période sont déterminées côté serveur.

### 12.4 Contrôle frontend

Le middleware protège explicitement `/`. La page répète le contrôle d'utilisateur et de rôle, puis redirige les employés.

### 12.5 Données sensibles

La projection d'activité inclut les URL et identifiants publics des photos de vérification. Le frontend Dashboard actuel ne les affiche pas. Les mots de passe et PIN ne sont pas sélectionnés.

Implémentation principale :

- `apps/backend/src/modules/dashboard/dashboard.controller.ts`
- `apps/backend/src/modules/auth/auth.module.ts`
- `apps/backend/src/modules/auth/guards/`
- `apps/frontend/middleware.ts`
- `apps/frontend/app/dashboard/page.tsx`
- `apps/backend/test/app.e2e-spec.ts`

## 13. Dépendances internes

### 13.1 Backend

| Dépendance | Usage |
|---|---|
| `PrismaService` | Toutes les lectures et agrégations |
| `CalendarService` | Dates non ouvrées |
| `attendance-date.util.ts` | Bornes et jours planifiés |
| enums Prisma | Statuts, méthodes et niveaux |
| Auth global | Protection du contrôleur |

### 13.2 Frontend

| Dépendance | Usage |
|---|---|
| `lib/api.ts` | Contrats et chargement |
| `lib/auth.ts` | Utilisateur et token |
| composants UI | Card, Badge, Button |
| `qrcode` | QR borne |
| `/exports` | Navigation rapport |
| `/employees` | Navigation création employé |
| `/schedules` | Navigation planning |

### 13.3 Diagramme

```text
DashboardModule
├── Auth global
├── PrismaService
│   ├── Employee
│   │   └── Schedule
│   └── Attendance
├── CalendarModule
│   └── CalendarService
└── Frontend Dashboard
    ├── lib/api.ts
    ├── MetricCard
    ├── DailyAlertsCard
    ├── RecentActivityList
    ├── DashboardAnalyticsSection
    └── QuickActionsSection
        ├── QR
        ├── Reports
        ├── Employees
        └── Schedules
```

Implémentation principale :

- `apps/backend/src/modules/dashboard/dashboard.module.ts`
- `apps/backend/src/modules/dashboard/dashboard.service.ts`
- `apps/frontend/components/dashboard/`

## 14. Performances

### 14.1 Pagination

L'endpoint ne prend aucun paramètre de pagination. L'activité récente et les classements sont bornés à cinq en base ou après agrégation.

### 14.2 Cache

Aucun cache NestJS, cache Redis, revalidation Next.js ou mémoire applicative n'est utilisé. La page déclare `dynamic = 'force-dynamic'`.

### 14.3 Parallélisation

Les requêtes indépendantes sont réparties dans deux `Promise.all`. La seconde dépend du calcul des employés attendus issu de la première.

### 14.4 Agrégations Prisma

Le service utilise :

- `count` pour les volumes ;
- `aggregate` pour les sommes ;
- `groupBy` pour les classements ;
- `findMany` projeté pour les données détaillées.

### 14.5 Index exploités par le modèle

`Attendance` possède notamment des index sur :

- date ;
- niveaux et distances de vérification ;
- sorties anticipées et tardives ;
- heures supplémentaires ;
- compteur d'absences.

### 14.6 Calculs en mémoire

Sont calculés en mémoire :

- employés attendus ;
- absents du jour ;
- absences mensuelles par parcours employé/jour ;
- fusion des groupes de sécurité ;
- taux et mappage.

### 14.7 Rafraîchissement

Le dashboard se met à jour à chaque nouveau rendu serveur de `/`. Aucun polling, abonnement, WebSocket ou bouton de rafraîchissement propre au module n'est présent.

Implémentation principale :

- `apps/backend/src/modules/dashboard/dashboard.service.ts`
- `apps/backend/prisma/schema.prisma`
- `apps/frontend/app/dashboard/page.tsx`

## 15. Traçabilité du code

| Fonctionnalité | Fichiers principaux |
|---|---|
| Endpoint overview | `dashboard.controller.ts`, `dashboard.service.ts` |
| Contrats | `dashboard.types.ts`, `apps/frontend/lib/api.ts` |
| Synthèse journalière | `dashboard.service.ts#getOverview` |
| Employés attendus | `dashboard.service.ts`, `attendance-date.util.ts` |
| Absences mensuelles | `dashboard.service.ts#countMonthlyAbsences`, `calendar.service.ts` |
| Top retards | `dashboard.service.ts#getTopLateEmployees` |
| Top heures supplémentaires | `dashboard.service.ts#getTopOvertimeEmployees` |
| Top sorties anticipées | `dashboard.service.ts#getTopEarlyExitEmployees` |
| Sécurité historique | `dashboard.service.ts#getTopSuspiciousEmployees` |
| Activité récente | `dashboard.service.ts#mapRecentActivity`, `recent-activity-list.tsx` |
| Alertes | `daily-alerts-card.tsx` |
| Cartes journalières | `app/page.tsx`, `metric-card.tsx` |
| Synthèse mensuelle | `dashboard-analytics-section.tsx` |
| Actions rapides | `quick-actions-section.tsx` |
| QR | `attendance-entry-qr-card.tsx` |

### 15.1 Backend

Implémentation principale :

- `apps/backend/src/modules/dashboard/dashboard.controller.ts`
- `apps/backend/src/modules/dashboard/dashboard.service.ts`
- `apps/backend/src/modules/dashboard/dashboard.types.ts`
- `apps/backend/src/modules/dashboard/dashboard.module.ts`

### 15.2 Frontend

Implémentation principale :

- `apps/frontend/app/dashboard/page.tsx`
- `apps/frontend/components/dashboard/`
- `apps/frontend/lib/api.ts`

### 15.3 Interactions

Implémentation principale :

- `apps/backend/src/modules/calendar/calendar.service.ts`
- `apps/backend/src/common/utils/attendance-date.util.ts`
- `apps/backend/prisma/schema.prisma`
- `apps/frontend/app/exports/page.tsx`

### 15.4 Tests

Implémentation principale :

- `apps/backend/test/app.e2e-spec.ts`
- `apps/backend/test/attendance-calendar-absence.e2e-spec.ts`
- `apps/backend/test/non-working-day-attendance.e2e-spec.ts`

## 16. Observations techniques

Cette section contient uniquement des constats vérifiés dans le code.

### 16.1 Service Dashboard indépendant d'AttendanceService

Le service lit directement Prisma et implémente ses propres agrégations. Il utilise CalendarService, mais pas AttendanceService.

### 16.2 Activité récente globale

Les cinq activités sont sélectionnées sur l'ensemble de la table par dernière modification, sans filtre de date. La liste appelée « activité en direct » peut donc contenir des dates antérieures si aucune activité récente n'existe.

### 16.3 Alertes fondées sur cinq activités

`DailyAlertsCard` ne reçoit pas toutes les anomalies du jour. Il dérive ses alertes uniquement des cinq activités récentes renvoyées. Un même pointage peut produire plusieurs alertes, puis la liste est limitée à cinq.

### 16.4 absenceCount interprété dans les widgets

Les composants Alertes et Activité considèrent une ligne comme absence si `status === ABSENT` ou si `absenceCount > 0`. `absenceCount` est un compteur mensuel stocké sur chaque pointage ; une présence peut donc être présentée comme absence lorsqu'elle porte un compteur antérieur positif.

### 16.5 Méthode GPS et flux actuel

Le service Dashboard compte comme GPS validé uniquement `verificationMethod=GPS`. Le flux employé actuel exige un selfie et `AttendanceSecurityService` choisit la méthode `PHOTO` lorsqu'une photo existe, même avec coordonnées. Ces pointages ne sont pas comptés dans les compteurs de méthode GPS.

### 16.6 Raison de zone historique

Les compteurs `insideZone*` recherchent la raison `WITHIN_ALLOWED_RADIUS`. Le service de sécurité actuel produit notamment `SELFIE_AND_LOCATION_RECORDED`, `SELFIE_RECORDED` et `OFFSITE_LOCATION_JUSTIFIED`. Le filtre Dashboard correspond donc à une valeur historique non produite par ces branches actuelles.

### 16.7 Niveaux historiques

Le classement de sécurité et les compteurs sensibles recherchent WARNING/STRICT. `AttendanceSecurityService` construit actuellement le niveau OK. Les noms `legacy*` dans le contrat reflètent cette conservation historique.

### 16.8 Compteurs bloqués non persistés

`blockedCheckInCount`, `blockedCheckOutCount`, `blockedAttendanceAttemptCount` et `outsideZoneRejectedAttemptCount` valent toujours `null`. Aucun modèle de tentative refusée n'est interrogé.

### 16.9 Alias de compatibilité

`buildAnalytics` recopie les métriques historiques sous plusieurs noms :

- `topLegacySecurityEmployees` et `topSuspiciousEmployees` ;
- `legacySensitive*` et `suspicious*` ;
- `legacyPhotoCheckInCount` et `photoVerificationCount`.

### 16.10 Métriques API non rendues

La page ne rend pas :

- total des employés ;
- présents totaux ;
- heures supplémentaires du jour ;
- total des lignes du jour ;
- taux ;
- travail hors planning mensuel ;
- métriques de sécurité ;
- classement de sécurité.

Ces données restent présentes dans `DashboardOverview`.

### 16.11 KPI retard mensuel dérivé du Top 5

Le backend ne fournit pas de total global de minutes de retard du mois. Le frontend additionne les minutes des cinq employés du classement pour afficher « Retards du mois ».

### 16.12 generatedAt et referenceDate

`date` utilise `referenceDate`, mais `generatedAt` utilise toujours `new Date()`. Lors d'un appel interne avec une date de référence historique, les deux valeurs ne représentent pas le même instant.

### 16.13 Composants non utilisés

Aucune utilisation de `ConnectionPanel` ou `ModuleCard` n'est trouvée dans le frontend. Ils restent présents dans le dossier Dashboard.

### 16.14 Carte d'export classée Dashboard

`monthly-attendance-export-card.tsx` se trouve dans `components/dashboard`, mais elle est importée par `app/exports/page.tsx`, pas par le dashboard.

### 16.15 Aucun graphique

Le nom `DashboardAnalyticsSection` correspond à des cartes et classements. Aucun graphique statistique n'est implémenté.

### 16.16 Identifiant de repli

Le service préfère `employeeIdentifier`, puis `employeeCode`, puis le texte `ID non defini`. Le modèle actuel rend `employeeIdentifier` obligatoire, mais le type interne accepte `null`.

### 16.17 Documentation locale

Aucun README ou fichier Markdown n'est présent dans `apps/backend/src/modules/dashboard/` ou `apps/frontend/components/dashboard/`.

### 16.18 Tests constatés

Les tests end-to-end vérifient :

- authentification obligatoire ;
- refus du rôle employé ;
- accès administrateur ;
- structure de la synthèse, des analytics et de l'activité ;
- absence d'exposition des PIN ;
- exclusion des jours non ouvrés du taux de présence et d'absence ;
- suivi séparé du travail hors planning.

Implémentation principale :

- `apps/backend/test/app.e2e-spec.ts`
- `apps/backend/src/modules/dashboard/`
- `apps/frontend/components/dashboard/`
