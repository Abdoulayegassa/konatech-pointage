# Module Rapports

| Métadonnée | Valeur |
|---|---|
| Document ID | SAR-RPT-001 |
| Titre | Module Rapports |
| Version | 1.0 |
| Statut | Validé |
| Classification | Interne |
| Référence SAPDD | Module Rapports |
| Date de génération | 29 juillet 2026 |

## 1. Présentation du module

### 1.1 Objectif

Le périmètre Rapports fournit des exports mensuels de présence destinés aux administrateurs. Il consolide les employés actifs, leurs pointages, les plannings applicables, les jours non ouvrés, les sanctions et les métadonnées de vérification dans un rapport d'équipe ou dans un rapport individuel.

L'implémentation n'est pas portée par un module NestJS nommé `ReportsModule`. Elle est intégrée au module `AttendanceModule`, sous le dossier `apps/backend/src/modules/attendance/exports/`. Le frontend l'expose dans la page `/exports`.

Implémentation principale :

- `apps/backend/src/modules/attendance/attendance.module.ts`
- `apps/backend/src/modules/attendance/attendance.controller.ts`
- `apps/backend/src/modules/attendance/exports/monthly-attendance-export.service.ts`
- `apps/frontend/app/exports/page.tsx`

### 1.2 Responsabilités

Les responsabilités constatées sont :

- sélectionner une période mensuelle ;
- limiter facultativement le rapport à un employé ;
- charger les employés actifs et leurs pointages du mois ;
- calculer les présences, absences, retards, sorties anticipées et heures supplémentaires ;
- distinguer le travail planifié du travail hors planning ;
- intégrer les jours non ouvrés au calcul des absences ;
- intégrer les sanctions mensuelles ;
- produire une représentation métier commune ;
- sérialiser cette représentation en CSV ou en PDF ;
- transmettre le fichier avec des en-têtes de téléchargement ;
- journaliser l'action administrative d'export.

### 1.3 Périmètre fonctionnel

| Fonction | État constaté |
|---|---|
| Rapport mensuel d'équipe | Implémenté |
| Rapport mensuel individuel | Implémenté |
| Export PDF | Implémenté dans l'API et dans l'interface |
| Export CSV | Implémenté dans l'API ; aucune commande CSV n'est affichée dans l'interface `/exports` |
| Rapport journalier autonome | Non trouvé dans le code |
| Rapport par département comme périmètre de filtre | Non trouvé dans le code |
| Rapport de retard autonome | Non trouvé dans le code |
| Export Excel natif | Non trouvé dans le code |
| Fonction d'impression dédiée | Non trouvée dans le code |
| Persistance des fichiers générés | Non trouvée dans le code |

Fichiers concernés :

- `apps/backend/src/modules/attendance/dto/monthly-attendance-export-query.dto.ts`
- `apps/backend/src/modules/attendance/exports/monthly-attendance-export.types.ts`
- `apps/frontend/components/dashboard/monthly-attendance-export-card.tsx`

## 2. Position dans l'architecture

### 2.1 Vue d'ensemble

Le périmètre Rapports est une capacité de lecture et de transformation. Il ne crée ni pointage, ni employé, ni planning, ni entrée de calendrier. Il lit les données persistées par ces domaines et obtient les sanctions calculées par `SanctionsService`.

```text
                         +------------------+
                         |       Auth       |
                         | JWT + rôle ADMIN |
                         +---------+--------+
                                   |
                                   v
+------------+             +-------+--------+             +-------------+
| Frontend   |  GET fichier| Attendance     | Prisma      | PostgreSQL  |
| /exports   +------------>+ Controller      +------------>+             |
+------------+             +-------+--------+             +-------------+
                                   |
                                   v
                         +---------+----------+
                         | MonthlyAttendance  |
                         | ExportService      |
                         +--+----+----+----+--+
                            |    |    |    |
              +-------------+    |    |    +-------------+
              v                  v    v                  v
         Employee /          Planning Calendar       Sanctions
         Attendance          snapshots Service       Service
                                   |
                                   v
                         +---------+----------+
                         | CSV ou PDF         |
                         | Exporter           |
                         +--------------------+
```

### 2.2 Interaction avec Auth

Le contrôleur protège l'endpoint par `@Roles(AccessRole.ADMIN)`. Les guards globaux interprètent le JWT et le rôle. La page serveur appelle `requireCurrentUser()`, redirige les utilisateurs non administrateurs vers `/my-attendance` et exige un token de session. La route frontend transmet le bearer token du cookie au backend.

Fichiers concernés :

- `apps/backend/src/modules/attendance/attendance.controller.ts`
- `apps/backend/src/modules/auth/guards/jwt-auth.guard.ts`
- `apps/backend/src/modules/auth/guards/roles.guard.ts`
- `apps/frontend/app/exports/page.tsx`
- `apps/frontend/app/api/attendance/exports/monthly/route.ts`
- `apps/frontend/lib/api-route.ts`

