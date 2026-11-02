import { describe, expect, it } from 'vitest';
import { exportProjectJson, parseProjectJson, type Project } from './project';

const project: Project = {
  version: 1,
  id: 'project-1',
  name: 'Garaje',
  createdAt: '2026-11-02T12:00:00.000Z',
  updatedAt: '2026-11-02T12:30:00.000Z',
  snapshot: {
    spot: { width: 250, length: 500, kind: 'individual', entrance: 'bottom' },
    vehicle: {
      length: 450,
      bodyWidth: 180,
      widthMirrorsFolded: 190,
      widthMirrorsExtended: 205,
      height: 150,
      wheelbase: 270,
      turningDiameter: null,
      doors: [{
        id: 'driver',
        label: 'Conductor',
        side: 'left',
        hingeOffset: -100,
        length: 90,
        thickness: 5,
        angleDeg: 60,
        enabled: true,
        estimated: true,
      }],
    },
    placement: { x: 125, y: 250, angle: 0 },
    obstacles: [{ id: 'pillar', kind: 'column', shape: 'circle', x: 20, y: 20, radius: 15 }],
    maneuverSettings: {
      corridorWidth: 350, approachLength: 600, arrivalSide: 'left', startOffset: 20,
      minimumObstacleClearance: 25, entryMode: 'tail-in', exitMode: 'nose-out', exitSide: 'right',
    },
    view: { showGrid: true, showDimensions: false, snapToGrid: true, gridSize: 10 },
  },
};

describe('proyectos JSON', () => {
  it('exporta e importa un proyecto versionado con todas sus opciones', () => {
    expect(parseProjectJson(exportProjectJson(project))).toEqual(project);
  });
  it('carga proyectos antiguos sin ajustes de escenario usando valores por defecto', () => {
    const legacy = JSON.parse(exportProjectJson(project));
    legacy.snapshot.maneuverSettings = { corridorWidth: 350, approachLength: 600 };
    expect(parseProjectJson(JSON.stringify(legacy)).snapshot.maneuverSettings).toEqual({
      corridorWidth: 350, approachLength: 600, arrivalSide: 'straight', startOffset: 0,
      minimumObstacleClearance: 10, entryMode: 'nose-in', exitMode: 'tail-out', exitSide: 'same',
    });
  });
  it('valida el rango de holgura configurable y permite desactivar el margen adicional', () => {
    const snapshot = JSON.parse(exportProjectJson(project));
    snapshot.snapshot.maneuverSettings.minimumObstacleClearance = 0;
    expect(parseProjectJson(JSON.stringify(snapshot)).snapshot.maneuverSettings.minimumObstacleClearance).toBe(0);

    snapshot.snapshot.maneuverSettings.minimumObstacleClearance = 101;
    expect(() => parseProjectJson(JSON.stringify(snapshot))).toThrow('minimumObstacleClearance');
  });
  it('rechaza JSON mal formado', () => {
    expect(() => parseProjectJson('{')).toThrow('JSON válido');
  });
  it('rechaza esquemas o geometría inválidos antes de importar', () => {
    const invalid = {
      ...project,
      snapshot: { ...project.snapshot, obstacles: [{ id: 'bad', kind: 'wall', shape: 'circle', x: 0, y: 0, radius: 0 }] },
    };
    expect(() => parseProjectJson(JSON.stringify(invalid))).toThrow('no cumple el formato esperado');
  });
  it('rechaza versiones desconocidas', () => {
    expect(() => parseProjectJson(JSON.stringify({ ...project, version: 99 }))).toThrow('version');
  });
});
