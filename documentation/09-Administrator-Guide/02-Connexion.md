Document ID : AG-002

Titre : Connexion

Version : 1.0

Statut : Validé

Classification : Interne

Référence : Administrator Guide

Projet : Konatech Pointage

# 1. Présentation

La connexion administrateur identifie un compte actif portant le rôle applicatif `ADMIN` avant l'accès au tableau de bord et aux modules de gestion. Le parcours utilise la page frontend `/login`, l'adresse électronique, le mot de passe et un jeton JWT émis par le backend.

# 2. Prérequis

Les prérequis établis par le code sont :

- disposer d'un compte `Employee` existant et actif ;
- disposer d'une adresse électronique et d'un mot de passe associés à ce compte ;
- disposer du rôle d'accès `ADMIN` pour ouvrir les pages administratives ;
- pouvoir joindre l'API backend et sa base PostgreSQL pour vérifier le compte.

Le DTO de connexion valide le format de l'adresse électronique et exige un mot de passe d'au moins huit caractères. Le compte est ensuite recherché par email et son mot de passe est comparé au condensat conservé.

# 3. Procédure de connexion

1. Ouvrir `/login`.
2. Saisir l'adresse électronique dans le champ « Email ».
3. Saisir le mot de passe dans le champ « Mot de passe ».
4. Activer « Se connecter ».
5. Attendre la vérification de la demande ; pendant celle-ci, le bouton affiche « Connexion en cours... ».
6. Après une réponse valide pour un compte `ADMIN`, accéder au tableau de bord `/`.

La page `/login` vérifie également si une session existe déjà. Dans ce cas, elle redirige l'utilisateur selon son rôle sans afficher de nouveau formulaire.

# 4. Vérification des identifiants

Le formulaire envoie un objet JSON à `POST /api/auth/login`. La route Next.js transmet cette demande à `POST /api/v1/auth/login`.

Le `AuthService` effectue les contrôles suivants :

1. recherche de l'employé avec l'adresse électronique fournie ;
2. vérification que le compte existe et que `isActive` est vrai ;
3. comparaison du mot de passe saisi avec `passwordHash` ;
4. émission d'un JWT contenant l'identifiant et l'email du compte lorsque les contrôles réussissent.

Le backend ne renvoie pas `passwordHash`, le PIN ou son condensat dans l'objet utilisateur public. Le rôle d'accès retourné est utilisé par le frontend pour choisir la destination.

# 5. Gestion de la session

Après une connexion réussie, la route `/api/auth/login` :

- supprime une éventuelle session PIN `konatech_attendance_entry_session` ;
- place le JWT dans le cookie HTTP-only `konatech_session` ;
- utilise `SameSite=Lax`, le chemin `/` et `Secure` lorsque `NODE_ENV` vaut `production` ;
- calcule la durée du cookie à partir de `expiresIn` renvoyé par le backend.

Le backend utilise `JWT_EXPIRES_IN` pour la durée du jeton de compte et prend `1d` comme valeur par défaut lorsque cette variable n'est pas définie. Les routes protégées reçoivent le jeton dans l'en-tête `Authorization` avec le schéma `Bearer` côté serveur frontend.

Le middleware vérifie la présence du cookie pour `/` et les autres pages protégées. Le `JwtAuthGuard` vérifie ensuite le schéma `Bearer`, la signature et l'expiration du JWT, puis recharge le compte actif.

Le bouton « Se déconnecter » appelle `POST /api/auth/logout`, efface les cookies de compte et de PIN et redirige vers `/login`.

# 6. Cas particuliers

