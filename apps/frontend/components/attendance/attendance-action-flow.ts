export type AttendanceAction = 'check-in' | 'check-out';

export type AttendanceFlowState =
  | 'idle'
  | 'saving'
  | 'checking-location'
  | 'blocked'
  | 'success'
  | 'error';

export type FlowTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger';

export type AttendanceFlowMeta = {
  label: string;
  title: string;
  description: string;
  tone: FlowTone;
};

export function getActionLabel(action: AttendanceAction | null) {
  return action === 'check-out' ? 'la sortie' : "l'entree";
}

export function getFriendlyAttendanceError(
  message: string | undefined,
) {
  if (!message) {
    return 'Action impossible pour le moment.';
  }

  if (
    message.includes('zone autorisee') ||
    message.includes('allowed site radius')
  ) {
    return 'Vous devez etre dans la zone autorisee pour pointer.';
  }

  if (
    message.includes('geolocalisation est obligatoire') ||
    message.includes('location could not be verified')
  ) {
    return 'La geolocalisation est obligatoire pour pointer.';
  }

  if (message.includes('precision GPS est insuffisante')) {
    return 'La precision GPS est insuffisante pour pointer. Rapprochez-vous et reessayez.';
  }

  return message;
}

export function getAttendanceFlowMeta(
  flowState: AttendanceFlowState,
  action: AttendanceAction | null,
): AttendanceFlowMeta {
  const actionLabel = getActionLabel(action);

  switch (flowState) {
    case 'saving':
      return {
        label: 'En cours',
        title: 'Enregistrement du pointage',
        description:
          'La validation GPS est en cours. Gardez cette page ouverte quelques instants.',
        tone: 'primary',
      };
    case 'checking-location':
      return {
        label: 'GPS',
        title: 'Geolocalisation obligatoire',
        description: `Votre position est verifiee avant ${actionLabel} pour autoriser le pointage uniquement dans la zone prevue.`,
        tone: 'primary',
      };
    case 'blocked':
      return {
        label: 'Bloque',
        title: 'Pointage bloque hors zone',
        description:
          'Activez la geolocalisation et assurez-vous d etre dans la zone autorisee avant de reessayer.',
        tone: 'danger',
      };
    case 'success':
      return {
        label: 'Valide',
        title:
          action === 'check-out' ? 'Sortie enregistree' : 'Pointage enregistre',
        description:
          action === 'check-out'
            ? 'Votre heure de depart securisee a bien ete enregistree.'
            : 'Votre presence a bien ete mise a jour et synchronisee.',
        tone: 'success',
      };
    case 'error':
      return {
        label: 'Erreur',
        title: 'Action non finalisee',
        description:
          "Le pointage n'a pas pu etre termine. Verifiez le message ci-dessous.",
        tone: 'danger',
      };
    default:
      return {
        label: 'Pret',
        title: 'Pointage pret',
        description:
          'Utilisez le bouton disponible pour enregistrer votre presence rapidement avec la securite GPS si elle est active.',
        tone: 'neutral',
      };
  }
}
