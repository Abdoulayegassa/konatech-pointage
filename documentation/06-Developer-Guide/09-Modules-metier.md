# Developer Guide — Modules métier

| Métadonnée | Valeur |
|---|---|
| Document ID | DG-009 |
| Titre | Modules métier |
| Version | 1.0 |
| Statut | Validé |
| Classification | Interne |
| Référence | Developer Guide |
| Projet | Konatech Pointage |

## 1. Présentation

Konatech Pointage répartit ses fonctions applicatives entre sept modules NestJS : authentification, tableau de bord, employés, horaires, calendrier, pointage et sanctions. Chaque module regroupe ses contrôleurs, services, DTO ou types selon ses besoins.

Le frontend reprend ce découpage dans ses pages, Route Handlers et familles de composants. Les données persistées utilisent les modèles Prisma `Employee`, `Schedule`, `Attendance`, `CalendarEntry` et `SanctionRule`.

`HealthModule`, `PrismaModule` et `AuditLogModule` sont présents dans le backend, mais portent respectivement la santé HTTP, l'accès aux données et la journalisation technique. Ils ne sont pas traités comme modules métier dans ce chapitre.

## 2. Vue d'ensemble des modules

| Module | Description | Principales responsabilités |
|---|---|---|
| Authentification | Identifie l'utilisateur et expose son identité courante | Connexion e-mail/mot de passe, connexion PIN, émission et validation JWT, rôle courant |
| Tableau de bord | Agrège la situation de présence pour l'administration | Indicateurs du jour et du mois, activité récente, classements calculés |
| Employés | Gère les comptes employés et administrateurs | Création, modification, statut, fonction, département, rôle d'accès, PIN et horaire |
| Horaires | Gère les horaires affectables | Création, modification, activation, jours travaillés et liste des employés affectés |
| Calendrier | Gère le calendrier RH actif | Vue mensuelle, jours fériés publics ou d'entreprise, détection des jours non ouvrés |
| Pointage | Porte les règles de présence | Entrée, sortie, retards, absences, horaires, jours non ouvrés, sécurité conditionnelle, historiques et exports |
| Sanctions | Calcule et expose les sanctions de retard | Règles actives, seuils, tolérance mensuelle, résultat par présence et vue mensuelle |

## 3. Description détaillée des modules

### 3.1 Authentification

**Objectif.** Identifier un employé actif et fournir l'utilisateur authentifié aux contrôleurs protégés.

**Fonctionnalités observées.**

- connexion par e-mail et mot de passe ;
- connexion employé par PIN à quatre chiffres ;
- migration d'un PIN historique vers une empreinte scrypt après une connexion réussie ;
- émission et vérification d'un jeton JWT ;
- résolution de l'utilisateur courant par l'identifiant du jeton ;
- exclusion des secrets de la réponse publique.

| Élément | Implémentation |
|---|---|
| Contrôleur | `AuthController` |
| Service | `AuthService` |
| DTO | `LoginDto`, `AttendanceEntryLoginDto` |
| Composants frontend | `LoginForm`, `AttendanceEntryPinView`, `LogoutForm`, `AttendanceEntrySessionButton` |
| Pages | `/login`, `/attendance-entry` |
| Modèle Prisma | `Employee` |
| Interfaces | Gardes JWT/rôles, `PrismaService`, cookies frontend et routes `/api/auth/*` |

Les deux valeurs d'accès sont `ADMIN` et `EMPLOYEE`. Le champ texte `role` du modèle employé ne sert pas au garde de rôles.

### 3.2 Tableau de bord

**Objectif.** Produire une vue agrégée destinée au rôle administrateur.

**Fonctionnalités observées.**

- comptage des employés actifs et des présences ;
- comptage des retards, absences, départs anticipés et travail sur jour non ouvré ;
- agrégation des heures supplémentaires ;
- agrégats de vérification GPS et photo ;
- activité récente ;
- classements liés aux retards, vérifications historiques, heures supplémentaires et départs anticipés.

| Élément | Implémentation |
|---|---|
| Contrôleur | `DashboardController` avec `GET /dashboard/overview` |
| Service | `DashboardService` |
| Types | `dashboard.types.ts` |
| Page frontend | `/` |
| Composants | Cartes d'indicateurs, alertes, analyses, activité récente, QR Code et actions rapides |
| Modèles Prisma | `Employee`, `Attendance` |
| Interfaces | `CalendarService` pour le caractère ouvré du jour, `PrismaService`, module Auth pour l'accès `ADMIN` |

