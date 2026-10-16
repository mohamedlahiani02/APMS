'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { LogIn, Wrench } from 'lucide-react';
import { InstallAppButton } from '@/components/pwa/PwaProvider';
import { loginSchema, LoginInput } from '@/lib/validations';
import { login as loginRequest } from '@/features/auth/services/authService';
import { useAuthStore } from '@/store/authStore';
import { isApiError } from '@/types/api';
import Input from '@/components/ui/Input';
import PasswordInput from '@/components/ui/PasswordInput';
import Button from '@/components/ui/Button';

export default function LoginPage() {
  const setSession = useAuthStore((s) => s.setSession);
  const router = useRouter();
  const [serverError, setServerError] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  const onSubmit = async (data: LoginInput) => {
    setServerError('');
    try {
      const response = await loginRequest({ email: data.email, password: data.password });
      setSession(response);
      router.replace(response.user.mustChangePassword ? '/change-password' : response.user.role === 'ADMIN' ? '/dashboard' : '/transactions');
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      const data = (err as { response?: { data?: unknown } })?.response?.data;
      if (status === 429) {
        setServerError('Trop de tentatives. Veuillez réessayer dans une minute.');
        return;
      }
      if (isApiError(data)) {
        setServerError(data.message);
        return;
      }
      setServerError('Erreur de connexion. Veuillez réessayer.');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-md p-8">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-full bg-gray-900 flex items-center justify-center mb-4">
            <Wrench size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">APMS</h1>
          <p className="text-gray-500 text-sm mt-1">Connectez-vous pour accéder au système</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <Input
            id="email"
            label="Email"
            type="email"
            placeholder="votre@email.com"
            autoComplete="email"
            error={errors.email?.message}
            {...register('email')}
          />
          <PasswordInput
            id="password"
            label="Mot de passe"
            placeholder="••••••••"
            autoComplete="current-password"
            error={errors.password?.message}
            {...register('password')}
          />

          {serverError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {serverError}
            </p>
          )}

          <Button type="submit" size="lg" loading={isSubmitting} className="w-full mt-2">
            <LogIn size={18} />
            Se connecter
          </Button>
        </form>
        <div className="mt-4 flex justify-center"><InstallAppButton /></div>
      </div>
    </div>
  );
}
