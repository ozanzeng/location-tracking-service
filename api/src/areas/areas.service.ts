import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Area } from './area.entity.js';
import type { CreateAreaDto } from './dto/create-area.dto.js';
import type { AreaType } from './area-type.enum.js';

@Injectable()
export class AreasService {
  constructor(
    @InjectRepository(Area) private readonly areas: Repository<Area>,
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
    return this.areas.save(area);
  }

  findAll(type?: AreaType): Promise<Area[]> {
    return this.areas.find({
      where: type ? { type } : {},
      order: { createdAt: 'ASC' },
    });
  }
}
