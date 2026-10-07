Document ID : EUG-003

Titre : Authentification

Version : 1.0

Statut : Validé

Classification : Interne

Référence : Employee User Guide

Projet : Konatech Pointage

# 1. Présentation

L'authentification de Konatech Pointage identifie l'employé avant l'accès aux fonctions qui lui sont réservées. Deux mécanismes sont implémentés : la connexion par adresse électronique et mot de passe pour l'espace personnel, et l'identification par PIN pour la page de pointage issue du QR Code.

Ces mécanismes créent des sessions distinctes. La connexion par compte conduit l'employé vers `/my-attendance`. L'identification par PIN maintient l'employé sur `/attendance-entry` et lui donne accès à la vue de pointage associée à son identité.

# 2. Principe de fonctionnement

## 2.1 Connexion par compte

La page `/login` transmet l'adresse électronique et le mot de passe à la route frontend `POST /api/auth/login`. Cette route appelle l'endpoint backend `POST /api/v1/auth/login`.

Le service d'authentification recherche le compte par son adresse électronique, vérifie que ce compte est actif, puis compare le mot de passe saisi avec le condensat enregistré. Une authentification valide produit un jeton JWT et les informations publiques de l'utilisateur. Le frontend conserve le jeton dans le cookie de session `konatech_session` et redirige le rôle applicatif `EMPLOYEE` vers `/my-attendance`.

## 2.2 Identification par PIN

La page `/attendance-entry`, ouverte directement ou depuis le QR Code, affiche un pavé numérique lorsqu'aucune session PIN valide n'est disponible. Le PIN saisi est transmis à `POST /api/auth/attendance-entry-session`, puis à l'endpoint backend `POST /api/v1/auth/attendance-entry/login`.

Le backend limite cette recherche aux comptes actifs dont le rôle applicatif est `EMPLOYEE` et dont un PIN est configuré. Une correspondance produit un JWT dédié au pointage. Le frontend le conserve dans le cookie `konatech_attendance_entry_session`, puis recharge `/attendance-entry` avec les données de l'employé identifié.

# 3. Informations utilisées

| Élément | Description |
|---|---|
| Adresse électronique | Identifiant de la connexion par compte. Le format est contrôlé par `LoginDto`. |
| Mot de passe | Secret de la connexion par compte. La requête exige une chaîne d'au moins huit caractères ; le backend la compare au condensat associé au compte. |
| Code PIN | Identifiant secret du parcours de pointage. Il contient exactement quatre chiffres et n'est accepté que pour un compte actif portant le rôle `EMPLOYEE`. |
| État actif du compte | Condition vérifiée lors de la connexion et lors de chaque lecture de l'utilisateur à partir d'un jeton. |
| Rôle d'accès | Valeur applicative utilisée pour déterminer la destination après connexion et autoriser les routes employé. |
| Jeton JWT | Jeton signé contenant l'identifiant du compte, son adresse électronique, sa date d'émission et sa date d'expiration. |

Le mot de passe et le PIN ne figurent pas dans l'objet utilisateur renvoyé après une authentification réussie.

# 4. Déroulement

## 4.1 Flux de connexion par compte

```text
Employé
   |
   v
/login : email et mot de passe
   |
   v
Validation du format des données
   |
   v
Vérification du compte actif et du mot de passe
   |
   v
Émission d'un JWT
   |
   v
Cookie konatech_session
   |
   v
/my-attendance
```

## 4.2 Flux d'identification par PIN

```text
Employé
   |
   v
QR Code -> /attendance-entry
   |
   v
Saisie du PIN à quatre chiffres
   |
   v
Validation du format et limitation des tentatives
   |
   v
Vérification du compte EMPLOYEE actif et du PIN
   |
   v
Émission d'un JWT de pointage
   |
   v
Cookie konatech_attendance_entry_session
   |
   v
Vue de pointage /attendance-entry
```

Pour les endpoints protégés, le frontend transmet le JWT au backend sous la forme d'un jeton `Bearer`. Le garde global vérifie sa présence, sa signature et son expiration, puis recharge le compte. Le garde de rôles compare ensuite le rôle du compte aux rôles admis par la route.

# 5. Gestion des sessions

