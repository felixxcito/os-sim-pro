import { describe, expect, it } from 'vitest';
import mammoth from 'mammoth';
import { toDocx } from '../../src/apps/writer/toDocx';
import { computeSheet } from '../../src/apps/sheets/formula';
import { fromCsv, fromXlsx, toCsv, toExcelFormula, toXlsx, type Cells } from '../../src/apps/sheets/sheetIo';

describe('Escritor → Word (.docx)', () => {
  it('genera un .docx que Word/mammoth puede leer con su formato', async () => {
    const blob = await toDocx({
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Informe' }] },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Texto en ' },
            { type: 'text', text: 'negrita', marks: [{ type: 'bold' }] },
            { type: 'text', text: ' y ' },
            { type: 'text', text: 'cursiva', marks: [{ type: 'italic' }] },
          ],
        },
        {
          type: 'bulletList',
          content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Round Robin' }] }] }],
        },
        {
          type: 'table',
          content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'PID' }] }] }] }],
        },
      ],
    });
    const { value: html } = await mammoth.convertToHtml({ buffer: Buffer.from(await blob.arrayBuffer()) });
    expect(html).toContain('<h1>Informe</h1>');
    expect(html).toContain('<strong>negrita</strong>');
    expect(html).toContain('<em>cursiva</em>');
    expect(html).toContain('<li>Round Robin</li>');
    expect(html).toContain('<table>');
  });
});

describe('Hojas → Excel (.xlsx) y CSV', () => {
  const cells: Cells = {
    A1: { raw: 'Producto', bold: true },
    B1: { raw: 'Precio', bold: true },
    A2: { raw: 'Teclado' },
    B2: { raw: '25.5', fmt: 'currency' },
    A3: { raw: 'Ratón' },
    B3: { raw: '12' },
    B4: { raw: '=SUMA(B2:B3)' },
    C4: { raw: '=SI(B4>30;"caro";"barato")' },
  };

  it('traduce las fórmulas a la sintaxis de Excel sin tocar los textos', () => {
    expect(toExcelFormula('SUMA(B2:B3)')).toBe('SUM(B2:B3)');
    expect(toExcelFormula('SI(B4>30;"SUMA(;)";"x")')).toBe('IF(B4>30,"SUMA(;)","x")');
  });

  it('guarda y vuelve a abrir un .xlsx conservando datos, fórmulas y formato', async () => {
    const bytes = await toXlsx(cells, computeSheet(Object.fromEntries(Object.entries(cells).map(([a, c]) => [a, c.raw]))));
    const back = await fromXlsx(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
    expect(back.A1).toMatchObject({ raw: 'Producto', bold: true });
    expect(back.B2).toMatchObject({ raw: '25.5', fmt: 'currency' });
    expect(back.B4.raw).toBe('=SUM(B2:B3)');
    const values = computeSheet(Object.fromEntries(Object.entries(back).map(([a, c]) => [a, c.raw])));
    expect(values.B4).toBe(37.5);
    expect(values.C4).toBe('caro');
  });

  it('exporta e importa CSV (con comillas y separador ;)', () => {
    const values = computeSheet({ A1: 'a,b', B1: '=1+1' });
    const csv = toCsv({ A1: { raw: 'a,b' }, B1: { raw: '=1+1' } }, values);
    expect(csv).toBe('"a,b",2\n');
    expect(fromCsv('nombre;nota\nAna;"9,5"\n')).toEqual({ A1: { raw: 'nombre' }, B1: { raw: 'nota' }, A2: { raw: 'Ana' }, B2: { raw: '9,5' } });
  });
});
