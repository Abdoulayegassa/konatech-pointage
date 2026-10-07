# Limites et contraintes

| Métadonnée | Valeur |
|---|---|
| Document ID | API-014 |
| Titre | Limites et contraintes |
| Version | 1.0 |
| Statut | Validé |
| Classification | Interne |
| Référence | API Reference |
| Projet | Konatech Pointage |

# 1. Présentation

Ce chapitre recense les contraintes imposées par l'API de Konatech Pointage aux requêtes, aux opérations métier et aux données persistées. Les éléments décrits proviennent des DTO, des guards, des services NestJS, de la configuration validée et du schéma Prisma présents dans le dépôt.

Les contraintes interviennent à plusieurs niveaux : taille et fréquence des requêtes HTTP, authentification et rôles, validation des formats, invariants métier dans les services, puis unicité et relations dans PostgreSQL par l'intermédiaire de Prisma.

# 2. Contraintes métier

## 2.1 Pointage

| Contrainte | Application observée | Source |
|---|---|---|
| Employé existant et actif | L'entrée recherche l'employé et rejette un employé absent ou inactif | `apps/backend/src/modules/attendance/attendance.service.ts` |
| Une entrée par jour de pointage | Une nouvelle entrée est refusée lorsqu'un `clockInAt` existe déjà pour l'employé et la date | `apps/backend/src/modules/attendance/attendance.service.ts` |
| Pas de nouvelle entrée après la sortie | Une entrée est refusée lorsqu'un `clockOutAt` existe déjà pour la journée | `apps/backend/src/modules/attendance/attendance.service.ts` |
| Sortie précédée d'une entrée | La sortie est refusée si aucun `clockInAt` n'existe | `apps/backend/src/modules/attendance/attendance.service.ts` |
| Une sortie par jour de pointage | Une seconde sortie est refusée si `clockOutAt` est déjà renseigné | `apps/backend/src/modules/attendance/attendance.service.ts` |
| Ordre temporel | L'heure de sortie ne peut pas être antérieure à l'heure d'entrée | `apps/backend/src/modules/attendance/attendance.service.ts` |
| Horodatage recevable | `occurredAt` doit être une date ISO 8601 valide et ne peut pas être dans le futur | `apps/backend/src/modules/attendance/attendance.service.ts`, DTO du module `attendance` |
| Unicité persistée | Le couple `employeeId`, `date` est unique en base | `apps/backend/prisma/schema.prisma` |
| Statut selon le contexte | Le service calcule le statut depuis le calendrier, le planning, l'heure d'entrée et l'état de sortie | `apps/backend/src/modules/attendance/attendance.service.ts` |

Les routes administratives `check-in` et `check-out` reçoivent explicitement `employeeId`. Les routes `me/check-in` et `me/check-out` emploient l'identifiant du jeton authentifié. La logique commune de création et de clôture applique les mêmes invariants temporels et d'unicité.

## 2.2 Preuves de sécurité du pointage

Les champs de position sont facultatifs au niveau du DTO. Lorsqu'ils sont fournis, la latitude est bornée de -90 à 90, la longitude de -180 à 180 et la précision de 0 à 50 000 mètres.

La photo doit être une Data URL Base64 de type JPEG, JPG, PNG ou WebP et sa chaîne est limitée à 1 000 000 de caractères. Les routes employé imposent une photo par `AttendanceSecurityService`. Lorsque la politique de géolocalisation est active, une position est également exigée. Une précision supérieure au seuil configuré est refusée. Hors du rayon autorisé, une note non vide est exigée.

Ces contrôles dépendent de `ATTENDANCE_SECURITY_ENABLED` et des coordonnées de l'entreprise. Les valeurs par défaut du service sont 100 mètres pour le rayon de confiance, 300 mètres pour le rayon d'avertissement et 200 mètres pour la précision maximale ; elles sont remplacées par les variables correspondantes lorsqu'elles sont configurées.

## 2.3 Employés et authentification de pointage

| Contrainte | Valeur observée | Source |
|---|---|---|
| Code PIN employé | Exactement quatre chiffres | `apps/backend/src/common/validation/pin-code.validation.ts` |
| Codes PIN exclus | `0000`, `1111`, `1234`, `4321`, `9999` | `apps/backend/src/common/validation/pin-code.validation.ts` |
| Unicité du PIN | Vérification applicative et contrainte unique du champ historique `pinCode` | `apps/backend/src/modules/employees/employees.service.ts`, `apps/backend/prisma/schema.prisma` |
| PIN selon le rôle | Un employé applicatif doit conserver un PIN ; le passage au rôle `ADMIN` supprime les secrets PIN | `apps/backend/src/modules/employees/employees.service.ts` |
| Courriel | Format courriel et unicité en base | `apps/backend/src/modules/employees/dto/create-employee.dto.ts`, `apps/backend/prisma/schema.prisma` |
| Mot de passe | De 8 à 128 caractères lors de la création ou de la mise à jour ; minimum 8 à la connexion | DTO du module `employees`, `apps/backend/src/modules/auth/dto/login.dto.ts` |
| Noms, rôle métier et département | Maximum 80 caractères | DTO du module `employees` |
| Rôle d'accès | Valeur de l'énumération `AccessRole` : `ADMIN` ou `EMPLOYEE` | `apps/backend/prisma/schema.prisma`, DTO du module `employees` |
| Planning affecté | Identifiant UUID d'un planning existant, ou `null` lors d'une dissociation | DTO et service du module `employees` |