| Situation | Comportement observé | Sources |
|---|---|---|
| Email ou mot de passe incorrect | Le backend renvoie `Invalid credentials.` ; le formulaire affiche ce message et reste sur `/login`. | `apps/backend/src/modules/auth/auth.service.ts`, `apps/frontend/app/api/auth/login/route.ts`, `apps/frontend/components/auth/login-form.tsx` |
| Compte inexistant ou inactif | Le backend utilise également `Invalid credentials.` ; aucun JWT n'est créé. | `apps/backend/src/modules/auth/auth.service.ts` |
| Email mal formé ou mot de passe de moins de huit caractères | La validation globale rejette le DTO avant la vérification du compte ; le formulaire affiche le message de validation transmis. | `apps/backend/src/main.ts`, `apps/backend/src/modules/auth/dto/login.dto.ts`, `apps/frontend/app/api/auth/login/route.ts` |
| Backend inaccessible pendant la connexion | La route frontend renvoie « Connexion impossible. » et le formulaire reste affiché. | `apps/frontend/app/api/auth/login/route.ts`, `apps/frontend/components/auth/login-form.tsx` |
| Compte `EMPLOYEE` connecté | La destination par défaut est `/my-attendance`, pas le tableau de bord administratif. | `apps/frontend/lib/redirect.ts`, `apps/frontend/app/login/page.tsx` |
| Compte non `ADMIN` ouvrant une page administrative | Les pages administratives redirigent vers `/my-attendance`; les contrôleurs backend refusent également un rôle non requis. | `apps/frontend/app/page.tsx`, `apps/frontend/app/employees/page.tsx`, `apps/frontend/app/schedules/page.tsx`, `apps/backend/src/modules/auth/guards/roles.guard.ts` |
| Cookie absent sur `/` | Le middleware redirige vers `/login`. | `apps/frontend/middleware.ts` |
| JWT invalide ou expiré | Le backend renvoie `Invalid or expired token.` ; la récupération de l'utilisateur frontend échoue et l'accès revient à `/login`. | `apps/backend/src/modules/auth/auth.service.ts`, `apps/frontend/lib/auth.ts` |
| Compte devenu inactif après émission du JWT | Le backend renvoie `User is no longer active.` lors de la lecture du jeton. | `apps/backend/src/modules/auth/auth.service.ts` |

# 7. Flux de connexion

```text
Administrateur
      |
      v
 /login
      |
      v
Email + mot de passe
      |
      v
Validation du LoginDto
      |
      v
POST /api/v1/auth/login
      |
      v
Compte actif + vérification du mot de passe
      |
      v
JWT signé
      |
      v
Cookie konatech_session
      |
      v
Garde JWT + contrôle du rôle ADMIN
      |
      v
Tableau de bord /
```

# 8. Références

| Élément documenté | Fichier source | Preuve observée |
|---|---|---|
| Page de connexion | `apps/frontend/app/login/page.tsx` | Rend `/login`, vérifie une session existante et applique la redirection par rôle. |
| Champs et bouton | `apps/frontend/components/auth/login-form.tsx` | Champs `email` et `password`, bouton « Se connecter » et état « Connexion en cours... ». |
| Proxy frontend de connexion | `apps/frontend/app/api/auth/login/route.ts` | Transmet `/auth/login`, crée `konatech_session` et renvoie la destination. |
| Contrôleur backend | `apps/backend/src/modules/auth/auth.controller.ts` | Déclare `POST auth/login` comme endpoint public. |
| Vérification des identifiants | `apps/backend/src/modules/auth/auth.service.ts` | Recherche email, contrôle actif, vérification du mot de passe et émission du JWT. |
| Contraintes de la requête | `apps/backend/src/modules/auth/dto/login.dto.ts` | `IsEmail`, `IsString` et `MinLength(8)`. |
| Création et validation du JWT | `apps/backend/src/common/security/jwt.util.ts` | Signe le jeton et vérifie signature et expiration. |
| Garde JWT | `apps/backend/src/modules/auth/guards/jwt-auth.guard.ts` | Exige l'en-tête `Bearer` sur les routes protégées. |
| Garde de rôles | `apps/backend/src/modules/auth/guards/roles.guard.ts` | Compare le rôle de l'utilisateur aux rôles requis. |
| Enregistrement global des gardes | `apps/backend/src/modules/auth/auth.module.ts` | Installe les gardes JWT et rôles comme `APP_GUARD`. |
| Redirection selon le rôle | `apps/frontend/lib/redirect.ts` | Associe `ADMIN` à `/` et les autres rôles à `/my-attendance`. |
| Protection des pages | `apps/frontend/middleware.ts` | Redirige les requêtes sans cookie de compte vers `/login`. |
| Lecture de la session | `apps/frontend/lib/auth.ts`, `apps/frontend/lib/api.ts` | Lit `konatech_session` et appelle `GET /auth/me`. |
| Attributs du cookie | `apps/frontend/lib/auth-session.ts` | Définit HTTP-only, SameSite, Secure, chemin et durée. |
| Déconnexion | `apps/frontend/components/auth/logout-form.tsx`, `apps/frontend/app/api/auth/logout/route.ts` | Efface les deux sessions et redirige vers `/login`. |
| Destination du tableau de bord | `apps/frontend/app/page.tsx`, `apps/backend/src/modules/dashboard/dashboard.controller.ts` | Exige `ADMIN` avant le chargement de la vue et des données du dashboard. |
| Modèle de compte | `apps/backend/prisma/schema.prisma` | Définit email, `passwordHash`, `accessRole` et `isActive` dans `Employee`. |
