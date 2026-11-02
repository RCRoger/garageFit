import { create } from 'zustand';
import type { Project } from '@/types/project';
import { deleteProject, importProjectJson, listProjects, saveProject } from '@/infrastructure/persistence/projectRepository';

interface ProjectState {
  projects: Project[];
  loading: boolean;
  error: string | null;
  load: () => Promise<void>;
  save: (project: Project) => Promise<boolean>;
  remove: (id: string) => Promise<boolean>;
  importJson: (contents: string) => Promise<Project | null>;
  clearError: () => void;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Error desconocido al gestionar proyectos.';
}

export const useProjectStore = create<ProjectState>((set) => ({
  projects: [],
  loading: false,
  error: null,
  load: async () => {
    set({ loading: true, error: null });
    try {
      set({ projects: await listProjects(), loading: false });
    } catch (error) {
      set({ loading: false, error: messageOf(error) });
    }
  },
  save: async (project) => {
    set({ error: null });
    try {
      await saveProject(project);
      set((state) => ({
        projects: [...state.projects.filter((item) => item.id !== project.id), project],
      }));
      return true;
    } catch (error) {
      set({ error: messageOf(error) });
      return false;
    }
  },
  remove: async (id) => {
    set({ error: null });
    try {
      await deleteProject(id);
      set((state) => ({ projects: state.projects.filter((item) => item.id !== id) }));
      return true;
    } catch (error) {
      set({ error: messageOf(error) });
      return false;
    }
  },
  importJson: async (contents) => {
    set({ error: null });
    try {
      const project = await importProjectJson(contents);
      set((state) => ({ projects: [...state.projects, project] }));
      return project;
    } catch (error) {
      set({ error: messageOf(error) });
      return null;
    }
  },
  clearError: () => set({ error: null }),
}));
