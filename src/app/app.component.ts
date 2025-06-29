import {Component, OnInit, OnDestroy} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {Observable, take, Subject} from 'rxjs';
import {takeUntil} from 'rxjs/operators';
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

  constructor(private calculatorService: CalculatorService) {
    this.currentPreset$ = this.calculatorService.currentPreset$;
    this.availablePresets$ = this.calculatorService.availablePresets$;
    this.calculatorResults$ = this.calculatorService.calculatorResults$;
    this.summary$ = this.calculatorService.summary$;
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
    const requestData = this.calculatorService.generateRequest();
    this.generatedRequestBody = requestData.body;
    this.showRequestModal = true;
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
    const requestData = this.calculatorService.generateRequest();

    const parts = [];
    if (requestData.header.trim()) {
      parts.push(requestData.header.trim());
    }
    parts.push(requestData.body);
    if (requestData.footer.trim()) {
      parts.push(requestData.footer.trim());
    }

    const fullRequest = parts.join('\n\n');
    this.copyToClipboard(fullRequest);
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

  // Exchange rate methods
  updateExchangeRate(event: Event): void {
    const target = event.target as HTMLInputElement;
    const rate = parseFloat(target.value) || 0;
    this.calculatorService.updateExchangeRate(rate);
  }

  // Calculator management methods
  updateCalculatorLabel(id: number, event: Event): void {
    const target = event.target as HTMLInputElement;
    this.calculatorService.updateCalculator(id, {label: target.value});
  }

  updateCalculatorTotal(id: number, event: Event): void {
    const target = event.target as HTMLInputElement;
    const totalQuantity = parseFloat(target.value) || 0;
    this.calculatorService.updateCalculator(id, {totalQuantity});
  }

  updateCalculatorPrice(id: number, event: Event): void {
    const target = event.target as HTMLInputElement;
    const price = parseFloat(target.value) || 0;
    this.calculatorService.updateCalculator(id, {price});
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
    }
  }

  addCalculator(): void {
    this.calculatorService.addCalculator();
  }

  removeCalculator(id: number): void {
    if (confirm('Are you sure you want to remove this calculator?')) {
      this.calculatorService.removeCalculator(id);
      // Clean up sold amount for removed calculator
      delete this.soldAmounts[id];
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
      // Clear sold amounts when loading preset
      this.soldAmounts = {};
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
}
