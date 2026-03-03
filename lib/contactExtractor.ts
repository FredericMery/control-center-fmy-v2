/**
 * 📞 Extract contact information from task descriptions
 */

export interface ContactInfo {
  phone?: string;
  email?: string;
  teams?: string; // Could be display name or email
}

/**
 * Extract phone number from text
 * Matches: +33 6 12 34 56 78, +33612345678, 06 12 34 56 78, 0612345678
 */
export function extractPhone(text: string): string | undefined {
  const patterns = [
    /\+?\d{1,3}[\s.-]?\d{1,4}[\s.-]?\d{1,4}[\s.-]?\d{1,4}[\s.-]?\d{1,4}/,
    /\b0[67]\d[\s.-]?\d{2}[\s.-]?\d{2}[\s.-]?\d{2}[\s.-]?\d{2}\b/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      // Clean up the number (remove spaces, hyphens, dots)
      return match[0].replace(/[\s.-]/g, '');
    }
  }
  return undefined;
}

/**
 * Extract email from text
 */
export function extractEmail(text: string): string | undefined {
  const emailPattern = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/;
  const match = text.match(emailPattern);
  return match ? match[0] : undefined;
}

/**
 * Extract Teams/contact name from text
 * Looks for patterns like "@John Doe", "John Doe -", or just a name after keywords
 */
export function extractTeamsContact(text: string): string | undefined {
  // Pattern 1: @Name Surname
  let match = text.match(/@([A-Za-z\s]+?)[\s\-,]/);
  if (match) return match[1].trim();

  // Pattern 2: Name Surname followed by dash or parenthesis
  match = text.match(/(?:contact|with|meet|call)[\s:]+([A-Za-z\s]+?)[\s\-,\(]/i);
  if (match) return match[1].trim();

  // Pattern 3: Just extract anything that looks like a name (capital letters)
  match = text.match(/\b([A-Z][a-z]+\s[A-Z][a-z]+)\b/);
  if (match) return match[1].trim();

  return undefined;
}

/**
 * Extract all contact info from description
 */
export function extractContacts(description: string): ContactInfo {
  return {
    phone: extractPhone(description),
    email: extractEmail(description),
    teams: extractTeamsContact(description),
  };
}

/**
 * Generate Tel URI
 */
export function generateTelUri(phone: string): string {
  // Ensure it starts with +
  const normalized = phone.startsWith('+') ? phone : '+33' + phone.slice(1);
  return `tel:${normalized}`;
}

/**
 * Generate Mailto URI
 */
export function generateMailtoUri(email: string): string {
  return `mailto:${email}`;
}

/**
 * Generate Teams URI
 * Note: You may need to adjust based on your Teams setup
 */
export function generateTeamsUri(contact: string): string {
  // This opens Teams with the contact search
  return `msteams://l/chat/0/0?users=${encodeURIComponent(contact)}`;
}

/**
 * Generate Teams app deep link (alternative)
 */
export function generateTeamsAppUri(contactEmail: string): string {
  return `https://teams.microsoft.com/l/chat/0/0?users=${encodeURIComponent(contactEmail)}`;
}
