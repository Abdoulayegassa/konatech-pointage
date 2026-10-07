# API Reference — Pointage

| Métadonnée | Valeur |
|---|---|
| Document ID | API-006 |
| Titre | Pointage |
| Version | 1.0 |
| Statut | Validé |
| Classification | Interne |
| Référence | API Reference |
| Projet | Konatech Pointage |

## 1. Présentation

La ressource Pointage est portée par `AttendanceModule` et exposée sous `/api/v1/attendance`. Elle couvre le point d'entrée fixe, la synthèse du jour, les historiques mensuels, l'état de présence de l'employé connecté, la politique de sécurité, les entrées et sorties ainsi que les exports mensuels CSV et PDF.

`AttendanceController` répartit les accès entre route publique, compte `ADMIN` et compte `EMPLOYEE`. `AttendanceService` constitue le moteur des entrées, sorties, statuts, retards, absences, sorties anticipées, heures supplémentaires et historiques. Les services spécialisés traitent la sécurité GPS/photo et les exports.

## 2. Vue d'ensemble

| Ressource | Description |
|---|---|
| Point d'entrée fixe | Redirection HTTP vers la route frontend `/attendance-entry` construite depuis `FRONTEND_URL` |
| Synthèse du jour | Compteurs attendus, entrées, sorties, retards et absences |
| Présence du jour | Employé connecté, horaire, présence, possibilités d'entrée/sortie et politique de sécurité |
| Historique mensuel | Présences d'un mois, globales pour `ADMIN` ou limitées au compte `EMPLOYEE` |
| Entrée | Création ou complétion du pointage quotidien avec calcul du retard et instantané d'horaire |
| Sortie | Clôture du pointage quotidien avec calcul de sortie anticipée ou d'heures supplémentaires |
| Politique de sécurité | État des contrôles de localisation et valeurs de rayon ou précision exposées au compte employé |
| Export mensuel | Fichier CSV ou PDF global ou limité à un employé |

## 3. Endpoints

| Méthode | Route | Description | Authentification |
|---|---|---|---|
| GET | `/api/v1/attendance/entry` | Rediriger vers le point d'entrée frontend fixe | Publique |
| GET | `/api/v1/attendance/summary` | Obtenir la synthèse du jour | Bearer, rôle `ADMIN` |
| GET | `/api/v1/attendance/history` | Obtenir l'historique mensuel global | Bearer, rôle `ADMIN` |
| GET | `/api/v1/attendance/exports/monthly` | Exporter le rapport mensuel | Bearer, rôle `ADMIN` |
| GET | `/api/v1/attendance/me/today` | Obtenir l'état du jour du compte connecté | Bearer, rôle `EMPLOYEE` |
| GET | `/api/v1/attendance/me/security-policy` | Obtenir la politique de sécurité du pointage | Bearer, rôle `EMPLOYEE` |
| GET | `/api/v1/attendance/me/history` | Obtenir l'historique mensuel du compte connecté | Bearer, rôle `EMPLOYEE` |
| POST | `/api/v1/attendance/check-in` | Enregistrer une entrée pour un employé | Bearer, rôle `ADMIN` |
| POST | `/api/v1/attendance/check-out` | Enregistrer une sortie pour un employé | Bearer, rôle `ADMIN` |
| POST | `/api/v1/attendance/me/check-in` | Enregistrer l'entrée du compte connecté | Bearer, rôle `EMPLOYEE` |
| POST | `/api/v1/attendance/me/check-out` | Enregistrer la sortie du compte connecté | Bearer, rôle `EMPLOYEE` |

## 4. Description détaillée

### 4.1 GET `/api/v1/attendance/entry`

| Élément | Valeur observée |
|---|---|
| Query Parameters | Aucun |
| Path Parameters | Aucun |
| Body | Aucun |
| DTO | Aucun |
| Réponse | Redirection HTTP 302 vers la valeur `FRONTEND_URL` normalisée suivie de `/attendance-entry` |

### 4.2 GET `/api/v1/attendance/summary`

| Élément | Valeur observée |
|---|---|
| Query Parameters | Aucun |
| Path Parameters | Aucun |
| Body | Aucun |
| DTO | Aucun |
| Traitement | Calcul sur la journée UTC normalisée, les présences, les employés actifs planifiés et le calendrier non ouvré |

### 4.3 GET `/api/v1/attendance/history`

