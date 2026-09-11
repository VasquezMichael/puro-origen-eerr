import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Model, Mongoose } from 'mongoose';
import { BranchesService } from './branches.service.js';
import { BranchSchema, BranchDocument } from './schemas/branch.schema.js';
import { normalizeBranchName } from './branch-name.js';

const id = '123456789012345678901234';
const otherId = 'abcdefabcdefabcdefabcdef';
const admin = { isAdmin: true, branchAccesses: [] };
const reader = { isAdmin: false, branchAccesses: [{ branchId: id }] };
const BranchModel = new Mongoose().model('BranchUnit', BranchSchema);

describe('BranchesService sin persistencia externa', () => {
  const model = {
    create: vi.fn(),
    find: vi.fn(),
    findById: vi.fn(),
    findByIdAndUpdate: vi.fn(),
    countDocuments: vi.fn(),
  };
  const service = new BranchesService(
    model as unknown as Model<BranchDocument>,
  );
  let branch: BranchDocument;

  beforeEach(() => {
    vi.resetAllMocks();
    branch = new BranchModel({
      _id: id,
      name: 'Centro',
      normalizedName: 'centro',
    });
    model.create.mockImplementation(async (input) => new BranchModel(input));
    model.findById.mockReturnValue({ exec: async () => branch });
    model.findByIdAndUpdate.mockImplementation((_id, update) => ({
      exec: async () => {
        Object.assign(branch, update.$set);
        return branch;
      },
    }));
  });

  it('genera códigos aleatorios distintos y estables, crea activa y usa fecha de creación', async () => {
    const first = await service.create({ name: 'Centro' });
    const second = await service.create({ name: 'Centro' });
    expect(first.code).toMatch(/^SUC-[a-f\d-]{36}$/);
    expect(first.code).not.toBe(second.code);
    expect(first.active).toBe(true);
    expect(first.startDate).toEqual(first.createdAt);
    expect(first).not.toHaveProperty('normalizedName');
    expect(first).not.toHaveProperty('_id');
  });

  it('respeta una fecha de inicio explícita y normaliza el nombre', async () => {
    const result = await service.create({
      name: '  SAN   Marti\u0301n  ',
      startDate: '2020-01-02',
    });
    expect(result.name).toBe('SAN Martín');
    expect(result.startDate).toEqual(new Date('2020-01-02'));
    expect(model.create.mock.calls[0][0].normalizedName).toBe('san martin');
    expect(normalizeBranchName('ＳＡＮ  MARTÍN')).toBe('san martin');
  });

  it.each(['create', 'update'] as const)(
    'convierte colisión del índice de nombre en 409 al %s',
    async (operation) => {
      const collision = { code: 11000, keyPattern: { normalizedName: 1 } };
      model.create.mockRejectedValue(collision);
      model.findByIdAndUpdate.mockReturnValue({
        exec: async () => {
          throw collision;
        },
      });
      await expect(
        operation === 'create'
          ? service.create({ name: 'Centro' })
          : service.update(id, { name: 'Centro' }),
      ).rejects.toBeInstanceOf(ConflictException);
    },
  );

  it('maneja también una colisión de código y no oculta otros errores', async () => {
    model.create.mockRejectedValueOnce({
      code: 11000,
      keyPattern: { code: 1 },
    });
    await expect(service.create({ name: 'Centro' })).rejects.toThrow(
      'código único',
    );
    model.create.mockRejectedValueOnce(new Error('fallo simulado'));
    await expect(service.create({ name: 'Centro' })).rejects.toThrow(
      'fallo simulado',
    );
  });

  it('actualiza nombre y fecha sin modificar código, id ni estado', async () => {
    const code = branch.code;
    const result = await service.update(id, {
      name: '  Norte ',
      startDate: '2021-02-03',
    });
    expect(result).toMatchObject({
      id,
      code,
      name: 'Norte',
      active: true,
      startDate: new Date('2021-02-03'),
    });
    expect(model.findByIdAndUpdate.mock.calls[0][1]).toEqual({
      $set: {
        name: 'Norte',
        normalizedName: 'norte',
        startDate: new Date('2021-02-03'),
      },
    });
    // La protección immutable de Mongoose se comprueba también en el esquema.
    expect(BranchSchema.path('code').options.immutable).toBe(true);
  });

  it('desactiva, conserva datos, evita una escritura repetida y reactiva', async () => {
    const code = branch.code;
    expect(await service.setStatus(id, false)).toMatchObject({
      active: false,
      name: 'Centro',
      code,
    });
    await service.setStatus(id, false);
    expect(model.findByIdAndUpdate).toHaveBeenCalledTimes(1);
    expect(await service.setStatus(id, true)).toMatchObject({
      active: true,
      code,
    });
    await service.setStatus(id, true);
    expect(model.findByIdAndUpdate).toHaveBeenCalledTimes(2);
  });

  it('lista todas para administrador y filtra por asignación sin excluir inactivas', async () => {
    branch.active = false;
    model.find.mockReturnValue({
      sort: () => ({ exec: async () => [branch] }),
    });
    expect(await service.list(reader)).toEqual([
      expect.objectContaining({ id, active: false }),
    ]);
    expect(model.find).toHaveBeenLastCalledWith({ _id: { $in: [id] } });
    await service.list(admin);
    expect(model.find).toHaveBeenLastCalledWith({});
    await service.list({ isAdmin: false, branchAccesses: [] });
    expect(model.find).toHaveBeenLastCalledWith({ _id: { $in: [] } });
  });

  it('autoriza asignación o administrador y rechaza sucursal no asignada', async () => {
    await expect(service.get(id, admin)).resolves.toMatchObject({ id });
    await expect(service.get(id, reader)).resolves.toMatchObject({ id });
    await expect(service.get(otherId, reader)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('devuelve 404 si no existe', async () => {
    model.findById.mockReturnValue({ exec: async () => null });
    model.findByIdAndUpdate.mockReturnValue({ exec: async () => null });
    await expect(service.get(id, admin)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.update(id, {})).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.setStatus(id, false)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('rechaza ids inválidos antes de consultar persistencia', async () => {
    await expect(service.get('no-es-id', admin)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.update('no-es-id', {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.setStatus('no-es-id', true)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(model.findById).not.toHaveBeenCalled();
    expect(model.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('valida accesos existentes, admite inactivas y rechaza duplicados y ausentes', async () => {
    model.countDocuments.mockReturnValue({ exec: async () => 1 });
    await expect(
      service.validateAccesses([{ branchId: otherId.toUpperCase() }]),
    ).resolves.toEqual([otherId]);
    expect(model.countDocuments).toHaveBeenCalledWith({
      _id: { $in: [otherId] },
    });
    await expect(
      service.validateAccesses([
        { branchId: otherId },
        { branchId: otherId.toUpperCase() },
      ]),
    ).rejects.toThrow('más de una vez');
    await expect(
      service.validateAccesses([{ branchId: 'bad' }]),
    ).rejects.toBeInstanceOf(BadRequestException);
    model.countDocuments.mockReturnValue({ exec: async () => 0 });
    await expect(service.validateAccesses([{ branchId: id }])).rejects.toThrow(
      'no existen',
    );
    await expect(service.validateAccesses([])).resolves.toEqual([]);
  });
});
