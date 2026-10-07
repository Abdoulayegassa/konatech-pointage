# Gestion des rôles et permissions

| Métadonnée | Valeur |
|---|---|
| Document ID | SAR-RBAC-001 |
| Titre | Gestion des rôles et permissions |
| Version | 1.0 |
| Statut | Validé |
| Classification | Interne |
| Référence SAPDD | Sécurité / RBAC |
| Date de génération | 29 juillet 2026 |

> **Note de portée et de date :** ce rapport est un audit technique daté du modèle d'accès observé le 29 juillet 2026; ses observations détaillées ne remplacent pas le contrat produit courant. Les rôles produit actuels sont SUPER ADMIN SAAS, ADMIN ENTREPRISE et EMPLOYEE. Le rôle plateforme est distinct des rôles d'adhésion à une organisation. Pour la définition actuelle, consulter `PROJECT_PLAN.md`; pour l'état d'implémentation vérifié, consulter `CURRENT_STATUS.md` et le code.

## 1. Présentation

### 1.1 Objectif du système RBAC

Le contrôle d'accès de Konatech Pointage associe chaque employé authentifié à une valeur `AccessRole`. Les routes backend déclarent les rôles autorisés au moyen du décorateur `@Roles()`. Deux guards globaux authentifient la requête, chargent l'employé actif et comparent son rôle aux métadonnées de la route.

Le mécanisme implémenté est un contrôle d'accès fondé sur des rôles à deux niveaux. Il ne repose pas sur un catalogue de permissions unitaires persistées.

Implémentation principale :

- `apps/backend/prisma/schema.prisma`
- `apps/backend/src/modules/auth/guards/jwt-auth.guard.ts`
- `apps/backend/src/modules/auth/guards/roles.guard.ts`
- `apps/backend/src/modules/auth/decorators/roles.decorator.ts`

### 1.2 Responsabilités

Le périmètre couvre :

- la définition des rôles d'accès ;
- l'affectation du rôle à un employé ;
- la production et la vérification du JWT ;
- l'identification de l'utilisateur courant ;
- l'exclusion des utilisateurs inactifs ;
- la déclaration des routes publiques ;
- la restriction de routes par rôle ;
- la protection et la redirection des pages frontend ;
- la transmission du JWT par les routes proxy Next.js.

### 1.3 Périmètre constaté

| Capacité | État |
|---|---|
| Rôles `ADMIN` et `EMPLOYEE` | Implémentés |
| Guard JWT global | Implémenté |
| Guard de rôles global | Implémenté |
| Décorateurs `@Roles`, `@Public`, `@CurrentUser` | Implémentés |
| Contrôles de rôle dans les pages serveur | Implémentés |
| Middleware de présence de session | Implémenté sur une partie des pages |
| Permissions granulaires nommées | Non trouvées dans le code |
| Rôle `MANAGER` | Non trouvé dans le code |
| Groupes de rôles | Non trouvés dans le code |
| Rôles personnalisables | Non trouvés dans le code |
| Héritage de rôles | Non trouvé dans le code |
| Table de permissions | Non trouvée dans le code |
| Interface dédiée d'administration RBAC | Non trouvée dans le code |

### 1.4 Distinction entre `role` et `accessRole`

Le modèle `Employee` contient deux champs différents :

- `role: String`, libellé métier libre, modifiable par `PATCH /employees/:id/role` ;
- `accessRole: AccessRole`, enum utilisé pour les décisions d'autorisation.

Le champ texte `role` n'est lu ni par `RolesGuard`, ni par `@Roles()`. Il ne constitue donc pas un rôle RBAC.

Fichiers concernés :

- `apps/backend/prisma/schema.prisma`
- `apps/backend/src/modules/employees/dto/assign-employee-role.dto.ts`
- `apps/backend/src/modules/employees/employees.controller.ts`
- `apps/backend/src/modules/auth/guards/roles.guard.ts`

## 2. Architecture générale

### 2.1 Backend

`AuthModule` enregistre `JwtAuthGuard` puis `RolesGuard` comme `APP_GUARD`. Ils s'appliquent à tous les contrôleurs NestJS. `AppModule` enregistre séparément `AppThrottlerGuard` comme guard global.

Les routes publiques portent `@Public()`. Toutes les autres routes exigent par défaut un bearer token valide. Une route ne déclenche un contrôle de rôle que si une métadonnée `roles` est attachée à sa méthode ou à son contrôleur.

### 2.2 Frontend

Le frontend stocke le JWT dans un cookie HTTP-only. Les pages serveur utilisent `requireCurrentUser()` et vérifient `user.accessRole`. Les routes API Next.js extraient le token du cookie et ajoutent l'en-tête `Authorization` lors des appels backend.

