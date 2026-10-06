import { describe, expect, it } from 'vitest';
import { addr, colToIndex, computeSheet, evaluateFormula, FormulaError, indexToCol, parseAddr } from '../../src/apps/sheets/formula';

const code = (v: unknown) => (v instanceof FormulaError ? v.code : v);

describe('direcciones de celda', () => {
  it('convierte columnas y direcciones', () => {
    expect(colToIndex('A')).toBe(0);
    expect(colToIndex('Z')).toBe(25);
    expect(colToIndex('AA')).toBe(26);
    expect(indexToCol(27)).toBe('AB');
    expect(parseAddr('$C$10')).toEqual({ c: 2, r: 9 });
    expect(addr(1, 4)).toBe('B5');
  });
});

describe('expresiones', () => {
  it('respeta la precedencia de operadores', () => {
    expect(evaluateFormula('2+3*4')).toBe(14);
    expect(evaluateFormula('(2+3)*4')).toBe(20);
    expect(evaluateFormula('2^3^2')).toBe(512); // potencia asociativa a la derecha
    expect(evaluateFormula('-2^2')).toBe(4); // como en Excel: el unario se aplica antes
    expect(evaluateFormula('50%')).toBe(0.5);
  });

  it('concatena texto y compara', () => {
    expect(evaluateFormula('"Hola "&"mundo"')).toBe('Hola mundo');
    expect(evaluateFormula('3>2')).toBe(true);
    expect(evaluateFormula('"a"="A"')).toBe(true);
  });

  it('informa errores', () => {
    expect(code(evaluateFormula('1/0'))).toBe('#DIV/0!');
    expect(code(evaluateFormula('NOEXISTE(1)'))).toBe('#NOMBRE?');
    expect(code(evaluateFormula('1+'))).toBe('#ERROR!');
    expect(code(evaluateFormula('"a"*2'))).toBe('#VALOR!');
  });
});

describe('hoja de cálculo', () => {
  const sheet = computeSheet({
    A1: '10',
    A2: '20',
    A3: '30',
    B1: '=SUMA(A1:A3)',
    B2: '=PROMEDIO(A1:A3)',
    B3: '=SI(B1>50;"alto";"bajo")',
    C1: '=MAX(A1:A3)-MIN(A1:A3)',
    C2: '=CONTAR(A1:C1)',
    C3: '=REDONDEAR(B2/7;2)',
    D1: '=SUM(A1,A2)*2',
    D2: 'texto',
    D3: '=D2&" "&A1',
  });

  it('evalúa funciones en español e inglés con rangos', () => {
    expect(sheet.B1).toBe(60);
    expect(sheet.B2).toBe(20);
    expect(sheet.B3).toBe('alto');
    expect(sheet.C1).toBe(20);
    expect(sheet.C2).toBe(3);
    expect(sheet.C3).toBe(2.86);
    expect(sheet.D1).toBe(60);
    expect(sheet.D3).toBe('texto 10');
  });

  it('detecta referencias circulares y las propaga', () => {
    const s = computeSheet({ A1: '=B1+1', B1: '=A1+1', C1: '=A1*2', D1: '5' });
    expect(code(s.A1)).toBe('#CICLO!');
    expect(code(s.B1)).toBe('#CICLO!');
    expect(code(s.C1)).toBe('#CICLO!');
    expect(s.D1).toBe(5);
  });

  it('las celdas vacías valen 0 en operaciones', () => {
    expect(computeSheet({ A1: '=Z99+1' }).A1).toBe(1);
  });
});
