# Module Employés

## 1. Présentation du module

### 1.1 Objectif

Le module Employés fournit le registre des comptes utilisateurs de Konatech Pointage et les opérations administratives associées. Il permet de consulter les comptes, créer un employé ou un administrateur, modifier ses informations, activer ou désactiver son compte et gérer son affectation à un planning.

Le terme « employé » désigne ici le modèle Prisma `Employee`, qui porte aussi bien les comptes ayant le rôle d’accès `EMPLOYEE` que ceux ayant le rôle d’accès `ADMIN`. Le module ne maintient pas deux modèles de compte distincts.

Fichiers de référence :

- `apps/backend/src/modules/employees/employees.module.ts`
- `apps/backend/src/modules/employees/employees.controller.ts`
- `apps/backend/src/modules/employees/employees.service.ts`
- `apps/backend/prisma/schema.prisma`
- `apps/frontend/app/employees/page.tsx`

### 1.2 Rôle architectural

Le module expose une API REST NestJS sous `/api/v1/employees`. Cette API est consommée par la page Next.js `/employees` à travers des Route Handlers situés sous `/api/employees`. La persistance repose sur `PrismaService` et le modèle `Employee`.

Le module assure les responsabilités suivantes :

- lecture de la liste des comptes et d'un compte par identifiant ;
- création d'un compte et génération de son identifiant métier ;
- modification des attributs du compte ;
- activation et désactivation ;
- affectation d'un rôle métier libre, d'un département libre et d'un planning existant ;
- gestion du rôle d'accès applicatif `ADMIN` ou `EMPLOYEE` ;
- hachage des mots de passe et des codes PIN ;
- contrôle applicatif de l'unicité des codes PIN ;
- suppression des secrets PIN dans les réponses ;
- émission de traces d'audit pour les mutations administratives.

Le module n'expose aucune opération de suppression d'un employé. Aucun contrôleur ou service de suppression n'est présent dans son arborescence.

### 1.3 Périmètre fonctionnel constaté

| Capacité | Implémentation |
|---|---|
| Liste des comptes | `GET /api/v1/employees` |
| Détail d'un compte | `GET /api/v1/employees/:id` |
| Création | `POST /api/v1/employees` |
| Modification générale | `PATCH /api/v1/employees/:id` |
| Activation/désactivation | `PATCH /api/v1/employees/:id/status` |
| Affectation d'un rôle métier | `PATCH /api/v1/employees/:id/role` |
| Affectation d'un département | `PATCH /api/v1/employees/:id/department` |
| Affectation/retrait d'un planning | `PATCH /api/v1/employees/:id/schedule` |
| Interface d'administration | `/employees` |
| Suppression | Non trouvée dans le code du module |

Fichiers de référence : `apps/backend/src/modules/employees/employees.controller.ts`, `apps/frontend/components/employees/admin-employees-manager.tsx`.

## 2. Vue d'ensemble

### 2.1 Place dans l'architecture

`EmployeesModule` est importé par le module racine NestJS. Il déclare `EmployeesController` et `EmployeesService`. Il ne déclare ni import local ni export. `PrismaModule` et `AuditLogModule` sont enregistrés globalement par l'application, ce qui rend leurs fournisseurs accessibles au module Employés sans import explicite dans `employees.module.ts`.

Le frontend dispose d'une page serveur protégée. Elle obtient l'utilisateur courant, vérifie le rôle `ADMIN`, charge les employés et les plannings en parallèle, puis transmet ces données au composant client `AdminEmployeesManager`.

```text
Navigateur administrateur
        |
        | GET /employees
        v
Page serveur Next.js
 apps/frontend/app/employees/page.tsx
        |
        +---- vérification session + rôle ADMIN
        |
        +---- getEmployeesData(token)
                 |
                 +---- GET backend /employees
                 +---- GET backend /schedules
        |
        v
AdminEmployeesManager (état et actions client)
        |
        | /api/employees/*
        v
Route Handlers Next.js
        |
        | Bearer token issu de la session
        v
EmployeesController (NestJS)
        |
        +---- EmployeesService --------> PrismaService ----> PostgreSQL
        |
        +---- AuditLogService ---------> journal NestJS
```

### 2.2 Interactions avec les autres modules

| Module ou couche | Interaction constatée |
|---|---|
| Authentification | `JwtAuthGuard` authentifie toutes les routes par défaut ; `RolesGuard` applique `@Roles(ADMIN)` ; `@CurrentUser()` fournit l'acteur aux mutations. |
| Plannings | Le service vérifie directement l'existence d'un `Schedule` via Prisma et connecte ou déconnecte la relation. La page charge également la liste des plannings. |
| Pointage | Le modèle `Employee` possède une collection `attendances`; le module Employés ne lit ni ne modifie directement ces enregistrements. |
| Calendrier | Le modèle `Employee` possède une collection `calendarEntries`; le module Employés ne l'utilise pas directement. |
| Audit | Le contrôleur appelle `AuditLogService.logAdminAction` après chaque mutation réussie. |
| Prisma | Toutes les lectures et écritures métier du service passent par `PrismaService`. |
| Frontend Auth | `requireCurrentUser()` et `getSessionToken()` protègent et alimentent la page serveur. |
| Proxy frontend | Les Route Handlers transmettent les requêtes au backend avec le jeton de session. |

