/**
 * FormField — P0 primitive (ds-05). Label + input + helper/error in one
 * block; wraps the themed MuiOutlinedInput (radius 14, `--focus-ring` focus,
 * border-1 -> border-2 hover from `createTatameTheme`).
 *
 * Anatomy: [root: column] > [label 13/600] [input (outlined, radius-md)]
 *          [helper|error 12px]
 * Variants: default | error (danger-500 text + outline)
 * States: default / hover / focus (ring) / disabled / error
 * Extras: `type="password"` renders the visibility toggle (ds-05 anatomy).
 * Tokens: radius.md, border-1/2/strong, focus.ring, danger-500, text 15px.
 *
 * Cross-platform prop vocabulary: `label`, `value`, `onChangeText`,
 * `placeholder`, `type`, `error`, `helperText`, `disabled`, `required`.
 */

import { useId, useState } from 'react';
import FormControl from '@mui/material/FormControl';
import FormHelperText from '@mui/material/FormHelperText';
import FormLabel from '@mui/material/FormLabel';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import OutlinedInput from '@mui/material/OutlinedInput';
import { styled } from '@mui/material/styles';

export type FormFieldType = 'text' | 'email' | 'password' | 'tel' | 'number' | 'date' | 'time';

export interface FormFieldProps {
  label: string;
  value?: string;
  /** Platform-neutral change handler — receives the raw string. */
  onChangeText?: (value: string) => void;
  placeholder?: string;
  type?: FormFieldType;
  /** Error message; presence switches the field to the error state. */
  error?: string;
  helperText?: string;
  disabled?: boolean;
  required?: boolean;
  name?: string;
  autoComplete?: string;
  className?: string;
}

const Root = styled(FormControl)(({ theme }) => {
  const v = theme.vars ?? theme;
  return {
    display: 'flex',
    gap: 6,
    '& .FormField-label': {
      fontSize: '13px',
      fontWeight: 600,
      color: v.palette.text.secondary,
      '&.Mui-focused': { color: v.palette.primary.main },
    },
  };
});

const EyeIcon = ({ off }: { off: boolean }) => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
    {off ? <line x1="3" y1="3" x2="21" y2="21" /> : null}
  </svg>
);

export function FormField({
  label,
  value,
  onChangeText,
  placeholder,
  type = 'text',
  error,
  helperText,
  disabled = false,
  required = false,
  name,
  autoComplete,
  className,
}: FormFieldProps) {
  const id = useId();
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === 'password';
  const inputType = isPassword && showPassword ? 'text' : type;
  const message = error ?? helperText;
  const classes = ['FormField-root', error ? 'FormField-error' : null, className]
    .filter(Boolean)
    .join(' ');

  return (
    <Root
      className={classes}
      error={Boolean(error)}
      disabled={disabled}
      required={required}
      fullWidth
      variant="outlined"
    >
      <FormLabel className="FormField-label" htmlFor={id}>
        {label}
      </FormLabel>
      <OutlinedInput
        id={id}
        name={name}
        type={inputType}
        value={value}
        onChange={(event) => onChangeText?.(event.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        endAdornment={
          isPassword ? (
            <InputAdornment position="end">
              <IconButton
                aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                onClick={() => setShowPassword((s) => !s)}
                edge="end"
                size="small"
              >
                <EyeIcon off={showPassword} />
              </IconButton>
            </InputAdornment>
          ) : undefined
        }
      />
      {message ? (
        <FormHelperText className="FormField-message">{message}</FormHelperText>
      ) : null}
    </Root>
  );
}

export default FormField;
