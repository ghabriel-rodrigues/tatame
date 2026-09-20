import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** "Mensalidade em aberto" alert data — aluno home + responsável child cards. */
export class MensalidadeAlertDto {
  @ApiProperty({
    format: 'uuid',
    description: 'Deep-link target: the Carteira charge',
  })
  chargeId!: string;

  @ApiProperty()
  amountCents!: number;

  @ApiProperty({ example: 'BRL' })
  currency!: string;

  @ApiProperty({ example: '2026-08-10' })
  dueDate!: string;

  @ApiProperty({
    description: 'Derived truth: past due (never the lazy status flip)',
  })
  overdue!: boolean;

  @ApiPropertyOptional({ example: '2026-08-01', nullable: true, type: String })
  periodStart!: string | null;
}

export class PlanDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Mensal' })
  name!: string;

  @ApiProperty({ description: 'Integer cents' })
  amountCents!: number;

  @ApiProperty({ example: 'BRL' })
  currency!: string;

  @ApiProperty({ enum: ['monthly', 'quarterly', 'semiannual', 'yearly'] })
  recurrence!: string;

  @ApiProperty({ minimum: 1, maximum: 28 })
  dueDay!: number;

  @ApiProperty({
    description: 'false = soft-archived (refuses new assignment)',
  })
  isActive!: boolean;
}

export class PaymentDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  chargeId!: string;

  @ApiProperty({ enum: ['pix', 'boleto', 'card'] })
  method!: string;

  @ApiProperty({ enum: ['pending', 'succeeded', 'failed', 'refunded'] })
  status!: string;

  @ApiProperty()
  amountCents!: number;

  @ApiProperty({ example: 'BRL' })
  currency!: string;

  @ApiProperty({ enum: ['simulated', 'stripe'] })
  provider!: string;

  @ApiPropertyOptional({
    type: Object,
    nullable: true,
    description:
      'Render-ready provider snapshot: Pix `qrPayload`/`copiaECola`, boleto `linhaDigitavel`/`barcodePayload`, card brand/last4.',
  })
  providerData!: unknown;

  @ApiPropertyOptional({ format: 'date-time', nullable: true, type: String })
  paidAt!: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  receiptUrl!: string | null;
}

export class ChargeDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    type: String,
    description:
      'Null only on order-origin charges of a professor buyer (spec 009)',
  })
  studentId!: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, type: String })
  guardianId!: string | null;

  @ApiProperty({ enum: ['open', 'paid', 'overdue', 'canceled', 'refunded'] })
  status!: string;

  @ApiProperty({
    description: 'Derived truth: open AND past due (never the lazy flip)',
  })
  overdue!: boolean;

  @ApiProperty()
  amountCents!: number;

  @ApiProperty({ example: 'BRL' })
  currency!: string;

  @ApiProperty({ example: '2026-08-10' })
  dueDate!: string;

  @ApiPropertyOptional({ example: '2026-08-01', nullable: true, type: String })
  periodStart!: string | null;

  @ApiPropertyOptional({ example: '2026-08-31', nullable: true, type: String })
  periodEnd!: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, type: String })
  academyPlanId!: string | null;
}

export class ChargeWithPaymentsDto extends ChargeDto {
  @ApiProperty({ type: [PaymentDto] })
  payments!: PaymentDto[];
}

export class WalletRecurrenceDto {
  @ApiProperty({ description: '"Cobrança recorrente ativa" banner switch' })
  active!: boolean;

  @ApiPropertyOptional({
    example: '2026-09-05',
    nullable: true,
    type: String,
    description: 'Next cycle vencimento ("a próxima mensalidade chega em …")',
  })
  nextChargeDueDate!: string | null;
}

export class HistoryEntryDto {
  @ApiProperty({ format: 'uuid' })
  studentId!: string;

  @ApiProperty({ format: 'uuid' })
  chargeId!: string;

  @ApiPropertyOptional({ example: '2026-07-01', nullable: true, type: String })
  periodStart!: string | null;

  @ApiProperty()
  amountCents!: number;

  @ApiProperty({ example: 'BRL' })
  currency!: string;

  @ApiProperty({ enum: ['paid', 'refunded'] })
  chargeStatus!: string;

  @ApiProperty({ format: 'uuid' })
  paymentId!: string;

  @ApiProperty({ enum: ['pix', 'boleto', 'card'] })
  method!: string;

  @ApiPropertyOptional({ format: 'date-time', nullable: true, type: String })
  paidAt!: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  receiptUrl!: string | null;
}

export class WalletStudentDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  fullName!: string;
}

export class WalletResponseDto {
  @ApiProperty({ type: WalletStudentDto })
  student!: WalletStudentDto;

  @ApiPropertyOptional({
    type: PlanDto,
    nullable: true,
    description: 'Null = no assigned plan → clean empty state',
  })
  plan!: PlanDto | null;

  @ApiPropertyOptional({ type: ChargeWithPaymentsDto, nullable: true })
  currentCharge!: ChargeWithPaymentsDto | null;

  @ApiProperty({ type: WalletRecurrenceDto })
  recurrence!: WalletRecurrenceDto;

  @ApiProperty({ type: [HistoryEntryDto] })
  history!: HistoryEntryDto[];
}

export class PaymentCreatedResponseDto {
  @ApiProperty({ type: PaymentDto })
  payment!: PaymentDto;

  @ApiProperty({ type: ChargeDto })
  charge!: ChargeDto;

  @ApiProperty({
    description: 'True when the recurrence toggle created a mandate',
  })
  mandateCreated!: boolean;
}

export class SimulatePaymentResponseDto {
  @ApiProperty({ type: PaymentDto })
  payment!: PaymentDto;

  @ApiProperty({ type: ChargeDto })
  charge!: ChargeDto;
}

