import React from 'react';

interface IconProps {
  size?: number;
  className?: string;
}

const baseProps = (size: number, className?: string) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  className: className ? `svg-icon ${className}` : 'svg-icon',
  'aria-hidden': true as const,
});

/** Anonymous Eye / Masked Syndicate Emblem */
export const AnonMaskIcon: React.FC<IconProps> = ({ size = 18, className }) => (
  <svg {...baseProps(size, className)}>
    <path d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12s-3.5 6.5-9.5 6.5S2.5 12 2.5 12Z" />
    <circle cx="12" cy="12" r="2.75" />
    <path d="M4 4l16 16" />
  </svg>
);

/** Encrypted Burner Phone */
export const BurnerPhoneIcon: React.FC<IconProps> = ({ size = 18, className }) => (
  <svg {...baseProps(size, className)}>
    <rect x="6.5" y="2.5" width="11" height="19" rx="1.5" />
    <path d="M10 5.5h4" />
    <path d="M9.5 10.5h5M9.5 13.5h3.5" />
    <circle cx="12" cy="18" r="0.9" fill="currentColor" stroke="none" />
  </svg>
);

/** Yen Currency Symbol */
export const YenIcon: React.FC<IconProps> = ({ size = 18, className }) => (
  <svg {...baseProps(size, className)}>
    <path d="M6.5 4.5L12 12l5.5-7.5" />
    <path d="M12 12v8.5" />
    <path d="M7.5 13h9" />
    <path d="M7.5 16.5h9" />
  </svg>
);

/** T3 Police Siren */
export const SirenIcon: React.FC<IconProps> = ({ size = 18, className }) => (
  <svg {...baseProps(size, className)}>
    <path d="M7 17v-4a5 5 0 0 1 10 0v4" />
    <path d="M5 17h14v2.5H5z" />
    <path d="M12 3v2" />
    <path d="M4.8 6.8l1.4 1.4" />
    <path d="M19.2 6.8l-1.4 1.4" />
  </svg>
);

/** Network / Relationship Nodes */
export const NetworkNodesIcon: React.FC<IconProps> = ({ size = 18, className }) => (
  <svg {...baseProps(size, className)}>
    <circle cx="12" cy="5" r="2.5" />
    <circle cx="5.5" cy="18" r="2.5" />
    <circle cx="18.5" cy="18" r="2.5" />
    <path d="M10.6 7.1L6.9 15.8" />
    <path d="M13.4 7.1l3.7 8.7" />
    <path d="M8 18h8" />
  </svg>
);

/** Audit Magnifying Glass */
export const AuditSearchIcon: React.FC<IconProps> = ({ size = 18, className }) => (
  <svg {...baseProps(size, className)}>
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="M15.3 15.3L20.5 20.5" />
    <path d="M8.5 10.5h4" />
    <path d="M10.5 8.5v4" />
  </svg>
);

/** Cut-Off / Severance Blade */
export const CutOffBladeIcon: React.FC<IconProps> = ({ size = 18, className }) => (
  <svg {...baseProps(size, className)}>
    <path d="M19.5 4.5L9 15" />
    <path d="M19.5 4.5c-1.5 5-4.8 8.3-9.5 10.5l-1-1L19.5 4.5Z" />
    <path d="M8 16l-3.5 3.5" />
    <path d="M6.5 13.5l4 4" />
  </svg>
);

/** Control / Scale of Authority */
export const ControlScaleIcon: React.FC<IconProps> = ({ size = 18, className }) => (
  <svg {...baseProps(size, className)}>
    <path d="M12 4v16" />
    <path d="M7 20h10" />
    <path d="M5 8h14" />
    <path d="M5 8l-2.5 5.5a2.8 2.8 0 0 0 5 0L5 8Z" />
    <path d="M19 8l-2.5 5.5a2.8 2.8 0 0 0 5 0L19 8Z" />
  </svg>
);

/** Operation Briefcase */
export const BriefcaseOpIcon: React.FC<IconProps> = ({ size = 18, className }) => (
  <svg {...baseProps(size, className)}>
    <rect x="3" y="7" width="18" height="13" rx="1.5" />
    <path d="M8.5 7V4.8A1.3 1.3 0 0 1 9.8 3.5h4.4a1.3 1.3 0 0 1 1.3 1.3V7" />
    <path d="M3 12.5h18" />
    <path d="M10.5 12.5v2h3v-2" />
  </svg>
);

/** Radio / Kaiwan News Broadcast */
export const RadioNewsIcon: React.FC<IconProps> = ({ size = 18, className }) => (
  <svg {...baseProps(size, className)}>
    <rect x="3" y="8" width="18" height="12" rx="1.5" />
    <path d="M7 8l9-4.5" />
    <circle cx="8.5" cy="14" r="2.2" />
    <path d="M13.5 12h4.5M13.5 15.5h4.5" />
  </svg>
);

/** Volume On */
export const VolumeOnIcon: React.FC<IconProps> = ({ size = 18, className }) => (
  <svg {...baseProps(size, className)}>
    <path d="M4 9.5h4l5-4v13l-5-4H4z" />
    <path d="M16.5 8.5a5 5 0 0 1 0 7" />
    <path d="M19 6a8.5 8.5 0 0 1 0 12" />
  </svg>
);

