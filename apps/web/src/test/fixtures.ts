import type {
  AppointmentDto,
  BusinessDto,
  ChatMessageDto,
  ChatSessionDto,
  ServiceDto,
  UserDto,
} from '@slotpilot/shared';

export const business: BusinessDto = {
  id: 'b1',
  name: 'Bright Smile Dental',
  slug: 'bright-smile-dental',
  timezone: 'Asia/Karachi',
  opensAt: '09:00',
  closesAt: '17:00',
  openDays: [1, 2, 3, 4, 5, 6, 7],
  slotIntervalMinutes: 30,
};

export const user: UserDto = {
  id: 'u1',
  email: 'demo@slotpilot.dev',
  fullName: 'Demo Customer',
  role: 'customer',
  createdAt: '2026-01-01T00:00:00Z',
};

export const services: ServiceDto[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Checkup',
    description: null,
    durationMinutes: 30,
    priceCents: 3000,
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Cleaning',
    description: null,
    durationMinutes: 45,
    priceCents: 5000,
  },
];

export const session: ChatSessionDto = {
  id: '33333333-3333-4333-8333-333333333333',
  title: null,
  state: 'collecting',
  draft: {},
  replyPending: false,
  lastMessageAt: '2026-11-03T04:00:00Z',
  createdAt: '2026-11-03T04:00:00Z',
};

export const welcome: ChatMessageDto = {
  id: 1,
  sessionId: session.id,
  role: 'assistant',
  content: "Hi! I'm the booking assistant.",
  metadata: { suggestions: ['What services do you offer?'] },
  createdAt: '2026-11-03T04:00:00Z',
};

export const appointment: AppointmentDto = {
  id: '44444444-4444-4444-8444-444444444444',
  service: { id: services[1]!.id, name: 'Cleaning', durationMinutes: 45 },
  startsAt: '2030-01-08T10:00:00.000Z',
  endsAt: '2030-01-08T10:45:00.000Z',
  status: 'confirmed',
  source: 'chat',
  notes: null,
  createdAt: '2026-11-03T04:00:00Z',
  cancelledAt: null,
};
