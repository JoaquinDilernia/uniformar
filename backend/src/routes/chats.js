import { z } from 'zod';
import { parse, uuid } from '../lib/validate.js';
import { AppError } from '../lib/errors.js';

const chatMessageSchema = z.object({ message: z.string().trim().min(1, 'Escribí la consulta').max(4000) });

// Consultas al agente (Meta en /ads, Google en /gads): cualquiera que ve la pauta puede preguntar;
// lo que proponga queda pendiente de aprobación. Solo quien edita la pauta borra conversaciones.
export function mountChatRoutes(r, { base, repo, chatReply, view, edit, missing }) {
  const needChat = (_req, _res, next) => {
    if (!chatReply) throw new AppError(503, 'AGENT_NOT_CONFIGURED', missing);
    next();
  };
  // Si el agente falla, la consulta queda guardada y se puede reintentar con /reply
  async function answer(chatId) {
    try {
      return await chatReply(chatId);
    } catch (err) {
      if (err.status) throw err;
      throw new AppError(502, 'AGENT_ERROR', `El agente no pudo contestar: ${err.message}`);
    }
  }
  const withMessages = async (id) => ({ chat: await repo.getChat(id), messages: await repo.listChatMessages(id) });

  r.get(`${base}/chats`, view, async (_req, res) => res.json({ chats: await repo.listChats() }));
  r.get(`${base}/chats/:id`, view, async (req, res) => res.json(await withMessages(parse(uuid, req.params.id))));
  r.post(`${base}/chats`, view, needChat, async (req, res) => {
    const { message } = parse(chatMessageSchema, req.body);
    const chat = await repo.createChat(message.replace(/\s+/g, ' ').slice(0, 80), req.user.id);
    await repo.addChatMessage({ chatId: chat.id, role: 'user', content: message, authorId: req.user.id });
    await answer(chat.id);
    res.status(201).json(await withMessages(chat.id));
  });
  r.post(`${base}/chats/:id/messages`, view, needChat, async (req, res) => {
    const id = parse(uuid, req.params.id);
    const { message } = parse(chatMessageSchema, req.body);
    await repo.getChat(id);
    await repo.addChatMessage({ chatId: id, role: 'user', content: message, authorId: req.user.id });
    await answer(id);
    res.json(await withMessages(id));
  });
  r.post(`${base}/chats/:id/reply`, view, needChat, async (req, res) => {
    const id = parse(uuid, req.params.id);
    await repo.getChat(id);
    await answer(id);
    res.json(await withMessages(id));
  });
  r.delete(`${base}/chats/:id`, edit, async (req, res) => {
    await repo.deleteChat(parse(uuid, req.params.id));
    res.json({ ok: true });
  });
}
