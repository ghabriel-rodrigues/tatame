/**
 * Relatórios (REP.9, admin-18) — back-arrow header "Relatórios / Exporte em
 * CSV ou PDF", month picker (current month default) and the five report rows
 * with the spec's exact subtitles. CSV = authenticated blob download through
 * the shared client (server filename); PDF = the print-friendly view in a
 * new tab (print-to-PDF is the delivery — a real PDF lib is recorded debt).
 * Admin-gated by the surface guard; the API refuses every other role.
 */
import { useState } from 'react';
import Box from '@mui/material/Box';
import MenuItem from '@mui/material/MenuItem';
import Select, { type SelectChangeEvent } from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useNavigate } from 'react-router';
import type { AdminReportSlug } from '@tatame/shared';
import { Card, ScreenHeader, TatameButton } from '@tatame/design-system';
import { apiClient } from '../../api/api';
import {
  REPORT_ROWS,
  currentPeriod,
  downloadReportCsv,
  monthOptions,
  reportPrintUrl,
  type ReportRowSpec,
} from './reports-format';

function ReportRow({
  row,
  month,
  downloading,
  onCsv,
  onPdf,
}: {
  row: ReportRowSpec;
  month: string;
  downloading: boolean;
  onCsv: () => void;
  onPdf: () => void;
}) {
  return (
    <Card padding={14}>
      <Stack
        component="section"
        aria-label={row.title}
        direction="row"
        spacing="12px"
        sx={{ alignItems: 'center' }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            sx={{ fontSize: 14, fontWeight: 700, color: 'var(--fg-1)' }}
          >
            {row.title}
          </Typography>
          <Typography
            sx={{ fontSize: 12, fontWeight: 600, color: 'var(--fg-3)' }}
          >
            {row.subtitle(month)}
          </Typography>
        </Box>
        <TatameButton
          variant="secondary"
          size="sm"
          label="CSV"
          loading={downloading}
          onPress={onCsv}
        />
        <TatameButton variant="primary" size="sm" label="PDF" onPress={onPdf} />
      </Stack>
    </Card>
  );
}

export function RelatoriosPage() {
  const navigate = useNavigate();
  const [month, setMonth] = useState(currentPeriod());
  const [downloading, setDownloading] = useState<AdminReportSlug | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const options = monthOptions();

  function exportCsv(row: ReportRowSpec): void {
    setDownloading(row.slug);
    setDownloadError(null);
    void downloadReportCsv(apiClient, row.slug, month)
      .catch(() => {
        setDownloadError(
          `Não foi possível exportar ${row.title}. Tente novamente.`,
        );
      })
      .finally(() => setDownloading(null));
  }

  return (
    <Box sx={{ maxWidth: 560, margin: '0 auto' }}>
      <Stack spacing="16px">
        <ScreenHeader
          title="Relatórios"
          subtitle="Exporte em CSV ou PDF"
          onBack={() => navigate('/admin')}
          trailing={
            <Select
              size="small"
              value={month}
              inputProps={{ 'aria-label': 'Mês' }}
              onChange={(event: SelectChangeEvent) =>
                setMonth(event.target.value)
              }
              sx={{ minWidth: 160, background: 'var(--bg-surface)' }}
            >
              {options.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </Select>
          }
        />

        {downloadError ? (
          <Typography
            role="alert"
            sx={{ fontSize: 13, fontWeight: 600, color: 'var(--danger-500)' }}
          >
            {downloadError}
          </Typography>
        ) : null}

        {REPORT_ROWS.map((row) => (
          <ReportRow
            key={row.slug}
            row={row}
            month={month}
            downloading={downloading === row.slug}
            onCsv={() => exportCsv(row)}
            onPdf={() => {
              window.open(
                reportPrintUrl(row.slug, month),
                '_blank',
                'noopener',
              );
            }}
          />
        ))}
      </Stack>
    </Box>
  );
}

export default RelatoriosPage;
