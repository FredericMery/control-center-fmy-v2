export const FULL_ACCESS_USER_IDS = new Set([
  '63efeb2d-6b5f-486d-8163-7485b26b9329',
]);

export const FULL_ACCESS_FEATURES = {
  tasks: true,
  emails: true,
  memory: true,
  ai: true,
  vision: true,
  agent: true,
};

export function isFullAccessUser(userId: string): boolean {
  return FULL_ACCESS_USER_IDS.has(userId);
}
