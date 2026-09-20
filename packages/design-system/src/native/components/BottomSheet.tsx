/**
 * BottomSheet — P1 composed (ds-05). RN executor: modal sheet rising from
 * the bottom edge (Adicionar aluno picker, Cadastrar aluno form).
 *
 * Anatomy: [scrim] [root: bottom-anchored surface, radius-xl top corners] >
 *          [grabber] [header?: title 17/700 + subtitle 12.5 fg-3] [content]
 * Behavior: dismiss via scrim tap / hardware back (`onRequestClose`); the
 * sheet body scrolls when content exceeds ~86% of the window.
 * Tokens: radius.xl, bg-surface, border-2 (grabber), bg-overlay (scrim),
 *         fg-1/fg-3.
 * A11y: sheet content is modal (`accessibilityViewIsModal`); the scrim is a
 * "Fechar" button.
 *
 * Cross-platform prop vocabulary: `open`, `onClose`, `title`, `subtitle`,
 * `children` — mirrors the web executor (MUI Drawer anchor=bottom).
 */

import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  View,
} from 'react-native';
import { useTheme } from '../theme/ThemeProvider.tsx';
import { Text } from '../typography/Text.tsx';

export interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children?: ReactNode;
  testID?: string;
}

export function BottomSheet({
  open,
  onClose,
  title,
  subtitle,
  children,
  testID,
}: BottomSheetProps) {
  const theme = useTheme();
  return (
    <Modal
      visible={open}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      // Rendered above the app's own chrome; the scrim owns dismissal.
      statusBarTranslucent
    >
      <View
        style={{
          flex: 1,
          justifyContent: 'flex-end',
          backgroundColor: theme.color.bg.overlay,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Fechar"
          onPress={onClose}
          style={{ flex: 1 }}
          testID={testID ? `${testID}-scrim` : undefined}
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View
            accessibilityViewIsModal
            testID={testID}
            style={{
              backgroundColor: theme.color.bg.surface,
              borderTopLeftRadius: theme.radius.xl,
              borderTopRightRadius: theme.radius.xl,
              paddingTop: 10,
              paddingHorizontal: theme.space['5'],
              paddingBottom: 28,
              maxHeight: '86%',
            }}
          >
            <View
              accessibilityElementsHidden
              style={{
                width: 44,
                height: 5,
                borderRadius: theme.radius.pill,
                backgroundColor: theme.color.border['2'],
                alignSelf: 'center',
                marginBottom: 14,
              }}
            />
            {title ? (
              <Text
                variant="subtitle"
                weight="bold"
                accessibilityRole="header"
                style={{ fontSize: 17 }}
              >
                {title}
              </Text>
            ) : null}
            {subtitle ? (
              <Text variant="caption" style={{ fontSize: 12.5, marginTop: 2 }}>
                {subtitle}
              </Text>
            ) : null}
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{
                paddingTop: title ? theme.space['4'] : 0,
              }}
            >
              {children}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

export default BottomSheet;
