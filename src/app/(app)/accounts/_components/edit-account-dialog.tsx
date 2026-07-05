'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { getProvider } from '@/lib/providers';
import { updateAccount } from '../actions';
import { t } from '@/lib/i18n/he';

type Props = {
  account: {
    id: string;
    displayName: string;
    provider: string;
    type?: 'bank' | 'credit_card';
  };
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function EditAccountDialog({ account, open, onOpenChange }: Props) {
  const provider = getProvider(account.provider);
  const [displayName, setDisplayName] = useState(account.displayName);
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  // Keep credential inputs read-only until focused so the browser's password
  // manager can't autofill them with the user's app login on mount.
  const [credsUnlocked, setCredsUnlocked] = useState(false);

  useEffect(() => {
    if (open) {
      setDisplayName(account.displayName);
      setCredentials({});
      setCredsUnlocked(false);
    }
  }, [open, account.id, account.displayName]);

  async function handleSubmit() {
    setSubmitting(true);
    const hasCredentials =
      credsUnlocked &&
      Object.values(credentials).some((v) => v.trim().length > 0);
    const result = await updateAccount({
      id: account.id,
      displayName,
      ...(hasCredentials ? { credentials } : {}),
    });
    setSubmitting(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(t.accounts.updateSuccess);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t.accounts.editTitle}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 max-h-[60vh] overflow-y-auto pe-1">
          <div className="space-y-2">
            <Label htmlFor="edit-display-name">{t.accounts.displayName}</Label>
            <Input
              id="edit-display-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>

          {provider && provider.fields.length > 0 && (
            <div className="space-y-4 pt-2 border-t border-slate-100">
              <div>
                <p className="font-medium text-sm text-indigo-950">
                  {t.accounts.editCredentialsTitle}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  {t.accounts.editCredentialsNote}
                </p>
              </div>

              {provider.fields.map((field) => (
                <div key={field.key} className="space-y-2">
                  <Label htmlFor={`edit-${field.key}`}>{field.label}</Label>
                  <Input
                    id={`edit-${field.key}`}
                    name={`edit-cred-${field.key}`}
                    type={field.type}
                    value={credentials[field.key] || ''}
                    readOnly={!credsUnlocked}
                    onFocus={() => setCredsUnlocked(true)}
                    onChange={(e) =>
                      setCredentials((prev) => ({
                        ...prev,
                        [field.key]: e.target.value,
                      }))
                    }
                    autoComplete="new-password"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                  />
                </div>
              ))}
            </div>
          )}

          <Button
            onClick={handleSubmit}
            disabled={submitting || !displayName.trim()}
            className="bg-violet-600 text-white hover:bg-violet-700 w-full"
          >
            {submitting ? t.accounts.saving : t.accounts.save}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