### 2.3 Interaction avec Employee

`MonthlyAttendanceExportService` sélectionne les employés actifs. Un `employeeId` facultatif limite la requête à un identifiant UUID. Les données utilisées sont l'identifiant salarié, l'ancien code salarié de repli, le nom, le département, le planning courant et les pointages.

La liste du sélecteur frontend provient de `GET /api/employees`.

### 2.4 Interaction avec Attendance

Les lignes `Attendance` constituent la source transactionnelle principale. Le rapport utilise les heures d'entrée et de sortie, le statut, les minutes de retard, la sortie anticipée, les heures supplémentaires, le marqueur de travail hors planning, les snapshots de planning et les informations de vérification.

### 2.5 Interaction avec Planning

Le planning courant de l'employé et les snapshots portés par chaque pointage déterminent les jours programmés et l'intitulé du planning applicable. `resolveAttendanceSchedule()` privilégie les données historiques disponibles sur le pointage pour restituer le contexte du mois.

### 2.6 Interaction avec Calendar

`CalendarService.getNonWorkingDateKeys()` fournit les dates non ouvrées de la période de calcul. Ces dates sont exclues du nombre de jours ouvrés attendus et du calcul des absences.

### 2.7 Interaction avec Dashboard

Le dashboard contient une action rapide vers `/exports`. Le composant d'export réside techniquement dans `components/dashboard`, mais il est rendu par la page `/exports`, pas par la page d'accueil.

Fichiers concernés :

- `apps/frontend/components/dashboard/quick-actions-section.tsx`
- `apps/frontend/components/dashboard/monthly-attendance-export-card.tsx`
- `apps/frontend/app/exports/page.tsx`

## 3. Architecture générale

### 3.1 Frontend

La page `/exports` est un composant serveur dynamique. Elle contrôle le rôle et compose :

- la navigation administrateur ;
- une présentation du rapport disponible ;
- `MonthlyAttendanceExportCard`, composant client chargé des filtres et du téléchargement.

Le composant client charge la liste des employés, valide le mois et l'année, déclenche l'endpoint proxy, transforme la réponse en `Blob`, extrait le nom de fichier de `Content-Disposition` et lance le téléchargement par un élément `<a>`.

### 3.2 Backend

Le backend expose l'export sur `AttendanceController`. Quatre services séparent :

- l'assemblage métier du rapport ;
- la sérialisation CSV ;
- la coordination PDF ;
- le rendu PDF HTML/Chromium.

### 3.3 API

Le flux traverse deux routes :

| Couche | Route | Rôle |
|---|---|---|
| Next.js | `GET /api/attendance/exports/monthly` | Proxy authentifié du fichier |
| NestJS | `GET /api/v1/attendance/exports/monthly` | Validation, génération, audit et réponse |

Le préfixe backend `/api/v1` est appliqué par la configuration globale de l'application.

### 3.4 Services

`MonthlyAttendanceExportService` produit un `MonthlyAttendanceExportReport`. Le contrôleur choisit ensuite le sérialiseur selon `format` : PDF si la valeur est `pdf`, CSV dans les autres cas autorisés, y compris lorsque le format est omis.

### 3.5 Persistance

Le rapport lit PostgreSQL via Prisma. Aucun modèle `Report`, aucune table de fichiers et aucune écriture de rapport ne sont présents. Le fichier est généré en mémoire et renvoyé immédiatement.

### 3.6 Sources de données

| Source | Données consommées |
|---|---|
| `Employee` | identité, département, état actif, planning |
| `Attendance` | horaires, statut, retards, sorties, heures, snapshots, vérification |
| `Schedule` | horaires et jours ouvrés courants |
| `CalendarEntry` via `CalendarService` | dates non ouvrées |
| `SanctionsService` | résultats de sanction du mois |
| `AttendanceSecurityPolicyService` | rayon GPS autorisé |
| `AppClockService` | instant de génération et borne des absences |

```text
[Page /exports]
       |
       v
[MonthlyAttendanceExportCard]
       |
       v
[Route Handler Next.js] -- cookie/JWT --> [AttendanceController]
                                               |
                                               v
                                  [MonthlyAttendanceExportService]
                                      |       |       |
                                      v       v       v
                                   Prisma  Calendar Sanctions
                                      |
                                      v
                                  PostgreSQL
                                               |
                         +---------------------+--------------------+
                         v                                          v
                   [CSV Exporter]                         [PDF Coordinator]
                                                                |
                                                  +-------------+-------------+
                                                  v                           v
                                           [Puppeteer]                [Legacy renderer]
```

Fichiers concernés :

