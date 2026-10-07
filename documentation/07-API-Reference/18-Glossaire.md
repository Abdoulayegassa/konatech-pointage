# Glossaire

| Métadonnée | Valeur |
|---|---|
| Document ID | API-018 |
| Titre | Glossaire |
| Version | 1.0 |
| Statut | Validé |
| Classification | Interne |
| Référence | API Reference |
| Projet | Konatech Pointage |

# 1. Présentation

Ce glossaire définit les termes techniques, fonctionnels et métier employés par l'API et la documentation de Konatech Pointage. Chaque définition est rattachée au code, au schéma Prisma, à la configuration ou aux documents présents dans le dépôt.

Les noms anglais conservés correspondent aux identifiants utilisés dans le code. Les libellés français décrivent leur emploi effectif dans l'application.

# 2. Glossaire

| Terme | Définition | Références |
|---|---|---|
| API | Interface HTTP du backend NestJS, exposée sous le préfixe statique `/api/v1`. | `apps/backend/src/main.ts`, `README.md` |
| API REST | Organisation des routes autour de ressources et de méthodes HTTP `GET`, `POST`, `PATCH` et `DELETE`. | Contrôleurs sous `apps/backend/src/modules`, `documentation/02-SAR/12-Architecture-API-REST.md` |
| Endpoint | Combinaison d'une méthode HTTP et d'une route traitée par une méthode de contrôleur. | Contrôleurs sous `apps/backend/src/modules` |
| Route publique | Route portant `@Public()` et contournant le guard JWT global. | `apps/backend/src/modules/auth/decorators/public.decorator.ts`, `apps/backend/src/modules/auth/guards/jwt-auth.guard.ts` |
| Controller | Classe NestJS qui déclare les routes, reçoit les données validées, appelle un service et retourne la réponse. | Contrôleurs sous `apps/backend/src/modules` |
| Service | Fournisseur NestJS contenant les traitements applicatifs, les règles métier ou une intégration technique. | Services sous `apps/backend/src/modules` |
| Module | Classe NestJS qui regroupe contrôleurs et fournisseurs d'un domaine. | Fichiers `*.module.ts` sous `apps/backend/src/modules` |
| DTO | Classe qui décrit les champs reçus et porte leurs décorateurs de validation ou de transformation. | Répertoires `dto` sous `apps/backend/src/modules` |
| ValidationPipe | Pipe global qui valide les DTO, rejette les propriétés non déclarées et active la transformation implicite. | `apps/backend/src/main.ts` |
| Guard | Composant exécuté avant le contrôleur pour limiter le débit, authentifier le jeton ou vérifier le rôle. | `apps/backend/src/common/security/app-throttler.guard.ts`, guards sous `apps/backend/src/modules/auth` |
| Decorator | Annotation TypeScript utilisée par NestJS pour déclarer routes, rôles, routes publiques, utilisateur courant et validation. | `apps/backend/src/modules/auth/decorators`, contrôleurs et DTO |
| Bearer token | Jeton transmis après le schéma `Bearer` dans l'en-tête `Authorization`. | `apps/backend/src/modules/auth/guards/jwt-auth.guard.ts` |
| AccessRole | Énumération Prisma qui distingue les rôles d'accès `ADMIN` et `EMPLOYEE`. | `apps/backend/prisma/schema.prisma` |
| ADMIN | Rôle d'accès autorisé sur les contrôleurs d'administration et les opérations administratives de pointage. | Contrôleurs sous `apps/backend/src/modules`, `apps/backend/prisma/schema.prisma` |
| EMPLOYEE | Rôle d'accès utilisé par les routes de pointage personnel sous `/attendance/me`. | `apps/backend/src/modules/attendance/attendance.controller.ts`, `apps/backend/prisma/schema.prisma` |
| Prisma | Outil utilisé pour décrire le modèle relationnel, générer le client, gérer les migrations et accéder à PostgreSQL. | `apps/backend/prisma/schema.prisma`, `apps/backend/package.json` |
| Prisma Client | Client TypeScript généré qui fournit les opérations `findMany`, `findUnique`, `create`, `update`, `count`, `aggregate` et `groupBy` utilisées par les services. | Services sous `apps/backend/src/modules`, `apps/backend/src/common/prisma/prisma.service.ts` |
| PrismaService | Fournisseur global qui étend `PrismaClient` et ferme la connexion lors de la destruction du module. | `apps/backend/src/common/prisma/prisma.service.ts`, `apps/backend/src/common/prisma/prisma.module.ts` |
| Migration | Fichier SQL versionné qui fait évoluer la structure PostgreSQL conformément au schéma Prisma. | `apps/backend/prisma/migrations` |
| Seed | Script Prisma qui initialise des plannings, employés, pointages et règles de sanction. | `apps/backend/prisma/seed.ts`, `apps/backend/package.json` |
| PostgreSQL | Moteur relationnel configuré comme datasource unique de Prisma. | `apps/backend/prisma/schema.prisma`, `docker-compose.yml` |
| Employee | Modèle Prisma représentant un compte authentifiable et une identité professionnelle, avec rôle d'accès, statut, planning éventuel et pointages. | `apps/backend/prisma/schema.prisma`, `apps/backend/src/modules/employees` |
| employeeIdentifier | Identifiant employé unique généré par le service, distinct du courriel et du champ historique `employeeCode`. | `apps/backend/src/modules/employees/employees.service.ts`, `apps/backend/prisma/schema.prisma` |
| Schedule | Modèle de planning qui contient nom, horaires, marge de retard, état actif et jours travaillés. | `apps/backend/prisma/schema.prisma`, `apps/backend/src/modules/schedules` |
| Attendance | Modèle de pointage quotidien lié à un employé et portant entrée, sortie, statut, retards, résultats de sortie et preuves de vérification. | `apps/backend/prisma/schema.prisma`, `apps/backend/src/modules/attendance` |
| CalendarEntry | Modèle d'entrée calendrier datée, utilisé par l'API pour les jours fériés publics et d'entreprise. | `apps/backend/prisma/schema.prisma`, `apps/backend/src/modules/calendar` |
| SanctionRule | Modèle et configuration de règle qui associent des seuils de retard, une tolérance mensuelle, un montant et une priorité. | `apps/backend/prisma/schema.prisma`, `apps/backend/src/modules/sanctions` |
| Auth | Module qui gère la connexion par courriel et mot de passe, la connexion PIN du pointage, les jetons et l'utilisateur courant. | `apps/backend/src/modules/auth` |
| Dashboard | Module qui agrège des comptages, sommes, activités récentes et classements issus des données de présence. | `apps/backend/src/modules/dashboard` |
| Health | Module public qui retourne l'état `ok`, le nom du service et un horodatage. | `apps/backend/src/modules/health/health.controller.ts` |
| Calendar | Module qui expose la vue mensuelle et la gestion des jours fériés. | `apps/backend/src/modules/calendar` |
| Sanctions | Module qui expose les règles, les calculs mensuels et le résultat lié à un pointage. | `apps/backend/src/modules/sanctions` |
| Check-in | Enregistrement de l'heure d'entrée d'un employé pour une journée de pointage. | `apps/backend/src/modules/attendance/attendance.service.ts` |
| Check-out | Enregistrement de l'heure de sortie après un check-in existant pour la même journée. | `apps/backend/src/modules/attendance/attendance.service.ts` |
| Attendance Entry | Parcours frontend `/attendance-entry` ouvert depuis le point d'entrée fixe, puis authentifié par PIN avant le pointage personnel. | `apps/backend/src/modules/attendance/attendance-entry.service.ts`, `apps/frontend/app/attendance-entry` |
| QR Code | Code généré dans le Dashboard frontend pour ouvrir le point d'entrée public du parcours de pointage. | `apps/frontend/components/dashboard/attendance-entry-qr-card.tsx`, `apps/frontend/types/qrcode.d.ts` |
| PIN | Code personnel employé de quatre chiffres utilisé pour la connexion au parcours Attendance Entry. | `apps/backend/src/modules/auth/dto/attendance-entry-login.dto.ts`, `apps/backend/src/common/validation/pin-code.validation.ts` |
| AttendanceStatus | Énumération des états `PRESENT`, `LATE`, `INCOMPLETE`, `ABSENT` et `NON_WORKING_DAY_WORK`. | `apps/backend/prisma/schema.prisma` |
| Schedule snapshot | Copie dans un pointage des informations du planning applicables au moment de l'enregistrement. | Champs `schedule*Snapshot` dans `apps/backend/prisma/schema.prisma`, `apps/backend/src/common/utils/attendance-schedule-snapshot.util.ts` |
| Security policy | Configuration conditionnelle du contrôle de position : coordonnées d'entreprise, rayons et précision maximale. | `apps/backend/src/modules/attendance/attendance-security-policy.service.ts` |
| Geofencing | Comparaison de la position du pointage à la position de l'entreprise au moyen d'une distance et de rayons configurés. | `apps/backend/src/modules/attendance/attendance-security-policy.service.ts`, `README.md` |
| Verification method | Énumération indiquant l'absence de preuve, une preuve GPS ou une preuve photo. | `AttendanceVerificationMethod` dans `apps/backend/prisma/schema.prisma` |
| Verification level | Énumération `OK`, `WARNING` ou `STRICT` associée au résultat de sécurité du pointage. | `AttendanceVerificationLevel` dans `apps/backend/prisma/schema.prisma` |
| Verification photo | Image JPEG, JPG, PNG ou WebP reçue comme Data URL et stockée par le service photo lorsqu'elle est exigée. | `apps/backend/src/modules/attendance/dto/check-in-security.dto.ts`, `apps/backend/src/modules/attendance/attendance-photo-storage.service.ts` |
| Cloudinary | API HTTPS intégrée pour téléverser les photos de vérification et retourner leur URL sécurisée et identifiant public. | `apps/backend/src/modules/attendance/attendance-photo-storage.service.ts` |
| Export mensuel | Production d'un rapport de présence pour un mois et une année, global ou limité à un employé. | `apps/backend/src/modules/attendance/attendance.controller.ts`, services sous `apps/backend/src/modules/attendance/exports` |
| CSV | Format texte tabulaire produit par l'exporteur mensuel CSV. | `apps/backend/src/modules/attendance/exports/monthly-attendance-csv-exporter.service.ts` |
| PDF | Format documentaire produit par le renderer Puppeteer ou par le renderer historique explicitement sélectionné ou autorisé en repli. | `apps/backend/src/modules/attendance/exports/monthly-attendance-pdf-exporter.service.ts` |
| Puppeteer | Bibliothèque qui lance Chromium en mode headless et transforme le document HTML du rapport en PDF. | `apps/backend/src/modules/attendance/exports/monthly-attendance-puppeteer-pdf-renderer.service.ts` |
| Chromium | Navigateur installé dans l'image backend et piloté localement pour le rendu PDF premium. | `docker/backend.Dockerfile`, `apps/backend/src/modules/attendance/exports/monthly-attendance-puppeteer-pdf-renderer.service.ts` |
| Audit Log | Événement JSON `admin_audit` émis par le logger NestJS après certaines mutations administratives réussies. | `apps/backend/src/common/audit/audit-log.service.ts`, contrôleurs audités |
| Throttling | Limitation du nombre de requêtes admises pendant une fenêtre, appliquée globalement et renforcée sur les connexions. | `apps/backend/src/app.module.ts`, `apps/backend/src/common/security/app-throttler.guard.ts` |
| Cloudinary retry | Nouvelle tentative conditionnelle d'un téléversement photo après timeout ou statut amont considéré comme réessayable. | `apps/backend/src/modules/attendance/attendance-photo-storage.service.ts` |
| Docker Compose | Configuration locale des services PostgreSQL, backend et frontend, avec healthchecks et dépendances de démarrage. | `docker-compose.yml` |
| Environment variable | Valeur de configuration lue par `ConfigModule`, `ConfigService`, Prisma ou les scripts, sans être codée dans les services. | `apps/backend/src/app.module.ts`, `apps/backend/.env.example` |

