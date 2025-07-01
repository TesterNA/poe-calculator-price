import {Component, OnInit, OnDestroy} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {Observable, take, Subject, combineLatest, BehaviorSubject} from 'rxjs';
import {takeUntil, map} from 'rxjs/operators';
import {CalculatorService} from './services/calculator.service';
import {Calculator, Preset, CalculatorResult, Summary} from './models/calculator.interface';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit, OnDestroy {
  title = 'calculator-app';

  // Observables from service
  currentPreset$: Observable<Preset>;
  availablePresets$: Observable<Preset[]>;
  calculatorResults$: Observable<CalculatorResult[]>;
  summary$: Observable<Summary>;

  // Subscription management
  private destroy$ = new Subject<void>();

  // UI state
  showPresetControls = false;
  showRequestModal = false;
  generatedRequestBody = '';
  selectedPresetName = '';

  // Form data
  newPresetName = '';
  importData = '';
  soldAmounts: { [calculatorId: number]: number } = {};
  private soldAmountsSubject = new BehaviorSubject<{ [calculatorId: number]: number }>({});

  // Display values to preserve decimal separators during typing
  displayValues: { [key: string]: string } = {};

  constructor(private calculatorService: CalculatorService) {
    this.currentPreset$ = this.calculatorService.currentPreset$;
    this.availablePresets$ = this.calculatorService.availablePresets$;

    // Custom calculator results using sold amounts as quantities
    this.calculatorResults$ = combineLatest([
      this.currentPreset$,
      this.soldAmountsSubject.asObservable()
    ]).pipe(
      map(([preset, soldAmounts]) =>
        this.calculatorService.calculateResultsWithQuantities(preset.calculators, soldAmounts)
      )
    );

    this.summary$ = combineLatest([
      this.currentPreset$,
      this.calculatorResults$
    ]).pipe(
      map(([preset, results]) => this.calculatorService.calculateSummary(results, preset.exchangeRate))
    );
  }

  ngOnInit(): void {
    // Subscribe to current preset changes to ensure proper dropdown sync
    this.currentPreset$
      .pipe(takeUntil(this.destroy$))
      .subscribe(preset => {
        if (preset) {
          this.selectedPresetName = preset.name;
          console.log('Current preset loaded:', preset.name);
        }
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // UI control methods
  togglePresetControls(): void {
    this.showPresetControls = !this.showPresetControls;
  }

  openRequestModal(): void {
    this.currentPreset$.pipe(take(1)).subscribe(currentPreset => {
      const items = currentPreset.calculators
        .filter((calc: Calculator) => calc.totalQuantity > 0)
        .map((calc: Calculator) => ({
          name: this.getCalculatorDisplayName(calc),
          quantity: calc.totalQuantity,
          price: calc.price,
          currencyIcon: calc.currencyType === 'д' ? 'div' : 'chaos'
        }));

      const body = items.length > 0
        ? items.map((item: any) => `x${item.quantity} ${item.name} - ${item.price} ${item.currencyIcon}/ea`).join('\n')
        : 'No items for sale (all quantities = 0)';

      this.generatedRequestBody = body;
      this.showRequestModal = true;
    });
  }

  private getCalculatorDisplayName(calculator: Calculator): string {
    return calculator.label.trim() || `Calculator_${calculator.id}`;
  }

  closeRequestModal(): void {
    this.showRequestModal = false;
    this.generatedRequestBody = '';
  }

  // Request header/footer methods
  updateRequestHeader(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.calculatorService.updateRequestHeader(target.value);
  }

  updateRequestFooter(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.calculatorService.updateRequestFooter(target.value);
  }

  copyFullRequest(): void {
    this.currentPreset$.pipe(take(1)).subscribe(currentPreset => {
      const items = currentPreset.calculators
        .filter((calc: Calculator) => calc.totalQuantity > 0)
        .map((calc: Calculator) => ({
          name: this.getCalculatorDisplayName(calc),
          quantity: calc.totalQuantity,
          price: calc.price,
          currencyIcon: calc.currencyType === 'д' ? ':divine:' : ':chaos:'
        }));

      const body = items.length > 0
        ? items.map((item: any) => `x${item.quantity} ${item.name} - ${item.price}${item.currencyIcon}/ea`).join('\n')
        : 'No items for sale (all quantities = 0)';

      const parts = [];
      if (currentPreset.requestHeader?.trim()) {
        parts.push(currentPreset.requestHeader.trim());
      }
      parts.push(body);
      if (currentPreset.requestFooter?.trim()) {
        parts.push(currentPreset.requestFooter.trim());
      }

      const fullRequest = parts.join('\n\n');
      this.copyToClipboard(fullRequest);
    });
  }

  copyToClipboard(text: string): void {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(() => {
        alert('Copied to clipboard!');
      }).catch(() => {
        this.fallbackCopyToClipboard(text);
      });
    } else {
      this.fallbackCopyToClipboard(text);
    }
  }

  private fallbackCopyToClipboard(text: string): void {
    // Fallback for non-secure contexts
    const textArea = document.createElement('textarea');
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
      alert('Copied to clipboard!');
    } catch {
      alert('Failed to copy. Please copy the text manually.');
    }
    document.body.removeChild(textArea);
  }

  // Calculator management methods
  updateCalculatorLabel(id: number, event: Event): void {
    const target = event.target as HTMLInputElement;
    this.calculatorService.updateCalculator(id, {label: target.value});
  }

  updateCalculatorTotal(id: number, event: Event): void {
    const target = event.target as HTMLInputElement;
    const inputValue = target.value;

    // Always update display value immediately for responsive UI
    this.displayValues['total_' + id] = inputValue;

    // Parse and save to service immediately for calculations
    const totalQuantity = this.parseNumberInput(inputValue);
    this.calculatorService.updateCalculator(id, {totalQuantity});

    // Clear display override if input is completed (no trailing decimal separator)
    if (!inputValue.endsWith('.') && !inputValue.endsWith(',')) {
      delete this.displayValues['total_' + id];
    }
  }

  updateSoldAmount(id: number, event: Event): void {
    const target = event.target as HTMLInputElement;
    const inputValue = target.value;

    // Always update display value immediately for responsive UI
    this.displayValues['sold_' + id] = inputValue;

    // Parse and save immediately for calculations
    this.soldAmounts[id] = this.parseNumberInput(inputValue);
    this.soldAmountsSubject.next({...this.soldAmounts});

    // Clear display override if input is completed (no trailing decimal separator)
    if (!inputValue.endsWith('.') && !inputValue.endsWith(',')) {
      delete this.displayValues['sold_' + id];
    }
  }

  updateCalculatorPrice(id: number, event: Event): void {
    const target = event.target as HTMLInputElement;
    const inputValue = target.value;

    // Always update display value immediately for responsive UI
    this.displayValues['price_' + id] = inputValue;

    // Parse and save to service immediately for calculations
    const price = this.parseNumberInput(inputValue);
    this.calculatorService.updateCalculator(id, {price});

    // Clear display override if input is completed (no trailing decimal separator)
    if (!inputValue.endsWith('.') && !inputValue.endsWith(',')) {
      delete this.displayValues['price_' + id];
    }
  }

  // Exchange rate methods
  updateExchangeRate(event: Event): void {
    const target = event.target as HTMLInputElement;
    const inputValue = target.value;

    // Always update display value immediately for responsive UI
    this.displayValues['exchangeRate'] = inputValue;

    // Parse and save immediately for calculations
    const rate = this.parseNumberInput(inputValue);
    this.calculatorService.updateExchangeRate(rate);

    // Clear display override if input is completed (no trailing decimal separator)
    if (!inputValue.endsWith('.') && !inputValue.endsWith(',')) {
      delete this.displayValues['exchangeRate'];
    }
  }

  // Number input handling methods
  private parseNumberInput(value: string): number {
    if (!value || value.trim() === '') return 0;

    // Replace comma with dot for decimal parsing
    const normalizedValue = value.replace(',', '.');

    // Remove any non-numeric characters except dots and minus
    const cleanValue = normalizedValue.replace(/[^0-9.-]/g, '');

    const parsed = parseFloat(cleanValue);
    return isNaN(parsed) ? 0 : Math.max(0, parsed);
  }

  updateCalculatorCurrency(id: number, event: Event): void {
    const target = event.target as HTMLSelectElement;
    const currencyType = target.value as 'д' | 'с';
    this.calculatorService.updateCalculator(id, {currencyType});
  }

  updateCalculatorCurrencyDirect(id: number, currencyType: 'д' | 'с'): void {
    this.calculatorService.updateCalculator(id, {currencyType});
  }

  // Sold functionality - subtract from total quantity
  markAsSold(id: number): void {
    const soldAmount = this.soldAmounts[id];
    if (soldAmount && soldAmount > 0) {
      this.calculatorService.markAsSold(id, soldAmount);
      this.soldAmounts[id] = 0; // Reset input after marking as sold
      delete this.displayValues['sold_' + id]; // Clear display override
      this.soldAmountsSubject.next({...this.soldAmounts});
    }
  }

  addCalculator(): void {
    this.calculatorService.addCalculator();
  }

  removeCalculator(id: number): void {
    if (confirm('Are you sure you want to remove this calculator?')) {
      this.calculatorService.removeCalculator(id);
      // Clean up sold amount and display values for removed calculator
      delete this.soldAmounts[id];
      this.clearDisplayValuesForCalculator(id);
      this.soldAmountsSubject.next({...this.soldAmounts});
    }
  }

  private clearDisplayValuesForCalculator(id: number): void {
    delete this.displayValues['total_' + id];
    delete this.displayValues['price_' + id];
    delete this.displayValues['sold_' + id];
  }

  // Reset all total quantities to 0
  resetAllTotals(): void {
    if (confirm('Are you sure you want to reset all total quantities to 0?')) {
      this.calculatorService.resetAllTotals();
      // Clear display values for total fields
      this.currentPreset$.pipe(take(1)).subscribe(preset => {
        preset.calculators.forEach(calc => {
          delete this.displayValues['total_' + calc.id];
        });
      });
    }
  }

  // Sold all functionality - subtract all quantities from totals
  soldAll(): void {
    if (confirm('Are you sure you want to mark all quantities as sold?')) {
      // Use sold amounts from inputs to subtract from totals
      this.currentPreset$.pipe(take(1)).subscribe(preset => {
        preset.calculators.forEach(calc => {
          const soldAmount = this.soldAmounts[calc.id] || 0;
          if (soldAmount > 0) {
            this.calculatorService.markAsSold(calc.id, soldAmount);
          }
        });
        // Clear all sold amounts and display values after processing
        this.soldAmounts = {};
        this.displayValues = {}; // Clear all display overrides
        this.soldAmountsSubject.next({...this.soldAmounts});
      });
    }
  }

  // Preset management methods
  savePreset(): void {
    const name = this.newPresetName.trim();
    if (!name) {
      alert('Please enter a preset name');
      return;
    }

    const success = this.calculatorService.savePreset(name);
    if (success) {
      alert(`Preset "${name}" saved successfully!`);
      this.newPresetName = '';
    } else {
      alert('A preset with this name already exists!');
    }
  }

  overwriteCurrentPreset(): void {
    this.currentPreset$.pipe(take(1)).subscribe(currentPreset => {
      if (confirm(`Are you sure you want to overwrite preset "${currentPreset.name}" with current settings?`)) {
        const success = this.calculatorService.overwriteCurrentPreset();
        if (success) {
          alert(`Preset "${currentPreset.name}" updated successfully!`);
        } else {
          alert('Error updating preset');
        }
      }
    }).unsubscribe();
  }

  loadPreset(event: Event): void {
    const target = event.target as HTMLSelectElement;
    const presetName = target.value;

    const success = this.calculatorService.loadPreset(presetName);
    if (!success) {
      alert('Error loading preset');
      // Reset select to current preset if loading failed
      this.currentPreset$.pipe(take(1)).subscribe(preset => {
        this.selectedPresetName = preset.name;
      });
    } else {
      // Clear sold amounts and display values when loading preset
      this.soldAmounts = {};
      this.displayValues = {};
      this.soldAmountsSubject.next({});
      this.selectedPresetName = presetName;
    }
  }

  deletePreset(): void {
    this.currentPreset$.pipe(take(1)).subscribe(currentPreset => {
      if (currentPreset.name === 'Main') {
        alert('Cannot delete the main preset');
        return;
      }

      if (confirm(`Are you sure you want to delete preset "${currentPreset.name}"?`)) {
        const success = this.calculatorService.deletePreset(currentPreset.name);
        if (success) {
          this.calculatorService.loadPreset('Main');
          this.selectedPresetName = 'Main';
          alert('Preset deleted successfully');
        } else {
          alert('Error deleting preset');
        }
      }
    }).unsubscribe();
  }

  // Import/Export methods
  exportPreset(): void {
    console.log(1)
    const base64Data = this.calculatorService.exportPreset();
    console.log(2)

    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(base64Data).then(() => {
        alert('Export code copied to clipboard!');
      }).catch(() => {
        alert(`Copy this code for export:\n\n${base64Data}`);
      });
    } else {
      alert(`Copy this code for export:\n\n${base64Data}`);
    }
  }

  importPreset(): void {
    const data = this.importData.trim();
    if (!data) {
      alert('Please enter a base64 string for import');
      return;
    }

    const success = this.calculatorService.importPreset(data);
    if (success) {
      alert('Preset imported successfully!');
      this.importData = '';
    } else {
      alert('Import error. Please check the base64 string.');
    }
  }

  // Track by function for ngFor performance
  trackByCalculatorId(index: number, calculator: Calculator): number {
    return calculator.id;
  }

  // Debug method (can be removed in production)
  resetToDefaults(): void {
    this.calculatorService.resetToDefaults();
  }

  validateDecimalInput(event: KeyboardEvent): void {
    const target = event.target as HTMLInputElement;
    const value = target.value;

    // Allow backspace, delete, tab, escape, enter
    if ([8, 9, 27, 13, 46].indexOf(event.keyCode) !== -1 ||
        // Allow Ctrl+A, Ctrl+C, Ctrl+V, Ctrl+X
        (event.keyCode === 65 && event.ctrlKey === true) ||
        (event.keyCode === 67 && event.ctrlKey === true) ||
        (event.keyCode === 86 && event.ctrlKey === true) ||
        (event.keyCode === 88 && event.ctrlKey === true)) {
      return;
    }

    // Ensure that it's a valid decimal number input
    const char = String.fromCharCode(event.keyCode);
    const isValidChar = /[0-9,.]/.test(char);

    if (!isValidChar) {
      event.preventDefault();
      return;
    }

    // Allow only one decimal separator
    if ((char === '.' || char === ',') && (value.includes('.') || value.includes(','))) {
      event.preventDefault();
    }
  }
}
