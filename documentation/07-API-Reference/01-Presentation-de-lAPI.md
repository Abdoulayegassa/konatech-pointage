# API Reference — Présentation de l'API

| Métadonnée | Valeur |
|---|---|
| Document ID | API-001 |
| Titre | Présentation de l'API |
| Version | 1.0 |
| Statut | Validé |
| Classification | Interne |
| Référence | API Reference |
| Projet | Konatech Pointage |

## 1. Présentation

L'API de Konatech Pointage est l'application NestJS située sous `apps/backend/`. Elle expose les fonctions d'authentification, de santé, de tableau de bord, de gestion des employés et horaires, de calendrier, de pointage, d'historique, d'export et de sanctions utilisées par le frontend Next.js.

Les contrôleurs constituent la frontière HTTP. Ils reçoivent les paramètres et DTO, appliquent les métadonnées d'accès puis délèguent aux services. Les services exécutent les traitements et accèdent à PostgreSQL par `PrismaService`. Les réponses sont principalement sérialisées en JSON; l'API produit également une redirection HTTP et des fichiers CSV ou PDF sur les routes correspondantes.

Le dépôt ne contient ni dépendance `@nestjs/swagger`, ni `SwaggerModule`, ni décorateur `@Api*`, ni document OpenAPI généré. La présente référence est donc fondée directement sur le bootstrap, les contrôleurs, DTO, gardes et services.

## 2. Architecture générale

```text
Navigateur / frontend Next.js / client HTTP
                    |
                    | HTTP
                    v
         API NestJS sous /api/v1
                    |
        +-----------+------------+
        |                        |
        v                        v
Gardes globaux             ValidationPipe
throttling, JWT, rôles     DTO et paramètres
        |                        |
        +-----------+------------+
                    v
              Contrôleurs
                    |
                    v
          Modules et services
                    |
                    v
              PrismaService
                    |
                    v
             Prisma Client
                    |
                    v
              PostgreSQL
                    |
                    v
       JSON, redirection, CSV ou PDF
```

| Couche | Implémentation observée | Rôle |
|---|---|---|
| Serveur HTTP | NestJS avec adaptateur Express | Écoute, routage et sérialisation |
| Entrée globale | Helmet, body-parser, CORS et préfixe | En-têtes HTTP, taille des corps, origine autorisée et espace de routes |
| Sécurité | `AppThrottlerGuard`, `JwtAuthGuard`, `RolesGuard` | Limitation, authentification Bearer et autorisation par rôle |
| Validation | `ValidationPipe`, DTO, `ParseUUIDPipe` | Validation et transformation des entrées |
| Routage | Huit contrôleurs NestJS | Regroupement des handlers par ressource ou domaine |
| Traitement | Services injectés dans les contrôleurs | Logique applicative, agrégations et exports |
| Persistance | `PrismaService` et sélections partagées | Accès typé aux modèles PostgreSQL |
| Audit | `AuditLogService` | Journalisation de plusieurs actions administratives après succès |

## 3. Organisation des routes

### 3.1 Préfixe et version dans l'URL

`apps/backend/src/main.ts` déclare :

```text
/api/v1
```

Chaque chemin de contrôleur est ajouté à ce préfixe. Par exemple, le contrôleur `health` expose la route complète `GET /api/v1/health` et le contrôleur `auth` expose `POST /api/v1/auth/login`.

Le segment `v1` est inclus dans le préfixe fixe. Aucun appel à `enableVersioning` et aucune annotation de version par contrôleur ou handler ne sont présents.

### 3.2 Regroupement par contrôleur

| Préfixe de contrôleur | Méthodes HTTP présentes | Nombre de handlers | Accès général observé |
|---|---|---:|---|
| `/auth` | GET, POST | 3 | Deux connexions publiques; identité courante authentifiée |
| `/health` | GET | 1 | Public |
| `/dashboard` | GET | 1 | `ADMIN` |
| `/employees` | GET, POST, PATCH | 8 | `ADMIN` |
| `/schedules` | GET, POST, PATCH | 5 | `ADMIN` |
| `/calendar` | GET, POST, PATCH, DELETE | 5 | `ADMIN` |
| `/attendance` | GET, POST | 11 | Une redirection publique; routes `ADMIN` ou `EMPLOYEE` |
| `/sanctions` | GET, PATCH | 4 | `ADMIN` |

