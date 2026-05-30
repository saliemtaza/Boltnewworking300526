import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';

interface SettingsMap {
  [key: string]: string;
}

export function useSettings() {
  const [settings, setSettings] = useState<SettingsMap>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSettings();

    const channel = supabase
      .channel('settings-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'settings' }, (payload) => {
        const key = (payload.new as { key: string }).key;
        const value = (payload.new as { value: string }).value;
        setSettings((prev) => ({ ...prev, [key]: value }));
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  async function fetchSettings() {
    setLoading(true);
    const { data } = await supabase.from('settings').select('key, value');
    if (data) {
      const map: SettingsMap = {};
      for (const row of data) {
        map[row.key] = row.value;
      }
      setSettings(map);
    }
    setLoading(false);
  }

  const updateSetting = useCallback(async (key: string, value: string) => {
    const { error } = await supabase.from('settings').upsert({ key, value, updated_at: new Date().toISOString() });
    if (error) console.error('Setting update error:', error);
  }, []);

  const adminPin = settings.admin_pin ?? '';
  const cartDisabled = settings.cart_disabled === 'true';

  return { settings, loading, adminPin, cartDisabled, updateSetting };
}