Le service effectue ses propres comptages et agrégations sur les données persistées. Il appelle le calendrier pour déterminer si la date courante est non ouvrée.

### 3.3 Employés

**Objectif.** Administrer les personnes enregistrées et leurs attributs applicatifs.

**Fonctionnalités observées.**

- liste et détail d'un employé ;
- création et mise à jour ;
- activation ou désactivation ;
- modification de la fonction texte et du département ;
- affectation ou retrait d'un horaire ;
- définition du rôle d'accès ;
- génération d'un identifiant `EMP-<année>-<séquence>` ;
- hachage du mot de passe et du PIN ;
- contrôle d'unicité du PIN sur les employés ;
- absence de PIN pour un compte `ADMIN` et exigence d'un PIN pour un compte `EMPLOYEE`.

| Élément | Implémentation |
|---|---|
| Contrôleur | `EmployeesController` |
| Service | `EmployeesService` |
| DTO | Création, mise à jour, statut, fonction, département et horaire |
| Page frontend | `/employees` |
| Composant | `AdminEmployeesManager` |
| Route Handlers | `/api/employees`, `/api/employees/[id]`, `/api/employees/[id]/status` |
| Modèles Prisma | `Employee`, `Schedule` |
| Interfaces | `PrismaService`, utilitaires de hachage, validation du PIN et `AuditLogService` |

La liste et le détail retournent `pinConfigured` sans exposer le PIN ni son empreinte. La création vérifie l'existence de l'horaire demandé et utilise une transaction pour générer l'identifiant employé puis créer l'enregistrement.

### 3.4 Horaires

**Objectif.** Définir les plages de travail utilisées par les employés et les calculs de présence.

**Fonctionnalités observées.**

- liste et détail avec les employés affectés ;
- création et modification ;
- activation ou désactivation ;
- heure de début, heure de fin, marge de retard et jours travaillés ;
- rejet d'une heure de fin antérieure ou égale à l'heure de début ;
- rejet d'un nom déjà utilisé par la contrainte Prisma.

| Élément | Implémentation |
|---|---|
| Contrôleur | `SchedulesController` |
| Service | `SchedulesService` |
| DTO | `CreateScheduleDto`, `UpdateScheduleDto`, `UpdateScheduleStatusDto` |
| Page frontend | `/schedules` |
| Composant | `AdminSchedulesManager` |
| Route Handlers | `/api/schedules`, `/api/schedules/[id]`, `/api/schedules/[id]/status` |
| Modèles Prisma | `Schedule`, relation vers `Employee` |
| Interfaces | `EmployeesService` par l'affectation, `AttendanceService` par les règles de calcul, `AuditLogService` |

Les jours travaillés sont stockés dans le champ JSON `workDays`. Les valeurs autorisées par le DTO couvrent les sept noms de jours utilisés par le backend.

### 3.5 Calendrier

**Objectif.** Définir les dates non ouvrées utilisées dans les vues RH et les calculs de présence.

**Fonctionnalités observées.**

- vue mensuelle combinant jours et événements ;
- liste mensuelle des événements ;
- création, modification et suppression ;
- détection des dates non ouvrées dans un intervalle ;
- contrôle d'un doublon sur une même date et un même type ;
- normalisation des dates en UTC.

| Élément | Implémentation |
|---|---|
| Contrôleur | `CalendarController` |
| Service | `CalendarService` |
| DTO | Mois, création et mise à jour d'événement |
| Types | `calendar.types.ts` |
| Page frontend | `/calendar` |
| Composants | `CalendarWorkspace`, grille, cellule, panneau de jour, légende et sélecteur de mois |
| Route Handlers | `/api/calendar/month`, `/api/calendar/holidays`, `/api/calendar/holidays/[id]` |
| Modèle Prisma | `CalendarEntry`, relation facultative vers `Employee` |
| Interfaces | `AttendanceService`, `AttendanceMonthlyMetricsService`, `DashboardService`, exports et `AuditLogService` |

Les DTO de création et modification acceptent seulement `PUBLIC_HOLIDAY` et `COMPANY_HOLIDAY`. Les valeurs Prisma `LEAVE` et `EXTERNAL_MISSION` existent dans l'énumération, mais ne sont pas acceptées par ces DTO actifs.

### 3.6 Pointage

**Objectif.** Enregistrer et calculer la présence quotidienne des employés.

