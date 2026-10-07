# Rapports & Export

| Métadonnée | Valeur |
| --- | --- |
| Document ID | UAG-REP-001 |
| Titre | Rapports & Export |
| Version | 1.0 |
| Statut | Validé |
| Classification | Interne |
| Référence | UAG |
| Date de génération | 30 juillet 2026 |

## 1. Présentation

### 1.1 Objectif du module

Le module Rapports & Export permet à l'administrateur de générer un rapport
mensuel de présence pour toute l'équipe ou pour un employé déterminé.

L'écran `/exports` est présenté comme le centre des rapports RH. Il fournit
une sélection de période et de périmètre, puis déclenche la génération et le
téléchargement du fichier.

Références :
`apps/frontend/app/exports/page.tsx`,
`apps/frontend/components/dashboard/monthly-attendance-export-card.tsx`.

### 1.2 Rôle des rapports

Le rapport mensuel consolide les données de pointage avec les plannings, le
calendrier des jours non ouvrés, les sanctions et les informations de contrôle
GPS.

Deux périmètres sont observés :

| Périmètre | Résultat |
| --- | --- |
| Toute l'équipe | Synthèse globale et tableau consolidé par employé |
| Un employé | Synthèse individuelle, analyses et journal quotidien |

Le rapport est calculé au moment de la demande à partir des employés actifs et
des pointages compris dans le mois sélectionné.

Références :
`apps/backend/src/modules/attendance/exports/monthly-attendance-export.service.ts`,
`apps/backend/src/modules/attendance/exports/monthly-attendance-export.types.ts`.

## 2. Accès au module

### 2.1 Parcours réel

```text
+---------------------------+
| Connexion                 |
| /login                    |
+-------------+-------------+
              |
              v
+---------------------------+
| Dashboard                 |
| /                         |
+-------------+-------------+
              |
              | Exporter un rapport
              | ou navigation Exports PDF
              v
+---------------------------+
| Rapports / Export         |
| /exports                  |
+---------------------------+
```

Le dashboard contient l'action « Exporter un rapport », décrite comme la
génération d'un rapport mensuel RH. La navigation administrateur contient
également l'entrée « Exports PDF ».

Références :
`apps/frontend/components/dashboard/quick-actions-section.tsx`,
`apps/frontend/components/admin/admin-nav.tsx`.

### 2.2 Contrôle d'accès

La page demande un utilisateur authentifié. Un utilisateur dont le rôle n'est
pas `ADMIN` est redirigé vers `/my-attendance`. En l'absence de jeton de
session, la page redirige vers `/login`.

La route backend d'export est elle aussi réservée au rôle `ADMIN`.

Références :
`apps/frontend/app/exports/page.tsx`,
`apps/backend/src/modules/attendance/attendance.controller.ts`.

## 3. Consultation des rapports

### 3.1 Vue disponible dans le module

La page Rapports ne fournit pas d'aperçu du document avant sa génération. Elle
affiche :

- l'intitulé « Rapport mensuel RH » ;
- le format disponible dans l'interface : PDF ;
- le périmètre fonctionnel : équipe ou employé ;
- les catégories annoncées dans le rapport ;
- le formulaire de génération.

Les catégories présentées sont les présences, les retards, les départs
anticipés, les heures supplémentaires, les sanctions et le journal quotidien.

Référence :
`apps/frontend/app/exports/page.tsx`.

### 3.2 Statistiques et synthèse d'équipe

Le rapport d'équipe agrège notamment :

| Indicateur | Origine du calcul |
| --- | --- |
| Présence planifiée | Somme des jours de présence planifiés rapportée aux jours de travail |
| Absences | Somme des absences calculées |
| Retards | Somme des jours avec retard |
| Heures travaillées | Somme des durées entre entrée et sortie |
| Heures supplémentaires | Somme des heures supplémentaires |
| Départs anticipés | Somme des occurrences |

Une vue tabulaire présente ensuite une ligne par employé actif. Les employés
sont ordonnés par nom, puis prénom.

Références :
`apps/backend/src/modules/attendance/exports/monthly-attendance-export.service.ts`,
`apps/backend/src/modules/attendance/exports/monthly-attendance-puppeteer-pdf-renderer.service.ts`.

### 3.3 Synthèse individuelle

Lorsqu'un employé est choisi, le document inclut :