/** Volume Off */
export const VolumeOffIcon: React.FC<IconProps> = ({ size = 18, className }) => (
  <svg {...baseProps(size, className)}>
    <path d="M4 9.5h4l5-4v13l-5-4H4z" />
    <path d="M16.5 9.5l4 5" />
    <path d="M20.5 9.5l-4 5" />
  </svg>
);

/** Play Speed */
export const PlayIcon: React.FC<IconProps> = ({ size = 16, className }) => (
  <svg {...baseProps(size, className)}>
    <polygon points="7,5 19,12 7,19" fill="currentColor" stroke="none" />
  </svg>
);

/** Pause Speed */
export const PauseIcon: React.FC<IconProps> = ({ size = 16, className }) => (
  <svg {...baseProps(size, className)}>
    <rect x="6.5" y="5" width="3.5" height="14" fill="currentColor" stroke="none" />
    <rect x="14" y="5" width="3.5" height="14" fill="currentColor" stroke="none" />
  </svg>
);

/** Fast-Forward 2x */
export const FastForwardIcon: React.FC<IconProps> = ({ size = 16, className }) => (
  <svg {...baseProps(size, className)}>
    <polygon points="4,6 12,12 4,18" fill="currentColor" stroke="none" />
    <polygon points="12.5,6 20.5,12 12.5,18" fill="currentColor" stroke="none" />
  </svg>
);

/** Skip to Night */
export const SkipNightIcon: React.FC<IconProps> = ({ size = 16, className }) => (
  <svg {...baseProps(size, className)}>
    <path d="M14.5 4.5A7.5 7.5 0 1 0 20 14.8a6 6 0 0 1-5.5-10.3Z" />
    <path d="M17.5 4.5v3M16 6h3" />
  </svg>
);

/** City Harm / Skull Threat */
export const HarmSkullIcon: React.FC<IconProps> = ({ size = 18, className }) => (
  <svg {...baseProps(size, className)}>
    <path d="M12 3.5c-4.4 0-7.5 3.1-7.5 7 0 2.5 1.3 4.5 3 5.5v3h9v-3c1.7-1 3-3 3-5.5 0-3.9-3.1-7-7.5-7Z" />
    <circle cx="9.2" cy="10.8" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="14.8" cy="10.8" r="1.1" fill="currentColor" stroke="none" />
    <path d="M10 19v-2M14 19v-2" />
  </svg>
);

/** Arrow Right */
export const ArrowRightIcon: React.FC<IconProps> = ({ size = 16, className }) => (
  <svg {...baseProps(size, className)}>
    <path d="M5 12h14" />
    <path d="M13.5 6.5L19 12l-5.5 5.5" />
  </svg>
);

/** Close X */
export const CloseIcon: React.FC<IconProps> = ({ size = 16, className }) => (
  <svg {...baseProps(size, className)}>
    <path d="M6 6l12 12" />
    <path d="M18 6L6 18" />
  </svg>
);

/** Checkmark */
export const CheckIcon: React.FC<IconProps> = ({ size = 16, className }) => (
  <svg {...baseProps(size, className)}>
    <path d="M5 12.5l4.5 4.5L19.5 7" />
  </svg>
);

/** Warning Triangle */
export const WarningIcon: React.FC<IconProps> = ({ size = 16, className }) => (
  <svg {...baseProps(size, className)}>
    <path d="M12 3.5L2.5 20h19L12 3.5Z" />
    <path d="M12 10v4.5" />
    <circle cx="12" cy="17.2" r="0.8" fill="currentColor" stroke="none" />
  </svg>
);

/** Crew / Personnel Icon */
export const CrewIcon: React.FC<IconProps> = ({ size = 18, className }) => (
  <svg {...baseProps(size, className)}>
    <circle cx="9" cy="8" r="3" />
    <path d="M3.5 19.5c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
    <circle cx="17" cy="9.5" r="2.2" />
    <path d="M15.8 14.8c2.2.3 4.2 1.8 4.2 4.7" />
  </svg>
);

/** Camera Reset / Target Crosshair */
export const ResetViewIcon: React.FC<IconProps> = ({ size = 16, className }) => (
  <svg {...baseProps(size, className)}>
    <path d="M4 9V4h5" />
    <path d="M20 9V4h-5" />
    <path d="M4 15v5h5" />
    <path d="M20 15v5h-5" />
    <circle cx="12" cy="12" r="2" />
  </svg>
);

/** Vanish / Quiet Exit Door */
export const ExitDoorIcon: React.FC<IconProps> = ({ size = 16, className }) => (
  <svg {...baseProps(size, className)}>
    <path d="M13 4H5.5v16H13" />
    <path d="M10 12h10" />
    <path d="M16.5 8.5L20 12l-3.5 3.5" />
  </svg>
);

/** Help / Field Manual Question Icon */
export const HelpIcon: React.FC<IconProps> = ({ size = 16, className }) => (
  <svg {...baseProps(size, className)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.4 9.5a2.6 2.6 0 0 1 5.1.8c0 1.7-2.5 2.1-2.5 3.6" />
    <circle cx="12" cy="17.2" r="0.8" fill="currentColor" stroke="none" />
  </svg>
);

