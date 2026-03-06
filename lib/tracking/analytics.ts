/**
 * Helper pour tracker les événements de l'app
 */

export async function trackApiCall(
  apiType: 'google_vision' | 'resend' | 'other',
  token: string | null
) {
  if (!token) return;

  try {
    const response = await fetch('/api/tracking/api-calls', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ api_type: apiType }),
    });

    if (!response.ok) {
      console.warn('Erreur tracking API call:', response.statusText);
    }
  } catch (error) {
    console.warn('Erreur tracking:', error);
  }
}

export async function trackAppUsage(
  eventType:
    | 'scan_invoice'
    | 'upload_expense'
    | 'generate_ndf'
    | 'export_csv'
    | 'view_dashboard'
    | 'view_expenses'
    | 'create_ndf'
    | 'other',
  token: string | null,
  metadata?: any
) {
  if (!token) return;

  try {
    const response = await fetch('/api/tracking/app-usage', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ event_type: eventType, metadata }),
    });

    if (!response.ok) {
      console.warn('Erreur tracking app usage:', response.statusText);
    }
  } catch (error) {
    console.warn('Erreur tracking:', error);
  }
}

export async function getApiCallStats(token: string | null) {
  if (!token) return null;

  try {
    const response = await fetch('/api/tracking/api-calls', {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      console.warn('Erreur récupération stats:', response.statusText);
      return null;
    }

    return await response.json();
  } catch (error) {
    console.warn('Erreur fetch stats:', error);
    return null;
  }
}

export async function getAppUsageStats(token: string | null) {
  if (!token) return null;

  try {
    const response = await fetch('/api/tracking/app-usage', {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      console.warn('Erreur récupération usage stats:', response.statusText);
      return null;
    }

    return await response.json();
  } catch (error) {
    console.warn('Erreur fetch usage stats:', error);
    return null;
  }
}
