# API Reference — Dashboard

| Métadonnée | Valeur |
|---|---|
| Document ID | API-007 |
| Titre | Dashboard |
| Version | 1.0 |
| Statut | Validé |
| Classification | Interne |
| Référence | API Reference |
| Projet | Konatech Pointage |

## 1. Présentation

Les endpoints Dashboard fournissent une vue agrégée des employés actifs, des présences, des retards, des absences, des sorties anticipées, des heures supplémentaires et des métadonnées historiques de vérification. Le dépôt expose un seul endpoint Dashboard.

`DashboardController` délègue la construction de la réponse à `DashboardService`. Ce service interroge les modèles Prisma `Employee` et `Attendance`, consulte `CalendarService` pour les jours non ouvrés, puis retourne un objet `DashboardOverview` destiné au tableau de bord administrateur.

## 2. Vue d'ensemble

| Ressource | Description |
|---|---|
| Vue d'ensemble | Objet racine daté comprenant `summary`, `analytics` et `recentActivity` |
| Synthèse du jour | Effectifs actifs et indicateurs de présence pour la journée UTC |
| Analyses | Taux, compteurs journaliers ou mensuels et classements mensuels |
| Activité récente | Cinq présences les plus récemment modifiées ou créées |
| Calendrier | Source utilisée pour exclure les jours non ouvrés des employés attendus et des absences mensuelles |

## 3. Endpoints

| Méthode | Route | Description | Authentification |
|---|---|---|---|
| GET | `/api/v1/dashboard/overview` | Retourner la vue agrégée du Dashboard | Jeton Bearer, rôle `ADMIN` |

## 4. Description détaillée

### 4.1 GET `/api/v1/dashboard/overview`

| Élément | Valeur observée |
|---|---|
| Méthode | GET |
| URL | `/api/v1/dashboard/overview` |
| Query Parameters | Aucun |
| Path Parameters | Aucun |
| Body | Aucun |
| DTO | Aucun |
| Validation spécifique | Aucune; la route ne reçoit aucune donnée d'entrée |
| Traitement | `DashboardService.getOverview()` utilise la date courante du serveur comme date de référence |

La journée est normalisée en UTC et couvre l'intervalle allant du début du jour inclus au début du jour suivant exclu. Le mois couvre le premier jour UTC du mois courant inclus au premier jour du mois suivant exclu.

## 5. Données retournées

### 5.1 Racine `DashboardOverview`

| Champ | Signification | Origine |
|---|---|---|
| `generatedAt` | Instant ISO de génération de la réponse | `new Date()` à la fin du calcul |
| `date` | Début ISO de la journée UTC analysée | Date de référence normalisée |
| `summary` | Indicateurs de la journée | Agrégats Prisma, horaires et calendrier |
| `analytics` | Taux, compteurs et classements | Calculs du service sur le jour ou le mois courant |
| `recentActivity` | Cinq présences récentes | Requête Prisma triée par mise à jour puis création décroissantes |

### 5.2 Objet `summary`

| Champ | Signification et calcul observés |
|---|---|
| `totalEmployees` | Nombre de comptes Employee dont `isActive` vaut `true` |
| `presentToday` | Nombre de présences du jour ayant un `clockInAt` non nul, y compris le travail hors planning |
| `scheduledPresentToday` | Nombre d'employés attendus ayant une entrée et un statut différent de `ABSENT` |
| `nonWorkingDayWorkToday` | Nombre de présences du jour avec entrée et statut `NON_WORKING_DAY_WORK` |
| `lateEmployeesToday` | Nombre de présences du jour dont `minutesLate` est strictement positif |
| `absentEmployeesToday` | Nombre d'employés attendus sans présence, avec statut `ABSENT` ou sans heure d'entrée |
| `earlyExitToday` | Nombre de présences du jour dont `earlyExit` vaut `true` |
| `overtimeHoursToday` | Somme des `overtimeHours` strictement positives du jour, arrondie à deux décimales |
| `totalAttendanceRecordsToday` | Nombre total de lignes Attendance du jour, indépendamment de leur état |