- `apps/frontend/app/exports/page.tsx`
- `apps/frontend/components/dashboard/monthly-attendance-export-card.tsx`
- `apps/frontend/app/api/attendance/exports/monthly/route.ts`
- `apps/backend/src/modules/attendance/exports/`

## 4. Organisation des fichiers

### 4.1 Arborescence

```text
apps/
├── backend/
│   ├── prisma/
│   │   └── schema.prisma
│   ├── src/
│   │   ├── common/
│   │   │   ├── audit/
│   │   │   │   └── audit-log.service.ts
│   │   │   ├── prisma/
│   │   │   │   ├── prisma.service.ts
│   │   │   │   └── selects.ts
│   │   │   ├── time/
│   │   │   │   └── app-clock.service.ts
│   │   │   └── utils/
│   │   │       ├── attendance-date.util.ts
│   │   │       └── attendance-schedule-snapshot.util.ts
│   │   └── modules/
│   │       ├── attendance/
│   │       │   ├── dto/
│   │       │   │   └── monthly-attendance-export-query.dto.ts
│   │       │   ├── exports/
│   │       │   │   ├── monthly-attendance-csv-exporter.service.ts
│   │       │   │   ├── monthly-attendance-export.service.ts
│   │       │   │   ├── monthly-attendance-export.types.ts
│   │       │   │   ├── monthly-attendance-pdf-exporter.service.ts
│   │       │   │   └── monthly-attendance-puppeteer-pdf-renderer.service.ts
│   │       │   ├── attendance-security-policy.service.ts
│   │       │   ├── attendance.controller.ts
│   │       │   └── attendance.module.ts
│   │       ├── calendar/
│   │       │   └── calendar.service.ts
│   │       └── sanctions/
│   │           ├── sanction-engine.types.ts
│   │           └── sanctions.service.ts
│   └── test/
│       ├── app.e2e-spec.ts
│       ├── attendance-calendar-absence.e2e-spec.ts
│       ├── monthly-attendance-puppeteer-renderer.e2e-spec.ts
│       └── non-working-day-attendance.e2e-spec.ts
└── frontend/
    ├── app/
    │   ├── api/attendance/exports/monthly/route.ts
    │   └── exports/page.tsx
    ├── components/
    │   └── dashboard/
    │       ├── monthly-attendance-export-card.tsx
    │       └── quick-actions-section.tsx
    ├── lib/
    │   ├── api-route.ts
    │   ├── auth.ts
    │   └── client-error.ts
    └── middleware.ts
```

### 4.2 Rôle des fichiers

| Fichier | Responsabilité |
|---|---|
| `monthly-attendance-export-query.dto.ts` | Contrat et validation des filtres |
| `monthly-attendance-export.types.ts` | Types du rapport commun, individuel, quotidien et des fichiers |
| `monthly-attendance-export.service.ts` | Chargement et calcul métier central |
| `monthly-attendance-csv-exporter.service.ts` | Sérialisation tabulaire CSV |
| `monthly-attendance-pdf-exporter.service.ts` | Sélection du moteur PDF et rendu historique intégré |
| `monthly-attendance-puppeteer-pdf-renderer.service.ts` | Production PDF premium via HTML et Puppeteer |
| `attendance.controller.ts` | Endpoint, choix de format, en-têtes et audit |
| `attendance.module.ts` | Enregistrement des providers et dépendances |
| `app/exports/page.tsx` | Écran administrateur |
| `monthly-attendance-export-card.tsx` | Formulaire et téléchargement navigateur |
| route Next.js | Proxy du flux binaire |

## 5. Modèle métier

### 5.1 Rapport mensuel commun

`MonthlyAttendanceExportReport` est l'objet racine. Il contient le mois, l'année, l'instant de génération, trois libellés relatifs au modèle de vérification, les lignes consolidées et, lorsque `employeeId` est fourni, un rapport individuel détaillé.

### 5.2 Ligne consolidée par employé

Une `MonthlyAttendanceExportRow` contient :

- identité, département et planning affecté ;
- jours ouvrés, jours de présence planifiée et jours travaillés totaux ;
- jours travaillés hors planning ;
- nombres d'entrées et de sorties ;
- retards et absences ;
- pointages incomplets ;
- durée travaillée ;
- sorties anticipées ;
- heures supplémentaires planifiées, hors planning et totales.

### 5.3 Rapport individuel

`MonthlyAttendanceEmployeeReport` ajoute :

- taux de présence ;
- score de performance ;
- ventilations des retards ;
- ventilation des sorties ;
- ventilation GPS ;
- synthèse des sanctions ;
- journal quotidien.

### 5.4 Journal quotidien

Chaque `MonthlyAttendanceDailyReportRow` expose la date, le jour, les heures d'entrée et de sortie, le statut, le retard, la sortie anticipée, le type de travail, les heures supplémentaires, la vérification GPS et la sanction.

