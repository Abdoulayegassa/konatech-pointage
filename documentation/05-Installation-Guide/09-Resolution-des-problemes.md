# Résolution des problèmes

| Métadonnée | Valeur |
| --- | --- |
| Document ID | IG-009 |
| Titre | Résolution des problèmes |
| Version | 1.0 |
| Statut | Validé |
| Classification | Interne |
| Référence | Installation Guide |

## 1. Présentation

### 1.1 Objectif

Ce chapitre rassemble les problèmes d'installation et de démarrage
explicitement documentés ou directement détectés par les mécanismes du dépôt.
Pour chaque cas, il relie le symptôme, la cause observable, le contrôle
disponible et la résolution déjà compatible avec le projet.

### 1.2 Portée

Le périmètre couvre :

- Node.js, pnpm et le workspace ;
- NestJS et sa validation de configuration ;
- Next.js et le raccordement à l'API ;
- Docker Compose et PostgreSQL ;
- Prisma Client, les migrations, le seed et la base de test ;
- les problèmes de démarrage et de verrouillage sous Windows ;
- les healthchecks, tests et journaux disponibles.

Les erreurs métier rencontrées après installation ne font pas partie de ce
chapitre, sauf lorsqu'elles interviennent dans les tests de validation de
l'installation.

Références :
`README.md`,
`package.json`,
`scripts/clean-windows.ps1`.

## 2. Problèmes liés aux dépendances

### 2.1 Cas observables

| Symptôme | Cause observée | Méthode de vérification | Résolution compatible avec le dépôt |
| --- | --- | --- | --- |
| PowerShell bloque `pnpm.ps1` avec une erreur de stratégie d'exécution | Le shim PowerShell est interdit par la politique locale | Exécuter la même commande avec `pnpm.cmd` ou depuis l'invite de commandes | Utiliser `pnpm.cmd`; le README mentionne aussi l'ajustement de la politique si l'environnement l'autorise |
| Comportement incohérent de Prisma ou du build Next.js avec Node.js 24 | Node.js 24 est hors de la plage déclarée | Lire `node --version`, `package.json` et `.nvmrc` | Exécuter `nvm use` pour employer la version déclarée |
| Le script Windows indique que le CLI Prisma est introuvable | Les dépendances backend ne sont pas installées à l'emplacement attendu | Lancer `pnpm.cmd clean:windows:prisma` et lire l'erreur explicite du script | Exécuter `pnpm install`, puis relancer la régénération |
| Une commande de typecheck, lint ou build échoue après installation | Une dépendance, un type, une règle ou une compilation exigée par la commande n'est pas satisfait | Isoler avec `pnpm typecheck`, `pnpm lint`, `pnpm build:backend` et `pnpm build:frontend` | Corriger uniquement l'échec signalé, puis relancer la même commande; les commandes de contrôle sont celles du manifeste |
| Le formatage fait échouer `pnpm validate` | `format:check` est la première étape de la chaîne | Exécuter `pnpm format:check` | Le script disponible qui écrit le formatage est `pnpm format`; la validation peut ensuite être relancée |

Références :
`README.md`,
`package.json`,
`.nvmrc`,
`scripts/clean-windows.ps1`.

### 2.2 Version et gestionnaire attendus

Le manifeste racine déclare :

| Élément | Valeur observable |
| --- | --- |
| Node.js | `>=20.9.0 <23` |
| pnpm | `>=10.0.0` |
| Gestionnaire | `pnpm@10.26.0` |

La commande de récupération des dépendances documentée est :

```bash
pnpm install
```

Sous PowerShell verrouillé :

```powershell
pnpm.cmd install
```

Références :
`package.json`,
`README.md`.

### 2.3 Artefacts verrouillés sous Windows

Le README documente les symptômes `EPERM`, `Access is denied` et les
verrouillages autour de `node.exe`, Prisma, `.next` et `dist`.

Les scripts disponibles sont :

```powershell
pnpm.cmd clean:windows
pnpm.cmd clean:windows:dev
pnpm.cmd clean:windows:prisma
```

Le script :

- supprime `apps/backend/dist` et `apps/frontend/.next` s'ils existent ;
- supprime les fichiers `*.tsbuildinfo` hors `node_modules` ;
- peut arrêter les processus à l'écoute des ports de développement connus ;
- peut régénérer Prisma Client ;
- ne supprime ni les sources ni les bases de données.

