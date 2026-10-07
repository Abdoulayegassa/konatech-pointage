# Administration et sécurité

| Métadonnée | Valeur |
| --- | --- |
| Document ID | UAG-SEC-001 |
| Titre | Administration et sécurité |
| Version | 1.0 |
| Statut | Validé |
| Classification | Interne |
| Référence | UAG |
| Date de génération | 30 juillet 2026 |

## 1. Présentation

### 1.1 Objectif de l'administration

L'administration de Konatech Pointage permet aux comptes disposant du rôle
d'accès `ADMIN` de gérer les employés, les plannings, le calendrier, les
sanctions et les données de pointage accessibles aux ressources humaines.

L'administration comprend également la consultation du dashboard, de
l'historique RH et la génération des rapports mensuels.

Références :
`apps/frontend/components/admin/admin-nav.tsx`,
`apps/backend/src/modules/employees/employees.controller.ts`,
`apps/backend/src/modules/schedules/schedules.controller.ts`,
`apps/backend/src/modules/calendar/calendar.controller.ts`,
`apps/backend/src/modules/sanctions/sanctions.controller.ts`.

### 1.2 Objectif des mécanismes de sécurité

Les mécanismes présents assurent :

- l'identification par courriel et mot de passe pour la session applicative ;
- l'identification par PIN pour le terminal de pointage des employés ;
- la signature et l'expiration des jetons JWT ;
- la vérification de l'état actif du compte à chaque authentification du
  jeton ;
- la restriction des routes selon le rôle d'accès ;
- la validation et le filtrage des données entrantes ;
- la limitation du débit des requêtes ;
- la protection des réponses HTTP par Helmet ;
- la limitation CORS à l'URL frontend configurée ;
- la journalisation de certaines actions administratives.

Références :
`apps/backend/src/modules/auth/auth.service.ts`,
`apps/backend/src/modules/auth/guards/jwt-auth.guard.ts`,
`apps/backend/src/modules/auth/guards/roles.guard.ts`,
`apps/backend/src/main.ts`,
`apps/backend/src/app.module.ts`.

## 2. Comptes administrateurs

### 2.1 Création

Un compte administrateur est un enregistrement `Employee` dont
`accessRole` vaut `ADMIN`. Il peut être créé depuis le module Employés par un
administrateur déjà authentifié :

1. ouverture du formulaire de création ;
2. saisie des informations du compte ;
3. sélection du niveau d'accès « Administrateur » ;
4. validation ;
5. création par `POST /employees`.

Le formulaire et le DTO de création demandent notamment le prénom, le nom,
l'adresse électronique, la fonction métier et un mot de passe. Le backend
génère l'identifiant employé et chiffre le mot de passe avant l'enregistrement.

Des comptes administrateurs sont également créés ou mis à jour par le script
de seed du dépôt.

Références :
`apps/frontend/components/employees/admin-employees-manager.tsx`,
`apps/backend/src/modules/employees/dto/create-employee.dto.ts`,
`apps/backend/src/modules/employees/employees.service.ts`,
`apps/backend/prisma/seed.ts`.

### 2.2 Restrictions de création

La création des comptes est réservée à `ADMIN`. Le backend applique les
contraintes suivantes :

| Donnée | Validation observée |
| --- | --- |
| Prénom | Chaîne, 80 caractères au maximum |
| Nom | Chaîne, 80 caractères au maximum |
| Courriel | Format d'adresse électronique |
| Fonction métier `role` | Chaîne, 80 caractères au maximum |
| Rôle d'accès | Valeur de l'énumération `AccessRole` |
| Mot de passe | De 8 à 128 caractères |
| Département | Chaîne facultative, 80 caractères au maximum |
| Planning | UUID facultatif et planning existant |
| État | Booléen facultatif |

Le courriel et l'identifiant employé sont uniques dans le modèle Prisma. Pour
un compte `ADMIN`, le service retire les valeurs de PIN : l'authentification
du terminal est réservée aux employés.

