import { Megaphone, Globe } from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader.jsx';
import s from './pages.module.css';

const CONTENT = {
  ads: {
    title: 'Agente de pauta', icon: Megaphone,
    intro: 'Un agente de IA que maneja la pauta de Meta y Google de Uniform.ar, con tope de $300.000 por mes.',
    items: ['Gasto del mes contra el tope, por plataforma', 'Campañas activas, consultas al WhatsApp y estadísticas', 'Recomendaciones del agente para aprobar o rechazar', 'Activar, pausar y ajustar presupuestos desde acá'],
  },
  web: {
    title: 'Admin web', icon: Globe,
    intro: 'El panel de la web nueva de Uniform.ar: cambiás banners, productos y trabajos sin tocar código.',
    items: ['Banners y textos de la home', 'Catálogo por rubro', 'Trabajos realizados con fotos y videos', 'Consultas y pedidos de cotización'],
  },
};

export function ComingSoon({ kind }) {
  const c = CONTENT[kind];
  const Icon = c.icon;
  return (
    <>
      <PageHeader title={c.title} subtitle="Próximamente" />
      <div className={s.page}>
        <div className={s.soonCard}>
          <Icon size={28} aria-hidden style={{ color: 'var(--c-accent)' }} />
          <p>{c.intro}</p>
          <ul>{c.items.map((i) => <li key={i}>{i}</li>)}</ul>
        </div>
      </div>
    </>
  );
}
