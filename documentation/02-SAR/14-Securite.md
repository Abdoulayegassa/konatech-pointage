# Sécurité

| Métadonnée | Valeur |
|---|---|
| Document ID | SAR-SEC-001 |
| Titre | Sécurité |
| Version | 1.0 |
| Statut | Validé |
| Classification | Interne |
| Référence SAPDD | Sécurité |
| Date de génération | 29 juillet 2026 |

## 1. Présentation

### 1.1 Objectifs de sécurité

L'architecture de sécurité de Konatech Pointage protège :

- l'accès aux interfaces et ressources API ;
- les secrets d'authentification des employés ;
- les opérations réservées aux administrateurs ;
- la portée personnelle des opérations employé ;
- les entrées reçues par l'API ;
- les flux de pointage contre l'absence de preuve requise ;
- les téléchargements et appels backend transitant par Next.js ;
- la configuration de production ;
- l'API contre certaines fréquences excessives de requêtes.

### 1.2 Périmètre

Les mécanismes documentés couvrent le backend NestJS, le frontend Next.js, PostgreSQL via Prisma, les sessions JWT, les cookies, le RBAC, la validation, Helmet, CORS, le throttling et les preuves de pointage.

### 1.3 Principes effectivement implémentés

| Principe | Implémentation |
|---|---|
| Authentification systématique | Guard JWT global sauf `@Public()` |
| Autorisation | Rôles `ADMIN` et `EMPLOYEE` |
| Validation côté serveur | ValidationPipe global et DTO |
| Secrets non retournés | Projections Prisma et déstructuration |
| Stockage des credentials | Hash scrypt des mots de passe et PIN |
| Session navigateur | Cookies HTTP-only |
| Défense HTTP | Helmet, CORS, limites de corps |
| Limitation de débit | Guard global et limites dédiées login/PIN |
| Sécurité du pointage | Évaluation backend conditionnelle |
| Configuration validée | Joi au démarrage |

Implémentation principale :

- `apps/backend/src/main.ts`
- `apps/backend/src/app.module.ts`
- `apps/backend/src/modules/auth/`
- `apps/backend/src/common/security/`
- `apps/frontend/lib/auth-session.ts`
- `apps/frontend/lib/api-route.ts`

## 2. Architecture de sécurité

### 2.1 Backend

Le backend applique des protections globales avant les contrôleurs :

1. middlewares Helmet et body parser limité ;
2. CORS configuré ;
3. AppThrottlerGuard ;
4. JwtAuthGuard ;
5. RolesGuard ;
6. ValidationPipe.

Les services effectuent ensuite les vérifications métier et d'intégrité.

### 2.2 Frontend

Next.js reçoit le JWT lors du login backend et le conserve dans un cookie HTTP-only. Les Server Components résolvent l'utilisateur par `/auth/me`. Les route handlers extraient le token côté serveur et l'envoient au backend sous forme de bearer token.

### 2.3 JWT

Le JWT est signé avec HMAC-SHA-256 et `JWT_SECRET`. Il contient :

- `sub` : identifiant Employee ;
- `email` ;
- `iat` ;
- `exp`.

Le rôle n'est pas inclus ; il est relu en base à chaque requête protégée.

### 2.4 Cookies

Deux cookies séparent les contextes :

- `konatech_session` pour la session standard ;
- `konatech_attendance_entry_session` pour la borne.

Ils sont HTTP-only, SameSite Lax, Secure en production, limités au chemin `/` et portent un `maxAge`.

### 2.5 Guards

Trois guards globaux sont présents :

- AppThrottlerGuard ;
- JwtAuthGuard ;
- RolesGuard.

### 2.6 Validation

ValidationPipe interdit les propriétés non déclarées, transforme les valeurs et applique class-validator. Des règles métier supplémentaires restent dans les services.

### 2.7 API

Toutes les routes backend sont protégées par défaut. Les seules exemptions utilisent `@Public()`. Le frontend possède une couche proxy pour les mutations et les fichiers, ce qui évite d'exposer le token aux composants JavaScript.

