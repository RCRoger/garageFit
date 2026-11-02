import { VehicleDimensionsSchema, ParkingSpotSchema, ObstacleSchema, DoorSchema } from '@/types/domain';
import type { Door, Obstacle } from '@/types/domain';
import { useSimulationStore } from '@/stores/simulationStore';
import { NumberField } from './NumberField';
import { VehicleLibraryPanel } from '@/components/vehicle/VehicleLibraryPanel';
import { OptionalNumberField } from './OptionalNumberField';
import { ManeuverPanel } from '@/components/maneuver/ManeuverPanel';
import { ProjectLibraryPanel } from '@/components/project/ProjectLibraryPanel';

function fieldErrors(issues: { path: PropertyKey[]; message: string }[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of issues) out[String(i.path[0])] = out[String(i.path[0])] ?? i.message;
  return out;
}

type ObstacleNumberField = 'x' | 'y' | 'width' | 'height' | 'radius';

function withObstacleNumber(obstacle: Obstacle, field: ObstacleNumberField, value: number): Obstacle {
  switch (field) {
    case 'x': return { ...obstacle, x: value };
    case 'y': return { ...obstacle, y: value };
    case 'width': return obstacle.shape === 'rect' ? { ...obstacle, width: value } : obstacle;
    case 'height': return obstacle.shape === 'rect' ? { ...obstacle, height: value } : obstacle;
    case 'radius': return obstacle.shape === 'circle' ? { ...obstacle, radius: value } : obstacle;
  }
}

function updateDoor(doors: Door[], id: string, patch: Partial<Door>): Door[] {
  return doors.map((door) => door.id === id ? { ...door, ...patch } : door);
}

