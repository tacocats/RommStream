import qrcode from 'qrcode-generator';
import React, { useMemo } from 'react';
import Svg, { Path, Rect } from 'react-native-svg';

interface Props {
  value: string;
  size: number;
  testID?: string;
}

// Modules of light border QR readers need around the code.
const QUIET_ZONE = 2;

/**
 * A QR code for `value`, drawn as one SVG path of dark modules on white
 * (phones read dark-on-light, whatever the app's theme).
 */
export function QrCode({ value, size, testID }: Props) {
  const { path, count } = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(value);
    qr.make();
    const modules = qr.getModuleCount();
    let d = '';
    for (let row = 0; row < modules; row++) {
      for (let col = 0; col < modules; col++) {
        if (qr.isDark(row, col)) {
          d += `M${col + QUIET_ZONE} ${row + QUIET_ZONE}h1v1h-1z`;
        }
      }
    }
    return { path: d, count: modules + QUIET_ZONE * 2 };
  }, [value]);

  return (
    <Svg
      width={size}
      height={size}
      viewBox={`0 0 ${count} ${count}`}
      testID={testID}
      accessibilityLabel={value}
    >
      <Rect width={count} height={count} fill="#ffffff" />
      <Path d={path} fill="#000000" />
    </Svg>
  );
}
