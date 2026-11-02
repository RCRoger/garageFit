import { useEffect, useMemo, useState } from 'react';
import { PersonalVehicleSchema, VehicleDimensionsSchema } from '@/types/domain';
import type { CatalogVehicle, PersonalVehicle, VehicleDimensions } from '@/types/domain';
import { filterVehicles } from '@/features/vehicles/searchVehicles';
import { vehicleCatalog } from '@/infrastructure/vehicle-database/catalog';
import { useSimulationStore } from '@/stores/simulationStore';
import { useVehicleLibraryStore } from '@/stores/vehicleLibraryStore';
import { NumberField } from '@/components/layout/NumberField';
import { OptionalNumberField } from '@/components/layout/OptionalNumberField';

interface VehicleDraft {
  id: string;
  manufacturer: string;
  model: string;
  generation: string;
  trim: string;
  yearStart: string;
  yearEnd: string;
  dimensions: VehicleDimensions;
}

interface ListedVehicle {
  record: CatalogVehicle | PersonalVehicle;
  source: 'catálogo' | 'personalizado';
  sourceUrl?: string;
}

const MAX_VISIBLE_VEHICLES = 100;

function blankDraft(dimensions: VehicleDimensions): VehicleDraft {
  return {
    id: crypto.randomUUID(),
    manufacturer: '',
    model: '',
    generation: '',
    trim: '',
    yearStart: '',
    yearEnd: '',
    dimensions: { ...dimensions },
  };
}

