Document ID : EUG-002

Titre : Première connexion

Version : 1.0

Statut : Validé

Classification : Interne

Référence : Employee User Guide

Projet : Konatech Pointage

# 1. Présentation

Konatech Pointage propose à l'employé deux accès distincts selon l'usage : la connexion par compte sur `/login`, qui ouvre l'espace personnel `/my-attendance`, et l'identification par code PIN sur `/attendance-entry`, destinée au parcours de pointage ouvert par le QR Code.

Le code ne distingue pas la première connexion des connexions suivantes. Lors du premier accès, l'employé utilise les informations déjà associées à son compte. La création et l'activation du compte sont réalisées en amont dans la gestion des employés ; aucun écran d'inscription employé n'intervient dans ces deux parcours.

# 2. Conditions préalables

Les conditions dépendent du mode d'accès utilisé.

| Mode d'accès | Conditions observées | Sources |
|---|---|---|
| Espace personnel | Un enregistrement employé existe, son compte est actif et un mot de passe est associé à son adresse électronique. | `apps/backend/src/modules/auth/auth.service.ts`, `apps/backend/src/modules/employees/employees.service.ts`, `apps/backend/prisma/schema.prisma` |
| Pointage par QR Code et PIN | Le QR Code ouvre `/attendance-entry`. L'enregistrement doit être actif, porter le rôle applicatif `EMPLOYEE` et disposer d'un PIN configuré. | `apps/frontend/app/page.tsx`, `apps/frontend/components/dashboard/attendance-entry-qr-card.tsx`, `apps/backend/src/modules/auth/auth.service.ts`, `apps/backend/src/modules/employees/employees.service.ts` |

Le rôle `EMPLOYEE` cité ici est une valeur applicative utilisée par le contrôle d'accès. Il ne décrit pas une fonction organisationnelle.

# 3. Accès à l'application

## 3.1 Accès à l'espace personnel

La route `/login` affiche un formulaire comportant les champs « Email » et « Mot de passe », puis le bouton « Se connecter ». Bien que l'en-tête visuel de cette page porte le libellé « Connexion administrateur », le traitement accepte aussi un compte dont le rôle applicatif est `EMPLOYEE` et redirige ce compte vers `/my-attendance`.

Une tentative d'accès direct à `/my-attendance` sans cookie de session de compte est redirigée vers `/login` par le middleware frontend.

## 3.2 Accès au pointage par PIN

Le QR Code produit depuis le dashboard contient l'adresse de `/attendance-entry`. Lorsque cette page ne possède pas de session de pointage valide, elle affiche le pavé numérique et le texte « Entrez votre code PIN à 4 chiffres ».

Le chemin observé est le suivant :

```text
QR Code
   |
   v
/attendance-entry
   |
   v
Saisie du PIN
   |
   v
Vue de pointage de l'employé
```

# 4. Première connexion

## 4.1 Connexion par compte

1. Ouvrir la route `/login`.
2. Saisir l'adresse électronique du compte dans le champ « Email ».
3. Saisir le mot de passe dans le champ « Mot de passe ».
4. Activer le bouton « Se connecter ».
5. Après validation, l'application crée une session de compte et ouvre `/my-attendance` pour le rôle `EMPLOYEE`.

Le formulaire envoie les informations à la route frontend `POST /api/auth/login`. Celle-ci transmet la demande à `POST /api/v1/auth/login`, puis place le jeton reçu dans le cookie HTTP-only `konatech_session`.

## 4.2 Identification pour le pointage

1. Scanner le QR Code de pointage, ou ouvrir la route qu'il contient : `/attendance-entry`.
2. Utiliser le pavé numérique pour saisir les quatre chiffres du PIN.
3. Le bouton « OK », dont le libellé accessible est « Valider le code PIN », devient utilisable lorsque quatre chiffres ont été saisis.
4. Activer « OK ».
5. Après validation, l'application confirme l'employé puis recharge `/attendance-entry` avec la vue de pointage.

Le bouton « Suppr. » retire le dernier chiffre saisi. Les chiffres sont représentés à l'écran par des points. La validation appelle `POST /api/auth/attendance-entry-session`, qui transmet le PIN à `POST /api/v1/auth/attendance-entry/login` et crée le cookie HTTP-only `konatech_attendance_entry_session`.

