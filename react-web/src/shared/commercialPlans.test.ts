import { expect, it } from "vitest";
import { parseCommercialPlan } from "./commercialPlans";

it("configura capacidades do plano sem preço no frontend", () => {
  const plan = parseCommercialPlan("pro", {
    name: "Pro",
    description: "Operação completa",
    active: true,
    displayOrder: 2,
    features: {
      notifications: true,
      tables: true,
      orders: true,
      inventory: false,
      purchases: false,
      advancedAnalytics: false,
    },
  });
  expect(plan.features.orders).toBe(true);
  expect(plan).not.toHaveProperty("price");
});
