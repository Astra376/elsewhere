import { expect, it } from 'vitest';
import { locationCompatible, countryCodes } from '../lib/location';
it('includes all ISO country codes without duplicates', () => {
  expect(countryCodes).toHaveLength(249);
  expect(new Set(countryCodes).size).toBe(249);
});
it('handles the date line and unknown locations', () => {
  expect(
    locationCompatible(
      { nearMe: true },
      { latitude: 0, longitude: 179.8 },
      {},
      { latitude: 0, longitude: -179.8 },
    ),
  ).toBe(true);
  expect(locationCompatible({ nearMe: true }, {}, {}, {})).toBe(false);
  expect(locationCompatible({ includeCountries: ['AU'] }, {}, {}, {})).toBe(
    false,
  );
});
