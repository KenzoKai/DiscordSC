import { Client, GatewayIntentBits, Collection, REST, Routes, CommandInteraction, SlashCommandBuilder, ChannelType } from 'discord.js';
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { connectDB } from './database';
import { setupRecruitmentChannel, handleRecruitValidationButton } from './recruitValidation';

// Define a type for your commands
interface Command {
  data: SlashCommandBuilder;
  execute: (interaction: CommandInteraction) => Promise<void>;
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

// Command handling setup
const commands = new Collection<string, Command>();
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.ts'));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command: Command = require(filePath); // Cast to Command type
  // Set a new item in the Collection with the key as the command name and the value as the exported module
  if ('data' in command && 'execute' in command) {
    commands.set(command.data.name, command);
  } else {
    console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
  }
}

// Register slash commands
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN as string);

(async () => {
  try {
    console.log(`Started refreshing ${commandFiles.length} application (/) commands.`);

    // The put method is used to fully refresh all commands in the guild with the current set
    const data: any = await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID as string, process.env.GUILD_ID as string),
      { body: commands.map(command => command.data.toJSON()) },
    );
    // The put method is used to fully refresh all commands in the guild with the current set
    // If you want to register commands globally, use Routes.applicationCommands(process.env.CLIENT_ID as string) instead.

    console.log(`Successfully reloaded ${data.length} application (/) commands.`);
  } catch (error) {
    // And of course, make sure you catch and log any errors!
    console.error(error);
  }
})();


client.once('ready', async () => {
  console.log(`Bot is online! Logged in as ${client.user?.tag}`);
  await connectDB();
  setupRecruitmentChannel(client); // Setup the recruitment info channel listener
});

client.on('interactionCreate', async interaction => {
  if (interaction.isButton()) {
    await handleRecruitValidationButton(interaction);
    return;
  }

  if (!interaction.isCommand()) {
    // Handle messages in the recruitment info channel
    if (interaction.channel?.type === ChannelType.GuildText && (interaction.channel as any).name === 'recruitment-info') {
      // Message handling for initial handle input is still here
      // The validation trigger is now a button, so no need to call validateRecruit here
    }
    return;
  }

  const command = commands.get(interaction.commandName);

  if (!command) {
    console.error(`No command matching ${interaction.commandName} was found.`);
    return;
  }

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(error);
    await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
  }
});


const token = process.env.DISCORD_TOKEN;

if (!token) {
  console.error('DISCORD_TOKEN is not set in the environment variables.');
  process.exit(1);
}

client.login(token);