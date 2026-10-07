# Authentification Administrateur

| Métadonnée | Valeur |
| --- | --- |
| Document ID | UAG-AUTH-001 |
| Titre | Authentification Administrateur |
| Version | 1.0 |
| Statut | Validé |
| Classification | Interne |
| Référence | UAG |
| Date de génération | 30 juillet 2026 |

## 1. Présentation

### 1.1 Objectif

Ce chapitre décrit le fonctionnement de l'authentification administrateur
réellement implémenté dans Konatech Pointage. Il couvre :

- l'accès à l'écran de connexion ;
- la validation des identifiants ;
- la création et le stockage de la session ;
- la durée de validité du jeton ;
- la déconnexion ;
- les protections des pages et des routes API ;
- le contrôle des rôles `ADMIN` et `EMPLOYEE` ;
- les erreurs et redirections observables.

Le contenu repose uniquement sur les composants frontend, les routes serveur
Next.js, les services et guards NestJS, le modèle Prisma et les fichiers de
configuration présents dans le dépôt.

### 1.2 Rôle de l'authentification

L'authentification établit l'identité d'un compte `Employee` actif à partir de
son adresse électronique et de son mot de passe. Après validation, le backend
émet un JWT. Le frontend conserve ce JWT dans un cookie de session et
l'utilise pour interroger les routes protégées de l'API.

L'authentification ne suffit pas à déterminer les fonctions accessibles. Le
champ `accessRole` de l'utilisateur est ensuite contrôlé :

- `ADMIN` pour les fonctions d'administration ;
- `EMPLOYEE` pour les fonctions personnelles de pointage.

Le backend applique l'authentification et le rôle au moyen de deux guards
globaux. Le frontend vérifie également la session et redirige selon le rôle
avant de rendre les pages protégées.

Références :
`apps/backend/src/modules/auth/auth.module.ts`,
`apps/backend/src/modules/auth/auth.service.ts`,
`apps/backend/src/modules/auth/guards/jwt-auth.guard.ts`,
`apps/backend/src/modules/auth/guards/roles.guard.ts`,
`apps/frontend/lib/auth.ts`.

### 1.3 Composants impliqués

| Composant | Responsabilité observable |
| --- | --- |
| Page de connexion | Affiche le formulaire et redirige une session déjà valide |
| Formulaire de connexion | Collecte l'email et le mot de passe, affiche l'état et les erreurs |
| Route Next.js `/api/auth/login` | Relaie la demande au backend et crée le cookie |
| API NestJS `/api/v1/auth/login` | Valide les données et appelle le service d'authentification |
| `AuthService` | Vérifie le compte et le mot de passe, puis émet le JWT |
| Cookie `konatech_session` | Conserve le JWT de la session web |
| `JwtAuthGuard` | Vérifie le bearer token sur les routes protégées |
| `RolesGuard` | Vérifie le rôle d'accès demandé par la route |
| Prisma/PostgreSQL | Fournit le compte, son empreinte de mot de passe, son état et son rôle |

## 2. Accès administrateur

### 2.1 Écran de connexion

L'écran de connexion est accessible à la route `/login`. Il affiche :

- l'identité visuelle Konatech Pointage ;
- le titre « Connexion administrateur » ;
- un champ `Email` ;
- un champ `Mot de passe` ;
- le bouton `Se connecter` ;
- une zone d'erreur lorsqu'une tentative échoue.

Pendant la requête, le bouton est désactivé et son libellé devient
`Connexion en cours...`.

Les comptes de démonstration codés dans la page ne sont affichés que lorsque
`NODE_ENV` est différent de `production`. Le présent document ne reproduit pas
leurs identifiants.

Si la page détecte déjà une session valide, elle ne réaffiche pas le
formulaire : elle redirige immédiatement l'utilisateur selon son rôle et la
destination interne demandée.

Références :
`apps/frontend/app/login/page.tsx`,
`apps/frontend/components/auth/login-form.tsx`.

