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
      maneuverClearanceCm: 25,
      imageDataUrl: null,
    });
    expect(html).toContain('250 × 500 cm');
    expect(html).toContain('30.0 cm');
    expect(html).toContain('No verificada: no se ha ejecutado el análisis de maniobra');
    expect(html).toContain('modelo geométrico de bicicleta');
    expect(html).toContain('holgura mínima configurada de 25 cm');
    expect(html).toContain('Holgura mínima a obstáculos</th><td>25.0 cm');
    expect(html).toContain('no garantiza una maniobra real segura');
    expect(html).toContain('La maniobrabilidad no está verificada por completo');
    expect(html).toContain('entrada y la salida se planifican por separado');
    expect(html).toContain('No configuradas; apertura no verificada');
    expect(html).toContain('No se pudo capturar la imagen');
  });
  it('genera el informe en el idioma seleccionado', () => {
    const analysis = analyzeFit(spot, vehicle, placement, []);
    const html = createReportHtml({
      projectName: 'Garage',
      spot,
      vehicle,
      placement,
      obstacles: [],
      analysis,
      maneuver: null,
      maneuverClearanceCm: 10,
      imageDataUrl: null,
      language: 'en',
    });
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('<h1>Fit report · Garage</h1>');
    expect(html).toContain('<h2>Parking space and vehicle</h2>');
    expect(html).toContain('No doors are configured; opening is not verified.');
    expect(html).not.toContain('Plaza y vehículo');
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
      maneuverClearanceCm: 10,
      imageDataUrl: null,
    });
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>alert(1)</script>');
  });
  it('avisa cuando los espejos no están disponibles en los datos', () => {
    const vehicleWithoutMirrorWidth = { ...vehicle, widthMirrorsFolded: null, widthMirrorsExtended: null };
    const analysis = analyzeFit(spot, vehicleWithoutMirrorWidth, placement, []);
    const html = createReportHtml({
      projectName: 'Garaje',
      spot,
      vehicle: vehicleWithoutMirrorWidth,
      placement,
      obstacles: [],
      analysis,
      maneuver: null,
      maneuverClearanceCm: 10,
      imageDataUrl: null,
    });
    expect(html).toContain('anchura de uno o ambos espejos no está disponible');
    expect(html).toContain('espejos plegados —');
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
      maneuverClearanceCm: 10,
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
      maneuverClearanceCm: 10,
      imageDataUrl: 'data:image/png;base64,"><script>',
    });
    expect(invalid).not.toContain('<img class="simulation"');
  });
});
