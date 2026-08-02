/**
 * Design-system integration placeholder (DS.5/DS.6). Proves the theme + P0
 * components render in the web shell with the login screens' visual
 * language. The REAL login screen is AUTH.12 — do not grow this into it.
 */

import { useState } from 'react';
import Stack from '@mui/material/Stack';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import {
  BrandLogo,
  Card,
  FormField,
  ScreenHeader,
  TatameButton,
  Toast,
} from '@tatame/design-system';

export function App() {
  const [toastOpen, setToastOpen] = useState(false);

  return (
    <Box
      sx={{
        minHeight: '100vh',
        // Login screens' canvas: purple-50 wash fading into the app bg.
        background: 'linear-gradient(180deg, var(--purple-50) 0%, var(--bg-app) 40%)',
        display: 'flex',
        justifyContent: 'center',
        padding: '64px 24px',
      }}
    >
      <Stack spacing={3} sx={{ width: '100%', maxWidth: 420 }}>
        <BrandLogo size="md" />
        <ScreenHeader
          eyebrow="Design system"
          title="Bem-vindo ao Tatame"
          subtitle="Fundação Lumira integrada ao shell web."
        />

        <Card variant="surface">
          <Stack spacing={2}>
            <FormField label="Email" type="email" placeholder="voce@academia.com" />
            <FormField label="Senha" type="password" placeholder="Sua senha" />
            <TatameButton
              variant="primary"
              size="lg"
              fullWidth
              label="Entrar"
              onPress={() => setToastOpen(true)}
            />
            <Stack direction="row" spacing={1}>
              <TatameButton variant="secondary" label="Criar conta" />
              <TatameButton variant="ghost" label="Esqueci minha senha" />
            </Stack>
          </Stack>
        </Card>

        <Card variant="tinted">
          <Typography variant="body2">
            Novo na academia? Peça ao seu professor o <strong>link de convite</strong> — seu
            cadastro já entra vinculado à turma certa.
          </Typography>
        </Card>

        <Card variant="hero">
          <Typography variant="overline" sx={{ color: 'inherit', opacity: 0.8 }}>
            Próxima etapa
          </Typography>
          <Typography variant="h2" sx={{ marginTop: '4px' }}>
            AUTH.12 — telas de login
          </Typography>
        </Card>

        <Toast
          open={toastOpen}
          message="Tema Lumira aplicado"
          onClose={() => setToastOpen(false)}
        />
      </Stack>
    </Box>
  );
}

export default App;
