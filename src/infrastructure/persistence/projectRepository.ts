import { ProjectSchema, type Project, parseProjectJson } from '@/types/project';
import { runTransaction } from './localDatabase';

const PROJECTS = 'projects';

export async function listProjects(): Promise<Project[]> {
  const rows = await runTransaction<unknown[]>(PROJECTS, 'readonly', (tx) => tx.objectStore(PROJECTS).getAll());
  return rows.map((row) => ProjectSchema.parse(row));
}

export async function saveProject(project: Project): Promise<void> {
  await runTransaction<IDBValidKey>(PROJECTS, 'readwrite', (tx) =>
    tx.objectStore(PROJECTS).put(ProjectSchema.parse(project)),
  );
}

export async function deleteProject(id: string): Promise<void> {
  await runTransaction<undefined>(PROJECTS, 'readwrite', (tx) => tx.objectStore(PROJECTS).delete(id));
}

export async function importProjectJson(contents: string): Promise<Project> {
  const imported = parseProjectJson(contents);
  const timestamp = new Date().toISOString();
  const name = `${imported.name} (importado)`.slice(0, 100);
  const project = ProjectSchema.parse({
    ...imported,
    id: crypto.randomUUID(),
    name,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  await saveProject(project);
  return project;
}