Références :
`README.md`,
`package.json`,
`scripts/clean-windows.ps1`.

## 3. Problèmes Backend

### 3.1 Cas observables

| Symptôme | Cause observée | Méthode de vérification | Résolution compatible avec le dépôt |
| --- | --- | --- | --- |
| Le backend ne termine pas son démarrage | Variable obligatoire absente ou invalide dans le schéma Joi | Lancer `pnpm dev:backend` et lire l'erreur de configuration | Créer `apps/backend/.env` depuis `.env.example` et fournir une configuration conforme |
| Erreur relative à `JWT_SECRET` | Secret absent, inférieur à 32 caractères ou reconnu comme secret local en production | Relancer le backend; la validation s'exécute avant l'écoute | Renseigner `JWT_SECRET` conformément aux contraintes du schéma et à l'exemple |
| Erreur relative à `FRONTEND_URL` en production | URL localhost, non HTTPS, tunnel temporaire ou IP privée | Lire le message de validation au démarrage | Configurer l'origine frontend publique conforme dans l'environnement de production |
| Erreur sur les coordonnées GPS | Une seule coordonnée est fournie ou la sécurité est active sans les deux | Lire l'erreur produite par `validateSecurityConfig` | Fournir latitude et longitude ensemble lorsque la sécurité est active, ou conserver le mécanisme désactivé |
| Erreur sur les rayons GPS | Le rayon d'avertissement est inférieur au rayon de confiance | Relancer le backend et lire l'erreur | Employer des valeurs respectant la relation validée par le code |
| Erreur Cloudinary au démarrage | Une partie seulement des trois variables d'identification est définie | Lire l'erreur de configuration | Fournir les trois variables ensemble ou les laisser toutes absentes |
| L'API de santé ne répond pas | Backend non démarré, port non accessible ou échec de configuration | Appeler `/api/v1/health` et consulter les logs du processus | Corriger l'erreur affichée puis relancer `pnpm dev:backend` ou le service Compose |
| Les tests backend ne préparent pas leur base | PostgreSQL indisponible, URL de test invalide ou droits insuffisants | Exécuter `pnpm test:backend`; `test-database.ts` ajoute le diagnostic PostgreSQL | Démarrer PostgreSQL avec `pnpm db:up` et vérifier l'URL de test |

Références :
`apps/backend/src/app.module.ts`,
`apps/backend/src/main.ts`,
`apps/backend/test/test-database.ts`,
`README.md`.

### 3.2 Validation de configuration

Le backend refuse notamment :

- l'absence de `FRONTEND_URL`, `JWT_SECRET` ou `DATABASE_URL` ;
- un `JWT_SECRET` trop court ;
- des valeurs numériques non conformes ;
- une combinaison GPS incohérente ;
- une configuration Cloudinary partielle ;
- plusieurs formes d'URL interdites en production.

La procédure locale de création du fichier est :

```bash
cp apps/backend/.env.example apps/backend/.env
```

Sous PowerShell :

```powershell
Copy-Item apps/backend/.env.example apps/backend/.env
```

Références :
`apps/backend/src/app.module.ts`,
`README.md`.

### 3.3 Diagnostic du démarrage

```bash
pnpm dev:backend
```

Lorsque l'écoute réussit, le bootstrap journalise le port et le préfixe
`/api/v1`. Hors production, il journalise aussi l'état synthétique de la
sécurité de pointage. L'absence de ces messages indique que le bootstrap n'a
pas atteint ces étapes.

Référence :
`apps/backend/src/main.ts`.

### 3.4 Santé backend

La cible de contrôle est :

```text
GET http://localhost:4000/api/v1/health
```

Le payload valide contient `status: "ok"` et le service
`konatech-attendance-api`. Le healthcheck Compose et `test:proxy` utilisent
ce même endpoint.

Références :
`apps/backend/src/modules/health/health.controller.ts`,
`docker-compose.yml`,
`scripts/validate-proxy.mjs`.

## 4. Problèmes Frontend

### 4.1 Cas observables

