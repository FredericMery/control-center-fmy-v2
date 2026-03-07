"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/authStore";
import { useI18n } from "@/components/providers/LanguageProvider";

export default function NotificationSettingsPage() {
  const { t } = useI18n();
  const user = useAuthStore((state) => state.user);

  type NotificationSettingKey =
    | "daily_summary"
    | "deadline_reminder"
    | "push_enabled"
    | "sound_enabled"
    | "summary_hour";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [settings, setSettings] = useState({
    daily_summary: true,
    deadline_reminder: true,
    push_enabled: false,
    sound_enabled: true,
    summary_hour: 8,
  });

  useEffect(() => {
    if (!user) return;

    const fetchSettings = async () => {
      const { data } = await supabase
        .from("notification_settings")
        .select("*")
        .eq("user_id", user.id)
        .single();

      if (data) {
        setSettings({
          daily_summary: data.daily_summary,
          deadline_reminder: data.deadline_reminder,
          push_enabled: data.push_enabled,
          sound_enabled: data.sound_enabled,
          summary_hour: data.summary_hour,
        });
      } else {
        // création par défaut si pas existant
        await supabase.from("notification_settings").insert({
          user_id: user.id,
        });
      }

      setLoading(false);
    };

    fetchSettings();
  }, [user]);

  const updateSetting = (key: NotificationSettingKey, value: boolean | number) => {
    setSettings((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const toggleItems: Array<{
    key: Extract<NotificationSettingKey, "daily_summary" | "deadline_reminder" | "push_enabled" | "sound_enabled">;
    label: string;
  }> = [
    { key: "daily_summary", label: t('notifications.dailySummary') },
    { key: "deadline_reminder", label: t('notifications.deadlineReminder') },
    { key: "push_enabled", label: t('notifications.mobilePush') },
    { key: "sound_enabled", label: t('notifications.soundVibration') },
  ];

  const saveSettings = async () => {
    if (!user) return;

    setSaving(true);

    await supabase
      .from("notification_settings")
      .update(settings)
      .eq("user_id", user.id);

    setSaving(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-gray-500 text-sm">{t('common.loading')}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white px-6 py-10">

      <h1 className="text-xl font-light tracking-wide mb-10">
        {t('notifications.settingsTitle')}
      </h1>

      <div className="space-y-6 max-w-xl">

        {/* TOGGLES */}
        {toggleItems.map((item) => (
          <div
            key={item.key}
            className="flex justify-between items-center bg-white/5 p-4 rounded-2xl"
          >
            <span className="text-sm font-light tracking-wide text-gray-200">
              {item.label}
            </span>

            <button
              onClick={() =>
                updateSetting(
                  item.key,
                  !settings[item.key]
                )
              }
              className={`w-12 h-6 flex items-center rounded-full transition ${
                settings[item.key as keyof typeof settings]
                  ? "bg-indigo-600"
                  : "bg-gray-600"
              }`}
            >
              <div
                className={`w-5 h-5 bg-white rounded-full shadow-md transform transition ${
                  settings[item.key as keyof typeof settings]
                    ? "translate-x-6"
                    : "translate-x-1"
                }`}
              />
            </button>
          </div>
        ))}

        {/* HEURE RÉSUMÉ */}
        <div className="bg-white/5 p-4 rounded-2xl">
          <div className="flex justify-between items-center mb-3">
            <span className="text-sm font-light tracking-wide text-gray-200">
              {t('notifications.summaryHour')}
            </span>
          </div>

          <input
            type="number"
            min={0}
            max={23}
            value={settings.summary_hour}
            onChange={(e) =>
              updateSetting("summary_hour", parseInt(e.target.value))
            }
            className="w-24 px-3 py-2 bg-black border border-white/10 rounded-xl text-sm text-white focus:outline-none"
          />
          <span className="text-xs text-gray-500 ml-3">
            {t('notifications.localHour')}
          </span>
        </div>

        {/* SAVE BUTTON */}
        <div className="pt-6">
          <button
            onClick={saveSettings}
            disabled={saving}
            className="px-6 py-2 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-sm font-light tracking-wide shadow-lg shadow-indigo-500/30 hover:scale-105 transition-transform"
          >
            {saving ? t('notifications.saving') : t('common.save')}
          </button>
        </div>
      </div>
    </div>
  );
}
