/**
 * Check-in bottom sheet (ATT.15/16, aluno-04/05): glass sheet opened from
 * the center FAB and the home hero. Three methods in a segmented control —
 * QR (expo-camera scanning the professor's qr_token; degrades to code entry
 * when the camera or its permission is unavailable), Código (4-digit input)
 * and Manual (direct submit; the "verificação de localização" step is a
 * client stub per spec). All three converge on POST /v1/aluno/checkins.
 *
 * Success = green check pop (DS `pop` motion) with the streak line (hidden
 * when the academy disabled gamification.streak — stats.streak is null);
 * `already_checked_in` lands on a distinct "already registered" state,
 * never an error. Fresh stats ride the response; the home query is
 * invalidated so the hero flips and the tiles update from server truth.
 */

import { useRef, useState } from 'react';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';
import { Check } from 'lucide-react-native';
import { useQueryClient } from '@tanstack/react-query';
import { CameraView, useCameraPermissions } from 'expo-camera';
import type { CheckinRequest, CheckinResponse } from '@tatame/shared';
import {
  BottomSheet,
  FormField,
  SegmentedControl,
  TatameButton,
  Text,
  pop,
  useTheme,
} from '@tatame/design-system/native';
import { api } from '../../api/query';
import { scheduleTimeRange } from '../enrollment/format';
import { attendanceErrorMessage } from './copy';
import { streakLine } from './format';

type Method = 'qr' | 'code' | 'manual';

const METHOD_OPTIONS = [
  { value: 'qr', label: 'QR Code' },
  { value: 'code', label: 'Código' },
  { value: 'manual', label: 'Manual' },
] as const;

export interface CheckinSheetProps {
  open: boolean;
  onClose: () => void;
}