Références :
`apps/backend/src/modules/employees/dto/create-employee.dto.ts`,
`apps/backend/src/modules/employees/employees.service.ts`,
`apps/backend/prisma/schema.prisma`.

### 2.3 Authentification

L'administrateur se connecte avec son courriel et son mot de passe sur
`/login`. Le backend :

1. recherche le compte par son courriel ;
2. refuse un compte absent ou inactif ;
3. compare le mot de passe avec le hash enregistré ;
4. crée un JWT ;
5. retourne l'utilisateur public et la durée du jeton.

Le frontend place ensuite le jeton dans le cookie de session
`konatech_session` et redirige un administrateur vers le dashboard ou vers une
destination autorisée demandée avant la connexion.

Références :
`apps/frontend/components/auth/login-form.tsx`,
`apps/frontend/app/api/auth/login/route.ts`,
`apps/backend/src/modules/auth/auth.controller.ts`,
`apps/backend/src/modules/auth/auth.service.ts`.

### 2.4 Privilèges et restrictions

Un administrateur peut, selon les contrôleurs présents :

- consulter le dashboard ;
- gérer les employés ;
- gérer les plannings ;
- gérer le calendrier et les jours fériés ;
- consulter et configurer les sanctions ;
- consulter l'historique et la synthèse de pointage ;
- générer des exports mensuels ;
- enregistrer par API une entrée ou une sortie pour un employé désigné.

Il ne peut pas appeler les routes personnelles
`/attendance/me/...`, réservées à `EMPLOYEE`. Il ne peut pas non plus
s'authentifier sur le terminal fixe avec un PIN administrateur, car la
recherche PIN est limitée aux comptes employés actifs.

Références :
`apps/backend/src/modules/attendance/attendance.controller.ts`,
`apps/backend/src/modules/auth/auth.service.ts`,
`apps/backend/src/modules/dashboard/dashboard.controller.ts`.

## 3. Gestion des rôles

### 3.1 Rôles d'accès présents

Le schéma Prisma contient exactement deux rôles d'accès :

| Rôle | Usage observé |
| --- | --- |
| `ADMIN` | Administration, ressources RH, paramétrage et rapports |
| `EMPLOYEE` | Pointage personnel et consultation de ses propres données |

Aucun autre rôle n'est défini dans l'énumération `AccessRole`.

Le modèle contient également un champ texte `role`. Ce champ décrit une
fonction métier telle que celles utilisées dans le seed. Il est affiché et
modifiable dans le module Employés, mais le guard d'autorisation utilise
`accessRole`, pas ce champ texte.

Références :
`apps/backend/prisma/schema.prisma`,
`apps/backend/src/modules/auth/guards/roles.guard.ts`,
`apps/frontend/components/employees/employee-manager.helpers.ts`.

### 3.2 Permissions de `ADMIN`

| Domaine | Permissions observées |
| --- | --- |
| Dashboard | Consultation de la vue d'ensemble |
| Employés | Liste, détail, création, modification, état, fonction, département et planning |
| Plannings | Liste, détail, création, modification et changement d'état |
| Calendrier | Consultation mensuelle et gestion des jours fériés |
| Sanctions | Consultation mensuelle, détail et modification des règles |
| Pointages | Synthèse, historique, export, entrée et sortie administratives |
| Rapports | Génération mensuelle CSV ou PDF par l'API ; PDF par l'interface |

Références :
`apps/backend/src/modules/dashboard/dashboard.controller.ts`,
`apps/backend/src/modules/employees/employees.controller.ts`,
`apps/backend/src/modules/schedules/schedules.controller.ts`,
`apps/backend/src/modules/calendar/calendar.controller.ts`,
`apps/backend/src/modules/sanctions/sanctions.controller.ts`,
`apps/backend/src/modules/attendance/attendance.controller.ts`.

### 3.3 Permissions de `EMPLOYEE`

