export function getClientErrorMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === 'object') {
    const error = 'error' in payload ? payload.error : undefined;

    if (typeof error === 'string') {
      return error;
    }
  }

  return fallback;
}
