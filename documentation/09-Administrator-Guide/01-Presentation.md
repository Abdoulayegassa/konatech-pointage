Document ID : AG-001  

Titre : Présentation

Version : 1.0

Statut : Validé

Classification : Interne

Référence : Administrator Guide

Projet : Konatech Pointage

> **Périmètre courant :** le dashboard organisation sous `/dashboard` agrège les données de l'entreprise. Les sites ont des dashboards opérationnels séparés sous `/site/[siteId]/...`; l'identifiant d'URL ne constitue pas une autorisation. Les rôles produit courants sont SUPER ADMIN SAAS, ADMIN ENTREPRISE et EMPLOYEE. Voir `PROJECT_PLAN.md` et `CURRENT_STATUS.md` pour les contrats et écarts vérifiés.

# 1. Présentation

Dans Konatech Pointage, l'administrateur est un utilisateur dont le champ `accessRole` vaut `ADMIN`. Ce rôle ouvre la vue opérationnelle du jour et les modules de gestion exposés par l'interface Next.js. Les mêmes contrôles sont appliqués côté backend par le garde de rôles NestJS.

L'administrateur peut consulter les données de présence de l'organisation, gérer les comptes employés et leurs affectations, gérer les plannings et le calendrier RH, consulter les sanctions et générer les rapports mensuels disponibles.

# 2. Objectifs du guide

Ce guide décrit les écrans et les routes réellement accessibles à un compte `ADMIN` dans le dépôt : connexion, tableau de bord, historique RH, gestion des employés, gestion des plannings, exports PDF, calendrier RH et sanctions RH.

Le périmètre est limité aux comportements implémentés dans `apps/frontend/app/`, aux composants utilisés par ces pages et aux contrôleurs et services NestJS correspondants. Les fonctionnalités employé de `/my-attendance` et `/attendance-entry` ne constituent pas des modules d'administration.

# 3. Fonctionnalités administrateur

| Module | Description |
|---|---|
| Tableau de bord | Affiche la situation opérationnelle du jour, les métriques de présence, les retards, absences, départs anticipés, heures supplémentaires, l'activité récente et le QR Code de pointage. |
| Historique RH | Charge l'historique mensuel des pointages et permet la lecture des données RH dans l'espace « Historique RH ». |
| Employés | Liste et gère les comptes employés, leurs informations, leur statut, leur rôle d'accès, leur département, leur planning et leur PIN selon les contrôles du module. |
| Plannings | Liste, crée, modifie et active ou désactive les plannings contenant horaires, jours travaillés et marge de retard. |
| Exports PDF | Prépare et télécharge les rapports mensuels RH au format PDF selon les paramètres exposés par le composant d'export. |
| Calendrier RH | Consulte un mois et gère les événements de calendrier utilisés pour la classification des journées de travail. |
| Sanctions RH | Consulte les résultats mensuels et les règles de sanction accessibles dans les onglets de la page. |
| Pointages administratifs | Les contrôleurs d'attendance exposent aux administrateurs la consultation de synthèse et d'historique ainsi que les opérations d'entrée et de sortie administratives. |

# 4. Public concerné

Ce guide s'adresse aux utilisateurs authentifiés dont le compte porte le rôle applicatif `ADMIN`. Le code ne déduit pas d'organisation humaine supplémentaire à partir de ce rôle : `ADMIN` est une valeur technique contrôlée par le frontend et le backend.

Un compte dont le rôle n'est pas `ADMIN` est redirigé depuis les pages administratives vers `/my-attendance`. Les contrôleurs backend correspondants rejettent également les rôles non autorisés.

# 5. Prérequis

Les prérequis démontrables dans le dépôt sont :

- un compte employé existant, actif et portant `accessRole: ADMIN` ;
- une adresse électronique et un mot de passe conformes au DTO de connexion ;
- une session de compte créée après `POST /api/v1/auth/login` et conservée dans le cookie `konatech_session` ;
- une API backend accessible pour charger les données des modules ;
- une base PostgreSQL accessible au backend via Prisma pour les lectures et écritures administratives.

Les pages administratives vérifient d'abord l'utilisateur courant, puis son rôle, avant de charger leurs données. Le frontend utilise la session de compte pour transmettre le JWT au backend sous la forme `Bearer`.

# 6. Organisation du guide

Dans l'état observé du dépôt, le répertoire `documentation/09-Administrator-Guide/` contient uniquement le présent chapitre `AG-001`. Aucun fichier correspondant aux identifiants `AG-002` à `AG-012` n'est présent dans ce répertoire au moment de l'analyse ; ils ne sont donc pas documentés comme des chapitres existants.

