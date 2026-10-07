# API Reference — Gestion des erreurs

| Métadonnée | Valeur |
|---|---|
| Document ID | API-009 |
| Titre | Gestion des erreurs |
| Version | 1.0 |
| Statut | Validé |
| Classification | Interne |
| Référence | API Reference |
| Projet | Konatech Pointage |

## 1. Présentation

La gestion des erreurs de l'API repose sur les exceptions HTTP standard de NestJS, le `ValidationPipe` global, les pipes de paramètres, les gardes globaux d'authentification, d'autorisation et de limitation, ainsi que les contrôles métier effectués dans les services.

Le bootstrap ne configure aucun filtre d'exception ni intercepteur global personnalisé. Les `HttpException` et les erreurs de validation sont donc sérialisées par le mécanisme standard NestJS. Certains services traduisent explicitement les erreurs Prisma connues en réponses HTTP métier.

## 2. Vue d'ensemble

| Élément | Description |
|---|---|
| `ValidationPipe` | Valide, transforme et filtre les DTO pour toutes les routes |
| `ParseUUIDPipe` | Valide les identifiants de chemin des contrôleurs Employés, Plannings, Calendrier et Sanctions |
| `JwtAuthGuard` | Produit des erreurs 401 sur l'absence ou le format incorrect de l'autorisation; délègue la validation du jeton à `AuthService` |
| `RolesGuard` | Produit une erreur 403 lorsque le rôle d'accès ne fait pas partie des rôles exigés |
| `AppThrottlerGuard` | Produit une erreur 429 lors du dépassement d'une limite configurée |
| Services métier | Produisent les erreurs 400, 404 et 409 liées aux données et aux transitions métier |
| Stockage photo | Produit les erreurs 400, 500, 502 ou 504 selon la validation, la configuration ou l'échec Cloudinary |
| Export PDF | Produit une erreur 500 lorsque Puppeteer est indisponible et que le repli interne est désactivé |
| Prisma | Les codes `P2002` et `P2003` sont traduits dans certains services |
| Gestionnaire NestJS | Sérialise les exceptions; aucun filtre applicatif ne remplace ce comportement |

## 3. Codes HTTP

| Code | Signification dans le projet | Contextes observés |
|---:|---|---|
| 400 | Requête incorrecte | DTO invalide, propriété non admise, UUID invalide, date ou mois invalide, PIN invalide, fenêtre horaire invalide, ordre entrée/sortie invalide, preuve GPS/photo invalide, règle de sanction invalide |
| 401 | Non authentifié | Identifiants invalides, en-tête Authorization absent ou non Bearer, jeton invalide ou expiré, compte devenu inactif |
| 403 | Accès interdit | `accessRole` ne correspond pas au rôle exigé par `@Roles()` |
| 404 | Ressource introuvable | Employé, planning, événement calendrier, règle de sanction ou présence introuvable |
| 409 | Conflit d'état ou d'unicité | Email, PIN, identifiant employé, nom de planning ou événement calendrier en doublon; entrée ou sortie déjà enregistrée |
| 429 | Trop de requêtes | Limite globale ou limites courtes et longues du login PIN de pointage atteintes |
| 500 | Erreur interne explicite | Configuration Cloudinary manquante; renderer PDF premium indisponible sans repli autorisé |
| 502 | Passerelle incorrecte | Échec final de téléversement Cloudinary non classé comme expiration du délai |
| 504 | Délai de passerelle dépassé | Échec final de téléversement Cloudinary causé par le délai configuré |

Les codes 400, 401, 403, 409 et 429 sont directement exercés dans `app.e2e-spec.ts`. Les erreurs 500 du renderer sont exercées dans le test dédié au rendu Puppeteer.

## 4. Exceptions

### 4.1 `BadRequestException` — 400

| Domaine | Situations et messages explicitement présents |
|---|---|
| Employés | PIN rejeté avec `Code PIN invalide.` |
| Plannings | Heure de fin non postérieure à l'heure de début avec `endTime must be later than startTime for the same schedule day.` |
| Pointage | Sortie sans entrée, sortie antérieure à l'entrée, date `occurredAt` invalide ou future, mois invalide |
| Sécurité du pointage | Selfie absent, géolocalisation absente, précision GPS insuffisante ou commentaire hors bureau absent |
| Photo | Data URL ne représentant pas une image autorisée |
| Calendrier | Date ISO invalide ou mois non conforme à `YYYY-MM` |
| Sanctions | Nom vide, bornes incohérentes, valeurs négatives, plages actives chevauchantes ou mois invalide |
| Validation NestJS | Échec d'un décorateur `class-validator`, UUID invalide ou propriété non autorisée |

