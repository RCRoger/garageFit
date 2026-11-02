import { describe, expect, it } from 'vitest';
import { persistPreferences, readPreferences } from './PreferencesContext';
import { translate, translateError } from '@/i18n';

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

describe('preferències de la interfície', () => {
  it('uses Catalan and light theme when no preference has been saved', () => {
    expect(readPreferences(memoryStorage())).toEqual({ language: 'ca', theme: 'light' });
  });

  it('loads and persists the selected language and theme', () => {
    const storage = memoryStorage();
    persistPreferences(storage, { language: 'en', theme: 'dark' });
    expect(readPreferences(storage)).toEqual({ language: 'en', theme: 'dark' });
  });

  it('ignores unsupported stored preference values', () => {
    const storage = memoryStorage({ 'parking-fit-language': 'fr', 'parking-fit-theme': 'system' });
    expect(readPreferences(storage)).toEqual({ language: 'ca', theme: 'light' });
  });
});

describe('traduccions', () => {
  it('provides the supported languages and interpolates values', () => {
    expect(translate('ca', 'reportTitle', { name: 'Garatge' })).toBe('Informe · Garatge');
    expect(translate('en', 'reportTitle', { name: 'Garage' })).toBe('Report · Garage');
    expect(translate('es', 'reportTitle', { name: 'Garaje' })).toBe('Informe · Garaje');
  });

  it('localizes validation and maneuver result messages', () => {
    expect(translateError('en', 'La anchura con espejos plegados no puede ser menor que la de la carrocería.'))
      .toBe('Folded-mirror width cannot be less than body width.');
    expect(translateError('ca', 'El vehículo no cabe con 10 cm de holgura en la zona de aproximación configurada.'))
      .toBe('El vehicle no hi cap amb 10 cm de separació a la zona d’aproximació configurada.');
  });
});
