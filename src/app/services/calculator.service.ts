import { Injectable } from '@angular/core';
import { BehaviorSubject, combineLatest, map, Observable } from 'rxjs';
import { Calculator, Preset, Summary, CalculatorResult, GenerateRequestItem } from '../models/calculator.interface';
import {POE_BEASTS} from './presets';

@Injectable({
  providedIn: 'root'
})
export class CalculatorService {
  private readonly STORAGE_KEY = 'calculatorPresets';
  private readonly CURRENT_PRESET_KEY = 'currentPreset';

  // Default data
  private readonly defaultPreset: Preset = {
    name: 'Main',
    exchangeRate: 160,
    requestHeader: '',
    requestFooter: '',
    calculators: [
      { id: 1, label: '', totalQuantity: 0, price: 0, currencyType: 'д' },
      { id: 2, label: '', totalQuantity: 0, price: 0, currencyType: 'д' },
      { id: 3, label: '', totalQuantity: 0, price: 0, currencyType: 'д' },
      { id: 4, label: '', totalQuantity: 0, price: 0, currencyType: 'д' },
      { id: 5, label: '', totalQuantity: 0, price: 0, currencyType: 'д' },
      { id: 6, label: '', totalQuantity: 0, price: 0, currencyType: 'д' },
      { id: 7, label: '', totalQuantity: 0, price: 0, currencyType: 'д' },
      { id: 8, label: '', totalQuantity: 0, price: 0, currencyType: 'д' }
    ]
  };

  // BehaviorSubjects for reactive state management
  private currentPresetSubject = new BehaviorSubject<Preset>(this.defaultPreset);
  private availablePresetsSubject = new BehaviorSubject<Preset[]>([this.defaultPreset, POE_BEASTS]);

  // Public observables
  public currentPreset$ = this.currentPresetSubject.asObservable();
  public availablePresets$ = this.availablePresetsSubject.asObservable();

  // Computed observables
  public calculatorResults$: Observable<CalculatorResult[]> = this.currentPreset$.pipe(
    map(preset => this.calculateResults(preset.calculators))
  );

  public summary$: Observable<Summary> = combineLatest([
    this.currentPreset$,
    this.calculatorResults$
  ]).pipe(
    map(([preset, results]) => this.calculateSummary(results, preset.exchangeRate))
  );

  constructor() {
    this.loadFromLocalStorage();
  }

  // Calculator operations
  private calculateResults(calculators: Calculator[]): CalculatorResult[] {
    return calculators.map(calc => ({
      id: calc.id,
      result: calc.totalQuantity * calc.price,
      currencyType: calc.currencyType
    }));
  }

  private calculateSummary(results: CalculatorResult[], exchangeRate: number): Summary {
    let totalD = 0;
    let totalC = 0;

    results.forEach(result => {
      if (result.currencyType === 'д') {
        totalD += result.result;
      } else {
        totalC += result.result;
      }
    });

    const totalInC = totalC + (totalD * exchangeRate);
    const wholeDPart = Math.floor(totalInC / exchangeRate);
    const remainderC = totalInC - (wholeDPart * exchangeRate);

    return {
      totalD,
      totalC,
      totalInC,
      totalInDWithRemainder: { wholeDPart, remainderC }
    };
  }

  // Get display name for calculator
  getCalculatorDisplayName(calculator: Calculator): string {
    return calculator.label.trim() || `Calculator_${calculator.id}`;
  }

  // Calculator management
  updateCalculator(id: number, updates: Partial<Calculator>): void {
    const currentPreset = this.currentPresetSubject.value;
    const calculators = currentPreset.calculators.map(calc =>
      calc.id === id ? { ...calc, ...updates } : calc
    );

    const updatedPreset = { ...currentPreset, calculators };
    this.currentPresetSubject.next(updatedPreset);
    this.saveCurrentPreset();
  }

  // Update request header/footer
  updateRequestHeader(header: string): void {
    const currentPreset = this.currentPresetSubject.value;
    const updatedPreset = { ...currentPreset, requestHeader: header };
    this.currentPresetSubject.next(updatedPreset);
    this.saveCurrentPreset();
  }