### 2.2 Identifiants

Le formulaire général utilise exactement deux identifiants :

| Champ | Contrôle frontend | Contrôle backend |
| --- | --- | --- |
| Adresse électronique | Champ requis, type HTML `email` | `@IsEmail()` |
| Mot de passe | Champ requis, type HTML `password` | Chaîne d'au moins 8 caractères |

Le backend recherche le compte par égalité sur le champ unique `email` du
modèle `Employee`.

Le mot de passe n'est pas comparé en clair. Le service utilise
`verifyPassword`, qui dérive une clé avec `scrypt` et compare le résultat à
l'empreinte stockée au moyen de `timingSafeEqual`.

Références :
`apps/frontend/components/auth/login-form.tsx`,
`apps/backend/src/modules/auth/dto/login.dto.ts`,
`apps/backend/src/modules/auth/auth.service.ts`,
`apps/backend/src/common/security/password.util.ts`,
`apps/backend/prisma/schema.prisma`.

### 2.3 Validation

La validation s'effectue à deux niveaux.

#### Validation dans le navigateur

Le formulaire utilise les attributs HTML suivants :

- `required` sur l'email ;
- `type="email"` et `inputMode="email"` sur l'email ;
- `required` sur le mot de passe ;
- `type="password"` sur le mot de passe ;
- `autoComplete="username"` pour l'email ;
- `autoComplete="current-password"` pour le mot de passe.

#### Validation dans l'API

Le DTO `LoginDto` impose :

- une adresse électronique valide ;
- une valeur de mot de passe de type chaîne ;
- une longueur minimale de huit caractères.

Le `ValidationPipe` global du backend :

- retire les propriétés non déclarées par le DTO ;
- refuse les propriétés supplémentaires ;
- transforme les valeurs selon les DTO.

Une requête qui ne respecte pas le DTO est rejetée avant l'appel à la logique
de connexion.

Références :
`apps/frontend/components/auth/login-form.tsx`,
`apps/backend/src/modules/auth/dto/login.dto.ts`,
`apps/backend/src/main.ts`.

### 2.4 Authentification

Le flux de traitement observé est le suivant :

1. Le formulaire envoie l'email et le mot de passe à
   `POST /api/auth/login` sur le frontend.
2. La route serveur Next.js appelle
   `POST /api/v1/auth/login` sur le backend.
3. Le contrôleur backend reçoit un `LoginDto`.
4. Le service recherche l'employé par email.
5. Le service refuse un compte absent ou inactif.
6. Le service vérifie le mot de passe avec l'empreinte stockée.
7. En cas de succès, le service signe un JWT.
8. La réponse contient le jeton, le type `Bearer`, sa durée et les données
   publiques de l'utilisateur.
9. Le frontend stocke le jeton dans le cookie de session.

Les données publiques retournées excluent l'empreinte du mot de passe. La
sélection publique contient notamment l'identité, l'email, le rôle métier, le
rôle d'accès, le service, l'état et l'affectation au planning.

Références :
`apps/frontend/app/api/auth/login/route.ts`,
`apps/backend/src/modules/auth/auth.controller.ts`,
`apps/backend/src/modules/auth/auth.service.ts`,
`apps/backend/src/common/prisma/selects.ts`.

### 2.5 Redirection

La destination par défaut dépend du rôle :

| Rôle | Destination par défaut |
| --- | --- |
| `ADMIN` | `/` |
| `EMPLOYEE` | `/my-attendance` |

Une destination `redirectTo` peut être transmise au formulaire. Le code
n'accepte qu'un chemin interne :

