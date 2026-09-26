import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { Polygon } from 'geojson';
import { AreaType } from './area-type.enum.js';

@Entity({ name: 'areas' })
export class Area {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'enum', enum: AreaType, enumName: 'area_type' })
  type: AreaType;

  // TypeORM geometry kolonlarını GeoJSON olarak okur/yazar.
  @Index('areas_geom_gist', { spatial: true })
  @Column({ type: 'geometry', spatialFeatureType: 'Polygon', srid: 4326 })
  geom: Polygon;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
