# 1. Présentation

Ce chapitre rassemble les contrôles et actions de diagnostic déjà présents dans le dépôt pour les incidents liés à l'authentification, l'autorisation, la configuration, les communications, les services Docker et les contrôles de sécurité du pointage.

# 2. Vérifications préliminaires

Avant toute intervention, les contrôles disponibles sont :

```bash
docker compose --env-file .env.production ps
docker compose --env-file .env.production logs -f backend frontend postgres
pnpm db:status
pnpm prisma:status
pnpm test:proxy
```

Les healthchecks HTTP et PostgreSQL, les états Docker, les journaux et les sorties de `test:proxy` constituent les signaux observables. Le script de proxy conserve les dernières lignes de sortie des processus backend et frontend lorsqu'un contrôle échoue.

# 3. Incidents courants

| Incident | Vérification | Cause possible | Résolution |
|---|---|---|---|
| Réponse `401` ou session expirée | Contrôler le cookie de session et l'en-tête Bearer transmis par le proxy | Cookie absent, jeton indisponible ou expiré | Rejouer la connexion via le flux `/auth/login` ou `/auth/attendance-entry/login`, puis relancer la requête (`apps/frontend/lib/api-route.ts`, module Auth). |
| Réponse `403` | Contrôler le rôle `accessRole` et les décorateurs `@Roles` | Rôle différent du rôle requis par la ressource | Utiliser le compte dont le rôle correspond au contrôleur protégé (`RolesGuard`). |
| Erreur de configuration JWT ou URL en production | Consulter les logs de démarrage backend et les erreurs de résolution d'URL frontend | Secret JWT invalide, URL absente, locale, non HTTPS ou privée | Corriger les variables du fichier d'environnement de production, puis reconstruire et redémarrer Compose (`apps/backend/src/app.module.ts`, `apps/frontend/lib/api.ts`). |
| Réponse `429` | Examiner les en-têtes de limite et `Retry-After` | Limite générale, de connexion ou de PIN atteinte | Attendre la fenêtre indiquée par le throttler avant de relancer la requête (`AppThrottlerGuard`). |
| `test:proxy` échoue | Exécuter `pnpm test:proxy` et consulter les journaux capturés | Healthcheck, redirection ou cohérence des URL frontend/backend non conforme | Vérifier les fichiers `.env`, les URL et les ports temporaires, puis relancer le script (`README.md`, `scripts/validate-proxy.mjs`). |
| Backend ou frontend `unhealthy` | Exécuter `docker compose ... ps` et consulter les logs | Processus arrêté, port inaccessible ou route de santé en échec | Inspecter les logs du service concerné et relancer la pile avec `docker compose --env-file .env.production --profile app up -d --build`. |
| PostgreSQL `unhealthy` ou `prisma:status` en échec | Contrôler `pg_isready`, `pnpm db:status` et `pnpm prisma:status` | Conteneur PostgreSQL indisponible ou `DATABASE_URL` incorrecte | Vérifier le service `postgres`, la datasource et les logs PostgreSQL, puis relancer la commande de contrôle. |
| Incident de sécurité GPS/photo du pointage | Examiner les réponses `BadRequestException` et les logs backend | Localisation absente, zone dépassée, précision insuffisante ou preuve requise absente | Contrôler la configuration de sécurité du pointage et les données envoyées par le DTO (`attendance-security.service.ts`). |

# 4. Vérification des mécanismes de sécurité

Les contrôles applicatifs disponibles pour confirmer l'état de sécurité sont :

- authentification : `pnpm test:backend` et tests Auth sous `apps/backend/test/` ;
- autorisation : guards globaux `JwtAuthGuard` et `RolesGuard`, avec rôles déclarés dans les contrôleurs ;
- validation : `ValidationPipe` global et DTO `class-validator` ;
- audit : sortie du logger `AdminAudit` dans les journaux backend ;
- communications : CORS, validation des URL, proxy frontend et `pnpm test:proxy` ;
- variables d'environnement : validation Joi au démarrage de NestJS ;
- services : healthchecks Docker PostgreSQL, backend et frontend.

Les commandes de validation complètes sont :

```bash
pnpm validate:backend
pnpm validate:frontend
pnpm validate
```

# 5. Validation finale

La remise en état est confirmée par les mécanismes présents suivants :

```bash
docker compose --env-file .env.production ps
docker compose --env-file .env.production logs -f backend frontend postgres
pnpm prisma:status
pnpm test:proxy
pnpm validate
```

Les routes de santé attendues sont `http://localhost:4000/api/v1/health` et `http://localhost:3000/api/health`. `test:proxy` vérifie les réponses JSON de santé et les redirections publiques ; `pnpm validate` exécute les contrôles de format, Prisma, types, lint, tests, builds et proxy.

# 6. Références

| Élément documenté | Fichiers analysés |
|---|---|
| Typologie et diagnostic des incidents | `documentation/03-SMOD/07-Gestion-des-incidents.md` |
| Authentification, rôles et erreurs d'accès | `apps/backend/src/modules/auth/`, `apps/frontend/lib/api-route.ts` |
| Validation, configuration et throttling | `apps/backend/src/main.ts`, `apps/backend/src/app.module.ts`, `apps/backend/src/common/security/app-throttler.guard.ts` |
| Healthchecks | `apps/backend/src/modules/health/health.controller.ts`, `apps/frontend/app/api/health/route.ts`, `docker-compose.yml` |
| Validation du proxy | `scripts/validate-proxy.mjs`, `package.json` |
| Sécurité du pointage | `apps/backend/src/modules/attendance/attendance-security.service.ts`, `apps/backend/src/modules/attendance/attendance-security.exception.ts` |
| Journalisation d'audit | `apps/backend/src/common/audit/audit-log.service.ts` |
| Procédures de déploiement et diagnostics | `README.md`, `documentation/11-Security-Guide/` |

---

Document ID : SG-010  
Titre : Dépannage et résolution des incidents de sécurité  
Version : 1.0  
Statut : Validé  
Classification : Interne  
Référence : Security Guide  
Projet : Konatech Pointage
