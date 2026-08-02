/**
 * FormField — P0 primitive (ds-05). RN executor: label + TextInput +
 * helper/error in one block.
 *
 * Anatomy: [root: column] > [label 13/600] [ring wrapper > input row
 *          (radius-md 14) > TextInput + eye-toggle? (password)]
 *          [helper|error 12px]
 * Variants: default | error (danger-500 text + border)
 * States: default / focus (focus-ring emulated as a 3px halo border) /
 *         disabled / error
 * Tokens: radius.md, border-1/strong, focus.ring, danger-500, bg-surface,
 *         text 15px (web executor parity).
 *
 * Cross-platform prop vocabulary: `label`, `value`, `onChangeText`,
 * `placeholder`, `type`, `error`, `helperText`, `disabled`, `required`.
 */

import { useState } from 'react';
import {
  Pressable,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { Eye, EyeOff } from 'lucide-react-native';
import { useTheme } from '../theme/ThemeProvider.tsx';
import { hexToRgba } from '../lib/color.ts';
import { Text, quicksandFamily } from '../typography/Text.tsx';

export type FormFieldType = 'text' | 'email' | 'password' | 'tel' | 'number';

export interface FormFieldProps {
  label: string;
  value?: string;
  /** Platform-neutral change handler — receives the raw string. */
  onChangeText?: (value: string) => void;
  placeholder?: string;
  type?: FormFieldType;
  /** Error message; presence switches the field to the error state. */
  error?: string;
  helperText?: string;
  disabled?: boolean;
  required?: boolean;
  autoComplete?: TextInputProps['autoComplete'];
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const KEYBOARD: Record<FormFieldType, KeyboardTypeOptions> = {
  text: 'default',
  email: 'email-address',
  password: 'default',
  tel: 'phone-pad',
  number: 'numeric',
};

export function FormField({
  label,
  value,
  onChangeText,
  placeholder,
  type = 'text',
  error,
  helperText,
  disabled = false,
  required = false,
  autoComplete,
  style,
  testID,
}: FormFieldProps) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === 'password';
  const message = error ?? helperText;

  const ring = theme.focus.ring;
  const borderColor = error
    ? theme.color.danger['500']
    : focused
      ? theme.color.border.strong
      : theme.color.border['1'];

  return (
    <View testID={testID} style={[{ gap: 6, opacity: disabled ? 0.55 : 1 }, style]}>
      <Text
        variant="label"
        color={focused && !error ? theme.color.brand['1'] : theme.color.fg['3']}
      >
        {label}
        {required ? ' *' : ''}
      </Text>
      {/* Focus ring: constant transparent halo so focusing never shifts layout. */}
      <View
        style={{
          borderRadius: theme.radius.md + ring.spread,
          borderWidth: ring.spread,
          borderColor: focused ? hexToRgba(ring.color, ring.alpha) : 'transparent',
          margin: -ring.spread,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            borderRadius: theme.radius.md,
            borderWidth: 1,
            borderColor,
            backgroundColor: theme.color.bg.surface,
          }}
        >
          <TextInput
            accessibilityLabel={label}
            value={value}
            onChangeText={onChangeText}
            placeholder={placeholder}
            placeholderTextColor={theme.color.fg['4']}
            editable={!disabled}
            keyboardType={KEYBOARD[type]}
            autoCapitalize={type === 'email' ? 'none' : undefined}
            autoComplete={autoComplete}
            secureTextEntry={isPassword && !showPassword}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            style={{
              flex: 1,
              fontFamily: quicksandFamily('medium'),
              fontSize: 15,
              color: theme.color.fg['1'],
              paddingVertical: 12,
              paddingHorizontal: theme.space['4'],
            }}
          />
          {isPassword ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
              onPress={() => setShowPassword((s) => !s)}
              hitSlop={8}
              style={{ paddingHorizontal: theme.space['3'] }}
            >
              {showPassword ? (
                <EyeOff size={18} color={theme.color.fg['3']} />
              ) : (
                <Eye size={18} color={theme.color.fg['3']} />
              )}
            </Pressable>
          ) : null}
        </View>
      </View>
      {message ? (
        <Text
          variant="caption"
          color={error ? theme.color.danger['500'] : theme.color.fg['3']}
        >
          {message}
        </Text>
      ) : null}
    </View>
  );
}

export default FormField;