| Élément | Valeur observée |
|---|---|
| Query Parameter `month` | Facultatif, chaîne conforme à `YYYY-MM` |
| Valeur omise | Mois courant calculé par le service |
| Path Parameters | Aucun |
| Body | Aucun |
| DTO | `AttendanceHistoryQueryDto` |
| Traitement | Présences du mois, ordonnées par `date` puis `createdAt` décroissants |

### 4.4 GET `/api/v1/attendance/exports/monthly`

| Query Parameter | Présence | Validation observée |
|---|---|---|
| `month` | Obligatoire | Entier de 1 à 12 |
| `year` | Obligatoire | Entier de 2000 à 2100 |
| `format` | Facultatif | `csv` ou `pdf`; valeur de traitement par défaut `csv` |
| `employeeId` | Facultatif | UUID |

Le DTO associé est `MonthlyAttendanceExportQueryDto`. Aucun Path Parameter ni body n'est utilisé. Le service construit le rapport mensuel; l'exporteur sélectionné produit le contenu CSV ou PDF. La réponse définit `Content-Type`, `Content-Disposition` et `Cache-Control: no-store`. L'action `attendance.monthly_export` est journalisée après génération.

### 4.5 GET `/api/v1/attendance/me/today`

| Élément | Valeur observée |
|---|---|
| Query Parameters | Aucun |
| Path Parameters | Aucun |
| Body | Aucun |
| DTO | Aucun |
| Identifiant employé | `id` du compte fourni par `@CurrentUser()` |

La réponse regroupe `date`, `expectedToday`, `canCheckIn`, `canCheckOut`, `monthlyAbsenceCount`, `securityPolicy`, `attendance` et `employee`.

### 4.6 GET `/api/v1/attendance/me/security-policy`

Cette route n'accepte aucun paramètre ni body. Elle retourne la politique construite par `AttendanceSecurityPolicyService` avec `enabled`, `locationConfigured`, `trustedRadiusMeters`, `warningRadiusMeters`, `allowedRadiusMeters`, `maxAccuracyMeters`, `companyLatitude` et `companyLongitude`.

### 4.7 GET `/api/v1/attendance/me/history`

La route utilise `AttendanceHistoryQueryDto`. Le Query Parameter facultatif `month` suit le format `YYYY-MM`; son absence sélectionne le mois courant. Aucun Path Parameter ni body n'est accepté. Le filtre employé provient exclusivement du compte authentifié.

### 4.8 POST `/api/v1/attendance/check-in`

Le body est validé par `CheckInDto`.

| Champ | Présence | Validation observée |
|---|---|---|
| `employeeId` | Obligatoire | UUID |
| `occurredAt` | Facultatif | Chaîne de date ISO 8601; le service refuse une date future |
| `notes` | Facultatif | Chaîne de 200 caractères au maximum |
| `security` | Facultatif | Objet `CheckInSecurityProofDto` validé de manière imbriquée |

Le pointage administrateur appelle le moteur avec `enforceSecurity: false`. Les données de sécurité fournies peuvent être évaluées et persistées, mais leur absence n'est pas rejetée par `AttendanceSecurityService`.

### 4.9 POST `/api/v1/attendance/check-out`

Le body est validé par `CheckOutDto`.

| Champ | Présence | Validation observée |
|---|---|---|
| `employeeId` | Obligatoire | UUID |
| `occurredAt` | Facultatif | Chaîne de date ISO 8601; le service refuse une date future |
| `security` | Facultatif | Objet `CheckInSecurityProofDto` validé de manière imbriquée |

Ce DTO ne déclare pas de champ `notes`. Le pointage administrateur appelle le moteur avec `enforceSecurity: false`.

### 4.10 POST `/api/v1/attendance/me/check-in`

`SelfCheckInDto` ne contient aucun `employeeId`; celui-ci vient du jeton.

| Champ | Présence | Validation observée |
|---|---|---|
| `occurredAt` | Facultatif | Chaîne de date ISO 8601; le service refuse une date future |
| `notes` | Facultatif | Chaîne de 200 caractères au maximum |
| `security` | Facultatif dans le DTO | Objet imbriqué; les exigences effectives sont appliquées par le service de sécurité |

### 4.11 POST `/api/v1/attendance/me/check-out`

`SelfCheckOutDto` ne contient aucun `employeeId`; celui-ci vient du jeton.