Les identifiants `employeeIdentifier`, `email`, `employeeCode` lorsqu'il est renseigné, et `pinCode` lorsqu'il est encore stocké sous sa forme historique sont uniques dans le schéma Prisma. Le service transforme les conflits connus en réponses de conflit.

## 2.4 Plannings

Le nom du planning est limité à 80 caractères et doit être unique. `startTime` et `endTime` respectent le format `HH:mm` sur 24 heures. Le service exige que `endTime` soit strictement postérieur à `startTime` pour la même journée ; les créneaux traversant minuit ne sont donc pas acceptés par cette validation.

La marge de retard est un entier compris entre 0 et 180 minutes. `workDays` doit contenir au moins un jour, sans doublon, parmi les sept constantes de `MONDAY` à `SUNDAY`.

## 2.5 Calendrier et sanctions

Les créations et mises à jour de calendrier exposées par l'API acceptent uniquement les types `PUBLIC_HOLIDAY` et `COMPANY_HOLIDAY`, bien que le schéma Prisma contienne aussi `LEAVE` et `EXTERNAL_MISSION`. Le nom est limité à 120 caractères, la description à 500 caractères et la date doit être une chaîne de date valide. Le service interdit deux entrées de même date et de même type.

Les valeurs modifiables d'une règle de sanction — seuils de retard, tolérance mensuelle, montant et priorité — sont des entiers supérieurs ou égaux à zéro. Lorsque les deux seuils sont présents, le minimum doit être strictement inférieur au maximum. Les plages de retard des règles actives ne peuvent pas se chevaucher.

# 3. Contraintes techniques

## 3.1 Validation des requêtes

Le `ValidationPipe` global est configuré avec `whitelist`, `forbidNonWhitelisted`, `transform` et la conversion implicite. Une propriété absente du DTO est rejetée, et les paramètres numériques déclarés comme tels sont convertis avant validation.

| Donnée | Contrainte observée | Source |
|---|---|---|
| Identifiants de chemin usuels | `ParseUUIDPipe` sur les `:id` des employés, plannings, entrées calendrier et règles de sanction | Contrôleurs concernés sous `apps/backend/src/modules` |
| Mois | Format `YYYY-MM` | DTO d'historique, calendrier et sanctions |
| Export mensuel | Mois entier de 1 à 12, année de 2000 à 2100 | `apps/backend/src/modules/attendance/dto/monthly-attendance-export-query.dto.ts` |
| Format d'export | `csv` ou `pdf` | `apps/backend/src/modules/attendance/dto/monthly-attendance-export-query.dto.ts` |
| Notes de pointage | Maximum 200 caractères | DTO d'entrée et de sortie du module `attendance` |
| Identifiants employés des opérations administratives | UUID | `apps/backend/src/modules/attendance/dto/check-in.dto.ts`, `apps/backend/src/modules/attendance/dto/check-out.dto.ts` |

Le paramètre `attendanceId` de `/sanctions/attendance/:attendanceId` et le filtre `employeeId` de `MonthlySanctionsQueryDto` sont validés comme chaînes par leur chemin d'exécution, sans `ParseUUIDPipe` ni `IsUUID` dans ces déclarations.

## 3.2 Authentification et autorisation

`JwtAuthGuard` protège globalement les routes qui ne portent pas `@Public()`. L'en-tête doit utiliser la forme `Authorization: Bearer <jeton>` ; un jeton absent, mal formé, invalide, expiré ou associé à un utilisateur inactif est refusé.

Les routes publiques observées sont les deux connexions, l'endpoint de santé et la redirection `/attendance/entry`. Les contrôleurs `employees`, `schedules`, `calendar`, `sanctions` et `dashboard` exigent le rôle `ADMIN`. Les opérations administratives de pointage exigent également `ADMIN`, tandis que les routes `/attendance/me/*` exigent `EMPLOYEE`.

Le jeton du parcours PIN expire par défaut après 15 minutes. Le jeton de connexion administrative utilise `JWT_EXPIRES_IN`, avec `1d` comme valeur par défaut de configuration.

## 3.3 Taille, fréquence et dépendances

