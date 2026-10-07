# API Reference — Gestion des utilisateurs

| Métadonnée | Valeur |
|---|---|
| Document ID | API-003 |
| Titre | Gestion des utilisateurs |
| Version | 1.0 |
| Statut | Validé |
| Classification | Interne |
| Référence | API Reference |
| Projet | Konatech Pointage |

## 1. Présentation

La gestion des utilisateurs de Konatech Pointage est implémentée par `EmployeesModule`, `EmployeesController` et `EmployeesService`. Aucun `UserModule` ou contrôleur `/users` distinct n'est présent. La ressource HTTP active est `/api/v1/employees`.

Le module administre les comptes employés et administrateurs : consultation, création, modification des attributs principaux, activation, fonction textuelle, département et affectation à un horaire. `EmployeesService` assure aussi la génération de l'identifiant employé, le hachage des mots de passe et PIN, les contrôles d'unicité et les projections de réponse sans secret.

Toutes les routes du contrôleur portent la restriction `ADMIN`. Les opérations de mutation sont journalisées par `AuditLogService` après une réponse réussie du service.

## 2. Vue d'ensemble

| Ressource | Description |
|---|---|
| Collection d'employés | Liste ordonnée de tous les comptes enregistrés |
| Employé | Compte applicatif identifié par un UUID et un identifiant annuel généré |
| État du compte | Activation ou désactivation par le booléen `isActive` |
| Rôle d'accès | Valeur `ADMIN` ou `EMPLOYEE` portée par `accessRole` |
| Fonction | Libellé textuel porté par le champ `role`, indépendant de l'autorisation |
| Département | Chaîne facultative pouvant être affectée ou retirée |
| Horaire | Relation facultative entre `Employee` et `Schedule` |
| PIN employé | Secret à quatre chiffres, validé, unique par comparaison applicative et stocké sous forme d'empreinte |

## 3. Endpoints

| Méthode | Route | Description | Authentification |
|---|---|---|---|
| GET | `/api/v1/employees` | Lister les employés | JWT, rôle `ADMIN` |
| GET | `/api/v1/employees/:id` | Obtenir un employé par UUID | JWT, rôle `ADMIN` |
| POST | `/api/v1/employees` | Créer un employé ou administrateur | JWT, rôle `ADMIN` |
| PATCH | `/api/v1/employees/:id` | Modifier les attributs principaux | JWT, rôle `ADMIN` |
| PATCH | `/api/v1/employees/:id/status` | Activer ou désactiver le compte | JWT, rôle `ADMIN` |
| PATCH | `/api/v1/employees/:id/role` | Modifier la fonction textuelle `role` | JWT, rôle `ADMIN` |
| PATCH | `/api/v1/employees/:id/department` | Affecter ou retirer le département | JWT, rôle `ADMIN` |
| PATCH | `/api/v1/employees/:id/schedule` | Affecter ou retirer l'horaire | JWT, rôle `ADMIN` |

Le contrôleur ne déclare aucune route DELETE. La modification du rôle d'accès s'effectue par le champ `accessRole` de `PATCH /employees/:id`; la route suffixée `/role` modifie uniquement le champ texte `role`.

## 4. Description détaillée

### 4.1 Éléments communs

| Élément | Valeur observée |
|---|---|
| Préfixe global | `/api/v1` |
| Préfixe contrôleur | `/employees` |
| Authentification | En-tête Bearer validé par `JwtAuthGuard` |
| Autorisation | `@Roles(AccessRole.ADMIN)` au niveau du contrôleur |
| Validation | `ValidationPipe` global et `ParseUUIDPipe` sur `:id` |
| Query Parameters | Aucun sur les huit endpoints |
| Propriétés inconnues | Refusées par `forbidNonWhitelisted` |

### 4.2 GET `/api/v1/employees`

| Élément | Description |
|---|---|
| Path Parameters | Aucun |
| Query Parameters | Aucun |
| Body | Aucun |
| DTO | Aucun |
| Traitement | `EmployeesService.findAll()` lit tous les employés avec leur horaire |
| Ordre | Date de création décroissante, puis nom et prénom croissants |

La réponse est un tableau. Chaque élément suit la structure publique décrite à la section 5.

### 4.3 GET `/api/v1/employees/:id`

| Élément | Description |
|---|---|
| Path Parameter `id` | UUID de l'employé, validé par `ParseUUIDPipe` |
| Query Parameters | Aucun |
| Body | Aucun |
| DTO | Aucun |
| Traitement | Recherche unique avec horaire imbriqué |

Un UUID valide sans employé correspondant produit une réponse 404.

### 4.4 POST `/api/v1/employees`