| Symptôme | Cause observée | Méthode de vérification | Résolution compatible avec le dépôt |
| --- | --- | --- | --- |
| Le build ou une route serveur signale qu'une URL est absente en production | `NEXT_PUBLIC_APP_URL` ou `NEXT_PUBLIC_API_BASE_URL` n'est pas configurée | Lancer `pnpm build:frontend` ou appeler la route concernée et lire l'erreur | Créer/configurer le fichier frontend depuis `.env.example` avec les URL requises |
| Erreur indiquant qu'une URL n'est pas absolue | Une variable d'URL ne peut pas être convertie par `new URL` | Lire le message qui nomme la variable | Fournir une URL absolue dans le fichier d'environnement |
| Erreur d'URL localhost, HTTP, tunnel ou réseau privé en production | Les contrôles de production rejettent cette origine | Relancer le build ou la route | Fournir l'URL publique HTTPS admise par les validations |
| Erreur demandant le suffixe `/api/v1` | L'URL d'API ne se termine pas par le préfixe backend | Lire le message de `lib/api.ts` | Configurer `API_BASE_URL` et `NEXT_PUBLIC_API_BASE_URL` avec le suffixe requis |
| `/api/health` renvoie une erreur 502 avec l'impossibilité de joindre le backend | `fetchServerApi` n'atteint pas l'API | Appeler `/api/health`, puis l'endpoint backend directement | Vérifier que le backend est démarré et que l'URL serveur pointe vers lui |
| `/api/health` renvoie une erreur 500 de configuration | Une erreur nommant une variable d'URL a été détectée | Lire le champ `error` de la réponse | Corriger la variable nommée |
| `pnpm test:proxy` expire pendant le démarrage | Backend ou frontend non prêt, configuration invalide, port indisponible ou accès localhost bloqué | Lire le message `did not become ready in time` et les sorties récentes imprimées | Appliquer les contrôles du README sur les fichiers d'environnement, les URL, le pare-feu local et les processus |
| Le test proxy reçoit un payload ou une redirection inattendue | Le contrat de santé ou le raccordement de l'URL publique diffère de celui attendu | Lire le diagnostic précis de `validate-proxy.mjs` | Aligner `FRONTEND_URL` et `NEXT_PUBLIC_APP_URL`, puis vérifier les URL d'API |

Références :
`apps/frontend/lib/api.ts`,
`apps/frontend/lib/api-route.ts`,
`apps/frontend/app/api/health/route.ts`,
`scripts/validate-proxy.mjs`,
`README.md`.

### 4.2 Fichier de configuration local

La création documentée est :

```bash
cp apps/frontend/.env.example apps/frontend/.env.local
```

Sous PowerShell :

```powershell
Copy-Item apps/frontend/.env.example apps/frontend/.env.local
```

Référence :
`README.md`.

### 4.3 Isolation du build

Les commandes permettent de séparer les contrôles :

```bash
pnpm typecheck:frontend
pnpm build:frontend
pnpm test:proxy
```

Le build Next.js n'exécute pas le lint intégré, car
`ignoreDuringBuilds` est activé. Le lint du workspace se vérifie séparément :

```bash
pnpm lint
```

Références :
`package.json`,
`apps/frontend/next.config.ts`,
`README.md`.

### 4.4 Diagnostic du proxy

`test:proxy` conserve jusqu'à 80 lignes récentes par processus. En cas
d'échec, il joint ces sorties à son erreur, puis arrête frontend et backend.

Le README demande de contrôler :

- l'existence et la validité de `apps/backend/.env` ;
- `apps/frontend/.env.local` lorsque des variables locales additionnelles
  sont nécessaires ;
- l'égalité de l'origine publique frontend ;
- l'égalité des URL d'API lorsque `API_BASE_URL` est fournie ;
- le suffixe `/api/v1` ;
- le blocage éventuel des ports localhost par le pare-feu ;
- les processus de développement sous Windows.

Références :
`scripts/validate-proxy.mjs`,
`README.md`.

## 5. Problèmes PostgreSQL / Prisma

### 5.1 Cas observables

