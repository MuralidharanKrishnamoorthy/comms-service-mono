import { randomUUID } from 'node:crypto'

/**
 * A stand-in payment gateway.
 *
 * Real gateways are slow, occasionally decline, and hand back a reference you
 * are expected to store. This one does all three, because an integration that
 * only ever sees the happy path is an integration that has not been tested.
 *
 * Card numbers here are the usual test values — nothing real is accepted, and
 * nothing sensitive is stored: only the last four digits ever leave this file.
 */

export type PaymentMethod = 'card' | 'upi' | 'netbanking'

export interface ChargeInput {
  amount: number
  currency: string
  method: PaymentMethod
  /** Test card number. 4000… always declines, anything else succeeds. */
  card_number?: string
}

export interface ChargeResult {
  status: 'success' | 'failed'
  gateway_ref: string
  failure_reason: string | null
}

const DECLINE_PREFIX = '4000'

export async function charge(input: ChargeInput): Promise<ChargeResult> {
  // Gateways take a moment. Making that visible keeps the UI honest about
  // needing a pending state rather than pretending payment is instant.
  await new Promise((resolve) => setTimeout(resolve, 700))

  const digits = (input.card_number ?? '').replace(/\D/g, '')
  const declined = input.method === 'card' && digits.startsWith(DECLINE_PREFIX)

  if (declined) {
    return {
      status: 'failed',
      gateway_ref: `pay_decl_${randomUUID().slice(0, 12)}`,
      failure_reason: 'Card declined by issuer',
    }
  }

  return {
    status: 'success',
    gateway_ref: `pay_${randomUUID().replace(/-/g, '').slice(0, 20)}`,
    failure_reason: null,
  }
}

/** Never store a full card number. Four digits is enough to recognise it. */
export function maskCard(cardNumber?: string): string {
  const digits = (cardNumber ?? '').replace(/\D/g, '')
  return digits.length >= 4 ? `•••• ${digits.slice(-4)}` : '••••'
}
