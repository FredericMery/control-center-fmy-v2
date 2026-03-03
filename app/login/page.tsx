"use client";

import { useState } from "react";
import { useAuthStore } from "@/store/authStore";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const signIn = useAuthStore((state) => state.signIn);
  const router = useRouter();

  const handleLogin = async () => {
    if (!email || !password) return;
    
    setIsLoading(true);
    try {
      await signIn(email, password);
      router.push("/dashboard");
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleLogin();
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 px-4">

      <div className="w-full max-w-md">

        {/* BRANDING */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-3xl bg-gradient-to-br from-indigo-600 to-purple-600 mb-4 shadow-lg">
            <span className="text-3xl font-bold text-white">✓</span>
          </div>
          <h1 className="text-4xl font-bold tracking-tight mb-2">H+</h1>
          <p className="text-gray-400">Mémorise ce qui compte</p>
        </div>

        {/* CARD */}
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl space-y-6">

          <div>
            <label className="text-sm font-medium text-gray-300 block mb-2">
              Email
            </label>
            <input
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyPress={handleKeyPress}
              className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-white placeholder-gray-500 transition"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-gray-300 block mb-2">
              Mot de passe
            </label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyPress={handleKeyPress}
              className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-white placeholder-gray-500 transition"
            />
          </div>

          <button
            onClick={handleLogin}
            disabled={!email || !password || isLoading}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold transition-all disabled:opacity-50 shadow-lg shadow-indigo-500/30"
          >
            {isLoading ? "Connexion..." : "Se connecter"}
          </button>

          <div className="text-center text-sm text-gray-400">
            <p>Connexion sauvegardée 30 jours</p>
          </div>

        </div>

        {/* FOOTER */}
        <div className="text-center mt-8 text-xs text-gray-500">
          <p>H+ Control Center • v2.0</p>
        </div>

      </div>
    </div>
  );
}
