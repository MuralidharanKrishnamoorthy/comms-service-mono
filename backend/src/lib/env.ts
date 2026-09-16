const MIN_SECRET_LENGTH = 32

const GENERATE_HINT =
  'node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'

export function requireSecret(name: string): string {
  const value = process.env[name]

  if (!value) {
    throw new Error(`${name} is not set in backend/.env`)
  }

  if (value.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `${name} is too short (${value.length} characters). ` +
        `Use at least ${MIN_SECRET_LENGTH}, from: ${GENERATE_HINT}`
    )
  }

  return value
}
