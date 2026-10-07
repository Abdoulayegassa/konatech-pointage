# Gestion des plannings

| Métadonnée | Valeur |
| --- | --- |
| Document ID | UAG-SCH-001 |
| Titre | Gestion des plannings |
| Version | 1.0 |
| Statut | Validé |
| Classification | Interne |
| Référence | UAG |
| Date de génération | 30 juillet 2026 |

## 1. Présentation

### 1.1 Objectif du module

Le module Plannings permet à l'administrateur de définir les horaires de
travail utilisés par Konatech Pointage. Il centralise :

- le catalogue des plannings ;
- les heures de début et de fin ;
- la marge de retard ;
- les jours actifs ;
- l'état actif ou inactif ;
- le nombre et l'aperçu des employés affectés.

L'administrateur peut rechercher, filtrer, créer, modifier, activer et
désactiver un planning.

Aucune fonction de suppression d'un planning n'est présente.

Références :
`apps/frontend/app/schedules/page.tsx`,
`apps/frontend/components/schedules/admin-schedules-manager.tsx`,
`apps/backend/src/modules/schedules/schedules.controller.ts`.

### 1.2 Rôle des plannings dans le système

Un planning peut être associé à plusieurs employés. Un employé possède au plus
un planning courant par le champ `scheduleId`.

Lorsqu'il est actif et applicable au jour du pointage, le planning fournit :

- l'heure de début utilisée pour calculer le retard ;
- la marge déduite du retard ;
- l'heure de fin utilisée pour calculer une sortie anticipée ou des heures
  supplémentaires ;
- les jours où l'employé est attendu ;
- les données permettant de calculer les absences sur les jours planifiés.

Lors de l'arrivée, les paramètres du planning actif sont copiés dans le
pointage sous forme d'instantané. Cet instantané permet aux traitements
ultérieurs d'utiliser les conditions capturées au moment du pointage.

Références :
`apps/backend/prisma/schema.prisma`,
`apps/backend/src/modules/attendance/attendance.service.ts`,
`apps/backend/src/common/utils/attendance-schedule-snapshot.util.ts`.

### 1.3 Rôle de l'administrateur

Toutes les routes de `SchedulesController` sont réservées à `ADMIN`.
L'administrateur peut :

- consulter tous les plannings ;
- consulter un planning par identifiant ;
- créer un planning ;
- modifier un planning ;
- activer ou désactiver un planning.

La création, la modification et le changement d'état sont transmis au service
de journalisation d'audit du backend.

L'affectation d'un planning à un employé est réalisée depuis le module
Employés, pas depuis le formulaire Plannings.

Références :
`apps/backend/src/modules/schedules/schedules.controller.ts`,
`apps/backend/src/common/audit/audit-log.service.ts`,
`apps/frontend/components/employees/admin-employees-manager.tsx`.

## 2. Accès au module

### 2.1 Parcours réel

Le parcours administrateur est :

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
              | menu Équipe
              v
