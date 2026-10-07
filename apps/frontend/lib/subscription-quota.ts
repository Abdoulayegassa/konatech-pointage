export type SubscriptionQuotaState =
  | 'available'
  | 'close'
  | 'reached'
  | 'exceeded';

export function getSubscriptionQuotaUsage(used: number, limit: number) {
  const percentage = limit > 0 ? Math.round((used / limit) * 100) : 0;
  const remaining = Math.max(0, limit - used);
  const state: SubscriptionQuotaState =
    used > limit
      ? 'exceeded'
      : remaining === 0
        ? 'reached'
        : limit > 0 && used / limit >= 0.8
          ? 'close'
          : 'available';

  return {
    percentage,
    remaining,
    state,
    visualPercentage: Math.min(100, percentage),
  };
}
