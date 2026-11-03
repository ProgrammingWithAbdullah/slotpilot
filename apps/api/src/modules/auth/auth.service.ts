import bcrypt from 'bcryptjs';
import type { LoginInput, SignupInput, UserDto } from '@slotpilot/shared';
import { ConflictError, PG, UnauthorizedError, pgErrorCode } from '../../lib/errors.js';
import { maskEmail, type Logger } from '../../lib/logger.js';
import type { UsersRepository } from './users.repository.js';
import type { TokenService } from './token.service.js';

const BCRYPT_COST = 12;

export function createAuthService(deps: {
  users: UsersRepository;
  tokens: TokenService;
  logger: Logger;
  bcryptCost?: number;
}) {
  const cost = deps.bcryptCost ?? BCRYPT_COST;
  // Compared against when the email doesn't exist, so response time doesn't reveal which emails are registered.
  const dummyHash = bcrypt.hashSync('dummy-password-for-timing', cost);

  return {
    async signup(businessId: string, input: SignupInput): Promise<{ user: UserDto; token: string }> {
      const passwordHash = await bcrypt.hash(input.password, cost);
      try {
        const user = await deps.users.create({
          businessId,
          email: input.email,
          fullName: input.fullName,
          passwordHash,
        });
        deps.logger.info({ userId: user.id, email: maskEmail(user.email) }, 'user signed up');
        return { user, token: deps.tokens.sign({ userId: user.id, businessId }) };
      } catch (err) {
        if (pgErrorCode(err) === PG.UNIQUE_VIOLATION) {
          throw new ConflictError('EMAIL_TAKEN', 'An account with this email already exists');
        }
        throw err;
      }
    },

    async login(businessId: string, input: LoginInput): Promise<{ user: UserDto; token: string }> {
      const found = await deps.users.findCredentials(businessId, input.email);
      const ok = await bcrypt.compare(input.password, found?.passwordHash ?? dummyHash);
      if (!found || !ok) {
        deps.logger.warn({ email: maskEmail(input.email) }, 'failed login');
        // Same message for "no such user" and "wrong password" (no user enumeration).
        throw new UnauthorizedError('INVALID_CREDENTIALS', 'Invalid email or password');
      }
      return { user: found.user, token: deps.tokens.sign({ userId: found.user.id, businessId }) };
    },

    async me(businessId: string, userId: string): Promise<UserDto> {
      const user = await deps.users.findById(businessId, userId);
      // Token is valid but the user was deleted: treat as logged out.
      if (!user) throw new UnauthorizedError();
      return user;
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
