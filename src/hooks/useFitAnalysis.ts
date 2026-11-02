import { useMemo } from 'react';
import { analyzeFit, type FitAnalysis } from '@/domain/collision/analysis';
import { useSimulationStore } from '@/stores/simulationStore';
import { ObstacleSchema, ParkingSpotSchema, VehicleDimensionsSchema } from '@/types/domain';

/** Devuelve el análisis en tiempo real, o null si los datos de entrada no son válidos. */
export function useFitAnalysis(): FitAnalysis | null {
  const { spot, vehicle, placement, obstacles } = useSimulationStore();
  return useMemo(() => {
    if (
      !ParkingSpotSchema.safeParse(spot).success ||
      !VehicleDimensionsSchema.safeParse(vehicle).success ||
      obstacles.some((obstacle) => !ObstacleSchema.safeParse(obstacle).success)
    ) return null;
    return analyzeFit(spot, vehicle, placement, obstacles);
  }, [spot, vehicle, placement, obstacles]);
}