| Domaine | Permissions observées |
| --- | --- |
| Journée courante | Consultation de son état de pointage |
| Politique de sécurité | Consultation de la politique applicable |
| Historique | Consultation de son historique mensuel |
| Entrée | Enregistrement de sa propre entrée |
| Sortie | Enregistrement de sa propre sortie |
| Profil de session | Consultation de l'utilisateur authentifié par `/auth/me` |

Les routes personnelles utilisent l'identifiant issu du JWT. Elles ne
reçoivent pas un identifiant d'employé choisi par le client.

Références :
`apps/backend/src/modules/attendance/attendance.controller.ts`,
`apps/backend/src/modules/auth/auth.controller.ts`,
`apps/backend/src/modules/auth/decorators/current-user.decorator.ts`.

### 3.4 Attribution d'un rôle

Le niveau d'accès peut être choisi dans le formulaire de création ou de
modification d'un employé. Le DTO accepte uniquement les valeurs de
`AccessRole`.

Une route distincte `PATCH /employees/:id/role` existe, mais elle modifie le
champ texte de fonction métier et non `accessRole`. Le changement de niveau
d'accès passe par la modification générale de l'employé.

Lorsqu'un compte devient `ADMIN`, le service supprime son PIN. Lorsqu'un
compte devient `EMPLOYEE`, un PIN existant est exigé ou un nouveau PIN doit
être fourni.

Références :
`apps/frontend/components/employees/admin-employees-manager.tsx`,
`apps/backend/src/modules/employees/dto/update-employee.dto.ts`,
`apps/backend/src/modules/employees/dto/assign-employee-role.dto.ts`,
`apps/backend/src/modules/employees/employees.service.ts`.

## 4. Contrôles d'accès

### 4.1 Chaîne de contrôle

```text
+-----------------------------+
| Requête utilisateur         |
+--------------+--------------+
               |
               v
+-----------------------------+
| Contrôle frontend           |
| cookie / page / redirection |
+--------------+--------------+
               |
               v
+-----------------------------+
| Proxy API Next.js           |
| transmission Bearer        |
+--------------+--------------+
               |
               v
+-----------------------------+
| JwtAuthGuard global         |
| signature, expiration,      |
| compte actif                |
+--------------+--------------+
               |
               v
+-----------------------------+
| RolesGuard global           |
| ADMIN ou EMPLOYEE           |
+--------------+--------------+
               |
               v
+-----------------------------+
| Contrôleur et service       |
| validations métier         |
+-----------------------------+
```

Références :
`apps/frontend/lib/api-route.ts`,
`apps/backend/src/modules/auth/auth.module.ts`,
`apps/backend/src/modules/auth/guards/jwt-auth.guard.ts`,
`apps/backend/src/modules/auth/guards/roles.guard.ts`.

### 4.2 Guards backend

`JwtAuthGuard` et `RolesGuard` sont enregistrés comme guards globaux :

- une route est privée par défaut ;
- `@Public()` permet explicitement l'accès sans JWT ;
- le JWT doit être transmis par l'en-tête `Authorization: Bearer` ;
- l'utilisateur est rechargé depuis la base ;
- un utilisateur absent ou inactif est refusé ;
- `@Roles(...)` limite ensuite les rôles autorisés.

Les routes explicitement publiques observées sont :

- `POST /auth/login` ;
- `POST /auth/attendance-entry/login` ;
- `GET /attendance/entry` ;
- les routes du contrôleur de santé.

Références :
`apps/backend/src/modules/auth/auth.module.ts`,
`apps/backend/src/modules/auth/decorators/public.decorator.ts`,
`apps/backend/src/modules/auth/guards/jwt-auth.guard.ts`,
`apps/backend/src/modules/auth/guards/roles.guard.ts`,
`apps/backend/src/modules/health/health.controller.ts`.

### 4.3 Middleware frontend

Le middleware Next.js vérifie uniquement la présence du cookie principal sur :

- `/` ;
- `/my-attendance` et ses sous-chemins ;
- `/employees` et ses sous-chemins ;
- `/schedules` et ses sous-chemins.

En l'absence du cookie, il redirige vers `/login`. Il ne vérifie ni la
signature du JWT ni le rôle.