Fichiers de référence :

- `apps/backend/src/app.module.ts`
- `apps/backend/src/modules/auth/auth.module.ts`
- `apps/backend/src/modules/auth/guards/jwt-auth.guard.ts`
- `apps/backend/src/modules/auth/guards/roles.guard.ts`
- `apps/backend/src/common/audit/audit-log.service.ts`
- `apps/backend/prisma/schema.prisma`
- `apps/frontend/lib/api.ts`
- `apps/frontend/lib/api-route.ts`

## 3. Organisation des fichiers

### 3.1 Arborescence backend

```text
apps/backend/src/modules/employees/
├── dto/
│   ├── assign-employee-department.dto.ts
│   ├── assign-employee-role.dto.ts
│   ├── assign-employee-schedule.dto.ts
│   ├── create-employee.dto.ts
│   ├── update-employee-status.dto.ts
│   └── update-employee.dto.ts
├── employees.controller.ts
├── employees.module.ts
└── employees.service.ts
```

| Élément | Rôle |
|---|---|
| `employees.module.ts` | Déclare le contrôleur et le service NestJS. |
| `employees.controller.ts` | Déclare les routes REST, applique le rôle administrateur et déclenche l'audit des mutations. |
| `employees.service.ts` | Contient les lectures, écritures, contrôles métier, hachages et transformations de réponse. |
| `dto/create-employee.dto.ts` | Contrat et validation de création. |
| `dto/update-employee.dto.ts` | Contrat et validation de modification partielle. |
| `dto/update-employee-status.dto.ts` | Contrat de changement de statut. |
| `dto/assign-employee-role.dto.ts` | Contrat d'affectation du rôle métier. |
| `dto/assign-employee-department.dto.ts` | Contrat d'affectation ou de retrait du département. |
| `dto/assign-employee-schedule.dto.ts` | Contrat d'affectation ou de retrait du planning. |

### 3.2 Fichiers backend transverses utilisés

```text
apps/backend/
├── prisma/
│   └── schema.prisma
└── src/
    ├── common/
    │   ├── audit/
    │   │   └── audit-log.service.ts
    │   ├── prisma/
    │   │   ├── prisma.service.ts
    │   │   └── selects.ts
    │   ├── security/
    │   │   └── password.util.ts
    │   └── validation/
    │       └── pin-code.validation.ts
    ├── modules/auth/
    │   ├── decorators/
    │   │   ├── current-user.decorator.ts
    │   │   └── roles.decorator.ts
    │   ├── guards/
    │   │   ├── jwt-auth.guard.ts
    │   │   └── roles.guard.ts
    │   └── auth.module.ts
    ├── app.module.ts
    └── main.ts
```

`selects.ts` définit la projection partagée d'un employé avec son planning. `password.util.ts` fournit les fonctions scrypt pour les mots de passe et les PIN. `pin-code.validation.ts` centralise le format et les PIN interdits. `main.ts` active la validation DTO globale avec suppression des propriétés non déclarées, rejet des propriétés supplémentaires et conversion implicite.

### 3.3 Arborescence frontend

```text
apps/frontend/
├── app/
│   ├── api/employees/
│   │   ├── [id]/
│   │   │   ├── status/
│   │   │   │   └── route.ts
│   │   │   └── route.ts
│   │   └── route.ts
│   └── employees/
│       ├── error.tsx
│       ├── loading.tsx
│       └── page.tsx
├── components/
│   └── employees/
│       ├── admin-employees-manager.tsx
│       └── employee-manager.helpers.ts
├── lib/
│   ├── api-route.ts
│   ├── api.ts
│   ├── auth.ts
│   ├── auth-session.ts
│   └── client-error.ts
└── middleware.ts
```

| Élément | Rôle |
|---|---|
| `app/employees/page.tsx` | Page serveur, contrôle d'accès, chargement initial et composition de l'écran. |
| `app/employees/loading.tsx` | État visuel de chargement de la route. |
| `app/employees/error.tsx` | Limite d'erreur client avec actions de nouvelle tentative et rechargement. |
| `admin-employees-manager.tsx` | Registre, statistiques, filtres, formulaire et mutations côté client. |
| `employee-manager.helpers.ts` | Types d'état, valeurs initiales, mappage formulaire et métadonnées d'affichage. |
| `app/api/employees/route.ts` | Proxy `GET` et `POST` vers `/employees` du backend. |
| `app/api/employees/[id]/route.ts` | Proxy `GET` et `PATCH` vers `/employees/:id`. |
| `app/api/employees/[id]/status/route.ts` | Proxy `PATCH` vers `/employees/:id/status`. |
| `lib/api.ts` | Types frontend et chargement serveur conjoint employés/plannings. |
| `lib/api-route.ts` | Fonctions communes de proxy authentifié vers le backend. |
| `middleware.ts` | Redirection vers `/login` en absence du cookie de session sur `/employees`. |

## 4. Modèle métier

### 4.1 Entité Employee

L'entité métier principale est `Employee`. Dans le module, elle représente un compte authentifiable associé à une identité professionnelle.