export function VehicleLibraryPanel() {
  const currentVehicle = useSimulationStore((state) => state.vehicle);
  const setVehicle = useSimulationStore((state) => state.setVehicle);
  const { customVehicles, favoriteIds, loading, error, load, saveCustom, deleteCustom, toggleFavorite } =
    useVehicleLibraryStore();
  const [query, setQuery] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [activeId, setActiveId] = useState('');
  const [draft, setDraft] = useState<VehicleDraft | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    void load();
  }, [load]);

  const listed = useMemo<ListedVehicle[]>(() => [
    ...vehicleCatalog.map((record) => ({ record, source: 'catálogo' as const, sourceUrl: record.sourceUrl })),
    ...customVehicles.map((record) => ({ record, source: 'personalizado' as const })),
  ], [customVehicles]);
  const manufacturers = useMemo(
    () => [...new Set(listed.map(({ record }) => record.manufacturer))].sort((a, b) => a.localeCompare(b)),
    [listed],
  );
  const visible = useMemo(() => filterVehicles(
    listed.filter(({ record }) => !favoritesOnly || favoriteIds.includes(record.id)).map((item) => item.record),
    query,
    manufacturer,
  ), [listed, favoritesOnly, favoriteIds, query, manufacturer]);
  const selectedCustom = customVehicles.find((item) => item.id === activeId);
  const selectedCatalog = vehicleCatalog.find((item) => item.id === activeId);

  const selectVehicle = (record: CatalogVehicle | PersonalVehicle) => {
    if ('sourceUrl' in record) {
      setVehicle({
        length: record.dimensions.length ?? currentVehicle.length,
        bodyWidth: record.dimensions.bodyWidth ?? currentVehicle.bodyWidth,
        height: record.dimensions.height ?? currentVehicle.height,
        wheelbase: record.dimensions.wheelbase ?? currentVehicle.wheelbase,
        doors: [],
        widthMirrorsFolded: null,
        widthMirrorsExtended: null,
        turningDiameter: null,
      });
      setActiveId(record.id);
      setFormErrors({});
      return;
    }

    const parsed = VehicleDimensionsSchema.safeParse(record.dimensions);
    if (!parsed.success) {
      setFormErrors({ dimensions: 'Las dimensiones de este vehículo no son válidas.' });
      return;
    }
    setVehicle(parsed.data);
    setActiveId(record.id);
  };

  const createDraft = () => {
    setDraft(blankDraft(currentVehicle));
    setFormErrors({});
  };

  const editDraft = (record: PersonalVehicle) => {
    setDraft({
      id: record.id,
      manufacturer: record.manufacturer,
      model: record.model,
      generation: record.generation,
      trim: record.trim,
      yearStart: record.yearStart?.toString() ?? '',
      yearEnd: record.yearEnd?.toString() ?? '',
      dimensions: { ...record.dimensions },
    });
    setFormErrors({});
  };

  const saveDraft = async () => {
    if (!draft) return;
    const candidate = {
      ...draft,
      yearStart: draft.yearStart.trim() ? Number(draft.yearStart) : null,
      yearEnd: draft.yearEnd.trim() ? Number(draft.yearEnd) : null,
    };
    const parsed = PersonalVehicleSchema.safeParse(candidate);
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        errors[String(issue.path[0])] ??= issue.message;
      }
      setFormErrors(errors);
      return;
    }
    await saveCustom(parsed.data);
    const state = useVehicleLibraryStore.getState();
    if (state.error) return;
    setActiveId(parsed.data.id);
    setVehicle(parsed.data.dimensions);
    setDraft(null);
    setFormErrors({});
  };

  const saveCurrentDimensions = async () => {
    if (!selectedCustom) return;
    await saveCustom({ ...selectedCustom, dimensions: currentVehicle });
  };

  const removeCustomVehicle = async (id: string) => {
    await deleteCustom(id);
    if (!useVehicleLibraryStore.getState().error && activeId === id) setActiveId('');
  };

  const inputClass = 'w-full rounded border border-slate-300 px-2 py-1 text-sm';

  return (
    <section className="space-y-2 border-b border-slate-200 pb-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Biblioteca de vehículos</h2>
        <button onClick={createDraft} className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50">
          + Personalizado
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input
          aria-label="Buscar vehículos"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar marca o modelo"
          className={`${inputClass} col-span-2`}
        />
        <select aria-label="Filtrar por fabricante" value={manufacturer} onChange={(event) => setManufacturer(event.target.value)} className={`${inputClass} col-span-2`}>
          <option value="">Todos los fabricantes</option>
          {manufacturers.map((brand) => <option key={brand} value={brand}>{brand}</option>)}
        </select>
      </div>
      <label className="flex items-center gap-1 text-xs text-slate-600">
        <input type="checkbox" checked={favoritesOnly} onChange={(event) => setFavoritesOnly(event.target.checked)} />
        Mostrar favoritos
      </label>

      {loading && <p className="text-xs text-slate-500">Cargando datos locales…</p>}
      {error && <p role="alert" className="rounded bg-red-50 p-2 text-xs text-red-700">{error}</p>}
      {selectedCatalog && (
        <p role="status" className="rounded bg-amber-50 p-2 text-xs text-amber-800">
          Fuente: vehicle-makes-models. Los campos ausentes conservan el valor actual; los espejos y el giro no están en la fuente.
          El encaje usa la anchura de carrocería mientras no indiques la medida de los espejos.
        </p>
      )}

      <div className="max-h-52 space-y-1 overflow-y-auto">
        {visible.slice(0, MAX_VISIBLE_VEHICLES).map((record) => {
          const item = listed.find((entry) => entry.record.id === record.id)!;
          const favorite = favoriteIds.includes(record.id);
          return (
            <div key={`${item.source}-${record.id}`} className={`flex items-center gap-1 rounded border p-2 ${activeId === record.id ? 'border-blue-300 bg-blue-50' : 'border-slate-200'}`}>
              <button onClick={() => selectVehicle(record)} className="min-w-0 flex-1 text-left">
                <span className="block truncate text-xs font-medium">{record.manufacturer} {record.model}</span>
                <span className="block truncate text-[11px] text-slate-500">
                  {[record.generation, record.trim, record.yearStart, record.yearEnd].filter(Boolean).join(' · ') || item.source}
                </span>
              </button>
              <button
                aria-label={favorite ? `Quitar ${record.model} de favoritos` : `Añadir ${record.model} a favoritos`}
                title={favorite ? 'Quitar de favoritos' : 'Añadir a favoritos'}
                onClick={() => void toggleFavorite(record.id)}
                className="px-1 text-amber-600"
              >{favorite ? '★' : '☆'}</button>
              {item.source === 'catálogo' && item.sourceUrl && (
                <a href={item.sourceUrl} target="_blank" rel="noreferrer" title="Fuente de dimensiones" className="text-[11px] text-blue-700">Fuente</a>
              )}
              {item.source === 'personalizado' && !('sourceUrl' in record) && (
                <>
                  <button onClick={() => editDraft(record)} className="text-[11px] text-blue-700">Editar</button>
                  <button onClick={() => void removeCustomVehicle(record.id)} className="text-[11px] text-red-600">Eliminar</button>
                </>
              )}
            </div>
          );
        })}
        {!loading && visible.length === 0 && (
          <p className="rounded bg-slate-50 p-2 text-xs text-slate-500">
            {vehicleCatalog.length === 0 && customVehicles.length === 0
              ? 'El catálogo no tiene modelos verificados todavía. Introduce las dimensiones manualmente o crea un vehículo personalizado.'
              : 'No hay vehículos que coincidan con la búsqueda.'}
          </p>
        )}
      </div>
      {visible.length > MAX_VISIBLE_VEHICLES && (
        <p className="text-[11px] text-slate-500">
          Mostrando {MAX_VISIBLE_VEHICLES} de {visible.length} resultados; afina la búsqueda para ver otros modelos.
        </p>
      )}
      {!loading && visible.length > 0 && (
        <p className="text-[11px] text-slate-500">
          {vehicleCatalog.length.toLocaleString()} modelos y generaciones en el catálogo mundial.
        </p>
      )}

      {selectedCustom && !draft && (
        <button onClick={() => void saveCurrentDimensions()} className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50">
          Guardar dimensiones actuales en “{selectedCustom.model}”
        </button>
      )}

      {draft && (
        <div className="space-y-2 rounded border border-blue-200 bg-blue-50/50 p-2">
          <h3 className="text-xs font-semibold">{customVehicles.some((item) => item.id === draft.id) ? 'Editar vehículo personalizado' : 'Nuevo vehículo personalizado'}</h3>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs">Fabricante
              <input value={draft.manufacturer} onChange={(e) => setDraft({ ...draft, manufacturer: e.target.value })} className={inputClass} />
              {formErrors.manufacturer && <span className="text-red-600">{formErrors.manufacturer}</span>}
            </label>
            <label className="text-xs">Modelo
              <input value={draft.model} onChange={(e) => setDraft({ ...draft, model: e.target.value })} className={inputClass} />
              {formErrors.model && <span className="text-red-600">{formErrors.model}</span>}
            </label>
            <label className="text-xs">Generación
              <input value={draft.generation} onChange={(e) => setDraft({ ...draft, generation: e.target.value })} className={inputClass} />
            </label>
            <label className="text-xs">Versión
              <input value={draft.trim} onChange={(e) => setDraft({ ...draft, trim: e.target.value })} className={inputClass} />
            </label>
            <label className="text-xs">Año inicial
              <input type="number" value={draft.yearStart} onChange={(e) => setDraft({ ...draft, yearStart: e.target.value })} className={inputClass} />
              {formErrors.yearStart && <span className="text-red-600">{formErrors.yearStart}</span>}
            </label>
            <label className="text-xs">Año final
              <input type="number" value={draft.yearEnd} onChange={(e) => setDraft({ ...draft, yearEnd: e.target.value })} className={inputClass} />
              {formErrors.yearEnd && <span className="text-red-600">{formErrors.yearEnd}</span>}
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <NumberField label="Longitud" value={draft.dimensions.length} onChange={(v) => setDraft({ ...draft, dimensions: { ...draft.dimensions, length: v } })} />
            <NumberField label="Anchura carrocería" value={draft.dimensions.bodyWidth} onChange={(v) => setDraft({ ...draft, dimensions: { ...draft.dimensions, bodyWidth: v } })} />
            <OptionalNumberField label="Espejos plegados" value={draft.dimensions.widthMirrorsFolded} onChange={(v) => setDraft({ ...draft, dimensions: { ...draft.dimensions, widthMirrorsFolded: v } })} />
            <OptionalNumberField label="Espejos desplegados" value={draft.dimensions.widthMirrorsExtended} onChange={(v) => setDraft({ ...draft, dimensions: { ...draft.dimensions, widthMirrorsExtended: v } })} />
            <NumberField label="Altura" value={draft.dimensions.height} onChange={(v) => setDraft({ ...draft, dimensions: { ...draft.dimensions, height: v } })} />
            <NumberField label="Entre ejes" value={draft.dimensions.wheelbase} onChange={(v) => setDraft({ ...draft, dimensions: { ...draft.dimensions, wheelbase: v } })} />
            <OptionalNumberField
              label="Diámetro de giro (si se conoce)"
              value={draft.dimensions.turningDiameter}
              onChange={(v) => setDraft({ ...draft, dimensions: { ...draft.dimensions, turningDiameter: v } })}
            />
          </div>
          {formErrors.dimensions && <p className="text-xs text-red-600">{formErrors.dimensions}</p>}
          {!VehicleDimensionsSchema.safeParse(draft.dimensions).success && (
            <p className="text-xs text-amber-700">Revisa las dimensiones y la relación entre espejos y carrocería.</p>
          )}
          <p className="text-[11px] text-slate-500">Las dimensiones se guardan como datos introducidos por el usuario, no como datos verificados de fábrica.</p>
          <div className="flex gap-2">
            <button onClick={() => void saveDraft()} className="rounded bg-blue-700 px-2 py-1 text-xs text-white hover:bg-blue-800">Guardar</button>
            <button onClick={() => { setDraft(null); setFormErrors({}); }} className="rounded border border-slate-300 px-2 py-1 text-xs">Cancelar</button>
          </div>
        </div>
      )}
      {vehicleCatalog.length > 0 && (
        <p className="text-[11px] text-slate-500">
          Las dimensiones del catálogo local incluyen una fuente verificable.
        </p>
      )}
    </section>
  );
}
