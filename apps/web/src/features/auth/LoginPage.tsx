import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginInputSchema, type LoginInput } from '@slotpilot/shared';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { isApiError } from '@/lib/api';
import { useAuth } from './AuthProvider';
import { AuthLayout } from './AuthLayout';
import { safeNext } from './RequireAuth';

export const DEMO_CREDENTIALS = { email: 'demo@slotpilot.dev', password: 'Password123!' };

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginInputSchema), defaultValues: { email: '', password: '' } });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await login(values);
      navigate(safeNext(params.get('next')), { replace: true });
    } catch (err) {
      setFormError(isApiError(err) ? err.message : 'Something went wrong. Please try again.');
    }
  });

  return (
    <AuthLayout title="Welcome back" subtitle="Log in to manage your appointments.">
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {formError && <Alert>{formError}</Alert>}
        <Field label="Email" error={errors.email?.message}>
          {(p) => <Input {...p} type="email" autoComplete="email" autoFocus {...register('email')} />}
        </Field>
        <Field label="Password" error={errors.password?.message}>
          {(p) => <Input {...p} type="password" autoComplete="current-password" {...register('password')} />}
        </Field>
        <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
          Log in
        </Button>
      </form>

      <div className="mt-6 rounded-lg border border-dashed border-border p-3 text-sm text-fg-muted">
        Reviewing the demo?{' '}
        <Button
          variant="link"
          className="text-sm"
          onClick={() => {
            setValue('email', DEMO_CREDENTIALS.email);
            setValue('password', DEMO_CREDENTIALS.password);
          }}
        >
          Fill in the demo account
        </Button>
      </div>

      <p className="mt-6 text-center text-sm text-fg-muted">
        New here?{' '}
        <Link to="/signup" className="font-medium text-primary hover:underline">
          Create an account
        </Link>
      </p>
    </AuthLayout>
  );
}