```text
Utilisateur
   |
   v
Frontend Next.js
   |
   | cookie HTTP-only
   v
Server Component / Route Handler
   |
   | Authorization: Bearer JWT
   v
Helmet / CORS / Body limit
   |
   v
ThrottlerGuard
   |
   v
JwtAuthGuard ---- AuthService ---- Prisma ---- Employee actif
   |
   v
RolesGuard
   |
   v
ValidationPipe
   |
   v
Controller -> Service métier -> Prisma -> PostgreSQL
```

Fichiers concernés :

- `apps/backend/src/main.ts`
- `apps/backend/src/modules/auth/auth.module.ts`
- `apps/backend/src/modules/auth/guards/`
- `apps/frontend/app/api/`
- `apps/frontend/lib/`

## 3. Authentification

### 3.1 Login standard

`POST /api/v1/auth/login` est public. `LoginDto` exige un email valide et un mot de passe d'au moins huit caractères. AuthService :

1. recherche Employee par email ;
2. refuse une absence ou un compte inactif ;
3. vérifie le hash du mot de passe ;
4. signe un JWT ;
5. retourne le token et une projection publique de l'utilisateur.

Les comptes absents, inactifs et mots de passe invalides produisent tous `Invalid credentials.`.

### 3.2 Login PIN de borne

`POST /api/v1/auth/attendance-entry/login` est public. Le DTO exige quatre chiffres. Le service charge les Employee actifs avec rôle EMPLOYEE et PIN configuré, puis vérifie les hash séquentiellement.

Un ancien `pinCode` en clair est accepté uniquement lorsqu'aucun `pinCodeHash` n'existe. Après correspondance, le service calcule le hash et efface la valeur en clair par `updateMany()`.

### 3.3 Hash des secrets

Mots de passe et PIN utilisent le même utilitaire :

- algorithme Node.js `scrypt` ;
- sel aléatoire de 16 octets encodé en hexadécimal ;
- clé dérivée de 64 octets ;
- format `scrypt:<salt>:<hash>` ;
- comparaison `timingSafeEqual`.

Le format est vérifié avant comparaison. Un hash mal formé retourne `false`.

### 3.4 JWT

La signature est produite par `createHmac('sha256', secret)`. Les segments sont encodés en Base64URL. La vérification contrôle :

- les trois segments ;
- la signature avec comparaison à temps constant ;
- la présence de `sub` et `email` ;
- `exp` par rapport à l'horloge système.

Après validation cryptographique, AuthService charge l'employé avec une projection publique et exige `isActive`.

### 3.5 Expiration

| Session | Configuration | Défaut applicatif |
|---|---|---|
| Standard | `JWT_EXPIRES_IN` | `1d` |
| Borne | `ATTENDANCE_ENTRY_JWT_EXPIRES_IN` | `15m` |

Le frontend convertit les durées `s`, `m`, `h`, `d` en `maxAge` du cookie.

### 3.6 Refresh Token

Aucun refresh token, endpoint de renouvellement, rotation ou paire access/refresh n'est trouvé.

### 3.7 Stockage

Le token est placé dans un cookie HTTP-only par une route handler Next.js. Aucun usage de localStorage, sessionStorage ou cookie écrit par JavaScript client n'est trouvé.

### 3.8 Logout

POST `/api/auth/logout` efface les deux cookies et redirige vers `/login`. La session de borne peut aussi être supprimée par DELETE `/api/auth/attendance-entry-session`.

Aucune liste de révocation backend n'est présente ; le logout supprime le token côté navigateur.

### 3.9 Secrets retournés

AuthService retire `passwordHash`, `pinCode` et `pinCodeHash` de la réponse. `publicEmployeeSelect` ne sélectionne aucun de ces champs.

Fichiers concernés :

- `apps/backend/src/modules/auth/auth.controller.ts`
- `apps/backend/src/modules/auth/auth.service.ts`
- `apps/backend/src/common/security/password.util.ts`
- `apps/backend/src/common/security/jwt.util.ts`
- `apps/frontend/app/api/auth/`
- `apps/frontend/lib/auth-session.ts`

## 4. Autorisation

### 4.1 RBAC

Le schéma Prisma définit deux rôles :

- `ADMIN` ;
- `EMPLOYEE`.

`Employee.accessRole` vaut EMPLOYEE par défaut.

### 4.2 JwtAuthGuard

Le guard s'applique globalement. Il :

