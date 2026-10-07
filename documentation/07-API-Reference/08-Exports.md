# API Reference — Exports

| Métadonnée | Valeur |
|---|---|
| Document ID | API-008 |
| Titre | Exports |
| Version | 1.0 |
| Statut | Validé |
| Classification | Interne |
| Référence | API Reference |
| Projet | Konatech Pointage |

## 1. Présentation

Les exports de Konatech Pointage produisent un rapport mensuel de présence au format CSV ou PDF. Le dépôt ne contient pas d'`ExportModule` ni d'`ExportController` distinct : l'unique endpoint d'export est déclaré dans `AttendanceController`, tandis que la préparation du rapport et la génération des fichiers sont confiées à des services spécialisés sous `apps/backend/src/modules/attendance/exports/`.

Le rapport s'appuie sur les employés actifs, leurs présences du mois demandé, leurs horaires actuels ou instantanés, le calendrier non ouvré, la politique de sécurité et les sanctions mensuelles calculées par `SanctionsService`.

## 2. Vue d'ensemble

| Ressource | Description |
|---|---|
| Rapport mensuel | Structure intermédiaire calculée par `MonthlyAttendanceExportService` |
| Export CSV | Tableau plat comprenant une ligne par employé actif sélectionné |
| Export PDF équipe | Synthèse mensuelle et tableau paginé de l'ensemble des employés actifs |
| Export PDF employé | Synthèse, analyses et journal quotidien d'un employé actif filtré |
| Filtre employé | Restriction facultative de la requête Prisma par UUID |

## 3. Endpoints

| Méthode | Route | Description | Authentification |
|---|---|---|---|
| GET | `/api/v1/attendance/exports/monthly` | Générer l'export mensuel CSV ou PDF | Jeton Bearer, rôle `ADMIN` |

## 4. Description détaillée

### 4.1 GET `/api/v1/attendance/exports/monthly`

| Élément | Valeur observée |
|---|---|
| Méthode | GET |
| URL | `/api/v1/attendance/exports/monthly` |
| Path Parameters | Aucun |
| Body | Aucun |
| DTO | `MonthlyAttendanceExportQueryDto` |

### 4.2 Query Parameters

| Paramètre | Présence | Validation observée | Effet |
|---|---|---|---|
| `month` | Obligatoire | Entier compris entre 1 et 12 | Définit le mois UTC du rapport |
| `year` | Obligatoire | Entier compris entre 2000 et 2100 | Définit l'année UTC du rapport |
| `format` | Facultatif | Valeur `csv` ou `pdf` | Sélectionne l'exporteur; l'absence sélectionne CSV |
| `employeeId` | Facultatif | UUID | Limite les employés actifs à cet identifiant |

La conversion des paramètres de requête en nombres repose sur le `ValidationPipe` global avec transformation implicite. Les propriétés non déclarées sont refusées par la configuration globale `forbidNonWhitelisted`.

### 4.3 Sélection des données

`MonthlyAttendanceExportService` sélectionne uniquement les employés dont `isActive` vaut `true`. Sans `employeeId`, ils sont triés par nom puis prénom croissants. Avec `employeeId`, le même filtre d'activité reste appliqué.

Pour chaque employé sélectionné, le service charge :

- l'identité, le département et l'horaire actuel ;
- les présences dont la date appartient au mois demandé, triées par date croissante ;
- les instantanés d'horaire et données de pointage nécessaires aux calculs ;
- les sanctions mensuelles correspondant au mois et au filtre employé ;
- les dates non ouvrées comprises dans la fenêtre de calcul des absences.

La génération est en lecture seule. Un test end-to-end compare les lignes Attendance avant et après construction du rapport et confirme leur absence de modification.

## 5. Contenu des exports

### 5.1 Format CSV

| Propriété | Valeur observée |
|---|---|
| Type MIME | `text/csv; charset=utf-8` |
| Encodage | Texte UTF-8 précédé d'un BOM |
| Séparateur de colonnes | Virgule |
| Séparateur de lignes | CRLF |
| Nom du fichier | `attendance-export-` suivi de l'année, du mois sur deux chiffres et de `.csv` |
| Échappement | Guillemets doublés; cellule entourée de guillemets lorsqu'elle contient guillemet, virgule ou saut de ligne |

Le CSV contient exactement les vingt colonnes suivantes, dans cet ordre :