- son nom, son identifiant, son département et son planning ;
- le mois et la date de génération ;
- un score de performance calculé ;
- le taux et les jours de présence ;
- les absences et les retards ;
- les heures travaillées ;
- les heures supplémentaires planifiées et hors planning ;
- les départs anticipés ;
- une ventilation des retards ;
- une synthèse des sanctions et tolérances ;
- une synthèse GPS ;
- une synthèse des sorties ;
- des points d'attention calculés ;
- un journal quotidien.

Références :
`apps/backend/src/modules/attendance/exports/monthly-attendance-export.types.ts`,
`apps/backend/src/modules/attendance/exports/monthly-attendance-export.service.ts`,
`apps/backend/src/modules/attendance/exports/monthly-attendance-puppeteer-pdf-renderer.service.ts`.

### 3.4 Historiques et autres vues

Le module Rapports exploite les pointages du mois demandé, mais ne présente pas
un historique interactif dans la page `/exports`.

Les vues interactives associées existent dans d'autres modules :

| Vue | Emplacement | Contenu |
| --- | --- | --- |
| Historique RH | `/attendance-history` | Tableau filtrable des pointages du mois |
| Dashboard organisation | `/dashboard` | Indicateurs et analyses agrégés de présence |
| Sanctions | `/sanctions` | Synthèse mensuelle et règles |

Ces vues ne sont pas intégrées au formulaire d'export.

Références :
`apps/frontend/app/attendance-history/page.tsx`,
`apps/frontend/app/dashboard/page.tsx`,
`apps/frontend/components/dashboard/dashboard-analytics-section.tsx`,
`apps/frontend/app/sanctions/page.tsx`.

## 4. Export des données

### 4.1 Formats disponibles

| Canal | Formats réellement disponibles |
| --- | --- |
| Interface `/exports` | PDF uniquement |
| Route backend `GET /attendance/exports/monthly` | PDF et CSV |

L'interface fixe systématiquement le paramètre `format` à `pdf`. Le backend
accepte `csv` ou `pdf`. Lorsque le format est omis dans un appel direct à la
route backend, le contrôleur utilise le générateur CSV.

Références :
`apps/frontend/components/dashboard/monthly-attendance-export-card.tsx`,
`apps/backend/src/modules/attendance/dto/monthly-attendance-export-query.dto.ts`,
`apps/backend/src/modules/attendance/attendance.controller.ts`.

### 4.2 Paramètres et période

| Paramètre | Obligatoire | Validation | Utilisation |
| --- | --- | --- | --- |
| `month` | Oui | Entier de 1 à 12 | Mois du rapport |
| `year` | Oui | Entier de 2000 à 2100 | Année du rapport |
| `format` | Non | `csv` ou `pdf` | Type de fichier |
| `employeeId` | Non | UUID | Limitation à un employé |

Dans l'interface :

- le mois et l'année UTC courants sont sélectionnés initialement ;
- les douze mois sont proposés ;
- l'année est saisie dans un champ numérique borné de 2000 à 2100 ;
- le périmètre initial est « Toute l'équipe » ;
- la liste des employés est chargée par `GET /api/employees`.

Références :
`apps/frontend/components/dashboard/monthly-attendance-export-card.tsx`,
`apps/backend/src/modules/attendance/dto/monthly-attendance-export-query.dto.ts`.

### 4.3 Génération

Le cycle de génération est :

```text
+--------------------------+
| Mois, année, périmètre   |
+------------+-------------+
             |
             v
+--------------------------+
| Validation du formulaire |
+------------+-------------+
             |
             v
+--------------------------+
| Construction du rapport  |
| Pointages + planning      |
| calendrier + sanctions   |
+------------+-------------+
             |
             v
+--------------------------+
| Rendu PDF ou CSV         |
+------------+-------------+
             |
             v
+--------------------------+
| Téléchargement           |
+--------------------------+
```

Le backend sélectionne les employés actifs du périmètre, charge leurs
pointages du mois, calcule les absences jusqu'à la date applicable, récupère
les sanctions mensuelles et les jours non ouvrés, puis construit le rapport.

Pour un PDF, le moteur par défaut utilise Puppeteer. Un générateur PDF
historique existe et n'est utilisé que lorsque sa configuration l'active ou
autorise son emploi comme repli.

Références :
`apps/backend/src/modules/attendance/exports/monthly-attendance-export.service.ts`,
`apps/backend/src/modules/attendance/exports/monthly-attendance-pdf-exporter.service.ts`,
`apps/backend/src/modules/attendance/exports/monthly-attendance-puppeteer-pdf-renderer.service.ts`.

