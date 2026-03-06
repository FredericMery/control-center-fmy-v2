/**
 * Retourne le nom du mois en français
 */
export function getMonthNameFr(date: Date = new Date()): string {
  const months = [
    'janvier',
    'février',
    'mars',
    'avril',
    'mai',
    'juin',
    'juillet',
    'août',
    'septembre',
    'octobre',
    'novembre',
    'décembre',
  ];
  return months[date.getMonth()];
}

/**
 * Retourne le mois et l'année en français (ex: "mars 2026")
 */
export function getMonthYearFr(date: Date = new Date()): string {
  return `${getMonthNameFr(date)} ${date.getFullYear()}`;
}
