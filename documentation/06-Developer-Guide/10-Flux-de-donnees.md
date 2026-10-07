# Developer Guide — Flux de données

| Métadonnée | Valeur |
|---|---|
| Document ID | DG-010 |
| Titre | Flux de données |
| Version | 1.0 |
| Statut | Validé |
| Classification | Interne |
| Référence | Developer Guide |
| Projet | Konatech Pointage |

## 1. Présentation

Ce chapitre décrit les parcours de données effectivement implémentés entre l'interface Next.js, les Route Handlers du frontend, l'API NestJS, les services applicatifs, Prisma Client et PostgreSQL.

Les flux documentés couvrent l'authentification, les employés et horaires, le calendrier, le pointage, les historiques, le tableau de bord, les sanctions et les exports mensuels. Les chemins de lecture rendus côté serveur et les mutations relayées par le frontend sont distingués lorsqu'ils suivent des parcours différents.

## 2. Vue d'ensemble

```text
Utilisateur
    |
    | navigation, formulaire ou action
    v
Frontend Next.js
    |
    | 1. lecture serveur avec fetchServerApi
    | 2. mutation via Route Handler /api/*
    v
API HTTP NestJS /api/v1
    |
    | gardes, paramètres et ValidationPipe
    v
Contrôleur
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
Résultat Prisma -> Service -> Contrôleur
    |
    v
JSON ou fichier HTTP -> Frontend -> Utilisateur
```

Le navigateur n'accède pas directement à PostgreSQL. Les pages serveur appellent le backend par `fetchServerApi`. Les actions exécutées dans les composants clients passent par les Route Handlers sous `apps/frontend/app/api/`, lesquels ajoutent le jeton de session avant de relayer la requête vers le backend.

| Segment | Données transportées | Mécanisme observé | Source |
|---|---|---|---|
| Navigateur → frontend | Saisies, filtres, preuves de pointage et actions | Formulaires, composants clients et requêtes vers `/api/*` | `apps/frontend/components/`, `apps/frontend/app/` |
| Frontend → backend | JSON, paramètres de requête et en-tête `Authorization` | `fetchServerApi`, `proxyApiRequest`, `proxyApiJsonBodyRequest` | `apps/frontend/lib/api.ts`, `apps/frontend/lib/api-route.ts` |
| Backend → services | DTO validés, paramètres et utilisateur courant | Contrôleurs NestJS et injection de dépendances | `apps/backend/src/modules/` |
| Services → base | Lectures, créations, mises à jour, agrégats et transactions | `PrismaService` | `apps/backend/src/common/prisma/prisma.service.ts`, services métier |
| Backend → frontend | Objets JSON ou contenu CSV/PDF | Réponse NestJS et API Fetch | Contrôleurs backend, `apps/frontend/lib/api.ts` |

## 3. Flux principaux

### 3.1 Authentification par e-mail et mot de passe

| Étape | Traitement observé |
|---|---|
| Origine | `LoginForm` envoie l'e-mail, le mot de passe et une redirection éventuelle à `POST /api/auth/login`. |
| Relais frontend | Le Route Handler retire la logique de session du navigateur et transmet le JSON à `POST /api/v1/auth/login`. |
| Validation | `LoginDto` applique `IsEmail`, `IsString` et une longueur minimale de huit caractères. |
| Traitement | `AuthService` recherche l'employé par e-mail, vérifie qu'il est actif et compare le mot de passe haché. |
| Stockage | Ce flux lit `Employee`; il ne crée pas de session en base. |
| Réponse | Le backend émet un JWT avec l'utilisateur public. Le Route Handler place le jeton dans le cookie HTTP-only `konatech_session`, supprime la session de terminal de pointage et retourne l'utilisateur ainsi que la destination de redirection. |

### 3.2 Authentification du terminal de pointage par PIN