- ignore les routes marquées publiques ;
- exige un en-tête Authorization scalaire ;
- exige le schéma exact `Bearer` ;
- délègue la validation à AuthService ;
- affecte l'employé à `request.user`.

### 4.3 RolesGuard

Le guard lit la métadonnée `roles` de la méthode ou classe. Sans rôle requis, il autorise un utilisateur déjà authentifié. Avec rôle requis, il vérifie que `user.accessRole` appartient à la liste ; sinon il lève ForbiddenException.

### 4.4 Décorateurs

| Décorateur | Fonction |
|---|---|
| `@Public()` | Exempte JwtAuthGuard |
| `@Roles(...AccessRole)` | Déclare les rôles autorisés |
| `@CurrentUser()` | Injecte `request.user` |

### 4.5 Portées

Les contrôleurs Dashboard, Employees, Schedules, Calendar et Sanctions sont ADMIN au niveau classe. Attendance déclare séparément ses routes publiques, ADMIN et EMPLOYEE.

Les routes `/attendance/me/*` extraient l'identifiant de l'utilisateur courant ; elles ne prennent pas d'employeeId fourni par le client.

### 4.6 Permissions

Aucune entité Permission, table rôle-permission, permission granulaire ou décorateur `@Permissions()` n'est présent. Les droits sont attachés directement aux routes par rôle.

### 4.7 Champ métier `role`

`Employee.role` est un intitulé textuel et n'est pas utilisé par RolesGuard. Seul `accessRole` gouverne l'autorisation.

Fichiers concernés :

- `apps/backend/prisma/schema.prisma`
- `apps/backend/src/modules/auth/guards/jwt-auth.guard.ts`
- `apps/backend/src/modules/auth/guards/roles.guard.ts`
- `apps/backend/src/modules/auth/decorators/`
- contrôleurs sous `apps/backend/src/modules/`

## 5. Validation des données

### 5.1 ValidationPipe

Le pipe global configure :

| Option | Valeur | Effet |
|---|---|---|
| `whitelist` | true | Seules les propriétés de DTO sont reconnues |
| `forbidNonWhitelisted` | true | Une propriété inconnue est refusée |
| `transform` | true | Les entrées deviennent des instances/types attendus |
| `enableImplicitConversion` | true | Conversion implicite des types |

### 5.2 class-validator

Les DTO contrôlent types, formats, tailles, bornes, UUID, dates ISO, enums, tableaux et motifs. ParseUUIDPipe protège plusieurs paramètres de route.

### 5.3 Validation imbriquée de la preuve

`CheckInSecurityDto` utilise ValidateNested et Type. La preuve accepte :

- latitude entre -90 et 90 ;
- longitude entre -180 et 180 ;
- précision entre 0 et 50 000 ;
- data URL JPEG/JPG/PNG/WebP encodée base64 ;
- longueur maximale de 1 000 000 caractères.

### 5.4 PIN

La création et modification d'Employee appliquent :

- quatre chiffres ;
- exclusion de `0000`, `1111`, `1234`, `4321`, `9999`.

Le service reproduit une validation métier au moyen de `isValidEmployeePinCode()`.

### 5.5 Limite du corps

Le body parser JSON et URL-encoded utilise `JSON_BODY_LIMIT`, avec `10mb` par défaut.

### 5.6 Sanitation

Aucune bibliothèque de sanitation HTML, d'encodage contextuel ou de nettoyage de chaînes n'est trouvée. ValidationPipe filtre la structure et valide les contraintes ; il ne réalise pas une sanitation HTML générique.

### 5.7 Vérifications métier

Les services contrôlent notamment :

- dates futures et formats de mois ;
- état d'entrée/sortie ;
- unicité et concurrence des pointages ;
- existence des entités liées ;
- chevauchement des règles de sanction ;
- doublons calendrier ;
- horaires de planning ;
- preuve selfie/GPS.

Fichiers concernés :

- `apps/backend/src/main.ts`
- `apps/backend/src/modules/*/dto/`
- `apps/backend/src/common/validation/pin-code.validation.ts`
- services métier sous `apps/backend/src/modules/`

## 6. Protection HTTP

### 6.1 CORS

Le backend appelle `enableCors()` avec :

