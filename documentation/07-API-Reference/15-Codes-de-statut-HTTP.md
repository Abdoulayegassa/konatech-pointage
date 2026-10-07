# Codes de statut HTTP

| Métadonnée | Valeur |
|---|---|
| Document ID | API-015 |
| Titre | Codes de statut HTTP |
| Version | 1.0 |
| Statut | Validé |
| Classification | Interne |
| Référence | API Reference |
| Projet | Konatech Pointage |

# 1. Présentation

Ce chapitre recense les codes de statut HTTP effectivement produits ou explicitement déclarés par l'API NestJS de Konatech Pointage. Les sources retenues sont les décorateurs des contrôleurs, les exceptions NestJS instanciées dans les guards et services, la validation globale et les tests end-to-end du backend.

Aucun contrôleur n'emploie `@HttpCode()`. Les méthodes suivent donc les valeurs par défaut de NestJS : `200 OK` pour `GET`, `PATCH` et `DELETE`, et `201 Created` pour `POST`. Une route déclare explicitement une redirection `302`. Les réponses d'erreur sont déterminées par les exceptions NestJS, les pipes de validation et le guard de limitation du débit.

# 2. Tableau récapitulatif

| Code | Nom | Utilisation observée | Fichiers |
|---:|---|---|---|
| 200 | OK | Lectures `GET`, mises à jour `PATCH`, suppression `DELETE` et exports terminés | Contrôleurs sous `apps/backend/src/modules`, `apps/backend/test/app.e2e-spec.ts`, `apps/backend/test/calendar.e2e-spec.ts` |
| 201 | Created | Connexions et créations ou opérations de pointage déclarées avec `POST` | Contrôleurs `auth`, `employees`, `schedules`, `calendar` et `attendance`, tests end-to-end |
| 302 | Found | Redirection du point d'entrée fixe de pointage vers le frontend | `apps/backend/src/modules/attendance/attendance.controller.ts`, `apps/backend/test/app.e2e-spec.ts` |
| 400 | Bad Request | Échec de validation, paramètre UUID invalide, incohérence métier ou preuve de pointage invalide | `apps/backend/src/main.ts`, DTO et services sous `apps/backend/src/modules` |
| 401 | Unauthorized | En-tête Bearer absent ou incorrect, identifiants invalides, jeton invalide ou expiré, utilisateur inactif | `apps/backend/src/modules/auth/guards/jwt-auth.guard.ts`, `apps/backend/src/modules/auth/auth.service.ts` |
| 403 | Forbidden | Rôle authentifié non autorisé pour la route | `apps/backend/src/modules/auth/guards/roles.guard.ts`, contrôleurs portant `@Roles()` |
| 404 | Not Found | Employé, planning, pointage, entrée calendrier ou règle de sanction introuvable | Services des modules concernés |
| 409 | Conflict | Entrée ou sortie déjà enregistrée, unicité employé ou planning, doublon calendrier | Services `attendance`, `employees`, `schedules` et `calendar` |
| 429 | Too Many Requests | Dépassement d'une limite générale, de connexion ou de connexion PIN | `apps/backend/src/app.module.ts`, `apps/backend/src/common/security/app-throttler.guard.ts` |
| 500 | Internal Server Error | Renderer PDF premium indisponible sans repli autorisé, ou configuration Cloudinary requise absente | Services d'export PDF et de stockage photo du module `attendance` |
| 502 | Bad Gateway | Échec final du téléversement Cloudinary sans dépassement du délai | `apps/backend/src/modules/attendance/attendance-photo-storage.service.ts` |
| 504 | Gateway Timeout | Expiration du délai de téléversement Cloudinary après les tentatives configurées | `apps/backend/src/modules/attendance/attendance-photo-storage.service.ts` |

# 3. Réponses de succès

## 3.1 Code 200 — OK

Les contrôleurs utilisent `GET` pour les lectures de santé, d'utilisateur courant, de listes, de détails, d'historiques, de synthèses, de règles et d'exports. Hors redirection, ces méthodes conservent le statut par défaut `200`.

