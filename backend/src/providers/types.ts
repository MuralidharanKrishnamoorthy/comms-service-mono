export interface SendResult {
  providerMessageId: string
  raw?: unknown
}

export interface EmailPayload {
  to: string
  subject: string
  html: string
}

export interface SmsPayload {
  to: string
  body: string
}

export interface PushPayload {
  to: string
  title?: string
  body: string
}

export interface EmailProvider {
  send(payload: EmailPayload): Promise<SendResult>
}

export interface SmsProvider {
  send(payload: SmsPayload): Promise<SendResult>
}

export interface PushProvider {
  send(payload: PushPayload): Promise<SendResult>
}
