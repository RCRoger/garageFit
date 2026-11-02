import { useEffect, useState } from 'react';

interface Props {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  unit?: string;
  step?: number;
  title?: string;
  error?: string;
}

export function OptionalNumberField({ label, value, onChange, unit = 'cm', step = 1, title, error }: Props) {
  const [text, setText] = useState(value === null ? '' : String(value));
  useEffect(() => {
    const parsed = text.trim() === '' ? null : Number(text);
    if (parsed !== value) setText(value === null ? '' : String(value));
  }, [text, value]);

  return (
    <label className="block text-xs" title={title}>
      <span className="mb-0.5 block font-medium text-slate-600">{label}</span>
      <div className="flex items-center gap-1">
        <input
          type="number"
          step={step}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            if (event.target.value.trim() === '') {
              onChange(null);
              return;
            }
            const number = event.target.valueAsNumber;
            if (Number.isFinite(number)) onChange(number);
          }}
          className={`w-full rounded border px-2 py-1 text-sm ${error ? 'border-red-400' : 'border-slate-300'}`}
        />
        <span className="text-slate-400">{unit}</span>
      </div>
      {error && <span className="mt-0.5 block text-red-600">{error}</span>}
    </label>
  );
}