Les méthodes `PATCH` des modules employés, plannings, calendrier et sanctions retournent également `200`. La suppression `DELETE /api/v1/calendar/holidays/:id` retourne le résultat du service avec `200` ; aucun statut `204` n'est déclaré. Les tests end-to-end vérifient explicitement des réponses `200` sur ces catégories de routes.

L'export mensuel conserve `200` et renvoie soit une chaîne CSV, soit un `StreamableFile` PDF avec ses en-têtes de contenu.

## 3.2 Code 201 — Created

Toutes les méthodes `POST` conservent le statut par défaut `201` de NestJS. Cela couvre :

- les connexions `/api/v1/auth/login` et `/api/v1/auth/attendance-entry/login` ;
- la création d'un employé ;
- la création d'un planning ;
- la création d'une entrée calendrier ;
- les entrées et sorties de pointage administratives ou appliquées à l'utilisateur courant.

Le code ne remplace pas le statut des connexions ou des opérations de pointage par `200`. Les tests end-to-end attendent `201` pour ces routes `POST`.

## 3.3 Code 302 — Found

`GET /api/v1/attendance/entry` porte `@Redirect(undefined, 302)`. Le contrôleur retourne l'URL calculée par `AttendanceEntryService`, que NestJS place dans l'en-tête de redirection. Le test end-to-end associé attend explicitement `302`.

# 4. Réponses d'erreur

## 4.1 Code 400 — Bad Request

Le code `400` provient de deux mécanismes observés :

- `ValidationPipe` et les pipes de paramètres rejettent les corps, queries ou UUID qui ne satisfont pas les DTO et pipes déclarés ;
- les services lancent `BadRequestException` lorsqu'une donnée valide en forme enfreint une règle métier.

Les cas métier codés comprennent notamment une sortie sans entrée préalable, une sortie antérieure à l'entrée, un horodatage futur, un créneau de planning invalide, un code PIN refusé, une preuve de pointage absente ou insuffisante, des seuils de sanction incohérents et des plages de sanction qui se chevauchent.

## 4.2 Code 401 — Unauthorized

`JwtAuthGuard` produit `401` lorsque l'en-tête `Authorization` manque ou n'utilise pas le schéma `Bearer`. `AuthService` utilise le même statut pour des identifiants invalides, un jeton invalide ou expiré et un utilisateur devenu inactif.

Les routes marquées `@Public()` ne sont pas soumises à ce guard JWT. Leurs propres validations et traitements peuvent néanmoins produire d'autres statuts.

## 4.3 Code 403 — Forbidden

`RolesGuard` lance `ForbiddenException` lorsque le rôle de l'utilisateur authentifié n'appartient pas aux rôles déclarés par `@Roles()`. Les tests vérifient ce statut pour des accès croisés entre les rôles `ADMIN` et `EMPLOYEE`.

## 4.4 Code 404 — Not Found

Les services utilisent `NotFoundException` lorsque la ressource demandée ou nécessaire au traitement n'existe pas. Les ressources explicitement couvertes sont :

- employé ;
- planning et planning affecté à un employé ;
- enregistrement de pointage ;
- entrée calendrier ;
- règle de sanction.

## 4.5 Code 409 — Conflict

`ConflictException` traduit les conflits d'état et d'unicité connus. Le module de pointage l'utilise pour une entrée ou une sortie déjà enregistrée et pour une concurrence détectée lors de la mise à jour. Les modules employés et plannings traduisent des violations d'unicité Prisma. Le calendrier refuse un doublon de date et de type.

## 4.6 Code 429 — Too Many Requests

`AppThrottlerGuard` est enregistré comme guard global. Il délègue les limites générales et de connexion au mécanisme de `ThrottlerGuard`. Pour les deux limites du parcours PIN, il lance explicitement `HttpException` avec `HttpStatus.TOO_MANY_REQUESTS`.

Le guard ajoute les en-têtes de limite, de nombre restant et de réinitialisation. Lorsqu'une requête est bloquée, il ajoute aussi `Retry-After`, avec un suffixe pour les limiteurs nommés.

## 4.7 Codes 500, 502 et 504

Le module d'export PDF lance `InternalServerErrorException` lorsque le renderer premium est indisponible et que le repli historique n'est pas autorisé. Le stockage de photo lance également cette exception lorsqu'une variable Cloudinary nécessaire manque au moment du téléversement.

