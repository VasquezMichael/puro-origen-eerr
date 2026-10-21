import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  UnauthorizedException,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { Types, type Model } from 'mongoose';
import ExcelJS from '@protobi/exceljs';
import PDFDocument from 'pdfkit';
import request from 'supertest';
import {
  describe,
  beforeAll,
  afterAll,
  beforeEach,
  expect,
  it,
  vi,
} from 'vitest';
import { initialNodes, emptyAmount } from '@puro-origen/domain';
import { BranchesService } from '../../branches/branches.service.js';
import type { AuthenticatedRequest } from '../../auth/auth.guard.js';
import { BranchRole } from '../../users/user-role.js';
import { EerrService } from '../eerr.service.js';
import { EerrClock } from '../eerr-clock.js';
import {
  Eerr,
  EerrLoadStatus,
  type EerrDocument,
} from '../schemas/eerr.schema.js';
import { storedStructure } from '../schemas/structure.schema.js';
import { ExportController } from './export.controller.js';
import { ExportService } from './export.service.js';
import { XLSX_MIME } from './export-xlsx.js';
import { PDF_MIME } from './export-pdf.js';

const branchId = '123456789012345678901234';
const id = randomUUID();
const nodes = initialNodes([], randomUUID);
nodes.push({
  nodeId: randomUUID(),
  code: randomUUID(),
  parentId: nodes[0]!.nodeId,
  position: 0,
  name: 'Venta',
  kind: 'ITEM',
  amount: { ...emptyAmount(), state: 'CARGADO', input: '25', value: '25.00' },
});
const structure = storedStructure({
  schemaVersion: 1,
  structureVersion: 1,
  initializedAt: '2026-09-01T00:00:00Z',
  initializedBy: 'test',
  nodes,
});

class TestGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const role = req.headers['x-test-role'];
    if (typeof role !== 'string') throw new UnauthorizedException();
    req.user = {
      sub: '222222222222222222222222',
      isAdmin: role === 'admin',
      branchAccesses:
        role.includes('assigned') && !role.includes('unassigned')
          ? [
              {
                branchId,
                role: role.startsWith('editor')
                  ? BranchRole.EDITOR
                  : BranchRole.READER,
              },
            ]
          : [],
    };
    return true;
  }
}

