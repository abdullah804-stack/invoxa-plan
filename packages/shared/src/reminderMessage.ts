import { formatDate, formatMoney } from './format.js';
import { resolveLanguage, type SupportedLanguage } from './labels.js';

/**
 * The editable reminder message (plan week 9: "Send reminder sheet with an
 * editable polite message and WhatsApp and email links").
 *
 * Nothing is sent by Invoxa. The app shows this text, the user can edit it, and
 * then chooses WhatsApp, email or the share sheet. Building it here keeps the
 * wording in the same language as the invoice.
 */

export interface ReminderMessageInput {
  clientName: string | null;
  businessName: string;
  number: string | null;
  amount: number;
  currency: string;
  dueDate: string | null;
  /** Negative when the due date has passed. */
  daysUntilDue: number;
  language?: string | null;
}

export interface ReminderMessage {
  subject: string;
  body: string;
}

interface Phrase {
  subject: (number: string) => string;
  greeting: (name: string) => string;
  overdue: (parts: Record<string, string>) => string;
  upcoming: (parts: Record<string, string>) => string;
  closing: string;
}

function phrases(language: SupportedLanguage): Phrase {
  if (language === 'es') {
    return {
      subject: (number) => `Recordatorio de pago: ${number}`,
      greeting: (name) => `Hola ${name},`,
      overdue: ({ number, amount, date, days }) =>
        `Un recordatorio amable: la factura ${number} por ${amount} venció el ${date}, hace ${days} días. Si ya está pagada, ignore este mensaje.`,
      upcoming: ({ number, amount, date }) =>
        `Un recordatorio amable: la factura ${number} por ${amount} vence el ${date}.`,
      closing: 'Gracias,',
    };
  }
  if (language === 'fr') {
    return {
      subject: (number) => `Rappel de paiement : ${number}`,
      greeting: (name) => `Bonjour ${name},`,
      overdue: ({ number, amount, date, days }) =>
        `Un rappel amical : la facture ${number} de ${amount} était due le ${date}, il y a ${days} jours. Si elle est déjà réglée, ignorez ce message.`,
      upcoming: ({ number, amount, date }) =>
        `Un rappel amical : la facture ${number} de ${amount} est due le ${date}.`,
      closing: 'Merci,',
    };
  }
  return {
    subject: (number) => `Payment reminder: ${number}`,
    greeting: (name) => `Hi ${name},`,
    overdue: ({ number, amount, date, days }) =>
      `A friendly reminder that invoice ${number} for ${amount} was due on ${date}, ${days} days ago. If it is already paid, please ignore this message.`,
    upcoming: ({ number, amount, date }) =>
      `A friendly reminder that invoice ${number} for ${amount} is due on ${date}.`,
    closing: 'Thank you,',
  };
}

export function buildReminderMessage(input: ReminderMessageInput): ReminderMessage {
  const language = resolveLanguage(input.language);
  const words = phrases(language);
  const number =
    input.number ??
    (language === 'es' ? 'sin número' : language === 'fr' ? 'sans numéro' : 'your invoice');
  const clientName = input.clientName?.trim();
  const amount = formatMoney(input.amount, input.currency, language);
  const date = input.dueDate ? formatDate(input.dueDate, language) : '';

  const parts = {
    number,
    amount,
    date,
    days: String(Math.abs(input.daysUntilDue)),
  };

  const content =
    input.daysUntilDue < 0 && input.dueDate ? words.overdue(parts) : words.upcoming(parts);

  return {
    subject: words.subject(number),
    body: [
      clientName ? words.greeting(clientName) : '',
      content,
      `${words.closing}\n${input.businessName}`,
    ]
      .filter((line) => line !== '')
      .join('\n\n'),
  };
}

/** A wa.me link that opens WhatsApp with the message filled in. */
export function whatsappShareUrl(phone: string | null | undefined, text: string): string {
  const digits = (phone ?? '').replace(/[^\d]/g, '');
  const base = digits ? `https://wa.me/${digits}` : 'https://wa.me/';
  return `${base}?text=${encodeURIComponent(text)}`;
}

/** A mailto: link with the subject and body encoded. */
export function mailtoUrl(email: string | null | undefined, subject: string, body: string): string {
  const to = (email ?? '').trim();
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(
    subject,
  )}&body=${encodeURIComponent(body)}`;
}
