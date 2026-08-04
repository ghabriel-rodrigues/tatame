import { ApiProperty } from '@nestjs/swagger';

/**
 * Leaf belt DTOs (no imports besides swagger) — shared by graduation,
 * enrollment and attendance response documents without import cycles.
 */

/** Catalog belt reference — design-token slugs, never hex. */
export class BeltRefDto {
  @ApiProperty({ format: 'uuid' })
  beltId!: string;

  @ApiProperty({ example: 'Azul', description: 'PT-BR display name (client copy)' })
  name!: string;

  @ApiProperty({ example: 'belt.blue', description: 'Design-token slug — never hex' })
  colorSlug!: string;

  @ApiProperty({
    nullable: true,
    type: String,
    example: 'belt.red',
    description: 'Ponteira override slug; null = default belt.tip',
  })
  tipColorSlug!: string | null;

  @ApiProperty({ description: '0 = no degree stripes (red belt in v1)' })
  maxDegrees!: number;
}

/** Derived current belt — the shared payload folded into every student list. */
export class BeltViewDto extends BeltRefDto {
  @ApiProperty({ description: 'Current degrees on this belt (0 after a belt promotion)' })
  degrees!: number;
}

export class NextMilestoneDto {
  @ApiProperty({ enum: ['degree', 'belt'] })
  kind!: 'degree' | 'belt';

  @ApiProperty({
    nullable: true,
    type: Number,
    description: 'The degree the bar points at; null when the milestone is the next belt',
  })
  degree!: number | null;
}

export class GraduationProgressDto {
  @ApiProperty({ description: 'Active lessons since the last award (lifetime when none)' })
  current!: number;

  @ApiProperty({ description: "The academy's lessons_per_degree for the current belt" })
  target!: number;

  @ApiProperty({ example: 'Próximo 3º grau', description: 'PT-BR convenience label' })
  label!: string;

  @ApiProperty({ type: NextMilestoneDto })
  nextMilestone!: NextMilestoneDto;
}