Les trois classes de `attendance-security.exception.ts` étendent `BadRequestException`, mais aucune importation ni instanciation de ces classes n'est présente dans le code actif. `AttendanceSecurityService` utilise directement `BadRequestException` avec ses propres messages.

### 4.2 `UnauthorizedException` — 401

| Source | Message exact observé |
|---|---|
| Login email/mot de passe | `Invalid credentials.` |
| Login PIN | `Identifiants invalides.` |
| Jeton non valide | `Invalid or expired token.` |
| Compte absent ou inactif après validation du jeton | `User is no longer active.` |
| En-tête absent | `Missing Authorization header.` |
| Schéma différent de Bearer ou jeton absent | `Authorization header must use Bearer.` |

Les erreurs internes de décodage, signature, payload ou expiration émises par `jwt.util.ts` sont interceptées par `AuthService`, qui expose uniquement `Invalid or expired token.` au client.

### 4.3 `ForbiddenException` — 403

`RolesGuard` lève `ForbiddenException` avec le message `Insufficient permissions for this resource.` lorsque le rôle de l'utilisateur authentifié n'est pas inclus dans les métadonnées `@Roles()` du contrôleur ou du handler.

### 4.4 `NotFoundException` — 404

| Ressource | Message exact observé |
|---|---|
| Employé | `Employee not found.` |
| Planning lu ou modifié | `Schedule not found.` |
| Planning affecté à un employé | `Assigned schedule not found.` |
| Présence relue après écriture | `Attendance record not found.` |
| Événement calendrier | `Calendar entry not found.` |
| Règle de sanction | `Sanction rule not found.` |

`SanctionsService` utilise également `Attendance record not found.` lorsqu'une présence demandée pour le calcul d'une sanction est absente.

### 4.5 `ConflictException` — 409

| Domaine | Conflit traduit |
|---|---|
| Employés | PIN déjà utilisé, email déjà utilisé ou impossibilité de générer un identifiant employé unique |
| Plannings | Nom de planning déjà utilisé après erreur Prisma `P2002` |
| Calendrier | Même date et même type déjà présents, ou autre contrainte unique `P2002` |
| Pointage | Entrée déjà enregistrée, entrée après sortie, sortie déjà enregistrée ou collision de la contrainte employé/jour |

`EmployeesService` traduit aussi `P2003` en `NotFoundException` pour un planning affecté absent. Les services relancent les erreurs Prisma non prises en charge sans les convertir en exception métier.

### 4.6 `HttpException` — 429

`AppThrottlerGuard` utilise directement `HttpException` avec `HttpStatus.TOO_MANY_REQUESTS` pour les limiteurs du login PIN. Le message est `Trop de tentatives. Reessayez dans quelques minutes.`. Pour le limiteur global, le garde délègue au comportement de `ThrottlerGuard`.

Le garde renseigne les en-têtes de limite, de nombre restant et de réinitialisation. Lorsqu'une requête est bloquée, il renseigne aussi l'en-tête `Retry-After`, avec un suffixe pour les limiteurs nommés.

### 4.7 Exceptions d'infrastructure explicites

| Exception | Code | Déclencheur observé |
|---|---:|---|
| `InternalServerErrorException` | 500 | Variable Cloudinary obligatoire absente |
| `InternalServerErrorException` | 500 | Échec du renderer Puppeteer sans repli interne autorisé |
| `BadGatewayException` | 502 | Échec final de l'appel Cloudinary sans expiration du délai |
| `GatewayTimeoutException` | 504 | Échec final Cloudinary marqué comme expiration du délai |

Le stockage photo réessaie uniquement les échecs considérés comme transitoires par son code : statut distant 408, 429 ou supérieur ou égal à 500, ainsi que les erreurs de transport.

## 5. Validation

### 5.1 Configuration globale

`main.ts` installe un unique `ValidationPipe` global avec les options suivantes :