**Fonctionnalités observées.**

- pointage d'entrée et de sortie par un administrateur ;
- pointage personnel du rôle `EMPLOYEE` ;
- route publique redirigeant vers l'entrée fixe `/attendance-entry` ;
- état du jour et historique mensuel personnel ;
- synthèse du jour et historique global administrateur ;
- calcul du retard avec la marge de l'horaire ;
- refus d'une seconde entrée ou sortie pour la même journée ;
- refus d'une sortie sans entrée ou antérieure à l'entrée ;
- calcul des départs anticipés et heures supplémentaires ;
- statut spécifique au travail sur jour non ouvré ;
- instantané de l'horaire dans la présence ;
- calcul des absences mensuelles sur les jours planifiés hors dates non ouvrées ;
- sécurité conditionnelle avec photo, localisation, précision, distance et justification hors zone ;
- stockage optionnel des photos de vérification ;
- export mensuel CSV ou PDF ;
- recalcul mensuel des absences par le service de métriques.

| Élément | Implémentation |
|---|---|
| Contrôleur | `AttendanceController` |
| Services métier | `AttendanceService`, `AttendanceEntryService`, `AttendanceMonthlyMetricsService` |
| Services de sécurité | `AttendanceSecurityPolicyService`, `AttendanceSecurityService`, `AttendancePhotoStorageService` |
| Services d'export | Construction de rapport, export CSV, export PDF et renderer Puppeteer |
| DTO | Historique, entrée, sortie, preuve de sécurité et export |
| Pages frontend | `/attendance-entry`, `/my-attendance`, `/attendance-history`, `/exports` |
| Composants | Terminal PIN, vue fixe, actions employé, horloge, capture photo, historique et carte d'export |
| Modèles Prisma | `Attendance`, `Employee`, `Schedule` |
| Interfaces | `CalendarService`, `SanctionsService`, `PrismaService`, Cloudinary configuré et `AuditLogService` |

Les routes administratives appellent le moteur de pointage avec `enforceSecurity: false`. Les routes personnelles appellent le même moteur avec `enforceSecurity: true`. Dans ce second mode, une photo est exigée. La localisation est également exigée lorsque la politique est activée ; une distance supérieure au rayon autorisé exige un commentaire.

Une présence est identifiée de manière unique par `employeeId` et `date`. Le statut reste `INCOMPLETE` après une entrée planifiée sans retard, puis devient `PRESENT` après une sortie sans retard. Un retard conserve le statut `LATE`.

### 3.7 Sanctions

**Objectif.** Calculer les résultats disciplinaires associés aux retards enregistrés.

**Fonctionnalités observées.**

- lecture des règles ;
- modification d'une règle persistée ;
- validation des seuils, tolérances, montants et priorités ;
- refus du chevauchement de plages actives de retard ;
- calcul pour une présence donnée ;
- calcul mensuel, facultativement limité à un employé ;
- statuts `TOLERATED`, `APPLIED` et `NOT_APPLICABLE` ;
- comptage des occurrences précédentes du même mois pour appliquer la tolérance.

| Élément | Implémentation |
|---|---|
| Contrôleur | `SanctionsController` |
| Service | `SanctionsService` |
| DTO | `MonthlySanctionsQueryDto`, `UpdateSanctionRuleDto` |
| Types | `sanction-engine.types.ts` |
| Configuration de repli | `sanction-rules.config.ts` |
| Page frontend | `/sanctions` |
| Composants | `SanctionRulesPanel`, `SanctionsMonthSelector`, panneau de détail de présence |
| Route Handlers | `/api/sanctions/rules/[id]`, `/api/sanctions/attendance/[attendanceId]` |
| Modèles Prisma | `SanctionRule`, lecture de `Attendance` et `Employee` |
| Interfaces | `AttendanceModule` pour les exports et détails d'historique, `PrismaService` |

Le moteur convertit uniquement les règles de retard mineur et majeur en conditions actives. Il recherche la première règle active correspondante selon l'ordre de priorité fourni par la lecture en base. Lorsque la base ne renvoie aucune règle convertible, il utilise les règles de retard actives définies dans `sanction-rules.config.ts`.

## 4. Dépendances entre modules

### 4.1 Dépendances déclarées et appels observés

