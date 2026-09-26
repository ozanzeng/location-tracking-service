import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import type { Polygon } from 'geojson';
import { AreaType } from '../area-type.enum.js';
import { IsGeoJsonPolygon } from '../geojson-polygon.validator.js';

export class CreateAreaDto {
  @ApiProperty({ example: 'Kadıköy Sahil - Sürüş Yasak' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @ApiProperty({ enum: AreaType, example: AreaType.NO_RIDE })
  @IsEnum(AreaType)
  type: AreaType;

  @ApiProperty({
    description: 'GeoJSON Polygon, koordinatlar [boylam, enlem] (WGS84)',
    example: {
      type: 'Polygon',
      coordinates: [
        [
          [29.02, 40.99],
          [29.03, 40.99],
          [29.03, 41.0],
          [29.02, 41.0],
          [29.02, 40.99],
        ],
      ],
    },
  })
  @IsGeoJsonPolygon()
  geometry: Polygon;
}