| Élément | Description |
|---|---|
| Path Parameters | Aucun |
| Query Parameters | Aucun |
| Body | JSON conforme à `CreateEmployeeDto` |
| DTO | `CreateEmployeeDto` |
| Traitement | Validation du PIN et de l'horaire, hachage, génération d'identifiant et création transactionnelle |

| Champ | Type | Obligatoire dans le DTO | Validation ou comportement observé |
|---|---|---|---|
| `pinCode` | chaîne | Non dans le DTO | Exactement quatre chiffres, valeurs faibles déclarées refusées; requis par le service pour `EMPLOYEE` |
| `firstName` | chaîne | Oui | Longueur maximale 80 |
| `lastName` | chaîne | Oui | Longueur maximale 80 |
| `email` | chaîne | Oui | Format e-mail |
| `role` | chaîne | Oui | Longueur maximale 80 |
| `accessRole` | `ADMIN` ou `EMPLOYEE` | Non | Enum Prisma; valeur de service par défaut `EMPLOYEE` |
| `password` | chaîne | Oui | Longueur de 8 à 128 |
| `department` | chaîne | Non | Longueur maximale 80 |
| `isActive` | booléen | Non | Valeur de service par défaut active |
| `scheduleId` | chaîne UUID | Non | Horaire vérifié en base avant création |

Pour un compte `ADMIN`, le service force `pinCode` et `pinCodeHash` à `null`. Pour un compte `EMPLOYEE`, un PIN valide doit être disponible. Le mot de passe et le PIN sont hachés avant l'écriture.

L'identifiant public est généré sous la forme observée `EMP-`, année UTC et séquence sur trois chiffres. Le service lit les identifiants de l'année dans une transaction, calcule la prochaine séquence puis crée l'employé. Il relance la transaction au plus deux fois après un conflit ciblé sur cet identifiant.

### 4.5 PATCH `/api/v1/employees/:id`

| Élément | Description |
|---|---|
| Path Parameter `id` | UUID validé par `ParseUUIDPipe` |
| Query Parameters | Aucun |
| Body | JSON conforme à `UpdateEmployeeDto` |
| DTO | `UpdateEmployeeDto` |
| Traitement | Vérification du compte, du PIN et de l'horaire, construction d'une mise à jour Prisma |

Tous les champs sont facultatifs :

| Champ | Type admis | Validation ou transformation |
|---|---|---|
| `pinCode` | chaîne ou `null` | Chaîne vide transformée en `null`; sinon quatre chiffres et valeur faible interdite |
| `firstName` | chaîne | Maximum 80 |
| `lastName` | chaîne | Maximum 80 |
| `email` | chaîne | Format e-mail |
| `role` | chaîne | Maximum 80 |
| `accessRole` | `ADMIN` ou `EMPLOYEE` | Enum Prisma |
| `password` | chaîne | De 8 à 128; haché uniquement lorsqu'il est fourni |
| `department` | chaîne ou `null` | Chaîne vide transformée en `null`; maximum 80 |
| `isActive` | booléen | Type booléen |
| `scheduleId` | UUID ou `null` | Chaîne vide transformée en `null`; UUID vérifié lorsqu'il est fourni |

Les comportements du service sont :

- passage à `ADMIN` : suppression des deux champs PIN ;
- maintien ou passage à `EMPLOYEE` : présence d'un PIN actuel ou nouveau exigée ;
- nouveau PIN : contrôle d'unicité puis nouvelle empreinte ;
- `department` à `null` : retrait du département ;
- `scheduleId` UUID : connexion à l'horaire existant ;
- `scheduleId` à `null` : déconnexion de l'horaire ;
- mot de passe absent : conservation de l'empreinte actuelle.

### 4.6 PATCH `/api/v1/employees/:id/status`

| Élément | Description |
|---|---|
| Path Parameter `id` | UUID validé |
| Query Parameters | Aucun |
| DTO | `UpdateEmployeeStatusDto` |
| Body | `isActive`, booléen obligatoire |
| Traitement | Vérification de l'employé puis mise à jour de `isActive` |

### 4.7 PATCH `/api/v1/employees/:id/role`

| Élément | Description |
|---|---|
| Path Parameter `id` | UUID validé |
| Query Parameters | Aucun |
| DTO | `AssignEmployeeRoleDto` |
| Body | `role`, chaîne obligatoire, maximum 80 caractères |
| Traitement | Mise à jour du champ fonctionnel texte `role` |

Cette route ne modifie pas `accessRole` et ne change donc pas directement les permissions du garde.

### 4.8 PATCH `/api/v1/employees/:id/department`

| Élément | Description |
|---|---|
| Path Parameter `id` | UUID validé |
| Query Parameters | Aucun |
| DTO | `AssignEmployeeDepartmentDto` |
| Body | `department`, champ facultatif contenant une chaîne de 80 caractères au maximum ou `null` |
| Transformation | Chaîne vide convertie en `null` |
| Traitement | Affectation de la chaîne; valeur absente, vide ou `null` traitée comme un retrait du département |

