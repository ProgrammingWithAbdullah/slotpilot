import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { signupInputSchema, type SignupInput } from '@slotpilot/shared';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { isApiError } from '@/lib/api';
import { useAuth } from './AuthProvider';
import { AuthLayout } from './AuthLayout';

export function SignupPage() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<SignupInput>({
    resolver: zodResolver(signupInputSchema),
    defaultValues: { fullName: '', email: '', password: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await signup(values);
      navigate('/', { replace: true });
    } catch (err) {
      if (isApiError(err, 'EMAIL_TAKEN')) {
        setError('email', { message: 'An account with this email already exists. Try logging in.' });
      } else if (isApiError(err, 'VALIDATION_ERROR')) {
        for (const [field, messages] of Object.entries(err.fieldErrors)) {
          setError(field as keyof SignupInput, { message: messages[0] });
        }
      } else {
        setFormError(isApiError(err) ? err.message : 'Something went wrong. Please try again.');
      }
    }
  });

  return (
    <AuthLayout title="Create your account" subtitle="It takes less than a minute.">
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {formError && <Alert>{formError}</Alert>}
        <Field label="Full name" error={errors.fullName?.message}>
          {(p) => <Input {...p} autoComplete="name" autoFocus {...register('fullName')} />}
        </Field>
        <Field label="Email" error={errors.email?.message}>
          {(p) => <Input {...p} type="email" autoComplete="email" {...register('email')} />}
        </Field>
        <Field label="Password" error={errors.password?.message} hint="At least 8 characters.">
          {(p) => <Input {...p} type="password" autoComplete="new-password" {...register('password')} />}
        </Field>
        <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
          Create account
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-fg-muted">
        Already have an account?{' '}
        <Link to="/login" className="font-medium text-primary hover:underline">
          Log in
        </Link>
      </p>
    </AuthLayout>
  );
}
