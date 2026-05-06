export type ProviderType = 'bank' | 'credit_card';

export type CredentialField = {
  key: string;
  label: string;
  type: 'text' | 'password';
};

export type Provider = {
  id: string;
  name: string;
  type: ProviderType;
  fields: CredentialField[];
};

export const PROVIDERS: Provider[] = [
  {
    id: 'hapoalim',
    name: 'בנק הפועלים',
    type: 'bank',
    fields: [
      { key: 'userCode', label: 'קוד משתמש', type: 'text' },
      { key: 'password', label: 'סיסמה', type: 'password' },
    ],
  },
  {
    id: 'leumi',
    name: 'בנק לאומי',
    type: 'bank',
    fields: [
      { key: 'username', label: 'שם משתמש', type: 'text' },
      { key: 'password', label: 'סיסמה', type: 'password' },
    ],
  },
  {
    id: 'discount',
    name: 'בנק דיסקונט',
    type: 'bank',
    fields: [
      { key: 'id', label: 'תעודת זהות', type: 'text' },
      { key: 'password', label: 'סיסמה', type: 'password' },
      { key: 'num', label: 'מספר זיהוי', type: 'text' },
    ],
  },
  {
    id: 'mizrahi',
    name: 'בנק מזרחי-טפחות',
    type: 'bank',
    fields: [
      { key: 'username', label: 'שם משתמש', type: 'text' },
      { key: 'password', label: 'סיסמה', type: 'password' },
    ],
  },
  {
    id: 'otsarHahayal',
    name: 'בנק אוצר החייל',
    type: 'bank',
    fields: [
      { key: 'username', label: 'שם משתמש', type: 'text' },
      { key: 'password', label: 'סיסמה', type: 'password' },
    ],
  },
  {
    id: 'isracard',
    name: 'איזראקארד',
    type: 'credit_card',
    fields: [
      { key: 'id', label: 'תעודת זהות', type: 'text' },
      { key: 'card6Digits', label: '6 ספרות אחרונות של הכרטיס', type: 'text' },
      { key: 'password', label: 'סיסמה', type: 'password' },
    ],
  },
  {
    id: 'max',
    name: 'MAX',
    type: 'credit_card',
    fields: [
      { key: 'username', label: 'שם משתמש', type: 'text' },
      { key: 'password', label: 'סיסמה', type: 'password' },
    ],
  },
  {
    id: 'visaCal',
    name: 'כאל',
    type: 'credit_card',
    fields: [
      { key: 'username', label: 'שם משתמש', type: 'text' },
      { key: 'password', label: 'סיסמה', type: 'password' },
    ],
  },
  {
    id: 'amex',
    name: 'אמריקן אקספרס',
    type: 'credit_card',
    fields: [
      { key: 'id', label: 'תעודת זהות', type: 'text' },
      { key: 'card6Digits', label: '6 ספרות אחרונות של הכרטיס', type: 'text' },
      { key: 'password', label: 'סיסמה', type: 'password' },
    ],
  },
];

export function getProvider(id: string): Provider | undefined {
  return PROVIDERS.find((p) => p.id === id);
}
