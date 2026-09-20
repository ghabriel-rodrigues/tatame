/**
 * "Esqueci minha senha" (AUTH.14 stub flow per handoff "Recuperar senha"):
 * email → POST /v1/auth/password/forgot (202 always — no enumeration) →
 * handoff success copy. The reset-link landing itself is the email deep
 * link's web fallback (backend slice); this screen only requests it.
 */
import { useState, type FormEvent } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useNavigate } from 'react-router';
import { BrandLogo, FormField, TatameButton } from '@tatame/design-system';
import { apiClient } from '../api/api';
import { PhoneCanvas } from '../components/PhoneCanvas';

export function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { response } = await apiClient.POST('/v1/auth/password/forgot', {
        body: { email },
      });
      if (response.status === 202) {
        setSent(true);
      } else {
        setError('Informe um email válido.');
      }
    } catch {
      setError('Não foi possível enviar o link. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PhoneCanvas>
      <BrandLogo size="md" boxed />
      <Typography
        variant="h3"
        sx={{
          fontSize: 26,
          fontWeight: 700,
          marginTop: '20px',
          color: 'var(--fg-1)',
        }}
      >
        Recuperar senha
      </Typography>
      <Typography sx={{ fontSize: 14, marginTop: '6px', color: 'var(--fg-3)' }}>
        {sent
          ? 'Enviamos um link de redefinição para o seu email.'
          : 'Informe seu email cadastrado para receber o link de redefinição.'}
      </Typography>

      {sent ? (
        <Stack spacing="12px" sx={{ marginTop: '28px' }}>
          <TatameButton
            variant="primary"
            size="lg"
            fullWidth
            label="Voltar ao login"
            onPress={() => navigate('/login')}
          />
        </Stack>
      ) : (
        <Box component="form" onSubmit={submit} noValidate>
          <Stack spacing="12px" sx={{ marginTop: '28px' }}>
            <FormField
              label="Email"
              type="email"
              name="email"
              placeholder="Email cadastrado"
              autoComplete="email"
              value={email}
              onChangeText={setEmail}
              error={error ?? undefined}
            />
            <Box sx={{ marginTop: '6px' }}>
              <TatameButton
                type="submit"
                variant="primary"
                size="lg"
                fullWidth
                loading={submitting}
                label="Enviar link"
              />
            </Box>
            <TatameButton
              variant="ghost"
              size="sm"
              label="Voltar ao login"
              onPress={() => navigate('/login')}
            />
          </Stack>
        </Box>
      )}
    </PhoneCanvas>
  );
}

export default ForgotPasswordPage;
