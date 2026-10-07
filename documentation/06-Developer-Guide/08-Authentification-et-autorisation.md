# Developer Guide — Authentification et autorisation

| Métadonnée | Valeur |
|---|---|
| Document ID | DG-008 |
| Titre | Authentification et autorisation |
| Version | 1.0 |
| Statut | Validé |
| Classification | Interne |
| Référence | Developer Guide |
| Projet | Konatech Pointage |

## 1. Présentation

Konatech Pointage implémente une authentification par jeton JWT et une autorisation fondée sur le champ Prisma `accessRole`. Deux modes de connexion existent : la connexion applicative par e-mail et mot de passe, et l'identification du terminal de pointage par PIN à quatre chiffres.

Le backend crée et valide les jetons, résout l'utilisateur actif en base et applique les gardes globaux. Le frontend conserve les jetons dans deux cookies HTTP-only distincts et les transmet au backend dans l'en-tête Bearer par ses Route Handlers.

## 2. Architecture

Les composants d'authentification sont répartis entre le module NestJS `auth`, les utilitaires de sécurité communs, le modèle Prisma `Employee` et la couche serveur Next.js.

```text
Utilisateur
    |
    +---------------------------+
    |                           |
    v                           v
E-mail + mot de passe       PIN à 4 chiffres
    |                           |
    v                           v
/api/auth/login            /api/auth/attendance-entry-session
    |                           |
    +-------------+-------------+
                  |
                  v
       AuthController / AuthService
                  |
       +----------+----------+
       |                     |
       v                     v
Prisma Employee       password.util.ts
       |               scrypt / vérification
       +----------+----------+
                  |
                  v
            jwt.util.ts
          jeton signé HS256
                  |
        +---------+---------+
        |                   |
        v                   v
konatech_session   konatech_attendance_entry_session
        |                   |
        +---------+---------+
                  |
                  v
 Authorization: Bearer <jeton>
                  |
                  v
        Gardes JWT et rôles
```

`AuthModule` déclare `AuthController`, `AuthService`, `JwtAuthGuard` et `RolesGuard`. Les deux gardes sont enregistrés avec `APP_GUARD` et s'appliquent globalement.

## 3. Authentification

### 3.1 Connexion applicative

Le flux normal commence dans `LoginForm`, qui transmet e-mail, mot de passe et éventuelle destination interne à `POST /api/auth/login`. Le Route Handler appelle `POST /api/v1/auth/login` sur le backend.

`LoginDto` impose :

- un e-mail valide ;
- une chaîne de mot de passe d'au moins huit caractères.

`AuthService.login()` recherche l'employé par son adresse e-mail avec `PrismaService`. La connexion échoue si l'employé n'existe pas, s'il est inactif ou si `verifyPassword()` rejette le mot de passe. Les erreurs d'identifiants utilisent le même message backend.

Les mots de passe sont comparés avec l'utilitaire `password.util.ts`. Celui-ci utilise `scrypt`, un sel aléatoire stocké avec l'empreinte et `timingSafeEqual`.

### 3.2 Connexion du terminal de pointage

`AttendanceEntryPinView` collecte quatre chiffres et appelle `POST /api/auth/attendance-entry-session`. Ce Route Handler transmet le PIN à `POST /api/v1/auth/attendance-entry/login`.

`AttendanceEntryLoginDto` exige exactement quatre chiffres. `AuthService.loginForAttendanceEntry()` :

1. normalise le PIN avec `trim()` ;
2. charge les employés actifs dont `accessRole` vaut `EMPLOYEE` et qui possèdent une empreinte ou un PIN historique ;
3. vérifie chaque `pinCodeHash` avec `scrypt` ;
4. accepte un ancien `pinCode` en clair uniquement lorsqu'aucune empreinte n'existe ;
5. remplace ce PIN historique par son empreinte lors de la première connexion réussie ;
6. retourne une erreur générique si aucun employé ne correspond.

La réponse ne contient ni `passwordHash`, ni `pinCode`, ni `pinCodeHash`. La durée par défaut du jeton de ce flux est `15m`, définie par `DEFAULT_ATTENDANCE_ENTRY_JWT_EXPIRES_IN`. `AuthService` lit aussi `ATTENDANCE_ENTRY_JWT_EXPIRES_IN` si cette variable est fournie au processus.

