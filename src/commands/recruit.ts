import { CommandInteraction, SlashCommandBuilder, ChannelType, PermissionFlagsBits, ApplicationCommandOptionType, Role } from 'discord.js';
import { query } from '../database';

export const data = new SlashCommandBuilder()
  .setName('recruit')
  .setDescription('Initiates a recruitment ticket.')
  .addUserOption(option =>
    option.setName('recruit')
      .setDescription('The user applying for recruitment')
      .setRequired(true));

export async function execute(interaction: CommandInteraction) {
  if (!interaction.guild) {
    await interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
    return;
  }

  // Ensure the interaction is a chat input command to access options correctly
  if (!interaction.isChatInputCommand()) {
      await interaction.reply({ content: 'This command can only be used as a slash command.', ephemeral: true });
      return;
  }

  // After this check, TypeScript knows 'interaction' is a ChatInputCommandInteraction

  const options = interaction.options as any; // Cast to any to access getUser
  const recruitUser = options.getUser('recruit', true);
  const recruiterUser = interaction.user; // The user who initiated the command

  try {
    // Insert application into database
    const result = await query(
      'INSERT INTO applications(recruit_id, recruiter_id, status) VALUES($1, $2, $3) RETURNING id',
      [recruitUser.id, recruiterUser.id, 'pending']
    );
    const applicationId = result.rows[0].id;

    // Create a private channel for the recruitment ticket
    const channelName = `recruit-${recruitUser.username.toLowerCase().replace(/[^a-z0-9-]/g, '')}-${applicationId}`;
    const category = interaction.guild.channels.cache.find(c => c.name === 'Recruitment Tickets' && c.type === ChannelType.GuildCategory);

    const permissionOverwrites = [
      {
        id: interaction.guild.id,
        deny: [PermissionFlagsBits.ViewChannel], // Deny everyone access by default
      },
      {
        id: recruitUser.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages], // Allow recruit to see and send messages
      },
      {
        id: recruiterUser.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages], // Allow recruiter to see and send messages
      },
    ];

    // Find all roles with "recruiter" in their name and add them to permission overwrites
    const recruiterRoles = interaction.guild.roles.cache.filter((role: Role) =>
      role.name.toLowerCase().includes('recruiter')
    );

    recruiterRoles.forEach((role: Role) => {
      permissionOverwrites.push({
        id: role.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
      });
    });

    const ticketChannel = await interaction.guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: category?.id, // Assign to category if found
      permissionOverwrites: permissionOverwrites,
    }) as import('discord.js').TextChannel; // Explicitly cast to TextChannel

    await interaction.reply({ content: `Recruitment ticket created for ${recruitUser.tag} in ${ticketChannel}`, ephemeral: true });

    // Send initial message to the ticket channel
    await ticketChannel.send({
      content: `Welcome ${recruitUser}! ${recruiterUser} has initiated a recruitment ticket for you. Recruiters will be with you shortly. Please provide any information requested by the recruiters here. Application ID: ${applicationId}`,
      // TODO: Add embeds or components for better formatting and actions
    });

  } catch (error) {
    console.error('Error creating recruitment ticket:', error);
    await interaction.reply({ content: 'There was an error creating the recruitment ticket.', ephemeral: true });
  }
}