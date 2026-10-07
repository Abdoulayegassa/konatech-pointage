# API Reference — Authentification

| Métadonnée | Valeur |
|---|---|
| Document ID | API-002 |
| Titre | Authentification |
| Version | 1.0 |
| Statut | Validé |
| Classification | Interne |
| Référence | API Reference |
| Projet | Konatech Pointage |

## 1. Présentation

`AuthModule` fournit les deux modes d'identification exposés par l'API et la résolution de l'utilisateur courant. La connexion générale utilise un e-mail et un mot de passe. La connexion du terminal de pointage utilise un PIN à quatre chiffres et ne sélectionne que les comptes actifs de rôle `EMPLOYEE`.

Après une connexion réussie, `AuthService` émet un JWT Bearer et retourne une projection publique de l'employé. Les gardes globaux réutilisent ce service sur les routes protégées pour valider le jeton, recharger l'employé et vérifier son rôle lorsque `@Roles` est déclaré.

L'API backend ne crée pas de cookie. Le stockage des jetons dans des cookies HTTP-only est réalisé par les Route Handlers du frontend et ne fait pas partie des réponses de `AuthController`.

## 2. Architecture

```text
Client HTTP
    |
    +--> e-mail + mot de passe
    |            |
    |            v
    |         LoginDto
    |
    +--> PIN à quatre chiffres
                 |
                 v
       AttendanceEntryLoginDto
                 |
                 v
           AuthController
                 |
                 v
            AuthService
                 |
                 +--> PrismaService -> Employee
                 |
                 +--> vérification scrypt
                 |
                 v
       signJwtToken avec JWT_SECRET
                 |
                 v
      accessToken + durée + utilisateur public

Route protégée
    |
    v
AppThrottlerGuard -> JwtAuthGuard -> RolesGuard
                          |
                          v
             AuthService.getAuthenticatedUserFromToken
                          |
                          v
                  request.user
```

| Composant | Rôle observé | Source |
|---|---|---|
| `AuthController` | Expose les trois handlers Auth | `apps/backend/src/modules/auth/auth.controller.ts` |
| `AuthService` | Vérifie les secrets, émet et valide les JWT, charge l'employé | `apps/backend/src/modules/auth/auth.service.ts` |
| `LoginDto` | Valide la connexion e-mail/mot de passe | `apps/backend/src/modules/auth/dto/login.dto.ts` |
| `AttendanceEntryLoginDto` | Valide le PIN du terminal | `apps/backend/src/modules/auth/dto/attendance-entry-login.dto.ts` |
| `JwtAuthGuard` | Authentifie les routes non publiques | `apps/backend/src/modules/auth/guards/jwt-auth.guard.ts` |
| `RolesGuard` | Contrôle `accessRole` lorsque des rôles sont déclarés | `apps/backend/src/modules/auth/guards/roles.guard.ts` |
| Utilitaires JWT | Signent et vérifient le jeton HMAC SHA-256 | `apps/backend/src/common/security/jwt.util.ts` |
| Utilitaires secrets | Hachent et comparent mot de passe et PIN avec scrypt | `apps/backend/src/common/security/password.util.ts` |

## 3. Endpoints

| Méthode | Route | Description | Authentification |
|---|---|---|---|
| POST | `/api/v1/auth/login` | Connexion générale par e-mail et mot de passe | Publique par `@Public()` |
| POST | `/api/v1/auth/attendance-entry/login` | Connexion d'un employé au terminal par PIN | Publique par `@Public()` |
| GET | `/api/v1/auth/me` | Retourne l'utilisateur actif associé au JWT | Bearer requis; aucun rôle supplémentaire |

Les trois routes ne déclarent aucun paramètre de chemin ni paramètre de requête.

## 4. Requêtes

### 4.1 POST `/api/v1/auth/login`

| Élément | Valeur observée |
|---|---|
| Méthode | POST |
| Paramètres de chemin | Aucun |
| Paramètres de requête | Aucun |
| Corps | JSON conforme à `LoginDto` |
| Accès | Public |
| Limitation | Fenêtre et maximum issus de `LOGIN_RATE_LIMIT_TTL_MS` et `LOGIN_RATE_LIMIT_MAX` |

| Champ | Type | Obligatoire | Validation |
|---|---|---|---|
| `email` | chaîne | Oui | `@IsEmail()` |
| `password` | chaîne | Oui | `@IsString()`, longueur minimale de 8 |