| Limite ou dépendance | Valeur ou mécanisme | Source |
|---|---|---|
| Taille des corps JSON et URL-encoded | Variable `JSON_BODY_LIMIT`, valeur par défaut validée `10mb` | `apps/backend/src/app.module.ts`, `apps/backend/src/main.ts` |
| Limiteur général | `RATE_LIMIT_MAX` requêtes pendant `RATE_LIMIT_TTL_MS` ; défauts 300 et 60 000 ms | `apps/backend/src/app.module.ts` |
| Connexion administrative | `LOGIN_RATE_LIMIT_MAX` pendant `LOGIN_RATE_LIMIT_TTL_MS` ; défauts 20 et 60 000 ms | `apps/backend/src/app.module.ts` |
| Connexion PIN, fenêtre courte | 5 tentatives sur 60 000 ms | `apps/backend/src/app.module.ts` |
| Connexion PIN, fenêtre longue | 10 tentatives sur 600 000 ms | `apps/backend/src/app.module.ts` |
| CORS | Une origine égale à `FRONTEND_URL`, avec credentials autorisés | `apps/backend/src/main.ts` |
| Base de données | `DATABASE_URL` obligatoire et PostgreSQL comme datasource Prisma | `apps/backend/src/app.module.ts`, `apps/backend/prisma/schema.prisma` |
| Téléversement Cloudinary | Délai, nombre de reprises et délai entre reprises pilotés par variables ; défauts 10 000 ms, 2 reprises et 300 ms | `apps/backend/src/modules/attendance/attendance-photo-storage.service.ts` |

`JSON_BODY_LIMIT` doit associer un nombre à l'unité `b`, `kb` ou `mb`. Les durées et nombres du limiteur sont validés comme entiers strictement positifs. `CLOUDINARY_UPLOAD_MAX_RETRIES` accepte zéro ou un entier positif ; le délai d'un essai et le délai entre reprises sont strictement positifs. Une requête bloquée par le limiteur produit une réponse HTTP `429` ; le guard ajoute également les en-têtes de limite, de solde et de réinitialisation.

La configuration exige un `JWT_SECRET` d'au moins 32 caractères. En production, elle rejette une origine frontend locale, non HTTPS, sur un tunnel temporaire ou sur une adresse IP privée. Les trois variables d'accès Cloudinary doivent être fournies ensemble dès que l'une d'elles est renseignée.

Le service de sécurité du pointage n'est actif que si `ATTENDANCE_SECURITY_ENABLED` vaut vrai et si les deux coordonnées de l'entreprise sont présentes. La latitude et la longitude d'entreprise doivent être configurées ensemble, et le rayon d'avertissement ne peut pas être inférieur au rayon de confiance.

# 4. Limitations connues

Les limitations suivantes sont directement visibles dans les interfaces et les implémentations actuelles.

| Limitation observable | Preuve dans le dépôt |
|---|---|
| Les collections d'employés et de plannings ne proposent pas de pagination, filtre ou recherche par Query Parameter | Leurs méthodes `GET` ne déclarent aucun DTO de requête et leurs services utilisent `findMany` sans pagination |
| Les historiques de pointage renvoient le mois demandé sans pagination | `AttendanceHistoryQueryDto` ne contient que `month` et le service n'utilise ni `skip`, ni `take`, ni curseur |
| Le filtre sanctions `employeeId` n'impose pas le format UUID au niveau DTO | `MonthlySanctionsQueryDto` applique seulement `IsString` |
| Les plannings ne représentent pas un créneau traversant minuit | Le service exige `endTime` strictement postérieur à `startTime` dans la même journée |
| L'API calendrier ne crée et ne modifie que deux types d'entrée | Les DTO limitent `type` à `PUBLIC_HOLIDAY` et `COMPANY_HOLIDAY` |
| Le format de photo de vérification est limité aux Data URL JPEG, JPG, PNG ou WebP | Expression régulière et longueur maximale du DTO de sécurité |
| Le corps JSON a une limite unique configurée pour toutes les routes | Les deux parseurs utilisent `JSON_BODY_LIMIT` dans `main.ts` |
| La version d'API exposée est le préfixe statique `v1` | `setGlobalPrefix('api/v1')` sans versionnement NestJS dynamique |
| Les exports disponibles sont uniquement CSV et PDF | Validation `IsIn(['csv', 'pdf'])` et branches correspondantes du contrôleur |
| La base configurée est PostgreSQL via une seule chaîne `DATABASE_URL` | Datasource unique dans `schema.prisma` |

Aucun quota fonctionnel sur le nombre d'employés, de plannings, de pointages ou d'entrées calendrier n'est déclaré dans le code. Aucun délai maximal général de traitement d'une requête API n'est configuré ; le délai explicite observé concerne le téléversement Cloudinary.

# 5. Flux général