| Étape | Traitement observé |
|---|---|
| Origine | `AttendanceEntryPinView` envoie un PIN à `POST /api/auth/attendance-entry-session`. |
| Relais frontend | Le Route Handler appelle `POST /api/v1/auth/attendance-entry/login`. |
| Validation | `AttendanceEntryLoginDto` exige exactement quatre chiffres. |
| Traitement | `AuthService` recherche les employés actifs de rôle `EMPLOYEE`, compare le PIN et peut remplacer un ancien PIN stocké par son empreinte. |
| Stockage | Une migration de PIN réussie utilise une mise à jour conditionnelle de `Employee`. |
| Réponse | Le JWT est enregistré dans le cookie HTTP-only `konatech_attendance_entry_session`; la réponse frontend cible `/attendance-entry`. |

Les requêtes de pointage personnel relayées par le frontend sélectionnent explicitement cette session avec `sessionMode: 'attendance-entry'`. Les autres flux protégés utilisent `konatech_session`.

### 3.3 Gestion des employés

| Étape | Traitement observé |
|---|---|
| Origine | `AdminEmployeesManager` charge, crée et modifie les employés depuis `/employees`. |
| Relais frontend | Les Route Handlers `/api/employees` et `/api/employees/[id]` transmettent les lectures et corps JSON à l'API. Le statut possède le relais `/api/employees/[id]/status`. |
| Validation | Les DTO contrôlent notamment l'e-mail, les longueurs, le rôle d'accès, le PIN, les UUID et les booléens. Le pipe global retire ou refuse les propriétés non déclarées et transforme les valeurs compatibles. |
| Traitement | `EmployeesService` contrôle le PIN selon le rôle, hache le mot de passe et le PIN, vérifie l'horaire éventuel et construit les données Prisma. |
| Stockage | La création utilise une transaction pour générer l'identifiant annuel puis créer `Employee`. Les modifications mettent à jour `Employee` et sa relation facultative avec `Schedule`. |
| Réponse | Le service retourne une représentation publique avec `pinConfigured`, sans mot de passe, PIN ni empreinte de PIN. Les mutations déclenchent aussi un journal d'audit administratif. |

### 3.4 Gestion des horaires et du calendrier

| Flux | Origine et validation | Traitement et stockage | Réponse |
|---|---|---|---|
| Horaires | `/schedules`, Route Handlers `/api/schedules*`, DTO de création, modification et statut | `SchedulesService` valide l'ordre des heures puis lit ou modifie `Schedule` | Horaire seul ou liste incluant les employés affectés |
| Calendrier mensuel | `/calendar`, `GET /api/calendar/month?month=YYYY-MM`, `CalendarMonthQueryDto` | `CalendarService` normalise le mois, lit `CalendarEntry` et construit les jours de la période | Vue mensuelle avec événements et propriétés calculées des jours |
| Jours fériés | Route Handlers `/api/calendar/holidays*`, DTO de création ou modification | Le service normalise la date, contrôle les doublons, puis crée, modifie ou supprime `CalendarEntry` | Événement enregistré ou résultat de suppression, avec audit pour les mutations |

### 3.5 Pointage employé

```text
QR Code -> /attendance-entry -> PIN -> cookie de session terminal
                                      |
                                      v
                       action entrée ou sortie + selfie
                                      |
                         localisation si politique active
                                      |
                                      v
             Route Handler /api/attendance/me/check-in|check-out
                                      |
                                      v
             AttendanceController -> AttendanceEntryService
                                      |
                                      v
             AttendanceService + sécurité + calendrier + horaire
                                      |
                                      v
                    création ou mise à jour Attendance
                                      |
                                      v
                       présence retournée au composant
```

| Étape | Traitement observé |
|---|---|
| Origine | Les composants de pointage recueillent l'action, une photo et les données de géolocalisation disponibles. |
| Relais frontend | Les Route Handlers envoient le corps JSON avec le JWT de la session de terminal. |
| Validation | `SelfCheckInDto`, `SelfCheckOutDto` et les DTO de preuve contrôlent date, note, coordonnées, précision et format Data URL de l'image. |
| Autorisation | Les routes personnelles exigent `EMPLOYEE`; l'identifiant employé vient du JWT et non du corps. |
| Traitement | `AttendanceEntryService` délègue à `AttendanceService` avec la sécurité activée. Le service charge l'employé et son horaire, évalue le calendrier, le retard, le travail hors planning, la sortie anticipée et les heures supplémentaires selon l'action. |
| Stockage | L'entrée crée `Attendance` avec les instantanés d'horaire. La sortie met à jour l'enregistrement du jour. Les métadonnées de vérification et de photo sont conservées lorsque produites. |
| Réponse | L'enregistrement de présence actualisé est renvoyé. Les refus liés au selfie, à la localisation, à la précision ou à la justification prennent la forme d'erreurs HTTP `400`. |

