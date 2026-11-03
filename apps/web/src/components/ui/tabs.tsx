import * as T from '@radix-ui/react-tabs';
import { cn } from '@/lib/cn';

export const Tabs = T.Root;
export const TabsContent = T.Content;

export function TabsList({ className, ...props }: T.TabsListProps) {
  return <T.List className={cn('inline-flex rounded-[10px] bg-surface-muted p-1', className)} {...props} />;
}

export function TabsTrigger({ className, ...props }: T.TabsTriggerProps) {
  return (
    <T.Trigger
      className={cn(
        'rounded-md px-3.5 py-1.5 text-sm font-medium text-fg-muted transition-[color,background-color,box-shadow] duration-200 ease-out hover:text-fg data-[state=active]:bg-surface dark:data-[state=active]:bg-border data-[state=active]:text-fg data-[state=active]:shadow-[var(--shadow-card)] cursor-pointer',
        className,
      )}
      {...props}
    />
  );
}