  updateRequestFooter(footer: string): void {
    const currentPreset = this.currentPresetSubject.value;
    const updatedPreset = { ...currentPreset, requestFooter: footer };
    this.currentPresetSubject.next(updatedPreset);
    this.saveCurrentPreset();
  }

  // Sold functionality - simply subtract from total quantity
  markAsSold(id: number, soldAmount: number): void {
    const currentPreset = this.currentPresetSubject.value;
    const calculator = currentPreset.calculators.find(calc => calc.id === id);

    if (calculator && soldAmount > 0) {
      const newTotalQuantity = Math.max(0, calculator.totalQuantity - soldAmount);
      this.updateCalculator(id, { totalQuantity: newTotalQuantity });
    }
  }

  addCalculator(): void {
    const currentPreset = this.currentPresetSubject.value;
    if (currentPreset.calculators.length >= 20) return;

    const newId = Math.max(...currentPreset.calculators.map(c => c.id)) + 1;
    const newCalculator: Calculator = {
      id: newId,
      label: '',
      totalQuantity: 0,
      price: 0,
      currencyType: 'д'
    };

    const calculators = [...currentPreset.calculators, newCalculator];
    const updatedPreset = { ...currentPreset, calculators };
    this.currentPresetSubject.next(updatedPreset);
    this.saveCurrentPreset();
  }

  removeCalculator(id: number): void {
    const currentPreset = this.currentPresetSubject.value;
    if (currentPreset.calculators.length <= 1) return;

    const calculators = currentPreset.calculators.filter(calc => calc.id !== id);
    const updatedPreset = { ...currentPreset, calculators };
    this.currentPresetSubject.next(updatedPreset);
    this.saveCurrentPreset();
  }

  updateExchangeRate(rate: number): void {
    const currentPreset = this.currentPresetSubject.value;
    const updatedPreset = { ...currentPreset, exchangeRate: rate };
    this.currentPresetSubject.next(updatedPreset);
    this.saveCurrentPreset();
  }

  // Generate request functionality
  generateRequest(): { header: string; body: string; footer: string } {
    const currentPreset = this.currentPresetSubject.value;

    const items = currentPreset.calculators
      .filter(calc => calc.totalQuantity > 0)
      .map(calc => ({
        name: this.getCalculatorDisplayName(calc),
        quantity: calc.totalQuantity,
        price: calc.price,
        currencyIcon: calc.currencyType === 'д' ? ':divine:' : ':chaos:'
      }));

    const body = items.length > 0
      ? items.map(item => `x${item.quantity} ${item.name} - ${item.price}${item.currencyIcon}/ea`).join('\n')
      : 'No items for sale (all quantities = 0)';

    return {
      header: currentPreset.requestHeader || '',
      body,
      footer: currentPreset.requestFooter || ''
    };
  }

  // Preset management
  savePreset(name: string): boolean {
    const presets = this.availablePresetsSubject.value;

    if (name !== 'Main' && presets.some(p => p.name === name)) {
      return false;
    }

    const currentPreset = this.currentPresetSubject.value;
    const newPreset: Preset = {
      ...currentPreset,
      name
    };

    const updatedPresets = presets.filter(p => p.name !== name);
    updatedPresets.push(newPreset);

    this.availablePresetsSubject.next(updatedPresets);
    this.savePresetsToLocalStorage();
    return true;
  }

  loadPreset(name: string): boolean {
    const presets = this.availablePresetsSubject.value;
    const preset = presets.find(p => p.name === name);

    if (!preset) return false;

    this.currentPresetSubject.next(preset);
    this.saveCurrentPreset();
    return true;
  }

  deletePreset(name: string): boolean {
    if (name === 'Main') return false;

    const presets = this.availablePresetsSubject.value;
    const updatedPresets = presets.filter(p => p.name !== name);

    this.availablePresetsSubject.next(updatedPresets);
    this.savePresetsToLocalStorage();
    return true;
  }

  // Import/Export functionality
  exportPreset(): string {
    const currentPreset = this.currentPresetSubject.value;
    console.dir(currentPreset)
    return btoa(encodeURIComponent(JSON.stringify(currentPreset)));
  }

