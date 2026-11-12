import { describe, expect, it } from 'vitest';
import { monthRange, parseAmountInput, todayInput } from '@/lib/formatters';

describe('parseAmountInput', () => {
  it.each([
    ['35k', 35_000],
    ['35k5', 35_500],
    ['1tr2', 1_200_000],
    ['1tr25', 1_250_000],
    // Used to come out as 3,500,000: the tail was read as whole hundred-thousands.
    ['1tr250', 1_250_000],
    ['1,5tr', 1_500_000],
    ['1.5 triệu', 1_500_000],
    ['2 củ', 2_000_000],
    ['500 nghìn', 500_000],
    ['500 ngàn', 500_000],
    ['2tỷ', 2_000_000_000],
    ['1.250.000', 1_250_000],
    ['1,250,000', 1_250_000],
    ['1.250.000đ', 1_250_000],
    ['250000', 250_000],
    ['  45 K ', 45_000],
  ])('%s → %d', (input, expected) => {
    expect(parseAmountInput(input)).toBe(expected);
  });

  it.each(['', '   ', '0', 'abc', '1tr2k', '35x', '1..', '1.5', '12.34.567'])('rejects %j', (input) => {
    expect(parseAmountInput(input)).toBeNull();
  });
});

describe('household calendar', () => {
  it('is already tomorrow in Vietnam at 18:00 UTC', () => {
    // 2026-03-31 18:00 UTC is 2026-04-01 01:00 in Ho Chi Minh City.
    const at = new Date('2026-03-31T18:00:00Z');
    expect(todayInput(at)).toBe('2026-04-01');
    expect(monthRange(at)).toEqual({ from: '2026-04-01', to: '2026-04-30' });
  });

  it('knows February in a leap year', () => {
    expect(monthRange(new Date('2028-02-10T05:00:00Z'))).toEqual({
      from: '2028-02-01',
      to: '2028-02-29',
    });
  });
});
