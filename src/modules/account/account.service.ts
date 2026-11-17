import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../shared/clock/clock.js';
import { PersonalDataRegistry } from '../../shared/personal-data/personal-data.registry.js';
import { PrismaService } from '../../shared/prisma/prisma.service.js';
import {
  AccountSecurityService,
  type StepUpProof,
} from '../auth/account-security.service.js';
import type { AuthUser } from '../auth/auth.types.js';

export const EXPORT_FORMAT = 'steam-society-export/v1';

export interface AccountExport {
  format: typeof EXPORT_FORMAT;
  exportedAt: Date;
  userId: string;
  sections: Record<string, unknown>;
}

/**
 * Data rights (F2): download everything the platform stores about you, and
 * delete the account. Each module exports and erases its own data through the
 * PersonalDataRegistry. Retention is provisional until DA-04.
 */
@Injectable()
export class AccountService {
  constructor(
    private readonly registry: PersonalDataRegistry,
    private readonly prisma: PrismaService,
    private readonly accountSecurity: AccountSecurityService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async exportData(user: AuthUser): Promise<AccountExport> {
    const contributors = this.registry.list();
    const sections = await Promise.all(
      contributors.map(
        async (c) => [c.section, await c.exportFor(user.id)] as const,
      ),
    );
    return {
      format: EXPORT_FORMAT,
      exportedAt: this.clock.now(),
      userId: user.id,
      sections: Object.fromEntries(sections),
    };
  }

  /** Re-authenticates, checks every module allows it, then erases in one transaction. */
  async deleteAccount(user: AuthUser, proof: StepUpProof): Promise<void> {
    await this.accountSecurity.assertStepUp(user, proof);
    const now = this.clock.now();
    const contributors = this.registry.list();
    for (const contributor of contributors) {
      await contributor.assertErasable?.(user.id, now);
    }
    await this.prisma.$transaction(async (tx) => {
      // One deletion at a time per account. NO KEY UPDATE (not UPDATE) so a
      // booking insert, whose foreign key takes KEY SHARE on this row, cannot
      // deadlock with us; bookings are serialised by their own locks, which
      // the bookings contributor takes and re-checks inside this transaction.
      await tx.$queryRaw`SELECT 1 FROM "user" WHERE "id" = ${user.id}::uuid FOR NO KEY UPDATE`;
      for (const contributor of contributors) {
        await contributor.erase(tx, user.id, now);
      }
    });
  }
}