### 3.3 Émission des jetons

`signJwtToken()` construit un jeton avec :

| Élément | Valeur ou source |
|---|---|
| Algorithme inscrit | `HS256` |
| Type inscrit | `JWT` |
| `sub` | Identifiant Prisma de l'employé |
| `email` | E-mail de l'employé |
| `iat` | Heure d'émission en secondes Unix |
| `exp` | Heure d'expiration calculée |
| Secret | `JWT_SECRET` |
| Durée applicative | `JWT_EXPIRES_IN`, avec repli `1d` |
| Durée terminal | `ATTENDANCE_ENTRY_JWT_EXPIRES_IN`, avec repli `15m` |

Les durées acceptées par l'utilitaire sont un nombre de secondes ou un entier suivi de `s`, `m`, `h` ou `d`.

La réponse de connexion contient `accessToken`, `tokenType: "Bearer"`, `expiresIn` et l'utilisateur public.

### 3.4 Validation et expiration

`verifyJwtToken()` sépare les trois segments, recalcule la signature HMAC-SHA256 avec `JWT_SECRET`, compare les signatures avec `timingSafeEqual`, décode la charge utile puis contrôle `sub`, `email` et `exp`.

`AuthService.getAuthenticatedUserFromToken()` transforme toute erreur de jeton en `UnauthorizedException`, recherche ensuite l'employé par `sub` et refuse un compte absent ou inactif. Le rôle d'accès n'est pas inclus dans le jeton : il provient de l'employé relu en base.

### 3.5 Stockage frontend et fin de session

| Mode | Cookie | Création | Suppression |
|---|---|---|---|
| Application | `konatech_session` | `POST /api/auth/login` | `POST /api/auth/logout` |
| Terminal de pointage | `konatech_attendance_entry_session` | `POST /api/auth/attendance-entry-session` | `DELETE /api/auth/attendance-entry-session` ou déconnexion globale |

Les deux cookies utilisent `httpOnly: true`, `sameSite: 'lax'`, `path: '/'`, une durée alignée sur `expiresIn` et `secure: true` lorsque `NODE_ENV` vaut `production`.

Une connexion applicative supprime le cookie du terminal avant d'écrire le cookie principal. La création d'une session de terminal remplace seulement le cookie du terminal. La déconnexion applicative supprime les deux cookies.

Le code ne contient aucun mécanisme de renouvellement de jeton, aucun refresh token et aucun endpoint backend de déconnexion ou de révocation.

## 4. Autorisation

### 4.1 Rôles

L'énumération Prisma `AccessRole` contient uniquement :

| Rôle d'accès | Routes ou usages observés |
|---|---|
| `ADMIN` | Tableau de bord, employés, horaires, calendrier, sanctions, historique global, exports et pointages administratifs |
| `EMPLOYEE` | Présence personnelle, politique de sécurité personnelle, historique personnel, entrée et sortie personnelles |

Le modèle `Employee` contient également un champ texte `role`. Ce champ décrit la fonction de l'employé, mais les gardes utilisent exclusivement `accessRole`.

### 4.2 Gardes

| Garde | Mécanisme | Résultat en cas de refus |
|---|---|---|
| `JwtAuthGuard` | Lit `@Public`, exige l'en-tête Bearer, valide le jeton et place l'utilisateur sur la requête | HTTP 401 par `UnauthorizedException` |
| `RolesGuard` | Lit les rôles de `@Roles` et compare `request.user.accessRole` | HTTP 403 par `ForbiddenException` lorsque le rôle diffère |
| `AppThrottlerGuard` | Applique les limites générales, de login et de PIN | HTTP 429 lorsque la limite applicable est dépassée |

`AppThrottlerGuard` appartient à la protection des requêtes mais ne décide pas des rôles. La connexion classique utilise les variables `LOGIN_RATE_LIMIT_TTL_MS` et `LOGIN_RATE_LIMIT_MAX`. Le PIN utilise deux fenêtres nommées : 5 tentatives sur 60 secondes et 10 tentatives sur 600 secondes.

### 4.3 Décorateurs

