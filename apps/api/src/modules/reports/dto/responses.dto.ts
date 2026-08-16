import { ApiProperty } from '@nestjs/swagger';
import { MaterializationResultDto } from '../../billing/dto/responses.dto.js';

/**
 * Response DTOs — OpenAPI documentation classes only (web-03 pipeline). The
 * controllers return the service objects untouched; these classes keep
 * `/docs-json` truthful so the generated client contract stays drift-free.
 */

export class ReportWindowDto {
  @ApiProperty({ description: '`YYYY-MM` for months, `YYYY-S1`/`YYYY-S2` for semesters' })
  label!: string;

  @ApiProperty({ example: '2026-08-01', description: 'Inclusive tenant-local first day' })
  start!: string;

  @ApiProperty({ example: '2026-09-01', description: 'Exclusive tenant-local end day' })
  endExclusive!: string;
}

export class FinanceiroSummaryDto {
  @ApiProperty({ description: 'Succeeded payments by paid_at in the month (cents)' })
  receitaCents!: number;

  @ApiProperty({ description: 'Open charges due inside the month (cents, predicate)' })
  previstoCents!: number;

  @ApiProperty({ description: 'Overdue-open plan amount ÷ month plan total (0-100)' })
  inadimplenciaPct!: number;
}

export class FinanceiroRowDto {
  @ApiProperty({ format: 'uuid' })
  chargeId!: string;

  @ApiProperty({ nullable: true, type: String, description: 'Null for professor-buyer order charges' })
  studentName!: string | null;

  @ApiProperty({ enum: ['plan', 'event', 'order'] })
  origin!: 'plan' | 'event' | 'order';

  @ApiProperty({ nullable: true, type: String, description: 'Competência — plan charges only' })
  periodStart!: string | null;

  @ApiProperty({ example: '2026-08-05' })
  dueDate!: string;

  @ApiProperty()
  status!: string;

  @ApiProperty()
  amountCents!: number;

  @ApiProperty({ format: 'date-time', nullable: true, type: String })
  paidAt!: Date | null;
}

export class FinanceiroReportDto {
  @ApiProperty({ enum: ['financeiro'] })
  report!: 'financeiro';

  @ApiProperty({ example: '2026-08' })
  month!: string;

  @ApiProperty({ type: FinanceiroSummaryDto })
  summary!: FinanceiroSummaryDto;

  @ApiProperty({ type: [FinanceiroRowDto], description: 'Every charge touching the month' })
  rows!: FinanceiroRowDto[];

  @ApiProperty({ type: MaterializationResultDto, description: 'The on-read pass that ran first' })
  materialization!: MaterializationResultDto;
}

export class FrequenciaStudentDto {
  @ApiProperty({ format: 'uuid' })
  studentId!: string;

  @ApiProperty()
  studentName!: string;

  @ApiProperty()
  presencas!: number;

  @ApiProperty({ description: 'Month sessions minus presenças (honest denominator)' })
  faltas!: number;

  @ApiProperty({ description: '0-100 over the materialized sessions' })
  presencePct!: number;
}

export class FrequenciaClassDto {
  @ApiProperty({ format: 'uuid' })
  classId!: string;

  @ApiProperty()
  className!: string;

  @ApiProperty({ description: 'Materialized sessions in the month — a day nobody opened never happened' })
  sessionsCount!: number;

  @ApiProperty({ type: [FrequenciaStudentDto], description: 'Actively enrolled students' })
  students!: FrequenciaStudentDto[];
}

export class FrequenciaReportDto {
  @ApiProperty({ enum: ['frequencia'] })
  report!: 'frequencia';

  @ApiProperty({ example: '2026-08' })
  month!: string;

  @ApiProperty({ type: [FrequenciaClassDto] })
  classes!: FrequenciaClassDto[];
}

export class InadimplenciaTotalsDto {
  @ApiProperty()
  count!: number;

  @ApiProperty()
  totalCents!: number;
}

export class InadimplenciaRowDto {
  @ApiProperty({ format: 'uuid' })
  chargeId!: string;

  @ApiProperty({ nullable: true, type: String })
  studentName!: string | null;

  @ApiProperty({ nullable: true, type: String, description: 'Bill-to responsável when set' })
  guardianName!: string | null;

  @ApiProperty()
  amountCents!: number;

  @ApiProperty({ example: '2026-07-05' })
  dueDate!: string;