| Position | En-tête produit | Champ du rapport |
|---:|---|---|
| 1 | `Full Name` | `fullName` |
| 2 | `Employee Identifier` | `employeeIdentifier` |
| 3 | `Department` | `department` |
| 4 | `Assigned Schedule` | `assignedSchedule` |
| 5 | `Working Days` | `workingDays` |
| 6 | `Scheduled Presence Days` | `presenceDays` |
| 7 | `Total Worked Days` | `totalWorkedDays` |
| 8 | `Outside Schedule Work Days` | `outsideScheduleWorkDays` |
| 9 | `Entries` | `entryCount` |
| 10 | `Exits` | `exitCount` |
| 11 | `Late Days` | `lateDays` |
| 12 | `Absent Days` | `absentDays` |
| 13 | `Absence Count` | `absenceCount` |
| 14 | `Incomplete Attendance Days` | `incompleteAttendanceDays` |
| 15 | `Total Worked Hours` | `totalWorkedHours` |
| 16 | `Depart anticipe (jours)` | `earlyExitDays` |
| 17 | `Depart anticipe (min)` | `earlyExitMinutes` |
| 18 | `Scheduled Overtime Hours` | `scheduledOvertimeHours` |
| 19 | `Outside Schedule Overtime Hours` | `outsideScheduleOvertimeHours` |
| 20 | `Heures supplementaires` | `overtimeHours` |

Le paramètre `employeeId` limite également le CSV à l'employé actif correspondant. Si aucun employé actif ne correspond, le fichier contient uniquement l'en-tête.

### 5.2 Construction des lignes mensuelles

| Élément | Calcul observé |
|---|---|
| Jours travaillés | Nombre de jours du planning dans la fenêtre d'absence, hors dates non ouvrées |
| Présences planifiées | Entrées qui ne sont ni hors planning ni de statut `NON_WORKING_DAY_WORK` |
| Total des jours travaillés | Nombre de présences ayant une heure d'entrée |
| Travail hors planning | Entrées marquées `outsideScheduleWork` ou `NON_WORKING_DAY_WORK` |
| Entrées et sorties | Comptage des heures `clockInAt` et `clockOutAt` non nulles |
| Retards | Présences dont `minutesLate` est strictement positif |
| Absences | Jours planifiés sans entrée, hors dates non ouvrées |
| Pointages incomplets | Présences avec entrée et sans sortie |
| Durée travaillée | Somme des différences positives entre sortie et entrée, formatée en heures et minutes |
| Sorties anticipées | Comptage et somme des `earlyExitMinutes` positifs lorsque `earlyExit` vaut `true` |
| Heures supplémentaires planifiées | Somme des `overtimeHours` positifs sans `outsideScheduleWork` |
| Heures supplémentaires hors planning | Somme des `overtimeHours` positifs avec `outsideScheduleWork` |

Pour le mois courant, la fenêtre d'absence s'arrête au début UTC de la date courante. Pour un mois passé, elle couvre le mois entier; pour un mois futur, elle est vide.

L'horaire affiché privilégie les instantanés présents dans les pointages. Plusieurs instantanés distincts produisent un libellé indiquant que le planning varie pendant le mois. En leur absence, l'horaire actif actuel est utilisé.

### 5.3 Format PDF équipe

| Propriété | Valeur observée |
|---|---|
| Type MIME | `application/pdf` |
| Portée | Tous les employés actifs lorsque `employeeId` est absent |
| Nom du fichier | `rapport-presence-equipe-`, mois français normalisé, année et `.pdf` |
| Structure Puppeteer | Page de synthèse équipe, puis une ou plusieurs pages de tableau |

Le tableau PDF équipe utilise exactement les dix en-têtes suivants : `Employé`, `Planning`, `Présence planifiée`, `Jour non ouvré`, `Absences`, `Retards`, `Pointages`, `Heures`, `H. supp. planifiées` et `H. supp. jour non ouvré`.

Les lignes affichent le nom, l'identifiant et le département, le planning, le rapport présence planifiée/jours travaillés, les jours hors planning, les absences, les retards, le couple entrées/sorties, la durée travaillée et les deux catégories d'heures supplémentaires.

### 5.4 Format PDF employé

Lorsque `employeeId` correspond à un employé actif, `employeeReport` est construit et le PDF utilise une portée individuelle. Son nom commence par `rapport-presence-`, suivi du nom complet normalisé, du mois français normalisé, de l'année et de `.pdf`.

