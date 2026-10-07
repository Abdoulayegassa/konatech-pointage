# Système d'authentification

| Métadonnée | Valeur |
| --- | --- |
| Document ID | DG-006 |
| Titre | Système d'authentification |
| Version | 1.0 |
| Statut | Validé |
| Classification | Interne |
| Référence | Developer Guide |
| Date de génération | 30 juillet 2026 |

# 1. Présentation

## 1.1 Objectif

Ce chapitre décrit le système d'authentification et d'autorisation réellement implémenté dans Konatech Pointage. Il couvre le module NestJS, la création et la vérification des JWT, les guards globaux, les décorateurs, les rôles, la validation, les cookies Next.js, les redirections et le terminal de pointage par PIN.

La description porte sur le flux actuel observé dans le dépôt. Aucun ancien parcours ni mécanisme absent n'est inclus comme fonctionnalité disponible.

## 1.2 Rôle du système d'authentification

Le système assure :

- l'identification standard par adresse électronique et mot de passe ;
- l'identification courte d'un employé par code PIN sur le terminal de pointage ;
- l'émission de JWT signés ;
- la vérification du JWT sur les routes backend protégées ;
- le rechargement de l'utilisateur actif depuis PostgreSQL ;
- le contrôle des rôles `ADMIN` et `EMPLOYEE` ;
- le stockage serveur du JWT dans des cookies HTTP-only gérés par Next.js ;
- la transmission du JWT au backend sous forme de Bearer token ;
- la déconnexion par suppression des cookies ;
- la limitation des tentatives de connexion.

Deux contextes de session sont présents :

| Contexte | Identifiant | Cookie frontend | Usage |
| --- | --- | --- | --- |
| Session standard | Adresse électronique et mot de passe | `konatech_session` | Pages de compte et d'administration |
| Terminal de pointage | Code PIN à quatre chiffres | `konatech_attendance_entry_session` | Identification courte et appels d'entrée/sortie du terminal |

**Fichiers de référence :**

- `apps/backend/src/modules/auth`
- `apps/backend/src/common/security`
- `apps/frontend/app/api/auth`
- `apps/frontend/lib/auth.ts`
- `apps/frontend/lib/auth-session.ts`
- `apps/frontend/lib/api-route.ts`

# 2. Architecture

## 2.1 `AuthModule`

`AuthModule` déclare :

| Élément | Rôle |
| --- | --- |
| `AuthController` | Endpoints de connexion et de lecture de l'utilisateur courant |
| `AuthService` | Vérification des identifiants, émission et validation des JWT |
| `JwtAuthGuard` | Authentification globale des requêtes protégées |
| `RolesGuard` | Autorisation globale selon `accessRole` |

`AuthService` est exporté. Les deux guards sont enregistrés au moyen du token `APP_GUARD`; ils s'appliquent donc globalement et ne sont pas ajoutés route par route avec `@UseGuards()`.

`AppThrottlerGuard`, déclaré dans `AppModule`, complète cette chaîne par une limitation globale des requêtes et des tentatives de connexion.

## 2.2 JWT

Le backend utilise un utilitaire JWT interne dans `common/security/jwt.util.ts`. Aucune bibliothèque Passport ou stratégie JWT externe n'est présente.

### Format

Le token contient :

| Claim | Source |
| --- | --- |
| `sub` | Identifiant UUID de l'employé |
| `email` | Adresse électronique de l'employé |
| `iat` | Date d'émission calculée en secondes Unix |
| `exp` | Date d'expiration calculée à partir de la durée configurée |

Le header créé contient `alg: "HS256"` et `typ: "JWT"`.

### Signature

La signature est calculée avec :

- HMAC SHA-256 ;
- la variable `JWT_SECRET` ;
- un encodage Base64 URL sans remplissage.

La vérification :

1. sépare les trois segments ;
2. recalcule la signature ;
3. compare les buffers avec `timingSafeEqual` ;
4. décode le payload ;
5. vérifie la présence de `sub` et `email` ;
6. refuse un `exp` dépassé.

### Durées

| Session | Source | Défaut observé |
| --- | --- | --- |
| Standard | `JWT_EXPIRES_IN` | `1d` |
| Terminal PIN | `ATTENDANCE_ENTRY_JWT_EXPIRES_IN` | `15m` |

Les durées acceptées par l'utilitaire sont :

- un nombre de secondes ;
- un entier suivi de `s`, `m`, `h` ou `d`.

`JWT_SECRET` est validé par Joi comme une chaîne obligatoire d'au moins 32 caractères. La validation de production refuse les valeurs contenant les marqueurs locaux, de test ou de remplacement contrôlés par `validateSecurityConfig`.