### 2.3 Auth

Deux flux d'authentification émettent le même type de JWT :

- connexion par courriel et mot de passe ;
- connexion de borne par PIN, réservée à un employé actif.

Le JWT contient `sub`, `email`, `iat` et `exp`. Le rôle n'est pas inscrit dans le token. Lors de chaque requête authentifiée, `AuthService` recharge l'employé depuis PostgreSQL ; le rôle courant provient donc de la base.

### 2.4 Guards

L'ordre déclaré dans `AuthModule` est :

1. `JwtAuthGuard` ;
2. `RolesGuard`.

`AppThrottlerGuard` est également global par l'intermédiaire de `AppModule`. Il gère la limitation de débit et non l'autorisation par rôle.

### 2.5 JWT

Le JWT est signé par HMAC-SHA-256 avec `JWT_SECRET`. La vérification contrôle :

- la présence des trois segments ;
- la signature par comparaison à temps constant ;
- les champs `sub` et `email` ;
- la date d'expiration.

La durée normale provient de `JWT_EXPIRES_IN`, avec `1d` comme repli dans `AuthService`. La session de borne utilise `ATTENDANCE_ENTRY_JWT_EXPIRES_IN`, avec `15m` par défaut.

### 2.6 Décorateurs

`@Public()` et `@Roles()` attachent des métadonnées lues par `Reflector`. `@CurrentUser()` extrait `request.user`, préalablement attaché par `JwtAuthGuard`.

### 2.7 Middlewares

Le middleware Next.js ne valide ni le JWT ni le rôle. Il vérifie uniquement la présence du cookie de session sur les routes incluses dans son matcher.

```text
Navigateur
   |
   | cookie HTTP-only
   v
Next.js page / route handler
   |  contrôle de rôle côté page
   |  Authorization: Bearer <JWT>
   v
AppThrottlerGuard
   |
   v
JwtAuthGuard -- @Public ? ---- oui ----> Route
   |
   | vérifie JWT + charge Employee actif
   v
RolesGuard ---- métadonnée @Roles ----> comparaison AccessRole
   |                                      |
   | autorisé                             | refusé
   v                                      v
Contrôleur                         Forbidden 403
```

Fichiers concernés :

- `apps/backend/src/modules/auth/auth.module.ts`
- `apps/backend/src/app.module.ts`
- `apps/backend/src/common/security/jwt.util.ts`
- `apps/frontend/lib/auth-session.ts`
- `apps/frontend/lib/api-route.ts`
- `apps/frontend/middleware.ts`

## 3. Organisation des fichiers

### 3.1 Arborescence

```text
apps/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma
│   │   ├── seed.ts
│   │   └── migrations/
│   │       └── 20260416163000_add_auth_to_employee/
│   │           └── migration.sql
│   └── src/
│       ├── app.module.ts
│       ├── main.ts
│       ├── common/
│       │   ├── prisma/
│       │   │   └── selects.ts
│       │   └── security/
│       │       ├── app-throttler.guard.ts
│       │       ├── jwt.util.ts
│       │       └── password.util.ts
│       └── modules/
│           ├── auth/
│           │   ├── constants/
│           │   │   ├── attendance-entry.constants.ts
│           │   │   └── auth.constants.ts
│           │   ├── decorators/
│           │   │   ├── current-user.decorator.ts
│           │   │   ├── public.decorator.ts
│           │   │   └── roles.decorator.ts
│           │   ├── dto/
│           │   │   ├── attendance-entry-login.dto.ts
│           │   │   └── login.dto.ts
│           │   ├── guards/
│           │   │   ├── jwt-auth.guard.ts
│           │   │   └── roles.guard.ts
│           │   ├── interfaces/
│           │   │   └── authenticated-user.interface.ts
│           │   ├── auth.controller.ts
│           │   ├── auth.module.ts
│           │   └── auth.service.ts
│           └── employees/
│               ├── dto/
│               │   ├── create-employee.dto.ts
│               │   └── update-employee.dto.ts
│               ├── employees.controller.ts
│               └── employees.service.ts
└── frontend/
    ├── middleware.ts
    ├── app/
    │   ├── api/auth/
    │   │   ├── attendance-entry-session/route.ts
    │   │   ├── login/route.ts
    │   │   └── logout/route.ts
    │   ├── attendance-entry/page.tsx
    │   ├── attendance-history/page.tsx
    │   ├── calendar/page.tsx
    │   ├── employees/page.tsx
    │   ├── exports/page.tsx
    │   ├── login/page.tsx
    │   ├── my-attendance/page.tsx
    │   ├── sanctions/page.tsx
    │   ├── schedules/page.tsx
    │   └── page.tsx
    ├── components/
    │   ├── admin/admin-nav.tsx
    │   └── auth/
    │       ├── login-form.tsx
    │       └── logout-form.tsx
    └── lib/
        ├── api-route.ts
        ├── api.ts
        ├── auth-session.ts
        ├── auth.ts
        └── redirect.ts
```

