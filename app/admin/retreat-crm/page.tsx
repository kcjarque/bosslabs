import { redirect } from 'next/navigation';

// Consolidated into the tabbed CRM (/admin/crm). Kept as a redirect so existing
// links/bookmarks still land on the Retreat board.
export default function RetreatCrmRedirect() {
  redirect('/admin/crm?board=retreat');
}