# 5. Informations demandées

| Information | Obligatoire | Description |
|---|---|---|
| Email — connexion par compte | Oui | Adresse électronique du compte. Le DTO backend exige un format d'adresse électronique valide. |
| Mot de passe — connexion par compte | Oui | Secret associé au compte. Le DTO backend exige une chaîne d'au moins huit caractères avant la vérification du mot de passe chiffré enregistré. |
| Code PIN — pointage QR | Oui | Suite de quatre chiffres. Le pavé numérique ne permet la validation qu'après la saisie des quatre chiffres. |

Le PIN et le mot de passe sont utilisés dans des parcours séparés. Le formulaire `/login` ne demande pas le PIN, et la page `/attendance-entry` ne demande ni l'adresse électronique ni le mot de passe.

# 6. Résultat attendu

## 6.1 Après la connexion par compte

Pour un compte `EMPLOYEE`, la réponse d'authentification entraîne une redirection vers `/my-attendance`. Cette page affiche l'espace personnel de pointage avec le prénom de l'utilisateur, l'état du pointage du jour, les actions d'entrée ou de sortie disponibles et l'historique récent.

Le cookie de session de compte est inaccessible au code JavaScript du navigateur (`HttpOnly`), utilise `SameSite=Lax`, s'applique au chemin `/` et reçoit une durée correspondant à l'expiration annoncée par le backend.

## 6.2 Après l'identification par PIN

La page `/attendance-entry` vérifie l'utilisateur de la session et charge ses données de pointage. La vue de pointage n'est affichée par ce parcours que si l'utilisateur identifié porte le rôle applicatif `EMPLOYEE`.

La session PIN est distincte de la session de compte. Sa durée par défaut est de quinze minutes, valeur définie par le backend lorsque `ATTENDANCE_ENTRY_JWT_EXPIRES_IN` n'en fournit pas une autre.

# 7. Cas particuliers

| Situation gérée | Comportement observé | Sources |
|---|---|---|
| Adresse électronique ou mot de passe invalide | Le backend renvoie une erreur d'authentification avec le message `Invalid credentials.` ; le formulaire affiche le message transmis. | `apps/backend/src/modules/auth/auth.service.ts`, `apps/frontend/app/api/auth/login/route.ts`, `apps/frontend/components/auth/login-form.tsx` |
| Compte inactif lors de la connexion par compte | Le service traite le compte comme des identifiants invalides et renvoie le même message `Invalid credentials.`. | `apps/backend/src/modules/auth/auth.service.ts` |
| Email mal formé ou mot de passe de moins de huit caractères | La validation globale rejette le DTO avant l'exécution du service d'authentification ; le formulaire affiche les messages transmis par l'API. | `apps/backend/src/main.ts`, `apps/backend/src/modules/auth/dto/login.dto.ts`, `apps/frontend/app/api/auth/login/route.ts` |
| PIN incomplet | Le bouton de validation reste désactivé tant que quatre chiffres ne sont pas saisis. | `apps/frontend/components/attendance/attendance-entry-pin-view.tsx` |
| PIN ne comportant pas exactement quatre chiffres | Le DTO refuse la valeur avec le message « Le code PIN doit contenir exactement 4 chiffres. ». | `apps/backend/src/modules/auth/dto/attendance-entry-login.dto.ts`, `apps/frontend/components/attendance/attendance-entry-pin-view.tsx` |
| PIN non reconnu ou compte employé inactif | La vue affiche « Code PIN invalide. ». Le backend utilise le message générique `Identifiants invalides.` pour ces cas. | `apps/backend/src/modules/auth/auth.service.ts`, `apps/backend/src/modules/auth/constants/attendance-entry.constants.ts`, `apps/frontend/components/attendance/attendance-entry-pin-view.tsx` |
| Trop de tentatives de PIN | La vue affiche « Trop de tentatives. Réessayez dans quelques minutes. ». | `apps/backend/src/common/security/app-throttler.guard.ts`, `apps/backend/src/app.module.ts`, `apps/backend/src/modules/auth/constants/attendance-entry.constants.ts`, `apps/frontend/components/attendance/attendance-entry-pin-view.tsx` |
| Backend indisponible pendant la connexion par compte | Le formulaire affiche « Connexion impossible. ». | `apps/frontend/app/api/auth/login/route.ts`, `apps/frontend/components/auth/login-form.tsx` |
| Backend indisponible pendant la vérification du PIN | La vue affiche « Impossible de vérifier ce code. ». | `apps/frontend/app/api/auth/attendance-entry-session/route.ts`, `apps/frontend/components/attendance/attendance-entry-pin-view.tsx` |
| Session de compte absente, invalide ou expirée | L'accès à `/my-attendance` aboutit à `/login` lorsque l'utilisateur courant ne peut pas être obtenu. | `apps/frontend/middleware.ts`, `apps/frontend/lib/auth.ts`, `apps/frontend/app/my-attendance/page.tsx` |
| Session PIN invalide, expirée ou associée à un autre rôle | `/attendance-entry` efface la session dédiée devenue inutilisable et présente de nouveau l'écran de saisie du PIN. | `apps/frontend/app/attendance-entry/page.tsx`, `apps/frontend/components/attendance/attendance-entry-pin-view.tsx`, `apps/frontend/app/api/auth/attendance-entry-session/route.ts` |

