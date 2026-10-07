Document ID : EUG-006

Titre : Gestion du profil

Version : 1.0

Statut : Validé

Classification : Interne

Référence : Employee User Guide

Projet : Konatech Pointage

# 1. Présentation

Konatech Pointage utilise les informations du compte employé pour identifier l'utilisateur dans l'espace personnel et pendant le parcours de pointage. Le dépôt ne contient pas de page de profil dédiée à l'employé.

Les informations visibles sont présentées en lecture seule dans les écrans fonctionnels. Les routes de création, de consultation administrative et de modification des comptes employés appartiennent au module `employees` du backend et sont protégées par le rôle applicatif `ADMIN`.

# 2. Accès au profil

Il n'existe pas de route frontend `/profile` ou `/profil`, ni de navigation employé ouvrant une fiche de profil. L'employé retrouve des éléments de son identité dans deux parcours existants :

- après une connexion par compte, `/my-attendance` affiche le prénom dans le message d'accueil « Bonjour » ;
- après la validation du PIN sur `/attendance-entry`, l'écran confirme brièvement le nom complet et la fonction, puis la vue de pointage affiche les initiales et utilise le nom complet dans ses récapitulatifs.

Ces affichages proviennent de l'utilisateur authentifié. Le frontend obtient cet utilisateur avec `GET /api/v1/auth/me`, à partir du JWT de la session de compte ou de la session PIN.

# 3. Informations du profil

| Information | Visible | Modifiable |
|---|---|---|
| Prénom | Oui. Il apparaît dans l'accueil de `/my-attendance` et dans le nom complet du parcours PIN. | Non depuis une interface employé. |
| Nom | Oui. Il apparaît avec le prénom après la validation du PIN, dans le libellé accessible des initiales et dans le récapitulatif du pointage. | Non depuis une interface employé. |
| Initiales | Oui. Elles sont calculées à partir du premier caractère du prénom et du nom dans la vue `/attendance-entry`. | Non. Elles sont calculées par le frontend et ne constituent pas un champ enregistré. |
| Fonction | Oui. Le champ `role` du compte sert de détail dans la confirmation affichée après la validation du PIN. | Non depuis une interface employé. |

Le modèle `Employee` contient d'autres données de compte utilisées par le système. Les écrans employé analysés ne les présentent pas sous la forme d'une fiche de profil.

# 4. Actions disponibles

| Action | Disponible | Description |
|---|---|---|
| Consulter le prénom dans l'espace personnel | Oui | Le message d'accueil de `/my-attendance` affiche `user.firstName`. |
| Vérifier l'identité après la saisie du PIN | Oui | La confirmation affiche le nom complet et la fonction avant l'ouverture de la vue de pointage. |
| Vérifier l'identité dans le récapitulatif du pointage | Oui | Les écrans de validation et de succès affichent le nom complet de l'employé identifié par la session PIN. |
| Se déconnecter de l'espace personnel | Oui | Le bouton « Se déconnecter » efface la session de compte et la session PIN, puis redirige vers `/login`. |
| Terminer l'identification PIN après un pointage | Oui | Le bouton « Nouveau pointage » efface la session PIN et revient à la saisie du PIN sur `/attendance-entry`. |

# 5. Limitations

Les limites suivantes sont directement établies par les routes, composants et contrôleurs présents :

- aucun écran employé ne regroupe les informations du compte dans une fiche de profil ;
- aucun formulaire employé ne modifie le prénom, le nom, l'adresse électronique, la fonction, le département ou le planning ;
- aucun endpoint `auth` ne permet à l'employé de modifier l'objet renvoyé par `GET /api/v1/auth/me` ;
- les endpoints `PATCH` du contrôleur `employees` sont protégés au niveau du contrôleur par le rôle `ADMIN` ;
- aucun contrôle employé ne modifie le mot de passe ou le PIN ; ces champs font partie du DTO administratif de mise à jour d'un employé ;
- le modèle `Employee` ne contient pas de champ d'avatar ou de préférences ;
- le cercle affiché dans `/attendance-entry` contient des initiales générées et non une image de profil enregistrée.

# 6. Cas particuliers

