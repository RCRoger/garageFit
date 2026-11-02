import { useEffect, useRef, useState } from 'react';
import { useProjectStore } from '@/stores/projectStore';
import { useSimulationStore } from '@/stores/simulationStore';
import { ProjectSchema, exportProjectJson, type Project } from '@/types/project';
import { usePreferences } from '@/contexts/PreferencesContext';
import { translateError } from '@/i18n';

function downloadJson(project: Project, fallbackName: string): void {
  const blob = new Blob([exportProjectJson(project)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${project.name.replace(/[^a-z0-9-_ ]/gi, '').trim() || fallbackName}.json`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ProjectLibraryPanel() {
  const { t, language } = usePreferences();
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
      setLocalError(translateError(language, candidate.error.issues[0]?.message ?? t('invalidProject')));
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
      name: `${project.name} (${t('copySuffix')})`.slice(0, 100),
      createdAt: now,
      updatedAt: now,
    });
    await save(duplicateProject);
  };

  const rename = async (project: Project) => {
    const nextName = window.prompt(t('renameProjectPrompt'), project.name)?.trim();
    if (!nextName || nextName === project.name) return;
    const candidate = ProjectSchema.safeParse({
      ...project,
      name: nextName,
      updatedAt: new Date().toISOString(),
    });
    if (!candidate.success) {
      setLocalError(translateError(language, candidate.error.issues[0]?.message ?? t('invalidProjectName')));
      return;
    }
    if (await save(candidate.data) && activeId === project.id) setName(candidate.data.name);
  };

  const deleteSavedProject = async (project: Project) => {
    if (!window.confirm(t('deleteProjectConfirm', { name: project.name }))) return;
    if (await remove(project.id) && activeId === project.id) {
      setActiveId('');
      setName('');
    }
  };

  const importFile = async (file: File | undefined) => {
    setLocalError(null);
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setLocalError(t('fileOverLimit'));
      return;
    }
    try {
      const imported = await importJson(await file.text());
      if (imported) {
        setActiveId(imported.id);
        setName(imported.name);
      }
    } catch (cause) {
      setLocalError(cause instanceof Error ? translateError(language, cause.message) : t('selectedFileReadError'));
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <section className="space-y-2 border-b border-slate-200 pb-4">
      <h2 className="text-sm font-semibold">{t('projects')}</h2>
      <div className="flex gap-1">
        <input
          aria-label={t('projectName')}
          value={name}
          maxLength={100}
          onChange={(event) => setName(event.target.value)}
          placeholder={t('projectName')}
          className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1 text-xs"
        />
        <button onClick={() => void saveCurrent()} disabled={!name.trim()} className="rounded border border-slate-300 px-2 py-1 text-xs disabled:opacity-50">
          {t('save')}
        </button>
      </div>
      <div className="flex gap-1">
        <button onClick={() => fileRef.current?.click()} className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50">{t('importJson')}</button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(event) => void importFile(event.target.files?.[0])}
        />
        <span className="self-center text-[11px] text-slate-500">{t('createOrUpdateSelected')}</span>
      </div>
      {loading && <p className="text-xs text-slate-500">{t('loadingProjects')}</p>}
      {(error || localError) && <p role="alert" className="rounded bg-red-50 p-2 text-xs text-red-700">{translateError(language, localError ?? error ?? '')}</p>}
      <div className="max-h-44 space-y-1 overflow-y-auto">
        {projects.map((project) => (
          <div key={project.id} className={`rounded border p-2 ${activeId === project.id ? 'border-blue-300 bg-blue-50' : 'border-slate-200'}`}>
            <button onClick={() => activateProject(project)} className="block w-full truncate text-left text-xs font-medium">{project.name}</button>
            <p className="text-[10px] text-slate-500">{t('updated')} {new Date(project.updatedAt).toLocaleString(language === 'ca' ? 'ca-ES' : language === 'en' ? 'en-US' : 'es-ES')}</p>
            <div className="mt-1 flex flex-wrap gap-2">
              <button onClick={() => downloadJson(project, t('downloadFallback'))} className="text-[11px] text-blue-700">{t('export')}</button>
              <button onClick={() => void duplicate(project)} className="text-[11px] text-blue-700">{t('duplicate')}</button>
              <button onClick={() => void rename(project)} className="text-[11px] text-blue-700">{t('rename')}</button>
              <button onClick={() => void deleteSavedProject(project)} className="text-[11px] text-red-600">{t('remove')}</button>
            </div>
          </div>
        ))}
        {!loading && projects.length === 0 && <p className="rounded bg-slate-50 p-2 text-xs text-slate-500">{t('noSavedProjects')}</p>}
      </div>
    </section>
  );
}