| Champ | Présence | Validation observée |
|---|---|---|
| `occurredAt` | Facultatif | Chaîne de date ISO 8601; le service refuse une date future |
| `notes` | Facultatif | Chaîne de 200 caractères au maximum |
| `security` | Facultatif dans le DTO | Objet imbriqué; les exigences effectives sont appliquées par le service de sécurité |

### 4.12 Objet `security`

Les quatre DTO de pointage héritent de `CheckInSecurityDto`.

| Champ | Validation observée |
|---|---|
| `latitude` | Nombre facultatif entre -90 et 90 |
| `longitude` | Nombre facultatif entre -180 et 180 |
| `accuracyMeters` | Nombre facultatif entre 0 et 50 000 |
| `verificationPhotoDataUrl` | Chaîne facultative de 1 000 000 caractères au maximum, au format Data URL Base64 JPEG, JPG, PNG ou WebP; chaîne vide transformée en absence |

## 5. Règles métier observées

### 5.1 Entrée

- L'employé ciblé doit exister et être actif.
- `occurredAt` vaut l'heure courante lorsqu'il est absent; une valeur future est refusée.
- La journée de présence est normalisée en UTC.
- Une seule présence est admise par couple employé/jour grâce à la contrainte Prisma et aux contrôles du service.
- Une seconde entrée ou une entrée après une sortie déjà enregistrée produit un conflit.
- Une présence préexistante sans entrée ni sortie peut être complétée par une mise à jour conditionnelle.
- Un jour non ouvré donne le statut `NON_WORKING_DAY_WORK` et zéro minute de retard.
- Sans horaire actif ou hors jour planifié, l'entrée reçoit `INCOMPLETE` et zéro minute de retard.
- Sur un jour planifié, le retard est la différence positive arrondie en minutes après soustraction de `latenessMarginMinutes`; un retard positif donne `LATE`, sinon `INCOMPLETE` jusqu'à la sortie.
- L'horaire actif est copié dans les champs d'instantané au moment de l'entrée.

### 5.2 Sortie

- Une sortie exige une entrée existante pour le même employé et le même jour.
- Une seconde sortie produit un conflit.
- L'heure de sortie ne peut pas précéder l'heure d'entrée.
- Le calcul utilise d'abord l'instantané d'horaire; en l'absence d'instantané, il utilise l'horaire actif courant.
- Avant l'heure de fin planifiée, `earlyExit` vaut `true` et `earlyExitMinutes` contient l'écart arrondi en minutes.
- Après l'heure de fin planifiée, `lateExit` vaut `true`; `overtimeMinutes` contient l'écart arrondi et `overtimeHours` l'écart en heures arrondi à deux décimales.
- À l'heure de fin exacte, les indicateurs de sortie anticipée et d'heures supplémentaires restent à zéro ou `false`.
- Un travail sur jour non ouvré ou hors jour planifié convertit toute la durée entre entrée et sortie en heures supplémentaires, sans sortie anticipée.
- Après sortie, un jour non ouvré conserve `NON_WORKING_DAY_WORK`; un travail hors planning reçoit `PRESENT`; sinon le statut final est `LATE` lorsque `minutesLate` est positif et `PRESENT` dans le cas contraire.

### 5.3 Absences et synthèse

- Le décompte mensuel des absences concerne les jours planifiés écoulés du mois sans entrée, hors dates non ouvrées du calendrier.
- Sans horaire actif, ce décompte vaut zéro.
- La synthèse considère comme attendus les employés actifs avec horaire actif planifiés ce jour, sauf jour non ouvré.
- Les compteurs `checkedIn`, `checkedOut` et `late` sont calculés à partir des présences de la journée.

### 5.4 Sécurité conditionnelle

- Les routes `me/check-in` et `me/check-out` activent l'application des exigences de sécurité; les routes administratives la désactivent.
- Une photo de vérification est exigée par le service pour les deux pointages employés.
- Lorsque `ATTENDANCE_SECURITY_ENABLED` est actif et que les coordonnées de l'entreprise sont configurées, une localisation complète est exigée.
- La précision GPS est contrôlée contre `maxAccuracyMeters` lorsque cette limite existe.
- Au-delà de `allowedRadiusMeters`, une note non vide est exigée.
- La distance est calculée en mètres par la formule de Haversine et arrondie.
- La méthode persistée vaut `PHOTO` lorsqu'une photo est stockée, `GPS` lorsqu'une localisation seule est disponible, sinon `NONE`; le niveau produit par ce service vaut `OK`.

## 6. Réponses

### 6.1 Présence

