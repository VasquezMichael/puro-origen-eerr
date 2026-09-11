import { readFileSync } from 'node:fs';

describe('comando bootstrap:admin', () => {
  it('exige compilar con Nest antes de ejecutar el artefacto con Node', () => {
    const { scripts } = JSON.parse(
      readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
    ) as { scripts: Record<string, string> };

    // Contrato del comando público; no ejecutar ni importar el bootstrap.
    // Normalizar espacios para no depender del formato del manifiesto.
    const steps = scripts['bootstrap:admin']!.split('&&').map(
      (step) => step.trim().split(/\s+/),
    );
    expect(steps).toEqual([
      ['npm', 'run', 'build'],
      ['node', 'dist/scripts/bootstrap-admin.js'],
    ]);
    expect(scripts.build!.trim().split(/\s+/)).toEqual(['nest', 'build']);
  });
});
