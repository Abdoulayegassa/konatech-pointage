# 1. Présentation

La journalisation et l'audit du projet reposent sur le logger NestJS et sur un service d'audit dédié aux actions d'administration. Les événements d'audit sont écrits dans la sortie des logs applicatifs ; aucun stockage d'audit séparé n'est défini.

# 2. Journalisation

Le backend utilise `Logger` de NestJS dans le bootstrap pour écrire :

- l'état de la politique de sécurité du pointage en environnement non production ;
- la disponibilité du backend et son préfixe API au démarrage.

Le script `scripts/validate-proxy.mjs` capture `stdout` et `stderr` des processus backend et frontend, préfixe les lignes par le nom du service et conserve un tampon des lignes récentes pendant la validation.

# 3. Audit des actions

`AuditLogService` expose `logAdminAction`. Il sérialise un événement JSON avec l'identifiant et l'e-mail de l'acteur, son rôle, l'action, la ressource, l'identifiant de ressource, les métadonnées et la date ISO, puis l'écrit avec `logger.warn` sous le logger `AdminAudit`.

Les contrôleurs qui appellent ce service sont :

| Domaine | Actions auditées observées |
|---|---|
| Employés | `employee.create`, `employee.update`, `employee.status.update`, `employee.role.assign`, `employee.department.assign`, `employee.schedule.assign` |
| Plannings | `schedule.create`, `schedule.update`, `schedule.status.update` |
| Calendrier | `calendar.entry.create`, `calendar.entry.update`, `calendar.entry.delete` |
| Pointage et exports | `attendance.admin_check_in`, `attendance.admin_check_out`, `attendance.monthly_export` |

# 4. Traçabilité

Chaque événement d'audit contient les champs suivants :

| Champ | Origine |
|---|---|
| `event` | Valeur constante `admin_audit`. |
| `occurredAt` | Date et heure générées lors de l'appel. |
| `actorId`, `actorEmail`, `actorRole` | Utilisateur authentifié fourni par `CurrentUser`. |
| `action` | Identifiant d'action transmis par le contrôleur. |
| `resource`, `resourceId` | Ressource ciblée et identifiant éventuellement fourni. |
| `metadata` | Informations contextuelles propres à l'opération. |

Le service n'écrit pas ces événements dans Prisma ou PostgreSQL. Aucun modèle Prisma, endpoint de consultation d'audit, interceptor de traçage global ou système de métriques n'est défini pour ces événements dans les fichiers analysés.

# 5. Vérification

Les journaux applicatifs peuvent être consultés avec la commande Compose documentée :

```bash
docker compose --env-file .env.production logs -f backend frontend postgres
```

En développement, les messages du bootstrap et du logger `AdminAudit` sont écrits dans la sortie du processus backend lancé par `pnpm dev` ou `pnpm dev:backend`. Le script `pnpm test:proxy` expose également les sorties capturées lorsqu'un contrôle frontend/backend échoue (`scripts/validate-proxy.mjs`).

# 6. Références

| Élément documenté | Fichiers analysés |
|---|---|
| Service d'audit et structure JSON | `apps/backend/src/common/audit/audit-log.service.ts` |
| Module d'enregistrement du service | `apps/backend/src/common/audit/audit-log.module.ts`, `apps/backend/src/app.module.ts` |
| Actions employés et plannings | `apps/backend/src/modules/employees/employees.controller.ts`, `apps/backend/src/modules/schedules/schedules.controller.ts` |
| Actions calendrier et pointage | `apps/backend/src/modules/calendar/calendar.controller.ts`, `apps/backend/src/modules/attendance/attendance.controller.ts` |
| Logs de démarrage | `apps/backend/src/main.ts` |
| Capture des sorties de processus | `scripts/validate-proxy.mjs` |
| Consultation des logs Compose | `docker-compose.yml`, `README.md` |

---

Document ID : SG-006  
Titre : Journalisation et audit  
Version : 1.0  
Statut : Validé  
Classification : Interne  
Référence : Security Guide  
Projet : Konatech Pointage
