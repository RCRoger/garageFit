import type { FitAnalysis } from '@/domain/collision/analysis';
import type { ManeuverResult } from '@/domain/maneuver/maneuver';
import type { Obstacle, ParkingSpot, Placement, VehicleDimensions } from '@/types/domain';
import { translate, translateError, type Language } from '@/i18n';

export interface ReportData {
  projectName: string;
  spot: ParkingSpot;
  vehicle: VehicleDimensions;
  placement: Placement;
  obstacles: readonly Obstacle[];
  analysis: FitAnalysis;
  maneuver: ManeuverResult | null;
  maneuverClearanceCm: number;
  imageDataUrl: string | null;
  language?: Language;
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
  const language = data.language ?? 'es';
  const t = (key: Parameters<typeof translate>[1], values?: Record<string, string | number>) =>
    translate(language, key, values);
  const localize = (message: string) => translateError(language, message);
  const locale = language === 'ca' ? 'ca-ES' : language === 'en' ? 'en-US' : 'es-ES';
  const localizedSpotKind = t(data.spot.kind === 'individual' ? 'individual' : data.spot.kind === 'double' ? 'double' : 'privateGarage');
  const localizedEntrance = t(data.spot.entrance);
  const image = data.imageDataUrl && /^data:image\/png;base64,[a-zA-Z0-9+/=]+$/.test(data.imageDataUrl)
    ? `<img class="simulation" alt="${escapeHtml(t('reportImageAlt'))}" src="${data.imageDataUrl}">`
    : `<p class="muted">${escapeHtml(t('reportImageError'))}</p>`;
  const obstacleRows = data.obstacles.length
    ? data.obstacles.map((obstacle, index) => {
      const collision = data.analysis.collidingObstacleIds.includes(obstacle.id);
      const description = obstacle.shape === 'rect'
        ? t('reportObstacleDescriptionRect', { width: obstacle.width, height: obstacle.height, x: obstacle.x, y: obstacle.y })
        : t('reportObstacleDescriptionCircle', { radius: obstacle.radius, x: obstacle.x, y: obstacle.y });
      const kind = obstacle.kind === 'wall' ? t('wall') : obstacle.kind === 'column' ? t('column') : t('obstacle');
      return row(t('reportObstacle', { index: index + 1, kind }), `${description} · ${collision ? t('reportCollisionWithVehicle') : t('reportNoCollisionWithVehicle')}`);
    }).join('')
    : row(t('obstacles'), t('reportNoObstacles'));
  const doorRows = data.analysis.doorResults.length
    ? data.analysis.doorResults.map((door) => row(
      door.label,
      `${door.status === 'clear' ? t('reportSweepFree') : t('doorCollision')}${door.blockedByObstacleIds.length ? ` · ${t('reportObstacleIds', { ids: door.blockedByObstacleIds.join(', ') })}` : ''}${door.blockedBySpotBoundary ? ` · ${t('reportOutsideBoundary')}` : ''}${door.estimated ? ` · ${t('reportEstimated')}` : ''}`,
    )).join('')
    : row(t('reportDoors'), t('reportUnconfiguredDoor'));
  const maneuverText = !data.maneuver
    ? t('reportManeuverNotRun')
    : `${data.maneuver.status === 'viable' ? t('reportManeuverViable') : data.maneuver.status === 'not-viable' ? t('reportManeuverNoPath') : t('reportManeuverNotVerified')} · ${localize(data.maneuver.reason)}`;
  const warnings = [
    t('reportWarningModel', { clearance: data.maneuverClearanceCm }),
    ...data.analysis.doorResults.filter((door) => door.estimated).map((door) => t('reportEstimatedDoor', { label: door.label })),
    ...(data.analysis.doorStatus === 'not-configured' ? [t('reportDoorNotConfiguredWarning')] : []),
    ...(data.vehicle.widthMirrorsFolded === null || data.vehicle.widthMirrorsExtended === null
      ? [t('reportMirrorsUnavailable')]
      : []),
    ...(!data.maneuver || data.maneuver.status === 'not-verified' || data.maneuver.exitStatus === 'not-verified'
      ? [t('reportManeuverNotVerifiedWarning')]
      : []),
    ...(data.analysis.status === 'limited' ? [t('reportLimitedWarning')] : []),
    ...(data.analysis.status === 'collision' ? [t('reportCollisionWarning')] : []),
  ];
  const conclusion = data.analysis.status === 'collision'
    ? t('reportConclusionCollision')
    : data.analysis.status === 'limited'
      ? t('reportConclusionLimited')
      : t('reportConclusionOk');

