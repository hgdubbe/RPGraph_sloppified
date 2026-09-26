import type {
  MessageRecord,
  RpAppointment,
  RpDateTimeFormat,
  RpWeekdayLanguage,
  TurnRecord,
} from '../types';
import { formatRpDateTime, formatRpDateTimeParts } from '../workflow';
import { socialAppNames } from '../chat/socialMedia';

/** Turn-type marker shapes, per the timeline rail's shape-only vocabulary.
 * User and character/AI turns intentionally share the same 'circle' shape
 * (per explicit design direction: don't distinguish user vs. character in
 * the marker symbolism). `hollow` (planned/placeholder turn) is unreachable
 * this pass -- we don't generate placeholder turn records yet -- but is kept
 * in the union so a future caller can't crash the renderer by requesting it.
 * There is no "system/tool-agent" marker: `TurnRecordMode` only has
 * 'user' | 'auto-turn' | 'narrator', so that case is intentionally absent,
 * not defaulted away. */
export type RailTurnMarkerShape = 'circle' | 'group' | 'triangle' | 'hollow';

/** In-fiction app identity for the medium marker, reusing the same app
 * roster/icons as `PhoneAppSwitcherStrip` (WhatsUp/Fotogram/OnlyFriends/
 * MatchMe/Banking) instead of generic category icons. */
export type RailMediumKind = 'in-person' | 'narration' | 'whatsup' | 'fotogram' | 'onlyfriends' | 'matchme' | 'banking';

type RailMedium = {
  kind: RailMediumKind;
  label: string;
};

type RailAttachmentCounts = {
  images: number;
  voiceClips: number;
};

type RailHistoryBadges = {
  /** Count of 'Regenerate'-labeled variants. */
  reroll: number;
  /** Count of 'Reflavor'-labeled variants. */
  rephrase: number;
};

export type TimelineRailTurnNode = {
  kind: 'turn';
  id: string;
  turnNumber: number;
  sequenceLabel: string;
  markerShape: RailTurnMarkerShape;
  speakerLabel: string;
  medium?: RailMedium;
  /** Diegetic time-of-day if tracked, else a non-blank fallback -- never empty. */
  rpTimestamp: string;
  hasRpDateTime: boolean;
  /** "+2m"/"+3h" etc. since the previous tracked turn; undefined when this
   * or the previous turn has no tracked rpDateTime to diff against. */
  relativeLabel?: string;
  attachments: RailAttachmentCounts;
  badges: RailHistoryBadges;
  isCurrent: boolean;
  dayKey?: string;
};

export type TimelineRailEventNode = {
  kind: 'event';
  id: string;
  title: string;
  rpTimestamp: string;
  /** true = filled flag (occurred), false = hollow flag (planned/future). */
  occurred: boolean;
  /** Best-effort anchor turn id for an occurred event; anchoring accuracy is
   * explicitly deferred, this is just whatever `sourceTurnId` says. */
  anchorTurnId?: string;
  dayKey?: string;
  event: RpAppointment;
};

export type TimelineRailNode = TimelineRailTurnNode | TimelineRailEventNode;

export type TimelineRailSection = {
  /** undefined when the session has no tracked in-roleplay clock at all --
   * render a flat list with no section header in that case. */
  dayKey?: string;
  label?: string;
  /** Turn count for the section header, or "planned" when the section has
   * no real turns yet (only future/planned events scheduled for that day). */
  turnCount: number;
  isPlanned: boolean;
  nodes: TimelineRailNode[];
};

function turnMessages(turn: TurnRecord): MessageRecord[] {
  return [...turn.input.messages, ...turn.output.messages];
}

function messageMedium(message: MessageRecord): RailMedium | undefined {
  if (message.socialPost) {
    const app = message.socialPost.app;
    return { kind: app, label: socialAppNames[app] };
  }
  if (message.socialDirectMessage) {
    const app = message.socialDirectMessage.app;
    return { kind: app, label: socialAppNames[app] };
  }
  if (message.bankTransfer) {
    return { kind: 'banking', label: 'Banking' };
  }
  if (message.channel === 'phone' || message.phoneMessage) {
    return { kind: 'whatsup', label: 'WhatsUp' };
  }
  return undefined;
}

