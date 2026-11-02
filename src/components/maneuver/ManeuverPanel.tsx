import { useState } from 'react';
import { MANEUVER_CLEARANCE_CM, parkedAngle, planManeuver } from '@/domain/maneuver/maneuver';
import { ManeuverSettingsSchema, ParkingSpotSchema, VehicleDimensionsSchema, ObstacleSchema } from '@/types/domain';
import { useSimulationStore } from '@/stores/simulationStore';
import { NumberField } from '@/components/layout/NumberField';
import { usePreferences } from '@/contexts/PreferencesContext';
import { translateError } from '@/i18n';

export function ManeuverPanel() {
  const { t, language } = usePreferences();
  const {
    spot, vehicle, placement, obstacles, maneuverSettings, maneuverResult, setManeuverSettings, setManeuverResult, setPlacement,
  } = useSimulationStore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsResult = ManeuverSettingsSchema.safeParse(maneuverSettings);
  const disabled = !settingsResult.success || !ParkingSpotSchema.safeParse(spot).success ||
    !VehicleDimensionsSchema.safeParse(vehicle).success ||
    obstacles.some((obstacle) => !ObstacleSchema.safeParse(obstacle).success);

  const run = () => {
    if (disabled || busy) return;
    setError(null);
    setBusy(true);
    setManeuverResult(null);
    window.setTimeout(() => {
      try {
        const result = planManeuver(spot, vehicle, placement, obstacles, maneuverSettings);
        setManeuverResult(result);
      } catch (cause) {
        setError(cause instanceof Error ? translateError(language, cause.message) : t('unknownManeuverError'));
      } finally {
        setBusy(false);
      }
    }, 0);
  };

  const issue = (key: string) => {
    if (settingsResult.success) return undefined;
    const message = settingsResult.error.issues.find((item) => item.path[0] === key)?.message;
    return message ? translateError(language, message) : undefined;
  };
  const exitUnavailable = maneuverResult?.status === 'viable' && maneuverResult.exitStatus !== 'viable';

  return (
    <section className="space-y-2 border-b border-slate-200 pb-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">{t('maneuverability')}</h2>
        <button
          type="button"
          aria-expanded={settingsOpen}
          aria-controls="maneuver-settings"
          onClick={() => setSettingsOpen((open) => !open)}
          className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
        >
          {t('settingsButton')}
        </button>
      </div>
      <p className="text-xs text-slate-500">
        {t('maneuverModel', { clearance: maneuverSettings.minimumObstacleClearance ?? MANEUVER_CLEARANCE_CM })}
      </p>
      {settingsOpen && <div id="maneuver-settings" className="grid grid-cols-2 gap-2 rounded border border-slate-200 bg-slate-50 p-2">
        <NumberField
          label={t('minimumObstacleDistance')}
          value={maneuverSettings.minimumObstacleClearance ?? MANEUVER_CLEARANCE_CM}
          onChange={(v) => setManeuverSettings({ minimumObstacleClearance: v })}
          step={1}
          min={0}
          max={100}
          error={issue('minimumObstacleClearance')}
        />
        <p className="col-span-2 text-xs text-slate-500">
          {t('clearanceRange')}
        </p>
        <NumberField
          label={t('corridorWidth')}
          value={maneuverSettings.corridorWidth}
          onChange={(v) => setManeuverSettings({ corridorWidth: v })}
          error={issue('corridorWidth')}
        />
        <NumberField
          label={t('approachLength')}
          value={maneuverSettings.approachLength}
          onChange={(v) => setManeuverSettings({ approachLength: v })}
          error={issue('approachLength')}
        />
        <SelectField
          label={t('arrivingFrom')}
          value={maneuverSettings.arrivalSide}
          onChange={(arrivalSide) => setManeuverSettings({ arrivalSide })}
          options={[
            ['straight', t('straightAhead')],
            ['left', t('leftOfCorridor')],
            ['right', t('rightOfCorridor')],
          ]}
        />
        <NumberField
          label={t('startPosition')}
          value={maneuverSettings.startOffset}
          onChange={(v) => setManeuverSettings({ startOffset: v })}
          title={t('startPositionHelp')}
          error={issue('startOffset')}
        />
        <SelectField
          label={t('entry')}
          value={maneuverSettings.entryMode}
          onChange={(entryMode) => {
            setManeuverSettings({ entryMode });
            setPlacement({ angle: parkedAngle(spot, entryMode) });
          }}
          options={[['nose-in', t('noseIn')], ['tail-in', t('tailIn')]]}
        />
        <SelectField
          label={t('exit')}
          value={maneuverSettings.exitMode}
          onChange={(exitMode) => setManeuverSettings({ exitMode })}
          options={[['nose-out', t('noseIn')], ['tail-out', t('tailIn')]]}
        />
        <SelectField
          label={t('exitToward')}
          value={maneuverSettings.exitSide}
          onChange={(exitSide) => setManeuverSettings({ exitSide })}
          disabled={maneuverSettings.arrivalSide === 'straight'}
          options={[['same', t('sameSide')], ['left', t('left')], ['right', t('right')]]}
        />
      </div>}
      {maneuverSettings.arrivalSide !== 'straight' && (
        <p className="text-xs text-slate-500">
          {t('lateralArrivalHint')}
        </p>
      )}
      {vehicle.turningDiameter === null && (
        <p className="text-xs text-amber-700">{t('missingTurningDiameter')}</p>
      )}
      {vehicle.widthMirrorsFolded === null && (
        <p className="text-xs text-amber-700">{t('usingBodyWidth')}</p>
      )}
      <button
        onClick={run}
        disabled={disabled || busy}
        className="rounded border border-slate-300 bg-white px-2 py-1 text-xs hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? t('searchingPath') : t('analyzeManeuver')}
      </button>
      {exitUnavailable && <p role="status" className="text-xs text-amber-700">{t('exitStatus', { reason: translateError(language, maneuverResult.exitReason) })}</p>}
      {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
    </section>
  );
}

interface SelectFieldProps<T extends string> {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: ReadonlyArray<readonly [T, string]>;
  disabled?: boolean;
}

function SelectField<T extends string>({ label, value, onChange, options, disabled }: SelectFieldProps<T>) {
  return (
    <label className="block text-xs">
      <span className="mb-0.5 block font-medium text-slate-600">{label}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value as T)}
        className="w-full rounded border border-slate-300 bg-white px-1 py-1 text-xs disabled:opacity-50"
      >
        {options.map(([optionValue, text]) => <option key={optionValue} value={optionValue}>{text}</option>)}
      </select>
    </label>
  );
}
