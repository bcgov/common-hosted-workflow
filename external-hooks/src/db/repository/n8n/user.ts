import type { EntityMetadataLike } from './sql';

export type N8nUiUser = {
  id: string;
  email: string;
  role: {
    slug: string;
    displayName: string;
  } | null;
};

export class UserRepository {
  constructor(
    private readonly userRepository: {
      metadata: EntityMetadataLike;
      findOne: (options: { where: { email: string }; relations: string[] }) => Promise<N8nUiUser | null>;
    },
  ) {}

  get metadata() {
    return this.userRepository.metadata;
  }

  async findByEmail(email: string) {
    return await this.userRepository.findOne({ where: { email }, relations: ['role'] });
  }
}
