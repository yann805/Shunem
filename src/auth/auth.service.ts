import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import { randomUUID } from 'crypto';

import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { GoogleAuthDto, RefreshDto, RoleDto, SeekerRegisterDto, OwnerApplicationDto } from './dto/auth.dto';

/** Public-safe user shape (SRS §83 — never leaks password/credentials). */
export interface AuthUser {
  id: string;
  email: string;
  role: string;
  displayName: string | null;
  photoUrl: string | null;
  phone: string | null;
  city: string | null;
  language: string;
  permissions: string[];
}

export interface AuthSession {
  access_token: string;
  refresh_token: string;
  expires_at: string;
  user: AuthUser;
}

/**
 * Authentication & session service (SRS §8, §78, §81, §86).
 *
 * Google Authentication establishes identity; the enterprise backend verifies
 * the Google ID token server-side and issues app access + refresh tokens.
 * The client NEVER decides the role or trust level (zero-trust, SRS §81).
 */
@Injectable()
export class AuthService {
  private readonly googleClient: OAuth2Client;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {
    this.googleClient = new OAuth2Client(this.config.get<string>('GOOGLE_CLIENT_ID'));
  }

  // ---- Google sign-in → backend session (SRS §78) ----
  async signInWithGoogle(dto: GoogleAuthDto): Promise<AuthSession> {
    const payload = await this.verifyGoogleIdToken(dto.id_token);
    if (!payload || !payload.email) {
      throw new UnauthorizedException('Invalid Google credential');
    }

    // Upsert user (SRS §9 — visitor by default until role chosen).
    const user = await this.prisma.user.upsert({
      where: { email: payload.email },
      update: {
        displayName: payload.name ?? undefined,
        photoUrl: payload.picture ?? undefined,
      },
      create: {
        email: payload.email,
        displayName: payload.name ?? null,
        photoUrl: payload.picture ?? null,
        role: 'visitor',
      },
    });

    return this.issueSession(user);
  }