Les endpoints d'entrée, de sortie et d'historique utilisent `attendanceWithEmployeeSelect`. La réponse contient :

- les identifiants `id` et `employeeId`, `date`, `clockInAt`, `clockOutAt`, `createdAt` et `updatedAt` ;
- `outsideScheduleWork`, `scheduledExitTime`, `earlyExit`, `earlyExitMinutes`, `lateExit`, `overtimeHours`, `overtimeMinutes`, `absenceCount`, `status`, `minutesLate` et `notes` ;
- les six champs d'instantané d'horaire et `scheduleCapturedAt` ;
- pour l'entrée et la sortie, latitude, longitude, précision, distance, méthode, niveau, motif, URL de photo et identifiant public de photo ;
- l'objet `employee` projeté sans mot de passe ni PIN.

L'objet employé imbriqué contient les champs publics et n'inclut pas son horaire. Les historiques retournent un tableau de présences; les opérations d'entrée et de sortie retournent une présence.

### 6.2 Synthèse, état du jour et politique

| Endpoint | Structure retournée |
|---|---|
| `/summary` | `asOf`, `date`, `expected`, `checkedIn`, `checkedOut`, `late`, `absences` |
| `/me/today` | `date`, `expectedToday`, `canCheckIn`, `canCheckOut`, `monthlyAbsenceCount`, `securityPolicy`, `attendance`, `employee` |
| `/me/security-policy` | Les huit champs de la politique de sécurité décrits en section 4.6 |

### 6.3 Export

Le format CSV retourne une chaîne avec un type MIME CSV et un nom de fichier construit par l'exporteur. Le format PDF retourne un `StreamableFile` à partir d'un `Buffer`. Dans les deux cas, le contenu est envoyé comme pièce jointe et sans mise en cache.

### 6.4 Codes HTTP observés

| Situation | Code | Origine |
|---|---:|---|
| Lecture réussie | 200 | Handlers GET hors redirection |
| Entrée ou sortie créée ou traitée | 201 | Handlers POST NestJS |
| Point d'entrée fixe | 302 | Décorateur `@Redirect` |
| DTO, date, ordre entrée/sortie ou preuve de sécurité invalide | 400 | Validation et services Attendance |
| Authentification absente ou invalide | 401 | `JwtAuthGuard` et service Auth |
| Rôle non autorisé | 403 | `RolesGuard` |
| Employé ou présence retournée introuvable | 404 | `AttendanceService` |
| Entrée ou sortie déjà enregistrée | 409 | `AttendanceService` |
| Limite de requêtes atteinte | 429 | `AppThrottlerGuard` |

## 7. Contrôle d'accès

`JwtAuthGuard` et `RolesGuard` sont globaux. `@Public()` rend uniquement `/attendance/entry` accessible sans jeton.

| Groupe | Rôle exigé | Restriction observée |
|---|---|---|
| Synthèse, historique global, export, entrées et sorties ciblées | `ADMIN` | Le rôle est fixé par `@Roles(AccessRole.ADMIN)` sur chaque handler |
| État du jour, politique, historique personnel, entrée et sortie personnelles | `EMPLOYEE` | Le rôle est fixé par `@Roles(AccessRole.EMPLOYEE)`; l'identifiant vient de `@CurrentUser()` |
| Point d'entrée fixe | Aucun | Handler marqué `@Public()` |

Les entrées et sorties administratives produisent les événements d'audit `attendance.admin_check_in` et `attendance.admin_check_out`. L'export produit `attendance.monthly_export`. Les opérations personnelles ne déclenchent pas `AuditLogService` dans le contrôleur.

## 8. Flux de traitement

```text
Client
  |
  v
JwtAuthGuard -> RolesGuard
  |
  v
ValidationPipe -> DTO
  |
  v
AttendanceController
  |
  v
AttendanceService
  |
  +--> CalendarService
  +--> AttendanceSecurityService -> stockage photo conditionnel
  +--> calculs horaire, retard, sortie et absence
  |
  v
PrismaService
  |
  v
PostgreSQL
  |
  v
Présence projetée -> réponse HTTP
```

Pour l'export, le contrôleur appelle `MonthlyAttendanceExportService`, puis l'exporteur CSV ou PDF au lieu de retourner directement une présence Prisma.

## 9. Traçabilité