- origine unique issue de `FRONTEND_URL` ;
- `credentials: true`.

Aucune liste de plusieurs origines ni fonction dynamique d'origine n'est configurée.

### 6.2 Helmet

`app.use(helmet())` active les en-têtes par défaut du package Helmet. Aucune option Helmet spécifique n'est fournie dans le code.

### 6.3 CSP

Aucune politique CSP personnalisée n'est déclarée. Le code s'appuie sur les valeurs par défaut du middleware Helmet côté backend. `next.config.ts` ne définit pas de headers CSP pour les réponses Next.js.

### 6.4 CSRF

Aucun token CSRF, middleware CSRF ou vérification explicite Origin/Referer n'est trouvé. Les cookies utilisent SameSite Lax, mais aucun mécanisme CSRF applicatif distinct n'est implémenté.

### 6.5 Cookies sécurisés

| Attribut | Valeur |
|---|---|
| HttpOnly | true |
| SameSite | lax |
| Secure | true uniquement en production |
| Path | `/` |
| MaxAge | durée du token |
| Domain | Non défini |

### 6.6 Headers

Outre Helmet :

- les exports backend et proxy définissent `Cache-Control: no-store` ;
- l'export définit Content-Type et Content-Disposition ;
- le throttler définit des en-têtes Limit, Remaining, Reset et Retry-After.

Aucune configuration de headers de sécurité personnalisée dans Next.js n'est présente.

### 6.7 HTTPS

Le backend n'instancie pas de serveur TLS et n'effectue pas de redirection HTTP vers HTTPS. En production, la validation de configuration exige que `FRONTEND_URL` utilise HTTPS. Le frontend exige des URL de production non locales et rejette certaines URL privées ou de tunnel.

Le cookie Secure est activé en production.

### 6.8 Trust proxy

`TRUST_PROXY_HOPS` vaut zéro par défaut. S'il est positif, Express reçoit cette valeur pour `trust proxy`, notamment utilisée dans la détermination du client par le throttler.

Fichiers concernés :

- `apps/backend/src/main.ts`
- `apps/backend/src/app.module.ts`
- `apps/frontend/lib/auth-session.ts`
- `apps/frontend/next.config.ts`

## 7. Protection API

### 7.1 Routes publiques

| Méthode | Route |
|---|---|
| POST | `/api/v1/auth/login` |
| POST | `/api/v1/auth/attendance-entry/login` |
| GET | `/api/v1/attendance/entry` |
| GET | `/api/v1/health` |

Toutes les autres routes exigent un JWT.

### 7.2 Endpoints ADMIN

Dashboard, Employees, Schedules, Calendar et Sanctions sont réservés à ADMIN. Les synthèses, historiques, exports et pointages administratifs Attendance le sont également.

### 7.3 Endpoints EMPLOYEE

Les routes personnelles de consultation, politique de sécurité, historique, entrée et sortie exigent EMPLOYEE.

### 7.4 Contrôle JWT

La vérification du token précède le contrôle du rôle. L'employé est rechargé depuis PostgreSQL, ce qui observe immédiatement une désactivation ou modification de rôle.

### 7.5 Limitation de débit

| Limiteur | Périmètre | Valeurs par défaut |
|---|---|---|
| default | Toutes les routes | 300 / 60 s |
| login | POST `/auth/login` | 20 / 60 s |
| PIN court | POST login borne | 5 / 60 s |
| PIN long | POST login borne | 10 / 600 s |

AppThrottlerGuard journalise les blocages PIN avec route, IP/tracker, user-agent, limiteur et timestamp. Aucun stockage distribué externe du throttler n'est configuré dans le dépôt.

### 7.6 Sécurité du pointage

AttendanceSecurityService est l'autorité serveur. Lorsque `enforceSecurity` est vrai :

1. un selfie est toujours requis ;
2. si la politique GPS est active, la localisation est requise ;
3. la précision doit respecter `maxAccuracyMeters` ;
4. la distance à l'entreprise est calculée par Haversine ;
5. hors du rayon autorisé, un commentaire est requis.

Le service ne bloque pas un pointage hors rayon lorsqu'un commentaire non vide le justifie ; il enregistre `OFFSITE_LOCATION_JUSTIFIED`.

