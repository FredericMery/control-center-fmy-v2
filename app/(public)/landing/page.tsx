"use client";

import Link from 'next/link';
import { useI18n } from '@/components/providers/LanguageProvider';

export default function LandingPage() {
  const { t } = useI18n();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-white to-gray-100 text-center px-6">

      <h1 className="text-4xl font-bold text-blue-950 mb-6">
        My Hyppocampe
      </h1>

      <p className="text-gray-600 max-w-md mb-8">
        {t('landing.subtitle')}
      </p>

      <Link href="/" className="px-6 py-3 bg-black text-white rounded-xl">
        {t('login.signIn')}
      </Link>

    </div>
  );
}
