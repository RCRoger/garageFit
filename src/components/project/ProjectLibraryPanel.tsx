import { useEffect, useRef, useState } from 'react';
import { useProjectStore } from '@/stores/projectStore';
import { useSimulationStore } from '@/stores/simulationStore';
import { ProjectSchema, exportProjectJson, type Project } from '@/types/project';

function downloadJson(project: Project): void {
  const blob = new Blob([exportProjectJson(project)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${project.name.replace(/[^a-z0-9-_ ]/gi, '').trim() || 'proyecto'}.json`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ProjectLibraryPanel() {
  const fileRef = useRef<HTMLInputElement>(null);
  const simulation = useSimulationStore();
  const { projects, loading, error, load, save, remove, importJson } = useProjectStore();
  const [name, setName] = useState('');
  const [activeId, setActiveId] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, [load]);

  const snapshot = () => ({
    spot: simulation.spot,
    vehicle: simulation.vehicle,
    placement: simulation.placement,
    obstacles: simulation.obstacles,
    maneuverSettings: simulation.maneuverSettings,
    view: {
      showGrid: simulation.showGrid,
      showDimensions: simulation.showDimensions,
      snapToGrid: simulation.snapToGrid,
      gridSize: simulation.gridSize,
    },
  });

  const saveCurrent = async () => {
    setLocalError(null);
    const existing = projects.find((project) => project.id === activeId);
    const now = new Date().toISOString();
    const candidate = ProjectSchema.safeParse({
      version: 1,
      id: existing?.id ?? crypto.randomUUID(),
      name,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      snapshot: snapshot(),
    });
    if (!candidate.success) {
      setLocalError(candidate.error.issues[0]?.message ?? 'Los datos del proyecto no son válidos.');
      return;
    }
    if (await save(candidate.data)) {
      setActiveId(candidate.data.id);
      setName(candidate.data.name);
    }
  };

  const activateProject = (project: Project) => {
    simulation.loadSnapshot(project.snapshot);
    setActiveId(project.id);
    setName(project.name);
    setLocalError(null);
  };

  const duplicate = async (project: Project) => {
    const now = new Date().toISOString();
    const duplicateProject = ProjectSchema.parse({
      ...project,
      id: crypto.randomUUID(),
      name: `${project.name} (copia)`.slice(0, 100),
      createdAt: now,
      updatedAt: now,
    });
    await save(duplicateProject);
  };

  const rename = async (project: Project) => {
    const nextName = window.prompt('Nuevo nombre del proyecto', project.name)?.trim();
    if (!nextName || nextName === project.name) return;
    const candidate = ProjectSchema.safeParse({
      ...project,
      name: nextName,
      updatedAt: new Date().toISOString(),
    });
    if (!candidate.success) {
      setLocalError(candidate.error.issues[0]?.message ?? 'El nombre no es válido.');
      return;
    }
    if (await save(candidate.data) && activeId === project.id) setName(candidate.data.name);
  };

  const deleteSavedProject = async (project: Project) => {
    if (!window.confirm(`¿Eliminar el proyecto “${project.name}”? Esta acción no se puede deshacer.`)) return;
    if (await remove(project.id) && activeId === project.id) {
      setActiveId('');
      setName('');
    }
  };

  const importFile = async (file: File | undefined) => {
    setLocalError(null);
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setLocalError('El archivo supera el límite de 10 MB.');
      return;
    }
    try {
      const imported = await importJson(await file.text());
      if (imported) {
        setActiveId(imported.id);
        setName(imported.name);
      }
    } catch (cause) {
      setLocalError(cause instanceof Error ? cause.message : 'No se pudo leer el archivo seleccionado.');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <section className="space-y-2 border-b border-slate-200 pb-4">
      <h2 className="text-sm font-semibold">Proyectos</h2>
      <div className="flex gap-1">
        <input
          aria-label="Nombre del proyecto"
          value={name}
          maxLength={100}
          onChange={(event) => setName(event.target.value)}
          placeholder="Nombre del proyecto"
          className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1 text-xs"
        />
        <button onClick={() => void saveCurrent()} disabled={!name.trim()} className="rounded border border-slate-300 px-2 py-1 text-xs disabled:opacity-50">
          Guardar
        </button>
      </div>
      <div className="flex gap-1">
        <button onClick={() => fileRef.current?.click()} className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50">Importar JSON</button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(event) => void importFile(event.target.files?.[0])}
        />
        <span className="self-center text-[11px] text-slate-500">Crea o actualiza el seleccionado.</span>
      </div>
      {loading && <p className="text-xs text-slate-500">Cargando proyectos…</p>}
      {(error || localError) && <p role="alert" className="rounded bg-red-50 p-2 text-xs text-red-700">{localError ?? error}</p>}
      <div className="max-h-44 space-y-1 overflow-y-auto">
        {projects.map((project) => (
          <div key={project.id} className={`rounded border p-2 ${activeId === project.id ? 'border-blue-300 bg-blue-50' : 'border-slate-200'}`}>
            <button onClick={() => activateProject(project)} className="block w-full truncate text-left text-xs font-medium">{project.name}</button>
            <p className="text-[10px] text-slate-500">Actualizado {new Date(project.updatedAt).toLocaleString()}</p>
            <div className="mt-1 flex flex-wrap gap-2">
              <button onClick={() => downloadJson(project)} className="text-[11px] text-blue-700">Exportar</button>
              <button onClick={() => void duplicate(project)} className="text-[11px] text-blue-700">Duplicar</button>
              <button onClick={() => void rename(project)} className="text-[11px] text-blue-700">Renombrar</button>
              <button onClick={() => void deleteSavedProject(project)} className="text-[11px] text-red-600">Eliminar</button>
            </div>
          </div>
        ))}
        {!loading && projects.length === 0 && <p className="rounded bg-slate-50 p-2 text-xs text-slate-500">Todavía no hay proyectos guardados.</p>}
      </div>
    </section>
  );
}
