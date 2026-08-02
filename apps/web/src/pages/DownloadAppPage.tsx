/**
 * "/baixe-o-app" (web-02/04): landing for mobile-only personas (Aluno,
 * Professor, Responsável). Valid credentials never feel broken — explain and
 * point to the stores. Also the post-signup landing for Convite personas.
 */
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useNavigate } from 'react-router';
import { BrandLogo, Card, TatameButton } from '@tatame/design-system';
import { logout, useAuth } from '../auth/auth-store';
import { PhoneCanvas } from '../components/PhoneCanvas';

export function DownloadAppPage() {
  const navigate = useNavigate();
  const { status } = useAuth();

  return (
    <PhoneCanvas>
      <BrandLogo size="md" boxed />
      <Typography
        variant="h3"
        sx={{ fontSize: 26, fontWeight: 700, marginTop: '20px', color: 'var(--fg-1)' }}
      >
        Baixe o app do Tatame
      </Typography>
      <Typography sx={{ fontSize: 14, marginTop: '6px', color: 'var(--fg-3)' }}>
        Sua conta está pronta. O dia a dia da academia — check-in, agenda, graduação e
        pagamentos — acontece no aplicativo.
      </Typography>

      <Stack spacing="12px" sx={{ marginTop: '28px' }}>
        <Card variant="tinted">
          <Typography sx={{ fontSize: 13.5, color: 'var(--fg-2)' }}>
            O painel web é exclusivo para administração da academia e para a equipe da
            plataforma.
          </Typography>
        </Card>
        <TatameButton variant="primary" size="lg" fullWidth label="Baixar na App Store" />
        <TatameButton variant="secondary" size="lg" fullWidth label="Baixar no Google Play" />
        <Box sx={{ display: 'flex', justifyContent: 'center', marginTop: '6px' }}>
          {status === 'authed' ? (
            <TatameButton
              variant="ghost"
              size="sm"
              label="Sair"
              onPress={() => {
                void logout().then(() => navigate('/login', { replace: true }));
              }}
            />
          ) : (
            <TatameButton
              variant="ghost"
              size="sm"
              label="Voltar ao login"
              onPress={() => navigate('/login')}
            />
          )}
        </Box>
      </Stack>
    </PhoneCanvas>
  );
}

export default DownloadAppPage;