## 2.3 Guards

### `JwtAuthGuard`

Pour chaque route non publique, le guard :

1. consulte la métadonnée `isPublic` ;
2. lit le header `Authorization` ;
3. exige le schéma exact `Bearer` suivi d'un token ;
4. appelle `AuthService.getAuthenticatedUserFromToken()` ;
5. place l'utilisateur obtenu dans `request.user`.

`AuthService.getAuthenticatedUserFromToken()` ne se limite pas au payload. Il recharge `Employee` avec `publicEmployeeSelect` et refuse un compte absent ou inactif.

### `RolesGuard`

Le guard :

1. lit les métadonnées `roles` sur la méthode et le contrôleur ;
2. laisse passer une route sans rôle déclaré ;
3. récupère `request.user` ;
4. compare `user.accessRole` aux rôles requis ;
5. lève une erreur d'autorisation si le rôle ne correspond pas.

Le champ textuel `Employee.role` n'intervient pas dans ce contrôle. Seul `Employee.accessRole` est utilisé.

### `AppThrottlerGuard`

Ce guard étend `ThrottlerGuard` et applique :

| Limite | Route ciblée | Configuration |
| --- | --- | --- |
| Globale | Toutes les routes | `RATE_LIMIT_TTL_MS`, `RATE_LIMIT_MAX` |
| Connexion standard | `POST .../auth/login` | `LOGIN_RATE_LIMIT_TTL_MS`, `LOGIN_RATE_LIMIT_MAX` |
| PIN courte | `POST .../auth/attendance-entry/login` | 5 tentatives sur 60 secondes |
| PIN longue | `POST .../auth/attendance-entry/login` | 10 tentatives sur 600 secondes |

Lorsqu'une limite PIN bloque la requête, le guard retourne une erreur `429`, ajoute `Retry-After` et journalise la route, l'adresse suivie, le user-agent, le nom du throttler et l'horodatage.

## 2.4 Décorateurs

| Décorateur | Implémentation | Usage |
| --- | --- | --- |
| `@Public()` | Métadonnée `isPublic` | Exclut une route du contrôle JWT |
| `@Roles(...roles)` | Métadonnée `roles` | Déclare les valeurs `AccessRole` admises |
| `@CurrentUser()` | Param decorator | Retourne `request.user` |

## 2.5 Stratégies

Aucune classe `JwtStrategy`, `LocalStrategy` ou autre stratégie Passport n'est présente. Les dépendances `passport`, `@nestjs/passport` et `passport-jwt` ne figurent pas dans le `package.json` du backend.

L'équivalent fonctionnel est assuré directement par :

- `AuthService` ;
- `jwt.util.ts` ;
- `JwtAuthGuard` ;
- `RolesGuard`.

## 2.6 Modèle utilisateur

L'authentification utilise le modèle Prisma `Employee`. Les propriétés concernées sont :

| Propriété | Usage |
| --- | --- |
| `id` | Claim JWT `sub` et rechargement de l'utilisateur |
| `email` | Connexion standard, claim JWT et identifiant public |
| `passwordHash` | Vérification du mot de passe |
| `pinCode` | Valeur historique optionnelle du PIN |
| `pinCodeHash` | Vérification actuelle du PIN |
| `accessRole` | Autorisation `ADMIN` ou `EMPLOYEE` |
| `isActive` | Refus de connexion et invalidation fonctionnelle d'un token |

`publicEmployeeSelect` exclut les secrets de la réponse publique.

## 2.7 Diagramme d'architecture

```text
Frontend Next.js
      |
      | cookie HTTP-only
      v
Route Handler Next.js
      |
      | Authorization: Bearer <JWT>
      v
Backend NestJS
      |
      +--> AppThrottlerGuard
      |
      +--> JwtAuthGuard
      |       |
      |       +--> @Public()
      |       +--> AuthService
      |               |
      |               +--> jwt.util.ts
      |               +--> PrismaService -> Employee
      |
      +--> RolesGuard
              |
              +--> @Roles()
              +--> user.accessRole
      |
      v
Controller protégé
```

**Fichiers de référence :**

- `apps/backend/src/modules/auth/auth.module.ts`
- `apps/backend/src/modules/auth/auth.service.ts`
- `apps/backend/src/modules/auth/guards/jwt-auth.guard.ts`
- `apps/backend/src/modules/auth/guards/roles.guard.ts`
- `apps/backend/src/modules/auth/decorators`
- `apps/backend/src/common/security/jwt.util.ts`
- `apps/backend/src/common/security/app-throttler.guard.ts`
- `apps/backend/src/app.module.ts`
- `apps/backend/prisma/schema.prisma`