Les pages administratives non couvertes par ce matcher, notamment les exports,
l'historique, le calendrier et les sanctions, appellent elles-mêmes
`requireCurrentUser`, puis contrôlent le rôle et redirigent si nécessaire.

Références :
`apps/frontend/middleware.ts`,
`apps/frontend/lib/auth.ts`,
`apps/frontend/app/exports/page.tsx`,
`apps/frontend/app/attendance-history/page.tsx`,
`apps/frontend/app/calendar/page.tsx`,
`apps/frontend/app/sanctions/page.tsx`.

### 4.4 Contrôles frontend et redirections

Le frontend applique les comportements suivants :

| Situation | Redirection observée |
| --- | --- |
| Page protégée sans utilisateur valide | `/login` |
| `EMPLOYEE` ouvrant une page d'administration | `/my-attendance` |
| `ADMIN` après connexion | Dashboard ou destination administrateur autorisée |
| `EMPLOYEE` après connexion | `/my-attendance` ou destination personnelle autorisée |
| Déconnexion | `/login` |
| Session terminal invalide ou rôle non employé | Retour à la saisie du PIN |

Ces contrôles d'interface complètent les guards backend ; ils ne les
remplacent pas.

Références :
`apps/frontend/lib/redirect.ts`,
`apps/frontend/lib/auth.ts`,
`apps/frontend/app/api/auth/logout/route.ts`,
`apps/frontend/app/attendance-entry/page.tsx`.

## 5. Sécurité des données

### 5.1 Mots de passe et PIN

Les mots de passe et les nouveaux PIN sont hachés avec `scrypt`, un sel
aléatoire de 16 octets et une clé dérivée de 64 octets. La comparaison utilise
`timingSafeEqual`.

Les réponses publiques des employés excluent le hash du mot de passe et les
valeurs de PIN. Elles exposent seulement l'indicateur `pinConfigured`.

Le service d'authentification sait encore lire un ancien PIN en clair. Lors
d'une authentification réussie avec ce format, il le remplace par un hash et
efface la valeur en clair.

Références :
`apps/backend/src/common/security/password.util.ts`,
`apps/backend/src/modules/employees/employees.service.ts`,
`apps/backend/src/modules/auth/auth.service.ts`,
`apps/backend/src/common/prisma/selects.ts`.

### 5.2 JWT

Le JWT est signé en HMAC SHA-256 avec `JWT_SECRET`. Il contient :

- `sub`, l'identifiant de l'utilisateur ;
- `email` ;
- `iat`, la date d'émission ;
- `exp`, la date d'expiration.

La vérification contrôle la structure, la signature, les champs requis et
l'expiration. La durée de la session principale vient de `JWT_EXPIRES_IN` et
vaut `1d` par défaut. La session du terminal utilise
`ATTENDANCE_ENTRY_JWT_EXPIRES_IN` et vaut `15m` par défaut.

Le rôle n'est pas lu depuis le contenu du JWT : l'utilisateur public, y
compris son rôle actuel et son état actif, est relu en base à partir de `sub`.

Références :
`apps/backend/src/common/security/jwt.util.ts`,
`apps/backend/src/modules/auth/auth.service.ts`,
`apps/backend/src/modules/auth/constants/attendance-entry.constants.ts`.

### 5.3 Sessions frontend

Deux cookies séparés sont présents :

| Cookie | Usage |
| --- | --- |
| `konatech_session` | Session principale du site |
| `konatech_attendance_entry_session` | Session courte du terminal fixe |

Ils utilisent `HttpOnly`, `SameSite=Lax`, le chemin `/` et une durée alignée
sur celle du jeton. L'attribut `Secure` est activé en production.

La connexion principale efface la session terminal avant de créer la session
principale. La déconnexion efface les deux cookies.

Références :
`apps/frontend/lib/auth-session.ts`,
`apps/frontend/app/api/auth/login/route.ts`,
`apps/frontend/app/api/auth/logout/route.ts`,
`apps/frontend/app/api/auth/attendance-entry-session/route.ts`.

