import { redirect } from 'next/navigation';
import { isAdminLoggedIn } from '@/lib/admin-auth';
import { LoginForm } from '@/components/LoginForm';

export const metadata = { title: 'Sign in · BOSSLABS Admin' };

export default function AdminLoginPage() {
  if (isAdminLoggedIn()) redirect('/admin');
  return (
    <div className="mx-auto flex min-h-[80vh] max-w-md flex-col justify-center px-4 py-10">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          BOSSLABS Admin
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Enter the admin password to manage signups, templates, and tokens.
        </p>
      </div>
      <div className="card">
        <LoginForm />
      </div>
    </div>
  );
}
