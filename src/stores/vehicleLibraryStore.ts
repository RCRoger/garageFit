import { create } from 'zustand';
import type { PersonalVehicle } from '@/types/domain';
import {
  deleteCustomVehicle,
  listCustomVehicles,
  listFavoriteIds,
  saveCustomVehicle,
  setVehicleFavorite,
} from '@/infrastructure/vehicle-database/vehicleRepository';

interface VehicleLibraryState {
  customVehicles: PersonalVehicle[];
  favoriteIds: string[];
  loading: boolean;
  error: string | null;
  load: () => Promise<void>;
  saveCustom: (vehicle: PersonalVehicle) => Promise<void>;
  deleteCustom: (id: string) => Promise<void>;
  toggleFavorite: (id: string) => Promise<void>;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Error desconocido al guardar la biblioteca de vehículos.';
}

export const useVehicleLibraryStore = create<VehicleLibraryState>((set, get) => ({
  customVehicles: [],
  favoriteIds: [],
  loading: false,
  error: null,
  load: async () => {
    set({ loading: true, error: null });
    try {
      const [customVehicles, favoriteIds] = await Promise.all([listCustomVehicles(), listFavoriteIds()]);
      set({ customVehicles, favoriteIds, loading: false });
    } catch (error) {
      set({ loading: false, error: messageOf(error) });
    }
  },
  saveCustom: async (vehicle) => {
    set({ error: null });
    try {
      await saveCustomVehicle(vehicle);
      set((state) => ({
        customVehicles: [
          ...state.customVehicles.filter((item) => item.id !== vehicle.id),
          vehicle,
        ],
      }));
    } catch (error) {
      set({ error: messageOf(error) });
    }
  },
  deleteCustom: async (id) => {
    set({ error: null });
    try {
      await deleteCustomVehicle(id);
      set((state) => ({
        customVehicles: state.customVehicles.filter((item) => item.id !== id),
        favoriteIds: state.favoriteIds.filter((favoriteId) => favoriteId !== id),
      }));
    } catch (error) {
      set({ error: messageOf(error) });
    }
  },
  toggleFavorite: async (id) => {
    set({ error: null });
    const favorite = !get().favoriteIds.includes(id);
    try {
      await setVehicleFavorite(id, favorite);
      set((state) => ({
        favoriteIds: favorite
          ? [...state.favoriteIds, id]
          : state.favoriteIds.filter((favoriteId) => favoriteId !== id),
      }));
    } catch (error) {
      set({ error: messageOf(error) });
    }
  },
}));
