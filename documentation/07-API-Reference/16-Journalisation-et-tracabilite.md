# Journalisation et traçabilité

| Métadonnée | Valeur |
|---|---|
| Document ID | API-016 |
| Titre | Journalisation et traçabilité |
| Version | 1.0 |
| Statut | Validé |
| Classification | Interne |
| Référence | API Reference |
| Projet | Konatech Pointage |

# 1. Présentation

Ce chapitre décrit les mécanismes de journalisation et de traçabilité explicitement présents dans l'API de Konatech Pointage. Le backend utilise le `Logger` fourni par NestJS pour les événements de démarrage, les actions administratives auditées, les blocages de connexion PIN, les téléversements de photos et le rendu PDF.

Le dépôt ne configure pas de transport de logs distinct, de fichier journal, de table d'audit, de plateforme de supervision, de collecte de métriques ou de traçage distribué. Les appels au logger écrivent dans la sortie du processus selon le fonctionnement du logger NestJS utilisé sans remplacement dans le bootstrap.

# 2. Vue d'ensemble

| Mécanisme | Présence | Description |
|---|---|---|
| Logger NestJS | Présent | `Logger.log`, `Logger.warn` et `Logger.error` dans le bootstrap et plusieurs services |
| Logs de démarrage | Présents | Port, préfixe API et, hors production, état de la politique de sécurité du pointage |
| Audit administratif structuré | Présent | Événements JSON `admin_audit` émis au niveau `warn` après certaines mutations réussies |
| Journal de limitation PIN | Présent | Avertissement lors du blocage d'une connexion PIN |
| Journaux Cloudinary | Présents | Événements JSON de nouvelle tentative et d'échec final |
| Journaux d'export PDF | Présents | Début, fin, durée, taille, renderer, repli et erreurs |
| Logs HTTP par requête | Absents | Aucun middleware ou intercepteur de journalisation HTTP n'est configuré |
| Identifiant de corrélation | Absent | Aucun request ID, correlation ID ou trace ID n'est créé ou propagé |
| Persistance d'audit | Absente | Aucun modèle Prisma ou fichier de stockage dédié aux événements d'audit |
| Métriques applicatives | Absentes | Aucun compteur, registre ou endpoint de métriques |
| Traçage distribué | Absent | Aucun SDK ou exporteur de traces |
| Plateforme externe d'observabilité | Absente | Aucun composant Prometheus, Grafana, Loki, ELK, Sentry, Datadog ou OpenTelemetry dans les configurations exécutables |
| Alertes | Absentes | Aucun mécanisme d'alerte n'est configuré dans le dépôt |
| Rotation et rétention | Absentes | Aucune politique de rotation ou de conservation des logs n'est définie |

# 3. Journalisation applicative

## 3.1 Démarrage du backend

`apps/backend/src/main.ts` utilise le logger statique NestJS avec le contexte `Bootstrap`.

| Niveau | Moment | Données journalisées | Condition |
|---|---|---|---|
| `log` | Après l'écoute HTTP | Port d'écoute et préfixe `/api/v1` | Tous les environnements |
| `log` | Après l'écoute HTTP | Activation de la sécurité de pointage, présence de la localisation, rayon autorisé et état de configuration Cloudinary | Lorsque `NODE_ENV` n'est pas `production` |

Le bootstrap ne remplace pas le logger NestJS et ne définit pas de niveaux personnalisés. Aucun secret Cloudinary, JWT ou PostgreSQL n'est écrit par ces messages.

## 3.2 Limitation des connexions PIN

`AppThrottlerGuard` journalise uniquement les blocages produits par les deux limiteurs nommés du parcours PIN. L'avertissement contient :

- la route reçue ;
- l'adresse utilisée comme tracker ;
- le User-Agent ou la chaîne `unknown` ;
- le nom du limiteur ;
- un horodatage ISO.

Ce message est émis au niveau `warn` avant l'exception HTTP `429`. Les blocages du limiteur général et du limiteur de connexion administrative utilisent le comportement du `ThrottlerGuard`, sans appel de journalisation personnalisé dans `AppThrottlerGuard`.

## 3.3 Stockage des photos de vérification

`AttendancePhotoStorageService` crée un logger avec le contexte de sa classe. Les événements sont sérialisés en JSON avant leur émission.

| Niveau | Événement | Champs observés |
|---|---|---|
| `warn` | `cloudinary_upload_retry` | `publicId`, tentative courante, prochaine tentative, statut HTTP amont, indicateur de timeout et message |
| `error` | `cloudinary_upload_failed` | `publicId`, statut HTTP amont, indicateur de timeout et message final |

Le service ne journalise pas la Data URL de la photo, la clé API ni le secret Cloudinary. Une réussite de téléversement ne produit pas de ligne explicite dans ce service.