Les routes administratives `POST /attendance/check-in` et `POST /attendance/check-out` reçoivent un `employeeId` dans leurs DTO et appellent le moteur avec la sécurité désactivée. Elles enregistrent une action d'audit après succès.

### 3.6 Historique personnel et historique administratif

| Flux | Requête | Traitement | Réponse |
|---|---|---|---|
| État du jour employé | `GET /attendance/me/today` | L'identifiant du JWT est transmis à `AttendanceService.getEmployeeToday` | Employé, horaire, date et présence du jour |
| Historique employé | `GET /attendance/me/history?month=YYYY-MM` | Validation de `AttendanceHistoryQueryDto`, lecture des présences et calcul mensuel | Historique limité à l'employé authentifié |
| Historique administrateur | `GET /attendance/history?month=YYYY-MM` | Lecture du mois pour l'ensemble des employés | Données utilisées par `AttendanceHistoryWorkspace` |
| Détail de sanction | `GET /sanctions/attendance/:attendanceId` via `/api/sanctions/attendance/[attendanceId]` | Lecture de la présence et calcul du résultat de sanction | Détail affiché dans `AttendanceDetailPanel` |

### 3.7 Tableau de bord

| Étape | Traitement observé |
|---|---|
| Origine | La page racine protégée appelle `getDashboardData`. |
| Requête | `GET /api/v1/dashboard/overview` avec le JWT de session. |
| Validation et accès | Le contrôleur exige le rôle `ADMIN`; aucun corps de requête n'est traité. |
| Traitement | `DashboardService` exécute des comptages, lectures et agrégats Prisma sur `Employee` et `Attendance`, et consulte `CalendarService` pour la date courante. |
| Stockage | Le flux est en lecture seule. |
| Réponse | Une vue `DashboardOverview` regroupe synthèse, analyses, activité récente et classements pour les composants du tableau de bord. |

### 3.8 Sanctions

Le flux mensuel part de `/sanctions`, transmet le mois à `GET /sanctions/monthly`, lit les présences et les règles actives, puis calcule pour chaque retard la règle correspondante et sa tolérance mensuelle. Le résultat est renvoyé au frontend sans modèle Prisma distinct pour le résultat calculé.

La modification d'une règle passe par `PATCH /api/sanctions/rules/[id]`, puis `PATCH /api/v1/sanctions/rules/:id`. `UpdateSanctionRuleDto` valide les types et valeurs minimales. `SanctionsService` complète les valeurs, vérifie les bornes et les chevauchements, met à jour `SanctionRule` et renvoie la règle persistée.

### 3.9 Exports mensuels CSV et PDF

```text
Paramètres year, month, format, employeeId éventuel
                         |
                         v
MonthlyAttendanceExportQueryDto
                         |
                         v
MonthlyAttendanceExportService
     |              |                |
     v              v                v
 Employee       Attendance      CalendarEntry
                         |
                         v
                  SanctionsService
                         |
                         v
               rapport mensuel normalisé
                    /           \
                   v             v
                 CSV            PDF
                   \             /
                    v           v
               réponse fichier HTTP
```

Le Route Handler frontend conserve la chaîne de requête et relaie le téléchargement. Le contrôleur choisit le format validé, appelle l'exporteur CSV ou PDF, définit le type de contenu et le nom de fichier, puis envoie les octets au frontend. Le CSV est construit à partir du rapport mensuel; le PDF est rendu par le service d'export PDF et son renderer Puppeteer.

## 4. Validation des données

Le backend installe un `ValidationPipe` global dans `apps/backend/src/main.ts` avec `whitelist`, `forbidNonWhitelisted`, `transform` et la conversion implicite. Les DTO utilisent `class-validator` et, lorsque nécessaire, `class-transformer`.

