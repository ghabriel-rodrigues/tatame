/**
 * Chamada ao vivo (ATT.17, professor-03): opening materializes today's
 * session and mints the code + QR (idempotent — an open chamada returns its
 * active code). Big 4-digit code, QR rendering the opaque qr_token (never
 * the digits), expiry countdown, and the live counter + arriving list via
 * the SSE state machine (snapshot-then-stream, ticket reconnect, 5 s
 * polling fallback). "Encerrar chamada" invalidates code and QR
 * immediately; reopening mints a fresh code for the same session.
 */

import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated from 'react-native-reanimated';
import { useLocalSearchParams, useRouter } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';
import type { LiveCodeResponse } from '@tatame/shared';
import {
  Card,
  ListRow,
  ScreenHeader,
  TatameButton,
  Text,
  fadeUp,
  useTheme,
} from '@tatame/design-system/native';
import { api } from '../../../../api/query';
import { attendanceErrorMessage } from '../../../../features/attendance/copy';
import { countdownLabel, isExpired, timeLabel } from '../../../../features/attendance/format';
import { useLiveChamada } from '../../../../features/attendance/use-live-chamada';
import { InitialsAvatar } from '../../../../features/enrollment/ui';

const METHOD_LABELS = { qr: 'QR Code', code: 'Código', manual: 'Manual' } as const;

/** Big 4-digit code as individual boxes (professor-03). */
function CodeDigits({ code }: { code: string }) {
  const theme = useTheme();
  return (
    <View
      testID="live-code-digits"
      style={{ flexDirection: 'row', gap: theme.space['3'], justifyContent: 'center' }}
    >
      {code.split('').map((digit, index) => (
        <View
          key={`${index}-${digit}`}
          style={{
            width: 52,
            height: 60,
            borderRadius: theme.radius.md,
            borderWidth: 1,
            borderColor: theme.color.border['1'],
            backgroundColor: theme.color.bg.surface,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text variant="display" weight="bold" style={{ fontSize: 28 }}>
            {digit}
          </Text>
        </View>
      ))}
    </View>
  );
}

export default function LiveChamadaScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { classId } = useLocalSearchParams<{ classId: string }>();

  const [liveCode, setLiveCode] = useState<LiveCodeResponse | null>(null);
  const [closed, setClosed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());

  const openMutation = api.useMutation('post', '/v1/professor/classes/{id}/live-codes');
  const closeMutation = api.useMutation('post', '/v1/professor/live-codes/{id}/close');

  const openChamada = () => {
    if (!classId) return;
    setError(null);
    openMutation.mutate(
      { params: { path: { id: classId } } },
      {
        onSuccess: (response) => {
          setLiveCode(response);
          setClosed(false);
        },
        onError: (mutationError) => setError(attendanceErrorMessage(mutationError)),
      },
    );
  };

  // Open on mount (idempotent server-side: reuses the active code).
  useEffect(openChamada, [classId]); // eslint-disable-line react-hooks/exhaustive-deps

  // 1 s countdown tick while a code is active.
  useEffect(() => {
    if (!liveCode || closed) return;
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, [liveCode, closed]);

  const expired = liveCode ? isExpired(liveCode.expiresAt, now) : false;
  const streamActive = !!liveCode && !closed && !expired;
  const live = useLiveChamada(streamActive ? liveCode.id : null);
  const presentCount = live.synced ? live.presentCount : (liveCode?.presentCount ?? 0);

  const encerrar = () => {
    if (!liveCode) return;
    setError(null);
    closeMutation.mutate(
      { params: { path: { id: liveCode.id } } },
      {
        onSuccess: (response) => {
          setLiveCode(response);
          setClosed(true);
        },
        onError: (mutationError) => setError(attendanceErrorMessage(mutationError)),
      },
    );
  };

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: theme.space['5'], paddingBottom: 130 }}>
        <Animated.View entering={fadeUp()} style={{ gap: theme.space['4'] }}>
          <ScreenHeader
            title={
              closed
                ? 'Chamada encerrada'
                : liveCode
                  ? `Chamada aberta · ${liveCode.session.className}`
                  : 'Chamada'
            }
            subtitle={
              closed
                ? 'O código e o QR foram invalidados.'
                : 'Os alunos podem entrar com o código ou lendo o QR.'
            }
            onBack={() => router.back()}
          />

          {error ? (
            <Text variant="caption" color={theme.color.danger['500']}>
              {error}
            </Text>
          ) : null}

          {openMutation.isPending && !liveCode ? (
            <Text variant="caption">Abrindo chamada…</Text>
          ) : null}

          {liveCode && !closed ? (
            <>
              <CodeDigits code={liveCode.code} />
              <Text variant="caption" style={{ textAlign: 'center' }}>
                {expired
                  ? 'Código expirado — reabra a chamada para um novo código.'
                  : `Expira em ${countdownLabel(liveCode.expiresAt, now)} · sem presenças duplicadas`}
              </Text>

              {/* QR panel: white surface so scanners read it in dark mode too. */}
              <Card
                testID="live-qr-panel"
                padding={theme.space['4']}
                style={{ alignSelf: 'center', backgroundColor: '#FFFFFF' }}
              >
                <QRCode value={liveCode.qrToken} size={150} backgroundColor="#FFFFFF" />
              </Card>

              <Text
                variant="caption"
                weight="bold"
                color={theme.color.success['500']}
                style={{ textAlign: 'center' }}
                testID="live-present-count"
              >
                ● {presentCount} {presentCount === 1 ? 'aluno já registrou' : 'alunos já registraram'}{' '}
                presença
              </Text>
              {live.status === 'polling' ? (
                <Text variant="caption" style={{ textAlign: 'center' }}>
                  Sem conexão em tempo real — atualizando a cada 5 segundos.
                </Text>
              ) : null}

              {live.attendances.length > 0 ? (
                <Card padding={theme.space['1']} testID="live-arrivals">
                  {live.attendances.map((row, index) => (
                    <ListRow
                      key={row.id}
                      title={row.studentName}
                      subtitle={`${METHOD_LABELS[row.method]} · ${timeLabel(row.checkedInAt)}`}
                      leading={<InitialsAvatar name={row.studentName} size={30} />}
                      divider={index < live.attendances.length - 1}
                    />
                  ))}
                </Card>
              ) : null}

              <TatameButton
                fullWidth
                label="Encerrar chamada"
                loading={closeMutation.isPending}
                onPress={encerrar}
              />
            </>
          ) : null}

          {liveCode && closed ? (
            <>
              <Card>
                <View style={{ gap: 4 }}>
                  <Text variant="label">
                    {presentCount} {presentCount === 1 ? 'presença registrada' : 'presenças registradas'}
                  </Text>
                  <Text variant="caption">
                    Reabrir gera um novo código para a mesma aula. Correções pontuais ficam na
                    chamada manual.
                  </Text>
                </View>
              </Card>
              <TatameButton
                fullWidth
                label="Reabrir chamada"
                loading={openMutation.isPending}
                onPress={openChamada}
              />
              <TatameButton
                fullWidth
                variant="ghost"
                label="Voltar"
                onPress={() => router.back()}
              />
            </>
          ) : null}
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}
