import { useEffect, useState } from 'react';

interface Props {
  label: string;
  value: number;
  onChange: (v: number) => void;
  unit?: string;
  step?: number;
  min?: number;
  max?: number;
  title?: string;
  error?: string;
}

/** Campo numérico que acepta texto intermedio y solo propaga valores finitos. */
export function NumberField({ label, value, onChange, unit = 'cm', step = 1, min, max, title, error }: Props) {
  const [text, setText] = useState(String(value));
  useEffect(() => {
    if (Number(text) !== value) setText(String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <label className="block text-xs" title={title}>
      <span className="mb-0.5 block font-medium text-slate-600">{label}</span>
      <div className="flex items-center gap-1">
        <input
          type="number"
          step={step}
          min={min}
          max={max}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            const n = e.target.valueAsNumber;
            if (Number.isFinite(n)) onChange(n);
          }}
          className={`w-full rounded border px-2 py-1 text-sm ${error ? 'border-red-400' : 'border-slate-300'}`}
        />
        <span className="text-slate-400">{unit}</span>
      </div>
      {error && <span className="mt-0.5 block text-red-600">{error}</span>}
    </label>
  );
}