### 3.2 Rôle des fichiers backend

| Fichier | Rôle |
|---|---|
| `schema.prisma` | Enum `AccessRole` et champ de l'employé |
| `auth.service.ts` | Connexion, émission JWT et chargement de l'utilisateur |
| `jwt.util.ts` | Signature et vérification cryptographique |
| `jwt-auth.guard.ts` | Authentification globale |
| `roles.guard.ts` | Autorisation par rôle |
| `roles.decorator.ts` | Déclaration des rôles autorisés |
| `public.decorator.ts` | Exemption d'authentification |
| `current-user.decorator.ts` | Injection de l'utilisateur |
| `auth.constants.ts` | Clés de métadonnées |
| `selects.ts` | Projection publique incluant `accessRole` |
| DTO Employés | Validation de l'affectation `AccessRole` |

### 3.3 Rôle des fichiers frontend

| Fichier | Rôle |
|---|---|
| `auth-session.ts` | Noms et options des cookies |
| `auth.ts` | Lecture de session et exigence d'un utilisateur |
| `api-route.ts` | Ajout du bearer token aux appels proxy |
| `redirect.ts` | Destination par rôle après connexion |
| `middleware.ts` | Contrôle de présence du cookie sur certaines routes |
| pages serveur | Comparaison de `accessRole` et redirection |
| `admin-nav.tsx` | Menu des espaces administratifs |

## 4. Modèle de rôles

### 4.1 Enum persisté

```prisma
enum AccessRole {
  ADMIN
  EMPLOYEE
}
```

`Employee.accessRole` est obligatoire et vaut `EMPLOYEE` par défaut.

### 4.2 ADMIN

`ADMIN` donne accès aux ressources d'administration :

- dashboard ;
- liste, détail, création et modification des employés ;
- plannings ;
- calendrier RH ;
- historique global des pointages ;
- exports mensuels ;
- pointage administratif ;
- sanctions.

Les contrôleurs Dashboard, Employees, Schedules, Calendar et Sanctions appliquent `@Roles(ADMIN)` au niveau de la classe. Attendance l'applique méthode par méthode.

### 4.3 EMPLOYEE

`EMPLOYEE` donne accès aux opérations personnelles du module Attendance :

- pointage du jour ;
- politique de sécurité du pointage ;
- historique mensuel personnel ;
- entrée personnelle ;
- sortie personnelle.

La connexion de borne par PIN recherche exclusivement les employés actifs ayant `accessRole: EMPLOYEE`.

### 4.4 Rôles absents

`MANAGER`, `SUPER_ADMIN`, `HR`, `AUDITOR` et tout autre rôle ne figurent pas dans `AccessRole`. Aucun mapping d'un libellé métier `role` vers ces droits n'est présent.

### 4.5 Affectation et modification

`CreateEmployeeDto.accessRole` et `UpdateEmployeeDto.accessRole` utilisent `@IsEnum(AccessRole)`. Un administrateur peut donc créer ou modifier un employé avec l'une des deux valeurs.

Lorsque le rôle devient `ADMIN`, `EmployeesService.resolvePinSecret()` supprime les secrets PIN. Le PIN est lié au flux de borne employé, pas à l'administration.

Implémentation principale :

- `apps/backend/prisma/schema.prisma`
- `apps/backend/src/modules/employees/dto/create-employee.dto.ts`
- `apps/backend/src/modules/employees/dto/update-employee.dto.ts`
- `apps/backend/src/modules/employees/employees.service.ts`

## 5. Permissions

### 5.1 Nature des permissions

Il n'existe pas d'entité `Permission`, de table d'association rôle-permission, d'enum de permissions ou de décorateur `@Permissions`. Les permissions ci-dessous correspondent aux accès effectifs déduits des annotations `@Roles()` présentes dans les contrôleurs.

### 5.2 Matrice des accès backend

