# Developer Guide — Gestion des erreurs

| Métadonnée | Valeur |
|---|---|
| Document ID | DG-011 |
| Titre | Gestion des erreurs |
| Version | 1.0 |
| Statut | Validé |
| Classification | Interne |
| Référence | Developer Guide |
| Projet | Konatech Pointage |

## 1. Présentation

La gestion des erreurs de Konatech Pointage repose sur les mécanismes standards de NestJS, complétés par la validation globale des entrées, des exceptions levées dans les gardes et services, la traduction de certaines erreurs Prisma, puis la propagation des statuts et messages par le frontend Next.js.

Le frontend traite séparément les erreurs de chargement serveur, les échecs des Route Handlers, les erreurs des formulaires et les indisponibilités des fonctions du navigateur utilisées par le pointage. Des limites d'erreur Next.js existent pour le tableau de bord et plusieurs routes fonctionnelles.

Aucun filtre d'exception global personnalisé et aucun intercepteur d'erreur personnalisé ne sont enregistrés dans le bootstrap backend. Les exceptions non interceptées par le code applicatif sont donc prises en charge par le traitement d'exception standard de NestJS.

## 2. Architecture

```text
Saisie ou action utilisateur
          |
          v
Validation et état du composant frontend
          |
          v
Route Handler Next.js ou appel serveur direct
          |
          v
API NestJS
          |
          +--> AppThrottlerGuard
          +--> JwtAuthGuard
          +--> RolesGuard
          +--> ValidationPipe / ParseUUIDPipe
          |
          v
Contrôleur -> Service -> Prisma ou service externe
          |          |
          |          +--> exception métier ou technique
          |          +--> traduction de certaines erreurs Prisma
          v
Réponse HTTP NestJS
          |
          v
Proxy Next.js ou ApiRequestError
          |
          v
Message de formulaire, état d'erreur ou error.tsx
```

| Couche | Composants impliqués | Responsabilité observée |
|---|---|---|
| Entrée backend | `ValidationPipe`, DTO, `ParseUUIDPipe` | Refuser les structures, formats et paramètres invalides |
| Sécurité backend | `AppThrottlerGuard`, `JwtAuthGuard`, `RolesGuard` | Refuser les limites dépassées, sessions invalides et rôles non autorisés |
| Services métier | Services Auth, Employees, Schedules, Calendar, Attendance et Sanctions | Lever des exceptions adaptées aux états et règles métier |
| Accès aux données | Prisma Client dans les services | Produire des erreurs connues que certains services convertissent en exceptions HTTP |
| Services techniques | Stockage photo et export PDF | Journaliser et traduire les échecs distants ou de génération |
| Couche HTTP frontend | `api.ts`, `api-route.ts`, Route Handlers | Extraire les messages, conserver les statuts ou produire une erreur de repli |
| Interface | Formulaires, composants de pointage et fichiers `error.tsx` | Afficher l'échec et permettre une nouvelle tentative ou un rechargement selon le composant |

## 3. Gestion des erreurs Backend

### 3.1 Exceptions NestJS observées

| Exception ou mécanisme | Code associé | Cas observés | Sources principales |
|---|---:|---|---|
| `BadRequestException` | 400 | Données temporelles incohérentes, PIN invalide, règles de sanction invalides, preuve photo ou GPS invalide, mois ou date incorrect | Services Attendance, Employees, Schedules, Calendar, Sanctions et sécurité du pointage |
| `UnauthorizedException` | 401 | Identifiants invalides, jeton absent ou invalide, utilisateur devenu inactif | `AuthService`, `JwtAuthGuard` |
| `ForbiddenException` | 403 | Rôle courant absent des rôles déclarés par `@Roles` | `RolesGuard` |
| `NotFoundException` | 404 | Employé, horaire, événement calendrier, présence ou règle de sanction introuvable | Services métier |
| `ConflictException` | 409 | Doublon, contrainte d'unicité, état de pointage incompatible ou conflit d'écriture | Services Employees, Schedules, Calendar et Attendance |
| `HttpException` avec `TOO_MANY_REQUESTS` | 429 | Limite de requêtes dépassée, avec message spécifique pour la connexion PIN | `AppThrottlerGuard` |
| `InternalServerErrorException` | 500 | Configuration de stockage photo absente ou échec final de génération PDF | Services de photo et d'export PDF |
| `BadGatewayException` | 502 | Échec d'envoi d'une photo vers Cloudinary après les tentatives configurées | `AttendancePhotoStorageService` |
| `GatewayTimeoutException` | 504 | Expiration du délai d'envoi d'une photo | `AttendancePhotoStorageService` |

