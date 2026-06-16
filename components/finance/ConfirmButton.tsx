'use client';

/**
 * Submit button that asks for confirmation before letting its parent <form>
 * (a server action) submit. Used for finance deletes — keeps the pages fully
 * server-rendered while still guarding destructive clicks.
 */
export function ConfirmButton({
  message = 'Are you sure?',
  className,
  children,
}: {
  message?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