| Ressource / action | Public | ADMIN | EMPLOYEE |
|---|:---:|:---:|:---:|
| Santé `GET /health` | Oui | Oui | Oui |
| Connexion `POST /auth/login` | Oui | Oui | Oui |
| Connexion borne `POST /auth/attendance-entry/login` | Oui | Oui | Oui |
| Utilisateur courant `GET /auth/me` | Non | Oui | Oui |
| Redirection borne `GET /attendance/entry` | Oui | Oui | Oui |
| Dashboard `GET /dashboard/overview` | Non | Oui | Non |
| Employés : liste et détail | Non | Oui | Non |
| Employés : création | Non | Oui | Non |
| Employés : modification générale | Non | Oui | Non |
| Employés : activation/désactivation | Non | Oui | Non |
| Employés : libellé métier, département, planning | Non | Oui | Non |
| Plannings : lecture | Non | Oui | Non |
| Plannings : création/modification/statut | Non | Oui | Non |
| Calendrier : mois et jours fériés | Non | Oui | Non |
| Calendrier : création/modification/suppression | Non | Oui | Non |
| Sanctions : règles et synthèse | Non | Oui | Non |
| Sanctions : modification des règles | Non | Oui | Non |
| Attendance : synthèse et historique global | Non | Oui | Non |
| Attendance : export mensuel | Non | Oui | Non |
| Attendance : entrée/sortie administrative | Non | Oui | Non |
| Attendance : données personnelles | Non | Non | Oui |
| Attendance : entrée/sortie personnelle | Non | Non | Oui |

### 5.3 Détail des endpoints ADMIN

| Méthode | Endpoint |
|---|---|
| GET | `/dashboard/overview` |
| GET, POST | `/employees`, `/employees/:id` |
| PATCH | `/employees/:id`, `/employees/:id/status`, `/employees/:id/role`, `/employees/:id/department`, `/employees/:id/schedule` |
| GET, POST | `/schedules`, `/schedules/:id` |
| PATCH | `/schedules/:id`, `/schedules/:id/status` |
| GET | `/calendar/month`, `/calendar/holidays` |
| POST | `/calendar/holidays` |
| PATCH, DELETE | `/calendar/holidays/:id` |
| GET | `/sanctions/rules`, `/sanctions/monthly`, `/sanctions/attendance/:attendanceId` |
| PATCH | `/sanctions/rules/:id` |
| GET | `/attendance/summary`, `/attendance/history`, `/attendance/exports/monthly` |
| POST | `/attendance/check-in`, `/attendance/check-out` |

### 5.4 Détail des endpoints EMPLOYEE

| Méthode | Endpoint | Portée |
|---|---|---|
| GET | `/attendance/me/today` | Utilisateur du JWT |
| GET | `/attendance/me/security-policy` | Politique commune |
| GET | `/attendance/me/history` | Utilisateur du JWT |
| POST | `/attendance/me/check-in` | Utilisateur du JWT |
| POST | `/attendance/me/check-out` | Utilisateur du JWT |

Les endpoints personnels ne prennent pas d'`employeeId` dans l'URL. Ils utilisent `@CurrentUser()` et `user.id`.

### 5.5 Suppression

La seule suppression métier exposée parmi les contrôleurs audités est `DELETE /calendar/holidays/:id`, réservée à `ADMIN`. Aucun endpoint de suppression d'employé ou de planning n'est présent.

## 6. Guards

### 6.1 JwtAuthGuard

#### Rôle

`JwtAuthGuard` authentifie toute route non publique.

#### Fonctionnement

1. lit la métadonnée `isPublic` sur la méthode puis la classe ;
2. autorise immédiatement une route publique ;
3. lit `request.headers.authorization` ;
4. exige un en-tête scalaire au format `Bearer <token>` ;
5. appelle `AuthService.getAuthenticatedUserFromToken()` ;
6. affecte l'employé retourné à `request.user`.

#### Dépendances

- `Reflector` ;
- `AuthService`.

#### Contrôles

`AuthService` vérifie le JWT, recherche l'employé par `sub` avec `publicEmployeeSelect`, puis refuse un employé absent ou inactif.

### 6.2 RolesGuard

#### Rôle

`RolesGuard` compare le `AccessRole` courant aux rôles déclarés.

#### Fonctionnement

1. lit la métadonnée `roles` sur la méthode puis la classe ;
2. autorise lorsqu'aucun rôle n'est déclaré ;
3. récupère `request.user` ;
4. retourne `false` si l'utilisateur est absent ;
5. recherche `user.accessRole` dans les rôles requis ;
6. lève `ForbiddenException` si la valeur n'est pas autorisée.

#### Dépendances

Le guard dépend uniquement de `Reflector`. Il utilise le type `AuthenticatedUser` alimenté par le guard JWT précédent.

### 6.3 AppThrottlerGuard