Le pipe global interdit les propriétés non déclarées. `AuthService` recherche exactement `Employee.email`, exige un compte actif puis vérifie le mot de passe contre `passwordHash` avec scrypt.

### 4.2 POST `/api/v1/auth/attendance-entry/login`

| Élément | Valeur observée |
|---|---|
| Méthode | POST |
| Paramètres de chemin | Aucun |
| Paramètres de requête | Aucun |
| Corps | JSON conforme à `AttendanceEntryLoginDto` |
| Accès | Public |
| Limitation | Deux fenêtres spécifiques au PIN, en plus du garde global |

| Champ | Type | Obligatoire | Validation |
|---|---|---|---|
| `pinCode` | chaîne | Oui | Expression régulière exigeant exactement quatre chiffres |

Le service retire les espaces périphériques après validation, puis charge les employés qui réunissent les conditions suivantes :

- `accessRole` égal à `EMPLOYEE` ;
- `isActive` égal à `true` ;
- `pinCodeHash` ou ancien champ `pinCode` renseigné.

Chaque empreinte est comparée par scrypt. Lorsqu'un enregistrement ne possède pas d'empreinte et que son ancien PIN correspond, `AuthService` calcule `pinCodeHash` puis effectue un `updateMany` conditionné par l'identifiant, l'absence d'empreinte et la valeur historique. Le champ historique est alors mis à `null`.

Les deux limites dédiées présentes dans `AppModule` sont :

| Fenêtre | Maximum | Nom interne |
|---:|---:|---|
| 60 secondes | 5 requêtes | `attendanceEntryPinShort` |
| 600 secondes | 10 requêtes | `attendanceEntryPinLong` |

### 4.3 GET `/api/v1/auth/me`

| Élément | Valeur observée |
|---|---|
| Méthode | GET |
| Paramètres de chemin | Aucun |
| Paramètres de requête | Aucun |
| Corps | Aucun |
| En-tête | `Authorization: Bearer` suivi du JWT |
| Accès | Authentifié, sans annotation `@Roles` |
| DTO | Aucun |

`JwtAuthGuard` valide le jeton et place l'employé public dans `request.user`. `@CurrentUser` remet cet objet au handler, qui le retourne sans traitement supplémentaire.

## 5. Réponses

### 5.1 Structure commune des connexions réussies

Les deux handlers POST retournent le statut NestJS 201 et la structure suivante :

| Champ | Type | Contenu observé |
|---|---|---|
| `accessToken` | chaîne | JWT signé |
| `tokenType` | chaîne littérale | `Bearer` |
| `expiresIn` | chaîne | Durée utilisée pour calculer l'expiration |
| `user` | objet | Projection publique de l'employé authentifié |

La durée de la connexion générale provient de `JWT_EXPIRES_IN`, avec le défaut déclaré dans le code. La connexion du terminal utilise `ATTENDANCE_ENTRY_JWT_EXPIRES_IN`; en son absence, la constante active est `15m`.

### 5.2 Structure de l'utilisateur public

| Champ | Type observé | Présence |
|---|---|---|
| `id` | chaîne UUID | Toujours |
| `employeeIdentifier` | chaîne | Toujours |
| `firstName` | chaîne | Toujours |
| `lastName` | chaîne | Toujours |
| `email` | chaîne | Toujours |
| `role` | chaîne | Toujours |
| `accessRole` | `ADMIN` ou `EMPLOYEE` | Toujours |
| `department` | chaîne ou `null` | Toujours |
| `isActive` | booléen | Toujours |
| `scheduleId` | chaîne UUID ou `null` | Toujours |
| `createdAt` | date sérialisée | Toujours |
| `updatedAt` | date sérialisée | Toujours |

`passwordHash`, `pinCode` et `pinCodeHash` sont retirés de la réponse de connexion. La sélection de `/auth/me` utilise directement `publicEmployeeSelect`, qui ne contient aucun de ces champs.

### 5.3 GET `/api/v1/auth/me` réussi

Le statut est 200. Le corps est directement l'objet utilisateur public décrit ci-dessus; il n'est pas enveloppé dans un champ `user` et ne contient pas de nouveau jeton.

### 5.4 Erreurs observées