| Propriété utilisée | Responsabilité métier dans le module |
|---|---|
| `id` | Identifiant technique UUID utilisé dans les routes et relations. |
| `employeeIdentifier` | Identifiant métier généré automatiquement sous la forme `EMP-AAAA-NNN`. |
| `firstName`, `lastName` | Identité affichée de la personne. |
| `email` | Identifiant de connexion unique. |
| `role` | Libellé métier libre, limité à 80 caractères par les DTO. |
| `accessRole` | Niveau d'accès applicatif enum : `ADMIN` ou `EMPLOYEE`. |
| `passwordHash` | Secret d'authentification haché, jamais renvoyé par les projections du module. |
| `pinCode` | Champ de compatibilité contenant éventuellement un ancien PIN en clair. |
| `pinCodeHash` | PIN haché utilisé pour les nouvelles créations et modifications. |
| `department` | Libellé facultatif libre ; aucune entité Département n'est appelée par le module. |
| `isActive` | État actif ou inactif du compte. |
| `scheduleId` | Clé étrangère facultative vers un planning. |
| `schedule` | Planning facultatif inclus dans les réponses du module. |
| `createdAt`, `updatedAt` | Horodatages gérés par Prisma. |

Le champ Prisma `employeeCode` existe également comme valeur facultative et unique, mais il n'est ni renseigné ni modifié par `EmployeesService`. Le service génère et utilise `employeeIdentifier`.

Fichiers de référence : `apps/backend/prisma/schema.prisma`, `apps/backend/src/common/prisma/selects.ts`, `apps/backend/src/modules/employees/employees.service.ts`.

### 4.2 Rôles distincts

Deux notions de rôle coexistent :

- `role` est une chaîne métier libre, par exemple un intitulé de poste ;
- `accessRole` est l'enum de sécurité `ADMIN | EMPLOYEE`.

L'endpoint spécialisé `PATCH /employees/:id/role` modifie exclusivement le champ métier `role`. Le rôle de sécurité est modifié par l'endpoint général `PATCH /employees/:id` au moyen de `UpdateEmployeeDto.accessRole`.

### 4.3 Relation au planning

Un employé possède au plus un planning et un planning peut être associé à plusieurs employés. La relation est facultative. La suppression d'un planning positionne la clé étrangère de l'employé à `null` par la règle Prisma `onDelete: SetNull`.

Avant toute connexion explicite, le service recherche le planning par UUID. Une absence provoque `NotFoundException('Assigned schedule not found.')`. Le retrait est réalisé par `schedule.disconnect`.

### 4.4 Relations portées mais non pilotées

Le modèle `Employee` porte des relations vers les pointages (`attendances`) et les entrées de calendrier (`calendarEntries`). Aucune méthode du contrôleur ou du service Employés ne manipule directement ces collections. Elles appartiennent aux modèles et modules correspondants.

### 4.5 Invariants métier appliqués

- l'adresse électronique est unique au niveau Prisma ;
- `employeeIdentifier` est unique au niveau Prisma et généré par le service ;
- un compte `EMPLOYEE` doit disposer d'un PIN lors de sa création ;
- un compte `ADMIN` ne conserve ni `pinCode` ni `pinCodeHash` ;
- un PIN accepté contient exactement quatre chiffres ;
- `0000`, `1111`, `1234`, `4321` et `9999` sont rejetés ;
- un nouveau PIN est comparé aux PIN historiques en clair et aux PIN hachés de tous les autres comptes `EMPLOYEE` ;
- le mot de passe de création comporte entre 8 et 128 caractères ;
- un planning affecté doit exister ;
- les secrets PIN sont retirés de la réponse et remplacés par `pinConfigured`.

Fichiers de référence : `apps/backend/src/common/validation/pin-code.validation.ts`, `apps/backend/src/common/security/password.util.ts`, `apps/backend/src/modules/employees/employees.service.ts`, `apps/backend/prisma/schema.prisma`.

## 5. Contrôleurs

### 5.1 EmployeesController

`EmployeesController` est l'unique contrôleur du module. Le préfixe global `/api/v1`, configuré dans `main.ts`, s'ajoute au chemin `employees` du contrôleur. Le décorateur de classe `@Roles(AccessRole.ADMIN)` s'applique à tous ses endpoints.

| Méthode | Route complète backend | DTO / validation | Permission | Service appelé |
|---|---|---|---|---|
| GET | `/api/v1/employees` | Aucune charge utile | `ADMIN` | `findAll()` |
| GET | `/api/v1/employees/:id` | `id` analysé par `ParseUUIDPipe` | `ADMIN` | `findOne(id)` |
| POST | `/api/v1/employees` | `CreateEmployeeDto` | `ADMIN` | `create(dto)` |
| PATCH | `/api/v1/employees/:id` | UUID + `UpdateEmployeeDto` | `ADMIN` | `update(id, dto)` |
| PATCH | `/api/v1/employees/:id/status` | UUID + `UpdateEmployeeStatusDto` | `ADMIN` | `updateStatus(id, dto)` |
| PATCH | `/api/v1/employees/:id/role` | UUID + `AssignEmployeeRoleDto` | `ADMIN` | `assignRole(id, dto)` |
| PATCH | `/api/v1/employees/:id/department` | UUID + `AssignEmployeeDepartmentDto` | `ADMIN` | `assignDepartment(id, dto)` |
| PATCH | `/api/v1/employees/:id/schedule` | UUID + `AssignEmployeeScheduleDto` | `ADMIN` | `assignSchedule(id, dto)` |