| Session | Cookie | Destination associée | Durée observée | Fin de session observée |
|---|---|---|---|---|
| Compte | `konatech_session` | `/my-attendance` pour `EMPLOYEE` | Valeur de `JWT_EXPIRES_IN`, avec `1d` comme valeur backend par défaut | Le bouton « Se déconnecter » appelle `POST /api/auth/logout`, efface les deux cookies de session et redirige vers `/login`. |
| Pointage par PIN | `konatech_attendance_entry_session` | `/attendance-entry` | Valeur de `ATTENDANCE_ENTRY_JWT_EXPIRES_IN`, avec `15m` comme valeur backend par défaut | Une session invalide ou expirée est effacée lorsque la page revient à la saisie du PIN. |

Les deux cookies utilisent les attributs `HttpOnly`, `SameSite=Lax` et le chemin `/`. L'attribut `Secure` est activé lorsque `NODE_ENV` vaut `production`. Leur durée est calculée à partir de la durée d'expiration annoncée avec le JWT.

Une connexion par compte efface d'abord une éventuelle session PIN. La déconnexion générale efface la session de compte et la session PIN.

La route frontend `/my-attendance` exige le cookie de compte. Sans ce cookie, le middleware redirige vers `/login`. Si le jeton ne permet plus d'obtenir un utilisateur valide, le chargement de l'espace personnel conduit également vers `/login`.

# 6. Cas d'échec

| Cas observé | Résultat visible ou réponse appliquée | Sources |
|---|---|---|
| Adresse électronique ou mot de passe incorrect | Le backend répond `Invalid credentials.` ; le formulaire affiche le message transmis. | `apps/backend/src/modules/auth/auth.service.ts`, `apps/frontend/app/api/auth/login/route.ts`, `apps/frontend/components/auth/login-form.tsx` |
| Compte inactif lors de la connexion par compte | Le backend utilise la même réponse `Invalid credentials.` que pour des identifiants incorrects. | `apps/backend/src/modules/auth/auth.service.ts` |
| Email mal formé ou mot de passe trop court | La validation du DTO rejette la requête avant la vérification du compte. | `apps/backend/src/modules/auth/dto/login.dto.ts`, `apps/backend/src/main.ts` |
| PIN ne contenant pas exactement quatre chiffres | La validation renvoie « Le code PIN doit contenir exactement 4 chiffres. ». Le bouton de la page reste désactivé tant que quatre chiffres ne sont pas saisis. | `apps/backend/src/modules/auth/dto/attendance-entry-login.dto.ts`, `apps/frontend/components/attendance/attendance-entry-pin-view.tsx` |
| PIN incorrect ou compte PIN inactif | Le backend répond `Identifiants invalides.` ; l'écran affiche « Code PIN invalide. ». | `apps/backend/src/modules/auth/auth.service.ts`, `apps/backend/src/modules/auth/constants/attendance-entry.constants.ts`, `apps/frontend/components/attendance/attendance-entry-pin-view.tsx` |
| Nombre de tentatives PIN dépassé | L'écran affiche « Trop de tentatives. Réessayez dans quelques minutes. ». | `apps/backend/src/app.module.ts`, `apps/backend/src/common/security/app-throttler.guard.ts`, `apps/frontend/components/attendance/attendance-entry-pin-view.tsx` |
| Jeton absent sur une route backend protégée | Le garde rejette la requête avec `Missing Authorization header.`. | `apps/backend/src/modules/auth/guards/jwt-auth.guard.ts` |
| Jeton présenté sans schéma `Bearer` | Le garde rejette la requête avec `Authorization header must use Bearer.`. | `apps/backend/src/modules/auth/guards/jwt-auth.guard.ts` |
| Jeton invalide ou expiré | Le backend répond `Invalid or expired token.`. L'espace personnel ne conserve pas cet utilisateur et redirige vers `/login` ; la page PIN revient à l'écran de saisie. | `apps/backend/src/modules/auth/auth.service.ts`, `apps/frontend/lib/auth.ts`, `apps/frontend/app/attendance-entry/page.tsx` |
| Compte supprimé ou devenu inactif après émission du jeton | Le backend répond `User is no longer active.` lors de la lecture du jeton. | `apps/backend/src/modules/auth/auth.service.ts` |
| Rôle non autorisé pour une ressource backend | Le garde de rôles répond `Insufficient permissions for this resource.`. | `apps/backend/src/modules/auth/guards/roles.guard.ts` |
| Backend inaccessible pendant la connexion | Le formulaire de compte affiche « Connexion impossible. » ; l'écran PIN affiche « Impossible de vérifier ce code. ». | `apps/frontend/app/api/auth/login/route.ts`, `apps/frontend/app/api/auth/attendance-entry-session/route.ts`, `apps/frontend/components/auth/login-form.tsx`, `apps/frontend/components/attendance/attendance-entry-pin-view.tsx` |