| Décorateur | Métadonnée ou valeur produite | Usage |
|---|---|---|
| `@Public()` | `IS_PUBLIC_KEY` | Contourne l'exigence JWT pour la route ou le contrôleur |
| `@Roles(...roles)` | `ROLES_KEY` | Déclare les valeurs `AccessRole` acceptées |
| `@CurrentUser()` | `request.user` | Injecte l'employé résolu dans un paramètre de contrôleur |

### 4.4 Matrice backend

| Portée | Accès déclaré |
|---|---|
| `GET /api/v1/health` | Public |
| `POST /api/v1/auth/login` | Public |
| `POST /api/v1/auth/attendance-entry/login` | Public |
| `GET /api/v1/attendance/entry` | Public |
| `GET /api/v1/auth/me` | Authentifié, sans rôle spécifique |
| Contrôleur `dashboard` | `ADMIN` |
| Contrôleur `employees` | `ADMIN` |
| Contrôleur `schedules` | `ADMIN` |
| Contrôleur `calendar` | `ADMIN` |
| Contrôleur `sanctions` | `ADMIN` |
| `attendance/summary`, `attendance/history`, `attendance/exports/monthly`, `attendance/check-in`, `attendance/check-out` | `ADMIN` |
| `attendance/me/today`, `attendance/me/security-policy`, `attendance/me/history`, `attendance/me/check-in`, `attendance/me/check-out` | `EMPLOYEE` |

Le dépôt ne définit pas de permission individuelle ni de table de permissions. L'autorisation backend est fondée sur l'authentification et les deux valeurs de `AccessRole`.

## 5. Protection des routes

### 5.1 Backend

Pour une route non publique, le frontend serveur ajoute le jeton sélectionné dans `Authorization: Bearer`. Le garde JWT vérifie le jeton et recharge l'employé. Le garde de rôles examine ensuite la métadonnée de la route ou du contrôleur.

```text
Requête vers /api/v1/*
          |
          v
Gardes globaux enregistrés
    |
    +--> AppThrottlerGuard
    +--> JwtAuthGuard
    |             |
    | @Public     | route protégée
    |             v
    |       Bearer + vérification JWT
    |             |
    |             v
    |       Employee relu par Prisma
    |             |
    +-------------+
    |
    +--> RolesGuard
    |             |
    | sans rôle   | @Roles(...)
    |             v
    |       comparaison accessRole
    +-------------+
          |
          v
Validation DTO -> Contrôleur -> Service -> Réponse
```

Le schéma illustre les responsabilités des gardes. Leur enregistrement global est déclaré par trois providers `APP_GUARD` dans `AppModule` et `AuthModule`.

### 5.2 Frontend

Le frontend protège les parcours par plusieurs mécanismes observés :

| Mécanisme | Portée |
|---|---|
| Middleware Next.js | Vérifie la présence de `konatech_session` sur `/`, `/my-attendance`, `/employees` et `/schedules` |
| `requireCurrentUser()` | Appelle `/auth/me` avec le jeton et redirige vers `/login` si la session n'est pas valide |
| Contrôle `accessRole` des pages | Redirige les employés hors des pages administrateur et les administrateurs hors de `/my-attendance` |
| Page `/attendance-entry` | Lit uniquement le cookie du terminal et exige un utilisateur `EMPLOYEE` |
| Fonctions proxy | Choisissent explicitement le cookie principal ou le cookie du terminal et ajoutent Bearer |

Les pages `/attendance-history`, `/calendar`, `/sanctions` et `/exports` appliquent leur contrôle dans leur fonction serveur sans figurer dans le `matcher` du middleware.

Les Route Handlers de pointage personnel utilisent `sessionMode: 'attendance-entry'`. `resolveSessionToken()` ne se replie pas sur la session principale dans ce mode. Une réponse backend 401 dans ce mode supprime le cookie du terminal.

## 6. Flux d'authentification

### 6.1 Flux e-mail et mot de passe

```text
Utilisateur
    |
    v
LoginForm
    |
    v
POST /api/auth/login (Next.js)
    |
    v
POST /api/v1/auth/login (NestJS)
    |
    v
LoginDto + ValidationPipe
    |
    v
AuthService
    |
    +--> Employee par e-mail
    +--> compte actif
    +--> verifyPassword(scrypt)
    |
    v
signJwtToken
    |
    v
Cookie konatech_session
    |
    v
Redirection selon accessRole
    |
    v
Route protégée -> Bearer -> gardes -> réponse
```