### 5.2 Dépendances du contrôleur

Le constructeur injecte :

- `EmployeesService`, qui exécute la logique métier et la persistance ;
- `AuditLogService`, qui journalise les actions administratives.

Les méthodes de mutation reçoivent l'acteur authentifié via `@CurrentUser()`. Le journal d'audit est appelé après la résolution réussie du service.

| Action d'audit | Endpoint déclencheur | Métadonnées |
|---|---|---|
| `employee.create` | POST collection | email, accessRole, scheduleId, isActive |
| `employee.update` | PATCH général | noms des champs reçus |
| `employee.status.update` | PATCH status | isActive |
| `employee.role.assign` | PATCH role | role |
| `employee.department.assign` | PATCH department | department |
| `employee.schedule.assign` | PATCH schedule | scheduleId |

Les endpoints de lecture ne produisent pas d'appel à `AuditLogService`.

### 5.3 Validation du transport

Les identifiants de route sont validés comme UUID par `ParseUUIDPipe`. Les corps sont validés par le `ValidationPipe` global :

- `whitelist: true` ;
- `forbidNonWhitelisted: true` ;
- `transform: true` ;
- conversion implicite activée.

Une propriété qui n'appartient pas au DTO provoque donc un rejet. Les transformations déclarées dans les DTO convertissent certaines chaînes vides en `null`.

Fichiers de référence : `apps/backend/src/modules/employees/employees.controller.ts`, `apps/backend/src/main.ts`.

## 6. Services

### 6.1 EmployeesService

`EmployeesService` est l'unique service propre au module. Sa seule dépendance injectée est `PrismaService`. Les fonctions de hachage et de validation du PIN sont importées comme fonctions utilitaires.

### 6.2 Méthodes publiques

| Méthode | Responsabilité | Dépendances directes |
|---|---|---|
| `findAll()` | Lit tous les comptes, triés par création décroissante puis nom/prénom croissants ; transforme chaque réponse. | `prisma.employee.findMany` |
| `findOne(id)` | Lit un compte ; produit une erreur 404 s'il n'existe pas. | `prisma.employee.findUnique` |
| `create(dto)` | Valide le PIN selon le rôle d'accès, contrôle le planning, hache le mot de passe, génère l'identifiant et crée dans une transaction. | Prisma, `hashPassword`, gestion PIN |
| `update(id, dto)` | Contrôle l'existence, le planning éventuel et le PIN, construit une modification partielle, puis met à jour. | Prisma, hachage conditionnel |
| `updateStatus(id, dto)` | Modifie `isActive`. | `updateEmployeeFields` |
| `assignRole(id, dto)` | Modifie le libellé métier `role`. | `updateEmployeeFields` |
| `assignDepartment(id, dto)` | Affecte une chaîne ou `null` au département. | `updateEmployeeFields` |
| `assignSchedule(id, dto)` | Vérifie puis connecte un planning, ou déconnecte la relation. | Prisma Schedule et Employee |

### 6.3 Méthodes internes

| Méthode | Fonction |
|---|---|
| `updateEmployeeFields` | Chemin commun des mutations spécialisées : contrôle d'existence, mise à jour, transformation de réponse et traduction des erreurs Prisma. |
| `buildEmployeeUpdateData` | Construit `Prisma.EmployeeUpdateInput`, conserve ou remplace le PIN, hache le nouveau mot de passe et connecte/déconnecte le planning. |
| `ensureEmployeeExists` | Charge l'identifiant, le rôle d'accès et les secrets PIN ; lève une 404 si absent. |
| `ensureScheduleExists` | Vérifie un UUID de planning directement dans Prisma. |
| `handlePersistenceError` | Traduit certaines erreurs Prisma `P2002` et `P2003` en exceptions HTTP. |
| `isEmployeeIdentifierConflict` | Détecte une collision unique sur `employeeIdentifier`. |
| `generateEmployeeIdentifier` | Calcule le prochain identifiant annuel `EMP-AAAA-NNN`. |
| `mapEmployeeResponse` | Retire `pinCode` et `pinCodeHash`, puis expose `pinConfigured`. |
| `resolvePinSecret` | Applique les règles de PIN selon `accessRole`, la création ou la modification. |
| `ensurePinCodeAvailable` | Compare le PIN candidat aux valeurs historiques et hachées des autres employés. |

### 6.4 Génération de l'identifiant

La création s'exécute dans une transaction Prisma. Le service :

1. détermine l'année UTC ;
2. recherche tous les identifiants commençant par `EMP-<année>-` ;
3. extrait la séquence numérique maximale ;
4. ajoute un ;
5. complète la séquence sur au moins trois chiffres ;
6. crée l'employé avec cet identifiant.

En cas de collision Prisma `P2002` sur `employeeIdentifier`, la transaction est retentée jusqu'à trois tentatives au total. Après les tentatives, une `ConflictException` est produite.

### 6.5 Gestion des secrets

Les mots de passe et nouveaux PIN utilisent `scrypt` avec :