Le rendu Puppeteer comprend :

- une synthèse RH mensuelle avec profil, planning, score, présence, absences, retards, heures travaillées, heures supplémentaires et sorties anticipées ;
- une page d'analyses avec répartitions des retards, sanctions et tolérances, vérification GPS, types de sorties et signaux mensuels ;
- une ou plusieurs pages de journal quotidien.

Le journal quotidien utilise exactement huit colonnes : `Date`, `Entrée`, `Sortie`, `Statut`, `Retard`, `Départs tôt`, `Heures supp.` et `Sanction`.

Chaque ligne quotidienne est construite avec les champs `date`, `dayLabel`, `clockInTime`, `clockOutTime`, `statusLabel`, `lateLabel`, `earlyExitLabel`, `workTypeLabel`, `overtimeLabel`, `gpsVerificationLabel` et `sanctionLabel`. Le rendu du tableau affiche huit de ces champs; `dayLabel` est affiché avec la date.

Si `employeeId` ne correspond à aucun employé actif, le service ne lève pas d'erreur : `rows` est vide et `employeeReport` vaut `null`. La branche PDF utilise alors la structure équipe avec un tableau vide.

### 5.5 Moteurs PDF configurés

`MonthlyAttendancePdfExporterService` produit toujours un fichier PDF, mais choisit son moteur selon la configuration active :

| Configuration | Comportement observé |
|---|---|
| `ATTENDANCE_PDF_RENDERER=legacy` | Générateur PDF interne de bas niveau |
| Toute autre valeur | Rendu HTML avec Puppeteer, mode nommé `premium` dans le service |
| `ATTENDANCE_PDF_ALLOW_LEGACY_FALLBACK=true` | Repli vers le générateur interne si Puppeteer échoue |
| Repli désactivé et Puppeteer indisponible | Exception HTTP interne avec le message défini par le service |

Puppeteer utilise `ATTENDANCE_PDF_EXECUTABLE_PATH` lorsqu'elle est renseignée et lance le navigateur en mode headless avec les arguments configurés dans le renderer.

## 6. Réponses

### 6.1 En-têtes et corps

| Élément | CSV | PDF |
|---|---|---|
| `Content-Type` | `text/csv; charset=utf-8` | `application/pdf` |
| `Content-Disposition` | Pièce jointe avec nom CSV | Pièce jointe avec nom PDF |
| `Cache-Control` | `no-store` | `no-store` |
| Corps | Chaîne CSV | `StreamableFile` construit depuis un `Buffer` |

Après génération, le contrôleur journalise l'action `attendance.monthly_export` avec le mois, l'année, le format effectif, l'identifiant employé éventuel et le nom du fichier.

### 6.2 Codes HTTP observés

| Situation | Code | Origine |
|---|---:|---|
| Fichier CSV ou PDF retourné | 200 | Handler GET et tests end-to-end |
| Query Parameters invalides | 400 | `ValidationPipe` et `MonthlyAttendanceExportQueryDto` |
| Authentification absente ou invalide | 401 | `JwtAuthGuard` |
| Compte authentifié sans rôle `ADMIN` | 403 | `RolesGuard` et test end-to-end |
| Limite globale de requêtes atteinte | 429 | `AppThrottlerGuard` |
| Renderer Puppeteer indisponible sans repli autorisé | 500 | `MonthlyAttendancePdfExporterService` |

## 7. Contrôle d'accès

L'endpoint porte `@Roles(AccessRole.ADMIN)`. `JwtAuthGuard` et `RolesGuard` sont enregistrés globalement; la route n'est pas marquée `@Public()`.

1. `JwtAuthGuard` exige un en-tête `Authorization` avec schéma Bearer et valide le jeton.
2. `RolesGuard` exige que `user.accessRole` vaille `ADMIN`.
3. `@CurrentUser()` fournit l'acteur à la journalisation de l'export.

Le rôle `EMPLOYEE` est explicitement refusé par un test end-to-end sur cette route.

## 8. Flux de traitement

```text
Client administrateur
        |
        v
JwtAuthGuard -> RolesGuard (ADMIN)
        |
        v
ValidationPipe -> MonthlyAttendanceExportQueryDto
        |
        v
AttendanceController
        |
        v
MonthlyAttendanceExportService
   |          |          |          |
   v          v          v          v
Prisma   Calendar   Sanctions   Politique sécurité
        |
        v
Rapport mensuel intermédiaire
        |
        +--> format absent ou csv -> générateur CSV
        |
        +--> format pdf -> générateur PDF -> Puppeteer ou moteur interne
        |
        v
En-têtes de téléchargement -> audit -> réponse HTTP
```