| Option | Valeur | Effet observable |
|---|---|---|
| `whitelist` | `true` | Ne conserve que les propriétés déclarées par les DTO |
| `forbidNonWhitelisted` | `true` | Rejette une propriété entrante non déclarée |
| `transform` | `true` | Transforme les données vers les types attendus par les paramètres et DTO |
| `enableImplicitConversion` | `true` | Autorise notamment la conversion des Query Parameters numériques |

### 5.2 Décorateurs de validation observés

Les DTO utilisent réellement les décorateurs `IsString`, `IsEmail`, `IsEnum`, `IsBoolean`, `IsInt`, `IsNumber`, `IsUUID`, `IsDateString`, `IsArray`, `IsIn`, `IsNotIn`, `IsOptional`, `Matches`, `Min`, `Max`, `MinLength`, `MaxLength`, `ArrayMinSize`, `ArrayUnique`, `ValidateIf` et `ValidateNested`.

`class-transformer` est utilisé par `Type` pour convertir les valeurs numériques de sécurité et par `Transform` pour convertir certaines chaînes vides en `null` ou `undefined`. `PartialType` rend tous les champs du DTO de création Planning facultatifs dans `UpdateScheduleDto` tout en conservant leurs validations.

### 5.3 Pipes de paramètres

`ParseUUIDPipe` est appliqué aux paramètres `id` des routes Employés, Plannings et de mutation Calendrier, ainsi qu'à l'identifiant de règle Sanctions. Un UUID non valide est rejeté avant l'appel du service.

Les validations métier complémentaires restent dans les services : existence des ressources, unicité, cohérence de fenêtre horaire, chronologie du pointage, règles PIN, sécurité GPS/photo et cohérence des règles de sanctions.

## 6. Format des réponses d'erreur

### 6.1 Exception NestJS spécialisée avec message simple

En l'absence de filtre applicatif, les exceptions spécialisées comme `BadRequestException`, `UnauthorizedException`, `ForbiddenException`, `NotFoundException` et `ConflictException` construisent la structure suivante :

| Champ | Type | Contenu observé |
|---|---|---|
| `statusCode` | Nombre | Code HTTP de l'exception |
| `message` | Chaîne | Message fourni à l'exception |
| `error` | Chaîne | Libellé HTTP associé au code par NestJS |

Les tests accèdent directement à `response.body.message` pour les erreurs 400, 401, 409 et 429.

### 6.2 Erreur de DTO

Pour une validation comportant plusieurs violations, `ValidationPipe` renvoie la même structure générale, mais `message` est un tableau de chaînes. Le test de l'export mensuel vérifie ainsi simultanément les violations de borne du mois et de l'année.

| Champ | Type |
|---|---|
| `statusCode` | Nombre, égal à 400 |
| `message` | Tableau de messages de validation |
| `error` | Chaîne de libellé HTTP |

### 6.3 Réponses spécialisées

- Le login PIN utilise directement `new HttpException(message, 429)`. Le gestionnaire NestJS transforme cette réponse textuelle en un objet contenant `statusCode` et `message`, sans champ `error` ajouté par cette exception de base.
- Les erreurs 429 ajoutent `Retry-After` ainsi que les en-têtes de limitation configurés.
- Les erreurs 502 et 504 utilisent la structure standard des exceptions NestJS avec le message construit par `AttendancePhotoStorageService`.
- Aucune enveloppe applicative avec champs `code`, `details`, `timestamp` ou `path` n'est implémentée dans le dépôt.

## 7. Flux de traitement

```text
Requête client
      |
      v
AppThrottlerGuard
      |
      v
JwtAuthGuard -> RolesGuard
      |
      v
Pipes de paramètres + ValidationPipe et DTO
      |
      v
Controller
      |
      v
Service -> Prisma ou service externe
      |
      +--> résultat valide -> réponse du handler
      |
      +--> HttpException
                |
                v
       Gestionnaire standard NestJS
                |
                v
       Réponse HTTP JSON d'erreur
```

Les gardes globaux s'exécutent avant l'entrée dans le handler. Les pipes valident ensuite les paramètres et arguments du handler avant l'appel du contrôleur. Une exception de service remonte au gestionnaire NestJS en l'absence de filtre personnalisé.

## 8. Traçabilité