  importPreset(base64String: string): boolean {
    try {
      const decoded = decodeURIComponent(atob(base64String));
      console.log(decoded)
      const preset: any = JSON.parse(decoded);
      console.log(preset)

      // Migrate old preset format that may not have header/footer
      const migratedPreset = {
        ...preset,
        requestHeader: preset.requestHeader || '',
        requestFooter: preset.requestFooter || ''
      };

      if (!this.isValidPreset(migratedPreset)) {
        return false;
      }

      const presets = this.availablePresetsSubject.value;
      let importName = migratedPreset.name;
      let counter = 1;

      while (presets.some(p => p.name === importName)) {
        importName = `${migratedPreset.name} (${counter})`;
        counter++;
      }

      const importedPreset = { ...migratedPreset, name: importName };
      const updatedPresets = [...presets, importedPreset];

      this.availablePresetsSubject.next(updatedPresets);
      this.savePresetsToLocalStorage();
      return true;
    } catch (error) {
      console.error('Failed to import preset:', error);
      return false;
    }
  }

  private isValidPreset(preset: any): preset is Preset {
    return (
      preset &&
      typeof preset.name === 'string' &&
      typeof preset.exchangeRate === 'number' &&
      (typeof preset.requestHeader === 'string' || preset.requestHeader === undefined) &&
      (typeof preset.requestFooter === 'string' || preset.requestFooter === undefined) &&
      Array.isArray(preset.calculators) &&
      preset.calculators.every((calc: any) =>
        typeof calc.id === 'number' &&
        typeof calc.label === 'string' &&
        typeof calc.totalQuantity === 'number' &&
        typeof calc.price === 'number' &&
        (calc.currencyType === 'д' || calc.currencyType === 'с')
      )
    );
  }

  // LocalStorage operations
  private savePresetsToLocalStorage(): void {
    try {
      const presets = this.availablePresetsSubject.value;
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(presets));
    } catch (error) {
      console.warn('Failed to save presets to localStorage:', error);
    }
  }

  private saveCurrentPreset(): void {
    try {
      const currentPreset = this.currentPresetSubject.value;
      localStorage.setItem(this.CURRENT_PRESET_KEY, JSON.stringify(currentPreset));
    } catch (error) {
      console.warn('Failed to save current preset to localStorage:', error);
    }
  }

  private loadFromLocalStorage(): void {
    try {
      const savedPresets = localStorage.getItem(this.STORAGE_KEY);
      if (savedPresets) {
        const presets: Preset[] = JSON.parse(savedPresets);
        if (presets.length > 0) {
          // Migrate old presets that don't have header/footer and translate "Основний" to "Main"
          const migratedPresets = presets.map(preset => ({
            ...preset,
            name: preset.name === 'Основний' ? 'Main' : preset.name,
            requestHeader: preset.requestHeader || '',
            requestFooter: preset.requestFooter || ''
          }));
          this.availablePresetsSubject.next(migratedPresets);
        }
      }

      const savedCurrentPreset = localStorage.getItem(this.CURRENT_PRESET_KEY);
      if (savedCurrentPreset) {
        const currentPreset: any = JSON.parse(savedCurrentPreset);
        // Migrate old preset that doesn't have header/footer and translate name
        const migratedPreset = {
          ...currentPreset,
          name: currentPreset.name === 'Основний' ? 'Main' : currentPreset.name,
          requestHeader: currentPreset.requestHeader || '',
          requestFooter: currentPreset.requestFooter || ''
        };
        if (this.isValidPreset(migratedPreset)) {
          this.currentPresetSubject.next(migratedPreset);
        }
      }
    } catch (error) {
      console.warn('Failed to load from localStorage:', error);
    }
  }

  resetToDefaults(): void {
    if (confirm('Reset all settings to default values?')) {
      try {
        localStorage.removeItem(this.STORAGE_KEY);
        localStorage.removeItem(this.CURRENT_PRESET_KEY);
        this.currentPresetSubject.next(this.defaultPreset);
        this.availablePresetsSubject.next([this.defaultPreset]);
      } catch (error) {
        console.warn('Failed to reset to defaults:', error);
      }
    }
  }
}
