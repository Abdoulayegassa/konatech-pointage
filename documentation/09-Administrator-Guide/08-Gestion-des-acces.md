Document ID : AG-008  
Titre : Gestion des accès  
Version : 1.0  
Statut : Validé  
Classification : Interne  
Référence : Administrator Guide  
Projet : Konatech Pointage

# 1. Présentation

La gestion des accès repose sur un rôle d’accès porté par le compte employé, un jeton JWT et deux guards NestJS appliqués globalement. Les contrôleurs déclarent ensuite le rôle requis pour chaque ressource.

# 2. Rôles disponibles

| Rôle | Description |
|---|---|
| `ADMIN` | Rôle requis pour les vues et opérations d’administration exposées par les contrôleurs marqués `@Roles(AccessRole.ADMIN)`. |
| `EMPLOYEE` | Rôle utilisé pour les routes de pointage et d’historique propres à l’employé, marquées `@Roles(AccessRole.EMPLOYEE)`. |

# 3. Contrôle des accès

Le `JwtAuthGuard` est enregistré comme `APP_GUARD`. Sauf route marquée `@Public()`, il exige l’en-tête `Authorization` au format `Bearer <jeton>`, vérifie le JWT et recharge le compte correspondant. Le compte doit exister et être actif.

Le `RolesGuard`, également enregistré comme `APP_GUARD`, lit les métadonnées produites par le décorateur `@Roles`. Une route sans rôle requis est autorisée après authentification; une route avec rôle requis compare ce rôle à `user.accessRole`.

Les contrôleurs administratifs du dashboard, des employés, des plannings, de l’historique et des exports, du calendrier et des sanctions déclarent le rôle `ADMIN`. Les routes de pointage et d’historique personnels déclarent le rôle `EMPLOYEE`.

# 4. Restrictions

- Une route non publique ne peut pas être appelée sans jeton Bearer.
- Un jeton invalide ou expiré est refusé.
- Un compte supprimé de la base ou devenu inactif est refusé lors de la validation du jeton.
- Un compte `EMPLOYEE` ne satisfait pas une route qui exige `ADMIN`, et inversement.
- La création et la modification d’un compte permettent de sélectionner uniquement les valeurs d’énumération `ADMIN` ou `EMPLOYEE` pour `accessRole`.
- Le parcours d’entrée par PIN recherche uniquement les comptes actifs dont le rôle d’accès est `EMPLOYEE`.

# 5. Authentification

La connexion principale utilise l’e-mail et le mot de passe via `POST /auth/login`. Une connexion spécifique au pointage utilise un code PIN de quatre chiffres via `POST /auth/attendance-entry/login`. Dans les deux cas, le backend renvoie un jeton de type `Bearer` contenant l’identité du compte et une durée d’expiration.

Le frontend stocke le jeton de connexion dans le cookie de session et l’utilise pour les appels API. La route `/auth/me` renvoie l’utilisateur authentifié. Le secret JWT et les durées d’expiration sont lus dans la configuration backend par `JWT_SECRET`, `JWT_EXPIRES_IN` et `ATTENDANCE_ENTRY_JWT_EXPIRES_IN`.

# 6. Cas d'accès refusé

| Situation | Comportement observé |
|---|---|
| En-tête `Authorization` absent | Réponse `401 Unauthorized` avec « Missing Authorization header. ». |
| Schéma différent de `Bearer` ou jeton absent | Réponse `401 Unauthorized` avec « Authorization header must use Bearer. ». |
| Jeton invalide ou expiré | Réponse `401 Unauthorized` avec « Invalid or expired token. ». |
| Compte inexistant ou inactif | Réponse `401 Unauthorized` avec « User is no longer active. ». |
| Rôle insuffisant | Réponse `403 Forbidden` avec « Insufficient permissions for this resource. ». |
| Identifiants de connexion invalides | Réponse `401 Unauthorized` depuis le service d’authentification. |

Dans le frontend, les pages administratives redirigent un utilisateur non `ADMIN` vers `/my-attendance`; après connexion, le rôle `ADMIN` est redirigé vers `/` et le rôle `EMPLOYEE` vers `/my-attendance` lorsqu’aucune cible interne n’est demandée.

# 7. Limitations

- Le dépôt ne définit que les rôles `ADMIN` et `EMPLOYEE`; aucun autre niveau d’accès n’est déclaré dans `AccessRole` ou les décorateurs observés.
- Les contrôles d’autorisation sont fondés sur le rôle global du compte; aucun droit distinct par action n’est déclaré dans `RolesGuard`.
- Les routes publiques sont limitées aux méthodes explicitement marquées `@Public`, notamment les connexions et l’accès fixe de pointage.

# 8. Références

| Élément documenté | Fichier source |
|---|---|
| Rôles et contrôleurs d’authentification | `apps/backend/src/modules/auth/auth.controller.ts`, `apps/backend/src/modules/auth/auth.service.ts` |
| Guards globaux | `apps/backend/src/modules/auth/auth.module.ts`, `apps/backend/src/modules/auth/guards/jwt-auth.guard.ts`, `apps/backend/src/modules/auth/guards/roles.guard.ts` |
| Décorateurs `@Roles` et `@Public` | `apps/backend/src/modules/auth/decorators/roles.decorator.ts`, `apps/backend/src/modules/auth/decorators/public.decorator.ts` |
| Validation des identifiants | `apps/backend/src/modules/auth/dto/login.dto.ts`, `apps/backend/src/modules/auth/dto/attendance-entry-login.dto.ts` |
| Rôles Prisma et compte utilisateur | `apps/backend/prisma/schema.prisma`, `apps/backend/src/common/prisma/selects.ts` |
| Ressources administrateur | `apps/backend/src/modules/dashboard/dashboard.controller.ts`, `apps/backend/src/modules/employees/employees.controller.ts`, `apps/backend/src/modules/schedules/schedules.controller.ts`, `apps/backend/src/modules/attendance/attendance.controller.ts`, `apps/backend/src/modules/calendar/calendar.controller.ts`, `apps/backend/src/modules/sanctions/sanctions.controller.ts` |
| Redirections frontend par rôle | `apps/frontend/lib/redirect.ts`, `apps/frontend/app/page.tsx`, `apps/frontend/app/my-attendance/page.tsx` |
| Cookie de session et appel de connexion | `apps/frontend/app/api/auth/login/route.ts`, `apps/frontend/lib/auth-session.ts` |