Trois classes d'exception de sécurité existent dans `attendance-security.exception.ts` et étendent `BadRequestException`. Le service actif de sécurité lève directement des `BadRequestException` pour le selfie, la géolocalisation, la précision GPS et la justification hors zone.

### 3.2 Validation et gardes

Le bootstrap installe un `ValidationPipe` global avec les options suivantes :

- `whitelist: true` ;
- `forbidNonWhitelisted: true` ;
- `transform: true` ;
- conversion implicite activée.

Les routes non marquées `@Public()` passent par les gardes globaux. `JwtAuthGuard` vérifie l'en-tête Bearer, valide le JWT puis charge l'utilisateur. `RolesGuard` compare ensuite son `accessRole` aux métadonnées `@Roles`. `AppThrottlerGuard` applique les limites configurées et ajoute les en-têtes de limite; il journalise les blocages de la connexion PIN.

### 3.3 Erreurs levées dans les services

| Domaine | Contrôles produisant une erreur |
|---|---|
| Authentification | Employé absent ou inactif, mot de passe ou PIN invalide, JWT expiré ou invalide |
| Employés | Employé ou horaire absent, PIN interdit ou déjà utilisé, conflits d'e-mail, d'identifiant ou de relation |
| Horaires | Horaire absent, heure de fin non postérieure à l'heure de début, nom déjà utilisé |
| Calendrier | Date ou mois invalide, événement absent, doublon date/type |
| Pointage | Employé ou présence absente, instant futur, deuxième entrée ou sortie, sortie sans entrée ou avant l'entrée, écriture concurrente |
| Sécurité du pointage | Selfie absent, localisation absente lorsque requise, précision insuffisante, justification absente hors du rayon |
| Sanctions | Règle ou présence absente, nom vide, bornes incohérentes, valeurs négatives, plages actives en chevauchement |
| Export PDF | Échec du renderer Puppeteer lorsque le repli legacy n'est pas autorisé |

### 3.4 Traduction des erreurs Prisma

Les services ne traduisent pas toutes les erreurs Prisma de manière générique. Les traitements observés ciblent notamment `PrismaClientKnownRequestError` :

- `EmployeesService` transforme les conflits connus en erreurs de PIN, d'e-mail, d'identifiant employé ou d'horaire ;
- `SchedulesService` transforme le conflit de nom en `ConflictException` ;
- `CalendarService` transforme le conflit de calendrier identifié en `ConflictException` ;
- `AttendanceService` transforme le conflit d'unicité employé/date en conflit de pointage.

La création d'un employé relance jusqu'à deux fois la génération de l'identifiant lorsque le conflit porte sur cet identifiant, puis retourne un conflit si la création n'aboutit pas.

### 3.5 Filtres, intercepteurs et journaux liés aux erreurs

`apps/backend/src/main.ts` n'enregistre ni filtre d'exception global personnalisé ni intercepteur global. Aucun répertoire actif de filtre ou d'intercepteur n'est présent sous `apps/backend/src/`.

Les journaux d'erreur ou d'avertissement explicitement observés concernent :

- les blocages de limitation de débit PIN dans `AppThrottlerGuard` ;
- les tentatives et l'échec final d'envoi d'une photo dans `AttendancePhotoStorageService` ;
- les solutions de repli et échecs du rendu PDF dans `MonthlyAttendancePdfExporterService`.

## 4. Gestion des erreurs Frontend

### 4.1 Appels serveur vers le backend

