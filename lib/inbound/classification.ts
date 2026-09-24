/**
 * Inbound Email Classification Engine
 *
 * Enforces strict qualification rules:
 * 1. Do not consider bounce emails as reply.
 * 2. Do not consider invalid / incorrect email notification as reply.
 * 3. Do not consider away messages as a hot lead or reply.
 * 4. Only if a revert asking for more info, further communication, company profile or a meaningful response should be considered as reply.
 * 5. If a client shows interest to know more or requesting more information should be considered as hot leads.
 */

export type InboundClassification = {
  isBounce: boolean;
  isInvalidEmail: boolean;
  isAwayMessage: boolean;
  isMeaningfulReply: boolean;
  isHotLead: boolean;
  category: "BOUNCE" | "INVALID_EMAIL" | "AWAY_MESSAGE" | "HOT_LEAD" | "STANDARD_REPLY" | "IGNORE";
  reason: string;
};

// Patterns indicating a Bounce or NDR (Non-Delivery Report)
const BOUNCE_PATTERNS = [
  /delivery\s*status\s*notification/i,
  /failure\s*notice/i,
  /undelivered\s*mail/i,
  /returned\s*mail/i,
  /mail\s*delivery\s*failed/i,
  /message\s*rejected/i,
  /message\s*blocked/i,
  /permanent\s*error/i,
  /diagnostic-code/i,
  /55[0-9]\s+/i,
  /5\.1\.[0-9]/i,
  /smtp;\s*5/i,
  /could\s*not\s*be\s*delivered/i,
  /action:\s*failed/i,
  /status:\s*5\./i,
];

// Patterns indicating an Invalid or Incorrect Mailbox
const INVALID_EMAIL_PATTERNS = [
  /address\s*not\s*found/i,
  /user\s*unknown/i,
  /recipient\s*address\s*rejected/i,
  /address\s*rejected/i,
  /mailbox\s*unavailable/i,
  /mailbox\s*not\s*found/i,
  /account\s*does\s*not\s*exist/i,
  /no\s*such\s*(user|recipient|mailbox)/i,
  /invalid\s*(recipient|mailbox|address)/i,
  /recipient\s*not\s*found/i,
  /the\s*email\s*account\s*that\s*you\s*tried\s*to\s*reach\s*does\s*not\s*exist/i,
  /does\s*not\s*exist/i,
  /550\s*5\.1\.1/i,
];

// Patterns indicating an Out-of-Office or Away Auto-Responder
const AWAY_MESSAGE_PATTERNS = [
  /out\s*of\s*(the\s*)?office/i,
  /automatic\s*reply/i,
  /auto-?reply/i,
  /auto\s*response/i,
  /away\s*from\s*(my\s*)?(office|desk)/i,
  /currently\s*away/i,
  /on\s*leave/i,
  /on\s*annual\s*leave/i,
  /on\s*vacation/i,
  /on\s*holiday/i,
  /maternity\s*leave/i,
  /paternity\s*leave/i,
  /medical\s*leave/i,
  /out\s*of\s*station/i,
  /i\s*am\s*(currently\s*)?(out|away)/i,
  /i\s*will\s*(be\s*)?(returning|back)\s*(on|after)/i,
  /vacation\s*responder/i,
  /limited\s*access\s*to\s*email/i,
];

