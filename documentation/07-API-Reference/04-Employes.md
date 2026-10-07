# API Reference — Employés

| Métadonnée | Valeur |
|---|---|
| Document ID | API-004 |
| Titre | Employés |
| Version | 1.0 |
| Statut | Validé |
| Classification | Interne |
| Référence | API Reference |
| Projet | Konatech Pointage |

## 1. Présentation

La ressource Employé est exposée par `EmployeesController` sous le préfixe global `/api/v1` et le chemin `employees`. Elle permet à un compte ayant le rôle d'accès `ADMIN` de consulter, créer et modifier les comptes employés et administrateurs.

`EmployeesService` centralise l'accès à Prisma, la génération de l'identifiant employé, le hachage des mots de passe et des PIN, le contrôle des relations avec les horaires et la projection des réponses sans données secrètes. Les mutations réussies sont transmises à `AuditLogService` par le contrôleur.

## 2. Vue d'ensemble

| Ressource | Description |
|---|---|
| Collection Employés | Ensemble des comptes renvoyés dans l'ordre défini par le service |
| Employé | Compte identifié par un UUID et par un identifiant employé généré |
| Rôle d'accès | Valeur `ADMIN` ou `EMPLOYEE` du champ `accessRole` |
| Fonction | Libellé textuel du champ `role`, distinct du contrôle d'accès |
| État | Activation ou désactivation portée par `isActive` |
| Département | Valeur textuelle facultative |
| Horaire | Relation facultative vers une ressource `Schedule` |
| PIN | Secret à quatre chiffres associé aux comptes `EMPLOYEE` et exposé uniquement par l'indicateur `pinConfigured` |

## 3. Endpoints

Le préfixe `/api/v1` provient de `main.ts`. Le chemin `employees` et les suffixes proviennent de `EmployeesController`.

| Méthode | Route | Description | Authentification |
|---|---|---|---|
| GET | `/api/v1/employees` | Lister les employés | Jeton Bearer, rôle `ADMIN` |
| GET | `/api/v1/employees/:id` | Lire un employé | Jeton Bearer, rôle `ADMIN` |
| POST | `/api/v1/employees` | Créer un employé ou un administrateur | Jeton Bearer, rôle `ADMIN` |
| PATCH | `/api/v1/employees/:id` | Modifier les attributs généraux | Jeton Bearer, rôle `ADMIN` |
| PATCH | `/api/v1/employees/:id/status` | Modifier l'état actif | Jeton Bearer, rôle `ADMIN` |
| PATCH | `/api/v1/employees/:id/role` | Modifier la fonction textuelle | Jeton Bearer, rôle `ADMIN` |
| PATCH | `/api/v1/employees/:id/department` | Affecter ou retirer un département | Jeton Bearer, rôle `ADMIN` |
| PATCH | `/api/v1/employees/:id/schedule` | Affecter ou retirer un horaire | Jeton Bearer, rôle `ADMIN` |

## 4. Description détaillée

### 4.1 GET `/api/v1/employees`

| Élément | Valeur observée |
|---|---|
| Paramètres | Aucun |
| Query Parameters | Aucun |
| Path Parameters | Aucun |
| Body | Aucun |
| DTO | Aucun |
| Traitement | `findMany` Prisma puis projection de chaque employé |
| Ordre | `createdAt` décroissant, puis `lastName` et `firstName` croissants |

### 4.2 GET `/api/v1/employees/:id`

| Élément | Valeur observée |
|---|---|
| Query Parameters | Aucun |
| Path Parameter `id` | UUID validé par `ParseUUIDPipe` |
| Body | Aucun |
| DTO | Aucun |
| Traitement | Recherche unique Prisma et projection publique |

### 4.3 POST `/api/v1/employees`

Le corps est validé par `CreateEmployeeDto`.

