Document ID : DG-001  
Titre : Présentation du déploiement  
Version : 1.0  
Statut : Validé  
Classification : Interne  
Référence : Deployment Guide  
Projet : Konatech Pointage

# 1. Présentation

Ce Deployment Guide décrit les mécanismes de construction et d’exécution de Konatech Pointage démontrés par le dépôt. Il couvre l’exécution locale avec pnpm ainsi que l’exécution conteneurisée définie par Docker Compose.

# 2. Architecture générale

L’architecture de déploiement Compose comprend trois services : PostgreSQL, le backend NestJS et le frontend Next.js. PostgreSQL est démarré par défaut; le backend et le frontend appartiennent au profil Compose `app`. Le backend attend l’état sain de PostgreSQL et le frontend attend l’état sain du backend.

```text
Client navigateur
        |
        v
Frontend Next.js :3000
        |
        v
Backend NestJS /api/v1 :4000
        |
        v
PostgreSQL :5432 dans Compose
        |
        v
Volume postgres-data
```

Les Dockerfiles sont multi-stage et utilisent Node.js 22. L’image backend génère Prisma, compile NestJS puis applique `prisma migrate deploy` au démarrage avant `node dist/main.js`. L’image frontend compile Next.js puis lance `next start` sur le port 3000.

Aucun manifeste cloud, pipeline CI/CD ou configuration déclarative Render/Neon n’est présent dans le dépôt. Render et Neon sont seulement mentionnés dans la documentation pour l’exécution de commandes ou comme cible possible de la chaîne PostgreSQL.

# 3. Composants

| Composant | Rôle |
|---|---|
| PostgreSQL | Base de données exécutée par le service Compose `postgres`, avec volume nommé `postgres-data`. |
| Backend NestJS | API HTTP et logique métier; service Compose `backend`, port interne 4000. |
| Prisma | Génération du client et application des migrations backend. |
| Frontend Next.js | Application web; service Compose `frontend`, port interne 3000. |
| Docker Compose | Orchestration déclarée des services, dépendances, ports, healthchecks et volume. |
| pnpm | Installation du monorepo et scripts de développement, validation et build. |

# 4. Technologies utilisées

| Technologie | Utilisation |
|---|---|
| Node.js 22 | Image de base des Dockerfiles et exécution des applications compilées. |
| Docker | Construction et exécution des images backend et frontend. |
| Docker Compose | Démarrage de PostgreSQL seul ou de la pile complète avec le profil `app`. |
| PostgreSQL 16 Alpine | Image du service de base de données Compose. |
| NestJS | Compilation et exécution de l’API backend. |
| Next.js | Build et serveur de production du frontend. |
| Prisma | Génération du client et migrations au démarrage backend. |
| pnpm 10 | Gestionnaire de paquets et scripts racine. |

# 5. Organisation générale

Le monorepo contient `apps/backend` pour l’API et Prisma, `apps/frontend` pour l’application web, `docker/` pour les Dockerfiles, `docker-compose.yml` pour l’orchestration et `.env.production.example` comme modèle de variables Compose. Les variables injectées dans Compose relient l’URL publique du frontend, l’URL de l’API, PostgreSQL et les paramètres d’exécution.

Le mode local documenté installe les dépendances avec `pnpm install`, démarre PostgreSQL avec `pnpm db:up`, puis lance les applications avec `pnpm dev`. Le mode conteneurisé de type production utilise le fichier d’environnement de production et le profil `app`.

# 6. Références

| Élément documenté | Fichier source |
|---|---|
| Architecture, prérequis et modes de déploiement | `README.md` |
| Scripts pnpm et commandes Compose | `package.json` |
| Monorepo | `pnpm-workspace.yaml` |
| Services, profils, ports, dépendances et volumes | `docker-compose.yml` |
| Construction et démarrage backend | `docker/backend.Dockerfile` |
| Construction et démarrage frontend | `docker/frontend.Dockerfile` |
| Modèle des variables de production | `.env.production.example` |
| Configuration Prisma backend | `apps/backend/prisma/schema.prisma`, `apps/backend/prisma.config.ts` |
| Structure frontend et backend | `apps/frontend/package.json`, `apps/backend/package.json` |
