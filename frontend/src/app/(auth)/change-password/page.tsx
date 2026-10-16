'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { changePasswordSchema, ChangePasswordInput } from '@/lib/validations';
import { changePassword } from '@/features/auth/services/authService';
import { useAuthStore } from '@/store/authStore';
import { extractApiErrorMessage } from '@/types/api';
import PasswordInput from '@/components/ui/PasswordInput';
import Button from '@/components/ui/Button';

export default function ChangePasswordPage() {
  const router = useRouter();
  const markPasswordChanged = useAuthStore((s) => s.markPasswordChanged);
  const user = useAuthStore((s) => s.user);
  const [serverError, setServerError] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordInput>({ resolver: zodResolver(changePasswordSchema) });

  const onSubmit = async (data: ChangePasswordInput) => {
    setServerError('');
    try {
      await changePassword({ currentPassword: data.currentPassword, newPassword: data.newPassword });
      markPasswordChanged();
      router.replace('/dashboard');
    } catch (err: unknown) {
      setServerError(extractApiErrorMessage(err, 'Erreur lors du changement de mot de passe.'));
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-md p-8">
        <div className="flex flex-col items-center mb-6">
          <div className="bg-gray-100 rounded-full p-4 mb-4">
            <KeyRound size={32} className="text-gray-700" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Changer le mot de passe</h1>
          {user?.mustChangePassword ? (
            <p className="text-gray-500 text-sm mt-2 text-center">
              Pour des raisons de sécurité, vous devez définir un nouveau mot de passe avant d&apos;accéder à
              l&apos;application.
            </p>
          ) : (
            <p className="text-gray-500 text-sm mt-1">Mettez à jour votre mot de passe</p>
          )}
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <PasswordInput
            id="currentPassword"
            label="Mot de passe actuel"
            placeholder="••••••••"
            autoComplete="current-password"
            error={errors.currentPassword?.message}
            {...register('currentPassword')}
          />
          <PasswordInput
            id="newPassword"
            label="Nouveau mot de passe"
            placeholder="••••••••"
            autoComplete="new-password"
            error={errors.newPassword?.message}
            {...register('newPassword')}
          />
          <PasswordInput
            id="confirmPassword"
            label="Confirmer le nouveau mot de passe"
            placeholder="••••••••"
            autoComplete="new-password"
            error={errors.confirmPassword?.message}
            {...register('confirmPassword')}
          />

          {serverError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {serverError}
            </p>
          )}

          <Button type="submit" size="lg" loading={isSubmitting} className="w-full mt-2">
            Mettre à jour le mot de passe
          </Button>
        </form>
      </div>
    </div>
  );
}
