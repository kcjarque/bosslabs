import { requireAdmin } from '@/lib/admin-auth';
import { getEvents } from '@/lib/db';
import { PageHeader } from '@/components/admin/PageHeader';
import { AttendanceImporter } from '@/components/admin/AttendanceImporter';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Attendance · BOSSLABS AI' };

export default async function AttendancePage() {
  requireAdmin();
  const events = await getEvents();
  return (
    <div>
      <PageHeader
        title="Attendance"
        subtitle="After each webinar, import the Zoom participant CSV — it matches by email and marks who attended. This is what splits the post-webinar emails into the attended vs. no-show tracks."
      />
      <AttendanceImporter events={events.map((e) => ({ id: e.id, name: e.name }))} />
    </div>
  );
}
