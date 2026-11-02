import { VehicleDimensionsSchema, ParkingSpotSchema, ObstacleSchema, DoorSchema } from '@/types/domain';
import type { Door, Obstacle } from '@/types/domain';
import { useSimulationStore } from '@/stores/simulationStore';
import { NumberField } from './NumberField';
import { VehicleLibraryPanel } from '@/components/vehicle/VehicleLibraryPanel';
import { OptionalNumberField } from './OptionalNumberField';
import { ManeuverPanel } from '@/components/maneuver/ManeuverPanel';
import { OBSTACLE_TEMPLATES, createObstacleTemplate } from '@/domain/maneuver/obstacleTemplates';
import { ProjectLibraryPanel } from '@/components/project/ProjectLibraryPanel';
import { usePreferences } from '@/contexts/PreferencesContext';
import { translateError } from '@/i18n';

function fieldErrors(issues: { path: PropertyKey[]; message: string }[], language: 'ca' | 'en' | 'es'): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of issues) out[String(i.path[0])] = out[String(i.path[0])] ?? translateError(language, i.message);
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
  const { t, language } = usePreferences();
  const {
    spot, vehicle, placement, obstacles, maneuverSettings, setSpot, setVehicle, setPlacement,
    addObstacle, updateObstacle, removeObstacle, centerVehicle,
  } = useSimulationStore();
  const spotErr = fieldErrors(ParkingSpotSchema.safeParse(spot).error?.issues ?? [], language);
  const vehErr = fieldErrors(VehicleDimensionsSchema.safeParse(vehicle).error?.issues ?? [], language);

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
        <h2 className="text-sm font-semibold">{t('parkingSpot')}</h2>
        <div className="grid grid-cols-2 gap-2">
          <NumberField label={t('width')} value={spot.width} onChange={(v) => setSpot({ width: v })} error={spotErr.width} />
          <NumberField label={t('length')} value={spot.length} onChange={(v) => setSpot({ length: v })} error={spotErr.length} />
        </div>
        <label className="block text-xs">
          <span className="mb-0.5 block font-medium text-slate-600">{t('spotType')}</span>
          <select
            value={spot.kind}
            onChange={(e) => setSpot({ kind: e.target.value as typeof spot.kind })}
            className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
          >
            <option value="individual">{t('individual')}</option>
            <option value="double">{t('double')}</option>
            <option value="private-garage">{t('privateGarage')}</option>
          </select>
        </label>
        <label className="block text-xs" title={t('entranceHelp')}>
          <span className="mb-0.5 block font-medium text-slate-600">{t('entrancePosition')}</span>
          <select
            value={spot.entrance}
            onChange={(e) => setSpot({ entrance: e.target.value as typeof spot.entrance })}
            className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
          >
            <option value="bottom">{t('bottom')}</option>
            <option value="top">{t('top')}</option>
            <option value="left">{t('left')}</option>
            <option value="right">{t('right')}</option>
          </select>
        </label>
      </section>

      <ManeuverPanel />

      <ProjectLibraryPanel />

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">{t('obstacles')}</h2>
          <span className="text-xs text-slate-500">{obstacles.length}</span>
        </div>
        <div className="flex flex-wrap gap-1">
          <button onClick={() => addRect('column')} className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50">{t('addRectangularColumn')}</button>
          <button onClick={addCircle} className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50">{t('addCircularColumn')}</button>
          <button onClick={() => addRect('wall')} className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50">{t('addWall')}</button>
        </div>
        <div className="flex flex-wrap gap-1">
          {OBSTACLE_TEMPLATES.map((template) => (
            <button
              key={template.id}
              onClick={() => addObstacle(createObstacleTemplate(template.id, spot, maneuverSettings, crypto.randomUUID()))}
              title={t('obstacleTemplateHelp')}
              className="rounded border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs hover:bg-emerald-100"
            >{t(template.id === 'opposite-car' ? 'parkedCarOpposite' : template.id === 'aisle-column' ? 'aisleColumn' : template.id === 'curb' ? 'curb' : 'backWall')}</button>
          ))}
        </div>
        {obstacles.length === 0 && <p className="text-xs text-slate-500">{t('addObstacleHint')}</p>}
        <div className="space-y-2">
          {obstacles.map((obstacle, index) => {
            const errors = fieldErrors(ObstacleSchema.safeParse(obstacle).error?.issues ?? [], language);
            return (
              <div key={obstacle.id} className="rounded border border-slate-200 p-2">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-xs font-medium">
                    {obstacle.kind === 'wall' ? t('wall') : obstacle.kind === 'custom' ? t('obstacle') : t('column')} {index + 1}
                    {obstacle.shape === 'circle' ? ` · ${t('circular')}` : ` · ${t('rectangular')}`}
                  </span>
                  <button onClick={() => removeObstacle(obstacle.id)} aria-label={t('removeObstacle', { index: index + 1 })} className="text-xs text-red-600 hover:text-red-800">{t('remove')}</button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <NumberField label="X" value={obstacle.x} onChange={(v) => update(obstacle, 'x', v)} error={errors.x} />
                  <NumberField label="Y" value={obstacle.y} onChange={(v) => update(obstacle, 'y', v)} error={errors.y} />
                  {obstacle.shape === 'rect' ? (
                    <>
                      <NumberField label={t('width')} value={obstacle.width} onChange={(v) => update(obstacle, 'width', v)} error={errors.width} />
                      <NumberField label={t('length')} value={obstacle.height} onChange={(v) => update(obstacle, 'height', v)} error={errors.height} />
                    </>
                  ) : (
                    <NumberField label={t('radius')} value={obstacle.radius} onChange={(v) => update(obstacle, 'radius', v)} error={errors.radius} />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <VehicleLibraryPanel />

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">{t('manualVehicle')}</h2>
        <div className="grid grid-cols-2 gap-2">
          <NumberField label={t('length')} value={vehicle.length} onChange={(v) => setVehicle({ length: v })} error={vehErr.length} />
          <NumberField label={t('bodyWidth')} value={vehicle.bodyWidth} onChange={(v) => setVehicle({ bodyWidth: v })} error={vehErr.bodyWidth} />
          <OptionalNumberField label={t('foldedMirrors')} value={vehicle.widthMirrorsFolded} onChange={(v) => setVehicle({ widthMirrorsFolded: v })} error={vehErr.widthMirrorsFolded} />
          <OptionalNumberField label={t('extendedMirrors')} value={vehicle.widthMirrorsExtended} onChange={(v) => setVehicle({ widthMirrorsExtended: v })} error={vehErr.widthMirrorsExtended} />
          <NumberField label={t('height')} value={vehicle.height} onChange={(v) => setVehicle({ height: v })} error={vehErr.height} />
          <NumberField label={t('wheelbase')} value={vehicle.wheelbase} onChange={(v) => setVehicle({ wheelbase: v })} error={vehErr.wheelbase} />
          <OptionalNumberField
            label={t('turningDiameter')}
            value={vehicle.turningDiameter}
            onChange={(v) => setVehicle({ turningDiameter: v })}
            error={vehErr.turningDiameter}
          />
        </div>
        {(vehicle.widthMirrorsFolded === null || vehicle.widthMirrorsExtended === null) && (
          <p className="text-xs text-amber-700">{t('mirrorsUnknown')}</p>
        )}
        <p className="text-xs text-slate-500">{t('editableDimensions')}</p>
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">{t('doors')}</h2>
          <span className="text-xs text-slate-500">{vehicle.doors.length}</span>
        </div>
        <p className="text-xs text-slate-500">
          {t('doorGeometry')}
        </p>
        {vehErr.doors && <p className="text-xs text-red-600">{vehErr.doors}</p>}
        <div className="flex gap-1">
          {(['left', 'right'] as const).map((side) => (
            <button
              key={side}
              onClick={() => setVehicle({ doors: [...vehicle.doors, {
                id: crypto.randomUUID(),
                label: side === 'left' ? t('driver') : t('passenger'),
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
              + {side === 'left' ? t('driver') : t('passenger')} ({t('estimated')})
            </button>
          ))}
        </div>
        {vehicle.doors.map((door) => {
          const errors = fieldErrors(DoorSchema.safeParse(door).error?.issues ?? [], language);
          const setDoor = (patch: Partial<Door>) => setVehicle({ doors: updateDoor(vehicle.doors, door.id, patch) });
          return (
            <div key={door.id} className="space-y-2 rounded border border-slate-200 p-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">{door.label}</span>
                <button onClick={() => setVehicle({ doors: vehicle.doors.filter((item) => item.id !== door.id) })} className="text-xs text-red-600 hover:text-red-800">
                  {t('deleteDoor')}
                </button>
              </div>
              <label className="flex items-center gap-1 text-xs text-slate-600">
                <input type="checkbox" checked={door.enabled} onChange={(e) => setDoor({ enabled: e.target.checked })} />
                {t('simulateOpening')}
              </label>
              <label className="flex items-center gap-1 text-xs text-amber-700">
                <input type="checkbox" checked={door.estimated} onChange={(e) => setDoor({ estimated: e.target.checked })} />
                {t('estimatedData')}
              </label>
              <label className="block text-xs">
                <span className="mb-0.5 block font-medium text-slate-600">{t('side')}</span>
                <select value={door.side} onChange={(e) => setDoor({ side: e.target.value as Door['side'] })} className="w-full rounded border border-slate-300 px-2 py-1 text-sm">
                  <option value="left">{t('left')}</option>
                  <option value="right">{t('right')}</option>
                </select>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <NumberField label={t('hingeY')} value={door.hingeOffset} onChange={(v) => setDoor({ hingeOffset: v })} error={errors.hingeOffset} />
                <NumberField label={t('length')} value={door.length} onChange={(v) => setDoor({ length: v })} error={errors.length} />
                <NumberField label={t('thickness')} value={door.thickness} onChange={(v) => setDoor({ thickness: v })} error={errors.thickness} />
                <NumberField label={t('angle')} unit="°" value={door.angleDeg} onChange={(v) => setDoor({ angleDeg: v })} error={errors.angleDeg} />
              </div>
              {(errors.hingeOffset || errors.length || vehErr.doors) && (
                <p className="text-xs text-red-600">{t('checkDoorFit')}</p>
              )}
            </div>
          );
        })}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">{t('vehiclePosition')}</h2>
        <div className="grid grid-cols-3 gap-2">
          <NumberField label="X" value={Math.round(placement.x * 10) / 10} onChange={(v) => setPlacement({ x: v })} />
          <NumberField label="Y" value={Math.round(placement.y * 10) / 10} onChange={(v) => setPlacement({ y: v })} />
          <NumberField label={t('angle')} unit="°" value={placement.angle} onChange={(v) => setPlacement({ angle: v })} />
        </div>
        <button onClick={centerVehicle} className="rounded border border-slate-300 bg-white px-2 py-1 text-xs hover:bg-slate-50">
          {t('centerAndAlign')}
        </button>
      </section>
    </div>
  );
}