/** App-aware medium detection, reusing the same in-fiction app roster as the
 * phone's own app switcher (WhatsUp/Fotogram/OnlyFriends/MatchMe/Banking)
 * rather than generic category icons. Narrator turns are always tagged
 * "Narration" regardless of message content. First non-default medium found
 * across the turn's messages wins; falls back to the plain in-person speech
 * bubble when the turn has messages but none carry a more specific medium.
 * Omits the slot entirely (returns undefined) only when the turn has no
 * messages at all to read a medium from. */
function turnMedium(turn: TurnRecord): RailMedium | undefined {
  if (turn.mode === 'narrator') {
    return { kind: 'narration', label: 'Narration' };
  }
  const messages = turnMessages(turn);
  if (messages.length === 0) {
    return undefined;
  }
  const specific = messages.map(messageMedium).find((medium): medium is RailMedium => !!medium);
  return specific ?? { kind: 'in-person', label: 'In-person' };
}

function turnSpeakerNames(turn: TurnRecord): string[] {
  const names = new Set<string>();
  // A 'user' turn's played character is stamped on the input message (the
  // output is the AI's reply, a different speaker); every other mode's
  // speaker lives on the output. Fall back to the other side if the
  // preferred one carried no speaker info.
  const ordered = turn.mode === 'user'
    ? [...turn.input.messages, ...turn.output.messages]
    : [...turn.output.messages, ...turn.input.messages];
  for (const message of ordered) {
    const messageNames = message.speakerNames ?? (message.speakerName ? [message.speakerName] : []);
    messageNames.forEach((name) => names.add(name));
  }
  return [...names];
}

function turnMarkerShape(turn: TurnRecord): RailTurnMarkerShape {
  if (turn.mode === 'narrator') {
    return 'triangle';
  }
  const speakerNames = turnSpeakerNames(turn);
  return speakerNames.length > 1 ? 'group' : 'circle';
}

function turnSpeakerLabel(turn: TurnRecord): string {
  if (turn.mode === 'narrator') {
    return 'Narrator';
  }
  const speakerNames = turnSpeakerNames(turn);
  if (speakerNames.length === 0) {
    return 'Character';
  }
  return speakerNames.join(', ');
}

function messageRpDateTime(message: MessageRecord): string | undefined {
  return message.rpDateTime;
}

/** First tracked rpDateTime on the turn's messages (output first, since
 * that's usually where the workflow's History node stamps the time). */
function turnRpDateTime(turn: TurnRecord): string | undefined {
  const ordered = [...turn.output.messages, ...turn.input.messages];
  for (const message of ordered) {
    const value = messageRpDateTime(message);
    if (value) {
      return value;
    }
  }
  return undefined;
}

function turnDayKey(turn: TurnRecord): string | undefined {
  return turnRpDateTime(turn)?.slice(0, 10);
}

/** Time-of-day only (the section header already carries the day), respecting
 * the user's 12h/24h format preference. Falls back to the full formatted
 * value if the ISO shape doesn't parse, then to a non-blank turn label --
 * this slot must never render blank. */
