/**
 * Phone-shaped canvas (web-02 ruling): the public flows (login, esqueci-senha,
 * convite, baixe-o-app) ARE phone-framed designs — render them as a centered,
 * max-width phone canvas on desktop, full-bleed on small screens. The inner
 * gradient (purple-50 → bg-app at 40%) is the handoff login backdrop.
 */
import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import { Card } from '@tatame/design-system';

export interface PhoneCanvasProps {
  children?: ReactNode;
}

export function PhoneCanvas({ children }: PhoneCanvasProps) {
  return (
    <Box
      sx={{
        minHeight: '100vh',
        background: 'var(--bg-app)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        padding: { xs: 0, sm: '40px 24px' },
      }}
    >
      <Box sx={{ width: '100%', maxWidth: { xs: '100%', sm: 440 } }}>
        <Card padding={0} className="PhoneCanvas-card">
          <Box
            sx={{
              minHeight: { xs: '100vh', sm: 780 },
              background:
                'linear-gradient(180deg, var(--purple-50) 0%, var(--bg-app) 40%)',
              padding: '96px 28px 40px',
              boxSizing: 'border-box',
            }}
          >
            {children}
          </Box>
        </Card>
      </Box>
    </Box>
  );
}

export default PhoneCanvas;
