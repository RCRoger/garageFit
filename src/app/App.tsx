import { ConfigPanel } from '@/components/layout/ConfigPanel';
import { ResultsPanel } from '@/components/results/ResultsPanel';
import { SimulatorCanvas } from '@/components/simulator/SimulatorCanvas';
import { useSimulationStore } from '@/stores/simulationStore';

export function App() {
  const { showGrid, snapToGrid, gridSize, setView } = useSimulationStore();
  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-2">
        <h1 className="text-base font-semibold">Parking Fit Simulator</h1>
        <div className="flex items-center gap-4 text-xs">
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={showGrid} onChange={(e) => setView({ showGrid: e.target.checked })} /> Cuadrícula
          </label>
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={snapToGrid} onChange={(e) => setView({ snapToGrid: e.target.checked })} /> Ajustar a cuadrícula
          </label>
          <label className="flex items-center gap-1">
            Tamaño
            <input
              type="number"
              min={1}
              value={gridSize}
              onChange={(e) => Number.isFinite(e.target.valueAsNumber) && setView({ gridSize: Math.max(1, e.target.valueAsNumber) })}
              className="w-14 rounded border border-slate-300 px-1 py-0.5"
            />
            cm
          </label>
        </div>
      </header>
      <main className="flex min-h-0 flex-1 flex-col md:flex-row">
        <aside className="max-h-[40%] overflow-y-auto border-b border-slate-200 bg-white md:max-h-none md:w-72 md:border-b-0 md:border-r">
          <ConfigPanel />
        </aside>
        <section className="min-h-[300px] min-w-0 flex-1">
          <SimulatorCanvas />
        </section>
        <aside className="overflow-y-auto border-t border-slate-200 bg-white md:w-72 md:border-l md:border-t-0">
          <ResultsPanel />
        </aside>
      </main>
    </div>
  );
}