### 4.9 PATCH `/api/v1/employees/:id/schedule`

| Élément | Description |
|---|---|
| Path Parameter `id` | UUID validé |
| Query Parameters | Aucun |
| DTO | `AssignEmployeeScheduleDto` |
| Body | `scheduleId`, champ facultatif contenant un UUID ou `null` |
| Transformation | Chaîne vide convertie en `null` |
| Traitement | Connexion à un horaire vérifié, ou déconnexion lorsqu'aucun identifiant n'est fourni |

Le champ du DTO est marqué optionnel. Une valeur absente devient `undefined`; le service traite cette valeur comme une déconnexion, au même titre que `null`.

## 5. Réponses

### 5.1 Structure publique d'un employé

| Champ | Type observé | Description |
|---|---|---|
| `id` | chaîne UUID | Identifiant Prisma |
| `employeeIdentifier` | chaîne | Identifiant annuel généré |
| `firstName` | chaîne | Prénom |
| `lastName` | chaîne | Nom |
| `email` | chaîne | Adresse unique |
| `role` | chaîne | Fonction textuelle |
| `accessRole` | `ADMIN` ou `EMPLOYEE` | Rôle d'autorisation |
| `department` | chaîne ou `null` | Département |
| `isActive` | booléen | État du compte |
| `scheduleId` | UUID ou `null` | Relation d'horaire |
| `createdAt` | date sérialisée | Création |
| `updatedAt` | date sérialisée | Dernière mise à jour |
| `schedule` | objet ou `null` | Horaire public imbriqué |
| `pinConfigured` | booléen | Présence d'un PIN historique ou haché |

L'objet `schedule`, lorsqu'il existe, contient les champs sélectionnés par `scheduleSelect` : `id`, `name`, `startTime`, `endTime`, `latenessMarginMinutes`, `isActive`, `workDays`, `createdAt` et `updatedAt`.

Les champs `passwordHash`, `pinCode` et `pinCodeHash` ne sont pas retournés. Le service les lit pour certains traitements, les retire avec `mapEmployeeResponse` et ajoute uniquement `pinConfigured`.

### 5.2 Codes de succès

| Endpoint | Code | Corps |
|---|---:|---|
| GET collection | 200 | Tableau d'employés publics |
| GET détail | 200 | Employé public |
| POST création | 201 | Employé public créé |
| Tous les PATCH | 200 | Employé public mis à jour |

### 5.3 Codes d'erreur observables

| Code | Origine | Cas observé |
|---:|---|---|
| 400 | `ValidationPipe`, `ParseUUIDPipe`, `EmployeesService` | UUID, type, format, longueur ou PIN invalide; compte EMPLOYEE sans PIN exploitable |
| 401 | `JwtAuthGuard` | Bearer absent ou JWT invalide/expiré |
| 403 | `RolesGuard` | Compte authentifié avec `accessRole` différent de `ADMIN` |
| 404 | `EmployeesService` | Employé ou horaire affecté introuvable |
| 409 | `EmployeesService` | PIN, e-mail ou identifiant employé en conflit |
| 429 | `AppThrottlerGuard` | Limite globale de requêtes dépassée |

Les messages métier explicitement levés comprennent `Employee not found.`, `Assigned schedule not found.`, `Code PIN invalide.`, le conflit de PIN, le conflit d'e-mail et l'échec de génération d'un identifiant unique. Les erreurs DTO peuvent fournir un tableau dans le champ `message` de la réponse NestJS.

### 5.4 Audit après mutation

Après succès du service, le contrôleur produit les actions d'audit suivantes :

| Endpoint | Action |
|---|---|
| POST `/employees` | `employee.create` |
| PATCH `/employees/:id` | `employee.update` |
| PATCH `/employees/:id/status` | `employee.status.update` |
| PATCH `/employees/:id/role` | `employee.role.assign` |
| PATCH `/employees/:id/department` | `employee.department.assign` |
| PATCH `/employees/:id/schedule` | `employee.schedule.assign` |

## 6. Contrôle d'accès

```text
Requête vers /api/v1/employees
              |
              v
      AppThrottlerGuard
              |
              v
        JwtAuthGuard
        Bearer + JWT
              |
              v
 Employé encore présent et actif
              |
              v
         RolesGuard
              |
      accessRole == ADMIN
              |
              v
     EmployeesController
```

`AuthModule` enregistre `JwtAuthGuard` et `RolesGuard` comme gardes globaux. `EmployeesController` porte `@Roles(AccessRole.ADMIN)` au niveau de la classe; cette métadonnée s'applique aux huit handlers.

Le champ `accessRole` peut valoir `ADMIN` ou `EMPLOYEE`. Le champ `role`, bien que présent dans la réponse et modifiable par une route dédiée, n'est pas utilisé par `RolesGuard`.

