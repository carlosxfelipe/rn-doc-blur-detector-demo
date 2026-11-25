import { ICON_PATHS, type IconProps } from './iconPaths';

export type { IconName, IconProps } from './iconPaths';

export function Icon({ name, size = 20, color = '#0F172A' }: IconProps) {
  const path = ICON_PATHS[name];

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      {path ? <path d={path} fill={color} /> : null}
    </svg>
  );
}