# 3. Acronymes

| Acronyme | Signification dans le projet | Emploi vérifié | Références |
|---|---|---|---|
| API | Interface de programmation applicative | Backend HTTP sous `/api/v1` | `apps/backend/src/main.ts`, `README.md` |
| CORS | Partage de ressources entre origines | Autorise l'origine exacte fournie par `FRONTEND_URL` avec credentials | `apps/backend/src/main.ts` |
| CSV | Valeurs séparées par des virgules | Format d'export mensuel textuel | `apps/backend/src/modules/attendance/exports/monthly-attendance-csv-exporter.service.ts` |
| DTO | Objet de transfert de données | Classes d'entrée validées par le pipe global | Répertoires `dto` sous `apps/backend/src/modules` |
| GPS | Système de positionnement | Coordonnées et précision des preuves de pointage | DTO et services de sécurité du module `attendance` |
| HTTP | Protocole de transfert hypertexte | Transport des routes et réponses de l'API | Contrôleurs sous `apps/backend/src/modules` |
| JSON | Notation objet JavaScript | Format des corps API et des événements d'audit structurés | `apps/backend/src/main.ts`, `apps/backend/src/common/audit/audit-log.service.ts` |
| JWT | Jeton Web JSON | Jeton signé utilisé dans l'authentification Bearer | `apps/backend/src/common/security/jwt.util.ts`, module `auth` |
| PDF | Format de document portable | Format d'export mensuel et poster QR frontend | Services d'export PDF, `apps/frontend/components/dashboard/attendance-entry-qr-card.tsx` |
| PIN | Numéro d'identification personnel | Code à quatre chiffres du parcours employé | DTO de connexion Attendance Entry et validation PIN |
| QR | Réponse rapide | Code visuel qui encode le lien fixe de pointage | `apps/frontend/components/dashboard/attendance-entry-qr-card.tsx` |
| REST | Transfert d'état représentationnel | Qualification de l'architecture des routes de ressources | `documentation/02-SAR/12-Architecture-API-REST.md` |
| RH | Ressources humaines | Calendrier, exports et rapports mensuels destinés à l'administration | `documentation/02-SAR/07-Module-Calendrier-RH.md`, services d'export |
| SQL | Langage de requête structuré | Fichiers de migration PostgreSQL produits pour Prisma | `apps/backend/prisma/migrations` |
| UTC | Temps universel coordonné | Normalisation de dates de pointage et calculs mensuels | `apps/backend/src/common/utils/attendance-date.util.ts` |
| UUID | Identifiant universel unique | Clés primaires Prisma et paramètres validés de plusieurs routes | `apps/backend/prisma/schema.prisma`, contrôleurs employant `ParseUUIDPipe` |