describe('GET /eerr/:id/export/xlsx aislado', () => {
  let app: INestApplication;
  let deletedAt: Date | null;
  let lifecycleStatus: 'OPEN' | 'CLOSED' | undefined;
  let currentStructure = structure;
  let reads = 0;
  const row = () =>
    ({
      _id: id,
      branchId: new Types.ObjectId(branchId),
      year: 2026,
      month: 9,
      revision: 5,
      loadStatus: EerrLoadStatus.PARCIAL,
      lifecycleStatus,
      deletedAt,
      structure: currentStructure,
      note: 'Nota',
      salesGoal: null,
    }) as EerrDocument;

  beforeAll(async () => {
    const branches = {
      list: async (viewer: NonNullable<AuthenticatedRequest['user']>) =>
        viewer.isAdmin ||
        viewer.branchAccesses.some((access) => access.branchId === branchId)
          ? [{ id: branchId, name: 'Calle 13' }]
          : [],
      get: async () => ({ id: branchId, name: 'Calle 13' }),
    };
    const model = {
      findOne: (filter: {
        _id: string;
        branchId: { $in: string[] };
        deletedAt: null;
      }) => ({
        exec: async () => {
          reads++;
          return filter._id === id &&
            filter.branchId.$in.includes(branchId) &&
            filter.deletedAt === null &&
            deletedAt === null
            ? row()
            : null;
        },
      }),
    };
    const module = await Test.createTestingModule({
      controllers: [ExportController],
      providers: [
        ExportService,
        EerrService,
        { provide: APP_GUARD, useClass: TestGuard },
        { provide: BranchesService, useValue: branches },
        { provide: EerrClock, useValue: { now: () => new Date() } },
        {
          provide: getModelToken(Eerr.name),
          useValue: model as unknown as Model<EerrDocument>,
        },
      ],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => {
    deletedAt = null;
    lifecycleStatus = 'CLOSED';
    currentStructure = structure;
    reads = 0;
  });

  it.each(['admin', 'editor-assigned', 'reader-assigned'])(
    '%s puede exportar CLOSED',
    async (role) => {
      const res = await request(app.getHttpServer())
        .get(`/eerr/${id}/export/xlsx`)
        .set('x-test-role', role)
        .expect(200);
      expect(res.headers['content-type']).toContain(XLSX_MIME);
      expect(res.headers['content-disposition']).toBe(
        'attachment; filename="EERR_CALLE-13_2026-09.xlsx"',
      );
      expect(res.headers['cache-control']).toBe('private, no-store');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(reads).toBe(1);
    },
  );

  it.each(['editor-unassigned', 'reader-unassigned'])(
    '%s no accede a otra sucursal',
    async (role) => {
      await request(app.getHttpServer())
        .get(`/eerr/${id}/export/xlsx`)
        .set('x-test-role', role)
        .expect(404);
    },
  );

  it('requiere sesión, oculta soft-deleted y normaliza legacy OPEN', async () => {
    await request(app.getHttpServer())
      .get(`/eerr/${id}/export/xlsx`)
      .expect(401);
    deletedAt = new Date();
    await request(app.getHttpServer())
      .get(`/eerr/${id}/export/xlsx`)
      .set('x-test-role', 'admin')
      .expect(404);
    deletedAt = null;
    lifecycleStatus = undefined;
    const res = await request(app.getHttpServer())
      .get(`/eerr/${id}/export/xlsx`)
      .set('x-test-role', 'reader-assigned')
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => callback(null, Buffer.concat(chunks)));
        response.on('error', callback);
      })
      .expect(200);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(new Uint8Array(res.body as Buffer).buffer);
    expect(workbook.getWorksheet('EERR')!.getCell('B4').value).toBe('Abierto');
  });

  it('rechaza con 422 un subtotal que excede la precisión de Excel', async () => {
    const many = initialNodes([], randomUUID);
    for (let index = 0; index < 11; index++)
      many.push({
        nodeId: randomUUID(),
        code: randomUUID(),
        parentId: many[0]!.nodeId,
        position: index,
        name: `Venta ${index}`,
        kind: 'ITEM',
        amount: {
          ...emptyAmount(),
          state: 'CARGADO',
          input: '999999999999.99',
          value: '999999999999.99',
        },
      });
    currentStructure = storedStructure({
      schemaVersion: 1,
      structureVersion: 1,
      initializedAt: '2026-09-01T00:00:00Z',
      initializedBy: 'test',
      nodes: many,
    });
    const res = await request(app.getHttpServer())
      .get(`/eerr/${id}/export/xlsx`)
      .set('x-test-role', 'admin')
      .expect(422);
    expect(res.body.code).toBe('EXPORT_PRECISION_LIMIT');
    expect(res.headers['content-type']).toContain('application/json');
    expect(res.headers['content-type']).not.toContain(XLSX_MIME);
    expect(res.headers['content-disposition']).toBeUndefined();
    expect(res.body).toEqual({
      statusCode: 422,
      code: 'EXPORT_PRECISION_LIMIT',
      message: expect.any(String),
    });
    expect(reads).toBe(1);
  });

  it.each(['admin', 'editor-assigned', 'reader-assigned'])(
    '%s exporta PDF de CLOSED con una sola lectura y headers seguros',
    async (role) => {
      const res = await request(app.getHttpServer())
        .get(`/eerr/${id}/export/pdf`)
        .set('x-test-role', role)
        .buffer(true)
        .parse((response, callback) => {
          const chunks: Buffer[] = [];
          response.on('data', (chunk: Buffer) => chunks.push(chunk));
          response.on('end', () => callback(null, Buffer.concat(chunks)));
          response.on('error', callback);
        })
        .expect(200);
      expect(res.headers['content-type']).toContain(PDF_MIME);
      expect(res.headers['content-disposition']).toBe(
        'attachment; filename="EERR_CALLE-13_2026-09.pdf"',
      );
      expect(res.headers['cache-control']).toBe('private, no-store');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect((res.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
      expect(reads).toBe(1);
    },
  );

  it.each(['editor-unassigned', 'reader-unassigned'])(
    '%s no exporta PDF de otra sucursal',
    async (role) => {
      await request(app.getHttpServer())
        .get(`/eerr/${id}/export/pdf`)
        .set('x-test-role', role)
        .expect(404);
    },
  );

  it('PDF oculta soft-deleted y acepta lifecycle legacy OPEN', async () => {
    deletedAt = new Date();
    await request(app.getHttpServer())
      .get(`/eerr/${id}/export/pdf`)
      .set('x-test-role', 'admin')
      .expect(404);
    deletedAt = null;
    lifecycleStatus = undefined;
    const res = await request(app.getHttpServer())
      .get(`/eerr/${id}/export/pdf`)
      .set('x-test-role', 'reader-assigned')
      .expect(200);
    expect(res.headers['content-type']).toContain(PDF_MIME);
  });

  it('un fallo de PDFKit devuelve 500 controlado sin descarga parcial', async () => {
    const failure = vi
      .spyOn(PDFDocument.prototype, 'addPage')
      .mockImplementation(() => {
        throw new Error('fallo simulado de PDFKit');
      });
    try {
      const res = await request(app.getHttpServer())
        .get(`/eerr/${id}/export/pdf`)
        .set('x-test-role', 'admin')
        .expect(500);
      expect(res.body).toEqual({
        statusCode: 500,
        code: 'PDF_RENDER_FAILED',
        message: 'No se pudo generar el PDF del EERR',
      });
      expect(res.headers['content-type']).toContain('application/json');
      expect(res.headers['content-disposition']).toBeUndefined();
      expect(reads).toBe(1);
    } finally {
      failure.mockRestore();
    }
  });
});