| Mécanisme | Effet observé | Exemples de sources |
|---|---|---|
| Validation de format | E-mail, UUID, date ISO, mois `YYYY-MM`, heures `HH:mm`, PIN à quatre chiffres | DTO Auth, Employees, Attendance, Calendar et Schedules |
| Validation de bornes | Longueurs, latitude, longitude, précision GPS, mois, année, marges et valeurs de sanction | DTO métier sous `apps/backend/src/modules/*/dto/` |
| Validation d'énumération | Rôle d'accès, jours travaillés, types actifs de calendrier et format d'export | DTO Employees, Schedules, Calendar et Attendance |
| Transformation | Conversion des nombres, objets imbriqués et chaînes vides en valeurs nulles ou absentes | `CheckInSecurityProofDto`, DTO Employees, pipe global |
| Validation de service | Cohérence temporelle, existence de relations, unicité, état du pointage et règles de sécurité | Services Employees, Schedules, Calendar, Attendance et Sanctions |
| Contraintes de base | Unicité d'e-mail, identifiant employé, PIN historique, nom d'horaire et présence employé/date | `apps/backend/prisma/schema.prisma` |

Les paramètres d'identifiant de plusieurs contrôleurs sont transformés par `ParseUUIDPipe`. Les gardes interviennent avant le traitement métier pour les routes non publiques.

## 5. Circulation des DTO

Les DTO sont instanciés à la frontière des contrôleurs NestJS pour les corps et requêtes annotés. Ils ne sont pas transmis à Prisma sans traitement systématique : les services extraient, normalisent ou enrichissent leurs champs avant de construire les objets de création et de mise à jour.

| DTO ou famille | Entrée HTTP | Service destinataire | Transformation ou usage observé |
|---|---|---|---|
| `LoginDto` | `POST /auth/login` | `AuthService` | Recherche par e-mail et vérification du mot de passe |
| `AttendanceEntryLoginDto` | `POST /auth/attendance-entry/login` | `AuthService` | Comparaison du PIN et émission d'une session employé |
| DTO Employees | `POST/PATCH /employees*` | `EmployeesService` | Hachage, normalisation, contrôle de rôle et connexion à `Schedule` |
| DTO Schedules | `POST/PATCH /schedules*` | `SchedulesService` | Conversion des heures pour comparaison et écriture des jours JSON |
| DTO Calendar | `/calendar/month`, `/calendar/holidays*` | `CalendarService` | Normalisation UTC du mois et des dates |
| DTO Attendance | `/attendance/*` | `AttendanceService` ou `AttendanceEntryService` | Ajout de l'identité issue du JWT pour les routes personnelles, calculs temporels et sécurité |
| `MonthlyAttendanceExportQueryDto` | `GET /attendance/exports/monthly` | Services d'export | Construction de la période et sélection CSV/PDF |
| DTO Sanctions | `/sanctions/monthly`, `/sanctions/rules/:id` | `SanctionsService` | Normalisation du mois et validation des plages de règles |

Les types TypeScript de `apps/frontend/lib/api.ts` décrivent les charges utiles et réponses utilisées par l'interface. La validation autoritative des requêtes reste appliquée par les DTO backend et le pipe global.

## 6. Accès aux données

```text
Contrôleur NestJS
       |
       | DTO validé + utilisateur courant éventuel
       v
Service de domaine
       |
       | règles, calculs et sélection des champs
       v
PrismaService
       |
       | Prisma Client
       v
PostgreSQL
       |
       | enregistrement, liste, agrégat ou erreur Prisma
       v
Service de domaine
       |
       | projection publique ou résultat calculé
       v
Contrôleur NestJS
       |
       | JSON, CSV ou PDF
       v
Frontend Next.js
```

`PrismaService` étend `PrismaClient` et centralise l'instance injectée dans les services. Les sélections publiques définies dans `apps/backend/src/common/prisma/selects.ts` limitent les champs retournés pour les employés, horaires et présences.

