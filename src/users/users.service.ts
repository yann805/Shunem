import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';

/** User profile management (SRS §42). Private owner contact info is never
 *  exposed to seekers (SRS §83). */
@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { seeker: true, owner: true },
    });
    if (!user) throw new NotFoundException('User not found');
    // Never return secrets/tokens.
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      display_name: user.displayName,
      photo_url: user.photoUrl,
      phone: user.phone,
      city: user.city,
      language: user.language,
      permissions: user.role === 'super_admin' ? ['*'] : user.permissions,
      seeker: user.seeker,
      owner: user.owner,
    };
  }

  async updateProfile(userId: string, dto: { display_name?: string; phone?: string; city?: string; language?: string }) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.display_name != null && { displayName: dto.display_name }),
        ...(dto.phone != null && { phone: dto.phone }),
        ...(dto.city != null && { city: dto.city }),
        ...(dto.language != null && { language: dto.language }),
      },
    });
  }

  /** Admin/Super Admin: list users (SRS §44, §46). */
  async list(page = 1, pageSize = 20) {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        select: { id: true, email: true, role: true, displayName: true, city: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.user.count(),
    ]);
    return { items, total, page, page_size: pageSize, has_next: page * pageSize < total };
  }
}
