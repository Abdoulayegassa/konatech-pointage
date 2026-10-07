# 1. Présentation

La sécurité des communications couvre les échanges entre le navigateur, le frontend Next.js, l'API NestJS, PostgreSQL et le stockage Cloudinary conditionnel. Le dépôt configure des contrôles d'origine, un proxy applicatif, des cookies de session et des validations d'URL.

# 2. Communications entre composants

Les échanges observés sont :

```text
Navigateur
   |
   v
Frontend Next.js /api/*
   |
   v
Backend NestJS /api/v1
   |
   +--> PostgreSQL via Prisma
   |
   +--> Cloudinary pour les photos conditionnelles
```

Les route handlers Next.js récupèrent le jeton depuis un cookie HTTP-only et ajoutent l'en-tête `Authorization: Bearer` lors de l'appel serveur vers l'API. Le frontend peut utiliser `API_BASE_URL` côté serveur ou `NEXT_PUBLIC_API_BASE_URL`. Le backend utilise `DATABASE_URL` pour Prisma et le service PostgreSQL Compose utilise le nom `postgres` sur le réseau Compose implicite.

# 3. Protection des échanges

Le backend active CORS avec l'origine configurée par `FRONTEND_URL` et `credentials: true` (`apps/backend/src/main.ts`). Helmet est installé comme middleware HTTP et la taille des corps JSON et URL-encoded est limitée par `JSON_BODY_LIMIT`.

Le proxy frontend :

- lit les cookies `konatech_session` et `konatech_attendance_entry_session` ;
- ajoute l'en-tête d'autorisation avant l'appel backend ;
- renvoie `401` lorsqu'aucune session n'est disponible ;
- distingue une erreur de configuration d'URL (`500`) d'une indisponibilité backend (`502`) (`apps/frontend/lib/api-route.ts`).

En production, le code frontend exige des URL configurées, refuse `localhost`, les adresses privées et certains tunnels temporaires, et exige HTTPS. Les URL d'API doivent se terminer par `/api/v1` (`apps/frontend/lib/api.ts`). Cette validation ne constitue pas un terminateur TLS : aucun certificat ou serveur TLS n'est défini dans le dépôt.

# 4. Isolation des services

Compose séquence les services par leurs healthchecks : `backend` attend `postgres` sain et `frontend` attend `backend` sain. PostgreSQL n'est pas accessible par le frontend ; le backend utilise l'URL interne `postgres:5432` pour la connexion Prisma. Les services sont déclarés dans le réseau Compose par défaut et aucun réseau personnalisé, pare-feu ou reverse proxy n'est défini dans `docker-compose.yml`.

Les ports hôtes PostgreSQL, backend et frontend sont publiés par Compose avec les variables `POSTGRES_PORT`, `BACKEND_PORT` et `FRONTEND_PORT`. Leur exposition est donc une propriété observable de la configuration fournie.

# 5. Vérification

Les moyens de vérification présents sont :

```bash
pnpm test:proxy
docker compose --env-file .env.production ps
docker compose --env-file .env.production logs -f backend frontend postgres
```

Les healthchecks vérifient `pg_isready`, `http://127.0.0.1:4000/api/v1/health` et `http://127.0.0.1:3000/api/health`. `pnpm test:proxy` démarre temporairement le backend et le frontend, attend leurs réponses de santé et vérifie le proxy frontend ainsi que les URL configurées (`scripts/validate-proxy.mjs`).

# 6. Références

| Élément documenté | Fichiers analysés |
|---|---|
| CORS, Helmet, corps HTTP et préfixe API | `apps/backend/src/main.ts` |
| Proxy frontend et ajout du Bearer | `apps/frontend/lib/api-route.ts` |
| Validation des URL et exigences HTTPS en production | `apps/frontend/lib/api.ts` |
| Cookies de session | `apps/frontend/lib/auth-session.ts` |
| Services, ports, dépendances et healthchecks | `docker-compose.yml` |
| Variables de communication | `apps/backend/.env.example`, `apps/frontend/.env.example`, `.env.production.example` |
| Vérification des échanges | `scripts/validate-proxy.mjs`, `README.md` |
| Stockage externe conditionnel | `apps/backend/src/modules/attendance/attendance-photo-storage.service.ts` |

---

Document ID : SG-005  
Titre : Sécurité réseau et communications  
Version : 1.0  
Statut : Validé  
Classification : Interne  
Référence : Security Guide  
Projet : Konatech Pointage