+---------------------------+
| Plannings                 |
| /schedules                |
+---------------------------+
```

Le module est accessible :

- par le lien `Plannings` du groupe `Équipe` ;
- par l'action rapide `Créer un planning` du tableau de bord.

Les deux liens ouvrent `/schedules`. L'action rapide ne transmet pas de
paramètre particulier au formulaire.

Références :
`apps/frontend/components/admin/admin-nav.tsx`,
`apps/frontend/components/dashboard/quick-actions-section.tsx`.

### 2.2 Contrôle d'accès

La page :

1. récupère l'utilisateur courant ;
2. redirige vers `/login` si la session n'est pas valide ;
3. redirige vers `/my-attendance` si le rôle n'est pas `ADMIN` ;
4. récupère le jeton ;
5. charge les plannings.

Le backend applique aussi le guard JWT et exige `ADMIN` sur le contrôleur.

Références :
`apps/frontend/app/schedules/page.tsx`,
`apps/frontend/lib/auth.ts`,
`apps/backend/src/modules/schedules/schedules.controller.ts`,
`apps/backend/src/modules/auth/guards/jwt-auth.guard.ts`,
`apps/backend/src/modules/auth/guards/roles.guard.ts`.

### 2.3 En-tête

L'en-tête affiche :

- la navigation administrateur ;
- la déconnexion ;
- la date ;
- le prénom de l'administrateur ;
- le titre `Gestion des plannings` ;
- l'identité de la session active ;
- le nombre total de plannings ;
- le nombre total d'affectations d'employés.

Référence : `apps/frontend/app/schedules/page.tsx`.

## 3. Liste des plannings

### 3.1 Présentation

La liste est rendue sous forme de cartes et non de tableau HTML.

Chaque carte affiche :

| Zone | Information |
| --- | --- |
| Identité | Nom et date de création |
| Statut | `Actif` ou `Inactif` |
| Utilisation | `En service` ou `Libre` |
| Horaire | Heure de début, heure de fin et marge de retard |
| Jours | Abréviation de chaque jour actif |
| Affectations | Nombre d'employés et aperçu de leurs noms |
| Actions | `Modifier` et `Activer` ou `Désactiver` |

Lorsqu'un planning est chargé dans le formulaire, sa carte affiche
`En édition`.

Pour les employés affectés, l'aperçu affiche les deux premiers noms. Au-delà
de deux employés, il ajoute le nombre restant. Sans employé, il affiche
`Aucun employé assigné`.

Références :
`apps/frontend/components/schedules/admin-schedules-manager.tsx`,
`apps/frontend/components/schedules/schedule-manager.helpers.ts`.

### 3.2 Cartes de synthèse

Quatre cartes sont affichées au-dessus du registre :

| Carte | Valeur |
| --- | --- |
| Plannings | Nombre total de modèles chargés |
| Actifs | Nombre actifs et nombre inactifs |
| Non utilisés | Nombre sans employé et nombre en service |
| Affectations | Somme des employés associés et moyenne arrondie par planning |

Le calcul `Affectations` additionne la longueur du tableau `employees` de
chaque planning. La moyenne vaut zéro lorsque le catalogue est vide.

Référence :
`apps/frontend/components/schedules/admin-schedules-manager.tsx`.

### 3.3 Recherche

La recherche est exécutée dans le navigateur sur les plannings déjà chargés.
Elle est insensible à la casse et couvre :

- le nom ;
- l'heure de début ;
- l'heure de fin ;
- la marge de retard convertie en texte ;
- l'aperçu des employés affectés ;
- les libellés complets des jours actifs.

La saisie est normalisée avec `trim()` et `toLowerCase()`. Elle ne déclenche
aucune nouvelle requête vers l'API.

Référence :
`apps/frontend/components/schedules/admin-schedules-manager.tsx`.

### 3.4 Filtres

Trois filtres sont disponibles :

| Filtre | Valeurs |
| --- | --- |
| Statut | Tous, Actifs, Inactifs |
| Utilisation | Tous, Affectés, Non affectés |
| Jour | Tous, puis lundi à dimanche |

Le filtre `Affectés` retient les plannings ayant au moins un employé. Le filtre
`Non affectés` retient ceux dont le tableau d'employés est vide.

Les filtres se combinent avec la recherche. `Effacer les filtres` restaure les
valeurs initiales et est désactivé lorsque rien n'est actif.

Référence :
`apps/frontend/components/schedules/admin-schedules-manager.tsx`.

### 3.5 Tri

Aucun contrôle de tri n'est présent dans l'interface.

Le backend retourne les plannings dans un ordre fixe :

1. date de création décroissante ;
2. nom croissant.

Après une création réussie, le frontend place le nouveau planning au début de
son état local. Une modification remplace l'élément sans déplacer les autres.

Références :
`apps/backend/src/modules/schedules/schedules.service.ts`,
`apps/frontend/components/schedules/schedule-manager.helpers.ts`.

### 3.6 Pagination

Aucune pagination n'est implémentée :

- `GET /schedules` ne reçoit ni page ni limite ;
- le service appelle `findMany` sans `skip` ni `take` ;
- le frontend rend tous les plannings correspondant aux filtres.

Références :
`apps/backend/src/modules/schedules/schedules.controller.ts`,
`apps/backend/src/modules/schedules/schedules.service.ts`,
`apps/frontend/components/schedules/admin-schedules-manager.tsx`.

### 3.7 Actions

| Action | Comportement |
| --- | --- |
| `Nouveau planning` | Réinitialise le formulaire en mode création |
| `Modifier` | Recharge le planning par identifiant et ouvre l'édition |
| `Désactiver` | Envoie `isActive: false` |
| `Activer` | Envoie `isActive: true` |
| `Annuler` | Quitte l'édition et restaure un nouveau formulaire |
| `Effacer les filtres` | Réinitialise recherche et filtres |

Pendant une action de ligne, les actions de toutes les cartes sont désactivées.
Le libellé de la ligne concernée devient `Chargement...` ou
`Mise à jour...`.

Aucune action de suppression, duplication ou affectation d'employé n'est
présente sur la carte.

Référence :
`apps/frontend/components/schedules/admin-schedules-manager.tsx`.

## 4. Création d'un planning

### 4.1 Ouverture et valeurs initiales

Le formulaire est affiché dans la page et démarre en mode création.

Ses valeurs initiales sont :

| Champ | Valeur |
| --- | --- |
| Nom | Vide |
| Début | `08:00` |
| Fin | `17:00` |
| Marge de retard | `0` minute |
| Statut | Actif |
| Jours | Lundi, mardi, mercredi, jeudi et vendredi |

Les boutons `Nouveau planning` et `Réinitialiser` restaurent ces valeurs.

Références :
`apps/frontend/components/schedules/schedule-manager.helpers.ts`,
`apps/frontend/components/schedules/admin-schedules-manager.tsx`.

### 4.2 Formulaire

Le formulaire est organisé en quatre sections :

| Section | Champs ou contenu |
| --- | --- |
| Identité | Nom du planning |
| Horaire | Heure de début, heure de fin, marge de retard |
| Activation | Sept cases de jours et case `Planning actif` |
| Résumé | Nom, plage horaire, marge, nombre et noms des jours actifs |

Les jours possibles sont :

- lundi ;
- mardi ;
- mercredi ;
- jeudi ;
- vendredi ;
- samedi ;
- dimanche.

Lorsqu'un jour est coché ou décoché, le frontend conserve l'ordre du lundi au
dimanche.

Références :
`apps/frontend/components/schedules/admin-schedules-manager.tsx`,
`apps/frontend/components/schedules/schedule-manager.helpers.ts`.

### 4.3 Heures

Les champs de début et de fin utilisent `type="time"`. Le frontend impose une
heure de fin strictement postérieure à l'heure de début dans la même journée.

Le backend vérifie également cette relation. Il n'interprète pas une heure de
fin antérieure ou égale comme une fin le lendemain.

Les plannings traversant minuit ne peuvent donc pas être enregistrés par ce
modèle.

Références :
`apps/frontend/components/schedules/admin-schedules-manager.tsx`,
`apps/backend/src/modules/schedules/schedules.service.ts`.

### 4.4 Validations frontend

Avant l'envoi, le frontend vérifie :

| Règle | Message |
| --- | --- |
| Nom non vide après suppression des espaces en bordure | `Le nom du planning est requis.` |
| Marge entière | `La marge de retard doit être un nombre entier.` |
| Marge comprise entre 0 et 180 | `La marge de retard doit rester entre 0 et 180 minutes.` |
| Au moins un jour | `Sélectionnez au moins un jour actif.` |
| Fin postérieure au début | `L'heure de fin doit être postérieure à l'heure de début pour le même jour.` |

Les champs nom, début, fin et marge portent aussi l'attribut HTML `required`.
La marge utilise `type="number"`, `min=0` et `max=180`.

Référence :
`apps/frontend/components/schedules/admin-schedules-manager.tsx`.

### 4.5 Validations backend

Le DTO de création impose :

| Champ | Validation |
| --- | --- |
| Nom | Chaîne de 80 caractères au maximum |
| Début | Format `HH:mm`, de `00:00` à `23:59` |
| Fin | Format `HH:mm`, de `00:00` à `23:59` |
| Marge | Entier facultatif, de 0 à 180 |
| Statut | Booléen facultatif |
| Jours | Tableau, au moins un élément, valeurs uniques |
| Chaque jour | Une des sept valeurs autorisées |

Le service vérifie en plus que la fin est postérieure au début dans la même
journée.

Le nom est unique dans le modèle Prisma. Un doublon est converti en conflit
avec le message `A schedule with the same name already exists.`.

Références :
`apps/backend/src/modules/schedules/dto/create-schedule.dto.ts`,
`apps/backend/src/modules/schedules/schedules.service.ts`,
`apps/backend/prisma/schema.prisma`.

### 4.6 Enregistrement

Le frontend envoie :

```text
POST /api/schedules
        |
        v
