import { useState } from 'react';
import { planManeuver } from '@/domain/maneuver/maneuver';
import { ManeuverSettingsSchema, ParkingSpotSchema, VehicleDimensionsSchema, ObstacleSchema } from '@/types/domain';
import { useSimulationStore } from '@/stores/simulationStore';
import { NumberField } from '@/components/layout/NumberField';

export function ManeuverPanel() {
  const {
    spot, vehicle, placement, obstacles, maneuverSettings, setManeuverSettings, setManeuverResult,
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

  return (
    <section className="space-y-2 border-b border-slate-200 pb-4">
      <h2 className="text-sm font-semibold">Maniobrabilidad</h2>
      <p className="text-xs text-slate-500">
        Modelo bicicleta, maniobra en pasos y obstáculos estáticos. La trayectoria de salida es el recorrido inverso.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <NumberField
          label="Anchura del pasillo"
          value={maneuverSettings.corridorWidth}
          onChange={(v) => setManeuverSettings({ corridorWidth: v })}
          error={settingsResult.success ? undefined : settingsResult.error.issues.find((issue) => issue.path[0] === 'corridorWidth')?.message}
        />
        <NumberField
          label="Longitud de aproximación"
          value={maneuverSettings.approachLength}
          onChange={(v) => setManeuverSettings({ approachLength: v })}
          error={settingsResult.success ? undefined : settingsResult.error.issues.find((issue) => issue.path[0] === 'approachLength')?.message}
        />
      </div>
      {vehicle.turningDiameter === null && (
        <p className="text-xs text-amber-700">Falta el diámetro de giro; se mostrará “no verificado”.</p>
      )}
      <button
        onClick={run}
        disabled={disabled || busy}
        className="rounded border border-slate-300 bg-white px-2 py-1 text-xs hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? 'Buscando trayectoria…' : 'Analizar entrada y salida'}
      </button>
      {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
    </section>
  );
}
