type ErrorContext =
  | 'dashboard'
  | 'patients_load'
  | 'patients_save'
  | 'patients_delete'
  | 'survivorship_load'
  | 'survivorship_save'
  | 'survivorship_delete'
  | 'survivorship_checkin_add'
  | 'survivorship_checkin_delete'
  | 'chat_send'
  | 'chat_photo'

function extractMessage(err: unknown): string {
  if (!err) return ''
  if (typeof err === 'string') return err
  if (err instanceof Error) return err.message || ''
  return String(err)
}

function serviceDownMessage(): string {
  return 'ASHA service is temporarily unavailable. Please try again in a moment.'
}

export function getUserFriendlyError(err: unknown, context: ErrorContext): string {
  const msg = extractMessage(err).toLowerCase()

  if (
    msg.includes('next_public_api_url') ||
    msg.includes('backend config missing') ||
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('backend unreachable')
  ) {
    return serviceDownMessage()
  }

  switch (context) {
    case 'dashboard':
      return 'We are having trouble refreshing live patient data right now.'
    case 'patients_load':
      return 'Patient records are not available right now. Please refresh and try again.'
    case 'patients_save':
      return 'Could not save patient updates. Please try again.'
    case 'patients_delete':
      return 'Could not delete this patient record. Please try again.'
    case 'survivorship_load':
      return 'Survivorship records are not available right now. Please refresh and try again.'
    case 'survivorship_save':
      return 'Could not save survivor details. Please check the form and try again.'
    case 'survivorship_delete':
      return 'Could not delete this survivor right now. Please try again.'
    case 'survivorship_checkin_add':
      return 'Could not add this weekly check-in. Please try again.'
    case 'survivorship_checkin_delete':
      return 'Could not delete this check-in right now. Please try again.'
    case 'chat_photo':
      return 'Photo analysis is currently unavailable. Please retry or continue with text screening.'
    case 'chat_send':
    default:
      return 'Message could not be sent right now. Please try again.'
  }
}
