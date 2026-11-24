import { describe, expect, it } from 'vitest';
import { lateFeeAmount, roundMinutes } from '../src/rules.js';

describe('late fees', () => {
  it('takes a percentage of the balance in basis points', () => {
    // The plan's test vector: 132000 at 150 bp is 1980.
    expect(lateFeeAmount({ type: 'percent', value: 150 }, 132000)).toBe(1980);
    expect(lateFeeAmount({ type: 'percent', value: 250 }, 100000)).toBe(2500);
  });

  it('rounds once, in minor units', () => {
    expect(lateFeeAmount({ type: 'percent', value: 150 }, 3333)).toBe(50);
  });

  it('adds a fixed fee and ignores a zero or negative balance', () => {
    expect(lateFeeAmount({ type: 'fixed', value: 5000 }, 132000)).toBe(5000);
    expect(lateFeeAmount({ type: 'percent', value: 150 }, 0)).toBe(0);
    expect(lateFeeAmount({ type: 'percent', value: 150 }, -100)).toBe(0);
  });
});

describe('time rounding', () => {
  it('leaves minutes alone when rounding is off', () => {
    expect(roundMinutes(37, 'none')).toBe(37);
  });

  it('rounds to the nearest five or fifteen minutes', () => {
    expect(roundMinutes(37, '5')).toBe(35);
    expect(roundMinutes(38, '5')).toBe(40);
    expect(roundMinutes(37, '15')).toBe(30);
    expect(roundMinutes(38, '15')).toBe(45);
  });

  it('never rounds a tracked minute away to nothing', () => {
    expect(roundMinutes(1, '15')).toBe(15);
    expect(roundMinutes(0.2, '5')).toBe(5);
  });
});
