import { PgErrorCode } from '../common/database/pg-error-code.enum.js';
import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { PrincipalKind } from '../security/principal-kind.enum.js';
import { Sessions } from '../security/sessions.js';
import type { CredentialsDto } from './dto/credentials.dto.js';
import type { SessionResponseDto } from './dto/session-response.dto.js';
import { LoginThrottle } from './login-throttle.js';
import {
  dummyPasswordHash,
  hashPassword,
  needsRehash,
  verifyPassword,
} from './password.js';
import { Rider } from './rider.entity.js';

@Injectable()
export class RidersService {
  constructor(
    @InjectRepository(Rider) private readonly riders: Repository<Rider>,
    private readonly sessions: Sessions,
    private readonly throttle: LoginThrottle,
  ) {}

  /** Üye olur ve hemen oturum açar. */
  async register(dto: CredentialsDto): Promise<SessionResponseDto> {
    const passwordHash = await hashPassword(dto.password);
    let rider: Rider;
    try {
      rider = await this.riders.save(
        this.riders.create({ username: dto.username, passwordHash }),
      );
    } catch (err) {
      // Aynı ad aynı anda iki kez denenirse de veritabanı birini reddeder.
      if (
        err instanceof QueryFailedError &&
        (err.driverError as { code?: string }).code ===
          PgErrorCode.UNIQUE_VIOLATION
      ) {
        throw new ConflictException('Bu kullanıcı adı alınmış');
      }
      throw err;
    }
    return this.openSession(rider);
  }

  /**
   * Kullanıcı adı yoksa da şifre yanlışsa da aynı mesaj ve yaklaşık aynı süre: yanıttan hangi
   * adların kayıtlı olduğu anlaşılamasın.
   */
  async login(dto: CredentialsDto): Promise<SessionResponseDto> {
    await this.throttle.assertAllowed(dto.username);
    const rider = await this.riders.findOne({
      where: { username: dto.username },
      select: { id: true, username: true, passwordHash: true },
    });
    const valid = await verifyPassword(
      dto.password,
      rider?.passwordHash ?? (await dummyPasswordHash()),
    );
    if (!rider || !valid) {
      await this.throttle.recordFailure(dto.username);
      throw new UnauthorizedException('Kullanıcı adı ya da şifre yanlış');
    }
    await this.throttle.reset(dto.username);
    // Eski yöntemle (ilk sürümün scrypt'i) ya da eski parametrelerle özetlenmişse, şifre
    // elimizdeyken güncel yöntemle yeniden özetlenir. Başarısız olursa giriş yine olur.
    if (needsRehash(rider.passwordHash)) {
      await this.riders
        .update(rider.id, { passwordHash: await hashPassword(dto.password) })
        .catch(() => undefined);
    }
    return this.openSession(rider);
  }

  logout(token: string): Promise<void> {
    return this.sessions.revoke(token);
  }

  private async openSession(rider: Rider): Promise<SessionResponseDto> {
    return {
      token: await this.sessions.create({
        kind: PrincipalKind.RIDER,
        riderId: rider.id,
        username: rider.username,
      }),
      expiresIn: this.sessions.ttl(PrincipalKind.RIDER),
      rider: { id: rider.id, username: rider.username },
    };
  }
}
