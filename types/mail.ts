export type MailContext = 'pro' | 'perso';

export type MailType =
  | 'facture'
  | 'contrat'
  | 'administratif'
  | 'bancaire'
  | 'juridique'
  | 'fiscal'
  | 'assurance'
  | 'sante'
  | 'immobilier'
  | 'relance'
  | 'offre_commerciale'
  | 'autre';

export type MailStatus =
  | 'recu'
  | 'en_attente'
  | 'en_cours'
  | 'traite'
  | 'archive'
  | 'clos';

export type MailPriority = 'urgent' | 'haute' | 'normal' | 'basse';

export const MAIL_MAX_SCAN_FILES = 5;

export interface MailItem {
  id: string;
  user_id: string;
  context: MailContext;
  mail_type: MailType;
  sender_name: string | null;
  sender_address: string | null;
  sender_email: string | null;
  subject: string | null;
  reference: string | null;
  summary: string | null;
  full_text: string | null;
  received_at: string;
  due_date: string | null;
  closed_at: string | null;
  status: MailStatus;
  action_required: boolean;
  action_note: string | null;
  priority: MailPriority;
  scan_url: string | null;
  scan_file_name: string | null;
  scan_urls: string[] | null;
  scan_file_names: string[] | null;
  ai_analyzed: boolean;
  ai_tags: string[] | null;
  ai_confidence: number | null;
  replied: boolean;
  replied_at: string | null;
  reply_note: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type MailItemInsert = Omit<MailItem, 'id' | 'user_id' | 'created_at' | 'updated_at'>;
export type MailItemUpdate = Partial<MailItemInsert>;

export interface MailStats {
  total: number;
  recu: number;
  en_cours: number;
  traite: number;
  clos: number;
  urgent: number;
  with_due_date: number;
  overdue: number;
  action_required: number;
}

export interface AiMailAnalysis {
  context: MailContext;
  subject: string;
  sender_name: string;
  sender_address: string;
  sender_email: string;
  mail_type: MailType;
  summary: string;
  action_required: boolean;
  action_note: string;
  priority: MailPriority;
  due_date: string | null;
  reference: string;
  tags: string[];
  confidence: number;
}

export const MAIL_TYPE_LABELS: Record<MailType, string> = {
  facture: 'Facture',
  contrat: 'Contrat',
  administratif: 'Administratif',
  bancaire: 'Bancaire',
  juridique: 'Juridique',
  fiscal: 'Fiscal / Impôts',
  assurance: 'Assurance',
  sante: 'Santé',
  immobilier: 'Immobilier',
  relance: 'Relance',
  offre_commerciale: 'Offre commerciale',
  autre: 'Autre',
};

export const MAIL_TYPE_ICONS: Record<MailType, string> = {
  facture: '🧾',
  contrat: '📋',
  administratif: '🏛️',
  bancaire: '🏦',
  juridique: '⚖️',
  fiscal: '📊',
  assurance: '🛡️',
  sante: '🏥',
  immobilier: '🏠',
  relance: '⚡',
  offre_commerciale: '📢',
  autre: '📄',
};

export const MAIL_STATUS_LABELS: Record<MailStatus, string> = {
  recu: 'Reçu',
  en_attente: 'En attente',
  en_cours: 'En cours',
  traite: 'Traité',
  archive: 'Archivé',
  clos: 'Clos',
};

export const MAIL_STATUS_COLORS: Record<MailStatus, string> = {
  recu: 'text-blue-400 bg-blue-400/10 border-blue-400/30',
  en_attente: 'text-amber-400 bg-amber-400/10 border-amber-400/30',
  en_cours: 'text-violet-400 bg-violet-400/10 border-violet-400/30',
  traite: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30',
  archive: 'text-slate-400 bg-slate-400/10 border-slate-400/30',
  clos: 'text-slate-500 bg-slate-500/10 border-slate-500/30',
};

export const MAIL_PRIORITY_LABELS: Record<MailPriority, string> = {
  urgent: 'Urgent',
  haute: 'Haute',
  normal: 'Normal',
  basse: 'Basse',
};

export const MAIL_PRIORITY_COLORS: Record<MailPriority, string> = {
  urgent: 'text-red-400 bg-red-400/10 border-red-400/30',
  haute: 'text-orange-400 bg-orange-400/10 border-orange-400/30',
  normal: 'text-slate-400 bg-slate-400/10 border-slate-400/30',
  basse: 'text-slate-500 bg-slate-500/10 border-slate-500/30',
};

export const MAIL_TYPES: MailType[] = [
  'facture', 'contrat', 'administratif', 'bancaire', 'juridique',
  'fiscal', 'assurance', 'sante', 'immobilier', 'relance', 'offre_commerciale', 'autre',
];

export const MAIL_STATUSES: MailStatus[] = [
  'recu', 'en_attente', 'en_cours', 'traite', 'archive', 'clos',
];