/** Green check pop + result copy (success and already-registered states). */
function ResultView({
  result,
  onClose,
}: {
  result: CheckinResponse;
  onClose: () => void;
}) {
  const theme = useTheme();
  const already = result.status === 'already_checked_in';
  return (
    <View
      style={{
        alignItems: 'center',
        gap: theme.space['3'],
        paddingVertical: theme.space['2'],
      }}
    >
      <Animated.View
        entering={pop()}
        testID="checkin-success-pop"
        style={{
          width: 64,
          height: 64,
          borderRadius: 32,
          backgroundColor: theme.color.success['500'],
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Check size={30} color={theme.color.fg.onColor} strokeWidth={3} />
      </Animated.View>
      <Text variant="subtitle" weight="bold">
        Presença registrada
      </Text>
      {already ? (
        <Text variant="caption" style={{ textAlign: 'center' }}>
          Você já tinha feito check-in nesta aula — tudo certo, nada foi
          duplicado.
        </Text>
      ) : result.stats.streak !== null ? (
        <Text variant="caption" style={{ textAlign: 'center' }}>
          {streakLine(result.stats.streak)}
        </Text>
      ) : null}
      <TatameButton fullWidth label="Fechar" onPress={onClose} />
    </View>
  );
}

export function CheckinSheet({ open, onClose }: CheckinSheetProps) {
  const theme = useTheme();
  const queryClient = useQueryClient();

  const [method, setMethod] = useState<Method>('qr');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CheckinResponse | null>(null);
  const [cameraFailed, setCameraFailed] = useState(false);
  const scannedRef = useRef(false);

  const [permission, requestPermission] = useCameraPermissions();

  const homeQuery = api.useQuery('get', '/v1/aluno/home', undefined, {
    enabled: open,
  });
  const todayClass = homeQuery.data?.todayClass ?? null;

  const checkinMutation = api.useMutation('post', '/v1/aluno/checkins');

  const submit = (body: CheckinRequest) => {
    if (checkinMutation.isPending) return;
    setError(null);
    checkinMutation.mutate(
      { body },
      {
        onSuccess: (response) => {
          setResult(response);
          // Hero flip + stat tiles refresh from server truth.
          void queryClient.invalidateQueries({
            queryKey: ['get', '/v1/aluno/home'],
          });
          // Agenda check-in affordance flips too (AGD.5 — spec 007 story 7).
          void queryClient.invalidateQueries({
            queryKey: ['get', '/v1/aluno/agenda'],
          });
        },
        onError: (mutationError) => {
          scannedRef.current = false;
          setError(attendanceErrorMessage(mutationError));
        },
      },
    );
  };

  const onScanned = (qrToken: string) => {
    if (scannedRef.current || checkinMutation.isPending) return;
    scannedRef.current = true;
    submit({ method: 'qr', qrToken });
  };

  const close = () => {
    setError(null);
    setResult(null);
    setCode('');
    setMethod('qr');
    scannedRef.current = false;
    checkinMutation.reset();
    onClose();
  };

  const cameraReady = permission?.granted === true && !cameraFailed;

  const qrPane = cameraReady ? (
    <View style={{ gap: theme.space['3'] }}>
      <View
        style={{
          height: 220,
          borderRadius: theme.radius.lg,
          overflow: 'hidden',
          backgroundColor: theme.color.bg.sunken,
        }}
      >
        <CameraView
          testID="checkin-camera"
          style={{ flex: 1 }}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={({ data }) => onScanned(data)}
          onMountError={() => setCameraFailed(true)}
        />
      </View>
      <Text variant="caption" style={{ textAlign: 'center' }}>
        Aponte para o QR Code exibido pelo professor.
      </Text>
    </View>
  ) : (
    <View style={{ gap: theme.space['3'] }}>
      <Text variant="caption">
        Câmera indisponível neste aparelho ou sem permissão. Você ainda pode
        entrar com o código de 4 dígitos.
      </Text>
      {permission && !permission.granted ? (
        <TatameButton
          fullWidth
          variant="secondary"
          label="Permitir câmera"
          onPress={() => {
            void requestPermission();
          }}
        />
      ) : null}
      <TatameButton
        fullWidth
        label="Usar código"
        onPress={() => setMethod('code')}
      />
    </View>
  );

  const codePane = (
    <View style={{ gap: theme.space['3'] }}>
      <FormField
        label="Código da chamada"
        type="number"
        placeholder="0000"
        value={code}
        onChangeText={(raw) => setCode(raw.replace(/\D/g, '').slice(0, 4))}
        helperText="4 dígitos mostrados pelo professor."
      />
      <TatameButton
        fullWidth
        label="Confirmar código"
        disabled={code.length !== 4}
        loading={checkinMutation.isPending}
        onPress={() => submit({ method: 'code', code })}
      />
    </View>
  );

  const manualPane = (
    <View style={{ gap: theme.space['3'] }}>
      <Text variant="caption">
        Verificação de localização em breve — por enquanto sua presença é
        registrada direto para a aula de hoje e fica marcada como manual para o
        professor.
      </Text>
      {todayClass ? (
        <TatameButton
          fullWidth
          label="Registrar presença"
          loading={checkinMutation.isPending}
          onPress={() =>
            submit({ method: 'manual', classId: todayClass.classId })
          }
        />
      ) : (
        <Text variant="caption">Nenhuma aula sua acontece hoje.</Text>
      )}
    </View>
  );

  return (
    <BottomSheet
      open={open}
      onClose={close}
      title={todayClass ? `Check-in · ${todayClass.className}` : 'Check-in'}
      subtitle={
        todayClass
          ? `Hoje, ${scheduleTimeRange(todayClass.slot)} · ${todayClass.slot.durationMinutes} min`
          : undefined
      }
      testID="checkin-sheet"
    >
      {result ? (
        <ResultView result={result} onClose={close} />
      ) : (
        <View style={{ gap: theme.space['4'] }}>
          <SegmentedControl
            ariaLabel="Método de check-in"
            options={METHOD_OPTIONS}
            value={method}
            onChange={(next) => {
              setError(null);
              setMethod(next);
            }}
          />
          {error ? (
            <Text variant="caption" color={theme.color.danger['500']}>
              {error}
            </Text>
          ) : null}
          {method === 'qr' ? qrPane : method === 'code' ? codePane : manualPane}
        </View>
      )}
    </BottomSheet>
  );
}
