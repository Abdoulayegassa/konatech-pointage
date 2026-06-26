export type AttendanceAction = 'check-in' | 'check-out';

export type AttendanceFlowState =
  | 'idle'
  | 'capturing-proof'
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

export function getFriendlyAttendanceError(message: string | undefined) {
  if (!message) {
    return 'Action impossible pour le moment.';
  }

  if (
    message.includes('zone autorisee') ||
    message.includes('allowed site radius')
  ) {
    return 'Position enregistrée sans contrôle de distance.';
  }

  if (
    message.includes('geolocalisation est obligatoire') ||
    message.includes('location could not be verified')
  ) {
    return 'La position GPS est indisponible, mais le pointage peut continuer avec le selfie.';
  }

  if (message.includes('precision GPS est insuffisante')) {
    return 'La précision GPS est faible, mais le pointage peut continuer avec le selfie.';
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
        description: 'Les justificatifs sont en cours de synchronisation.',
        tone: 'primary',
      };
    case 'capturing-proof':
      return {
        label: 'Photo',
        title: 'Selfie obligatoire',
        description:
          'Prenez une photo claire avant de valider votre pointage.',
        tone: 'primary',
      };
    case 'checking-location':
      return {
        label: 'GPS',
        title: 'Position en cours',
        description: `Votre position est enregistrée si elle est disponible avant ${actionLabel}.`,
        tone: 'primary',
      };
    case 'blocked':
      return {
        label: 'Bloqué',
        title: 'Pointage non finalisé',
        description:
          'La photo est obligatoire pour valider ce pointage.',
        tone: 'danger',
      };
    case 'success':
      return {
        label: 'Valide',
        title:
          action === 'check-out' ? 'Sortie enregistrée' : 'Pointage enregistré',
        description:
          action === 'check-out'
            ? 'Votre heure de départ sécurisée a bien été enregistrée.'
            : 'Votre présence a bien été mise à jour et synchronisée.',
        tone: 'success',
      };
    case 'error':
      return {
        label: 'Erreur',
        title: 'Action non finalisée',
        description:
          "Le pointage n'a pas pu être terminé. Vérifiez le message ci-dessous.",
        tone: 'danger',
      };
    default:
      return {
        label: 'Prêt',
        title: 'Pointage prêt',
        description:
          'Utilisez le bouton disponible pour enregistrer votre présence avec selfie obligatoire.',
        tone: 'neutral',
      };
  }
}
