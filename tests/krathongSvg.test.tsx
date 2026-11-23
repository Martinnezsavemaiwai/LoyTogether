import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { KrathongSvg } from '@/features/krathong/KrathongSvg';
import { DEFAULT_DESIGN } from '@/features/krathong/options';
import type { KrathongDesign } from '@/types/domain';

const markup = (design: KrathongDesign) =>
  render(<KrathongSvg design={design} />).container.innerHTML.replace(/(glow|flame)-[^"')]+/g, '$1');

describe('KrathongSvg', () => {
  it('renders a different drawing for every part choice', () => {
    const base = markup(DEFAULT_DESIGN);
    const variants: Partial<KrathongDesign>[] = [
      { shape: 'heart' },
      { shape: 'circle' },
      { base: 'flower' },
      { flower: 'rose' },
      { flower: 'orchid' },
      { candle: 'pink' },
      { decoration: 'purple' },
    ];
    for (const change of variants) {
      expect(markup({ ...DEFAULT_DESIGN, ...change }), JSON.stringify(change)).not.toBe(base);
    }
  });

  it('exposes an accessible name when titled', () => {
    const { getByRole } = render(<KrathongSvg design={DEFAULT_DESIGN} title="กระทงของฉัน" />);
    expect(getByRole('img', { name: 'กระทงของฉัน' })).toBeInTheDocument();
  });
});
