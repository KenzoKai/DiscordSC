# Star Citizen Organization Discord Bot

A multi-tenant Discord bot designed to streamline the recruitment process for Star Citizen organizations. This bot automates the validation of Star Citizen profiles, manages recruitment applications, and creates dedicated channels for recruiter-recruit interactions.

## Features

- **Handle Validation**: Verifies Star Citizen handles by prompting recruits to add a unique code to their RSI profile bio
- **Profile Scraping**: Automatically extracts profile information from the RSI website including:
  - Personal details (handle, name, title)
  - Organization information (name, SID, rank)
  - Additional information (enlisted date, location, fluency)
  - Profile and organization images
- **Streamlined Recruitment Process**:
  - User-friendly modal interface for handle submission
  - Automated validation process
  - Creation of private recruitment channels
  - Rich embeds displaying recruit information
- **Role Management**: Automatically assigns roles to validated users
- **Multi-tenant Support**: Can be used across multiple Discord servers

## Prerequisites

- Node.js (v16 or higher)
- PostgreSQL database
- Discord Bot Token and Application ID
- Discord Server with appropriate permissions

## Installation

1. Clone the repository:
   ```
   git clone <repository-url>
   cd DiscordSC
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Create a `.env` file based on the example:
   ```
   cp example.env .env
   ```

4. Configure your environment variables in the `.env` file:
   ```
   DISCORD_TOKEN=your_discord_bot_token
   DATABASE_URL=postgresql://username:password@localhost:5432/DiscordSC
   CLIENT_ID=your_discord_application_id
   GUILD_ID=your_discord_server_id
   ```

5. Set up the PostgreSQL database:
   ```sql
   CREATE DATABASE DiscordSC;
   
   CREATE TABLE applications (
     id SERIAL PRIMARY KEY,
     recruit_id TEXT NOT NULL,
     recruiter_id TEXT,
     status TEXT NOT NULL,
     validation_code TEXT,
     handle TEXT,
     real_name TEXT,
     title TEXT,
     org_name TEXT,
     org_sid TEXT,
     org_rank TEXT,
     enlisted_date TEXT,
     location TEXT,
     fluency TEXT,
     profile_image_url TEXT,
     org_logo_url TEXT
   );
   ```

6. Build the project:
   ```
   npm run build
   ```

7. Start the bot:
   ```
   npm start
   ```

## Development

For development with hot reloading:
```
npm run dev
```

## Usage

### Bot Setup

1. Invite the bot to your Discord server with appropriate permissions
2. The bot will automatically create a `recruitment-info` channel
3. Recruits can start the process by clicking the "Enter Star Citizen Handle" button

### Recruitment Process

1. **Handle Submission**:
   - Recruit clicks the "Enter Star Citizen Handle" button in the recruitment-info channel
   - A modal opens where they enter their Star Citizen handle
   - The bot generates a unique validation code

2. **Profile Validation**:
   - Recruit adds the validation code to their Star Citizen profile bio
   - Recruit clicks the "Validate Bio" button
   - Bot scrapes the RSI website to verify the code and collect profile information

3. **Recruitment Channel Creation**:
   - Upon successful validation, recruit clicks "Start Recruitment Process" button
   - Bot creates a private channel for the recruit and recruiters
   - Bot posts the recruit's information as a rich embed with images
   - Recruiters are notified of the new application

4. **Application Processing**:
   - Recruiters review the application and interact with the recruit in the private channel
   - The application status is tracked in the database

### Commands

- `/recruit @user`: Manually create a recruitment ticket for a user
- `/ping`: Check if the bot is online

## Project Structure

- `src/index.ts`: Main entry point and bot initialization
- `src/database.ts`: Database connection and query functions
- `src/recruitValidation.ts`: Handle validation and recruitment process logic
- `src/commands/`: Slash command implementations
  - `recruit.ts`: Manual recruitment ticket creation
  - `ping.ts`: Simple ping command

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature-name`
3. Commit your changes: `git commit -m 'Add some feature'`
4. Push to the branch: `git push origin feature/your-feature-name`
5. Submit a pull request

## License

ISC

## Acknowledgements

- [Discord.js](https://discord.js.org/)
- [Star Citizen](https://robertsspaceindustries.com/)