## 3.4 Export PDF mensuel

`MonthlyAttendancePdfExporterService` journalise le cycle de génération PDF avec le contexte de sa classe.

| Niveau | Situation | Données observées |
|---|---|---|
| `log` | Début de génération | Renderer, type de rapport et nom du fichier |
| `log` | Génération terminée | Renderer, type de rapport, durée en millisecondes, taille en octets et nom du fichier |
| `warn` | Renderer historique sélectionné | Mode `legacy` actif |
| `warn` | Repli après échec Puppeteer | Activation du repli, type de rapport et nom du fichier |
| `error` | Échec Puppeteer | Message et stack lorsque l'erreur en contient une |
| `error` | Renderer premium indisponible | Indisponibilité et repli désactivé |

La durée et la taille du PDF sont des valeurs incluses dans des lignes de log. Elles ne sont pas enregistrées dans un système de métriques.

## 3.5 Éléments sans journal applicatif dédié

Aucun logger explicite n'est présent dans les services d'authentification, d'employés, de plannings, de calendrier, de sanctions, de Dashboard ou dans `PrismaService`. Aucun middleware ne journalise automatiquement la méthode, l'URL, le statut et la durée de chaque requête HTTP. Aucun journal Prisma des requêtes SQL n'est activé dans l'instanciation de `PrismaClient`.

# 4. Audit

## 4.1 Format de l'événement

`AuditLogService` est fourni par un module global. Sa méthode `logAdminAction()` produit une chaîne JSON au niveau `warn` avec le contexte `AdminAudit`.

| Champ | Origine |
|---|---|
| `event` | Valeur constante `admin_audit` |
| `occurredAt` | Horodatage ISO créé au moment de l'appel |
| `actorId` | Identifiant de l'utilisateur authentifié |
| `actorEmail` | Courriel de l'utilisateur authentifié |
| `actorRole` | Rôle d'accès de l'utilisateur authentifié |
| `action` | Identifiant d'action fourni par le contrôleur |
| `resource` | Type de ressource fourni par le contrôleur |
| `resourceId` | Identifiant de ressource ou `null` |
| `metadata` | Objet propre à l'action, ou objet vide |

L'appel d'audit intervient après l'attente du service métier. Une mutation qui échoue avant son retour ne passe donc pas par l'appel d'audit placé ensuite dans le contrôleur.

## 4.2 Actions auditées

| Domaine | Actions observées | Métadonnées principales | Source |
|---|---|---|---|
| Employés | `employee.create`, `employee.update`, `employee.status.update`, `employee.role.assign`, `employee.department.assign`, `employee.schedule.assign` | Courriel, rôle d'accès, planning, statut, champs modifiés, rôle ou département | `apps/backend/src/modules/employees/employees.controller.ts` |
| Plannings | `schedule.create`, `schedule.update`, `schedule.status.update` | Nom, horaires, jours, statut ou champs modifiés | `apps/backend/src/modules/schedules/schedules.controller.ts` |
| Calendrier | `calendar.entry.create`, `calendar.entry.update`, `calendar.entry.delete` | Nom, date, type ou champs modifiés | `apps/backend/src/modules/calendar/calendar.controller.ts` |
| Pointage administratif | `attendance.admin_check_in`, `attendance.admin_check_out` | Identifiant employé et horodatage fourni | `apps/backend/src/modules/attendance/attendance.controller.ts` |
| Export mensuel | `attendance.monthly_export` | Mois, année, format, employé éventuel et nom de fichier | `apps/backend/src/modules/attendance/attendance.controller.ts` |

Ces contrôleurs contiennent quinze appels à `logAdminAction()`. Les événements ne contiennent pas les mots de passe, les codes PIN, les jetons JWT ou le contenu des photos.

## 4.3 Périmètre non audité par ce service

Les lectures `GET`, les tentatives de connexion, les pointages exécutés par les routes employé, les mises à jour de règles de sanction et les échecs de mutation ne déclenchent pas `AuditLogService` dans les contrôleurs actuels.

Le schéma Prisma ne contient pas de modèle d'audit. `AuditLogService` ne reçoit pas `PrismaService` et n'écrit ni dans PostgreSQL ni dans un fichier. Le dépôt ne fournit pas de route API pour consulter les événements d'audit.

# 5. Traçabilité

## 5.1 Identifiants disponibles

La traçabilité des mutations auditées repose sur l'identité extraite du JWT par `CurrentUser`, l'identifiant de ressource, l'action, la ressource et l'horodatage de l'événement. Les métadonnées ajoutent les critères propres à chaque opération.

