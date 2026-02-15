"use client";

import { useState } from "react";
import { useAuthStore } from "@/store/authStore";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const signIn = useAuthStore((state) => state.signIn);
  const router = useRouter();

  const handleLogin = async () => {
    await signIn(email, password);
    router.push("/dashboard");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0f172a] via-[#111827] to-[#1e1b4b] px-6 text-white">

      <div className="w-full max-w-md">

        {/* Branding */}
        <div className="text-center mb-10">
          <h1 className="text-5xl font-bold tracking-tight">
            H<span className="text-indigo-400">+</span>
          </h1>
          <p className="mt-3 text-gray-400 text-sm">
            Mémorise ce qui compte
          </p>
        </div>

        {/* Card */}
        <div className="bg-white/5 backdrop-blur-lg border border-white/10 rounded-2xl p-8 shadow-2xl">

          <label className="text-sm text-gray-300">
            Adresse email
          </label>
          <input
            type="email"
            placeholder="Votre email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-2 w-full px-4 py-3 rounded-xl bg-white/10 border border-white/10 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-white placeholder-gray-400 transition"
          />

          <label className="text-sm text-gray-300 mt-5 block">
            Mot de passe
          </label>
          <input
            type="password"
            placeholder="Votre mot de passe"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-2 w-full px-4 py-3 rounded-xl bg-white/10 border border-white/10 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-white placeholder-gray-400 transition"
          />

          <button
            onClick={handleLogin}
            className="mt-8 w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 transition font-semibold shadow-lg"
          >
            Se connecter
          </button>

        </div>

      </div>
    </div>
  );
}