// Patterns indicating Hot Lead Interest (Rule 5: Client shows interest to know more or requests more information)
const HOT_LEAD_INTEREST_PATTERNS = [
  /share\s*(the\s*|your\s*)?(company\s*)?profile/i,
  /send\s*(the\s*|your\s*)?(company\s*)?profile/i,
  /send\s*(me\s*)?(more\s*)?(details|info|information)/i,
  /share\s*(more\s*)?(details|info|information)/i,
  /interested/i,
  /more\s*information/i,
  /tell\s*me\s*more/i,
  /send\s*(a\s*)?(quote|quotation|proposal|rates?|pricing|deck|brochure|presentation)/i,
  /share\s*(a\s*)?(quote|quotation|proposal|rates?|pricing|deck|brochure|presentation)/i,
  /what\s*(are\s*)?(the\s*)?(charges|costs?|rates?|pricing)/i,
  /let('s|\s*us)\s*(connect|talk|discuss|meet)/i,
  /call\s*(me|us)/i,
  /schedule\s*(a\s*)?(call|meeting|demo)/i,
  /book\s*(a\s*)?(call|meeting)/i,
  /site\s*(visit|audit|inspection)/i,
  /can\s*you\s*(provide|arrange|share|send)/i,
  /please\s*(share|send|provide)/i,
  /would\s*like\s*to\s*know/i,
  /looking\s*for/i,
  /require\s*(services?|facility|security|manpower)/i,
];

// Patterns indicating an automated system or unsubscribe notification
const UNSUBSCRIBE_OR_OPT_OUT_PATTERNS = [
  /^(\s*unsubscribe\s*|\s*stop\s*|\s*remove\s*me\s*)$/i,
  /please\s*unsubscribe/i,
  /remove\s*(my\s*email|from\s*your\s*list)/i,
  /do\s*not\s*email\s*again/i,
  /not\s*interested/i,
];

/**
 * Classifies an incoming email according to strict deliverability and lead qualification guidelines.
 */
export function classifyInboundEmail(args: {
  subject?: string | null;
  body?: string | null;
  fromAddr?: string | null;
  headers?: Record<string, any>;
}): InboundClassification {
  const subject = (args.subject || "").trim();
  const body = (args.body || "").trim();
  const fromAddr = (args.fromAddr || "").toLowerCase().trim();
  const fullText = `${subject} \n ${body}`.trim();

  // 1. Check for NDR / System Bounces
  const isSenderDaemon =
    fromAddr.includes("mailer-daemon") ||
    fromAddr.includes("postmaster") ||
    fromAddr.includes("bounce") ||
    fromAddr.includes("noreply") ||
    fromAddr.includes("no-reply");

  const hasBounceText = BOUNCE_PATTERNS.some((regex) => regex.test(fullText));
  const hasInvalidEmailText = INVALID_EMAIL_PATTERNS.some((regex) => regex.test(fullText));

  if (hasInvalidEmailText) {
    return {
      isBounce: true,
      isInvalidEmail: true,
      isAwayMessage: false,
      isMeaningfulReply: false,
      isHotLead: false,
      category: "INVALID_EMAIL",
      reason: "Invalid/incorrect email notification (mailbox unknown, does not exist, or rejected).",
    };
  }

  if (isSenderDaemon || (hasBounceText && fullText.length < 2000)) {
    return {
      isBounce: true,
      isInvalidEmail: false,
      isAwayMessage: false,
      isMeaningfulReply: false,
      isHotLead: false,
      category: "BOUNCE",
      reason: "Delivery status failure or non-delivery bounce report (NDR).",
    };
  }

  // 2. Check for Away / Out of Office / Vacation Auto-responders
  const isAutoSubmitted =
    args.headers?.["auto-submitted"] &&
    args.headers["auto-submitted"].toString().toLowerCase() !== "no";
  const hasAwayText = AWAY_MESSAGE_PATTERNS.some((regex) => regex.test(subject) || regex.test(body.slice(0, 500)));

  if (hasAwayText || isAutoSubmitted) {
    return {
      isBounce: false,
      isInvalidEmail: false,
      isAwayMessage: true,
      isMeaningfulReply: false,
      isHotLead: false,
      category: "AWAY_MESSAGE",
      reason: "Automated out-of-office, leave, or away auto-responder message.",
    };
  }

  // 3. Check for Unsubscribe / Opt-Out
  if (UNSUBSCRIBE_OR_OPT_OUT_PATTERNS.some((regex) => regex.test(fullText))) {
    return {
      isBounce: false,
      isInvalidEmail: false,
      isAwayMessage: false,
      isMeaningfulReply: false,
      isHotLead: false,
      category: "IGNORE",
      reason: "Prospect requested unsubscribe or opted out.",
    };
  }

  // 4. Check for Hot Lead Signals (Rule 5: Asking for more info, company profile, pricing, etc.)
  const showsInterest = HOT_LEAD_INTEREST_PATTERNS.some((regex) => regex.test(fullText));
  if (showsInterest) {
    return {
      isBounce: false,
      isInvalidEmail: false,
      isAwayMessage: false,
      isMeaningfulReply: true,
      isHotLead: true,
      category: "HOT_LEAD",
      reason: "Prospect showed clear buying interest, requested company profile, or asked for more information.",
    };
  }

  // 5. Meaningful Human Response Check (Rule 4)
  // Must be more than 5 characters of human reply and not just auto-acknowledgment
  const cleanBody = body.replace(/[\r\n\t]+/g, " ").trim();
  const isMeaningful =
    cleanBody.length >= 8 &&
    !/thank\s*you\s*for\s*contacting|we\s*have\s*received\s*your\s*ticket|this\s*is\s*an\s*automated\s*email/i.test(
      cleanBody
    );

  if (isMeaningful) {
    return {
      isBounce: false,
      isInvalidEmail: false,
      isAwayMessage: false,
      isMeaningfulReply: true,
      isHotLead: false,
      category: "STANDARD_REPLY",
      reason: "Prospect provided a meaningful human reply/inquiry.",
    };
  }

  // Default fallback for very short or unclassified content
  return {
    isBounce: false,
    isInvalidEmail: false,
    isAwayMessage: false,
    isMeaningfulReply: false,
    isHotLead: false,
    category: "IGNORE",
    reason: "Message does not contain a meaningful response or actionable inquiry.",
  };
}
