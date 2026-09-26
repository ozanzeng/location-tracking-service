import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RealtimePublisher } from '../realtime/realtime.publisher.js';
import { Area } from './area.entity.js';
import type { CreateAreaDto } from './dto/create-area.dto.js';
import type { AreaType } from './area-type.enum.js';

@Injectable()
export class AreasService {
  constructor(
    @InjectRepository(Area) private readonly areas: Repository<Area>,
    private readonly publisher: RealtimePublisher,
  ) {}

  async create(dto: CreateAreaDto): Promise<Area> {
    // Yapı DTO'da doğrulandı; kendini kesen poligon gibi geometrik hataları PostGIS söyler.
    const [check] = await this.areas.query(
      `SELECT ST_IsValid(g) AS valid, ST_IsValidReason(g) AS reason
         FROM (SELECT ST_SetSRID(ST_GeomFromGeoJSON($1), 4326) AS g) s`,
      [JSON.stringify(dto.geometry)],
    );
    if (!check.valid) {
      throw new BadRequestException(`Geçersiz poligon: ${check.reason}`);
    }

    const area = this.areas.create({
      name: dto.name,
      type: dto.type,
      geom: dto.geometry,
    });
    const saved = await this.areas.save(area);
    // Açık istemciler (sürücü, operasyon) yeni alanı sayfa yenilemeden görsün.
    await this.publisher.publishAreasChanged({
      created: { id: saved.id, name: saved.name, type: saved.type },
    });
    return saved;
  }

  findAll(type?: AreaType): Promise<Area[]> {
    return this.areas.find({
      where: type ? { type } : {},
      order: { createdAt: 'ASC' },
    });
  }
}
