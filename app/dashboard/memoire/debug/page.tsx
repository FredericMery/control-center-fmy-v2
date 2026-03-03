'use client';

import { useState } from 'react';
import { useAuthStore } from '@/store/authStore';

/**
 * Debug page to test Memory Module integration
 * Accessible at: /dashboard/memoire/debug (development only)
 */
export default function MemoryDebugPage() {
  const { user } = useAuthStore();
  const [output, setOutput] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const handleInitTemplates = async () => {
    if (!user) {
      setOutput('❌ Not authenticated');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/memory/init-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      });

      const data = await response.json();
      setOutput(
        `✅ Templates initialized:\n${JSON.stringify(data, null, 2)}`
      );
    } catch (error) {
      setOutput(`❌ Error: ${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleTestSearch = async () => {
    setLoading(true);
    try {
      const response = await fetch(
        '/api/memory/search?sectionId=test&query=wine',
        { method: 'GET' }
      );
      const data = await response.json();
      setOutput(`📊 Search Results:\n${JSON.stringify(data, null, 2)}`);
    } catch (error) {
      setOutput(`❌ Error: ${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  if (process.env.NODE_ENV !== 'development') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-black to-gray-900 p-4">
        <div className="max-w-2xl mx-auto">
          <p className="text-red-400">⛔ Debug page only available in development</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-black to-gray-900 p-4">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-light text-white mb-8">🔧 Memory Module Debug</h1>

        <div className="bg-gray-800 rounded-lg p-6 mb-6 border border-gray-700">
          <h2 className="text-lg font-light text-white mb-4">User Info</h2>
          <div className="space-y-2 text-sm text-gray-300">
            <p>ID: {user?.id || '❌ Not authenticated'}</p>
            <p>Email: {user?.email || 'N/A'}</p>
          </div>
        </div>

        <div className="bg-gray-800 rounded-lg p-6 mb-6 border border-gray-700">
          <h2 className="text-lg font-light text-white mb-4">Test Actions</h2>
          <div className="flex gap-3">
            <button
              onClick={handleInitTemplates}
              disabled={loading || !user}
              className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-light hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {loading ? 'Loading...' : 'Init Templates'}
            </button>
            <button
              onClick={handleTestSearch}
              disabled={loading}
              className="px-4 py-2 bg-green-600 text-white rounded text-sm font-light hover:bg-green-700 transition-colors disabled:opacity-50"
            >
              {loading ? 'Loading...' : 'Test Search'}
            </button>
          </div>
        </div>

        {output && (
          <div className="bg-gray-900 rounded-lg p-4 border border-gray-700 font-mono text-xs text-gray-300 max-h-96 overflow-auto">
            <pre>{output}</pre>
          </div>
        )}
      </div>
    </div>
  );
}
