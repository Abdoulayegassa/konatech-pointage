# Gestion des pointages

| Métadonnée | Valeur |
| --- | --- |
| Document ID | UAG-ATT-001 |
| Titre | Gestion des pointages |
| Version | 1.0 |
| Statut | Validé |
| Classification | Interne |
| Référence | UAG |
| Date de génération | 30 juillet 2026 |

## 1. Présentation

### 1.1 Objectif du module

Le module de gestion des pointages permet à l'administrateur de consulter
l'historique mensuel des présences et les résultats calculés pour chaque
pointage : entrée, sortie, retard, départ anticipé, heures supplémentaires,
preuves de contrôle et statut.

L'interface d'administration fournit une vue de synthèse, des filtres, un
tableau et un panneau de détail. Elle ne contient pas de formulaire de
création, de modification ou de suppression d'un pointage.

Références :
`apps/frontend/app/attendance-history/page.tsx`,
`apps/frontend/components/attendance-history/attendance-history-workspace.tsx`,
`apps/frontend/components/attendance-history/attendance-history-table.tsx`.

### 1.2 Rôle du suivi des pointages

Un pointage relie un employé à une journée. Il peut conserver :

- l'heure d'entrée et l'heure de sortie ;
- le statut de présence ;
- le nombre de minutes de retard ;
- les informations de sortie anticipée et d'heures supplémentaires ;
- un instantané du planning appliqué ;
- les informations GPS et les méthodes de vérification ;
- les références des photos de vérification ;
- un commentaire ;
- les dates de création et de dernière mise à jour.

La contrainte composée `employeeId_date` rend unique le pointage d'un employé
pour une journée.

Références :
`apps/backend/prisma/schema.prisma`,
`apps/backend/src/modules/attendance/attendance.service.ts`.

## 2. Accès au module

### 2.1 Parcours administrateur réel

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
              | navigation Historique RH
              v
