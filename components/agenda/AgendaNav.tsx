import Link from 'next/link';

type AgendaNavKey = 'overview' | 'pro' | 'assistant' | 'multi' | 'dayplan' | 'proposals' | 'connectors' | 'preferences';

const ITEMS: Array<{ key: AgendaNavKey; href: string; label: string; helper: string }> = [
  {
    key: 'overview',
    href: '/dashboard/agenda',
    label: 'Vue generale',
    helper: 'Vision rapide et suivi multi-jours',
  },
  {
    key: 'pro',
    href: '/dashboard/agenda/pro',
    label: 'Vue pro',
    helper: 'Lecture par jour et priorites business',
  },
  {
    key: 'assistant',
    href: '/dashboard/agenda/assistant',
    label: 'Assistant',
    helper: 'Proposition automatique de creneaux',
  },
  {
    key: 'multi',
    href: '/dashboard/agenda/multi',
    label: 'Multi-jours',
    helper: 'Vue 3, 5 ou 7 jours avec scroll horizontal',
  },
  {
    key: 'dayplan',
    href: '/dashboard/agenda/journee',
    label: 'Journee',
    helper: 'Colonnes disponible/non disponible 7h-19h',
  },
  {
    key: 'proposals',
    href: '/dashboard/agenda/propositions',
    label: 'Propositions',
    helper: 'Pipeline IA: cree, envoye, relance, confirme',
  },
  {
    key: 'connectors',
    href: '/dashboard/agenda/connecteurs',
    label: 'Connecteurs',
    helper: 'Sources et synchronisations',
  },
  {
    key: 'preferences',
    href: '/dashboard/agenda/preferences',
    label: 'Preferences',
    helper: 'Regles de disponibilite et buffers',
  },
];

export default function AgendaNav({ active }: { active: AgendaNavKey }) {
  return (
    <div className="mb-5 overflow-x-auto pb-1">
      <div className="flex min-w-max gap-2">
        {ITEMS.map((item) => {
          const isActive = item.key === active;
          return (
            <Link
              key={item.key}
              href={item.href}
              className={`rounded-2xl border px-4 py-3 transition ${isActive ? 'border-cyan-300/35 bg-cyan-400/15 text-white shadow-[0_0_0_1px_rgba(103,232,249,0.12)]' : 'border-white/10 bg-slate-900/60 text-slate-200 hover:border-white/20 hover:bg-slate-800/80'}`}
            >
              <p className="text-sm font-medium">{item.label}</p>
              <p className={`mt-1 text-[11px] ${isActive ? 'text-cyan-100/85' : 'text-slate-500'}`}>
                {item.helper}
              </p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}