# 3. Cycle d'authentification

## 3.1 Connexion standard

Le flux actuel est :

1. l'utilisateur ouvre `/login` ;
2. la page vérifie d'abord l'éventuelle session existante avec `getCurrentUser()` ;
3. `LoginForm` collecte l'adresse électronique et le mot de passe ;
4. le formulaire appelle `POST /api/auth/login` sur Next.js ;
5. la route Next.js relaie les données à `POST /api/v1/auth/login` du backend ;
6. `LoginDto` valide l'adresse électronique, le type du mot de passe et sa longueur minimale ;
7. `AuthService` recherche l'employé par adresse électronique ;
8. il refuse un compte absent ou inactif ;
9. il vérifie `passwordHash` avec scrypt ;
10. il émet un JWT ;
11. la route Next.js supprime l'éventuelle session courte du terminal ;
12. elle écrit le JWT dans `konatech_session` ;
13. elle retourne la destination calculée et l'utilisateur ;
14. le composant effectue `router.push()` puis `router.refresh()`.

La destination par défaut est :

| Rôle | Destination |
| --- | --- |
| `ADMIN` | `/` |
| `EMPLOYEE` | `/my-attendance` |

Une destination interne `redirectTo` peut être conservée. `normalizeRedirectTarget()` rejette les valeurs :

- non textuelles ;
- vides ;
- ne commençant pas par `/` ;
- commençant par `//` ;
- commençant par `/\` ;
- égales à `/login`.

Une cible `/attendance-entry` demandée par un administrateur est remplacée par `/`.

## 3.2 Authentification du terminal par PIN

Le flux du terminal est distinct :

1. l'utilisateur ouvre `/attendance-entry` ;
2. la page lit `konatech_attendance_entry_session` ;
3. sans cookie court, elle affiche `AttendanceEntryPinView` ;
4. le composant collecte exactement quatre chiffres ;
5. il appelle `POST /api/auth/attendance-entry-session` ;
6. la route Next.js relaie le PIN à `POST /api/v1/auth/attendance-entry/login` ;
7. `AttendanceEntryLoginDto` exige quatre chiffres ;
8. `AuthService` ne recherche que les comptes actifs de rôle `EMPLOYEE` possédant un PIN ou un hash de PIN ;
9. il vérifie les hash existants ;
10. en présence d'un ancien PIN en clair sans hash, il le vérifie puis le remplace par un hash ;
11. le backend émet un JWT court ;
12. la route Next.js écrit le JWT dans `konatech_attendance_entry_session` ;
13. le navigateur revient sur `/attendance-entry` ;
14. la page valide le JWT par `/auth/me` et charge les données de pointage ;
15. elle n'affiche le terminal que si `accessRole` vaut `EMPLOYEE`.

Si le token court est invalide, expiré ou associé à un rôle différent, la page revient à la saisie PIN et déclenche la suppression du cookie obsolète.

## 3.3 Hachage des secrets

Les mots de passe et PIN utilisent le même mécanisme générique :

- scrypt de Node.js ;
- sel aléatoire de 16 octets ;
- clé dérivée de 64 octets ;
- format stocké `scrypt:<sel>:<hash>` ;
- comparaison avec `timingSafeEqual`.

`EmployeesService` hache les mots de passe et les PIN lors de la gestion des comptes. `AuthService` peut migrer un PIN historique après sa première validation réussie. Un script de reprise des PIN est également présent.

## 3.4 Requêtes authentifiées côté frontend

Les pages serveur utilisent le cookie standard ainsi :

1. `getSessionToken()` lit `konatech_session` ;
2. `getCurrentUser()` appelle `/auth/me` avec le token ;
3. `requireCurrentUser()` redirige vers `/login` si aucun utilisateur valide n'est retourné ;
4. la page vérifie ensuite le rôle attendu ;
5. les fonctions de `lib/api.ts` transmettent le token au backend.

Les mutations des composants clients transitent par les routes `/api` Next.js. `lib/api-route.ts` :

1. choisit le cookie standard ou le cookie du terminal selon `sessionMode` ;
2. construit `Authorization: Bearer <token>` ;
3. relaie la requête au backend ;
4. conserve le statut d'erreur ;
5. supprime le cookie court après une réponse `401` en mode terminal.

## 3.5 Autorisation backend

Pour une route protégée :

1. `JwtAuthGuard` valide le Bearer token ;
2. `AuthService` recharge le compte actif ;
3. l'utilisateur est placé sur la requête ;
4. `RolesGuard` compare `accessRole` à `@Roles()` ;
5. le contrôleur peut récupérer l'utilisateur avec `@CurrentUser()`.

Une route authentifiée sans `@Roles()` accepte les deux rôles. C'est le cas de `GET /api/v1/auth/me`.

## 3.6 Diagramme du cycle standard

```text
Connexion /login
      |
      v
