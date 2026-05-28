# JamHub

A platform for organizing and participating in game jams, built with a focus on community and simplicity.

## Features

### User Profiles
- Customizable profile with banner, avatar, bio, and external links (GitHub, itch.io, etc.)
- Unique username handle (`@username`)
- Public activity: jams organized, jams participated in
- Post feed to share project progress (Twitter-style)

### Social
- Follow system (unilateral — follow anyone without approval)
- Search and discover other users
- Activity feed from people you follow
- Block users

### Posts
- Share progress updates with images
- Link posts to a specific jam
- Likes and comments on posts

### Jams
- Create a jam with title, description, rules, cover images, tags, and dates
- Jam theme is set privately before the jam starts and **auto-revealed at start time**
- Participant limit (optional) and team support (solo, optional teams, or both)
- One active jam per organizer — a new jam can only be created after the previous one closes
- Public jam page with full details, participants, and submissions

**Jam lifecycle:**
```
Draft → Open (registrations) → In Progress → Submissions → Voting → Closed
```

### Submissions
- Upload files (ZIP, APK, etc.) up to 2 GB
- Optional external URL (GitHub Releases, Google Play, etc.)
- Screenshots (at least one required)
- Project name and description
- Editable until the submission deadline

### Voting
- Open to anyone (no account required to view, account required to vote)
- Vote across multiple categories: Overall, Art, Audio, Fun, Innovation
- Participants cannot vote for their own submission
- Public results and rankings after voting closes

### Calendar
- Public calendar showing all upcoming, active, and past jams
- Filter by status or tags
- View jam count on organizer profiles

### Notifications
- Follow activity, comments, and likes
- Jam status changes (starts, submissions open, voting opens, results published)
- Submission confirmation
- Contact requests

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js + Fastify + TypeScript |
| Frontend | Next.js + TypeScript + Tailwind CSS |
| Database | PostgreSQL + Prisma ORM |
| File Storage | MinIO (self-hosted, S3-compatible) |
| Background Jobs | Redis + BullMQ |
| Email | Resend |
| Deploy | Docker Compose + Nginx + Certbot |

## Project Structure

```
/
├── backend/      # Fastify API
├── frontend/     # Next.js app
└── docker-compose.yml
```

## Getting Started

> Setup instructions coming soon.

## License

MIT