- commençant par `/` ;
- ne commençant pas par `//` ;
- ne commençant pas par `/\` ;
- différent de `/login`.

Un administrateur ne peut pas être redirigé vers `/attendance-entry` par ce
mécanisme : la destination est remplacée par `/`.

Après réponse positive, le formulaire utilise la destination renvoyée par la
route serveur, puis actualise le routeur. En l'absence de destination dans la
réponse, le formulaire utilise `/`.

Références :
`apps/frontend/lib/redirect.ts`,
`apps/frontend/app/api/auth/login/route.ts`,
`apps/frontend/components/auth/login-form.tsx`.

## 3. Gestion de session

### 3.1 JWT

Le backend génère lui-même le JWT avec les primitives cryptographiques de
Node.js. Le jeton contient :

| Propriété | Origine ou usage |
| --- | --- |
| `sub` | Identifiant de l'employé |
| `email` | Adresse électronique de l'employé |
| `iat` | Date d'émission en secondes Unix |
| `exp` | Date d'expiration en secondes Unix |

L'en-tête du jeton déclare `alg: HS256` et `typ: JWT`. La signature est un HMAC
SHA-256 créé avec `JWT_SECRET`.

Lors de la vérification, le code :

- vérifie la présence des trois segments ;
- recalcule la signature ;
- compare les signatures avec `timingSafeEqual` ;
- décode la charge utile ;
- exige `sub` et `email` ;
- refuse un jeton expiré.

Le backend recharge ensuite l'utilisateur depuis la base avec `sub`. Une
session dont le compte n'existe plus ou n'est plus actif est refusée.

Références :
`apps/backend/src/common/security/jwt.util.ts`,
`apps/backend/src/modules/auth/auth.service.ts`.

### 3.2 Secret de signature

`JWT_SECRET` est requis par le schéma de configuration backend et doit
contenir au moins 32 caractères.

En environnement de production, le code rejette un secret dont la valeur
contient un marqueur identifié comme local, de test ou non remplacé. La valeur
du secret n'est jamais retournée dans la réponse de connexion.

Références :
`apps/backend/src/app.module.ts`,
`apps/backend/src/modules/auth/auth.service.ts`,
`apps/backend/.env.example`,
`.env.production.example`.

### 3.3 Stockage

Le JWT de la session web est stocké dans le cookie
`konatech_session`. Ses options sont :

| Option | Valeur observée |
| --- | --- |
| `httpOnly` | `true` |
| `sameSite` | `lax` |
| `secure` | `true` uniquement lorsque `NODE_ENV=production` |
| `path` | `/` |
| `maxAge` | Durée convertie depuis `expiresIn` |

Le composant client ne reçoit pas le jeton dans la réponse JSON de la route
Next.js : cette route répond avec la destination et l'utilisateur après avoir
écrit le cookie.

Les appels serveur récupèrent le jeton depuis le cookie et le transmettent au
backend dans l'en-tête `Authorization: Bearer`.

Un second cookie,
`konatech_attendance_entry_session`, existe pour le terminal de pointage. La
connexion générale efface ce cookie avant de créer `konatech_session`.

Références :
`apps/frontend/lib/auth-session.ts`,
`apps/frontend/app/api/auth/login/route.ts`,
`apps/frontend/lib/auth.ts`,
`apps/frontend/lib/api.ts`.

### 3.4 Expiration

La durée de la session générale provient de `JWT_EXPIRES_IN`. Si cette
variable n'est pas définie dans le service, `AuthService` utilise `1d`.
Le schéma de configuration définit également `1d` comme valeur par défaut.

Le générateur JWT accepte :

- un nombre de secondes ;
- une durée courte se terminant par `s`, `m`, `h` ou `d`.

Cette durée sert à calculer `exp` dans le jeton. La route frontend la convertit
aussi en secondes pour `maxAge`. Si la route frontend reçoit une syntaxe
qu'elle ne reconnaît pas, elle utilise 24 heures pour le cookie.

Le guard refuse le jeton lorsque `exp` est atteint. Le frontend traite alors
l'échec de récupération de l'utilisateur comme une session absente et les
pages protégées redirigent vers `/login`.

Références :
`apps/backend/src/common/security/jwt.util.ts`,
`apps/backend/src/modules/auth/auth.service.ts`,
`apps/backend/src/app.module.ts`,
`apps/frontend/app/api/auth/login/route.ts`,
`apps/frontend/lib/auth.ts`.

### 3.5 Déconnexion

Le bouton de déconnexion appelle `POST /api/auth/logout`. Cette route :

1. supprime le cookie `konatech_session` ;
2. écrit aussi ce cookie avec une valeur vide et `maxAge: 0` ;
3. effectue la même opération pour le cookie du terminal de pointage ;
4. redirige vers `/login`.

La déconnexion ne fait pas appel à un endpoint backend. Aucun registre de
révocation du jeton n'est présent : l'opération supprime les cookies côté
frontend.

Références :
`apps/frontend/components/auth/logout-form.tsx`,
`apps/frontend/app/api/auth/logout/route.ts`,
`apps/frontend/lib/auth-session.ts`.

### 3.6 Protections

Les protections observées sont :

| Protection | Fonctionnement |
| --- | --- |
| Guard JWT global | S'applique à toutes les routes backend sauf celles marquées `@Public()` |
| Schéma Bearer | Exige exactement un en-tête `Authorization` utilisant `Bearer` |
| Vérification du jeton | Contrôle signature, charge utile et expiration |
| Vérification du compte | Recharge le compte et exige `isActive=true` |
| Guard de rôles global | Vérifie le décorateur `@Roles()` |
| Cookie `HttpOnly` | Empêche l'accès direct au cookie par le JavaScript du navigateur |
| Cookie `Secure` en production | Limite son envoi aux connexions sécurisées |
| `SameSite=Lax` | Configure la politique intersite du cookie |
| Limitation de débit | Applique une limite dédiée à `POST /auth/login` |
| Validation DTO | Refuse les données de connexion non conformes |

La limitation de débit de connexion utilise les variables
`LOGIN_RATE_LIMIT_TTL_MS` et `LOGIN_RATE_LIMIT_MAX`. Leurs valeurs par défaut
dans le schéma sont respectivement 60 000 millisecondes et 20 requêtes.

Références :
`apps/backend/src/modules/auth/auth.module.ts`,
`apps/backend/src/modules/auth/guards/jwt-auth.guard.ts`,
`apps/backend/src/modules/auth/guards/roles.guard.ts`,
`apps/backend/src/app.module.ts`,
`apps/frontend/lib/auth-session.ts`.

## 4. Contrôle des rôles

### 4.1 Rôles existants

Le type `AccessRole` du schéma Prisma contient exactement :

```text
ADMIN
EMPLOYEE
```

Le rôle d'accès est stocké dans le champ `accessRole` du modèle `Employee`.
Sa valeur par défaut est `EMPLOYEE`.

Référence : `apps/backend/prisma/schema.prisma`.

### 4.2 Rôle ADMIN

Le rôle `ADMIN` est exigé par les contrôleurs suivants :

| Domaine | Contrôleur |
| --- | --- |
| Tableau de bord | `DashboardController` |
| Employés | `EmployeesController` |
| Plannings | `SchedulesController` |
| Calendrier RH | `CalendarController` |
| Sanctions RH | `SanctionsController` |

Dans le module Pointages, le rôle `ADMIN` est exigé pour :

- la synthèse du jour ;
- l'historique mensuel global ;
- les exports mensuels ;
- l'enregistrement d'une arrivée pour un employé ;
- l'enregistrement d'une sortie pour un employé.

Les pages correspondantes vérifient également `accessRole`. Un utilisateur qui
n'est pas administrateur est redirigé vers `/my-attendance`.

Références :
`apps/backend/src/modules/dashboard/dashboard.controller.ts`,
`apps/backend/src/modules/employees/employees.controller.ts`,
`apps/backend/src/modules/schedules/schedules.controller.ts`,
`apps/backend/src/modules/calendar/calendar.controller.ts`,
`apps/backend/src/modules/sanctions/sanctions.controller.ts`,
`apps/backend/src/modules/attendance/attendance.controller.ts`,
`apps/frontend/app/page.tsx`.

### 4.3 Rôle EMPLOYEE

Le rôle `EMPLOYEE` est exigé par les opérations personnelles de pointage :

- consultation de la situation du jour ;
- consultation de la politique de sécurité ;
- consultation de l'historique personnel ;
- enregistrement de l'arrivée personnelle ;
- enregistrement de la sortie personnelle.

Après une connexion générale, l'employé est dirigé vers `/my-attendance`.
La page racine redirige aussi un employé vers cet espace.

Le terminal fixe possède un flux de connexion distinct par PIN. Ce flux ne
sélectionne que les comptes actifs dont `accessRole` vaut `EMPLOYEE`.

Références :
`apps/backend/src/modules/attendance/attendance.controller.ts`,
`apps/backend/src/modules/auth/auth.service.ts`,
`apps/frontend/lib/redirect.ts`,
`apps/frontend/app/my-attendance/page.tsx`,
`apps/frontend/app/attendance-entry/page.tsx`.

### 4.4 Différence entre rôle métier et rôle d'accès

Le modèle `Employee` contient deux champs différents :

| Champ | Nature |
| --- | --- |
| `role` | Fonction ou poste métier, stocké comme chaîne |
| `accessRole` | Autorisation applicative, limitée à `ADMIN` ou `EMPLOYEE` |

Le guard utilise uniquement `accessRole`. La valeur du champ métier `role` ne
donne pas accès aux routes administrateur.

Références :
`apps/backend/prisma/schema.prisma`,
`apps/backend/src/modules/auth/guards/roles.guard.ts`,
`apps/backend/src/common/prisma/selects.ts`.

### 4.5 Contrôle backend

`JwtAuthGuard` s'exécute avant `RolesGuard` parce qu'ils sont déclarés dans cet
ordre comme `APP_GUARD`. Le premier attache l'utilisateur authentifié à la
requête. Le second lit les rôles exigés dans les métadonnées du contrôleur ou
de la méthode.

Lorsqu'aucun rôle n'est déclaré, `RolesGuard` autorise la requête déjà passée
par le guard JWT. Lorsqu'un rôle est déclaré, la valeur `accessRole` doit
figurer dans la liste exigée.

Les routes marquées `@Public()`, dont la connexion générale, ne requièrent pas
de JWT.

Références :
`apps/backend/src/modules/auth/auth.module.ts`,
`apps/backend/src/modules/auth/decorators/public.decorator.ts`,
`apps/backend/src/modules/auth/decorators/roles.decorator.ts`,
`apps/backend/src/modules/auth/guards/jwt-auth.guard.ts`,
`apps/backend/src/modules/auth/guards/roles.guard.ts`.

## 5. Parcours de connexion

### 5.1 Diagramme

```text
+-----------------------------+
| Ouverture                   |
| /login                      |
+--------------+--------------+
               |
               v
