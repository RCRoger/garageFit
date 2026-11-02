import { useRef, useState } from 'react';
import { useFitAnalysis } from '@/hooks/useFitAnalysis';
import { DEFAULT_OBSTACLE_CLEARANCE_CM } from '@/types/domain';
import type { FitStatus } from '@/domain/collision/analysis';
import { useSimulationStore } from '@/stores/simulationStore';
import { createReportHtml } from '@/features/reports/reportHtml';
import { usePreferences } from '@/contexts/PreferencesContext';
import { translateError } from '@/i18n';
import type { TranslationKey } from '@/i18n';

const STATUS: Record<FitStatus, { label: TranslationKey; cls: string }> = {
  ok: { label: 'fitsWithClearance', cls: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  limited: { label: 'fitsWithLimits', cls: 'bg-amber-100 text-amber-800 border-amber-300' },
  collision: { label: 'doesNotFit', cls: 'bg-red-100 text-red-800 border-red-300' },
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
  const { t, language } = usePreferences();
  const a = useFitAnalysis();
  const reportFrame = useRef<HTMLIFrameElement>(null);
  const [reportError, setReportError] = useState<string | null>(null);
  const [reportHtml, setReportHtml] = useState<string | null>(null);
  const { spot, vehicle, placement, obstacles, maneuverSettings, maneuverResult } = useSimulationStore();
  const maneuverStatusText = (status: NonNullable<typeof maneuverResult>['status']) =>
    status === 'viable' ? t('viableInModel') :
      status === 'not-viable' ? t('noPathInModel') : t('notVerified');
  const maneuverFullyViable = maneuverResult?.status === 'viable' && maneuverResult.exitStatus === 'viable';
  const maneuverHasNoPath = maneuverResult?.status === 'not-viable' || maneuverResult?.exitStatus === 'not-viable';
  if (!a) {
    return (
      <div className="p-4 text-sm text-red-700">
        {t('invalidConfiguration')}
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
        projectName: t('reportSimulation'),
        spot,
        vehicle,
        placement,
        obstacles,
        analysis: a,
        maneuver: maneuverResult,
        maneuverClearanceCm: maneuverSettings.minimumObstacleClearance ?? DEFAULT_OBSTACLE_CLEARANCE_CM,
        imageDataUrl,
        language,
      }));
    } catch (error) {
      setReportError(error instanceof Error ? translateError(language, error.message) : t('reportGenerationError'));
    }
  };
  return (
    <div className="space-y-4 p-4">
      <div className={`rounded border p-3 text-sm font-semibold ${s.cls}`}>
        {t('geometricFit', { status: t(s.label) })}
      </div>
      <section>
        <h2 className="mb-1 text-sm font-semibold">{t('wallMargins')}</h2>
        <Row label={t('upper')} value={cm(a.margins.top)} />
        <Row label={t('lower')} value={cm(a.margins.bottom)} />
        <Row label={t('left')} value={cm(a.margins.left)} />
        <Row label={t('right')} value={cm(a.margins.right)} />
        <Row label={t('minimumClearance')} value={cm(a.minClearance)} />
      </section>
      <section>
        <h2 className="mb-1 text-sm font-semibold">{t('obstacles')}</h2>
        <Row label={t('minimumDistance')} value={a.minObstacleDistance === null ? '—' : cm(a.minObstacleDistance)} />
        {obstacles.length > 0 && (
          <div className="space-y-1 pt-1">
            {obstacles.map((obstacle, index) => {
              const collision = a.collidingObstacleIds.includes(obstacle.id);
              return (
                <p key={obstacle.id} className={`rounded px-2 py-1 text-xs ${collision ? 'bg-red-50 text-red-700' : 'bg-slate-50 text-slate-600'}`}>
                  {obstacle.kind === 'wall' ? t('wall') : t('obstacle')} {index + 1}: {collision ? t('collision') : t('noCollision')}
                </p>
              );
            })}
          </div>
        )}
      </section>
      <section className="space-y-1 text-sm">
        <h2 className="text-sm font-semibold">{t('otherChecks')}</h2>
        <p className={`rounded p-2 ${a.doorStatus === 'collision' ? 'bg-amber-100 text-amber-900' : 'bg-slate-100'}`}>
          {t('doorOpening')}{' '}
          <b>
            {a.doorStatus === 'not-configured' ? t('noDoorsConfigured') :
              a.doorStatus === 'collision' ? t('doorLimited') : t('sweptAreaClear')}
          </b>
        </p>
        {a.doorResults.map((door) => (
          <p key={door.id} className={`rounded px-2 py-1 text-xs ${door.status === 'collision' ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-800'}`}>
            {door.label}: {door.status === 'collision'
              ? `${t('doorCollision')}${door.blockedByObstacleIds.length ? ` ${t('withObstacles', { count: door.blockedByObstacleIds.length })}` : ''}${door.blockedBySpotBoundary ? ` ${t('withBoundary')}` : ''}`
              : t('freeSweep')}
            {door.estimated && ` · ${t('estimated')}`}
          </p>
        ))}
        <p className={`rounded p-2 ${
          maneuverFullyViable ? 'bg-emerald-100 text-emerald-900' :
            maneuverHasNoPath ? 'bg-red-50 text-red-800' : 'bg-slate-100'
        }`}>
          {t('maneuverEntryExit')}{' '}
          <b>
            {!maneuverResult ? t('notVerified') :
              `entrada ${maneuverStatusText(maneuverResult.status)} · salida ${maneuverStatusText(maneuverResult.exitStatus)}`}
          </b>
        </p>
        {maneuverResult && (
          <p className="rounded bg-slate-50 p-2 text-xs text-slate-600">
            {t('maneuverEntryReason', { entry: translateError(language, maneuverResult.reason), exit: translateError(language, maneuverResult.exitReason) })}
            {maneuverResult.turningRadius !== null && ` ${t('minimumRadius')}: ${cm(maneuverResult.turningRadius)}.`}
            {maneuverResult.expandedNodes > 0 && ` ${t('analyzedStates')}: ${maneuverResult.expandedNodes}.`}
            {' '}{t('minimumObstacleClearance')}: {maneuverSettings.minimumObstacleClearance ?? DEFAULT_OBSTACLE_CLEARANCE_CM} cm. {t('maneuverSafetyDisclaimer')}
          </p>
        )}
      </section>
      <p className="text-xs text-slate-500">
        {t('footprintNote')}
      </p>
      <section className="space-y-1 border-t border-slate-200 pt-3">
        <button onClick={openReport} className="w-full rounded bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700">
          {t('generateReport')}
        </button>
        <p className="text-xs text-slate-500">{t('reportDescription')}</p>
        {reportError && <p role="alert" className="rounded bg-red-50 p-2 text-xs text-red-700">{reportError}</p>}
      </section>
      {reportHtml && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/50 p-3 md:p-8">
          <div className="flex h-full max-h-[900px] w-full max-w-5xl flex-col overflow-hidden rounded-lg bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2">
              <h2 className="text-sm font-semibold">{t('reportPreview')}</h2>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    const frame = reportFrame.current?.contentWindow;
                    if (!frame) {
                      setReportError(t('printableViewError'));
                      return;
                    }
                    frame.focus();
                    frame.print();
                  }}
                  className="rounded bg-slate-800 px-3 py-1 text-xs text-white hover:bg-slate-700"
                >{t('printSavePdf')}</button>
                <button onClick={() => setReportHtml(null)} className="rounded border border-slate-300 px-3 py-1 text-xs">{t('close')}</button>
              </div>
            </div>
            {reportError && <p role="alert" className="px-4 py-2 text-xs text-red-700">{reportError}</p>}
            <iframe ref={reportFrame} title={t('printableReport')} srcDoc={reportHtml} sandbox="allow-same-origin allow-modals" className="min-h-0 flex-1 border-0" />
          </div>
        </div>
      )}
    </div>
  );
}