+---------------------------+
| Pointages                 |
| /attendance-history       |
+---------------------------+
```

La page `/attendance-history` demande une session authentifiée. En l'absence
de jeton, elle redirige vers `/login`. Un utilisateur dont le rôle n'est pas
`ADMIN` est redirigé vers `/my-attendance`.

Lors de son chargement, la page demande en parallèle :

- l'historique du mois UTC courant ;
- les employés et leurs plannings, utilisés pour alimenter les filtres.

Références :
`apps/frontend/app/attendance-history/page.tsx`,
`apps/frontend/lib/api.ts`,
`apps/backend/src/modules/attendance/attendance.controller.ts`.

## 3. Consultation des pointages

### 3.1 Vue de synthèse

Six cartes sont calculées à partir des lignes correspondant aux filtres
appliqués :

| Carte | Information affichée |
| --- | --- |
| Pointages | Nombre de lignes visibles |
| Retards | Nombre de lignes dont `minutesLate` est supérieur à zéro |
| Absences | Nombre de lignes dont le statut enregistré est `ABSENT` |
| Départs anticipés | Nombre de lignes marquées comme sortie anticipée |
| Heures supplémentaires | Somme des minutes supplémentaires |
| Travail jour non ouvré | Nombre de lignes au statut `NON_WORKING_DAY_WORK` |

Ces cartes sont calculées dans le navigateur. Elles ne déclenchent pas une
requête de synthèse distincte.

Références :
`apps/frontend/components/attendance-history/attendance-history-workspace.tsx`,
`apps/frontend/components/attendance-history/attendance-history-table.tsx`.

### 3.2 Colonnes affichées

| Colonne | Contenu |
| --- | --- |
| Date | Date du pointage |
| Employé | Prénom, nom et identifiant de l'employé |
| Département | Département, ou `--` lorsqu'il est absent |
| Entrée | Heure d'entrée, ou `--` |
| Sortie | Heure de sortie, ou `--` |
| Retard | Minutes de retard |
| Départ anticipé | Minutes de départ anticipé |
| Heures supplémentaires | Durée supplémentaire |
| GPS | État de la preuve GPS |
| Selfie | Présence ou absence d'une preuve photo |
| Commentaire | Extrait du commentaire, ou `--` |
| Statut | Libellé fonctionnel calculé pour la ligne |

Un clic sur une ligne ouvre le panneau de détail du pointage. Aucune action de
modification ou de suppression n'est affichée dans le tableau.

Référence :
`apps/frontend/components/attendance-history/attendance-history-table.tsx`.

### 3.3 Recherche et filtres

| Contrôle | Fonctionnement observé |
| --- | --- |
| Période | Aujourd'hui, cette semaine ou ce mois |
| Employé | Recherche locale sur le nom complet et l'identifiant |
| Département | Sélection parmi les départements présents |
| Statuts | Sélection multiple de libellés fonctionnels |
| Appliquer | Applique les valeurs préparées aux lignes et aux cartes |
| Réinitialiser | Rétablit la période « ce mois » et retire les autres filtres |

La recherche d'employé ignore la casse et les accents. La liste proposée
présente le prénom, le nom et l'identifiant. Les statuts filtrables sont :

- À l'heure ;
- Retard ;
- Absent ;
- Travail jour non ouvré ;
- Départ anticipé ;
- Heures supplémentaires ;
- Pointage incomplet.

Les filtres sont appliqués localement aux données déjà chargées. Aucun champ
de recherche générale n'est présent.

Référence :
`apps/frontend/components/attendance-history/attendance-history-filters.tsx`.

### 3.4 Tri et pagination

Le backend renvoie l'historique par date décroissante, puis par date de
création décroissante. L'interface ne fournit pas de commande de tri.

Aucune pagination n'est implémentée dans la page. Le tableau utilise une zone
défilante pour afficher les résultats chargés du mois demandé.

Références :
`apps/backend/src/modules/attendance/attendance.service.ts`,
`apps/frontend/components/attendance-history/attendance-history-table.tsx`.

### 3.5 Périmètre des données chargées

La requête d'historique accepte un paramètre facultatif `month` au format
`YYYY-MM`. La page d'administration demande le mois courant. La sélection de
période dans les filtres agit ensuite sur ce jeu de données mensuel.

Références :
`apps/backend/src/modules/attendance/dto/attendance-history-query.dto.ts`,
`apps/backend/src/modules/attendance/attendance.controller.ts`,
`apps/frontend/app/attendance-history/page.tsx`.

## 4. Détails d'un pointage

### 4.1 Informations visibles

Le panneau latéral ouvert depuis une ligne présente les sections suivantes :

| Section | Informations visibles |
| --- | --- |
| Identité du pointage | Employé, département et date |
| Résumé RH | Niveau de conformité, statut, retard, départ anticipé et heures supplémentaires |
| Sanction RH | Résultat de l'analyse disciplinaire, lorsque disponible |
| Horaires de pointage | Type, heure d'entrée et heure de sortie |
| Planning appliqué | Nom, début, fin et marge de retard de l'instantané |
| Conformité | État GPS, latitude, longitude, précision et commentaire |
| Preuves | Selfie de vérification, lorsqu'une URL est présente |
| Audit technique | Création, dernière mise à jour et identifiant du pointage |

Le type affiché vaut « Sortie » lorsqu'une heure de sortie existe ; sinon il
vaut « Entrée ». Les valeurs horaires absentes sont affichées avec une valeur
de remplacement visuelle. En l'absence d'instantané exploitable, le panneau
indique que les informations de planning sont indisponibles.

Référence :
`apps/frontend/components/attendance-history/attendance-detail-panel.tsx`.

### 4.2 Employé, date, statut, retard et commentaires

- l'employé est affiché par son prénom et son nom, avec son département ;
- la date est celle de la journée de pointage ;
- le statut visible est un libellé calculé à partir du statut enregistré et
  des indicateurs de la ligne ;
- le retard correspond à `minutesLate` ;
- le commentaire correspond à `notes`, ou « Aucun commentaire » lorsqu'il est
  vide.

L'identifiant interne de l'employé est visible dans le tableau, mais pas dans
la section d'identité du panneau. L'identifiant interne du pointage est visible
dans la section d'audit.

Références :
`apps/frontend/components/attendance-history/attendance-history-table.tsx`,
`apps/frontend/components/attendance-history/attendance-detail-panel.tsx`.

### 4.3 Informations supplémentaires

Le panneau peut également montrer :

- une sortie anticipée et sa durée ;
- des heures supplémentaires ;
- les coordonnées et la précision GPS ;
- le selfie d'entrée ou, à défaut, celui de sortie ;
- la règle, la décision, le montant, le motif et l'état d'une sanction ;
- les valeurs du planning capturées au moment du pointage.

L'analyse de sanction est récupérée à l'ouverture du détail. Les états
« chargement », « introuvable » et « indisponible » sont gérés dans
l'interface.

Références :
`apps/frontend/components/attendance-history/attendance-detail-panel.tsx`,
`apps/frontend/app/api/sanctions/attendance/[attendanceId]/route.ts`,
`apps/backend/src/modules/sanctions/sanctions.controller.ts`.

## 5. Cycle complet d'un pointage

### 5.1 Parcours implémenté

```text
+-----------------------------+
| QR Code du point d'entrée   |
+--------------+--------------+
               |
               v
