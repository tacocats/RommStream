import {
  resolutionPresets,
  selkiesCommands,
  selkiesPostMessageScript,
} from '../commands';

describe('selkiesPostMessageScript', () => {
  it('builds a script that posts the command to the session frame, falling back to the page', () => {
    const script = selkiesPostMessageScript({ type: 'requestFullscreen' });

    expect(script).toContain('postMessage(');
    expect(script).toContain('"type":"requestFullscreen"');
    expect(script).toContain('window.location.origin');
  });

  it('includes extra fields alongside the type', () => {
    const script = selkiesPostMessageScript({
      type: 'gamepadControl',
      enabled: true,
    });

    expect(script).toContain('"enabled":true');
  });
});

describe('selkiesCommands', () => {
  it('builds the documented selkies-core message shapes', () => {
    expect(selkiesCommands.requestFullscreen()).toEqual({
      type: 'requestFullscreen',
    });
    expect(selkiesCommands.gamepadControl(false)).toEqual({
      type: 'gamepadControl',
      enabled: false,
    });
    expect(selkiesCommands.setManualResolution(1920, 1080)).toEqual({
      type: 'setManualResolution',
      width: 1920,
      height: 1080,
    });
    expect(selkiesCommands.resetResolutionToWindow()).toEqual({
      type: 'resetResolutionToWindow',
    });
  });
});

describe('resolutionPresets', () => {
  it('pairs a width and height for each preset', () => {
    Object.values(resolutionPresets).forEach(({ width, height }) => {
      expect(width).toBeGreaterThan(0);
      expect(height).toBeGreaterThan(0);
    });
  });
});
