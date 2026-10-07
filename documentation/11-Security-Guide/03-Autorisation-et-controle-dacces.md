# 1. Présentation

Le contrôle d'accès détermine quelles ressources de l'API et quelles pages frontend peuvent être utilisées par un utilisateur authentifié. Il repose sur le rôle `accessRole` porté par l'utilisateur et sur les guards globaux du module Auth.

# 2. Rôles utilisateurs

| Rôle | Description |
|---|---|
| `ADMIN` | Rôle requis pour les ressources d'administration : employés, plannings, tableau de bord, calendrier, sanctions, historique global, exports et opérations de pointage administratives. |
| `EMPLOYEE` | Rôle utilisé pour les ressources personnelles de pointage : présence du jour, historique personnel, politique de sécurité personnelle et opérations `me/check-in` et `me/check-out`. |

Ces deux valeurs sont définies par l'enum Prisma `AccessRole` et utilisées par les décorateurs `@Roles` des contrôleurs.

# 3. Contrôle d'accès

`JwtAuthGuard` et `RolesGuard` sont enregistrés comme `APP_GUARD` dans `AuthModule`, donc appliqués globalement aux routes NestJS.

- `JwtAuthGuard` laisse passer uniquement les handlers marqués `@Public` sans jeton.
- Pour les autres handlers, il exige `Authorization: Bearer <token>`, vérifie le JWT et place l'employé actif dans la requête.
- `RolesGuard` lit les rôles déclarés par `@Roles` et compare la valeur `accessRole` de l'utilisateur authentifié.
- Une route sans rôle déclaré passe le contrôle de rôle après l'authentification JWT.

Les contrôleurs de santé et les routes de connexion sont marqués `@Public`. Les contrôleurs métier déclarent explicitement `@Roles(AccessRole.ADMIN)` ou `@Roles(AccessRole.EMPLOYEE)`.

# 4. Protection des ressources

Les restrictions observées dans les contrôleurs sont :

| Ressource ou contrôleur | Rôle requis | Fichier |
|---|---|---|
| Employés | `ADMIN` | `apps/backend/src/modules/employees/employees.controller.ts` |
| Tableau de bord | `ADMIN` | `apps/backend/src/modules/dashboard/dashboard.controller.ts` |
| Plannings | `ADMIN` | `apps/backend/src/modules/schedules/schedules.controller.ts` |
| Calendrier | `ADMIN` | `apps/backend/src/modules/calendar/calendar.controller.ts` |
| Sanctions | `ADMIN` | `apps/backend/src/modules/sanctions/sanctions.controller.ts` |
| Résumé, historique global, exports et pointage administrateur | `ADMIN` | `apps/backend/src/modules/attendance/attendance.controller.ts` |
| Pointage et historique personnels | `EMPLOYEE` | `apps/backend/src/modules/attendance/attendance.controller.ts` |

Le frontend applique aussi des contrôles de rôle avant l'affichage de plusieurs pages : l'administrateur est redirigé vers `/`, tandis que l'employé est redirigé vers `/my-attendance` et ne peut pas accéder aux pages d'administration vérifiées (`apps/frontend/app`, `apps/frontend/lib/redirect.ts`).

# 5. Vérification des autorisations

Le processus réellement implémenté est :

```text
Requête HTTP
    |
    v
JwtAuthGuard
    |
    +--> jeton absent/invalide : UnauthorizedException
    |
    v
Utilisateur actif dans request.user
    |
    v
RolesGuard
    |
    +--> rôle absent ou différent : ForbiddenException
    |
    v
Controller autorisé
```

`RolesGuard` ne renvoie une erreur d'autorisation que lorsqu'une route déclare des rôles et que le rôle de l'utilisateur ne correspond pas. Les opérations d'administration enregistrent également l'acteur et son rôle via `AuditLogService` dans les contrôleurs concernés.

# 6. Références

| Élément documenté | Fichiers analysés |
|---|---|
| Rôles disponibles | `apps/backend/prisma/schema.prisma`, `apps/frontend/lib/api.ts` |
| Guards globaux | `apps/backend/src/modules/auth/auth.module.ts`, `apps/backend/src/modules/auth/guards/jwt-auth.guard.ts`, `apps/backend/src/modules/auth/guards/roles.guard.ts` |
| Décorateurs de contrôle | `apps/backend/src/modules/auth/decorators/roles.decorator.ts`, `apps/backend/src/modules/auth/decorators/public.decorator.ts` |
| Restrictions employés | `apps/backend/src/modules/employees/employees.controller.ts` |
| Restrictions pointage | `apps/backend/src/modules/attendance/attendance.controller.ts` |
| Restrictions dashboard, plannings, calendrier et sanctions | `apps/backend/src/modules/dashboard/dashboard.controller.ts`, `apps/backend/src/modules/schedules/schedules.controller.ts`, `apps/backend/src/modules/calendar/calendar.controller.ts`, `apps/backend/src/modules/sanctions/sanctions.controller.ts` |
| Contrôles frontend et redirections | `apps/frontend/app/page.tsx`, `apps/frontend/app/employees/page.tsx`, `apps/frontend/app/schedules/page.tsx`, `apps/frontend/app/my-attendance/page.tsx`, `apps/frontend/lib/redirect.ts` |
| Journalisation de l'acteur | `apps/backend/src/common/audit/audit-log.service.ts` |

---

Document ID : SG-003  
Titre : Autorisation et contrôle d'accès  
Version : 1.0  
Statut : Validé  
Classification : Interne  
Référence : Security Guide  
Projet : Konatech Pointage