function turnRpTimestampLabel(
  turn: TurnRecord,
  rpDateTimeFormat?: RpDateTimeFormat,
  rpWeekdayLanguage?: RpWeekdayLanguage,
): { text: string; tracked: boolean } {
  const rpDateTime = turnRpDateTime(turn);
  if (rpDateTime) {
    const parts = formatRpDateTimeParts(rpDateTime, rpDateTimeFormat, rpWeekdayLanguage);
    if (parts?.time) {
      return { text: parts.time, tracked: true };
    }
    const formatted = formatRpDateTime(rpDateTime, rpDateTimeFormat, rpWeekdayLanguage);
    if (formatted) {
      return { text: formatted, tracked: true };
    }
  }
  // Slot must never render blank -- fall back to a non-blank label that
  // reads distinctly from the separate sequence-index slot ("#N").
  return { text: `Turn ${turn.number}`, tracked: false };
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** Compact "+2m"/"+3h"/"+1d" delta since the previous tracked turn. Roleplay
 * time can jump or run non-linearly, so this reports the plain elapsed
 * magnitude rather than assuming forward-only progression. */
function relativeDeltaLabel(fromIso: string, toIso: string): string | undefined {
  const from = Date.parse(fromIso);
  const to = Date.parse(toIso);
  if (Number.isNaN(from) || Number.isNaN(to)) {
    return undefined;
  }
  const deltaMs = Math.abs(to - from);
  if (deltaMs < MINUTE_MS) {
    return undefined;
  }
  if (deltaMs < HOUR_MS) {
    return `+${Math.round(deltaMs / MINUTE_MS)}m`;
  }
  if (deltaMs < DAY_MS) {
    return `+${Math.round(deltaMs / HOUR_MS)}h`;
  }
  return `+${Math.round(deltaMs / DAY_MS)}d`;
}

function turnAttachmentCounts(turn: TurnRecord): RailAttachmentCounts {
  const messages = turnMessages(turn);
  return {
    images: messages.reduce((sum, message) => sum + (message.imageAttachments?.length ?? 0), 0),
    voiceClips: messages.reduce((sum, message) => sum + (message.voiceClips?.length ?? 0), 0),
  };
}

/** Reroll = 'Regenerate' variants, rephrase = 'Reflavor' variants -- the
 * exact labels `regenerateLastOutput` stamps onto `TurnRecordVariant.label`
 * in App.tsx. Edit-count and undo-withdrawn badges are out of scope this
 * pass (no underlying data / no state change respectively). */
function turnHistoryBadges(turn: TurnRecord): RailHistoryBadges {
  const variants = turn.variants ?? [];
  return {
    reroll: variants.filter((variant) => variant.label === 'Regenerate').length,
    rephrase: variants.filter((variant) => variant.label === 'Reflavor').length,
  };
}

function deriveTimelineRailTurnNode(
  turn: TurnRecord,
  options: {
    isCurrent: boolean;
    rpDateTimeFormat?: RpDateTimeFormat;
    rpWeekdayLanguage?: RpWeekdayLanguage;
  },
): TimelineRailTurnNode {
  const timestamp = turnRpTimestampLabel(turn, options.rpDateTimeFormat, options.rpWeekdayLanguage);
  return {
    kind: 'turn',
    id: turn.id,
    turnNumber: turn.number,
    sequenceLabel: `#${turn.number}`,
    markerShape: turnMarkerShape(turn),
    speakerLabel: turnSpeakerLabel(turn),
    medium: turnMedium(turn),
    rpTimestamp: timestamp.text,
    hasRpDateTime: timestamp.tracked,
    attachments: turnAttachmentCounts(turn),
    badges: turnHistoryBadges(turn),
    isCurrent: options.isCurrent,
    dayKey: turnDayKey(turn),
  };
}

function eventTimestampLabel(
  event: RpAppointment,
  rpDateTimeFormat?: RpDateTimeFormat,
  rpWeekdayLanguage?: RpWeekdayLanguage,
): string {
  if (event.scheduledAt) {
    const formatted = formatRpDateTime(event.scheduledAt, rpDateTimeFormat, rpWeekdayLanguage);
    if (formatted) {
      return formatted;
    }
  }
  return event.condition ?? 'Conditional';
}

function deriveTimelineRailEventNode(
  event: RpAppointment,
  options: {
    rpDateTimeFormat?: RpDateTimeFormat;
    rpWeekdayLanguage?: RpWeekdayLanguage;
  },
): TimelineRailEventNode {
  return {
    kind: 'event',
    id: event.id,
    title: event.title,
    rpTimestamp: eventTimestampLabel(event, options.rpDateTimeFormat, options.rpWeekdayLanguage),
    occurred: event.status === 'completed',
    anchorTurnId: event.sourceTurnId,
    dayKey: event.scheduledAt?.slice(0, 10),
    event,
  };
}

/**
 * Builds the full rail: turn nodes (in turn-number order, including the
 * current/latest turn) interleaved with event nodes, grouped into
 * "Day N" sections keyed off the session's tracked rpDateTime values --
 * or a single ungrouped, unlabeled section when no rpDateTime is tracked
 * anywhere in the session.
 */
export function buildTimelineRail(
  turns: TurnRecord[],
  events: RpAppointment[],
  options: {
    rpDateTimeFormat?: RpDateTimeFormat;
    rpWeekdayLanguage?: RpWeekdayLanguage;
  } = {},
): TimelineRailSection[] {
  const orderedTurns = [...turns].filter((turn) => !turn.openingHistory).sort((a, b) => a.number - b.number);
  const latestTurnId = orderedTurns.length > 0 ? orderedTurns[orderedTurns.length - 1]!.id : undefined;

  let previousRpDateTime: string | undefined;
  const turnNodes = orderedTurns.map((turn) => {
    const node = deriveTimelineRailTurnNode(turn, {
      isCurrent: turn.id === latestTurnId,
      rpDateTimeFormat: options.rpDateTimeFormat,
      rpWeekdayLanguage: options.rpWeekdayLanguage,
    });
    const rpDateTime = turnRpDateTime(turn);
    if (rpDateTime && previousRpDateTime) {
      node.relativeLabel = relativeDeltaLabel(previousRpDateTime, rpDateTime);
    }
    if (rpDateTime) {
      previousRpDateTime = rpDateTime;
    }
    return node;
  });
  const eventNodes = events.map((event) =>
    deriveTimelineRailEventNode(event, {
      rpDateTimeFormat: options.rpDateTimeFormat,
      rpWeekdayLanguage: options.rpWeekdayLanguage,
    }),
  );

  const anyRpDateTimeTracked = turnNodes.some((node) => node.hasRpDateTime);

  if (!anyRpDateTimeTracked) {
    // No in-roleplay clock at all this session -- flat list, no section
    // header, events appended after all turns (nothing to place them
    // against in-roleplay).
    return [{ nodes: [...turnNodes, ...eventNodes], turnCount: turnNodes.length, isPlanned: false }];
  }

  // Assign "Day N" labels by the chronological order distinct day keys
  // first appear in, relative to the first tracked day in the session.
  const dayKeysInOrder: string[] = [];
  for (const node of turnNodes) {
    if (node.dayKey && !dayKeysInOrder.includes(node.dayKey)) {
      dayKeysInOrder.push(node.dayKey);
    }
  }
  for (const node of eventNodes) {
    if (node.dayKey && !dayKeysInOrder.includes(node.dayKey)) {
      dayKeysInOrder.push(node.dayKey);
    }
  }
  dayKeysInOrder.sort();
  const dayLabelByKey = new Map(dayKeysInOrder.map((key, index) => [key, `Day ${index + 1}`]));

  // Place each event node right after the last turn node whose rpDateTime is
  // at or before the event's scheduled time (best-effort; ties/undated
  // events fall at the end of their day, or the very end of the rail).
  const sections = new Map<string, TimelineRailNode[]>();
  const sectionOrder: string[] = [];
  const untrackedKey = '__untracked__';

  function pushNode(dayKey: string | undefined, node: TimelineRailNode) {
    const key = dayKey ?? untrackedKey;
    if (!sections.has(key)) {
      sections.set(key, []);
      sectionOrder.push(key);
    }
    sections.get(key)!.push(node);
  }

  turnNodes.forEach((node) => pushNode(node.dayKey, node));
  eventNodes.forEach((node) => pushNode(node.dayKey, node));

  // Sort section keys chronologically (untracked-day turns/events, if any,
  // sort after every tracked day since we can't place them in time).
  sectionOrder.sort((a, b) => {
    if (a === untrackedKey) return 1;
    if (b === untrackedKey) return -1;
    return a.localeCompare(b);
  });

  return sectionOrder.map((key) => {
    const nodes = sections.get(key)!;
    const turnCount = nodes.filter((node): node is TimelineRailTurnNode => node.kind === 'turn').length;
    return {
      dayKey: key === untrackedKey ? undefined : key,
      label: key === untrackedKey ? 'Undated' : dayLabelByKey.get(key),
      turnCount,
      // A day with no real turns yet, only events scheduled against it, is a
      // road-map entry for what's ahead rather than something that happened.
      isPlanned: turnCount === 0 && nodes.length > 0,
      nodes,
    };
  });
}