+-----------------------------+
| Page /attendance-entry      |
| Saisie du PIN à 4 chiffres  |
+--------------+--------------+
               |
               v
+-----------------------------+
| Validation de l'employé     |
| Session terminal dédiée     |
+--------------+--------------+
               |
               v
+-----------------------------+
| Choix Entrée ou Sortie      |
| Selfie obligatoire          |
| Commentaire facultatif      |
| GPS capturé si disponible   |
+--------------+--------------+
               |
               v
+-----------------------------+
| Enregistrement backend      |
+--------------+--------------+
               |
               v
+-----------------------------+
| Consultation administrateur |
| /attendance-history         |
+-----------------------------+
```

### 5.2 QR Code

Le dashboard administrateur contient une action « QR Pointage ». Elle affiche
un QR Code lié au point d'entrée fixe `/attendance-entry`, ainsi qu'une action
de téléchargement de l'affiche. Le QR Code n'identifie pas un employé.

Le backend expose aussi `GET /attendance/entry`, qui redirige vers l'URL
frontend fixe du point d'entrée.

Références :
`apps/frontend/components/dashboard/quick-actions-section.tsx`,
`apps/frontend/components/dashboard/attendance-entry-qr-card.tsx`,
`apps/backend/src/modules/attendance/attendance-entry.service.ts`,
`apps/backend/src/modules/attendance/attendance.controller.ts`.

### 5.3 PIN et session dédiée

L'écran du terminal accepte exactement quatre chiffres. Il propose un pavé
numérique, l'effacement et la validation. Le backend recherche un employé
actif de rôle `EMPLOYEE`, puis vérifie le hash de son PIN.

Après validation, le frontend crée un cookie de session dédié au terminal et
affiche le nom de l'employé avant de charger l'écran d'action. Cette session
JWT a une durée configurée de quinze minutes dans le service
d'authentification.

Références :
`apps/frontend/components/attendance/attendance-entry-pin-view.tsx`,
`apps/frontend/app/api/auth/attendance-entry-session/route.ts`,
`apps/backend/src/modules/auth/dto/attendance-entry-login.dto.ts`,
`apps/backend/src/modules/auth/auth.service.ts`.

### 5.4 Validation et enregistrement

L'écran permet l'entrée lorsque `canCheckIn` est vrai et la sortie lorsque
`canCheckOut` est vrai. Le parcours comporte :

1. le choix « Entrée » ou « Sortie » ;
2. la capture d'un selfie obligatoire ;
3. la saisie facultative d'un commentaire, limitée à 120 caractères dans
   l'interface ;
4. la tentative de capture de la position ;
5. un écran de vérification ;
6. l'appel de l'API employé ;
7. un écran de succès ou d'erreur.

Les appels utilisés sont `POST /attendance/me/check-in` et
`POST /attendance/me/check-out`, via les routes proxy frontend
correspondantes. Après succès, l'écran affiche l'heure et, selon le résultat,
le retard, le départ anticipé ou les heures supplémentaires.

Références :
`apps/frontend/components/attendance/employee-attendance-actions.tsx`,
`apps/frontend/components/attendance/attendance-selfie-capture.tsx`,
`apps/frontend/components/attendance/attendance-browser-security.ts`,
`apps/backend/src/modules/attendance/attendance.controller.ts`.

### 5.5 Contrôles de preuve

Pour les routes employé, le backend exige un selfie. Lorsque la politique GPS
est active, il exige aussi une position et contrôle sa précision. Un pointage
hors du rayon autorisé exige un commentaire.

La position est néanmoins capturée par le navigateur seulement si elle est
disponible. La décision finale d'accepter ou de refuser la preuve appartient
au backend selon sa politique.

Les routes administrateur de pointage existent dans l'API et désactivent ce
contrôle de sécurité, mais aucune action correspondante n'est exposée dans
l'interface d'historique.

Références :
`apps/backend/src/modules/attendance/attendance-security.service.ts`,
`apps/backend/src/modules/attendance/attendance-security-policy.service.ts`,
`apps/backend/src/modules/attendance/attendance.controller.ts`,
`apps/frontend/components/attendance/employee-attendance-actions.tsx`.

## 6. Gestion des statuts

### 6.1 Statuts enregistrés

| Statut | Signification observée |
| --- | --- |
| `PRESENT` | Pointage terminé sans retard, y compris un travail hors planning qui n'est pas un jour non ouvré |
| `LATE` | Arrivée après l'heure de début et la marge du planning ; ce statut reste appliqué après la sortie |
| `INCOMPLETE` | Entrée enregistrée sans sortie, ou entrée sans planning actif et applicable |
| `ABSENT` | Journée planifiée sans entrée enregistrée dans les données d'historique calculées |
| `NON_WORKING_DAY_WORK` | Pointage effectué un jour déclaré non ouvré |

Ce sont les cinq valeurs de l'énumération `AttendanceStatus` du schéma Prisma.
Aucun autre statut enregistré n'existe dans cette énumération.

Références :
`apps/backend/prisma/schema.prisma`,
`apps/backend/src/modules/attendance/attendance.service.ts`,
`apps/backend/src/modules/attendance/attendance-monthly-metrics.service.ts`.

### 6.2 Libellés fonctionnels affichés

Le tableau et le détail ne se limitent pas à reproduire l'énumération. Ils
calculent un libellé d'affichage avec la priorité suivante :

1. travail un jour non ouvré ;
2. absence ;
3. pointage incomplet ;
4. départ anticipé ;
5. heures supplémentaires ;
6. retard ;
7. à l'heure.

Ainsi, « Départ anticipé », « Heures supplémentaires » et « À l'heure » sont
des résultats affichés, pas des valeurs supplémentaires de
`AttendanceStatus`.

Références :
`apps/frontend/components/attendance-history/attendance-history-table.tsx`,
`apps/frontend/components/attendance-history/attendance-detail-panel.tsx`.

## 7. Interactions avec les plannings

### 7.1 Calcul du retard

Pour un planning actif applicable au jour concerné, le retard est calculé à
partir de l'heure d'arrivée, de l'heure de début et de la marge de retard. Le
résultat négatif est ramené à zéro.

Sur un jour non ouvré, ou lorsque le planning n'est pas actif ou applicable,
le retard vaut zéro.

Références :
`apps/backend/src/modules/attendance/attendance.service.ts`,
`apps/backend/src/common/utils/attendance-date.util.ts`.

### 7.2 Heures prévues et instantané

Au moment de l'entrée, le service capture dans le pointage :

- l'identifiant et le nom du planning ;
- l'heure prévue de début ;
- l'heure prévue de fin ;
- les jours de travail ;
- la marge de retard ;
- la date de capture.

Lors de la sortie, l'instantané est utilisé en priorité. Le planning courant de
l'employé sert de repli lorsque l'instantané n'est pas exploitable.

Références :
`apps/backend/src/common/utils/attendance-schedule-snapshot.util.ts`,
`apps/backend/src/modules/attendance/attendance.service.ts`,
`apps/backend/prisma/schema.prisma`.

### 7.3 Sortie anticipée et heures supplémentaires

Lorsque la journée est planifiée, la sortie est comparée à l'heure de fin
prévue :

- une sortie antérieure produit un départ anticipé et sa durée ;
- une sortie postérieure produit des heures supplémentaires ;
- une sortie à l'heure ne produit aucun de ces écarts.

Pour un travail hors planning, la durée entre l'entrée et la sortie est
traitée comme temps supplémentaire. Un jour non ouvré conserve le statut
`NON_WORKING_DAY_WORK`.

Références :
`apps/backend/src/common/utils/attendance-checkout.util.ts`,
`apps/backend/src/modules/attendance/attendance.service.ts`.

## 8. Comportements observés

### 8.1 Validations et erreurs

| Situation | Comportement observé |
| --- | --- |
| PIN non composé de quatre chiffres | Validation refusée |
| PIN inconnu ou invalide | Message « Code PIN invalide » |
| Trop de tentatives PIN | Réponse de limitation de débit affichée dans le terminal |
| Employé inactif | Authentification terminal refusée |
| Selfie absent | Validation employé refusée |
| GPS requis mais absent | Validation backend refusée |
| Précision GPS insuffisante | Validation backend refusée |
| Hors zone sans commentaire | Validation backend refusée |
| Date d'action invalide | Requête refusée |
| Date d'action future | Requête refusée |
| Sortie sans entrée | Requête refusée |
| Sortie antérieure à l'entrée | Requête refusée |

Références :
`apps/frontend/components/attendance/attendance-entry-pin-view.tsx`,
`apps/backend/src/modules/auth/auth.service.ts`,
`apps/backend/src/modules/attendance/attendance-security.service.ts`,
`apps/backend/src/modules/attendance/attendance.service.ts`.

### 8.2 Refus de doublons et incohérences empêchées

- une seconde entrée pour le même employé et la même journée est refusée ;
- une nouvelle entrée après une sortie déjà enregistrée est refusée ;
- une seconde sortie est refusée ;
- une sortie sans entrée préalable est refusée ;
- la contrainte unique de base protège également le couple employé/journée ;
- les mises à jour d'entrée et de sortie utilisent des conditions atomiques
  afin de détecter une action concurrente déjà enregistrée.

Références :
`apps/backend/src/modules/attendance/attendance.service.ts`,
`apps/backend/prisma/schema.prisma`.

### 8.3 États sans données et données absentes

- lorsque les filtres ne trouvent aucune ligne, le tableau affiche « Aucun
  pointage trouvé » ;
- un département, une heure, un commentaire, une preuve GPS ou une photo
  absents reçoivent un libellé explicite ou une marque `--` ;
- le panneau indique « Informations de planning indisponibles » lorsque les
  valeurs nécessaires manquent ;
- le terminal de pointage dispose également de vues de chargement et d'erreur.

Références :
`apps/frontend/components/attendance-history/attendance-history-table.tsx`,
`apps/frontend/components/attendance-history/attendance-detail-panel.tsx`,
`apps/frontend/app/attendance-entry/loading.tsx`,
`apps/frontend/app/attendance-entry/error.tsx`.

### 8.4 Restrictions d'accès

Les routes d'historique global, de synthèse, d'export et de pointage pour un
employé désigné sont réservées au rôle `ADMIN`. Les routes personnelles
d'entrée, de sortie, de journée courante et d'historique personnel sont
réservées au rôle `EMPLOYEE`.

Référence :
`apps/backend/src/modules/attendance/attendance.controller.ts`.

## 9. Traçabilité

| Fonctionnalité ou comportement | Fichiers concernés |
| --- | --- |
| Page administrateur et contrôle d'accès | `apps/frontend/app/attendance-history/page.tsx` |
| Espace de consultation | `apps/frontend/components/attendance-history/attendance-history-workspace.tsx` |
| Filtres locaux | `apps/frontend/components/attendance-history/attendance-history-filters.tsx` |
| Cartes de synthèse | `apps/frontend/components/attendance-history/attendance-history-workspace.tsx` |
| Colonnes, lignes, statuts et état vide | `apps/frontend/components/attendance-history/attendance-history-table.tsx` |
| Détail, preuves et analyse de sanction | `apps/frontend/components/attendance-history/attendance-detail-panel.tsx` |
| Contrats frontend de l'API | `apps/frontend/lib/api.ts` |
| QR Code du point d'entrée | `apps/frontend/components/dashboard/attendance-entry-qr-card.tsx` |
| Page fixe de pointage | `apps/frontend/app/attendance-entry/page.tsx` |
| Saisie et validation du PIN | `apps/frontend/components/attendance/attendance-entry-pin-view.tsx` |
| Cookie de session terminal | `apps/frontend/app/api/auth/attendance-entry-session/route.ts` |
| Écran d'action entrée/sortie | `apps/frontend/components/attendance/employee-attendance-actions.tsx` |
| Capture du selfie | `apps/frontend/components/attendance/attendance-selfie-capture.tsx` |
| Capture GPS dans le navigateur | `apps/frontend/components/attendance/attendance-browser-security.ts` |
| Routes et rôles du module | `apps/backend/src/modules/attendance/attendance.controller.ts` |
| Règles d'entrée, de sortie et historique | `apps/backend/src/modules/attendance/attendance.service.ts` |
| Règles de sécurité des preuves | `apps/backend/src/modules/attendance/attendance-security.service.ts` |
| Politique de géolocalisation | `apps/backend/src/modules/attendance/attendance-security-policy.service.ts` |
| Authentification par PIN | `apps/backend/src/modules/auth/auth.service.ts` |
| Validation du PIN | `apps/backend/src/modules/auth/dto/attendance-entry-login.dto.ts` |
| Validation du mois | `apps/backend/src/modules/attendance/dto/attendance-history-query.dto.ts` |
| Calculs calendrier et absences | `apps/backend/src/modules/attendance/attendance-monthly-metrics.service.ts` |
| Calculs de sortie | `apps/backend/src/common/utils/attendance-checkout.util.ts` |
| Instantané du planning | `apps/backend/src/common/utils/attendance-schedule-snapshot.util.ts` |
| Modèle et statuts persistés | `apps/backend/prisma/schema.prisma` |

## 10. Observations

### 10.1 Comportements existants

- l'historique administrateur est chargé pour un mois puis filtré dans le
  navigateur ;
- le tableau distingue le statut persisté des résultats d'affichage tels que
  le départ anticipé ou les heures supplémentaires ;
- le point d'entrée QR est fixe et l'identification individuelle repose sur
  le PIN ;
- l'entrée et la sortie utilisent le même parcours de preuve ;
- le selfie est obligatoire sur les routes personnelles ;
- les données du planning sont figées dans un instantané lors de l'entrée ;
- les jours non ouvrés interviennent dans le statut et dans le calcul du
  travail hors planning.

### 10.2 Limitations observées

- aucune pagination n'est présente dans l'historique ;
- aucun tri interactif n'est présent ;
- aucune recherche textuelle générale n'est présente ;
- le sélecteur de période visible est limité à aujourd'hui, cette semaine et
  ce mois ;
- l'historique administrateur ne propose pas d'édition, de suppression ni de
  correction manuelle d'une ligne ;
- le commentaire n'est pas modifiable depuis le détail ;
- aucune action d'export n'est intégrée à la page d'historique, même si une
  route backend d'export mensuel existe ;
- aucune fonction d'import de pointages n'est présente ;
- aucun statut supplémentaire aux cinq valeurs Prisma documentées n'est
  persisté.

### 10.3 Fonctionnalités absentes

Le dépôt ne contient pas, dans le module d'historique administrateur :

- de création manuelle depuis l'interface ;
- de correction ou validation manuelle d'un pointage ;
- de suppression ;
- de pagination ;
- de tri choisi par l'utilisateur ;
- de modification en masse ;
- d'import de pointages.

Références :
`apps/frontend/app/attendance-history/page.tsx`,
`apps/frontend/components/attendance-history/attendance-history-workspace.tsx`,
`apps/frontend/components/attendance-history/attendance-history-table.tsx`,
`apps/backend/src/modules/attendance/attendance.controller.ts`.
