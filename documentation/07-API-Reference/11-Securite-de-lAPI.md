# API Reference — Sécurité de l'API

| Métadonnée | Valeur |
|---|---|
| Document ID | API-011 |
| Titre | Sécurité de l'API |
| Version | 1.0 |
| Statut | Validé |
| Classification | Interne |
| Référence | API Reference |
| Projet | Konatech Pointage |

## 1. Présentation

L'architecture de sécurité de l'API combine des gardes NestJS globaux, des jetons JWT signés par une implémentation interne, deux rôles d'accès Prisma, Helmet, une origine CORS configurée, quatre limiteurs de requêtes, la validation globale des entrées, une limite de taille des corps et des contrôles conditionnels de preuve photo et de géolocalisation pour le pointage employé.

`AppThrottlerGuard`, `JwtAuthGuard` et `RolesGuard` sont enregistrés avec `APP_GUARD`. Les routes publiques sont explicitement marquées par `@Public()`; toutes les autres traversent le garde JWT. Le dépôt n'utilise ni Passport, ni `@nestjs/jwt`, ni classe de stratégie Passport.

## 2. Vue d'ensemble

| Mécanisme | Description |
|---|---|
| JWT interne | Jeton signé en HMAC-SHA256 avec identité, émission et expiration |
| `JwtAuthGuard` | Exige le schéma Bearer, valide le jeton et charge un compte actif |
| `RolesGuard` | Compare `accessRole` aux rôles déclarés par `@Roles()` |
| `@Public()` | Exempte explicitement quatre handlers du garde JWT |
| `@CurrentUser()` | Expose au contrôleur l'employé chargé par le garde |
| Hachage scrypt | Protège les mots de passe et les nouveaux PIN avec sel aléatoire |
| Helmet | Applique le middleware Helmet avec sa configuration par défaut |
| CORS | Autorise l'origine `FRONTEND_URL` avec credentials |
| Limitation | Applique une limite globale et des limites propres aux deux logins |
| Validation | Rejette les données hors contrat et valide les DTO globalement |
| Taille des corps | Limite les corps JSON et URL-encoded par `JSON_BODY_LIMIT` |
| Confiance proxy | Configure Express `trust proxy` uniquement lorsque `TRUST_PROXY_HOPS` est supérieur à zéro |
| Sécurité du pointage | Exige une photo pour le flux employé et applique le GPS lorsque la politique est active |
| Validation de configuration | Contrôle au démarrage les secrets, origines, coordonnées et clés Cloudinary |

## 3. Authentification

### 3.1 Endpoints d'émission

| Endpoint | Identifiant vérifié | Durée utilisée | Accès |
|---|---|---|---|
| `POST /api/v1/auth/login` | Email et mot de passe d'un compte actif | `JWT_EXPIRES_IN`, avec valeur de code par défaut `1d` | Public |
| `POST /api/v1/auth/attendance-entry/login` | PIN d'un compte actif dont `accessRole` vaut `EMPLOYEE` | `ATTENDANCE_ENTRY_JWT_EXPIRES_IN`, avec constante par défaut `15m` | Public |

Les deux réponses contiennent `accessToken`, `tokenType` fixé à `Bearer`, `expiresIn` et l'objet utilisateur public. Les champs `passwordHash`, `pinCode` et `pinCodeHash` sont retirés avant la réponse.

Le login par email renvoie le même message `Invalid credentials.` lorsque le compte est absent, inactif ou que le mot de passe est incorrect. Le login de pointage renvoie `Identifiants invalides.` lorsqu'aucun PIN actif ne correspond.

### 3.2 Structure et signature JWT

`jwt.util.ts` construit le jeton sans bibliothèque JWT externe.

| Élément | Implémentation observée |
|---|---|
| En-tête généré | JSON contenant `alg: HS256` et `typ: JWT`, encodé en Base64 URL |
| Payload | `sub`, `email`, `iat` et `exp` |
| Signature | HMAC SHA-256 sur l'en-tête et le payload encodés, avec `JWT_SECRET` |
| Comparaison | `timingSafeEqual` après contrôle de longueur |
| Expiration | `exp` comparé au temps Unix courant en secondes |
| Durée | Entier en secondes ou chaîne composée d'un entier et de `s`, `m`, `h` ou `d` |