### 5.5 Agrégations

| Indicateur | Règle observée |
|---|---|
| Jour travaillé | Pointage possédant une heure d'entrée |
| Présence planifiée | Entrée sur un pointage non marqué hors planning |
| Pointage incomplet | Entrée présente et sortie absente |
| Retard | `minutesLate > 0` |
| Sortie anticipée | `earlyExit` vrai et `earlyExitMinutes > 0` |
| Durée travaillée | Somme des différences positives sortie moins entrée |
| Absence | Jour planifié, non exclu par le calendrier, sans entrée |
| Score | Taux de présence moins pénalités d'absence et de retard, borné de 0 à 100 |

La formule du score est :

```text
absencePenalty = (absenceCount / workingDays) * 35
latePenalty    = (lateCount / workingDays) * 15
rawScore       = presenceRate - absencePenalty - latePenalty
score          = arrondi(borne(rawScore, 0, 100))
```

Fichiers concernés :

- `apps/backend/src/modules/attendance/exports/monthly-attendance-export.types.ts`
- `apps/backend/src/modules/attendance/exports/monthly-attendance-export.service.ts`

## 6. Contrôleurs

### 6.1 Contrôleur concerné

Il n'existe pas de `ReportsController`. L'endpoint appartient à `AttendanceController`.

| Contrôleur | Méthode | Endpoint | Accès | Entrée | Sortie |
|---|---|---|---|---|---|
| `AttendanceController` | GET | `/api/v1/attendance/exports/monthly` | `ADMIN` | `MonthlyAttendanceExportQueryDto` | CSV texte ou PDF binaire |

### 6.2 Validation

| Champ | Contraintes |
|---|---|
| `month` | entier, minimum 1, maximum 12, obligatoire |
| `year` | entier, minimum 2000, maximum 2100, obligatoire |
| `format` | facultatif, `csv` ou `pdf` |
| `employeeId` | facultatif, UUID |

La transformation et la validation globales des DTO sont configurées au démarrage NestJS. Sans `format`, le contrôleur produit un CSV.

### 6.3 Réponse HTTP

Le contrôleur définit :

- `Content-Type` selon le sérialiseur ;
- `Content-Disposition: attachment` avec le nom de fichier ;
- `Cache-Control: no-store`.

Un contenu `Buffer` est enveloppé dans `StreamableFile`. Le CSV est retourné comme chaîne.

### 6.4 Audit

Après génération, le contrôleur appelle `AuditLogService.logAdminAction()` avec :

- l'acteur ;
- l'action `attendance.monthly_export` ;
- la ressource `attendance_export` ;
- le mois, l'année, le format, l'employé facultatif et le nom du fichier.

Fichiers concernés :

- `apps/backend/src/modules/attendance/attendance.controller.ts`
- `apps/backend/src/modules/attendance/dto/monthly-attendance-export-query.dto.ts`
- `apps/backend/src/common/audit/audit-log.service.ts`

## 7. Services

### 7.1 Tableau des services

| Service | Méthode publique | Responsabilité |
|---|---|---|
| `MonthlyAttendanceExportService` | `buildMonthlyReport()` | Construire la représentation métier |
| `MonthlyAttendanceCsvExporterService` | `export()` | Générer le CSV |
| `MonthlyAttendancePdfExporterService` | `export()` | Coordonner le moteur PDF |
| `MonthlyAttendancePuppeteerPdfRendererService` | `render()` | Produire le PDF premium |

### 7.2 MonthlyAttendanceExportService

Le service :

1. détermine les bornes UTC du mois ;
2. borne le calcul des absences aux jours terminés lorsque le mois est courant ;
3. charge les employés actifs et leurs pointages ;
4. charge les sanctions mensuelles ;
5. charge la politique de sécurité et les jours non ouvrés ;
6. agrège chaque employé ;
7. retourne les lignes d'équipe et éventuellement le détail individuel.

Ses dépendances injectées sont `PrismaService`, `AttendanceSecurityPolicyService`, `SanctionsService`, `CalendarService` et `AppClockService`.

### 7.3 MonthlyAttendanceCsvExporterService

Le sérialiseur CSV produit une ligne par employé. Il échappe les guillemets, virgules et retours à la ligne, préfixe le contenu par un BOM UTF-8 et sépare les lignes par CRLF.

### 7.4 MonthlyAttendancePdfExporterService

Ce service utilise Puppeteer par défaut. `ATTENDANCE_PDF_RENDERER=legacy` sélectionne directement le générateur PDF historique intégré. En mode Puppeteer, un échec ne déclenche le moteur historique que si `ATTENDANCE_PDF_ALLOW_LEGACY_FALLBACK=true`. Sinon, une `InternalServerErrorException` est émise.

### 7.5 MonthlyAttendancePuppeteerPdfRendererService

