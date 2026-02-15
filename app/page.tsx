"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function AuthPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [resetMode, setResetMode] = useState(false);

  const passwordStrong =
    password.length >= 8 &&
    /[A-Z]/.test(password) &&
    /[0-9]/.test(password);

  const handleAuth = async () => {
    setLoading(true);

    if (resetMode) {
      await supabase.auth.resetPasswordForEmail(email);
      alert("Email de réinitialisation envoyé");
      setLoading(false);
      return;
    }

    if (isLogin) {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        alert(error.message);
        setLoading(false);
        return;
      }

      router.push("/dashboard");
    } else {
      if (!passwordStrong) {
        alert("Mot de passe trop faible");
        setLoading(false);
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) {
        alert(error.message);
        setLoading(false);
        return;
      }

      if (data.user) {
        await supabase.from("profiles").insert({
          id: data.user.id,
          username,
        });
      }

      router.push("/dashboard");
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white p-8 rounded-3xl shadow-lg w-full max-w-md space-y-6">

        <h1 className="text-xl font-semibold text-blue-950 text-center">
          My Hyppocampe
        </h1>

        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full p-3 border rounded-xl"
        />

        {!isLogin && !resetMode && (
          <input
            placeholder="Pseudo"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full p-3 border rounded-xl"
          />
        )}

        {!resetMode && (
          <>
            <input
              type="password"
              placeholder="Mot de passe"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-3 border rounded-xl"
            />

            {!isLogin && (
              <p className="text-xs text-gray-500">
                8 caractères minimum, 1 majuscule, 1 chiffre
              </p>
            )}
          </>
        )}

        <button
          onClick={handleAuth}
          disabled={loading}
          className="w-full py-3 bg-black text-white rounded-xl"
        >
          {loading
            ? "Chargement..."
            : resetMode
            ? "Réinitialiser"
            : isLogin
            ? "Se connecter"
            : "Créer un compte"}
        </button>

        <div className="text-sm text-center text-gray-500 space-y-2">
          {!resetMode && (
            <p
              onClick={() => setIsLogin(!isLogin)}
              className="cursor-pointer"
            >
              {isLogin
                ? "Créer un compte"
                : "Déjà un compte ? Se connecter"}
            </p>
          )}

          <p
            onClick={() => setResetMode(!resetMode)}
            className="cursor-pointer"
          >
            {resetMode
              ? "Retour"
              : "Mot de passe oublié ?"}
          </p>
        </div>
      </div>
    </div>
  );
}