### 4.4 Téléchargement et messages

Après réception du fichier, le frontend :

1. crée une URL temporaire à partir du contenu ;
2. crée un lien de téléchargement ;
3. déclenche ce lien ;
4. retire le lien et libère l'URL ;
5. affiche un message confirmant le mois, l'année et éventuellement
   l'employé.

Le nom fourni dans l'en-tête `Content-Disposition` est utilisé. À défaut,
l'interface construit un nom du type
`rapport-presence-<perimetre>-<mois>-<annee>.pdf`.

Pendant le traitement, le bouton affiche « Génération... » et est désactivé.
Après succès, le message indique que le rapport PDF a été téléchargé.

Références :
`apps/frontend/components/dashboard/monthly-attendance-export-card.tsx`,
`apps/backend/src/modules/attendance/attendance.controller.ts`,
`apps/backend/src/modules/attendance/exports/monthly-attendance-pdf-exporter.service.ts`.

### 4.5 Validations et erreurs

Le frontend refuse :

- un mois qui n'est pas un entier compris entre 1 et 12 ;
- une année qui n'est pas un entier compris entre 2000 et 2100.

Le backend applique les mêmes bornes, contrôle le format et exige un UUID pour
`employeeId`. Une erreur de génération est affichée dans la carte. La route
proxy frontend fournit aussi le message de repli « Impossible de générer
l'export mensuel ».

Si le moteur PDF Puppeteer échoue et que le repli historique n'est pas
autorisé, le backend retourne une erreur interne indiquant
l'indisponibilité du moteur PDF.

Références :
`apps/frontend/components/dashboard/monthly-attendance-export-card.tsx`,
`apps/frontend/app/api/attendance/exports/monthly/route.ts`,
`apps/backend/src/modules/attendance/dto/monthly-attendance-export-query.dto.ts`,
`apps/backend/src/modules/attendance/exports/monthly-attendance-pdf-exporter.service.ts`.

## 5. Structure des exports

### 5.1 Rapport PDF d'équipe

Le PDF d'équipe est organisé en synthèse mensuelle et tableau par employé.
Les colonnes du tableau produit par le moteur PDF principal sont :

| Colonne | Donnée |
| --- | --- |
| Employé | Nom complet |
| Planning | Planning affecté ou information d'absence |
| Présence planifiée | Jours de présence rapportés aux jours planifiés |
| Jour non ouvré | Nombre de jours travaillés hors planning |
| Absences | Nombre de jours d'absence |
| Retards | Nombre d'occurrences |
| Pointages | Nombre d'entrées et de sorties |
| Heures | Total travaillé |
| H. supp. planifiées | Heures supplémentaires après service planifié |
| H. supp. jour non ouvré | Heures supplémentaires hors planning |

Le rapport peut occuper plusieurs pages selon le nombre d'employés.

Référence :
`apps/backend/src/modules/attendance/exports/monthly-attendance-puppeteer-pdf-renderer.service.ts`.

### 5.2 Rapport PDF individuel

Le PDF individuel est organisé en :

1. synthèse RH et profil ;
2. score et indicateurs ;
3. analyses des retards, sanctions, GPS et sorties ;
4. points d'attention ;
5. journal quotidien paginé.

Le journal quotidien contient :

| Colonne | Donnée |
| --- | --- |
| Date | Date et jour du pointage |
| Entrée | Heure d'entrée |
| Sortie | Heure de sortie |
| Statut | Libellé de présence |
| Retard | Durée du retard |
| Départs tôt | Durée de sortie anticipée |
| Heures supp. | Durée supplémentaire |
| Sanction | Résultat disciplinaire associé |

Le modèle de données du journal contient aussi le type de travail et le libellé
de vérification GPS. Le moteur PDF principal les exploite dans les analyses
GPS et de travail hors planning ; ils ne constituent pas des colonnes
distinctes dans son tableau quotidien.

Références :
`apps/backend/src/modules/attendance/exports/monthly-attendance-export.types.ts`,
`apps/backend/src/modules/attendance/exports/monthly-attendance-puppeteer-pdf-renderer.service.ts`.

### 5.3 Export CSV

Le CSV contient une ligne par employé actif du périmètre :

