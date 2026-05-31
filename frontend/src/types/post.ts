export interface PostUser {
  id: string
  username: string
  displayName: string
  avatarUrl?: string | null
  isVerified: boolean
}

export interface PostImage {
  id: string
  url: string
  order: number
}

export interface Post {
  id: string
  content: string
  createdAt: string
  updatedAt: string
  jamId?: string | null
  user: PostUser
  images: PostImage[]
  _count: { likes: number; comments: number }
  liked?: boolean
}

export interface Comment {
  id: string
  content: string
  createdAt: string
  parentId?: string | null
  user: PostUser
  replies?: Comment[]
}

// Lightweight user shape returned by search / followers / following endpoints
export interface UserSummary {
  id: string
  username: string
  displayName: string
  avatarUrl?: string | null
  isVerified: boolean
}

export interface UserProfile {
  id: string
  username: string
  displayName: string
  bio?: string | null
  avatarUrl?: string | null
  bannerUrl?: string | null
  websiteUrl?: string | null
  githubUrl?: string | null
  twitterUrl?: string | null
  itchUrl?: string | null
  isVerified: boolean
  isAdmin?: boolean
  createdAt: string
  // Backend only returns followers & following counts (no posts count)
  _count: { followers: number; following: number }
  isFollowing?: boolean
}