| Symptôme | Cause observée | Méthode de vérification | Résolution compatible avec le dépôt |
| --- | --- | --- | --- |
| `docker compose` ne peut pas joindre le daemon sous Windows | Docker Desktop arrêté ou shell sans accès | Exécuter `pnpm db:status` | Démarrer Docker Desktop, vérifier l'accès du shell, puis relancer `pnpm db:status` |
| PostgreSQL n'est pas sain | Le conteneur ne passe pas `pg_isready` | Exécuter `pnpm db:status` ou `docker compose ... ps` | Lire les logs PostgreSQL et vérifier les variables `POSTGRES_*` utilisées par Compose |
| `prisma:status` ne se connecte pas | PostgreSQL indisponible ou `DATABASE_URL` invalide | Exécuter `pnpm db:status`, puis `pnpm prisma:status` | Démarrer PostgreSQL et corriger `DATABASE_URL` à partir du fichier d'exemple |
| Prisma Client est absent ou obsolète | La génération n'a pas été exécutée ou les artefacts sont verrouillés | Exécuter `pnpm prisma:generate` | Régénérer avec `pnpm prisma:generate`; sous Windows, le README expose `clean:windows:prisma` |
| Des migrations ne sont pas appliquées | L'état Prisma diffère de l'historique local | Exécuter `pnpm prisma:status` | En local, exécuter `pnpm prisma:migrate`; pour le flux de déploiement, utiliser `pnpm prisma:migrate:deploy` |
| Le seed échoue | Connexion, schéma ou opération Prisma en erreur | Exécuter `pnpm prisma:seed` et lire `Seed failed` | Vérifier d'abord `pnpm prisma:status`, appliquer les migrations, puis relancer le seed |
| La base e2e ne peut pas être préparée | URL sans nom de base, serveur inaccessible ou droits de création/suppression insuffisants | Exécuter `pnpm test:backend` et lire le message de `test-database.ts` | Démarrer PostgreSQL et fournir une URL de test distincte et exploitable |
| Les tests risquent de cibler la base locale | `.env.test` ou `.env.test.local` pointe vers la même base que le développement | Comparer les noms de bases des URL avant `pnpm test:backend` | Employer une base de test distincte; le README indique que la suite recrée la cible |

Références :
`README.md`,
`docker-compose.yml`,
`package.json`,
`apps/backend/prisma.config.ts`,
`apps/backend/prisma/seed.ts`,
`apps/backend/test/test-environment.ts`,
`apps/backend/test/test-database.ts`.

### 5.2 Ordre de diagnostic

Les contrôles disponibles, sans modification puis avec modification, sont :

```bash
pnpm db:status
pnpm prisma:generate
pnpm prisma:status
pnpm prisma:migrate
pnpm prisma:seed
```

`db:status`, `prisma:generate` et `prisma:status` servent à isoler
respectivement l'état Compose, la génération du client et l'état des
migrations. `prisma:migrate` et `prisma:seed` modifient la base.

Références :
`package.json`,
`README.md`.

### 5.3 Base de test

La résolution de l'URL suit :

1. `TEST_DATABASE_URL` ;
2. `DATABASE_URL` ;
3. l'URL de test interne.

La préparation termine les connexions, supprime puis recrée la base cible,
applique les migrations et exécute le seed. Le README interdit d'utiliser la
même base que le développement pour `.env.test` ou `.env.test.local`.

Références :
`apps/backend/test/test-environment.ts`,
`apps/backend/test/test-database.ts`,
`README.md`.

## 6. Problèmes de démarrage

### 6.1 Matrice de démarrage