La vérification exige trois segments, une signature correcte, un payload contenant `sub` et `email`, et une expiration future. Elle ne contrôle pas de claim d'émetteur ou d'audience. Le contenu `alg` de l'en-tête reçu n'est pas lu par la fonction de vérification; celle-ci recalcule toujours la signature HMAC-SHA256 sur les deux segments reçus.

### 3.3 Validation du porteur

`JwtAuthGuard` ignore son traitement uniquement lorsque les métadonnées `IS_PUBLIC_KEY` sont présentes. Sinon, il :

1. lit l'en-tête `Authorization` ;
2. exige exactement le schéma `Bearer` et une valeur de jeton ;
3. appelle `AuthService.getAuthenticatedUserFromToken()` ;
4. place l'utilisateur public dans `request.user`.

Après vérification cryptographique, `AuthService` recharge l'employé par `sub`. Un employé absent ou inactif est refusé, même si la signature et l'expiration sont valides. Aucun endpoint de renouvellement, de révocation ou de déconnexion JWT n'est déclaré dans `AuthController`.

### 3.4 Protection des mots de passe et PIN

`password.util.ts` applique le même mécanisme aux mots de passe et aux PIN :

- sel aléatoire de 16 octets converti en hexadécimal ;
- dérivation scrypt d'une clé de 64 octets ;
- stockage sous la forme `scrypt`, sel et empreinte hexadécimale séparés par des deux-points ;
- comparaison avec `timingSafeEqual` après vérification du préfixe et de la longueur.

`EmployeesService` hache les mots de passe avant persistance. Les nouveaux PIN sont validés, contrôlés contre les PIN employés existants, puis hachés. Lors d'un login PIN réussi sur une ancienne valeur en clair, `AuthService` la remplace par son empreinte au moyen d'une mise à jour conditionnelle.

## 4. Autorisation

### 4.1 Rôles

Le schéma Prisma définit uniquement les valeurs `ADMIN` et `EMPLOYEE` dans `AccessRole`. Le champ textuel Employee `role` décrit une fonction et n'est pas utilisé par `RolesGuard`.

`@Roles()` écrit les rôles exigés dans la métadonnée `roles`. `RolesGuard` lit cette métadonnée au niveau du handler et de la classe, puis compare `request.user.accessRole`. L'absence de métadonnée de rôle autorise tout utilisateur déjà authentifié.

### 4.2 Répartition des accès

| Ressource ou route | Accès observé |
|---|---|
| `POST /auth/login` | Public |
| `POST /auth/attendance-entry/login` | Public |
| `GET /health` | Public |
| `GET /attendance/entry` | Public |
| `GET /auth/me` | Tout utilisateur authentifié |
| Dashboard | `ADMIN` au niveau du contrôleur |
| Employés | `ADMIN` au niveau du contrôleur |
| Plannings | `ADMIN` au niveau du contrôleur |
| Calendrier | `ADMIN` au niveau du contrôleur |
| Sanctions | `ADMIN` au niveau du contrôleur |
| Synthèse, historique global, export et pointages ciblés Attendance | `ADMIN` au niveau des handlers |
| État, politique, historique et pointages personnels Attendance | `EMPLOYEE` au niveau des handlers |

`@CurrentUser()` récupère `request.user`. Il est utilisé pour cibler les données personnelles du compte ou attribuer les actions d'audit à l'administrateur authentifié.

## 5. Protection des requêtes

### 5.1 Helmet et CORS

`main.ts` exécute `helmet()` sans options applicatives. Les en-têtes effectivement choisis dépendent donc des valeurs par défaut de la version Helmet installée.

CORS est activé avec :

| Option | Valeur source |
|---|---|
| `origin` | Valeur de `FRONTEND_URL` chargée par `ConfigService` |
| `credentials` | `true` |

Aucune liste de plusieurs origines, expression régulière d'origine ou fonction CORS personnalisée n'est configurée.

### 5.2 Limitation des requêtes

`ThrottlerModule` configure quatre limiteurs et `AppThrottlerGuard` est global.

| Limiteur | Portée | Fenêtre | Limite |
|---|---|---:|---:|
| Par défaut | Toutes les requêtes | `RATE_LIMIT_TTL_MS` | `RATE_LIMIT_MAX` |
| `login` | `POST` dont le chemin se termine par `/auth/login` | `LOGIN_RATE_LIMIT_TTL_MS` | `LOGIN_RATE_LIMIT_MAX` |
| `attendanceEntryPinShort` | `POST /auth/attendance-entry/login` | 60 000 ms | 5 |
| `attendanceEntryPinLong` | `POST /auth/attendance-entry/login` | 600 000 ms | 10 |