POST /api/v1/schedules
```

Le payload contient :

- le nom sans espaces en bordure ;
- les deux heures ;
- la marge convertie en nombre ;
- l'état ;
- les jours triés.

Le service applique `0` comme marge par défaut et `true` comme état par défaut
si ces champs sont absents. Il retourne le planning avec les employés
actuellement associés.

Après un succès :

- le planning est ajouté en tête de la liste locale ;
- le message `Planning créé avec succès.` est affiché ;
- le formulaire revient à ses valeurs initiales.

Références :
`apps/frontend/app/api/schedules/route.ts`,
`apps/frontend/components/schedules/admin-schedules-manager.tsx`,
`apps/backend/src/modules/schedules/schedules.controller.ts`,
`apps/backend/src/modules/schedules/schedules.service.ts`.

### 4.7 Messages affichés

Pendant la création, le bouton affiche `Création...` et les boutons du
formulaire sont désactivés.

En cas d'échec, le composant affiche le message backend lorsqu'il est
disponible. Sinon, il utilise `Impossible de créer le planning.`.

Les messages de validation frontend sont ceux de la section 4.4. Le message
backend relatif à la plage horaire est
`endTime must be later than startTime for the same schedule day.`.

Références :
`apps/frontend/components/schedules/admin-schedules-manager.tsx`,
`apps/frontend/lib/client-error.ts`,
`apps/backend/src/modules/schedules/schedules.service.ts`.

## 5. Modification d'un planning

### 5.1 Chargement

Le bouton `Modifier` appelle :

```text
GET /api/schedules/<id>
        |
        v
