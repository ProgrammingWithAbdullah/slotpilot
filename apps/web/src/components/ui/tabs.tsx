import * as T from '@radix-ui/react-tabs';
import { cn } from '@/lib/cn';

export const Tabs = T.Root;
export const TabsContent = T.Content;

export function TabsList({ className, ...props }: T.TabsListProps) {
  return <T.List className={cn('inline-flex rounded-lg bg-surface-muted p-1', className)} {...props} />;
}

export function TabsTrigger({ className, ...props }: T.TabsTriggerProps) {
  return (
    <T.Trigger
      className={cn(
        'rounded-md px-3 py-1.5 text-sm font-medium text-fg-muted transition-colors hover:text-fg data-[state=active]:bg-surface data-[state=active]:text-fg data-[state=active]:shadow-sm cursor-pointer',
        className,
      )}
      {...props}
    />
  );
}
