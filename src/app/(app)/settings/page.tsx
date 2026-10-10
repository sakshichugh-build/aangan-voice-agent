import { getSettingsData } from '@/lib/dashboard/detail';
import { Card, PageHeader } from '@/components/ui';
import { RateEditor, DesignerEditor, SettingJsonEditor, ServiceAreaToggle } from './editors';

// Settings keys that are meaningfully edited as JSON.
const JSON_KEYS = ['office_hours', 'callback_window', 'sla', 'budget_thresholds', 'commercial_size', 'timeline', 'overflow', 'pipeline_value_band'];

export default async function SettingsPage() {
  const s = await getSettingsData();
  const settingsMap = new Map(s.settings.map((x) => [x.key, x.value]));

  return (
    <>
      <PageHeader title="Settings" subtitle="Office hours, designers, service area, budget thresholds, rates — all editable, never hard-coded." />

      <div className="space-y-4">
        <Card title="Designers (Telegram linked? no — email handoff)">
          <DesignerEditor designers={s.designers} />
        </Card>

        <Card title="Rates (₹ per Vaani minute, $ per 1M tokens, FX, fixed monthly)">
          <RateEditor rates={s.rates} />
        </Card>

        <Card title="Business rules">
          {JSON_KEYS.filter((k) => settingsMap.has(k)).map((k) => (
            <SettingJsonEditor key={k} settingKey={k} value={settingsMap.get(k)} />
          ))}
        </Card>

        <Card title="Service area">
          <div className="flex flex-wrap gap-2">
            {s.serviceAreas.map((a) => (
              <ServiceAreaToggle key={a.name} name={a.name} region={a.region} inService={a.in_service} />
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