`requestApi` appelle le backend puis lève `ApiRequestError` lorsque `response.ok` est faux. L'objet contient le message extrait du JSON, ou le texte de statut en repli, ainsi que le code HTTP. Les fonctions de chargement de pages dans `apps/frontend/lib/api.ts` utilisent ce mécanisme pour le tableau de bord, l'utilisateur courant, les présences, les employés, les horaires, les sanctions et le calendrier.

La résolution de l'URL backend lève aussi une `Error` lorsque les variables d'URL sont absentes ou invalides selon l'environnement, notamment pour une URL non absolue, non HTTPS en production ou sans suffixe `/api/v1`.

### 4.2 Route Handlers et proxy d'API

| Situation | Réponse du Route Handler |
|---|---|
| Aucun jeton pour le mode demandé | JSON `{ error: 'Session expiree.' }` avec statut 401 |
| Backend renvoie une erreur JSON | Extraction de `message`, y compris les tableaux, puis réponse `{ error }` avec le même statut |
| Backend inaccessible | Message fonctionnel de repli avec statut 502 |
| Configuration d'URL API invalide | Message de configuration avec statut 500 |
| Réponse fichier en erreur | Lecture du texte ou du JSON, puis réponse `{ error }` avec le statut backend |
| Réponse 401 de la session de pointage | Effacement du cookie `konatech_attendance_entry_session` |

Les Route Handlers d'authentification et de santé possèdent leur propre extraction de message autour de `fetchServerApi`. Les autres relais JSON et fichiers réutilisent les fonctions de `apps/frontend/lib/api-route.ts`.

### 4.3 Formulaires et composants interactifs

| Composant ou domaine | Traitement observé |
|---|---|
| `LoginForm` | Affiche `data.error` ou « Connexion impossible. » après une réponse non réussie |
| `AttendanceEntryPinView` | Convertit le message du PIN en retour visuel, conserve un message de repli lors d'une exception réseau |
| `EmployeeAttendanceActions` | Affiche le message du proxy, revient à l'étape de validation et distingue l'indisponibilité de connexion |
| `AttendanceSelfieCapture` | Affiche les erreurs d'absence de caméra, d'autorisation, de préparation et de capture |
| Gestion employés, horaires et calendrier | Utilise `getClientErrorMessage` pour lire le champ `error` ou choisir un message propre à l'action |
| `SanctionRulesPanel` | Lit la réponse d'erreur et affiche un message dans le panneau de règles |
| `MonthlyAttendanceExportCard` | Valide mois et année côté client, puis affiche les erreurs de réponse ou de téléchargement |
| `AttendanceDetailPanel` | Traite le statut 404, les autres échecs de chargement et ignore l'annulation `AbortError` comme erreur visible |
| `AttendanceEntrySessionButton` | Affiche l'échec de fermeture de la session PIN |

### 4.4 Limites d'erreur Next.js

Des fichiers `error.tsx` sont présents pour :

- la racine du tableau de bord ;
- `/attendance-entry` ;
- `/calendar` ;
- `/employees` ;
- `/my-attendance` ;
- `/schedules`.

Ces composants clients affichent `error.message`, proposent `reset()` et un rechargement par navigation vers la route concernée. Les formulations affichées indiquent qu'aucune action ou donnée n'a été modifiée par l'erreur de rendu.

## 5. Validation des données

### 5.1 Validation backend

| Famille | Validations observées |
|---|---|
| Auth | E-mail, chaîne et longueur du mot de passe, PIN exactement composé de quatre chiffres |
| Employees | Types, longueurs, e-mail, UUID, rôle d'accès, booléens, mot de passe et règles communes du PIN |
| Schedules | Heures `HH:mm`, jours autorisés et uniques, tableau non vide, marge comprise entre 0 et 180 |
| Calendar | Mois `YYYY-MM`, date ISO, longueurs et types actifs de jours fériés |
| Attendance | UUID, date ISO, note, mois, bornes année/mois, format d'export, coordonnées GPS, précision et Data URL de photo |
| Sanctions | Mois, chaînes, booléens, entiers et minimum zéro pour les valeurs modifiables |

