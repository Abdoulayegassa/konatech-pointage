# 1. Présentation

Ce chapitre regroupe les diagnostics et actions de résolution explicitement documentés pour l'installation, la validation, Prisma et Docker Compose. Les cas présentés correspondent aux messages et procédures présents dans `README.md` et les scripts du dépôt.

# 2. Vérifications préliminaires

Les contrôles disponibles avant ou après un déploiement sont :

```bash
pnpm db:status
pnpm prisma:status
pnpm validate
pnpm test:proxy
docker compose --env-file .env.production ps
```

Le contrôle `pnpm validate` enchaîne le formatage, la génération Prisma, le typage, le lint, les tests backend, les builds et la validation du proxy (`package.json`).

# 3. Problèmes courants

| Problème | Cause possible | Vérification | Résolution |
|---|---|---|---|
| `docker compose` ne se connecte pas au daemon sous Windows | Docker Desktop n'est pas démarré ou le shell n'a pas l'accès requis | Exécuter `pnpm db:status` et observer l'accès Compose | Démarrer Docker Desktop, vérifier les permissions du shell, puis relancer `pnpm db:status` (`README.md`). |
| Erreur `EPERM`, `Access is denied` ou verrouillage autour de `.next`, `dist` ou Prisma | Serveurs frontend/backend actifs ou artefacts verrouillés | Observer l'échec de commande et les processus de développement | Exécuter `pnpm.cmd clean:windows:dev`, puis `pnpm.cmd clean:windows:prisma` si la sortie Prisma est obsolète, relancer `pnpm.cmd prisma:generate`, puis la commande en échec (`README.md`). |
| `pnpm test:proxy` échoue | Variables locales absentes, URL incohérentes, ports localhost bloqués ou backend/frontend non prêts | Relancer `pnpm test:proxy` et consulter les journaux imprimés par `scripts/validate-proxy.mjs` | Vérifier `apps/backend/.env`, `apps/frontend/.env.local`, les variables d'URL et les ports temporaires, puis relancer le script (`README.md`). |
| Build ou comportement Prisma/Next.js incohérent | Version Node.js hors de la plage du dépôt | Vérifier la version Node.js utilisée et `.nvmrc` | Utiliser la version déclarée dans `.nvmrc` ; Node.js 24 est hors de la plage indiquée (`README.md`). |
| Migrations non disponibles ou non appliquées | Client Prisma non généré ou état des migrations non vérifié | Exécuter `pnpm prisma:generate` puis `pnpm prisma:status` | Exécuter les commandes Prisma présentes, puis `pnpm prisma:migrate` en développement ou `pnpm prisma:migrate:deploy` pour le flux de déploiement (`README.md`, `package.json`). |

# 4. Vérification des services

Compose expose l'état des services avec :

```bash
docker compose --env-file .env.production ps
```

Les journaux des services sont disponibles avec :

```bash
docker compose --env-file .env.production logs -f backend frontend postgres
```

Les healthchecks définis dans `docker-compose.yml` utilisent `pg_isready` pour PostgreSQL, `/api/v1/health` pour le backend et `/api/health` pour le frontend. Le script `scripts/validate-proxy.mjs` réserve des ports temporaires, attend les réponses JSON de santé et vérifie les redirections du proxy.

# 5. Vérification de la base de données

Les contrôles et opérations Prisma disponibles sont :

```bash
pnpm db:status
pnpm prisma:generate
pnpm prisma:status
pnpm prisma:migrate
pnpm prisma:migrate:deploy
pnpm prisma:seed
```

Le README précise que l'environnement de test ne doit pas utiliser la même base que le développement local, car la suite e2e recrée la base ciblée avant ses tests. Le dépôt ne lance pas automatiquement de reset ou de drop de base pendant la validation.

# 6. Références

| Élément documenté | Fichiers analysés |
|---|---|
| Procédures de dépannage et versions Node.js | `README.md` |
| Commandes de validation, Compose et Prisma | `package.json`, `apps/backend/package.json` |
| Healthchecks, dépendances et services | `docker-compose.yml` |
| Construction et migration backend | `docker/backend.Dockerfile` |
| Construction frontend | `docker/frontend.Dockerfile` |
| Validation du proxy et journaux temporaires | `scripts/validate-proxy.mjs` |
| Nettoyage Windows | `scripts/clean-windows.ps1` |
| Configuration backend et validation d'environnement | `apps/backend/src/app.module.ts`, `apps/backend/src/main.ts` |

---

Document ID : DG-010  
Titre : Dépannage et résolution des problèmes  
Version : 1.0  
Statut : Validé  
Classification : Interne  
Référence : Deployment Guide  
Projet : Konatech Pointage
