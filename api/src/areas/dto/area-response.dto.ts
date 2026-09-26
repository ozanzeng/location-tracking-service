import { ApiProperty } from '@nestjs/swagger';
import type { Polygon } from 'geojson';
import { AreaType } from '../area-type.enum.js';
import type { Area } from '../area.entity.js';

export class AreaResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ enum: AreaType })
  type: AreaType;

  @ApiProperty({ description: 'GeoJSON Polygon' })
  geometry: Polygon;

  @ApiProperty()
  createdAt: Date;

  static from(area: Area): AreaResponseDto {
    return {
      id: area.id,
      name: area.name,
      type: area.type,
      geometry: area.geom,
      createdAt: area.createdAt,
    };
  }
}
