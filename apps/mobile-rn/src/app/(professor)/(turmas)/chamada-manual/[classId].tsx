/**
 * Chamada manual (ATT.18, professor-10 — active behavior; the screenshot's
 * all-disabled look is a known capture bug): opening materializes today's
 * session (no code minted) and returns the roster with attendance states —
 * QR/code self check-ins arrive pre-toggled, both chamada modes read one
 * truth. Toggle on = immediate POST (method manual, recorded_by professor);
 * toggle off = immediate same-day revoke through the audited void seam
 * (after day-close the server answers attendance.revoke_window_closed).
 * "Salvar chamada" is pure navigation — no batch diff.
 */

import { useEffect, useState } from 'react';
import { ScrollView, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated from 'react-native-reanimated';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { RollCallResponse, RollCallRosterRow } from '@tatame/shared';
import {
  Card,
  Chip,
  ListRow,
  ScreenHeader,
  TatameButton,
  Text,
  Toast,
  fadeUp,
  useTheme,
} from '@tatame/design-system/native';
import { api } from '../../../../api/query';
import { attendanceErrorMessage } from '../../../../features/attendance/copy';
import { InitialsAvatar } from '../../../../features/enrollment/ui';
import { useSession } from '../../../../session/session-store';

export default function ManualRollCallScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { session } = useSession();
  const { classId } = useLocalSearchParams<{ classId: string }>();

  const [rollCall, setRollCall] = useState<RollCallResponse | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [pendingStudentId, setPendingStudentId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const openMutation = api.useMutation('post', '/v1/professor/classes/{id}/roll-call');
  const markMutation = api.useMutation('post', '/v1/professor/sessions/{id}/attendances');
  const revokeMutation = api.useMutation('post', '/v1/professor/attendances/{id}/revoke');

  // Materialize the session + fetch the roster on mount.
  useEffect(() => {
    if (!classId) return;
    openMutation.mutate(
      { params: { path: { id: classId } } },
      {
        onSuccess: setRollCall,
        onError: () => setLoadError(true),
      },
    );
  }, [classId]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateRow = (studentId: string, updater: (row: RollCallRosterRow) => RollCallRosterRow) => {
    setRollCall((prev) =>
      prev
        ? { ...prev, roster: prev.roster.map((row) => (row.studentId === studentId ? updater(row) : row)) }
        : prev,
    );
  };

  const setPresentCount = (presentCount: number) => {
    setRollCall((prev) => (prev ? { ...prev, presentCount } : prev));
  };

  const toggleOn = (row: RollCallRosterRow) => {
    if (!rollCall) return;
    setPendingStudentId(row.studentId);
    markMutation.mutate(
      {
        params: { path: { id: rollCall.session.id } },
        body: { studentId: row.studentId },
      },
      {
        onSuccess: (response) => {
          updateRow(row.studentId, (current) => ({
            ...current,
            attendance: {
              id: response.attendance.id,
              method: 'manual',
              checkedInAt: response.attendance.checkedInAt,
              recordedByUserId: session?.user.id ?? null,
            },
          }));
          setPresentCount(response.presentCount);
        },
        onError: (error) => setToast(attendanceErrorMessage(error)),
        onSettled: () => setPendingStudentId(null),
      },
    );
  };

  const toggleOff = (row: RollCallRosterRow) => {
    const attendance = row.attendance;
    if (!attendance) return;
    setPendingStudentId(row.studentId);
    revokeMutation.mutate(
      { params: { path: { id: attendance.id } }, body: {} },
      {
        onSuccess: (response) => {
          updateRow(row.studentId, (current) => ({ ...current, attendance: null }));
          setPresentCount(response.presentCount);
        },
        // revoke_window_closed keeps the toggle on — history stays intact.
        onError: (error) => setToast(attendanceErrorMessage(error)),
        onSettled: () => setPendingStudentId(null),
      },
    );
  };

  const roster = rollCall?.roster ?? [];

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: theme.space['5'], paddingBottom: 130 }}>
        <Animated.View entering={fadeUp()} style={{ gap: theme.space['4'] }}>
          <ScreenHeader
            title={rollCall ? `Chamada · ${rollCall.session.className}` : 'Chamada'}
            subtitle={
              rollCall
                ? `${rollCall.presentCount} presentes de ${roster.length}`
                : undefined
            }
            onBack={() => router.back()}
          />

          {openMutation.isPending && !rollCall ? (
            <Text variant="caption">Carregando…</Text>
          ) : null}
          {loadError ? (
            <Card>
              <View style={{ gap: 4 }}>
                <Text variant="label">Não foi possível abrir a chamada.</Text>
                <Text variant="caption">Volte e tente novamente.</Text>
              </View>
            </Card>
          ) : null}

          {rollCall ? (
            roster.length === 0 ? (
              <Card>
                <Text variant="caption">Nenhum aluno matriculado nesta turma.</Text>
              </Card>
            ) : (
              <Card padding={theme.space['1']}>
                {roster.map((row, index) => {
                  const present = !!row.attendance;
                  const manual = row.attendance?.method === 'manual';
                  return (
                    <ListRow
                      key={row.studentId}
                      title={row.fullName}
                      leading={<InitialsAvatar name={row.fullName} />}
                      divider={index < roster.length - 1}
                      trailing={
                        <View
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: theme.space['2'],
                          }}
                        >
                          {manual ? <Chip label="Manual" tone="brand" /> : null}
                          <Switch
                            testID={`toggle-${row.fullName}`}
                            accessibilityLabel={`Presença de ${row.fullName}`}
                            value={present}
                            disabled={pendingStudentId !== null}
                            onValueChange={(next) => (next ? toggleOn(row) : toggleOff(row))}
                            trackColor={{
                              false: theme.color.bg.sunken,
                              true: theme.color.success['500'],
                            }}
                          />
                        </View>
                      }
                    />
                  );
                })}
              </Card>
            )
          ) : null}

          {rollCall ? (
            <TatameButton fullWidth label="Salvar chamada" onPress={() => router.back()} />
          ) : null}
        </Animated.View>
      </ScrollView>

      <Toast
        open={toast !== null}
        onClose={() => setToast(null)}
        message={toast ?? ''}
        offsetBottom={110}
      />
    </SafeAreaView>
  );
}
