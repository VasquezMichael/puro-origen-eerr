import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import {
  aggregateEerr,
  calculateEerr,
  CALCULATION_VERSION,
} from '@puro-origen/calculation-engine';
import type {
  AnalysisCalculation,
  AggregateSource,
} from '@puro-origen/calculation-engine';
import { dashboardPopulation, EERR_TIME_ZONE } from '@puro-origen/domain';
import type { EerrPeriod } from '@puro-origen/domain';
import type {
  DashboardBranch,
  DashboardResponse,
} from '@puro-origen/shared-types';
import type { AuthenticatedRequest } from '../auth/auth.guard.js';
import { BranchesService } from '../branches/branches.service.js';
import { UsersService } from '../users/users.service.js';
import type { BranchRole } from '../users/user-role.js';
import { Eerr, type EerrDocument } from './schemas/eerr.schema.js';
import {
  publicStructure,
  type StoredStructure,
} from './schemas/structure.schema.js';

type Viewer = NonNullable<AuthenticatedRequest['user']>;
type Principal = {
  isAdmin: boolean;
  branchAccesses: { branchId: string; role: BranchRole }[];
};
type Branch = { id: string; name: string; active: boolean; startDate: Date };
type Row = {
  _id: string;
  branchId: { toString(): string };
  revision?: number;
  structure?: StoredStructure | null;
  loadStatus?: DashboardBranch['loadStatus'];
};
const MAX_BRANCHES = 200;
const fullFields = '_id branchId revision structure loadStatus';
const revisionFields = '_id branchId revision';

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectModel(Eerr.name) private readonly eerrs: Model<EerrDocument>,
    private readonly branchesService: BranchesService,
    private readonly users: UsersService,
  ) {}

  async dashboard(
    period: EerrPeriod,
    viewer: Viewer,
  ): Promise<DashboardResponse> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const principal = await this.principal(viewer.sub);
      const branches = await this.branches(principal);
      const rows = await this.rows(period, branches, true);
      const response = this.build(period, principal, branches, rows);
      const checkedPrincipal = await this.principal(viewer.sub);
      const checkedBranches = await this.branches(checkedPrincipal);
      const checkedRows = await this.rows(period, checkedBranches, false);
      if (
        this.sourceKey(period, principal, branches, rows) ===
        this.sourceKey(period, checkedPrincipal, checkedBranches, checkedRows)
      )
        return response;
    }
    throw new ConflictException({
      statusCode: 409,
      code: 'ANALYTICS_SOURCES_CHANGED',
      message:
        'Cambiaron las fuentes del Dashboard; actualizá y volvé a intentar',
    });
  }

  private async principal(id: string): Promise<Principal> {
    const user = await this.users.findActiveById(id);
    if (!user) throw new UnauthorizedException('Sesión inválida o vencida');
    return {
      isAdmin: user.isAdmin,
      branchAccesses: user.branchAccesses.map((access) => ({
        branchId: access.branchId.toLowerCase(),
        role: access.role,
      })),
    };
  }

  private async branches(principal: Principal): Promise<Branch[]> {
    const result = await this.branchesService.list(principal);
    if (result.length > MAX_BRANCHES)
      throw new BadRequestException(
        `El Dashboard admite hasta ${MAX_BRANCHES} sucursales accesibles`,
      );
    return result.map(({ id, name, active, startDate }) => ({
      id,
      name,
      active,
      startDate,
    }));
  }

  private async rows(
    period: EerrPeriod,
    branches: Branch[],
    full: boolean,
  ): Promise<Row[]> {
    if (branches.length === 0) return [];
    const rows = await this.eerrs
      .find({
        year: period.year,
        month: period.month,
        branchId: { $in: branches.map((branch) => branch.id) },
      })
      .select(full ? fullFields : revisionFields)
      .lean()
      .exec();
    return rows as unknown as Row[];
  }

  private sourceKey(
    period: EerrPeriod,
    principal: Principal,
    branches: Branch[],
    rows: Row[],
  ): string {
    const byId = new Map<string, Row>();
    for (const row of rows) {
      const branchId = row.branchId.toString();
      if (byId.has(branchId)) throw this.invalidSource();
      byId.set(branchId, row);
    }
    return JSON.stringify({
      period: { year: period.year, month: period.month },
      calculationVersion: CALCULATION_VERSION,
      isAdmin: principal.isAdmin,
      accesses: [...principal.branchAccesses].sort(
        (a, b) =>
          a.branchId.localeCompare(b.branchId) || a.role.localeCompare(b.role),
      ),
      branches: [...branches]
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((branch) => {
          const row = byId.get(branch.id);
          const revision = row ? (row.revision ?? 0) : null;
          if (
            revision !== null &&
            (!Number.isSafeInteger(revision) || revision < 0)
          )
            throw this.invalidSource();
          const startDate = new Date(branch.startDate);
          if (!Number.isFinite(startDate.getTime())) throw this.invalidSource();
          return {
            id: branch.id,
            name: branch.name,
            active: branch.active,
            startDate: startDate.toISOString(),
            population: dashboardPopulation(
              period,
              startDate,
              branch.active,
              !!row,
            ),
            eerrId: row?._id ?? null,
            revision,
          };
        }),
    });
  }

  private build(
    period: EerrPeriod,
    principal: Principal,
    branches: Branch[],
    rows: Row[],
  ): DashboardResponse {
    const key = this.sourceKey(period, principal, branches, rows);
    const byId = new Map(rows.map((row) => [row.branchId.toString(), row]));
    const coverage: DashboardResponse['coverage'] = {
      expected: 0,
      withEerr: 0,
      withoutEerr: 0,
      complete: 0,
      partial: 0,
      pending: 0,
      empty: 0,
      uninitialized: 0,
      inactiveWithHistory: 0,
      inactiveWithoutHistory: 0,
      excludedNotStarted: 0,
    };
    const sources: DashboardResponse['sources'] = [];
    const items: DashboardBranch[] = [];
    const aggregateSources: AggregateSource[] = [];
    for (const branch of [...branches].sort((a, b) =>
      a.id.localeCompare(b.id),
    )) {
      const row = byId.get(branch.id);
      const revision = row ? (row.revision ?? 0) : null;
      sources.push({ branchId: branch.id, eerrId: row?._id ?? null, revision });
      const temporal = dashboardPopulation(
        period,
        new Date(branch.startDate),
        branch.active,
        !!row,
      );
      if (temporal === 'NOT_STARTED') coverage.excludedNotStarted++;
      else if (temporal === 'INACTIVE_WITHOUT_HISTORY')
        coverage.inactiveWithoutHistory++;
      else {
        coverage.expected++;
        if (!branch.active) coverage.inactiveWithHistory++;
        if (row) coverage.withEerr++;
        else coverage.withoutEerr++;
      }
      let analysis: AnalysisCalculation | null = null;
      let analysisStatus: DashboardBranch['analysisStatus'] =
        temporal === 'EXPECTED' ? 'NO_EERR' : 'EXCLUDED';
      if (temporal === 'EXPECTED' && row) {
        try {
          analysis = calculateEerr(publicStructure(row.structure), null);
        } catch {
          throw this.invalidSource();
        }
        if (!analysis.initialized) analysisStatus = 'UNINITIALIZED';
        else if (analysis.blocks.some((block) => block.status === 'EMPTY'))
          analysisStatus = 'EMPTY';
        else if (analysis.blocks.some((block) => block.status === 'PARTIAL'))
          analysisStatus = 'PARTIAL';
        else if (analysis.blocks.some((block) => block.status === 'PENDING'))
          analysisStatus = 'PENDING';
        else analysisStatus = 'COMPLETE';
        coverage[
          analysisStatus.toLowerCase() as
            'complete' | 'partial' | 'pending' | 'empty' | 'uninitialized'
        ]++;
      }
      if (temporal === 'EXPECTED')
        aggregateSources.push({ branchId: branch.id, analysis });
      const reason =
        temporal !== 'EXPECTED'
          ? temporal
          : analysisStatus === 'COMPLETE'
            ? null
            : analysisStatus;
      items.push({
        branchId: branch.id,
        name: branch.name,
        active: branch.active,
        temporal,
        eerrId: row?._id ?? null,
        revision,
        loadStatus: row?.loadStatus ?? null,
        analysisStatus,
        reason,
        blocks: analysis?.blocks ?? null,
        metrics: analysis?.metrics ?? null,
        breakEvenSales: analysis?.projections.breakEvenSales ?? null,
      });
    }
    const calculation = aggregateEerr(aggregateSources);
    return {
      year: period.year,
      month: period.month,
      timezone: EERR_TIME_ZONE,
      calculationVersion: CALCULATION_VERSION,
      scope: {
        type: principal.isAdmin ? 'GLOBAL' : 'ACCESSIBLE',
        authorizedCount: branches.length,
        expectedCount: coverage.expected,
        label: principal.isAdmin
          ? 'Consolidado global'
          : 'Consolidado de mis sucursales accesibles',
      },
      coverage,
      consolidated: {
        ...calculation,
        label: calculation.definitive
          ? 'Consolidado definitivo'
          : `Subtotal de ${calculation.includedCount} de ${coverage.expected} sucursales esperadas`,
        breakEvenAssumption:
          calculation.breakEvenSales.value === null
            ? null
            : 'Supone que se mantiene la mezcla observada de ventas y costos variables.',
      },
      branches: items,
      sources,
      sourceSignature: createHash('sha256').update(key).digest('hex'),
    };
  }

  private invalidSource() {
    return new InternalServerErrorException({
      statusCode: 500,
      code: 'INVALID_PERSISTED_DATA',
      message: 'No se pudo calcular el Dashboard con los datos guardados',
    });
  }
}
