export type DashboardModuleId = 'pro' | 'perso' | 'memoire' | 'expenses' | 'planning' | 'courrier' | 'emails';

export type DashboardModule = {
  id: DashboardModuleId;
  title: string;
  icon: string;
  bgColor: string;
  textColor: string;
  link: string;
};

export const DASHBOARD_MODULES: DashboardModule[] = [
  {
    id: 'pro',
    title: 'Pro',
    icon: '💼',
    bgColor: 'bg-blue-600/10',
    textColor: 'text-blue-400',
    link: '/dashboard/tasks?type=pro',
  },
  {
    id: 'perso',
    title: 'Perso',
    icon: '🎯',
    bgColor: 'bg-fuchsia-600/10',
    textColor: 'text-fuchsia-400',
    link: '/dashboard/tasks?type=perso',
  },
  {
    id: 'memoire',
    title: 'Memoire',
    icon: '📚',
    bgColor: 'bg-emerald-600/10',
    textColor: 'text-emerald-400',
    link: '/dashboard/memoire',
  },
  {
    id: 'expenses',
    title: 'Depenses',
    icon: '💰',
    bgColor: 'bg-amber-600/10',
    textColor: 'text-amber-400',
    link: '/dashboard/expenses',
  },
  {
    id: 'planning',
    title: 'Planning',
    icon: '📅',
    bgColor: 'bg-teal-600/10',
    textColor: 'text-teal-300',
    link: '/dashboard/agenda',
  },
  {
    id: 'courrier',
    title: 'Courrier',
    icon: '📬',
    bgColor: 'bg-violet-600/10',
    textColor: 'text-violet-400',
    link: '/dashboard/courrier',
  },
  {
    id: 'emails',
    title: 'Emails',
    icon: '✉️',
    bgColor: 'bg-indigo-600/10',
    textColor: 'text-indigo-300',
    link: '/dashboard/emails',
  },
];

const STORAGE_KEY = 'dashboard-enabled-modules';

export function getDefaultEnabledModuleIds(): DashboardModuleId[] {
  return DASHBOARD_MODULES.map((module) => module.id);
}

export function loadEnabledDashboardModules(): DashboardModuleId[] {
  if (typeof window === 'undefined') {
    return getDefaultEnabledModuleIds();
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return getDefaultEnabledModuleIds();

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return getDefaultEnabledModuleIds();

    const allowed = new Set(DASHBOARD_MODULES.map((module) => module.id));
    const filtered = parsed.filter((id): id is DashboardModuleId => typeof id === 'string' && allowed.has(id as DashboardModuleId));

    return filtered.length > 0 ? filtered : getDefaultEnabledModuleIds();
  } catch {
    return getDefaultEnabledModuleIds();
  }
}

export function saveEnabledDashboardModules(ids: DashboardModuleId[]): void {
  if (typeof window === 'undefined') return;

  const allowed = new Set(DASHBOARD_MODULES.map((module) => module.id));
  const safeIds = ids.filter((id) => allowed.has(id));

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(safeIds));
}
