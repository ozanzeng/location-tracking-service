import { PartialType } from '@nestjs/swagger';
import { CreateAreaDto } from './create-area.dto.js';

/** Alan düzenleme: ad, tip ve geometriden en az biri. */
export class UpdateAreaDto extends PartialType(CreateAreaDto) {}