Le service construit un document HTML complet, ouvre Chromium en mode headless, attend le chargement et les polices, puis génère un PDF A4 avec arrière-plans. Le délai interne est de 60 secondes.

Le chemin de Chromium peut provenir de `ATTENDANCE_PDF_EXECUTABLE_PATH`. Les arguments de lancement constatés incluent `--no-sandbox`, `--disable-setuid-sandbox` et `--disable-dev-shm-usage`.

```text
AttendanceController
        |
        v
MonthlyAttendanceExportService
  | Prisma
  | CalendarService
  | SanctionsService
  | SecurityPolicy
  + AppClock
        |
        v
MonthlyAttendanceExportReport
        |
        +-------------------+
        |                   |
        v                   v
CSV Exporter        PDF Exporter Coordinator
                            |
                +-----------+-----------+
                |                       |
                v                       v
         Puppeteer Renderer      Legacy PDF builder
```

## 8. Génération des rapports

### 8.1 Rapport mensuel d'équipe

Lorsque `employeeId` est absent, le service sélectionne tous les employés actifs, ordonnés par nom puis prénom. `rows` contient une ligne consolidée par employé et `employeeReport` vaut `null`.

Le PDF d'équipe contient une page de synthèse puis des pages de tableau. Le moteur Puppeteer place 14 lignes d'employés par page de tableau.

### 8.2 Rapport mensuel individuel

Lorsque `employeeId` est présent, la requête Prisma est limitée à cet employé actif. Le rapport racine conserve la ligne consolidée et renseigne `employeeReport` avec le détail.

Le PDF individuel contient deux pages de synthèse/analyse, auxquelles s'ajoutent les pages du journal quotidien. Le moteur Puppeteer place 21 lignes quotidiennes par page.

Si aucun employé actif ne correspond à l'UUID, `rows` est vide et `employeeReport` vaut `null`; aucun contrôle d'existence distinct n'est exécuté dans le service.

### 8.3 Statistiques présentes

Les statistiques effectivement calculées couvrent :

- présence planifiée et travail total ;
- absences ;
- entrées, sorties et journées incomplètes ;
- retards et ventilations par seuil ;
- sorties normales et anticipées ;
- heures supplémentaires ;
- travail hors planning ;
- GPS ;
- sanctions ;
- score individuel.

### 8.4 Rapports non trouvés

Les implémentations autonomes suivantes ne sont pas trouvées dans le code :

- rapport journalier transversal ;
- rapport dédié par département ;
- rapport dédié aux présences ;
- rapport dédié aux retards ;
- planificateur de rapports ;
- envoi de rapports par courriel.

## 9. Filtres et recherches

### 9.1 Filtres exposés

| Filtre | Frontend | Backend |
|---|---|---|
| Mois | Liste de 1 à 12 | Entier 1 à 12 |
| Année | Champ numérique | Entier 2000 à 2100 |
| Périmètre | Toute l'équipe ou un employé | UUID facultatif |
| Format | Valeur fixe `pdf` | `csv` ou `pdf`, CSV par défaut |

### 9.2 Recherche

Aucun champ de recherche textuelle n'est présent. Le sélecteur affiche tous les employés renvoyés par `/api/employees`.

### 9.3 Tri

Les employés sont triés en base par `lastName` ascendant puis `firstName` ascendant. Les pointages inclus sont triés par date ascendante. Aucun tri paramétrable n'est exposé.

### 9.4 Pagination

Aucune pagination de données n'est appliquée à la requête des employés ou aux pointages. La pagination PDF est une mise en pages après agrégation : 14 employés ou 21 jours par page selon le type de rapport.

Fichiers concernés :

- `apps/frontend/components/dashboard/monthly-attendance-export-card.tsx`
- `apps/backend/src/modules/attendance/dto/monthly-attendance-export-query.dto.ts`
- `apps/backend/src/modules/attendance/exports/monthly-attendance-export.service.ts`
- `apps/backend/src/modules/attendance/exports/monthly-attendance-puppeteer-pdf-renderer.service.ts`

## 10. Export

### 10.1 PDF

Le PDF est disponible pour l'équipe et pour un employé. Le nom est construit à partir du périmètre, du mois et de l'année. Le contenu est produit en mémoire comme `Buffer`.

Le moteur principal est Puppeteer. Le générateur historique bas niveau reste exécutable par configuration ou comme repli explicitement autorisé.

### 10.2 CSV

L'API génère un CSV mensuel d'équipe ou filtré par employé. Le nom suit `attendance-export-AAAA-MM.csv` et le MIME est `text/csv; charset=utf-8`.

Le frontend `/exports` ne propose pas de choix de format et envoie toujours `format=pdf`. L'export CSV demeure accessible par l'endpoint backend à un administrateur authentifié.

### 10.3 Téléchargement navigateur