| Situation | Comportement observé | Sources |
|---|---|---|
| Session de compte absente | L'accès à `/my-attendance` redirige vers `/login`. | `apps/frontend/middleware.ts`, `apps/frontend/lib/auth.ts` |
| Session de compte invalide ou expirée | La lecture de l'utilisateur courant échoue et l'espace personnel redirige vers `/login`. | `apps/frontend/lib/auth.ts`, `apps/backend/src/modules/auth/auth.service.ts` |
| Session PIN absente | `/attendance-entry` affiche la saisie du PIN sans afficher l'identité d'un employé. | `apps/frontend/app/attendance-entry/page.tsx` |
| Session PIN invalide, expirée ou associée à un autre rôle | La page efface la session dédiée et revient à l'écran PIN. | `apps/frontend/app/attendance-entry/page.tsx`, `apps/frontend/components/attendance/attendance-entry-pin-view.tsx` |
| Compte devenu inactif | Le backend refuse l'utilisateur issu du jeton avec `User is no longer active.` ; les écrans reviennent ensuite à leur accès d'authentification respectif. | `apps/backend/src/modules/auth/auth.service.ts`, `apps/frontend/lib/auth.ts`, `apps/frontend/app/attendance-entry/page.tsx` |
| Employé ouvrant `/employees` | La page vérifie le rôle et redirige un utilisateur non `ADMIN` vers `/my-attendance`. | `apps/frontend/app/employees/page.tsx` |
| Employé appelant une route de gestion des comptes | Le garde de rôles refuse l'accès, car le contrôleur `employees` exige `ADMIN`. | `apps/backend/src/modules/employees/employees.controller.ts`, `apps/backend/src/modules/auth/guards/roles.guard.ts` |
| Échec de fermeture de la session PIN après un pointage | Le composant affiche « Impossible de fermer cette session PIN. ». | `apps/frontend/components/attendance/attendance-entry-session-button.tsx` |

# 7. Références

| Information documentée | Fichier source | Preuve observée |
|---|---|---|
| Absence de page de profil dans les routes frontend | `apps/frontend/app/` | L'arborescence des pages comporte les routes fonctionnelles, sans page `profile` ou `profil`. |
| Prénom dans l'espace personnel | `apps/frontend/app/my-attendance/page.tsx` | Rend « Bonjour » suivi de `user.firstName`. |
| Confirmation de l'identité par PIN | `apps/frontend/components/attendance/attendance-entry-pin-view.tsx` | Construit et affiche le nom complet ainsi que le détail issu notamment de `role`. |
| Initiales et nom de la vue de pointage | `apps/frontend/components/attendance/fixed-attendance-entry-view.tsx` | Calcule les initiales et transmet le nom complet au composant d'actions. |
| Nom dans le récapitulatif | `apps/frontend/components/attendance/employee-attendance-actions.tsx` | Affiche l'employé aux étapes de validation et de succès. |
| Lecture de l'utilisateur courant | `apps/backend/src/modules/auth/auth.controller.ts` | Expose `GET auth/me` pour retourner l'utilisateur authentifié. |
| Données publiques de l'utilisateur | `apps/backend/src/common/prisma/selects.ts` | Définit les champs renvoyés par `publicEmployeeSelect` sans les secrets d'authentification. |
| Type de l'utilisateur authentifié | `apps/backend/src/modules/auth/interfaces/authenticated-user.interface.ts` | Associe l'utilisateur authentifié à la sélection publique Prisma. |
| Validation du jeton et du compte actif | `apps/backend/src/modules/auth/auth.service.ts` | Vérifie le JWT, recharge l'employé et contrôle son état actif. |
| Chargement frontend de la session | `apps/frontend/lib/auth.ts`, `apps/frontend/lib/api.ts` | Lit le cookie de compte et appelle `/auth/me`. |
| Champs persistants du compte | `apps/backend/prisma/schema.prisma` | Définit prénom, nom, email, fonction, rôle d'accès, département, planning et secrets d'authentification. |
| Mise à jour administrative | `apps/backend/src/modules/employees/employees.controller.ts` | Place le rôle `ADMIN` sur l'ensemble du contrôleur et expose les opérations de modification. |
| Données administrativement modifiables | `apps/backend/src/modules/employees/dto/update-employee.dto.ts` | Définit les champs acceptés par la mise à jour administrative. |
| Protection de la gestion frontend | `apps/frontend/app/employees/page.tsx` | Redirige un utilisateur non administrateur vers `/my-attendance`. |
| Contrôle du rôle backend | `apps/backend/src/modules/auth/guards/roles.guard.ts` | Refuse une ressource lorsque le rôle ne figure pas dans les rôles requis. |
| Déconnexion de compte | `apps/frontend/components/auth/logout-form.tsx`, `apps/frontend/app/api/auth/logout/route.ts` | Affiche le bouton, efface les deux cookies et redirige vers `/login`. |
| Fin de session PIN | `apps/frontend/components/attendance/attendance-entry-session-button.tsx`, `apps/frontend/app/api/auth/attendance-entry-session/route.ts` | Le bouton « Nouveau pointage » appelle la suppression du cookie PIN. |