## 9. Traçabilité

| Élément documenté | Fichier ou répertoire source | Preuve observée |
|---|---|---|
| Endpoint unique | `apps/backend/src/modules/attendance/attendance.controller.ts` | Route, format, en-têtes, audit et réponse |
| Paramètres | `apps/backend/src/modules/attendance/dto/monthly-attendance-export-query.dto.ts` | Mois, année, format et UUID |
| Construction du rapport | `apps/backend/src/modules/attendance/exports/monthly-attendance-export.service.ts` | Sélection, filtres et calcul des lignes |
| Contrats internes | `apps/backend/src/modules/attendance/exports/monthly-attendance-export.types.ts` | Rapport, ligne CSV, détail employé et fichier |
| CSV | `apps/backend/src/modules/attendance/exports/monthly-attendance-csv-exporter.service.ts` | Vingt colonnes, encodage, échappement et nom |
| Orchestration PDF | `apps/backend/src/modules/attendance/exports/monthly-attendance-pdf-exporter.service.ts` | Moteurs, repli, nom, MIME et Buffer |
| Rendu PDF Puppeteer | `apps/backend/src/modules/attendance/exports/monthly-attendance-puppeteer-pdf-renderer.service.ts` | Pages équipe et employé, tableaux et navigateur |
| Horaires instantanés | `apps/backend/src/common/utils/attendance-schedule-snapshot.util.ts` | Priorité à l'instantané et repli courant |
| Dates et calendrier | `apps/backend/src/common/utils/attendance-date.util.ts`, `apps/backend/src/modules/calendar/calendar.service.ts` | Plage mensuelle et jours non ouvrés |
| Sanctions | `apps/backend/src/modules/sanctions/sanctions.service.ts` | Résultats mensuels intégrés au rapport détaillé |
| Sécurité | `apps/backend/src/modules/attendance/attendance-security-policy.service.ts` | Rayon utilisé pour les compteurs de zone |
| Modèles de données | `apps/backend/prisma/schema.prisma` | Employee, Attendance, Schedule et champs de vérification |
| Validation globale | `apps/backend/src/main.ts` | Transformation et refus des champs non déclarés |
| Accès | `apps/backend/src/modules/auth/guards/jwt-auth.guard.ts`, `apps/backend/src/modules/auth/guards/roles.guard.ts` | Bearer et rôle `ADMIN` |
| Limitation | `apps/backend/src/app.module.ts`, `apps/backend/src/common/security/app-throttler.guard.ts` | Garde global et configuration |
| Tests HTTP et lecture seule | `apps/backend/test/app.e2e-spec.ts` | 400, 403, CSV, PDF équipe, PDF employé et non-mutation |
| Tests du renderer | `apps/backend/test/monthly-attendance-puppeteer-renderer.e2e-spec.ts` | Pages, tableaux, pagination et échec sans repli |
| Cas calendrier | `apps/backend/test/attendance-calendar-absence.e2e-spec.ts`, `apps/backend/test/non-working-day-attendance.e2e-spec.ts` | Absences et travail non ouvré dans les rapports |
| Documentation recoupée | `documentation/07-API-Reference/01-Presentation-de-lAPI.md`, `documentation/07-API-Reference/06-Pointage.md` | Route et contexte Attendance |

## 10. Observations

- Le dépôt expose un seul endpoint d'export sous le contrôleur Attendance.
- Les seuls formats acceptés sont `csv` et `pdf`; CSV est utilisé lorsque `format` est absent.
- Les exports sélectionnent uniquement les employés actifs.
- Le filtre `employeeId` ne produit pas de réponse 404 lorsqu'aucun employé actif ne correspond.
- Le CSV conserve toujours sa structure plate de vingt colonnes, avec ou sans filtre employé.
- Le PDF change de structure selon que `employeeReport` contient un détail employé ou vaut `null`.
- Les exports lisent les présences existantes sans les recalculer ni les modifier.
- Les données de planning instantanées priment sur le planning courant pour les présences qui en disposent.
- Les tentatives hors zone ne sont pas historisées dans le rapport; le champ interne correspondant du détail employé vaut `null`.