Le garde utilise le tracker et la clé fournis par `@nestjs/throttler`. Il renseigne les en-têtes de limite, restant et réinitialisation, avec un suffixe pour un limiteur nommé. Une requête bloquée reçoit `Retry-After`. Les deux limiteurs PIN produisent le message `Trop de tentatives. Reessayez dans quelques minutes.` et écrivent un journal contenant route, tracker IP, user-agent, nom du limiteur et horodatage.

### 5.3 Validation et taille des corps

Le `ValidationPipe` global utilise `whitelist`, `forbidNonWhitelisted`, `transform` et la conversion implicite. Les DTO appliquent les validations de type, format, longueur, bornes et tableaux documentées dans API-010.

NestJS est créé avec son body parser désactivé, puis `bodyParser.json` et `bodyParser.urlencoded` sont installés avec la même limite `JSON_BODY_LIMIT`. Le parser URL-encoded utilise `extended: true`.

### 5.4 Confiance proxy

Lorsque `TRUST_PROXY_HOPS` est strictement positif, le bootstrap appelle `expressInstance.set('trust proxy', trustProxyHops)`. Avec zéro, aucun réglage `trust proxy` n'est appliqué par ce code. Cette valeur influence l'adresse utilisée par les mécanismes Express et par le tracker du limiteur.

### 5.5 Sécurité du pointage employé

Les routes `POST /attendance/me/check-in` et `POST /attendance/me/check-out` appellent `AttendanceSecurityService` avec `enforceSecurity: true`. Les routes administratives correspondantes utilisent `false`.

| Contrôle | Comportement observé pour le flux employé |
|---|---|
| Photo | Data URL image requise par le service, validée par le DTO et téléversée par `AttendancePhotoStorageService` |
| Géolocalisation | Requise lorsque la politique est active |
| Précision | Rejetée si absente ou supérieure à `ATTENDANCE_MAX_ACCURACY_METERS` lorsque la limite est active |
| Zone | Au-delà du rayon autorisé, une note non vide est exigée |
| Métadonnées | Coordonnées, précision, distance, méthode, niveau, motif et références photo sont persistés avec la présence |

La politique devient active uniquement lorsque `ATTENDANCE_SECURITY_ENABLED` est vrai et que les deux coordonnées de l'entreprise sont disponibles. La distance est calculée par Haversine. Les coordonnées et la photo restent facultatives au niveau du DTO; les exigences contextuelles sont appliquées dans le service.

### 5.6 Validation de la configuration

Le schéma Joi et `validateSecurityConfig` bloquent le démarrage lorsque certaines contraintes ne sont pas respectées :

- `JWT_SECRET` est requis avec une longueur minimale de 32 ;
- les coordonnées doivent être configurées ensemble et sont requises lorsque la sécurité Attendance est activée ;
- le rayon d'avertissement configuré ne peut pas être inférieur au rayon de confiance ;
- les trois variables Cloudinary doivent être fournies ensemble lorsqu'au moins l'une est renseignée ;
- en production, `JWT_SECRET` ne peut contenir les marqueurs faibles contrôlés par l'expression du code ;
- en production, `FRONTEND_URL` doit utiliser HTTPS et ne peut cibler localhost, une adresse IP privée ou les suffixes de tunnel temporaire recensés dans le code.

### 5.7 Journaux d'audit

Les mutations administratives des employés, plannings et calendrier, certains pointages administratifs et l'export mensuel appellent `AuditLogService`. Celui-ci écrit avec le logger NestJS un objet JSON comprenant l'acteur, son rôle, l'action, la ressource, l'identifiant et les métadonnées transmises. Le service d'audit ne persiste pas ces événements dans Prisma.

## 6. Variables d'environnement

Les valeurs sensibles ne sont pas reproduites ci-dessous.

### 6.1 Authentification, origine et requêtes