`AppThrottlerGuard` est un guard global de limitation de débit. Il ne traite ni `AccessRole`, ni métadonnée `roles`. Il applique notamment deux fenêtres au login PIN : cinq tentatives par minute et dix par dix minutes, selon la configuration déclarée dans `AppModule`.

### 6.4 Enchaînement

```text
ExecutionContext
      |
      v
AppThrottlerGuard
      |
      v
JwtAuthGuard
  +-- @Public=true ---------> autorisé sans request.user
  |
  +-- Bearer absent/invalide -> 401
  |
  +-- token valide ----------> request.user = Employee actif
                                  |
                                  v
                              RolesGuard
                         +-- aucun @Roles -> autorisé
                         +-- rôle inclus  -> autorisé
                         +-- rôle exclu   -> 403
```

Fichiers concernés :

- `apps/backend/src/modules/auth/guards/jwt-auth.guard.ts`
- `apps/backend/src/modules/auth/guards/roles.guard.ts`
- `apps/backend/src/common/security/app-throttler.guard.ts`
- `apps/backend/src/modules/auth/auth.module.ts`
- `apps/backend/src/app.module.ts`

## 7. Décorateurs

### 7.1 `@Roles(...roles)`

`Roles` accepte une liste de valeurs `AccessRole` et appelle `SetMetadata(ROLES_KEY, roles)`. `ROLES_KEY` vaut `roles`.

Le décorateur est utilisé :

- au niveau classe sur Dashboard, Employees, Schedules, Calendar et Sanctions ;
- au niveau méthode dans Attendance.

### 7.2 `@Public()`

`Public` attache la valeur `true` sous `IS_PUBLIC_KEY`, dont la valeur est `isPublic`. `JwtAuthGuard` donne priorité à cette métadonnée.

Les routes publiques constatées sont :

- `POST /auth/login` ;
- `POST /auth/attendance-entry/login` ;
- `GET /attendance/entry` ;
- `GET /health`.

### 7.3 `@CurrentUser()`

`CurrentUser` est un décorateur de paramètre. Il retourne directement `request.user`. Il est utilisé par les contrôleurs pour :

- retourner `/auth/me` ;
- définir la portée personnelle des pointages ;
- enregistrer l'acteur dans les journaux d'audit.

### 7.4 Décorateur de permissions

Aucun décorateur personnalisé de type `@Permissions()` n'est trouvé dans le code.

Implémentation principale :

- `apps/backend/src/modules/auth/decorators/roles.decorator.ts`
- `apps/backend/src/modules/auth/decorators/public.decorator.ts`
- `apps/backend/src/modules/auth/decorators/current-user.decorator.ts`
- `apps/backend/src/modules/auth/constants/auth.constants.ts`

## 8. Flux d'autorisation

### 8.1 Connexion normale

1. le navigateur envoie courriel et mot de passe à la route Next.js ;
2. la route Next.js appelle `POST /auth/login` ;
3. `AuthService` recherche un employé actif et vérifie le mot de passe ;
4. un JWT est signé avec l'identifiant et le courriel ;
5. Next.js place le token dans `konatech_session`, cookie HTTP-only ;
6. la destination vaut `/` pour `ADMIN`, `/my-attendance` pour `EMPLOYEE`.

### 8.2 Requête protégée

1. le route handler ou la page récupère le cookie ;
2. le proxy ajoute `Authorization: Bearer <JWT>` ;
3. `JwtAuthGuard` vérifie le token ;
4. `AuthService` recharge l'employé et son rôle ;
5. `RolesGuard` compare le rôle ;
6. le contrôleur est exécuté si la comparaison réussit.

### 8.3 Flux borne

Le login PIN filtre les comptes `EMPLOYEE` actifs. Le JWT est stocké dans un cookie distinct, `konatech_attendance_entry_session`. Les proxies du flux de borne demandent explicitement le mode de session `attendance-entry`.

```text
Utilisateur
   |
   | identifiants
   v
Route Next.js de connexion
   |
   v
AuthController @Public
   |
   v
AuthService ---- vérification ----> Employee actif
   |
   v
JWT {sub,email,iat,exp}
   |
   v
Cookie HTTP-only
   |
   | requête suivante
   v
Proxy Next.js -> Bearer -> JwtAuthGuard -> AuthService -> RolesGuard
                                                       |
                                  +--------------------+------------------+
                                  |                                       |
                              autorisé                                401 / 403
                                  |
                                  v
                             Contrôleur
```

### 8.4 Effet d'une modification de rôle

Le JWT ne contient pas `accessRole`. Une modification du rôle en base est donc observée au prochain appel protégé, car l'employé est rechargé après validation du token.

Fichiers concernés :