  /** Verify the Google ID token server-side (SRS §78 — never trust the client). */
  private async verifyGoogleIdToken(idToken: string) {
    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken,
        audience: this.config.get<string>('GOOGLE_CLIENT_ID'),
      });
      return ticket.getPayload();
    } catch {
      throw new UnauthorizedException('Google token verification failed');
    }
  }

  // ---- Session restore ----
  async me(userId: string): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    return this.toAuthUser(user);
  }

  // ---- Refresh (SRS §86 — token refresh + revocation) ----
  async refresh(dto: RefreshDto): Promise<AuthSession> {
    let decoded: { sub: string };
    try {
      decoded = this.jwt.verify(dto.refresh_token, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const stored = await this.prisma.refreshToken.findUnique({
      where: { token: dto.refresh_token },
    });
    if (!stored || stored.revoked || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token revoked or expired');
    }

    // Rotate: revoke the old token, issue a new one (SRS §86).
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revoked: true },
    });

    const user = await this.prisma.user.findUnique({ where: { id: decoded.sub } });
    if (!user) throw new UnauthorizedException('User not found');
    return this.issueSession(user);
  }

  async logout(refreshToken: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { token: refreshToken },
      data: { revoked: true },
    });
  }

  // ---- Role selection (SRS §9, §10) ----
  async selectRole(userId: string, dto: RoleDto): Promise<AuthUser> {
    if (dto.role === 'owner') {
      // Owner activation requires enterprise approval (SRS §10, §12). Selecting
      // "owner" records intent but the account stays non-operational until an
      // admin approves the owner application.
      await this.prisma.user.update({
        where: { id: userId },
        data: { role: 'owner' },
      });
    } else {
      await this.prisma.user.update({
        where: { id: userId },
        data: { role: dto.role },
      });
    }
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    return this.toAuthUser(user);
  }

  // ---- Seeker registration (SRS §9) ----
  async registerSeeker(userId: string, dto: SeekerRegisterDto): Promise<AuthUser> {
    await this.prisma.$transaction([
      this.prisma.seeker.upsert({
        where: { userId },
        update: { location: dto.city ?? undefined },
        create: { userId, location: dto.city ?? null },
      }),
      this.prisma.user.update({
        where: { id: userId },
        data: {
          role: 'seeker',
          displayName: dto.full_name ?? undefined,
          phone: dto.phone ?? undefined,
          city: dto.city ?? undefined,
        },
      }),
    ]);
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    return this.toAuthUser(user);
  }

  // ---- Owner application (SRS §10, §11, §12) ----
  async submitOwnerApplication(userId: string, dto: OwnerApplicationDto) {
    // Verify the accepted terms version exists & is active (SRS §11).
    const terms = await this.prisma.ownerTerms.findUnique({
      where: { version: dto.accepted_terms_version },
    });
    if (!terms || terms.status !== 'active') {
      throw new BadRequestException('Invalid or inactive terms version');
    }

    const owner = await this.prisma.owner.upsert({
      where: { userId },
      update: {
        type: dto.type,
        location: dto.city,
        acceptedTermsVer: dto.accepted_terms_version,
        status: 'pending',
      },
      create: {
        userId,
        type: dto.type,
        location: dto.city,
        acceptedTermsVer: dto.accepted_terms_version,
        status: 'pending',
      },
    });

    // Record the terms acceptance (SRS §11 — version recorded per owner).
    await this.prisma.termsAcceptance.upsert({
      where: { ownerId_version: { ownerId: userId, version: dto.accepted_terms_version } },
      update: {},
      create: { ownerId: userId, version: dto.accepted_terms_version },
    });

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        role: 'owner',
        displayName: dto.full_name,
        phone: dto.phone,
        city: dto.city,
      },
    });

    return {
      status: owner.status,
      application_id: owner.userId,
    };
  }

  // ---- Helpers ----
  private async issueSession(user: {
    id: string;
    email: string;
    role: string;
    displayName: string | null;
    photoUrl: string | null;
    phone: string | null;
    city: string | null;
    language: string;
    permissions: string[];
  }): Promise<AuthSession> {
    const accessTtl = this.config.get<string>('JWT_ACCESS_TTL') ?? '15m';
    const refreshTtl = this.config.get<string>('JWT_REFRESH_TTL') ?? '30d';

    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      permissions: user.role === 'super_admin' ? ['*'] : user.permissions,
    };

    const accessToken = this.jwt.sign(payload, {
      secret: this.config.get<string>('JWT_ACCESS_SECRET'),
      expiresIn: accessTtl,
    });

    const refreshToken = this.jwt.sign({ sub: user.id }, {
      secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: refreshTtl,
    });

    // Persist the refresh token (revocable, SRS §86).
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        token: refreshToken,
        expiresAt,
      },
    });

    const expiresIn = this.parseExpirySeconds(accessTtl);
    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
      user: this.toAuthUser(user),
    };
  }

  private toAuthUser(u: {
    id: string;
    email: string;
    role: string;
    displayName: string | null;
    photoUrl: string | null;
    phone: string | null;
    city: string | null;
    language: string;
    permissions: string[];
  }): AuthUser {
    return {
      id: u.id,
      email: u.email,
      role: u.role,
      displayName: u.displayName,
      photoUrl: u.photoUrl,
      phone: u.phone,
      city: u.city,
      language: u.language,
      permissions: u.role === 'super_admin' ? ['*'] : u.permissions,
    };
  }

  private parseExpirySeconds(ttl: string): number {
    const m = /^(\d+)([smhd])$/.exec(ttl);
    if (!m) return 900;
    const n = Number(m[1]);
    return n * ({ s: 1, m: 60, h: 3600, d: 86400 }[m[2] as 's' | 'm' | 'h' | 'd'] ?? 60);
  }
}
