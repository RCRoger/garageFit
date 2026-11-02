import { useState } from 'react';
import { parkedAngle, planManeuver } from '@/domain/maneuver/maneuver';
import { ManeuverSettingsSchema, ParkingSpotSchema, VehicleDimensionsSchema, ObstacleSchema } from '@/types/domain';
import { useSimulationStore } from '@/stores/simulationStore';
import { NumberField } from '@/components/layout/NumberField';

export function ManeuverPanel() {
  const {
    spot, vehicle, placement, obstacles, maneuverSettings, maneuverResult, setManeuverSettings, setManeuverResult, setPlacement,
  } = useSimulationStore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
        setError(cause instanceof Error ? cause.message : 'Error desconocido al analizar la maniobra.');
      } finally {
        setBusy(false);
      }
    }, 0);
  };

  const issue = (key: string) =>
    settingsResult.success ? undefined : settingsResult.error.issues.find((item) => item.path[0] === key)?.message;
  const exitUnavailable = maneuverResult?.status === 'viable' && maneuverResult.exitStatus !== 'viable';

  return (
    <section className="space-y-2 border-b border-slate-200 pb-4">
      <h2 className="text-sm font-semibold">Maniobrabilidad</h2>
      <p className="text-xs text-slate-500">
        Modelo bicicleta, maniobra en pasos y obstáculos estáticos. La entrada y la salida se planifican por separado.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <NumberField
          label="Anchura del pasillo"
          value={maneuverSettings.corridorWidth}
          onChange={(v) => setManeuverSettings({ corridorWidth: v })}
          error={issue('corridorWidth')}
        />
        <NumberField
          label="Longitud de aproximación"
          value={maneuverSettings.approachLength}
          onChange={(v) => setManeuverSettings({ approachLength: v })}
          error={issue('approachLength')}
        />
        <SelectField
          label="Llegada desde"
          value={maneuverSettings.arrivalSide}
          onChange={(arrivalSide) => setManeuverSettings({ arrivalSide })}
          options={[
            ['straight', 'Frente a la plaza'],
            ['left', 'Izquierda del pasillo'],
            ['right', 'Derecha del pasillo'],
          ]}
        />
        <NumberField
          label="Posición inicial"
          value={maneuverSettings.startOffset}
          onChange={(v) => setManeuverSettings({ startOffset: v })}
          title="Desplaza el punto de partida respecto al eje de la plaza (o de la calle)."
          error={issue('startOffset')}
        />
        <SelectField
          label="Entrada"
          value={maneuverSettings.entryMode}
          onChange={(entryMode) => {
            setManeuverSettings({ entryMode });
            setPlacement({ angle: parkedAngle(spot, entryMode) });
          }}
          options={[['nose-in', 'De frente'], ['tail-in', 'De culo']]}
        />
        <SelectField
          label="Salida"
          value={maneuverSettings.exitMode}
          onChange={(exitMode) => setManeuverSettings({ exitMode })}
          options={[['nose-out', 'De frente'], ['tail-out', 'De culo']]}
        />
        <SelectField
          label="Salir hacia"
          value={maneuverSettings.exitSide}
          onChange={(exitSide) => setManeuverSettings({ exitSide })}
          disabled={maneuverSettings.arrivalSide === 'straight'}
          options={[['same', 'Mismo lado'], ['left', 'Izquierda'], ['right', 'Derecha']]}
        />
      </div>
      {maneuverSettings.arrivalSide !== 'straight' && (
        <p className="text-xs text-slate-500">
          Con llegada lateral el pasillo es una calle transversal; la anchura debe permitir girar el coche.
        </p>
      )}
      {vehicle.turningDiameter === null && (
        <p className="text-xs text-amber-700">Falta el diámetro de giro; se mostrará “no verificado”.</p>
      )}
      {vehicle.widthMirrorsFolded === null && (
        <p className="text-xs text-amber-700">Se usa la anchura de carrocería como referencia de encaje; la holgura de los espejos no está verificada.</p>
      )}
      <button
        onClick={run}
        disabled={disabled || busy}
        className="rounded border border-slate-300 bg-white px-2 py-1 text-xs hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? 'Buscando trayectoria…' : 'Analizar entrada y salida'}
      </button>
      {exitUnavailable && <p role="status" className="text-xs text-amber-700">Salida: {maneuverResult.exitReason}</p>}
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
