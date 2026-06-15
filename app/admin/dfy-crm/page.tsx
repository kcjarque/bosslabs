import { redirect } from 'next/navigation';

// Consolidated into the tabbed CRM (/admin/crm). Kept as a redirect so existing
// links/bookmarks still land on the DFY board.
export default function DfyCrmRedirect() {
  redirect('/admin/crm?board=dfy');
}