AttendanceService transmet `enforceSecurity: false` pour les commandes administratives `checkIn()` et `checkOut()`, et `enforceSecurity: true` pour `checkInForEmployee()` et `checkOutForEmployee()`.

### 7.7 Politique conditionnelle

La politique GPS n'est active que si `ATTENDANCE_SECURITY_ENABLED` est vrai et si les deux coordonnées d'entreprise existent. Les valeurs par défaut du service sont :

- rayon de confiance 100 m ;
- rayon d'avertissement 300 m ;
- précision maximale 200 m.

Le rayon autorisé provient de la configuration ou du rayon d'avertissement.

### 7.8 Stockage photo

AttendancePhotoStorageService :

- revalide le data URL ;
- signe une requête Cloudinary avec le secret API ;
- utilise l'endpoint HTTPS Cloudinary ;
- définit dossier, public ID, tags et timestamp ;
- impose un timeout ;
- réessaie les statuts 408, 429, 5xx et erreurs réseau ;
- stocke seulement secure URL et public ID dans Attendance.

Les trois clés Cloudinary doivent être présentes ensemble. En test, le service retourne une URL simulée.

### 7.9 Contrôles frontend

Le navigateur capture localisation et selfie, mais le commentaire de source de vérité et l'implémentation placent la décision finale dans le backend. Les coordonnées et preuves sont transmises au serveur.

Fichiers concernés :

- `apps/backend/src/common/security/app-throttler.guard.ts`
- `apps/backend/src/modules/attendance/attendance-security-policy.service.ts`
- `apps/backend/src/modules/attendance/attendance-security.service.ts`
- `apps/backend/src/modules/attendance/attendance-photo-storage.service.ts`
- `apps/frontend/components/attendance/`

## 8. Gestion des secrets

### 8.1 Chargement

ConfigModule recherche, dans cet ordre :

1. `.env.<NODE_ENV>.local` ;
2. `.env.<NODE_ENV>` ;
3. `.env.local` ;
4. `.env`.

Il est global et expose ConfigService.

### 8.2 Variables sensibles

| Variable | Usage |
|---|---|
| `JWT_SECRET` | Signature JWT |
| `DATABASE_URL` | Connexion PostgreSQL |
| `CLOUDINARY_API_SECRET` | Signature des uploads |
| `CLOUDINARY_API_KEY` | Authentification Cloudinary |
| `CLOUDINARY_CLOUD_NAME` | Compte Cloudinary |
| `ADMIN_PASSWORD` | Script de bootstrap administrateur |

### 8.3 Validation Joi

`JWT_SECRET` est obligatoire et doit contenir au moins 32 caractères. DATABASE_URL et FRONTEND_URL doivent être des URI. Les valeurs numériques et booléennes de sécurité sont validées et reçoivent des défauts.

### 8.4 Contrôles production

`validateSecurityConfig()` refuse en production :

- un JWT secret contenant `change-this`, `local` ou `test` ;
- un FRONTEND_URL localhost ;
- un FRONTEND_URL non HTTPS ;
- certaines URL temporaires de tunnel ;
- une adresse IPv4 privée.

Il exige aussi :

- latitude et longitude ensemble ;
- coordonnées présentes si la sécurité Attendance est activée ;
- rayon d'avertissement supérieur ou égal au rayon de confiance ;
- les trois valeurs Cloudinary ensemble.

### 8.5 Prisma

Prisma lit DATABASE_URL depuis l'environnement. Aucun credential de base n'est codé dans `schema.prisma`.

### 8.6 Frontend

`API_BASE_URL` est serveur uniquement. `NEXT_PUBLIC_API_BASE_URL` et `NEXT_PUBLIC_APP_URL` sont publiques par convention Next.js et ne contiennent pas de secret dans le code.

### 8.7 Fichiers exemple

Les fichiers `.env.example` contiennent des valeurs de développement commentées comme non réutilisables en production. Le secret exemple backend contient explicitement une valeur locale de remplacement.

### 8.8 Gestionnaire externe

Aucune intégration à Vault, AWS Secrets Manager, GCP Secret Manager, Docker Secrets ou Kubernetes Secrets n'est trouvée dans le code.

Fichiers concernés :

