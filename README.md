# Eliza Twitter/X Client

This package provides Twitter/X integration for the Eliza AI agent.

## Features

- Post generation and management
- Interaction handling (mentions, replies)
- Search functionality
- Twitter Spaces support with STT/TTS capabilities
- Media handling (images, videos)
- Approval workflow via Discord (optional)

## Setup Guide

### Prerequisites

- A Twitter/X Developer Account with API access
- Node.js and pnpm installed
- Discord bot (if using approval workflow)
- ElevenLabs API key (if using Spaces with TTS)

### Step 1: Configure Environment Variables

Create or edit `.env` file in your project root:

```bash
# Twitter API Credentials
TWITTER_USERNAME=           # Your Twitter/X username
TWITTER_PASSWORD=           # Your Twitter/X password
TWITTER_EMAIL=              # Your Twitter/X email
TWITTER_2FA_SECRET=         # Optional: 2FA secret for login

# Twitter Client Configuration
TWITTER_DRY_RUN=false      # Set to true for testing without posting
MAX_TWEET_LENGTH=280       # Default tweet length limit
TWITTER_SEARCH_ENABLE=false # Enable search functionality
TWITTER_RETRY_LIMIT=5      # Login retry attempts
TWITTER_POLL_INTERVAL=120  # Poll interval in seconds
TWITTER_TARGET_USERS=      # Comma-separated list of target users
TWITTER_REFLECT_MODE=false # Enable reflection mode for smarter posting
TWITTER_USE_DEFAULT_REFLECTIONS=false # Use default reflection evaluator and provider

# Post Generation Settings
ENABLE_TWITTER_POST_GENERATION=true
POST_INTERVAL_MIN=90       # Minimum interval between posts (minutes)
POST_INTERVAL_MAX=180      # Maximum interval between posts (minutes)
POST_IMMEDIATELY=false     # Skip approval workflow

# Action Processing
ENABLE_ACTION_PROCESSING=false
ACTION_INTERVAL=5          # Action check interval (minutes)
MAX_ACTIONS_PROCESSING=1   # Maximum concurrent actions

# Spaces Configuration (Optional)
TWITTER_SPACES_ENABLE=false
ELEVENLABS_XI_API_KEY=     # Required for TTS in Spaces

# Approval Workflow (Optional)
TWITTER_APPROVAL_DISCORD_BOT_TOKEN=
TWITTER_APPROVAL_DISCORD_CHANNEL_ID=
TWITTER_APPROVAL_CHECK_INTERVAL=300000  # 5 minutes in milliseconds
```

### Step 2: Initialize the Client

```typescript
import { TwitterClientInterface } from "@elizaos/twitter";

const twitterPlugin = {
    name: "twitter",
    description: "Twitter client",
    clients: [TwitterClientInterface],
};

// Register with your Eliza runtime
runtime.registerPlugin(twitterPlugin);
```

## Features

### Post Generation

The client can automatically generate and post tweets based on your agent's character profile and topics. Posts can be:
- Regular tweets (≤280 characters)
- Long-form tweets (Note Tweets)
- Media tweets (with images/videos)

### Reflection Mode

A new feature that enables smarter, context-aware posting:
- Automatically extracts valuable information from conversations
- Evaluates whether posting is appropriate at the current moment
- Considers timing, relevance, and previous posts
- Posts only when meaningful new information is available
- Evaluates posting opportunities every minute (**but only posts when appropriate**)

The reflection mode includes:
- **Reflect Evaluator**: Analyzes conversations to identify Twitter-worthy information
- **Reflections Provider**: Manages and provides extracted information for post generation
- **Smart Posting Logic**: Makes intelligent decisions about when and what to post

### Interactions

Handles:
- Mentions
- Replies
- Quote tweets
- Direct messages

### Search

When enabled, periodically searches Twitter for relevant topics and engages with found content.

### Twitter Spaces

Supports creating and managing Twitter Spaces with:
- Speech-to-Text (STT) for transcription
- Text-to-Speech (TTS) via ElevenLabs
- Speaker management
- Idle monitoring
- Recording capabilities

### Approval Workflow

Optional Discord-based approval system for tweets:
1. Generated tweets are sent to a Discord channel
2. Moderators can approve/reject via reactions
3. Approved tweets are automatically posted

## Development

### Testing

```bash
# Run tests
pnpm test

# Run with debug logging
DEBUG=eliza:* pnpm start
```

### Common Issues

#### Login Failures
- Verify credentials in .env
- Check 2FA configuration
- Ensure no rate limiting

#### Post Generation Issues
- Verify character profile configuration
- Check MAX_TWEET_LENGTH setting
- Monitor approval workflow logs

#### Spaces Issues
- Verify ELEVENLABS_XI_API_KEY if using TTS
- Check space configuration in character profile
- Monitor idle timeout settings

## Security Notes

- Never commit .env or credential files
- Use environment variables for sensitive data
- Implement proper rate limiting
- Monitor API usage and costs (especially for ElevenLabs)

## Support

For issues or questions:
1. Check the Common Issues section
2. Review debug logs (enable with DEBUG=eliza:*)
3. Open an issue with:
   - Error messages
   - Configuration details
   - Steps to reproduce

## LLM Output Format

### Text-Only Posts
When generating text-only posts, the LLM should return plain text or a simple JSON object with a `text` field:

```json
{
  "text": "This is a sample tweet that will be posted."
}
```

### Media Posts
For posts with media attachments, the LLM must return a JSON object with both `text` and `attachments` fields:

```json
{
  "text": "Check out this amazing image!",
  "attachments": [
    {
      "url": "https://example.com/image.jpg",
      "contentType": "image/jpeg"  // Optional, will be auto-detected if not provided
    },
    {
      "url": "https://example.com/video.mp4",
      "contentType": "video/mp4"   // Optional, will be auto-detected if not provided
    }
  ]
}
```

The `attachments` array can contain up to 4 media items for images or a single video. Each attachment must include:
- `url`: A valid, publicly accessible URL to the media file
- `contentType`: (Optional) MIME type of the media. If not provided, it will be detected automatically

The system will download these media files and attach them to the tweet. Invalid URLs or inaccessible media will be skipped.
