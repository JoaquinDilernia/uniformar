import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, BookmarkPlus, ImagePlus, Lightbulb, MessageSquarePlus, RefreshCw, Send, Trash2 } from 'lucide-react';
import { usePersistentState } from '../../hooks/usePersistentState.js';
import { Button } from '../../components/ui/Button.jsx';
import { Spinner } from '../../components/ui/Spinner.jsx';
import { Chip, ChipGroup } from '../../components/ui/Chip.jsx';
import { Textarea } from '../../components/ui/Field.jsx';
import { useConfirm } from '../../components/ui/ConfirmDialog.jsx';
import { useChat, useChats, useDeleteChat, useRetryChat, useSendChat, useStartChat } from './api.js';
import { when } from './format.js';
import { ReportText } from './ReportText.jsx';
import s from './ads.module.css';

const EXAMPLES = [
  '¿Qué anuncio trae las conversaciones más baratas esta semana?',
  '¿Por qué subió el costo por conversación?',
  '¿Conviene pasar presupuesto de un conjunto a otro?',
  '¿Qué post de Instagram promocionarías?',
];
const ACTION = {
  recommendation: { icon: Lightbulb, label: 'Recomendación pendiente' },
  learning: { icon: BookmarkPlus, label: 'Aprendizaje anotado' },
  request: { icon: ImagePlus, label: 'Pieza pedida' },
};

// Consultas al agente de pauta. Solo contesta y propone: lo que sugiere queda en Recomendaciones
export function Chat({ canEdit, onGoToRecommendations }) {
  const [openId, setOpenId] = usePersistentState('ads-chat-open', null);
  return openId
    ? <Thread id={openId} canEdit={canEdit} onBack={() => setOpenId(null)} onGoToRecommendations={onGoToRecommendations} />
    : <ChatList onOpen={setOpenId} />;
}

function Composer({ onSend, busy, placeholder }) {
  const [text, setText] = useState('');
  const send = () => {
    const message = text.trim();
    if (!message || busy) return;
    onSend(message, () => setText(''));
  };
  return (
    <div className={s.composer}>
      <Textarea value={text} onChange={(e) => setText(e.target.value)} minRows={2} maxLength={4000} placeholder={placeholder}
        aria-label="Tu consulta" disabled={busy}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
      <Button icon={Send} loading={busy} disabled={!text.trim()} onClick={send}>Preguntar</Button>
    </div>
  );
}

function ChatList({ onOpen }) {
  const chats = useChats();
  const start = useStartChat();
  const [pending, setPending] = useState(null);
  const ask = (message, clear) => {
    setPending(message);
    start.mutate({ message }, {
      onSuccess: (data) => { clear(); onOpen(data.chat.id); },
      onSettled: () => setPending(null),
    });
  };
  const list = chats.data ?? [];

  return (
    <div className={s.stack}>
      <section className={s.card}>
        <div className={s.cardHead}><h2>Preguntale al agente</h2></div>
        <p className="muted">Consultá sobre la pauta con los datos de hoy. El agente no cambia nada en Meta: si recomienda algo, lo deja en Recomendaciones para aprobar.</p>
        {pending
          ? <Pending question={pending} />
          : (
            <>
              <ChipGroup label="Ejemplos">
                {EXAMPLES.map((q) => <Chip key={q} onClick={() => ask(q, () => {})}>{q}</Chip>)}
              </ChipGroup>
              <Composer onSend={ask} busy={start.isPending} placeholder="Escribí tu consulta…" />
            </>
          )}
      </section>

      <section className={s.card}>
        <div className={s.cardHead}><h2>Conversaciones</h2>{list.length > 0 && <small>{list.length}</small>}</div>
        {chats.isLoading && <Spinner size={20} />}
        {!chats.isLoading && list.length === 0 && <p className="muted">Todavía no hay consultas.</p>}
        {list.map((c) => (
          <button key={c.id} type="button" className={s.chatRow} onClick={() => onOpen(c.id)}>
            <span>{c.title || 'Consulta'}</span>
            <small>{c.created_by_name ?? 'Alguien del equipo'} · {when(c.updated_at)} · {c.message_count} mensajes</small>
          </button>
        ))}
      </section>
    </div>
  );
}

function Pending({ question }) {
  return (
    <>
      {question && <div className={`${s.bubble} ${s.mine}`}>{question}</div>}
      <p className={s.inline}><Spinner size={16} /> El agente está mirando la cuenta para contestarte…</p>
    </>
  );
}

function Thread({ id, canEdit, onBack, onGoToRecommendations }) {
  const chat = useChat(id);
  const send = useSendChat();
  const retry = useRetryChat();
  const del = useDeleteChat();
  const confirm = useConfirm();
  const [pending, setPending] = useState(null);
  const end = useRef(null);
  const messages = chat.data?.messages ?? [];
  const busy = send.isPending || retry.isPending;
  const unanswered = !busy && messages.at(-1)?.role === 'user';

  useEffect(() => { end.current?.scrollIntoView?.({ block: 'end' }); }, [messages.length, busy]);
  // Si la conversación ya no existe (la borraron), se vuelve a la lista
  useEffect(() => { if (chat.error?.status === 404) onBack(); }, [chat.error, onBack]);

  const ask = (message, clear) => {
    setPending(message);
    clear();
    send.mutate({ id, message }, { onSettled: () => setPending(null) });
  };
  async function remove() {
    const ok = await confirm({ title: '¿Borrar la conversación?', message: 'Las recomendaciones y aprendizajes que dejó el agente no se borran.', confirmLabel: 'Borrar' });
    if (ok) del.mutate(id, { onSuccess: onBack });
  }

  return (
    <section className={s.card}>
      <div className={s.cardHead}>
        <Button variant="ghost" size="sm" icon={ArrowLeft} onClick={onBack}>Conversaciones</Button>
        {canEdit && <Button variant="ghost" size="sm" icon={Trash2} onClick={remove} aria-label="Borrar conversación" />}
      </div>
      {chat.isLoading && <Spinner size={20} />}
      <div className={s.thread}>
        {messages.map((m) => (m.role === 'user'
          ? (
            <div key={m.id} className={`${s.bubble} ${s.mine}`}>
              {m.content}
              <small>{m.author_name ?? 'Alguien del equipo'} · {when(m.created_at)}</small>
            </div>
          )
          : (
            <div key={m.id} className={s.bubble}>
              <ReportText text={m.content} />
              {m.actions?.length > 0 && (
                <div className={s.chatActions}>
                  {m.actions.map((a, i) => {
                    const { icon: Icon, label } = ACTION[a.type] ?? ACTION.recommendation;
                    return (
                      <span key={a.id ?? i} className={s.kind}><Icon size={12} aria-hidden /> {label}: {a.title}</span>
                    );
                  })}
                  {m.actions.some((a) => a.type === 'recommendation') && (
                    <Button variant="ghost" size="sm" onClick={onGoToRecommendations}>Ver en Recomendaciones</Button>
                  )}
                </div>
              )}
              <small>Agente · {when(m.created_at)}</small>
            </div>
          )))}
        {busy && <Pending question={pending} />}
        {unanswered && (
          <div className={s.alert}>
            No pude contestar esta consulta.
            <Button variant="ghost" size="sm" icon={RefreshCw} onClick={() => retry.mutate({ id })}>Reintentar</Button>
          </div>
        )}
        <div ref={end} />
      </div>
      <Composer onSend={ask} busy={busy || unanswered} placeholder="Seguí la charla…" />
    </section>
  );
}