Un employé est attendu lorsqu'il est actif, possède un horaire actif, est planifié pour le jour de la semaine UTC et que la date n'est pas non ouvrée selon `CalendarService`.

### 5.3 Taux de l'objet `analytics`

Les taux utilisent la formule `valeur / total × 100`, arrondie à un chiffre après la virgule. Lorsque le dénominateur est inférieur ou égal à zéro, le taux vaut zéro.

| Champ | Numérateur | Dénominateur |
|---|---|---|
| `attendanceRate` | `scheduledPresentToday` | Nombre d'employés attendus aujourd'hui |
| `latenessRate` | `lateEmployeesToday` | `scheduledPresentToday` |
| `absenceRate` | `absentEmployeesToday` | Nombre d'employés attendus aujourd'hui |

### 5.4 Compteurs mensuels de `analytics`

| Champ | Signification et origine |
|---|---|
| `absenceCountThisMonth` | Somme des jours planifiés écoulés sans entrée pour les employés actifs ayant un horaire actif, hors dates non ouvrées |
| `outsideScheduleWorkDays` | Nombre de présences du mois dont `outsideScheduleWork` vaut `true` |
| `outsideScheduleOvertimeHoursThisMonth` | Somme arrondie à deux décimales des heures supplémentaires de ces présences hors planning |
| `earlyExitCount` | Nombre de présences du mois dont `earlyExit` vaut `true` |
| `overtimeHoursThisMonth` | Somme arrondie à deux décimales des `overtimeHours` strictement positives du mois |

Le calcul d'absence mensuelle s'arrête au lendemain UTC de la date de référence ou à la fin du mois si elle intervient avant. Il compare chaque jour planifié aux jours réellement travaillés et aux dates non ouvrées du calendrier.

### 5.5 Compteurs journaliers de vérification

| Champ | Filtre ou calcul observé |
|---|---|
| `gpsValidatedCheckInCount` | Entrées du jour dont `checkInVerificationMethod` vaut `GPS` |
| `gpsValidatedCheckOutCount` | Sorties du jour dont `checkOutVerificationMethod` vaut `GPS` |
| `gpsValidatedAttendanceCount` | Somme des deux compteurs GPS précédents |
| `insideZoneCheckInCount` | Entrées du jour dont le motif vaut exactement `WITHIN_ALLOWED_RADIUS` |
| `insideZoneCheckOutCount` | Sorties du jour dont le motif vaut exactement `WITHIN_ALLOWED_RADIUS` |
| `insideZoneAttendanceCount` | Somme des deux compteurs de zone précédents |
| `legacySensitiveCheckInCount` | Entrées du jour dont le niveau vaut `WARNING` ou `STRICT` |
| `legacySensitiveCheckOutCount` | Sorties du jour dont le niveau vaut `WARNING` ou `STRICT` |
| `legacyHistoricalVerificationCount` | Somme des deux compteurs sensibles précédents |
| `legacyPhotoCheckInCount` | Entrées du jour dont la méthode vaut `PHOTO` |
| `legacyPhotoCheckOutCount` | Sorties du jour dont la méthode vaut `PHOTO` |
| `legacyHistoricalPhotoCount` | Somme des deux compteurs photo précédents |
| `suspiciousCheckInCount` | Même valeur que `legacySensitiveCheckInCount` |
| `suspiciousCheckOutCount` | Même valeur que `legacySensitiveCheckOutCount` |
| `photoVerificationCount` | Même valeur que `legacyPhotoCheckInCount` |
| `checkOutPhotoVerificationCount` | Même valeur que `legacyPhotoCheckOutCount` |

Les champs `blockedCheckInCount`, `blockedCheckOutCount`, `blockedAttendanceAttemptCount` et `outsideZoneRejectedAttemptCount` sont retournés à `null` par `getOverview()`. Le service ne calcule pas ces quatre valeurs à partir de Prisma.

### 5.6 Classements mensuels

Chaque classement est limité à cinq employés. Les objets partagent `employeeId`, `employeeIdentifier`, `employeeName` et `department`.

