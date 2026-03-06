/**
 * Helper pour accéder aux contacts du téléphone
 * Utilise la Contact Picker API (disponible sur navigateurs modernes)
 */

export interface ContactInfo {
  name?: string;
  email?: string;
  tel?: string;
}

/**
 * Vérifie si la Contact Picker API est supportée
 */
export function isContactPickerSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return 'contacts' in navigator && 'ContactsManager' in window;
}

/**
 * Récupère les permissions d'accès aux contacts depuis localStorage
 */
export function getContactsPermission(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem('contacts_permission') === 'granted';
}

/**
 * Définit la permission d'accès aux contacts
 */
export function setContactsPermission(granted: boolean): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(
    'contacts_permission',
    granted ? 'granted' : 'denied'
  );
}

/**
 * Ouvre le picker de contacts et retourne les contacts sélectionnés
 */
export async function pickContacts(): Promise<ContactInfo[]> {
  if (!isContactPickerSupported()) {
    throw new Error('Contact Picker API non supportée');
  }

  if (!getContactsPermission()) {
    throw new Error(
      'Accès aux contacts refusé. Activez-le dans les paramètres.'
    );
  }

  try {
    const contacts = await (navigator as any).contacts.select(
      ['name', 'email', 'tel'],
      { multiple: true }
    );

    return contacts.map((contact: any) => ({
      name: contact.name?.[0],
      email: contact.email?.[0],
      tel: contact.tel?.[0],
    }));
  } catch (error: any) {
    // L'utilisateur a annulé le sélecteur
    if (error.name === 'AbortError') {
      return [];
    }
    throw error;
  }
}

/**
 * Sélectionne un unique contact
 */
export async function pickContact(): Promise<ContactInfo | null> {
  const contacts = await pickContacts();
  return contacts.length > 0 ? contacts[0] : null;
}