| Endpoint ou étape | Code | Condition observée | Message ou structure |
|---|---:|---|---|
| Deux connexions | 400 | Corps absent, champ inconnu ou validation DTO échouée | Réponse de validation NestJS; `message` peut être un tableau |
| Connexion générale | 401 | E-mail absent en base, compte inactif ou mot de passe incorrect | `Invalid credentials.` |
| Connexion PIN | 401 | Aucun employé actif ne correspond au PIN | `Identifiants invalides.` |
| Connexion générale | 429 | Limite dédiée ou globale dépassée | Exception de throttling |
| Connexion PIN | 429 | Une fenêtre PIN est dépassée | `Trop de tentatives. Reessayez dans quelques minutes.` |
| `/auth/me` et routes protégées | 401 | En-tête absent | `Missing Authorization header.` |
| `/auth/me` et routes protégées | 401 | Schéma différent de Bearer ou jeton absent | `Authorization header must use Bearer.` |
| `/auth/me` et routes protégées | 401 | JWT mal formé, signature invalide ou expiration atteinte | `Invalid or expired token.` |
| `/auth/me` et routes protégées | 401 | Employé absent ou devenu inactif | `User is no longer active.` |
| Route avec rôle déclaré | 403 | `accessRole` non autorisé | `Insufficient permissions for this resource.` |

La connexion PIN utilise un message générique qui ne distingue pas PIN inconnu, compte inactif ou absence de compte correspondant. Ce comportement est vérifié par les tests e2e.

## 6. Authentification JWT

### 6.1 Génération

`signJwtToken` construit un JWT en trois segments encodés en Base64 URL. L'en-tête produit contient `alg: HS256` et `typ: JWT`. La charge utile contient :

| Claim | Origine |
|---|---|
| `sub` | `Employee.id` |
| `email` | `Employee.email` |
| `iat` | Instant d'émission en secondes Unix |
| `exp` | `iat` augmenté de la durée convertie en secondes |

La signature est un HMAC SHA-256 calculé avec `JWT_SECRET`. Les durées acceptées par l'utilitaire sont un nombre de secondes ou un nombre suivi de `s`, `m`, `h` ou `d`.

### 6.2 Validation

`verifyJwtToken` :

1. sépare le jeton en en-tête, charge utile et signature ;
2. recalcule la signature HMAC ;
3. compare les signatures avec `timingSafeEqual` ;
4. décode la charge utile JSON ;
5. exige `sub` et `email` ;
6. refuse une valeur `exp` atteinte ou dépassée.

`AuthService.getAuthenticatedUserFromToken` utilise ensuite `sub` pour relire l'employé avec `publicEmployeeSelect`. La validité du JWT ne suffit donc pas lorsque l'employé a été supprimé ou désactivé.

### 6.3 Gardes et décorateurs

| Élément | Fonction réelle |
|---|---|
| `JwtAuthGuard` | Ignore les routes `@Public`, valide Bearer et affecte `request.user` |
| `RolesGuard` | Lit les métadonnées `@Roles` et compare `accessRole` |
| `@Public` | Définit la métadonnée qui contourne l'authentification JWT |
| `@Roles` | Déclare une ou plusieurs valeurs `AccessRole` autorisées |
| `@CurrentUser` | Extrait l'utilisateur authentifié de la requête |

`AuthModule` enregistre les deux gardes comme `APP_GUARD`. La protection s'applique donc globalement. Une route authentifiée sans `@Roles`, telle que `/auth/me`, accepte les deux valeurs d'`AccessRole` si le compte est actif.

Les rôles utilisés par l'autorisation sont `ADMIN` et `EMPLOYEE`. Le champ texte `role` de l'employé est retourné dans le profil, mais `RolesGuard` compare uniquement `accessRole`.

### 6.4 Absence de stratégie Passport

Le dépôt n'utilise pas `@nestjs/passport`, `passport-jwt` ni classe de stratégie JWT. La génération et la validation sont implémentées dans `common/security/jwt.util.ts`, et l'extraction Bearer est réalisée directement par `JwtAuthGuard`.

## 7. Flux d'authentification

### 7.1 Connexion générale

```text
Client
  |
  | POST /api/v1/auth/login
  | email + password
  v
ValidationPipe -> LoginDto
  |
  v
AuthController
  |
  v
AuthService
  |
  +--> Prisma : Employee par email
  +--> compte actif
  +--> verifyPassword avec scrypt
  |
  v
signJwtToken avec durée générale
  |
  v
201 : accessToken + tokenType + expiresIn + user
```

### 7.2 Connexion PIN