| Module consommateur | Dépendance | Interaction |
|---|---|---|
| Tous les contrôleurs protégés | Authentification | Utilisateur JWT et contrôle `AccessRole` |
| Employés | Horaires | Vérifie et connecte l'horaire sélectionné par son identifiant |
| Pointage | Calendrier | Exclut les dates non ouvrées des absences et qualifie le travail hors jour ouvré |
| Pointage | Sanctions | Ajoute les résultats de sanction aux rapports mensuels |
| Tableau de bord | Calendrier | Détermine les employés attendus selon le jour courant |
| Tableau de bord | Pointage persistant | Agrège les enregistrements `Attendance` sans injecter `AttendanceService` |
| Sanctions | Pointage persistant | Lit les présences et leurs minutes de retard |
| Frontend employés | Employés et horaires | Charge les deux listes en parallèle pour les affectations |

### 4.2 Diagramme

```text
                         Auth
                           |
                           | utilisateur et rôle
                           v
     +----------+------- Modules protégés -------+----------+
     |          |              |                 |          |
     v          v              v                 v          v
 Employees  Schedules      Calendar          Sanctions  Dashboard
     |          |              |                 ^          |
     | affecte  |              | jours non       |          | calendrier
     +--------->+              | ouvrés          |          |
                               v                 |          |
                           Attendance -----------+          |
                               |                            |
                               +----------------------------+
                                  données Attendance lues

Tous les services de données --> PrismaService --> PostgreSQL
```

La flèche `Attendance` vers `Sanctions` correspond à `MonthlyAttendanceExportService`, qui injecte `SanctionsService`. `DashboardService` n'injecte pas `AttendanceService`; il interroge directement les modèles avec `PrismaService`.

## 5. Flux métier

### 5.1 Identification et accès

```text
E-mail / mot de passe ou PIN
              |
              v
          AuthService
              |
              v
        Employee actif
              |
              v
              JWT
              |
              v
      JwtAuthGuard + RolesGuard
              |
              v
        Module autorisé
```

### 5.2 Création d'un employé et affectation

```text
Formulaire administrateur
          |
          v
EmployeesController
          |
          v
Validation du DTO
          |
          +--> contrôle du PIN selon accessRole
          +--> contrôle de Schedule si fourni
          +--> hachage mot de passe et PIN
          |
          v
Transaction Prisma
identifiant annuel + Employee
          |
          v
Réponse sans secret + journal d'audit
```

### 5.3 Pointage employé

```text
QR Code
   |
   v
/attendance-entry
   |
   v
PIN -> session EMPLOYEE courte
   |
   v
Entrée ou sortie personnelle
   |
   +--> validation photo
   +--> validation GPS si politique active
   +--> calendrier et horaire
   |
   v
AttendanceService
   |
   +--> statut / retard / absence
   +--> départ anticipé / heures supplémentaires
   +--> instantané d'horaire
   |
   v
Attendance persistée
```

### 5.4 Consultation, sanctions et export

```text
Attendance + Employee + Schedule
                |
        +-------+-------+
        |               |
        v               v
 Historique RH     Tableau de bord
        |
        +--> SanctionsService
        |      seuil + tolérance mensuelle
        |
        +--> MonthlyAttendanceExportService
               |
               +--> CalendarService
               +--> SanctionsService
               +--> CSV ou PDF
```

## 6. Organisation du code métier

| Module | Backend | Frontend | Base de données |
|---|---|---|---|
| Authentification | `apps/backend/src/modules/auth/` | `app/login/`, `app/attendance-entry/`, `app/api/auth/`, `components/auth/`, composants de session de pointage | `Employee`, `AccessRole` |
| Dashboard organisation | `apps/backend/src/modules/dashboard/` | `app/dashboard/page.tsx`, `components/dashboard/` | Agrégats organisationnels sur employés et présences |
| Employés | `apps/backend/src/modules/employees/` | `app/employees/`, `app/api/employees/`, `components/employees/` | `Employee`, relation `Schedule` |
| Horaires | `apps/backend/src/modules/schedules/` | `app/schedules/`, `app/api/schedules/`, `components/schedules/` | `Schedule`, relation `Employee` |
| Calendrier | `apps/backend/src/modules/calendar/` | `app/calendar/`, `app/api/calendar/`, `components/calendar/` | `CalendarEntry`, relation facultative `Employee` |
| Pointage | `apps/backend/src/modules/attendance/` | Pages `attendance-entry`, `my-attendance`, `attendance-history`, `exports`; composants `attendance`, `attendance-history` et export | `Attendance`, lectures `Employee` et `Schedule` |
| Sanctions | `apps/backend/src/modules/sanctions/` | `app/sanctions/`, routes API sanctions, `components/sanctions/`, détail d'historique | `SanctionRule`, lectures `Attendance` et `Employee` |