### 5.4 Validation des entrées

Une `ValidationPipe` globale :

- transforme les paramètres vers les types déclarés ;
- retire les propriétés non déclarées ;
- refuse les propriétés non autorisées ;
- applique les décorateurs de validation des DTO.

Les identifiants de routes employés, plannings, calendrier et sanctions
utilisent des contrôles UUID là où ils sont déclarés. Les DTO contrôlent
notamment les courriels, longueurs, énumérations, nombres, dates et booléens.

Le corps JSON et les formulaires URL-encodés sont limités par la valeur
`JSON_BODY_LIMIT`, qui vaut `10mb` par défaut.

Références :
`apps/backend/src/main.ts`,
`apps/backend/src/app.module.ts`,
`apps/backend/src/modules/employees/dto/create-employee.dto.ts`,
`apps/backend/src/modules/attendance/dto/monthly-attendance-export-query.dto.ts`.

### 5.5 Protection des API

Les mécanismes transversaux observés sont :

| Protection | Fonctionnement |
| --- | --- |
| Authentification | Guard JWT global, sauf routes `@Public()` |
| Autorisation | Guard global basé sur `@Roles()` |
| Limitation de débit | Limite globale configurable |
| Connexion principale | Limite dédiée configurable |
| PIN terminal | 5 requêtes par minute et 10 par 10 minutes |
| En-têtes HTTP | Middleware Helmet |
| CORS | Origine limitée à `FRONTEND_URL`, avec credentials |
| Taille des requêtes | Limite configurable du corps |
| Configuration | Validation Joi au démarrage |

Les blocages de débit du PIN produisent un message spécifique et une ligne de
journal contenant la route, l'adresse suivie, l'agent utilisateur, le limiteur
et la date.

Références :
`apps/backend/src/app.module.ts`,
`apps/backend/src/main.ts`,
`apps/backend/src/common/security/app-throttler.guard.ts`.

### 5.6 Validation de la configuration

Le démarrage exige notamment une URL frontend, un secret JWT d'au moins 32
caractères et une URL de base de données. En production :

- le secret JWT ne peut pas conserver certains libellés de développement ;
- l'URL frontend ne peut pas utiliser localhost ;
- elle doit utiliser HTTPS ;
- elle ne peut pas être une URL de tunnel temporaire ;
- elle ne peut pas pointer vers une adresse IP privée.

Lorsque la sécurité de pointage est active, les coordonnées de l'entreprise
sont obligatoires. Les paramètres Cloudinary doivent être fournis ensemble.

Référence :
`apps/backend/src/app.module.ts`.

## 6. Restrictions fonctionnelles

### 6.1 Restrictions liées aux comptes

- un compte inactif ne peut pas se connecter ;
- un jeton appartenant à un compte devenu inactif est refusé ;
- seuls les administrateurs peuvent créer ou modifier des comptes ;
- un compte administrateur ne conserve pas de PIN ;
- un compte employé doit disposer d'un PIN pour le terminal ;
- un PIN doit contenir exactement quatre chiffres, respecter les règles
  d'exclusion et ne pas être déjà utilisé ;
- le courriel doit être unique ;
- aucun utilisateur ne peut créer lui-même son compte.

Références :
`apps/backend/src/modules/auth/auth.service.ts`,
`apps/backend/src/modules/employees/employees.service.ts`,
`apps/backend/src/common/validation/pin-code.validation.ts`,
`apps/backend/prisma/schema.prisma`.

### 6.2 Restrictions de pointage

Un administrateur ne peut pas utiliser les routes personnelles de pointage ni
le terminal PIN. Toutefois, les routes administratives
`POST /attendance/check-in` et `POST /attendance/check-out` lui permettent
d'enregistrer une action pour un employé désigné par l'API.

Un employé :

