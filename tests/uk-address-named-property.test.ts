/**
 * Regression tests for named-property UK addresses.
 *
 * 2026-11-08: a customer at "The Fox Den, Spring Lane, Malvern WR14 1AJ"
 * could not check out — the validator only recognised cottage/house/lodge/
 * farm-style tokens and she had not tapped the "No house number" card.
 * These tests pin the widened rules so the bounce cannot return silently.
 */
import { describe, expect, it } from 'vitest';
import {
  joinAddressLine,
  looksLikeNamedProperty,
  validateUkAddressLine,
  ZERO_HOUSE_NUMBER_MESSAGE,
} from '@/lib/uk-address';

describe('named-property detection', () => {
  it('accepts property-name tokens', () => {
    const named = [
      'The Fox Den, Spring Lane',
      'The Nook, High Street',
      'Hillside Retreat, Mill Lane',
      'Foxglove Annexe, Bell Lane',
      'The Chalet, Park Road',
      'Rose Cottage, High Street',
      'The Old Mill',
    ];
    for (const address of named) {
      expect(validateUkAddressLine(address), address).toBe('');
    }
  });

  it('accepts "The <Name>" properties', () => {
    expect(validateUkAddressLine('The Willows, Church Road')).toBe('');
    expect(validateUkAddressLine('The Beeches, High Street')).toBe('');
  });

  it('still rejects a bare street without a number', () => {
    expect(validateUkAddressLine('Spring Lane')).not.toBe('');
    expect(validateUkAddressLine('High Street')).not.toBe('');
  });

  it('does not mistake street names for named properties', () => {
    const streets = ['Denby Close', 'The Avenue', 'The Green, Malvern', 'Marine View', 'The Broadway'];
    for (const address of streets) {
      expect(looksLikeNamedProperty(address), address).toBe(false);
      expect(validateUkAddressLine(address), address).not.toBe('');
    }
  });

  it('still rejects a zero house number with a targeted message', () => {
    expect(validateUkAddressLine('0 Spring Lane')).toBe(ZERO_HOUSE_NUMBER_MESSAGE);
  });

  it('accepts real house numbers as before', () => {
    expect(validateUkAddressLine('42 Baker Street')).toBe('');
    expect(validateUkAddressLine('12A Spring Lane')).toBe('');
    expect(validateUkAddressLine('Flat 3, 100 High Street')).toBe('');
  });

  it('still honours the explicit no-house-number confirmation', () => {
    expect(validateUkAddressLine('Spring Lane', true)).toBe('');
  });

  it('joins a property name with the street for the Royal Mail label', () => {
    expect(joinAddressLine('The Fox Den', 'Spring Lane')).toBe('The Fox Den Spring Lane');
    expect(joinAddressLine('0', 'Spring Lane')).toBe('Spring Lane');
  });
});