Les mutations reçoivent l'administrateur courant par `@CurrentUser` uniquement pour construire l'événement d'audit. L'identifiant de la ressource modifiée reste le paramètre `:id`.

## 7. Flux de traitement

### 7.1 Lecture

```text
Client
  |
  v
Gardes globaux -> rôle ADMIN
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
PostgreSQL : Employee + Schedule
  |
  v
retrait des champs PIN + pinConfigured
  |
  v
200 JSON
```

### 7.2 Création ou modification

```text
Client
  |
  | JSON + identifiant éventuel
  v
Throttling -> JWT -> rôle ADMIN
  |
  v
ValidationPipe + DTO + ParseUUIDPipe éventuel
  |
  v
EmployeesController
  |
  v
EmployeesService
  |
  +--> employé ou horaire existant
  +--> rôle d'accès et règle du PIN
  +--> unicité du PIN
  +--> hachage du mot de passe ou du PIN
  |
  v
PrismaService -> PostgreSQL
  |
  v
projection publique
  |
  v
AuditLogService
  |
  v
201 ou 200 JSON
```

## 8. Traçabilité

| Endpoint ou mécanisme | Fichiers analysés | Preuve observée |
|---|---|---|
| Huit routes Employees | `apps/backend/src/modules/employees/employees.controller.ts` | Méthodes, chemins, DTO, rôle et audit |
| Composition du module | `apps/backend/src/modules/employees/employees.module.ts` | Contrôleur et fournisseur |
| Liste et détail | `apps/backend/src/modules/employees/employees.service.ts` | Ordre, sélection et absence 404 |
| Création | Même service, `dto/create-employee.dto.ts` | Champs, hachage, horaire, transaction et identifiant |
| Mise à jour générale | Même service, `dto/update-employee.dto.ts` | Champs facultatifs, PIN, rôle et relations |
| Statut | `dto/update-employee-status.dto.ts`, contrôleur et service | Booléen et mise à jour |
| Fonction texte | `dto/assign-employee-role.dto.ts`, contrôleur et service | Champ `role` distinct d'`accessRole` |
| Département | `dto/assign-employee-department.dto.ts`, contrôleur et service | Chaîne, `null` et transformation |
| Horaire | `dto/assign-employee-schedule.dto.ts`, contrôleur et service | UUID, vérification, connexion et déconnexion |
| Règles PIN | `apps/backend/src/common/validation/pin-code.validation.ts`, `common/security/password.util.ts` | Format, liste interdite, hachage et comparaison |
| Projection publique | `apps/backend/src/common/prisma/selects.ts`, `EmployeesService.mapEmployeeResponse` | Champs employés/horaire et retrait des secrets |
| Modèles | `apps/backend/prisma/schema.prisma` | `Employee`, `Schedule`, contraintes et relation |
| Validation globale | `apps/backend/src/main.ts` | `ValidationPipe` et options globales |
| Authentification | `apps/backend/src/modules/auth/guards/`, décorateurs Auth | Bearer, utilisateur et rôle ADMIN |
| Audit | `apps/backend/src/common/audit/audit-log.service.ts`, contrôleur Employees | Actions après mutation |
| Tests de contrat | `apps/backend/test/app.e2e-spec.ts` | Accès, création, PIN, détail et six modifications |
| Frontend associé | `apps/frontend/app/api/employees/`, `apps/frontend/components/employees/admin-employees-manager.tsx` | Relais des routes et utilisation des réponses |
| Documentation liée | `documentation/06-Developer-Guide/09-Modules-metier.md`, `documentation/07-API-Reference/01-Presentation-de-lAPI.md`, `02-Authentification.md` | Contexte recoupé avec les sources actives |

## 9. Observations

- La ressource applicative est nommée `employees`; aucune route `/users` n'est exposée.
- Le contrôleur Employees expose huit handlers et aucune suppression.
- Les huit endpoints exigent un compte actif de rôle d'accès `ADMIN`.
- `role` et `accessRole` sont deux champs distincts.
- La création génère l'identifiant employé côté service.
- Les mots de passe et nouveaux PIN sont hachés avant persistance.
- Un compte `ADMIN` ne conserve aucun PIN.
- Un compte `EMPLOYEE` doit disposer d'un PIN historique ou haché après création ou modification.
- Le contrôle d'unicité du PIN compare les valeurs historiques et les empreintes existantes des employés.
- L'affectation d'un horaire vérifie d'abord l'existence de `Schedule`.
- Les réponses incluent l'horaire public et `pinConfigured`, mais aucun secret.
- Toutes les mutations du contrôleur produisent une action d'audit après succès.
- La liste ne comporte ni pagination, ni filtre, ni paramètre de recherche au niveau de l'API.
