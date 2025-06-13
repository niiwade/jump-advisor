import 'next-auth'

declare module 'next-auth' {
  interface User {
    id: string
    name?: string | null
    email?: string | null
    image?: string | null
    // Add custom fields from your database
  }

  interface Session {
    user: User
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string
    // Add any custom JWT fields
  }
}