| Champ | Présence | Validation observée |
|---|---|---|
| `pinCode` | Facultatif dans le DTO | Chaîne de quatre chiffres; valeurs `0000`, `1111`, `1234`, `4321` et `9999` refusées |
| `firstName` | Obligatoire | Chaîne, 80 caractères au maximum |
| `lastName` | Obligatoire | Chaîne, 80 caractères au maximum |
| `email` | Obligatoire | Adresse électronique valide |
| `role` | Obligatoire | Chaîne, 80 caractères au maximum |
| `accessRole` | Facultatif | Valeur de l'énumération `AccessRole`; valeur de service par défaut `EMPLOYEE` |
| `password` | Obligatoire | Chaîne de 8 à 128 caractères |
| `department` | Facultatif | Chaîne, 80 caractères au maximum |
| `isActive` | Facultatif | Booléen; valeur de service par défaut `true` |
| `scheduleId` | Facultatif | UUID |

Pour un compte `EMPLOYEE`, le service exige un PIN valide, vérifie qu'il n'est pas déjà utilisé, puis le hache. Pour un compte `ADMIN`, le service persiste les champs PIN à `null`. Si `scheduleId` est fourni, l'horaire doit exister. Le mot de passe est haché avant l'écriture.

L'identifiant employé est généré dans une transaction Prisma avec le préfixe `EMP-`, l'année UTC courante et une séquence sur trois chiffres. Le service réessaie deux fois après une collision sur cet identifiant.

### 4.4 PATCH `/api/v1/employees/:id`

Le paramètre `id` est validé comme UUID. Aucun Query Parameter n'est utilisé. Le corps est validé par `UpdateEmployeeDto`; tous ses champs sont facultatifs.

| Champ | Validation observée | Traitement observé |
|---|---|---|
| `pinCode` | Chaîne de quatre chiffres ou `null`; mêmes valeurs interdites que lors de la création | Nouveau PIN validé, contrôlé et haché; `null` conserve le PIN existant d'un compte `EMPLOYEE`; PIN supprimé pour `ADMIN` |
| `firstName` | Chaîne, 80 caractères au maximum | Mise à jour si fourni |
| `lastName` | Chaîne, 80 caractères au maximum | Mise à jour si fourni |
| `email` | Adresse électronique valide | Mise à jour si fourni |
| `role` | Chaîne, 80 caractères au maximum | Mise à jour de la fonction textuelle |
| `accessRole` | Énumération `AccessRole` | Mise à jour du rôle d'accès et application des règles PIN correspondantes |
| `password` | Chaîne de 8 à 128 caractères | Hachage et mise à jour si fourni |
| `department` | Chaîne de 80 caractères au maximum ou `null`; chaîne vide transformée en `null` | Mise à jour ou retrait explicite |
| `isActive` | Booléen | Mise à jour si fourni |
| `scheduleId` | UUID ou `null`; chaîne vide transformée en `null` | Connexion, déconnexion explicite ou absence de modification |

Le service vérifie l'existence de l'employé et, lorsqu'un UUID d'horaire est fourni, celle de l'horaire.

### 4.5 PATCH `/api/v1/employees/:id/status`

| Élément | Valeur observée |
|---|---|
| Query Parameters | Aucun |
| Path Parameter `id` | UUID validé par `ParseUUIDPipe` |
| DTO | `UpdateEmployeeStatusDto` |
| Body | `isActive`, booléen obligatoire |
| Traitement | Mise à jour du champ `isActive` |

### 4.6 PATCH `/api/v1/employees/:id/role`

| Élément | Valeur observée |
|---|---|
| Query Parameters | Aucun |
| Path Parameter `id` | UUID validé par `ParseUUIDPipe` |
| DTO | `AssignEmployeeRoleDto` |
| Body | `role`, chaîne obligatoire de 80 caractères au maximum |
| Traitement | Mise à jour de la fonction textuelle `role` |

Cette route ne modifie pas le champ d'autorisation `accessRole`.

### 4.7 PATCH `/api/v1/employees/:id/department`

| Élément | Valeur observée |
|---|---|
| Query Parameters | Aucun |
| Path Parameter `id` | UUID validé par `ParseUUIDPipe` |
| DTO | `AssignEmployeeDepartmentDto` |
| Body | Champ facultatif `department`, chaîne de 80 caractères au maximum ou `null` |
| Transformation | Chaîne vide convertie en `null` |
| Traitement | Valeur absente, vide ou `null` traitée comme retrait; chaîne traitée comme affectation |