Le frontend :

1. reçoit la réponse comme `Blob` ;
2. lit le nom dans `Content-Disposition` ;
3. calcule un nom de repli si l'en-tête est absent ;
4. crée une URL d'objet ;
5. déclenche un lien de téléchargement ;
6. retire le lien et révoque l'URL.

### 10.4 Formats absents

| Format | Constat |
|---|---|
| XLS/XLSX | Non trouvé dans le code |
| Impression dédiée | Non trouvée dans le code |
| JSON de rapport public | Non trouvé comme format d'export |

## 11. Sources des données

### 11.1 Lecture Prisma

Une requête `employee.findMany()` charge les employés actifs, le planning et les pointages compris dans `[début du mois, début du mois suivant)`. Les projections Prisma limitent les colonnes aux valeurs nécessaires.

### 11.2 Calendrier

La borne d'absence vaut :

- le début du mois si le mois demandé est futur ;
- la fin du mois si le mois est terminé ;
- le début du jour UTC courant pour un mois en cours.

Les dates non ouvrées renvoyées par `CalendarService` sont exclues des jours attendus.

### 11.3 Planning

Pour chaque date, le service résout le planning à partir du snapshot du pointage et du planning courant. Une journée ne devient attendue que si elle appartient aux jours ouvrés du planning résolu.

### 11.4 Sanctions

`SanctionsService.getMonthlySanctions()` retourne les sanctions du mois et du périmètre employé facultatif. Elles sont indexées par `attendanceId`, puis agrégées entre sanctions mineures, majeures, tolérées et appliquées.

### 11.5 Transformations

```text
Employee + Schedule + Attendance
                 |
                 v
      Résolution des snapshots
                 |
Calendar --------+-------- Sanctions
                 |
                 v
    Calcul par employé et par jour
                 |
                 v
 MonthlyAttendanceExportReport
         |                 |
         v                 v
       CSV                PDF
```

Implémentation principale :

- `apps/backend/src/modules/attendance/exports/monthly-attendance-export.service.ts`
- `apps/backend/src/common/utils/attendance-date.util.ts`
- `apps/backend/src/common/utils/attendance-schedule-snapshot.util.ts`
- `apps/backend/src/modules/calendar/calendar.service.ts`
- `apps/backend/src/modules/sanctions/sanctions.service.ts`

## 12. Interactions avec les autres modules

### 12.1 Séquence complète

```text
Administrateur  Page /exports  Proxy Next.js  AttendanceController  ExportService  Prisma  Calendar  Sanctions  Renderer
      |               |              |                |                  |          |       |         |         |
      |-- ouvre ----->|              |                |                  |          |       |         |         |
      |               |-- employés ------------------------------------>|          |       |         |         |
      |<-- formulaire-|              |                |                  |          |       |         |         |
      |-- soumet ---->|-- GET ------>|-- Bearer ----->|                  |          |       |         |         |
      |               |              |                |-- build -------->|          |       |         |         |
      |               |              |                |                  |-- read -->|       |         |         |
      |               |              |                |                  |-- dates ---------->|         |         |
      |               |              |                |                  |-- sanctions ----------------->|         |
      |               |              |                |                  |<-- rapport métier ------------|         |
      |               |              |                |-- export ------------------------------------------------>|
      |               |              |                |<-- fichier -----------------------------------------------|
      |               |              |<-- flux fichier|                  |          |       |         |         |
      |               |<-- flux -----|                |                  |          |       |         |         |
      |<-- téléchargement ------------|                |                  |          |       |         |         |
```

### 12.2 Attendance

Le domaine Attendance héberge le contrôleur, les services d'export et les données de pointage.

### 12.3 Employee

Le rapport sélectionne les employés actifs et utilise leur identité, département et affectation de planning. Il n'appelle pas `EmployeesService` : la lecture s'effectue directement par Prisma.

### 12.4 Planning

Le rapport ne fait pas appel à `SchedulesService`. Le planning courant est inclus dans la requête Prisma et les snapshots sont lus sur Attendance.

### 12.5 Calendar

Le service appelle directement l'API interne de `CalendarService`, rendue disponible par `CalendarModule`.

### 12.6 Dashboard

Le dashboard ne fournit aucune donnée au rapport. Il fournit seulement un point de navigation vers `/exports`.

## 13. Sécurité

### 13.1 Authentification et autorisation

L'endpoint nécessite un JWT accepté par `JwtAuthGuard` et le rôle `ADMIN` accepté par `RolesGuard`. Les tests end-to-end vérifient qu'un employé reçoit un refus.

### 13.2 Contrôle frontend

La page serveur :

- exige un utilisateur courant ;
- redirige tout rôle différent de `ADMIN` ;
- redirige vers `/login` en l'absence de token.

Le middleware inclut la page d'accueil et les zones applicatives protégées selon sa configuration de routes.