- `apps/backend/src/app.module.ts`
- `apps/backend/prisma.config.ts`
- `apps/backend/.env.example`
- `apps/frontend/.env.example`
- `apps/frontend/lib/api.ts`

## 9. Gestion des erreurs

### 9.1 Erreurs d'authentification

| Condition | Statut | Message |
|---|---:|---|
| Credentials invalides | 401 | `Invalid credentials.` |
| PIN invalide | 401 | `Identifiants invalides.` |
| Authorization absent | 401 | `Missing Authorization header.` |
| Schéma non Bearer | 401 | `Authorization header must use Bearer.` |
| Token invalide/expiré | 401 | `Invalid or expired token.` |
| Employé absent/inactif | 401 | `User is no longer active.` |

### 9.2 Forbidden

Un rôle insuffisant produit 403 avec `Insufficient permissions for this resource.`.

### 9.3 Validation

Les DTO, ParseUUIDPipe et règles métier produisent principalement 400. Les conflits d'état ou d'unicité produisent 409.

### 9.4 Pointage sécurisé

Les refus de selfie, localisation, précision ou commentaire sont des BadRequestException. Le proxy frontend préserve les métadonnées `security` lorsqu'elles existent.

### 9.5 Cloudinary

Un timeout produit 504 ; un échec final produit 502 ; une configuration absente lors de l'upload produit 500.

### 9.6 Limitation

Un dépassement produit 429. Le login PIN reçoit un message français spécifique.

### 9.7 Exposition des erreurs

Aucun ExceptionFilter personnalisé n'est présent. NestJS sérialise les exceptions standard. Les routes proxy remplacent une panne de transport par un message générique, mais propagent les messages backend pour les réponses HTTP non réussies.

### 9.8 Frontend

`getCurrentUser()` transforme toute erreur de résolution de session en `null`, puis `requireCurrentUser()` redirige vers login. Une réponse 401 en mode borne efface le cookie de borne.

Fichiers concernés :

- `apps/backend/src/modules/auth/guards/`
- `apps/backend/src/modules/auth/auth.service.ts`
- `apps/backend/src/modules/attendance/`
- `apps/frontend/lib/api-route.ts`
- `apps/frontend/lib/auth.ts`

## 10. Sécurité Frontend

### 10.1 Stockage des tokens

Les tokens ne sont pas accessibles aux composants clients par API JavaScript de cookie. Ils sont écrits et lus par les route handlers et Server Components.

### 10.2 Protection des routes

Le middleware vérifie la présence du cookie standard sur `/`, `/my-attendance`, `/employees` et `/schedules`. Les pages serveur appellent ensuite `/auth/me` et contrôlent le rôle.

Les pages administratives hors matcher — attendance-history, calendar, sanctions, exports — réalisent elles-mêmes ces contrôles serveur.

### 10.3 Protection des composants

Aucun guard de composant, HOC ou hook de permission n'est présent. Les composants administratifs sont rendus par des pages protégées ; les APIs backend demeurent l'autorité.

### 10.4 Sessions

La session standard et la session borne sont séparées. Les proxies de pointage borne demandent explicitement `sessionMode: attendance-entry`; aucune substitution automatique par le cookie standard n'est réalisée.

### 10.5 Redirections

ADMIN est dirigé vers le dashboard et EMPLOYEE vers `/my-attendance`. Un utilisateur non conforme à une page est redirigé vers son espace.

### 10.6 URL backend

Le frontend valide les URL de production, exige la terminaison `/api/v1` pour les bases API et rejette localhost, IP privées et domaines de tunnel selon les fonctions présentes.

### 10.7 Erreurs de rendu

Plusieurs segments possèdent `error.tsx`. Ils affichent `error.message` dans le DOM sous forme de contenu React textuel et offrent reset/rechargement.

### 10.8 Injection et HTML

Aucun `dangerouslySetInnerHTML`, `eval`, accès direct `innerHTML`, localStorage, sessionStorage ou `document.cookie` n'est trouvé dans le frontend TypeScript/TSX audité.

### 10.9 Cache

Les lectures serveur utilisent `no-store` et les pages sont dynamiques. Les exports proxy ajoutent Cache-Control no-store.

Fichiers concernés :