### 4.8 PATCH `/api/v1/employees/:id/schedule`

| Élément | Valeur observée |
|---|---|
| Query Parameters | Aucun |
| Path Parameter `id` | UUID validé par `ParseUUIDPipe` |
| DTO | `AssignEmployeeScheduleDto` |
| Body | Champ facultatif `scheduleId`, UUID ou `null` |
| Transformation | Chaîne vide convertie en `null` |
| Traitement | UUID existant connecté; valeur absente, vide ou `null` traitée comme déconnexion |

## 5. Réponses

### 5.1 Structure d'une réponse Employé

Les sélections Prisma et la projection du service produisent les champs suivants :

| Champ | Type observé |
|---|---|
| `id` | UUID sous forme de chaîne |
| `employeeIdentifier` | Chaîne |
| `firstName`, `lastName`, `email`, `role` | Chaînes |
| `accessRole` | `ADMIN` ou `EMPLOYEE` |
| `department` | Chaîne ou `null` |
| `isActive` | Booléen |
| `scheduleId` | UUID sous forme de chaîne ou `null` |
| `createdAt`, `updatedAt` | Dates sérialisées |
| `schedule` | Objet horaire ou `null` |
| `pinConfigured` | Booléen calculé par le service |

L'objet `schedule`, lorsqu'il existe, contient `id`, `name`, `startTime`, `endTime`, `latenessMarginMinutes`, `isActive`, `workDays`, `createdAt` et `updatedAt`. Les champs `passwordHash`, `pinCode` et `pinCodeHash` ne figurent pas dans la réponse.

### 5.2 Codes HTTP observés

| Situation | Code | Origine |
|---|---:|---|
| Lecture ou modification réussie | 200 | Comportement des handlers GET et PATCH |
| Création réussie | 201 | Comportement du handler POST NestJS |
| Corps, UUID ou PIN invalide | 400 | Pipes, DTO et contrôles du service |
| En-tête d'autorisation absent ou Bearer invalide | 401 | `JwtAuthGuard` et service Auth |
| Rôle d'accès différent de `ADMIN` | 403 | `RolesGuard` |
| Employé ou horaire introuvable | 404 | `EmployeesService` |
| Email, PIN ou identifiant employé en conflit | 409 | Traduction des conflits dans `EmployeesService` |

Les tests end-to-end confirment notamment les codes 200, 201, 400, 401, 403, 404 et 409 sur les parcours employés. Le filtre global de limitation peut également retourner 429 lorsque sa limite s'applique.

## 6. Contrôle d'accès

`JwtAuthGuard` et `RolesGuard` sont enregistrés globalement dans `AuthModule`. Aucune route de `EmployeesController` n'est marquée publique.

1. `JwtAuthGuard` exige un en-tête `Authorization` utilisant le schéma Bearer.
2. `AuthService` valide le jeton et charge un compte actif.
3. `RolesGuard` lit le décorateur `@Roles(AccessRole.ADMIN)` posé sur le contrôleur.
4. Seul un utilisateur dont `accessRole` vaut `ADMIN` accède aux huit handlers.

Le décorateur `@CurrentUser()` fournit l'acteur aux six handlers de mutation. Ceux-ci enregistrent respectivement les actions `employee.create`, `employee.update`, `employee.status.update`, `employee.role.assign`, `employee.department.assign` et `employee.schedule.assign`.

## 7. Flux de traitement

### 7.1 Lecture

```text
Client
  |
  v
JwtAuthGuard
  |
  v
RolesGuard (ADMIN)
  |
  v
EmployeesController
  |
  v
EmployeesService
  |
  v
PrismaService
  |
  v
PostgreSQL
  |
  v
Projection Employé sans secret
  |
  v
Réponse JSON
```

### 7.2 Mutation