- un sel aléatoire de 16 octets encodé en hexadécimal ;
- une clé dérivée de 64 octets ;
- un stockage au format `scrypt:<sel>:<hash>`.

Lors d'une modification, l'absence de mot de passe conserve le hash existant. Un mot de passe fourni est haché avant l'écriture.

Pour un administrateur, `resolvePinSecret` force les deux champs PIN à `null`. Pour un employé, le service conserve le secret existant en modification si aucun nouveau secret valide n'est fourni selon les branches autorisées. Les nouvelles valeurs sont stockées dans `pinCodeHash`, avec `pinCode` positionné à `null`.

### 6.6 Projection des réponses

La projection partagée inclut les champs publics de l'employé ainsi que son planning. Le service ajoute temporairement `pinCode` et `pinCodeHash` à sa projection interne pour calculer `pinConfigured`. Il retire ensuite systématiquement ces deux valeurs avant de retourner l'objet.

Les tests end-to-end vérifient explicitement l'absence des secrets PIN dans les réponses de liste, de détail, de création et de mutation.

### 6.7 Diagramme d'interactions

```text
EmployeesController
        |
        v
EmployeesService
   |         |                  |
   |         |                  +--> password.util.ts
   |         |                       hashPassword / hashPinCode /
   |         |                       verifyPinCode
   |         |
   |         +---------------------> pin-code.validation.ts
   |
   v
PrismaService
   |
   +--> Employee
   |      création, lecture, mise à jour,
   |      contrôle des identifiants et des PIN
   |
   +--> Schedule
          contrôle d'existence et relation

EmployeesController
        |
        +--------------------------> AuditLogService
                                      après mutation réussie
```

Fichiers de référence :

- `apps/backend/src/modules/employees/employees.service.ts`
- `apps/backend/src/common/prisma/selects.ts`
- `apps/backend/src/common/security/password.util.ts`
- `apps/backend/src/common/validation/pin-code.validation.ts`
- `apps/backend/test/app.e2e-spec.ts`

## 7. DTO

### 7.1 CreateEmployeeDto

Utilisé par `POST /employees`.

| Champ | Présence | Validation |
|---|---|---|
| `pinCode` | Facultatif au niveau DTO | chaîne, quatre chiffres, hors liste interdite ; le service le rend obligatoire pour `EMPLOYEE` |
| `firstName` | Obligatoire | chaîne, maximum 80 caractères |
| `lastName` | Obligatoire | chaîne, maximum 80 caractères |
| `email` | Obligatoire | adresse électronique valide |
| `role` | Obligatoire | chaîne, maximum 80 caractères |
| `accessRole` | Facultatif | enum `AccessRole`; valeur métier par défaut `EMPLOYEE` dans le service |
| `password` | Obligatoire | chaîne, 8 à 128 caractères |
| `department` | Facultatif | chaîne, maximum 80 caractères |
| `isActive` | Facultatif | booléen ; valeur métier par défaut `true` |
| `scheduleId` | Facultatif | UUID |

### 7.2 UpdateEmployeeDto

Utilisé par `PATCH /employees/:id`. Tous ses champs sont facultatifs.

| Champ | Validation et sémantique |
|---|---|
| `pinCode` | chaîne vide transformée en `null`; sinon quatre chiffres et hors liste interdite ; la conservation réelle est résolue par le service |
| `firstName`, `lastName`, `role` | chaîne, maximum 80 caractères |
| `email` | adresse électronique valide |
| `accessRole` | enum `AccessRole` |
| `password` | chaîne, 8 à 128 caractères ; haché uniquement s'il est fourni et non vide dans le service |
| `department` | chaîne vide transformée en `null`; chaîne maximale de 80 caractères ou `null` |
| `isActive` | booléen |
| `scheduleId` | chaîne vide transformée en `null`; UUID ou `null` |

### 7.3 UpdateEmployeeStatusDto

Utilisé par `PATCH /employees/:id/status`. Il contient uniquement `isActive`, obligatoire et booléen.

### 7.4 AssignEmployeeRoleDto

Utilisé par `PATCH /employees/:id/role`. Il contient `role`, obligatoire, chaîne de 80 caractères au maximum. Il modifie le rôle métier, pas `accessRole`.

### 7.5 AssignEmployeeDepartmentDto

Utilisé par `PATCH /employees/:id/department`. La chaîne vide est transformée en `null`. La valeur est facultative, de type chaîne limitée à 80 caractères lorsqu'elle n'est pas nulle.

### 7.6 AssignEmployeeScheduleDto

Utilisé par `PATCH /employees/:id/schedule`. La chaîne vide est transformée en `null`. Une valeur non nulle doit être un UUID. `null` provoque la déconnexion du planning.

Fichiers de référence : tous les fichiers de `apps/backend/src/modules/employees/dto/`.

## 8. Sécurité

### 8.1 Authentification backend

`AuthModule` enregistre `JwtAuthGuard` comme `APP_GUARD`. Les routes sont donc protégées globalement, sauf présence du décorateur public prévu par l'authentification. Le contrôleur Employés ne porte aucun décorateur public.