Les chemins avec paramètres utilisent la syntaxe NestJS `:id` ou `:attendanceId`. Les requêtes mensuelles et l'export utilisent des objets DTO issus de `@Query`; les créations et modifications utilisent `@Body`.

### 3.3 Méthodes et conventions de handlers

| Élément | Utilisation observée |
|---|---|
| `GET` | Santé, identité, listes, détails, vues mensuelles, synthèses, historiques, règles, sanctions et export |
| `POST` | Connexions, créations, entrées et sorties de présence |
| `PATCH` | Modifications partielles, statuts et affectations |
| `DELETE` | Suppression d'un événement de calendrier |
| `@Param` | Identifiants de ressources; plusieurs UUID passent par `ParseUUIDPipe` |
| `@Query` | Mois d'historique, calendrier, sanctions et paramètres d'export |
| `@Body` | DTO de connexion, création, modification et pointage |
| `@CurrentUser` | Utilisateur chargé depuis le JWT pour les routes qui utilisent son identité |

## 4. Modules exposés

| Module | Contrôleur | Description |
|---|---|---|
| `AuthModule` | `AuthController` | Connexion e-mail/mot de passe, connexion PIN du terminal et identité courante |
| `HealthModule` | `HealthController` | État HTTP public du backend avec service et horodatage |
| `DashboardModule` | `DashboardController` | Vue agrégée du tableau de bord administrateur |
| `EmployeesModule` | `EmployeesController` | Liste, détail, création, modification, statut, rôle texte, département et horaire des employés |
| `SchedulesModule` | `SchedulesController` | Liste, détail, création, modification et statut des horaires |
| `CalendarModule` | `CalendarController` | Vue mensuelle et gestion des jours fériés publics ou d'entreprise |
| `AttendanceModule` | `AttendanceController` | Redirection de pointage, synthèse, historiques, sécurité, entrées, sorties et export mensuel |
| `SanctionsModule` | `SanctionsController` | Règles de sanction, modification, calcul mensuel et résultat d'une présence |

`PrismaModule` et `AuditLogModule` sont importés par l'application, mais n'exposent aucun contrôleur. Ils fournissent respectivement l'accès aux données et la journalisation technique aux modules qui les consomment.

## 5. Format général des échanges

### 5.1 Requêtes

Les corps applicatifs sont transmis en JSON. Le bootstrap désactive le body parser automatique de NestJS puis installe explicitement les parseurs JSON et URL-encoded avec la limite issue de `JSON_BODY_LIMIT`.

| Source de données HTTP | Traitement observé |
|---|---|
| Corps JSON | Désérialisé puis validé dans une classe DTO |
| Paramètre de chemin | Chaîne NestJS, avec `ParseUUIDPipe` sur les identifiants concernés |
| Paramètre de requête | Objet DTO transformé par le pipe global |
| En-tête `Authorization` | Schéma `Bearer` traité par `JwtAuthGuard` |
| Origine navigateur | Contrôlée par CORS à partir de `FRONTEND_URL`, avec credentials autorisés |

Le pipe global utilise `whitelist`, `forbidNonWhitelisted`, `transform` et la conversion implicite. Un champ absent, mal typé ou inconnu peut ainsi produire une réponse de validation avant l'appel au service.

### 5.2 Réponses JSON

NestJS sérialise les objets et tableaux retournés par les contrôleurs et services. Les structures varient selon le domaine. Les formes explicitement observables comprennent :

| Type de réponse | Structure observée | Source |
|---|---|---|
| Santé | `status`, `service`, `timestamp` | `HealthController` |
| Authentification | `accessToken`, `tokenType`, `expiresIn`, `user` | `AuthService` |
| Ressource | Objet employé, horaire, calendrier, présence ou règle | Contrôleurs et services métier |
| Collection | Tableau ou objet mensuel contenant des listes et agrégats | Services Employees, Attendance, Calendar, Dashboard et Sanctions |
| Utilisateur courant | Objet public attaché à la requête par le garde JWT | `AuthController.me` |