Après épuisement des tentatives de téléversement :

- un dépassement du délai produit `GatewayTimeoutException`, donc `504` ;
- un autre échec Cloudinary produit `BadGatewayException`, donc `502`.

Ces statuts concernent les chemins qui exécutent effectivement le rendu PDF ou le stockage externe d'une preuve photo.

# 5. Exceptions

| Exception ou mécanisme observé | Code | Contextes présents dans le dépôt | Source principale |
|---|---:|---|---|
| Statut par défaut de `GET`, `PATCH`, `DELETE` | 200 | Lecture, mise à jour, suppression | Contrôleurs sous `apps/backend/src/modules` |
| Statut par défaut de `POST` | 201 | Connexion, création, entrée et sortie | Contrôleurs sous `apps/backend/src/modules` |
| `@Redirect(undefined, 302)` | 302 | Point d'entrée public du pointage | `apps/backend/src/modules/attendance/attendance.controller.ts` |
| `ValidationPipe`, décorateurs DTO, `ParseUUIDPipe` | 400 | Données ou paramètres non conformes | `apps/backend/src/main.ts`, DTO et contrôleurs |
| `BadRequestException` | 400 | Invariants de pointage, sécurité, planning, calendrier, sanctions, PIN et photo | Services sous `apps/backend/src/modules` |
| `UnauthorizedException` | 401 | Authentification Bearer, identifiants et état utilisateur | Module `auth` |
| `ForbiddenException` | 403 | Rôle insuffisant | `apps/backend/src/modules/auth/guards/roles.guard.ts` |
| `NotFoundException` | 404 | Ressource absente | Services métier |
| `ConflictException` | 409 | Doublon, concurrence et unicité | Services métier |
| `HttpException` avec `HttpStatus.TOO_MANY_REQUESTS` | 429 | Limites PIN ; le throttler couvre aussi les autres limites configurées | `apps/backend/src/common/security/app-throttler.guard.ts` |
| `InternalServerErrorException` | 500 | Renderer PDF ou configuration de stockage photo indisponible | Services d'export PDF et de photo |
| `BadGatewayException` | 502 | Échec Cloudinary final | `apps/backend/src/modules/attendance/attendance-photo-storage.service.ts` |
| `GatewayTimeoutException` | 504 | Timeout Cloudinary final | `apps/backend/src/modules/attendance/attendance-photo-storage.service.ts` |

Aucun filtre d'exception global ou propre à un module n'est enregistré dans `apps/backend/src`. Aucun intercepteur global ne remplace les statuts des exceptions listées.

# 6. Flux général

Les guards sont exécutés avant les pipes et le contrôleur. Le service n'est atteint que si les contrôles précédents acceptent la requête.

```text
Client HTTP
    |
    v
AppThrottlerGuard
    |-- limite dépassée ----------------------> 429
    v
JwtAuthGuard / RolesGuard
    |-- authentification refusée -------------> 401
    |-- rôle insuffisant ----------------------> 403
    v
ValidationPipe / pipes de paramètres
    |-- données invalides ---------------------> 400
    v
Controller
    |-- GET, PATCH, DELETE --------------------> 200
    |-- POST ----------------------------------> 201
    |-- redirection attendance/entry ----------> 302
    v
Service applicatif
    |-- règle invalide ------------------------> 400
    |-- ressource absente ---------------------> 404
    |-- conflit -------------------------------> 409
    |-- erreur interne déclarée ---------------> 500
    |-- échec Cloudinary ----------------------> 502 ou 504
    v
Réponse HTTP de succès
```

# 7. Traçabilité

