/**
 * Regras de graduação (GRD.13, admin-16): the merged régua — one row per
 * catalog belt in the handoff ladder order — with the drawn belt, the
 * "máx. N graus · X aulas por grau" note, a ±5 stepper (default 40, floor
 * 10) and enable toggles on the kids belts only (Laranja arrives seeded
 * off). Salvar persists every row in one bulk PUT; rules are live — the
 * backend re-aims every progress bar on the next read.
 */
import { useState } from 'react';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Typography from '@mui/material/Typography';
import { BeltBar, Card, ScreenHeader, TatameButton, Toast } from '@tatame/design-system';
import type { GraduationRuleRow } from '@tatame/shared';
import { $api, queryClient } from '../../api/api';
import { graduationErrorMessage, useToastState } from './common';
import { beltLabel, maxDegreesLabel } from './format';

const LESSONS_STEP = 5;
const LESSONS_MIN = 10;

interface RuleDraft {
  lessonsPerDegree: number;
  enabled: boolean;
}

function StepIcon({ kind }: { kind: 'minus' | 'plus' }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      aria-hidden="true"
    >
      {kind === 'plus' ? <path d="M12 5v14M5 12h14" /> : <path d="M5 12h14" />}
    </svg>
  );
}

export function GraduationRulesPage() {
  const toast = useToastState();
  const [draft, setDraft] = useState<Record<string, RuleDraft>>({});
  const [error, setError] = useState<string | null>(null);

  const rulesQuery = $api.useQuery('get', '/v1/admin/graduation-rules');
  const save = $api.useMutation('put', '/v1/admin/graduation-rules');

  const rows = rulesQuery.data?.rules ?? [];

  function valueOf(row: GraduationRuleRow): RuleDraft {
    return (
      draft[row.beltId] ?? { lessonsPerDegree: row.lessonsPerDegree, enabled: row.enabled }
    );
  }

  function patch(row: GraduationRuleRow, changes: Partial<RuleDraft>) {
    setDraft((current) => ({
      ...current,
      [row.beltId]: { ...valueOf(row), ...changes },
    }));
  }

  function submit() {
    setError(null);
    save.mutate(
      {
        body: {
          rules: rows.map((row) => {
            const value = valueOf(row);
            return {
              beltId: row.beltId,
              lessonsPerDegree: value.lessonsPerDegree,
              enabled: value.enabled,
            };
          }),
        },
      },
      {
        onSuccess: () => {
          setDraft({});
          void queryClient.invalidateQueries({
            queryKey: ['get', '/v1/admin/graduation-rules'],
          });
          toast.show('Regras de graduação salvas.');
        },
        onError: (cause) => setError(graduationErrorMessage(cause)),
      },
    );
  }

  return (
    <Box sx={{ maxWidth: 560, margin: '0 auto' }}>
      <Stack spacing="16px">
        <ScreenHeader
          title="Regras de graduação"
          subtitle="Aulas mínimas por grau em cada faixa."
          trailing={
            <TatameButton
              size="sm"
              label="Salvar"
              loading={save.isPending}
              disabled={rows.length === 0}
              onPress={submit}
            />
          }
        />

        {rulesQuery.isLoading ? (
          <Typography sx={{ fontSize: 13.5, color: 'var(--fg-3)', textAlign: 'center' }}>
            Carregando regras…
          </Typography>
        ) : null}

        <Stack spacing="10px">
          {rows.map((row) => {
            const value = valueOf(row);
            return (
              <Card key={row.beltId} padding={14} className="RuleRow">
                <Stack
                  direction="row"
                  spacing="12px"
                  sx={{ alignItems: 'center', opacity: value.enabled ? 1 : 0.45 }}
                >
                  <BeltBar
                    colorSlug={row.colorSlug}
                    tipColorSlug={row.tipColorSlug}
                    degrees={0}
                    maxDegrees={row.maxDegrees}
                    size="sm"
                    name={beltLabel(row)}
                  />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontSize: 13.5, fontWeight: 650, color: 'var(--fg-1)' }}>
                      {row.name}
                    </Typography>
                    <Typography sx={{ fontSize: 11.5, color: 'var(--fg-3)' }}>
                      {value.enabled
                        ? [
                            row.ladderKind === 'kids' ? 'Infantil' : null,
                            maxDegreesLabel(row.maxDegrees),
                            `${value.lessonsPerDegree} aulas por grau`,
                          ]
                            .filter(Boolean)
                            .join(' · ')
                        : 'Desativada nesta academia'}
                    </Typography>
                  </Box>
                  {value.enabled ? (
                    <Stack direction="row" spacing="4px" sx={{ alignItems: 'center' }}>
                      <IconButton
                        size="small"
                        aria-label={`Diminuir aulas por grau da faixa ${row.name}`}
                        disabled={value.lessonsPerDegree <= LESSONS_MIN}
                        onClick={() =>
                          patch(row, {
                            lessonsPerDegree: Math.max(
                              LESSONS_MIN,
                              value.lessonsPerDegree - LESSONS_STEP,
                            ),
                          })
                        }
                      >
                        <StepIcon kind="minus" />
                      </IconButton>
                      <Typography
                        sx={{
                          fontSize: 13.5,
                          fontWeight: 700,
                          color: 'var(--fg-1)',
                          minWidth: 28,
                          textAlign: 'center',
                        }}
                        aria-label={`Aulas por grau da faixa ${row.name}`}
                      >
                        {value.lessonsPerDegree}
                      </Typography>
                      <IconButton
                        size="small"
                        aria-label={`Aumentar aulas por grau da faixa ${row.name}`}
                        onClick={() =>
                          patch(row, {
                            lessonsPerDegree: value.lessonsPerDegree + LESSONS_STEP,
                          })
                        }
                      >
                        <StepIcon kind="plus" />
                      </IconButton>
                    </Stack>
                  ) : null}
                  {row.toggleable ? (
                    <Switch
                      size="small"
                      checked={value.enabled}
                      onChange={(event) => patch(row, { enabled: event.target.checked })}
                      slotProps={{
                        input: { 'aria-label': `Habilitar faixa ${row.name}` },
                      }}
                    />
                  ) : null}
                </Stack>
              </Card>
            );
          })}
        </Stack>

        {error ? (
          <Typography
            role="alert"
            sx={{ fontSize: 13, fontWeight: 600, color: 'var(--danger-500)' }}
          >
            {error}
          </Typography>
        ) : null}
      </Stack>

      <Toast open={toast.message !== null} message={toast.message ?? ''} onClose={toast.clear} />
    </Box>
  );
}

export default GraduationRulesPage;