Les sélections Prisma publiques excluent le mot de passe et les secrets d'authentification des représentations usuelles d'employés. `EmployeesService` ajoute `pinConfigured` sans retourner la valeur ou l'empreinte du PIN.

### 5.3 Réponses non JSON

| Route ou cas | Format observé | En-têtes ou statut |
|---|---|---|
| `GET /api/v1/attendance/entry` | Redirection vers l'URL frontend `/attendance-entry` | 302 et en-tête `Location` géré par NestJS |
| Export mensuel par défaut ou `format=csv` | Contenu CSV | Type MIME, disposition en pièce jointe, nom de fichier et `Cache-Control: no-store` |
| Export mensuel avec `format=pdf` | Buffer PDF dans `StreamableFile` | Type MIME, disposition en pièce jointe, nom de fichier et absence de cache |

### 5.4 Codes HTTP et erreurs

| Code | Mécanisme observé |
|---:|---|
| 200 | Lectures et modifications réussies |
| 201 | Handlers `POST` NestJS sans code remplacé |
| 302 | Redirection publique du point d'entrée de présence |
| 400 | Validation, paramètre ou règle métier invalide |
| 401 | Identifiants, en-tête Bearer ou JWT invalides |
| 403 | Rôle insuffisant |
| 404 | Ressource demandée absente |
| 409 | Doublon ou état métier concurrent/incompatible |
| 429 | Limitation de débit dépassée |
| 500 | Échec technique interne explicitement traduit |
| 502 | Échec du service distant de stockage photo |
| 504 | Délai du stockage photo dépassé |

Les exceptions HTTP standards de NestJS sont utilisées dans les gardes et services. Le dépôt n'enregistre aucun filtre d'exception global personnalisé; la structure HTTP finale des exceptions relève du traitement standard NestJS.

## 6. Sécurité générale

### 6.1 Authentification globale

`AuthModule` enregistre `JwtAuthGuard` et `RolesGuard` comme `APP_GUARD`. Toute route est donc authentifiée par défaut, sauf lorsqu'un handler ou contrôleur porte `@Public()`.

`JwtAuthGuard` exige un en-tête de la forme :

```text
Authorization: Bearer <jeton>
```

Le garde transmet le jeton à `AuthService`, qui vérifie la signature et l'expiration, charge l'employé et rejette un compte devenu inactif. L'utilisateur public obtenu est placé dans `request.user` puis exposé par `@CurrentUser`.

Les handlers publics observés sont :

- `POST /api/v1/auth/login` ;
- `POST /api/v1/auth/attendance-entry/login` ;
- `GET /api/v1/health` ;
- `GET /api/v1/attendance/entry`.

### 6.2 Autorisation par rôle

Les rôles d'accès utilisés sont `ADMIN` et `EMPLOYEE`. `@Roles` place les rôles requis dans les métadonnées NestJS; `RolesGuard` compare ensuite `request.user.accessRole` à cette liste.

| Portée | Rôle observé |
|---|---|
| Dashboard, employés, horaires, calendrier et sanctions | `ADMIN` au niveau du contrôleur |
| Synthèse, historique global, export et pointage pour autrui | `ADMIN` au niveau du handler Attendance |
| État du jour, politique de sécurité, historique et pointage personnels | `EMPLOYEE` au niveau du handler Attendance |
| Identité courante `/auth/me` | Authentification requise, sans rôle supplémentaire |

### 6.3 Limitation de débit

`AppThrottlerGuard` est aussi enregistré comme garde global. L'application configure :

- une limite globale issue de `RATE_LIMIT_TTL_MS` et `RATE_LIMIT_MAX` ;
- une limite dédiée à `POST /auth/login` issue des variables `LOGIN_RATE_LIMIT_*` ;
- deux fenêtres codées dans `AppModule` pour la connexion PIN.

Une requête bloquée reçoit le statut 429. Le garde ajoute les en-têtes de limite et `Retry-After` lorsque le client est bloqué; il journalise les blocages propres à la connexion PIN.

### 6.4 Validation, en-têtes et CORS