| Situation | Cause observable | Vérification | Résolution compatible |
| --- | --- | --- | --- |
| `pnpm db:up` ne démarre pas le frontend ni le backend | Ces services appartiennent au profil Compose `app` | `pnpm db:status` montre seulement PostgreSQL | Utiliser `pnpm dev` pour les applications locales ou la commande Compose avec `--profile app` |
| `pnpm dev` démarre les applications mais la base est indisponible | Le lanceur `dev.mjs` ne démarre pas PostgreSQL | Exécuter `pnpm db:status` et `pnpm prisma:status` | Démarrer d'abord PostgreSQL et préparer Prisma selon le Quick Start |
| Un des deux processus de développement s'arrête et l'autre est coupé | Le lanceur racine arrête les autres enfants lorsqu'un processus sort | Lire la première erreur dans les sorties partagées | Corriger la cause du processus sorti, puis relancer `pnpm dev` |
| Le backend Docker ne démarre pas après PostgreSQL | `prisma migrate deploy` échoue avant `node dist/main.js`, ou la configuration backend est invalide | Lire `docker compose ... ps` et les logs backend | Corriger l'accès base/configuration, puis relancer la commande Compose documentée |
| Le frontend Docker ne démarre pas | Le backend n'est pas sain ou le build/configuration frontend échoue | Lire l'état des dépendances Compose et les logs frontend/backend | Rétablir d'abord le backend sain, puis relancer la pile |
| Un port Docker hôte est déjà occupé | Le mapping `POSTGRES_PORT`, `BACKEND_PORT` ou `FRONTEND_PORT` ne peut pas être créé | Lire l'erreur Compose et l'état des services | Utiliser les variables de ports prévues dans `.env.production.example` avec des ports disponibles |
| Un port de développement Windows reste occupé | Un ancien processus écoute un des ports connus du script | Exécuter `pnpm.cmd clean:windows:dev` et lire les PID arrêtés ou l'absence de processus | Utiliser ce script, puis relancer le démarrage |

Références :
`scripts/dev.mjs`,
`scripts/clean-windows.ps1`,
`docker-compose.yml`,
`docker/backend.Dockerfile`,
`README.md`.

### 6.2 Ordre local réellement documenté

```text
pnpm install
    |
    v
fichiers d'environnement
    |
    v
pnpm db:up
    |
    v
Prisma generate / status / migrate / seed
    |
    v
pnpm dev
```

Une erreur peut être isolée en relançant l'étape où la séquence s'interrompt.

Référence :
`README.md`.

### 6.3 Ordre Docker

Compose impose :

```text
postgres --healthy--> backend --healthy--> frontend
```

Le backend exécute `prisma migrate deploy` avant NestJS. Le frontend ne
démarre qu'après le healthcheck backend.

Références :
`docker-compose.yml`,
`docker/backend.Dockerfile`.

## 7. Vérifications complémentaires

### 7.1 Commandes d'isolation

| Commande | Élément isolé | Modification de données |
| --- | --- | --- |
| `pnpm format:check` | Formatage | Non |
| `pnpm typecheck:backend` | Types backend | Non |
| `pnpm typecheck:frontend` | Types frontend | Non |
| `pnpm lint` | Règles ESLint du workspace | Non |
| `pnpm build:backend` | Compilation NestJS | Non sur la base |
| `pnpm build:frontend` | Compilation Next.js | Non sur la base |
| `pnpm db:status` | État Compose | Non |
| `pnpm prisma:generate` | Schéma et génération client | Non sur les données |
| `pnpm prisma:status` | Connexion et état des migrations | Non |
| `pnpm test:backend` | Backend, règles et base e2e | Oui, sur la base de test résolue |
| `pnpm test:proxy` | Démarrage et raccordement HTTP | Non sur la base par son propre code |
| `pnpm validate` | Chaîne complète | Les tests backend peuvent recréer leur base de test |

Référence :
`package.json`.

### 7.2 Endpoints

| Cible | Contrôle |
| --- | --- |
| `http://localhost:4000/api/v1/health` | Processus backend et endpoint NestJS |
| `http://localhost:3000/api/health` | Processus frontend, résolution API et endpoint backend |
| `http://localhost:3000` | Accessibilité du frontend local |
| `http://localhost:4000/api/v1` | Préfixe public de l'API |

Références :
`README.md`,
`apps/backend/src/modules/health/health.controller.ts`,
`apps/frontend/app/api/health/route.ts`.

### 7.3 Journaux

Pour la pile Compose :

```bash
docker compose --env-file .env.production logs -f backend frontend postgres
```

En local, `pnpm dev` transmet directement les sorties des deux processus au
terminal. `test:proxy` imprime les sorties récentes capturées lorsqu'il
échoue.

Références :
`README.md`,
`scripts/dev.mjs`,
`scripts/validate-proxy.mjs`.

### 7.4 Validation ciblée ou complète

```bash
pnpm check
pnpm validate:backend
pnpm validate:frontend
pnpm validate
```

`check` couvre lint, typecheck et builds. Les validations ciblées ajoutent les
contrôles propres à leur composant. `validate` exécute toute la chaîne
déclarée dans le manifeste.

Référence :
`package.json`.

## 8. Traçabilité

