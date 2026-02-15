export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-white to-gray-100 text-center px-6">

      <h1 className="text-4xl font-bold text-blue-950 mb-6">
        My Hyppocampe
      </h1>

      <p className="text-gray-600 max-w-md mb-8">
        Ton cerveau externe.  
        Tâches, mémoire, organisation.
      </p>

      <a
        href="/"
        className="px-6 py-3 bg-black text-white rounded-xl"
      >
        Se connecter
      </a>

    </div>
  );
}