export function ConfigPanel() {
  const {
    spot, vehicle, placement, obstacles, setSpot, setVehicle, setPlacement,
    addObstacle, updateObstacle, removeObstacle, centerVehicle,
  } = useSimulationStore();
  const spotErr = fieldErrors(ParkingSpotSchema.safeParse(spot).error?.issues ?? []);
  const vehErr = fieldErrors(VehicleDimensionsSchema.safeParse(vehicle).error?.issues ?? []);

  const addRect = (kind: 'column' | 'wall') => {
    const id = crypto.randomUUID();
    addObstacle({
      id,
      kind,
      shape: 'rect',
      x: kind === 'wall' ? 0 : Math.max(0, spot.width - 40),
      y: kind === 'wall' ? Math.round((spot.length - 100) / 2) : 20,
      width: kind === 'wall' ? 15 : 30,
      height: kind === 'wall' ? 100 : 30,
    });
  };
  const addCircle = () => {
    addObstacle({
      id: crypto.randomUUID(),
      kind: 'column',
      shape: 'circle',
      x: Math.max(0, spot.width - 35),
      y: 35,
      radius: 15,
    });
  };
  const update = (obstacle: Obstacle, field: ObstacleNumberField, value: number) =>
    updateObstacle(obstacle.id, (current) => withObstacleNumber(current, field, value));

  return (
    <div className="space-y-5 p-4">
      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Plaza de parking</h2>
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="Anchura" value={spot.width} onChange={(v) => setSpot({ width: v })} error={spotErr.width} />
          <NumberField label="Longitud" value={spot.length} onChange={(v) => setSpot({ length: v })} error={spotErr.length} />
        </div>
        <label className="block text-xs">
          <span className="mb-0.5 block font-medium text-slate-600">Tipo de plaza</span>
          <select
            value={spot.kind}
            onChange={(e) => setSpot({ kind: e.target.value as typeof spot.kind })}
            className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
          >
            <option value="individual">Individual</option>
            <option value="double">Doble</option>
            <option value="private-garage">Garaje privado</option>
          </select>
        </label>
        <label className="block text-xs" title="Lado por el que se accede. Se usará en la fase de maniobrabilidad.">
          <span className="mb-0.5 block font-medium text-slate-600">Posición de entrada</span>
          <select
            value={spot.entrance}
            onChange={(e) => setSpot({ entrance: e.target.value as typeof spot.entrance })}
            className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
          >
            <option value="bottom">Inferior</option>
            <option value="top">Superior</option>
            <option value="left">Izquierda</option>
            <option value="right">Derecha</option>
          </select>
        </label>
      </section>

      <ManeuverPanel />

      <ProjectLibraryPanel />

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Obstáculos</h2>
          <span className="text-xs text-slate-500">{obstacles.length}</span>
        </div>
        <div className="flex flex-wrap gap-1">
          <button onClick={() => addRect('column')} className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50">+ Columna rectangular</button>
          <button onClick={addCircle} className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50">+ Columna circular</button>
          <button onClick={() => addRect('wall')} className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50">+ Muro</button>
        </div>
        {obstacles.length === 0 && <p className="text-xs text-slate-500">Añade obstáculos o arrástralos sobre el plano.</p>}
        <div className="space-y-2">
          {obstacles.map((obstacle, index) => {
            const errors = fieldErrors(ObstacleSchema.safeParse(obstacle).error?.issues ?? []);
            return (
              <div key={obstacle.id} className="rounded border border-slate-200 p-2">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-xs font-medium">
                    {obstacle.kind === 'wall' ? 'Muro' : 'Columna'} {index + 1}
                    {obstacle.shape === 'circle' ? ' · circular' : ' · rectangular'}
                  </span>
                  <button onClick={() => removeObstacle(obstacle.id)} aria-label={`Eliminar obstáculo ${index + 1}`} className="text-xs text-red-600 hover:text-red-800">Eliminar</button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <NumberField label="X" value={obstacle.x} onChange={(v) => update(obstacle, 'x', v)} error={errors.x} />
                  <NumberField label="Y" value={obstacle.y} onChange={(v) => update(obstacle, 'y', v)} error={errors.y} />
                  {obstacle.shape === 'rect' ? (
                    <>
                      <NumberField label="Anchura" value={obstacle.width} onChange={(v) => update(obstacle, 'width', v)} error={errors.width} />
                      <NumberField label="Longitud" value={obstacle.height} onChange={(v) => update(obstacle, 'height', v)} error={errors.height} />
                    </>
                  ) : (
                    <NumberField label="Radio" value={obstacle.radius} onChange={(v) => update(obstacle, 'radius', v)} error={errors.radius} />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <VehicleLibraryPanel />

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Vehículo (manual)</h2>
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="Longitud" value={vehicle.length} onChange={(v) => setVehicle({ length: v })} error={vehErr.length} />
          <NumberField label="Anchura carrocería" value={vehicle.bodyWidth} onChange={(v) => setVehicle({ bodyWidth: v })} error={vehErr.bodyWidth} />
          <OptionalNumberField label="Espejos plegados" value={vehicle.widthMirrorsFolded} onChange={(v) => setVehicle({ widthMirrorsFolded: v })} error={vehErr.widthMirrorsFolded} />
          <OptionalNumberField label="Espejos desplegados" value={vehicle.widthMirrorsExtended} onChange={(v) => setVehicle({ widthMirrorsExtended: v })} error={vehErr.widthMirrorsExtended} />
          <NumberField label="Altura" value={vehicle.height} onChange={(v) => setVehicle({ height: v })} error={vehErr.height} />
          <NumberField label="Entre ejes" value={vehicle.wheelbase} onChange={(v) => setVehicle({ wheelbase: v })} error={vehErr.wheelbase} />
          <OptionalNumberField
            label="Diámetro de giro (si se conoce)"
            value={vehicle.turningDiameter}
            onChange={(v) => setVehicle({ turningDiameter: v })}
            error={vehErr.turningDiameter}
          />
        </div>
        {(vehicle.widthMirrorsFolded === null || vehicle.widthMirrorsExtended === null) && (
          <p className="text-xs text-amber-700">Anchura de espejos desconocida. Para el encaje se usa la anchura de carrocería; introduce las medidas de los espejos para comprobar el espacio real.</p>
        )}
        <p className="text-xs text-slate-500">Dimensiones editables; los datos que no conozcas pueden dejarse vacíos cuando el campo lo permita.</p>
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Puertas</h2>
          <span className="text-xs text-slate-500">{vehicle.doors.length}</span>
        </div>
        <p className="text-xs text-slate-500">
          La geometría es una aproximación articulada. Los parámetros estimados se marcan como tales.
          El área barrida debe quedar dentro de la plaza.
        </p>
        {vehErr.doors && <p className="text-xs text-red-600">{vehErr.doors}</p>}
        <div className="flex gap-1">
          {(['left', 'right'] as const).map((side) => (
            <button
              key={side}
              onClick={() => setVehicle({ doors: [...vehicle.doors, {
                id: crypto.randomUUID(),
                label: side === 'left' ? 'Conductor' : 'Acompañante',
                side,
                hingeOffset: -vehicle.wheelbase / 2,
                length: Math.min(100, Math.max(20, vehicle.length / 3)),
                thickness: 5,
                angleDeg: 60,
                enabled: true,
                estimated: true,
              }] })}
              className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
            >
              + {side === 'left' ? 'Conductor' : 'Acompañante'} (estimada)
            </button>
          ))}
        </div>
        {vehicle.doors.map((door) => {
          const errors = fieldErrors(DoorSchema.safeParse(door).error?.issues ?? []);
          const setDoor = (patch: Partial<Door>) => setVehicle({ doors: updateDoor(vehicle.doors, door.id, patch) });
          return (
            <div key={door.id} className="space-y-2 rounded border border-slate-200 p-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">{door.label}</span>
                <button onClick={() => setVehicle({ doors: vehicle.doors.filter((item) => item.id !== door.id) })} className="text-xs text-red-600 hover:text-red-800">
                  Eliminar
                </button>
              </div>
              <label className="flex items-center gap-1 text-xs text-slate-600">
                <input type="checkbox" checked={door.enabled} onChange={(e) => setDoor({ enabled: e.target.checked })} />
                Simular apertura
              </label>
              <label className="flex items-center gap-1 text-xs text-amber-700">
                <input type="checkbox" checked={door.estimated} onChange={(e) => setDoor({ estimated: e.target.checked })} />
                Datos estimados
              </label>
              <label className="block text-xs">
                <span className="mb-0.5 block font-medium text-slate-600">Lado</span>
                <select value={door.side} onChange={(e) => setDoor({ side: e.target.value as Door['side'] })} className="w-full rounded border border-slate-300 px-2 py-1 text-sm">
                  <option value="left">Izquierdo</option>
                  <option value="right">Derecho</option>
                </select>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <NumberField label="Bisagra Y" value={door.hingeOffset} onChange={(v) => setDoor({ hingeOffset: v })} error={errors.hingeOffset} />
                <NumberField label="Longitud" value={door.length} onChange={(v) => setDoor({ length: v })} error={errors.length} />
                <NumberField label="Grosor" value={door.thickness} onChange={(v) => setDoor({ thickness: v })} error={errors.thickness} />
                <NumberField label="Ángulo" unit="°" value={door.angleDeg} onChange={(v) => setDoor({ angleDeg: v })} error={errors.angleDeg} />
              </div>
              {(errors.hingeOffset || errors.length || vehErr.doors) && (
                <p className="text-xs text-red-600">Comprueba que la bisagra y la puerta quedan dentro de la longitud del vehículo.</p>
              )}
            </div>
          );
        })}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Posición del vehículo</h2>
        <div className="grid grid-cols-3 gap-2">
          <NumberField label="X" value={Math.round(placement.x * 10) / 10} onChange={(v) => setPlacement({ x: v })} />
          <NumberField label="Y" value={Math.round(placement.y * 10) / 10} onChange={(v) => setPlacement({ y: v })} />
          <NumberField label="Ángulo" unit="°" value={placement.angle} onChange={(v) => setPlacement({ angle: v })} />
        </div>
        <button onClick={centerVehicle} className="rounded border border-slate-300 bg-white px-2 py-1 text-xs hover:bg-slate-50">
          Centrar y alinear
        </button>
      </section>
    </div>
  );
}
