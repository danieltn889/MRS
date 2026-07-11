import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateIdentityDocument } from '../identityDocument.js';

// ---- Rwanda National ID ----
test('accepts a well-formed Rwanda National ID (16 digits, starts with 1 or 2)', () => {
  assert.equal(validateIdentityDocument('Rwanda', 'national_id', '1199080012345678').valid, true);
  assert.equal(validateIdentityDocument('Rwanda', 'national_id', '2199080012345678').valid, true);
});

test('rejects a Rwanda National ID with the wrong length', () => {
  const short = validateIdentityDocument('Rwanda', 'national_id', '119908001234');
  assert.equal(short.valid, false);
  assert.match(short.error!, /Invalid National ID format/);

  const long = validateIdentityDocument('Rwanda', 'national_id', '11990800123456789');
  assert.equal(long.valid, false);
});

test('rejects a Rwanda National ID with non-numeric characters', () => {
  const result = validateIdentityDocument('Rwanda', 'national_id', '11990800A2345678');
  assert.equal(result.valid, false);
  assert.match(result.error!, /Invalid National ID format/);
});

test('rejects a Rwanda National ID not starting with 1 or 2', () => {
  const result = validateIdentityDocument('Rwanda', 'national_id', '3199080012345678');
  assert.equal(result.valid, false);
});

test('surfaces a soft warning (not an error) when the encoded birth year mismatches DOB', () => {
  // Digits 2-5 ("1990") encode birth year per the assumed convention.
  const result = validateIdentityDocument('Rwanda', 'national_id', '1199080012345678', '1985-04-01');
  assert.equal(result.valid, true);
  assert.match(result.warning!, /Date of Birth does not match/);
});

test('is case-insensitive to country name and matches by trimmed value', () => {
  const result = validateIdentityDocument('rwanda ', 'national_id', '1199080012345678');
  assert.equal(result.valid, true);
});

// ---- Passport ----
test('accepts a well-formed passport number', () => {
  assert.equal(validateIdentityDocument('Rwanda', 'passport', 'PC1234567').valid, true);
  assert.equal(validateIdentityDocument('Kenya', 'passport', 'A1234567').valid, true);
});

test('rejects a passport number that is too short or too long', () => {
  assert.equal(validateIdentityDocument('Rwanda', 'passport', 'A123').valid, false);
  assert.equal(validateIdentityDocument('Rwanda', 'passport', 'A12345678901').valid, false);
});

// ---- International fallback (non-Rwandan National ID) ----
test('applies a permissive fallback for international national IDs', () => {
  assert.equal(validateIdentityDocument('Kenya', 'national_id', '12345678').valid, true);
  assert.equal(validateIdentityDocument('Kenya', 'national_id', 'AB').valid, false); // too short
});

test('rejects an empty or missing document number regardless of country', () => {
  assert.equal(validateIdentityDocument('Rwanda', 'national_id', '').valid, false);
  assert.equal(validateIdentityDocument('Rwanda', 'national_id', '  ').valid, false);
});

test('falls back to the default validator for an unregistered country', () => {
  const result = validateIdentityDocument('Wakanda', 'national_id', '1234567890');
  assert.equal(result.valid, true);
});