### 13.3 Proxy

`proxyApiFileRequest()` récupère le token de session dans un cookie serveur et ajoute `Authorization: Bearer`. Le navigateur ne construit pas directement cet en-tête.

### 13.4 Validation

Les critères sont validés par `class-validator`. Le service Prisma ne reçoit `employeeId` que lorsque le DTO contient une valeur UUID valide.

### 13.5 Cache et exposition

Le contrôleur et le frontend utilisent `no-store`. Le rapport ne contient pas les PIN salariés. Les tests end-to-end contrôlent notamment l'absence d'exposition des PIN dans le CSV.

### 13.6 Audit

Chaque export réussi passe par la journalisation administrative asynchrone de l'action. Le code ne persiste pas le contenu du fichier dans le journal.

Fichiers concernés :

- `apps/backend/src/modules/auth/guards/jwt-auth.guard.ts`
- `apps/backend/src/modules/auth/guards/roles.guard.ts`
- `apps/backend/src/modules/attendance/attendance.controller.ts`
- `apps/frontend/lib/api-route.ts`
- `apps/backend/test/app.e2e-spec.ts`

## 14. Performances

### 14.1 Chargement

Le chargement métier principal repose sur :

- une requête Prisma imbriquée pour les employés, plannings et pointages ;
- une lecture des sanctions mensuelles ;
- une lecture des dates non ouvrées.

Les employés et leurs pointages sont chargés sans pagination.

### 14.2 Projections et index

La requête Prisma utilise des `select` explicites. Le modèle Attendance dispose notamment d'index sur `date`, les niveaux et distances de vérification, `earlyExit`, `lateExit`, `overtimeHours` et `absenceCount`. La contrainte unique `[employeeId, date]` organise l'unicité journalière.

### 14.3 Cache

Aucun cache de rapport n'est implémenté. Les réponses portent `Cache-Control: no-store`, les appels frontend utilisent `cache: 'no-store'` et la page `/exports` est `force-dynamic`.

### 14.4 Génération PDF

Puppeteer lance un navigateur par appel, crée une page, génère le PDF puis ferme le navigateur dans un bloc `finally`. Le rendu a un délai de 60 secondes. Les lignes sont découpées en pages après le calcul complet.

### 14.5 Génération CSV

Le CSV est construit entièrement en mémoire par transformation des lignes et concaténation.

## 15. Dépendances internes

### 15.1 Dépendances backend

| Dépendance | Usage |
|---|---|
| `PrismaService` | Lecture des employés et pointages |
| `CalendarService` | Jours non ouvrés |
| `SanctionsService` | Sanctions mensuelles |
| `AttendanceSecurityPolicyService` | Rayon GPS |
| `AppClockService` | Date courante testable |
| `AuditLogService` | Journalisation de l'export |
| `puppeteer` | Rendu PDF principal |
| `class-validator` | Validation du DTO |

### 15.2 Dépendances frontend

| Dépendance | Usage |
|---|---|
| `requireCurrentUser()` | Contrôle de session et rôle |
| `getSessionToken()` | Vérification du token côté page |
| `proxyApiFileRequest()` | Transmission sécurisée du fichier |
| `/api/employees` | Options du périmètre |
| composants UI | Formulaire, cartes, badges et boutons |

```text
Reports UI
  +-- Auth helpers
  +-- Employees API
  +-- File proxy
         |
         v
AttendanceModule
  +-- PrismaModule
  +-- CalendarModule
  +-- SanctionsModule
  +-- AuditLogService
  +-- Puppeteer
```

## 16. Traçabilité du code

| Fonctionnalité | Implémentation principale |
|---|---|
| Page Rapports | `apps/frontend/app/exports/page.tsx` |
| Formulaire et téléchargement | `apps/frontend/components/dashboard/monthly-attendance-export-card.tsx` |
| Navigation depuis le dashboard | `apps/frontend/components/dashboard/quick-actions-section.tsx` |
| Proxy binaire | `apps/frontend/app/api/attendance/exports/monthly/route.ts`, `apps/frontend/lib/api-route.ts` |
| Endpoint | `apps/backend/src/modules/attendance/attendance.controller.ts` |
| Validation | `apps/backend/src/modules/attendance/dto/monthly-attendance-export-query.dto.ts` |
| Modèle de sortie | `apps/backend/src/modules/attendance/exports/monthly-attendance-export.types.ts` |
| Calculs mensuels | `apps/backend/src/modules/attendance/exports/monthly-attendance-export.service.ts` |
| CSV | `apps/backend/src/modules/attendance/exports/monthly-attendance-csv-exporter.service.ts` |
| Coordination PDF | `apps/backend/src/modules/attendance/exports/monthly-attendance-pdf-exporter.service.ts` |
| PDF premium | `apps/backend/src/modules/attendance/exports/monthly-attendance-puppeteer-pdf-renderer.service.ts` |
| Jours non ouvrés | `apps/backend/src/modules/calendar/calendar.service.ts` |
| Sanctions | `apps/backend/src/modules/sanctions/sanctions.service.ts` |
| Résolution des plannings | `apps/backend/src/common/utils/attendance-schedule-snapshot.util.ts` |
| Persistance | `apps/backend/prisma/schema.prisma` |
| Tests API et CSV/PDF | `apps/backend/test/app.e2e-spec.ts` |
| Tests du rendu premium | `apps/backend/test/monthly-attendance-puppeteer-renderer.e2e-spec.ts` |
| Tests calendrier/absences | `apps/backend/test/attendance-calendar-absence.e2e-spec.ts` |
| Tests jours non ouvrés | `apps/backend/test/non-working-day-attendance.e2e-spec.ts` |