GET /api/v1/schedules/<id>
```

Le backend valide l'identifiant avec `ParseUUIDPipe`. Lorsque le planning
existe, le frontend :

- passe en mode édition ;
- mémorise son identifiant ;
- remplit tous les champs ;
- trie les jours ;
- affiche son nom et sa plage horaire dans la zone `Sélection` ;
- marque sa carte `En édition`.

Références :
`apps/frontend/components/schedules/admin-schedules-manager.tsx`,
`apps/frontend/app/api/schedules/[id]/route.ts`,
`apps/backend/src/modules/schedules/schedules.controller.ts`.

### 5.2 Champs modifiables

Tous les champs du formulaire peuvent être modifiés :

- nom ;
- heure de début ;
- heure de fin ;
- marge de retard ;
- jours actifs ;
- état actif ou inactif.

L'identifiant, la date de création et la liste des employés affectés ne sont
pas modifiables dans ce formulaire.

Référence :
`apps/frontend/components/schedules/admin-schedules-manager.tsx`.

### 5.3 Validations

Le frontend réapplique toutes les validations de création.

`UpdateScheduleDto` est une version partielle du DTO de création. Chaque champ
envoyé est donc soumis à la même validation de format, de type, de longueur et
de plage.

Le service recharge le planning existant et combine les heures actuelles avec
les heures fournies avant de vérifier que la fin reste postérieure au début.
Cette vérification fonctionne donc aussi lorsqu'une seule des deux heures est
envoyée à l'API.

Le nom reste soumis à la contrainte d'unicité.

Références :
`apps/backend/src/modules/schedules/dto/update-schedule.dto.ts`,
`apps/backend/src/modules/schedules/schedules.service.ts`,
`apps/frontend/components/schedules/admin-schedules-manager.tsx`.

### 5.4 Sauvegarde

Le frontend envoie le formulaire complet à :

```text
PATCH /api/schedules/<id>
        |
        v
PATCH /api/v1/schedules/<id>
```

Pendant la requête, le bouton affiche `Mise à jour...`. Les boutons
`Enregistrer` et `Réinitialiser` sont désactivés.

Après un succès :

- le planning correspondant est remplacé dans l'état local ;
- le message `Planning mis à jour avec succès.` est affiché ;
- le formulaire revient au mode création.

Références :
`apps/frontend/components/schedules/admin-schedules-manager.tsx`,
`apps/frontend/app/api/schedules/[id]/route.ts`,
`apps/backend/src/modules/schedules/schedules.controller.ts`.

### 5.5 Messages

| Situation | Message frontend |
| --- | --- |
| Aucun planning chargé en édition | `Aucun planning chargé pour la mise à jour.` |
| Échec du chargement sans détail | `Impossible de charger le planning.` |
| Échec de sauvegarde sans détail | `Impossible de mettre à jour le planning.` |
| Succès | `Planning mis à jour avec succès.` |

Les messages de validation de création s'appliquent aussi à la modification.
Une absence en base produit `Schedule not found.`.

Références :
`apps/frontend/components/schedules/admin-schedules-manager.tsx`,
`apps/backend/src/modules/schedules/schedules.service.ts`.

### 5.6 Activation et désactivation

Chaque carte affiche :

- `Désactiver` pour un planning actif ;
- `Activer` pour un planning inactif.

L'action appelle :

```text
PATCH /api/schedules/<id>/status
        |
        v