Le garde extrait un Bearer token, le vérifie par `AuthService`, puis associe l'utilisateur authentifié à la requête. L'absence ou l'invalidité du token provoque une erreur d'authentification.

### 8.2 Autorisation backend

`RolesGuard` est également enregistré comme `APP_GUARD`. Il lit les métadonnées produites par `@Roles`. `EmployeesController` déclare `@Roles(AccessRole.ADMIN)` au niveau de la classe ; cette restriction couvre ses huit routes.

Le test end-to-end vérifie qu'un compte `EMPLOYEE` reçoit un statut HTTP 403 sur `GET /api/v1/employees`, tandis qu'un compte `ADMIN` reçoit la liste.

### 8.3 Contrôle frontend

La sécurité de l'interface comporte trois niveaux constatés :

1. `middleware.ts` exige la présence du cookie de session sur `/employees` et redirige sinon vers `/login` ;
2. `page.tsx` appelle `requireCurrentUser()` ;
3. la page redirige tout utilisateur dont `accessRole` n'est pas `ADMIN` vers `/my-attendance`.

La page exige ensuite un jeton de session pour charger les données ; en son absence, elle redirige vers `/login`.

Ces contrôles frontend complètent les guards backend ; ils ne remplacent pas l'autorisation de l'API.

### 8.4 Protection des secrets

- le mot de passe est haché avant persistance ;
- les nouveaux PIN sont hachés avant persistance ;
- la comparaison d'un PIN haché utilise `timingSafeEqual` après dérivation scrypt ;
- `passwordHash` n'appartient pas à la projection publique ;
- `pinCode` et `pinCodeHash` sont retirés par `mapEmployeeResponse` ;
- seul le booléen `pinConfigured` est exposé.

### 8.5 Audit des mutations

Le contrôleur transmet à l'audit l'identité de l'administrateur issue de `@CurrentUser()`, le type d'action, la ressource et des métadonnées ciblées. `AuditLogService` sérialise cette entrée dans un appel `Logger.warn`. Aucun modèle Prisma de journal d'audit n'est appelé par ce service.

Fichiers de référence :

- `apps/backend/src/modules/auth/auth.module.ts`
- `apps/backend/src/modules/auth/guards/jwt-auth.guard.ts`
- `apps/backend/src/modules/auth/guards/roles.guard.ts`
- `apps/backend/src/modules/employees/employees.controller.ts`
- `apps/backend/src/common/audit/audit-log.service.ts`
- `apps/frontend/middleware.ts`
- `apps/frontend/app/employees/page.tsx`
- `apps/backend/test/app.e2e-spec.ts`

## 9. Flux techniques

### 9.1 Chargement du registre

```text
Administrateur       Next.js page       API NestJS       EmployeesService       Prisma
      |                    |                 |                    |                 |
      | GET /employees     |                 |                    |                 |
      |------------------->|                 |                    |                 |
      |                    | vérifie session et ADMIN             |                 |
      |                    | GET /employees  |                    |                 |
      |                    |---------------->| findAll()          |                 |
      |                    |                 |------------------->| findMany        |
      |                    |                 |                    |---------------->|
      |                    |                 |                    |<----------------|
      |                    |                 |                    | retire PIN       |
      |                    |                 |<-------------------|                 |
      |                    | GET /schedules en parallèle          |                 |
      |                    |<----------------|                    |                 |
      |                    | rend AdminEmployeesManager           |                 |
      |<-------------------|                 |                    |                 |
```

`getEmployeesData(token)` exécute les chargements des employés et des plannings avec `Promise.all`. La page calcule également le nombre de comptes administrateurs. Le composant client initialise son propre état à partir des deux collections.

### 9.2 Recherche et filtrage

Le filtrage est entièrement local dans `AdminEmployeesManager`; aucun appel réseau n'est effectué lors d'une recherche ou d'un changement de filtre.

La recherche concatène :

- prénom ;
- nom ;
- identifiant employé ;
- email ;
- département ;
- rôle métier ;
- nom du planning.

Les filtres portent sur le statut actif, le rôle d'accès et la présence d'une affectation de planning. L'interface calcule localement les comptes actifs/inactifs, administrateurs, affectés/non affectés, le nombre de départements distincts et le taux de couverture par un planning.

### 9.3 Création d'un compte

```text
Formulaire client
   |
   +-- contrôle mot de passe présent
   +-- si EMPLOYEE : PIN de quatre chiffres
   +-- normalisation des chaînes
   |
   v
POST /api/employees (Route Handler Next.js)
   |
   v
POST /api/v1/employees (EmployeesController)
   |
   +-- validation CreateEmployeeDto
   v
EmployeesService.create
   |
   +-- résolution et unicité du PIN
   +-- contrôle du planning
   +-- hachage du mot de passe
   +-- transaction :
   |     génération employeeIdentifier
   |     création Employee
   +-- retrait des secrets de la réponse
   v
AuditLogService : employee.create
   |
   v
Réponse au client
   |
   +-- ajout du nouvel objet en tête de l'état local
   +-- message de succès
   +-- réinitialisation du formulaire
```

Le formulaire transmet `department: null` si le champ est vide, `scheduleId: null` sans planning et `pinCode: null` pour un compte administrateur. Le backend applique ses propres validations indépendamment des contrôles client.

