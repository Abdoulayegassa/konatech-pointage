# 1. Présentation

L'authentification identifie les employés et contrôle l'accès aux ressources de l'API Konatech Pointage. Le backend implémente une connexion par adresse e-mail et mot de passe, ainsi qu'une connexion dédiée à la borne de pointage par code PIN.

# 2. Architecture

Le flux observé est le suivant :

```text
Frontend Next.js
      |
      v
POST /api/v1/auth/login
      |
      v
AuthService -> Prisma -> Employee
      |
      v
JWT accessToken
      |
      v
Cookie de session frontend
      |
      v
Authorization: Bearer <token>
      |
      v
JwtAuthGuard -> utilisateur actif
```

Le frontend appelle le backend par ses route handlers, puis stocke le jeton dans un cookie HTTP-only. Les connexions de borne utilisent un cookie distinct (`konatech_attendance_entry_session`).

# 3. Processus de connexion

## Connexion standard

1. Le frontend transmet `email` et `password` à `POST /auth/login`.
2. `LoginDto` valide l'adresse e-mail et impose une longueur minimale de huit caractères pour le mot de passe.
3. `AuthService` recherche l'employé par e-mail et vérifie que son compte est actif.
4. Le mot de passe est vérifié avec le hash stocké.
5. Le service renvoie un jeton d'accès JWT, son type, sa durée et les données publiques de l'utilisateur.
6. Le route handler frontend écrit le jeton dans le cookie `konatech_session`.

## Connexion de borne de pointage

1. Le frontend transmet un code PIN de quatre chiffres à `POST /auth/attendance-entry/login`.
2. `AttendanceEntryLoginDto` valide le format du PIN.
3. Le service recherche les employés actifs dont le rôle est `EMPLOYEE` et vérifie le hash du PIN.
4. Un ancien PIN en clair peut être migré vers un hash lors d'une connexion réussie.
5. Le jeton est renvoyé avec la durée dédiée à la borne et stocké dans `konatech_attendance_entry_session`.

Les deux routes de connexion sont marquées publiques. La route `GET /auth/me` n'est pas publique et renvoie l'utilisateur placé dans la requête après validation du jeton.

# 4. Jetons d'authentification

Les jetons sont signés et vérifiés avec `JWT_SECRET`. Leur charge utile contient `sub` avec l'identifiant de l'employé et `email`. La durée standard provient de `JWT_EXPIRES_IN`; la durée de la borne provient de `ATTENDANCE_ENTRY_JWT_EXPIRES_IN` ou de sa valeur par défaut définie par le module Auth.

La réponse de connexion contient les champs `accessToken`, `tokenType` égal à `Bearer`, `expiresIn` et `user`. Les champs sensibles `passwordHash`, `pinCode` et `pinCodeHash` sont retirés de l'objet utilisateur renvoyé.

Le frontend convertit `expiresIn` en durée de cookie. Les cookies sont `httpOnly`, `sameSite: 'lax'`, associés au chemin `/`, et leur attribut `secure` dépend de `NODE_ENV` (`apps/frontend/lib/auth-session.ts`). Aucun endpoint de renouvellement de jeton n'est présent dans le contrôleur Auth analysé.

# 5. Protection des routes

`JwtAuthGuard` est enregistré comme guard global par `AuthModule`. Sauf présence du décorateur `@Public`, il exige un en-tête `Authorization` utilisant le schéma `Bearer`. Le jeton est vérifié, puis l'employé correspondant est recherché ; un jeton invalide, expiré ou associé à un compte inactif provoque une réponse non autorisée.

`RolesGuard` est également global. Lorsqu'une route déclare des rôles avec `@Roles`, le rôle `accessRole` de l'utilisateur authentifié doit correspondre. Sinon, le guard lève une erreur d'accès insuffisant.

Les mots de passe et PIN sont traités par les fonctions de hachage du module `password.util.ts`; ils ne sont pas inclus dans les réponses d'authentification.

# 6. Références

| Élément documenté | Fichiers analysés |
|---|---|
| Routes de connexion et utilisateur courant | `apps/backend/src/modules/auth/auth.controller.ts` |
| Vérification des identifiants, création et validation JWT | `apps/backend/src/modules/auth/auth.service.ts` |
| DTO et validations de connexion | `apps/backend/src/modules/auth/dto/login.dto.ts`, `apps/backend/src/modules/auth/dto/attendance-entry-login.dto.ts` |
| Guards globaux et contrôle des rôles | `apps/backend/src/modules/auth/auth.module.ts`, `apps/backend/src/modules/auth/guards/jwt-auth.guard.ts`, `apps/backend/src/modules/auth/guards/roles.guard.ts` |
| Décorateurs publics, rôles et utilisateur courant | `apps/backend/src/modules/auth/decorators/public.decorator.ts`, `apps/backend/src/modules/auth/decorators/roles.decorator.ts`, `apps/backend/src/modules/auth/decorators/current-user.decorator.ts` |
| Signature et vérification des jetons | `apps/backend/src/common/security/jwt.util.ts` |
| Hachage des mots de passe et PIN | `apps/backend/src/common/security/password.util.ts` |
| Session frontend et cookies de connexion | `apps/frontend/app/api/auth/login/route.ts`, `apps/frontend/lib/auth-session.ts` |
| Configuration JWT | `apps/backend/src/app.module.ts`, `apps/backend/.env.example`, `.env.production.example` |

---

Document ID : SG-002  
Titre : Authentification  
Version : 1.0  
Statut : Validé  
Classification : Interne  
Référence : Security Guide  
Projet : Konatech Pointage