PATCH /api/v1/schedules/<id>/status
```

Le payload contient le booléen inverse de `isActive`. Après succès, la liste
locale et le formulaire éventuellement ouvert sont mis à jour.

Les messages sont :

- `Planning réactivé avec succès.` ;
- `Planning désactivé avec succès.` ;
- `Impossible de mettre à jour le statut du planning.` en l'absence d'un
  message backend exploitable.

La case `Planning actif` du formulaire permet aussi de modifier le même champ
pendant une sauvegarde complète.

Références :
`apps/frontend/app/api/schedules/[id]/status/route.ts`,
`apps/frontend/components/schedules/admin-schedules-manager.tsx`,
`apps/backend/src/modules/schedules/dto/update-schedule-status.dto.ts`.

## 6. Association avec les employés

### 6.1 Modèle d'association

Le modèle Prisma définit :

- `Employee.scheduleId`, facultatif ;
- `Employee.schedule`, relation facultative ;
- `Schedule.employees`, collection des employés associés.

Un employé peut être sans planning ou lié à un seul planning. Un planning peut
être lié à plusieurs employés.

Si un planning était supprimé directement au niveau de la base, la relation
est configurée avec `onDelete: SetNull`. Aucune opération applicative de
suppression n'est toutefois présente.

Référence : `apps/backend/prisma/schema.prisma`.

### 6.2 Affectation

L'écran Plannings affiche les affectations mais ne contient aucun contrôle pour
ajouter ou retirer un employé.

L'affectation est réalisée dans le module Employés :

- le formulaire d'un employé propose tous les plannings chargés ;
- un UUID connecte l'employé au planning ;
- le choix `Aucun planning` déconnecte le planning actuel ;
- le backend vérifie l'existence du planning.

Le contrôleur Employés possède également une route spécialisée
`PATCH /employees/:id/schedule`, même si le formulaire actuel utilise la
modification complète de l'employé.

Références :
`apps/frontend/components/employees/admin-employees-manager.tsx`,
`apps/backend/src/modules/employees/employees.controller.ts`,
`apps/backend/src/modules/employees/employees.service.ts`.

### 6.3 Utilisation affichée

Un planning est considéré `En service` dans l'interface dès que son tableau
`employees` contient au moins un élément. Sinon, il est `Libre`.

Ce libellé dépend uniquement du nombre d'affectations. Il ne tient pas compte
de `isActive`.

La carte affiche :

- le nombre d'employés ;
- les noms des deux premiers employés ;
- le nombre restant au-delà de deux.

Les statistiques du module additionnent toutes les affectations, y compris
celles rattachées à un planning inactif.

Références :
`apps/frontend/components/schedules/schedule-manager.helpers.ts`,
`apps/frontend/components/schedules/admin-schedules-manager.tsx`.

### 6.4 Conséquence de la désactivation

Désactiver un planning ne retire pas ses employés. La relation demeure visible
dans la liste et dans le module Employés.

Dans les calculs de présence, un planning inactif n'est pas considéré comme un
planning opérationnel :

- il ne définit pas un jour attendu ;
- il ne produit pas de retard au pointage d'entrée ;
- il ne fournit pas d'heure de sortie prévue ;
- il ne contribue pas au calcul des absences planifiées.

Références :
`apps/backend/src/modules/schedules/schedules.service.ts`,
`apps/backend/src/modules/attendance/attendance.service.ts`,
`apps/backend/src/modules/dashboard/dashboard.service.ts`.

## 7. Utilisation lors du pointage

### 7.1 Chargement de l'employé et du planning

Avant d'enregistrer une arrivée, `AttendanceService` charge l'employé actif
avec son planning. Le service utilise la date du pointage, qui peut provenir de
`occurredAt` ou de la date courante selon l'appel.

Il consulte aussi le calendrier RH pour savoir si la date est non ouvrée.

Références :
`apps/backend/src/modules/attendance/attendance.service.ts`,
`apps/backend/src/modules/calendar/calendar.service.ts`.

### 7.2 Calcul du retard

Le retard n'est calculé que si :

- la date n'est pas un jour non ouvré ;
- un planning est affecté ;
- le planning est actif ;
- le jour du pointage figure dans `workDays`.

Le code construit l'heure planifiée sur la date du pointage en temps UTC, puis
calcule :

```text
retard =
  heure réelle
  - heure de début planifiée
  - marge de retard
