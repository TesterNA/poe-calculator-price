export interface Calculator {
  id: number;
  label: string;
  totalQuantity: number;
  price: number;
  currencyType: 'д' | 'с';
}

export interface CalculatorResult {
  id: number;
  result: number;
  currencyType: 'д' | 'с';
}

export interface Preset {
  name: string;
  exchangeRate: number;
  requestHeader: string;
  requestFooter: string;
  calculators: Calculator[];
}

export interface Summary {
  totalD: number;
  totalC: number;
  totalInC: number;
  totalInDWithRemainder: {
    wholeDPart: number;
    remainderC: number;
  };
}

export interface GenerateRequestItem {
  name: string;
  quantity: number;
  price: number;
  currencyIcon: string;
}
