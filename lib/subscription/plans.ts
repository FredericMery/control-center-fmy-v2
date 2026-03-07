export type SubscriptionPlan = 'BASIC' | 'PLUS' | 'PRO';

export interface PlanDefinition {
  plan: SubscriptionPlan;
  price: number;
  features: {
    tasks: boolean;
    emails: boolean;
    memory: boolean;
    ai: boolean;
    vision: boolean;
    agent: boolean;
  };
}

export const PLAN_DEFINITIONS: Record<SubscriptionPlan, PlanDefinition> = {
  BASIC: {
    plan: 'BASIC',
    price: 1,
    features: {
      tasks: true,
      emails: false,
      memory: false,
      ai: false,
      vision: false,
      agent: false,
    },
  },
  PLUS: {
    plan: 'PLUS',
    price: 2,
    features: {
      tasks: true,
      emails: true,
      memory: false,
      ai: false,
      vision: false,
      agent: false,
    },
  },
  PRO: {
    plan: 'PRO',
    price: 6.99,
    features: {
      tasks: true,
      emails: true,
      memory: true,
      ai: true,
      vision: true,
      agent: true,
    },
  },
};