+-----------------------------+
| Connexion                   |
| email + mot de passe        |
+--------------+--------------+
               |
               v
+-----------------------------+
| Validation                  |
| DTO + compte + empreinte    |
+--------------+--------------+
               |
               v
+-----------------------------+
| JWT                         |
| signé puis stocké en cookie |
+--------------+--------------+
               |
               v
+-----------------------------+
| Dashboard                   |
| / pour le rôle ADMIN        |
+-----------------------------+
```

### 5.2 Séquence détaillée

| Étape | Traitement | Résultat |
| --- | --- | --- |
| 1. Ouverture | La page vérifie la session existante | Formulaire affiché ou redirection |
| 2. Saisie | L'administrateur renseigne email et mot de passe | Données prêtes à être envoyées |
| 3. Envoi | Le frontend appelle sa route serveur | Requête relayée vers NestJS |
| 4. Validation | Le DTO et le service contrôlent la demande | Rejet ou poursuite |
| 5. Vérification | Le compte actif et le mot de passe sont contrôlés | Identité confirmée |
| 6. JWT | Le backend signe le jeton avec sa durée | Réponse d'authentification |
| 7. Cookie | Next.js écrit `konatech_session` | Session web créée |
| 8. Redirection | Le rôle détermine la destination | `/` pour `ADMIN` |
| 9. Chargement | Le dashboard vérifie encore la session et le rôle | Contenu administrateur affiché |

### 5.3 Utilisation après connexion

Pour obtenir l'utilisateur courant, le frontend lit le cookie et appelle
`GET /api/v1/auth/me` avec le JWT en bearer token. Cette route n'est pas
publique : elle passe par le guard JWT.

La réponse de `auth/me` est l'utilisateur public attaché à la requête. Elle
permet aux pages de connaître le rôle et de choisir leur redirection.

Références :
`apps/frontend/lib/auth.ts`,
`apps/frontend/lib/api.ts`,
`apps/backend/src/modules/auth/auth.controller.ts`,
`apps/backend/src/modules/auth/guards/jwt-auth.guard.ts`.

## 6. Messages et comportements

### 6.1 Validations

Les validations observables sont :

| Situation | Comportement |
| --- | --- |
| Email vide | Le navigateur bloque l'envoi par `required` |
| Email de forme incorrecte | Contrôle HTML puis rejet possible par `@IsEmail()` |
| Mot de passe vide | Le navigateur bloque l'envoi par `required` |
| Mot de passe de moins de 8 caractères | Rejet par le DTO backend |
| Propriété supplémentaire | Rejet par le `ValidationPipe` global |
| Compte absent | Réponse non autorisée |
| Compte inactif | Réponse non autorisée |
| Mot de passe incorrect | Réponse non autorisée |

Le formulaire affiche le message renvoyé par sa route serveur. Si la réponse ne
contient pas de message exploitable, il affiche `Connexion impossible.`.

Références :
`apps/frontend/components/auth/login-form.tsx`,
`apps/frontend/app/api/auth/login/route.ts`,
`apps/backend/src/modules/auth/dto/login.dto.ts`,
`apps/backend/src/main.ts`,
`apps/backend/src/modules/auth/auth.service.ts`.

### 6.2 Erreurs de connexion

Le service backend utilise le même message, `Invalid credentials.`, pour :

- un email non trouvé ;
- un compte inactif ;
- un mot de passe incorrect.

La route frontend conserve le statut HTTP reçu et transforme le champ
`message`, chaîne ou tableau, en champ `error` pour le formulaire.

Lorsque le frontend ne peut pas joindre le backend, sa route de connexion
renvoie une réponse d'échec construite par le mécanisme commun des routes API,
avec le message de repli `Connexion impossible.`.

Références :
`apps/backend/src/modules/auth/auth.service.ts`,
`apps/frontend/app/api/auth/login/route.ts`,
`apps/frontend/lib/api-route.ts`.

### 6.3 Erreurs de jeton

Le guard et le service backend distinguent les cas suivants :

| Cas | Message backend |
| --- | --- |
| En-tête absent | `Missing Authorization header.` |
| Schéma différent de Bearer ou jeton absent | `Authorization header must use Bearer.` |
| Jeton invalide ou expiré | `Invalid or expired token.` |
| Utilisateur absent ou inactif après émission | `User is no longer active.` |

Sur les pages frontend, une erreur lors de la récupération de l'utilisateur
est convertie en absence de session. `requireCurrentUser` redirige alors vers
`/login`.

Références :
`apps/backend/src/modules/auth/guards/jwt-auth.guard.ts`,
`apps/backend/src/modules/auth/auth.service.ts`,
`apps/frontend/lib/auth.ts`.

### 6.4 Refus d'accès

Lorsqu'un JWT est valide mais que le rôle n'est pas autorisé, `RolesGuard`
renvoie une interdiction avec le message
`Insufficient permissions for this resource.`.

Le frontend applique en parallèle des redirections :

- une page administrateur redirige `EMPLOYEE` vers `/my-attendance` ;
- `/my-attendance` redirige `ADMIN` vers `/` ;
- une page protégée sans session redirige vers `/login` ;
- le terminal fixe refuse d'établir son écran authentifié pour un rôle autre
  que `EMPLOYEE`.

Références :
`apps/backend/src/modules/auth/guards/roles.guard.ts`,
`apps/frontend/app/page.tsx`,
`apps/frontend/app/employees/page.tsx`,
`apps/frontend/app/schedules/page.tsx`,
`apps/frontend/app/attendance-history/page.tsx`,
`apps/frontend/app/exports/page.tsx`,
`apps/frontend/app/my-attendance/page.tsx`,
`apps/frontend/app/attendance-entry/page.tsx`.

### 6.5 Redirections

| Situation | Destination |
| --- | --- |
| Connexion `ADMIN` sans cible | `/` |
| Connexion `EMPLOYEE` sans cible | `/my-attendance` |
| Session valide ouvrant `/login` | Destination calculée selon le rôle |
| Page protégée sans session valide | `/login` |
| `EMPLOYEE` ouvrant une page administrateur observée | `/my-attendance` |
| `ADMIN` ouvrant `/my-attendance` | `/` |
| Déconnexion | `/login` |
| Cible externe ou non sûre | Ignorée au profit de la destination du rôle |
| Cible `/attendance-entry` pour `ADMIN` | `/` |

Références :
`apps/frontend/lib/redirect.ts`,
`apps/frontend/lib/auth.ts`,
`apps/frontend/app/login/page.tsx`,
`apps/frontend/app/api/auth/logout/route.ts`.

## 7. Traçabilité

| Fonctionnalité | Mécanisme observé | Fichiers concernés |
| --- | --- | --- |
| Écran de connexion | Page et formulaire Next.js | `apps/frontend/app/login/page.tsx`, `apps/frontend/components/auth/login-form.tsx` |
| Saisie email | Champ HTML requis de type email | `apps/frontend/components/auth/login-form.tsx` |
| Saisie mot de passe | Champ requis masqué | `apps/frontend/components/auth/login-form.tsx` |
| Validation des identifiants | `LoginDto` avec `IsEmail`, `IsString`, `MinLength` | `apps/backend/src/modules/auth/dto/login.dto.ts` |
| Validation globale | Liste blanche et refus des champs inconnus | `apps/backend/src/main.ts` |
| Endpoint public de connexion | `POST auth/login` avec `@Public()` | `apps/backend/src/modules/auth/auth.controller.ts` |
| Recherche du compte | Recherche Prisma par email | `apps/backend/src/modules/auth/auth.service.ts` |
| Contrôle du compte actif | Vérification de `isActive` | `apps/backend/src/modules/auth/auth.service.ts` |
| Vérification du mot de passe | `scrypt` et comparaison constante | `apps/backend/src/common/security/password.util.ts` |
| Émission du JWT | HMAC SHA-256, `sub`, `email`, `iat`, `exp` | `apps/backend/src/common/security/jwt.util.ts` |
| Durée du JWT | `JWT_EXPIRES_IN`, défaut `1d` | `apps/backend/src/app.module.ts`, `apps/backend/src/modules/auth/auth.service.ts` |
| Secret JWT | Variable requise et validée | `apps/backend/src/app.module.ts` |
| Réponse de connexion | Jeton bearer, durée et utilisateur public | `apps/backend/src/modules/auth/auth.service.ts` |
| Relais frontend | Appel backend depuis la route Next.js | `apps/frontend/app/api/auth/login/route.ts` |
| Cookie de session | `konatech_session` et options de sécurité | `apps/frontend/lib/auth-session.ts` |
| Lecture de session | Lecture du cookie et appel de l'utilisateur courant | `apps/frontend/lib/auth.ts` |
| Utilisateur courant | `GET auth/me` | `apps/backend/src/modules/auth/auth.controller.ts` |
| Protection globale | `JwtAuthGuard` déclaré comme `APP_GUARD` | `apps/backend/src/modules/auth/auth.module.ts`, `apps/backend/src/modules/auth/guards/jwt-auth.guard.ts` |
| Routes publiques | Métadonnée `IS_PUBLIC_KEY` | `apps/backend/src/modules/auth/decorators/public.decorator.ts` |
| Contrôle des rôles | `RolesGuard` et décorateur `@Roles` | `apps/backend/src/modules/auth/guards/roles.guard.ts`, `apps/backend/src/modules/auth/decorators/roles.decorator.ts` |
| Rôles disponibles | Enum `AccessRole` | `apps/backend/prisma/schema.prisma` |
| Redirection par rôle | Fonction de résolution | `apps/frontend/lib/redirect.ts` |
| Protection des pages | `requireCurrentUser` et contrôles `accessRole` | `apps/frontend/lib/auth.ts`, `apps/frontend/app/page.tsx` |
| Déconnexion | Effacement des cookies et redirection | `apps/frontend/app/api/auth/logout/route.ts`, `apps/frontend/lib/auth-session.ts` |
| Limitation de connexion | Throttler nommé `login` | `apps/backend/src/app.module.ts` |
| Messages du formulaire | État d'erreur local | `apps/frontend/components/auth/login-form.tsx` |
| Messages de refus API | Exceptions des guards et du service | `apps/backend/src/modules/auth/auth.service.ts`, `apps/backend/src/modules/auth/guards/jwt-auth.guard.ts`, `apps/backend/src/modules/auth/guards/roles.guard.ts` |

## 8. Observations

### 8.1 Mécanismes présents

- Authentification par email et mot de passe.
- Vérification du mot de passe à partir d'une empreinte `scrypt` salée.
- JWT signé avec HMAC SHA-256.
- Expiration incluse dans le JWT.
- Cookie de session `HttpOnly`, `SameSite=Lax` et sécurisé en production.
- Guard JWT appliqué globalement aux routes non publiques.
- Guard de rôles appliqué globalement aux routes portant `@Roles`.
- Vérification de l'état actif au login et à chaque rechargement de
  l'utilisateur depuis le JWT.
- Redirection frontend selon le rôle.
- Limitation de débit dédiée à la route de connexion.
- Déconnexion par suppression des cookies de session.

### 8.2 Comportements observés

- Un compte inactif reçoit le même message de connexion qu'un identifiant
  incorrect.
- Le JWT contient l'identifiant et l'email, mais le backend recharge le compte
  pour obtenir son rôle et son état actuels.
- Un changement de rôle en base est donc pris en compte lors de l'appel
  protégé suivant.
- La suppression ou la désactivation du compte rend le jeton inutilisable pour
  les routes protégées.
- Le mot de passe et son empreinte ne figurent pas dans l'utilisateur public
  retourné.
- La connexion générale efface une éventuelle session du terminal de pointage.
- L'écran `/login` n'est pas conservé à l'écran lorsqu'une session valide est
  déjà présente.

### 8.3 Limitations

Les mécanismes suivants ne sont pas présents dans le dépôt :

- récupération d'un mot de passe oublié ;
- changement autonome du mot de passe par l'utilisateur connecté ;
- authentification multifacteur ;
- authentification par fournisseur d'identité externe ;
- jeton de rafraîchissement ;
- rotation automatique du JWT pendant une session ;
- révocation ou liste de blocage backend des JWT ;
- endpoint backend de déconnexion ;
- historique de sessions consultable par l'administrateur ;
- commande permettant de fermer à distance une session utilisateur ;
- rôle d'accès autre que `ADMIN` et `EMPLOYEE` ;
- conservation d'un identifiant de session dans le JWT ;
- claims d'audience ou d'émetteur dans le JWT.

La fin de session explicite repose sur l'effacement des cookies par le
frontend. Un JWT précédemment copié reste cryptographiquement valide jusqu'à
son expiration tant que le compte associé reste actif et que le secret de
signature ne change pas.
