import { describe, expect, it } from 'vitest';
import {
  projectInputSchema,
  timeEntryInputSchema,
  timeEntryListQuerySchema,
} from '../src/schemas/project.js';

describe('project schema', () => {
  it('accepts a project with a rate and budget', () => {
    const parsed = projectInputSchema.parse({
      name: 'Website rebuild',
      currency: 'USD',
      hourlyRateMinor: 9500,
      budgetMinor: 500000,
    });
    expect(parsed.status).toBe('active');
    expect(parsed.hourlyRateMinor).toBe(9500);
  });

  it('rejects an empty name, bad currency and negative money', () => {
    expect(projectInputSchema.safeParse({ name: ' ', currency: 'USD' }).success).toBe(false);
    expect(projectInputSchema.safeParse({ name: 'Site', currency: 'XYZ' }).success).toBe(false);
    expect(
      projectInputSchema.safeParse({ name: 'Site', currency: 'USD', budgetMinor: -1 }).success,
    ).toBe(false);
  });
});

describe('time entry schema', () => {
  const base = {
    projectId: 'project-1',
    date: '2026-11-24',
    minutes: 90,
    description: 'Design revisions',
    hourlyRateMinor: 9500,
  };

  it('accepts whole minutes and defaults to billable', () => {
    const parsed = timeEntryInputSchema.parse(base);
    expect(parsed.minutes).toBe(90);
    expect(parsed.billable).toBe(true);
  });

  it('rejects zero, fractional or multi-day durations', () => {
    expect(timeEntryInputSchema.safeParse({ ...base, minutes: 0 }).success).toBe(false);
    expect(timeEntryInputSchema.safeParse({ ...base, minutes: 1.5 }).success).toBe(false);
    expect(timeEntryInputSchema.safeParse({ ...base, minutes: 1441 }).success).toBe(false);
  });

  it('parses the unbilled filter strictly', () => {
    expect(timeEntryListQuerySchema.parse({ unbilled: 'true' }).unbilled).toBe('true');
    expect(timeEntryListQuerySchema.safeParse({ unbilled: 'yes' }).success).toBe(false);
  });
});