Les DTO emploient `class-validator`. `class-transformer` convertit notamment certaines valeurs numériques, les objets de preuve imbriqués et des chaînes vides en valeur nulle ou absente. `PartialType` rend les champs de création d'horaire facultatifs dans `UpdateScheduleDto`.

### 5.2 Validation frontend

La validation frontend observée complète la validation backend sans la remplacer :

- les formulaires employés et horaires contrôlent les champs avant envoi et réaffichent les erreurs d'API ;
- le terminal PIN n'envoie la valeur que lorsque son état permet la soumission ;
- l'export mensuel vérifie le mois et l'année avant la requête ;
- la capture de selfie vérifie la disponibilité du navigateur et l'état de la caméra ;
- le pointage construit les coordonnées, la précision, la photo et le commentaire avant l'envoi.

## 6. Cycle d'une erreur

```text
Client
  |
  | saisie, navigation ou action
  v
Frontend Next.js
  |
  +--> validation locale ou erreur navigateur -> message du composant
  |
  v
Route Handler / appel API serveur
  |
  +--> jeton absent -> 401
  +--> réseau indisponible -> 502
  +--> configuration URL invalide -> 500
  |
  v
Backend NestJS
  |
  +--> limite de débit -> 429
  +--> authentification / rôle -> 401 ou 403
  +--> ValidationPipe / ParseUUIDPipe -> 400
  |
  v
Contrôleur -> Service -> Prisma ou service technique
                         |
                         +--> 400 / 404 / 409 / 500 / 502 / 504
  |
  v
Réponse HTTP standard NestJS
  |
  v
Même statut relayé par le frontend
  |
  +--> message dans le formulaire ou le composant
  +--> ApiRequestError pendant un rendu serveur
  +--> limite error.tsx pour une erreur de rendu
```

Pour les appels JSON relayés, le frontend cherche d'abord un champ `message` dans la réponse backend. Un tableau de messages de validation est joint par des virgules. La réponse exposée au composant utilise le champ `error`. Pour un appel serveur direct, `requestApi` conserve le statut dans `ApiRequestError`.

## 7. Codes de réponse

| Code | Origine observée | Cas principal |
|---:|---|---|
| 200 | Contrôleurs de lecture ou modification et Route Handlers qui conservent le statut | Requête réussie |
| 201 | Méthodes `POST` NestJS sans code remplacé | Création ou pointage réussi |
| 302 | `AttendanceController.getFixedEntryPoint` | Redirection de `/attendance/entry` vers l'URL fixe de pointage |
| 400 | `ValidationPipe`, `ParseUUIDPipe`, `BadRequestException` | Entrée ou règle métier invalide |
| 401 | `JwtAuthGuard`, `AuthService`, proxy frontend sans session | Authentification absente ou invalide |
| 403 | `RolesGuard` | Rôle non autorisé |
| 404 | `NotFoundException` et traitement du détail de sanction frontend | Ressource absente |
| 409 | `ConflictException` | Doublon, état concurrent ou transition de pointage impossible |
| 429 | `AppThrottlerGuard` | Limitation de débit atteinte |
| 500 | Exceptions internes backend ou erreur de configuration du proxy frontend | Génération/configuration interne impossible |
| 502 | `BadGatewayException` ou `createBackendFailureResponse` | Échec Cloudinary ou backend inaccessible depuis le frontend |
| 504 | `GatewayTimeoutException` | Délai d'envoi de photo dépassé |

## 8. Traçabilité

