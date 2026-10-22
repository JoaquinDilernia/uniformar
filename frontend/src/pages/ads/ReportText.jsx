import s from './ads.module.css';

// Los textos del agente vienen con **negritas**: los mostramos respetando saltos de línea
export function ReportText({ text }) {
  return (
    <div className={s.report}>
      {text.split('\n').map((line, i) => (
        <p key={i}>{line.split(/(\*\*[^*]+\*\*)/g).map((part, j) => (part.startsWith('**') && part.endsWith('**')
          ? <strong key={j}>{part.slice(2, -2)}</strong> : part))}</p>
      ))}
    </div>
  );
}
