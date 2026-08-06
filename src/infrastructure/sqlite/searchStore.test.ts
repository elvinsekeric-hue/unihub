import { describe, expect, it } from 'vitest';

import { buildMatchExpression } from './searchStore';

describe('buildMatchExpression', () => {
  it('liefert nichts für eine leere Eingabe', () => {
    expect(buildMatchExpression('   ')).toBeUndefined();
  });

  it('baut einen Präfix-Match für ein einzelnes Wort', () => {
    expect(buildMatchExpression('Blatt')).toBe(
      '"Blatt"*',
    );
  });

  it('verknüpft mehrere Wörter mit AND', () => {
    expect(buildMatchExpression('Blatt 04')).toBe(
      '"Blatt"* AND "04"*',
    );
  });

  it('escaped Anführungszeichen in der Eingabe', () => {
    expect(
      buildMatchExpression('sagt "hallo"'),
    ).toBe('"sagt"* AND """hallo"""*');
  });

  it('ignoriert überzählige Leerzeichen', () => {
    expect(buildMatchExpression('  Blatt   04  ')).toBe(
      '"Blatt"* AND "04"*',
    );
  });
});