# 7. Références

| Information | Fichier source | Preuve observée |
|---|---|---|
| Endpoints d'authentification | `apps/backend/src/modules/auth/auth.controller.ts` | Déclare la connexion par compte, la connexion PIN et la lecture de l'utilisateur courant. |
| Vérification des identifiants | `apps/backend/src/modules/auth/auth.service.ts` | Recherche du compte, contrôle du statut, vérification des secrets, émission du JWT et relecture de l'utilisateur. |
| Validation email et mot de passe | `apps/backend/src/modules/auth/dto/login.dto.ts` | Exige un email valide et un mot de passe d'au moins huit caractères. |
| Validation du PIN | `apps/backend/src/modules/auth/dto/attendance-entry-login.dto.ts` | Exige exactement quatre chiffres. |
| Hachage et comparaison des secrets | `apps/backend/src/common/security/password.util.ts` | Utilise `scrypt` pour le mot de passe et le PIN, puis une comparaison à temps constant. |
| Création et validation des JWT | `apps/backend/src/common/security/jwt.util.ts` | Signe en `HS256`, ajoute les dates d'émission et d'expiration, puis vérifie signature et expiration. |
| Garde d'authentification | `apps/backend/src/modules/auth/guards/jwt-auth.guard.ts` | Exige le schéma `Bearer` sur les routes non publiques et attache l'utilisateur vérifié à la requête. |
| Garde d'autorisation | `apps/backend/src/modules/auth/guards/roles.guard.ts` | Compare le rôle d'accès de l'utilisateur aux rôles requis. |
| Installation globale des gardes | `apps/backend/src/modules/auth/auth.module.ts` | Enregistre les gardes JWT et rôles comme `APP_GUARD`. |
| Routes employé protégées | `apps/backend/src/modules/attendance/attendance.controller.ts` | Les opérations personnelles de présence portent le rôle `EMPLOYEE`. |
| Formulaire de compte | `apps/frontend/app/login/page.tsx`, `apps/frontend/components/auth/login-form.tsx` | Affiche le formulaire, envoie les identifiants et présente les erreurs. |
| Création de la session de compte | `apps/frontend/app/api/auth/login/route.ts` | Transmet la connexion, définit `konatech_session` et calcule la redirection. |
| Écran de PIN | `apps/frontend/components/attendance/attendance-entry-pin-view.tsx` | Gère le pavé, la validation, la confirmation et les messages d'échec. |
| Création et suppression de la session PIN | `apps/frontend/app/api/auth/attendance-entry-session/route.ts` | Définit ou efface `konatech_attendance_entry_session`. |
| Sélection de la vue de pointage | `apps/frontend/app/attendance-entry/page.tsx` | Vérifie la session PIN et le rôle `EMPLOYEE`, sinon réaffiche le PIN. |
| Propriétés des cookies | `apps/frontend/lib/auth-session.ts` | Définit les noms, attributs, durées et opérations d'effacement. |
| Déconnexion générale | `apps/frontend/components/auth/logout-form.tsx`, `apps/frontend/app/api/auth/logout/route.ts` | Le bouton envoie la requête qui efface les deux sessions et redirige vers `/login`. |
| Protection et chargement de l'espace personnel | `apps/frontend/middleware.ts`, `apps/frontend/lib/auth.ts` | Contrôle la présence du cookie et la validité de l'utilisateur courant. |
| Redirection après connexion | `apps/frontend/lib/redirect.ts` | Associe le rôle `EMPLOYEE` à `/my-attendance`. |