```text
Client
  |
  | POST /api/v1/auth/attendance-entry/login
  | pinCode
  v
Throttling global + deux fenêtres PIN
  |
  v
ValidationPipe -> AttendanceEntryLoginDto
  |
  v
Employés actifs de rôle EMPLOYEE avec PIN
  |
  +--> verifyPinCode sur pinCodeHash
  |
  +--> ancien pinCode correspondant
          |
          v
       migration vers pinCodeHash
  |
  v
signJwtToken avec durée du terminal
  |
  v
201 : accessToken + tokenType + expiresIn + user
```

### 7.3 Utilisation du jeton

```text
Client -> Authorization: Bearer suivi du jeton JWT
                    |
                    v
               JwtAuthGuard
                    |
                    v
     signature + claims + expiration
                    |
                    v
        Employee relu et encore actif
                    |
                    v
              request.user
                    |
          +---------+---------+
          |                   |
          v                   v
     RolesGuard          @CurrentUser
          |                   |
          +---------+---------+
                    v
              Handler protégé
```

## 8. Traçabilité

| Élément | Fichier ou répertoire source | Preuve observée |
|---|---|---|
| Endpoints Auth | `apps/backend/src/modules/auth/auth.controller.ts` | Deux POST publics et un GET protégé |
| Composition Auth | `apps/backend/src/modules/auth/auth.module.ts` | Contrôleur, service et gardes globaux |
| Connexion générale | `apps/backend/src/modules/auth/auth.service.ts`, `dto/login.dto.ts` | Recherche e-mail, état actif, mot de passe et réponse |
| Connexion PIN | `apps/backend/src/modules/auth/auth.service.ts`, `dto/attendance-entry-login.dto.ts` | Sélection EMPLOYEE, comparaison et migration |
| Réponse publique | `apps/backend/src/common/prisma/selects.ts`, interface Auth | Champs sélectionnés sans secrets |
| JWT | `apps/backend/src/common/security/jwt.util.ts` | Claims, HS256, durée, signature et expiration |
| Hachage | `apps/backend/src/common/security/password.util.ts` | scrypt, sel aléatoire et comparaison constante |
| Garde JWT | `apps/backend/src/modules/auth/guards/jwt-auth.guard.ts` | Bearer, route publique et utilisateur de requête |
| Garde de rôles | `apps/backend/src/modules/auth/guards/roles.guard.ts` | Comparaison d'`accessRole` |
| Décorateurs | `apps/backend/src/modules/auth/decorators/` | Métadonnées publiques/rôles et utilisateur courant |
| Constantes | `apps/backend/src/modules/auth/constants/` | Durée PIN, chemins, messages et noms de throttlers |
| Validation globale | `apps/backend/src/main.ts` | `ValidationPipe` et préfixe `/api/v1` |
| Limitation | `apps/backend/src/app.module.ts`, `apps/backend/src/common/security/app-throttler.guard.ts` | Limites login/PIN et réponse 429 |
| Données | `apps/backend/prisma/schema.prisma` | Employé, rôle, mot de passe et champs PIN |
| Tests de contrat | `apps/backend/test/app.e2e-spec.ts` | Succès, migration PIN, erreurs génériques, throttling et `/auth/me` |
| Frontend lié | `apps/frontend/app/api/auth/`, `apps/frontend/lib/auth-session.ts` | Relais et cookies hors du contrat backend |
| Documentation liée | `documentation/06-Developer-Guide/08-Authentification-et-autorisation.md`, `documentation/07-API-Reference/01-Presentation-de-lAPI.md` | Architecture recoupée avec le code actif |

## 9. Observations

- Le contrôleur Auth expose exactement trois handlers.
- Les deux connexions sont publiques et `/auth/me` est protégée globalement.
- Les deux connexions utilisent des DTO distincts et retournent la même forme générale.
- La connexion générale accepte tout compte actif dont le mot de passe correspond, indépendamment de son `accessRole`.
- La connexion PIN sélectionne uniquement les comptes actifs `EMPLOYEE`.
- La durée du jeton du terminal est distincte de celle de la session générale.
- Un PIN historique peut être migré vers une empreinte lors d'une connexion réussie.
- Les secrets de mot de passe et PIN ne figurent pas dans les réponses Auth.
- La charge utile JWT contient l'identifiant et l'e-mail de l'employé, ainsi que les instants d'émission et d'expiration.
- L'utilisateur est relu en base à chaque validation de jeton.
- L'autorisation repose sur `accessRole`, pas sur le champ fonctionnel `role`.
- L'implémentation JWT est interne et n'utilise pas Passport.
- L'API backend retourne le jeton dans le corps JSON et ne définit aucun cookie.
