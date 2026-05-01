'use client';

import { useState } from 'react';
import { Plus, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PROVIDERS, getProvider } from '@/lib/providers';
import { addAccount } from '../actions';
import { t } from '@/lib/i18n/he';

export function AddAccountDialog() {
  const [open, setOpen] = useState(false);
  const [providerId, setProviderId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const provider = getProvider(providerId);

  function reset() {
    setProviderId('');
    setDisplayName('');
    setCredentials({});
  }

  async function handleSubmit() {
    if (!provider) return;
    setSubmitting(true);
    const result = await addAccount({
      providerId,
      displayName: displayName.trim() || provider.name,
      credentials,
    });
    setSubmitting(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(t.accounts.addSuccess);
    setOpen(false);
    reset();
  }

  return (
    <>
      <Button
        size="lg"
        onClick={() => setOpen(true)}
        className="bg-violet-600 text-white hover:bg-violet-700"
      >
        <Plus className="size-4" />
        {t.accounts.add}
      </Button>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) reset();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.accounts.addTitle}</DialogTitle>
            <DialogDescription>{t.accounts.addDescription}</DialogDescription>
          </DialogHeader>

          <div className="flex gap-3 p-3 bg-violet-50 rounded-lg text-sm">
            <ShieldCheck className="size-5 text-violet-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-indigo-950">
                {t.accounts.trustTitle}
              </p>
              <p className="text-xs text-slate-600 mt-1">
                {t.accounts.trustBody}
              </p>
            </div>
          </div>

          <div className="space-y-4 max-h-[60vh] overflow-y-auto pe-1">
            <div className="space-y-2">
              <Label>{t.accounts.provider}</Label>
              <Select
                value={providerId}
                onValueChange={(value) => setProviderId(value ?? '')}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t.accounts.providerPlaceholder} />
                </SelectTrigger>
                <SelectContent>
                  {PROVIDERS.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {provider && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="add-display-name">
                    {t.accounts.displayName}
                  </Label>
                  <Input
                    id="add-display-name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder={t.accounts.displayNamePlaceholder}
                  />
                </div>

                {provider.fields.map((field) => (
                  <div key={field.key} className="space-y-2">
                    <Label htmlFor={`add-${field.key}`}>{field.label}</Label>
                    <Input
                      id={`add-${field.key}`}
                      type={field.type}
                      value={credentials[field.key] || ''}
                      onChange={(e) =>
                        setCredentials((prev) => ({
                          ...prev,
                          [field.key]: e.target.value,
                        }))
                      }
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck={false}
                    />
                  </div>
                ))}
              </>
            )}
          </div>

          <Button
            onClick={handleSubmit}
            disabled={!provider || submitting}
            className="bg-violet-600 text-white hover:bg-violet-700"
          >
            {submitting ? t.accounts.saving : t.accounts.save}
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