Les logs Cloudinary utilisent un `publicId` construit avec la date, l'identifiant employé, le motif et l'instant du pointage. Les journaux PDF utilisent le nom du fichier et le type de rapport. Le journal de throttling PIN utilise la route, l'adresse du client, le User-Agent et le nom du limiteur.

Ces identifiants sont propres à chaque mécanisme. Aucun identifiant commun de requête ne relie automatiquement une ligne d'audit, un log de service et une réponse HTTP.

## 5.2 Sortie et conservation

Le backend n'installe aucun logger personnalisé dans `NestFactory.create()` et aucune dépendance Winston ou Pino n'est déclarée dans `apps/backend/package.json`. Docker Compose ne définit aucun driver ou paramètre de journalisation. Les fichiers exécutables ne définissent donc pas de destination persistante, de format global, de rotation ou de durée de rétention pour les sorties du logger NestJS.

Le endpoint `/api/v1/health` expose un état, un nom de service et un horodatage, mais il n'écrit pas de journal et ne produit pas de métrique.

# 6. Flux de journalisation

```text
Client authentifié
    |
    v
Controller de mutation administrative
    |
    v
Service métier
    |
    +-- exception ----------------------> réponse HTTP, sans audit AdminAudit
    |
    +-- succès
          |
          v
    AuditLogService.logAdminAction()
          |
          v
    Logger NestJS, niveau warn
          |
          v
    Ligne JSON dans la sortie du processus
          |
          v
    Réponse HTTP du contrôleur
```

Les autres flux journalisés appellent directement leur logger : le guard lors d'un blocage PIN, le service photo lors d'une reprise ou d'un échec, le service PDF aux étapes de génération et le bootstrap au démarrage.

# 7. Références

| Mécanisme | Fichier ou répertoire source | Preuve observée |
|---|---|---|
| Logs de bootstrap | `apps/backend/src/main.ts` | Deux appels à `Logger.log`, dont un conditionnel hors production |
| Service d'audit | `apps/backend/src/common/audit/audit-log.service.ts` | Événement JSON `admin_audit` et champs de traçabilité |
| Module d'audit | `apps/backend/src/common/audit/audit-log.module.ts` | Module global exportant `AuditLogService` |
| Enregistrement de l'audit | `apps/backend/src/app.module.ts` | Import de `AuditLogModule` |
| Audit employés | `apps/backend/src/modules/employees/employees.controller.ts` | Six actions après mutation réussie |
| Audit plannings | `apps/backend/src/modules/schedules/schedules.controller.ts` | Trois actions après mutation réussie |
| Audit calendrier | `apps/backend/src/modules/calendar/calendar.controller.ts` | Trois actions après mutation réussie |
| Audit pointages et export | `apps/backend/src/modules/attendance/attendance.controller.ts` | Deux actions de pointage administratif et une action d'export |
| Blocage PIN | `apps/backend/src/common/security/app-throttler.guard.ts` | Avertissement avec route, tracker, User-Agent, limiteur et timestamp |
| Configuration des limiteurs | `apps/backend/src/app.module.ts` | Limiteurs nommés du parcours PIN et guard global |
| Logs Cloudinary | `apps/backend/src/modules/attendance/attendance-photo-storage.service.ts` | Événements JSON de reprise et d'échec |
| Logs PDF | `apps/backend/src/modules/attendance/exports/monthly-attendance-pdf-exporter.service.ts` | Début, résultat, durée, taille, repli et erreur |
| Absence de persistance d'audit | `apps/backend/prisma/schema.prisma` | Aucun modèle d'audit |
| Logger Prisma | `apps/backend/src/common/prisma/prisma.service.ts` | `PrismaClient` étendu sans option de logs SQL |
| Dépendances de journalisation | `apps/backend/package.json` | Aucun transport Winston, Pino ou SDK d'observabilité |
| Configuration des conteneurs | `docker-compose.yml` | Aucun service d'observabilité ni configuration `logging` |
| Santé | `apps/backend/src/modules/health/health.controller.ts` | Réponse de santé sans appel au logger |

# 8. Observations

- La journalisation explicite emploie exclusivement le `Logger` NestJS avec les niveaux `log`, `warn` et `error`.
- Les événements d'audit sont structurés en JSON, tandis que les logs de bootstrap, de throttling PIN et de rendu PDF utilisent des messages textuels.
- Les événements Cloudinary de reprise et d'échec sont également structurés en JSON.
- L'audit couvre quinze mutations administratives réussies dans quatre contrôleurs.
- Aucun événement d'audit n'est persisté par Prisma et aucune API de consultation d'audit n'est exposée.
- Aucun log HTTP systématique, identifiant de corrélation, métrique, trace distribuée, alerte ou plateforme externe d'observabilité n'est configuré.
- Aucune politique de rotation ou de rétention n'est définie dans le dépôt.
