# 1. Présentation

Le Security Guide décrit les mécanismes de sécurité effectivement présents dans Konatech Pointage. Il couvre l'authentification backend, le contrôle d'accès, la validation des requêtes, les protections HTTP et les contrôles de sécurité liés au pointage.

# 2. Objectifs

Les objectifs observables dans le projet sont :

- authentifier les utilisateurs avec des jetons JWT ;
- appliquer un contrôle d'accès par rôles sur les routes concernées ;
- valider les entrées via les DTO et le `ValidationPipe` global ;
- limiter les requêtes générales et les tentatives de connexion ;
- appliquer Helmet, CORS configuré et une limite de taille des corps HTTP ;
- conditionner les contrôles de sécurité du pointage à la configuration dédiée ;
- protéger les secrets et URL par la validation de configuration en production.

# 3. Périmètre

Les mécanismes documentés concernent :

| Composant | Éléments de sécurité observés |
|---|---|
| API NestJS | Préfixe `/api/v1`, JWT, guards, rôles, validation globale, Helmet, CORS et limitation de débit. |
| Authentification | Connexion standard et connexion de borne de pointage, hachage des mots de passe et des PIN. |
| Frontend Next.js | Route handlers proxy, session par cookie et validation des URL d'API en production. |
| Pointage | Politique conditionnelle de localisation et stockage photo Cloudinary conditionnel. |
| Configuration | Validation des variables d'environnement, du secret JWT et des URL de production. |
| Données | Accès applicatif via Prisma et PostgreSQL ; le dépôt ne définit pas de mécanisme distinct de chiffrement des données. |

# 4. Architecture générale de sécurité

Le flux de protection observé est :

```text
Client
  |
  v
Frontend / route handler proxy
  |
  v
API NestJS (/api/v1)
  |
  +--> ValidationPipe global
  +--> Guards JWT et rôles
  +--> Limitation de débit
  +--> Controller / Service
  |
  v
Prisma / PostgreSQL
```

Le backend active Helmet, CORS avec l'origine `FRONTEND_URL`, une limite de corps JSON et des limites de débit globales et de connexion (`apps/backend/src/main.ts`, `apps/backend/src/app.module.ts`). Les routes protégées utilisent `JwtAuthGuard` et `RolesGuard`; les décorateurs `@Public`, `@Roles` et `@CurrentUser` sont présents dans le module Auth. Le frontend utilise des cookies de session dont l'attribut `secure` dépend de `NODE_ENV` (`apps/frontend/lib/auth-session.ts`).

La politique de sécurité du pointage est désactivée par défaut dans la configuration et peut vérifier les coordonnées, les rayons et la précision GPS lorsqu'elle est activée. Le stockage Cloudinary des preuves photo est conditionnel à la présence de ses identifiants (`apps/backend/src/modules/attendance/attendance-security-policy.service.ts`, `apps/backend/src/modules/attendance/attendance-photo-storage.service.ts`).

# 5. Organisation du guide

Le dépôt contient actuellement ce premier chapitre dans `documentation/11-Security-Guide/`. Aucun autre chapitre du Security Guide n'était présent lors de l'analyse.

# 6. Références

| Élément documenté | Fichiers analysés |
|---|---|
| Bootstrap HTTP, CORS, Helmet et validation | `apps/backend/src/main.ts` |
| Validation de configuration et limitation de débit | `apps/backend/src/app.module.ts` |
| Authentification et contrôleurs | `apps/backend/src/modules/auth/auth.module.ts`, `apps/backend/src/modules/auth/auth.controller.ts`, `apps/backend/src/modules/auth/auth.service.ts` |
| Guards et rôles | `apps/backend/src/modules/auth/guards/jwt-auth.guard.ts`, `apps/backend/src/modules/auth/guards/roles.guard.ts`, `apps/backend/src/modules/auth/decorators/roles.decorator.ts`, `apps/backend/src/modules/auth/decorators/public.decorator.ts` |
| Hachage des identifiants | `apps/backend/src/common/security/password.util.ts` |
| Session frontend et proxy | `apps/frontend/lib/auth-session.ts`, `apps/frontend/lib/api-route.ts`, `apps/frontend/lib/api.ts` |
| Sécurité conditionnelle du pointage | `apps/backend/src/modules/attendance/attendance-security-policy.service.ts`, `apps/backend/src/modules/attendance/attendance-security.service.ts` |
| Stockage photo conditionnel | `apps/backend/src/modules/attendance/attendance-photo-storage.service.ts` |
| Configuration et contrôles documentés | `README.md`, `.env.production.example`, `documentation/03-SMOD/01-Installation-et-Mise-en-service.md` |

---

Document ID : SG-001  
Titre : Présentation  
Version : 1.0  
Statut : Validé  
Classification : Interne  
Référence : Security Guide  
Projet : Konatech Pointage