- `apps/frontend/app/api/auth/login/route.ts`
- `apps/frontend/app/api/auth/attendance-entry-session/route.ts`
- `apps/backend/src/modules/auth/auth.controller.ts`
- `apps/backend/src/modules/auth/auth.service.ts`
- `apps/backend/src/common/security/jwt.util.ts`

## 9. Intégration Frontend

### 9.1 Protection des pages administratives

Les pages suivantes appellent `requireCurrentUser()`, refusent tout rôle différent de `ADMIN` par redirection vers `/my-attendance`, puis vérifient la présence du token :

- `/` ;
- `/attendance-history` ;
- `/employees` ;
- `/schedules` ;
- `/calendar` ;
- `/sanctions` ;
- `/exports`.

### 9.2 Protection de la page employé

`/my-attendance` exige un utilisateur courant. Un `ADMIN` est redirigé vers `/`; les autres utilisateurs du modèle actuel sont traités comme employés.

### 9.3 Borne de pointage

`/attendance-entry` lit le cookie de borne séparé, appelle l'API pour identifier l'utilisateur et exige `accessRole === EMPLOYEE`. Cette page n'utilise pas la session administrative normale comme source de son flux.

### 9.4 Middleware

Le matcher du middleware couvre :

- `/` ;
- `/my-attendance/:path*` ;
- `/employees/:path*` ;
- `/schedules/:path*`.

Il ne couvre pas `/attendance-history`, `/calendar`, `/sanctions` ou `/exports`. Ces pages réalisent néanmoins leur contrôle dans le composant serveur.

Le middleware ne décode pas le JWT et ne lit pas `accessRole`. Un cookie présent suffit pour passer ce premier filtre ; la page et le backend effectuent les vérifications effectives.

### 9.5 Menus conditionnels

`AdminNav` contient uniquement les liens administratifs. Il ne reçoit pas le rôle en propriété : il est rendu par les pages déjà protégées. Aucun élément de menu employé conditionné dynamiquement à une permission n'est présent.

### 9.6 Composants

Les composants métier d'administration ne contiennent pas de guard RBAC autonome. Leur protection découle de la page qui les rend et de l'autorisation backend des appels.

### 9.7 Hooks

Aucun hook React dédié aux rôles ou permissions n'est trouvé. L'intégration repose sur les fonctions serveur de `lib/auth.ts`, les comparaisons dans les pages et les helpers de redirection.

### 9.8 Redirections

`getDefaultRedirectPath()` associe :

| Rôle | Destination |
|---|---|
| `ADMIN` | `/` |
| toute autre valeur du type actuel | `/my-attendance` |

Pour un administrateur, une cible post-login `/attendance-entry` est remplacée par `/`.

Fichiers concernés :

- `apps/frontend/lib/auth.ts`
- `apps/frontend/lib/redirect.ts`
- `apps/frontend/middleware.ts`
- `apps/frontend/components/admin/admin-nav.tsx`
- pages sous `apps/frontend/app/`

## 10. Gestion des erreurs

### 10.1 Unauthorized — 401

| Condition | Message backend |
|---|---|
| En-tête absent ou multiple | `Missing Authorization header.` |
| Schéma différent de Bearer ou token absent | `Authorization header must use Bearer.` |
| JWT invalide ou expiré | `Invalid or expired token.` |
| Employé absent ou inactif après décodage | `User is no longer active.` |
| Courriel, mot de passe ou compte invalide | `Invalid credentials.` |
| PIN invalide | `Identifiants invalides.` |

`AuthService` masque les différences entre compte inexistant, inactif et mot de passe erroné pendant le login normal par le même message.

### 10.2 Forbidden — 403

Lorsque l'utilisateur est authentifié mais que `accessRole` ne figure pas dans la liste exigée, `RolesGuard` lève :

`Insufficient permissions for this resource.`

### 10.3 Absence d'utilisateur dans RolesGuard

Si une route exige des rôles mais que `request.user` est absent, `RolesGuard` retourne `false`. Dans l'enchaînement normal, `JwtAuthGuard` s'exécute avant lui et alimente la requête.

### 10.4 Erreurs frontend

`getCurrentUser()` transforme toute erreur de `/auth/me` en valeur `null`. `requireCurrentUser()` redirige alors vers `/login`.

Les routes proxy renvoient une erreur JSON `Session expiree.` avec le statut 401 lorsqu'aucun token du mode demandé n'est disponible. Une réponse 401 du backend dans le mode borne entraîne la suppression du cookie de borne.

### 10.5 Limitation du login PIN