# 4. Concepts métier

| Concept | Définition observée | Références |
|---|---|---|
| Présent (`PRESENT`) | Pointage complété sans retard positif sur un jour planifié, ou travail hors planning traité comme présent. | `apps/backend/src/modules/attendance/attendance.service.ts` |
| En retard (`LATE`) | État attribué lorsque `minutesLate` est supérieur à zéro ; il reste l'état complété après la sortie. | `apps/backend/src/modules/attendance/attendance.service.ts` |
| Incomplet (`INCOMPLETE`) | État d'un pointage commencé sur un jour planifié avant qu'une sortie complète son résultat. | `apps/backend/src/modules/attendance/attendance.service.ts` |
| Absent (`ABSENT`) | Enregistrement sans entrée créé pour une journée planifiée non couverte par le calendrier non ouvré. | `apps/backend/src/modules/attendance/attendance-monthly-metrics.service.ts` |
| Travail un jour non ouvré (`NON_WORKING_DAY_WORK`) | État appliqué à un pointage effectué sur une date reconnue comme non ouvrée par le calendrier. | `apps/backend/src/modules/attendance/attendance.service.ts` |
| Jour de pointage | Date normalisée utilisée avec `employeeId` comme clé unique composée d'un enregistrement Attendance. | `apps/backend/prisma/schema.prisma`, `apps/backend/src/common/utils/attendance-date.util.ts` |
| Jour travaillé | Jour présent dans `Schedule.workDays` lorsque le planning est actif et que le calendrier ne le rend pas non ouvré. | `apps/backend/src/common/utils/attendance-date.util.ts`, services `attendance` et `calendar` |
| Marge de retard | Nombre de minutes ajouté à l'heure de début du planning avant le calcul de `minutesLate`. | `apps/backend/prisma/schema.prisma`, `apps/backend/src/modules/attendance/attendance.service.ts` |
| Départ anticipé | Sortie antérieure à l'heure planifiée, représentée par `earlyExit` et `earlyExitMinutes`. | `apps/backend/src/common/utils/attendance-checkout.util.ts`, `apps/backend/prisma/schema.prisma` |
| Sortie tardive | Sortie postérieure à l'heure planifiée, représentée par `lateExit`. | `apps/backend/src/common/utils/attendance-checkout.util.ts`, `apps/backend/prisma/schema.prisma` |
| Heures supplémentaires | Durée positive calculée après l'heure de sortie planifiée ou pour le travail hors planning, stockée en heures et minutes. | `apps/backend/src/common/utils/attendance-checkout.util.ts`, `apps/backend/prisma/schema.prisma` |
| Travail hors planning | Pointage effectué un jour non planifié ou non ouvré, indiqué par `outsideScheduleWork`. | `apps/backend/src/modules/attendance/attendance.service.ts`, `apps/backend/prisma/schema.prisma` |
| Jour férié public | Entrée calendrier du type `PUBLIC_HOLIDAY`, admise par les DTO de création et de mise à jour. | DTO du module `calendar`, `apps/backend/prisma/schema.prisma` |
| Jour férié d'entreprise | Entrée calendrier du type `COMPANY_HOLIDAY`, admise par les DTO de création et de mise à jour. | DTO du module `calendar`, `apps/backend/prisma/schema.prisma` |
| Règle de sanction active | Règle prise en compte par le moteur lorsqu'elle est active et que ses conditions correspondent au retard. | `apps/backend/src/modules/sanctions/sanctions.service.ts` |
| Tolérance mensuelle | Nombre de correspondances antérieures autorisées pour une règle avant qu'une sanction soit appliquée dans le mois. | `apps/backend/src/modules/sanctions/sanctions.service.ts`, `apps/backend/prisma/schema.prisma` |
| Pointage hors zone | Pointage dont la distance dépasse le rayon autorisé ; les routes employé exigent alors une note de justification. | `apps/backend/src/modules/attendance/attendance-security.service.ts` |
| Précision GPS | Valeur en mètres reçue avec la position et comparée au maximum de la politique active. | DTO de sécurité et `apps/backend/src/modules/attendance/attendance-security.service.ts` |
| Historique mensuel | Liste des pointages comprise entre le début inclus et la fin exclue du mois sélectionné. | `apps/backend/src/modules/attendance/attendance.service.ts` |

