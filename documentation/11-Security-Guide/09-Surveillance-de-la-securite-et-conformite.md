# 1. Présentation

La surveillance de la sécurité dans Konatech Pointage repose sur les healthchecks, les validations de configuration, les tests automatisés et les journaux applicatifs définis dans le dépôt. Elle ne correspond pas à un système externe de supervision ou de SIEM.

# 2. Contrôles de sécurité

Les contrôles réellement présents sont :

| Contrôle | Mécanisme observé |
|---|---|
| Configuration backend | Schéma Joi exécuté au démarrage de NestJS pour les variables obligatoires, les URL, le secret JWT et les paramètres de sécurité. |
| Authentification et autorisation | `JwtAuthGuard` et `RolesGuard` enregistrés comme guards globaux. |
| Validation des requêtes | `ValidationPipe` global, DTO et décorateurs `class-validator`. |
| Limitation de débit | `AppThrottlerGuard` avec limites générales, de connexion et de PIN de borne. |
| Communications | CORS, Helmet, limites de corps HTTP et validation des URL frontend/API. |
| Sécurité du pointage | Contrôles GPS/photo conditionnels et exceptions de sécurité dédiées. |

# 3. Vérifications de conformité

Les scripts de validation disponibles sont :

```bash
pnpm typecheck
pnpm lint
pnpm test:backend
pnpm test:proxy
pnpm validate
```

`pnpm validate` enchaîne le formatage, Prisma, le typage, le lint, les tests backend, les builds et le test du proxy. `pnpm test:proxy` démarre temporairement les applications, vérifie les healthchecks et contrôle la cohérence des URL frontend/backend (`package.json`, `scripts/validate-proxy.mjs`).

Les tests backend de configuration couvrent notamment les contraintes de production liées au secret JWT, aux URL frontend et aux paramètres de sécurité (`apps/backend/test/`). Le dépôt ne contient pas d'outil de conformité externe, de rapport automatisé ou de pipeline CI/CD versionné.

# 4. Surveillance de l'application

Les mécanismes de surveillance applicative sont :

- `GET /api/v1/health` côté backend, qui renvoie `status`, `service` et un horodatage ;
- `GET /api/health` côté frontend, qui relaie la réponse backend ;
- healthcheck Docker PostgreSQL avec `pg_isready` ;
- healthchecks Docker backend et frontend basés sur leurs routes HTTP ;
- états `healthy` ou `unhealthy`, dépendances conditionnelles et journaux de `docker compose` ;
- logs NestJS de démarrage et logs d'audit administrateur.

Le healthcheck backend confirme la disponibilité HTTP du processus et n'interroge pas directement PostgreSQL. Le healthcheck frontend dépend du backend. Aucun système de métriques, alerte, SIEM, tableau de bord de supervision ou healthcheck Cloudinary n'est configuré dans le dépôt.

# 5. Vérification

Les commandes de vérification des services et de leurs journaux sont :

```bash
docker compose --env-file .env.production ps
docker compose --env-file .env.production logs -f backend frontend postgres
pnpm db:status
pnpm prisma:status
```

Le script `scripts/validate-proxy.mjs` vérifie le contenu JSON du healthcheck backend, la réponse du proxy frontend et les redirections publiques de pointage. Les contrôles de configuration sont exécutés au démarrage de l'API et produisent une erreur lorsque les variables ne respectent pas le schéma validé.

# 6. Références

| Élément documenté | Fichiers analysés |
|---|---|
| Healthcheck backend | `apps/backend/src/modules/health/health.controller.ts` |
| Healthcheck frontend et proxy | `apps/frontend/app/api/health/route.ts`, `apps/frontend/lib/api.ts` |
| Healthchecks et états Docker | `docker-compose.yml` |
| Validation de configuration et throttling | `apps/backend/src/app.module.ts` |
| Bootstrap, Helmet, CORS et logs | `apps/backend/src/main.ts` |
| Audit et journalisation | `apps/backend/src/common/audit/audit-log.service.ts` |
| Tests et validation du proxy | `apps/backend/test/`, `scripts/validate-proxy.mjs`, `package.json` |
| Commandes et limites documentées | `README.md`, `documentation/03-SMOD/06-Surveillance.md` |

---

Document ID : SG-009  
Titre : Surveillance de la sécurité et conformité  
Version : 1.0  
Statut : Validé  
Classification : Interne  
Référence : Security Guide  
Projet : Konatech Pointage