Lorsque l'une des limites PIN est dépassée, `AppThrottlerGuard` renvoie le statut 429 et le message `Trop de tentatives. Reessayez dans quelques minutes.`. Ce cas relève de la protection du flux d'authentification, pas d'un refus RBAC.

Fichiers concernés :

- `apps/backend/src/modules/auth/guards/jwt-auth.guard.ts`
- `apps/backend/src/modules/auth/guards/roles.guard.ts`
- `apps/backend/src/modules/auth/auth.service.ts`
- `apps/backend/src/common/security/app-throttler.guard.ts`
- `apps/frontend/lib/auth.ts`
- `apps/frontend/lib/api-route.ts`

## 11. Dépendances internes

### 11.1 Backend

| Dépendance | Usage |
|---|---|
| Prisma `AccessRole` | Type des rôles |
| `PrismaService` | Chargement de l'employé courant |
| `ConfigService` | Secret et durées JWT |
| `Reflector` | Lecture de `@Public` et `@Roles` |
| utilitaire JWT | Signature et validation |
| utilitaire mot de passe/PIN | Validation des identifiants |
| NestJS `APP_GUARD` | Application globale |
| `AuditLogService` | Enregistrement du rôle de l'acteur administratif |

### 11.2 Frontend

| Dépendance | Usage |
|---|---|
| cookies Next.js | Stockage serveur des tokens |
| `getCurrentUserFromApi()` | Résolution de l'utilisateur |
| redirections Next.js | Routage selon la session et le rôle |
| route handlers | Proxy des appels authentifiés |
| middleware Next.js | Préfiltre par présence de cookie |

```text
Prisma AccessRole
      |
      v
Employee.accessRole <---- EmployeesService
      |
      v
AuthService <---- JWT util + ConfigService
      |
      v
JwtAuthGuard ----> request.user ----> RolesGuard
                                        |
                                        v
                                  Controllers

Frontend cookies -> auth helpers -> API proxy -> Guards backend
```

## 12. Traçabilité du code

| Fonctionnalité | Fichiers principaux |
|---|---|
| Enum et persistance du rôle | `apps/backend/prisma/schema.prisma`, migration `20260416163000_add_auth_to_employee/migration.sql` |
| Valeurs initiales | `apps/backend/prisma/seed.ts` |
| Connexion normale et borne | `apps/backend/src/modules/auth/auth.controller.ts`, `auth.service.ts` |
| Production et vérification JWT | `apps/backend/src/common/security/jwt.util.ts` |
| Guard d'authentification | `apps/backend/src/modules/auth/guards/jwt-auth.guard.ts` |
| Guard de rôles | `apps/backend/src/modules/auth/guards/roles.guard.ts` |
| Enregistrement global | `apps/backend/src/modules/auth/auth.module.ts` |
| Route publique | `apps/backend/src/modules/auth/decorators/public.decorator.ts` |
| Restriction par rôle | `apps/backend/src/modules/auth/decorators/roles.decorator.ts` |
| Utilisateur courant | `apps/backend/src/modules/auth/decorators/current-user.decorator.ts` |
| Clés de métadonnées | `apps/backend/src/modules/auth/constants/auth.constants.ts` |
| Projection utilisateur | `apps/backend/src/common/prisma/selects.ts` |
| Affectation de `accessRole` | `apps/backend/src/modules/employees/dto/create-employee.dto.ts`, `update-employee.dto.ts`, `employees.service.ts` |
| Matrice Attendance | `apps/backend/src/modules/attendance/attendance.controller.ts` |
| Accès Dashboard | `apps/backend/src/modules/dashboard/dashboard.controller.ts` |
| Accès Employés | `apps/backend/src/modules/employees/employees.controller.ts` |
| Accès Plannings | `apps/backend/src/modules/schedules/schedules.controller.ts` |
| Accès Calendrier | `apps/backend/src/modules/calendar/calendar.controller.ts` |
| Accès Sanctions | `apps/backend/src/modules/sanctions/sanctions.controller.ts` |
| Cookies de session | `apps/frontend/lib/auth-session.ts` |
| Utilisateur frontend | `apps/frontend/lib/auth.ts` |
| Transmission bearer | `apps/frontend/lib/api-route.ts` |
| Routage par rôle | `apps/frontend/lib/redirect.ts` |
| Préfiltre des pages | `apps/frontend/middleware.ts` |
| Navigation administrateur | `apps/frontend/components/admin/admin-nav.tsx` |

### 12.1 Pages protégées

Implémentation principale :

