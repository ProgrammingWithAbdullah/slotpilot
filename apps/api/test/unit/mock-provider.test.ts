import { describe, expect, it } from 'vitest';
import { DateTime } from 'luxon';
import { parseDate, parseTime } from '../../src/modules/ai/mock.provider.js';

const monday = DateTime.fromISO('2030-01-07');

describe('mock provider parsing', () => {
  it.each([
    ['today', '2030-01-07'],
    ['tomorrow please', '2030-01-08'],
    ['on friday', '2030-01-11'],
    ['next monday', '2030-01-14'],
    ['2030-02-01', '2030-02-01'],
    ['sometime', null],
  ])('date %s', (text, expected) => expect(parseDate(text, monday)).toBe(expected));

  it.each([
    ['3pm', '15:00'],
    ['at 10:30 am', '10:30'],
    ['12am', '00:00'],
    ['noon', '12:00'],
    ['14:45', '14:45'],
    ['morning', null],
  ])('time %s', (text, expected) => expect(parseTime(text)).toBe(expected));
});
