import { describe, expect, it } from 'vitest';
import { analyzeFit } from '@/domain/collision/analysis';
import { createReportHtml } from './reportHtml';
import type { ParkingSpot, VehicleDimensions } from '@/types/domain';

const spot: ParkingSpot = { width: 250, length: 500, kind: 'individual', entrance: 'bottom' };
const vehicle: VehicleDimensions = {
  length: 450,
  bodyWidth: 180,
  widthMirrorsFolded: 190,
  widthMirrorsExtended: 205,
  height: 150,
  wheelbase: 270,
  turningDiameter: null,
  doors: [],
};
const placement = { x: 125, y: 250, angle: 0 };

describe('informe imprimible', () => {
  it('incluye dimensiones, márgenes y estados explícitos no verificados', () => {
    const analysis = analyzeFit(spot, vehicle, placement, []);
    const html = createReportHtml({
      projectName: 'Garaje',
      spot,
      vehicle,
      placement,
      obstacles: [],
      analysis,
      maneuver: null,
      imageDataUrl: null,
    });
    expect(html).toContain('250 × 500 cm');
    expect(html).toContain('30.0 cm');
    expect(html).toContain('No verificada: no se ha ejecutado el análisis de maniobra');
    expect(html).toContain('No configuradas; apertura no verificada');
    expect(html).toContain('No se pudo capturar la imagen');
  });
  it('escapa texto controlado por el usuario', () => {
    const analysis = analyzeFit(spot, vehicle, placement, []);
    const html = createReportHtml({
      projectName: '<script>alert(1)</script>',
      spot,
      vehicle,
      placement,
      obstacles: [],
      analysis,
      maneuver: null,
      imageDataUrl: null,
    });
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>alert(1)</script>');
  });
  it('acepta solo una captura PNG de datos segura', () => {
    const analysis = analyzeFit(spot, vehicle, placement, []);
    const html = createReportHtml({
      projectName: 'Garaje',
      spot,
      vehicle,
      placement,
      obstacles: [],
      analysis,
      maneuver: null,
      imageDataUrl: 'data:image/png;base64,abc123==',
    });
    expect(html).toContain('<img class="simulation"');
    const invalid = createReportHtml({
      projectName: 'Garaje',
      spot,
      vehicle,
      placement,
      obstacles: [],
      analysis,
      maneuver: null,
      imageDataUrl: 'data:image/png;base64,"><script>',
    });
    expect(invalid).not.toContain('<img class="simulation"');
  });
});