| Variable | Utilisation réelle | Validation ou valeur de code observée |
|---|---|---|
| `NODE_ENV` | Active les contrôles de configuration de production et masque le journal de politique au démarrage | `development`, `test` ou `production` |
| `JWT_SECRET` | Signature et vérification HMAC des JWT | Requise, 32 caractères au minimum; contrôle supplémentaire en production |
| `JWT_EXPIRES_IN` | Durée du jeton de login principal | Valeur de schéma et de service par défaut `1d` |
| `ATTENDANCE_ENTRY_JWT_EXPIRES_IN` | Durée du jeton émis par login PIN | Lue par `AuthService`; constante de repli `15m`; absente du schéma Joi |
| `FRONTEND_URL` | Origine CORS et base de la redirection `/attendance/entry` | URI requise; contraintes supplémentaires en production |
| `JSON_BODY_LIMIT` | Limite des corps JSON et URL-encoded | Format taille `b`, `kb` ou `mb` |
| `TRUST_PROXY_HOPS` | Nombre de sauts Express de confiance | Entier supérieur ou égal à zéro |

### 6.2 Limitation

| Variable | Utilisation réelle | Validation |
|---|---|---|
| `RATE_LIMIT_TTL_MS` | Fenêtre du limiteur global | Entier positif |
| `RATE_LIMIT_MAX` | Nombre maximal du limiteur global | Entier positif |
| `LOGIN_RATE_LIMIT_TTL_MS` | Fenêtre du limiteur `/auth/login` | Entier positif |
| `LOGIN_RATE_LIMIT_MAX` | Nombre maximal du limiteur `/auth/login` | Entier positif |

Les deux limites PIN utilisent des constantes de code et non des variables d'environnement.

### 6.3 Pointage sécurisé et stockage photo

| Variable | Utilisation réelle |
|---|---|
| `ATTENDANCE_SECURITY_ENABLED` | Active la politique GPS lorsque les coordonnées existent |
| `COMPANY_LATITUDE` | Latitude de référence, bornée de -90 à 90 |
| `COMPANY_LONGITUDE` | Longitude de référence, bornée de -180 à 180 |
| `ATTENDANCE_TRUSTED_RADIUS_METERS` | Rayon de confiance |
| `ATTENDANCE_WARNING_RADIUS_METERS` | Rayon d'avertissement et base possible du rayon autorisé |
| `ATTENDANCE_ALLOWED_RADIUS_METERS` | Rayon autorisé et valeur de repli pour les autres rayons |
| `ATTENDANCE_MAX_ACCURACY_METERS` | Précision GPS maximale acceptée |
| `CLOUDINARY_CLOUD_NAME` | Nom du compte utilisé pour l'URL d'upload |
| `CLOUDINARY_API_KEY` | Clé envoyée au formulaire signé |
| `CLOUDINARY_API_SECRET` | Secret utilisé pour signer la requête Cloudinary |
| `CLOUDINARY_ATTENDANCE_FOLDER` | Dossier distant des preuves |
| `CLOUDINARY_UPLOAD_TIMEOUT_MS` | Délai d'une tentative d'upload |
| `CLOUDINARY_UPLOAD_MAX_RETRIES` | Nombre de nouvelles tentatives |
| `CLOUDINARY_UPLOAD_RETRY_DELAY_MS` | Base du délai progressif entre tentatives |

## 7. Flux de sécurité

```text
Requête client
      |
      v
Helmet + parsers avec limite de corps + CORS
      |
      v
AppThrottlerGuard
      |
      v
JwtAuthGuard
      |
      +--> @Public() -> passe sans JWT
      |
      +--> Authorization Bearer -> signature + expiration -> compte actif
                                      |
                                      v
                                 request.user
                                      |
                                      v
                                 RolesGuard
                                      |
                       +--------------+--------------+
                       |                             |
                       v                             v
                rôle refusé                    rôle autorisé
                   HTTP 403                         |
                                                    v
                              ValidationPipe -> Controller -> Service
```

Pour les routes de pointage personnel, le service ajoute après la validation du DTO les contrôles de photo, de localisation, de précision et de zone avant l'écriture Prisma.

## 8. Traçabilité

