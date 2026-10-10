import { ROOTS, type SalesGoalValue } from '@puro-origen/domain';

export const DEMO_CODE = 'demo-acceptance-v1';
export const DEMO_PURPOSE =
  'Datos ficticios para aceptación funcional; no son información contable real.';
export const DEMO_NOTE =
  'DATOS DEMO — Escenario de aceptación funcional. No corresponde a información contable real.';
export const DEMO_BRANCHES = ['CALLE 13', 'CALLE 50', 'CALLE 59'] as const;
export const DEMO_PERIODS = [
  { year: 2026, month: 8 },
  { year: 2026, month: 9 },
] as const;
export const DEMO_SLOTS = [
  'CALLE 13/8',
  'CALLE 13/9',
  'CALLE 50/8',
  'CALLE 50/9',
  'CALLE 59/8',
  'CALLE 59/9',
] as const;

const code = (number: number) =>
  `00000000-0000-4000-8000-${number.toString().padStart(12, '0')}`;
export const DEMO_CATEGORIES = [
  { code: code(101), parentCode: ROOTS[0].code, name: 'Ventas', position: 0 },
  {
    code: code(102),
    parentCode: ROOTS[1].code,
    name: 'Mercadería vendida',
    position: 0,
  },
  {
    code: code(103),
    parentCode: ROOTS[1].code,
    name: 'Costos variables de venta',
    position: 1,
  },
  { code: code(104), parentCode: ROOTS[2].code, name: 'Personal', position: 0 },
  { code: code(105), parentCode: ROOTS[2].code, name: 'Local', position: 1 },
  {
    code: code(106),
    parentCode: ROOTS[2].code,
    name: 'Administración',
    position: 2,
  },
  {
    code: code(107),
    parentCode: ROOTS[2].code,
    name: 'Otros gastos',
    position: 3,
  },
] as const;

type SlotValues = readonly [string, string, string, string, string, string];
type DemoItem = Readonly<{
  code: string;
  categoryCode: string;
  name: string;
  values: SlotValues;
  quantities?: SlotValues;
  unit?: string;
  note?: string;
}>;
const item = (
  id: number,
  category: number,
  name: string,
  values: SlotValues,
  extras: Partial<DemoItem> = {},
): DemoItem => ({
  code: code(id),
  categoryCode: code(category),
  name,
  values,
  ...extras,
});

// Columnas: 13 ago/sep, 50 ago/sep, 59 ago/sep. Todos los montos son netos de IVA.
export const DEMO_ITEMS: readonly DemoItem[] = [
  item(
    201,
    101,
    'Ventas de salón',
    [
      '690123.45',
      '755321.10',
      '850230.15',
      '868944.20',
      '1190231.40',
      '1390120.35',
    ],
    {
      quantities: ['4510', '4802', '6103', '6198', '7902', '8990'],
      unit: 'tickets',
      note: 'Ventas presenciales ficticias.',
    },
  ),
  item(
    202,
    101,
    'Ventas por pedidos',
    [
      '350000-123.45',
      '439678.90',
      '389769.85',
      '411055.80',
      '549768.60',
      '649879.65',
    ],
    {
      quantities: ['1020', '1220', '1150', '1204', '1410', '1630'],
      unit: 'pedidos',
    },
  ),
  item(203, 101, 'Otros ingresos operativos', [
    '60031.75',
    '75012.90',
    '60045.85',
    '60019.20',
    '60015.70',
    '60039.25',
  ]),
  item(204, 102, 'Costo de mercadería', [
    '390125.30',
    '497233.80',
    '459876.30',
    '471250.20',
    '609871.75',
    '690133.45',
  ]),
  item(205, 103, 'Comisiones de cobro', [
    '49075.20',
    '69142.70',
    '43012.50',
    '44690.25',
    '58028.25',
    '68031.55',
  ]),
  item(206, 103, 'Envíos y reparto', [
    '20000+19000',
    '79000.00',
    '19000.00',
    '20000.00',
    '35000.00',
    '40000.00',
  ]),
  item(207, 103, 'Bolsas y materiales de entrega', [
    '22000.00',
    '34789.50',
    '17000.00',
    '18000.00',
    '27000.00',
    '29000.00',
  ]),
  item(
    208,
    104,
    'Sueldos',
    [
      '211500.00',
      '216000.00',
      '275100.00',
      '277500.00',
      '320200.00',
      '323000.00',
    ],
    { note: 'Plantilla ficticia estable.' },
  ),
  item(209, 104, 'Cargas sociales', [
    '60500.00',
    '62000.00',
    '78900.00',
    '80000.00',
    '91800.00',
    '93000.00',
  ]),
  item(210, 105, 'Alquiler', [
    '85000.00',
    '85000.00',
    '105000.00',
    '105000.00',
    '120000.00',
    '120000.00',
  ]),
  item(211, 105, 'Servicios', [
    '21000.00',
    '22500.00',
    '27000.00',
    '27500.00',
    '32500.00',
    '33000.00',
  ]),
  item(212, 105, 'Mantenimiento y reparaciones', [
    '9500.00',
    '12000.00',
    '11000.00',
    '10000.00',
    '15000.00',
    '14000.00',
  ]),
  item(213, 105, 'Limpieza', [
    '14500.00',
    '14500.00',
    '18000.00',
    '18000.00',
    '23000.00',
    '23000.00',
  ]),
  item(214, 106, 'Honorarios', [
    '20000.00',
    '20000.00',
    '26000.00',
    '26000.00',
    '30000.00',
    '30000.00',
  ]),
  item(215, 106, 'Sistemas y software', [
    '11250.00',
    '11250.00',
    '13500.00',
    '13500.00',
    '16500.00',
    '16500.00',
  ]),
  item(216, 106, 'Gastos bancarios', [
    '7800.00',
    '8200.00',
    '9700.00',
    '9900.00',
    '12600.00',
    '12900.00',
  ]),
  item(217, 106, 'Impuestos y tasas', [
    '18350.00',
    '19900.00',
    '22800.00',
    '23200.00',
    '28700.00',
    '29500.00',
  ]),
  item(
    218,
    107,
    'Otros gastos generales',
    ['0*5', '3200.00', '0', '1100.00', '0', '1500.00'],
    { note: 'Cero explícito cuando no hubo gasto.' },
  ),
];

export const DEMO_GOALS: readonly SalesGoalValue[] = [
  { mode: 'NET_MARGIN_PERCENT', value: '55.0000' },
  { mode: 'NET_MARGIN_PERCENT', value: '55.0000' },
  { mode: 'NET_PROFIT_AMOUNT', value: '180000.00' },
  { mode: 'NET_PROFIT_AMOUNT', value: '190000.00' },
  { mode: 'NET_MARGIN_PERCENT', value: '20.0000' },
  { mode: 'NET_MARGIN_PERCENT', value: '22.0000' },
];

// Anclas de regresión verificadas con calculateEerr/aggregateEerr, no usadas para calcular.
export const DEMO_EXPECTED_NET = [
  '140431.25',
  '115296.90',
  '174157.05',
  '194378.75',
  '379815.70',
  '576474.25',
] as const;
export const DEMO_EXPECTED_CONSOLIDATED_NET = [
  '694404.00',
  '886149.90',
] as const;