Les fonctions HTTP communes du frontend sont concentrées dans `apps/frontend/lib/api.ts` et `apps/frontend/lib/api-route.ts`. Elles ne constituent pas un module métier séparé.

## 7. Traçabilité

| Module | Fichiers analysés | Preuve observée |
|---|---|---|
| Composition générale | `apps/backend/src/app.module.ts` | Imports des modules présents |
| Authentification | `apps/backend/src/modules/auth/`, `apps/frontend/app/api/auth/`, `apps/frontend/components/auth/`, `apps/frontend/components/attendance/attendance-entry-pin-view.tsx` | Connexions, gardes, JWT et sessions |
| Dashboard organisation | `apps/backend/src/modules/dashboard/`, `apps/frontend/app/dashboard/page.tsx`, `apps/frontend/components/dashboard/` | Agrégats organisationnels, types et composants |
| Dashboard site | `apps/frontend/app/site/[siteId]/dashboard/page.tsx`, site-context services/controllers | Agrégats opérationnels limités au site autorisé |
| Employés | `apps/backend/src/modules/employees/`, `apps/frontend/app/employees/`, `apps/frontend/app/api/employees/`, `apps/frontend/components/employees/` | API, validations et gestionnaire |
| Horaires | `apps/backend/src/modules/schedules/`, `apps/frontend/app/schedules/`, `apps/frontend/app/api/schedules/`, `apps/frontend/components/schedules/` | API, fenêtre horaire et affectations |
| Calendrier | `apps/backend/src/modules/calendar/`, `apps/frontend/app/calendar/`, `apps/frontend/app/api/calendar/`, `apps/frontend/components/calendar/` | Vue mensuelle, événements et jours non ouvrés |
| Pointage | `apps/backend/src/modules/attendance/`, pages de présence sous `apps/frontend/app/`, composants `apps/frontend/components/attendance/` et `attendance-history/` | Moteur, sécurité, historique et exports |
| Sanctions | `apps/backend/src/modules/sanctions/`, `apps/frontend/app/sanctions/`, `apps/frontend/app/api/sanctions/`, `apps/frontend/components/sanctions/` | Règles, calcul et interfaces |
| Accès frontend | `apps/frontend/lib/api.ts`, `apps/frontend/lib/api-route.ts` | Fonctions de domaine et Route Handlers |
| Données | `apps/backend/prisma/schema.prisma` | Cinq modèles et relations |
| Valeurs initiales | `apps/backend/prisma/seed.ts`, `apps/backend/prisma/migrations/20260626190000_add_configurable_sanction_rules/migration.sql` | Horaires, employés, présences et règles initiales |
| Audit transverse | `apps/backend/src/common/audit/` et contrôleurs métier | Journalisation après actions administratives |
| Tests métier | `apps/backend/test/` | Scénarios d'API, calendrier, présence, sécurité et sanctions |
| Frontend | `documentation/06-Developer-Guide/05-Frontend-NextJS.md` | Organisation des pages et composants |
| Backend | `documentation/06-Developer-Guide/06-Backend-NestJS.md` | Organisation des contrôleurs et services |
| Données | `documentation/06-Developer-Guide/07-Base-de-donnees-Prisma.md` | Modèles et migrations |

## 8. Observations

- Sept modules fonctionnels portent les traitements applicatifs décrits dans ce chapitre.
- `HealthModule` est séparé des modules métier.
- Les modules métier backend sont organisés par domaine et non par type technique global.
- L'authentification et Prisma sont transverses aux modules protégés et persistants.
- `AttendanceModule` contient le plus grand nombre de services spécialisés.
- Le calendrier intervient dans les calculs du pointage, du tableau de bord et des exports.
- Les sanctions sont calculées à partir des présences ; aucun modèle de résultat de sanction n'est persisté.
- Les exports appartiennent au module de pointage et utilisent les sanctions ainsi que le calendrier.
- Le frontend regroupe les composants selon des domaines proches des modules backend.
- Les pages `attendance-entry` et `my-attendance` utilisent deux modes de session distincts.
- Le module employés associe les comptes aux horaires sans module d'affectation séparé.
- Les actions administratives d'employés, horaires, calendrier et certains pointages produisent des événements d'audit.