```text
Client
  |
  v
JwtAuthGuard -> RolesGuard (ADMIN)
  |
  v
ValidationPipe -> ParseUUIDPipe et/ou DTO
  |
  v
EmployeesController
  |
  v
EmployeesService -> contrôles métier -> PrismaService -> PostgreSQL
  |
  v
Projection Employé sans secret
  |
  v
AuditLogService
  |
  v
Réponse JSON 200 ou 201
```

## 8. Traçabilité

| Élément documenté | Fichier ou répertoire source | Preuve observée |
|---|---|---|
| Préfixe `/api/v1` et validation globale | `apps/backend/src/main.ts` | `setGlobalPrefix` et `ValidationPipe` |
| Huit endpoints | `apps/backend/src/modules/employees/employees.controller.ts` | Décorateurs HTTP, chemins, paramètres et DTO |
| Composition du module | `apps/backend/src/modules/employees/employees.module.ts` | Déclaration du contrôleur et du service |
| Lecture, création et modifications | `apps/backend/src/modules/employees/employees.service.ts` | Appels Prisma et règles de traitement |
| Corps de création | `apps/backend/src/modules/employees/dto/create-employee.dto.ts` | Champs et décorateurs de validation |
| Corps de modification générale | `apps/backend/src/modules/employees/dto/update-employee.dto.ts` | Champs facultatifs, transformations et validations |
| Modification de l'état | `apps/backend/src/modules/employees/dto/update-employee-status.dto.ts` | Booléen `isActive` |
| Modification de fonction | `apps/backend/src/modules/employees/dto/assign-employee-role.dto.ts` | Chaîne `role` |
| Modification de département | `apps/backend/src/modules/employees/dto/assign-employee-department.dto.ts` | Champ facultatif, transformation et longueur |
| Modification d'horaire | `apps/backend/src/modules/employees/dto/assign-employee-schedule.dto.ts` | Champ facultatif, transformation et UUID |
| Projection des réponses | `apps/backend/src/common/prisma/selects.ts` | Sélections publiques Employé et Horaire |
| Règles du PIN | `apps/backend/src/common/validation/pin-code.validation.ts` | Format et valeurs refusées |
| Hachage des secrets | `apps/backend/src/common/security/password.util.ts` | Fonctions de hachage et vérification |
| Authentification Bearer | `apps/backend/src/modules/auth/guards/jwt-auth.guard.ts` | Extraction et validation du jeton |
| Autorisation ADMIN | `apps/backend/src/modules/auth/guards/roles.guard.ts`, `apps/backend/src/modules/auth/decorators/roles.decorator.ts` | Lecture du rôle exigé |
| Limitation globale des requêtes | `apps/backend/src/app.module.ts`, `apps/backend/src/common/security/app-throttler.guard.ts` | Garde global et réponse de limitation |
| Audit des mutations | `apps/backend/src/common/audit/audit-log.service.ts`, contrôleur Employees | Six actions d'audit |
| Modèle et relation Horaire | `apps/backend/prisma/schema.prisma` | Modèle `Employee`, enum `AccessRole` et relation `Schedule` |
| Contrats HTTP testés | `apps/backend/test/app.e2e-spec.ts` | Accès, validation, création, lecture et modifications |
| Contexte API existant | `documentation/07-API-Reference/01-Presentation-de-lAPI.md`, `documentation/07-API-Reference/02-Authentification.md`, `documentation/07-API-Reference/03-Gestion-des-utilisateurs.md` | Préfixe, sécurité et ressource déjà recensée |

## 9. Observations

- Le dépôt expose `EmployeesModule`; aucun module singulier `EmployeeModule` n'est présent.
- La ressource comporte huit endpoints et aucune route DELETE.
- Toutes les routes exigent le rôle d'accès `ADMIN`.
- La collection n'accepte ni pagination, ni filtre, ni Query Parameter.
- `role` est une fonction textuelle; `accessRole` pilote l'autorisation.
- L'identifiant employé est produit par le service et n'appartient à aucun DTO entrant.
- Les réponses incluent `pinConfigured` mais n'exposent aucun mot de passe, PIN ou empreinte.
- L'horaire est une relation facultative vérifiée avant connexion.
- Les six mutations produisent une entrée d'audit après le traitement du service.