| Type d'accès | Flux concernés | Opérations observées |
|---|---|---|
| Lecture unique | Authentification, détail employé, détail horaire, présence du jour, règle et sanction | `findUnique`, avec contrôles d'absence dans les services |
| Lecture multiple | Listes, historiques, calendrier, exports et sanctions mensuelles | `findMany` avec filtres, ordre, relations ou sélections |
| Écriture | Employés, horaires, calendrier, pointages et règles de sanction | `create`, `update`, `updateMany` et suppression calendrier |
| Transaction | Création d'employé | Séquence de l'identifiant et création atomique |
| Agrégation | Tableau de bord | `count`, `aggregate` et agrégations calculées en mémoire sur les lectures |
| Reconstitution mensuelle | Métriques de présence | Création des absences manquantes et mise à jour des compteurs sur la période |

## 7. Gestion des erreurs dans les flux

| Origine | Traitement observé | Propagation vers le frontend |
|---|---|---|
| Validation DTO | Le pipe global produit une erreur HTTP pour un champ invalide, inconnu ou non transformable | Le statut et les messages du backend sont repris par les Route Handlers |
| Authentification | `JwtAuthGuard` rejette l'en-tête absent, non Bearer ou le jeton invalide; `AuthService` rejette les identifiants invalides et comptes inactifs | Réponse `401`; la session de terminal est effacée par le proxy lors d'un `401` sur ce mode |
| Autorisation | `RolesGuard` compare le rôle requis au rôle de l'utilisateur | Réponse `403` |
| Limitation de débit | `AppThrottlerGuard` lève une réponse `429` lorsque la limite est dépassée | Statut HTTP relayé |
| Règles métier | Les services lèvent des erreurs `400`, `404` ou `409` pour incohérence, absence ou conflit | Le proxy extrait `message`, y compris un tableau de messages |
| Sécurité du pointage | Le service refuse les preuves absentes ou incompatibles avec la politique active | Réponse `400` et message relayé par le proxy |
| Erreur Prisma connue | Certains services convertissent les conflits de contrainte en exceptions métier | Statut et message HTTP correspondants |
| Backend inaccessible | `fetchServerApi` échoue dans un Route Handler | Réponse frontend `502` avec le message de repli |
| URL API invalide | La validation de configuration de `api.ts` échoue | Réponse frontend `500` contenant l'erreur de configuration |
| Réponse non JSON | Les proxies utilisent un objet vide ou le texte brut selon le flux | Message de repli ou réponse fichier selon le handler |
| Génération PDF ou photo distante | Les services spécialisés traduisent les échecs en exceptions HTTP | Erreur HTTP renvoyée au demandeur |

Le projet utilise les filtres d'exception par défaut de NestJS; aucun filtre global personnalisé n'est enregistré dans `main.ts`.

## 8. Traçabilité

