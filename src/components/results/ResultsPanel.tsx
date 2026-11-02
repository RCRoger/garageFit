import { useRef, useState } from 'react';
import { useFitAnalysis } from '@/hooks/useFitAnalysis';
import type { FitStatus } from '@/domain/collision/analysis';
import { useSimulationStore } from '@/stores/simulationStore';
import { createReportHtml } from '@/features/reports/reportHtml';

const STATUS: Record<FitStatus, { label: string; cls: string }> = {
  ok: { label: 'Cabe con holgura', cls: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  limited: { label: 'Cabe, con limitaciones', cls: 'bg-amber-100 text-amber-800 border-amber-300' },
  collision: { label: 'No cabe / colisión', cls: 'bg-red-100 text-red-800 border-red-300' },
};

const cm = (n: number) => `${n.toFixed(1)} cm`;

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-slate-100 py-1 text-sm">
      <span className="text-slate-600">{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}

export function ResultsPanel() {
  const a = useFitAnalysis();
  const reportFrame = useRef<HTMLIFrameElement>(null);
  const [reportError, setReportError] = useState<string | null>(null);
  const [reportHtml, setReportHtml] = useState<string | null>(null);
  const { spot, vehicle, placement, obstacles, maneuverResult } = useSimulationStore();
  const maneuverStatusText = (status: NonNullable<typeof maneuverResult>['status']) =>
    status === 'viable' ? 'viable en el modelo' :
      status === 'not-viable' ? 'sin trayectoria en el modelo' : 'no verificada';
  const maneuverFullyViable = maneuverResult?.status === 'viable' && maneuverResult.exitStatus === 'viable';
  const maneuverHasNoPath = maneuverResult?.status === 'not-viable' || maneuverResult?.exitStatus === 'not-viable';
  if (!a) {
    return (
      <div className="p-4 text-sm text-red-700">
        Hay valores no válidos en la configuración. Corrige los campos marcados en rojo.
      </div>
    );
  }
  const s = STATUS[a.status];
  const openReport = () => {
    setReportError(null);
    try {
      const canvas = document.querySelector<HTMLCanvasElement>('#simulator-canvas canvas');
      const imageDataUrl = canvas?.toDataURL('image/png') ?? null;
      setReportHtml(createReportHtml({
        projectName: 'Simulación de parking',
        spot,
        vehicle,
        placement,
        obstacles,
        analysis: a,
        maneuver: maneuverResult,
        imageDataUrl,
      }));
    } catch (error) {
      setReportError(error instanceof Error ? error.message : 'No se pudo generar el informe.');
    }
  };
  return (
    <div className="space-y-4 p-4">
      <div className={`rounded border p-3 text-sm font-semibold ${s.cls}`}>
        1. Encaje geométrico: {s.label}
      </div>
      <section>
        <h2 className="mb-1 text-sm font-semibold">Márgenes a las paredes</h2>
        <Row label="Superior" value={cm(a.margins.top)} />
        <Row label="Inferior" value={cm(a.margins.bottom)} />
        <Row label="Izquierdo" value={cm(a.margins.left)} />
        <Row label="Derecho" value={cm(a.margins.right)} />
        <Row label="Margen mínimo" value={cm(a.minClearance)} />
      </section>
      <section>
        <h2 className="mb-1 text-sm font-semibold">Obstáculos</h2>
        <Row label="Distancia mínima" value={a.minObstacleDistance === null ? '—' : cm(a.minObstacleDistance)} />
        {obstacles.length > 0 && (
          <div className="space-y-1 pt-1">
            {obstacles.map((obstacle, index) => {
              const collision = a.collidingObstacleIds.includes(obstacle.id);
              return (
                <p key={obstacle.id} className={`rounded px-2 py-1 text-xs ${collision ? 'bg-red-50 text-red-700' : 'bg-slate-50 text-slate-600'}`}>
                  {obstacle.kind === 'wall' ? 'Muro' : 'Obstáculo'} {index + 1}: {collision ? 'colisión' : 'sin colisión'}
                </p>
              );
            })}
          </div>
        )}
      </section>
      <section className="space-y-1 text-sm">
        <h2 className="text-sm font-semibold">Otras comprobaciones</h2>
        <p className={`rounded p-2 ${a.doorStatus === 'collision' ? 'bg-amber-100 text-amber-900' : 'bg-slate-100'}`}>
          2. Apertura de puertas:{' '}
          <b>
            {a.doorStatus === 'not-configured' ? 'no verificada: no hay puertas configuradas' :
              a.doorStatus === 'collision' ? 'limitada: hay colisiones' : 'espacio barrido libre'}
          </b>
        </p>
        {a.doorResults.map((door) => (
          <p key={door.id} className={`rounded px-2 py-1 text-xs ${door.status === 'collision' ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-800'}`}>
            {door.label}: {door.status === 'collision'
              ? `colisión${door.blockedByObstacleIds.length ? ` con ${door.blockedByObstacleIds.length} obstáculo(s)` : ''}${door.blockedBySpotBoundary ? ' con el perímetro' : ''}`
              : 'barrido libre'}
            {door.estimated && ' · estimación'}
          </p>
        ))}
        <p className={`rounded p-2 ${
          maneuverFullyViable ? 'bg-emerald-100 text-emerald-900' :
            maneuverHasNoPath ? 'bg-red-50 text-red-800' : 'bg-slate-100'
        }`}>
          3. Entrada y salida:{' '}
          <b>
            {!maneuverResult ? 'no verificada' :
              `entrada ${maneuverStatusText(maneuverResult.status)} · salida ${maneuverStatusText(maneuverResult.exitStatus)}`}
          </b>
        </p>
        {maneuverResult && (
          <p className="rounded bg-slate-50 p-2 text-xs text-slate-600">
            Entrada: {maneuverResult.reason} Salida: {maneuverResult.exitReason}
            {maneuverResult.turningRadius !== null && ` Radio mínimo: ${cm(maneuverResult.turningRadius)}.`}
            {maneuverResult.expandedNodes > 0 && ` Estados analizados: ${maneuverResult.expandedNodes}.`}
            {' '}Modelo geométrico de bicicleta con obstáculos estáticos; no garantiza una maniobra real segura.
          </p>
        )}
      </section>
      <p className="text-xs text-slate-500">
        Huella calculada con anchura de espejos plegados. Umbral de comodidad: 30 cm.
      </p>
      <section className="space-y-1 border-t border-slate-200 pt-3">
        <button onClick={openReport} className="w-full rounded bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700">
          Generar informe
        </button>
        <p className="text-xs text-slate-500">Vista imprimible con la simulación, resultados y advertencias; desde ella puedes Guardar como PDF.</p>
        {reportError && <p role="alert" className="rounded bg-red-50 p-2 text-xs text-red-700">{reportError}</p>}
      </section>
      {reportHtml && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/50 p-3 md:p-8">
          <div className="flex h-full max-h-[900px] w-full max-w-5xl flex-col overflow-hidden rounded-lg bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2">
              <h2 className="text-sm font-semibold">Vista previa del informe</h2>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    const frame = reportFrame.current?.contentWindow;
                    if (!frame) {
                      setReportError('No se pudo abrir la vista imprimible.');
                      return;
                    }
                    frame.focus();
                    frame.print();
                  }}
                  className="rounded bg-slate-800 px-3 py-1 text-xs text-white hover:bg-slate-700"
                >Imprimir / Guardar como PDF</button>
                <button onClick={() => setReportHtml(null)} className="rounded border border-slate-300 px-3 py-1 text-xs">Cerrar</button>
              </div>
            </div>
            {reportError && <p role="alert" className="px-4 py-2 text-xs text-red-700">{reportError}</p>}
            <iframe ref={reportFrame} title="Vista imprimible del informe" srcDoc={reportHtml} sandbox="allow-same-origin allow-modals" className="min-h-0 flex-1 border-0" />
          </div>
        </div>
      )}
    </div>
  );
}