### 9.4 Chargement et modification d'un compte

Le bouton de modification déclenche d'abord `GET /api/employees/:id`. Après succès, le formulaire est initialisé avec les données reçues. Le champ PIN reste vide et le champ mot de passe reste vide.

À l'envoi :

- l'interface exige un PIN de quatre chiffres lorsque le rôle d'accès sélectionné est `EMPLOYEE` ;
- elle omet `password` si le champ est vide en mode modification ;
- elle utilise `PATCH /api/employees/:id` ;
- le service conserve le mot de passe si aucun nouveau mot de passe n'est reçu ;
- le service applique les règles de PIN et de planning ;
- l'objet reçu remplace l'objet correspondant dans l'état local.

### 9.5 Activation et désactivation

Le bouton de statut inverse `employee.isActive` et appelle `PATCH /api/employees/:id/status`. Après succès, l'état local est remplacé pour l'employé concerné. Si cet employé est chargé dans le formulaire, le formulaire est remappé depuis la réponse.

### 9.6 Affectations spécialisées

Les routes backend spécialisées permettent la modification isolée du rôle métier, du département et du planning. Les tests end-to-end les appellent directement et vérifient leur résultat.

L'interface `/employees` n'appelle pas ces trois routes spécialisées. Elle transmet le rôle, le département et le planning dans le corps du `PATCH /api/employees/:id` général.

### 9.7 Gestion des erreurs

Le service produit notamment :

- 404 si l'employé n'existe pas ;
- 404 si le planning affecté n'existe pas ;
- 400 si le PIN requis est absent ou invalide ;
- 409 si le PIN est déjà utilisé ;
- 409 en cas d'identifiant employé non générable ;
- 409 pour les autres collisions `P2002`, avec un message de doublon d'email.

Les Route Handlers utilisent les fonctions de proxy communes pour produire une réponse JSON frontend. Le composant client lit le champ d'erreur avec `getClientErrorMessage` et affiche un message dans l'écran. Les actions remettent leurs indicateurs de chargement à zéro dans un bloc `finally`.

Fichiers de référence :

- `apps/frontend/app/employees/page.tsx`
- `apps/frontend/components/employees/admin-employees-manager.tsx`
- `apps/frontend/components/employees/employee-manager.helpers.ts`
- `apps/frontend/app/api/employees/route.ts`
- `apps/frontend/app/api/employees/[id]/route.ts`
- `apps/frontend/app/api/employees/[id]/status/route.ts`
- `apps/backend/src/modules/employees/employees.controller.ts`
- `apps/backend/src/modules/employees/employees.service.ts`

## 10. Dépendances

### 10.1 Dépendances internes backend

| Dépendance | Usage |
|---|---|
| `PrismaService` | Accès aux modèles `Employee` et `Schedule`, transactions. |
| `employeeWithScheduleSelect` | Projection publique partagée d'un employé avec planning. |
| `AuditLogService` | Journalisation des mutations administratives. |
| `JwtAuthGuard` | Authentification globale des routes. |
| `RolesGuard` et `@Roles` | Restriction globale au rôle `ADMIN`. |
| `@CurrentUser` | Injection de l'acteur authentifié dans les mutations. |
| `AuthenticatedUser` | Typage de l'acteur. |
| `password.util.ts` | Hachage du mot de passe et du PIN, vérification des PIN hachés. |
| `pin-code.validation.ts` | Format, liste interdite et message de validation PIN. |
| Prisma `AccessRole` | Enum de sécurité partagé entre schéma, DTO, contrôleur et service. |

### 10.2 Dépendances internes frontend

| Dépendance | Usage |
|---|---|
| `lib/auth.ts` | Lecture de l'utilisateur et du jeton de session. |
| `lib/api.ts` | Types `EmployeeRecord`, charges utiles et chargement initial. |
| `lib/api-route.ts` | Proxy authentifié des Route Handlers. |
| `lib/client-error.ts` | Extraction des messages d'erreur côté client. |
| `AdminNav` | Navigation des pages d'administration. |
| `LogoutForm` | Fermeture de session. |
| `PageShell` | Conteneur de page. |
| Composants `ui` | Cartes, badges, boutons et squelette de chargement. |
| Données `Schedule` | Options d'affectation et affichage de la couverture. |

### 10.3 Dépendances externes significatives

| Bibliothèque | Usage constaté |
|---|---|
| NestJS | Module, contrôleur, injection et exceptions HTTP. |
| `class-validator` | Contraintes déclaratives des DTO. |
| `class-transformer` | Transformation des chaînes vides. |
| Prisma Client | Types, requêtes, transactions et erreurs de persistance. |
| Node.js `crypto` | scrypt, génération de sel et comparaison temporellement sûre. |
| Next.js | App Router, Route Handlers, middleware et redirections serveur. |
| React | État, mémorisation des filtres et formulaire client. |

## 11. Observations techniques

Cette section contient uniquement des constats vérifiables dans l'implémentation actuelle.

### 11.1 Routes backend et exposition frontend

Le backend expose huit endpoints pour les employés. Les Route Handlers Next.js en exposent cinq à l'interface :

- liste ;
- création ;
- détail ;
- modification générale ;
- changement de statut.

Aucun Route Handler n'est présent sous :