| Mécanisme | Fichier ou répertoire source | Preuve observée |
|---|---|---|
| Pipe global | `apps/backend/src/main.ts` | Options du `ValidationPipe` |
| DTO et transformations | `apps/backend/src/modules/auth/dto/`, `apps/backend/src/modules/attendance/dto/`, `apps/backend/src/modules/calendar/dto/`, `apps/backend/src/modules/employees/dto/`, `apps/backend/src/modules/sanctions/dto/`, `apps/backend/src/modules/schedules/dto/` | Décorateurs `class-validator` et `class-transformer` |
| UUID de chemin | `apps/backend/src/modules/employees/employees.controller.ts`, `apps/backend/src/modules/schedules/schedules.controller.ts`, `apps/backend/src/modules/calendar/calendar.controller.ts`, `apps/backend/src/modules/sanctions/sanctions.controller.ts` | `ParseUUIDPipe` |
| Authentification | `apps/backend/src/modules/auth/guards/jwt-auth.guard.ts`, `apps/backend/src/modules/auth/auth.service.ts` | Exceptions 401 |
| Autorisation | `apps/backend/src/modules/auth/guards/roles.guard.ts` | Exception 403 |
| Limitation | `apps/backend/src/common/security/app-throttler.guard.ts`, `apps/backend/src/modules/auth/constants/attendance-entry.constants.ts` | Exception 429, message et en-têtes |
| Erreurs Employés | `apps/backend/src/modules/employees/employees.service.ts`, `apps/backend/src/common/validation/pin-code.validation.ts` | 400, 404, 409 et traductions Prisma |
| Erreurs Plannings | `apps/backend/src/modules/schedules/schedules.service.ts` | 400, 404 et 409 |
| Erreurs Pointage | `apps/backend/src/modules/attendance/attendance.service.ts`, `apps/backend/src/modules/attendance/attendance-security.service.ts` | 400, 404 et 409 |
| Stockage photo | `apps/backend/src/modules/attendance/attendance-photo-storage.service.ts` | 400, 500, 502, 504 et reprises |
| Export PDF | `apps/backend/src/modules/attendance/exports/monthly-attendance-pdf-exporter.service.ts` | 500 explicite |
| Erreurs Calendrier | `apps/backend/src/modules/calendar/calendar.service.ts` | 400, 404, 409 et traduction Prisma |
| Erreurs Sanctions | `apps/backend/src/modules/sanctions/sanctions.service.ts` | 400 et 404 |
| Classes sécurité non référencées | `apps/backend/src/modules/attendance/attendance-security.exception.ts` | Trois sous-classes déclarées sans utilisation active |
| Absence de filtre et intercepteur | `apps/backend/src/main.ts`, `apps/backend/src/` | Aucun enregistrement global ni fichier actif correspondant |
| Configuration des gardes | `apps/backend/src/app.module.ts`, `apps/backend/src/modules/auth/auth.module.ts` | `APP_GUARD` pour limitation, JWT et rôles |
| Tests HTTP | `apps/backend/test/app.e2e-spec.ts`, `apps/backend/test/calendar.e2e-spec.ts`, `apps/backend/test/sanctions.e2e-spec.ts` | Codes et messages vérifiés |
| Test du renderer | `apps/backend/test/monthly-attendance-puppeteer-renderer.e2e-spec.ts` | Erreur premium sans repli |
| Documentation recoupée | `documentation/07-API-Reference/02-Authentification.md`, `documentation/07-API-Reference/06-Pointage.md`, `documentation/07-API-Reference/08-Exports.md` | Contextes API confrontés au code |

## 9. Observations

- Aucun filtre d'exception personnalisé n'est enregistré dans le bootstrap.
- Aucun intercepteur applicatif n'est enregistré globalement.
- Le format des erreurs repose sur le comportement standard NestJS.
- La validation globale interdit les propriétés non déclarées dans les DTO.
- Les gardes JWT, rôles et limitation peuvent interrompre une requête avant le contrôleur.
- Les services traduisent certaines erreurs Prisma connues, mais ne définissent pas de traduction globale de Prisma.
- Les messages d'erreur sont présents en français et en anglais selon le domaine.
- Les trois sous-classes d'erreur de localisation déclarées dans `attendance-security.exception.ts` ne participent pas au flux actif.
- Les erreurs de service externe explicitement traduites concernent le stockage des photos Cloudinary.