| Endpoint ou mécanisme | Fichier ou répertoire source | Preuve observée |
|---|---|---|
| Onze endpoints | `apps/backend/src/modules/attendance/attendance.controller.ts` | Méthodes, routes, rôles, DTO, redirection et export |
| Composition du module | `apps/backend/src/modules/attendance/attendance.module.ts` | Services Attendance, sécurité, calendrier, sanctions et exporteurs |
| Point d'entrée fixe | `apps/backend/src/modules/attendance/attendance-entry.service.ts` | Construction de l'URL `/attendance-entry` |
| Synthèse et historiques | `apps/backend/src/modules/attendance/attendance.service.ts` | Calcul du jour et requêtes mensuelles |
| Entrée et sortie | `apps/backend/src/modules/attendance/attendance.service.ts` | Contrôles, écritures, statuts et calculs |
| Historique mensuel | `apps/backend/src/modules/attendance/dto/attendance-history-query.dto.ts` | Format du mois |
| Pointage administrateur | `apps/backend/src/modules/attendance/dto/check-in.dto.ts`, `apps/backend/src/modules/attendance/dto/check-out.dto.ts` | Identifiant, date, note et sécurité |
| Pointage personnel | `apps/backend/src/modules/attendance/dto/self-check-in.dto.ts`, `apps/backend/src/modules/attendance/dto/self-check-out.dto.ts` | Date, note et sécurité sans identifiant entrant |
| Preuve GPS/photo | `apps/backend/src/modules/attendance/dto/check-in-security.dto.ts` | Champs, bornes et format Data URL |
| Règles de sécurité | `apps/backend/src/modules/attendance/attendance-security.service.ts`, `apps/backend/src/modules/attendance/attendance-security-policy.service.ts` | Exigences, distance, méthode et métadonnées |
| Calcul de sortie | `apps/backend/src/common/utils/attendance-checkout.util.ts` | Sortie anticipée et heures supplémentaires |
| Instantané d'horaire | `apps/backend/src/common/utils/attendance-schedule-snapshot.util.ts` | Capture et résolution de l'horaire |
| Calendrier non ouvré | `apps/backend/src/modules/calendar/calendar.service.ts` | Vérification des dates non ouvrées |
| Export mensuel | `apps/backend/src/modules/attendance/dto/monthly-attendance-export-query.dto.ts`, `apps/backend/src/modules/attendance/exports/` | Paramètres, rapport, CSV et PDF |
| Projections Prisma | `apps/backend/src/common/prisma/selects.ts` | Champs Attendance et Employee retournés |
| Modèle de données | `apps/backend/prisma/schema.prisma` | Modèle `Attendance`, statuts, vérifications et contrainte employé/jour |
| Validation et préfixe | `apps/backend/src/main.ts` | `/api/v1` et `ValidationPipe` global |
| Authentification et rôles | `apps/backend/src/modules/auth/guards/`, `apps/backend/src/modules/auth/decorators/` | Bearer, routes publiques et rôles |
| Limitation globale | `apps/backend/src/app.module.ts`, `apps/backend/src/common/security/app-throttler.guard.ts` | Garde global |
| Audit | `apps/backend/src/common/audit/audit-log.service.ts`, contrôleur Attendance | Trois événements administratifs |
| Contrats HTTP | `apps/backend/test/app.e2e-spec.ts`, `apps/backend/test/non-working-day-attendance.e2e-spec.ts` | Parcours, accès, validations, calculs et réponses |
| Documentation recoupée | `documentation/07-API-Reference/01-Presentation-de-lAPI.md`, `documentation/06-Developer-Guide/10-Flux-de-donnees.md` | Recensement des routes et flux |

## 10. Observations

- Les onze endpoints du contrôleur Attendance utilisent uniquement GET et POST.
- La route publique `/attendance/entry` redirige vers `/attendance-entry`; elle n'enregistre aucun pointage.
- Les opérations administratives ciblent un `employeeId` fourni dans le body; les opérations personnelles utilisent l'identité du jeton.
- Le champ `notes` existe pour l'entrée administrateur et les deux opérations personnelles, mais pas dans `CheckOutDto`.
- La sécurité GPS/photo est appliquée comme exigence aux opérations personnelles et désactivée comme exigence aux opérations administratives.
- Les règles temporelles et les statuts sont centralisés dans `AttendanceService` et les utilitaires Attendance.
- Les données d'horaire sont instantanées à l'entrée puis réutilisées à la sortie lorsqu'elles existent.
- Les historiques ne déclarent pas de pagination.
- L'export mensuel est le seul endpoint Attendance qui retourne un contenu de fichier.