- `app/api/employees/[id]/role/` ;
- `app/api/employees/[id]/department/` ;
- `app/api/employees/[id]/schedule/`.

Les trois endpoints backend correspondants sont couverts par les tests end-to-end. L'écran d'administration réalise ces affectations par le `PATCH` général.

### 11.2 Deux représentations du PIN

Le schéma conserve simultanément `pinCode` et `pinCodeHash`. Le service traite `pinCode` comme une valeur historique possible et écrit les nouveaux secrets dans `pinCodeHash`. Le contrôle d'unicité parcourt les deux représentations. La contrainte Prisma `@unique` existe sur `pinCode`, tandis que l'unicité des PIN hachés est vérifiée dans le service par comparaison de chaque hash.

### 11.3 Rôle métier et rôle d'accès

Les champs `role` et `accessRole` représentent deux concepts différents. Le premier est une chaîne libre ; le second est un enum. Le nom de l'endpoint spécialisé `/role` concerne uniquement le champ libre `role`.

### 11.4 Département sans module dédié appelé

Le département est stocké comme chaîne facultative directement sur `Employee`. Le service ne dépend d'aucun service ou modèle Département pour valider cette valeur. Le nombre de départements affiché par l'interface est calculé à partir des chaînes distinctes présentes dans la liste.

### 11.5 Couplage direct au modèle Schedule

`EmployeesService` vérifie les plannings avec `prisma.schedule.findUnique` et modifie la relation Prisma. Il n'injecte pas `SchedulesService`. `EmployeesModule` ne déclare aucun import de `SchedulesModule`.

### 11.6 Génération séquentielle par lecture

La génération de `employeeIdentifier` lit tous les identifiants de l'année courante, calcule le maximum en mémoire et tente la création. Les collisions uniques sont traitées par un maximum de trois tentatives.

### 11.7 Champ employeeCode non manipulé

Le modèle Prisma contient `employeeCode String? @unique`. Aucun champ correspondant n'existe dans les DTO du module, dans les écritures d'`EmployeesService` ou dans le formulaire d'administration. Les opérations du module utilisent `employeeIdentifier`.

### 11.8 Journal d'audit non persistant

`AuditLogService.logAdminAction` écrit une structure JSON avec le logger NestJS au niveau `warn`. Aucun appel Prisma ni stockage de journal n'est présent dans ce service. L'audit est déclenché après la mutation et n'appartient pas à la transaction Prisma de création ou de mise à jour.

### 11.9 Contrats frontend déclarés séparément

Les types `EmployeeRecord`, `CreateEmployeePayload` et `UpdateEmployeePayload` sont déclarés dans `apps/frontend/lib/api.ts`. Ils ne sont pas importés des DTO backend. Les valeurs du formulaire sont représentées par un autre type, `EmployeeFormValues`, dans `employee-manager.helpers.ts`.

### 11.10 Validation PIN client et backend

Le client vérifie uniquement la présence de quatre chiffres pour un compte `EMPLOYEE`. Le backend vérifie également la liste des valeurs interdites et l'unicité. La fonction client `normalizePinCodeInput` supprime les caractères non numériques et limite la saisie à quatre caractères.

### 11.11 Modification et PIN dans l'interface

`mapEmployeeToFormValues` initialise toujours le champ PIN à une chaîne vide, car le secret n'est pas renvoyé par l'API. Le formulaire client exige néanmoins un PIN de quatre chiffres pour soumettre une modification lorsque `accessRole` vaut `EMPLOYEE`. Le booléen `pinConfigured` sert seulement à l'affichage du statut du PIN.

### 11.12 Absence de suppression

Aucune méthode `DELETE`, aucun DTO de suppression, aucune méthode de service de suppression et aucune action de suppression dans `AdminEmployeesManager` ne sont présents.

### 11.13 Absence de page de détail dédiée

Le frontend ne contient pas de page `app/employees/[id]/page.tsx`. Le détail est chargé par le composant de gestion avec `GET /api/employees/:id`, puis affiché dans le formulaire de la page unique `/employees`.

### 11.14 États de route dédiés

La route `/employees` possède un fichier `loading.tsx` et un fichier `error.tsx`. L'état d'erreur affiche le message de l'exception et propose une nouvelle tentative ou un rechargement de la même page.

### 11.15 Documentation locale du module

Aucun fichier README ou document Markdown n'est présent dans `apps/backend/src/modules/employees/` ni dans `apps/frontend/components/employees/`. La documentation du module dans ces arborescences n'est pas trouvée dans le code.

### 11.16 Tests constatés

`apps/backend/test/app.e2e-spec.ts` couvre notamment :

- refus de la liste pour le rôle `EMPLOYEE` ;
- lecture de la liste par un administrateur ;
- création et hachage du PIN ;
- rejet d'un PIN dupliqué ;
- rejet d'un PIN interdit ;
- lecture d'un employé ;
- modification générale ;
- activation et désactivation ;
- affectation du rôle métier ;
- affectation du département ;
- affectation et retrait du planning ;
- absence d'exposition des secrets PIN.

Les fichiers propres au module ne contiennent pas de fichier `*.spec.ts`. La couverture identifiée est portée par la suite end-to-end globale.