Dans NestJS, les guards précèdent les pipes de validation. Le flux réellement observé est donc :

```text
Client HTTP
    |
    v
Limiteur de débit global
    |
    v
JwtAuthGuard puis RolesGuard
    |  jeton et rôle, sauf route publique
    v
ValidationPipe et pipes de paramètres
    |  formats, types, bornes et propriétés autorisées
    v
Controller
    |
    v
Service applicatif
    |  invariants métier et dépendances existantes
    v
Prisma Client
    |
    v
PostgreSQL
    |  types, relations, unicité et clés
    v
Réponse HTTP ou exception
```

Les routes sans corps ne traversent pas de DTO de corps. L'endpoint de santé et la redirection d'entrée sont publics et n'accèdent pas à PostgreSQL dans leur contrôleur.

# 6. Traçabilité

| Élément documenté | Fichier ou répertoire source | Preuve observée |
|---|---|---|
| Validation globale et taille du corps | `apps/backend/src/main.ts` | `ValidationPipe`, parseurs JSON et URL-encoded |
| Validation de configuration | `apps/backend/src/app.module.ts` | Schéma Joi, limites de débit et cohérence des variables |
| Réponse de limitation | `apps/backend/src/common/security/app-throttler.guard.ts` | Compteurs, en-têtes de limite et réponse HTTP `429` |
| Authentification Bearer | `apps/backend/src/modules/auth/guards/jwt-auth.guard.ts` | Lecture et validation de l'en-tête Authorization |
| Autorisation par rôle | `apps/backend/src/modules/auth/guards/roles.guard.ts` | Comparaison du rôle requis au rôle authentifié |
| Durée du jeton PIN | `apps/backend/src/modules/auth/constants/attendance-entry.constants.ts` | Durée par défaut `15m` |
| Validation du pointage | `apps/backend/src/modules/attendance/dto` | UUID, dates, notes, géolocalisation et photo |
| Invariants entrée/sortie | `apps/backend/src/modules/attendance/attendance.service.ts` | Contrôles d'ordre, d'unicité, d'état et de date future |
| Politique de preuve | `apps/backend/src/modules/attendance/attendance-security.service.ts` | Photo, position, précision et justification hors zone |
| Seuils de géolocalisation | `apps/backend/src/modules/attendance/attendance-security-policy.service.ts` | Valeurs configurées et valeurs par défaut |
| Stockage photo | `apps/backend/src/modules/attendance/attendance-photo-storage.service.ts` | Format, timeout et reprises Cloudinary |
| Contraintes du code PIN | `apps/backend/src/common/validation/pin-code.validation.ts` | Expression régulière et codes exclus |
| Validation employé | `apps/backend/src/modules/employees/dto` | Longueurs, types, UUID, mot de passe et rôle |
| Règles liées au PIN | `apps/backend/src/modules/employees/employees.service.ts` | PIN requis pour l'employé, disponibilité et suppression pour l'administrateur |
| Validation planning | `apps/backend/src/modules/schedules/dto/create-schedule.dto.ts` | Horaires, marge et jours travaillés |
| Fenêtre de planning | `apps/backend/src/modules/schedules/schedules.service.ts` | Heure de fin strictement postérieure au début |
| Validation calendrier | `apps/backend/src/modules/calendar/dto` | Types exposés, dates et longueurs |
| Unicité calendrier | `apps/backend/src/modules/calendar/calendar.service.ts` | Détection d'une même date et d'un même type |
| Validation sanctions | `apps/backend/src/modules/sanctions/dto/update-sanction-rule.dto.ts` | Entiers non négatifs |
| Cohérence des sanctions | `apps/backend/src/modules/sanctions/sanctions.service.ts` | Ordre des seuils et absence de chevauchement actif |
| Contraintes persistées | `apps/backend/prisma/schema.prisma` | Types, relations, énumérations et contraintes uniques |

# 7. Observations

- Les contraintes d'entrée sont centralisées par les DTO et le `ValidationPipe` global ; les invariants dépendant de l'état courant sont appliqués dans les services.
- L'unicité d'un pointage par employé et jour est contrôlée dans le service et par une contrainte composée PostgreSQL.
- Les routes protégées combinent authentification JWT et autorisation `ADMIN` ou `EMPLOYEE` selon le contrôleur.
- Les limites numériques concernent notamment les horaires, les marges, les dates d'export, la géolocalisation, la photo, les mots de passe, les chaînes métier et le débit HTTP.
- La sécurité GPS est conditionnelle à la configuration, tandis que la photo est imposée par les routes de pointage employé.
- Les collections principales et les historiques ne disposent pas d'un mécanisme générique de pagination.
- Les limites d'infrastructure observables portent sur le corps HTTP, le débit et le téléversement de photo ; aucun quota fonctionnel global n'est déclaré.