| Code | Fichier ou répertoire source | Preuve observée |
|---:|---|---|
| 200 | `apps/backend/src/modules` | Méthodes `GET`, `PATCH` et `DELETE` sans remplacement par `@HttpCode()` |
| 200 | `apps/backend/test/app.e2e-spec.ts` | Attentes explicites sur les lectures et mises à jour |
| 200 | `apps/backend/test/calendar.e2e-spec.ts` | Attentes explicites sur les lectures, mises à jour et suppression calendrier |
| 201 | `apps/backend/src/modules` | Méthodes `POST` sans remplacement par `@HttpCode()` |
| 201 | `apps/backend/test/app.e2e-spec.ts` | Attentes explicites sur connexions, créations et pointages |
| 302 | `apps/backend/src/modules/attendance/attendance.controller.ts` | Décorateur `@Redirect(undefined, 302)` |
| 302 | `apps/backend/test/app.e2e-spec.ts` | Attente explicite sur `/api/v1/attendance/entry` |
| 400 | `apps/backend/src/main.ts` | `ValidationPipe` global |
| 400 | `apps/backend/src/modules/attendance/attendance.service.ts` | `BadRequestException` sur l'ordre et les dates de pointage |
| 400 | `apps/backend/src/modules/attendance/attendance-security.service.ts` | `BadRequestException` sur les preuves de pointage |
| 400 | `apps/backend/src/modules/schedules/schedules.service.ts` | `BadRequestException` sur le créneau |
| 400 | `apps/backend/src/modules/sanctions/sanctions.service.ts` | `BadRequestException` sur les seuils et plages |
| 401 | `apps/backend/src/modules/auth/guards/jwt-auth.guard.ts` | `UnauthorizedException` sur l'en-tête Bearer |
| 401 | `apps/backend/src/modules/auth/auth.service.ts` | `UnauthorizedException` sur les identifiants, jetons et utilisateurs inactifs |
| 403 | `apps/backend/src/modules/auth/guards/roles.guard.ts` | `ForbiddenException` sur les rôles |
| 404 | `apps/backend/src/modules/attendance/attendance.service.ts` | `NotFoundException` pour employé et pointage |
| 404 | `apps/backend/src/modules/employees/employees.service.ts` | `NotFoundException` pour employé et planning affecté |
| 404 | `apps/backend/src/modules/schedules/schedules.service.ts` | `NotFoundException` pour planning |
| 404 | `apps/backend/src/modules/calendar/calendar.service.ts` | `NotFoundException` pour entrée calendrier |
| 404 | `apps/backend/src/modules/sanctions/sanctions.service.ts` | `NotFoundException` pour pointage et règle |
| 409 | `apps/backend/src/modules/attendance/attendance.service.ts` | `ConflictException` sur doublons d'entrée et de sortie |
| 409 | `apps/backend/src/modules/employees/employees.service.ts` | `ConflictException` sur les contraintes employé |
| 409 | `apps/backend/src/modules/schedules/schedules.service.ts` | `ConflictException` sur le nom du planning |
| 409 | `apps/backend/src/modules/calendar/calendar.service.ts` | `ConflictException` sur les doublons calendrier |
| 429 | `apps/backend/src/common/security/app-throttler.guard.ts` | `HttpStatus.TOO_MANY_REQUESTS` et traitement du throttling |
| 429 | `apps/backend/src/app.module.ts` | Limiteurs général, connexion et PIN |
| 500 | `apps/backend/src/modules/attendance/exports/monthly-attendance-pdf-exporter.service.ts` | `InternalServerErrorException` du renderer |
| 500 | `apps/backend/src/modules/attendance/attendance-photo-storage.service.ts` | `InternalServerErrorException` de configuration |
| 502 | `apps/backend/src/modules/attendance/attendance-photo-storage.service.ts` | `BadGatewayException` |
| 504 | `apps/backend/src/modules/attendance/attendance-photo-storage.service.ts` | `GatewayTimeoutException` |

# 8. Observations

- Douze codes sont directement rattachables aux décorateurs, exceptions, guards ou tests analysés : `200`, `201`, `302`, `400`, `401`, `403`, `404`, `409`, `429`, `500`, `502` et `504`.
- Les contrôleurs ne déclarent aucun `@HttpCode()` ; les succès hors redirection suivent les valeurs par défaut des décorateurs NestJS.
- Aucun endpoint ne déclare un succès `202` ou `204`.
- Les erreurs métier contrôlées utilisent principalement `400`, `404` et `409`.
- L'authentification et l'autorisation distinguent `401` et `403`.
- Les statuts `502` et `504` sont limités au stockage Cloudinary des preuves photo ; le statut `500` est explicitement employé par le rendu PDF et la configuration de stockage photo.
- Aucun filtre d'exception personnalisé ne modifie les codes associés aux exceptions NestJS observées.