LoginForm
email + mot de passe
      |
      v
Route Next.js /api/auth/login
      |
      v
Validation LoginDto
      |
      v
AuthService
Employee actif + vérification scrypt
      |
      v
JWT HS256
sub + email + iat + exp
      |
      v
Cookie HTTP-only konatech_session
      |
      v
Requête Next.js authentifiée
      |
      v
Authorization: Bearer <JWT>
      |
      v
JwtAuthGuard -> utilisateur actif
      |
      v
RolesGuard -> accessRole
      |
      v
Controller autorisé
```

## 3.7 Diagramme du cycle terminal

```text
/attendance-entry
      |
      v
Saisie du PIN à 4 chiffres
      |
      v
/api/auth/attendance-entry-session
      |
      v
/api/v1/auth/attendance-entry/login
      |
      v
Compte EMPLOYEE actif
+ vérification du PIN scrypt
      |
      v
JWT court, défaut 15 minutes
      |
      v
Cookie HTTP-only
konatech_attendance_entry_session
      |
      v
Terminal de pointage
      |
      v
Routes /attendance/me/*
protégées par le rôle EMPLOYEE
```

**Fichiers de référence :**

- `apps/frontend/app/login/page.tsx`
- `apps/frontend/components/auth/login-form.tsx`
- `apps/frontend/app/api/auth/login/route.ts`
- `apps/frontend/app/attendance-entry/page.tsx`
- `apps/frontend/components/attendance/attendance-entry-pin-view.tsx`
- `apps/frontend/app/api/auth/attendance-entry-session/route.ts`
- `apps/frontend/lib/api-route.ts`
- `apps/frontend/lib/api.ts`
- `apps/backend/src/modules/auth/auth.controller.ts`
- `apps/backend/src/modules/auth/auth.service.ts`
- `apps/backend/src/modules/auth/dto`
- `apps/backend/src/common/security/password.util.ts`

# 4. Gestion des rôles

## 4.1 Rôles définis

L'énumération Prisma `AccessRole` contient uniquement :

- `ADMIN` ;
- `EMPLOYEE`.

Aucun autre rôle d'accès n'est présent.

## 4.2 Responsabilités et restrictions

| Rôle | Responsabilités observées | Accès backend explicites | Restrictions observées |
| --- | --- | --- | --- |
| `ADMIN` | Pilotage, gestion des employés, plannings, calendrier, sanctions, historique, exports et pointages administratifs | Dashboard ; employés ; plannings ; calendrier ; sanctions ; synthèse, historique, export, entrée et sortie administrateur | N'a pas accès aux endpoints de pointage `attendance/me/*` protégés par `EMPLOYEE`; n'est pas accepté par la connexion PIN |
| `EMPLOYEE` | Consultation de ses données et exécution de ses propres entrées et sorties | `attendance/me/today`, `attendance/me/security-policy`, `attendance/me/history`, `attendance/me/check-in`, `attendance/me/check-out` | N'a pas accès aux contrôleurs administrateur ; est redirigé vers `/my-attendance` par les pages frontend d'administration |

Les deux rôles peuvent accéder à `/api/v1/auth/me` avec un JWT valide.

## 4.3 Contrôleurs administrateur

Les contrôleurs suivants portent `@Roles(AccessRole.ADMIN)` au niveau de la classe :

- `DashboardController` ;
- `EmployeesController` ;
- `SchedulesController` ;
- `CalendarController` ;
- `SanctionsController`.

`AttendanceController` applique les rôles méthode par méthode.

## 4.4 Routes de pointage

| Route backend | Rôle |
| --- | --- |
| `GET /api/v1/attendance/summary` | `ADMIN` |
| `GET /api/v1/attendance/history` | `ADMIN` |
| `GET /api/v1/attendance/exports/monthly` | `ADMIN` |
| `POST /api/v1/attendance/check-in` | `ADMIN` |
| `POST /api/v1/attendance/check-out` | `ADMIN` |
| `GET /api/v1/attendance/me/today` | `EMPLOYEE` |
| `GET /api/v1/attendance/me/security-policy` | `EMPLOYEE` |
| `GET /api/v1/attendance/me/history` | `EMPLOYEE` |
| `POST /api/v1/attendance/me/check-in` | `EMPLOYEE` |
| `POST /api/v1/attendance/me/check-out` | `EMPLOYEE` |

## 4.5 Protection frontend par rôle

Les pages administrateur :

- appellent `requireCurrentUser()` ;
- vérifient `user.accessRole !== 'ADMIN'` ;
- redirigent alors vers `/my-attendance`.

Les pages concernées sont :

- `/` ;
- `/attendance-history` ;
- `/employees` ;
- `/schedules` ;
- `/calendar` ;
- `/sanctions` ;
- `/exports`.

La page `/my-attendance` redirige un utilisateur `ADMIN` vers `/`.

La page `/attendance-entry` vérifie que le compte de la session courte possède le rôle `EMPLOYEE`.

## 4.6 Champ métier distinct

Le modèle `Employee` possède deux champs différents :

| Champ | Fonction observée |
| --- | --- |
| `accessRole` | Autorisation technique `ADMIN` ou `EMPLOYEE` |
| `role` | Fonction ou intitulé métier libre |

`RolesGuard` n'utilise que `accessRole`.

**Fichiers de référence :**

- `apps/backend/prisma/schema.prisma`
- tous les contrôleurs sous `apps/backend/src/modules`
- `apps/backend/src/modules/auth/guards/roles.guard.ts`
- `apps/frontend/app/page.tsx`
- pages administrateur sous `apps/frontend/app`
- `apps/frontend/app/my-attendance/page.tsx`
- `apps/frontend/app/attendance-entry/page.tsx`

# 5. Protection des routes

## 5.1 Routes publiques backend

Les seules routes explicitement décorées avec `@Public()` sont :

| Méthode | Route | Fonction |
| --- | --- | --- |
| `POST` | `/api/v1/auth/login` | Connexion standard |
| `POST` | `/api/v1/auth/attendance-entry/login` | Connexion PIN |
| `GET` | `/api/v1/health` | Santé du backend |
| `GET` | `/api/v1/attendance/entry` | Redirection vers l'URL fixe du terminal |

Toutes les autres routes backend passent par `JwtAuthGuard`.

## 5.2 Routes backend protégées sans rôle explicite

`GET /api/v1/auth/me` exige un JWT valide, mais ne déclare aucun rôle. Il est donc disponible à tout utilisateur authentifié et actif.

## 5.3 Routes backend protégées par rôle

La protection combine :

- `JwtAuthGuard` global ;
- `RolesGuard` global ;
- `@Roles()` sur les contrôleurs ou méthodes ;
- `@CurrentUser()` pour les opérations liées à l'utilisateur authentifié.

Le backend constitue le contrôle d'autorisation des endpoints, indépendamment des redirections frontend.

## 5.4 Middleware frontend

`apps/frontend/middleware.ts` vérifie la présence du cookie standard sur :

- `/` ;
- `/my-attendance` et ses sous-chemins ;
- `/employees` et ses sous-chemins ;
- `/schedules` et ses sous-chemins.

En l'absence du cookie, il redirige vers `/login`.

Le middleware :

- ne décode pas le JWT ;
- ne vérifie pas l'expiration ;
- ne charge pas l'utilisateur ;
- ne contrôle pas le rôle.

Ces vérifications sont réalisées ensuite dans les pages serveur avec `getCurrentUser()` et les contrôles `accessRole`.

## 5.5 Pages non couvertes par le matcher

Les pages administrateur suivantes ne figurent pas dans le matcher du middleware :

- `/attendance-history` ;
- `/calendar` ;
- `/sanctions` ;
- `/exports`.

Elles appellent néanmoins `requireCurrentUser()` et vérifient explicitement le rôle `ADMIN` dans leur composant serveur.

## 5.6 Routes API Next.js

Les route handlers Next.js agissent comme une couche intermédiaire :

- ils lisent les cookies HTTP-only ;
- ils ajoutent le Bearer token ;
- ils ne réimplémentent pas `RolesGuard` ;
- ils relaient le statut et les erreurs du backend.

Sans cookie correspondant, `proxyApiRequest()` et `proxyApiFileRequest()` retournent une réponse `401` avec le message de session expirée.

## 5.7 Validation des permissions

La chaîne de permission actuelle est :

```text
Présence du cookie côté frontend
              |
              v
Validation du JWT par le backend
              |
              v
Rechargement du compte actif
              |
              v
Lecture de @Roles()
              |
              v
Comparaison avec user.accessRole
```

**Fichiers de référence :**

- `apps/backend/src/modules/auth/decorators/public.decorator.ts`
- `apps/backend/src/modules/auth/decorators/roles.decorator.ts`
- `apps/backend/src/modules/auth/guards/jwt-auth.guard.ts`
- `apps/backend/src/modules/auth/guards/roles.guard.ts`
- tous les contrôleurs backend
- `apps/frontend/middleware.ts`
- `apps/frontend/lib/auth.ts`
- `apps/frontend/lib/api-route.ts`
- pages serveur sous `apps/frontend/app`

# 6. Gestion des sessions

## 6.1 Émission du JWT

Les deux méthodes de connexion retournent la même forme :

| Champ | Contenu |
| --- | --- |
| `accessToken` | JWT signé |
| `tokenType` | `Bearer` |
| `expiresIn` | Durée utilisée pour le JWT |
| `user` | Projection publique de l'employé |

Les secrets `passwordHash`, `pinCode` et `pinCodeHash` sont retirés avant la réponse.

## 6.2 Stockage côté client

Le JWT n'est pas stocké dans `localStorage` ni `sessionStorage`. Il est écrit par les route handlers Next.js dans un cookie.

Les options communes sont :

| Option | Valeur observée |
| --- | --- |
| `httpOnly` | `true` |
| `sameSite` | `lax` |
| `secure` | `true` uniquement quand `NODE_ENV === 'production'` |
| `path` | `/` |
| `maxAge` | Durée convertie depuis `expiresIn` |

Le cookie n'est donc pas lu directement par les composants clients.

## 6.3 Conversion de l'expiration

Les routes Next.js de connexion convertissent :

- un entier en secondes ;
- une durée terminée par `s`, `m`, `h` ou `d`.

Si une durée reçue n'est pas reconnue, le fallback frontend est :

| Cookie | Fallback |
| --- | --- |
| Standard | 24 heures |
| Terminal | 15 minutes |

Le backend calcule également `exp` à partir de la durée. L'expiration existe donc dans le JWT et dans le cookie.

## 6.4 Transmission

Les pages et routes Next.js lisent les cookies avec `cookies()` côté serveur. `lib/api-route.ts` ajoute ensuite :

```text
Authorization: Bearer <token>
```

Le cookie standard est le mode par défaut. Le cookie court est sélectionné avec `sessionMode: 'attendance-entry'`.

Les routes Next.js de pointage employé :

- `/api/attendance/me/check-in` ;
- `/api/attendance/me/check-out`

utilisent explicitement le mode `attendance-entry`.

## 6.5 Validation continue

À chaque requête backend protégée :

- la signature et l'expiration sont vérifiées ;
- l'employé est relu depuis PostgreSQL ;
- un compte devenu inactif est refusé.

Le JWT n'intègre pas le rôle comme claim. Le rôle actuel vient donc de la lecture de l'employé, et une modification de `accessRole` est prise en compte lors d'une requête ultérieure.

## 6.6 Déconnexion standard

`LogoutForm` effectue un POST vers `/api/auth/logout`. Cette route :

1. supprime `konatech_session` ;
2. écrit ce même cookie vide avec `maxAge: 0` ;
3. supprime aussi `konatech_attendance_entry_session` ;
4. écrit aussi le cookie court vide ;
5. redirige vers `/login`.

Aucun endpoint de déconnexion backend n'est présent. La déconnexion ne révoque pas le JWT côté backend ; elle retire les copies conservées dans les cookies frontend.

## 6.7 Fermeture de la session PIN

La méthode `DELETE /api/auth/attendance-entry-session` supprime uniquement le cookie court.

Elle est appelée :

- par `AttendanceEntrySessionButton` ;
- par `AttendanceEntryPinView` lorsqu'une session courte obsolète doit être nettoyée.

Une réponse backend `401` à une requête relayée en mode terminal entraîne également la suppression du cookie court.

## 6.8 Renouvellement

Aucun mécanisme de refresh token, aucune route de renouvellement et aucune rotation de JWT ne sont présents.

À expiration, une nouvelle authentification standard ou PIN est nécessaire selon le contexte.

## 6.9 Révocation

Aucune liste de révocation, table de session ou blacklist de token n'est présente. L'inactivation de l'employé rend toutefois le token inutilisable lors du rechargement du compte.

**Fichiers de référence :**

- `apps/backend/src/modules/auth/auth.service.ts`
- `apps/backend/src/common/security/jwt.util.ts`
- `apps/frontend/lib/auth-session.ts`
- `apps/frontend/lib/auth.ts`
- `apps/frontend/lib/api-route.ts`
- `apps/frontend/app/api/auth/login/route.ts`
- `apps/frontend/app/api/auth/logout/route.ts`
- `apps/frontend/app/api/auth/attendance-entry-session/route.ts`
- `apps/frontend/components/auth/logout-form.tsx`
- `apps/frontend/components/attendance/attendance-entry-session-button.tsx`

# 7. Gestion des erreurs

## 7.1 Validation des identifiants

| Entrée | Validation frontend | Validation backend |
| --- | --- | --- |
| Adresse électronique | Champ HTML `type="email"` et `required` | `@IsEmail()` |
| Mot de passe | Champ `required` | `@IsString()`, `@MinLength(8)` |
| PIN | Pavé de quatre chiffres et soumission quand quatre chiffres sont présents | `@IsString()`, expression régulière de quatre chiffres |

Le `ValidationPipe` global applique `whitelist`, refuse les propriétés inconnues et transforme les entrées.

## 7.2 Erreurs backend d'authentification

| Situation | Réponse observée |
| --- | --- |
| Compte standard absent | `401` avec identifiants invalides |
| Compte standard inactif | `401` avec identifiants invalides |
| Mot de passe incorrect | `401` avec identifiants invalides |
| PIN non reconnu | `401` avec message générique d'identifiants invalides |
| Header `Authorization` absent | `401` |
| Header n'utilisant pas `Bearer` | `401` |
| JWT mal formé, signature invalide ou expiration dépassée | `401` avec token invalide ou expiré |
| Employé du JWT absent ou inactif | `401` indiquant que l'utilisateur n'est plus actif |
| Rôle insuffisant | `403` |
| Limite de connexion PIN atteinte | `429` |
| DTO invalide | `400` |

Les tentatives PIN invalides utilisent un message générique sans identifier la cause ou le compte.

## 7.3 Erreurs des routes Next.js

Les routes frontend d'authentification :

- reprennent les messages backend sous la clé `error` ;
- joignent les tableaux de messages de validation ;
- retournent le statut HTTP du backend ;
- retournent `502` lorsque le backend n'est pas joignable ;
- retournent `500` pour une erreur de configuration d'URL API reconnue.

Les messages de fallback observés incluent :

- connexion impossible ;
- impossibilité de vérifier le code ;
- session expirée ;
- impossibilité de fermer la session PIN.

## 7.4 Affichage frontend

`LoginForm` affiche l'erreur retournée, ou son message de fallback.

`AttendanceEntryPinView` :

- transforme certains messages PIN en message adapté ;
- affiche l'employé après une connexion réussie ;
- signale une impossibilité de vérification en cas d'erreur réseau.

`AttendanceEntrySessionButton` affiche une erreur locale si la fermeture du cookie court échoue.

## 7.5 Redirections sur session invalide

`getCurrentUser()` retourne `null` lorsque `/auth/me` échoue. `requireCurrentUser()` redirige alors vers `/login`.

La page du terminal intercepte les erreurs de validation de la session courte, réaffiche le PIN et demande le nettoyage du cookie.

## 7.6 Codes HTTP

| Code | Origine observée |
| --- | --- |
| `400` | Validation DTO |
| `401` | Authentification ou session absente/invalide |
| `403` | Autorisation par rôle |
| `429` | Limitation des tentatives |
| `500` | Configuration frontend d'API invalide |
| `502` | Backend indisponible depuis une route Next.js |

Aucun filtre d'exception personnalisé n'est présent dans le backend. Les exceptions sont sérialisées par le mécanisme HTTP standard de NestJS.

**Fichiers de référence :**

- `apps/backend/src/main.ts`
- `apps/backend/src/modules/auth/dto`
- `apps/backend/src/modules/auth/auth.service.ts`
- `apps/backend/src/modules/auth/guards`
- `apps/backend/src/common/security/app-throttler.guard.ts`
- `apps/frontend/components/auth/login-form.tsx`
- `apps/frontend/components/attendance/attendance-entry-pin-view.tsx`
- `apps/frontend/components/attendance/attendance-entry-session-button.tsx`
- `apps/frontend/app/api/auth`
- `apps/frontend/lib/api-route.ts`

# 8. Traçabilité

| Section | Sujet vérifié | Fichiers principaux |
| --- | --- | --- |
| 1 | Deux contextes de session | `AuthController`, routes Next.js d'authentification, `auth-session.ts` |
| 2 | Composition du module | `apps/backend/src/modules/auth/auth.module.ts` |
| 2 | Émission et vérification JWT | `apps/backend/src/common/security/jwt.util.ts`, `auth.service.ts` |
| 2 | Hachage | `apps/backend/src/common/security/password.util.ts` |
| 2 | Guards globaux | `auth.module.ts`, `jwt-auth.guard.ts`, `roles.guard.ts`, `app.module.ts` |
| 2 | Throttling | `app.module.ts`, `common/security/app-throttler.guard.ts`, constantes du terminal |
| 2 | Décorateurs | `apps/backend/src/modules/auth/decorators` |
| 2 | Modèle utilisateur | `apps/backend/prisma/schema.prisma`, `common/prisma/selects.ts` |
| 3 | Connexion standard | `LoginForm`, route Next.js `auth/login`, `AuthController`, `AuthService` |
| 3 | Connexion PIN actuelle | `AttendanceEntryPinView`, route Next.js `attendance-entry-session`, `AuthService` |
| 3 | Redirections | `apps/frontend/lib/redirect.ts`, `app/login/page.tsx` |
| 3 | Requêtes authentifiées | `apps/frontend/lib/auth.ts`, `lib/api.ts`, `lib/api-route.ts` |
| 4 | Rôles backend | Schéma Prisma, `RolesGuard`, tous les contrôleurs backend |
| 4 | Rôles frontend | Pages sous `apps/frontend/app` |
| 5 | Routes publiques | Tous les décorateurs `@Public()` des contrôleurs |
| 5 | Routes protégées | Tous les décorateurs `@Roles()` et guards |
| 5 | Middleware frontend | `apps/frontend/middleware.ts` |
| 6 | Cookies | `apps/frontend/lib/auth-session.ts` |
| 6 | Déconnexion | `LogoutForm`, route Next.js `auth/logout`, bouton de session PIN |
| 6 | Expiration | `jwt.util.ts`, routes Next.js de connexion |
| 7 | Validation | DTO d'authentification, `main.ts`, formulaires frontend |
| 7 | Erreurs | `AuthService`, guards, throttler, routes Next.js et composants |

# 9. Observations

## 9.1 Sécurité

- Les mots de passe et PIN sont hachés avec scrypt et un sel aléatoire.
- Les comparaisons de hash et de signature utilisent `timingSafeEqual`.
- Les JWT sont signés avec HMAC SHA-256.
- Le JWT contient l'identifiant et l'adresse électronique, mais pas le rôle.
- Le compte est relu à chaque authentification de requête protégée.
- Un compte inactif ne peut ni se connecter ni continuer à utiliser son JWT.
- Les cookies sont HTTP-only, `SameSite=Lax` et sécurisés en production.
- La connexion standard et la connexion PIN sont limitées en débit.
- Les erreurs d'identifiants standard et PIN ne distinguent pas l'absence du compte d'un secret incorrect.

## 9.2 Modularité

- `AuthModule` regroupe le contrôleur, le service et les guards d'authentification.
- Les opérations cryptographiques sont isolées dans `common/security`.
- Les métadonnées et décorateurs sont placés dans le module Auth.
- Les projections publiques de l'employé sont définies dans la couche Prisma commune.
- Le throttling appartient à la configuration racine et à un guard commun.

## 9.3 Séparation frontend/backend

- Le backend émet et valide les JWT.
- Next.js stocke les JWT et agit comme intermédiaire pour les composants clients.
- Les composants clients ne lisent pas directement le JWT.
- Les pages frontend ajoutent des redirections d'interface, mais le backend applique les permissions des endpoints.
- Le middleware frontend contrôle uniquement la présence d'un cookie sur quatre familles de chemins.
- Les autres pages protégées contrôlent la session dans leur composant serveur.

## 9.4 Gestion des permissions

- Seul `accessRole` détermine l'autorisation.
- Les rôles disponibles sont uniquement `ADMIN` et `EMPLOYEE`.
- Les contrôleurs administrateur portent le rôle au niveau de la classe.
- `AttendanceController` distingue les rôles au niveau de chaque méthode.
- `GET /auth/me` exige une authentification sans exiger un rôle particulier.
- Les routes publiques sont explicitement marquées avec `@Public()`.

## 9.5 Sessions et mécanismes absents

- La session standard et la session du terminal utilisent deux cookies distincts.
- Une connexion standard supprime le cookie court existant.
- La déconnexion standard supprime les deux cookies.
- Il n'existe pas de refresh token.
- Il n'existe pas de révocation persistante des JWT.
- Il n'existe pas de table de session.
- Il n'existe pas de stratégie Passport.
- Il n'existe pas de fournisseur OAuth ou de connexion sociale.
- Il n'existe pas de second facteur TOTP.
- Il n'existe pas de parcours de mot de passe oublié ou de réinitialisation autonome.

## 9.6 Comportement du pointage frontend

- Les route handlers Next.js `/api/attendance/me/check-in` et `/api/attendance/me/check-out` sélectionnent explicitement le cookie `konatech_attendance_entry_session`.
- La page `/attendance-entry` fournit ce contexte après validation du PIN.
- La page `/my-attendance` est chargée avec le cookie standard, mais son composant d'action appelle les mêmes route handlers de pointage, qui sélectionnent le cookie court.
- En l'absence du cookie court, ces route handlers retournent `401` avec le message de session expirée.
- Aucun autre route handler d'entrée ou de sortie utilisant le cookie standard n'est présent.
