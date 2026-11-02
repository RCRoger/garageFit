import type { FitAnalysis } from '@/domain/collision/analysis';
import { MANEUVER_CLEARANCE_CM, type ManeuverResult } from '@/domain/maneuver/maneuver';
import type { Obstacle, ParkingSpot, Placement, VehicleDimensions } from '@/types/domain';

export interface ReportData {
  projectName: string;
  spot: ParkingSpot;
  vehicle: VehicleDimensions;
  placement: Placement;
  obstacles: readonly Obstacle[];
  analysis: FitAnalysis;
  maneuver: ManeuverResult | null;
  imageDataUrl: string | null;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]!);
}

function cm(value: number | null): string {
  return value === null ? '—' : `${value.toFixed(1)} cm`;
}

function row(label: string, value: string): string {
  return `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`;
}

export function createReportHtml(data: ReportData): string {
  const image = data.imageDataUrl && /^data:image\/png;base64,[a-zA-Z0-9+/=]+$/.test(data.imageDataUrl)
    ? `<img class="simulation" alt="Vista cenital de la simulación" src="${data.imageDataUrl}">`
    : '<p class="muted">No se pudo capturar la imagen del simulador.</p>';
  const obstacleRows = data.obstacles.length
    ? data.obstacles.map((obstacle, index) => {
      const collision = data.analysis.collidingObstacleIds.includes(obstacle.id);
      const description = obstacle.shape === 'rect'
        ? `${obstacle.width} × ${obstacle.height} cm en (${obstacle.x}, ${obstacle.y})`
        : `radio ${obstacle.radius} cm en (${obstacle.x}, ${obstacle.y})`;
      return row(`Obstáculo ${index + 1} · ${obstacle.kind}`, `${description} · ${collision ? 'colisión con el vehículo' : 'sin colisión con el vehículo'}`);
    }).join('')
    : row('Obstáculos', 'Ninguno configurado');
  const doorRows = data.analysis.doorResults.length
    ? data.analysis.doorResults.map((door) => row(
      door.label,
      `${door.status === 'clear' ? 'barrido libre' : 'colisión'}${door.blockedByObstacleIds.length ? ` · obstáculos: ${door.blockedByObstacleIds.join(', ')}` : ''}${door.blockedBySpotBoundary ? ' · fuera del perímetro' : ''}${door.estimated ? ' · estimación' : ''}`,
    )).join('')
    : row('Puertas', 'No configuradas; apertura no verificada');
  const maneuverText = !data.maneuver
    ? 'No verificada: no se ha ejecutado el análisis de maniobra.'
    : `${data.maneuver.status === 'viable' ? 'Trayectoria viable en el modelo' : data.maneuver.status === 'not-viable' ? 'Sin trayectoria en el modelo configurado' : 'No verificada'} · ${data.maneuver.reason}`;
  const warnings = [
    `La maniobra usa un modelo geométrico de bicicleta, obstáculos estáticos y una holgura mínima de ${MANEUVER_CLEARANCE_CM} cm frente a obstáculos; no garantiza una maniobra real segura.`,
    ...data.analysis.doorResults.filter((door) => door.estimated).map((door) => `Los parámetros de la puerta “${door.label}” son estimados.`),
    ...(data.analysis.doorStatus === 'not-configured' ? ['No hay puertas configuradas; su apertura no está verificada.'] : []),
    ...(data.vehicle.widthMirrorsFolded === null || data.vehicle.widthMirrorsExtended === null
      ? ['La anchura de uno o ambos espejos no está disponible; el encaje utiliza la anchura de carrocería cuando falta la medida plegada.']
      : []),
    ...(!data.maneuver || data.maneuver.status === 'not-verified' || data.maneuver.exitStatus === 'not-verified'
      ? ['La maniobrabilidad no está verificada por completo.']
      : []),
    ...(data.analysis.status === 'limited' ? ['El encaje presenta limitaciones; revisar márgenes, obstáculos y apertura de puertas.'] : []),
    ...(data.analysis.status === 'collision' ? ['La huella del vehículo sobresale de la plaza o colisiona con un obstáculo.'] : []),
  ];
  const conclusion = data.analysis.status === 'collision'
    ? 'La huella del vehículo no cabe sin colisión en la configuración actual.'
    : data.analysis.status === 'limited'
      ? 'El vehículo cabe con limitaciones en el análisis geométrico; no asumir que la apertura o la maniobra sean cómodas.'
      : 'El vehículo cabe con el margen geométrico configurado. La maniobrabilidad debe leerse por separado.';

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Informe · ${escapeHtml(data.projectName)}</title>
<style>
body{font:14px/1.5 system-ui,sans-serif;color:#1e293b;margin:32px auto;max-width:900px;padding:0 24px}
h1,h2{color:#0f172a}h1{font-size:24px}h2{font-size:17px;margin-top:28px}
table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:7px 10px;border-bottom:1px solid #e2e8f0;vertical-align:top}
th{width:35%;font-weight:600}.simulation{max-width:100%;max-height:70vh;object-fit:contain;border:1px solid #cbd5e1}
.summary{padding:12px;border:1px solid #94a3b8;background:#f8fafc}.muted{color:#64748b}
@media print{body{margin:0 auto;padding:0 12mm}h2{break-after:avoid}.simulation{max-height:65vh}}
</style></head><body>
<h1>Informe de encaje · ${escapeHtml(data.projectName)}</h1>
<p class="muted">Generado ${escapeHtml(new Date().toLocaleString())} · Unidades: cm</p>
<h2>Simulación</h2>${image}
<h2>Plaza y vehículo</h2><table>
${row('Plaza', `${data.spot.width} × ${data.spot.length} cm · ${data.spot.kind} · entrada ${data.spot.entrance}`)}
${row('Vehículo', `${data.vehicle.length} cm largo · ${data.vehicle.bodyWidth} cm carrocería · espejos plegados ${cm(data.vehicle.widthMirrorsFolded)} · espejos desplegados ${cm(data.vehicle.widthMirrorsExtended)}`)}
${row('Altura / batalla', `${data.vehicle.height} cm / ${data.vehicle.wheelbase} cm`)}
${row('Diámetro de giro', cm(data.vehicle.turningDiameter))}
${row('Posición / orientación', `(${data.placement.x.toFixed(1)}, ${data.placement.y.toFixed(1)}) cm · ${data.placement.angle.toFixed(1)}°`)}
</table>
<h2>Márgenes y resultado geométrico</h2><table>
${row('Estado general', data.analysis.status === 'ok' ? 'Correcto' : data.analysis.status === 'limited' ? 'Cabe con limitaciones' : 'No cabe / colisión')}
${row('Superior / inferior', `${cm(data.analysis.margins.top)} / ${cm(data.analysis.margins.bottom)}`)}
${row('Izquierdo / derecho', `${cm(data.analysis.margins.left)} / ${cm(data.analysis.margins.right)}`)}
${row('Distancia mínima a obstáculos', cm(data.analysis.minObstacleDistance))}
</table>
<h2>Obstáculos</h2><table>${obstacleRows}</table>
<h2>Apertura de puertas</h2><table>${row('Resultado', data.analysis.doorStatus === 'clear' ? 'Barrido libre' : data.analysis.doorStatus === 'collision' ? 'Colisión en el barrido' : 'No verificada')}${doorRows}</table>
<h2>Maniobrabilidad</h2><table>${row('Resultado', maneuverText)}${data.maneuver?.turningRadius !== null && data.maneuver?.turningRadius !== undefined ? row('Radio mínimo', cm(data.maneuver.turningRadius)) : ''}${data.maneuver?.status === 'viable' ? row('Trayectoria de entrada', `${data.maneuver.entryPath.length} poses`) : ''}${data.maneuver ? row('Salida', `${data.maneuver.exitStatus === 'viable' ? `Viable · ${data.maneuver.exitPath.length} poses` : data.maneuver.exitStatus === 'not-viable' ? 'Sin trayectoria en el modelo configurado' : 'No verificada'} · ${data.maneuver.exitReason}`) : ''}</table>
<h2>Advertencias</h2>${warnings.length ? `<ul>${warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join('')}</ul>` : '<p>Ninguna.</p>'}
<h2>Conclusión</h2><p class="summary">${escapeHtml(conclusion)}</p>
<p class="muted">La entrada y la salida se planifican por separado. Este informe describe el modelo geométrico y los datos introducidos; no sustituye una comprobación física en el lugar ni sirve como guía de conducción.</p>
</body></html>`;
}
