import { z } from 'zod';

// Mensajes de zod en español (los mensajes explícitos de cada esquema tienen prioridad)
z.setErrorMap((issue, ctx) => {
  switch (issue.code) {
    case 'invalid_type':
      return { message: issue.received === 'undefined' || issue.received === 'null' ? 'Campo obligatorio' : 'Valor inválido' };
    case 'too_small':
      if (issue.type === 'string') return { message: issue.minimum === 1 ? 'Campo obligatorio' : `Mínimo ${issue.minimum} caracteres` };
      return { message: `Mínimo ${issue.minimum}` };
    case 'too_big':
      return { message: issue.type === 'string' ? `Máximo ${issue.maximum} caracteres` : `Máximo ${issue.maximum}` };
    case 'invalid_enum_value':
      return { message: 'Opción inválida' };
    case 'invalid_string':
      if (issue.validation === 'email') return { message: 'Email inválido' };
      if (issue.validation === 'url') return { message: 'Link inválido' };
      if (issue.validation === 'uuid') return { message: 'Id inválido' };
      return { message: 'Formato inválido' };
    default:
      return { message: ctx.defaultError };
  }
});

export function parse(schema, data) {
  return schema.parse(data ?? {});
}

const blankToNull = (v) => (typeof v === 'string' ? (v.trim() === '' ? null : v.trim()) : v);
const isHttp = (u) => /^https?:\/\//i.test(u);

export const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida');
export const uuid = z.string().uuid('Id inválido');
export const optionalUrl = z.preprocess(
  blankToNull,
  z.string().url('Link inválido').max(2000).refine(isHttp, 'El link tiene que empezar con http:// o https://').nullish(),
);
export const requiredUrl = z.preprocess(
  blankToNull,
  z.string({ required_error: 'Pegá el link del resultado' }).url('Pegá un link válido').max(2000)
    .refine(isHttp, 'El link tiene que empezar con http:// o https://'),
);
// Textos largos: se conservan saltos de línea y emojis; vacío → null
export const nullableText = (max) => z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? null : v), z.string().max(max).nullish());