| Mécanisme | Application observée |
|---|---|
| Helmet | Middleware global pour les en-têtes HTTP de sécurité |
| CORS | Une origine configurée par `FRONTEND_URL`, credentials activés |
| Limite de corps | Valeur `JSON_BODY_LIMIT` appliquée aux parseurs JSON et URL-encoded |
| DTO | Décorateurs `class-validator` et transformations ciblées |
| UUID | `ParseUUIDPipe` sur les paramètres concernés |
| Audit | Actions administratives sélectionnées journalisées après succès |
| Secrets | Hachage des mots de passe et PIN; sélections publiques sans secrets |

## 7. Traçabilité

| Élément documenté | Fichier ou répertoire source | Preuve observée |
|---|---|---|
| Bootstrap HTTP | `apps/backend/src/main.ts` | Préfixe, Helmet, parseurs, CORS, validation et port |
| Composition | `apps/backend/src/app.module.ts` | Modules chargés, configuration et throttling |
| Authentification | `apps/backend/src/modules/auth/auth.controller.ts`, `apps/backend/src/modules/auth/auth.service.ts` | Connexions, identité et JWT |
| Gardes globaux | `apps/backend/src/modules/auth/auth.module.ts`, `apps/backend/src/modules/auth/guards/` | Enregistrement et contrôles JWT/rôles |
| Décorateurs d'accès | `apps/backend/src/modules/auth/decorators/` | `@Public`, `@Roles` et `@CurrentUser` |
| Santé | `apps/backend/src/modules/health/health.controller.ts` | Handler public et charge utile |
| Dashboard | `apps/backend/src/modules/dashboard/dashboard.controller.ts`, `dashboard.service.ts` | Route administrateur et agrégats |
| Employés | `apps/backend/src/modules/employees/employees.controller.ts`, `employees.service.ts`, `dto/` | Huit handlers, validations et traitements |
| Horaires | `apps/backend/src/modules/schedules/schedules.controller.ts`, `schedules.service.ts`, `dto/` | Cinq handlers et contrats |
| Calendrier | `apps/backend/src/modules/calendar/calendar.controller.ts`, `calendar.service.ts`, `dto/` | Cinq handlers et événements mensuels |
| Pointage | `apps/backend/src/modules/attendance/attendance.controller.ts`, services et `dto/` | Onze handlers, rôles, redirection et exports |
| Sanctions | `apps/backend/src/modules/sanctions/sanctions.controller.ts`, `sanctions.service.ts`, `dto/` | Quatre handlers et calculs |
| Prisma | `apps/backend/src/common/prisma/prisma.service.ts`, `selects.ts`, `apps/backend/prisma/schema.prisma` | Client injecté, sélections et modèles |
| Limitation de débit | `apps/backend/src/common/security/app-throttler.guard.ts`, constantes Auth | Statuts, en-têtes et journal PIN |
| Audit | `apps/backend/src/common/audit/audit-log.service.ts`, contrôleurs administratifs | Événements après mutations et exports |
| Formats d'export | `apps/backend/src/modules/attendance/exports/`, `attendance.controller.ts` | CSV, PDF et en-têtes de fichier |
| Tests des contrats | `apps/backend/test/*.e2e-spec.ts` | Requêtes, statuts et charges utiles exercés |
| Documentation existante | `README.md`, `documentation/02-SAR/12-Architecture-API-REST.md`, chapitres Developer Guide | Contexte recoupé avec les sources actives |

## 8. Observations

- L'API est séparée du frontend dans un package NestJS dédié.
- Toutes les routes partagent le préfixe fixe `/api/v1`.
- Huit contrôleurs exposent 38 handlers HTTP.
- Les routes sont regroupées par domaine ou ressource dans les modules NestJS.
- L'authentification JWT est globale et les routes publiques sont explicitement marquées.
- L'autorisation utilise les rôles `ADMIN` et `EMPLOYEE`.
- La validation des DTO est globale et complétée par les services.
- Les réponses sont majoritairement en JSON; la redirection et les exports utilisent des formats HTTP distincts.
- Prisma centralise l'accès à PostgreSQL sans exposition directe de la base aux clients.
- Les actions administratives sélectionnées produisent des journaux d'audit.
- Aucun schéma Swagger/OpenAPI, aucune interface Swagger UI et aucune collection Postman ne sont présents dans le dépôt analysé.
- Aucun filtre d'exception ou intercepteur global personnalisé n'est enregistré dans le bootstrap.
