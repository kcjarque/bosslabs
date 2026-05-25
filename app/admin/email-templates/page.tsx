import { redirect } from 'next/navigation';

// Legacy route — Email templates moved under the unified Templates page.
// Keep this file so existing bookmarks + old nav links land on the right
// tab instead of a 404.
export default function EmailTemplatesRedirect() {
  redirect('/admin/templates?tab=email');
}
