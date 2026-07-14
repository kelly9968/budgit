import { describe, expect, it } from 'vitest';
import { withConnectionDefaults } from './storage';
import { DEFAULT_MAPPING } from './connection';

describe('withConnectionDefaults', () => {
  it('backfills a pre-upgrade {sheetId, sheetName} config to the historical contract', () => {
    const conn = withConnectionDefaults({ sheetId: 'abc123', sheetName: 'My Budget' });
    expect(conn).toEqual({
      sheetId: 'abc123',
      sheetName: 'My Budget',
      txTab: 'Transactions',
      metaTab: '@metadata',
      mapping: DEFAULT_MAPPING,
      dataStartRow: 2,
      writeEnabled: true,
    });
  });

  it('preserves an explicit full connection untouched', () => {
    const full = {
      sheetId: 'xyz',
      sheetName: 'Ledger',
      txTab: 'Spending 2026',
      metaTab: '@budgie',
      mapping: { date: 1, amount: 3, note: -1, cat: 4, sub: -1 },
      dataStartRow: 3,
      writeEnabled: false,
    };
    expect(withConnectionDefaults(full)).toEqual(full);
  });

  it('repairs partial/invalid fields without dropping the rest', () => {
    const conn = withConnectionDefaults({
      sheetId: 'p',
      txTab: 'Costs',
      dataStartRow: 0, // invalid → default
      mapping: { date: 2 }, // partial → filled from defaults
    });
    expect(conn.txTab).toBe('Costs');
    expect(conn.dataStartRow).toBe(2);
    expect(conn.mapping).toEqual({ ...DEFAULT_MAPPING, date: 2 });
    expect(conn.writeEnabled).toBe(true);
  });
});