# 5. Références

| Domaine du glossaire | Fichiers analysés | Éléments établis |
|---|---|---|
| Architecture API | `apps/backend/src/main.ts`, `apps/backend/src/app.module.ts` | Préfixe, validation, CORS, modules et guards globaux |
| Contrats HTTP | Contrôleurs et DTO sous `apps/backend/src/modules` | Routes, ressources, rôles, champs et formats |
| Authentification | `apps/backend/src/modules/auth`, `apps/backend/src/common/security/jwt.util.ts` | JWT, Bearer, routes publiques, PIN et rôles |
| Données | `apps/backend/prisma/schema.prisma` | Modèles, relations, énumérations et contraintes |
| Accès aux données | `apps/backend/src/common/prisma`, services métier | Prisma Client, PrismaService et requêtes |
| Employés | `apps/backend/src/modules/employees` | Compte employé, identifiant, PIN, rôle et planning |
| Plannings | `apps/backend/src/modules/schedules` | Horaires, jours et marge de retard |
| Pointage | `apps/backend/src/modules/attendance`, `apps/backend/src/common/utils` | Entrée, sortie, statuts, sécurité et calculs |
| Calendrier | `apps/backend/src/modules/calendar` | Jours non ouvrés et types exposés |
| Sanctions | `apps/backend/src/modules/sanctions` | Règles, seuils, tolérance et résultats |
| Dashboard et santé | `apps/backend/src/modules/dashboard`, `apps/backend/src/modules/health` | Agrégats et endpoint de disponibilité |
| Exports | `apps/backend/src/modules/attendance/exports` | CSV, PDF, Puppeteer et Chromium |
| Audit | `apps/backend/src/common/audit`, contrôleurs audités | Format et périmètre des événements administratifs |
| Parcours QR | `apps/frontend/components/dashboard/attendance-entry-qr-card.tsx`, `apps/frontend/app/attendance-entry` | Génération du QR et route de saisie du PIN |
| Exécution | `apps/backend/package.json`, `docker-compose.yml`, `docker/backend.Dockerfile` | Dépendances, PostgreSQL, Docker et Chromium |
| Documentation transverse | `README.md`, `documentation/02-SAR`, `documentation/03-SMOD`, `documentation/04-UAG`, `documentation/05-Installation-Guide`, `documentation/06-Developer-Guide`, `documentation/07-API-Reference`, `documentation/07-Operations-Guide` | Terminologie technique, métier et opérationnelle employée dans le dépôt |

# 6. Observations

- Le vocabulaire de l'API reprend principalement les noms anglais des classes NestJS et des modèles Prisma.
- `Employee` représente à la fois les comptes ayant le rôle d'accès `ADMIN` et ceux ayant le rôle `EMPLOYEE` ; aucun second modèle de compte n'est défini.
- Le terme `role` du modèle Employee est un libellé métier, tandis que `accessRole` porte l'autorisation `ADMIN` ou `EMPLOYEE`.
- Les états de présence, méthodes de vérification et niveaux de vérification sont des énumérations distinctes dans le schéma Prisma.
- Le parcours de pointage employé relie le QR Code, la route `/attendance-entry`, le PIN, un JWT associé au compte employé et les opérations `/attendance/me`.
- Les exports CSV et PDF sont deux représentations d'un rapport mensuel construit par les mêmes services de données.
- L'Audit Log désigne une sortie JSON du logger NestJS et non un modèle persistant.