| Mécanisme | Fichiers analysés | Preuve observée |
|---|---|---|
| Pipeline backend | `apps/backend/src/main.ts`, `apps/backend/src/app.module.ts` | Pipe global et gardes globaux |
| Authentification et autorisation | `apps/backend/src/modules/auth/auth.service.ts`, `apps/backend/src/modules/auth/guards/jwt-auth.guard.ts`, `apps/backend/src/modules/auth/guards/roles.guard.ts` | Exceptions 401 et 403 |
| Limitation de débit | `apps/backend/src/common/security/app-throttler.guard.ts`, `apps/backend/src/modules/auth/constants/attendance-entry.constants.ts` | Statut 429, en-têtes et journal de blocage PIN |
| Validation DTO | `apps/backend/src/modules/*/dto/`, `apps/backend/src/common/validation/pin-code.validation.ts` | Décorateurs `class-validator` et transformations |
| Erreurs employés | `apps/backend/src/modules/employees/employees.service.ts` | Erreurs de validation, absence et conflits Prisma |
| Erreurs horaires | `apps/backend/src/modules/schedules/schedules.service.ts` | Cohérence des heures, absence et unicité |
| Erreurs calendrier | `apps/backend/src/modules/calendar/calendar.service.ts` | Validation des périodes, absence et doublon |
| Erreurs pointage | `apps/backend/src/modules/attendance/attendance.service.ts`, `apps/backend/src/modules/attendance/attendance-security.service.ts` | États incompatibles et preuves de sécurité |
| Stockage photo | `apps/backend/src/modules/attendance/attendance-photo-storage.service.ts` | Tentatives, journaux et erreurs 400, 500, 502 et 504 |
| Export PDF | `apps/backend/src/modules/attendance/exports/monthly-attendance-pdf-exporter.service.ts` | Journaux, solutions de repli et erreur 500 |
| Erreurs sanctions | `apps/backend/src/modules/sanctions/sanctions.service.ts` | Absence, bornes et chevauchements |
| Appels API frontend | `apps/frontend/lib/api.ts` | `ApiRequestError`, extraction de message et validation des URL |
| Proxy frontend | `apps/frontend/lib/api-route.ts`, `apps/frontend/app/api/` | Conservation des statuts, messages de repli et suppression de session PIN |
| Messages clients | `apps/frontend/lib/client-error.ts`, `apps/frontend/components/auth/login-form.tsx`, `apps/frontend/components/attendance/`, `apps/frontend/components/employees/`, `apps/frontend/components/schedules/`, `apps/frontend/components/calendar/`, `apps/frontend/components/sanctions/` | Affichage contextualisé des échecs |
| Erreurs de rendu | `apps/frontend/app/error.tsx`, `apps/frontend/app/attendance-entry/error.tsx`, `apps/frontend/app/calendar/error.tsx`, `apps/frontend/app/employees/error.tsx`, `apps/frontend/app/my-attendance/error.tsx`, `apps/frontend/app/schedules/error.tsx` | Limites Next.js avec nouvelle tentative et rechargement |
| Contraintes persistantes | `apps/backend/prisma/schema.prisma` | Contraintes d'unicité utilisées par les traductions Prisma |
| Documentation liée | `documentation/06-Developer-Guide/06-Backend-NestJS.md`, `documentation/06-Developer-Guide/08-Authentification-et-autorisation.md`, `documentation/06-Developer-Guide/10-Flux-de-donnees.md` | Architecture backend, sécurité et propagation des flux |

## 9. Observations

- La validation structurelle est centralisée dans un pipe global et complétée par les contrôles des services.
- Les services utilisent les classes d'exception HTTP de NestJS pour représenter les erreurs métier observées.
- Certaines erreurs Prisma connues sont converties en messages propres au domaine concerné.
- Aucun filtre d'exception personnalisé et aucun intercepteur d'erreur personnalisé ne sont enregistrés dans le backend.
- Les Route Handlers frontend conservent le statut des erreurs reçues du backend.
- Les réponses d'erreur destinées aux composants frontend utilisent principalement un champ `error`, tandis que NestJS produit un champ `message`.
- Les appels serveur directs matérialisent les réponses non réussies sous forme d'`ApiRequestError`.
- Les erreurs de rendu disposent de limites dédiées pour six zones de l'App Router.
- Les erreurs liées à la caméra et au réseau sont traitées localement par les composants de pointage.
- Les journaux d'erreur explicites sont concentrés sur la limitation de débit PIN, le stockage photo et la génération PDF.
