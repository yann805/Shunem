import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { Paginated, paginate } from '../common/dto/pagination.dto';
import { PropertyQueryDto, CreatePropertyDto } from './dto/property.dto';

const ADMIN_ROLES = new Set(['admin', 'super_admin']);

@Injectable()
export class PropertiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ---- Search (SRS §25, §92 — server-side filtering & sorting) ----
  async search(q: PropertyQueryDto, user?: { role: string }): Promise<Paginated<unknown>> {
    const page = q.page ?? 1;
    const pageSize = q.page_size ?? 20;

    const where: Prisma.PropertyWhereInput = {};
    // Public users only see published/available inventory (SRS §99).
    if (!user || !ADMIN_ROLES.has(user.role)) {
      where.status = { in: ['published', 'available', 'reserved', 'rented', 'sold'] };
    } else if (q.q || q.category) {
      // admins with explicit filters — no status restriction
    }

    if (q.q) {
      where.OR = [
        { title: { contains: q.q, mode: 'insensitive' } },
        { description: { contains: q.q, mode: 'insensitive' } },
      ];
    }
    if (q.category) where.categoryId = q.category;
    if (q.transaction) where.transactionType = q.transaction;
    if (q.furnishing) where.furnishingType = q.furnishing;
    if (q.min_price != null || q.max_price != null) {
      where.price = {};
      if (q.min_price != null) (where.price as Prisma.DecimalFilter).gte = q.min_price;
      if (q.max_price != null) (where.price as Prisma.DecimalFilter).lte = q.max_price;
    }
    if (q.min_beds != null) where.bedrooms = { gte: q.min_beds };
    if (q.min_surface != null) where.surface = { gte: q.min_surface };
    if (q.amenities?.length) where.amenityIds = { hasEvery: q.amenities };
    if (q.verified) where.verification = 'verified';
    if (q.city) where.city = { contains: q.city, mode: 'insensitive' };
    if (q.neighborhood) where.neighborhood = { contains: q.neighborhood, mode: 'insensitive' };

    const orderBy: Prisma.PropertyOrderByWithRelationInput =
      q.sort === 'priceAsc' ? { price: 'asc' }
      : q.sort === 'priceDesc' ? { price: 'desc' }
      : { createdAt: 'desc' };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.property.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { media: true },
      }),
      this.prisma.property.count({ where }),
    ]);

    // Strip admin-only location fields for non-admins (SRS §99).
    const safe = items.map((p) => this.toPublic(p, user));
    return paginate(safe, total, page, pageSize);
  }

  async getById(id: string, user?: { role: string }) {
    const p = await this.prisma.property.findUnique({
      where: { id },
      include: { media: true, documents: true, category: true },
    });
    if (!p) throw new NotFoundException('Property not found');

    // Public users can only view published/available properties (SRS §99).
    if (!user || !ADMIN_ROLES.has(user.role)) {
      if (!['published', 'available', 'reserved', 'rented', 'sold'].includes(p.status)) {
        throw new NotFoundException('Property not found');
      }
    }
    return this.toPublic(p, user);
  }

  async featured(user?: { role: string }) {
    const items = await this.prisma.property.findMany({
      where: { featured: true, status: { in: ['published', 'available'] } },
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: { media: true },
    });
    return items.map((p) => this.toPublic(p, user));
  }

  async recent(user?: { role: string }) {
    const items = await this.prisma.property.findMany({
      where: { status: { in: ['published', 'available'] } },
      orderBy: { createdAt: 'desc' },
      take: 8,
      include: { media: true },
    });
    return items.map((p) => this.toPublic(p, user));
  }

  async verified(user?: { role: string }) {
    const items = await this.prisma.property.findMany({
      where: { verification: 'verified', status: { in: ['published', 'available'] } },
      orderBy: { createdAt: 'desc' },
      take: 8,
      include: { media: true },
    });
    return items.map((p) => this.toPublic(p, user));
  }

  async popularLocations() {
    const rows = await this.prisma.property.groupBy({
      by: ['city', 'neighborhood'],
      where: { status: { in: ['published', 'available'] } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 6,
    });
    return rows.map((r) => ({ city: r.city, neighborhood: r.neighborhood, count: r._count.id }));
  }

  async byOwner(ownerId: string, user?: { sub?: string; role: string }) {
    const items = await this.prisma.property.findMany({
      where: { ownerId },
      orderBy: { createdAt: 'desc' },
      include: { media: true },
    });
    // Owners see their own full location; others see public-safe.
    const viewerIsOwner = user && items.length > 0 && items[0].ownerId === user.sub;
    return items.map((p) => this.toPublic(p, viewerIsOwner ? { role: 'admin' } : user));
  }

  // ---- Owner submission (SRS §47) ----
  async submit(ownerId: string, dto: CreatePropertyDto) {
    const property = await this.prisma.property.create({
      data: {
        ownerId,
        title: dto.title,
        categoryId: dto.category_id,
        typeName: dto.type_name,
        transactionType: dto.transaction_type,
        furnishingType: dto.furnishing_type,
        price: dto.price,
        pricePeriod: dto.price_period,
        description: dto.description,
        bedrooms: dto.bedrooms,
        bathrooms: dto.bathrooms,
        surface: dto.surface,
        landArea: dto.land_area,
        parking: dto.parking,
        floors: dto.floors,
        amenityIds: dto.amenity_ids ?? [],
        // location (admin-only fields stored, never returned publicly — SRS §99)
        country: dto.country,
        region: dto.region,
        department: dto.department,
        city: dto.city,
        neighborhood: dto.neighborhood,
        street: dto.street,
        quarter: dto.quarter,
        landmark: dto.landmark,
        latitude: dto.latitude,
        longitude: dto.longitude,
        status: 'submitted',
        verification: 'not_verified',
        media: dto.media_urls?.length
          ? { create: dto.media_urls.map((url, i) => ({ url, isCover: i === 0 })) }
          : undefined,
        documents: dto.document_urls?.length
          ? { create: dto.document_urls.map((url) => ({ url })) }
          : undefined,
      },
      include: { media: true },
    });
    await this.audit.log({
      actor: ownerId,
      action: 'PROPERTY_SUBMITTED',
      entity: 'Property',
      entityId: property.id,
    });
    return this.toPublic(property, { role: 'admin' });
  }

  // ---- Admin verification / publish / suspend (SRS §23, §24, §47) ----
  async verify(id: string, adminId: string) {
    const p = await this.prisma.property.update({
      where: { id },
      data: { verification: 'verified' },
    });
    await this.audit.log({
      actor: adminId,
      action: 'PROPERTY_VERIFIED',
      entity: 'Property',
      entityId: id,
    });
    return this.toPublic(p, { role: 'admin' });
  }

  async reject(id: string, adminId: string) {
    const p = await this.prisma.property.update({
      where: { id },
      data: { verification: 'rejected', status: 'rejected' },
    });
    await this.audit.log({ actor: adminId, action: 'PROPERTY_REJECTED', entity: 'Property', entityId: id });
    return this.toPublic(p, { role: 'admin' });
  }

  async publish(id: string, adminId: string) {
    const p = await this.prisma.property.findUnique({ where: { id } });
    if (!p) throw new NotFoundException('Property not found');
    // Cannot publish an unverified property (SRS §77 — domain rule).
    if (p.verification !== 'verified') {
      throw new BadRequestException('Property must be verified before publishing');
    }
    const updated = await this.prisma.property.update({
      where: { id },
      data: { status: 'published' },
    });
    await this.audit.log({ actor: adminId, action: 'PROPERTY_PUBLISHED', entity: 'Property', entityId: id });
    return this.toPublic(updated, { role: 'admin' });
  }

  async suspend(id: string, adminId: string) {
    const p = await this.prisma.property.update({
      where: { id },
      data: { status: 'suspended' },
    });
    await this.audit.log({ actor: adminId, action: 'PROPERTY_SUSPENDED', entity: 'Property', entityId: id });
    return this.toPublic(p, { role: 'admin' });
  }

  async archive(id: string, adminId: string) {
    const p = await this.prisma.property.update({
      where: { id },
      data: { status: 'archived' },
    });
    await this.audit.log({ actor: adminId, action: 'PROPERTY_ARCHIVED', entity: 'Property', entityId: id });
    return this.toPublic(p, { role: 'admin' });
  }

  // ---- LOCATION PRIVACY (SRS §18, §83, §99) ----
  // Defense-in-depth: even if RLS were bypassed, the service strips the
  // admin-only location fields for any non-admin viewer.
  private toPublic(
    p: Record<string, unknown> & {
      quarter?: string | null;
      street?: string | null;
      landmark?: string | null;
      latitude?: unknown;
      longitude?: unknown;
    },
    user?: { role: string },
  ) {
    if (user && ADMIN_ROLES.has(user.role)) return p;
    // Strip admin-only location fields for non-admins.
    const { quarter, street, landmark, latitude, longitude, documents, ...rest } = p as Record<string, unknown>;
    void quarter; void street; void landmark; void latitude; void longitude; void documents;
    return rest;
  }
}