- `apps/frontend/lib/auth-session.ts`
- `apps/frontend/lib/auth.ts`
- `apps/frontend/lib/api.ts`
- `apps/frontend/lib/api-route.ts`
- `apps/frontend/middleware.ts`
- pages sous `apps/frontend/app/`

## 11. Dépendances

### 11.1 Chaîne de confiance

```text
Utilisateur
    |
    v
Frontend Next.js
    |
    v
Cookie HTTP-only contenant JWT
    |
    v
Route Handler / Server Component
    |
    | Bearer JWT
    v
API NestJS
    |
    v
AppThrottlerGuard
    |
    v
JwtAuthGuard
    |
    v
RolesGuard
    |
    v
ValidationPipe
    |
    v
Services métier
    |
    v
PrismaService
    |
    v
PostgreSQL
```

### 11.2 Dépendances de sécurité

| Composant | Dépendances |
|---|---|
| AuthService | PrismaService, ConfigService, JWT util, password util |
| JwtAuthGuard | Reflector, AuthService |
| RolesGuard | Reflector, request.user |
| AppThrottlerGuard | Nest Throttler |
| AttendanceSecurityService | PolicyService, PhotoStorageService |
| PhotoStorageService | ConfigService, crypto, fetch Cloudinary |
| Frontend session | cookies Next.js |
| Proxies | auth-session, fetchServerApi |

### 11.3 Dépendances externes

| Package / service | Usage |
|---|---|
| `helmet` | Headers HTTP |
| `@nestjs/throttler` | Limitation de débit |
| `joi` | Validation configuration |
| `class-validator` | Validation DTO |
| `class-transformer` | Transformation DTO |
| Node `crypto` | JWT, scrypt, signatures |
| Cloudinary API | Stockage photo conditionnel |
| PostgreSQL | Utilisateurs, rôles, preuves et données métier |

## 12. Traçabilité

| Mécanisme | Fichiers principaux |
|---|---|
| Bootstrap HTTP | `apps/backend/src/main.ts` |
| Validation de configuration | `apps/backend/src/app.module.ts` |
| Limites de débit | `apps/backend/src/common/security/app-throttler.guard.ts` |
| JWT | `apps/backend/src/common/security/jwt.util.ts` |
| Hash password/PIN | `apps/backend/src/common/security/password.util.ts` |
| Règles PIN | `apps/backend/src/common/validation/pin-code.validation.ts` |
| Authentification | `apps/backend/src/modules/auth/auth.service.ts`, `auth.controller.ts` |
| Guard JWT | `apps/backend/src/modules/auth/guards/jwt-auth.guard.ts` |
| Guard rôles | `apps/backend/src/modules/auth/guards/roles.guard.ts` |
| Décorateurs | `apps/backend/src/modules/auth/decorators/` |
| Rôles persistés | `apps/backend/prisma/schema.prisma` |
| Projections sûres | `apps/backend/src/common/prisma/selects.ts` |
| DTO | `apps/backend/src/modules/*/dto/` |
| Politique de pointage | `apps/backend/src/modules/attendance/attendance-security-policy.service.ts` |
| Évaluation des preuves | `apps/backend/src/modules/attendance/attendance-security.service.ts` |
| Stockage photo | `apps/backend/src/modules/attendance/attendance-photo-storage.service.ts` |
| Cookies | `apps/frontend/lib/auth-session.ts` |
| Session frontend | `apps/frontend/lib/auth.ts` |
| Proxy bearer | `apps/frontend/lib/api-route.ts` |
| Login/logout Next.js | `apps/frontend/app/api/auth/` |
| Protection route | `apps/frontend/middleware.ts`, pages App Router |
| Capture navigateur | `apps/frontend/components/attendance/` |

### 12.1 Contrôleurs protégés

Les annotations effectives sont traçables dans :

- `apps/backend/src/modules/dashboard/dashboard.controller.ts`
- `apps/backend/src/modules/employees/employees.controller.ts`
- `apps/backend/src/modules/schedules/schedules.controller.ts`
- `apps/backend/src/modules/attendance/attendance.controller.ts`
- `apps/backend/src/modules/calendar/calendar.controller.ts`
- `apps/backend/src/modules/sanctions/sanctions.controller.ts`
- `apps/backend/src/modules/health/health.controller.ts`
- `apps/backend/src/modules/auth/auth.controller.ts`

