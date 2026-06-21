'use client';

import { useState } from 'react';
import { suggestEmailCorrection } from '@/lib/email-typo';

/**
 * Email input with a live "did you mean?" typo hint. Catches mistyped addresses
 * (gmial.com, gmail.con, yaho.com, …) at the form so they never enter the list
 * and hard-bounce. The hint is a one-tap suggestion and NEVER blocks submit, so
 * an unusual-but-real address always goes through. Drop-in for a plain
 * <div><label/><input name="email"/></div> field.
 */
export function EmailFieldWithHint({
  id = 'email',
  name = 'email',
  label = 'Email',
  placeholder = 'you@business.com',
  required = true,
  defaultValue = '',
  tone = 'light',
}: {
  id?: string;
  name?: string;
  label?: string;
  placeholder?: string;
  required?: boolean;
  defaultValue?: string;
  tone?: 'light' | 'dark';
}) {
  const [value, setValue] = useState(defaultValue);
  const [suggestion, setSuggestion] = useState<string | null>(null);

  const linkCls =
    tone === 'dark'
      ? 'text-cyan-300 hover:text-cyan-200'
      : 'text-cyan-700 hover:text-cyan-800';
  const muteCls = tone === 'dark' ? 'text-ink-300' : 'text-slate-400';

  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        name={name}
        type="email"
        required={required}
        autoComplete="email"
        className="input"
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          if (suggestion) setSuggestion(null);
        }}
        onBlur={(e) => setSuggestion(suggestEmailCorrection(e.target.value))}
      />
      {suggestion && (
        <button
          type="button"
          onClick={() => {
            setValue(suggestion);
            setSuggestion(null);
          }}
          className={`mt-1.5 block text-left text-[13px] ${linkCls}`}
        >
          Did you mean <strong>{suggestion}</strong>? <span className={muteCls}>Tap to fix</span>
        </button>
      )}
    </div>
  );
}
