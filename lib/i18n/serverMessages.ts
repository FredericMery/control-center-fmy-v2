import type { AppLanguage } from '@/lib/i18n/translations';

type ServerMessageKey =
  | 'auth.unauthenticated'
  | 'validation.required'
  | 'memory.questionRequired'
  | 'memory.imageRequired'
  | 'memory.noTextDetected'
  | 'memory.invalidAction'
  | 'memory.detectedTypeRequired'
  | 'memory.errorAgent'
  | 'memory.errorAssistantScan'
  | 'memory.errorAssistantExecute'
  | 'memory.errorNetworkScan'
  | 'memory.errorNetworkExecute'
  | 'memory.defaultAnswer'
  | 'memory.untitled';

const FR: Record<ServerMessageKey, string> = {
  'auth.unauthenticated': 'Non authentifie',
  'validation.required': 'Code de validation IA invalide ou manquant',
  'memory.questionRequired': 'question requise',
  'memory.imageRequired': 'imageBase64 requis',
  'memory.noTextDetected': 'Aucun texte detecte',
  'memory.invalidAction': 'Action invalide',
  'memory.detectedTypeRequired': 'detectedType requis',
  'memory.errorAgent': 'Erreur agent memoire',
  'memory.errorAssistantScan': 'Erreur scan assistant',
  'memory.errorAssistantExecute': 'Erreur assistant execute',
  'memory.errorNetworkScan': 'Erreur reseau pendant le scan',
  'memory.errorNetworkExecute': 'Erreur reseau pendant l execution',
  'memory.defaultAnswer': 'Je n\'ai pas pu generer de reponse.',
  'memory.untitled': 'Memoire sans titre',
};

const EN: Record<ServerMessageKey, string> = {
  'auth.unauthenticated': 'Not authenticated',
  'validation.required': 'AI validation code is missing or invalid',
  'memory.questionRequired': 'question is required',
  'memory.imageRequired': 'imageBase64 is required',
  'memory.noTextDetected': 'No text detected',
  'memory.invalidAction': 'Invalid action',
  'memory.detectedTypeRequired': 'detectedType is required',
  'memory.errorAgent': 'Memory agent error',
  'memory.errorAssistantScan': 'Assistant scan error',
  'memory.errorAssistantExecute': 'Assistant execute error',
  'memory.errorNetworkScan': 'Network error during scan',
  'memory.errorNetworkExecute': 'Network error during execution',
  'memory.defaultAnswer': 'I could not generate an answer.',
  'memory.untitled': 'Untitled memory',
};

const ES: Record<ServerMessageKey, string> = {
  'auth.unauthenticated': 'No autenticado',
  'validation.required': 'El codigo de validacion de IA falta o es invalido',
  'memory.questionRequired': 'la pregunta es obligatoria',
  'memory.imageRequired': 'imageBase64 es obligatorio',
  'memory.noTextDetected': 'No se detecto texto',
  'memory.invalidAction': 'Accion invalida',
  'memory.detectedTypeRequired': 'detectedType es obligatorio',
  'memory.errorAgent': 'Error del agente de memoria',
  'memory.errorAssistantScan': 'Error del escaneo asistente',
  'memory.errorAssistantExecute': 'Error al ejecutar el asistente',
  'memory.errorNetworkScan': 'Error de red durante el escaneo',
  'memory.errorNetworkExecute': 'Error de red durante la ejecucion',
  'memory.defaultAnswer': 'No pude generar una respuesta.',
  'memory.untitled': 'Memoria sin titulo',
};

const TABLE = {
  fr: FR,
  en: EN,
  es: ES,
} satisfies Record<AppLanguage, Record<ServerMessageKey, string>>;

export function translateServerMessage(language: AppLanguage, key: ServerMessageKey): string {
  return TABLE[language][key] || TABLE.fr[key] || key;
}
