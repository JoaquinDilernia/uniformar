import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Button } from '../../components/ui/Button.jsx';
import { Spinner } from '../../components/ui/Spinner.jsx';
import { Chip, ChipGroup } from '../../components/ui/Chip.jsx';
import { Collapsible } from '../../components/ui/Collapsible.jsx';
import { Field, Textarea } from '../../components/ui/Field.jsx';
import { useConfirm } from '../../components/ui/ConfirmDialog.jsx';
import { useAnswerQuestion, useDismissQuestion, useQuestions } from './api.js';
import { when } from './format.js';
import s from './ads.module.css';

// Preguntas que el agente deja con ask_team: se contestan acá y las lee en la próxima corrida
export function AgentQuestions({ canEdit }) {
  const open = useQuestions('open');
  const answered = useQuestions('answered');
  const list = open.data ?? [];
  const done = answered.data ?? [];
  if (!open.isLoading && list.length === 0 && done.length === 0) return null;

  return (
    <section className={s.card}>
      <div className={s.cardHead}>
        <h2>El agente pregunta</h2>
        {list.length > 0 && <small>{list.length} sin responder</small>}
      </div>
      {open.isLoading && <Spinner size={20} />}
      {!open.isLoading && list.length === 0 && <p className="muted">No hay preguntas pendientes.</p>}
      {list.map((q) => <QuestionCard key={q.id} q={q} canEdit={canEdit} />)}
      {done.length > 0 && (
        <Collapsible title="Respondidas" count={done.length}>
          {done.map((q) => (
            <div key={q.id} className={s.histRow}>
              <div className={s.grow}>
                <span>{q.question}</span>
                <small className={s.answer}>{q.answer}</small>
                <small>{q.answered_by_name ?? 'Alguien del equipo'} · {when(q.answered_at)}</small>
              </div>
            </div>
          ))}
        </Collapsible>
      )}
    </section>
  );
}

function QuestionCard({ q, canEdit }) {
  const [answer, setAnswer] = useState('');
  const answerQ = useAnswerQuestion();
  const dismiss = useDismissQuestion();
  const confirm = useConfirm();
  const busy = answerQ.isPending || dismiss.isPending;
  const empty = !answer.trim();
  const send = (analyze) => answerQ.mutate({ id: q.id, answer: answer.trim(), analyze });

  async function discard() {
    const ok = await confirm({ title: '¿Descartar la pregunta?', message: 'El agente la ve como descartada y no la vuelve a hacer.', confirmLabel: 'Descartar' });
    if (ok) dismiss.mutate(q.id);
  }

  return (
    <article className={s.reco}>
      <div className={s.recoHead}><span className={s.kind}>Pregunta</span><small>{when(q.created_at)}</small></div>
      <h3>{q.question}</h3>
      {q.why && <p className="muted">{q.why}</p>}
      {canEdit && (
        <>
          {q.quick_answers?.length > 0 && (
            <ChipGroup label="Respuestas rápidas">
              {q.quick_answers.map((a) => <Chip key={a} selected={answer === a} onClick={() => setAnswer(a)}>{a}</Chip>)}
            </ChipGroup>
          )}
          <Field label="Tu respuesta">
            <Textarea value={answer} onChange={(e) => setAnswer(e.target.value)} minRows={2} maxLength={2000} />
          </Field>
          <div className={s.actions}>
            <Button size="sm" disabled={empty || busy} loading={answerQ.isPending && !answerQ.variables?.analyze} onClick={() => send(false)}>Guardar</Button>
            <Button size="sm" variant="secondary" icon={Sparkles} disabled={empty || busy} loading={answerQ.isPending && answerQ.variables?.analyze} onClick={() => send(true)}>
              Guardar y analizar ahora
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={discard}>Descartar</Button>
          </div>
        </>
      )}
    </article>
  );
}
