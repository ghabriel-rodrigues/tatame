/**
 * P0 web components (ds-05 inventory, auth path). Each file carries its
 * anatomy contract; the same names/variants exist on RN, Compose and SwiftUI.
 */

export {
  TatameButton,
  type TatameButtonProps,
  type TatameButtonVariant,
  type TatameButtonSize,
} from './TatameButton.tsx';
export { FormField, type FormFieldProps, type FormFieldType } from './FormField.tsx';
export { Card, type CardProps, type CardVariant } from './Card.tsx';
export { Toast, type ToastProps } from './Toast.tsx';
export { BrandLogo, type BrandLogoProps, type BrandLogoSize } from './BrandLogo.tsx';
export { ScreenHeader, type ScreenHeaderProps } from './ScreenHeader.tsx';

// P1 components (ds-05 inventory, enrollment path — ENR.13-16).
export { Chip, type ChipProps, type ChipTone, type ChipSize } from './Chip.tsx';
export {
  SegmentedControl,
  type SegmentedControlProps,
  type SegmentedControlOption,
} from './SegmentedControl.tsx';
export { ListRow, type ListRowProps } from './ListRow.tsx';
export { BottomSheet, type BottomSheetProps } from './BottomSheet.tsx';
export { EmptyState, type EmptyStateProps } from './EmptyState.tsx';

// Graduation primitives (GRD.12).
export {
  BeltBar,
  BeltChip,
  beltChipLabel,
  type BeltBarProps,
  type BeltBarSize,
  type BeltChipProps,
} from './BeltBar.tsx';