# 8. Références

| Information documentée | Fichier source | Preuve observée |
|---|---|---|
| Écran de connexion | `apps/frontend/app/login/page.tsx` | La page rend le formulaire de connexion et redirige une session déjà authentifiée selon son rôle. |
| Champs et actions de connexion | `apps/frontend/components/auth/login-form.tsx` | Champs « Email » et « Mot de passe », bouton « Se connecter », envoi JSON et affichage des erreurs. |
| Route frontend de connexion | `apps/frontend/app/api/auth/login/route.ts` | Transmission à `/auth/login`, création de `konatech_session` et calcul de la redirection. |
| Redirection de l'employé | `apps/frontend/lib/redirect.ts` | Le rôle autre que `ADMIN`, dont `EMPLOYEE`, reçoit `/my-attendance` comme destination par défaut. |
| Protection de l'espace personnel | `apps/frontend/middleware.ts` | `/my-attendance` exige la présence du cookie de session de compte. |
| Chargement de l'utilisateur connecté | `apps/frontend/lib/auth.ts` | Lecture de la session, interrogation de l'API et redirection vers `/login` en l'absence d'utilisateur valide. |
| Espace personnel employé | `apps/frontend/app/my-attendance/page.tsx` | Chargement du pointage courant et de l'historique pour l'employé authentifié. |
| Forme des identifiants de compte | `apps/backend/src/modules/auth/dto/login.dto.ts` | Email valide et mot de passe d'au moins huit caractères. |
| Authentification par compte et par PIN | `apps/backend/src/modules/auth/auth.service.ts` | Vérification du compte actif, du mot de passe, du rôle `EMPLOYEE` et du PIN. |
| Endpoints publics d'authentification | `apps/backend/src/modules/auth/auth.controller.ts` | Déclaration des routes `login` et `attendance-entry/login`. |
| Accès QR à la page de pointage | `apps/frontend/app/page.tsx` | Construction de l'adresse `/attendance-entry` remise au composant QR. |
| Génération du QR Code | `apps/frontend/components/dashboard/attendance-entry-qr-card.tsx` | Encodage de l'adresse de pointage dans le QR Code. |
| Écran de saisie du PIN | `apps/frontend/components/attendance/attendance-entry-pin-view.tsx` | Pavé numérique, quatre emplacements masqués, suppression, validation et messages utilisateur. |
| Route frontend de session PIN | `apps/frontend/app/api/auth/attendance-entry-session/route.ts` | Transmission du PIN, création et suppression de la session dédiée. |
| Sélection de la vue `/attendance-entry` | `apps/frontend/app/attendance-entry/page.tsx` | Affichage du PIN sans session et de la vue de pointage pour une session `EMPLOYEE` valide. |
| Validation du PIN | `apps/backend/src/modules/auth/dto/attendance-entry-login.dto.ts` | Expression régulière imposant exactement quatre chiffres. |
| Options des cookies de session | `apps/frontend/lib/auth-session.ts` | Noms, attributs `HttpOnly`, `SameSite`, `Secure`, chemin et durée des cookies. |
| Données du compte employé | `apps/backend/prisma/schema.prisma` | Modèle persistant contenant notamment l'email, le statut actif, le rôle d'accès et les données d'authentification. |