export class ReceiptResponseDto {
  @ApiProperty({ type: PaymentDto })
  payment!: PaymentDto;

  @ApiProperty({ type: ChargeDto })
  charge!: ChargeDto;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description:
      'Null on order-origin receipts of a professor buyer (no student row)',
  })
  studentName!: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  planName!: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  academyName!: string | null;
}

export class DependentPaymentsDto {
  @ApiProperty({ format: 'uuid' })
  studentId!: string;

  @ApiProperty()
  fullName!: string;

  @ApiPropertyOptional({ type: PlanDto, nullable: true })
  plan!: PlanDto | null;

  @ApiPropertyOptional({ type: ChargeWithPaymentsDto, nullable: true })
  currentCharge!: ChargeWithPaymentsDto | null;

  @ApiProperty({
    description: '"Pago via recorrência no cartão" mandate switch',
  })
  recurrenceActive!: boolean;
}

export class GuardianHistoryEntryDto extends HistoryEntryDto {
  @ApiProperty()
  studentName!: string;
}

export class GuardianPaymentsResponseDto {
  @ApiProperty({ type: [DependentPaymentsDto] })
  dependents!: DependentPaymentsDto[];

  @ApiProperty({ type: [GuardianHistoryEntryDto] })
  history!: GuardianHistoryEntryDto[];
}

export class RevenueMonthDto {
  @ApiProperty({ example: '2026-08' })
  month!: string;

  @ApiProperty()
  totalCents!: number;
}

export class UpcomingChargeDto {
  @ApiProperty({ format: 'uuid' })
  chargeId!: string;

  @ApiProperty({ format: 'uuid' })
  studentId!: string;

  @ApiProperty()
  studentName!: string;

  @ApiProperty()
  amountCents!: number;

  @ApiPropertyOptional({ nullable: true, type: String })
  planName!: string | null;
}

export class UpcomingGroupDto {
  @ApiProperty({ example: '2026-08-10' })
  dueDate!: string;

  @ApiProperty()
  count!: number;

  @ApiProperty()
  totalCents!: number;

  @ApiProperty({ type: [UpcomingChargeDto] })
  charges!: UpcomingChargeDto[];
}

export class DelinquentStudentDto {
  @ApiProperty({ format: 'uuid' })
  studentId!: string;

  @ApiProperty()
  fullName!: string;

  @ApiProperty()
  totalCents!: number;

  @ApiProperty({
    example: '2026-07-05',
    description: 'Since when (oldest due date)',
  })
  oldestDueDate!: string;

  @ApiProperty()
  chargeCount!: number;
}

export class MaterializationResultDto {
  @ApiProperty({ description: 'Charges actually inserted by this pass' })
  created!: number;

  @ApiProperty({ description: 'Charges lazily flipped open → overdue' })
  flippedOverdue!: number;

  @ApiProperty({
    description: 'Due charges auto-settled by active card mandates',
  })
  autoSettled!: number;
}

export class AdminOverviewResponseDto {
  @ApiProperty({ example: '2026-08' })
  month!: string;

  @ApiProperty()
  receitaMesCents!: number;

  @ApiProperty()
  receitaAnoCents!: number;

  @ApiProperty()
  previsaoProximoMesCents!: number;

  @ApiProperty({
    description: 'By value: overdue-open ÷ current-month plan total (0-100)',
  })
  inadimplenciaPct!: number;

  @ApiProperty({
    type: [RevenueMonthDto],
    description: 'Last 6 months incl. current',
  })
  series!: RevenueMonthDto[];

  @ApiProperty({ type: [UpcomingGroupDto] })
  proximosVencimentos!: UpcomingGroupDto[];

  @ApiProperty({ type: [DelinquentStudentDto] })
  inadimplentes!: DelinquentStudentDto[];

  @ApiProperty({ type: MaterializationResultDto })
  materialization!: MaterializationResultDto;
}

export class PlanListResponseDto {
  @ApiProperty({ type: [PlanDto] })
  plans!: PlanDto[];
}

export class PlanResponseDto {
  @ApiProperty({ type: PlanDto })
  plan!: PlanDto;
}

export class RefundResponseDto {
  @ApiProperty({ type: PaymentDto })
  payment!: PaymentDto;

  @ApiProperty({ type: ChargeDto })
  charge!: ChargeDto;
}

export class RepasseRowDto {
  @ApiProperty({ format: 'uuid' })
  academyId!: string;

  @ApiProperty()
  academyName!: string;

  @ApiProperty({ example: '2026-08' })
  period!: string;

  @ApiProperty({
    description: 'Distinct students with settled payments in the period',
  })
  studentCount!: number;

  @ApiProperty()
  grossCents!: number;

  @ApiProperty({
    description: 'Platform take in basis points (fee_bps NULL → 0)',
  })
  feeBps!: number;

  @ApiProperty()
  feeCents!: number;

  @ApiProperty({ description: 'gross − fee' })
  netCents!: number;

  @ApiProperty({ description: 'Charter retention: delinquent academy ⇒ true' })
  withheld!: boolean;

  @ApiProperty({ enum: ['repassado', 'em_transito', 'retido'] })
  status!: string;
}

export class RepasseTotalsDto {
  @ApiProperty({ description: '"assinaturas · mês" — live SaaS subscriptions' })
  subscriptionsMonthCents!: number;

  @ApiProperty({
    description: '"taxa de pagamento" — current-period platform fees',
  })
  paymentFeesMonthCents!: number;
}

export class RepassesResponseDto {
  @ApiProperty({ type: RepasseTotalsDto })
  totals!: RepasseTotalsDto;

  @ApiProperty({ type: [RepasseRowDto] })
  repasses!: RepasseRowDto[];
}
