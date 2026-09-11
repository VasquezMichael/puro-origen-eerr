import { LoginForm } from './login-form';

export default function Home() {
  return (
    <main className="shell">
      <section className="brand-panel">
        <div className="brand-mark">PO</div>
        <div>
          <p className="brand-name">Puro de Origen</p>
          <p className="brand-product">Gestión EERR</p>
        </div>
        <div className="brand-message">
          <p>Información clara para tomar mejores decisiones.</p>
          <span>Controlá cada sucursal y período desde un único lugar.</span>
        </div>
      </section>
      <section className="content-panel">
        <LoginForm />
      </section>
    </main>
  );
}