| Flux documenté | Fichiers analysés | Preuve observée |
|---|---|---|
| Parcours global | `apps/backend/src/main.ts`, `apps/backend/src/app.module.ts`, `apps/frontend/lib/api.ts`, `apps/frontend/lib/api-route.ts` | Préfixe API, validation globale, appels serveur et proxy authentifié |
| Sessions frontend | `apps/frontend/lib/auth-session.ts`, `apps/frontend/app/api/auth/login/route.ts`, `apps/frontend/app/api/auth/attendance-entry-session/route.ts` | Cookies HTTP-only distincts et sélection du jeton |
| Authentification | `apps/backend/src/modules/auth/auth.controller.ts`, `apps/backend/src/modules/auth/auth.service.ts`, `apps/backend/src/modules/auth/dto/`, `apps/backend/src/modules/auth/guards/` | Validation, JWT, utilisateur courant et contrôle d'accès |
| Employés | `apps/frontend/components/employees/admin-employees-manager.tsx`, `apps/frontend/app/api/employees/`, `apps/backend/src/modules/employees/` | Formulaires, relais HTTP, DTO, règles et écritures Prisma |
| Horaires | `apps/frontend/components/schedules/`, `apps/frontend/app/api/schedules/`, `apps/backend/src/modules/schedules/` | Gestion complète des horaires |
| Calendrier | `apps/frontend/components/calendar/`, `apps/frontend/app/api/calendar/`, `apps/backend/src/modules/calendar/` | Vue mensuelle et mutations d'événements |
| Pointage frontend | `apps/frontend/app/attendance-entry/page.tsx`, `apps/frontend/components/attendance/`, `apps/frontend/app/api/attendance/me/` | PIN, collecte des preuves et relais des actions |
| Pointage backend | `apps/backend/src/modules/attendance/attendance.controller.ts`, `apps/backend/src/modules/attendance/attendance-entry.service.ts`, `apps/backend/src/modules/attendance/attendance.service.ts`, `apps/backend/src/modules/attendance/dto/` | Identité JWT, validation, calcul et persistance |
| Sécurité de pointage | `apps/backend/src/modules/attendance/attendance-security.service.ts`, `apps/backend/src/modules/attendance/attendance-security.exception.ts`, `apps/backend/src/modules/attendance/attendance-photo-storage.service.ts` | Évaluation GPS/photo et erreurs structurées |
| Historiques | `apps/frontend/app/attendance-history/page.tsx`, `apps/frontend/components/attendance-history/`, `apps/backend/src/modules/attendance/attendance.controller.ts` | Chargement mensuel, table et détail |
| Dashboard organisation | `apps/frontend/app/dashboard/page.tsx`, `apps/frontend/components/dashboard/`, `apps/backend/src/modules/dashboard/` | Agrégats de l'organisation et projection de synthèse |
| Dashboard site | `apps/frontend/app/site/[siteId]/dashboard/page.tsx`, site-context services/controllers | Projection des données opérationnelles du site autorisé |
| Sanctions | `apps/frontend/app/sanctions/`, `apps/frontend/app/api/sanctions/`, `apps/backend/src/modules/sanctions/` | Règles persistées et résultats calculés |
| Exports | `apps/frontend/app/api/attendance/exports/monthly/route.ts`, `apps/backend/src/modules/attendance/exports/`, `apps/backend/src/modules/attendance/dto/monthly-attendance-export-query.dto.ts` | Relais binaire, rapport, CSV et PDF |
| Accès Prisma | `apps/backend/src/common/prisma/prisma.service.ts`, `apps/backend/src/common/prisma/selects.ts`, `apps/backend/prisma/schema.prisma` | Client centralisé, projections publiques et modèles persistés |
| Gestion des erreurs | `apps/frontend/lib/api-route.ts`, `apps/backend/src/common/security/app-throttler.guard.ts`, services métier | Traduction et propagation des statuts et messages |
| Documentation liée | `documentation/06-Developer-Guide/05-Frontend-NextJS.md`, `documentation/06-Developer-Guide/06-Backend-NestJS.md`, `documentation/06-Developer-Guide/07-Base-de-donnees-Prisma.md`, `documentation/06-Developer-Guide/08-Authentification-et-autorisation.md`, `documentation/06-Developer-Guide/09-Modules-metier.md` | Structure des couches et modules recoupée avec le code actif |

## 9. Observations

- Les lectures de pages serveur et les mutations issues des composants clients utilisent deux parcours frontend distincts vers la même API NestJS.
- Les jetons JWT sont transportés par des cookies HTTP-only côté frontend puis convertis en en-têtes `Authorization` lors des appels backend.
- Le terminal de pointage et la session générale utilisent des cookies séparés.
- La validation des données entrantes est centralisée par le pipe global et spécialisée par les DTO de chaque module.
- Les services appliquent les contrôles métier après la validation structurelle des DTO.
- Prisma Client est accessible aux modules métier par une instance `PrismaService` globale.
- Les réponses employés utilisent des sélections et projections qui excluent les secrets.
- Les données du tableau de bord et les sanctions mensuelles sont calculées à partir des enregistrements persistés au moment de la requête.
- Les résultats de sanction ne possèdent pas de modèle Prisma dédié.
- Les exports CSV et PDF partagent un rapport mensuel construit avant le rendu du format demandé.
- Les erreurs HTTP du backend conservent leur statut à travers les Route Handlers, tandis qu'une indisponibilité du backend devient une réponse `502` frontend.
- Aucun bus de messages, pipeline asynchrone externe ou cache applicatif n'apparaît dans les flux analysés.