| Mécanisme | Fichier ou répertoire source | Preuve observée |
|---|---|---|
| Helmet, CORS, taille et proxy | `apps/backend/src/main.ts` | Middlewares, origine, credentials, parsers et `trust proxy` |
| Schéma de configuration | `apps/backend/src/app.module.ts` | Variables Joi, contrôles de production et quatre limiteurs |
| Gardes globaux JWT et rôles | `apps/backend/src/modules/auth/auth.module.ts` | Deux fournisseurs `APP_GUARD` |
| Garde de limitation | `apps/backend/src/app.module.ts`, `apps/backend/src/common/security/app-throttler.guard.ts` | `APP_GUARD`, en-têtes et réponse 429 |
| JWT | `apps/backend/src/common/security/jwt.util.ts` | HS256, payload, signature, durée et vérification |
| Authentification | `apps/backend/src/modules/auth/auth.controller.ts`, `apps/backend/src/modules/auth/auth.service.ts` | Deux logins, utilisateur courant et compte actif |
| Constantes du login PIN | `apps/backend/src/modules/auth/constants/attendance-entry.constants.ts` | Durée, chemin, limiteurs et messages |
| Routes publiques | `apps/backend/src/modules/auth/decorators/public.decorator.ts`, `apps/backend/src/modules/auth/auth.controller.ts`, `apps/backend/src/modules/health/health.controller.ts`, `apps/backend/src/modules/attendance/attendance.controller.ts` | Métadonnée `IS_PUBLIC_KEY` sur quatre handlers |
| Autorisation | `apps/backend/src/modules/auth/decorators/roles.decorator.ts`, `apps/backend/src/modules/auth/guards/roles.guard.ts` | Métadonnées et comparaison d'`accessRole` |
| Utilisateur courant | `apps/backend/src/modules/auth/decorators/current-user.decorator.ts` | Lecture de `request.user` |
| Rôles persistés | `apps/backend/prisma/schema.prisma` | Enum `AccessRole` et champ Employee |
| Hachage | `apps/backend/src/common/security/password.util.ts`, `apps/backend/src/modules/employees/employees.service.ts` | scrypt, sel, comparaison, mots de passe et PIN |
| Validation du PIN | `apps/backend/src/common/validation/pin-code.validation.ts` | Format et valeurs refusées |
| Sécurité Attendance | `apps/backend/src/modules/attendance/attendance-security-policy.service.ts`, `apps/backend/src/modules/attendance/attendance-security.service.ts` | Politique, distance et exigences contextuelles |
| Stockage photo | `apps/backend/src/modules/attendance/attendance-photo-storage.service.ts` | Validation, signature, upload, reprises et erreurs |
| Validation des requêtes | `apps/backend/src/main.ts`, `apps/backend/src/modules/auth/dto/`, `apps/backend/src/modules/attendance/dto/`, `apps/backend/src/modules/calendar/dto/`, `apps/backend/src/modules/employees/dto/`, `apps/backend/src/modules/sanctions/dto/`, `apps/backend/src/modules/schedules/dto/` | Pipe global et DTO |
| Audit | `apps/backend/src/common/audit/audit-log.service.ts`, `apps/backend/src/modules/employees/employees.controller.ts`, `apps/backend/src/modules/schedules/schedules.controller.ts`, `apps/backend/src/modules/calendar/calendar.controller.ts`, `apps/backend/src/modules/attendance/attendance.controller.ts` | Événements JSON administratifs |
| Dépendances | `apps/backend/package.json` | Helmet, throttler, class-validator; absence de Passport et de bibliothèque JWT Nest |
| Tests de sécurité | `apps/backend/test/app.e2e-spec.ts`, `apps/backend/test/environment-validation.e2e-spec.ts` | Accès, rôles, limites PIN, GPS/photo et configuration |
| Documentation recoupée | `README.md`, `documentation/07-API-Reference/02-Authentification.md`, `documentation/07-API-Reference/09-Gestion-des-erreurs.md`, `documentation/07-API-Reference/10-Validation-des-donnees.md` | Variables et mécanismes comparés au code actif |

## 9. Observations

- L'API utilise une implémentation JWT interne et aucune stratégie Passport.
- Les jetons sont sans état côté API; le compte est néanmoins relu et son état actif vérifié à chaque requête protégée.
- Les JWT générés contiennent `sub`, `email`, `iat` et `exp`, sans claim de rôle.
- L'autorisation utilise le rôle courant relu depuis PostgreSQL, pas une valeur embarquée dans le jeton.
- Quatre handlers seulement portent `@Public()`.
- Les rôles d'accès sont limités à `ADMIN` et `EMPLOYEE`.
- Les limiteurs global, login et login PIN se cumulent sur les routes auxquelles leurs filtres s'appliquent.
- Helmet utilise ses valeurs par défaut et CORS accepte une seule origine configurée.
- La preuve photo est exigée pour le pointage personnel même lorsque la politique GPS est désactivée.
- Les contrôles GPS dépendent d'une activation explicite et de coordonnées complètes.
- Les actions d'audit sont écrites dans les journaux NestJS et non dans une table Prisma.