  @ApiProperty()
  daysOverdue!: number;

  @ApiProperty({
    description:
      "Payer's payment-category notifications since the due date — honest approximation (no charge FK by design)",
  })
  notificationsSent!: number;
}

export class InadimplenciaReportDto {
  @ApiProperty({ enum: ['inadimplencia'] })
  report!: 'inadimplencia';

  @ApiProperty({ example: '2026-08-16', description: 'As-of-now snapshot (ignores month=)' })
  asOf!: string;

  @ApiProperty({ type: InadimplenciaTotalsDto })
  totals!: InadimplenciaTotalsDto;

  @ApiProperty({ type: [InadimplenciaRowDto] })
  rows!: InadimplenciaRowDto[];
}

export class GraduacoesRowDto {
  @ApiProperty({ format: 'uuid' })
  graduationId!: string;

  @ApiProperty()
  studentName!: string;

  @ApiProperty({ enum: ['degree', 'belt'], description: 'Revocations and reversed awards excluded' })
  kind!: 'degree' | 'belt';

  @ApiProperty({ example: 'Azul' })
  beltName!: string;

  @ApiProperty({ description: '0 on belt promotions' })
  degree!: number;

  @ApiProperty()
  awardedByName!: string;

  @ApiProperty({ format: 'date-time' })
  awardedAt!: Date;
}

export class GraduacoesReportDto {
  @ApiProperty({ enum: ['graduacoes'] })
  report!: 'graduacoes';

  @ApiProperty({ example: '2026-08', description: 'The chosen month — the window is its semester' })
  month!: string;

  @ApiProperty({ type: ReportWindowDto, description: 'Calendar half (Jan–Jun / Jul–Dec)' })
  semester!: ReportWindowDto;

  @ApiProperty({ type: [GraduacoesRowDto] })
  rows!: GraduacoesRowDto[];
}

export class LojaTotalsDto {
  @ApiProperty({ description: 'Orders that reached paid or beyond (canceled excluded)' })
  pedidos!: number;

  @ApiProperty({ description: 'Item quantity sum over the counted orders' })
  itens!: number;

  @ApiProperty({ description: 'Order total sum over the counted orders (cents)' })
  vendasCents!: number;
}

export class LojaRowDto {
  @ApiProperty({ format: 'uuid' })
  orderId!: string;

  @ApiProperty({ example: 2431 })
  number!: number;

  @ApiProperty({ example: '2026-08-14' })
  date!: string;

  @ApiProperty()
  buyerName!: string;

  @ApiProperty()
  productName!: string;

  @ApiProperty({ nullable: true, type: String })
  size!: string | null;

  @ApiProperty()
  quantity!: number;

  @ApiProperty({ description: 'Item snapshot: unit price × quantity (cents)' })
  amountCents!: number;

  @ApiProperty({ description: 'pending/canceled rows are listed but never counted in totals' })
  status!: string;
}

export class LojaReportDto {
  @ApiProperty({ enum: ['loja'] })
  report!: 'loja';

  @ApiProperty({ example: '2026-08' })
  month!: string;

  @ApiProperty({ type: LojaTotalsDto })
  totals!: LojaTotalsDto;

  @ApiProperty({ type: [LojaRowDto] })
  rows!: LojaRowDto[];
}

export class RankingRowDto {
  @ApiProperty({ description: '1-based after count-desc, name-asc sort' })
  position!: number;

  @ApiProperty()
  name!: string;

  @ApiProperty({ description: 'Aulas no mês / eventos no semestre' })
  count!: number;

  @ApiProperty({ description: 'The requesting student\'s own row ("você" chip)' })
  isMe!: boolean;
}

export class RankingMeDto {
  @ApiProperty()
  position!: number;

  @ApiProperty()
  count!: number;
}

export class RankingResponseDto {
  @ApiProperty({ enum: ['lessons', 'events'] })
  by!: 'lessons' | 'events';

  @ApiProperty({ type: ReportWindowDto, description: 'Month for lessons, semester for events' })
  window!: ReportWindowDto;

  @ApiProperty({ type: [RankingRowDto], description: 'Top 10' })
  top!: RankingRowDto[];

  @ApiProperty({
    type: RankingMeDto,
    nullable: true,
    description: 'Own position for student requesters; always null for professors',
  })
  me!: RankingMeDto | null;

  @ApiProperty({ description: 'Active students ranked (zero counts included)' })
  totalRanked!: number;
}