  return `<!doctype html>
<html lang="${language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(t('reportTitle', { name: data.projectName }))}</title>
<style>
body{font:14px/1.5 system-ui,sans-serif;color:#1e293b;margin:32px auto;max-width:900px;padding:0 24px}
h1,h2{color:#0f172a}h1{font-size:24px}h2{font-size:17px;margin-top:28px}
table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:7px 10px;border-bottom:1px solid #e2e8f0;vertical-align:top}
th{width:35%;font-weight:600}.simulation{max-width:100%;max-height:70vh;object-fit:contain;border:1px solid #cbd5e1}
.summary{padding:12px;border:1px solid #94a3b8;background:#f8fafc}.muted{color:#64748b}
@media print{body{margin:0 auto;padding:0 12mm}h2{break-after:avoid}.simulation{max-height:65vh}}
</style></head><body>
<h1>${escapeHtml(t('reportHeading', { name: data.projectName }))}</h1>
<p class="muted">${escapeHtml(t('reportGenerated', { date: new Date().toLocaleString(locale) }))}</p>
<h2>${escapeHtml(t('reportSimulation'))}</h2>${image}
<h2>${escapeHtml(t('reportSpotAndVehicle'))}</h2><table>
${row(t('reportSpot'), `${data.spot.width} × ${data.spot.length} cm · ${localizedSpotKind} · ${t('reportEntrance', { entrance: localizedEntrance })}`)}
${row(t('reportVehicle'), `${data.vehicle.length} cm ${t('reportLong')} · ${data.vehicle.bodyWidth} cm ${t('reportBodyWidth')} · ${t('reportFoldedMirrors')} ${cm(data.vehicle.widthMirrorsFolded)} · ${t('reportExtendedMirrors')} ${cm(data.vehicle.widthMirrorsExtended)}`)}
${row(t('reportHeightWheelbase'), `${data.vehicle.height} cm / ${data.vehicle.wheelbase} cm`)}
${row(t('reportTurningDiameter'), cm(data.vehicle.turningDiameter))}
${row(t('reportPositionOrientation'), `(${data.placement.x.toFixed(1)}, ${data.placement.y.toFixed(1)}) cm · ${data.placement.angle.toFixed(1)}°`)}
</table>
<h2>${escapeHtml(t('reportMarginsAndFit'))}</h2><table>
${row(t('reportOverallStatus'), data.analysis.status === 'ok' ? t('reportCorrect') : data.analysis.status === 'limited' ? t('fitsWithLimits') : t('doesNotFit'))}
${row(t('reportUpperLower'), `${cm(data.analysis.margins.top)} / ${cm(data.analysis.margins.bottom)}`)}
${row(t('reportLeftRight'), `${cm(data.analysis.margins.left)} / ${cm(data.analysis.margins.right)}`)}
${row(t('reportObstacleDistance'), cm(data.analysis.minObstacleDistance))}
</table>
<h2>${escapeHtml(t('obstacles'))}</h2><table>${obstacleRows}</table>
<h2>${escapeHtml(t('reportDoorOpening'))}</h2><table>${row(t('reportResult'), data.analysis.doorStatus === 'clear' ? t('reportSweepFree') : data.analysis.doorStatus === 'collision' ? t('reportSweepCollision') : t('reportManeuverNotVerified'))}${doorRows}</table>
<h2>${escapeHtml(t('reportManeuverability'))}</h2><table>${row(t('reportResult'), maneuverText)}${row(t('reportMinimumObstacleClearance'), cm(data.maneuverClearanceCm))}${data.maneuver?.turningRadius !== null && data.maneuver?.turningRadius !== undefined ? row(t('minimumRadius'), cm(data.maneuver.turningRadius)) : ''}${data.maneuver?.status === 'viable' ? row(t('reportEntryPath'), `${data.maneuver.entryPath.length} ${t('reportPoses')}`) : ''}${data.maneuver ? row(t('reportExit'), `${data.maneuver.exitStatus === 'viable' ? t('reportExitViable', { count: data.maneuver.exitPath.length }) : data.maneuver.exitStatus === 'not-viable' ? t('reportNoPathConfigured') : t('reportManeuverNotVerified')} · ${localize(data.maneuver.exitReason)}`) : ''}</table>
<h2>${escapeHtml(t('reportWarnings'))}</h2>${warnings.length ? `<ul>${warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join('')}</ul>` : `<p>${escapeHtml(t('reportNone'))}</p>`}
<h2>${escapeHtml(t('reportConclusion'))}</h2><p class="summary">${escapeHtml(conclusion)}</p>
<p class="muted">${escapeHtml(t('reportDisclaimer'))}</p>
</body></html>`;
}