- ne peut agir que sur son propre pointage via les routes `/me` ;
- ne peut pas enregistrer deux entrées le même jour ;
- ne peut pas sortir sans entrée ;
- ne peut pas enregistrer deux sorties ;
- ne peut pas utiliser une date future ;
- ne peut pas sortir avant son heure d'entrée ;
- doit fournir les preuves imposées par la politique de sécurité.

Références :
`apps/backend/src/modules/attendance/attendance.controller.ts`,
`apps/backend/src/modules/attendance/attendance.service.ts`,
`apps/backend/src/modules/attendance/attendance-security.service.ts`.

### 6.3 Ressources protégées

Les ressources Employés, Plannings, Calendrier, Sanctions et Dashboard sont
déclarées `ADMIN` au niveau de leur contrôleur. Le module Pointages applique
le rôle route par route afin de séparer les opérations administratives des
opérations personnelles.

Les utilisateurs employés n'ont aucune route backend de gestion des autres
comptes, des plannings, du calendrier, des sanctions ou des rapports.

## 7. Comportements observés

### 7.1 Erreurs d'authentification et d'autorisation

| Situation | Réponse ou comportement |
| --- | --- |
| En-tête d'autorisation absent | `Missing Authorization header.` |
| Schéma autre que Bearer | `Authorization header must use Bearer.` |
| Jeton invalide ou expiré | `Invalid or expired token.` |
| Compte supprimé ou inactif | `User is no longer active.` |
| Rôle insuffisant | `Insufficient permissions for this resource.` |
| Courriel ou mot de passe invalide | `Invalid credentials.` |
| PIN invalide | Message d'identifiants PIN invalides |
| Trop de tentatives PIN | Message de limitation et statut HTTP 429 |

Le formulaire de connexion présente le message retourné par l'API ou
« Connexion impossible » lorsqu'aucun message exploitable n'est disponible.

Références :
`apps/backend/src/modules/auth/guards/jwt-auth.guard.ts`,
`apps/backend/src/modules/auth/guards/roles.guard.ts`,
`apps/backend/src/modules/auth/auth.service.ts`,
`apps/frontend/components/auth/login-form.tsx`.

### 7.2 Session expirée

Une session expirée peut encore laisser un cookie présent jusqu'à son
expiration côté navigateur. Le middleware, qui ne contrôle que sa présence,
laisse alors passer la première navigation. La page ou l'appel API valide le
jeton auprès du backend ; `requireCurrentUser` redirige vers `/login` si
l'utilisateur ne peut pas être récupéré.

Références :
`apps/frontend/middleware.ts`,
`apps/frontend/lib/auth.ts`,
`apps/backend/src/modules/auth/auth.service.ts`.

### 7.3 Protections des actions administratives

Les opérations de création et de modification des employés, plannings,
calendrier et règles de sanction produisent des événements via
`AuditLogService`. Les pointages administratifs et les exports mensuels sont
également journalisés.

Le service d'audit utilise le logger NestJS ; aucun écran de consultation des
journaux d'audit n'est présent.

Références :
`apps/backend/src/common/audit/audit-log.service.ts`,
`apps/backend/src/modules/employees/employees.controller.ts`,
`apps/backend/src/modules/attendance/attendance.controller.ts`.

## 8. Traçabilité

