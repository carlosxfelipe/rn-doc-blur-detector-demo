import Svg, { Path } from 'react-native-svg';

import { ICON_PATHS, type IconProps } from './iconPaths';

export type { IconName, IconProps } from './iconPaths';

export function Icon({ name, size = 20, color = '#0F172A' }: IconProps) {
  const path = ICON_PATHS[name];

  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      {path ? <Path d={path} fill={color} /> : null}
    </Svg>
  );
}
