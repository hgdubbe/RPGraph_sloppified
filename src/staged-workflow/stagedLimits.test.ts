import { describe, expect, it } from 'vitest';
import { hardLimits } from './compileTurnPlan';
import {
  defaultStagedBeatsLimit,
  defaultStagedCallsLimit,
  defaultStagedContinuationsLimit,
  defaultStagedGenerationsLimit,
  resolveStagedLimits,
} from './stagedLimits';

describe('resolveStagedLimits', () => {
  it('resolves the current fixed defaults when nothing is authored', () => {
    expect(resolveStagedLimits({})).toEqual({
      beats: defaultStagedBeatsLimit,
      calls: defaultStagedCallsLimit,
      generations: defaultStagedGenerationsLimit,
      continuations: defaultStagedContinuationsLimit,
    });
  });

  it('resolves authored values as-is when within the compiler hard limits', () => {
    expect(resolveStagedLimits({ stagedBeatsLimit: 10, stagedCallsLimit: 2, stagedGenerationsLimit: 1, stagedContinuationsLimit: 2 }))
      .toEqual({ beats: 10, calls: 2, generations: 1, continuations: 2 });
  });

  it('clamps a value above the compiler hard limit rather than letting it reach validatePlanEnvironment', () => {
    expect(resolveStagedLimits({ stagedGenerationsLimit: 999 }).generations).toBe(hardLimits.generations);
  });

  it('clamps a negative or non-finite value to zero rather than falling back to default', () => {
    expect(resolveStagedLimits({ stagedCallsLimit: -5 }).calls).toBe(0);
    expect(resolveStagedLimits({ stagedCallsLimit: Number.NaN }).calls).toBe(defaultStagedCallsLimit);
  });

  it('rounds a fractional value to the nearest integer', () => {
    expect(resolveStagedLimits({ stagedBeatsLimit: 5.6 }).beats).toBe(6);
  });

  it('defaults continuations to 0 (opt-in), matching every pre-existing route\'s prior behavior', () => {
    expect(resolveStagedLimits({}).continuations).toBe(0);
  });

  it('clamps an authored continuations value into the compiler hard limit too', () => {
    expect(resolveStagedLimits({ stagedContinuationsLimit: 999 }).continuations).toBe(hardLimits.continuations);
  });
});