La destination par défaut est `/` pour `ADMIN` et `/my-attendance` pour `EMPLOYEE`. `normalizeRedirectTarget()` n'accepte qu'un chemin interne et écarte `/login`. Un administrateur demandant `/attendance-entry` est redirigé vers `/`.

### 6.2 Flux PIN

```text
Employé
    |
    v
/attendance-entry -> saisie de 4 chiffres
    |
    v
POST /api/auth/attendance-entry-session
    |
    v
POST /api/v1/auth/attendance-entry/login
    |
    v
DTO + limitation des tentatives
    |
    v
Employés actifs de rôle EMPLOYEE
    |
    v
verifyPinCode ou migration du PIN historique
    |
    v
JWT court -> cookie terminal
    |
    v
/attendance-entry
    |
    v
Route Handler de pointage -> Bearer -> route EMPLOYEE
```

## 7. Organisation du code

| Domaine | Fichier ou répertoire | Responsabilité |
|---|---|---|
| Module Auth | `apps/backend/src/modules/auth/auth.module.ts` | Contrôleur, service et gardes globaux |
| Contrôleur Auth | `apps/backend/src/modules/auth/auth.controller.ts` | Login, login PIN et utilisateur courant |
| Service Auth | `apps/backend/src/modules/auth/auth.service.ts` | Vérification, jetons, utilisateur et migration du PIN historique |
| DTO | `apps/backend/src/modules/auth/dto/` | Validation de l'e-mail, du mot de passe et du PIN |
| Gardes | `apps/backend/src/modules/auth/guards/` | Authentification JWT et autorisation par rôle |
| Décorateurs | `apps/backend/src/modules/auth/decorators/` | Public, rôles et utilisateur courant |
| Constantes | `apps/backend/src/modules/auth/constants/` | Clés de métadonnées, durées et limites PIN |
| Interface | `apps/backend/src/modules/auth/interfaces/authenticated-user.interface.ts` | Alias de l'employé public authentifié |
| JWT | `apps/backend/src/common/security/jwt.util.ts` | Signature, durée et vérification |
| Secrets | `apps/backend/src/common/security/password.util.ts` | Hachage et vérification scrypt |
| Throttling | `apps/backend/src/common/security/app-throttler.guard.ts` | Limites et journal des blocages PIN |
| Sélection Prisma | `apps/backend/src/common/prisma/selects.ts` | Champs publics de l'employé |
| Modèle | `apps/backend/prisma/schema.prisma` | `AccessRole` et champs d'authentification d'`Employee` |
| Configuration | `apps/backend/src/app.module.ts` | Variables JWT, limites et providers globaux |
| Formulaire frontend | `apps/frontend/components/auth/login-form.tsx` | Envoi des identifiants et navigation |
| Clavier PIN | `apps/frontend/components/attendance/attendance-entry-pin-view.tsx` | Saisie, retours d'erreur et création de session terminal |
| Routes Auth frontend | `apps/frontend/app/api/auth/` | Cookies, relais backend et déconnexion |
| Sessions frontend | `apps/frontend/lib/auth-session.ts` | Noms, options, sélection et suppression des cookies |
| Utilisateur frontend | `apps/frontend/lib/auth.ts` | Lecture de session et exigence d'un utilisateur |
| Proxy frontend | `apps/frontend/lib/api-route.ts` | Sélection du jeton et en-tête Bearer |
| Middleware frontend | `apps/frontend/middleware.ts` | Contrôle de présence du cookie sur les chemins configurés |
| Redirections | `apps/frontend/lib/redirect.ts` | Validation et destination interne par rôle |

Aucun fichier ou répertoire de stratégie d'authentification n'est présent. Les gardes appellent directement `AuthService` et les utilitaires JWT.

## 8. Traçabilité