# 7. Références

| Élément documenté | Fichier source | Preuve observée |
|---|---|---|
| Rôle et authentification administrateur | `apps/frontend/app/login/page.tsx`, `apps/frontend/lib/redirect.ts`, `apps/backend/src/modules/auth/auth.service.ts` | Le rôle `ADMIN` détermine la destination `/` et le backend vérifie le compte actif avant d'émettre le JWT. |
| Protection frontend des pages administratives | `apps/frontend/app/page.tsx`, `apps/frontend/app/attendance-history/page.tsx`, `apps/frontend/app/employees/page.tsx`, `apps/frontend/app/schedules/page.tsx`, `apps/frontend/app/calendar/page.tsx`, `apps/frontend/app/sanctions/page.tsx`, `apps/frontend/app/exports/page.tsx` | Chaque page exige un utilisateur courant et redirige un rôle différent de `ADMIN` vers `/my-attendance`. |
| Navigation des modules | `apps/frontend/components/admin/admin-nav.tsx` | Groupes « Pilotage », « Pointages », « Équipe » et « Règles RH » avec les routes de dashboard, historique, exports, employés, plannings, calendrier et sanctions. |
| Tableau de bord d'organisation | `apps/frontend/app/dashboard/page.tsx`, `apps/backend/src/modules/dashboard/dashboard.controller.ts`, `apps/backend/src/modules/dashboard/dashboard.service.ts` | Vue agrégée de l'organisation, métriques, activité et QR Code de pointage. |
| Tableau de bord de site | `apps/frontend/app/site/[siteId]/dashboard/page.tsx` | Dashboard opérationnel limité au site autorisé. |
| Historique RH | `apps/frontend/app/attendance-history/page.tsx`, `apps/backend/src/modules/attendance/attendance.controller.ts`, `apps/backend/src/modules/attendance/attendance.service.ts` | Chargement de l'historique mensuel et contrôles `ADMIN`. |
| Gestion des employés | `apps/frontend/app/employees/page.tsx`, `apps/frontend/components/employees/admin-employees-manager.tsx`, `apps/backend/src/modules/employees/employees.controller.ts` | Interface de gestion et contrôleur entièrement protégé par `ADMIN`. |
| Gestion des plannings | `apps/frontend/app/schedules/page.tsx`, `apps/frontend/components/schedules/admin-schedules-manager.tsx`, `apps/backend/src/modules/schedules/schedules.controller.ts` | Horaires, jours actifs et affectations exposés à l'administrateur. |
| Exports PDF | `apps/frontend/app/exports/page.tsx`, `apps/frontend/components/dashboard/monthly-attendance-export-card.tsx`, `apps/backend/src/modules/attendance/exports/monthly-attendance-pdf-exporter.service.ts` | Page « Exports PDF » et génération des rapports mensuels. |
| Calendrier RH | `apps/frontend/app/calendar/page.tsx`, `apps/frontend/components/calendar/calendar-workspace.tsx`, `apps/backend/src/modules/calendar/calendar.controller.ts` | Sélection mensuelle et gestion des événements RH. |
| Sanctions RH | `apps/frontend/app/sanctions/page.tsx`, `apps/frontend/components/sanctions/sanction-rules-panel.tsx`, `apps/backend/src/modules/sanctions/sanctions.controller.ts` | Résultats mensuels et règles accessibles dans la page protégée. |
| Pointages administratifs | `apps/backend/src/modules/attendance/attendance.controller.ts`, `apps/backend/src/modules/attendance/attendance.service.ts` | Routes de synthèse, historique, entrée et sortie marquées `@Roles(AccessRole.ADMIN)`. |
| Contrôle d'autorisation backend | `apps/backend/src/modules/auth/auth.module.ts`, `apps/backend/src/modules/auth/guards/jwt-auth.guard.ts`, `apps/backend/src/modules/auth/guards/roles.guard.ts` | Gardes globaux JWT et rôles enregistrés comme `APP_GUARD`. |
| Données persistées | `apps/backend/prisma/schema.prisma`, `apps/backend/src/common/prisma/prisma.service.ts` | PostgreSQL via Prisma et modèles employés, plannings, pointages et calendrier. |
| Chapitres Administrator Guide existants | `documentation/09-Administrator-Guide/` | Le répertoire contient le présent fichier et aucun autre chapitre lors de l'analyse. |