### 8.1 Problèmes documentés

| Problème | Sources |
| --- | --- |
| Blocage du shim pnpm sous PowerShell | `README.md` |
| Version Node.js non prise en charge | `README.md`, `package.json`, `.nvmrc` |
| Accès au daemon Docker | `README.md`, `docker-compose.yml` |
| Verrouillage EPERM et nettoyage Windows | `README.md`, `scripts/clean-windows.ps1`, `package.json` |
| Échec du proxy frontend | `README.md`, `scripts/validate-proxy.mjs` |
| Séparation obligatoire de la base de test | `README.md`, `apps/backend/test/test-environment.ts`, `apps/backend/test/test-database.ts` |

### 8.2 Backend et frontend

| Mécanisme | Sources |
| --- | --- |
| Validation des variables backend | `apps/backend/src/app.module.ts` |
| Logs et écoute backend | `apps/backend/src/main.ts` |
| Santé backend | `apps/backend/src/modules/health/health.controller.ts` |
| Validation des URL frontend | `apps/frontend/lib/api.ts` |
| Réponses du proxy en échec | `apps/frontend/lib/api-route.ts` |
| Santé via frontend | `apps/frontend/app/api/health/route.ts` |
| Build Next.js sans lint intégré | `apps/frontend/next.config.ts`, `README.md` |

### 8.3 Base, tests et démarrage

| Mécanisme | Sources |
| --- | --- |
| Scripts PostgreSQL et Prisma | `package.json`, `apps/backend/package.json` |
| Configuration Prisma | `apps/backend/prisma.config.ts`, `apps/backend/prisma/schema.prisma` |
| Erreurs et bilan du seed | `apps/backend/prisma/seed.ts` |
| Préparation de la base e2e | `apps/backend/test/test-database.ts` |
| Configuration de test | `apps/backend/test/test-environment.ts` |
| Ordre et santé Compose | `docker-compose.yml` |
| Migration avant démarrage backend | `docker/backend.Dockerfile` |
| Coordination locale des processus | `scripts/dev.mjs` |

## 9. Observations

### 9.1 Comportements particuliers

- Le script racine `dev` ne démarre ni PostgreSQL ni Prisma.
- La sortie d'un processus enfant provoque l'arrêt des autres processus du
  lanceur local.
- `db:up` ne lance que le service PostgreSQL sans le profil `app`.
- Le backend Compose migre avant de démarrer.
- Le frontend Compose attend un backend sain.
- `test:proxy` sélectionne des ports temporaires et conserve un tampon limité
  de logs.
- La route frontend de santé distingue l'erreur de configuration, renvoyée
  avec le statut 500, de l'impossibilité de joindre le backend, renvoyée avec
  le statut 502.
- Le nettoyage Windows ne réinitialise pas la base et ne supprime pas les
  migrations.
- La préparation e2e recrée la base cible configurée.

### 9.2 Dépendances

- Les scripts Node.js nécessitent les dépendances pnpm installées.
- Les contrôles de base nécessitent Docker ou une instance PostgreSQL
  accessible.
- Prisma dépend de `DATABASE_URL` et du client généré.
- Le test proxy dépend de ports localhost disponibles et des deux
  configurations applicatives.
- Le build frontend de production dépend des URL exigées par les validations
  du code.
- Les commandes Windows de nettoyage nécessitent PowerShell et les cmdlets
  utilisées par le script.

### 9.3 Limites observées

- Aucun script `doctor` n'est présent.
- Aucun outil de diagnostic automatique des ports n'est exposé hors du script
  Windows et du choix temporaire de ports dans `test:proxy`.
- Aucun agrégateur ou stockage centralisé de logs n'est configuré.
- Aucun endpoint de métriques n'est présent.
- Aucun healthcheck backend ne teste explicitement PostgreSQL, Prisma,
  Cloudinary ou Chromium.
- Aucun test frontend autonome n'est déclaré.
- Aucun script de rollback applicatif ou de migration n'est présent.
- Aucun manifeste Render, Neon ou autre fournisseur ne permet de diagnostiquer
  un démarrage cloud depuis le dépôt.
- Les résolutions disponibles s'arrêtent aux commandes, validations,
  healthchecks et journaux versionnés ; aucun outil de support interactif
  n'est fourni.
