import React from 'react';
import Svg, { Path } from 'react-native-svg';

interface IconProps {
  color: string;
  size?: number;
}

// Small line icons for the top bar, drawn inline so no icon font is needed.

export function HomeIcon({ color, size = 18 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3 11.5 12 4l9 7.5"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M5.5 10v10h4.5v-5.5h4V20h4.5V10"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function GamepadIcon({ color, size = 18 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M6.5 8h11a4.5 4.5 0 0 1 4.4 5.4l-.9 4a2.5 2.5 0 0 1-4.2 1.2L14.5 16h-5l-2.3 2.6A2.5 2.5 0 0 1 3 17.4l-.9-4A4.5 4.5 0 0 1 6.5 8Z"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      <Path
        d="M8 10.5v3M6.5 12h3M15.5 11h.01M17.5 13h.01"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function SearchIcon({ color, size = 18 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M10.5 4a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13ZM15.5 15.5 20 20"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function PlayIcon({ color, size = 18 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M7 4.5v15l13-7.5-13-7.5Z" fill={color} />
    </Svg>
  );
}

export function VerifiedIcon({ color, size = 18 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M9.5 12.5 11 14l3.5-4M12 3l2.2 1.3 2.6-.1 1.3 2.2 2.2 1.3-.1 2.6 1.3 2.2-1.3 2.2.1 2.6-2.2 1.3-1.3 2.2-2.6-.1L12 21l-2.2-1.3-2.6.1-1.3-2.2-2.2-1.3.1-2.6L2.5 11.5l1.3-2.2-.1-2.6 2.2-1.3L7.2 3.2l2.6.1L12 3Z"
        stroke={color}
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function CloseIcon({ color, size = 18 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M6 6l12 12M18 6 6 18"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function SettingsIcon({ color, size = 18 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M10.23 4.61 L10.75 2.08 L13.25 2.08 L13.77 4.61 L15.97 5.52 L18.13 4.10 L19.90 5.87 L18.48 8.03 L19.39 10.23 L21.92 10.75 L21.92 13.25 L19.39 13.77 L18.48 15.97 L19.90 18.13 L18.13 19.90 L15.97 18.48 L13.77 19.39 L13.25 21.92 L10.75 21.92 L10.23 19.39 L8.03 18.48 L5.87 19.90 L4.10 18.13 L5.52 15.97 L4.61 13.77 L2.08 13.25 L2.08 10.75 L4.61 10.23 L5.52 8.03 L4.10 5.87 L5.87 4.10 L8.03 5.52Z"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      <Path
        d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
        stroke={color}
        strokeWidth={2}
      />
    </Svg>
  );
}

export function UserIcon({ color, size = 18 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9ZM4 20.5a8 8 0 0 1 16 0"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function ArrowRightIcon({ color, size = 18 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 12h16M13 5l7 7-7 7"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function BackIcon({ color, size = 18 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M20 12H4M11 5l-7 7 7 7"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function LogoMarkIcon({ color, size = 18 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z"
        stroke={color}
        strokeWidth={2}
      />
      <Path
        d="M8.5 10h.01M15.5 10h.01M8.5 14.5c1 1 2.2 1.5 3.5 1.5s2.5-.5 3.5-1.5"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
