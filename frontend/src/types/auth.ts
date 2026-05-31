export interface User {
  id: string
  username: string
  displayName: string
  email: string
  avatarUrl: string | null
  isVerified: boolean
  isAdmin?: boolean
}

export interface AuthResponse {
  accessToken: string
  user: User
}