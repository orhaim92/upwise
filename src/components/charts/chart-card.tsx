import { type ReactNode } from 'react';
import { Card } from '@/components/ui/card';

type Props = {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function ChartCard({ title, subtitle, action, children, className }: Props) {
  return (
    <Card className={`p-5 ${className ?? ''}`}>
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="min-w-0">
          <h3 className="font-semibold">{title}</h3>
          {subtitle && (
            <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      <div className="text-sm">{children}</div>
    </Card>
  );
}