| Champ | Critère et champs spécifiques |
|---|---|
| `topLateEmployees` | Groupement des entrées du mois avec retard; tri par somme des minutes décroissante; retourne `lateCount`, `totalMinutesLate` et `averageMinutesLate` arrondi à la minute |
| `topOvertimeEmployees` | Groupement des présences du mois avec heures supplémentaires; tri par somme décroissante; retourne `overtimeHours` arrondi à deux décimales |
| `topEarlyExitEmployees` | Groupement des sorties anticipées du mois avec minutes positives; tri par somme décroissante; retourne `earlyExitCount` et `totalEarlyExitMinutes` |
| `topLegacySecurityEmployees` | Groupement des entrées du mois de niveau `WARNING` ou `STRICT`; tri par nombre sensible, nombre strict puis distance maximale décroissants |
| `topSuspiciousEmployees` | Même tableau que `topLegacySecurityEmployees` |

Chaque élément des deux classements de sécurité contient `legacySensitiveCount`, `legacyWarningCount`, `legacyStrictCount`, `legacyPhotoVerificationCount`, ainsi que leurs champs correspondants `suspiciousCount`, `warningCount`, `strictCount`, `photoVerificationCount` et `maxDistanceMeters`.

### 5.7 Tableau `recentActivity`

La requête n'est pas limitée à la journée ou au mois courant. Elle prend cinq présences, triées par `updatedAt` puis `createdAt` décroissants.

| Groupe | Champs retournés |
|---|---|
| Identité | `id`, `employeeId`, `employeeIdentifier`, `employeeName`, `department` |
| Présence | `status`, `date`, `clockInAt`, `clockOutAt`, `outsideScheduleWork`, `scheduledExitTime`, `earlyExit`, `earlyExitMinutes`, `overtimeHours`, `overtimeMinutes`, `absenceCount`, `minutesLate`, `notes` |
| Vérification d'entrée | `checkInDistanceMeters`, `checkInVerificationMethod`, `checkInVerificationLevel`, `checkInVerificationReason`, `checkInVerificationPhoto`, `checkInVerificationPhotoPublicId` |
| Vérification de sortie | `checkOutDistanceMeters`, `checkOutVerificationMethod`, `checkOutVerificationLevel`, `checkOutVerificationReason`, `checkOutVerificationPhoto`, `checkOutVerificationPhotoPublicId` |

Les valeurs Date sont converties en chaînes ISO; les dates ou heures absentes deviennent `null`. L'identifiant affiché utilise `employeeIdentifier`, puis `employeeCode`, puis la chaîne fixe `ID non defini` si les deux valeurs sont absentes ou vides.

## 6. Réponses

### 6.1 Réponse réussie

L'endpoint retourne un objet JSON conforme au type backend `DashboardOverview`. Les tests end-to-end vérifient la présence de `generatedAt`, `date`, `summary`, `analytics` et `recentActivity`, ainsi que les principaux champs numériques et tableaux.

### 6.2 Codes HTTP observés

| Situation | Code | Origine |
|---|---:|---|
| Vue d'ensemble retournée | 200 | Handler GET et test end-to-end |
| En-tête d'autorisation absent ou jeton non accepté | 401 | `JwtAuthGuard` et test end-to-end |
| Compte authentifié sans rôle `ADMIN` | 403 | `RolesGuard` et test end-to-end |
| Limite globale de requêtes atteinte | 429 | `AppThrottlerGuard` global |

## 7. Contrôle d'accès

`JwtAuthGuard` et `RolesGuard` sont enregistrés globalement par `AuthModule`. `DashboardController` porte le décorateur `@Roles(AccessRole.ADMIN)` au niveau de la classe et ne comporte aucun décorateur `@Public()`.

Le traitement d'accès est le suivant :

1. `JwtAuthGuard` exige un en-tête `Authorization` avec schéma Bearer.
2. `AuthService` valide le jeton et charge l'utilisateur actif.
3. `RolesGuard` compare `user.accessRole` au rôle `ADMIN` exigé.
4. Le contrôleur appelle `DashboardService.getOverview()` lorsque les deux gardes autorisent la requête.

## 8. Flux de traitement

