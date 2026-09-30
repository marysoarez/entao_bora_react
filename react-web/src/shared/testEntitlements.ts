export function fullEntitlements() {
  return {
    schemaVersion: 1,
    planKey: "test-full",
    status: "active",
    features: {
      notifications: true,
      tables: true,
      orders: true,
      inventory: true,
      purchases: true,
      advancedAnalytics: true,
    },
    validUntil: null,
  };
}
