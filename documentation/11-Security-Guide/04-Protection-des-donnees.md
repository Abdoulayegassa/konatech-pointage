# 1. Présentation

La protection des données dans Konatech Pointage repose sur le traitement séparé des secrets d'authentification, la sélection explicite des champs Prisma, la validation des entrées et la conservation des jetons de session dans des cookies protégés côté frontend.

# 2. Données protégées

| Type de donnée | Mécanisme de protection |
|---|---|
| Mot de passe employé | Hachage `scrypt` avec sel aléatoire avant stockage ; vérification par dérivation et comparaison constante. |
| Code PIN de pointage | Hachage `scrypt` ; les anciens PIN en clair sont convertis en hash lors du chemin de migration prévu par le service Auth. |
| Secret JWT | Chargé depuis `JWT_SECRET` par la configuration backend ; il n'est pas inclus dans les réponses utilisateur. |
| Jeton de session frontend | Cookie `httpOnly`, `sameSite: 'lax'`, chemin `/` et `secure` en production. |
| Données publiques d'employé | Sélection Prisma dédiée excluant `passwordHash`, `pinCode` et `pinCodeHash` des réponses publiques. |
| Données de pointage et éléments de vérification | Persistés via Prisma/PostgreSQL ; les photos de vérification peuvent être stockées conditionnellement via Cloudinary et leurs URL sont conservées dans les données de pointage. |
| Données entrantes HTTP | Contrôlées par les DTO et le `ValidationPipe` global avant traitement par les services. |

# 3. Protection des informations sensibles

Le fichier `password.util.ts` implémente `hashSecret` et `verifySecret` avec `scrypt`, un sel généré par `randomBytes`, une clé dérivée de 64 octets et `timingSafeEqual`. Les fonctions `hashPassword`/`verifyPassword` et `hashPinCode`/`verifyPinCode` réutilisent ce mécanisme.

`AuthService` sélectionne temporairement les hashes nécessaires à la vérification, puis retire `passwordHash`, `pinCode` et `pinCodeHash` avant de construire la réponse de connexion. `publicEmployeeSelect` n'expose pas ces champs dans les lectures publiques d'employé.

Les jetons JWT sont transmis au frontend par la réponse de connexion puis conservés dans les cookies `konatech_session` ou `konatech_attendance_entry_session`. Les cookies sont configurés par `buildSessionCookieOptions`.

Les secrets de configuration sont lus depuis les variables d'environnement. La validation NestJS exige notamment `JWT_SECRET` et `DATABASE_URL`; en production, elle rejette un secret JWT identifié comme local ou de test (`apps/backend/src/app.module.ts`).

# 4. Validation des données

Le backend active un `ValidationPipe` global avec `whitelist`, `forbidNonWhitelisted`, `transform` et la conversion implicite (`apps/backend/src/main.ts`). Les DTO appliquent les contraintes propres aux champs, notamment :

- adresse e-mail et longueur minimale du mot de passe dans `LoginDto` ;
- PIN composé exactement de quatre chiffres dans `AttendanceEntryLoginDto` ;
- contraintes de type, d'énumération et de format dans les autres DTO métier.

Les URLs frontend et API sont également validées par le code Next.js en production : présence, origine autorisée, HTTPS et suffixe `/api/v1` pour l'URL d'API (`apps/frontend/lib/api.ts`).

# 5. Sécurisation du stockage

Prisma utilise PostgreSQL via `DATABASE_URL` et les sélections Prisma limitent les champs renvoyés par les services. Les migrations définissent la structure persistée, mais aucun mécanisme applicatif distinct de chiffrement des colonnes ou de chiffrement PostgreSQL n'est présent dans les fichiers analysés.

Le stockage Cloudinary des photos de vérification est conditionnel aux trois variables d'identification Cloudinary. Le service utilise des URL sécurisées renvoyées par Cloudinary lorsqu'un téléversement est effectué ; aucun mécanisme local de stockage des fichiers photo n'est défini (`apps/backend/src/modules/attendance/attendance-photo-storage.service.ts`).

# 6. Références

| Élément documenté | Fichiers analysés |
|---|---|
| Hachage des secrets, mots de passe et PIN | `apps/backend/src/common/security/password.util.ts` |
| Vérification et filtrage des données d'authentification | `apps/backend/src/modules/auth/auth.service.ts` |
| Sélections Prisma publiques | `apps/backend/src/common/prisma/selects.ts` |
| Cookies de session | `apps/frontend/lib/auth-session.ts`, `apps/frontend/app/api/auth/login/route.ts` |
| Validation HTTP globale | `apps/backend/src/main.ts` |
| Validation de configuration et secrets | `apps/backend/src/app.module.ts`, `apps/backend/.env.example`, `.env.production.example` |
| Validation des URL frontend/API | `apps/frontend/lib/api.ts` |
| Schéma de persistance | `apps/backend/prisma/schema.prisma`, `apps/backend/prisma/migrations/` |
| Stockage photo conditionnel | `apps/backend/src/modules/attendance/attendance-photo-storage.service.ts` |

---

Document ID : SG-004  
Titre : Protection des données  
Version : 1.0  
Statut : Validé  
Classification : Interne  
Référence : Security Guide  
Projet : Konatech Pointage
