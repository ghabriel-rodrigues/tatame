/**
 * Certificado de graduação (REP.12, spec 013 — aluno-09 cert sheet): the
 * client-rendered certificate for belt-promotion timeline entries. Academy
 * branded through the session theme (BrandLogo + BeltBar resolve the
 * white-label brand and belt tokens — no hex literals), composing academy
 * name, "Certificado de graduação", student name, the belt line colored by
 * the belt token, the drawn BeltBar, award date and the professor
 * signature line inside a decorative dashed inner border.
 *
 * "Download" = the OS share sheet over the certificate text (React Native's
 * built-in Share API — chosen over expo-print because it ships with the RN
 * runtime: no new native dependency, no extra jest mock surface; a real
 * PDF/image capture share is recorded debt alongside the reports PDF).
 */

import { Share, View } from 'react-native';
import {
  BeltBar,
  BottomSheet,
  BrandLogo,
  Card,
  TatameButton,
  Text,
  resolveBeltColor,
  useTheme,
} from '@tatame/design-system/native';
import { useSession } from '../../session/session-store';
import { fullDatePt } from './format';
import type { GraduationEntry } from './types';

export interface CertificateSheetProps {
  /** The belt-promotion entry (certificateAvailable === true). */
  entry: GraduationEntry | null;
  onClose: () => void;
}

/** Share-sheet text composition (the v1 "download"). */
export function certificateShareMessage(
  entry: GraduationEntry,
  studentName: string,
  academyName: string,
): string {
  const beltName = entry.belt.name.toLocaleLowerCase('pt-BR');
  return (
    `Certificado de graduação — ${academyName}\n` +
    `${studentName} · graduado à faixa ${beltName} de Jiu-Jitsu\n` +
    `${fullDatePt(entry.awardedAt)} · Prof. ${entry.awardedBy.fullName}`
  );
}

export function CertificateSheet({ entry, onClose }: CertificateSheetProps) {
  const theme = useTheme();
  const { session } = useSession();
  const academyName = session?.academy?.name ?? 'Tatame';
  const studentName = session?.user.fullName ?? '';

  if (!entry) return null;
  const beltColor = resolveBeltColor(theme, entry.belt.colorSlug);
  const beltName = entry.belt.name.toLocaleLowerCase('pt-BR');

  const share = () =>
    void Share.share({
      title: 'Certificado de graduação',
      message: certificateShareMessage(entry, studentName, academyName),
    });

  return (
    <BottomSheet open onClose={onClose} testID="certificate-sheet">
      <Card padding={theme.space['2']} testID="certificate-card">
        {/* Decorative inner border — the certificate "paper" frame. */}
        <View
          style={{
            borderWidth: 1,
            borderStyle: 'dashed',
            borderColor: theme.color.border['2'],
            borderRadius: theme.radius.md,
            paddingVertical: theme.space['5'],
            paddingHorizontal: theme.space['4'],
            alignItems: 'center',
            gap: theme.space['2'],
          }}
        >
          {/* Session-branded mark (white-label theme flows through). */}
          <BrandLogo size="sm" label={academyName} testID="certificate-logo" />
          <Text
            variant="overline"
            color={theme.color.fg['4']}
            style={{ marginTop: theme.space['2'], letterSpacing: 2 }}
          >
            Certificado de graduação
          </Text>
          <Text variant="title" style={{ textAlign: 'center' }}>
            {studentName}
          </Text>
          <Text variant="caption" style={{ textAlign: 'center', lineHeight: 20 }}>
            graduado à{' '}
            <Text variant="caption" weight="bold" color={beltColor}>
              faixa {beltName}
            </Text>{' '}
            de Jiu-Jitsu{'\n'}
            {academyName}
          </Text>
          <BeltBar
            belt={{ ...entry.belt, degrees: entry.degree }}
            size="md"
            style={{ alignSelf: 'stretch', marginTop: theme.space['2'] }}
            testID="certificate-belt"
          />
          <View
            style={{
              alignSelf: 'stretch',
              flexDirection: 'row',
              justifyContent: 'space-between',
              marginTop: theme.space['3'],
            }}
          >
            <View style={{ gap: 2 }}>
              <Text variant="overline" color={theme.color.fg['4']} style={{ fontSize: 9.5 }}>
                Data
              </Text>
              <Text variant="caption" weight="bold" color={theme.color.fg['1']}>
                {fullDatePt(entry.awardedAt)}
              </Text>
            </View>
            <View style={{ gap: 2, alignItems: 'flex-end' }}>
              <Text variant="overline" color={theme.color.fg['4']} style={{ fontSize: 9.5 }}>
                Professor
              </Text>
              {/* Signature line — italic per the prototype's cert sheet. */}
              <Text
                variant="caption"
                weight="bold"
                color={theme.color.fg['1']}
                style={{ fontStyle: 'italic' }}
              >
                {entry.awardedBy.fullName}
              </Text>
            </View>
          </View>
        </View>
      </Card>
      <TatameButton
        fullWidth
        label="Compartilhar"
        onPress={share}
        style={{ marginTop: theme.space['3'] }}
        testID="certificate-share"
      />
    </BottomSheet>
  );
}