## 13. Observations techniques

Cette section consigne uniquement les mécanismes absents et comportements constatés.

### 13.1 Refresh et révocation

Aucun refresh token, rotation, liste de révocation ou invalidation serveur du JWT n'est présent.

### 13.2 Claims JWT

Le payload ne contient ni rôle, ni issuer, audience, JWT ID ou nonce. Le rôle est relu en base. Le vérificateur ne contrôle pas explicitement le contenu du header `alg`/`typ` après décodage ; la signature attendue est toujours calculée en HMAC-SHA-256.

### 13.3 CSRF

Aucun mécanisme CSRF distinct n'est présent. Les cookies utilisent SameSite Lax.

### 13.4 CSP

Aucune politique CSP personnalisée n'est définie. Helmet utilise sa configuration par défaut pour le backend, et Next.js ne configure pas de header CSP.

### 13.5 HTTPS

Le processus NestJS n'écoute pas avec une configuration TLS. La configuration de production valide l'URL frontend HTTPS et active Secure sur les cookies.

### 13.6 Stockage du throttler

Aucun stockage Redis ou distribué n'est configuré pour Nest Throttler.

### 13.7 Couverture middleware frontend

Quatre pages administratives ne figurent pas dans le matcher middleware, mais possèdent leurs contrôles dans les Server Components.

### 13.8 PIN historiques

Le schéma conserve `pinCode` en clair nullable aux côtés de `pinCodeHash`. Le login migre à la volée une valeur historique valide après correspondance, et un script de backfill existe.

### 13.9 Recherche PIN

Le login borne charge les employés actifs avec PIN et vérifie séquentiellement les hash jusqu'à une correspondance. Aucun index ou identifiant public accompagne le PIN dans la requête de login.

### 13.10 Politique Attendance conditionnelle

Le selfie est exigé lorsque le service appelle l'évaluation avec `enforceSecurity: true`, même si la politique GPS est désactivée. Le GPS dépend de l'activation et des coordonnées configurées.

### 13.11 Hors zone justifié

Un pointage au-delà du rayon n'est pas rejeté lorsqu'un commentaire est fourni ; il est enregistré comme justifié hors site avec un niveau `OK`.

### 13.12 Niveaux de vérification

AttendanceSecurityService produit actuellement toujours le niveau `OK`. Les enums `WARNING` et `STRICT` restent dans le schéma et les lectures historiques.

### 13.13 Méthode de vérification

Lorsqu'une photo est stockée, la méthode vaut PHOTO, même si une localisation accompagne la preuve. La localisation et la distance restent enregistrées séparément.

### 13.14 Photos

Aucun endpoint de suppression de photo Cloudinary n'est trouvé. Le modèle conserve URL et public ID.

### 13.15 Sanitation

Aucune sanitation HTML générique n'est implémentée. La validation structurelle et les rendus React sont les mécanismes constatés.

### 13.16 Secrets externes

Aucun gestionnaire de secrets externe n'est intégré.

### 13.17 Audit

AuditLogService écrit des événements structurés avec Logger NestJS. Aucun modèle Prisma AuditLog ou stockage d'audit dédié n'est présent.

### 13.18 Erreurs

Aucun ExceptionFilter personnalisé ne normalise globalement les erreurs. Plusieurs messages métier backend sont transmis par les proxies frontend.

### 13.19 Headers frontend

`next.config.ts` ne définit aucun tableau `headers()`. Les réponses frontend ne reçoivent pas de politique personnalisée par ce fichier.

### 13.20 Vérification anti-malware

Aucune analyse de contenu antivirus ou détection de malware n'est trouvée pour les images. Le format accepté est contrôlé par data URL et motif base64 avant upload.

### 13.21 MFA

Aucun second facteur distinct du login standard n'est présent. Le PIN de borne est une méthode d'authentification alternative pour EMPLOYEE, pas un deuxième facteur combiné au mot de passe.

### 13.22 Documentation locale

Aucun document de modèle de menace, registre de risques ou guide de sécurité propre au code applicatif n'est trouvé. Les mécanismes sont répartis entre configuration, guards, services et frontend.
