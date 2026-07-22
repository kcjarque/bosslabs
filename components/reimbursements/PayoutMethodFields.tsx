'use client';

import { useState } from 'react';

type Settings = {
  payoutMethod: 'bank' | 'gcash' | null;
  bankName: string;
  bankAccountName: string;
  bankAccountNumber: string;
  gcashName: string;
  gcashNumber: string;
};

/** Payout method selector that only renders the fields for whichever method
 *  is picked — submitting with the other method's fields absent clears any
 *  stale values it had on file (see updatePayoutSettingsAction). */
export function PayoutMethodFields({ settings }: { settings: Settings }) {
  const [method, setMethod] = useState<'bank' | 'gcash'>(settings.payoutMethod ?? 'gcash');

  return (
    <>
      <div>
        <label className="label">How should we pay you?</label>
        <select
          name="payoutMethod"
          className="select"
          value={method}
          onChange={(e) => setMethod(e.target.value as 'bank' | 'gcash')}
        >
          <option value="gcash">GCash</option>
          <option value="bank">Bank transfer</option>
        </select>
      </div>

      {method === 'gcash' ? (
        <>
          <div>
            <label className="label">Name on GCash</label>
            <input name="gcashName" defaultValue={settings.gcashName} required className="input" />
          </div>
          <div>
            <label className="label">GCash number</label>
            <input name="gcashNumber" defaultValue={settings.gcashNumber} required placeholder="09XXXXXXXXX" className="input" />
          </div>
        </>
      ) : (
        <>
          <div>
            <label className="label">Bank name</label>
            <input name="bankName" defaultValue={settings.bankName} required placeholder="e.g. BDO" className="input" />
          </div>
          <div>
            <label className="label">Account name</label>
            <input name="bankAccountName" defaultValue={settings.bankAccountName} required className="input" />
          </div>
          <div>
            <label className="label">Account number</label>
            <input name="bankAccountNumber" defaultValue={settings.bankAccountNumber} required className="input" />
          </div>
        </>
      )}
    </>
  );
}
