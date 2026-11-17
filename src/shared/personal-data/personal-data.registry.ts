import { Global, Injectable, Module } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';

/**
 * A module that holds personal data about users (F2: export and deletion).
 * Each module describes ITS OWN data, so the account module never has to know
 * other modules' tables (golden principle 6). Retention rules are provisional
 * until DA-04 is decided (docs/07-DECISIONS.md).
 */
export interface PersonalDataContributor {
  /** Key of this module's section in the export file. */
  readonly section: string;
  /** Lower runs first when erasing; the account itself (auth) goes last. */
  readonly eraseOrder: number;
  /** Everything this module stores about the user, as plain JSON. */
  exportFor(userId: string): Promise<unknown>;
  /** Throws an HttpException when the account cannot be deleted yet. */
  assertErasable?(userId: string, now: Date): Promise<void>;
  /** Deletes or anonymises this module's data, inside the given transaction. */
  erase(tx: Prisma.TransactionClient, userId: string, now: Date): Promise<void>;
}

/** Modules register their contributor on init; the account module reads them. */
@Injectable()
export class PersonalDataRegistry {
  private readonly contributors: PersonalDataContributor[] = [];

  register(contributor: PersonalDataContributor): void {
    if (this.contributors.some((c) => c.section === contributor.section)) {
      throw new Error(
        `Personal data section registered twice: ${contributor.section}`,
      );
    }
    this.contributors.push(contributor);
  }

  list(): readonly PersonalDataContributor[] {
    return [...this.contributors].sort((a, b) => a.eraseOrder - b.eraseOrder);
  }
}

@Global()
@Module({ providers: [PersonalDataRegistry], exports: [PersonalDataRegistry] })
export class PersonalDataModule {}