- `apps/frontend/app/page.tsx`
- `apps/frontend/app/attendance-history/page.tsx`
- `apps/frontend/app/employees/page.tsx`
- `apps/frontend/app/schedules/page.tsx`
- `apps/frontend/app/calendar/page.tsx`
- `apps/frontend/app/sanctions/page.tsx`
- `apps/frontend/app/exports/page.tsx`
- `apps/frontend/app/my-attendance/page.tsx`
- `apps/frontend/app/attendance-entry/page.tsx`

### 12.2 Tests

Les tests end-to-end de `apps/backend/test/app.e2e-spec.ts` exercent des accès non authentifiés, des refus du rôle employé et des accès administrateur sur plusieurs ressources, notamment dashboard, employés, pointages et exports.

## 13. Observations techniques

Cette section contient uniquement les constats issus du code.

### 13.1 RBAC à deux rôles

Le modèle ne comporte que `ADMIN` et `EMPLOYEE`. Aucun troisième niveau d'accès n'est présent.

### 13.2 Absence de permissions granulaires

Le terme « permissions » apparaît dans le message de refus, mais aucun objet de permission indépendant n'est implémenté. Les droits sont codés par association directe entre endpoints et rôles.

### 13.3 Champ `role` distinct

`Employee.role` est un texte métier et `Employee.accessRole` gouverne l'accès. L'endpoint nommé `PATCH /employees/:id/role` modifie uniquement le champ texte `role`, tandis que le changement de `accessRole` passe par la modification générale de l'employé.

### 13.4 Rôle absent du JWT

Le JWT contient l'identifiant et le courriel, mais pas le rôle. Le rôle est rechargé depuis la base à chaque requête protégée.

### 13.5 Vérification répétée de l'utilisateur

Chaque appel protégé effectue une recherche Prisma de l'employé pour vérifier son existence, son activation et récupérer son rôle courant.

### 13.6 Portée des contrôleurs

Tous les endpoints de Dashboard, Employees, Schedules, Calendar et Sanctions sont administrateurs par décoration de classe. Attendance mélange routes publiques, administrateur et employé par décorations de méthodes.

### 13.7 Route authentifiée sans rôle explicite

`GET /auth/me` n'a pas de `@Roles()`. Il accepte donc tout utilisateur authentifié actif, indépendamment des deux rôles.

### 13.8 Couverture partielle du middleware

Le middleware de session ne couvre pas quatre pages administratives : `/attendance-history`, `/calendar`, `/sanctions` et `/exports`. Le contrôle serveur est néanmoins présent dans chaque page.

### 13.9 Navigation non conditionnelle

`AdminNav` ne reçoit aucune permission et affiche toujours tous ses liens. Son usage est limité aux pages qui ont déjà vérifié le rôle administrateur.

### 13.10 Deux cookies de session

La session standard et la session de borne utilisent des cookies différents. `resolveSessionToken()` ne substitue pas la session standard à la session de borne lorsque le mode `attendance-entry` est demandé.

### 13.11 Login borne

Le login PIN sélectionne explicitement `EMPLOYEE`. Un compte `ADMIN` ne peut pas obtenir une session de borne par cette méthode.

### 13.12 Décorateurs absents

Aucun décorateur de permissions granulaires, de portée départementale ou de propriété de ressource n'est trouvé.

### 13.13 Contrôle de propriété

Les routes personnelles utilisent l'identifiant de `request.user` et non un identifiant fourni par le client. Aucun mécanisme générique de contrôle de propriété n'existe en dehors de ce choix d'API.

### 13.14 Hooks RBAC

Aucun hook frontend dédié à l'autorisation ou aux permissions n'est présent.

### 13.15 Documentation locale

Aucun document Markdown propre au dossier `apps/backend/src/modules/auth/` n'est trouvé. La définition opérationnelle du RBAC réside dans le schéma, les guards, les décorateurs et les contrôleurs.

### 13.16 Comportement de `resolvePostLoginRedirect`

La fonction accepte une cible interne normalisée sans appliquer une matrice générale rôle-route. Elle traite spécifiquement le cas d'un administrateur visant `/attendance-entry`. Les pages ciblées réalisent ensuite leurs propres contrôles.

### 13.17 Utilisateur absent dans RolesGuard

`RolesGuard` retourne `false` lorsque la métadonnée exige un rôle mais que `request.user` est absent, alors qu'il lève explicitement `ForbiddenException` pour un utilisateur présent dont le rôle est insuffisant.

### 13.18 Fonctionnalités RBAC non trouvées

Les éléments suivants ne sont pas trouvés dans le code :

- rôle Manager ;
- rôle Super Admin ;
- permissions configurables ;
- matrice de droits persistée ;
- affectation de permissions à un utilisateur ;
- héritage de rôles ;
- portée par département ;
- interface dédiée de gestion des droits ;
- hook frontend de permission.