| Colonne CSV |
| --- |
| Full Name |
| Employee Identifier |
| Department |
| Assigned Schedule |
| Working Days |
| Scheduled Presence Days |
| Total Worked Days |
| Outside Schedule Work Days |
| Entries |
| Exits |
| Late Days |
| Absent Days |
| Absence Count |
| Incomplete Attendance Days |
| Total Worked Hours |
| Depart anticipe (jours) |
| Depart anticipe (min) |
| Scheduled Overtime Hours |
| Outside Schedule Overtime Hours |
| Heures supplementaires |

Le fichier utilise des virgules, des fins de ligne CRLF, un marqueur UTF-8 BOM
et l'échappement CSV des guillemets, virgules et retours à la ligne. Son nom
est `attendance-export-<annee>-<mois>.csv`.

Référence :
`apps/backend/src/modules/attendance/exports/monthly-attendance-csv-exporter.service.ts`.

### 5.4 Données et contraintes de calcul

- seuls les employés actifs sont inclus ;
- le filtre employé, lorsqu'il est fourni, est appliqué à cette population ;
- seuls les pointages dont la date appartient au mois demandé sont chargés ;
- les pointages sont ordonnés par date croissante dans le détail ;
- les jours non ouvrés ne sont pas comptés comme absences ;
- les absences d'un mois en cours ne sont pas calculées au-delà de la date
  courante utilisée par le service ;
- la présence planifiée dépend du planning et du calendrier ;
- les tentatives GPS bloquées en temps réel ne sont pas historisées dans
  l'export ;
- les photos historiques ne sont pas intégrées comme images au rapport
  mensuel.

Référence :
`apps/backend/src/modules/attendance/exports/monthly-attendance-export.service.ts`.

## 6. Utilisation des données

L'application permet à l'administrateur :

- de télécharger une synthèse mensuelle PDF pour l'équipe ;
- de télécharger un rapport PDF mensuel détaillé pour un employé ;
- d'obtenir, par la route backend, une synthèse tabulaire CSV ;
- de consulter les présences, retards, absences, horaires, écarts de sortie,
  sanctions et contrôles GPS inclus dans le document ;
- de conserver localement le fichier déclenché par le navigateur.

Le dépôt ne contient pas de mécanisme permettant, depuis le module Rapports :

- de modifier les données présentées dans le fichier ;
- de réimporter un export ;
- d'envoyer le rapport par courriel ;
- de planifier une génération ;
- de partager un rapport par un lien applicatif ;
- d'archiver les fichiers générés dans l'application.

Références :
`apps/frontend/app/exports/page.tsx`,
`apps/frontend/components/dashboard/monthly-attendance-export-card.tsx`,
`apps/backend/src/modules/attendance/attendance.controller.ts`.

## 7. Comportements observés

### 7.1 Erreurs et validations

| Situation | Comportement observé |
| --- | --- |
| Mois invalide | Message demandant de sélectionner un mois valide |
| Année invalide | Message demandant une année entre 2000 et 2100 |
| Format backend inconnu | Requête refusée par validation |
| Identifiant employé non UUID | Requête refusée par validation |
| Erreur de l'API | Message retourné ou message générique de génération |
| Moteur PDF indisponible sans repli autorisé | Erreur interne de génération |
| Génération en cours | Bouton désactivé et libellé « Génération... » |

Références :
`apps/frontend/components/dashboard/monthly-attendance-export-card.tsx`,
`apps/backend/src/modules/attendance/dto/monthly-attendance-export-query.dto.ts`,
`apps/backend/src/modules/attendance/exports/monthly-attendance-pdf-exporter.service.ts`.

### 7.2 Chargement des employés

La liste des employés est chargée après l'affichage de la carte. Si cette
requête échoue, aucune erreur dédiée n'est montrée : le choix « Toute
l'équipe » reste disponible et la liste individuelle reste vide.

Référence :
`apps/frontend/components/dashboard/monthly-attendance-export-card.tsx`.

### 7.3 Absence de données

Le service peut produire :

- un rapport d'équipe sans ligne lorsque aucun employé actif ne correspond ;
- un rapport individuel dont `employeeReport` est absent lorsqu'aucun employé
  actif ne correspond à l'identifiant ;
- un journal quotidien vide lorsqu'aucun pointage n'existe sur la période.

Les moteurs PDF possèdent des états explicites pour l'absence de lignes dans
leurs tableaux. L'interface ne vérifie pas préalablement si le périmètre
contient des données.

Références :
`apps/backend/src/modules/attendance/exports/monthly-attendance-export.service.ts`,
`apps/backend/src/modules/attendance/exports/monthly-attendance-pdf-exporter.service.ts`,
`apps/backend/src/modules/attendance/exports/monthly-attendance-puppeteer-pdf-renderer.service.ts`.