| Élément documenté | Fichier ou répertoire source | Preuve observée |
|---|---|---|
| Endpoints Auth | `apps/backend/src/modules/auth/auth.controller.ts` | Deux connexions publiques et `/auth/me` protégé |
| Connexion applicative | `apps/backend/src/modules/auth/auth.service.ts` | Recherche e-mail, compte actif et mot de passe |
| Connexion PIN | `apps/backend/src/modules/auth/auth.service.ts` | Employés actifs, empreinte et migration historique |
| Réponse publique | `apps/backend/src/common/prisma/selects.ts` | Champs sélectionnés sans secrets |
| JWT | `apps/backend/src/common/security/jwt.util.ts` | HMAC-SHA256, claims et expiration |
| Hachage | `apps/backend/src/common/security/password.util.ts` | scrypt, sel et comparaison constante |
| Rôles | `apps/backend/prisma/schema.prisma` | Énumération `AccessRole` et champ `accessRole` |
| Garde JWT | `apps/backend/src/modules/auth/guards/jwt-auth.guard.ts` | Public, Bearer et résolution utilisateur |
| Garde de rôles | `apps/backend/src/modules/auth/guards/roles.guard.ts` | Lecture des métadonnées et refus 403 |
| Décorateurs | `apps/backend/src/modules/auth/decorators/` | Métadonnées et paramètre utilisateur |
| Limites | `apps/backend/src/app.module.ts`, `apps/backend/src/common/security/app-throttler.guard.ts` | Fenêtres générales, login et PIN |
| Matrice de routes | Contrôleurs sous `apps/backend/src/modules/` | Décorateurs `Public` et `Roles` |
| Validation Auth | `apps/backend/src/modules/auth/dto/` | Contraintes e-mail, mot de passe et PIN |
| Configuration JWT | `apps/backend/src/app.module.ts`, `apps/backend/.env.example`, `.env.production.example`, `docker-compose.yml` | Variables réellement validées ou fournies |
| Cookies | `apps/frontend/lib/auth-session.ts` | Deux noms et options de cookie |
| Login frontend | `apps/frontend/app/api/auth/login/route.ts` | Relais, cookie et redirection |
| Session terminal | `apps/frontend/app/api/auth/attendance-entry-session/route.ts` | Relais PIN et cookie court |
| Déconnexion | `apps/frontend/app/api/auth/logout/route.ts` | Suppression des deux cookies |
| Protection frontend | `apps/frontend/middleware.ts`, `apps/frontend/lib/auth.ts` | Présence du cookie et validation utilisateur |
| Proxy autorisé | `apps/frontend/lib/api-route.ts` | Sélection de session et ajout Bearer |
| Pages par rôle | Fichiers `page.tsx` sous `apps/frontend/app/` | Contrôles `accessRole` et redirections |
| Tests Auth | `apps/backend/test/app.e2e-spec.ts` | Login, PIN, migration, limitation, 401, 403 et séparation des sessions |
| Backend | `documentation/06-Developer-Guide/06-Backend-NestJS.md` | Position des gardes et du module Auth |

## 9. Observations

- Deux flux de connexion émettent le même format de jeton avec des durées distinctes.
- Le jeton contient l'identifiant et l'e-mail, mais pas le rôle d'accès.
- Chaque requête protégée relit l'employé et son état actif dans PostgreSQL.
- Les rôles d'accès sont limités à `ADMIN` et `EMPLOYEE`.
- Le champ texte `role` n'intervient pas dans `RolesGuard`.
- L'autorisation ne comporte pas de permission granulaire.
- Les gardes JWT et rôles sont globaux ; les routes publiques sont déclarées explicitement.
- Le frontend utilise deux cookies HTTP-only distincts pour empêcher le terminal de reprendre implicitement la session applicative.
- Le flux PIN accepte temporairement un PIN historique en clair et le remplace par une empreinte après une connexion réussie.
- Les mots de passe et les empreintes de PIN utilisent le même utilitaire scrypt.
- La déconnexion est réalisée par suppression des cookies frontend.
- Aucun refresh token, endpoint de renouvellement ou liste de révocation n'est présent.
- Aucun package Passport, aucune stratégie OAuth et aucun fournisseur d'identité externe n'est déclaré.
- `ATTENDANCE_ENTRY_JWT_EXPIRES_IN` est lu par `AuthService` mais n'est pas déclaré dans le schéma Joi, les fichiers d'exemple ou `docker-compose.yml`; sa valeur de repli codée est `15m`.