### 16.1 Tests constatés

Les tests couvrent :

- l'interdiction du rôle employé ;
- la validation du mois et de l'année ;
- le CSV administrateur ;
- le PDF d'équipe ;
- le PDF individuel ;
- les agrégations métier ;
- les absences tenant compte du calendrier ;
- le travail durant un jour non ouvré ;
- la construction et le rendu Puppeteer.

## 17. Observations techniques

Cette section consigne uniquement les comportements et structures constatés.

### 17.1 Absence de module Rapports autonome

Aucun dossier `modules/reports`, `ReportsModule`, `ReportsController` ou `ReportsService` n'est présent. Le périmètre est inclus dans Attendance.

### 17.2 Emplacement du composant frontend

`MonthlyAttendanceExportCard` se trouve dans `components/dashboard`, alors que son rendu effectif est assuré par `app/exports/page.tsx`.

### 17.3 Différence entre l'API et l'interface

L'API accepte CSV et PDF. L'interface ne déclenche que le PDF et présente l'écran sous les libellés « Exports PDF » et « Rapport mensuel RH ».

### 17.4 Deux moteurs PDF

Le code contient un moteur Puppeteer déclaré comme source principale et un générateur PDF bas niveau historique de plusieurs milliers de lignes dans le coordinateur. Le choix dépend des variables d'environnement et du résultat du rendu principal.

### 17.5 Deux calculs de plages de retards

Le rapport individuel expose deux ventilations :

- `lateBreakdown` : jusqu'à 5, de 6 à 15, au-delà de 15 minutes ;
- `lateRangeBreakdown` : jusqu'à 15, de 16 à 30, au-delà de 30 minutes.

Les noms et seuils sont distincts dans le type et le service.

### 17.6 Libellés multilingues

Le CSV contient des en-têtes anglais et quelques en-têtes français sans accents. Le rapport PDF emploie principalement des libellés français. Certaines valeurs métier de repli sont anglaises, notamment `Unassigned`, `No schedule assigned` et `Varies during month`.

### 17.7 Chaîne encodée

`formatAssignedScheduleLabel()` contient le littéral `Aucun planning assignÃ©` dans une branche de repli.

### 17.8 Branche conditionnelle équivalente

Dans `buildDailyReportRow()`, les branches conditionnelles liées au statut `NON_WORKING_DAY_WORK` retournent le même libellé « Travail jour non ouvré », tant pour `workTypeLabel` que pour une partie de `overtimeLabel`.

### 17.9 Absence d'historisation des tentatives bloquées

Le rapport fixe `outsideZoneAttempts` à `null` et annonce dans `blockedAttemptsLabel` que les tentatives hors zone bloquées en temps réel ne sont pas historisées dans cet export.

### 17.10 Employé demandé mais absent

Un `employeeId` UUID valide qui ne correspond pas à un employé actif produit une représentation vide ; aucune exception dédiée n'est levée par `MonthlyAttendanceExportService`.

### 17.11 Sélecteur d'employés

Le chargement de `/api/employees` ignore silencieusement une réponse non réussie. Le formulaire reste alors utilisable pour l'équipe entière, sans message propre au chargement de la liste.

### 17.12 Absence de pagination de données

La pagination constatée concerne uniquement la mise en pages PDF. La sélection Prisma charge le périmètre mensuel complet avant rendu.

### 17.13 Absence de cache et de stockage

Aucun cache de calcul et aucune persistance des fichiers produits ne sont présents. Chaque requête reconstruit le rapport.

### 17.14 Documentation locale

Aucun fichier de documentation propre au dossier `apps/backend/src/modules/attendance/exports/` n'est présent. Les commentaires de source de vérité sont intégrés directement aux classes de services.

### 17.15 Fonctionnalités non trouvées

Les rapports autonomes journalier, départemental, de présence et de retard, ainsi que les exports Excel et l'impression dédiée, ne sont pas trouvés dans le code.

