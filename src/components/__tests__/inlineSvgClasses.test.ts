import { inlineSvgClasses } from '../PlatformIcon';

describe('inlineSvgClasses', () => {
  it('returns markup without a <style> block unchanged', () => {
    const svg = '<svg><path d="M0 0" fill="#fff"/></svg>';
    expect(inlineSvgClasses(svg)).toBe(svg);
  });

  it('moves class declarations onto the elements and drops the <style> block', () => {
    const svg =
      '<svg><defs><style>.cls-1 { fill: #c1c1c1; }</style></defs>' +
      '<path class="cls-1" d="M0 0"/></svg>';

    const result = inlineSvgClasses(svg);

    expect(result).not.toContain('<style');
    expect(result).toContain(
      '<path class="cls-1" style="fill: #c1c1c1;" d="M0 0"/>',
    );
  });

  it('removes every <style> block, including ones spliced together by removal', () => {
    const svg =
      '<svg><style>.a { fill: red }</style>' +
      '<sty<style></style>le>.b { fill: blue }</style>' +
      '<path class="a"/></svg>';

    expect(inlineSvgClasses(svg)).not.toContain('<style');
  });

  it('handles comma-separated selectors and multiple classes on one element', () => {
    const svg =
      '<svg><style>.a, .b { fill: red } .c { stroke: blue }</style>' +
      '<path class="a c"/><rect class="b"/></svg>';

    const result = inlineSvgClasses(svg);

    expect(result).toContain(
      '<path class="a c" style="fill: red;stroke: blue"/>',
    );
    expect(result).toContain('<rect class="b" style="fill: red"/>');
  });

  it('merges declarations when a class is defined twice', () => {
    const svg =
      '<svg><style>.a { fill: red } .a { opacity: .5 }</style><path class="a"/></svg>';

    expect(inlineSvgClasses(svg)).toContain('style="fill: red;opacity: .5"');
  });

  it('leaves elements whose classes have no declarations untouched', () => {
    const svg =
      '<svg><style>.a { fill: red } .empty { }</style><path class="empty"/></svg>';

    expect(inlineSvgClasses(svg)).toContain('<path class="empty"/>');
  });
});