### 7.4 Restrictions

- l'accès est limité à `ADMIN` ;
- l'interface exporte uniquement une période mensuelle ;
- l'interface ne propose que le PDF ;
- le périmètre est toute l'équipe ou un seul employé ;
- seuls les employés actifs sont sélectionnés par le générateur ;
- aucun aperçu avant téléchargement n'est présent ;
- le navigateur déclenche un téléchargement immédiat après génération.

## 8. Traçabilité

| Fonctionnalité | Fichiers concernés |
| --- | --- |
| Page Rapports et contrôle d'accès | `apps/frontend/app/exports/page.tsx` |
| Navigation vers les rapports | `apps/frontend/components/admin/admin-nav.tsx` |
| Raccourci du dashboard | `apps/frontend/components/dashboard/quick-actions-section.tsx` |
| Formulaire, validation et téléchargement | `apps/frontend/components/dashboard/monthly-attendance-export-card.tsx` |
| Proxy de téléchargement frontend | `apps/frontend/app/api/attendance/exports/monthly/route.ts` |
| Route backend et sélection du format | `apps/backend/src/modules/attendance/attendance.controller.ts` |
| Validation des paramètres | `apps/backend/src/modules/attendance/dto/monthly-attendance-export-query.dto.ts` |
| Construction des données mensuelles | `apps/backend/src/modules/attendance/exports/monthly-attendance-export.service.ts` |
| Contrats du rapport | `apps/backend/src/modules/attendance/exports/monthly-attendance-export.types.ts` |
| Génération CSV | `apps/backend/src/modules/attendance/exports/monthly-attendance-csv-exporter.service.ts` |
| Coordination PDF et moteur historique | `apps/backend/src/modules/attendance/exports/monthly-attendance-pdf-exporter.service.ts` |
| Moteur PDF principal | `apps/backend/src/modules/attendance/exports/monthly-attendance-puppeteer-pdf-renderer.service.ts` |
| Données de sanctions | `apps/backend/src/modules/sanctions/sanctions.service.ts` |
| Jours non ouvrés | `apps/backend/src/modules/calendar/calendar.service.ts` |
| Politique de sécurité GPS | `apps/backend/src/modules/attendance/attendance-security-policy.service.ts` |

## 9. Observations

### 9.1 Comportements existants

- le rapport est construit à la demande et immédiatement téléchargé ;
- le mois courant UTC et toute l'équipe constituent la sélection initiale ;
- le rapport individuel contient plus de détails que le rapport d'équipe ;
- le backend sépare la construction des données des générateurs CSV et PDF ;
- le PDF principal est rendu par Puppeteer ;
- un moteur PDF historique est conservé sous contrôle de configuration ;
- chaque export réussi est journalisé comme action administrateur par le
  backend.

Références :
`apps/frontend/components/dashboard/monthly-attendance-export-card.tsx`,
`apps/backend/src/modules/attendance/attendance.controller.ts`,
`apps/backend/src/modules/attendance/exports/monthly-attendance-pdf-exporter.service.ts`.

### 9.2 Limitations observées

- aucune prévisualisation du rapport n'est présente ;
- aucun choix CSV n'est présenté dans l'interface ;
- aucune période personnalisée ou plurimensuelle n'est disponible ;
- aucun filtre par département ou planning n'est disponible ;
- aucun export de tous les pointages bruts, ligne par ligne, n'est exposé dans
  l'interface ;
- aucune gestion des rapports déjà générés n'est présente ;
- aucune programmation récurrente n'est présente ;
- aucun envoi ou partage applicatif n'est présent ;
- le chargement impossible de la liste des employés ne produit pas de message
  visible spécifique.

### 9.3 Fonctionnalités absentes

Le dépôt ne contient pas, dans le module Rapports :

- d'export XLSX ;
- d'export JSON proposé à l'utilisateur ;
- de graphique interactif dans la page `/exports` ;
- d'aperçu PDF ;
- de modèle de rapport choisi par l'administrateur ;
- de personnalisation des colonnes ;
- d'import ou de restauration depuis un export ;
- d'historique des téléchargements consultable dans l'interface.

Références :
`apps/frontend/app/exports/page.tsx`,
`apps/frontend/components/dashboard/monthly-attendance-export-card.tsx`,
`apps/backend/src/modules/attendance/dto/monthly-attendance-export-query.dto.ts`.
