export interface OpenCodeIngressAnomaly {
  name: string;
  severity: 'warning' | 'critical';
  payload: Record<string, unknown>;
}

export interface OpenCodeIngressInspection {
  eventType: string;
  nextSequence?: number;
  isInteraction: boolean;
  interactionState?: 'pause' | 'resume';
  backgroundState?: 'start' | 'finish';
  anomalies: OpenCodeIngressAnomaly[];
}

// eslint-disable-next-line complexity -- Protocol anomaly classification stays together so one event is inspected exactly once.
export function inspectOpenCodeIngressEvent(
  sessionId: string,
  payload: unknown,
  previousSequence?: number,
): OpenCodeIngressInspection {
  const record = payload && typeof payload === 'object'
    ? payload as Record<string, unknown>
    : undefined;
  const properties = record?.properties && typeof record.properties === 'object'
    ? record.properties as Record<string, unknown>
    : undefined;
  const eventType = record ? String(record.type ?? '') : '';
  const sequence = typeof record?.sequence === 'number'
    ? record.sequence
    : typeof properties?.sequence === 'number'
      ? properties.sequence
      : undefined;
  const anomalies: OpenCodeIngressAnomaly[] = [];

  if (sequence !== undefined && previousSequence !== undefined && sequence <= previousSequence) {
    anomalies.push({
      name: 'event_out_of_order',
      severity: 'warning',
      payload: { previous: previousSequence, sequence, eventType },
    });
  } else if (sequence !== undefined && previousSequence !== undefined && sequence > previousSequence + 1) {
    anomalies.push({
      name: 'event_gap',
      severity: 'warning',
      payload: { previous: previousSequence, sequence, eventType },
    });
  }

  const eventSessionId = properties?.sessionID ?? properties?.sessionId;
  if (typeof eventSessionId === 'string' && eventSessionId !== sessionId) {
    anomalies.push({
      name: 'session_mismatch',
      severity: 'critical',
      payload: { expected: sessionId, received: eventSessionId, eventType },
    });
  }

  if (/(?:part|delta)/i.test(eventType)) {
    const part = properties?.part && typeof properties.part === 'object'
      ? properties.part as Record<string, unknown>
      : undefined;
    const messageId = properties?.messageID ?? properties?.messageId ?? part?.messageID ?? part?.messageId;
    if (typeof messageId !== 'string' || !messageId) {
      anomalies.push({
        name: 'orphan_part',
        severity: 'warning',
        payload: { eventType },
      });
    }
  }

  return {
    eventType,
    nextSequence: sequence === undefined ? previousSequence : Math.max(previousSequence ?? sequence, sequence),
    isInteraction: /(?:question|permission|tool|task|child)/i.test(eventType),
    interactionState: /(?:question|permission).*(?:asked|request|pending)/i.test(eventType)
      ? 'pause'
      : /(?:question|permission).*(?:replied|resolved|answered|rejected)/i.test(eventType)
        ? 'resume'
        : undefined,
    backgroundState: /(?:background|task).*(?:started|running)/i.test(eventType)
      ? 'start'
      : /(?:background|task).*(?:completed|finished|failed|cancelled)/i.test(eventType)
        ? 'finish'
        : undefined,
    anomalies,
  };
}
