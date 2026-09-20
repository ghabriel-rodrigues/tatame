import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiExtraModels,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiQuery,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { ClsService } from 'nestjs-cls';
import { Roles } from '../../../common/decorators.js';
import { requireTenantContext } from '../../enrollment/controllers/context.js';
import {
  FinanceiroReportDto,
  FrequenciaReportDto,
  GraduacoesReportDto,
  InadimplenciaReportDto,
  LojaReportDto,
} from '../dto/responses.dto.js';
import { CSV_BOM } from '../lib/csv.js';
import { ReportsCsvService } from '../services/reports-csv.service.js';
import { REPORT_SLUGS, ReportsService } from '../services/reports.service.js';

/**
 * Admin Relatórios (spec 013, REP.3/REP.4 — admin-18): five derive-on-read
 * report models, each with a JSON view and a streamed CSV serialization of
 * the SAME read model. Admin-only — two of the five reports carry money, so
 * the whole surface is admin-gated (charter: professor has no financial
 * access; the CI route-metadata assertion enforces the stance structurally).
 * Reads work in read-only (delinquent) academies like every GET.
 */
@ApiTags('admin')
@ApiBearerAuth()
@Roles('admin')
@Controller('admin/reports')
@ApiExtraModels(
  FinanceiroReportDto,
  FrequenciaReportDto,
  InadimplenciaReportDto,
  GraduacoesReportDto,
  LojaReportDto,
)
export class AdminReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly csv: ReportsCsvService,
    private readonly cls: ClsService,
  ) {}

  @Get(':report')
  @ApiOperation({
    summary:
      'One of the five admin reports as JSON (month/semester windows, tenant timezone)',
    description:
      'Slugs: financeiro, frequencia, inadimplencia, graduacoes, loja. `financeiro`, ' +
      '`frequencia` and `loja` take month=YYYY-MM (default: current month); `graduacoes` ' +
      'reports the semester containing it; `inadimplencia` is an as-of-now snapshot. ' +
      'financeiro runs the idempotent charge-materialization pass first.',
  })
  @ApiParam({ name: 'report', enum: REPORT_SLUGS })
  @ApiQuery({ name: 'month', required: false, example: '2026-08' })
  @ApiOkResponse({
    schema: {
      oneOf: [
        { $ref: getSchemaPath(FinanceiroReportDto) },
        { $ref: getSchemaPath(FrequenciaReportDto) },
        { $ref: getSchemaPath(InadimplenciaReportDto) },
        { $ref: getSchemaPath(GraduacoesReportDto) },
        { $ref: getSchemaPath(LojaReportDto) },
      ],
    },
  })
  async report(
    @Param('report') report: string,
    @Query('month') month?: string,
  ) {
    const ctx = requireTenantContext(this.cls);
    return this.reports.report(ctx, report, month);
  }

  @Get(':report/csv')
  @ApiOperation({
    summary: 'The same report as a streamed CSV download',
    description:
      'UTF-8 with BOM, semicolon delimiter, decimal-comma money, ISO dates — opens correctly ' +
      'in pt-BR Excel by double-click. Content-Disposition filename `<slug>-<YYYY-MM>.csv`.',
  })
  @ApiParam({ name: 'report', enum: REPORT_SLUGS })
  @ApiQuery({ name: 'month', required: false, example: '2026-08' })
  @ApiProduces('text/csv')
  @ApiOkResponse({
    schema: { type: 'string' },
    description: 'CSV file attachment',
  })
  async reportCsv(
    @Param('report') report: string,
    @Res() res: Response,
    @Query('month') month?: string,
  ) {
    const ctx = requireTenantContext(this.cls);
    const view = await this.reports.report(ctx, report, month);
    const { filename, lines } = this.csv.render(view);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.write(CSV_BOM);
    for (const line of lines) res.write(line);
    res.end();
  }
}
