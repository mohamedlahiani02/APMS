import { redirect } from 'next/navigation';

export default function Home() {
  // AuthGate (mounted in Providers, above every route) decides the real
  // destination: /login if there is no valid session, /change-password if
  // the user must rotate their password, /dashboard otherwise.
  redirect('/dashboard');
}
