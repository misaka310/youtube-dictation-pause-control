const assert = require('node:assert/strict');
const test = require('node:test');
const fc = require('fast-check');
const { formatLocalTimestamp } = require('../server/log-writer');

test('property: local timestamp formatting stays well-formed for bounded date fields', () => {
  fc.assert(
    fc.property(
      fc.record({
        year: fc.integer({ min: 1970, max: 9999 }),
        month: fc.integer({ min: 0, max: 11 }),
        day: fc.integer({ min: 1, max: 31 }),
        hour: fc.integer({ min: 0, max: 23 }),
        minute: fc.integer({ min: 0, max: 59 }),
        second: fc.integer({ min: 0, max: 59 }),
        timezoneOffset: fc.integer({ min: -14 * 60, max: 14 * 60 }),
      }),
      ({ year, month, day, hour, minute, second, timezoneOffset }) => {
        const fakeDate = {
          getFullYear: () => year,
          getMonth: () => month,
          getDate: () => day,
          getHours: () => hour,
          getMinutes: () => minute,
          getSeconds: () => second,
          getTimezoneOffset: () => timezoneOffset,
        };
        const formatted = formatLocalTimestamp(fakeDate);
        assert.match(formatted, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} [+-]\d{2}:\d{2}$/);
        assert.equal(formatLocalTimestamp(fakeDate), formatted);
      },
    ),
    { numRuns: 1000 },
  );
});
