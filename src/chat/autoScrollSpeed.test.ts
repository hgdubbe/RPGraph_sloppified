import { expect, it } from 'vitest';
import { nextAutoScrollSpeed } from './autoScrollSpeed';

it('keeps the base speed for nearby content', () => {
  expect(nextAutoScrollSpeed(42, 42, 200, 300, 1 / 60)).toBe(42);
});

it.each([60, 144, 240])('caps acceleration and braking independently of refresh rate (%s Hz)', (rate) => {
  let speed = 42;
  for (let frame = 0; frame < rate; frame++) {
    speed = nextAutoScrollSpeed(speed, 42, 10000, 300, 1 / rate);
  }
  expect(speed).toBeCloseTo(51.24);
  for (let frame = 0; frame < rate * 10; frame++) {
    speed = nextAutoScrollSpeed(speed, 42, 10000, 300, 1 / rate);
  }
  expect(speed).toBeCloseTo(73.5);
  for (let frame = 0; frame < rate; frame++) {
    speed = nextAutoScrollSpeed(speed, 42, 100, 300, 1 / rate);
  }
  expect(speed).toBeCloseTo(64.26);
  for (let frame = 0; frame < rate * 10; frame++) {
    speed = nextAutoScrollSpeed(speed, 42, 100, 300, 1 / rate);
  }
  expect(speed).toBe(42);
});