```text
Client administrateur
        |
        v
JwtAuthGuard -> AuthService
        |
        v
RolesGuard (ADMIN)
        |
        v
DashboardController
        |
        v
DashboardService
   |              |
   v              v
PrismaService   CalendarService
   |              |
   +------v-------+
          |
          v
Employés + présences + dates non ouvrées
          |
          v
Synthèse + analyses + activité récente
          |
          v
Réponse JSON DashboardOverview
```

## 9. Traçabilité

| Élément documenté | Fichier ou répertoire source | Preuve observée |
|---|---|---|
| Route unique | `apps/backend/src/modules/dashboard/dashboard.controller.ts` | `GET overview` et rôle de classe `ADMIN` |
| Composition du module | `apps/backend/src/modules/dashboard/dashboard.module.ts` | Contrôleur, service et import Calendar |
| Structure de réponse | `apps/backend/src/modules/dashboard/dashboard.types.ts` | Types Summary, Analytics, classements, activité et Overview |
| Agrégats journaliers | `apps/backend/src/modules/dashboard/dashboard.service.ts` | Comptages et somme sur la plage du jour |
| Employés attendus | `apps/backend/src/modules/dashboard/dashboard.service.ts`, `apps/backend/src/common/utils/attendance-date.util.ts` | Compte actif, horaire actif, jour planifié et date UTC |
| Calendrier non ouvré | `apps/backend/src/modules/calendar/calendar.service.ts` | Jour courant et clés mensuelles non ouvrées |
| Taux | `apps/backend/src/modules/dashboard/dashboard.service.ts` | Fonction `toRate` et dénominateurs fournis |
| Absences mensuelles | `apps/backend/src/modules/dashboard/dashboard.service.ts` | Parcours des jours planifiés écoulés |
| Vérifications | `apps/backend/src/modules/dashboard/dashboard.service.ts` | Filtres Prisma par méthode, niveau et motif |
| Classements | `apps/backend/src/modules/dashboard/dashboard.service.ts` | Groupements Prisma, tris et limites |
| Activité récente | `apps/backend/src/modules/dashboard/dashboard.service.ts` | Sélection, limite 5 et conversion des dates |
| Modèles et énumérations | `apps/backend/prisma/schema.prisma` | Employee, Attendance, statuts et vérifications |
| Préfixe API | `apps/backend/src/main.ts` | Préfixe global `/api/v1` |
| Authentification | `apps/backend/src/modules/auth/guards/jwt-auth.guard.ts`, `apps/backend/src/modules/auth/auth.service.ts` | Bearer et utilisateur actif |
| Autorisation | `apps/backend/src/modules/auth/guards/roles.guard.ts`, `apps/backend/src/modules/auth/decorators/roles.decorator.ts` | Comparaison du rôle requis |
| Limitation globale | `apps/backend/src/app.module.ts`, `apps/backend/src/common/security/app-throttler.guard.ts` | Configuration et garde global |
| Contrat HTTP | `apps/backend/test/app.e2e-spec.ts` | Réponses 200, 401 et 403 et structure JSON |
| Contrat frontend | `apps/frontend/lib/api.ts` | Types Dashboard et appel `/dashboard/overview` |
| Documentation recoupée | `documentation/07-API-Reference/01-Presentation-de-lAPI.md`, `documentation/06-Developer-Guide/09-Modules-metier.md` | Module et flux recensés |

## 10. Observations

- Un seul endpoint Dashboard est exposé et il n'accepte aucun paramètre.
- L'accès est limité au rôle `ADMIN`.
- La réponse combine des données journalières, mensuelles et une activité récente sans filtre temporel.
- `presentToday` inclut les entrées hors planning, tandis que `scheduledPresentToday` est limité aux employés attendus.
- Le taux de présence utilise `scheduledPresentToday` et non `presentToday`.
- Les jours non ouvrés produisent zéro employé attendu et excluent les activités hors planning du taux de présence.
- Les quatre compteurs de tentatives bloquées ou rejetées sont toujours `null` dans l'implémentation de `getOverview()`.
- Les champs `topSuspiciousEmployees` et `topLegacySecurityEmployees` contiennent le même tableau.
- L'activité récente est limitée à cinq enregistrements, mais n'est pas limitée au jour courant.