| Mécanisme | Fichiers concernés |
| --- | --- |
| Modèle des comptes et rôles | `apps/backend/prisma/schema.prisma` |
| Comptes initiaux | `apps/backend/prisma/seed.ts` |
| Création et gestion des comptes | `apps/backend/src/modules/employees/employees.service.ts` |
| Routes de gestion des comptes | `apps/backend/src/modules/employees/employees.controller.ts` |
| Validation de création | `apps/backend/src/modules/employees/dto/create-employee.dto.ts` |
| Validation de modification | `apps/backend/src/modules/employees/dto/update-employee.dto.ts` |
| Interface de gestion | `apps/frontend/components/employees/admin-employees-manager.tsx` |
| Connexion et contrôle des comptes actifs | `apps/backend/src/modules/auth/auth.service.ts` |
| Routes d'authentification | `apps/backend/src/modules/auth/auth.controller.ts` |
| Validation de la connexion | `apps/backend/src/modules/auth/dto/login.dto.ts` |
| Validation du PIN | `apps/backend/src/modules/auth/dto/attendance-entry-login.dto.ts` |
| Hachage des secrets | `apps/backend/src/common/security/password.util.ts` |
| Signature et vérification JWT | `apps/backend/src/common/security/jwt.util.ts` |
| Guard d'authentification | `apps/backend/src/modules/auth/guards/jwt-auth.guard.ts` |
| Guard de rôles | `apps/backend/src/modules/auth/guards/roles.guard.ts` |
| Enregistrement global des guards | `apps/backend/src/modules/auth/auth.module.ts` |
| Limitation de débit | `apps/backend/src/common/security/app-throttler.guard.ts` |
| Configuration des limiteurs | `apps/backend/src/app.module.ts` |
| Validation globale, Helmet et CORS | `apps/backend/src/main.ts` |
| Middleware frontend | `apps/frontend/middleware.ts` |
| Lecture de session frontend | `apps/frontend/lib/auth.ts` |
| Cookies de session | `apps/frontend/lib/auth-session.ts` |
| Création de session principale | `apps/frontend/app/api/auth/login/route.ts` |
| Déconnexion | `apps/frontend/app/api/auth/logout/route.ts` |
| Session du terminal | `apps/frontend/app/api/auth/attendance-entry-session/route.ts` |
| Transmission des appels API | `apps/frontend/lib/api-route.ts` |
| Journalisation administrative | `apps/backend/src/common/audit/audit-log.service.ts` |

## 9. Observations

### 9.1 Comportements existants

- les routes backend sont privées par défaut ;
- l'utilisateur est rechargé en base à chaque validation de jeton ;
- le rôle d'accès courant vient donc de la base, pas du JWT ;
- la désactivation d'un compte invalide ses appels authentifiés suivants ;
- les mots de passe et les nouveaux PIN sont stockés sous forme de hash
  `scrypt` ;
- les sessions principale et terminal sont séparées ;
- les cookies de session ne sont pas accessibles au JavaScript du navigateur ;
- les contrôles de rôle existent à la fois dans les pages et dans l'API ;
- les données non déclarées dans un DTO sont refusées ;
- les tentatives de connexion sont soumises à une limitation de débit.

### 9.2 Limitations observées

- le middleware frontend ne couvre pas toutes les routes administratives ;
- le middleware vérifie la présence du cookie, pas sa validité ni le rôle ;
- aucun écran ne permet de consulter les événements d'audit ;
- aucun écran dédié de gestion des administrateurs n'existe : ils sont gérés
  dans le module commun Employés ;
- aucune permission fine par action n'existe au-delà de `ADMIN` et
  `EMPLOYEE` ;
- le champ texte `role` n'accorde aucune permission ;
- aucun mécanisme de renouvellement de JWT n'est présent ;
- aucune liste de révocation de jetons n'est présente ;
- la déconnexion efface les cookies, sans invalider le JWT côté backend ;
- la compatibilité avec les anciens PIN en clair reste présente jusqu'à leur
  migration lors d'une connexion réussie.

### 9.3 Fonctionnalités absentes

Le dépôt ne contient pas :

- d'authentification multifacteur pour les administrateurs ;
- de récupération autonome d'un mot de passe oublié ;
- de changement autonome du mot de passe ;
- de confirmation d'adresse électronique ;
- de verrouillage persistant d'un compte après plusieurs échecs ;
- de rôles personnalisables ;
- de permissions configurables par module ;
- de consultation des sessions actives ;
- de révocation individuelle d'une session ;
- d'écran de journal d'audit ;
- de création de compte en libre-service.

Références :
`apps/backend/src/modules/auth/auth.controller.ts`,
`apps/backend/src/modules/auth/auth.service.ts`,
`apps/frontend/app/login/page.tsx`,
`apps/frontend/components/employees/admin-employees-manager.tsx`.