```

Le résultat est arrondi à la minute et ne peut pas être inférieur à zéro.

Si le résultat est supérieur à zéro, l'arrivée reçoit le statut `LATE`.
Sinon, l'arrivée est d'abord `INCOMPLETE` tant que la sortie n'est pas
enregistrée.

Sur un jour non ouvré, le retard vaut zéro et le statut devient
`NON_WORKING_DAY_WORK`.

Sans planning actif ou hors des jours du planning, le retard vaut zéro et le
statut initial est `INCOMPLETE`.

Référence :
`apps/backend/src/modules/attendance/attendance.service.ts`.

### 7.3 Heure de sortie prévue

Pour un planning actif applicable au jour :

- l'heure de fin est posée sur la date du pointage ;
- cette valeur devient `scheduledExitTime`.

Elle reste `null` :

- un jour non ouvré ;
- sans planning ;
- avec un planning inactif ;
- un jour absent de `workDays`.

Références :
`apps/backend/src/modules/attendance/attendance.service.ts`,
`apps/backend/src/common/utils/attendance-date.util.ts`.

### 7.4 Sortie anticipée et heures supplémentaires

À la sortie, le service compare l'heure réelle à l'heure prévue :

| Situation | Résultat |
| --- | --- |
| Sortie avant l'heure prévue | `earlyExit=true` et minutes d'avance |
| Sortie exactement à l'heure | Aucun départ anticipé, aucune heure supplémentaire |
| Sortie après l'heure prévue | Minutes et heures supplémentaires, `lateExit=true` |

Les heures supplémentaires sont arrondies à deux décimales.

Pour un travail hors planning ou un jour non ouvré, le système ne calcule pas
l'écart par rapport à une heure de fin. Il compte toute la durée entre l'entrée
et la sortie comme durée supplémentaire et laisse `scheduledExitTime` à
`null`.

Références :
`apps/backend/src/common/utils/attendance-checkout.util.ts`,
`apps/backend/src/modules/attendance/attendance.service.ts`.

### 7.5 Jours prévus et absences

Les jours actifs servent à identifier les jours où l'employé est attendu.
Le calcul mensuel d'absence parcourt les jours planifiés jusqu'à la fenêtre de
calcul, exclut les dates non ouvrées du calendrier RH et compte les dates sans
arrivée.

Sans planning actif, le compteur mensuel d'absence retourne zéro.

Le tableau de bord applique le même principe pour déterminer les employés
attendus du jour : planning affecté, actif, jour applicable et date non
ouvrée exclue.

Références :
`apps/backend/src/modules/attendance/attendance.service.ts`,
`apps/backend/src/modules/dashboard/dashboard.service.ts`,
`apps/backend/src/common/utils/attendance-date.util.ts`.

### 7.6 Instantané du planning

À l'arrivée, si le planning est actif, le pointage enregistre :

- l'identifiant du planning ;
- son nom ;
- son heure de début ;
- son heure de fin ;
- ses jours actifs ;
- sa marge de retard ;
- la date de capture.

Si le planning n'est pas actif, ces champs d'instantané sont vides.

À la sortie, le service préfère l'instantané lorsqu'il existe. Sinon, il
utilise le planning courant s'il est actif. Les changements de planning
effectués après une arrivée ne remplacent donc pas les paramètres déjà
capturés pour ce pointage.

Les exports et les calculs mensuels utilisent également la résolution par
instantané avec repli sur le planning courant.

Références :
`apps/backend/src/common/utils/attendance-schedule-snapshot.util.ts`,
`apps/backend/src/modules/attendance/attendance.service.ts`,
`apps/backend/src/modules/attendance/attendance-monthly-metrics.service.ts`,
`apps/backend/src/modules/attendance/exports/monthly-attendance-export.service.ts`,
`apps/backend/prisma/schema.prisma`.

### 7.7 Statut après sortie

Pour un jour planifié :

- un pointage avec des minutes de retard reste `LATE` ;
- un pointage sans retard devient `PRESENT`.

Pour un travail hors des jours planifiés, le statut final devient `PRESENT`.
Pour une date non ouvrée, il devient `NON_WORKING_DAY_WORK`.

Référence :
`apps/backend/src/modules/attendance/attendance.service.ts`.

## 8. Comportements observés

### 8.1 Erreurs initiales

Si le chargement initial de `GET /schedules` échoue, la frontière d'erreur
affiche :

- `Erreur de rendu` ;
- le contexte `Plannings` ;
- le message de l'erreur ;
- le bouton `Réessayer` ;
- le bouton `Recharger la page`.

Le second bouton ouvre de nouveau `/schedules`.

Références :
`apps/frontend/app/schedules/error.tsx`,
`apps/frontend/lib/api.ts`.

### 8.2 Erreurs des actions

Les actions lisent le message de la réponse JSON lorsque celui-ci est
disponible. À défaut, elles affichent un message propre à l'opération :

- chargement du planning ;
- création ;
- modification ;
- changement de statut.

Les indicateurs `isSubmitting` et `rowAction` sont réinitialisés dans des blocs
`finally`, y compris après une erreur.

Références :
`apps/frontend/components/schedules/admin-schedules-manager.tsx`,
`apps/frontend/lib/client-error.ts`.

### 8.3 Restrictions d'accès

| Situation | Comportement |
| --- | --- |
| Session absente ou invalide | Redirection vers `/login` |
| Rôle `EMPLOYEE` | Redirection vers `/my-attendance` |
| API sans JWT valide | Refus du guard JWT |
| API avec rôle différent de `ADMIN` | Refus du guard de rôles |
| Identifiant de planning non UUID | Rejet par `ParseUUIDPipe` |

Références :
`apps/frontend/app/schedules/page.tsx`,
`apps/backend/src/modules/schedules/schedules.controller.ts`,
`apps/backend/src/modules/auth/guards/jwt-auth.guard.ts`,
`apps/backend/src/modules/auth/guards/roles.guard.ts`.

### 8.4 État sans données

Si aucun planning n'existe, le module affiche :

- le badge `Plannings` ;
- le titre `Aucun planning` ;
- la description `Ajoutez votre premier planning.` ;
- le détail indiquant que la liste se mettra à jour ;
- le bouton `Créer un planning`.

Si des plannings existent mais qu'aucun ne correspond aux filtres, il affiche :

- le badge `Filtres actifs` ;
- le titre `Aucun résultat` ;
- un texte demandant d'ajuster la recherche ou les filtres ;
- le bouton `Effacer les filtres`.

Références :
`apps/frontend/components/schedules/admin-schedules-manager.tsx`,
`apps/frontend/components/admin/admin-empty-state.tsx`.

### 8.5 État de chargement

Pendant le chargement de la route, `schedules/loading.tsx` affiche des
squelettes représentant :

- l'en-tête ;
- les cartes de synthèse ;
- la recherche et les filtres ;
- les lignes du registre ;
- le formulaire.

Référence : `apps/frontend/app/schedules/loading.tsx`.

### 8.6 Comportements particuliers

- La recherche et les filtres s'appliquent uniquement à l'état local.
- Le filtre d'utilisation ne vérifie pas le statut actif du planning.
- Désactiver un planning ne supprime pas ses affectations.
- Le formulaire trie les jours du lundi au dimanche avant l'envoi.
- Le backend accepte tous les jours de la semaine.
- La relation entre le planning et ses employés est retournée dans chaque
  réponse du module.
- Le champ de marge vaut zéro par défaut.
- L'état actif vaut vrai par défaut.
- Les opérations d'administration sont journalisées.

### 8.7 Validations et contraintes

Les contraintes observées comprennent :

- nom unique ;
- nom limité à 80 caractères ;
- format horaire sur 24 heures ;
- fin strictement postérieure au début ;
- marge entière entre 0 et 180 minutes ;
- au moins un jour actif ;
- aucun jour dupliqué ;
- uniquement les sept jours reconnus ;
- statut booléen ;
- accès réservé à `ADMIN`.

## 9. Traçabilité

| Fonctionnalité | Élément observable | Fichiers concernés |
| --- | --- | --- |
| Page Plannings | Route et contrôle d'accès | `apps/frontend/app/schedules/page.tsx` |
| Navigation | Lien du groupe Équipe | `apps/frontend/components/admin/admin-nav.tsx` |
| Action rapide | Lien `Créer un planning` | `apps/frontend/components/dashboard/quick-actions-section.tsx` |
| Chargement | Appel de la liste | `apps/frontend/lib/api.ts` |
| Registre | Cartes et actions | `apps/frontend/components/schedules/admin-schedules-manager.tsx` |
| Valeurs et jours | Constantes et fonctions du formulaire | `apps/frontend/components/schedules/schedule-manager.helpers.ts` |
| Recherche | Recherche locale multi-champs | `apps/frontend/components/schedules/admin-schedules-manager.tsx` |
| Filtres | Statut, utilisation et jour | `apps/frontend/components/schedules/admin-schedules-manager.tsx` |
| Tri fixe | Ordre Prisma | `apps/backend/src/modules/schedules/schedules.service.ts` |
| Absence de pagination | `findMany` sans limite | `apps/backend/src/modules/schedules/schedules.service.ts` |
| Formulaire de création | Champs et contrôles | `apps/frontend/components/schedules/admin-schedules-manager.tsx` |
| Valeurs par défaut | `08:00`, `17:00`, semaine ouvrée | `apps/frontend/components/schedules/schedule-manager.helpers.ts` |
| Proxy de collection | GET et POST | `apps/frontend/app/api/schedules/route.ts` |
| Proxy d'un planning | GET et PATCH | `apps/frontend/app/api/schedules/[id]/route.ts` |
| Proxy de statut | PATCH | `apps/frontend/app/api/schedules/[id]/status/route.ts` |
| Contrôleur backend | Routes réservées à `ADMIN` | `apps/backend/src/modules/schedules/schedules.controller.ts` |
| Validation de création | Formats, jours et marge | `apps/backend/src/modules/schedules/dto/create-schedule.dto.ts` |
| Validation de modification | DTO partiel | `apps/backend/src/modules/schedules/dto/update-schedule.dto.ts` |
| Validation de statut | Booléen requis | `apps/backend/src/modules/schedules/dto/update-schedule-status.dto.ts` |
| Service de planning | Lecture, création, modification et statut | `apps/backend/src/modules/schedules/schedules.service.ts` |
| Unicité du nom | Champ unique et gestion du conflit | `apps/backend/prisma/schema.prisma`, `apps/backend/src/modules/schedules/schedules.service.ts` |
| Association employé | Relation et `scheduleId` | `apps/backend/prisma/schema.prisma` |
| Affectation | Connexion et déconnexion depuis Employés | `apps/backend/src/modules/employees/employees.service.ts` |
| Calcul du retard | Début, marge et heure réelle | `apps/backend/src/modules/attendance/attendance.service.ts` |
| Sortie prévue | Heure de fin applicable | `apps/backend/src/modules/attendance/attendance.service.ts` |
| Sortie anticipée | Comparaison à la sortie prévue | `apps/backend/src/common/utils/attendance-checkout.util.ts` |
| Heures supplémentaires | Écart après la sortie prévue ou durée hors planning | `apps/backend/src/common/utils/attendance-checkout.util.ts` |
| Jours attendus | Vérification de `workDays` | `apps/backend/src/common/utils/attendance-date.util.ts` |
| Absences | Parcours des jours planifiés | `apps/backend/src/modules/attendance/attendance.service.ts` |
| Instantané | Capture et résolution du planning | `apps/backend/src/common/utils/attendance-schedule-snapshot.util.ts` |
| Données historiques | Champs d'instantané du pointage | `apps/backend/prisma/schema.prisma` |
| Audit | Événements de création, modification et statut | `apps/backend/src/modules/schedules/schedules.controller.ts`, `apps/backend/src/common/audit/audit-log.service.ts` |
| État vide | Aucun planning ou aucun résultat | `apps/frontend/components/admin/admin-empty-state.tsx` |
| Chargement visuel | Squelettes Plannings | `apps/frontend/app/schedules/loading.tsx` |
| Erreur de rendu | Écran d'erreur du module | `apps/frontend/app/schedules/error.tsx` |

## 10. Observations

### 10.1 Comportements existants

- La page charge tous les plannings avant son rendu.
- La liste inclut les employés associés à chaque planning.
- La recherche et les filtres ne relancent pas l'API.
- Les créations, modifications et changements d'état mettent à jour la liste
  locale.
- Le nouveau planning est placé en tête de liste.
- La modification recharge le planning avant d'ouvrir le formulaire.
- L'activation peut être modifiée depuis la carte ou le formulaire.
- Les affectations restent présentes lorsqu'un planning est inactif.
- Seul un planning actif influence les calculs de présence.
- Les paramètres du planning actif sont capturés lors de l'arrivée.
- L'instantané est prioritaire pour les traitements historiques.
- Le calendrier RH exclut les jours non ouvrés des jours attendus.

### 10.2 Limitations observées

- Aucune pagination.
- Aucun tri interactif.
- Aucune suppression.
- Aucune duplication.
- Aucun archivage distinct de la désactivation.
- Aucune affectation d'employé depuis l'écran Plannings.
- Aucun déplacement en masse d'employés entre plannings.
- Aucun filtre par plage horaire.
- Aucun filtre par marge de retard.
- Aucun détail complet de la liste des employés au-delà de l'aperçu.
- Aucun planning avec plusieurs plages dans une journée.
- Aucun planning de nuit traversant minuit.
- Aucune pause planifiée.
- Aucune date de début ou de fin de validité.
- Aucune version datée d'un planning dans le module.
- Aucun fuseau horaire configurable par planning.
- Aucune confirmation intermédiaire avant activation ou désactivation.
- Aucun historique d'édition visible dans l'interface.
- Aucun accès visible aux journaux d'audit.

### 10.3 Fonctionnalités absentes

Les mécanismes suivants ne sont pas présents :

- suppression d'un planning ;
- copie d'un planning ;
- import ou export du catalogue ;
- génération automatique de rotations ;
- alternance par semaine ;
- affectation collective depuis le module ;
- planification individuelle par date ;
- exception horaire propre à un employé depuis le planning ;
- validation ou publication d'un planning ;
- notification des employés après modification ;
- aperçu calendaire du planning ;
- détection d'un chevauchement entre plusieurs plannings, puisqu'un employé ne
  possède qu'un seul `scheduleId`.

Ces constats décrivent uniquement l'état du dépôt à la date de génération.
