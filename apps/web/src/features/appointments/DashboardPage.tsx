import { CalendarPlus, Clock3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/features/auth/AuthProvider';
import { ChatWidget } from '@/features/chat/ChatWidget';
import { greeting } from '@/lib/format';
import { useBusiness } from '@/lib/useBusiness';
import { AppointmentList } from './AppointmentList';
import { BookingProvider, useOpenBooking } from './BookingContext';
import { useAppointmentsRealtime } from './api';

export function DashboardPage() {
  return (
    <BookingProvider>
      <Dashboard />
    </BookingProvider>
  );
}

function Dashboard() {
  const { user } = useAuth();
  const { data: business } = useBusiness();
  const openBooking = useOpenBooking();
  useAppointmentsRealtime();
  const firstName = user?.fullName.split(' ')[0];

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-start">
      <section aria-labelledby="appointments-heading" className="min-w-0 space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {greeting()}, {firstName}
            </h1>
            {business && (
              <p className="mt-1 flex items-center gap-1.5 text-sm text-fg-muted">
                <Clock3 className="size-4" aria-hidden="true" />
                {business.name} is open {hoursText(business.openDays, business.opensAt, business.closesAt)}
              </p>
            )}
          </div>
          <Button onClick={() => openBooking()}>
            <CalendarPlus className="size-4" aria-hidden="true" /> Book appointment
          </Button>
        </div>

        <Card className="p-4 sm:p-6">
          <Tabs defaultValue="upcoming">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <h2 id="appointments-heading" className="text-lg font-semibold">
                Your appointments
              </h2>
              <TabsList aria-label="Filter appointments">
                <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
                <TabsTrigger value="past">Past</TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="upcoming">
              <AppointmentList scope="upcoming" />
            </TabsContent>
            <TabsContent value="past">
              <AppointmentList scope="past" />
            </TabsContent>
          </Tabs>
        </Card>
      </section>

      <ChatWidget />
    </div>
  );
}

function hoursText(days: number[], opens: string, closes: string): string {
  const names = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const sorted = [...days].sort();
  const range = sorted.length > 1 ? `${names[sorted[0]!]} to ${names[sorted[sorted.length - 1]!]}` : names[sorted[0]!];
  const t = (hm: string) => {
    const [h = 0, m = 0] = hm.split(':').map(Number);
    return `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'AM' : 'PM'}`;
  };
  return `${range}, ${t(opens)} to ${t(closes)}`;
}
