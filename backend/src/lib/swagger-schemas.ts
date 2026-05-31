// Reusable JSON Schema fragments for Swagger documentation

export const ErrorSchema = {
  type: 'object',
  properties: {
    error:   { type: 'string' },
    details: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          field:   { type: 'string' },
          message: { type: 'string' }
        }
      }
    }
  }
}

export const OkSchema = {
  type: 'object',
  properties: { ok: { type: 'boolean' } }
}

export const UserPublicSchema = {
  type: 'object',
  properties: {
    id:          { type: 'string' },
    username:    { type: 'string' },
    displayName: { type: 'string' },
    avatarUrl:   { type: 'string', nullable: true },
    isVerified:  { type: 'boolean' }
  }
}

export const UserPrivateSchema = {
  type: 'object',
  properties: {
    id:          { type: 'string' },
    username:    { type: 'string' },
    email:       { type: 'string' },
    displayName: { type: 'string' },
    bio:         { type: 'string', nullable: true },
    avatarUrl:   { type: 'string', nullable: true },
    bannerUrl:   { type: 'string', nullable: true },
    websiteUrl:  { type: 'string', nullable: true },
    githubUrl:   { type: 'string', nullable: true },
    itchUrl:     { type: 'string', nullable: true },
    twitterUrl:  { type: 'string', nullable: true },
    isVerified:  { type: 'boolean' },
    isAdmin:     { type: 'boolean' },
    createdAt:   { type: 'string', format: 'date-time' },
    _count: {
      type: 'object',
      properties: {
        followers: { type: 'number' },
        following: { type: 'number' }
      }
    }
  }
}

export const PostSchema = {
  type: 'object',
  properties: {
    id:        { type: 'string' },
    content:   { type: 'string' },
    jamId:     { type: 'string', nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
    liked:     { type: 'boolean' },
    user:      UserPublicSchema,
    images: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id:    { type: 'string' },
          url:   { type: 'string' },
          order: { type: 'number' }
        }
      }
    },
    _count: {
      type: 'object',
      properties: {
        likes:    { type: 'number' },
        comments: { type: 'number' }
      }
    }
  }
}

const ReplySchema = {
  type: 'object',
  properties: {
    id:        { type: 'string' },
    content:   { type: 'string' },
    parentId:  { type: 'string', nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
    user:      UserPublicSchema
  }
}

export const CommentSchema = {
  type: 'object',
  properties: {
    id:        { type: 'string' },
    content:   { type: 'string' },
    parentId:  { type: 'string', nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
    user:      UserPublicSchema,
    replies:   { type: 'array', items: ReplySchema }
  }
}

export const PaginatedUsersSchema = {
  type: 'object',
  properties: {
    items:      { type: 'array', items: UserPublicSchema },
    nextCursor: { type: 'string', nullable: true }
  }
}

export const PaginatedPostsSchema = {
  type: 'object',
  properties: {
    items:      { type: 'array', items: PostSchema },
    nextCursor: { type: 'string', nullable: true }
  }
}

export const PaginatedCommentsSchema = {
  type: 'object',
  properties: {
    items:      { type: 'array', items: CommentSchema },
    nextCursor: { type: 'string', nullable: true }
  }
}

export const AuthResponseSchema = {
  type: 'object',
  properties: {
    accessToken: { type: 'string' },
    user: {
      type: 'object',
      properties: {
        id:          { type: 'string' },
        username:    { type: 'string' },
        displayName: { type: 'string' },
        email:       { type: 'string' },
        avatarUrl:   { type: 'string', nullable: true },
        isVerified:  { type: 'boolean' },
        isAdmin:     { type: 'boolean' }
      }
    }
  }
}

export const CursorQuerySchema = {
  type: 'object',
  properties: { cursor: { type: 'string', description: 'Pagination cursor from previous response' } }
}

export const UsernameParamSchema = {
  type: 'object',
  required: ['username'],
  properties: { username: { type: 'string' } }
}

export const IdParamSchema = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'string' } }
}

export const bearer = [{ bearerAuth: [] }]
