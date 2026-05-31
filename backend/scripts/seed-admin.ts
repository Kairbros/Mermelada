/**
 * Create or promote an admin account.
 *
 * Reads credentials from env vars (falling back to sensible dev defaults):
 *   ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_USERNAME, ADMIN_DISPLAY_NAME
 *
 * Usage:
 *   npm run seed:admin
 *   ADMIN_EMAIL=me@site.com ADMIN_PASSWORD=secret123 npm run seed:admin
 *
 * - If a user with that email exists, it is promoted to admin (isAdmin = true).
 * - Otherwise a new verified admin user is created.
 */
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()
const SALT_ROUNDS = 12

async function main() {
  const email = process.env.ADMIN_EMAIL ?? 'admin@jamhub.local'
  const password = process.env.ADMIN_PASSWORD ?? 'admin12345'
  const username = process.env.ADMIN_USERNAME ?? 'admin'
  const displayName = process.env.ADMIN_DISPLAY_NAME ?? 'Admin'

  const existing = await prisma.user.findUnique({ where: { email } })

  if (existing) {
    const updated = await prisma.user.update({
      where: { email },
      data: { isAdmin: true, isBanned: false }
    })
    console.log(`✓ Promoted existing user to admin: @${updated.username} <${updated.email}>`)
    return
  }

  // Make sure the username is free; if taken, append a numeric suffix.
  let finalUsername = username
  let i = 1
  while (await prisma.user.findUnique({ where: { username: finalUsername } })) {
    finalUsername = `${username}${i++}`
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS)
  const user = await prisma.user.create({
    data: {
      email,
      username: finalUsername,
      displayName,
      passwordHash,
      isAdmin: true,
      isVerified: true
    }
  })

  console.log(`✓ Created admin account:`)
  console.log(`    email:    ${user.email}`)
  console.log(`    username: @${user.username}`)
  console.log(`    password: ${password}`)
  console.log(`  Log in and change the password from Settings if this is a real deployment.`)
}

main()
  .catch(err => { console.error('✗ Failed to seed admin:', err); process.exit(1) })
  .finally(() => prisma.$disconnect())
