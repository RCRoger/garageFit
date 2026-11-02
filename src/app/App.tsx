import { ConfigPanel } from '@/components/layout/ConfigPanel';
import { ResultsPanel } from '@/components/results/ResultsPanel';
import { SimulatorCanvas } from '@/components/simulator/SimulatorCanvas';
import { useSimulationStore } from '@/stores/simulationStore';

export function App() {
  const { showGrid, snapToGrid, gridSize, setView } = useSimulationStore();
  return (
    <div className="flex min-h-screen flex-col bg-stone-100 text-slate-800 md:h-screen md:min-h-0">
      <header className="z-20 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-white/10 bg-[#202a27] px-4 py-3 text-white shadow-sm md:px-6">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-300">Estudio de aparcamiento</p>
          <h1 className="mt-0.5 text-base font-semibold tracking-tight">Parking Fit Simulator</h1>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-stone-200">
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" checked={showGrid} onChange={(e) => setView({ showGrid: e.target.checked })} /> Cuadrícula
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" checked={snapToGrid} onChange={(e) => setView({ snapToGrid: e.target.checked })} /> Ajustar a cuadrícula
          </label>
          <label className="flex items-center gap-2">
            <span>Tamaño</span>
            <input
              type="number"
              min={1}
              value={gridSize}
              onChange={(e) => Number.isFinite(e.target.valueAsNumber) && setView({ gridSize: Math.max(1, e.target.valueAsNumber) })}
              className="w-16 rounded-md border border-white/15 bg-white/10 px-2 py-1 text-right text-white"
            />
            cm
          </label>
        </div>
      </header>
      <main className="flex min-h-0 flex-1 flex-col md:flex-row">
        <aside className="min-h-0 overflow-y-auto border-b border-stone-200 bg-[#fbfaf7] md:w-[320px] md:shrink-0 md:border-b-0 md:border-r">
          <div className="sticky top-0 z-10 border-b border-stone-200 bg-[#fbfaf7]/95 px-5 py-4 backdrop-blur">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500">Espacio de trabajo</p>
            <h2 className="mt-1 text-sm font-semibold tracking-tight text-slate-800">Configuración</h2>
          </div>
          <ConfigPanel />
        </aside>
        <section className="relative min-h-[420px] min-w-0 flex-1 bg-stone-100 p-3 md:min-h-0 md:p-4">
          <div className="pointer-events-none absolute inset-0 opacity-40 [background-image:linear-gradient(to_right,#d9d7d0_1px,transparent_1px),linear-gradient(to_bottom,#d9d7d0_1px,transparent_1px)] [background-size:28px_28px]" />
          <div className="relative h-full min-h-[396px] overflow-hidden rounded-lg border border-stone-200 bg-[#fbfaf7] shadow-sm md:min-h-0">
            <SimulatorCanvas />
          </div>
        </section>
        <aside className="overflow-y-auto border-t border-stone-200 bg-[#fbfaf7] md:w-[320px] md:shrink-0 md:border-l md:border-t-0">
          <div className="sticky top-0 z-10 border-b border-stone-200 bg-[#fbfaf7]/95 px-5 py-4 backdrop-blur">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500">Lectura del plano</p>
            <h2 className="mt-1 text-sm font-semibold tracking-tight text-slate-800">Resultado del análisis</h2>
          </div>
          <ResultsPanel />
        </aside>
      </main>
    </div>
  );
}
